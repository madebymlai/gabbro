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

1. Read `.claude/resources/prompts/guides/principles-guide.md`
2. Follow the guide's "Presenting to the user" instructions
3. Follow the guide's "Probe Instructions" for codebase exploration
4. Before writing, check if `.gabbro/principles.yaml` exists:
   - If yes: AskUserQuestion — "Overwrite existing", "Merge with existing", "Cancel"
5. Write `.gabbro/principles.yaml` with all accepted principles

## Phase 3: tokf Filters (if selected)

1. Read `.claude/resources/prompts/guides/tokf-guide.md`
2. Follow the guide's "Presenting to the user" instructions
3. Follow the guide's "Probe Instructions" for command discovery
4. Before writing, check `.tokf/filters/` for existing filters and report them
5. Write each accepted filter to `.tokf/filters/[tool]/[command].toml`
6. Write `.tokf/rewrites.toml` if any rewrites were accepted

## Phase 4: Summary

Report what was written:
- Number of principles added to .gabbro/principles.yaml
- Number of filters written to .tokf/filters/
- Number of rewrites added to .tokf/rewrites.toml
