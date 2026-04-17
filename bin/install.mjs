#!/usr/bin/env node
// MCP server installer for gabbro
// Usage: node bin/install.mjs

import https from 'node:https';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));

export function copyDirMerge(src, dest, { overwrite = false } = {}) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = resolve(src, entry.name);
    const destPath = resolve(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath, { overwrite });
    } else if (overwrite || !existsSync(destPath)) {
      copyFileSync(srcPath, destPath);
    }
  }
}

export function getInstalledVersion(binName) {
  try {
    const output = execSync(`${binName} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

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

export function getPlatformPaths() {
  const isWin = process.platform === 'win32';
  if (isWin) {
    return {
      dataDir: win32.join(process.env.LOCALAPPDATA, 'gabbro'),
      configDir: win32.join(process.env.APPDATA, 'gabbro'),
      binDir: win32.join(process.env.LOCALAPPDATA, 'gabbro', 'bin'),
    };
  }
  return {
    dataDir: resolve(homedir(), '.local', 'share', 'gabbro'),
    configDir: resolve(homedir(), '.config', 'gabbro'),
    binDir: resolve(homedir(), '.local', 'bin'),
  };
}

const TARGET_MAP = {
  linux:  { x64: { key: 'linux-x86_64' } },
  darwin: {
    arm64: { key: 'darwin-arm64' },
    x64:   { key: 'darwin-x86_64' },
  },
  win32: {
    x64: { key: 'win32-x64' },
  },
};

export function detectTarget() {
  const entry = TARGET_MAP[process.platform]?.[process.arch];
  if (!entry) return null;
  const { binDir } = getPlatformPaths();
  return { ...entry, installDir: binDir };
}

export const REGISTRY = {
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
    postInstall: ['tokf hook install --global', 'tokf skill install'],
  },
  'codebase-memory': {
    binName: 'codebase-memory-mcp',
    latestVersionRepo: 'DeusData/codebase-memory-mcp',
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
  },
  'goose': {
    githubRelease: {
      repo: 'block/goose',
      tagPrefix: 'v',
      targets: {
        'linux-x86_64': 'x86_64-unknown-linux-gnu',
        'linux-aarch64': 'aarch64-unknown-linux-gnu',
        'darwin-arm64': 'aarch64-apple-darwin',
        'darwin-x86_64': 'x86_64-apple-darwin',
        'win32-x64': 'x86_64-pc-windows-msvc',
      },
      binName: process.platform === 'win32' ? 'goose.exe' : 'goose',
      assetNameFn: (tag, target, ext) => `goose-${target}${ext}`,
    },
  },
  'context7': {
    mcpEntry: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: {
        CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}',
      },
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

  // Version check — skip if already up to date
  const latestVersion = tag.replace(ghConfig.tagPrefix, '');
  const bin = typeof ghConfig.binName === 'string'
    ? ghConfig.binName
    : (process.platform === 'win32' ? ghConfig.binName.win32 : ghConfig.binName.unix);
  const installed = getInstalledVersion(bin);
  if (installed && installed === latestVersion) {
    console.log(`  ${name} ${installed} is up to date`);
    return true;
  }

  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  const assetName = ghConfig.assetNameFn
    ? ghConfig.assetNameFn(tag, ghTarget, ext)
    : `${tag}-${ghTarget}${ext}`;
  const asset = release.assets.find(a => a.name === assetName);
  if (!asset) throw new Error(`Asset "${assetName}" not found in release ${tag}`);

  // 2. Download to temp dir
  const installDir = target.installDir;
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'gabbro-install-'));
  const tarball = resolve(tmpDir, assetName);

  execSync(`curl -fsSL -o "${tarball}" "${asset.browser_download_url}"`, {
    stdio: 'inherit', shell: '/bin/bash',
  });

  // 3. Verify SHA256 checksum
  const shaAsset = release.assets.find(a => a.name === `${assetName}.sha256`);
  if (shaAsset) {
    execSync(`curl -fsSL -o "${tarball}.sha256" "${shaAsset.browser_download_url}"`, {
      stdio: 'inherit', shell: '/bin/bash',
    });
    const shaRaw = readFileSync(`${tarball}.sha256`, 'utf8').trim();
    const shaLine = shaRaw.includes('  ') ? shaRaw : `${shaRaw}  ${assetName}`;
    writeFileSync(`${tarball}.sha256`, shaLine + '\n');
    execSync(`cd "${tmpDir}" && shasum -a 256 -c "${tarball}.sha256"`, {
      stdio: 'inherit', shell: '/bin/bash',
    });
    console.log(`  Checksum verified.`);
  } else {
    console.log(`  Warning: no .sha256 asset found, skipping verification.`);
  }

  // 4. Extract and install
  mkdirSync(installDir, { recursive: true });
  if (assetName.endsWith('.zip')) {
    execSync(
      `powershell -Command "Expand-Archive -Path '${tarball}' -DestinationPath '${tmpDir}' -Force"`,
      { stdio: 'inherit', shell: 'powershell.exe' },
    );
    const binSrc = resolve(tmpDir, ghConfig.binName);
    execSync(`copy "${binSrc}" "${resolve(installDir, ghConfig.binName)}"`, {
      stdio: 'inherit', shell: 'cmd.exe',
    });
  } else {
    execSync(`tar xzf "${tarball}" -C "${installDir}" "./${ghConfig.binName}" 2>/dev/null || tar xzf "${tarball}" -C "${installDir}" ${ghConfig.binName}`, {
      stdio: 'inherit', shell: '/bin/bash',
    });
    execSync(`chmod +x "${installDir}/${ghConfig.binName}"`);
  }
  rmSync(tmpDir, { recursive: true });

  // 5. Warn if install dir not on PATH
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const pathDirs = (process.env.PATH || '').split(pathSep);
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
  // Version check for script-installed binaries
  if (server.binName && server.latestVersionRepo) {
    const installed = getInstalledVersion(server.binName);
    if (installed) {
      const releases = await httpsGetJson(
        `https://api.github.com/repos/${server.latestVersionRepo}/releases/latest`
      );
      const latest = releases.tag_name.replace(/^v/, '');
      if (installed === latest) {
        console.log(`\n  ${name} ${installed} is up to date`);
        return true;
      }
    }
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

export function runPostInstall(name, server) {
  const pi = server.postInstall;
  if (!pi) return;
  const cmds = Array.isArray(pi) ? pi : null;
  if (!cmds?.length) return;

  // Back up settings.json before postInstall (tokf hook install --global may overwrite PreToolUse)
  const settingsPath = resolve(homedir(), '.claude', 'settings.json');
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

export function mergeMcpJson(name, server, envOverrides = {}) {
  if (!server.mcpEntry) return;
  const mcpPath = resolve(homedir(), '.claude.json');
  let config = {};
  if (existsSync(mcpPath)) {
    config = JSON.parse(readFileSync(mcpPath, 'utf8'));
  }
  config.mcpServers ??= {};
  if (config.mcpServers[name]) {
    console.log(`  ${mcpPath}: "${name}" already configured`);
    return;
  }
  const entry = JSON.parse(JSON.stringify(server.mcpEntry));
  if (entry.env) {
    for (const k of Object.keys(entry.env)) {
      const v = entry.env[k];
      const m = typeof v === 'string' && v.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
      if (m) {
        const resolved = envOverrides[m[1]] ?? process.env[m[1]];
        if (resolved) entry.env[k] = resolved;
      }
    }
  }
  config.mcpServers[name] = entry;
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ${mcpPath}: added "${name}"`);
}

export function promptApiKey(name, envVar) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${name} API key (or press Enter to skip): `, (answer) => {
      rl.close();
      const val = answer.trim();
      if (!val) {
        const { configDir } = getPlatformPaths();
        console.log(`  Skipped. Set ${envVar} later in ${resolve(configDir, 'env')}`);
        done(null);
      } else {
        done({ key: envVar, value: val });
      }
    });
  });
}

