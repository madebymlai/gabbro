// Tests for bin/install.mjs
// Uses Node.js built-in test runner (node:test) and node:assert
// Run: node --test bin/install.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// We test the pure functions by importing them from the installer.
// The installer uses process.cwd()-relative paths, so we chdir into a temp dir per test.
import {
  detectPlatform,
  detectTarget,
  mergeMcpJson,
  runPostInstall,
  getPlatformPaths,
  writeEnvFile,
  writeRecipes,
  installCli,
  REGISTRY,
} from './install.mjs';

// ── detectPlatform ────────────────────────────────────────────────────────────

test('test_detectPlatform_unix_linux', () => {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  assert.equal(detectPlatform(), 'unix');
  Object.defineProperty(process, 'platform', { value: original, configurable: true });
});

test('test_detectPlatform_unix_darwin', () => {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  assert.equal(detectPlatform(), 'unix');
  Object.defineProperty(process, 'platform', { value: original, configurable: true });
});

test('test_detectPlatform_win32', () => {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  assert.equal(detectPlatform(), 'win32');
  Object.defineProperty(process, 'platform', { value: original, configurable: true });
});

// ── mergeMcpJson ─────────────────────────────────────────────────────────────

test('test_mergeMcpJson_creates_new', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    const entry = { command: 'codebase-memory-mcp', args: ['--mcp'] };
    mergeMcpJson('codebase-memory', { mcpEntry: entry }, 'project');

    const raw = readFileSync(join(dir, '.mcp.json'), 'utf8');
    const config = JSON.parse(raw);
    assert.ok(config.mcpServers, 'mcpServers key must exist');
    assert.deepEqual(config.mcpServers['codebase-memory'], entry);
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true });
  }
});

test('test_mergeMcpJson_merges_existing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    const existing = { mcpServers: { 'other-server': { command: 'foo', args: [] } } };
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify(existing, null, 2) + '\n');

    const entry = { command: 'codebase-memory-mcp', args: ['--mcp'] };
    mergeMcpJson('codebase-memory', { mcpEntry: entry }, 'project');

    const config = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    assert.deepEqual(config.mcpServers['other-server'], existing.mcpServers['other-server'], 'existing entry must be untouched');
    assert.deepEqual(config.mcpServers['codebase-memory'], entry, 'new entry must be present');
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true });
  }
});

// ── detectTarget ─────────────────────────────────────────────────────────────

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

// ── mergeMcpJson scope ────────────────────────────────────────────────────────

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

// ── runPostInstall scope ──────────────────────────────────────────────────────

test('test_runPostInstall_array_ignores_scope', () => {
  // Array postInstall should work regardless of scope — it's scope-agnostic
  const server = { postInstall: ['echo array-test'] };
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
  assert.doesNotThrow(() => runPostInstall('test', server, 'project'));
  assert.doesNotThrow(() => runPostInstall('test', server, 'global'));
});

test('test_runPostInstall_no_postInstall_noop', () => {
  assert.doesNotThrow(() => runPostInstall('test', {}, 'project'));
});

// ── Task 1: getPlatformPaths ──────────────────────────────────────────────────

test('getPlatformPaths returns XDG paths on Linux', () => {
  const origPlatform = process.platform;
  const origHome = process.env.HOME;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = '/home/test';
  try {
    const paths = getPlatformPaths();
    assert.equal(paths.dataDir, '/home/test/.local/share/gabbro');
    assert.equal(paths.configDir, '/home/test/.config/gabbro');
    assert.equal(paths.binDir, '/home/test/.local/bin');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
  }
});

test('getPlatformPaths returns LOCALAPPDATA paths on Windows', () => {
  const origPlatform = process.platform;
  const origLocalAppData = process.env.LOCALAPPDATA;
  const origAppData = process.env.APPDATA;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
  process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
  try {
    const paths = getPlatformPaths();
    assert.equal(paths.dataDir, 'C:\\Users\\test\\AppData\\Local\\gabbro');
    assert.equal(paths.configDir, 'C:\\Users\\test\\AppData\\Roaming\\gabbro');
    assert.equal(paths.binDir, 'C:\\Users\\test\\AppData\\Local\\gabbro\\bin');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.LOCALAPPDATA = origLocalAppData;
    process.env.APPDATA = origAppData;
  }
});

