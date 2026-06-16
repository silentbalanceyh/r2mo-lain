---
description: "同步当前项目：冲突检测、智能提交、拉取远程、合并到 develop/master 并推送"
argument-hint: ""
---

# /mxt:sync

同步当前项目 Git 状态：全量提交、冲突检测、安全合并到目标分支并推送。

The user invoked this command with: $ARGUMENTS

## 参数解析

本命令无参数。直接执行同步流程。

**硬规则**：执行前确认工作区状态 | fetch后先检测冲突再合并 | 冲突→终止并报告 | 推送失败→终止 | Worktree检查必执行 | stash冲突→提示用户

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. 预检：运行 `git status` 确认工作区状态，记录当前分支名。
3. 将当前系统中所有改动全量提交：
   - `git add -A && git commit -m "sync: auto commit before sync"`
   - 若无改动则跳过提交，继续后续步骤。
4. 从远程拉取最新代码：`git fetch --all`。
5. **冲突检测（核心强化）**：在 merge 之前，使用 `git diff --name-only --diff-filter=U` 和 dry-run 合并检测冲突：
   - 执行 `git merge --no-commit --no-ff origin/<current-branch>` 进行试合并。
   - 若检测到冲突文件（`git diff --name-only --diff-filter=U` 不为空）：
     - 立即中止合并：`git merge --abort`。
     - 报告冲突文件列表及冲突详情。
     - **终止流程**，提示用户手动解决冲突后再执行 sync。
   - 若无冲突，完成合并：`git commit --no-edit`。
6. 确认环境中没有多余 stash：若有 stash 记录，提示用户确认是否需要清理。
7. 确认环境中没有多余 worktree：若有额外 worktree，提示用户确认是否需要清理。
8. 合并到目标分支：
   - 优先检测 `develop` 分支是否存在（`git branch -a | grep develop`）。
   - 若存在 develop：`git checkout develop && git merge <current-branch>`。
   - 若不存在 develop：`git checkout master && git merge <current-branch>`。
   - 合并前同样执行冲突检测（步骤5的流程）。
9. 合并完成后 push 到远程对应分支：`git push origin <target-branch>`。
10. 切回原始工作分支：`git checkout <original-branch>`。

## Verification

完成后说明：
- 当前分支（应切回原始分支）
- 目标分支
- 合并结果（成功/冲突已中止）
- 推送结果
- 冲突文件列表（如有）

## 闭环指引

Sync 完成后的典型路径：
- 执行任务 → `/mxt:run <编号>`
- 拉起环境 → `/mxt:start`
- 如遇 BUG → `/mxt:debug <描述>`
- 如遇冲突 → 手动解决后重新 `/mxt:sync`
