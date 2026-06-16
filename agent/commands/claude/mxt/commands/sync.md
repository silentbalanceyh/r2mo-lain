---
description: "同步当前项目：冲突检测、智能提交、拉取远程、合并到 develop/master 并推送"
argument-hint: ""
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-sync

同步当前项目 Git 状态：冲突检测 → 智能提交 → 拉取远程 → 合并到目标分支并推送。

## Arguments

The user invoked this command with: $ARGUMENTS

本命令无参数。直接执行同步流程。

**硬规则**：执行前确认工作区状态 | 冲突检测→冲突时终止 | 合并冲突→终止 | 推送失败→终止 | Worktree检查必执行 | 干预前必须预演

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。

## Conflict Detection

在执行任何写操作前，必须完成以下检测：

1. `git status --porcelain` — 检查是否有未提交改动，列出改动文件清单
2. `git diff --name-only --diff-filter=U` — 检查是否有未解决的合并冲突文件
3. `git fetch --all --dry-run 2>&1` — 预检远程是否有新提交（不实际拉取）
4. `git log HEAD..origin/<current-branch> --oneline` — 检查本地是否落后于远程
5. `git log origin/<current-branch>..HEAD --oneline` — 检查本地是否领先于远程

**冲突处理规则**：
- 若存在未解决的合并冲突（diff-filter=U 有输出）→ **立即终止**，报告冲突文件列表，提示用户手动解决
- 若本地和远程有分叉（两边都有新提交）→ **终止并提示**，建议用户先 rebase 或手动合并
- 若远程有新提交且本地有未提交改动 → 先 stash，pull，再 stash pop；stash pop 冲突 → **终止**

## Plan

1. **预演（Dry-Run）**：展示即将执行的操作清单，包含：
   - 当前分支名、远程跟踪分支
   - 未提交改动文件数
   - 远程新提交数（落后几条）
   - 本地领先提交数
   - 目标合并分支（develop 优先，无则 master，再无则 main）
   - stash 数量、worktree 数量
2. 智能提交（`git add -A` + `git commit`）— 提交信息从改动文件中推断：
   - 有 `.r2mo/task/` 变更 → `chore: task sync`
   - 有 `src/` 变更且无其他 → `feat: source sync`
   - 有混合变更 → `chore: workspace sync`
   - 无变更 → 跳过提交步骤
3. 从远程拉取最新版并合并（`git fetch --all` + `git pull origin <current-branch>`）。
   - pull 冲突 → **终止**，报告冲突文件
4. 确认环境中没有多余 stash：若有 stash 记录，提示用户确认是否需要清理。
5. 确认环境中没有多余 worktree：若有额外 worktree，提示用户确认是否需要清理。
6. 合并到目标分支（优先级：develop > master > main）：
   - `git checkout <target-branch>`
   - `git merge <current-branch>`
   - 合并冲突 → **终止**，报告冲突文件，**不自动解决**
7. 合并完成后 push 到远程对应分支。

## Commands

1. `git status --porcelain` — 工作区状态
2. `git diff --name-only --diff-filter=U` — 未解决冲突检测
3. `git fetch --all --dry-run 2>&1` — 远程预检
4. `git log --oneline -1` + `git log HEAD..origin/<branch> --oneline` — 落后检测
5. `git stash list` — 检查多余 stash
6. `git worktree list` — 检查多余 worktree
7. `git branch -a | grep -E '(develop|master|main)'` — 目标分支检测
8. `git add -A && git commit -m "<inferred-message>"` — 智能提交
9. `git fetch --all && git pull origin <current-branch>` — 拉取合并
10. `git checkout <target> && git merge <current-branch> && git push origin <target>` — 合并推送

## Verification

完成后报告：
- 同步前分支 → 同步后分支
- 提交数（新增/合并）
- 冲突检测结果（通过/发现冲突）
- 目标分支及推送状态
- stash/worktree 清理状态

## Summary

报告当前分支、目标分支、冲突检测结果、合并结果和推送结果。

## Next Steps

Sync 完成后的典型路径：
- 执行任务 → `/mxt-run <编号>` 或 `$mxt-run <编号>`
- 拉起环境 → `/mxt-start` 或 `$mxt-start`
- 如遇 BUG → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
