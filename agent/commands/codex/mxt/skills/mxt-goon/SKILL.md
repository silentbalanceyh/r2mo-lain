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
- goon 写回：整改完成后必须先清空 `<GOON_PATH>` 原始内容，再写入仍未完成的整改项。
- 无剩余项：若整改项已全部完成，将 `<GOON_PATH>` 重写为空整改单或无待整改项状态。
- Changes 写回：不得在 `<GOON_PATH>` 写 Changes；必须向 `<TASK_PATH>` 的 `## Changes` 追加整改完成情况、涉及文件、验证结果和闭环说明。

## Verification

Report the verification commands run, their results, whether the goon file was cleared or still contains remaining remediation items, and the Changes entry appended to the task file.
