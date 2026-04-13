# Adversarial Review: 02-tokf-integration

## Summary

Design is sound in structure but has two critical issues: macOS install path requires sudo (guaranteed failure), and `tokf hook install` may overwrite existing PreToolUse hooks (would destroy codebase-memory hooks). Both are fixable before implementation. Note: Enforcer and Nemesis reviews failed due to Gemma 4 tool-calling incompatibility — findings are from Inquisitor only.

## Critical (Must Address)

### F1: macOS install dir `/usr/local/bin` requires sudo
**Flagged by**: Inquisitor  |  **Confidence**: High

The design places tokf in `/usr/local/bin` on macOS. This directory is `root:755` — `mkdir -p` and `tar xzf -C` will fail with `EACCES` for non-root users, which is the normal case.

| Factor | Assessment |
|--------|------------|
| Severity | System failure — install aborts with permission error |
| Probability | Guaranteed on macOS |
| Remediation Cost | Simple fix — use `~/.local/bin` uniformly across all unix platforms |
| Reversibility | Fixable later but affects first-run experience |
| Context Fit | High — macOS is likely the primary dev platform |

**Mitigation**: Use `~/.local/bin` on all unix platforms (Linux and macOS). Print a warning if it's not on `$PATH`.

### F9: `tokf hook install` may overwrite existing PreToolUse hooks
**Flagged by**: Inquisitor  |  **Confidence**: High

`~/.claude/settings.json` already has a `PreToolUse` hook (`cbm-code-discovery-gate`). The tokf test suite's `preserves_existing_settings` test only verifies OTHER hook types (`PostToolUse`) survive — it does not test merging within the `PreToolUse` array. If `tokf hook install --global` replaces the `PreToolUse` array, codebase-memory hooks are destroyed.

| Factor | Assessment |
|--------|------------|
| Severity | System failure — destroys active codebase-memory hooks |
| Probability | Common path — global install targets the file that already has PreToolUse hooks |
| Remediation Cost | Moderate — must verify tokf's merge behavior; if it overwrites, handle merge in installer or fix upstream |
| Reversibility | Load-bearing decision now — destroyed hooks must be manually restored |
| Context Fit | High — codebase-memory hooks are used in every session |

**Mitigation**: Before implementing, test `tokf hook install --global` on a settings.json that already has PreToolUse entries with a different matcher. If tokf appends correctly, document it. If it overwrites, either: (a) file an upstream issue, (b) back up settings.json before running `tokf hook install` and restore non-tokf entries after, or (c) skip `tokf hook install` and write the hook entry directly in the installer.

## Recommended (High Value)

### F2: No checksum verification on downloaded tarballs
**Flagged by**: Inquisitor  |  **Confidence**: High

Every tokf release asset has a companion `.sha256` file. The design downloads via `curl | tar xzf -` with no integrity check.

| Factor | Assessment |
|--------|------------|
| Severity | System failure if exploited (arbitrary code execution) |
| Probability | Edge case — requires MITM or CDN compromise |
| Remediation Cost | Simple fix — download `.sha256`, verify with `shasum -a 256 -c` (~5 lines) |
| Reversibility | Fixable later |
| Context Fit | Medium — SHA256 files are already published, trivial to use |

**Mitigation**: Download tarball to temp file, download `.sha256`, verify with `shasum -a 256 -c`, then extract.

### F3: `httpsGetJson` has no HTTP status code handling
**Flagged by**: Inquisitor  |  **Confidence**: High

The function only checks for 3xx redirects. A 403 (GitHub rate limit — 60 req/hr unauthenticated) returns `{"message":"API rate limit exceeded"}`, which parses successfully but then `releases.find()` on a non-array throws a confusing error.

| Factor | Assessment |
|--------|------------|
| Severity | Degraded UX — confusing error instead of clear "rate limited" |
| Probability | Common path — 60 req/hr limit is easy to hit during development |
| Remediation Cost | Simple fix — check `statusCode >= 400`, throw descriptive error |
| Reversibility | Fixable later |
| Context Fit | High — installer runs infrequently but clear errors matter when it fails |

**Mitigation**: Add `if (res.statusCode >= 400) throw new Error(...)` with status code and response body.

### F7: Existing test signatures break silently
**Flagged by**: Inquisitor  |  **Confidence**: Medium

`mergeMcpJson(name, server)` currently takes 2 args. The new version takes 3 `(name, server, scope)`. Existing tests call with 2 args — `scope` is `undefined`, which falls through to project path. Tests pass by accident.

| Factor | Assessment |
|--------|------------|
| Severity | Minor inconvenience — tests pass but are incorrect |
| Probability | Guaranteed — existing tests call with 2 args |
| Remediation Cost | Simple fix — update test calls to pass explicit `'project'` |
| Reversibility | Fixable later |
| Context Fit | Medium — tests should be correct, not accidentally passing |

**Mitigation**: Update existing test calls to pass `'project'` as third argument.

## Noted (Awareness)
- **F4: GitHub API pagination risk**: Multi-crate workspace could push `tokf-v*` off page 1. Add `?per_page=100` if it becomes an issue.
- **F5: Redirect loop no depth limit**: Add a `maxRedirects` counter. Extremely unlikely in practice.
- **F6: Empty Enter defaults to project**: Re-prompt on empty input for better UX. Low risk for single-developer project.
- **F8: Scope inconsistency (MCP global, external-agents project)**: Intentional by design — document in the solution doc with a comment explaining why.

## Reviewer Notes

- **Enforcer** (google/gemma-4-26b-a4b-it): Failed — model fell into conversational mode asking for principles instead of reading them autonomously.
- **Nemesis** (google/gemma-4-31b-it): Failed — model returned empty content on turn 1. Diagnosed as tool-schema overload (19 tools) causing blank generation.
- Root cause: Gemma 4 models have known tool-calling format issues across runtimes (Ollama, mlx-lm, OpenRouter). See memory: `project_gemma4_tool_calling.md`.

## Recommendation
[x] REVISE — Critical issues require design changes before /breakdown
