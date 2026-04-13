# Solution: Integrate tokf shell output filter

**Brief**: `PROCESS_DOCS/briefs/02-tokf-integration.md`

## 1. Executive Summary

Add tokf as a second entry in the gabbro installer registry, with a new `githubRelease` install path for downloading release tarballs. Add a scope selection prompt so the user chooses global or project-local installation once, applied uniformly to all tools — including the existing codebase-memory entry.

## 2. Rationale

| Decision | Rationale | Alternative | Why Rejected |
|----------|-----------|-------------|--------------|
| `githubRelease` field on registry entries | tokf has no upstream install script — just GitHub release tarballs. Need dynamic version resolution + tarball extraction, which doesn't fit a static shell command string | Inline multi-line shell script in `install.unix` | Brittle, hard to test, mixes HTTP resolution with shell commands |
| `platforms` allowlist per entry | tokf has no Windows or ARM Linux builds. Explicit allowlist skips unsupported combos with a warning instead of failing mid-install | `install.win32: null` sentinel | Implicit — new platforms could silently fail. Explicit list is self-documenting |
| Scope-aware `postInstall` as `{project: [...], global: [...]}` | tokf hook install differs by scope (`--global` flag). codebase-memory postInstall doesn't vary, so it stays as a plain array. Both shapes coexist cleanly | Template strings with `${SCOPE_FLAG}` substitution | Harder to read, fragile escaping, mixes concerns |
| Scope affects `mergeMcpJson` path | Global → `~/.claude/.mcp.json`; project → `./.mcp.json`. User requested uniform scope choice across all tools | Always project-local | Doesn't match the requirement |
| `node:readline` for scope prompt | Built-in, zero dependencies, consistent with "pure Node.js" constraint | `process.stdin` raw mode | More code for no benefit |
| Resolve latest release via GitHub API | User wants latest, not pinned. GitHub API returns structured JSON — parse with `JSON.parse`, no `gh` CLI needed | `gh release view` | Adds `gh` CLI as a runtime dependency |
| `tar xzf` via `execSync` | Tarball contains `tokf` at root (verified). Single shell command, consistent with existing installer's exec pattern | `node:zlib` + `node:tar` (no built-in tar module) | Would need a third-party tar library or manual implementation |
| Skip `mergeExternalAgents` for tokf | tokf is not an MCP server — it's a shell filter. No entry needed in external-agents.json | Add a dummy entry | Misleading — tokf has no MCP protocol |
| `~/.local/bin` on all unix platforms | `/usr/local/bin` on macOS is root-owned (`root:755`) — install fails without sudo for non-root users. `~/.local/bin` is user-writable and conventional. | `/usr/local/bin` on macOS | Requires sudo, breaks non-interactive install |
| SHA256 checksum verification | Every tokf release ships a `.sha256` companion file. Verifying integrity costs ~5 lines and prevents MITM/CDN compromise | No verification (`curl \| tar` directly) | Unnecessary risk when checksums are freely available |
| Back up settings.json before `tokf hook install` | `tokf hook install` may overwrite the `PreToolUse` array instead of appending. Existing `cbm-code-discovery-gate` hooks must survive. | Trust tokf's merge behavior | Unverified — tokf's test suite only checks cross-type preservation, not intra-array merge |

## 3. Technology Stack

- **Installer runtime**: Node.js (built-in modules: `node:https`, `node:fs`, `node:child_process`, `node:path`, `node:os`, `node:readline`)
- **tokf**: Rust CLI binary (~7MB compressed), installed from GitHub releases (`mpecan/tokf`)
- **Hook mechanism**: tokf writes a `PreToolUse` hook into Claude Code's settings — `.claude/settings.json` (project-local) or `~/.claude/settings.json` (global). Intercepts all Bash tool calls, wraps with `tokf run`, filters output before it enters context.

## 4. Architecture

### Data Flow

