// Tests for bin/install.mjs
// Uses Node.js built-in test runner (node:test) and node:assert
// Run: node --test bin/install.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// We test the pure functions by importing them from the installer.
// The installer uses process.cwd()-relative paths, so we chdir into a temp dir per test.
import {
  detectPlatform,
  mergeMcpJson,
  mergeExternalAgents,
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
    mergeMcpJson('codebase-memory', { mcpEntry: entry });

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
    mergeMcpJson('codebase-memory', { mcpEntry: entry });

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
