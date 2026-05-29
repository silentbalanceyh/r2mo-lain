---
description: "规划 R2MO task：传入 001 这类三位数字编号（可附加指令），在 task 文件追加或更新 Plan 章节。"
argument-hint: "[001] [指令...]"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-plan

读取当前工作目录下指定编号的 `.r2mo/task/task-xxx.md`，只生成执行计划，并写回该 task 文件的 `Plan` 章节。

## Arguments

The user invoked this command with: $ARGUMENTS

`$ARGUMENTS` 以三位数字编号开头，正则为 `^[0-9]{3}`，例如 `001`。编号之后的附加文本作为**执行指令**，以空格分隔，不区分大小写。支持的指令：
- `Team` / `Team模式` — 标记后续 run 强制启用 Team 模式（plan 本身不启用）
- `Worktree` / `WT` — 标记后续 run 强制使用 Worktree 隔离（plan 本身不启用）
- `深度` / `Deep` — 启用深度分析模式，Plan 更详尽

解析后在聊天窗口中声明结果，例如 `📌 编号: 005 | 指令: Team模式, Worktree`。若未附加指令则仅声明编号。

**硬规则**：解析失败→终止 | Plan仅写`## Plan` | 路径冲突→终止 | 隔离外文件→禁止读写 | Superpowers检测必执行（无则降级）

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. 如果 `$ARGUMENTS` 为空，扫描当前工作目录 `.r2mo/task/` 下的 `task-*.md` 文件，读取每个文件的 frontmatter 中的 `title` 和 `status`，列出编号与标题供用户选择，用户选择后用对应编号继续执行；如果 `.r2mo/task/` 下没有 `task-*.md` 文件，提示用户先创建任务。如果 `$ARGUMENTS` 不为空但开头不匹配 `^[0-9]{3}`，立即停止，只提示：`请使用 /mxt-plan 001 [指令...] 格式执行，其中 001 是三位数字任务编号。`
3. 将任务路径设为 `.r2mo/task/task-$编号.md`。如果文件不存在，不要猜测其他编号，不要改读别的 task 文件，立即询问用户提供最新任务号。
4. **隔离锁定**：在聊天窗口中显式声明 `📌 任务隔离锁定: .r2mo/task/task-$编号.md`，此后本指令的读写操作只能针对此路径，禁止读写任何其他 `task-*.md` 文件。
5. 先读取 `<TASK_PATH>` frontmatter 之后的正文；如果正文为空或仅包含空白字符，立即停止并直接返回：`<TASK_PATH> 正文为空，当前不执行 /mxt-plan，请先补充任务内容。`

## Plan

1. 读取任务文件 frontmatter 之后的正文和已有 `Changes`。
2. **Superpowers 集成**：检测当前环境是否安装了 superpowers 技能包：
   - 若存在 `superpowers:brainstorming` 技能，先调用该技能对任务进行头脑风暴分析，将分析结果作为 Plan 的输入。
   - 若存在 `superpowers:writing-plans` 技能，使用该技能生成结构化 Plan。
   - 若以上技能均不可用，走原有路径（手动分析并生成 Plan）。
   - 在聊天窗口声明使用了哪个路径：`📌 规划路径: Superpowers[brainstorming+writing-plans]` 或 `📌 规划路径: 标准流程`。
3. 只制定执行计划，不进行实现。
4. 在同一个任务文件追加或更新 `## Plan` 章节。
5. 保持 `status`、`Changes` 和 goon 文件不变。

## Commands

1. 在执行任何读取任务正文、编辑或规划处理之前，先在聊天窗口中原样打印本次将执行的提示词，使用 Markdown 代码块包裹。代码块中只打印下面这段最终执行提示词，不要打印本条说明。
2. 对该任务文件按以下提示词执行，其中任务路径必须替换为实际相对路径：

任务：为 `<TASK_PATH>` 生成执行计划。

- 输入范围：读取 `<TASK_PATH>` frontmatter 之后的正文。
- 前置校验：若正文为空或仅包含空白字符，返回"任务正文为空，未生成 Plan"，且不修改任何文件。
- 写回位置：仅写回 `<TASK_PATH>` 的 `## Plan` 章节。
- 写回规则：若 `## Plan` 已存在，则原位更新；不得重复追加多个 Plan。
- **写回校验**：执行写回前必须验证目标文件路径与隔离锁定路径一致；若不一致，立即停止并报告路径冲突，不得写入。
- Plan 要求：包含目标拆解、涉及文件/模块、执行步骤、验证方式、风险与交接说明。
- 边界约束：不执行实现，不修改 status，不追加 Changes，不创建或修改 goon 文件。
- 隔离约束：全程不得读取、编辑或创建除 `<TASK_PATH>` 以外的任何 `task-*.md` 或 `goon-*.md` 文件。

## Verification

完成后说明 `## Plan` 写回位置、是否更新已有 Plan，Superpowers 调用情况，以及未执行实现和未追加 Changes。

## Summary

报告 Plan 的主要内容和后续建议执行的下一阶段命令。

## Next Steps

Plan 完成后的典型路径：
- 下一步执行 → `/mxt-run <编号>` 或 `$mxt-run <编号>`
- 如需团队协作 → `/mxt-run <编号> Team模式`
- 如需隔离执行 → `/mxt-run <编号> Worktree`
- 执行后验收 → `/mxt-end <编号>` 或 `$mxt-end <编号>`
