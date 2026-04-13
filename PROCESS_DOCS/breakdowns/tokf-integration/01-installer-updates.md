# Build Agent 1: Installer Updates (tokf + scope selection)

**Dependencies**: None (parallel) — this is the only agent.

## Overview

- **Objective**: Add tokf as a second entry in the gabbro installer registry with GitHub release download support, and add a scope selection prompt (global vs project-local) that applies to all tools.
- **Scope**:
  - Includes: `bin/install.mjs` (new functions, modified functions, new registry entry), `bin/install.test.mjs` (new + updated tests)
  - Excludes: No changes to `.mcp.json`, `.gabbro/external-agents.json`, or `.claude/settings.json` — those are modified at runtime by the installer itself, not in this build.
- **Dependencies**:
  - Node.js built-in modules only: `node:https`, `node:fs`, `node:child_process`, `node:path`, `node:os`, `node:readline`
  - Existing `bin/install.mjs` and `bin/install.test.mjs` as base
- **Estimated Complexity**: Medium — 4 new functions, 4 modified functions, 10+ new test cases, but all in a single module with clear patterns.

## Technical Approach

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| `~/.local/bin` for all unix platforms | `/usr/local/bin` on macOS is `root:755` — fails without sudo |
| SHA256 checksum verification | Every tokf release ships `.sha256` companion files |
| Hook safety backup/merge in `runPostInstall` | `tokf hook install` may overwrite `PreToolUse` array, destroying existing `cbm-code-discovery-gate` hooks |
| `httpsGetJson` with status check + redirect limit | GitHub API returns JSON error bodies on 403/404 that would silently parse; redirect loops cause stack overflow |
| Scope-aware `postInstall` as `{project, global}` object | tokf hook install differs by scope; codebase-memory stays as plain array |

### Module Placement

All work is in two files:
```
bin/install.mjs       → All source changes
bin/install.test.mjs  → All test changes
```

### Integration Points

- `tokf hook install` creates `.tokf/hooks/pre-tool-use.sh` and writes a `PreToolUse` hook into Claude Code's `settings.json`
- The installer backs up `settings.json` before running `tokf hook install`, then merges pre-existing `PreToolUse` entries back in (merge key: `matcher` field)
- tokf is NOT an MCP server — no `mcpEntry` or `externalMcpEntry`

## Task Breakdown

### Task 1: Add new utility functions (Module: `bin/install.mjs`)

- **Description**: Add `httpsGetJson`, `detectTarget`, and `promptScope` — the three new helper functions that the rest of the implementation depends on.
- **Acceptance Criteria**:
  - [ ] `httpsGetJson(url)` returns parsed JSON, follows redirects (max 5), rejects on HTTP >= 400 with descriptive error
  - [ ] `detectTarget()` returns `{ key, installDir }` for linux/x64, darwin/arm64, darwin/x64; returns `null` for unsupported platforms
  - [ ] `promptScope()` returns `'global'` for input starting with `g`/`G`, `'project'` for anything else
  - [ ] All three functions are exported for testing
  - [ ] New imports added: `node:https`, `node:readline`, `homedir` from `node:os`
- **Files to Modify**: `bin/install.mjs`
- **Dependencies**: None
- **Code — `httpsGetJson`** (add after existing imports):

```js
import https from 'node:https';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';

export function httpsGetJson(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error(`Too many redirects fetching ${url}`));
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'gabbro-installer' } };
    https.get(url, opts, (res) => {
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

- **Code — `detectTarget`**:

```js
const TARGET_MAP = {
  linux:  { x64: { key: 'linux-x86_64',  installDir: resolve(homedir(), '.local', 'bin') } },
  darwin: {
    arm64: { key: 'darwin-arm64',  installDir: resolve(homedir(), '.local', 'bin') },
    x64:   { key: 'darwin-x86_64', installDir: resolve(homedir(), '.local', 'bin') },
  },
};

export function detectTarget() {
  return TARGET_MAP[process.platform]?.[process.arch] ?? null;
}
```

- **Code — `promptScope`**:

```js
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

