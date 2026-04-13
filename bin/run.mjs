#!/usr/bin/env node
// gabbro CLI wrapper — invokes Goose with a recipe and extracts review output
//
// Feasibility findings (verified 2026-04-13 against Goose v1.30.0):
//   --output-format json  EXISTS (flag is --output-format, values: text|json|stream-json)
//   --no-session          EXISTS
//   --quiet               EXISTS — suppresses ASCII art header, produces clean JSON on stdout
//   JSON schema:          messages[].content[].toolCall.value.name === "recipe__final_output"
//                         → arguments.review contains the final text
//
// Usage: gabbro run <agent> <target> [-o output] [-p key=value ...]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const isWin = process.platform === 'win32';
const dataDir = isWin
  ? join(process.env.LOCALAPPDATA, 'gabbro', 'ext-agents')
  : join(homedir(), '.local', 'share', 'gabbro', 'ext-agents');
const configDir = isWin
  ? join(process.env.APPDATA, 'gabbro')
  : join(homedir(), '.config', 'gabbro');
const binDir = isWin
  ? join(process.env.LOCALAPPDATA, 'gabbro', 'bin')
  : join(homedir(), '.local', 'bin');
const gooseBin = join(binDir, isWin ? 'goose.exe' : 'goose');

export function computeProjectId(cwd) {
  const id = cwd
    .replace(/[/:]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return id || 'root';
}

export function loadEnv(envPath, baseEnv) {
  const env = { ...baseEnv };
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!env[key]) env[key] = val;
  }
  return env;
}

export function buildGooseArgs(recipePath, target, projectId, extraParams) {
  const args = [
    'run',
    '--recipe', recipePath,
    '--no-session',
    '--quiet',
    '--output-format', 'json',
    '--params', `target=${target}`,
    '--params', `project_id=${projectId}`,
  ];
  for (const p of extraParams) {
    args.push('--params', p);
  }
  return args;
}

export function extractReview(jsonStr) {
  const output = JSON.parse(jsonStr);
  for (const msg of output.messages) {
    for (const item of msg.content ?? []) {
      if (item.type === 'toolRequest' &&
          item.toolCall?.value?.name === 'recipe__final_output') {
        return item.toolCall.value.arguments.review;
      }
    }
  }
  throw new Error('No final output: recipe__final_output tool call not found in Goose output');
}

const _thisFile = fileURLToPath(import.meta.url);
const _calledAs = (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })();
if (_calledAs === _thisFile) {
  const { values: flags, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: { type: 'string', short: 'o' },
      param:  { type: 'string', short: 'p', multiple: true },
    },
    allowPositionals: true,
  });

  const [command, agentName, ...targetParts] = positionals;
  if (command !== 'run' || !agentName || !targetParts.length) {
    process.stderr.write('Usage: gabbro run <agent> <target> [-o output] [-p key=value ...]\n');
    process.exit(1);
  }

  const target = targetParts.join(' ');
  const recipePath = join(dataDir, `${agentName}.yaml`);
  if (!existsSync(recipePath)) {
    process.stderr.write(`Unknown agent: ${agentName}\nAvailable agents: check ${dataDir}\n`);
    process.exit(1);
  }
  if (!existsSync(gooseBin)) {
    process.stderr.write(`goose not found at ${gooseBin}\nRun: node bin/install.mjs\n`);
    process.exit(1);
  }

  const projectId = computeProjectId(process.cwd());
  const env = loadEnv(join(configDir, 'env'), process.env);

  const args = buildGooseArgs(recipePath, target, projectId, flags.param ?? []);

  const result = execFileSync(gooseBin, args, {
    env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 600_000,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const finalText = extractReview(result);

  if (flags.output) {
    writeFileSync(flags.output, finalText);
    process.stderr.write(`Wrote ${flags.output}\n`);
  } else {
    process.stdout.write(finalText);
  }
}