```
bin/install.mjs
  ├── prompt: "Install globally or project-locally?" → scope
  ├── for each server in REGISTRY:
  │     ├── check platforms allowlist (if present)
  │     │     └── skip with warning if current platform not listed
  │     ├── install binary:
  │     │     ├── if server.githubRelease → installFromGithubRelease()
  │     │     │     ├── GET /repos/{repo}/releases → find latest tag
  │     │     │     ├── map platform+arch → target string
  │     │     │     ├── download tarball + .sha256 → /tmp/
  │     │     │     ├── verify checksum (shasum -a 256 -c)
  │     │     │     ├── tar xzf → ~/.local/bin
  │     │     ��     └── chmod +x
  │     │     └── if server.install → existing shell-out path
  │     ├── run postInstall (scope-aware if object, direct if array)
  │     ├── merge .mcp.json (if server.mcpEntry exists)
  │     │     └── path depends on scope: ./.mcp.json or ~/.claude/.mcp.json
  │     ├── merge external-agents.json (if server.externalMcpEntry exists)
  │     └── done
  └── "All servers installed."
```

### Component Catalog

| Component | Purpose | New/Modified |
|-----------|---------|--------------|
| `promptScope()` | Readline prompt returning `'global'` or `'project'` | New |
| `detectTarget()` | Maps `process.platform` + `process.arch` to `{target, installDir}` | New |
| `installFromGithubRelease(name, config)` | Resolves latest release, downloads tarball, extracts binary | New |
| `httpsGetJson(url)` | Promise-based HTTPS GET returning parsed JSON | New |
| `installBinary(name, server)` | Dispatches to `installFromGithubRelease` or existing shell-out | Modified |
| `runPostInstall(name, server, scope)` | Handles both array and `{project, global}` postInstall shapes | Modified |
| `mergeMcpJson(name, server, scope)` | Scope-aware path selection | Modified |
| `mergeExternalAgents(name, server)` | Unchanged — always project-level | Unchanged |
| `main()` | Now async — prompts for scope, passes it through | Modified |

## 5. Protocol/Schema

### Registry Entry Shape — tokf

```js
'tokf': {
  // Platforms this tool supports. Skip others with a warning.
  // Format: `${process.platform}-${process.arch}` normalized to readable names.
  platforms: ['linux-x86_64', 'darwin-arm64', 'darwin-x86_64'],

  // GitHub release download config
  githubRelease: {
    repo: 'mpecan/tokf',          // GitHub owner/repo
    tagPrefix: 'tokf-v',           // release tags: tokf-v0.2.39
    // Map from our platform key → GitHub asset target string
    targets: {
      'linux-x86_64': 'x86_64-unknown-linux-gnu',
      'darwin-arm64': 'aarch64-apple-darwin',
      'darwin-x86_64': 'x86_64-apple-darwin',
    },
    binName: 'tokf',               // binary name inside tarball
  },

  // Scope-aware post-install commands
  postInstall: {
    project: ['tokf hook install'],
    global: ['tokf hook install --global'],
  },

  // No mcpEntry — tokf is not an MCP server
  // No externalMcpEntry — same reason
}
```

### Registry Entry Shape — codebase-memory (unchanged except postInstall stays array)

```js
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
      'index_repository', 'index_status', 'list_projects',
      'search_graph', 'search_code', 'get_code_snippet',
      'trace_call_path', 'detect_changes', 'query_graph',
      'get_graph_schema', 'get_architecture',
    ],
  },
}
```

### Target Detection Mapping

```js
// process.platform → process.arch → { platformKey, installDir }
// All unix platforms use ~/.local/bin (user-writable, no sudo needed).
// /usr/local/bin on macOS is root-owned — install fails without sudo.
const TARGET_MAP = {
  linux: {
    x64: { key: 'linux-x86_64', installDir: '~/.local/bin' },
    // arm64 intentionally absent — no prebuilt binaries
  },
  darwin: {
    arm64: { key: 'darwin-arm64', installDir: '~/.local/bin' },
    x64:   { key: 'darwin-x86_64', installDir: '~/.local/bin' },
  },
  // win32 intentionally absent — no tokf support
};
```

