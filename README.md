# gabbro

A workflow toolkit for Claude Code. Skills, agents, and tooling that turn Claude into a structured engineering partner.

```sh
npx github:madebymlai/gabbro
```

That's it. Run from any project directory. Works on Linux and macOS (tokf skipped on Windows, everything else works).

## What you get

**Skills** (invoke with `/command`):

| Skill | What it does |
|-------|-------------|
| `/arm` | Extract requirements from a conversation, produce a structured brief |
| `/solve` | Design a solution from a brief. First-principles analysis, research, formal design doc |
| `/breakdown` | Split a solution into execution chunks for build agents |
| `/build` | Orchestrate a team of build agents to implement an execution plan |
| `/ar` | Adversarial review. Three agents (Inquisitor, Enforcer, Nemesis) stress-test a design |
| `/pmatch` | Pattern matching. Compare source-of-truth against target for alignment |
| `/bugfest` | Structured debugging. Triage, root-cause, fix, ticket tracking |
| `/tune` | Interactive setup of coding principles and tokf filters for your project |
| `/denoise` | Post-implementation cleanup |
| `/tdd` | Test-driven development cycle |

**Agents** (used by skills, not invoked directly):

| Agent | Role |
|-------|------|
| `build` | Sonnet build agent. Implements execution chunks from `/breakdown` |
| `ar-inquisitor` | Architecture reviewer. Challenges premises and consistency |
| `ar-enforcer` | Principles reviewer. Validates against `.gabbro/principles.yaml` |
| `ar-nemesis` | Red team. Failure modes, security, edge cases |
| `pm-ash` / `pm-ember` | Pattern match validators (native + external model) |

**Tooling the installer sets up**:

- [tokf](https://github.com/mpecan/tokf) - compresses noisy CLI output (cargo test, git push, etc.) so agents see signal, not noise
- [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) - code knowledge graph for structural queries
- [Context7](https://github.com/upstash/context7) - live library documentation lookup
- [Goose](https://github.com/block/goose) - external model agent runner for adversarial reviews

## How it works

The workflow flows left to right:

```
/arm  ->  /solve  ->  /ar  ->  /breakdown  ->  /build
brief     solution    review   exec plan       implementation
```

`/arm` extracts what to build. `/solve` designs how. `/ar` pokes holes. `/breakdown` splits into parallelizable chunks. `/build` hands chunks to Sonnet agents.

Each step produces an artifact in `.gabbro/artifacts/`. Each step reads the previous step's output.

## Project setup

After installing, run `/tune` in your project. It walks you through:

1. **Coding principles** - picks from a catalog, explores your codebase for project-specific additions, writes `.gabbro/principles.yaml`. The Enforcer agent checks code against these during `/ar`.

2. **tokf filters** - discovers your custom commands (npm scripts, Makefile targets, etc.) and creates `.tokf/filters/` entries so their output gets compressed.

## File layout

```
your-project/
  .claude/
    skills/         # installed by gabbro
    agents/         # installed by gabbro
    resources/      # templates, prompts, guides
  .gabbro/
    principles.yaml # your coding principles (created by /tune)
    artifacts/      # briefs, solutions, reviews, breakdowns
  .tokf/
    filters/        # project-specific tokf filters (created by /tune)
```

## Requirements

- Node.js 18+
- Claude Code CLI
- Git

## License

MIT
