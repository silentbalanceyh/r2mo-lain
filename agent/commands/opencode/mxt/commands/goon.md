---
description: "执行 R2MO goon 整改：传入 001 这类三位数字编号（可附加指令），读取对应 goon 文件，完成后回写 task Changes。"
argument-hint: "[001] [指令...]"
---

# /mxt:goon

读取当前工作目录下指定编号的 `.r2mo/task/goon-xxx.md` 临时整改队列，执行整改任务，并将闭环结果写回对应 task。

The user invoked this command with: $ARGUMENTS

## 参数解析

1. `$ARGUMENTS` 以三位数字编号开头，正则为 `^[0-9]{3}`，例如 `001`。
2. 编号之后的附加文本作为**执行指令**，以空格分隔，不区分大小写。支持的指令：
   - `Team` / `Team模式` — 强制启用 Team 模式（多 Agent 协作）
   - `Worktree` / `WT` — 强制使用 Worktree 隔离执行
3. 解析后在聊天窗口中声明结果，例如 `📌 编号: 005 | 指令: Team模式`。若未附加指令则仅声明编号。
4. 指令直接作用于执行环境：
   - `Team模式` → 忽略复杂度自动判断，直接启用 Team 模式
   - `Worktree` → 忽略变更风险判断，直接创建 Worktree 隔离
5. **Worktree 规范**：若创建 Worktree，必须遵循以下规则：
   - 名称前缀为 `task-<编号>`（如 `task-005`）
   - 存储位置为当前项目下的 `.r2mo/worktrees/` 目录（非全局），确保 Codex、Claude、OpenCode 三平台可共享同一 worktree 目录
   - 创建命令示例：`git worktree add .r2mo/worktrees/task-005 -b task-005`

**硬规则**：解析失败→终止 | 指令覆盖自动判断 | Worktree→`.r2mo/worktrees/task-<编号>` | Changes写task非goon | 质量门禁必通过→才可清空goon+写Changes | 路径冲突→终止 | 隔离外文件→禁止读写 | Superpowers检测必执行（无则降级）

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. 解析 `$ARGUMENTS`：提取编号和执行指令。如果 `$ARGUMENTS` 为空，扫描当前工作目录 `.r2mo/task/` 下的 `goon-*.md` 文件，读取每个文件的 frontmatter 中的 `title` 和 `status`，列出编号与标题供用户选择，用户选择后用对应编号继续执行；如果 `.r2mo/task/` 下没有 `goon-*.md` 文件，提示用户当前没有待整改任务。如果 `$ARGUMENTS` 不为空但开头不匹配 `^[0-9]{3}`，立即停止，只提示：`请使用 /mxt:goon 001 [指令...] 格式执行，其中 001 是三位数字整改编号。`
3. 将整改单路径设为 `.r2mo/task/goon-$编号.md`，将对应任务路径设为 `.r2mo/task/task-$编号.md`。如果整改单或任务文件不存在，不要猜测其他编号，不要改读别的 task/goon 文件，立即询问用户提供最新任务号。
4. **隔离锁定**：在聊天窗口中显式声明 `📌 任务隔离锁定: .r2mo/task/goon-$编号.md | .r2mo/task/task-$编号.md`，此后本指令的读写操作只能针对这两个路径，禁止读写任何其他 `task-*.md` 或 `goon-*.md` 文件。
5. 在执行任何编辑、验证或整改处理之前，先在聊天窗口中原样打印本次将执行的提示词，使用 Markdown 代码块包裹。代码块中只打印下面这段最终执行提示词，不要打印本条说明。
6. 对该整改单按以下提示词执行，其中整改单路径和对应任务路径必须替换为实际相对路径：

任务：根据 `<GOON_PATH>` 完成整改，并回写 `<TASK_PATH>` 闭环记录。

- 输入范围：读取 `<GOON_PATH>` 当前整改项，并对照 `<TASK_PATH>` 原始任务目标。
- goon 标题：`<GOON_PATH>` frontmatter 的 title 必须保持为 `整改-` + `<TASK_PATH>` frontmatter 中的 title。
- 整改执行：逐项处理 `<GOON_PATH>` 中当前列出的整改项，避免偏离 `<TASK_PATH>` 的原始目标。
- 调度策略：根据整改复杂度判断是否启用 Team 模式；根据变更风险判断是否需要 worktree，用户已指定时必须创建。**执行指令覆盖**：若参数解析中检测到 `Team模式`，直接启用 Team 模式；若检测到 `Worktree`，直接创建 Worktree。
- **质量门禁（写回前置，不可跳过）**：在清空 goon 或写 Changes 之前，必须按顺序通过以下门禁，任一门禁失败则不得写回，必须修复后重试（最多 3 轮自动修复；3 轮后仍未通过→停止，报告失败项，不写 Changes）：
  1. **编译零警告**：执行项目编译命令（如 `npm run build`、`mvn compile`、`tsc --noEmit` 等，按项目类型选择），编译必须零错误零警告。若有警告，必须修复后再通过。
  2. **Lint 零警告**：执行项目 lint 命令（如 `npm run lint`、`eslint .`、`npx tsc --noEmit` 等），lint 必须零错误零警告。若有警告，必须修复后再通过。
  3. **测试全通过**：若项目存在测试配置（`jest`、`mocha`、`vitest`、`pytest` 等），必须执行测试套件，全部通过方可继续。若项目无测试配置则跳过此门禁。
  4. **门禁结果记录**：将每个门禁的执行命令、输出结果（通过/失败）写入 Changes 记录。若某门禁不适用（如项目无 lint 配置），记录为"跳过（不适用）"。
- goon 写回：**质量门禁全部通过后**，先清空 `<GOON_PATH>` 原始内容，再写入仍未完成的整改项。
- 无剩余项：若整改项已全部完成，将 `<GOON_PATH>` 重写为空整改单或无待整改项状态。
- Changes 写回：不得在 `<GOON_PATH>` 写 Changes；必须向 `<TASK_PATH>` 的 `## Changes` 追加整改完成情况、涉及文件、**质量门禁验证命令与结果**和闭环说明。
- **写回校验**：执行写回前必须验证目标文件路径与隔离锁定路径一致；若不一致，立即停止并报告路径冲突，不得写入。
- 隔离约束：全程不得读取、编辑或创建除 `<GOON_PATH>` 和 `<TASK_PATH>` 以外的任何 `task-*.md` 或 `goon-*.md` 文件（团队调度中 worker 的文件除外）。

## 闭环指引

Goon 完成后的典型路径：
- 再验收 → `/mxt:end <编号>`
- 仍有整改项 → `/mxt:goon <编号>`（循环）
- 如遇新 BUG → `/mxt:debug <描述>`
- 全部通过 → 任务闭环完成

## Verification

完成后说明已执行的验证命令、结果，`<GOON_PATH>` 是否已清空或仍保留待整改项，以及追加到 `<TASK_PATH>` 的 Changes 内容。
