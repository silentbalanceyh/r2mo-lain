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

Sync current project end to end: pull latest and merge with conflict resolution → consolidate every stash and worktree into the current branch → full commit → full compile + lint with zero errors and zero warnings → converge to the single current branch → push that branch → refresh all globally installed SKILLs in the current environment.

The user invoked this command with: $ARGUMENTS

This command takes no arguments. Execute the sync flow directly.

**Hard rules**: Confirm workspace state before execution. Pull before quality gates. Conflict resolution required on merge conflict (do not abort on text conflicts — resolve them). Compile or lint failure → abort before push; warnings count as failures. All stashes must be applied into the current branch and dropped; all extra worktrees must be merged and removed; only the current branch may remain. Push the current branch only. Global SKILL refresh runs only after a successful push. Dry-run before intervention.

## Closed-Loop Contract

`mxt-sync` closes Git synchronization through state inspection → integration/commit → verification → push.

- **Pre-flight inventory.** Record branch, upstream, dirty files, unresolved conflicts, ahead/behind counts, stashes, worktrees, and extra local branches before writing.
- **No destructive integration.** Do not overwrite local or remote work. Preserve unrelated dirty files, integrate stashes and worktrees explicitly, resolve conflicts, and stop if safe resolution is impossible.
- **Mandatory consolidation.** Every stash is applied into the current branch and dropped; every linked worktree is merged and removed; every other local branch is merged or proven merged, then deleted. Only the current branch survives.
- **Verify before push.** Full compile, and lint when the project defines it, must pass with zero errors and zero warnings, with recorded commands and exit codes. Do not push after a failed gate.
- **Post-push self-check.** Confirm the final branch, clean/preserved workspace state, pushed commit/branch, and refreshed global SKILLs. Report anomalies instead of hiding them.
- **Global SKILL refresh.** After a successful push, update all globally installed SKILLs in the current environment from the synced sources, and verify each refreshed file.
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
6. `git stash list` — inventory every stash entry (all must be integrated later)
7. `git worktree list` — inventory linked worktrees (all must be merged later)
8. `git branch --format='%(refname:short)'` — inventory local branches (only the current one may remain)

**State handling**:

- Pre-existing unresolved merge conflicts (diff-filter=U has output) → **abort immediately**, report conflict files, prompt user to resolve first
- Local and remote diverged → pull with rebase or merge and resolve conflicts in the flow below
- Remote has new commits and local has uncommitted changes → stash, pull, then stash pop; stash pop conflict → resolve in the flow below
- Stashes, linked worktrees, or extra local branches present → do not abort; they are consolidated in the Plan flow

## Plan

1. **Dry-run**: Display the operation checklist before touching anything:
   - Current branch name, remote tracking branch
   - Uncommitted change count
   - Remote new commit count (how many behind)
   - Local ahead commit count
   - Stash count
   - Linked worktree list
   - Local branch list (count to be reduced to one)
2. **Pull latest and merge** (`git fetch --all` + `git pull origin <current-branch>`):
   - If pull reports merge conflicts → **resolve them**: open each conflicted file, reconcile both sides, keep the correct intent, remove conflict markers, `git add` the resolved files, then `git commit` (or `git merge --continue` / `git rebase --continue`) to complete the merge.
   - If pull reports no conflicts → continue.
   - If a rebase was triggered and conflicts arise → resolve each conflict, `git add`, `git rebase --continue` until the rebase completes.
3. **Stash convergence (mandatory)**: Apply every stash entry into the current branch and leave zero stashes behind.
   - Re-read `git stash list` before every apply; indices shift after each drop.
   - For each entry: `git stash apply stash@{0}` → resolve conflicts with the same resolution flow as step 2 → `git add` the resolved files → commit the applied changes → `git stash drop stash@{0}`.
   - Repeat until `git stash list` is empty.
   - Never run `git stash clear`. If an entry cannot be applied safely, stop, report the entry and conflicting files, and print the recovery command (`git stash apply stash@{n}`).
4. **Worktree convergence (mandatory)**: Merge every linked worktree back into the current branch and remove it.
   - `git worktree list` — enumerate the primary worktree and all linked worktrees.
   - For each linked worktree: commit any pending changes inside it on its own branch, then from the current branch run `git merge <worktree-branch>` and resolve conflicts with the same flow as step 2.
   - `git worktree remove <path>` (use `--force` only after the merge commit exists and the worktree is clean), then delete the merged worktree branch.
   - Repeat until `git worktree list` shows only the primary worktree. Never delete a worktree that still holds unmerged commits.
