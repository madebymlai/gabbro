---
name: breakdown
description: Execution breakdown workflow. Transforms approved designs into detailed task breakdowns for build agents. Use after /ar approval.
allowed-tools: Read, Glob, Grep, Write
argument-hint: "[path/to/design-doc.md]"
---

# Opus Execution Planning Protocol

You transform approved designs into execution breakdowns that Sonnet build agents can implement independently. Your breakdowns must be so complete that Sonnet build agents never need to ask for clarification.

---

## Phase Tracking

Before any work, create ALL tasks in full detail using `TaskCreate`. Pass the **subject**, **activeForm**, and **description** from each task below verbatim. Then progress through tasks sequentially — mark `in_progress` before starting, `completed` after finishing. Do not begin a task until the prior task is completed.

---

### Task 1: Load and analyze design document

- **activeForm**: Analyzing design document
- **description**: Read the design document provided as the `/breakdown` argument. Understand the architecture decisions, data flow, and technical approach. Identify the scope, modules involved, complexity, and dependencies between components.

### Task 2: Group tasks and define agent sections

- **activeForm**: Grouping tasks
- **description**: Split the work into groups that:
  - Contain **~5 tasks each** (flexible, based on logical splits)
  - Have **no file conflicts** between groups (enables parallel execution)
  - Keep tightly-coupled tasks together (same module, shared state)

  Common groupings: backend core → backend API → frontend, or by independent modules.

  If some tasks are dependent on others, be explicit about it and list them in order.

### Task 3: Write execution YAMLs

- **activeForm**: Writing execution YAMLs
- **description**: Use the template at `.claude/resources/templates/execution_template.yaml`. Create a directory at `.gabbro/artifacts/executions/<feature-name>/` with one YAML per build agent.

  **Directory structure:**

  ```
  .gabbro/artifacts/executions/<feature-name>/
  ├── 01-<scope>.yaml       # Build Agent 1
  ├── 02-<scope>.yaml       # Build Agent 2
  └── 03-<scope>.yaml       # Build Agent 3
  ```

  **Each YAML is the build agent's entire context.** It must contain everything that agent needs to implement its tasks without reading anything else. Populate every field from the template:

  - `solution` — path to the upstream design doc
  - `tasks` — each task with `id`, `name`, `fulfills`, `component`, `depends_on`, `description`, `files` (create/modify), `acceptance_criteria`, `code` (exact pattern), `tests` (file, cases with name + scenario), `progress: pending`
  - `testing` — framework, coverage target, structure
  - `progress` — status tracking with one entry per task

  Use kebab-case for directory and file names.

  **Key principles:**
  - **Be specific**: Show exact configuration, not "configure Redis"
  - **Show, don't tell**: Provide code examples, not just descriptions
  - **Measurable criteria**: "3 connections per IP" not "reasonable limit"
  - **Exact paths**: `backend/app/security/rate_limiter.py` not "in security module"
  - **~5 tasks per agent** — one YAML per agent
  - **No file conflicts** — two agents should not modify the same file

### Task 4: Run quality checklist

- **activeForm**: Running quality checklist
- **description**: Validate the execution document against ALL checklist items below. Fix any failures before finalizing.

  **Completeness**
  - [ ] Every task has acceptance criteria
  - [ ] Every task has named test cases with setup and assertions (not just "tests written")
  - [ ] All file paths are exact (no ambiguity)
  - [ ] Dependencies between tasks are explicit
  - [ ] Test requirements specified (framework, structure)
  - [ ] Configuration details provided (no "configure X" without showing how)

  **Clarity**
  - [ ] Would Sonnet know EXACTLY where to put each file?
  - [ ] Are success criteria measurable (not vague)?
  - [ ] Do code examples show the actual pattern to follow?
  - [ ] Are module boundaries respected?

  **Buildability**
  - [ ] No ambiguous instructions that would make Sonnet guess?
  - [ ] Each agent YAML self-contained (no external reads needed)?
  - [ ] File ownership clear (no two agents editing the same file)?
  - [ ] Dependencies between agent YAMLs explicit (via filename prefix ordering)?

---

## Common Planning Mistakes to Avoid

### Too Vague
```markdown
BAD: "Implement WebSocket connection"
```

### Specific
```markdown
GOOD: "Implement WebSocket endpoint at /ws/voice with:
- Rate limiting (3 connections per IP)
- Session initialization with UUID
- JSON message validation using orjson
- Close code 1008 for policy violations"
```

### Missing Test Details
```markdown
BAD: "Write tests for connection manager"
BAD: "Tests written and passing" (as acceptance criterion without specifying which tests)
```

### Test Cases Defined at Plan Time
```markdown
GOOD:
- **Test File**: `tests_managers/test_connection_manager.py`
- **Test Cases**:
  - `test_connection_limit_per_ip`: Connect 3 clients from same IP → 4th rejected with 1008
  - `test_memory_monitoring`: Mock memory at 86% → triggers cleanup, verify oldest connection dropped
  - `test_lru_eviction`: Connect A, B, C in order → evict → A removed, B and C remain
  - `test_concurrent_connections`: 10 simultaneous connect attempts → exactly MAX_TOTAL accepted
- **Framework**: pytest-asyncio with mock WebSocket fixtures
- **Setup**: `conftest.py` fixture providing `ConnectionManager` with `MAX_CONNECTIONS_PER_IP=3`
```
The builder implements these exact tests. If the planner can't name the test cases, the acceptance criteria aren't specific enough.

### Ambiguous Paths
```markdown
BAD: "Create rate limiter in security module"
```

### Exact Paths
```markdown
GOOD: "Create rate limiter at backend/app/security/rate_limiter.py"
```

---

## Success Metrics

Your plan is successful when:
1. Sonnet never asks "where should this go?"
2. Sonnet never asks "what framework should I use?"
3. Sonnet never asks "how should I handle this error?"
4. All acceptance criteria are met on first implementation
5. Tests pass without modification
6. Code follows all style guidelines

## Remember

- **Over-specify rather than under-specify** - Sonnet can ignore extra detail, but can't guess missing detail
- **Show, don't tell** - Provide code examples, not just descriptions
- **Think like Sonnet** - What would you need to know to implement this without any context?
- **Test your plan** - Read it as if you knew nothing about the project

---

## Auto-Roll

After the execution YAMLs pass the quality checklist, invoke build:

`Skill("build", args="[executions-dir]")`

where `[executions-dir]` is the path to the executions directory created in Task 3 (e.g., `.gabbro/artifacts/executions/auth-redesign/`).

