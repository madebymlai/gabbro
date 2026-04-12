# Solution: MCP installer + agent migration to Gemma/OpenRouter

**Brief**: `PROCESS_DOCS/briefs/01-mcp-installer-and-agent-migration.md`

## 1. Executive Summary

Add a registry-driven Node.js installer for MCP server binaries that delegates platform-specific work to upstream installers and handles gabbro config wiring. Simultaneously migrate the three external agents to aligned names and Google Gemma models via OpenRouter, and give the review agents access to the new codebase-memory MCP server.

## 2. Rationale

| Decision | Rationale | Alternative | Why Rejected |
|----------|-----------|-------------|--------------|
| Delegate binary install to upstream `install.sh`/`install.ps1` | Upstream handles OS detection, extraction, placement, and updates. No reason to reimplement. | Download + extract in Node.js | Reimplements what upstream already maintains; fragile against asset name changes |
| Registry as inline JS object | Single file, no loader complexity. Adding a server = adding an object literal. | Separate `registry.json` file | Extra file for no benefit — the installer is the only consumer |
| UI binary variant | 1MB larger than standard (28 vs 27MB). Adds 3D graph visualization at localhost:9749 for free. | Standard binary + flag | UI is a separate binary, not a flag. Negligible size difference. |
| 11-tool allowlist for external agents | Excludes destructive ops (`delete_project`), write ops (`manage_adr`), and irrelevant ops (`ingest_traces`) | Full 14-tool access | Principle of least privilege for external models |
| All external agents via OpenRouter | Single provider, single API key. Simplifies config and billing. | Keep Moonshot for some agents | No reason to maintain two providers when OpenRouter serves all needed models |
| Manual agent rename (not installer) | One-time migration, not a repeatable install concern | Installer detects and migrates old names | Over-engineering — this happens once |

## 3. Technology Stack

- **Installer runtime**: Node.js (built-in modules only: `https`, `fs`, `child_process`, `path`, `os`)
- **Upstream installers**: `install.sh` (Unix), `install.ps1` (Windows) from DeusData/codebase-memory-mcp
- **MCP server**: codebase-memory-mcp v0.6.0+ (UI variant), static C binary, SQLite-backed
- **External models**: Google Gemma via OpenRouter
  - `ar-enforcer`, `pm-ember`: `google/gemma-4-26b-a4b-it`
  - `ar-nemesis`: `google/gemma-4-31b-it`

## 4. Architecture

### Data Flow

```
bin/install.js
  ├── reads REGISTRY (inline JS object)
  ├── for each server in registry:
  │     ├── detect platform (process.platform)
  │     ├── shell out to upstream installer
  │     │     └── install.sh --ui  OR  install.ps1
  │     ├── run post-install config commands
  │     │     └── codebase-memory-mcp config set auto_index true
  │     │     └── codebase-memory-mcp config set auto_index_limit 50000
  │     ├── merge entry into .mcp.json
  │     └── merge entry into .gabbro/external-agents.json mcpServers
  └── done
```

### Component Catalog

| Component | Purpose |
|-----------|---------|
| `REGISTRY` object | Declares installable MCP servers, their install commands, config shapes |
| `detectPlatform()` | Returns `'unix'` or `'win32'` from `process.platform` |
| `installBinary(server)` | Shells out to upstream installer for a registry entry |
| `runPostInstall(server)` | Runs post-install config commands via `execSync` |
| `mergeMcpJson(server)` | Reads/creates `.mcp.json`, adds server entry, writes back |
| `mergeExternalAgents(server)` | Reads `.gabbro/external-agents.json`, adds to `mcpServers`, writes back |
| `main()` | Iterates registry, orchestrates install + config for each server |

## 5. Protocol/Schema

### Registry Entry Shape

```js
const REGISTRY = {
  'codebase-memory': {
    // Upstream installer commands by platform
    install: {
      unix: 'curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --ui',
      win32: [
        'Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile $env:TEMP\\install-codebase-memory.ps1',
        '& $env:TEMP\\install-codebase-memory.ps1 -UI',
      ],
    },
    // Commands to run after binary is installed
    postInstall: [
      'codebase-memory-mcp config set auto_index true',
      'codebase-memory-mcp config set auto_index_limit 50000',
    ],
    // Entry to add to .mcp.json (main Claude Code)
    mcpEntry: {
      command: 'codebase-memory-mcp',
      args: ['--mcp'],
    },
    // Entry to add to .gabbro/external-agents.json mcpServers
    externalMcpEntry: {
      command: 'codebase-memory-mcp',
      args: ['--mcp'],
      toolAllowlist: [
        'index_repository',
        'index_status',
        'list_projects',
        'search_graph',
        'search_code',
        'get_code_snippet',
        'trace_call_path',
        'detect_changes',
        'query_graph',
        'get_graph_schema',
        'get_architecture',
      ],
    },
  },
};
```

### `.mcp.json` (created/merged by installer)

```json
{
  "mcpServers": {
    "codebase-memory": {
      "command": "codebase-memory-mcp",
      "args": ["--mcp"]
    }
  }
}
```

### `.gabbro/external-agents.json` (after all changes)

