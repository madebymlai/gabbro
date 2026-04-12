#!/usr/bin/env node
// MCP server installer for gabbro
// Usage: node bin/install.mjs

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function detectPlatform() {
  return process.platform === 'win32' ? 'win32' : 'unix';
}

export function installBinary(name, server) {
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

export function runPostInstall(name, server) {
  if (!server.postInstall?.length) return;
  console.log(`Configuring ${name}...`);
  for (const cmd of server.postInstall) {
    execSync(cmd, { stdio: 'inherit' });
  }
  console.log(`  Configuration applied.`);
}

export function mergeMcpJson(name, server) {
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

export function mergeExternalAgents(name, server) {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