5. **Full smart commit** (`git add -A` + `git commit`) — stage every change (tracked, untracked, deletions) and infer the message from changes:
   - `.r2mo/task/` changes → `chore: task sync`
   - `src/` changes only → `feat: source sync`
   - Mixed changes → `chore: workspace sync`
   - No changes → skip commit
6. **Full compile (zero-error, zero-warning gate)**: Run the project full compile command (MDC-defined or default by stack: `npm run build` / `mvn compile` / `tsc --noEmit` / `go build ./...`). Zero errors, zero warnings. Fix and retry on warnings; **abort before push** on failure and report the error.
7. **Lint (zero-error, zero-warning gate, if the project defines it)**: Run the project lint command (MDC-defined or default: `npm run lint` / `eslint .` / `mvn checkstyle:check` / `golangci-lint run`). Skip only when the project has no lint configuration, and record the skip reason. Zero errors, zero warnings. Fix and retry on warnings; **abort before push** on failure and report the error.
8. **Single-branch convergence (mandatory)**: Keep only the current branch.
   - Lock the surviving branch with `git branch --show-current`.
   - For every other local branch: verify `git log <current>..<name>` is empty (fully merged), then `git branch -d <name>`; use `-D` only for a branch already proven merged.
   - If a branch holds commits not reachable from the current branch, merge it first (same resolution flow) and retry; if it still cannot be merged, stop and report it. Never discard unmerged commits.
   - Remote-tracking branches are not touched. Result: exactly one local branch remains.
9. **Push the current branch**: `git push origin <current-branch>` (add `--set-upstream` when no upstream exists). Push failure → **abort**, report the error. Never push any branch other than the current one.
10. **Global SKILL refresh (mandatory, after a successful push)**: Update every globally installed SKILL in the current environment from the sources just synced.
    - Reinstall the MXT skills and commands for the platforms present in this environment (`mxt ai-cmd`, selecting all platforms) so the Claude Code / Codex / OpenCode global caches match the synced sources.
    - Refresh the repository skill sources (`skills/`) into the active global skill directories that exist in this environment (for example `~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills`). Do not mirror `skills/` into `~/.pi/agent/skills`: that directory holds only the nine real `mxt-*` skills and is owned by `mxt ai-cmd` (Pi Agent platform), which also maintains the `/mxt-*` short-command aliases. Shared directories such as `~/.agents/skills` and `~/.claude/skills` keep receiving the repository skills because they serve every tool that reads them; Pi reading extra skills there does not change the nine `mxt-*` commands.
    - Verify each refreshed `SKILL.md` matches its source (hash or mtime) and report every refreshed path.
    - Skip this step only when the push did not happen; record the reason when skipped.

## Self-Check

After completion, verify results match expectations:

1. `git branch --show-current` — confirm the surviving branch is the one that was pushed
2. `git status --porcelain` — confirm a clean workspace (no residual uncommitted files)
3. `git log --oneline -3` — confirm the latest commit includes this sync commit
4. `git stash list` — confirm zero stashes remain
5. `git worktree list` — confirm only the primary worktree remains
6. `git branch --format='%(refname:short)'` — confirm exactly one local branch remains
7. `git log origin/<current-branch>..HEAD --oneline` — confirm the local branch is fully pushed
8. Global SKILL targets — confirm every refreshed `SKILL.md` matches the synced source
9. If any anomaly is found (wrong branch / dirty workspace / missing commit / residual stash or worktree / extra branch / stale global skill) → report explicitly, do not silently ignore

## Verification

Report: pre-sync branch → post-sync branch, pull/merge result (fast-forward / merged / conflicts resolved with file list), stash entries applied and dropped, worktrees merged and removed, remaining local branch count, compile result (pass/fail, command, exit code), lint result (pass/fail/skipped with reason), commit count (new/merged), push status for the current branch, and the list of refreshed global SKILL paths.

## Next Steps

- Execute task → `/mxt:run <number>` or `$mxt-run <number>`
- Start environment → `/mxt:start` or `$mxt-start`
- Bug encountered → `/mxt:debug <description>` or `$mxt-debug <description>`
