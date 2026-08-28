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