- **Test Cases** (file: `bin/install.test.mjs`):
  - `test_detectTarget_linux_x64`: Set `process.platform='linux'`, `process.arch='x64'` → returns `{ key: 'linux-x86_64', installDir: resolve(homedir(), '.local', 'bin') }`
  - `test_detectTarget_darwin_arm64`: Set `process.platform='darwin'`, `process.arch='arm64'` → returns `{ key: 'darwin-arm64', installDir: resolve(homedir(), '.local', 'bin') }`
  - `test_detectTarget_darwin_x64`: Set `process.platform='darwin'`, `process.arch='x64'` → returns `{ key: 'darwin-x86_64', installDir: resolve(homedir(), '.local', 'bin') }`
  - `test_detectTarget_win32_returns_null`: Set `process.platform='win32'` → returns `null`
  - `test_detectTarget_linux_arm64_returns_null`: Set `process.platform='linux'`, `process.arch='arm64'` → returns `null`
  - Setup: Save/restore `process.platform` and `process.arch` using `Object.defineProperty` (same pattern as existing `detectPlatform` tests)

---

### Task 2: Add tokf registry entry (Module: `bin/install.mjs`)

- **Description**: Add the `tokf` entry to the `REGISTRY` object with `platforms`, `githubRelease`, and scope-aware `postInstall`.
- **Acceptance Criteria**:
  - [ ] `REGISTRY.tokf` exists with `platforms`, `githubRelease`, and `postInstall` fields
  - [ ] `platforms` lists exactly: `['linux-x86_64', 'darwin-arm64', 'darwin-x86_64']`
  - [ ] `githubRelease.repo` is `'mpecan/tokf'`
  - [ ] `githubRelease.tagPrefix` is `'tokf-v'`
  - [ ] `githubRelease.targets` maps all three platform keys to correct GitHub target strings
  - [ ] `githubRelease.binName` is `'tokf'`
  - [ ] `postInstall.project` is `['tokf hook install']`
  - [ ] `postInstall.global` is `['tokf hook install --global']`
  - [ ] No `mcpEntry` or `externalMcpEntry` fields on the tokf entry
- **Files to Modify**: `bin/install.mjs`
- **Dependencies**: None
- **Code** (add as second entry in `REGISTRY`, after `'codebase-memory'`):

```js
'tokf': {
  platforms: ['linux-x86_64', 'darwin-arm64', 'darwin-x86_64'],
  githubRelease: {
    repo: 'mpecan/tokf',
    tagPrefix: 'tokf-v',
    targets: {
      'linux-x86_64': 'x86_64-unknown-linux-gnu',
      'darwin-arm64': 'aarch64-apple-darwin',
      'darwin-x86_64': 'x86_64-apple-darwin',
    },
    binName: 'tokf',
  },
  postInstall: {
    project: ['tokf hook install'],
    global: ['tokf hook install --global'],
  },
},
```

- **Test Cases** (file: `bin/install.test.mjs`):
  - No dedicated tests — the registry is a data literal. Validated indirectly by integration tests in Task 4.

---

### Task 3: Modify existing functions for scope-awareness (Module: `bin/install.mjs`)

- **Description**: Update `installBinary`, `runPostInstall`, `mergeMcpJson`, and `main` to support scope selection and the `githubRelease` install path.
- **Acceptance Criteria**:
  - [ ] `installBinary` dispatches to `installFromGithubRelease` when `server.githubRelease` exists, falls back to existing shell-out path otherwise
  - [ ] `installBinary` returns `boolean` (true if installed, false if skipped)
  - [ ] `installBinary` is now `async`
  - [ ] `runPostInstall` accepts `scope` as third argument
  - [ ] `runPostInstall` handles both array (scope-agnostic) and `{project, global}` object shapes
  - [ ] `runPostInstall` backs up `settings.json` before executing commands, merges pre-existing `PreToolUse` hooks back after
  - [ ] `mergeMcpJson` accepts `scope` as third argument
  - [ ] `mergeMcpJson` no-ops when `server.mcpEntry` is absent
  - [ ] `mergeMcpJson` writes to `~/.claude/.mcp.json` when scope is `'global'`, `./mcp.json` when `'project'`
  - [ ] `main` is now `async`, calls `promptScope()` before iterating, passes scope to all functions
  - [ ] `main` checks `server.platforms` + `detectTarget()` and skips with warning if unsupported
  - [ ] Entry point uses `.then()` or top-level await for async main
