---
name: mxt-sync
description: Use when the user asks Codex to sync the current project with "$mxt-sync"; performs full git commit, pull, conflict-aware merge to develop/master, and push.
---

# MXT Sync

## Harness

This Harness is the binding execution contract for this MXT command across Claude Code, Codex, and OpenCode. Treat localized sections below as legacy detail; this section wins when wording conflicts.

- English-first: write instructions, analysis, verification notes, and summaries in English by default. Use Chinese only when quoting existing repository content, preserving task titles/frontmatter/status values, showing exact localized command errors already required by this file, or when the user explicitly asks for Chinese.
- Rule loading: before task action, load repository entry rules (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`), project rule files (`.claude/rules`, `.codex/rules`, `.cursor/rules`, `.opencode`, other relevant `.mdc`), and `~/.codex/rules/r2mo-task-workflow.md` when present. Missing optional files do not block execution.
- Argument contract: resolve the explicit three-digit number first. If absent, list current-directory `.r2mo/task/` candidates only. Never resolve from parent, child, sibling, or historical timestamped task directories unless the user names that path.
- Task isolation lock: after resolving paths, print the locked path(s) before reading task content, and only read/write those locked `task-*.md`, `goon-*.md`, or `loop-*.json` files for this invocation.
- Disk source of truth: Do not trust conversation memory, previous summaries, installed plugin cache, or earlier reads. Re-read the locked files from disk immediately before decisions and again before write-back.
- Prompt echo: before editing, verification, or task execution, print the final action prompt in one Markdown code block with concrete paths substituted.
- Write-back guard: before any write, verify the destination exactly matches the isolation lock. Never duplicate `Plan` or `Changes`; update in place or append under the existing canonical section as instructed.
- Fresh evidence before completion claims: run the smallest sufficient verification for the changed boundary, read the output, and only then report success. Record skipped gates with the reason.
- Cross-agent portability: avoid tool-specific assumptions unless the platform section explicitly requires them. Keep prompts deterministic and safe for Claude Code, Codex skills, Codex prompts, and OpenCode JSON command templates.

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
