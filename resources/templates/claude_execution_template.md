# Execution Document Template
# Version 2.0 - Enhanced with Sonnet Feedback

This template is used by Opus during the Phase Planning Protocol to create detailed implementation plans that Sonnet can execute independently without needing clarification.

---

## Implementation Plan: [Feature Name]

### Overview
- **Objective**: [One clear sentence - what we're building and why]
- **Scope**:
  - Includes: [Explicitly list what's being built]
  - Excludes: [Explicitly list what's NOT being built - prevents scope creep]
- **Dependencies**:
  - [List ALL required packages with versions]
  - [Required services if any]
  - [Existing modules this depends on]
- **Estimated Complexity**: [Low/Medium/High] - [Explain why]

### Technical Clarifications (IMPORTANT)

#### Test Framework Configuration
```
[Specify the project's test framework and runner]
Structure: Tests colocated with source (same directory)
Coverage: Minimum 80%
```

#### File Locations
```
Principles:   .gabbro/principles.yaml
Agents:       .claude/agents/
Skills:       .claude/skills/
Resources:    .claude/resources/
```

#### Environment Setup
```bash
# [Project-specific environment setup steps]
```

### Technical Approach

#### Architecture Decisions
| Decision | Rationale | Alternative Considered | Why Rejected |
|----------|-----------|----------------------|--------------|
| [Decision 1] | [Why this approach] | [What else we considered] | [Why not] |
| [Decision 2] | [Why this approach] | [What else we considered] | [Why not] |

#### Module Placement
[Map each component to its exact file path]

#### Integration Points
- [List exact integration points between components]

#### Data Flow
```
Input: [Source] → [Format, size limits]
  ↓
Processing: [Step 1] → [Step 2] → [Step 3]
  ↓
Output: [Destination] → [Format, validation]
```

### Task Breakdown

#### Task 1: **[Exact Task Name]** (Module: `[exact/path]/`)
- **Description**: [One sentence - what this accomplishes]
- **Acceptance Criteria**:
  - [ ] [Specific measurable outcome - e.g., "Connection limit of 3 per IP enforced"]
  - [ ] [Edge case handled - e.g., "Gracefully handles Redis disconnect"]
  - [ ] [Performance met - e.g., "Response time <50ms"]
  - [ ] [Test written - e.g., "test_connection_limits validates all cases"]
- **Files to Create**:
  ```
  path/to/module/
  ├── implementation.ext         # Implementation logic
  ├── test_implementation.ext    # Tests (SAME DIRECTORY!)
  └── ...
  ```
- **Dependencies**: [Task X must be complete] or "None"
- **Configuration Required**:
  ```
  # Exact configuration or constants
  ```
- **Code Example**:
  ```
  # Show the EXACT pattern to follow
  ```
- **Test Cases** (file: `path/to/test_file.ext`):
  - `test_case_name`: Setup → Action → Expected result
  - `test_case_name`: Setup → Action → Expected result
  - Setup: [framework, fixtures, configuration]

#### Task 2: **[Next Task Name]** (Module: `[exact/path]/`)

#### Task N: **Final Polish** (Module: `[feature_module]`)
- **Description**: Ensure code quality, cleanup, and documentation completeness across every file touched by the above tasks (run this pass on all modified files, not just the primary module).
- **Acceptance Criteria**:
  - [ ] Unused imports and variables removed
  - [ ] All types exported and used correctly (no `any`)
  - [ ] Principles honored (see `.gabbro/principles.yaml`)
  - [ ] Tests pass and cover new logic
- **Dependencies**: All implementation tasks complete

### Testing Strategy (apply per module)
- Colocate tests near the code they test
- Target high coverage for new logic
- Add targeted unit and integration cases near the changed code; avoid central mega suites
- Confirm coverage deltas for the files touched by this task

### Success Criteria

#### Functional Requirements
- [ ] [Feature works as described in user story]
- [ ] [All acceptance criteria from tasks met]
- [ ] [Integration with existing features verified]

#### Non-Functional Requirements
- [ ] All tests passing
- [ ] No linting or type errors
- [ ] Performance targets met (if applicable)
