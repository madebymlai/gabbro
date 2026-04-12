# Build Agent 1: MCP Installer + Agent Migration

### Dependencies
None (parallel) — this is the only build agent for this feature.

### Overview
- **Objective**: Create a registry-driven Node.js installer for MCP server binaries and migrate external agents to aligned names with Google Gemma models via OpenRouter.
- **Scope**:
  - Includes: `bin/install.mjs` (new), `.mcp.json` (new), `.gabbro/external-agents.json` (modified), `.claude/agents/ar-enforcer.md` (modified), `.claude/agents/ar-nemesis.md` (modified), `.claude/agents/pm-ember.md` (modified)
  - Excludes: Installing the binary itself (that's done by running the installer), changes to `external-agent.mjs` or provider code, any other agent files
- **Dependencies**:
  - Node.js built-in modules only (`child_process`, `fs`, `path`)
  - No npm packages required
- **Estimated Complexity**: Low — config wiring and straightforward file edits

### Technical Approach

#### Architecture Decisions
| Decision | Rationale | Alternative Considered | Why Rejected |
|----------|-----------|----------------------|--------------|
| Delegate binary install to upstream `install.sh`/`install.ps1` | Upstream handles OS detection, extraction, placement | Download + extract in Node.js | Reimplements maintained upstream logic |
| Registry as inline JS object in installer | Single file, no loader complexity | Separate registry.json | Extra file for no benefit |
| UI binary variant via `--ui` flag | 1MB larger (28 vs 27MB), adds 3D graph viz for free | Standard binary | Negligible size difference |

#### Module Placement
```
Installer       → bin/install.mjs
MCP config      → .mcp.json (project root)
Agent config    → .gabbro/external-agents.json
Agent defs      → .claude/agents/ar-enforcer.md, ar-nemesis.md, pm-ember.md
```

#### Data Flow
```
bin/install.mjs
  ├── reads REGISTRY (inline JS object)
  ├── for each server in registry:
  │     ├── detect platform (process.platform)
  │     ├── shell out to upstream installer (curl | bash --ui)
  │     ├── run post-install config commands (execSync)
  │     ├── merge entry into .mcp.json
  │     └── merge entry into .gabbro/external-agents.json mcpServers
  └── done
```

---

### Task Breakdown

#### Task 1: **Create `bin/install.mjs`** (Module: `bin/`)
- **Description**: Create the registry-driven MCP server installer with platform detection, upstream delegation, post-install config, and config file merging.
- **Acceptance Criteria**:
  - [ ] File exists at `bin/install.mjs` with `#!/usr/bin/env node` shebang
  - [ ] `REGISTRY` object contains the `codebase-memory` entry with all fields
  - [ ] `detectPlatform()` returns `'unix'` for linux/darwin, `'win32'` for win32
  - [ ] `installBinary()` shells out to correct upstream command per platform
  - [ ] `runPostInstall()` runs `codebase-memory-mcp config set auto_index true` and `auto_index_limit 50000`
  - [ ] `mergeMcpJson()` creates `.mcp.json` if missing, merges if exists, never clobbers other entries
  - [ ] `mergeExternalAgents()` adds to `.gabbro/external-agents.json` `mcpServers` section, preserves existing entries
  - [ ] `main()` iterates registry and orchestrates all steps with console.log progress
  - [ ] File is executable (`chmod +x`)
- **Files to Create**:
  ```
  bin/
  └── install.mjs    # Registry-driven MCP installer
  ```
- **Dependencies**: None
- **Code Example** (complete implementation):
  ```js
  #!/usr/bin/env node
  // MCP server installer for gabbro
  // Usage: node bin/install.mjs

  import { execSync } from 'node:child_process';
  import { readFileSync, writeFileSync, existsSync } from 'node:fs';
  import { resolve } from 'node:path';

  const REGISTRY = {
    'codebase-memory': {
      install: {
        unix: 'curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --ui',
        win32: [
          'Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile $env:TEMP\\install-codebase-memory.ps1',
          '& $env:TEMP\\install-codebase-memory.ps1 -UI',
        ],
      },
      postInstall: [
        'codebase-memory-mcp config set auto_index true',
        'codebase-memory-mcp config set auto_index_limit 50000',
      ],
      mcpEntry: {
        command: 'codebase-memory-mcp',
        args: ['--mcp'],
      },
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

  function detectPlatform() {
    return process.platform === 'win32' ? 'win32' : 'unix';
  }

  function installBinary(name, server) {
    const platform = detectPlatform();
    const cmds = server.install[platform];
    console.log(`\nInstalling ${name}...`);
    if (Array.isArray(cmds)) {
      for (const cmd of cmds) {
        execSync(cmd, { stdio: 'inherit', shell: 'powershell.exe' });
      }
    } else {
      execSync(cmds, { stdio: 'inherit', shell: '/bin/bash' });
    }
    console.log(`  Binary installed.`);
  }

  function runPostInstall(name, server) {
    if (!server.postInstall?.length) return;
    console.log(`Configuring ${name}...`);
    for (const cmd of server.postInstall) {
      execSync(cmd, { stdio: 'inherit' });
    }
    console.log(`  Configuration applied.`);
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
    console.log(`  .mcp.json: added "${name}"`);
  }

  function mergeExternalAgents(name, server) {
    const eaPath = resolve('.gabbro/external-agents.json');
    if (!existsSync(eaPath)) {
      console.log(`  .gabbro/external-agents.json not found, skipping.`);
      return;
    }
    const config = JSON.parse(readFileSync(eaPath, 'utf8'));
    config.mcpServers ??= {};
    config.mcpServers[name] = server.externalMcpEntry;
    writeFileSync(eaPath, JSON.stringify(config, null, 2) + '\n');
    console.log(`  external-agents.json: added "${name}" to mcpServers`);
  }

  function main() {
    console.log('gabbro MCP installer\n');
    for (const [name, server] of Object.entries(REGISTRY)) {
      installBinary(name, server);
      runPostInstall(name, server);
      mergeMcpJson(name, server);
      mergeExternalAgents(name, server);
      console.log(`\n${name}: done`);
    }
    console.log('\nAll servers installed.');
  }

  main();
  ```
- **Test Cases** (file: `bin/install.test.mjs`):
  - `test_detectPlatform_unix`: Mock `process.platform` as `'linux'` → returns `'unix'`. Mock as `'darwin'` → returns `'unix'`.
  - `test_detectPlatform_win32`: Mock `process.platform` as `'win32'` → returns `'win32'`.
  - `test_mergeMcpJson_creates_new`: No `.mcp.json` exists → creates file with `{"mcpServers":{"codebase-memory":{...}}}`. Verify JSON is valid and contains the entry.
  - `test_mergeMcpJson_merges_existing`: `.mcp.json` exists with `{"mcpServers":{"other-server":{...}}}` → file now has both `other-server` and `codebase-memory`. `other-server` is untouched.
  - `test_mergeExternalAgents_adds_to_mcpServers`: `external-agents.json` exists with `filesystem` and `context7` in `mcpServers` → after merge, `codebase-memory` is added, `filesystem` and `context7` are untouched.
  - `test_mergeExternalAgents_skips_missing_file`: No `external-agents.json` → no error, logs skip message.
  - Setup: Use Node.js built-in `node:test` and `node:assert`. Create temp directories with fixture files for each test. Clean up after.

#### Task 2: **Migrate agents in `.gabbro/external-agents.json`** (Module: `.gabbro/`)
- **Description**: Rename agent keys, swap providers/models to OpenRouter + Gemma, add codebase-memory server definition, and wire it into review agent profiles.
- **Acceptance Criteria**:
  - [ ] Agent `kimi-review` renamed to `ar-enforcer`
  - [ ] Agent `glm5-review` renamed to `ar-nemesis`
  - [ ] Agent `kimi-pmatch` renamed to `pm-ember`
  - [ ] All three agents use `"baseURL": "https://openrouter.ai/api/v1"` and `"apiKeyEnv": "OPENROUTER_API_KEY"`
  - [ ] `ar-enforcer` model is `"google/gemma-4-26b-a4b-it"`
  - [ ] `ar-nemesis` model is `"google/gemma-4-31b-it"`
  - [ ] `pm-ember` model is `"google/gemma-4-26b-a4b-it"`
  - [ ] `ar-enforcer` mcpServers array is `["filesystem", "context7", "codebase-memory"]`
  - [ ] `ar-nemesis` mcpServers array is `["filesystem", "context7", "codebase-memory"]`
  - [ ] `pm-ember` mcpServers array is `["filesystem"]` (no codebase-memory)
  - [ ] `codebase-memory` server definition added under top-level `mcpServers` with 11-tool allowlist
  - [ ] Existing `filesystem` and `context7` server definitions untouched
  - [ ] `toolOverrides` preserved on `ar-enforcer` and `pm-ember` (same as before)
  - [ ] JSON is valid and properly formatted (2-space indent, trailing newline)
- **Files to Modify**:
  ```
  .gabbro/external-agents.json
  ```
- **Dependencies**: None
- **Target state** (exact file content):
  ```json
  {
    "agents": {
      "ar-enforcer": {
        "provider": "openai-compat",
        "baseURL": "https://openrouter.ai/api/v1",
        "model": "google/gemma-4-26b-a4b-it",
        "apiKeyEnv": "OPENROUTER_API_KEY",
        "maxTurns": 50,
        "mcpServers": [
          "filesystem",
          "context7",
          "codebase-memory"
        ],
        "toolOverrides": {
          "filesystem": [
            "read_file",
            "read_multiple_files",
            "search_files",
            "list_directory",
            "get_file_info",
            "list_allowed_directories"
          ]
        }
      },
      "ar-nemesis": {
        "provider": "openai-compat",
        "baseURL": "https://openrouter.ai/api/v1",
        "model": "google/gemma-4-31b-it",
        "apiKeyEnv": "OPENROUTER_API_KEY",
        "maxTurns": 50,
        "mcpServers": [
          "filesystem",
          "context7",
          "codebase-memory"
        ]
      },
      "pm-ember": {
        "provider": "openai-compat",
        "baseURL": "https://openrouter.ai/api/v1",
        "model": "google/gemma-4-26b-a4b-it",
        "apiKeyEnv": "OPENROUTER_API_KEY",
        "maxTurns": 50,
        "mcpServers": [
          "filesystem"
        ],
        "toolOverrides": {
          "filesystem": [
            "read_file",
            "read_multiple_files",
            "search_files",
            "list_directory",
            "get_file_info",
            "list_allowed_directories"
          ]
        }
      }
    },
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": [
          "@modelcontextprotocol/server-filesystem",
          "."
        ],
        "toolAllowlist": [
          "read_file",
          "read_multiple_files",
          "search_files",
          "list_directory",
          "directory_tree",
          "get_file_info",
          "list_allowed_directories"
        ]
      },
      "context7": {
        "command": "npx",
        "args": [
          "@upstash/context7-mcp"
        ],
        "envPassthrough": [
          "CONTEXT7_API_KEY"
        ]
      },
      "codebase-memory": {
        "command": "codebase-memory-mcp",
        "args": [
          "--mcp"
        ],
        "toolAllowlist": [
          "index_repository",
          "index_status",
          "list_projects",
          "search_graph",
          "search_code",
          "get_code_snippet",
          "trace_call_path",
          "detect_changes",
          "query_graph",
          "get_graph_schema",
          "get_architecture"
        ]
      }
    }
  }
  ```
- **Test Cases**: Manual validation — parse the JSON output, verify all keys/values match the target state above.

#### Task 3: **Update agent `--agent` flags in `.claude/agents/*.md`** (Module: `.claude/agents/`)
- **Description**: Update the `--agent` CLI flag in each agent definition's Phase 1 bash command to reference the new agent names.
- **Acceptance Criteria**:
  - [ ] `ar-enforcer.md` line 26: `--agent kimi-review` changed to `--agent ar-enforcer`
  - [ ] `ar-nemesis.md` line 26: `--agent glm5-review` changed to `--agent ar-nemesis`
  - [ ] `pm-ember.md` line 22: `--agent kimi-pmatch` changed to `--agent pm-ember`
  - [ ] No other changes to these files
- **Files to Modify**:
  ```
  .claude/agents/ar-enforcer.md
  .claude/agents/ar-nemesis.md
  .claude/agents/pm-ember.md
  ```
- **Dependencies**: None
- **Exact changes**:

  In `.claude/agents/ar-enforcer.md`, the bash block in Phase 1:
  ```bash
  # BEFORE (line 26):
      --agent kimi-review \
  # AFTER:
      --agent ar-enforcer \
  ```

  In `.claude/agents/ar-nemesis.md`, the bash block in Phase 1:
  ```bash
  # BEFORE (line 26):
      --agent glm5-review \
  # AFTER:
      --agent ar-nemesis \
  ```

  In `.claude/agents/pm-ember.md`, the bash block in Phase 1:
  ```bash
  # BEFORE (line 22):
      --agent kimi-pmatch \
  # AFTER:
      --agent pm-ember \
  ```
- **Test Cases**: Grep each file for `--agent` and verify the value matches the agent filename (minus `.md`).

#### Task 4: **Add codebase-memory tools to review agent prompts** (Module: `.claude/resources/prompts/`)
- **Description**: Add the codebase-memory MCP tool descriptions to the "Available Tools" section of the prompts used by `ar-enforcer` and `ar-nemesis`. Do NOT modify `pattern-match.md` (used by `pm-ember`, which does not get codebase-memory).
- **Acceptance Criteria**:
  - [ ] `principles-enforcement.md` has a `**Codebase Memory**` section under Available Tools listing the 11 allowed tools
  - [ ] `red-team-review.md` has a `**Codebase Memory**` section under Available Tools listing the 11 allowed tools
  - [ ] `pattern-match.md` is NOT modified
  - [ ] Tool descriptions are concise and help the external model understand when to use each tool
- **Files to Modify**:
  ```
  .claude/resources/prompts/principles-enforcement.md
  .claude/resources/prompts/red-team-review.md
  ```
- **Dependencies**: None
- **Exact addition** (insert after the Context7 tools block in each file):

  For `principles-enforcement.md`, insert after line 9 (after the Filesystem block, before Context7):
  ```markdown

  **Codebase Memory** (structural knowledge graph):
  - `index_repository` — index or re-index the repo into the graph
  - `index_status` — check indexing status
  - `list_projects` — list all indexed projects
  - `search_graph` — structured search by label, name, file pattern, degree
  - `search_code` — grep-like text search within indexed files
  - `get_code_snippet` — read source code for a function by qualified name
  - `trace_call_path` — BFS traversal of function call chains (depth 1-5)
  - `detect_changes` — map git diff to affected symbols + blast radius
  - `query_graph` — execute Cypher-like read-only graph queries
  - `get_graph_schema` — return node/edge counts and relationship patterns
  - `get_architecture` — codebase overview: languages, packages, hotspots, clusters
  ```

  For `red-team-review.md`, insert after line 21 (after the Filesystem block, before Context7):
  ```markdown

  **Codebase Memory** (structural knowledge graph):
  - `index_repository` — index or re-index the repo into the graph
  - `index_status` — check indexing status
  - `list_projects` — list all indexed projects
  - `search_graph` — structured search by label, name, file pattern, degree
  - `search_code` — grep-like text search within indexed files
  - `get_code_snippet` — read source code for a function by qualified name
  - `trace_call_path` — BFS traversal of function call chains (depth 1-5)
  - `detect_changes` — map git diff to affected symbols + blast radius
  - `query_graph` — execute Cypher-like read-only graph queries
  - `get_graph_schema` — return node/edge counts and relationship patterns
  - `get_architecture` — codebase overview: languages, packages, hotspots, clusters
  ```
- **Test Cases**: Grep `principles-enforcement.md` and `red-team-review.md` for `Codebase Memory` — both should match. Grep `pattern-match.md` for `Codebase Memory` — should NOT match.

#### Task 5: **Create committed `.mcp.json`** (Module: project root)
- **Description**: Create the `.mcp.json` file at project root so anyone cloning the repo gets the MCP server config. The installer will merge into this file if it already exists.
- **Acceptance Criteria**:
  - [ ] `.mcp.json` exists at project root
  - [ ] Contains `codebase-memory` server entry with `command: "codebase-memory-mcp"` and `args: ["--mcp"]`
  - [ ] JSON is valid (2-space indent, trailing newline)
- **Files to Create**:
  ```
  .mcp.json
  ```
- **Dependencies**: None
- **Exact content**:
  ```json
  {
    "mcpServers": {
      "codebase-memory": {
        "command": "codebase-memory-mcp",
        "args": [
          "--mcp"
        ]
      }
    }
  }
  ```
- **Test Cases**: Parse the file as JSON. Verify `mcpServers["codebase-memory"].command === "codebase-memory-mcp"` and `args` includes `"--mcp"`.

#### Task 6: **Verify integration** (Module: all)
- **Description**: Run validation checks across all modified files to ensure consistency.
- **Acceptance Criteria**:
  - [ ] `.gabbro/external-agents.json` parses as valid JSON
  - [ ] `.mcp.json` parses as valid JSON
  - [ ] Every agent name in `external-agents.json` `agents` keys has a matching `.claude/agents/<name>.md` file
  - [ ] Every `--agent` flag value in `.claude/agents/*.md` files matches a key in `external-agents.json` `agents`
  - [ ] Every MCP server referenced in agent `mcpServers` arrays exists in top-level `mcpServers` object
  - [ ] `bin/install.mjs` has correct shebang and is parseable (`node --check bin/install.mjs`)
  - [ ] `bin/install.mjs` tests pass (`node --test bin/install.test.mjs`)
  - [ ] `principles-enforcement.md` and `red-team-review.md` list codebase-memory tools
  - [ ] `pattern-match.md` does NOT list codebase-memory tools
- **Files to Check**:
  ```
  .mcp.json
  .gabbro/external-agents.json
  .claude/agents/ar-enforcer.md
  .claude/agents/ar-nemesis.md
  .claude/agents/pm-ember.md
  bin/install.mjs
  bin/install.test.mjs
  .claude/resources/prompts/principles-enforcement.md
  .claude/resources/prompts/red-team-review.md
  .claude/resources/prompts/pattern-match.md
  ```
- **Dependencies**: Tasks 1-5 must be complete
- **Verification commands**:
  ```bash
  # JSON validity
  node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8'))"
  node -e "JSON.parse(require('fs').readFileSync('.gabbro/external-agents.json','utf8'))"

  # Installer syntax check
  node --check bin/install.mjs

  # Run installer tests
  node --test bin/install.test.mjs

  # Agent name consistency: every --agent value should match an external-agents key
  grep -h '\-\-agent ' .claude/agents/*.md | grep -oP '(?<=--agent )\S+' | sort
  node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('.gabbro/external-agents.json','utf8')).agents).sort().join('\n'))"
  # These two outputs should match

  # MCP server references: every mcpServers array entry should exist in top-level mcpServers
  node -e "
    const c = JSON.parse(require('fs').readFileSync('.gabbro/external-agents.json','utf8'));
    const defined = new Set(Object.keys(c.mcpServers));
    for (const [name, agent] of Object.entries(c.agents)) {
      for (const srv of agent.mcpServers || []) {
        if (!defined.has(srv)) console.error('MISSING: agent ' + name + ' references undefined server ' + srv);
      }
    }
    console.log('MCP server references OK');
  "

  # Prompt tool sections: review agents have codebase-memory, pattern-match does not
  grep -l 'Codebase Memory' .claude/resources/prompts/principles-enforcement.md .claude/resources/prompts/red-team-review.md
  # Should list both files
  grep -L 'Codebase Memory' .claude/resources/prompts/pattern-match.md
  # Should list pattern-match.md (meaning it does NOT contain the string)
  ```

---

### Testing Strategy
- **Framework**: Node.js built-in `node:test` and `node:assert` (no external test dependencies)
- **Structure**: Test file colocated with installer at `bin/install.test.mjs`
- **Coverage target**: All installer functions tested (detectPlatform, mergeMcpJson, mergeExternalAgents). Binary install and post-install are shell-outs and tested manually.
- **Integration**: Task 6 verification commands serve as integration tests across all files

### Risk Mitigation

| Risk | Probability | Impact | Mitigation | Fallback | Detection |
|------|-------------|--------|------------|----------|-----------|
| Upstream `install.sh` URL changes | Low | High — installer breaks | Pin to `main` branch URL (stable) | User can manually download binary and run post-install config | Installer exits non-zero, error message from curl |
| `external-agents.json` format changes | Low | Medium — installer merge fails | Installer uses defensive `??=` for missing keys | User manually adds the `mcpServers` entry | JSON parse error caught and logged |
| `codebase-memory-mcp` binary not in PATH after install | Medium | High — post-install config fails | Upstream installer places in standard locations | User adds binary location to PATH manually | `execSync` throws, installer catches and suggests PATH fix |
| Windows PowerShell execution policy blocks script | Medium | Medium — Windows install fails | Installer logs the policy error with instructions | User runs `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` | PowerShell error output visible via `stdio: 'inherit'` |
| Merge clobbers user edits to `.mcp.json` | Low | Medium — loses custom config | Read-merge-write pattern preserves existing entries | User restores from git | Diff `.mcp.json` before/after shows unexpected changes |

### Success Criteria

#### Functional Requirements
- [ ] `node bin/install.mjs` runs without error on Linux (primary dev platform)
- [ ] `.mcp.json` exists with codebase-memory entry after install
- [ ] `.gabbro/external-agents.json` has codebase-memory in mcpServers after install
- [ ] All three agents renamed and using correct Gemma models via OpenRouter
- [ ] `--agent` flags in `.claude/agents/*.md` match agent keys in `external-agents.json`
- [ ] `ar-enforcer` and `ar-nemesis` have `codebase-memory` in their mcpServers arrays
- [ ] `pm-ember` does NOT have `codebase-memory` in its mcpServers array

#### Non-Functional Requirements
- [ ] All JSON files are valid and properly formatted
- [ ] `node --test bin/install.test.mjs` passes
- [ ] Installer provides clear progress output (one line per step)
- [ ] Installer exits non-zero on any failure

### Implementation Notes

- **JSON formatting**: Use `JSON.stringify(config, null, 2) + '\n'` consistently for 2-space indent with trailing newline.
- **File extension**: Use `bin/install.mjs` (not `.js`) so Node.js treats it as ESM without needing a `package.json` with `"type": "module"`. The shebang `#!/usr/bin/env node` still works with `.mjs`.
- **No `package.json` for `bin/`**: The installer is standalone. Do not create a package.json in `bin/` or at project root for this.
- **`chmod +x`**: After creating `bin/install.mjs`, run `chmod +x bin/install.mjs`.
- **Do not run the actual installer** during the build — it downloads a binary. Only run the unit tests and verification commands.
- **The `--agent` flag in agent .md files**: These are inside fenced code blocks (` ```bash `). The edit is a simple string replacement within the code block, not a frontmatter change.
