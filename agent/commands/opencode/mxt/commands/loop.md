---
description: "Closed-loop task workflow: RUN → VERIFY → END → GOON → VERIFY → END_REVIEW cycle with remediation loop and checkpoint resume."
argument-hint: "<task-number>"
---

# /mxt:loop — Scoped Task Loop

## Harness

Binding execution contract for all MXT commands across Claude Code, Codex, and OpenCode.

- **English-first.** Write all output in English. Use Chinese only when quoting existing repo content (task titles, frontmatter values, status fields, localized error messages) or when the user explicitly asks.
- **Rule loading.** Load `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `.claude/rules/*.mdc`, `.codex/rules/*.mdc`, `.cursor/rules/*.mdc`, `.opencode/*.mdc`, and `~/.codex/rules/r2mo-task-workflow.md` before task action. Missing files do not block.
- **Argument contract.** Resolve the three-digit task number first. If absent, list `.r2mo/task/` candidates in the current directory only. Never resolve from parent/sibling/historical directories.
- **Isolation lock.** Print locked path(s) before reading. Only read/write locked `task-*.md` and `goon-*.md` files.
- **Disk source of truth.** Re-read locked files from disk before decisions and before write-back. Do not trust conversation memory, summaries, or cache.
- **Prompt echo.** Print the final action prompt in a code block before editing or execution.
- **Write-back guard.** Verify destination matches isolation lock before any write. Never duplicate `Plan` or `Changes`; update in place.
- **Fresh evidence.** Run the smallest sufficient verification for the changed boundary before claiming success. Record skipped gates with reason.
- **Cross-agent portability.** Keep prompts deterministic and safe for Claude Code, Codex skills, and OpenCode JSON templates.

Execute `RUN → VERIFY → END → [GOON → VERIFY → END_REVIEW]` — only enter the remediation loop when review produces items. Argument: `$ARGUMENTS`.

## File Model

Only two files per task:
- `.r2mo/task/task-NNN.md` — task body, `## Plan` section, and `## Changes` section.
- `.r2mo/task/goon-NNN.md` — current remediation items only. Cleared when no items remain.

No `loop-NNN.json`, no extra tracking files. Loop state is derived from the goon file: if goon-NNN.md is empty or has no pending items, the loop is closed.

## Immutable Contract

- Lock and only read/write `task-NNN.md` and `goon-NNN.md`.
- RUN/GOON are executors; END/END_REVIEW are independent reviewers — self-review is prohibited.
- Count remediation items mechanically via `grep -c '^## Remediation Item [0-9]\\+ —'`; zero count ends immediately. This count is the single source of truth for loop closure. END writes items and GOON clears them in this exact header format (see `/mxt:end` Remediation Item Format) so the count stays valid.
- RUN discovers applicable rules once and saves to memory; subsequent phases reuse without re-scanning.
- Full-workspace, K8S, BUGS, Chat, hot-start stability, and `agent-gate.sh all` are forbidden by default. Only enabled for task-scope, release verification, or explicit user request.

## Phase 1 — RUN

1. Lock task path, read task body and repo entry rules.
2. Discover and select relevant rules by task scope in one pass; reuse in later phases without re-scanning.
3. Executor implements the task in one pass, recording changed files.
4. Select minimal sufficient verification by priority:
   1. Real runtime environment, process ownership, listening ports, and business health paths
   2. Owning submodule targeted tests
   3. Task-required source guard, lint, compile
5. Record commands and results. Proceed to END.

## Phase 2 — END

1. Use a different reviewer. Read rules from RUN's saved list — do not re-scan.
2. Independently review against task body, diff, and evidence.
3. No issues → write goon as `status: Done`, empty items, loop closed immediately.
4. Has issues → write only current P0/P1 remediation items to goon, proceed to GOON.

## Phase 3 — GOON / END_REVIEW

1. Executor fixes only current goon items.
2. Re-run only affected runtime verification, targeted tests, and necessary quality gates — do not re-run unrelated full gates.
3. Independent reviewer re-checks fixes, removes resolved items, count mechanically.
4. **Zero items** → clear goon-NNN.md (rewrite as empty / no-pending-items), loop closed.
5. Still has items → continue loop. Two consecutive rounds with no decrease → mark Blocked/WONTFIX, stop meaningless retries.

## Completion

Loop complete: task-NNN.md is Done, goon-NNN.md is empty/cleared. Changes in task-NNN.md must list changed files, real runtime verification, targeted tests, necessary static gates, and scope rationale for skipped heavy gates.
