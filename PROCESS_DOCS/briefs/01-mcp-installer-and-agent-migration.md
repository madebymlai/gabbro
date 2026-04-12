# Brief: MCP installer + agent migration to Gemma/OpenRouter

**Problem**: Gabbro has no `.mcp.json` and no installer for MCP server binaries. External agent names in `.gabbro/external-agents.json` (`kimi-review`, `glm5-review`, `kimi-pmatch`) don't match their Claude agent counterparts (`ar-enforcer`, `ar-nemesis`, `pm-ember`). The external models (Kimi K2.5, GLM-5) are being replaced with Google Gemma models via OpenRouter.

**Requirements**:
- Build a Node.js installer script (modeled after `_refs/get-shit-done/bin/install.js`) that:
  - Detects OS and architecture (Linux x86_64/aarch64, macOS arm64/x86_64, Windows x86_64)
  - Downloads the correct `codebase-memory-mcp` binary from GitHub releases
  - Places it in the appropriate location (`~/.local/bin/` on Linux, `/usr/local/bin/` on macOS, `$LOCALAPPDATA\bin\` on Windows)
  - Makes it executable (Unix)
  - Configures auto-indexing (`codebase-memory-mcp config set auto_index true`, `auto_index_limit 50000`)
  - Enables the graph UI by passing `--ui=true --port=9749` as args in the `.mcp.json` server entry
  - Wires up `.mcp.json` at project root for main Claude Code
  - Wires up `codebase-memory` entry in `.gabbro/external-agents.json` under `mcpServers`
  - Is extensible for future MCP servers and dependencies
- Rename external agents in `.gabbro/external-agents.json` to match `.claude/agents/`:
  - `kimi-review` → `ar-enforcer`
  - `glm5-review` → `ar-nemesis`
  - `kimi-pmatch` → `pm-ember`
- Migrate all three agents to OpenRouter:
  - `ar-enforcer`: `google/gemma-4-26b-a4b-it` via `https://openrouter.ai/api/v1`, env `OPENROUTER_API_KEY`
  - `ar-nemesis`: `google/gemma-4-31b-it` via `https://openrouter.ai/api/v1`, env `OPENROUTER_API_KEY`
  - `pm-ember`: `google/gemma-4-26b-a4b-it` via `https://openrouter.ai/api/v1`, env `OPENROUTER_API_KEY`
- Update `.claude/agents/*.md` to reference the new agent names in their `--agent` flags:
  - `ar-enforcer.md`: `--agent kimi-review` → `--agent ar-enforcer`
  - `ar-nemesis.md`: `--agent glm5-review` → `--agent ar-nemesis`
  - `pm-ember.md`: `--agent kimi-pmatch` → `--agent pm-ember`
- Add `codebase-memory` MCP server to `ar-enforcer` and `ar-nemesis` agent profiles (NOT `pm-ember`)
- Tool allowlist for `codebase-memory` on external agents (11 tools):
  - `index_repository`, `index_status`, `list_projects`
  - `search_graph`, `search_code`, `get_code_snippet`
  - `trace_call_path`, `detect_changes`, `query_graph`
  - `get_graph_schema`, `get_architecture`

**Constraints**:
- Installer must be pure Node.js (built-in modules only, no external dependencies) — same pattern as get-shit-done
- Binary asset names are OS/arch-dependent per the codebase-memory-mcp repo README:
  - `codebase-memory-mcp-linux-x86_64`
  - `codebase-memory-mcp-linux-aarch64`
  - `codebase-memory-mcp-darwin-arm64`
  - `codebase-memory-mcp-windows-x86_64.exe`
- The installer is the documentation — no separate setup docs needed

**Non-goals**:
- Installing to other AI runtimes (Claude Code only)
- Adding codebase-memory tools to `pm-ember`
- Giving external agents destructive tools (`delete_project`, `manage_adr`, `ingest_traces`)

**Style**: Utilitarian. Works reliably, prints clear progress, fails loudly.

**Key concepts**:
- **codebase-memory-mcp**: Static C binary providing AST-based codebase knowledge graph via MCP. 14 tools, SQLite-backed, zero runtime dependencies.
- **`.mcp.json`**: Project-level MCP server config for main Claude Code (does not exist yet, will be created).
- **`.gabbro/external-agents.json`**: Config for external model agents. Contains both agent profiles and shared MCP server definitions.
- **get-shit-done installer pattern**: Single-file Node.js installer with OS detection, binary management, and config wiring. Reference at `_refs/get-shit-done/bin/install.js`.
