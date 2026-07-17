---
name: mxt-plan
description: Use when the user asks Codex to plan an R2MO task by number, such as "$mxt-plan 001" or "mxt-plan 001"; reads .r2mo/task/task-xxx.md and writes or updates only the Plan section.
---

# MXT Plan

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

Create a detailed execution plan for an R2MO task by three-digit task number.

## Arguments

The user must provide a three-digit number such as `001`.

If the number is missing, scan `.r2mo/task/` for `task-*.md` files, read the `title` and `status` from each file's frontmatter, list the number and title for the user to choose from, and continue with the selected number. If no `task-*.md` files exist, tell the user to create a task first.

If the number is provided but does not match `^[0-9]{3}$`, stop and say:

`请使用 $mxt-plan 001 格式执行，其中 001 是三位数字任务编号。`

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Set the task path to `.r2mo/task/task-<number>.md`.
3. If the task file is missing, do not guess another number and do not read another task file; immediately ask the user for the latest task number.
4. Read the body after the frontmatter first. If it is empty or whitespace-only, stop immediately and return: `<TASK_PATH> 正文为空，当前不执行 /mxt-plan，请先补充任务内容。`
5. Before reading the task body or editing the plan, print only the final prompt below in a Markdown code block, replacing `<TASK_PATH>` with the actual path.
6. Execute the final prompt.

Final prompt:

任务：为 `<TASK_PATH>` 生成执行计划。

- 输入范围：读取 `<TASK_PATH>` frontmatter 之后的正文。
- 前置校验：若正文为空或仅包含空白字符，返回“任务正文为空，未生成 Plan”，且不修改任何文件。
- 写回位置：仅写回 `<TASK_PATH>` 的 `## Plan` 章节。
- 写回规则：若 `## Plan` 已存在，则原位更新；不得重复追加多个 Plan。
- Plan 要求：包含目标拆解、涉及文件/模块、执行步骤、验证方式、风险与交接说明。
- 边界约束：不执行实现，不修改 status，不追加 Changes，不创建或修改 goon 文件。

## Verification

Report where `## Plan` was written, whether an existing plan was updated, and confirm no implementation, Changes append, or goon file edit was performed.
