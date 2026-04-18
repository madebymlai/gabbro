# gabbro

A workflow toolkit for Claude Code. Skills, agents, and tooling that turn Claude into a structured engineering partner.

```sh
npx github:madebymlai/gabbro
```

That's it. Run from any project directory. Works on Linux, macOS, and Windows (tokf skipped on Windows, everything else works).

## What you get

**Skills** (invoke with `/command`):

| Skill | What it does |
|-------|-------------|
| `/arm` | Extract requirements from a conversation, produce a structured brief |
| `/solve` | Design a solution from a brief. First-principles analysis, research, formal design doc |
| `/ar` | Codex adversarial review loop. Challenges architecture, tradeoffs, and assumptions |
| `/breakdown` | Split a solution into execution YAML for build agents |
| `/build` | Orchestrate a team of build agents to implement an execution plan |
| `/pmatch` | Pattern matching. Compare source-of-truth against target for alignment |
| `/bugfest` | Structured debugging. Triage, root-cause, fix, ticket tracking |
| `/tune` | Interactive setup of coding principles and tokf filters for your project |
| `/denoise` | Post-implementation cleanup |

**Pipeline** (auto-rolls after `/solve` approval):

```
/arm  ->  /solve  ->  /ar  ->  /breakdown  ->  /pmatch  ->  /build
brief     design      review   exec plan       principles   implementation
                      (Codex)                  gate
```

User approves once at `/solve`. Everything after auto-chains. `/ar` loops up to 5 times (edit design on rejection, escalate on failure).

**Tooling the installer sets up**:

- [Codex CLI](https://github.com/openai/codex) - adversarial design review via GPT-5.4
- [tokf](https://github.com/mpecan/tokf) - compresses noisy CLI output so agents see signal, not noise (Linux/macOS only)
- [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) - code knowledge graph for structural queries
- [Context7](https://github.com/upstash/context7) - live library documentation lookup
- [Goose](https://github.com/block/goose) - external model agent runner for pattern matching

## Project setup

After installing, run `/tune` in your project. It walks you through:

1. **Coding principles** - picks from a catalog, explores your codebase for project-specific additions, writes `.gabbro/principles.yaml`. Used by `/pmatch` as the principles gate after `/breakdown`.

2. **tokf filters** - discovers your custom commands (npm scripts, Makefile targets, etc.) and creates `.tokf/filters/` entries so their output gets compressed.

## File layout

```
your-project/
  .claude/
    skills/         # installed by gabbro
    agents/         # installed by gabbro
    resources/      # templates
  .gabbro/
    principles.yaml # your coding principles (created by /tune)
    artifacts/      # briefs, solutions, executions, tickets
  .tokf/
    filters/        # project-specific tokf filters (created by /tune)
```

## Requirements

- Node.js 18+
- Claude Code CLI
- ChatGPT subscription or OpenAI API key (for Codex adversarial review)

## License

Apache 2.0
