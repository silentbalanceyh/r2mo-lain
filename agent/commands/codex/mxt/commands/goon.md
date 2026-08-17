---
description: "Execute R2MO goon remediation by 3-digit number such as 001; read .r2mo/task/goon-xxx.md, clear completed items, append closure Changes to task."
argument-hint: "[001] [directives...]"
---

# /mxt:goon

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

Read `.r2mo/task/goon-NNN.md` for the given number, execute remediation tasks, and write closure results back to the corresponding task file.

The user invoked this command with: $ARGUMENTS

## Arguments

1. `$ARGUMENTS` starts with a three-digit number (regex `^[0-9]{3}`), e.g. `001`.
2. Additional tokens are **directives** (space-separated, case-insensitive):
   - `Team` — force Team mode (multi-agent collaboration)
   - `Worktree` / `WT` — force Worktree isolation
3. Declare parsed results, e.g. `📌 Task: 005 | Directives: Team`. If no directives, declare task number only.
4. Directives override auto-judgment:
   - `Team` → enable Team mode regardless of complexity
   - `Worktree` → create Worktree regardless of risk assessment
5. **Worktree spec**: Name prefix `task-NNN`. Store in `.r2mo/worktrees/` under current project. Example: `git worktree add .r2mo/worktrees/task-005 -b task-005`.

**Hard rules**: Parse failure → abort. Directives override auto-judgment. Changes write to task, not goon. Quality gate must pass before clearing goon + writing Changes. Path conflict → abort. Force reload goon from disk — no caching.

## Workflow

1. Load repo entry rules and all `.mdc` rule files (see Harness § Rule loading).
2. Parse `$ARGUMENTS`: extract task number and directives. If empty, scan `.r2mo/task/goon-*.md`, list for user selection. If no goon files exist, prompt: `No pending remediation tasks.` If non-empty but does not match `^[0-9]{3}`, stop and print: `Usage: /mxt:goon 001 [directives...] where 001 is a 3-digit remediation number.`
3. Set goon path to `.r2mo/task/goon-NNN.md` and task path to `.r2mo/task/task-NNN.md`. If either does not exist, do not guess — ask user for correct number.
4. **Isolation lock**: Print `📌 Locked: .r2mo/task/goon-NNN.md | .r2mo/task/task-NNN.md`. All reads/writes target these two paths only.
5. **Force reload**: Before any editing, verification, remediation processing, judging "no pending items", or printing the prompt — re-read `.r2mo/task/goon-NNN.md` from disk. Do not use context cache, conversation history, previous end/goon summaries, or model cache. The disk-read content is the sole remediation input for this round. If empty or status is already Done, report and stop.
6. Print the final execution prompt in a Markdown code block before editing.
7. Execute the prompt below with paths replaced by actual relative paths:

> **Task**: Complete remediation per `<GOON_PATH>` and write closure to `<TASK_PATH>`.
>
> - **Force reload**: Re-read `<GOON_PATH>` from disk. Do not use cache, history, or previous summaries.
> - **Input**: Use the freshly read goon content as the sole remediation input, cross-referenced with `<TASK_PATH>` original task goals.
> - **Goon title**: Keep frontmatter title as `Remediation-` + `<TASK_PATH>` frontmatter title.
> - **Remediation**: Process each item in `<GOON_PATH>` sequentially, staying within `<TASK_PATH>` original goals. Each item is a `## Remediation Item N — <title>` block (see `/mxt:end` Remediation Item Format). Fixes must converge toward the linked requirement — no divergence into adjacent modules, style, or speculative robustness.
> - **Scheduling**: Auto-judge Team mode by complexity; auto-judge Worktree by risk. Directives override auto-judgment.
> - **Quality gate** (mandatory before clearing goon or writing Changes, max 3 auto-retry rounds; 3 failures → stop, report, do not clear goon):
>   1. **Compile zero-warning**: Run project compile (e.g. `npm run build`, `mvn compile`, `tsc --noEmit`). Zero errors, zero warnings.
>   2. **Lint zero-warning**: Run project lint (e.g. `npm run lint`, `eslint .`). Zero errors, zero warnings.
>   3. **Tests pass**: If test config exists, run the suite. All must pass. Skip if no test config.
>   4. **Record results**: Write each gate's command, pass/fail into Changes. If N/A, record as "skipped (N/A)".
> - **Goon write-back**: After quality gate passes and remediation is complete, **clear `<GOON_PATH>` original content** first, then write any remaining incomplete items. Re-emit each remaining item in the exact `## Remediation Item N — <title>` format so the loop count stays valid. Renumber sequentially from 1.
> - **No remaining items**: If all items are done (i.e. `grep -c '^## Remediation Item [0-9]\+ —' <GOON_PATH>` returns 0), rewrite `<GOON_PATH>` as empty / no-pending-items status. The count, not the status field, is the single source of truth for loop closure.
> - **Changes write-back**: Do not write Changes to `<GOON_PATH>`. Append remediation completion, affected files, quality gate results, and closure notes to `<TASK_PATH>` `## Changes`.
> - **Write-back guard**: Verify destination matches isolation lock before writing. If mismatch, stop and report.
> - **Isolation**: Do not read, edit, or create any `task-*.md` or `goon-*.md` other than `<GOON_PATH>` and `<TASK_PATH>` (except worker files in Team scheduling).

## Next Steps

- Re-verify → `/mxt:end <number>`
- Still has items → `/mxt:goon <number>` (loop)
- New bug → `/mxt:debug <description>`
- All passed → task loop closed

## Verification

Report: verification commands executed and results, whether `<GOON_PATH>` was cleared or retains pending items, and the Changes appended to `<TASK_PATH>`.
