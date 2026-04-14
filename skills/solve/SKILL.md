---
name: solve
description: Solution design for features, subsystems, or complex changes. First principles analysis, research, iterative discussion, formal design document. Use after /arm or standalone with a clear brief.
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, WebSearch, WebFetch, Write, mcp__context7__resolve-library-id, mcp__context7__query-docs, mcp__codebase-memory-mcp__get_architecture, mcp__codebase-memory-mcp__search_graph, mcp__codebase-memory-mcp__search_code, mcp__codebase-memory-mcp__trace_path
argument-hint: "[brief/ar report/SEC- ticket]"
---

# Solution Design Protocol

You turn requirements into buildable designs. The brief says *what*; you figure out *how*.

If the argument includes an upstream document (brief, AR report), work within those constraints — don't re-derive what's already been decided.

**Tools:** Dialog (clarifying questions), Documentation (existing docs),  Context7 (library/platform verification), Research (web search for common gotchas and pitfalls).

<HARD-GATE>
Do NOT write code, invoke any implementation skill, or take any action beyond producing a design document until the user has approved it. This applies to EVERY request regardless of perceived simplicity.
</HARD-GATE>

### SEC- Ticket Handling

When input is a SEC- ticket path (matches `.gabbro/artifacts/sec/tickets/SEC-*`):
- The ticket's **Root Cause** and security context (exploit scenario, threat category, affected surface) are the brief.
- Security context fields inform constraint extraction — treat **threat category** and **exploit scenario** as hard constraints.
- Proceed through normal protocol from Task 1 (Clarify requirements).

---

## Phase Tracking

Before any work, create ALL tasks in full detail using `TaskCreate`. Pass the **subject**, **activeForm**, and **description** from each task below verbatim. Then progress through tasks sequentially — mark `in_progress` before starting, `completed` after finishing. Do not begin a task until the prior task is completed.

---

### Task 1: Clarify requirements

- **activeForm**: Clarifying requirements
- **description**: Read the input — a brief from `/arm` (YAML), a raw prompt, or an upstream document. Extract the requirements, constraints, and non-goals.

  If the input is a brief: read it, confirm you understand it, and ask about anything ambiguous or missing. Don't re-probe what `/arm` already covered.

  If the input is a raw prompt (no brief): ask enough to understand the problem, constraints, and scope before proceeding. Use `AskUserQuestion` for structured choices when there are clear trade-offs.

### Task 2: Analyze the problem (first principles)

- **activeForm**: Analyzing problem
- **description**: With the clarified requirements, apply first-principles reasoning — reduce to fundamentals rather than reasoning by analogy.

  **2.1 Deconstruct** — "What is this actually made of?"
  - Break the problem into constituent parts (data, operations, constraints)
  - Ask: What are the actual costs/values? Does this requirement make sense in context?
  - Ask: Can we achieve the same goal with less complexity?

  **2.2 Challenge** — "Real constraint or assumption?"

  ```yaml
  constraint_types:
    - type: Hard
      definition: Physics/reality
      can_change: false
    - type: Soft
      definition: Policy/choice
      can_change: true
    - type: Assumption
      definition: Unvalidated belief
      can_change: maybe
  ```

  For soft constraints: *Who decided this? What if we removed it?*

  **2.3 Reconstruct** — "Given only truths, what's optimal?"
  - Build solution from fundamentals only — ignore form, optimize function
  - Ask: If we started fresh with only hard constraints, what would we build?

  **2.4 Evaluate Suggested Technologies**
  If the brief suggests specific libraries, frameworks, or languages:
  - Why was this suggested? Is there a hard constraint or is it assumption?
  - Does it fit the actual problem, or was it cargo-culted from another context?
  - What are the trade-offs vs alternatives?
  - Flag recommendations to challenge or validate in Task 4

  **Avoid:** Reasoning by analogy ("X does it this way"), form fixation (improving suitcase vs inventing wheels), treating soft constraints as physics.

### Task 3: Review project context

