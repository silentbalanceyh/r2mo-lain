---
name: mxt-sync
description: Use when the user asks Codex to run the sync MXT workflow; enforces scoped inputs, evidence-backed execution, and closed-loop handoff.
---

# /mxt:sync

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

Sync current project: pull latest and merge with conflict resolution → compile + lint → full commit → push to remote.

The user invoked this command with: $ARGUMENTS

This command takes no arguments. Execute the sync flow directly.

**Hard rules**: Confirm workspace state before execution. Conflict resolution required on merge conflict (do not abort on text conflicts — resolve them). Compile or lint failure → abort before push. Push failure → abort. Worktree check mandatory. Dry-run before intervention.

## Closed-Loop Contract

`mxt-sync` closes Git synchronization through state inspection → integration/commit → verification → push.

- **Pre-flight inventory.** Record branch, upstream, dirty files, unresolved conflicts, ahead/behind counts, stashes, and worktrees before writing.
- **No destructive integration.** Do not overwrite local or remote work. Preserve unrelated dirty files, resolve conflicts explicitly, and stop if safe resolution is impossible.
- **Verify before push.** Build, lint, and test/compile checks required by project rules must pass with recorded commands and exit codes. Do not push after a failed gate.
- **Post-push self-check.** Confirm the final branch, clean/preserved workspace state, and pushed commit/branch. Report anomalies instead of hiding them.
- **Failure rollback boundary.** Do not automatically revert user changes. If integration or verification fails, leave the repository in a safe explainable state and stop with recovery instructions.

## Preflight

1. Load repo entry rules and all `.mdc` rule files (see Harness § Rule loading).

## State Check

Before any write operation, complete these checks:

1. `git status --porcelain` — check for uncommitted changes, list changed files
2. `git diff --name-only --diff-filter=U` — check for unresolved merge conflicts (abort if any pre-exist)
3. `git fetch --all --dry-run 2>&1` — pre-check if remote has new commits (do not actually pull)
4. `git log HEAD..origin/<current-branch> --oneline` — check if local is behind remote
5. `git log origin/<current-branch>..HEAD --oneline` — check if local is ahead of remote

**State handling**:
- Pre-existing unresolved merge conflicts (diff-filter=U has output) → **abort immediately**, report conflict files, prompt user to resolve first
- Local and remote diverged → pull with rebase or merge and resolve conflicts in the flow below
- Remote has new commits and local has uncommitted changes → stash, pull, then stash pop; stash pop conflict → resolve in the flow below

## Plan

1. **Dry-run**: Display the operation checklist:
   - Current branch name, remote tracking branch
   - Uncommitted change count
   - Remote new commit count (how many behind)
   - Local ahead commit count
   - Target merge branch (develop first, then master, then main)
   - Stash count, worktree count
2. **Pull latest and merge** (`git fetch --all` + `git pull origin <current-branch>`):
   - If pull reports merge conflicts → **resolve them**: open each conflicted file, reconcile both sides, keep the correct intent, remove conflict markers, `git add` the resolved files, then `git commit` (or `git merge --continue` / `git rebase --continue`) to complete the merge.
   - If pull reports no conflicts → continue.
   - If a rebase was triggered and conflicts arise → resolve each conflict, `git add`, `git rebase --continue` until the rebase completes.
3. **Full smart commit** (`git add -A` + `git commit`) — stage every change (tracked, untracked, deletions) and infer the message from changes:
   - `.r2mo/task/` changes → `chore: task sync`
   - `src/` changes only → `feat: source sync`
   - Mixed changes → `chore: workspace sync`
   - No changes → skip commit
4. **Compile (zero-warning gate)**: Run the project compile command (MDC-defined or default by stack: `npm run build` / `mvn compile` / `tsc --noEmit` / `go build ./...`). Zero errors, zero warnings. If warnings → fix and retry. If failure → **abort before push**, report the error.
5. **Lint (zero-warning gate)**: Run the project lint command (MDC-defined or default: `npm run lint` / `eslint .` / `mvn checkstyle:check` / `golangci-lint run`). Zero errors, zero warnings. If failure → **abort before push**, report the error.
6. Check for extra stashes: if stash records exist, prompt user to confirm cleanup.
7. Check for extra worktrees: if extra worktrees exist, prompt user to confirm cleanup.
8. Merge to target branch (priority: develop > master > main):
   - `git checkout <target-branch>`
   - `git merge <current-branch>`
   - Merge conflict → **resolve them** (same resolution flow as step 2), then `git merge --continue`. Do not abort on text conflicts.
9. **Push to remote**: `git push origin <target>`. Push failure → **abort**, report error.

## Self-Check

After completion, verify results match expectations:
1. `git branch --show-current` — confirm returned to original working branch (or on target after push)
2. `git status --porcelain` — confirm clean workspace (no residual uncommitted files)
3. `git log --oneline -3` — confirm latest commit includes this sync commit
4. If anomaly found (not on expected branch / dirty workspace / missing commit) → report explicitly, do not silently ignore

## Verification

Report: pre-sync branch → post-sync branch, pull/merge result (fast-forward / merged / conflicts resolved with file list), compile result (pass/fail), lint result (pass/fail), commit count (new/merged), target branch and push status, stash/worktree cleanup status.

## Next Steps

- Execute task → `/mxt:run <number>` or `$mxt-run <number>`
- Start environment → `/mxt:start` or `$mxt-start`
- Bug encountered → `/mxt:debug <description>` or `$mxt-debug <description>`
