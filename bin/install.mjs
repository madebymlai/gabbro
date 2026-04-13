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
    postInstall: ['tokf hook install --global'],
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
        'trace_path',
        'detect_changes',
        'query_graph',
        'get_graph_schema',
        'get_architecture',
      ],
    },
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

export function mergeMcpJson(name, server) {
  if (!server.mcpEntry) return;
  const mcpPath = resolve(homedir(), '.claude.json');
  let config = {};
  if (existsSync(mcpPath)) {
    config = JSON.parse(readFileSync(mcpPath, 'utf8'));
  }
  config.mcpServers ??= {};
  config.mcpServers[name] = server.mcpEntry;
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

export function writeEnvFile(keys) {
  const { configDir } = getPlatformPaths();
  const envPath = resolve(configDir, 'env');
  mkdirSync(configDir, { recursive: true });

  let existing = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq !== -1) existing[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }

  for (const { key, value } of keys) {
    if (!existing[key]) existing[key] = value;
  }

  const content = Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  writeFileSync(envPath, content);
  console.log(`  API keys written to ${envPath}`);
}

export function copyPrinciples() {
  const srcPath = resolve(__dir, '..', 'resources', 'templates', 'principles_template.md');
  const destPath = resolve('.gabbro', 'principles.md');
  if (existsSync(destPath)) {
    console.log(`  .gabbro/principles.md already exists, skipping`);
    return;
  }
  mkdirSync(resolve('.gabbro'), { recursive: true });
  copyFileSync(srcPath, destPath);
  console.log(`  Copied principles template to .gabbro/principles.md`);
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

export function writeRecipes() {
  const { dataDir } = getPlatformPaths();
  const extAgents = resolve(dataDir, 'ext-agents');
  mkdirSync(extAgents, { recursive: true });

  const promptsDir = resolve(__dir, '..', 'resources', 'prompts');

  const readPrompt = (file) =>
    readFileSync(resolve(promptsDir, file), 'utf8')
      .replaceAll('{{PROJECT_ID}}', '{{ project_id }}');

  const commonParams = [
    { key: 'target', description: 'Path to target file or directory to review' },
    { key: 'project_id', description: 'Codebase-memory project identifier' },
  ];

  const arNemesis = buildRecipe({
    title: 'ar-nemesis — Red-Team Review',
    description: 'Red-team review agent: failure modes, scale, security, ops, edge cases',
    model: 'google/gemma-4-31b-it',
    parameters: commonParams,
    instructions: readPrompt('red-team-review.md'),
    prompt: 'Review the target at: {{ target }}',
  });

  const arEnforcer = buildRecipe({
    title: 'ar-enforcer — Principles Enforcement',
    description: "Validates code and designs against the project's coding principles",
    model: 'google/gemma-4-31b-it',
    parameters: commonParams,
    instructions: readPrompt('principles-enforcement.md'),
    prompt: 'Review the target at: {{ target }}',
  });

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

  writeFileSync(resolve(extAgents, 'ar-nemesis.yaml'), arNemesis);
  writeFileSync(resolve(extAgents, 'ar-enforcer.yaml'), arEnforcer);
  writeFileSync(resolve(extAgents, 'pm-ember.yaml'), pmEmber);

  const runMjsSrc = readFileSync(resolve(__dir, 'run.mjs'), 'utf8');
  writeFileSync(resolve(extAgents, 'run.mjs'), runMjsSrc);
  if (process.platform !== 'win32') {
    execSync(`chmod +x "${resolve(extAgents, 'run.mjs')}"`);
  }

  console.log(`  Recipes written to ${extAgents}`);
}

export function installCli() {
  const { dataDir, binDir } = getPlatformPaths();
  const runMjsPath = resolve(dataDir, 'ext-agents', 'run.mjs');
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

  // API keys
  console.log('\nAPI Keys\n');
  const keys = [];
  const orKey = await promptApiKey('OpenRouter', 'OPENROUTER_API_KEY');
  if (orKey) keys.push(orKey);
  const c7Key = await promptApiKey('Context7', 'CONTEXT7_API_KEY');
  if (c7Key) keys.push(c7Key);
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

  // MCP config
  mergeMcpJson('context7', REGISTRY['context7']);

  // Project setup
  copyPrinciples();

  console.log('\nDone.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