```json
{
  "agents": {
    "ar-enforcer": {
      "provider": "openai-compat",
      "baseURL": "https://openrouter.ai/api/v1",
      "model": "google/gemma-4-26b-a4b-it",
      "apiKeyEnv": "OPENROUTER_API_KEY",
      "maxTurns": 50,
      "mcpServers": ["filesystem", "context7", "codebase-memory"],
      "toolOverrides": {
        "filesystem": [
          "read_file", "read_multiple_files", "search_files",
          "list_directory", "get_file_info", "list_allowed_directories"
        ]
      }
    },
    "ar-nemesis": {
      "provider": "openai-compat",
      "baseURL": "https://openrouter.ai/api/v1",
      "model": "google/gemma-4-31b-it",
      "apiKeyEnv": "OPENROUTER_API_KEY",
      "maxTurns": 50,
      "mcpServers": ["filesystem", "context7", "codebase-memory"]
    },
    "pm-ember": {
      "provider": "openai-compat",
      "baseURL": "https://openrouter.ai/api/v1",
      "model": "google/gemma-4-26b-a4b-it",
      "apiKeyEnv": "OPENROUTER_API_KEY",
      "maxTurns": 50,
      "mcpServers": ["filesystem"],
      "toolOverrides": {
        "filesystem": [
          "read_file", "read_multiple_files", "search_files",
          "list_directory", "get_file_info", "list_allowed_directories"
        ]
      }
    }
  },
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "."],
      "toolAllowlist": [
        "read_file", "read_multiple_files", "search_files",
        "list_directory", "directory_tree", "get_file_info",
        "list_allowed_directories"
      ]
    },
    "context7": {
      "command": "npx",
      "args": ["@upstash/context7-mcp"],
      "envPassthrough": ["CONTEXT7_API_KEY"]
    },
    "codebase-memory": {
      "command": "codebase-memory-mcp",
      "args": ["--mcp"],
      "toolAllowlist": [
        "index_repository", "index_status", "list_projects",
        "search_graph", "search_code", "get_code_snippet",
        "trace_call_path", "detect_changes", "query_graph",
        "get_graph_schema", "get_architecture"
      ]
    }
  }
}
```

## 6. Implementation Details

### File Structure

```
bin/install.js          → New: registry-driven MCP installer
.mcp.json               → New: created by installer
.gabbro/external-agents.json  → Modified: agent rename + model migration + codebase-memory server
.claude/agents/ar-enforcer.md → Modified: --agent flag
.claude/agents/ar-nemesis.md  → Modified: --agent flag
.claude/agents/pm-ember.md    → Modified: --agent flag
```

### Installer Logic (`bin/install.js`)

```js
#!/usr/bin/env node
// MCP server installer for gabbro
// Usage: node bin/install.js

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REGISTRY = { /* as defined in Section 5 */ };

function detectPlatform() {
  return process.platform === 'win32' ? 'win32' : 'unix';
}

function installBinary(name, server) {
  const platform = detectPlatform();
  const cmds = server.install[platform];
  console.log(`Installing ${name}...`);
  if (Array.isArray(cmds)) {
    // Windows: multiple PowerShell commands
    for (const cmd of cmds) {
      execSync(cmd, { stdio: 'inherit', shell: 'powershell.exe' });
    }
  } else {
    execSync(cmds, { stdio: 'inherit', shell: '/bin/bash' });
  }
}

function runPostInstall(name, server) {
  if (!server.postInstall?.length) return;
  console.log(`Configuring ${name}...`);
  for (const cmd of server.postInstall) {
    execSync(cmd, { stdio: 'inherit' });
  }
}

function mergeMcpJson(name, server) {
  const mcpPath = resolve('.mcp.json');
  let config = {};
  if (existsSync(mcpPath)) {
    config = JSON.parse(readFileSync(mcpPath, 'utf8'));
  }
  config.mcpServers ??= {};
  config.mcpServers[name] = server.mcpEntry;
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  .mcp.json: added ${name}`);
}

function mergeExternalAgents(name, server) {
  const eaPath = resolve('.gabbro/external-agents.json');
  if (!existsSync(eaPath)) return;
  const config = JSON.parse(readFileSync(eaPath, 'utf8'));
  config.mcpServers ??= {};
  config.mcpServers[name] = server.externalMcpEntry;
  writeFileSync(eaPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  external-agents.json: added ${name} to mcpServers`);
}

function main() {
  for (const [name, server] of Object.entries(REGISTRY)) {
    installBinary(name, server);
    runPostInstall(name, server);
    mergeMcpJson(name, server);
    mergeExternalAgents(name, server);
    console.log(`${name}: done\n`);
  }
}

main();
```

### Agent Definition Updates

Each `.claude/agents/*.md` file has a bash command in Phase 1 with `--agent <old-name>`. Update to new name:

| File | Old | New |
|------|-----|-----|
| `ar-enforcer.md:26` | `--agent kimi-review` | `--agent ar-enforcer` |
| `ar-nemesis.md:26` | `--agent glm5-review` | `--agent ar-nemesis` |
| `pm-ember.md:22` | `--agent kimi-pmatch` | `--agent pm-ember` |

### Integration Points

- The installer creates `.mcp.json` which Claude Code reads on startup to connect MCP servers
- The installer adds to `.gabbro/external-agents.json` `mcpServers` which `external-agent.mjs` reads to spawn MCP server processes for external agents
- Adding `"codebase-memory"` to agent profiles' `mcpServers` arrays (done in manual migration) tells `external-agent.mjs` to connect that MCP server for those specific agents

---

## Handoff

- `/ar PROCESS_DOCS/solutions/01-mcp-installer-and-agent-migration.md` — adversarial review
- `/breakdown PROCESS_DOCS/solutions/01-mcp-installer-and-agent-migration.md` — execution planning (after `/ar` approval)
