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
