---
description: "Use when the user asks Codex to run the run MXT workflow; implements the task body and appends Changes with gate evidence."
argument-hint: "[NNN] [Team|Worktree]"
---

# /mxt:run

## HARNESS

1. Load before any action; silently skip missing files:
   AGENTS.md · CLAUDE.md · CODEX.md · .claude/rules/*.mdc · .codex/rules/*.mdc · .cursor/rules/*.mdc · .opencode/*.mdc · ~/.codex/rules/r2mo-task-workflow.md
2. Output English-first; quote localized repo strings verbatim when needed.
3. Disk is the only state carrier; re-read before every decision and write-back.
4. Print `Lock: <paths>` before first read; only locked paths may be mutated.
5. Run the smallest sufficient verification per change boundary; record skipped gates with reason.
6. When this skill declares a required superpowers skill, invoke it via the Skill tool; fall back manually only on explicit `skill not found` error.
## PROJECT INDEX HINT

If `.r2mo/repo/self/` already contains an `mxt coder` index, consult its `locate`, `expand`, or `status` projections when they help explain repository structure. If the index is absent, continue normally and skip the hint. Never implicitly run `scan` or `update` from a skill; updating remains user-initiated.



## ARGUMENTS

| Form | Behaviour |
|---|---|
| `NNN` | Operate on `.r2mo/task/task-NNN.md`. |
| `NNN Team` | Force multi-agent coordination. |
| `NNN Worktree` / `NNN WT` | Force worktree `.r2mo/worktrees/task-NNN` (branch `task-NNN`). |
| *(empty)* | Scan `.r2mo/task/task-*.md`; interactive picker. |
| Other | Abort with `Usage: /mxt:run NNN [Team\|Worktree]` |

Directives override automatic judgement; absence triggers auto-judge by complexity/risk.

## LOCKED PATHS

- `.r2mo/task/task-NNN.md` — mutable only for `status` + `## Changes`.
- `.r2mo/worktrees/task-NNN/` — only when Worktree directive or auto-judged risk demands.
- Worker scratch files (outside `task-*` namespace).

Never touch goon files or sibling task files.

## CONTRACT

- Requirement traceability: every change maps to a task requirement or current goon item.
- Changed-file inventory: capture every touched file; never omit fixtures affecting verification.
- Gates before `Done`: compile + lint + tests; each gate cites command/expected/actual/exit-code.
- No self-acceptance: DONE status requires independent END review.

## WORKFLOW

| # | Action |
|---|---|
| 1 | Parse `NNN` + directives; emit `Lock:`; abort if body empty. |
| 2 | Read body. `## Plan` present → execute its steps in order; else derive internal plan (do not write one). |
| 3 | Execute; track changed files as you go. |
| 4 | Run gates in order: compile → lint → tests. Each gate: command, expected, actual, exit code. Max 3 retries per gate; 3rd failure aborts. |
| 5 | All gates pass → `status: Done`; append `## Changes` with gate 4-tuples. |
| 6 | Write-back guard: re-read to confirm. |
| 7 | Report: changed-file inventory, gate table, status. |

## RULES

- Gate skipped → cite exact reason. No silent skip.
- Never write `## Changes` into a goon file.
- Worktree name/branch is `task-NNN`, under `.r2mo/worktrees/`.

## NEXT

```text
/mxt:end NNN
/mxt:goon NNN         # if END emits P0/P1 blockers
```
