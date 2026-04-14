---
name: build
description: Implementation workflow. Orchestrates an agent team to implement execution breakdowns. Use after /breakdown and /pmatch validation.
allowed-tools: Read, Glob, Grep, Task, Bash, Write, Edit
argument-hint: "[path/to/executions-dir]"
agents:
  - name: build
    model: sonnet
    mode: bypassPermissions
---

# Opus Build Orchestration Protocol

## Your Role
You are the **team lead**. You orchestrate an agent team to implement prevalidated execution plans. The execution document contains delegated sections for multiple build agents. Your job is to spawn teammates, assign tasks, monitor progress, and validate output. **You do not write code yourself** — you coordinate.

---

## Phase Tracking

After creating the team, create ALL tasks in full detail using `TaskCreate`. Pass the **subject**, **activeForm**, and **description** from each task below verbatim. Then progress through tasks sequentially — mark `in_progress` before starting, `completed` after finishing. Do not begin a task until the prior task is completed.

---

### Task 1: Load execution plan and create team

- **activeForm**: Creating team
- **description**: The user provides a path to an executions directory (e.g., `.gabbro/artifacts/executions/auth-redesign/`). Read all agent YAMLs (`01-*.yaml`, `02-*.yaml`, etc.) and understand each agent's tasks and dependencies.

  Each YAML already defines ~5 tasks for one build agent. Respect filename ordering — if `02-api.yaml` depends on `01-core.yaml`, they must be sequenced.

  Use `TeamCreate` with a descriptive name (e.g., `build-[feature]`).

### Task 2: Create teammate tasks with dependencies

- **activeForm**: Creating teammate tasks
- **description**: Create one task per agent YAML using `TaskCreate`. Determine execution order from the `depends_on` field in each YAML:
  - **Parallel**: Agent YAMLs with no dependencies → spawn concurrently
  - **Sequential**: If YAML B depends on YAML A → set `addBlockedBy`

### Task 3: Spawn build teammates

- **activeForm**: Spawning build teammates
- **description**: Send a single message with one `Agent` tool call per agent YAML. **Each teammate must use `subagent_type: build`, `model: sonnet`, and `mode: bypassPermissions`.**

  **CRITICAL: Pass the YAML path, not the content.** The teammate reads its execution YAML and implements all tasks within it.

  **Spawn prompt template** (use this exactly):

  ```
  Read the execution plan at [ABSOLUTE_PATH_TO_YAML].
  Implement all tasks in this YAML.
  Working directory: [WORKING_DIRECTORY]

  For each task:
  1. Read the task's code block for the exact pattern
  2. Create/modify the files listed
  3. Verify acceptance_criteria
  4. Run tests listed in the task

  When done, mark your task as completed and message the lead with a summary.
  ```

  After spawning all teammates, enter **delegate mode** (Shift+Tab) to restrict yourself to coordination-only tools: spawning, messaging, shutting down teammates, and managing tasks. Leads should lead, not code.

  **File Ownership**: Breakdown already ensures no two agent YAMLs edit the same file. If you detect overlap, sequence those agents with task dependencies instead of running them in parallel.

### Task 4: Monitor teammates and update progress

- **activeForm**: Monitoring teammates
- **description**: While teammates work:
  - Watch for messages from teammates reporting blockers or failures
  - If a teammate gets stuck, message them with guidance or spawn a replacement
  - If a teammate finishes, verify their task is marked completed and check for newly unblocked tasks
  - Let teammates self-claim unblocked tasks — intervene only when needed

### Task 5: Shut down teammates and clean up team

- **activeForm**: Shutting down team
- **description**: Send `shutdown_request` to all build teammates. After all have shut down, call `TeamDelete` to clean up the team.

### Task 6: Run post-build validation

- **activeForm**: Validating build output
- **description**: Run post-build validation to confirm the implementation matches the plan:

  ```
  /pmatch [executions-dir] [relevant modules]
  ```

  This validates that the implementation matches the plan.

## Success Criteria

The build orchestration is successful when:
1. All tasks in all agent YAMLs completed by teammates
2. All acceptance criteria from all tasks verified
3. All tests passing (unit, integration, e2e as specified)
4. No linting or type checking errors
5. Success metrics from all sections achieved
6. Team cleaned up, no orphaned sessions
7. Post-build /pmatch validation passed

## Remember

- **You are the lead, not a builder** — delegate mode, don't write code
- **One teammate per agent YAML** — each YAML already has ~5 tasks
- **Pass the YAML path** — teammates read their execution YAML themselves
- **Respect dependencies** — use task `blockedBy` for sequential YAMLs
- **Avoid file conflicts** — two teammates editing the same file = overwrites
- **Document deviations** — if teammates deviate from the plan, understand why
- **Clean up** — shut down teammates before cleaning up the team
- **If a teammate fails** — collect details, understand why, decide whether to retry or halt

---

## Reference

- [Agent Teams Docs](https://code.claude.com/docs/en/agent-teams)