- **activeForm**: Reviewing project context
- **description**: Use codebase-memory-mcp to explore the codebase and understand the area the solution will touch:
  1. `mcp__codebase-memory-mcp__get_architecture` — project overview, languages, structure
  2. `mcp__codebase-memory-mcp__search_graph` — find modules/functions related to the problem
  3. `mcp__codebase-memory-mcp__search_code` — find existing patterns, similar implementations
  4. `mcp__codebase-memory-mcp__trace_path` — trace call chains if understanding data flow

  Use the context to inform design decisions — don't dump a summary on the user.

### Task 4: Validate technical approach

- **activeForm**: Validating technical approach
- **description**: Validate the solution design choices through grounded research. Sources are weighted — when sources conflict, higher-weight sources win.

  **Source weights:**

  ```yaml
  source_weights:
    - weight: 1.5
      source: Local docs (project)
      purpose: Existing patterns, constraints, conventions
    - weight: 1.4
      source: Library docs (Context7)
      purpose: Platform capabilities, API contracts, current patterns
    - weight: 1.0
      source: Web search
      purpose: Known pitfalls and failure modes, AND architectural patterns / best practices not covered by library docs
  ```

  **4.1 Local Docs** (weight 1.5)
  - Look for similar implementations in codebase
  - Verify alignment with established conventions
  - If the project has prior art, it overrides external recommendations

  **4.2 Library Verification** (weight 1.4, required for new dependencies)
  Use Context7 to verify patterns:
  ```
  mcp__context7__resolve-library-id("[library name]")
  ```

  **4.3 Web Search** (weight 1.0)
  - **Pitfalls**: "[Technology] pitfalls production issues", "[Technology] common gotchas"
  - **Architectural patterns**: "[problem] production architecture", "[problem] idiomatic pattern", "[problem] best practices [year]" — for cross-cutting design questions that aren't in any single library doc (rate limiting, multi-tenancy, job queues, caching strategies, etc.)
  - Library-specific positive patterns still come from Context7 + local docs. Use web search when the question is *architectural*, not *API-level*.
  - Lower weight than Context7/local — don't let a Medium article override a library doc.

### Task 5: Design discussion loop

- **activeForm**: Iterating on design
- **description**: Present analysis conversationally and iterate BEFORE generating the formal document.

  **5.1 Present Draft Design**
  - Summarize problem understanding
  - Explain proposed approach, key decisions, trade-offs
  - Surface risks and open questions

  **5.2 Iterate**
  - Use `AskUserQuestion` to drive structured feedback: *"Does this capture what you need? Concerns with this direction?"*
  - Use multiple choice format for trade-offs and design decisions
  - Refine based on feedback until alignment

  **5.3 Confirm Readiness**
  Explicitly ask: *"Ready to formalize into a design document?"*

  Only proceed after user approval.

### Task 6: Write design document

- **activeForm**: Writing design document
- **description**: Save to `.gabbro/artifacts/solutions/NN-[solution-name].yaml` (e.g., `03-user-auth.yaml`). Check existing files in the directory to determine the next number.

  Use the template at `resources/templates/solve_template.yaml`. Read it and populate every field from the analysis in Tasks 1-5.

  **Key rules:**
  - `adversarial_reviewer_notice` — copy VERBATIM from the template. Do not modify, summarize, or omit. This field instructs the downstream reviewer and must reach them intact.
  - `brief` — path to the upstream brief (non-goals, constraints live there, don't duplicate)
  - `components` — every component must have `fulfills` tracing back to brief REQ- IDs
  - `touches` — list existing files each component modifies (vs creates fresh)
  - `contracts` — exact schemas, function signatures, API endpoints (Markdown block)
  - `build_order` — sequence for downstream `/breakdown` task delegation
  - `sources` — every research finding from Task 4, tagged by type and weight
  - `decisions` — every design choice with rationale and rejected alternatives
  - `risks` — what could go wrong, impact, mitigation
  - `executive_summary` — Markdown prose, high-level impact and value
  - `architecture` — Markdown prose, data flow and component relationships

---

## Auto-Roll

After the design document is written and the user approves it, invoke the adversarial review:

`Skill("ar", args="[design-doc-path]")`

where `[design-doc-path]` is the path to the design document written in Task 6.
