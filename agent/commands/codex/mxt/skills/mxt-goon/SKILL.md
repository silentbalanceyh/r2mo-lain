---
name: mxt-goon
description: Use when the user asks Codex to continue/remediate an R2MO goon file by number, such as "$mxt-goon 001" or "mxt-goon 001"; reads .r2mo/task/goon-xxx.md, clears completed remediation items, and appends closure Changes to .r2mo/task/task-xxx.md.
---

# MXT Goon

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

Execute remediation items from an R2MO goon file by three-digit number and close the workflow loop in the corresponding task file.

## Arguments

The user must provide a three-digit number such as `001`.

If the number is missing, scan `.r2mo/task/` for `goon-*.md` files, read the `title` and `status` from each file's frontmatter, list the number and title for the user to choose from, and continue with the selected number. If no `goon-*.md` files exist, tell the user there are no pending remediation tasks.

If the number is provided but does not match `^[0-9]{3}$`, stop and say:

`请使用 $mxt-goon 001 格式执行，其中 001 是三位数字整改编号。`

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Set the goon path to `.r2mo/task/goon-<number>.md`.
3. Set the task path to `.r2mo/task/task-<number>.md`.
4. If either file is missing, do not guess another number and do not read another task/goon file; immediately ask the user for the latest task number.
5. **强制重新加载**：before editing, verification, remediation processing, deciding that there are no pending items, or printing the final prompt, read the current contents of `.r2mo/task/goon-<number>.md` from disk. 禁止使用上下文缓存、conversation history, previous end/goon summaries, model cache, or any previously read content as the basis for this run. The freshly read `goon-xxx.md` body is the only remediation input for this invocation; if it is empty or already marked done, report that based on the fresh read instead of skipping the read.
6. After the forced fresh load, before editing files or running verification, print only the final prompt below in a Markdown code block, replacing `<GOON_PATH>` and `<TASK_PATH>` with the actual paths.
7. Execute the final prompt.

Final prompt:

任务：根据 `<GOON_PATH>` 完成整改，并回写 `<TASK_PATH>` 闭环记录。

- **强制重新加载**：每次执行都必须重新从磁盘读取 `<GOON_PATH>` 当前内容；禁止使用上下文缓存、历史对话、上一轮 end/goon 摘要、模型缓存或之前读取过的内容判断是否需要整改。
- 输入范围：以本轮重新读取的 `goon-xxx.md` 作为唯一整改输入，并对照 `<TASK_PATH>` 原始任务目标。
- goon 标题：`<GOON_PATH>` frontmatter 的 title 必须保持为 `整改-` + `<TASK_PATH>` frontmatter 中的 title。
- 整改执行：逐项处理 `<GOON_PATH>` 中当前列出的整改项，避免偏离 `<TASK_PATH>` 的原始目标。
- 调度策略：根据整改复杂度判断是否启用 Team 模式；根据变更风险判断是否需要 worktree，用户已指定时必须创建。
- **质量门禁（写回前置，不可跳过）**：在清空 goon 或写 Changes 之前，必须按顺序通过以下门禁，任一门禁失败则不得写回，必须修复后重试（最多 3 轮自动修复；3 轮后仍未通过→停止，报告失败项，不写 Changes）：
  1. **编译零警告**：执行项目编译命令（如 `npm run build`、`mvn compile`、`tsc --noEmit` 等），编译必须零错误零警告。
  2. **Lint 零警告**：执行项目 lint 命令（如 `npm run lint`、`eslint .`、`npx tsc --noEmit` 等），lint 必须零错误零警告。
  3. **测试全通过**：若项目存在测试配置（`jest`、`mocha`、`vitest`、`pytest` 等），必须执行测试套件，全部通过方可继续。若项目无测试配置则跳过此门禁。
  4. **门禁结果记录**：将每个门禁的执行命令、输出结果（通过/失败）写入 Changes 记录。若某门禁不适用，记录为"跳过（不适用）"。
- goon 写回：**质量门禁全部通过且整改完成后必须先清空 `<GOON_PATH>` 原始内容**，再写入仍未完成的整改项。
- 无剩余项：若整改项已全部完成，将 `<GOON_PATH>` 重写为空整改单或无待整改项状态。
- Changes 写回：不得在 `<GOON_PATH>` 写 Changes；必须向 `<TASK_PATH>` 的 `## Changes` 追加整改完成情况、涉及文件、**质量门禁验证命令与结果**和闭环说明。

## Verification

Report the verification commands run, their results, whether the goon file was cleared or still contains remaining remediation items, and the Changes entry appended to the task file.
