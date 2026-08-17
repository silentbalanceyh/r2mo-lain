---
description: "Run R2MO task by 3-digit number such as 001; read .r2mo/task/task-xxx.md and write back Changes. Quality gate mandatory before Done."
argument-hint: "[001] [directives...]"
---

# /mxt:run

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

Read `.r2mo/task/task-NNN.md` for the given number and execute the development task.

The user invoked this command with: $ARGUMENTS

## Arguments

1. `$ARGUMENTS` starts with a three-digit number (regex `^[0-9]{3}`), e.g. `001`.
2. Additional tokens are **directives** (space-separated, case-insensitive):
   - `Team` — force Team mode (multi-agent collaboration)
   - `Worktree` / `WT` — force Worktree isolation
3. Declare parsed results, e.g. `📌 Task: 005 | Directives: Team`. If no directives, declare task number only.
4. Directives override automatic judgment:
   - `Team` → enable Team mode regardless of complexity
   - `Worktree` → create Worktree regardless of risk assessment
5. **Worktree spec**: Name prefix `task-NNN` (e.g. `task-005`). Store in `.r2mo/worktrees/` under the current project (not global). Example: `git worktree add .r2mo/worktrees/task-005 -b task-005`.

**Hard rules**: Parse failure → abort. Directives override auto-judgment. Quality gate must pass before writing Done+Changes to `<TASK_PATH>`. Path conflict → abort. No reads/writes outside isolation lock.

## Workflow

1. Load repo entry rules and all `.mdc` rule files (see Harness § Rule loading).
2. Parse `$ARGUMENTS`: extract task number and directives. If empty, scan `.r2mo/task/task-*.md`, list for user selection. If no task files exist, prompt user to create one. If non-empty but does not match `^[0-9]{3}`, stop and print: `Usage: /mxt:run 001 [directives...] where 001 is a 3-digit task number.`
3. Set task path to `.r2mo/task/task-NNN.md`. If file does not exist, do not guess — ask user for correct number.
4. **Isolation lock**: Print `📌 Locked: .r2mo/task/task-NNN.md`. All reads/writes target this path only.
5. Read task body (after frontmatter). If empty, stop and return: `Task body is empty. Cannot execute /mxt:run.`
6. Print the final execution prompt in a Markdown code block before editing.
7. Execute the prompt below with `<TASK_PATH>` replaced by the actual relative path:

> **Task**: Execute the development task defined in `<TASK_PATH>`.
>
> - **Input**: Read body after frontmatter of `<TASK_PATH>`.
> - **Pre-check**: If body is empty, return "Task body is empty, not executed" and do not modify any file.
> - **Execution basis**: If `## Plan` exists, follow it. If no Plan, derive steps but do not write a Plan.
> - **Scheduling**: Auto-judge Team mode by complexity; auto-judge Worktree by risk. Directives override auto-judgment.
> - **Quality gate** (mandatory before Done/Changes, max 3 auto-retry rounds; 3 failures → stop, report, do not write Done):
>   1. **Compile zero-warning**: Run project compile (e.g. `npm run build`, `mvn compile`, `tsc --noEmit`). Must be zero errors, zero warnings. Fix and retry if warnings.
>   2. **Lint zero-warning**: Run project lint (e.g. `npm run lint`, `eslint .`). Must be zero errors, zero warnings.
>   3. **Tests pass**: If test config exists (`jest`, `mocha`, `vitest`, `pytest`), run the test suite. All must pass. Skip if no test config.
>   4. **Record results**: Write each gate's command, pass/fail status into Changes. If a gate is N/A, record as "skipped (N/A)".
> - **Write-back**: Set task status to Done and append `## Changes` (changed files, quality gate results, verification evidence) to `<TASK_PATH>` only. Never write Changes to a goon file.
> - **Isolation**: Do not read, edit, or create any `task-*.md` or `goon-*.md` other than `<TASK_PATH>` (except worker files in Team scheduling).

## Next Steps

- Verify task → `/mxt:end <number>`
- Remediation items → `/mxt:goon <number>`
- Re-verify after remediation → `/mxt:end <number>` (loop until clean)
- New bug → `/mxt:debug <description>`

## Verification

Report: verification commands executed, results, and the task file path written back.
