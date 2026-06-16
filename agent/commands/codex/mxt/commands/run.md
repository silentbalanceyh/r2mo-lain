---
description: "执行 R2MO task：传入 001 这类三位数字编号（可附加指令），读取对应 task 并写回 Changes。"
argument-hint: "[001] [指令...]"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-run

读取当前工作目录下指定编号的 `.r2mo/task/task-xxx.md`，执行开发任务。

## Arguments

The user invoked this command with: $ARGUMENTS

`$ARGUMENTS` 以三位数字编号开头，正则为 `^[0-9]{3}`，例如 `001`。编号之后的附加文本作为**执行指令**，以空格分隔，不区分大小写。支持的指令：
- `Team` / `Team模式` — 强制启用 Team 模式（多 Agent 协作）
- `Worktree` / `WT` — 强制使用 Worktree 隔离执行

解析后在聊天窗口中声明结果，例如 `📌 编号: 005 | 指令: Team模式, Worktree`。若未附加指令则仅声明编号。指令直接作用于执行环境：`Team模式` → 忽略复杂度自动判断，直接启用 Team 模式；`Worktree` → 忽略变更风险判断，直接创建 Worktree 隔离。**Worktree 规范**：若创建 Worktree，名称前缀必须为 `task-<编号>`（如 `task-005`），存储位置为当前项目下的 `.r2mo/worktrees/` 目录（非全局），确保 Codex、Claude、OpenCode 三平台可共享同一 worktree 目录。创建命令示例：`git worktree add .r2mo/worktrees/task-005 -b task-005`。

**硬规则**：解析失败→终止 | 指令覆盖自动判断 | Worktree→`.r2mo/worktrees/task-<编号>` | 质量门禁必通过→才可写Done+Changes | 路径冲突→终止 | 隔离外文件→禁止读写 | Superpowers检测必执行（无则降级）

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. 如果 `$ARGUMENTS` 为空，扫描当前工作目录 `.r2mo/task/` 下的 `task-*.md` 文件，读取每个文件的 frontmatter 中的 `title` 和 `status`，列出编号与标题供用户选择，用户选择后用对应编号继续执行；如果 `.r2mo/task/` 下没有 `task-*.md` 文件，提示用户先创建任务。如果 `$ARGUMENTS` 不为空但开头不匹配 `^[0-9]{3}`，立即停止，只提示：`请使用 /mxt-run 001 [指令...] 格式执行，其中 001 是三位数字任务编号。`
3. 将任务路径设为 `.r2mo/task/task-$编号.md`。如果文件不存在，不要猜测其他编号，不要改读别的 task 文件，立即询问用户提供最新任务号。
4. **隔离锁定**：在聊天窗口中显式声明 `📌 任务隔离锁定: .r2mo/task/task-$编号.md`，此后本指令的读写操作只能针对此路径，禁止读写任何其他 `task-*.md` 文件。
5. 先读取 `<TASK_PATH>` frontmatter 之后的正文；如果正文为空或仅包含空白字符，立即停止并直接返回：`<TASK_PATH> 正文为空，当前不执行 /mxt-run，请先补充任务内容。`

## Plan

1. 读取任务文件 frontmatter 之后的正文。
2. 根据任务复杂度决定是否需要 Team 模式。**执行指令覆盖**：若参数解析中检测到 `Team模式`，直接启用 Team 模式。
3. 根据任务要求和当前工作区状态判断是否需要 worktree。**执行指令覆盖**：若参数解析中检测到 `Worktree`，直接创建 Worktree。
4. 执行任务。
5. **质量门禁**：通过所有门禁后才可写回 Done+Changes。

## Commands

1. 在执行任何读取任务正文、编辑、验证或任务处理之前，先在聊天窗口中原样打印本次将执行的提示词，使用 Markdown 代码块包裹。代码块中只打印下面这段最终执行提示词，不要打印本条说明。
2. 对该任务文件按以下提示词执行，其中任务路径必须替换为实际相对路径：

任务：执行 `<TASK_PATH>` 中定义的开发任务。

- 输入范围：读取 `<TASK_PATH>` frontmatter 之后的正文。
- 前置校验：若正文为空或仅包含空白字符，返回"任务正文为空，未执行任务"，且不修改任何文件。
- 执行依据：若存在 `## Plan`，优先按 Plan 执行；若不存在 Plan，可自行补足执行步骤，但不得写入 Plan。
- 调度策略：根据任务复杂度判断是否启用 Team 模式；根据变更风险判断是否需要 worktree，用户已指定时必须创建。**执行指令覆盖**：若参数解析中检测到 `Team模式`，直接启用 Team 模式；若检测到 `Worktree`，直接创建 Worktree。
- **质量门禁（写回前置，不可跳过）**：在将 status 更新为 Done 或追加 Changes 之前，必须按顺序通过以下门禁，任一门禁失败则不得写回 Done，必须修复后重试（最多 3 轮自动修复；3 轮后仍未通过→停止，报告失败项，不写 Done）：
  1. **编译零警告**：执行项目编译命令（如 `npm run build`、`mvn compile`、`tsc --noEmit` 等，按项目类型选择），编译必须零错误零警告。若有警告，必须修复后再通过。
  2. **Lint 零警告**：执行项目 lint 命令（如 `npm run lint`、`eslint .`、`npx tsc --noEmit` 等），lint 必须零错误零警告。若有警告，必须修复后再通过。
  3. **测试全通过**：若项目存在测试配置（`jest`、`mocha`、`vitest`、`pytest` 等），必须执行测试套件，全部通过方可继续。若项目无测试配置则跳过此门禁。
  4. **门禁结果记录**：将每个门禁的执行命令、输出结果（通过/失败）写入 Changes 记录。若某门禁不适用（如项目无 lint 配置），记录为"跳过（不适用）"。
- 写回要求：**质量门禁全部通过后**，将 status 更新为 Done，并向 `<TASK_PATH>` 追加 `## Changes` 记录。
- **写回校验**：执行写回前必须验证目标文件路径与隔离锁定路径一致；若不一致，立即停止并报告路径冲突，不得写入。
- Changes 内容：包含变更摘要、涉及文件、**质量门禁验证命令与结果**。
- 隔离约束：全程不得读取、编辑或创建除 `<TASK_PATH>` 以外的任何 `task-*.md` 或 `goon-*.md` 文件（团队调度中 worker 的文件除外）。

## Verification

完成后说明已执行的验证命令、结果，以及写回的任务文件路径。

## Summary

报告完成了哪些文件变更、任务状态是否已改为 `Done`，以及追加的 `Changes` 记录内容。

## Next Steps

Run 完成后的典型路径：
- 验收检查 → `/mxt-end <编号>` 或 `$mxt-end <编号>`
- 如有整改项 → `/mxt-goon <编号>` 或 `$mxt-goon <编号>`
- 整改后再验收 → `/mxt-end <编号>` 或 `$mxt-end <编号>`（循环直到无整改项）
- 如遇 BUG → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
