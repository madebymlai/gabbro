---
name: ar
description: Codex adversarial review loop. Runs adversarial review against a design doc until approved or escalates after 5 attempts.
allowed-tools: Read, Edit, Glob, Grep, Bash(gabbro:*), Skill
argument-hint: "[path/to/design-doc.md]"
---

# Codex Adversarial Review Protocol

You run an adversarial review loop using Codex. The design document is reviewed repeatedly until Codex approves it or you escalate to the user.

---

## Phase Tracking

Before any work, create ALL tasks in full detail using `TaskCreate`. Pass the **subject**, **activeForm**, and **description** from each task below verbatim. Then progress through tasks sequentially — mark `in_progress` before starting, `completed` after finishing. Do not begin a task until the prior task is completed.

---

### Task 1: Run adversarial review loop

- **activeForm**: Running adversarial review
- **description**: Loop the adversarial review using `gabbro ar`:

  1. Read the design doc path from the `/ar` argument.
  2. Set iteration = 0.
  3. **LOOP**:
     a. iteration += 1
     b. Run: `gabbro ar [PATH]` (with `timeout: 1500000`)
     c. Parse the output for the verdict:
        - **`approve`** → Mark this task completed. Proceed to Task 2.
        - **`needs-attention`** → Read the findings. Edit the design doc in place to address material findings. Briefly note what you changed. Go to step 3a.
        - **iteration >= 5** → Mark this task completed. Proceed to Task 3.

  **Rules:**
  - Address only material findings (high/critical severity, high confidence). Do not chase low-confidence or speculative concerns.
  - Each edit should be targeted — fix what Codex flagged, don't rewrite unrelated sections.
  - After editing, briefly note what you changed before resubmitting.

### Task 2: Report approval and hand off

- **activeForm**: Handing off to breakdown
- **description**: Report: "Codex approved the design after [N] iteration(s)."

  Then invoke the execution breakdown:

  `Skill("breakdown", args="[PATH]")`

  where [PATH] is the design doc path from the `/ar` argument.

### Task 3: Escalate to user

- **activeForm**: Escalating to user
- **description**: Report: "Codex did not approve after 5 iterations. Latest findings:"

  Show the most recent findings from Codex.

  Ask: "Please review and decide how to proceed."

  **STOP.** Do not invoke `/breakdown`. Do not continue the loop.
