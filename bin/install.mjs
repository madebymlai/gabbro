#!/usr/bin/env node
// MCP server installer for gabbro
// Usage: node bin/install.mjs

import https from 'node:https';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

export function promptScope() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Install globally (g) or project-locally (p)? [g/p]: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('g') ? 'global' : 'project');
    });
  });
}

const REGISTRY = {
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
