# $mxt-end / /mxt:end

## 基本介绍

`mxt-end` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-end` 调用；Claude Code / OpenCode 中对应 `/mxt:end`。

## 用途

按 task 要求验证完成度；只把当前阻塞整改项写入 `goon-NNN.md`。

## 适用场景

- `run` 或 `goon` 后需要验收。
- 需要把 P0/P1 阻塞问题转成可执行整改队列。

## 输入

- 三位任务编号，例如 `001`。
- 可选 `Deep` 做更深边界比对，`Strict` 在当前任务边界内提高敏感度。

## 写回 / 输出

- `.r2mo/task/goon-NNN.md`。
- 不会修改 task 的 Changes。无整改项时写成空/无待办状态。

## 注意事项

- 只记录直接阻塞任务验收的 P0/P1。
- 整改项标题格式必须是 `## Remediation Item N — <title>`。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-end/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/end.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/end.md`

## 命令执行记录

```bash
$mxt-end 001
$mxt-end 001 Deep
$mxt-end 001 Strict
```
