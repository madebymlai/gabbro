---
name: ar
description: Codex adversarial review loop. Runs /codex:adversarial-review against a design doc until approved or escalates after 5 attempts.
allowed-tools: Read, Edit, Glob, Grep, Skill, Bash(node:*)
argument-hint: "[path/to/design-doc.md]"
---

# Codex Adversarial Review Protocol

You run an adversarial review loop using Codex. The design document is reviewed repeatedly until Codex approves it or you escalate to the user.

---

## Phase Tracking

Before any work, create ALL tasks in full detail using `TaskCreate`. Pass the **subject**, **activeForm**, and **description** from each task below verbatim. Then progress through tasks sequentially — mark `in_progress` before starting, `completed` after finishing. Do not begin a task until the prior task is completed.

---

### Task 1: Discover Codex review command

- **activeForm**: Discovering Codex command
- **description**: Invoke the Codex adversarial review skill once to discover the resolved command:

  `Skill("codex:adversarial-review", args="--wait --model gpt-5.4 review the design document at [PATH] — challenge architecture, tradeoffs, assumptions, and failure modes")`

  The skill will load and show the full `node "..."` command with the resolved plugin path. **Note the exact command** — you will use it via Bash for all subsequent loop iterations.

  Run this first invocation. Parse the output for the verdict. If `approve`, proceed to Task 3. If `needs-attention`, note the findings and proceed to Task 2.

### Task 2: Run adversarial review loop

- **activeForm**: Running adversarial review
- **description**: Using the Bash command discovered in Task 1, loop the adversarial review:

  1. Read the design doc path from the `/ar` argument.
  2. Set iteration = 1 (Task 1 was iteration 1).
  3. **LOOP**:
     a. iteration += 1
     b. Read the findings from the previous iteration. Edit the design doc in place to address material findings.
     c. Briefly note what you changed.
     d. Re-run the review using the discovered Bash command (with `timeout: 600000`).
     e. Parse the Codex output for the verdict:
        - **`approve`** → Mark this task completed. Proceed to Task 3.
        - **`needs-attention`** → Go to step 3a.
        - **iteration >= 5** → Mark this task completed. Proceed to Task 4.

  **Rules:**
  - Address only material findings (high/critical severity, high confidence). Do not chase low-confidence or speculative concerns.
  - Each edit should be targeted — fix what Codex flagged, don't rewrite unrelated sections.
  - After editing, briefly note what you changed before resubmitting.

### Task 3: Report approval and hand off

- **activeForm**: Handing off to breakdown
- **description**: Report: "Codex approved the design after [N] iteration(s)."

  Then invoke the execution breakdown:

  `Skill("breakdown", args="[PATH]")`

  where [PATH] is the design doc path from the `/ar` argument.

### Task 4: Escalate to user

- **activeForm**: Escalating to user
- **description**: Report: "Codex did not approve after 5 iterations. Latest findings:"

  Show the most recent findings from Codex.

  Ask: "Please review and decide how to proceed."

  **STOP.** Do not invoke `/breakdown`. Do not continue the loop.