test('detectTarget returns win32-x64 on Windows', () => {
  const origPlatform = process.platform;
  const origArch = process.arch;
  const origLocalAppData = process.env.LOCALAPPDATA;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
  process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
  try {
    const result = detectTarget();
    assert.ok(result !== null, 'win32-x64 must be supported');
    assert.equal(result.key, 'win32-x64');
    assert.ok(result.installDir.includes('gabbro'), 'installDir must include gabbro');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    Object.defineProperty(process, 'arch', { value: origArch, configurable: true });
    process.env.LOCALAPPDATA = origLocalAppData;
  }
});

// ── Task 2: Goose REGISTRY entry ──────────────────────────────────────────────

test('goose registry entry resolves correct asset name on Linux', () => {
  const gooseEntry = REGISTRY['goose'];
  assert.ok(gooseEntry, 'goose entry must exist in REGISTRY');
  const assetName = gooseEntry.githubRelease.assetNameFn('v1.30.0', 'x86_64-unknown-linux-gnu', '.tar.gz');
  assert.equal(assetName, 'goose-x86_64-unknown-linux-gnu.tar.gz');
});

test('goose registry entry resolves Windows asset name', () => {
  const gooseEntry = REGISTRY['goose'];
  assert.ok(gooseEntry, 'goose entry must exist in REGISTRY');
  const assetName = gooseEntry.githubRelease.assetNameFn('v1.30.0', 'x86_64-pc-windows-msvc', '.zip');
  assert.equal(assetName, 'goose-x86_64-pc-windows-msvc.zip');
});

// ── Task 3: writeEnvFile ──────────────────────────────────────────────────────

