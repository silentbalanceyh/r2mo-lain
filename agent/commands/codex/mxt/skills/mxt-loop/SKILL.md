---
name: mxt-loop
description: Use when the user asks Codex to run the loop MXT workflow; cycles RUN/END/GOON/END_REVIEW in two isolated sessions until convergence.
---

# /mxt:loop

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
| `NNN` | Loop `task-NNN.md` to convergence. |
| *(empty)* | Scan `.r2mo/task/task-*.md`; interactive picker. |
| Other | Abort with `Usage: /mxt:loop NNN` |

## HOST RUNTIME

| Platform | Mechanism |
|---|---|
| Codex | `create_goal` — completes on 0 goon items after clean END. |
| Pi Agent | Two independent sessions; drive from disk. |
| Claude Code | `/loop` wrapper. |
| OpenCode | Two independent sessions; drive from disk. |

Blocked = 2 consecutive rounds without item-count decrease OR external blocker.
Session isolation unavailable → report and stop; never collapse into one session.

## SESSION ISOLATION (MANDATORY)

Two independent sessions, same host. Cross-tool delegation forbidden.

| Session | Owns |
|---|---|
| Dev | RUN + GOON |
| Review | END + END_REVIEW |

Sessions communicate **only** via `task-NNN.md` + `goon-NNN.md`. No shared context. Self-review prohibited.

## LOCKED PATHS

- `.r2mo/task/task-NNN.md`
- `.r2mo/task/goon-NNN.md`

## CONTRACT

- Counter (mechanical): `grep -c '^## Remediation Item [0-9]\+ —'`. Zero closes the loop.
- Phase identity is immutable: RUN implements; END adversarially reviews; GOON remediates only listed items; END_REVIEW independently verifies removals.
- Each phase obeys the corresponding single-phase skill contract verbatim. Invoke the named `/mxt:run`, `/mxt:goon`, or `/mxt:end` skill in the owning session; do not improvise a merged procedure.
- Two consecutive rounds with no item-count decrease → `Blocked`. No silent retry.
- Cosmetic / speculative findings never replace the queue.

## PHASES

| # | Phase | Operator | Reads | Writes |
|---|---|---|---|---|
| 1 | RUN | Dev | task body+Plan | `status: Done` + `## Changes` |
| 2 | END | Review | body+Plan+Changes | goon items (P0/P1) or no-pending |
| 3 | GOON | Dev | goon items | cleared + task `## Changes` |
| 4 | END_REVIEW | Review | re-verify cleared items | confirm removal or new P0/P1 |
| 5 | Loop → RUN | — | — | until item count = 0 |
| 6 | Blocked | Either | — | stop, preserve state |

## COMPLETION

`status: Done` + END clean + goon = 0 → report completion. Preserve task/goon as audit trail.

## NEXT

```text
Done → /mxt:end NNN
New overflow → /mxt:task <requirement>
```
