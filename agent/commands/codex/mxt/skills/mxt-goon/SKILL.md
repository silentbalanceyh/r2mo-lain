---
name: mxt-goon
description: Use when the user asks Codex to run the goon MXT workflow; remediates exactly the listed items and appends closure evidence.
---

# /mxt:goon

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
| `NNN` | Read `.r2mo/task/goon-NNN.md`. |
| `NNN Team` | Force multi-agent within scope. |
| `NNN Worktree` / `NNN WT` | Force worktree `.r2mo/worktrees/task-NNN`. |
| *(empty)* | Scan `.r2mo/task/goon-*.md`; interactive picker. |

Missing goon → abort `goon-NNN.md not found`.

## LOCKED PATHS

- `.r2mo/task/goon-NNN.md` — read + rewrite items.
- `.r2mo/task/task-NNN.md` — append-only `## Changes`.

No other task/goon file is writable.

## CONTRACT

- Goon is the sole input; ignore chat history, prior rounds, unstated intent.
- Fix exactly the listed `## Remediation Item N — <title>` entries. No unrelated refactor.
- Per item: implement → run its stated verification command → capture exit code.
- Item cleared only when its verification passes. Preserved items keep original text; renumber survivors from 1.
- Closure evidence appended to task `## Changes`, never to goon beyond the item list rewrite.

## WORKFLOW

| # | Action |
|---|---|
| 1 | Parse `NNN`; emit `Lock:` on goon + task. |
| 2 | Read goon from disk. Parse each `## Remediation Item N —` header. Zero → exit 0. |
| 3 | Sequential: implement minimal fix scoped to the item's acceptance criteria. |
| 4 | Run its verification command; record exit code + outcome. |
| 5 | Pass → remove from goon. Fail → retain. Renumber survivors. |
| 6 | Append `## Changes` to `task-NNN.md`: attempted list, per-item result, remaining count. |
| 7 | Write-back guard: re-read both files. |
| 8 | Report: attempted count, pass/fail split, remaining count. |

## RULES

- Do not invent items. Do not refactor for taste.
- Verification command comes from the item, never improvised.
- Team directive spawns workers only inside this task scope.

## NEXT

```text
/mxt:end NNN       # re-verify remaining items
```
