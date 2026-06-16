---
name: mxt-sync
description: Use when the user asks Codex to sync the current project with "$mxt-sync"; performs full git commit, pull, conflict-aware merge to develop/master, and push.
---

# MXT Sync

Sync the current project Git state: full commit, pull remote, conflict-aware merge to target branch, and push.

## Arguments

This command takes no arguments. Execute the sync flow directly.

**Hard rules**: Confirm workspace state before executing | Merge conflict → abort | Push failure → abort | Worktree check is mandatory | Conflict detection before merge

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. **Pre-flight check**: Run `git status` to inspect workspace state. If uncommitted changes exist, stage all and commit (`git add -A` + `git commit`). If no changes, skip commit.
3. Fetch from remote (`git fetch --all`). If fetch fails (network error, auth), **abort** and report the error.
4. **Conflict preview**: Before pulling or merging, run `git diff --name-only HEAD..origin/<current-branch>` to preview incoming changes. Run `git diff --name-only <current-branch>..<target-branch>` to preview merge divergence. If overlapping files exist, **warn** the user about potential conflicts before proceeding.
5. Pull from remote (`git pull origin <current-branch>`). If pull produces merge conflicts, **abort immediately** — do NOT attempt auto-resolve. Report conflicting files and advise the user to resolve manually.
6. Check for stale stash entries — if found, prompt user to confirm cleanup.
7. Check for extra worktrees — if found, prompt user to confirm cleanup.
8. Merge current branch into `develop` (first priority), or `master` if `develop` does not exist. If merge produces conflicts, **abort immediately** — do NOT attempt auto-resolve. Report conflicting files and advise manual resolution.
9. Push to the remote target branch. If push fails, **abort** and report the error. Do NOT force-push.

## Conflict Handling Rules

- **Never auto-resolve conflicts.** If `git merge` or `git pull` reports conflicts, immediately `git merge --abort` (or `git reset --merge`) and report.
- Report exact conflicting file paths so the user can resolve manually.
- After user resolves conflicts externally, they can re-run `$mxt-sync` to continue.

## Dry-Run Mode

If the user passes `--dry-run` or the workspace looks risky (many uncommitted changes, diverged branches), perform all checks and previews without executing any mutating git operations. Report what would happen.

## Verification

Report the current branch, target branch, merge result, and push result. If any step was aborted, clearly state which step failed and why.

## Next Steps

- Execute task → `$mxt-run <number>`
- Start environment → `$mxt-start`
- Debug issue → `$mxt-debug <description>`
