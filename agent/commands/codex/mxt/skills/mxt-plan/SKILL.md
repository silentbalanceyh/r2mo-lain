---
name: mxt-plan
description: Use when the user asks Codex to run the plan MXT workflow; produces a requirement-traceable execution contract.
---

# /mxt:plan

## HARNESS

1. Load before any action; silently skip missing files:
   AGENTS.md · CLAUDE.md · CODEX.md · .claude/rules/*.mdc · .codex/rules/*.mdc · .cursor/rules/*.mdc · .opencode/*.mdc · ~/.codex/rules/r2mo-task-workflow.md
2. Output English-first; quote localized repo strings verbatim when needed.
3. Disk is the only state carrier; re-read before every decision and write-back.
4. Print `Lock: <paths>` before first read; only locked paths may be mutated.
5. Run the smallest sufficient verification per change boundary; record skipped gates with reason.
6. When this skill declares a required superpowers skill, invoke it via the Skill tool; fall back manually only on explicit `skill not found` error.


## ARGUMENTS

| Form | Behaviour |
|---|---|
| `NNN` (3 digits) | Operate on `.r2mo/task/task-NNN.md`. |
| *(empty)* | Scan `.r2mo/task/task-*.md`; interactive picker (`title`+`status`). |
| Other | Abort with `Usage: /mxt:plan NNN` |

Resolve `NNN` only against current-directory `.r2mo/task/`; never parent/sibling/historical.

## LOCKED PATHS

`.r2mo/task/task-NNN.md` — sole writable target. Never mutate `status`, `## Changes`, goon, source, or sibling task files.

## CONTRACT

- Every step maps to ≥1 explicit requirement; untraceable steps are out of scope.
- Every step carries a concrete verification method and smallest affected boundary.
- Handoff-safe: a fresh RUN session executes from task body + Plan alone.
- Plan is the only output. No implementation.

## WORKFLOW

| # | Action |
|---|---|
| 1 | Parse `NNN`; emit `Lock:`; abort if file missing. |
| 2 | Read body. Empty → abort `Task body is empty. Cannot generate Plan.` |
| 3 | Invoke `superpowers:brainstorming` then `superpowers:writing-plans`. |
| 4 | Replace `## Plan` in place; never append duplicates. |
| 5 | Write-back guard: verify destination matches `Lock:`; re-read to confirm. |
| 6 | Report: locked path + requirement→step count. |

## RULES

- Do not touch `status` / `## Changes` / goon / source.
- Superpowers fallback only on `skill not found` error; never silently skip.

## NEXT

```text
/mxt:run NNN
/mxt:run NNN Team
/mxt:run NNN Worktree
```
