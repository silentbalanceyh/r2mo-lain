---
name: mxt-goon
description: Use when the user asks Codex to continue/remediate an R2MO goon file by number, such as "$mxt-goon 001" or "mxt-goon 001"; reads .r2mo/task/goon-xxx.md, clears completed remediation items, and appends closure Changes to .r2mo/task/task-xxx.md.
---

# MXT Goon

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
5. Before reading the goon body, editing files, or running verification, print only the final prompt below in a Markdown code block, replacing `<GOON_PATH>` and `<TASK_PATH>` with the actual paths.
6. Execute the final prompt.

Final prompt:

任务：根据 `<GOON_PATH>` 完成整改，并回写 `<TASK_PATH>` 闭环记录。

- 输入范围：读取 `<GOON_PATH>` 当前整改项，并对照 `<TASK_PATH>` 原始任务目标。
- goon 标题：`<GOON_PATH>` frontmatter 的 title 必须保持为 `整改-` + `<TASK_PATH>` frontmatter 中的 title。
- 整改执行：逐项处理 `<GOON_PATH>` 中当前列出的整改项，避免偏离 `<TASK_PATH>` 的原始目标。
- 调度策略：根据整改复杂度判断是否启用 Team 模式；根据变更风险判断是否需要 worktree，用户已指定时必须创建。
- **质量门禁（写回前置，不可跳过）**：在清空 goon 或写 Changes 之前，必须按顺序通过以下门禁，任一门禁失败则不得写回，必须修复后重试（最多 3 轮自动修复；3 轮后仍未通过→停止，报告失败项，不写 Changes）：
  1. **编译零警告**：执行项目编译命令（如 `npm run build`、`mvn compile`、`tsc --noEmit` 等），编译必须零错误零警告。
  2. **Lint 零警告**：执行项目 lint 命令（如 `npm run lint`、`eslint .`、`npx tsc --noEmit` 等），lint 必须零错误零警告。
  3. **测试全通过**：若项目存在测试配置（`jest`、`mocha`、`vitest`、`pytest` 等），必须执行测试套件，全部通过方可继续。若项目无测试配置则跳过此门禁。
  4. **门禁结果记录**：将每个门禁的执行命令、输出结果（通过/失败）写入 Changes 记录。若某门禁不适用，记录为"跳过（不适用）"。
- goon 写回：**质量门禁全部通过后**，先清空 `<GOON_PATH>` 原始内容，再写入仍未完成的整改项。
- 无剩余项：若整改项已全部完成，将 `<GOON_PATH>` 重写为空整改单或无待整改项状态。
- Changes 写回：不得在 `<GOON_PATH>` 写 Changes；必须向 `<TASK_PATH>` 的 `## Changes` 追加整改完成情况、涉及文件、**质量门禁验证命令与结果**和闭环说明。

## Verification

Report the verification commands run, their results, whether the goon file was cleared or still contains remaining remediation items, and the Changes entry appended to the task file.
