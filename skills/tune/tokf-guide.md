# tokf Discovery Guide

This guide is loaded by /tune when tokf discover finds nothing (new project, no session history). It explores the codebase to find commands that would benefit from tokf filters.

## Rules
- NEVER propose filters for commands that already have built-in filters (run `tokf ls` to check)
- Cross-reference every candidate against `tokf which "[command]"` before proposing
- For filter authoring, delegate to the tokf-filter skill (`.claude/skills/tokf-filter/SKILL.md`)
- Filters go in `.tokf/filters/` (project-local only)
- For commands that don't need a full filter, suggest `.tokf/rewrites.toml` entries

## Presenting to the user
- Propose one filter at a time via AskUserQuestion
- Options: "Add this filter" (description = what it does), "Skip"
- Explain what you found before each proposal

---

## Discovery Strategy

### 1. Detect project stack
Use `mcp__codebase-memory-mcp__get_architecture` to identify languages, frameworks, build tools, and test runners.

### 2. Scan command sources

Check each of these. Read the file, extract command names, skip anything `tokf which` already matches.

| Source | How to find | What to look for |
|--------|------------|-----------------|
| npm/pnpm/yarn scripts | `Glob("**/package.json")` → read `scripts` | Custom scripts: dev, lint, typecheck, format, seed, migrate |
| Makefile | `Glob("**/Makefile")` | Targets that produce verbose output: build, test, deploy, lint |
| justfile | `Glob("**/justfile")` | Recipes, especially those wrapping other tools |
| Taskfile | `Glob("**/Taskfile.yml")` | Task definitions |
| pyproject.toml | `Glob("**/pyproject.toml")` → read `[tool.poetry.scripts]` or `[project.scripts]` | CLI entry points |
| Cargo.toml | `Glob("**/Cargo.toml")` → read `[package.metadata]` | cargo-xtask style commands |
| Composer | `Glob("**/composer.json")` → read `scripts` | PHP project commands |
| Gradle | `Glob("**/build.gradle*")` | Custom tasks beyond build/test |
| CI workflows | `Glob("**/.github/workflows/*.yml")` | Commands that run in CI and locally |
| Shell scripts | `Glob("**/bin/*.sh")`, `Glob("**/scripts/*.sh")` | Wrapper scripts |
| Docker Compose | `Glob("**/docker-compose*.yml")` | Service commands, custom entrypoints |
| Procfile | `Glob("**/Procfile")` | Process commands |
| nx/turbo config | `Glob("**/nx.json")`, `Glob("**/turbo.json")` | Monorepo task runners |

### 3. Identify noisy commands
Not every command needs a filter. Focus on commands that:
- Produce 10+ lines of output on success (build tools, test runners, linters)
- Have distinct success/failure output patterns
- Are run frequently during development
- Have progress bars, compile logs, or download noise

Skip commands that:
- Produce 1-2 lines already (quick checks, status commands)
- Need their full output visible (interactive tools, REPLs)
- Are already covered by `tokf which`

### 4. Check for rewrites
For commands that are noisy but don't have a unique output structure, propose `.tokf/rewrites.toml` entries:

```toml
# Build commands → tokf err (shows errors only)
[[rewrite]]
match = "^mix compile"
replace = "tokf err {0}"

# Test runners → tokf test (shows pass/fail summary)
[[rewrite]]
match = "^mix test"
replace = "tokf test {0}"

# Long-running commands → tokf summary (captures last meaningful line)
[[rewrite]]
match = "^terraform plan"
replace = "tokf summary {0}"
```

Use rewrites when the command has no unique structure worth parsing. Use a full filter when you can extract structured info (counts, names, specific patterns).