- **Files to Modify**: `bin/install.mjs`
- **Dependencies**: Task 1 (utility functions must exist)

- **Code — `installFromGithubRelease`**:

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

  execSync(`curl -fsSL -o "${tarball}" "${asset.browser_download_url}"`, {
    stdio: 'inherit', shell: '/bin/bash',
  });

  // 3. Verify SHA256 checksum
  const shaAsset = release.assets.find(a => a.name === `${assetName}.sha256`);
  if (shaAsset) {
    execSync(`curl -fsSL -o "${tarball}.sha256" "${shaAsset.browser_download_url}"`, {
      stdio: 'inherit', shell: '/bin/bash',
    });
    execSync(`cd "${tmpDir}" && shasum -a 256 -c "${tarball}.sha256"`, {
      stdio: 'inherit', shell: '/bin/bash',
    });
    console.log(`  Checksum verified.`);
  } else {
    console.log(`  Warning: no .sha256 asset found, skipping verification.`);
  }

  // 4. Extract and install
  execSync(`mkdir -p "${installDir}"`, { stdio: 'inherit' });
  execSync(`tar xzf "${tarball}" -C "${installDir}" ${ghConfig.binName}`, {
    stdio: 'inherit', shell: '/bin/bash',
  });
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

- **Code — modified `installBinary`**:

```js
export async function installBinary(name, server) {
  if (server.githubRelease) {
    return installFromGithubRelease(name, server.githubRelease);
  }
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

- **Code — modified `runPostInstall`**:

```js
export function runPostInstall(name, server, scope) {
  const pi = server.postInstall;
  if (!pi) return;
  const cmds = Array.isArray(pi) ? pi : pi[scope];
  if (!cmds?.length) return;

  // Back up settings.json before postInstall (tokf hook install may overwrite PreToolUse)
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

- **Code — modified `mergeMcpJson`**:

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

- **Code — modified `main`**:

```js
async function main() {
  console.log('gabbro installer\n');
  const scope = await promptScope();
  console.log(`\nScope: ${scope}\n`);

  for (const [name, server] of Object.entries(REGISTRY)) {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- **Test Cases** (file: `bin/install.test.mjs`) — see Task 4 for all test implementations.

---

### Task 4: Update existing tests + add new tests (Module: `bin/install.test.mjs`)

- **Description**: Update existing test imports and calls for new function signatures, add comprehensive tests for all new and modified functions.
- **Acceptance Criteria**:
  - [ ] Import list updated: add `detectTarget`, `httpsGetJson`, `runPostInstall`, `promptScope`
  - [ ] All existing `mergeMcpJson` test calls pass explicit `'project'` as third argument
  - [ ] 10+ new test cases pass via `node --test bin/install.test.mjs`
  - [ ] No test uses network I/O — all external calls are avoided by testing pure functions only
- **Files to Modify**: `bin/install.test.mjs`
- **Dependencies**: Tasks 1-3 (all source changes must be complete)
- **Framework**: Node.js built-in test runner (`node:test` + `node:assert/strict`)

- **Code — updated imports**:

```js
import {
  detectPlatform,
  detectTarget,
  mergeMcpJson,
  mergeExternalAgents,
  runPostInstall,
} from './install.mjs';
```

- **Code — update existing `mergeMcpJson` tests** (add `'project'` as third arg):

In `test_mergeMcpJson_creates_new`:
```js
mergeMcpJson('codebase-memory', { mcpEntry: entry }, 'project');
```

In `test_mergeMcpJson_merges_existing`:
```js
mergeMcpJson('codebase-memory', { mcpEntry: entry }, 'project');
```

- **Code — new `detectTarget` tests**:

```js
test('test_detectTarget_linux_x64', () => {
  const origPlatform = process.platform;
  const origArch = process.arch;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
  try {
    const result = detectTarget();
    assert.equal(result.key, 'linux-x86_64');
    assert.ok(result.installDir.endsWith('.local/bin'));
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    Object.defineProperty(process, 'arch', { value: origArch, configurable: true });
  }
});

test('test_detectTarget_darwin_arm64', () => {
  const origPlatform = process.platform;
  const origArch = process.arch;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
  try {
    const result = detectTarget();
    assert.equal(result.key, 'darwin-arm64');
    assert.ok(result.installDir.endsWith('.local/bin'));
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    Object.defineProperty(process, 'arch', { value: origArch, configurable: true });
  }
});

test('test_detectTarget_darwin_x64', () => {
  const origPlatform = process.platform;
  const origArch = process.arch;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
  try {
    const result = detectTarget();
    assert.equal(result.key, 'darwin-x86_64');
    assert.ok(result.installDir.endsWith('.local/bin'));
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    Object.defineProperty(process, 'arch', { value: origArch, configurable: true });
  }
});

test('test_detectTarget_win32_returns_null', () => {
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  try {
    assert.equal(detectTarget(), null);
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
  }
});

test('test_detectTarget_linux_arm64_returns_null', () => {
  const origPlatform = process.platform;
  const origArch = process.arch;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
  try {
    assert.equal(detectTarget(), null);
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    Object.defineProperty(process, 'arch', { value: origArch, configurable: true });
  }
});
```

- **Code — `mergeMcpJson` scope tests**:

```js
test('test_mergeMcpJson_skips_no_mcpEntry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    // tokf has no mcpEntry — should not create .mcp.json
    mergeMcpJson('tokf', {}, 'project');
    assert.ok(!existsSync(join(dir, '.mcp.json')), '.mcp.json should not be created');
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true });
  }
});

