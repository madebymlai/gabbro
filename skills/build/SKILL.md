---
name: build
description: Implementation workflow. Orchestrates an agent team to implement execution breakdowns. Use after /breakdown and /pmatch validation.
allowed-tools: Read, Glob, Grep, Task, Bash, Write, Edit
argument-hint: "[path/to/execution.yaml]"
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
- **description**: The user provides a path to an execution YAML (e.g., `.gabbro/artifacts/executions/auth-redesign.yaml`). Read it and understand the full task list, dependencies, and components.

  Group tasks into agent assignments (~5 tasks per agent) by component. Tasks in the same component go to the same agent. Respect `depends_on` — if agent B's tasks depend on agent A's tasks, they must be sequenced.

  Use `TeamCreate` with a descriptive name (e.g., `build-[feature]`).

### Task 2: Create teammate tasks with dependencies

- **activeForm**: Creating teammate tasks
- **description**: Create one task per agent assignment using `TaskCreate`. Determine execution order from task `depends_on` fields:
  - **Parallel**: Agent assignments with no cross-agent dependencies → spawn concurrently
  - **Sequential**: If agent B has tasks depending on agent A's tasks → set `addBlockedBy`

### Task 3: Spawn build teammates

- **activeForm**: Spawning build teammates
- **description**: Send a single message with one `Agent` tool call per agent assignment. **Each teammate must use `subagent_type: build`, `model: sonnet`, and `mode: bypassPermissions`.**

  **CRITICAL: Pass the YAML path and task IDs, not the content.** The teammate reads the execution YAML itself and implements only its assigned tasks.

  **Spawn prompt template** (use this exactly):

  ```
  Read the execution plan at [ABSOLUTE_PATH_TO_YAML].
  Implement tasks: [T-001, T-002, T-003, T-004, T-005]
  Working directory: [WORKING_DIRECTORY]

  For each task:
  1. Read the task's code block for the exact pattern
  2. Create/modify the files listed
  3. Verify acceptance_criteria
  4. Run tests listed in the task

  When done, mark your task as completed and message the lead with a summary.
  ```

  After spawning all teammates, enter **delegate mode** (Shift+Tab) to restrict yourself to coordination-only tools: spawning, messaging, shutting down teammates, and managing tasks. Leads should lead, not code.

  **File Ownership**: Ensure no two teammates edit the same file. Check `files.create` and `files.modify` across agent assignments. If you detect overlap, sequence those agents with task dependencies instead of running them in parallel.

### Task 4: Monitor teammates and update progress

- **activeForm**: Monitoring teammates
- **description**: While teammates work:
  - Watch for messages from teammates reporting blockers or failures
  - If a teammate gets stuck, message them with guidance or spawn a replacement
  - If a teammate finishes, verify their task is marked completed and check for newly unblocked tasks
  - Let teammates self-claim unblocked tasks — intervene only when needed
  - Update the execution YAML's `progress` section: set each task's status and timestamp, increment `completed` count

### Task 5: Shut down teammates and clean up team

- **activeForm**: Shutting down team
- **description**: Send `shutdown_request` to all build teammates. After all have shut down, call `TeamDelete` to clean up the team.

### Task 6: Run post-build validation

- **activeForm**: Validating build output
- **description**: Run post-build validation to confirm the implementation matches the plan:

  ```
  /pmatch [execution.yaml] [relevant modules]
  ```

  This validates that the implementation matches the plan.

## Success Criteria

The build orchestration is successful when:
1. All tasks in execution YAML completed by teammates
2. All acceptance criteria from all tasks verified
3. All tests passing (unit, integration, e2e as specified)
4. No linting or type checking errors
5. Success metrics from all sections achieved
6. Team cleaned up, no orphaned sessions
7. Post-build /pmatch validation passed

## Remember

- **You are the lead, not a builder** — delegate mode, don't write code
- **One teammate per component group** — ~5 tasks each, grouped by component
- **Pass the YAML path and task IDs** — teammates read the execution YAML themselves
- **Respect dependencies** — use task `blockedBy` for sequential sections
- **Avoid file conflicts** — two teammates editing the same file = overwrites
- **Document deviations** — if teammates deviate from the plan, understand why
- **Clean up** — shut down teammates before cleaning up the team
- **If a teammate fails** — collect details, understand why, decide whether to retry or halt

---

## Reference

- [Agent Teams Docs](https://code.claude.com/docs/en/agent-teams)
