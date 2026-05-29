---
name: mxt-sync
description: Use when the user asks Codex to sync the current project with "$mxt-sync"; performs full git commit, pull, merge to develop/master, and push.
---

# MXT Sync

Sync the current project Git state: full commit, pull remote, merge to target branch, and push.

## Arguments

This command takes no arguments. Execute the sync flow directly.

**Hard rules**: Confirm workspace state before executing | Merge conflict → abort | Push failure → abort | Worktree check is mandatory

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Stage all changes and commit (`git add -A` + `git commit`).
3. Fetch and pull from remote (`git fetch --all` + `git pull`).
4. Check for stale stash entries — if found, prompt user to confirm cleanup.
5. Check for extra worktrees — if found, prompt user to confirm cleanup.
6. Merge current branch into `develop` (first priority), or `master` if `develop` does not exist.
7. Push to the remote target branch.

## Verification

Report the current branch, target branch, merge result, and push result.