export function readEnvFile() {
  const { configDir } = getPlatformPaths();
  const envPath = resolve(configDir, 'env');
  const existing = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq !== -1) existing[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return existing;
}

export function writeEnvFile(keys) {
  const { configDir } = getPlatformPaths();
  const envPath = resolve(configDir, 'env');
  mkdirSync(configDir, { recursive: true });

  let existing = readEnvFile();

  for (const { key, value } of keys) {
    if (!existing[key]) existing[key] = value;
  }

  const content = Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  writeFileSync(envPath, content);
  console.log(`  API keys written to ${envPath}`);
}

export function ensureUserSettings(patch) {
  const settingsPath = resolve(homedir(), '.claude', 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  }
  const added = [];
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      settings[key] ??= {};
      for (const [k, v] of Object.entries(value)) {
        if (settings[key][k] === undefined) {
          settings[key][k] = v;
          added.push(`${key}.${k}`);
        }
      }
    } else if (settings[key] === undefined) {
      settings[key] = value;
      added.push(key);
    }
  }
  if (!added.length) return;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  Set ${added.join(', ')} in ${settingsPath}`);
}


export function ensureGitignore() {
  const gitignorePath = resolve('.gitignore');
  let content = '';
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf8');
  }
  const entries = ['.gabbro/', '.tokf/'];
  const missing = entries.filter(e => !content.includes(e));
  if (!missing.length) return;
  const block = missing.join('\n') + '\n';
  const prefix = content === '' || content.endsWith('\n') ? '' : '\n';
  writeFileSync(gitignorePath, content + prefix + block);
  console.log(`  Added ${missing.join(', ')} to .gitignore`);
}

export function copyPrinciples() {
  const srcPath = resolve(__dir, '..', 'resources', 'templates', 'principles_template.yaml');
  const destPath = resolve('.gabbro', 'principles.yaml');
  if (existsSync(destPath)) {
    console.log(`  .gabbro/principles.yaml already exists, skipping`);
    return;
  }
  mkdirSync(resolve('.gabbro'), { recursive: true });
  copyFileSync(srcPath, destPath);
  console.log(`  Copied principles template to .gabbro/principles.yaml`);
}

export function installResources() {
  const srcDir = resolve(__dir, '..', 'resources');
  const destDir = resolve('.claude', 'resources');
  copyDirMerge(srcDir, destDir, { overwrite: true });
  console.log(`  Resources installed to ${destDir}`);
}

export function installSkills() {
  const srcDir = resolve(__dir, '..', 'skills');
  const destDir = resolve('.claude', 'skills');
  copyDirMerge(srcDir, destDir, { overwrite: true });
  console.log(`  Skills installed to ${destDir}`);
}

export function installAgents() {
  const srcDir = resolve(__dir, '..', 'agents');
  const destDir = resolve('.claude', 'agents');
  copyDirMerge(srcDir, destDir, { overwrite: true });
  console.log(`  Agents installed to ${destDir}`);
}

const EXTENSIONS_BLOCK = `extensions:
  - type: builtin
    name: developer
    timeout: 300
    bundled: true
  - type: stdio
    name: codebase-memory
    cmd: codebase-memory-mcp
    args:
      - "--mcp"
    timeout: 300
    available_tools:
      - index_repository
      - index_status
      - list_projects
      - search_graph
      - search_code
      - get_code_snippet
      - trace_path
      - detect_changes
      - query_graph
      - get_graph_schema
      - get_architecture
