---
description: "Sync current project: conflict detection, smart commit, pull remote, merge to develop/master, and push."
argument-hint: ""
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

Sync current project Git state: conflict detection → smart commit → pull remote → merge to target branch → push.

The user invoked this command with: $ARGUMENTS

This command takes no arguments. Execute the sync flow directly.

**Hard rules**: Confirm workspace state before execution. Conflict detected → abort. Merge conflict → abort. Push failure → abort. Worktree check mandatory. Dry-run before intervention.

## Preflight

1. Load repo entry rules and all `.mdc` rule files (see Harness § Rule loading).

## Conflict Detection

Before any write operation, complete these checks:

1. `git status --porcelain` — check for uncommitted changes, list changed files
2. `git diff --name-only --diff-filter=U` — check for unresolved merge conflicts
3. `git fetch --all --dry-run 2>&1` — pre-check if remote has new commits (do not actually pull)
4. `git log HEAD..origin/<current-branch> --oneline` — check if local is behind remote
5. `git log origin/<current-branch>..HEAD --oneline` — check if local is ahead of remote

**Conflict handling**:
- Unresolved merge conflicts (diff-filter=U has output) → **abort immediately**, report conflict files, prompt user to resolve manually
- Local and remote diverged (both have new commits) → **abort and prompt**, suggest rebase or manual merge
- Remote has new commits and local has uncommitted changes → stash, pull, then stash pop; stash pop conflict → **abort**

## Plan

1. **Dry-run**: Display the operation checklist:
   - Current branch name, remote tracking branch
   - Uncommitted change count
   - Remote new commit count (how many behind)
   - Local ahead commit count
   - Target merge branch (develop first, then master, then main)
   - Stash count, worktree count
2. Smart commit (`git add -A` + `git commit`) — infer message from changes:
   - `.r2mo/task/` changes → `chore: task sync`
   - `src/` changes only → `feat: source sync`
   - Mixed changes → `chore: workspace sync`
   - No changes → skip commit
3. Pull and merge from remote (`git fetch --all` + `git pull origin <current-branch>`). Pull conflict → **abort**.
4. Check for extra stashes: if stash records exist, prompt user to confirm cleanup.
5. Check for extra worktrees: if extra worktrees exist, prompt user to confirm cleanup.
6. Merge to target branch (priority: develop > master > main):
   - `git checkout <target-branch>`
   - `git merge <current-branch>`
   - Merge conflict → **abort**, report files, do not auto-resolve
7. Push to remote: `git push origin <target>`

## Self-Check

After completion, verify results match expectations:
1. `git branch --show-current` — confirm returned to original working branch
2. `git status --porcelain` — confirm clean workspace (no residual uncommitted files)
3. `git log --oneline -3` — confirm latest commit includes this sync commit
4. If anomaly found (not on original branch / dirty workspace / missing commit) → report explicitly, do not silently ignore

## Verification

Report: pre-sync branch → post-sync branch, commit count (new/merged), conflict detection result (pass/found conflicts), target branch and push status, stash/worktree cleanup status.

## Next Steps

- Execute task → `/mxt:run <number>` or `$mxt-run <number>`
- Start environment → `/mxt:start` or `$mxt-start`
- Bug encountered → `/mxt:debug <description>` or `$mxt-debug <description>`
