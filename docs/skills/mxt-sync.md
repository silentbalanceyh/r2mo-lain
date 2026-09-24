# $mxt-sync / /mxt:sync

## 基本介绍

`mxt-sync` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-sync` 调用；Claude Code / OpenCode 中对应 `/mxt:sync`。

## 用途

执行当前项目 Git 端到端同步：状态检查 → 拉取代码与冲突处理 → 合并全部 stash 与 worktree → 全量提交 → 全量编译 + Lint（0 错误、0 警告）→ 收敛为唯一当前分支 → 推送当前分支 → 刷新当前环境的全部全局 SKILL。

## 适用场景

- 任务完成后需要同步远程并发起推送。
- 需要把残留 stash、worktree、其他本地分支统一并入当前分支。
- 需要在推送前确认全量编译与 Lint 达到 0 错误、0 警告。
- 需要让当前环境的全局 SKILL 与同步后的源头保持一致。

## 输入

- 无参数。
- 使用当前 Git 仓库和当前分支。

## 执行流程

1. **状态检查**：`git status --porcelain`、冲突检测、远端差异，以及 stash / worktree / 本地分支清单。
2. **拉取代码**：`git fetch --all` + `git pull origin <current-branch>`，冲突逐个解决。
3. **stash 收敛（强制）**：逐个 `git stash apply` 并解决冲突、提交、`git stash drop`，直到 `git stash list` 为空；禁止 `git stash clear`。
4. **worktree 收敛（强制）**：把每个 linked worktree 的分支合入当前分支，再 `git worktree remove` 并删除其分支，直到只剩主 worktree。
5. **全量提交**：`git add -A` + `git commit`（按变更推断提交信息）。
6. **全量编译**：执行项目全量编译命令，要求 0 错误、0 警告。
7. **Lint 检查**：项目存在 Lint 配置时执行，要求 0 错误、0 警告；无配置时记录跳过原因。
8. **单分支收敛（强制）**：确认其他本地分支已合入后删除，只保留当前分支。
9. **推送所在分支**：`git push origin <current-branch>`；未设置 upstream 时加 `--set-upstream`。
10. **全局 SKILL 刷新（推送成功后强制）**：重新安装 `mxt ai-cmd` 各平台技能/命令，并把仓库 `skills/` 刷新到当前环境存在的全局技能目录，逐个校验 `SKILL.md` 与源一致。边界：`~/.pi/agent/skills` 不放 `skills/` 镜像 —— 它只保留 9 个真实 `mxt-*` 技能，由 `mxt ai-cmd`（Pi Agent 平台）负责安装与刷新，同时维护 `~/.pi/agent/prompts` 下的 `/mxt-*` 短命令别名与 Pi 专属 `/goal` 目标命令；而 `~/.agents/skills`、`~/.claude/skills`、`~/.codex/skills` 这类共享全局目录照旧接收仓库技能，它们是所有工具共用的，Pi 从共享目录多读到几个技能不影响那 9 个 `mxt-*` 命令。

## 写回 / 输出

- Git 暂存区、提交历史、远程分支，以及 stash / worktree 收敛结果。
- 当前环境全局技能目录中的 `SKILL.md`。
- 通常不直接写 task，除非同步前工作区已有 task 变更被提交。

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- 输出必须包含可追踪的输入、变更/执行范围、验证方式和实际结果；无法验证的内容不得宣称完成。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。
- 失败必须显式停止并保留恢复信息；不允许通过降低标准、扩大范围或改写目标来制造“完成”。

## 注意事项

- 执行前必须查看 `git status --porcelain`、stash / worktree / 本地分支清单和远端差异。
- 存在未解决冲突时先停止，不盲目推送。
- 编译或 Lint 出现警告即视为失败，修复后再推送。
- 不得丢弃未合并提交：无法安全收敛的 stash、worktree 或分支必须停止并给出恢复命令。
- 推送失败时不执行全局 SKILL 刷新。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-sync/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/sync.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/sync.md`

## 命令执行记录

```bash
$mxt-sync
git status --porcelain
git stash list
git worktree list
git branch --format='%(refname:short)'
git log --oneline -3
```
