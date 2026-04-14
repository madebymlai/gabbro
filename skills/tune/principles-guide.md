# Principles Catalog

## How to use this guide

You are being loaded by the /tune skill to help set up coding principles for this project.

### Presenting to the user
- Present ALL principles (foundational + additional + language-specific) by category using AskUserQuestion with multiSelect: true
- ALL options are pre-selected — the user deselects what doesn't apply, not the other way around
- Max 4 options per AskUserQuestion — split categories with more than 4 into multiple questions
- Each option label = principle name, description = the Rule text
- After the catalog phase, explore the codebase and propose additional codebase-specific principles one at a time

### Output format
Write accepted principles to `.gabbro/principles.yaml` using the format from `@resources/templates/principles_template.yaml` (the guide loads this template via @ reference — it's just a structural template, not content to repeat).

---

## Principles Catalog

All available principles live in `@resources/templates/principles_catalog.yaml` (loaded via @ reference). This file uses the same YAML schema as `principles_template.yaml`.

The catalog contains ALL principles — foundational, additional, and language-specific. Each is an individual checkmark option, ALL pre-selected by default. The user deselects what doesn't apply.

Present by category using AskUserQuestion with multiSelect: true (max 4 per question). After the catalog phase, explore the codebase for additional codebase-specific principles.

---

## Probe Instructions

After the catalog phase, explore the codebase to discover project-specific patterns worth adding as principles.

### Step 1: Detect project stack
Use `mcp__codebase-memory-mcp__get_architecture` to identify:
- Primary language(s)
- Frameworks (web, testing, ORM)
- Build tools

This determines which language-specific principles to include in the catalog phase.

### Step 2: Search for anti-patterns
Run these searches and propose principles for any findings:

| Search | What it finds | Principle to propose |
|--------|--------------|---------------------|
| `search_code("try.*catch\\s*\\{\\s*\\}")` | Empty catch blocks | No Silent Error Swallowing |
| `search_code("catch\\s*\\(.*\\)\\s*\\{\\s*//")` | Commented-out error handling | No Silent Error Swallowing |
| `search_code("SELECT.*\\+\\s*[\"']")` or `search_code("f\"SELECT")` | SQL injection risk | Parameterized Queries Only |
| `search_code("password\\s*=\\s*[\"']")` | Hardcoded secrets | No Secrets in Code |
| `search_code("\\.unwrap\\(\\)")` (Rust) | Panicking library code | No unwrap in Library Code |
| `search_code("as any")` (TS) | Type safety escapes | No Any Types |
| `search_code("except:")` (Python) | Bare except clauses | No Bare Except |

### Step 3: Discover project-specific patterns
Look for patterns unique to this codebase:
- `Glob("**/Dockerfile*")` → if found, propose "Multi-stage builds" or "No root user in containers"
- `Glob("**/*.proto")` → if found, propose "Backward-compatible proto changes"
- `Glob("**/migrations/**")` → if found, propose "Reversible migrations" or "No data-destructive migrations"
- `search_graph(label="Class", name_pattern="*Controller*")` → if MVC pattern, propose "Thin controllers"
- `search_graph(label="Class", name_pattern="*Singleton*")` → if found, propose "Avoid singletons — use dependency injection"

For each discovery, use AskUserQuestion with 2 options:
- "Add this principle" (description shows the Rule and Ask questions)
- "Skip"

The user can also use "Other" to modify the principle text.
