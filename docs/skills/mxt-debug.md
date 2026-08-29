# $mxt-debug / /mxt:debug

## 基本介绍

`mxt-debug` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-debug` 调用；Claude Code / OpenCode 中对应 `/mxt:debug`。

## 用途

针对明确 BUG 做系统化诊断，输出整改交接和 Bug 归档记录。

## 适用场景

- 用户描述了错误、异常、日志或复现路径。
- 需要先定位根因，再把修复项交给 goon 或后续任务。

## 输入

- BUG 描述文本，可包含三位任务编号。
- 可选 `Deep` 深入排查，`Worktree` / `WT` 隔离排查。

## 写回 / 输出

- `.r2mo/task/goon-NNN.md`：如果绑定任务，写入整改交接。
- `.r2mo/bugs/<yyyy-MM-dd>/bug-<HHmmss>-<slug>.md`：归档问题、证据、方案。

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- 输出必须包含可追踪的输入、变更/执行范围、验证方式和实际结果；无法验证的内容不得宣称完成。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。
- 失败必须显式停止并保留恢复信息；不允许通过降低标准、扩大范围或改写目标来制造“完成”。

## 注意事项

- 优先使用系统化调试流程。
- Bug 记录必须包含问题、根因、修复方向和验证方法。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-debug/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/debug.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/debug.md`

## 命令执行记录

```bash
$mxt-debug 001 login fails
$mxt-debug 001 login fails Deep
$mxt-debug 001 login fails WT
```
