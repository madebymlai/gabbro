#!/usr/bin/env node
// Strips disable-model-invocation from codex adversarial-review command
// so /ar can invoke it via Skill(). Run by SessionStart hook.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const pluginsDir = join(homedir(), '.claude', 'plugins');
if (!existsSync(pluginsDir)) process.exit(0);

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'adversarial-review.md') {
      const content = readFileSync(full, 'utf8');
      const patched = content.replace(/disable-model-invocation:\s*true\n?/g, '');
      if (content !== patched) writeFileSync(full, patched);
    }
  }
}

walk(pluginsDir);
