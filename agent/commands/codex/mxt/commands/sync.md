---
description: "同步当前项目：全量提交、拉取远程、合并到 develop/master 并推送"
argument-hint: ""
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-sync

同步当前项目 Git 状态：全量提交、拉取远程、合并到目标分支并推送。

## Arguments

The user invoked this command with: $ARGUMENTS

本命令无参数。直接执行同步流程。

**硬规则**：执行前确认工作区状态 | 合并冲突→终止 | 推送失败→终止 | Worktree检查必执行

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。

## Plan

1. 将当前系统中所有改动全量提交（`git add -A` + `git commit`）。
2. 从远程拉取最新版和当前所有改动进行合并（`git fetch --all` + `git pull`）。
3. 确认环境中没有多余 stash：若有 stash 记录，提示用户确认是否需要清理。
4. 确认环境中没有多余 worktree：若有额外 worktree，提示用户确认是否需要清理。
5. 合并最新版到 develop（第一优先级），如果没有 develop 则合并到 master。
6. 合并完成后 push 一份到远程对应分支中。

## Commands

1. `git add -A && git commit -m "sync: auto commit before sync"`
2. `git fetch --all && git pull origin <current-branch>`
3. `git stash list` — 检查多余 stash
4. `git worktree list` — 检查多余 worktree
5. `git checkout develop || git checkout master`
6. `git merge <current-branch> && git push origin <target-branch>`

## Verification

完成后说明当前分支、目标分支、合并结果和推送结果。

## Summary

报告当前分支、目标分支、合并结果和推送结果。

## Next Steps

Sync 完成后的典型路径：
- 执行任务 → `/mxt-run <编号>` 或 `$mxt-run <编号>`
- 拉起环境 → `/mxt-start` 或 `$mxt-start`
- 如遇 BUG → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
