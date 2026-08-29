# $mxt-sync / /mxt:sync

## 基本介绍

`mxt-sync` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-sync` 调用；Claude Code / OpenCode 中对应 `/mxt:sync`。

## 用途

执行当前项目 Git 同步：状态检查、拉取、冲突处理、提交、质量门、合并目标分支并推送。

## 适用场景

- 任务完成后需要同步远程。
- 需要在推送前确认工作树、冲突、编译和 Lint 状态。

## 输入

- 无参数。
- 使用当前 Git 仓库和当前分支。

## 写回 / 输出

- Git 暂存区/提交历史/远程分支。
- 通常不直接写 task，除非同步前工作区已有 task 变更被提交。

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- 输出必须包含可追踪的输入、变更/执行范围、验证方式和实际结果；无法验证的内容不得宣称完成。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。
- 失败必须显式停止并保留恢复信息；不允许通过降低标准、扩大范围或改写目标来制造“完成”。

## 注意事项

- 执行前必须看 `git status --porcelain` 和远端差异。
- 存在未解决冲突时先停止，不盲目推送。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-sync/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/sync.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/sync.md`

## 命令执行记录

```bash
$mxt-sync
git status --porcelain
git log --oneline -3
```