> **Note**: If `~/.local/bin` is not on the user's `$PATH`, print a warning after install with instructions to add it.

### GitHub Release API Response (relevant fields)

```json
[
  {
    "tag_name": "tokf-v0.2.39",
    "assets": [
      {
        "name": "tokf-v0.2.39-x86_64-unknown-linux-gnu.tar.gz",
        "browser_download_url": "https://github.com/mpecan/tokf/releases/download/tokf-v0.2.39/tokf-v0.2.39-x86_64-unknown-linux-gnu.tar.gz"
      }
    ]
  }
]
```

### Asset URL Pattern

```
https://github.com/mpecan/tokf/releases/download/{tag}/{tag}-{target}.tar.gz
```

Where `tag` = `tokf-v0.2.39`, `target` = `x86_64-unknown-linux-gnu`.

## 6. Implementation Details

### File Structure

```
bin/install.mjs          → Modified: add tokf entry, scope prompt, githubRelease path
bin/install.test.mjs     → Modified: add tests for new functions
```

### New Functions

#### `promptScope()`

```js
import { createInterface } from 'node:readline';

export function promptScope() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Install globally (g) or project-locally (p)? [g/p]: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('g') ? 'global' : 'project');
    });
  });
}
```

#### `detectTarget()`

```js
const TARGET_MAP = {
  linux:  { x64: { key: 'linux-x86_64',  installDir: resolve(homedir(), '.local/bin') } },
  darwin: {
    arm64: { key: 'darwin-arm64',  installDir: resolve(homedir(), '.local/bin') },
    x64:   { key: 'darwin-x86_64', installDir: resolve(homedir(), '.local/bin') },
  },
};

export function detectTarget() {
  const entry = TARGET_MAP[process.platform]?.[process.arch];
  if (!entry) return null;
  return entry;
}
```

#### `httpsGetJson(url)`

