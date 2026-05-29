---
description: "执行 R2MO goon 整改：传入 001 这类三位数字编号（可附加指令），读取对应 goon 文件，完成后回写 task Changes。"
argument-hint: "[001] [指令...]"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-goon

读取当前工作目录下指定编号的 `.r2mo/task/goon-xxx.md` 临时整改队列，执行整改任务，并将闭环结果写回对应 task。

## Arguments

The user invoked this command with: $ARGUMENTS

`$ARGUMENTS` 以三位数字编号开头，正则为 `^[0-9]{3}`，例如 `001`。编号之后的附加文本作为**执行指令**，以空格分隔，不区分大小写。支持的指令：
- `Team` / `Team模式` — 强制启用 Team 模式（多 Agent 协作）
- `Worktree` / `WT` — 强制使用 Worktree 隔离执行

解析后在聊天窗口中声明结果，例如 `📌 编号: 005 | 指令: Team模式`。若未附加指令则仅声明编号。指令直接作用于执行环境：`Team模式` → 忽略复杂度自动判断，直接启用 Team 模式；`Worktree` → 忽略变更风险判断，直接创建 Worktree 隔离。**Worktree 规范**：若创建 Worktree，名称前缀必须为 `task-<编号>`（如 `task-005`），存储位置为当前项目下的 `.r2mo/worktrees/` 目录（非全局），确保 Codex、Claude、OpenCode 三平台可共享同一 worktree 目录。创建命令示例：`git worktree add .r2mo/worktrees/task-005 -b task-005`。

**硬规则**：解析失败→终止 | 指令覆盖自动判断 | Worktree→`.r2mo/worktrees/task-<编号>` | Changes写task非goon | 路径冲突→终止 | 隔离外文件→禁止读写 | Superpowers检测必执行（无则降级）

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. 如果 `$ARGUMENTS` 为空，扫描当前工作目录 `.r2mo/task/` 下的 `goon-*.md` 文件，读取每个文件的 frontmatter 中的 `title` 和 `status`，列出编号与标题供用户选择，用户选择后用对应编号继续执行；如果 `.r2mo/task/` 下没有 `goon-*.md` 文件，提示用户当前没有待整改任务。如果 `$ARGUMENTS` 不为空但开头不匹配 `^[0-9]{3}`，立即停止，只提示：`请使用 /mxt-goon 001 [指令...] 格式执行，其中 001 是三位数字整改编号。`
3. 将整改单路径设为 `.r2mo/task/goon-$编号.md`，将对应任务路径设为 `.r2mo/task/task-$编号.md`。如果整改单或任务文件不存在，不要猜测其他编号，不要改读别的 task/goon 文件，立即询问用户提供最新任务号。
4. **隔离锁定**：在聊天窗口中显式声明 `📌 任务隔离锁定: .r2mo/task/goon-$编号.md | .r2mo/task/task-$编号.md`，此后本指令的读写操作只能针对这两个路径，禁止读写任何其他 `task-*.md` 或 `goon-*.md` 文件。

## Plan

1. 读取 goon 当前整改项和 task 原始任务目标。
2. 根据整改复杂度决定是否需要 Team 模式。**执行指令覆盖**：若参数解析中检测到 `Team模式`，直接启用 Team 模式。
3. 根据变更风险判断是否需要 worktree。**执行指令覆盖**：若参数解析中检测到 `Worktree`，直接创建 Worktree。
4. 逐项处理整改项，避免偏离原始目标。

## Commands

1. 在执行任何编辑、验证或整改处理之前，先在聊天窗口中原样打印本次将执行的提示词，使用 Markdown 代码块包裹。代码块中只打印下面这段最终执行提示词，不要打印本条说明。
2. 对该整改单按以下提示词执行，其中整改单路径和对应任务路径必须替换为实际相对路径：

任务：根据 `<GOON_PATH>` 完成整改，并回写 `<TASK_PATH>` 闭环记录。

- 输入范围：读取 `<GOON_PATH>` 当前整改项，并对照 `<TASK_PATH>` 原始任务目标。
- goon 标题：`<GOON_PATH>` frontmatter 的 title 必须保持为 `整改-` + `<TASK_PATH>` frontmatter 中的 title。
- 整改执行：逐项处理 `<GOON_PATH>` 中当前列出的整改项，避免偏离 `<TASK_PATH>` 的原始目标。
- **执行指令覆盖**：若参数解析中检测到 `Team模式`，直接启用 Team 模式；若检测到 `Worktree`，直接创建 Worktree。
- goon 写回：整改完成后必须先清空 `<GOON_PATH>` 原始内容，再写入仍未完成的整改项。
- 无剩余项：若整改项已全部完成，将 `<GOON_PATH>` 重写为空整改单或无待整改项状态。
- Changes 写回：不得在 `<GOON_PATH>` 写 Changes；必须向 `<TASK_PATH>` 的 `## Changes` 追加整改完成情况、涉及文件、验证结果和闭环说明。
- **写回校验**：执行写回前必须验证目标文件路径与隔离锁定路径一致；若不一致，立即停止并报告路径冲突，不得写入。
- 隔离约束：全程不得读取、编辑或创建除 `<GOON_PATH>` 和 `<TASK_PATH>` 以外的任何 `task-*.md` 或 `goon-*.md` 文件（团队调度中 worker 的文件除外）。

## Verification

完成后说明已执行的验证命令、结果，goon 文件是否已清空或仍保留待整改项，以及追加到 task 的 Changes 内容。

## Summary

报告整改执行情况、已完成的整改项和仍需处理的整改项。

## Next Steps

Goon 完成后的典型路径：
- 再验收 → `/mxt-end <编号>` 或 `$mxt-end <编号>`
- 仍有整改项 → `/mxt-goon <编号>` 或 `$mxt-goon <编号>`（循环）
- 如遇 BUG → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
- 全部通过 → 任务闭环完成