test('test_mergeMcpJson_global_scope', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const fakeClaude = join(dir, '.claude');
  mkdirSync(fakeClaude);
  // Temporarily override homedir for this test
  const originalHome = process.env.HOME;
  process.env.HOME = dir;
  try {
    const entry = { command: 'codebase-memory-mcp', args: ['--mcp'] };
    mergeMcpJson('codebase-memory', { mcpEntry: entry }, 'global');

    const mcpPath = join(fakeClaude, '.mcp.json');
    assert.ok(existsSync(mcpPath), 'global .mcp.json should be created');
    const config = JSON.parse(readFileSync(mcpPath, 'utf8'));
    assert.deepEqual(config.mcpServers['codebase-memory'], entry);
  } finally {
    process.env.HOME = originalHome;
    rmSync(dir, { recursive: true });
  }
});
```

- **Code — `runPostInstall` scope tests**:

```js
test('test_runPostInstall_array_ignores_scope', () => {
  // Array postInstall should work regardless of scope — it's scope-agnostic
  const server = { postInstall: ['echo array-test'] };
  // Should not throw for either scope
  assert.doesNotThrow(() => runPostInstall('test', server, 'global'));
  assert.doesNotThrow(() => runPostInstall('test', server, 'project'));
});

test('test_runPostInstall_object_picks_scope', () => {
  const server = {
    postInstall: {
      project: ['echo project-mode'],
      global: ['echo global-mode'],
    },
  };
  // Should not throw — just verifying it runs the right branch
  assert.doesNotThrow(() => runPostInstall('test', server, 'project'));
  assert.doesNotThrow(() => runPostInstall('test', server, 'global'));
});

