---
name: tune
description: Interactive project setup — coding principles and tokf filters. Explores codebase, presents catalogs, proposes codebase-specific additions, writes config files.
allowed-tools: Read, Glob, Grep, Bash, Write, AskUserQuestion, mcp__codebase-memory-mcp__get_architecture, mcp__codebase-memory-mcp__search_graph, mcp__codebase-memory-mcp__search_code
argument-hint: ""
---

# Project Tuning

You interactively set up coding principles and tokf filters for this project. You drive the conversation — the user steers via structured choices.

## Rules
- ALL user interaction via AskUserQuestion — never ask freeform questions
- Load guides via Read tool, never @ reference
- Accumulate all accepted items in memory, write files only at the end
- Explain what you're finding before each AskUserQuestion ("I found X in your codebase...")

## Phase 0: Platform Detection

Run `which tokf` via Bash.
- Exit code 0 → tokf_available = true
- Exit code != 0 → tokf_available = false

## Phase 1: Mode Selection

IF tokf_available:
  AskUserQuestion: "What would you like to set up?"
  Options:
    - "Coding principles" — Set up .gabbro/principles.yaml for the Enforcer
    - "tokf filters" — Set up .tokf/filters/ for output compression
    - "Both" — Set up principles first, then tokf filters
ELSE:
  mode = principles_only (no question — proceed directly)

## Phase 2: Principles (if selected)

1. Check if `.gabbro/principles.yaml` exists:
   - If yes: Read it and note which principles are already configured
2. Read `.claude/skills/tune/principles-guide.md`
3. Follow the guide's "Presenting to the user" instructions
   - Mark already-configured principles as "[already set]" in the catalog
   - Skip them from selection by default
4. Follow the guide's "Probe Instructions" for codebase exploration
5. Before writing, if `.gabbro/principles.yaml` existed:
   - AskUserQuestion — "Overwrite existing", "Merge with existing", "Cancel"
6. Write `.gabbro/principles.yaml` with all accepted principles

## Phase 3: tokf Filters (if selected)

### Step 1: Discover real usage
Run `tokf discover --json` via Bash to find commands that ran without filters in past sessions.

- If discover finds unfiltered commands with significant token waste: propose filters for the top results, one at a time via AskUserQuestion
- If discover finds nothing (new project, no session history): fall back to codebase exploration (Step 2)

### Step 2: Codebase exploration (fallback)
Only if discover found nothing. Read `.claude/skills/tune/tokf-guide.md` and follow its probe instructions to discover commands from package.json, Makefile, justfile, etc.

### Step 3: Write filters
For each accepted filter, read `.claude/skills/tokf-filter/SKILL.md` for the full TOML reference (processing order, fields, templates). Use that knowledge to write proper filters, not just Level 1.

- Check `.tokf/filters/` for existing filters and skip duplicates
- Write each accepted filter to `.tokf/filters/[tool]/[command].toml`
- Write `.tokf/rewrites.toml` if any rewrites were accepted
- Verify each filter with `tokf verify` after writing

## Phase 4: Summary

Report what was written:
- Number of principles added to .gabbro/principles.yaml
- Number of filters written to .tokf/filters/
- Number of rewrites added to .tokf/rewrites.toml
