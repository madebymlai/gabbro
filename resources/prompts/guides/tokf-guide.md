# tokf Filter Guide

## How to use this guide

You are being loaded by the /tune skill to help set up project-specific tokf filters.

### Important rules
- NEVER recreate filters for commands that already have built-in filters (see "Built-in filters" section)
- Only generate Level 1 filters (skip/keep/extract/match_output) — complex stateful filters are already built-in
- Filters go in `.tokf/filters/` (project-local), never `~/.config/tokf/filters/`
- For commands that don't need a full filter, suggest rewrites instead

### Presenting to the user
- Propose one filter at a time via AskUserQuestion
- Use the preview field to show the TOML content
- Options: "Add this filter" (description = what it does), "Skip"
- User can tweak via "Other"
- Explain what you found before each proposal: "I see `npm run lint` in package.json scripts — this produces ESLint output that can be compressed"

### Output
- Write each accepted filter to `.tokf/filters/[tool]/[command].toml`
- Write accepted rewrites to `.tokf/rewrites.toml`
- Create parent directories as needed

---

## Filter TOML Reference

### Minimal filter
```toml
command = "my-tool"

[on_success]
output = "ok ✓"

[on_failure]
tail = 10
```

### All Level 1 fields
```toml
command = "tool subcommand"         # required — what command to match
description = "Human-readable"       # shown in `tokf ls`
strip_ansi = true                    # strip ANSI escape codes before processing

# Line filtering (applied in order)
skip = ["^regex1", "^regex2"]        # drop lines matching any regex
keep = ["^error", "^warning"]        # keep ONLY lines matching (inverse of skip)

# Per-line replacement
[[replace]]
pattern = "^(\\S+)\\s+(.+)"
output = "{1}: {2}"

dedup = true                         # collapse consecutive identical lines
on_empty = "tool: ok"               # message when all lines are stripped
passthrough_args = ["--verbose"]     # skip filter when user passes these flags

# Whole-output matching (short-circuits the pipeline)
match_output = [
  { contains = "up-to-date", output = "ok (up-to-date)" },
]

# Success branch (exit code 0)
[on_success]
output = "ok ✓ {2}"                 # template string
skip = ["^noise"]                    # branch-specific skip
extract = { pattern = "(\\S+)", output = "done: {1}" }

# Failure branch (exit code != 0)
[on_failure]
tail = 15                           # keep last N lines
skip = ["^hint:"]                   # branch-specific skip
```

---

## Built-in filters — do NOT recreate

Tell the user these commands are already covered by tokf's built-in filter library:

| Tool | Commands |
|------|----------|
| git | add, commit, diff, log, push, show, status |
| cargo | build, check, clippy, fmt, install, nextest, test |
| npm | run, test (with vitest/jest variants) |
| pnpm | add, install |
| yarn | (test variants) |
| docker | build, compose, images, ps |
| go | build, vet |
| gradle | build, test, dependencies |
| gh | pr list/view/checks, issue list/view |
| kubectl | get pods |
| next | build |
| prisma | generate |
| eslint | check |
| firebase | deploy |

If the user's project uses these commands, inform them: "These are already filtered by tokf's built-in library. You only need project-local filters for custom commands."

---

## Rewrites Reference

For commands that don't warrant a full custom filter, suggest a `.tokf/rewrites.toml` entry that routes through tokf's generic handlers:

```toml
# Route build commands through tokf err (captures errors)
[[rewrite]]
match = "^mix compile"
replace = "tokf err {0}"

# Route test runners through tokf test (captures pass/fail)
[[rewrite]]
match = "^mix test"
replace = "tokf test {0}"

# Route long commands through tokf summary (captures summary line)
[[rewrite]]
match = "^terraform plan"
replace = "tokf summary {0}"
```

**When to use rewrites vs filters:**
- Rewrite: command has no unique output structure, just needs generic noise reduction
- Filter: command has a specific output format you can extract structured info from

**Rule:** User rewrite rules are checked before filter matching. Don't add rewrites for commands that already have built-in filters.

---

## Probe Instructions

### Step 1: Detect project stack
Use `mcp__codebase-memory-mcp__get_architecture` to identify:
- Primary language(s) and ecosystem
- Build tools
- Test runners

### Step 2: Discover custom commands

| What to check | How | What to propose |
|---------------|-----|-----------------|
| package.json scripts | `Glob("**/package.json")` then `Read` the scripts section | Filter for each custom script (dev, lint, typecheck, etc.) |
| Makefile targets | `Glob("**/Makefile")` then `Read` | Filter for noisy targets (build, test, deploy) |
| justfile recipes | `Glob("**/justfile")` then `Read` | Filter for noisy recipes |
| Taskfile.yml | `Glob("**/Taskfile.yml")` then `Read` | Filter for noisy tasks |
| pyproject.toml scripts | `Glob("**/pyproject.toml")` then `Read` [tool.poetry.scripts] or [project.scripts] | Filter for custom Python CLI commands |
| Cargo.toml custom commands | `Glob("**/Cargo.toml")` then `Read` for [package.metadata] or custom aliases | Rewrites for cargo-xtask style commands |
| CI workflows | `Glob("**/.github/workflows/*.yml")` then `Read` | Identify commands run in CI that are also run locally |
| Shell scripts in bin/ | `Glob("**/bin/*.sh")` or `Glob("**/scripts/*.sh")` | Rewrites for noisy scripts |

### Step 3: Skip already-covered commands
Cross-reference discovered commands against the "Built-in filters" table above. Do not propose filters or rewrites for commands that are already covered.

### Step 4: Propose filters
For each uncovered command, generate a TOML filter using the templates below.

---

## Template Filters

### Custom npm/pnpm scripts
```toml
# Template: replace [script] with actual script name
command = "npm run [script]"
description = "Compact output from npm run [script]"
strip_ansi = true

skip = ["^$", "^> ", "^(added|removed|changed)"]

[on_success]
output = "ok ✓ [script]"

[on_failure]
tail = 15
```

### Makefile / justfile targets
```toml
# Template: replace [target] with actual target name
command = "make [target]"
description = "Compact output from make [target]"
strip_ansi = true

skip = ["^make\\[", "^$"]

[on_success]
output = "ok ✓ make [target]"

[on_failure]
tail = 20
```

### Python CLI scripts
```toml
# Template: replace [script] with actual script/module
command = "python -m [module]"
description = "Compact output from [module]"
strip_ansi = true

[on_success]
output = "ok ✓ [module]"

[on_failure]
tail = 15
```

### Generic noisy command (rewrite fallback)
```toml
# For .tokf/rewrites.toml — not a filter file
[[rewrite]]
match = "^[command pattern]"
replace = "tokf err {0}"
```
