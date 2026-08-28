# $mxt-loop / /mxt:loop

## 基本介绍

`mxt-loop` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-loop` 调用；Claude Code / OpenCode 中对应 `/mxt:loop`。

## 用途

自动执行 RUN → END → GOON → END_REVIEW 的闭环流程，直到整改队列清空或遇到阻塞。

## 适用场景

- 任务边界清晰，希望自动推进完整闭环。
- 需要断点/检查点式恢复，而不是人工逐条输入。

## 输入

- 三位任务编号，例如 `001`。
- 内部使用 task/goon 文件作为循环状态。

## 写回 / 输出

- `.r2mo/task/task-NNN.md` 的 Changes。
- `.r2mo/task/goon-NNN.md` 的当前整改状态。

## 注意事项

- 循环不代表无边界扫描；仍以 task 要求和 goon 项为准。
- 遇到验证失败或外部阻塞时应停止并报告。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-loop/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/loop.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/loop.md`

## 命令执行记录

```bash
$mxt-loop 001
$mxt-goon 001 && $mxt-end 001
```