test('writeEnvFile creates env file with keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    writeEnvFile([{ key: 'A', value: '1' }, { key: 'B', value: '2' }]);
    const configDir = resolve(dir, '.config', 'gabbro');
    const envPath = join(configDir, 'env');
    assert.ok(existsSync(envPath), 'env file must exist');
    const content = readFileSync(envPath, 'utf8');
    assert.ok(content.includes('A=1'), 'must contain A=1');
    assert.ok(content.includes('B=2'), 'must contain B=2');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

test('writeEnvFile merges without overwriting existing keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    const configDir = resolve(dir, '.config', 'gabbro');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'env'), 'A=old\n');

    writeEnvFile([{ key: 'A', value: 'new' }, { key: 'B', value: '2' }]);
    const content = readFileSync(join(configDir, 'env'), 'utf8');
    assert.ok(content.includes('A=old'), 'existing key A must not be overwritten');
    assert.ok(content.includes('B=2'), 'new key B must be added');
    assert.ok(!content.includes('A=new'), 'new value must not overwrite existing');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

// ── Task 4: writeRecipes and installCli ───────────────────────────────────────

test('writeRecipes creates 3 YAML files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    writeRecipes();
    const extAgents = resolve(dir, '.local', 'share', 'gabbro', 'ext-agents');
    assert.ok(existsSync(join(extAgents, 'ar-nemesis.yaml')), 'ar-nemesis.yaml must exist');
    assert.ok(existsSync(join(extAgents, 'ar-enforcer.yaml')), 'ar-enforcer.yaml must exist');
    assert.ok(existsSync(join(extAgents, 'pm-ember.yaml')), 'pm-ember.yaml must exist');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

test('writeRecipes uses trace_path not trace_call_path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    writeRecipes();
    const extAgents = resolve(dir, '.local', 'share', 'gabbro', 'ext-agents');
    const content = readFileSync(join(extAgents, 'ar-nemesis.yaml'), 'utf8');
    assert.ok(content.includes('trace_path'), 'must use trace_path');
    assert.ok(!content.includes('trace_call_path'), 'must not use trace_call_path');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

test('writeRecipes embeds prompt content with Jinja syntax', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    writeRecipes();
    const extAgents = resolve(dir, '.local', 'share', 'gabbro', 'ext-agents');
    const content = readFileSync(join(extAgents, 'ar-nemesis.yaml'), 'utf8');
    assert.ok(content.includes('{{ project_id }}'), 'must use Jinja {{ project_id }} syntax');
    assert.ok(!content.includes('{{PROJECT_ID}}'), 'must not use old {{PROJECT_ID}} syntax');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

test('pm-ember recipe has source parameter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    writeRecipes();
    const extAgents = resolve(dir, '.local', 'share', 'gabbro', 'ext-agents');
    const content = readFileSync(join(extAgents, 'pm-ember.yaml'), 'utf8');
    assert.ok(content.includes('key: source'), 'pm-ember must have source parameter');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

test('pm-ember recipe does not declare unused project_id parameter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    writeRecipes();
    const extAgents = resolve(dir, '.local', 'share', 'gabbro', 'ext-agents');
    const content = readFileSync(join(extAgents, 'pm-ember.yaml'), 'utf8');
    // pm-ember instructions do not use {{ project_id }}, so the parameter must not be declared
    assert.ok(!content.includes('key: project_id'), 'pm-ember must not declare unused project_id parameter');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

test('installCli creates symlink on Unix', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    const dataDir = resolve(dir, '.local', 'share', 'gabbro');
    const extAgents = resolve(dataDir, 'ext-agents');
    mkdirSync(extAgents, { recursive: true });
    writeFileSync(join(extAgents, 'run.mjs'), '#!/usr/bin/env node\n');

    const binDir = resolve(dir, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });

    installCli();

    assert.ok(existsSync(join(binDir, 'gabbro')), 'gabbro symlink must exist in binDir');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

// ── Task 5: mergeMcpJson global path fix, context7, trace_path ────────────────

test('mergeMcpJson global scope writes to ~/.claude.json preserving existing keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  process.env.HOME = dir;
  try {
    writeFileSync(join(dir, '.claude.json'), JSON.stringify({ numStartups: 5 }, null, 2) + '\n');

    const entry = { command: 'test', args: [] };
    mergeMcpJson('test', { mcpEntry: entry }, 'global');

    const claudeJsonPath = join(dir, '.claude.json');
    assert.ok(existsSync(claudeJsonPath), '~/.claude.json must exist');
    const config = JSON.parse(readFileSync(claudeJsonPath, 'utf8'));
    assert.equal(config.numStartups, 5, 'numStartups must be preserved');
    assert.deepEqual(config.mcpServers['test'], entry, 'new entry must be added');
  } finally {
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

test('mergeMcpJson project scope writes to .mcp.json in cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    const entry = { command: 'npx', args: ['-y', '@upstash/context7-mcp'] };
    mergeMcpJson('context7', { mcpEntry: entry }, 'project');

    const mcpPath = join(dir, '.mcp.json');
    assert.ok(existsSync(mcpPath), '.mcp.json must be created');
    const config = JSON.parse(readFileSync(mcpPath, 'utf8'));
    assert.deepEqual(config.mcpServers['context7'], entry);
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true });
  }
});

test('codebase-memory externalMcpEntry uses trace_path not trace_call_path', () => {
  const toolAllowlist = REGISTRY['codebase-memory'].externalMcpEntry.toolAllowlist;
  assert.ok(toolAllowlist.includes('trace_path'), 'must include trace_path');
  assert.ok(!toolAllowlist.includes('trace_call_path'), 'must not include trace_call_path');
});

test('context7 registry entry has mcpEntry with npx command', () => {
  const context7 = REGISTRY['context7'];
  assert.ok(context7, 'context7 must exist in REGISTRY');
  assert.equal(context7.mcpEntry.command, 'npx', 'context7 must use npx');
  assert.ok(Array.isArray(context7.mcpEntry.args), 'context7 mcpEntry must have args');
});

// ── Task (Agent 2): writeRecipes copies final run.mjs ─────────────────────────

test('writeRecipes copies run.mjs with extractReview implementation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const origHome = process.env.HOME;
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  process.env.HOME = dir;
  try {
    writeRecipes();
    const extAgents = resolve(dir, '.local', 'share', 'gabbro', 'ext-agents');
    const content = readFileSync(join(extAgents, 'run.mjs'), 'utf8');
    assert.ok(content.includes('extractReview'), 'run.mjs must contain extractReview');
    assert.ok(content.includes('recipe__final_output'), 'run.mjs must handle recipe__final_output');
    assert.ok(content.includes('computeProjectId'), 'run.mjs must contain computeProjectId');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});
