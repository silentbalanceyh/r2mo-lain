# $mxt-run / /mxt:run

## 基本介绍

`mxt-run` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-run` 调用；Claude Code / OpenCode 中对应 `/mxt:run`。

## 用途

读取任务正文并执行实现；完成后通过质量门，再向 task 写回 Done 和 `## Changes`。

## 适用场景

- 任务计划已明确，或需要直接执行 task。
- 需要把实际改动、验证命令、跳过原因沉淀到 task 文件。

## 输入

- 三位任务编号，例如 `001`。
- 可选 `Team` 强制多代理，`Worktree` / `WT` 强制隔离工作树。

## 写回 / 输出

- `.r2mo/task/task-NNN.md` 的状态和 `## Changes`。
- 质量门失败时不应写 Done。

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- 输出必须包含可追踪的输入、变更/执行范围、验证方式和实际结果；无法验证的内容不得宣称完成。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。
- 失败必须显式停止并保留恢复信息；不允许通过降低标准、扩大范围或改写目标来制造“完成”。

## 注意事项

- 编译、Lint、测试是写回前的质量门；没有对应脚本时要记录 N/A。
- 只写锁定的 task 文件，不能串写其他 task/goon。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-run/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/run.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/run.md`

## 命令执行记录

```bash
$mxt-run 001
$mxt-run 001 Team
$mxt-run 001 WT
```