```js
import https from 'node:https';

function httpsGetJson(url, redirects = 0) {
  if (redirects > 5) throw new Error(`Too many redirects fetching ${url}`);
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'gabbro-installer' } };
    https.get(url, opts, (res) => {
      // Follow redirects (max 5)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGetJson(res.headers.location, redirects + 1).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}: ${data.slice(0, 200)}`));
          return;
        }
        resolve(JSON.parse(data));
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}
```

#### `installFromGithubRelease(name, config)`

```js
export async function installFromGithubRelease(name, ghConfig) {
  const target = detectTarget();
  if (!target) {
    console.log(`  Skipping ${name}: unsupported platform ${process.platform}/${process.arch}`);
    return false;
  }

  const ghTarget = ghConfig.targets[target.key];
  if (!ghTarget) {
    console.log(`  Skipping ${name}: no build for ${target.key}`);
    return false;
  }

  console.log(`\nInstalling ${name}...`);

  // 1. Resolve latest release
  const releases = await httpsGetJson(
    `https://api.github.com/repos/${ghConfig.repo}/releases`
  );
  const release = releases.find(r => r.tag_name.startsWith(ghConfig.tagPrefix));
  if (!release) throw new Error(`No release found matching prefix "${ghConfig.tagPrefix}"`);

  const tag = release.tag_name;
  const assetName = `${tag}-${ghTarget}.tar.gz`;
  const asset = release.assets.find(a => a.name === assetName);
  if (!asset) throw new Error(`Asset "${assetName}" not found in release ${tag}`);

  // 2. Download tarball + checksum to temp dir
  const installDir = target.installDir;
  const tmpDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
  const tarball = `${tmpDir}/${assetName}`;

  execSync(`curl -fsSL -o "${tarball}" "${asset.browser_download_url}"`, { stdio: 'inherit', shell: '/bin/bash' });

  // 3. Verify SHA256 checksum
  const shaAsset = release.assets.find(a => a.name === `${assetName}.sha256`);
  if (shaAsset) {
    execSync(`curl -fsSL -o "${tarball}.sha256" "${shaAsset.browser_download_url}"`, { stdio: 'inherit', shell: '/bin/bash' });
    execSync(`cd "${tmpDir}" && shasum -a 256 -c "${tarball}.sha256"`, { stdio: 'inherit', shell: '/bin/bash' });
    console.log(`  Checksum verified.`);
  } else {
    console.log(`  Warning: no .sha256 asset found, skipping verification.`);
  }

  // 4. Extract and install
  execSync(`mkdir -p "${installDir}"`, { stdio: 'inherit' });
  execSync(`tar xzf "${tarball}" -C "${installDir}" ${ghConfig.binName}`, { stdio: 'inherit', shell: '/bin/bash' });
  execSync(`chmod +x "${installDir}/${ghConfig.binName}"`);
  execSync(`rm -rf "${tmpDir}"`);

  // 5. Warn if install dir not on PATH
  const pathDirs = (process.env.PATH || '').split(':');
  if (!pathDirs.includes(installDir)) {
    console.log(`  Warning: ${installDir} is not on your PATH. Add it to your shell profile.`);
  }

  console.log(`  ${name} ${tag} installed to ${installDir}`);
  return true;
}
```

### Modified Functions

#### `installBinary` — dispatch on entry shape

```js
export async function installBinary(name, server) {
  if (server.githubRelease) {
    return installFromGithubRelease(name, server.githubRelease);
  }
  // Existing path: shell out to install commands
  const platform = detectPlatform();
  const cmds = server.install?.[platform];
  if (!cmds) {
    console.log(`  Skipping ${name}: no install commands for ${platform}`);
    return false;
  }
  console.log(`\nInstalling ${name}...`);
  if (Array.isArray(cmds)) {
    for (const cmd of cmds) {
      execSync(cmd, { stdio: 'inherit', shell: 'powershell.exe' });
    }
  } else {
    execSync(cmds, { stdio: 'inherit', shell: '/bin/bash' });
  }
  console.log(`  Binary installed.`);
  return true;
}
```

#### `runPostInstall` — scope-aware, with hook safety

```js
export function runPostInstall(name, server, scope) {
  const pi = server.postInstall;
  if (!pi) return;
  const cmds = Array.isArray(pi) ? pi : pi[scope];
  if (!cmds?.length) return;

  // Back up settings.json before running postInstall commands that may modify hooks.
  // tokf hook install may overwrite the PreToolUse array instead of appending.
  const settingsPath = scope === 'global'
    ? resolve(homedir(), '.claude', 'settings.json')
    : resolve('.claude', 'settings.json');
  let settingsBefore = null;
  if (existsSync(settingsPath)) {
    settingsBefore = JSON.parse(readFileSync(settingsPath, 'utf8'));
  }

  console.log(`Configuring ${name}...`);
  for (const cmd of cmds) {
    execSync(cmd, { stdio: 'inherit' });
  }

  // Restore any PreToolUse hooks that tokf may have overwritten
  if (settingsBefore?.hooks?.PreToolUse && existsSync(settingsPath)) {
    const settingsAfter = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const beforeEntries = settingsBefore.hooks.PreToolUse;
    const afterEntries = settingsAfter.hooks?.PreToolUse || [];
    // Merge: keep all entries from before that aren't duplicated in after
    const afterMatchers = new Set(afterEntries.map(e => e.matcher));
    const merged = [
      ...afterEntries,
      ...beforeEntries.filter(e => !afterMatchers.has(e.matcher)),
    ];
    settingsAfter.hooks ??= {};
    settingsAfter.hooks.PreToolUse = merged;
    writeFileSync(settingsPath, JSON.stringify(settingsAfter, null, 2) + '\n');
    if (merged.length > afterEntries.length) {
      console.log(`  Restored ${merged.length - afterEntries.length} existing PreToolUse hook(s).`);
    }
  }

  console.log(`  Configuration applied.`);
}
```

#### `mergeMcpJson` — scope-aware path

```js
export function mergeMcpJson(name, server, scope) {
  if (!server.mcpEntry) return;
  const mcpPath = scope === 'global'
    ? resolve(homedir(), '.claude', '.mcp.json')
    : resolve('.mcp.json');
  let config = {};
  if (existsSync(mcpPath)) {
    config = JSON.parse(readFileSync(mcpPath, 'utf8'));
  }
  config.mcpServers ??= {};
  config.mcpServers[name] = server.mcpEntry;
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ${mcpPath}: added "${name}"`);
}
```

#### `main` — async, scope-aware

```js
async function main() {
  console.log('gabbro installer\n');
  const scope = await promptScope();
  console.log(`\nScope: ${scope}\n`);

  for (const [name, server] of Object.entries(REGISTRY)) {
    // Platform check
    if (server.platforms) {
      const target = detectTarget();
      if (!target || !server.platforms.includes(target.key)) {
        console.log(`Skipping ${name}: not supported on ${process.platform}/${process.arch}`);
        continue;
      }
    }

    const installed = await installBinary(name, server);
    if (!installed) continue;

    runPostInstall(name, server, scope);
    mergeMcpJson(name, server, scope);
    mergeExternalAgents(name, server);
    console.log(`\n${name}: done`);
  }
  console.log('\nAll servers installed.');
}
```

### Tests to Add (`bin/install.test.mjs`)

| Test | What it verifies |
|------|-----------------|
| `test_detectTarget_linux_x64` | Returns `{ key: 'linux-x86_64', installDir: '~/.local/bin' }` |
| `test_detectTarget_darwin_arm64` | Returns `{ key: 'darwin-arm64', installDir: '~/.local/bin' }` |
| `test_detectTarget_unsupported` | Returns `null` for win32 or linux arm64 |
| `test_runPostInstall_array` | Scope-agnostic array works as before |
| `test_runPostInstall_scope_object` | Picks `global` or `project` commands based on scope |
| `test_mergeMcpJson_global_scope` | Writes to `~/.claude/.mcp.json` |
| `test_mergeMcpJson_project_scope` | Writes to `./.mcp.json` (existing behavior) |
| `test_mergeMcpJson_skips_no_entry` | No-ops when `mcpEntry` is absent (tokf case) |
| `test_httpsGetJson_rejects_on_4xx` | Throws descriptive error on HTTP 403/404 |
| `test_httpsGetJson_max_redirects` | Throws after 5 redirects |

**Existing tests to update**: All existing calls to `mergeMcpJson(name, server)` must pass explicit `'project'` as the third argument — they currently pass by accident because `undefined` falls through to the project path.

### Integration Points

- `tokf hook install` creates `.tokf/hooks/pre-tool-use.sh` and merges a `PreToolUse` hook into `.claude/settings.json` (project) or `~/.claude/settings.json` (global). This is idempotent — safe to re-run.
- **Hook safety**: `tokf hook install` may overwrite the `PreToolUse` array rather than appending. The installer backs up existing settings before running `tokf hook install`, then merges any pre-existing `PreToolUse` entries (like `cbm-code-discovery-gate`) back in after. Merge key is the `matcher` field — entries with different matchers coexist.
- The hook intercepts all `Bash` tool calls, wraps commands with `tokf run`, and filters output before it enters Claude Code's context window.
- tokf's built-in filters cover git, cargo, npm, docker, and 20+ other tools. No custom filter config needed.

---

## Handoff

AR review completed — all Critical and Recommended findings addressed in this revision:
- F1 (macOS install dir): fixed to `~/.local/bin` everywhere
- F9 (hook overwrite risk): added backup/merge logic in `runPostInstall`
- F2 (checksum verification): added SHA256 download and verify step
- F3 (HTTP status handling): added error check + redirect depth limit
- F7 (test signatures): noted in test table

- `/breakdown PROCESS_DOCS/solutions/02-tokf-integration.md` — execution planning