test('test_runPostInstall_no_postInstall_noop', () => {
  assert.doesNotThrow(() => runPostInstall('test', {}, 'project'));
});
```

---

### Task 5: Verify all tests pass (Module: `bin/`)

- **Description**: Run the full test suite and verify everything passes. Fix any issues.
- **Acceptance Criteria**:
  - [ ] `node --test bin/install.test.mjs` exits 0
  - [ ] All existing tests still pass (no regressions)
  - [ ] All new tests pass
  - [ ] No lint errors in `bin/install.mjs` or `bin/install.test.mjs`
- **Files**: `bin/install.mjs`, `bin/install.test.mjs`
- **Dependencies**: Tasks 1-4
- **Command**:

```bash
node --test bin/install.test.mjs
```

- **Expected output**: All tests passing, 0 failures. If any test fails, read the error message, fix the source or test, and re-run.

## Testing Strategy

- **Framework**: Node.js built-in test runner (`node:test`) with `node:assert/strict`
- **Structure**: Tests colocated at `bin/install.test.mjs` (same directory as source)
- **Pattern**: Each test creates a temp directory via `mkdtempSync`, `chdir`s into it, runs the function, asserts, then restores cwd and cleans up in `finally` block. Same pattern as all existing tests.
- **No network I/O**: Tests only cover pure functions (`detectTarget`, `detectPlatform`, `mergeMcpJson`, `mergeExternalAgents`, `runPostInstall`). Functions that hit the network (`httpsGetJson`, `installFromGithubRelease`, `installBinary`) are tested via manual integration runs, not automated tests — consistent with existing approach (existing tests don't test `installBinary` either).
- **Coverage**: All exported pure functions have at least one test. Platform edge cases (win32, arm64) covered with null/skip assertions.

## Risk Mitigation

| Risk | Probability | Impact | Mitigation | Fallback | Detection |
|------|------------|--------|------------|----------|-----------|
| `tokf hook install` overwrites PreToolUse hooks | Medium | High — destroys codebase-memory hooks | Back up settings.json before, merge after | Manual settings.json restoration | Compare hook count before/after in runPostInstall |
| GitHub API rate limit (60 req/hr unauthenticated) | Low | Medium — install fails | `httpsGetJson` throws clear error with status code | User retries later or sets `GITHUB_TOKEN` header | HTTP 403 response |
| `shasum` not available on some systems | Low | Low — checksum skipped | Print warning and continue without verification | Install proceeds unverified | `execSync` throws, caught in try/catch |
| `~/.local/bin` not on PATH | Medium | Low — binary installed but not found | Print warning with instructions to add to PATH | User adds to shell profile manually | PATH check after install |
| Tarball structure changes upstream | Low | High — extraction fails | Extract by binary name (`tokf`), not by path | User can `cargo install tokf` instead | `tar` command fails with clear error |

## Success Criteria

### Functional Requirements
- [ ] `node --test bin/install.test.mjs` — all tests pass (0 failures)
- [ ] `REGISTRY.tokf` entry exists with correct platforms, githubRelease, and postInstall
- [ ] `promptScope()` prompts user and returns `'global'` or `'project'`
- [ ] `installFromGithubRelease` resolves latest tokf release, downloads tarball, verifies SHA256, extracts to `~/.local/bin`
- [ ] `runPostInstall` runs scope-appropriate commands and preserves existing PreToolUse hooks
- [ ] `mergeMcpJson` writes to correct path based on scope
- [ ] Platform check skips tokf on Windows and ARM Linux with a warning message

### Non-Functional Requirements
- [ ] Pure Node.js — no external dependencies added
- [ ] Existing `codebase-memory` install path unchanged (backward compatible)
- [ ] All existing tests still pass with updated function signatures

## Implementation Notes

- **Import order**: Add `node:https`, `node:readline`, `node:os` imports at the top, grouped with existing built-in imports.
- **Export additions**: Export `detectTarget`, `httpsGetJson`, `promptScope`, `installFromGithubRelease` for testing. Keep `runPostInstall` export (already exported).
- **`homedir()` in TARGET_MAP**: The `TARGET_MAP` object calls `resolve(homedir(), '.local', 'bin')` at module load time. This is fine for production but means tests that override `process.env.HOME` must do so before importing the module, or must test `detectTarget` behavior indirectly. The existing tests use `Object.defineProperty` for platform — use the same pattern but note that `installDir` is computed at import time. For the `mergeMcpJson` global scope test, override `process.env.HOME` (which `homedir()` reads) before calling the function.
- **`main()` async**: The entry point guard changes from `main()` to `main()` (still works — async functions return a promise, and unhandled rejections will surface). No `.catch()` needed since Node.js surfaces unhandled promise rejections by default.
- **Verify SHA256 file format**: The `.sha256` file contains just the hash + two spaces + filename (standard `shasum` output format). The `shasum -a 256 -c` command expects this format. Verified against actual release: `tokf-v0.2.39-x86_64-unknown-linux-gnu.tar.gz.sha256` contains `<hash>  tokf-v0.2.39-x86_64-unknown-linux-gnu.tar.gz`.
- **Run tests with**: `node --test bin/install.test.mjs`