`;

function buildRecipe({ title, description, model, parameters, instructions, prompt }) {
  const paramsYaml = parameters.map(p => [
    `  - key: ${p.key}`,
    `    input_type: string`,
    `    requirement: required`,
    `    description: "${p.description}"`,
  ].join('\n')).join('\n');

  const instructionsIndented = instructions.split('\n').map(l => `  ${l}`).join('\n');
  const promptIndented = prompt.split('\n').map(l => `  ${l}`).join('\n');

  return [
    `version: 1.0.0`,
    `title: "${title}"`,
    `description: "${description}"`,
    ``,
    `settings:`,
    `  goose_provider: "openrouter"`,
    `  goose_model: "${model}"`,
    ``,
    `parameters:`,
    paramsYaml,
    ``,
    `instructions: |`,
    instructionsIndented,
    ``,
    `prompt: |`,
    promptIndented,
    ``,
    `response:`,
    `  json_schema:`,
    `    type: object`,
    `    properties:`,
    `      review:`,
    `        type: string`,
    `        description: "The full review text in markdown"`,
    `    required: ["review"]`,
    ``,
    EXTENSIONS_BLOCK,
  ].join('\n');
}

// ─── CODEX VERSION PIN — REMOVE WHEN UPSTREAM FIXES #16911 ──────────────────
// Codex 0.117.0+ auto-rejects MCP tool calls in AppServer mode regardless of
// approvalPolicy / config.toml settings. 0.116.0 is the last working version.
// To unpin: delete this block and revert installCodex() to plain
//   `npm install -g @openai/codex` (no version).
// Track: https://github.com/openai/codex/issues/16911
const CODEX_PIN = { version: '0.116.0', reason: 'AppServer MCP works' };
// ────────────────────────────────────────────────────────────────────────────

export async function installCodex() {
  console.log('\nInstalling Codex...');

  const installed = getInstalledVersion('codex');
  const target = CODEX_PIN ? `@${CODEX_PIN.version}` : '';
  const want = CODEX_PIN?.version;
  if (installed && (!want || installed === want)) {
    console.log(`  Codex CLI ${installed} already installed`);
  } else {
    if (installed && want) {
      console.log(`  Codex CLI ${installed} present; pinning to ${want} (${CODEX_PIN.reason})`);
    } else if (want) {
      console.log(`  Installing Codex CLI ${want} (pinned: ${CODEX_PIN.reason})`);
    } else {
      console.log('  Installing Codex CLI via npm...');
    }
    execSync(`npm install -g @openai/codex${target}`, { stdio: 'inherit' });
    console.log('  Codex CLI installed');
  }

  // Check if already logged in before prompting
  try {
    const status = execSync('codex login status', { encoding: 'utf8', timeout: 10000 }).trim();
    console.log(`  Codex: ${status}`);
  } catch {
    console.log('\n  Authenticating Codex (device code flow)...');
    try {
      execSync('codex login --device-auth', { stdio: 'inherit' });
      console.log('  Codex: authenticated');
    } catch {
      console.log('  Codex login failed or was skipped. Run `codex login` manually.');
    }
  }
}


export function writeRecipes() {
  const { dataDir } = getPlatformPaths();
  const binStage = resolve(dataDir, 'bin');
  const libStage = resolve(dataDir, 'lib');
  const extAgents = resolve(dataDir, 'ext-agents');
  mkdirSync(binStage, { recursive: true });
  mkdirSync(extAgents, { recursive: true });

  const promptsDir = resolve(__dir, '..', 'resources', 'prompts');

  const readPrompt = (file) =>
    readFileSync(resolve(promptsDir, file), 'utf8')
      .replaceAll('{{PROJECT_ID}}', '{{ project_id }}');

  const pmEmberParams = [
    { key: 'source', description: 'Path to source-of-truth document' },
    { key: 'target', description: 'Path to target file or directory to validate' },
  ];

  const pmEmber = buildRecipe({
    title: 'pm-ember — Pattern Match Validation',
    description: 'Pattern matching validator: extracts claims from source and verifies in target',
    model: 'google/gemma-4-31b-it',
    parameters: pmEmberParams,
    instructions: readPrompt('pattern-match.md'),
    prompt: 'Source of truth: {{ source }}\nTarget: {{ target }}',
  });

  writeFileSync(resolve(extAgents, 'pm-ember.yaml'), pmEmber);

  const stageExecutable = (srcName, destName = srcName) => {
    const src = readFileSync(resolve(__dir, srcName), 'utf8');
    const destPath = resolve(binStage, destName);
    writeFileSync(destPath, src);
    if (process.platform !== 'win32') execSync(`chmod +x "${destPath}"`);
  };
  stageExecutable('run.mjs');
  stageExecutable('codex-companion.mjs');

  copyDirMerge(resolve(__dir, '..', 'lib'), libStage, { overwrite: true });

  copyFileSync(resolve(__dir, '..', 'package.json'), resolve(dataDir, 'package.json'));

  console.log(`  Runtime staged to ${dataDir} (bin/, lib/, ext-agents/)`);
}

export function installCli() {
  const { dataDir, binDir } = getPlatformPaths();
  const runMjsPath = resolve(dataDir, 'bin', 'run.mjs');
  const isWin = process.platform === 'win32';

  mkdirSync(binDir, { recursive: true });

  if (isWin) {
    const shimPath = resolve(binDir, 'gabbro.cmd');
    writeFileSync(shimPath, `@node "${runMjsPath}" %*\r\n`);
  } else {
    const linkPath = resolve(binDir, 'gabbro');
    execSync(`ln -sf "${runMjsPath}" "${linkPath}"`);
    execSync(`chmod +x "${runMjsPath}"`);
  }
  console.log(`  gabbro CLI installed to ${binDir}`);
}

async function main() {
  console.log('gabbro installer\n');

  // Binaries (version-checked)
  for (const [name, server] of Object.entries(REGISTRY)) {
    if (name === 'context7') continue; // npx-only, no binary
    if (server.platforms) {
      const target = detectTarget();
      if (!target || !server.platforms.includes(target.key)) {
        console.log(`Skipping ${name}: not supported on ${process.platform}/${process.arch}`);
        continue;
      }
    }
    const installed = await installBinary(name, server);
    if (!installed) continue;
    runPostInstall(name, server);
    mergeMcpJson(name, server);
    console.log(`\n${name}: done`);
  }

  // Codex CLI + plugin
  await installCodex();

  // API keys — skip prompt if already in environment or saved in gabbro env file
  console.log('\nAPI Keys\n');
  const savedEnv = readEnvFile();
  const keys = [];
  const resolveKey = async (label, envVar) => {
    if (process.env[envVar]) {
      console.log(`  ${label}: found in environment`);
      return;
    }
    if (savedEnv[envVar]) {
      console.log(`  ${label}: found in ${resolve(getPlatformPaths().configDir, 'env')}`);
      process.env[envVar] = savedEnv[envVar];
      return;
    }
    const k = await promptApiKey(label, envVar);
    if (k) {
      keys.push(k);
      process.env[envVar] = k.value;
    }
  };
  await resolveKey('OpenRouter', 'OPENROUTER_API_KEY');
  await resolveKey('Context7', 'CONTEXT7_API_KEY');
  if (keys.length) writeEnvFile(keys);

  // Skills, agents, resources (overwrite)
  console.log('\nInstalling skills, agents, resources...');
  installSkills();
  installAgents();
  installResources();

  // Goose recipes + CLI
  console.log('\nWriting recipes and CLI...');
  writeRecipes();
  installCli();

  // MCP config — resolve ${VAR} placeholders with freshly-collected keys
  // so Context7 works without requiring users to source gabbro's env file.
  const envOverrides = Object.fromEntries(keys.map(({ key, value }) => [key, value]));
  mergeMcpJson('context7', REGISTRY['context7'], envOverrides);

  // User-scope settings
  ensureUserSettings({
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
    permissions: { defaultMode: 'bypassPermissions' },
  });

  // Project setup
  copyPrinciples();
  ensureGitignore();

  console.log('\nDone.');
}

// Run main when executed directly. Skip when imported by another module (e.g. tests).
// In ESM, compare realpath of argv[1] with realpath of this file to handle
// symlinks and npx cache paths.
import { realpathSync } from 'node:fs';

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
