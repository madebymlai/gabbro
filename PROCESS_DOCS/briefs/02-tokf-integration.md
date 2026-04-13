# Brief: Integrate tokf shell output filter

**Problem**: Claude Code gets raw shell output full of noise — headers, progress bars, boilerplate warnings — that wastes context tokens. tokf is a Rust CLI that filters this at the shell level before output enters context, claiming 60-90% token reduction with 25+ built-in filters for common tools (git, cargo, npm, docker, etc.). Additionally, the existing installer has no scope selection — it hardcodes project-local MCP config and user-level binaries with no way to choose global vs. project-local installation.

**Requirements**:
- Add `tokf` as a new entry in the `REGISTRY` object in `bin/install.mjs`
- Install method: download the latest GitHub release tarball for the detected platform, extract it, and place the binary in the user's PATH (`~/.local/bin/` on Linux, `/usr/local/bin/` on macOS)
- Resolve the `latest` release dynamically — do not pin a version
- Release asset naming pattern: `tokf-v{version}-{target}.tar.gz` where target is one of:
  - `x86_64-unknown-linux-gnu` (Linux x86_64)
  - `aarch64-apple-darwin` (macOS Apple Silicon)
  - `x86_64-apple-darwin` (macOS Intel)
- Post-install: run `tokf hook install` (project-local) or `tokf hook install --global` (global) depending on user's scope choice
- **No Windows support** — tokf has no Windows release binaries. Skip on `win32` with a warning message.
- **No ARM Linux support** — no prebuilt binary. Skip on Linux aarch64 with a warning message.
- Add a **scope selection prompt** to the installer that runs once before any tool installation, asking the user to choose "global" or "project-local". Apply that choice to:
  - tokf: `tokf hook install` vs. `tokf hook install --global`
  - codebase-memory: `.mcp.json` placement (project root `.mcp.json` for project-local vs. `~/.claude/.mcp.json` for global) and any other scope-sensitive config
  - All future registry entries
- tokf has no MCP entry — it is not an MCP server. The registry entry needs `install` and `postInstall` but no `mcpEntry` or `externalMcpEntry`.

**Constraints**:
- Installer must remain pure Node.js (built-in modules only) — consistent with existing `bin/install.mjs`
- Must resolve latest release via GitHub API (`https://api.github.com/repos/mpecan/tokf/releases`) using `node:https` — no `gh` CLI dependency
- Asset is a tarball, not a raw binary — must `tar xzf` after download
- Scope prompt must be a single choice applied uniformly to all tools — not per-tool

**Non-goals**:
- Token savings evaluation or benchmarking (separate effort)
- Windows or ARM Linux support (blocked on upstream)
- Custom tokf filter configuration (use built-in defaults)
- Adding tokf as an MCP server

**Style**: Utilitarian. Same feel as existing installer — clear progress output, fail loudly on errors, skip unsupported platforms with a warning.

**Key concepts**:
- **tokf**: Rust CLI (~5MB) that filters shell output through a 7-stage composable pipeline (match → replace → skip/keep → dedup → tree/lua/json → branch → template). 25+ built-in TOML filter configs.
- **tokf hook**: tokf's integration mechanism for AI coding tools. `tokf hook install` writes project-local hooks; `--global` writes user-level hooks. Intercepts all Bash tool output transparently.
- **Scope selection**: New installer feature — a one-time prompt asking the user whether tools should be installed globally (user-level, affects all projects) or project-locally (only affects the current project).
