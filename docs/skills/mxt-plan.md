# $mxt-plan / /mxt:plan

## 基本介绍

`mxt-plan` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-plan` 调用；Claude Code / OpenCode 中对应 `/mxt:plan`。

## 用途

读取 `.r2mo/task/task-NNN.md`，只生成或更新任务的 `## Plan` 区段。

## 适用场景

- 任务尚未拆解，需要先形成可执行计划。
- 需要保持 task 文件不被改成 Done，也不追加 Changes。

## 输入

- 三位任务编号，例如 `001`。
- 默认只处理当前目录 `.r2mo/task/`。

## 写回 / 输出

- `.r2mo/task/task-NNN.md` 的 `## Plan`。
- 不会写 goon，也不会改其他 task 文件。

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- 输出必须包含可追踪的输入、变更/执行范围、验证方式和实际结果；无法验证的内容不得宣称完成。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。
- 失败必须显式停止并保留恢复信息；不允许通过降低标准、扩大范围或改写目标来制造“完成”。

## 注意事项

- 必须先锁定任务路径。
- 如果已有 Plan，应原位更新，避免重复标题。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-plan/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/plan.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/plan.md`

## 命令执行记录

```bash
$mxt-plan 001
/mxt:plan 001
```
