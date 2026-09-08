# $mxt-goon / /mxt:goon

## 基本介绍

`mxt-goon` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-goon` 调用；Claude Code / OpenCode 中对应 `/mxt:goon`。

## 用途

读取 `goon-NNN.md` 中的整改项，完成修复后清理已完成项，并向 task 追加整改 Changes。

## 适用场景

- `mxt-end` 已生成整改队列。
- 需要继续修复当前任务，而不是开启新任务。

## 输入

- 三位任务编号，例如 `001`。
- 整改内容来自 `.r2mo/task/goon-NNN.md`。

## 写回 / 输出

- `.r2mo/task/goon-NNN.md`：清除已完成整改项，保留未完成项。
- `.r2mo/task/task-NNN.md`：追加本轮整改 Changes。

## Fresh Input Contract

- 每一轮整改前重新从磁盘读取 `goon-NNN.md`。
- 刚读取的 goon 是唯一整改输入。
- 禁止上一轮 goon 内容、会话摘要和缓存决策。
- 写回后只允许保留当前未解决项。
- 每项整改必须记录修复文件、修复方式、目标 Verification command 和 Actual result / exit code。
- 已解决项的闭环证据写入 task `## Changes`；未解决项重新输出且不复制历史说明。

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- 输出必须包含可追踪的输入、变更/执行范围、验证方式和实际结果；无法验证的内容不得宣称完成。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。
- 失败必须显式停止并保留恢复信息；不允许通过降低标准、扩大范围或改写目标来制造“完成”。

## 注意事项

- 只处理 goon 中列出的当前整改项。
- 完成后建议再次执行 `$mxt-end NNN`。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-goon/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/goon.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/goon.md`

## 命令执行记录

```bash
$mxt-goon 001
$mxt-end 001
```
