// Tests for bin/run.mjs
// Uses Node.js built-in test runner (node:test) and node:assert
// Run: node --test bin/run.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { computeProjectId, loadEnv, extractReview, buildGooseArgs } from './run.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const runMjs = resolve(__dir, 'run.mjs');

// ── computeProjectId ──────────────────────────────────────────────────────────

test('computeProjectId replaces slashes with dashes', () => {
  assert.equal(computeProjectId('/home/user/project'), 'home-user-project');
});

test('computeProjectId collapses multiple dashes', () => {
  assert.equal(computeProjectId('/home/user//project'), 'home-user-project');
});

test('computeProjectId strips leading and trailing dashes', () => {
  assert.equal(computeProjectId('/project/'), 'project');
});

test('computeProjectId replaces colons with dashes', () => {
  assert.equal(computeProjectId('C:/Users/test/project'), 'C-Users-test-project');
});

test('computeProjectId returns root for slash-only path', () => {
  assert.equal(computeProjectId('/'), 'root');
});

// ── loadEnv ───────────────────────────────────────────────────────────────────

test('loadEnv parses KEY=VALUE pairs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  try {
    writeFileSync(join(dir, 'env'), 'FOO=bar\nBAZ=qux\n');
    const env = loadEnv(join(dir, 'env'), {});
    assert.equal(env.FOO, 'bar');
    assert.equal(env.BAZ, 'qux');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadEnv strips double-quoted values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  try {
    writeFileSync(join(dir, 'env'), 'FOO="bar"\n');
    const env = loadEnv(join(dir, 'env'), {});
    assert.equal(env.FOO, 'bar');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadEnv strips single-quoted values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  try {
    writeFileSync(join(dir, 'env'), "BAZ='qux'\n");
    const env = loadEnv(join(dir, 'env'), {});
    assert.equal(env.BAZ, 'qux');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadEnv does not overwrite existing env vars', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  try {
    writeFileSync(join(dir, 'env'), 'FOO=new\n');
    const env = loadEnv(join(dir, 'env'), { FOO: 'existing' });
    assert.equal(env.FOO, 'existing');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadEnv skips comment lines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  try {
    writeFileSync(join(dir, 'env'), '# comment\nFOO=bar\n');
    const env = loadEnv(join(dir, 'env'), {});
    assert.ok(!env['# comment'], 'comment line must not be parsed as a key');
    assert.equal(env.FOO, 'bar');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadEnv skips blank lines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  try {
    writeFileSync(join(dir, 'env'), '\n\nFOO=bar\n');
    const env = loadEnv(join(dir, 'env'), {});
    assert.equal(Object.keys(env).length, 1);
    assert.equal(env.FOO, 'bar');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadEnv returns copy of base env if file does not exist', () => {
  const env = loadEnv('/nonexistent/path/env', { EXISTING: 'value' });
  assert.equal(env.EXISTING, 'value');
});

// ── extractReview ─────────────────────────────────────────────────────────────

test('extractReview returns review from recipe__final_output tool call', () => {
  const json = JSON.stringify({
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
      {
        role: 'assistant',
        content: [{
          type: 'toolRequest',
          id: 'tool-1',
          toolCall: {
            status: 'success',
            value: {
              name: 'recipe__final_output',
              arguments: { review: 'This is the review text.' },
            },
          },
        }],
      },
    ],
    metadata: { status: 'completed' },
  });
  assert.equal(extractReview(json), 'This is the review text.');
});

test('extractReview works when tool call is alongside text content', () => {
  const json = JSON.stringify({
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Some reasoning...' },
          {
            type: 'toolRequest',
            id: 'tool-2',
            toolCall: {
              status: 'success',
              value: {
                name: 'recipe__final_output',
                arguments: { review: 'Final review.' },
              },
            },
          },
        ],
      },
    ],
    metadata: { status: 'completed' },
  });
  assert.equal(extractReview(json), 'Final review.');
});

test('extractReview throws if no recipe__final_output found', () => {
  const json = JSON.stringify({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'prompt' }] }],
    metadata: { status: 'completed' },
  });
  assert.throws(() => extractReview(json), /no final output/i);
});

// ── buildGooseArgs ────────────────────────────────────────────────────────────

test('buildGooseArgs does not include --no-profile', () => {
  const args = buildGooseArgs('/tmp/recipe.yaml', 'target.md', 'my-project', []);
  assert.ok(!args.includes('--no-profile'), '--no-profile must not be in args (it prevents recipe extensions from loading)');
});

test('buildGooseArgs includes required flags', () => {
  const args = buildGooseArgs('/tmp/recipe.yaml', 'target.md', 'my-project', []);
  assert.ok(args.includes('--no-session'), 'must include --no-session');
  assert.ok(args.includes('--quiet'), 'must include --quiet');
  assert.ok(args.includes('json'), 'must include json output format');
  assert.ok(args.includes('/tmp/recipe.yaml'), 'must include recipe path');
  assert.ok(args.some(a => a.includes('target=target.md')), 'must include target param');
  assert.ok(args.some(a => a.includes('project_id=my-project')), 'must include project_id param');
});

test('buildGooseArgs includes extra params', () => {
  const args = buildGooseArgs('/tmp/recipe.yaml', 'target.md', 'proj', ['source=source.md']);
  assert.ok(args.some(a => a.includes('source=source.md')), 'must include extra param');
});

// ── CLI error cases (subprocess) ──────────────────────────────────────────────

test('CLI exits 1 with usage when no positional args given', () => {
  const r = spawnSync('node', [runMjs, 'run'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage:/);
});

test('CLI exits 1 with usage when only agent given', () => {
  const r = spawnSync('node', [runMjs, 'run', 'ar-nemesis'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage:/);
});

test('CLI exits 1 with unknown agent message for nonexistent agent', () => {
  const r = spawnSync('node', [runMjs, 'run', 'nonexistent_agent_xyz', 'target.txt'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown agent/);
});

test('CLI works when invoked via symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gabbro-test-'));
  try {
    const linkPath = join(dir, 'gabbro');
    symlinkSync(runMjs, linkPath);
    const r = spawnSync('node', [linkPath, 'run'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage:/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
