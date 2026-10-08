---
description: "Use when the user asks Codex to run the sync MXT workflow; integrates, commits, gates, pushes, and refreshes globally installed skills."
argument-hint: ""
---

# /mxt:sync

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

None.

## PRECONDITIONS

Single checked-out branch (not detached). Safe working state.

## STATE CHECK

| Item | Expected | Failure action |
|---|---|---|
| Branch | exactly one local | abort |
| Upstream | set | use `--set-upstream` at push |
| Detached HEAD | false | abort |
| Stashes | inventoried | apply + drop each, in order |
| Extra worktrees | 0 besides current | merge + remove each, or abort |
| Extra local branches | consolidated to 0 | merge or prove-merged, then delete |
| Conflicts | 0 | resolve before commit |
| Dirty files | inventoried | commit as one sync commit |
| Ahead/behind | reconciled | pull + merge first |

## WORKFLOW

| # | Action |
|---|---|
| 1 | `git fetch --prune`. |
| 2 | `git pull --rebase --autostash`. Text conflict → resolve; never abort. |
| 3 | Commit all dirty files as one sync commit. |
| 4 | Gates in order: compile → lint → tests. Zero errors/warnings. ≤3 retries per gate; 3rd failure aborts. |
| 5 | Apply + drop every stash. Merge + remove every extra worktree. Merge-or-delete every other local branch. Survivor: current only. |
| 6 | `git push origin <current>` (+`--set-upstream` if needed). Push failure → abort, report. |
| 7 | Push success → refresh every globally installed MXT skill mirror. |
| 8 | Post-push self-check: branch, clean state, pushed SHA, gate exit codes. |
| 9 | Report: branch, SHA, gates, mirrors updated, anomalies. |

## MIRROR REFRESH TARGETS

On push success, sync `agent/commands/codex/mxt/skills/<name>/SKILL.md` and matching `commands/*.md` to:

- `~/.codex/plugins/mxt/` (skills + commands)
- `~/.codex/plugins/cache/mxt-skills/mxt/1.0.0/` (skills + commands)
- `~/.codex/marketplaces/mxt-skills/plugins/mxt/` (skills + commands)
- `~/.codex/prompts/` (command aliases)
- `~/.claude/plugins/cache/mxt-skills/mxt/1.0.0/` (skills + commands)
- `~/.claude/plugins/marketplaces/mxt-skills/` (skills + commands)
- `~/.pi/agent/skills/` (skills only — 9 `mxt-*`; never the 18 product-local `skills/` pack)

Mirror dirs are created when missing. Report every refreshed path.

## RULES

- Never force-push. Never push a branch other than current.
- Never run `git stash clear`; leave an unsafe stash recoverable and report its `stash@{N}`.
- Never silently overwrite local or remote work.
- Failure at any gate stops before push. Leave repo explainable; never auto-revert user changes.
- Refresh step skipped only when push did not happen; record reason.

## NEXT

```text
Back to task → /mxt:plan NNN
Restart env → /mxt:start
Baseline check → /mxt:doctor
```
