---
description: "同步当前项目：冲突检测、智能提交、拉取远程、合并到 develop/master 并推送"
argument-hint: ""
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-sync

同步当前项目 Git 状态：冲突检测 → 安全合并 → 全量提交 → 推送。

## Arguments

The user invoked this command with: $ARGUMENTS

本命令无参数。直接执行同步流程。

**硬规则**：冲突→终止 | 推送失败→终止 | Worktree检查必执行 | 远程变更检测必执行

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。

## Phase 1 — 工作区预检

1. `git status` — 确认工作区状态，如有未跟踪或修改文件，先全量提交：
   - `git add -A && git commit -m "sync: auto commit before sync"`
   - 若无改动，跳过提交。
2. `git stash list` — 检查多余 stash，若有记录提示用户确认是否清理。
3. `git worktree list` — 检查多余 worktree，若有额外 worktree 提示用户确认是否清理。

## Phase 2 — 远程变更检测与冲突预判

1. `git fetch --all` — 拉取所有远程引用。
2. 检测当前分支是否有远程追踪：`git rev-parse --abbrev-ref --symbolic-full-name @{u}`，若无追踪则跳过 pull。
3. 对比本地与远程差异：`git log HEAD..@{u} --oneline`
   - 若远程无新提交 → 跳过 pull，直接进入 Phase 3。
   - 若远程有新提交 → 执行冲突预判：
     - `git merge-tree $(git merge-base HEAD @{u}) HEAD @{u}` — 预判是否存在冲突
     - 若预判发现冲突 → **终止流程**，输出冲突文件列表，提示用户手动解决后再 sync。
     - 若无冲突 → `git pull origin <current-branch>` 安全合并。

## Phase 3 — 目标分支合并与推送

1. 确定目标分支：优先 `develop`，无 develop 则用 `master`。
2. 切换到目标分支：`git checkout develop` 或 `git checkout master`。
3. 合并当前分支：`git merge <current-branch>`
   - 若合并出现冲突 → **终止流程**，输出冲突信息，**不自动 resolve**，提示用户手动处理。
4. 推送到远程：`git push origin <target-branch>`
   - 若推送失败 → **终止流程**，输出错误信息。
5. 切回原工作分支：`git checkout <original-branch>`

## Commands

1. `git status —porcelain` — 检查工作区
2. `git add -A && git commit -m "sync: auto commit before sync"` — 全量提交
3. `git stash list` — stash 检查
4. `git worktree list` — worktree 检查
5. `git fetch --all` — 远程拉取
6. `git rev-parse --abbrev-ref --symbolic-full-name @{u}` — 追踪分支检测
7. `git log HEAD..@{u} --oneline` — 远程变更检测
8. `git merge-tree $(git merge-base HEAD @{u}) HEAD @{u}` — 冲突预判
9. `git pull origin <current-branch>` — 安全拉取
10. `git checkout develop || git checkout master` — 切换目标
11. `git merge <current-branch>` — 合并
12. `git push origin <target-branch>` — 推送
13. `git checkout <original-branch>` — 切回

## Verification

完成后说明：当前分支、目标分支、合并结果、推送结果、冲突状态。

## Summary

报告当前分支、目标分支、合并结果、推送结果和冲突状态。

## Next Steps

Sync 完成后的典型路径：
- 执行任务 → `/mxt-run <编号>` 或 `$mxt-run <编号>`
- 拉起环境 → `/mxt-start` 或 `$mxt-start`
- 如遇 BUG → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
