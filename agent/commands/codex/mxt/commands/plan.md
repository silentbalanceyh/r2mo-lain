---
description: "Plan R2MO task by 3-digit number such as 001; write or update the Plan section in .r2mo/task/task-xxx.md."
argument-hint: "[001] [directives...]"
---

# /mxt:plan

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

Read `.r2mo/task/task-NNN.md` for the given number, generate an execution plan, and write it back to the `Plan` section of that task file.

The user invoked this command with: $ARGUMENTS

## Arguments

1. `$ARGUMENTS` starts with a three-digit number (regex `^[0-9]{3}`), e.g. `001`.
2. Additional tokens after the number are **directives** (space-separated, case-insensitive):
   - `Team` — flag subsequent run to force Team mode (plan itself does not activate it)
   - `Worktree` / `WT` — flag subsequent run to force Worktree isolation
   - `Deep` — enable deep analysis mode for a more detailed Plan
3. Declare parsed results, e.g. `📌 Task: 005 | Directives: Team, Worktree`. If no directives, declare task number only.

**Hard rules**: Parse failure → abort. Plan writes only `## Plan`. Path conflict → abort. No reads/writes outside isolation lock.

## Workflow

1. Load repo entry rules and all `.mdc` rule files (see Harness § Rule loading).
2. Parse `$ARGUMENTS`: extract task number and directives. If empty, scan `.r2mo/task/task-*.md` files, read each frontmatter `title` and `status`, list for user selection. If no task files exist, prompt user to create one first. If `$ARGUMENTS` is non-empty but does not match `^[0-9]{3}`, stop and print: `Usage: /mxt:plan 001 [directives...] where 001 is a 3-digit task number.`
3. Set task path to `.r2mo/task/task-NNN.md`. If the file does not exist, do not guess another number — ask the user for the correct task number.
4. **Isolation lock**: Print `📌 Locked: .r2mo/task/task-NNN.md`. All subsequent reads/writes target this path only.
5. Read the task body (after frontmatter). If the body is empty or whitespace-only, stop and return: `Task body is empty. Cannot generate Plan. Please populate the task file first.`
6. **Superpowers integration**: Assume superpowers is installed and call it directly. Do not rely on context banners or model self-introspection to judge availability (unreliable, causes false negatives).
   - Call `superpowers:brainstorming` to analyze the task; use results as Plan input.
   - Call `superpowers:writing-plans` to generate a structured Plan.
   - **Fallback only**: If the Skill tool returns an explicit "skill not found / not registered" error, proceed with manual analysis. Otherwise, must adopt superpowers output.
   - Declare path: `📌 Planning: Superpowers[brainstorming+writing-plans]` or `📌 Planning: Manual` (fallback only).
7. Print the final execution prompt in a Markdown code block before editing.
8. Execute the prompt below with `<TASK_PATH>` replaced by the actual relative path:

> **Task**: Generate an execution plan for `<TASK_PATH>`.
>
> - **Input**: Read body after frontmatter of `<TASK_PATH>`.
> - **Pre-check**: If body is empty, return "Task body is empty, Plan not generated" and do not modify any file.
> - **Write target**: Only the `## Plan` section of `<TASK_PATH>`.
> - **Write-back guard**: Verify destination path matches isolation lock before writing. If mismatch, stop and report path conflict.
> - **Write rule**: If `## Plan` already exists, update in place. Never append duplicate Plans.
> - **Plan content**: Goal decomposition, affected files/modules, execution steps, verification method, risks and handoff notes.
> - **Boundary**: Do not implement. Do not modify status. Do not append Changes. Do not create or modify goon files.
> - **Isolation**: Do not read, edit, or create any `task-*.md` or `goon-*.md` other than `<TASK_PATH>`.

## Next Steps

- Execute the task → `/mxt:run <number>`
- Team collaboration → `/mxt:run <number> Team`
- Isolated execution → `/mxt:run <number> Worktree`
- Verify after execution → `/mxt:end <number>`

## Verification

Report: `## Plan` write-back location, whether existing Plan was updated, Superpowers invocation status, and confirmation that no implementation was done and no Changes were appended.
