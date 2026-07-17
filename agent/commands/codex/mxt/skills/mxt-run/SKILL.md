---
name: mxt-run
description: Use when the user asks Codex to run an R2MO task by number, such as "$mxt-run 001" or "mxt-run 001"; reads .r2mo/task/task-xxx.md and writes back Changes. Quality gate (compile 0 warnings, lint 0 warnings, all gates pass) is mandatory before writing Done+Changes.
---

# MXT Run

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

Execute an R2MO task by three-digit task number.

## Arguments

The user must provide a three-digit number such as `001`.

If the number is missing, scan `.r2mo/task/` for `task-*.md` files, read the `title` and `status` from each file's frontmatter, list the number and title for the user to choose from, and continue with the selected number. If no `task-*.md` files exist, tell the user to create a task first.

If the number is provided but does not match `^[0-9]{3}$`, stop and say:

`请使用 $mxt-run 001 格式执行，其中 001 是三位数字任务编号。`

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Set the task path to `.r2mo/task/task-<number>.md`.
3. If the task file is missing, do not guess another number and do not read another task file; immediately ask the user for the latest task number.
4. Read the body after the frontmatter first. If it is empty or whitespace-only, stop immediately and return: `<TASK_PATH> 正文为空，当前不执行 /mxt-run，请先补充任务内容。`
5. Before reading the task body, editing files, or running verification, print only the final prompt below in a Markdown code block, replacing `<TASK_PATH>` with the actual path.
6. Execute the final prompt.

Final prompt:

任务：执行 `<TASK_PATH>` 中定义的开发任务。

- 输入范围：读取 `<TASK_PATH>` frontmatter 之后的正文。
- 前置校验：若正文为空或仅包含空白字符，返回"任务正文为空，未执行任务"，且不修改任何文件。
- 执行依据：若存在 `## Plan`，优先按 Plan 执行；若不存在 Plan，可自行补足执行步骤，但不得写入 Plan。
- 调度策略：根据任务复杂度判断是否启用 Team 模式；根据变更风险判断是否需要 worktree，用户已指定时必须创建。
- **质量门禁（写回前置，不可跳过）**：在将 status 更新为 Done 或追加 Changes 之前，必须按顺序通过以下门禁，任一门禁失败则不得写回 Done，必须修复后重试（最多 3 轮自动修复；3 轮后仍未通过→停止，报告失败项，不写 Done）：
  1. **编译零警告**：执行项目编译命令（如 `npm run build`、`mvn compile`、`tsc --noEmit` 等，按项目类型选择），编译必须零错误零警告。若有警告，必须修复后再通过。
  2. **Lint 零警告**：执行项目 lint 命令（如 `npm run lint`、`eslint .`、`npx tsc --noEmit` 等），lint 必须零错误零警告。若有警告，必须修复后再通过。
  3. **测试全通过**：若项目存在测试配置（`jest`、`mocha`、`vitest`、`pytest` 等），必须执行测试套件，全部通过方可继续。若项目无测试配置则跳过此门禁。
  4. **门禁结果记录**：将每个门禁的执行命令、输出结果（通过/失败）写入 Changes 记录。若某门禁不适用（如项目无 lint 配置），记录为"跳过（不适用）"。
- 写回要求：**质量门禁全部通过后**，将 status 更新为 Done，并向 `<TASK_PATH>` 追加 `## Changes` 记录。
- Changes 内容：包含变更摘要、涉及文件、**质量门禁验证命令与结果**。

## Verification

Report the verification commands run, their results, and the task file path written back. Include the quality gate results for each gate (compile, lint, test).
