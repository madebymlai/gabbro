// Tests for bin/install.mjs
// Uses Node.js built-in test runner (node:test) and node:assert
// Run: node --test bin/install.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

// We test the pure functions by importing them from the installer.
// The installer uses process.cwd()-relative paths, so we chdir into a temp dir per test.
import {
  detectPlatform,
  detectTarget,
  mergeMcpJson,
  mergeExternalAgents,
  runPostInstall,
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

// ── mergeExternalAgents ───────────────────────────────────────────────────────

test('test_mergeExternalAgents_adds_to_mcpServers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    // Simulate .gabbro directory and external-agents.json
    const gabbro = join(dir, '.gabbro');
    mkdirSync(gabbro);
    const existing = {
      agents: {},
      mcpServers: {
        filesystem: { command: 'npx', args: ['@modelcontextprotocol/server-filesystem', '.'] },
        context7: { command: 'npx', args: ['@upstash/context7-mcp'] },
      },
    };
    writeFileSync(join(gabbro, 'external-agents.json'), JSON.stringify(existing, null, 2) + '\n');

    const externalEntry = { command: 'codebase-memory-mcp', args: ['--mcp'], toolAllowlist: ['search_code'] };
    mergeExternalAgents('codebase-memory', { externalMcpEntry: externalEntry });

    const config = JSON.parse(readFileSync(join(gabbro, 'external-agents.json'), 'utf8'));
    assert.deepEqual(config.mcpServers.filesystem, existing.mcpServers.filesystem, 'filesystem must be untouched');
    assert.deepEqual(config.mcpServers.context7, existing.mcpServers.context7, 'context7 must be untouched');
    assert.deepEqual(config.mcpServers['codebase-memory'], externalEntry, 'codebase-memory must be added');
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true });
  }
});

test('test_mergeExternalAgents_skips_missing_file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    // No .gabbro/external-agents.json exists — should not throw
    assert.doesNotThrow(() => {
      mergeExternalAgents('codebase-memory', { externalMcpEntry: { command: 'x', args: [] } });
    });
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

test('test_mergeMcpJson_global_scope', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  const fakeClaude = join(dir, '.claude');
  mkdirSync(fakeClaude);
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
