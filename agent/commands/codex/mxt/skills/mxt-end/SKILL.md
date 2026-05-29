---
name: mxt-end
description: Use when the user asks Codex to verify an R2MO task by number, such as "$mxt-end 001" or "mxt-end 001"; reads .r2mo/task/task-xxx.md and writes only current remediation items to .r2mo/task/goon-xxx.md.
---

# MXT End

Verify an R2MO task by three-digit task number and write the aligned goon file as a temporary remediation queue for another Agent.

## Arguments

The user must provide a three-digit number such as `001`.

If the number is missing, scan `.r2mo/task/` for `task-*.md` files, read the `title` and `status` from each file's frontmatter, list the number and title for the user to choose from, and continue with the selected number. If no `task-*.md` files exist, tell the user to create a task first.

If the number is provided but does not match `^[0-9]{3}$`, stop and say:

`请使用 $mxt-end 001 格式执行，其中 001 是三位数字任务编号。`

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Set the task path to `.r2mo/task/task-<number>.md`.
3. Set the goon path to `.r2mo/task/goon-<number>.md`.
4. If the task file is missing, do not guess another number and do not read another task file; immediately ask the user for the latest task number.
5. Read the body after the frontmatter first. If it is empty or whitespace-only, stop immediately and return: `<TASK_PATH> 正文为空，当前不执行 /mxt-end，请先补充任务内容。`
6. Before reading the task body, editing files, or running verification, print only the final prompt below in a Markdown code block, replacing `<TASK_PATH>` and `<GOON_PATH>` with the actual paths.
7. Execute the final prompt.

Final prompt:

任务：验收 `<TASK_PATH>`，并生成 `<GOON_PATH>` 整改队列。

- 输入范围：读取 `<TASK_PATH>` frontmatter 之后的正文。
- 前置校验：若正文为空或仅包含空白字符，返回“任务正文为空，未执行验收”，且不修改任何文件。
- 验收依据：对照任务正文、已有 Plan、已有 Changes 和当前代码状态判断任务是否完成。
- goon 标题：`<GOON_PATH>` frontmatter 的 title 必须为 `整改-` + `<TASK_PATH>` frontmatter 中的 title。
- goon 写入：写入前必须清空 `<GOON_PATH>` 原始内容，再写入本轮验收发现的当前待整改项。
- 内容边界：`<GOON_PATH>` 只保存当前待整改项，不写 Changes、历史记录或已完成项。
- 无整改项：若无待整改项，将 `<GOON_PATH>` 重写为空整改单或无待整改项状态。
- 禁止事项：不得修改 `<TASK_PATH>` 的 Changes。

`<GOON_PATH>` 必须与任务编号对齐，例如 `.r2mo/task/task-001.md` 对应 `.r2mo/task/goon-001.md`。

## Verification

Report the verification result, remediation item count, and written `.r2mo/task/goon-xxx.md` path. Do not append Changes to the goon file or task file in this stage.
