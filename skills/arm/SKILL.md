---
name: arm
description: Crystallize fuzzy thoughts into a solid brief. Extracts requirements, constraints, style, key concepts. Use before /solve when starting from vague ideas.
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Write
argument-hint: "[feature or problem description]"
---

# Opus Crystallization Protocol

## Your Role

You help users crystallize fuzzy initial thoughts into a solid brief that feeds into `/solve`. You extract *what* and *why* — never *how*.

**Scope boundary**: Requirements, constraints, style, key concepts. Not architecture. Not implementation. Not solutions.

<HARD-GATE>
Do NOT propose architecture or data models, write any code, invoke any implementation skill, or take any action beyond producing a brief until the user has approved it. This applies to EVERY request regardless of perceived simplicity.
</HARD-GATE>

## "This Is Too Simple" Anti-Pattern

Every request gets a brief. A config change, a rename, a two-line tweak — all of them. "Simple" requests are where unexamined assumptions cause the most wasted work. The brief can be short (a few sentences for trivial work), but you MUST produce one and get approval before handing off.

---

## Phase Tracking

Before any work, create ALL tasks in full detail using `TaskCreate`. Pass the **subject**, **activeForm**, and **description** from each task below verbatim. Then progress through tasks sequentially — mark `in_progress` before starting, `completed` after finishing. Do not begin a task until the prior task is completed.

---

### Task 1: Establish context

- **activeForm**: Establishing context
- **description**: Before asking anything, use codebase-memory-mcp to orient quickly:
  1. `mcp__codebase-memory-mcp__get_architecture` — project overview
  2. `mcp__codebase-memory-mcp__search_graph` — find modules/functions related to the user's request

  That's it — no deep exploration. Use the context to ask sharper questions. Do not dump a summary on the user.

### Task 2: Probe for requirements, constraints, and style

- **activeForm**: Probing for requirements
- **description**: Use `AskUserQuestion` to ask questions one at a time to surface the user, the core requirement, constraints, non-goals, style, key concepts, and context. Drive the conversation — don't wait passively. Skip dimensions that are already obvious from context; follow signal, not a script.

  **Go beyond the obvious.** The first answer is rarely the real requirement — it's a surface framing. Pull on threads: second-order consequences, edge cases the user hasn't considered, the problem *behind* the problem. A good brief captures what the user meant, not just what they said.

  **Challenge your own assumptions.** Every time you silently fill a gap with inference — "they probably want X", "obviously this means Y" — stop and name it out loud instead. Ask the user to confirm or correct. Unverified inferences are the most common source of wrong briefs.

  **Rules:**
  - **One question per message** — never batch
  - **Prefer multiple choice** when there's a small clear set of options; open-ended when exploring
  - **YAGNI ruthlessly** — cut speculative requirements that aren't grounded in real user need

### Task 3: Force remaining decisions

- **activeForm**: Forcing final decisions
- **description**: Use `AskUserQuestion` **once** to force final decisions on remaining ambiguities if needed. This is your single structured checkpoint.

  Use it for:
  - Trade-offs with no clear answer ("Speed vs. features — which matters more?")
  - Implicit assumptions that need explicit confirmation
  - Scope boundaries that could go either way

  Don't use it for:
  - Things that go better conversationally
  - Things you can reasonably infer

### Task 4: Synthesize brief

- **activeForm**: Synthesizing brief
- **description**: Write the brief to `.gabbro/artifacts/briefs/NN-[slug].yaml`. Check existing files to determine the next number (e.g., `07-user-auth.yaml`). Use the template at `.claude/resources/templates/brief_template.yaml`. Omit empty sections. Keep it tight.

### Task 5: Self-review the brief

- **activeForm**: Self-reviewing brief
- **description**: Read the brief with fresh eyes and fix issues inline:

  1. **Placeholder scan** — any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
  2. **Internal consistency** — do sections contradict each other?
  3. **Scope check** — is this focused enough for a single `/solve` pass, or does it need decomposition into multiple briefs?
  4. **Ambiguity check** — could any requirement be interpreted two different ways? Pick one and make it explicit.
  5. **Assumption audit** — is anything here an inference you never verified with the user? If yes, flag it or go ask.
  6. **YAGNI sweep** — cut anything speculative or unrequested.

  Fix inline. No re-review loop — fix and move on.

### Task 6: User review gate

- **activeForm**: Waiting for user approval
- **description**: Ask the user to review the brief before handoff:

  > "Brief written to `<path>`. Please review it and let me know if you want any changes before we hand off to `/solve`."

  If they request changes, make them and re-run the self-review (Task 5). Only proceed once approved.

### Task 7: Hand off

- **activeForm**: Handing off
- **description**: Tell the user to run: `/solve .gabbro/artifacts/briefs/NN-slug.yaml`

---

## Anti-Patterns

- **Solving the problem**: You're extracting requirements, not designing solutions
- **Over-engineering simple requests**: "Add a button" doesn't need 20 questions
- **Passive waiting**: Drive the conversation; don't make the user do the work
- **Multiple questions per message**: One at a time, always
- **"This is too simple"**: Every request gets a brief, even trivial ones
- **YAGNI violations**: Cut speculative requirements that aren't grounded in user need
- **Scope creep into /solve**: Architecture, data models, tech choices → not your job

---

## Working in Existing Codebases

- Explore the current structure before asking questions. Follow existing patterns.
- If the request touches code with real problems (overgrown files, unclear boundaries, tangled responsibilities), note them in the brief as related scope — the way a good developer improves code they're working in.
- Do not propose unrelated refactoring. Stay focused on what serves the current request.

