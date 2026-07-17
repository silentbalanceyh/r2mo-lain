---
description: "Sync current project: conflict detection, smart commit, pull remote, merge to develop/master, and push."
argument-hint: ""
---

# /mxt:sync

## Harness

This Harness is the binding execution contract for this MXT command across Claude Code, Codex, and OpenCode. Treat localized sections below as legacy detail; this section wins when wording conflicts.

- English-first: write instructions, analysis, verification notes, and summaries in English by default. Use Chinese only when quoting existing repository content, preserving task titles/frontmatter/status values, showing exact localized command errors already required by this file, or when the user explicitly asks for Chinese.
- Rule loading: before task action, load repository entry rules (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`), project rule files (`.claude/rules`, `.codex/rules`, `.cursor/rules`, `.opencode`, other relevant `.mdc`), and `~/.codex/rules/r2mo-task-workflow.md` when present. Missing optional files do not block execution.
- Argument contract: resolve the explicit three-digit number first. If absent, list current-directory `.r2mo/task/` candidates only. Never resolve from parent, child, sibling, or historical timestamped task directories unless the user names that path.
- Task isolation lock: after resolving paths, print the locked path(s) before reading task content, and only read/write those locked `task-*.md`, `goon-*.md`, or `loop-*.json` files for this invocation.
- Disk source of truth: Do not trust conversation memory, previous summaries, installed plugin cache, or earlier reads. Re-read the locked files from disk immediately before decisions and again before write-back.
- Prompt echo: before editing, verification, or task execution, print the final action prompt in one Markdown code block with concrete paths substituted.
- Write-back guard: before any write, verify the destination exactly matches the isolation lock. Never duplicate `Plan` or `Changes`; update in place or append under the existing canonical section as instructed.
- Fresh evidence before completion claims: run the smallest sufficient verification for the changed boundary, read the output, and only then report success. Record skipped gates with the reason.
- Cross-agent portability: avoid tool-specific assumptions unless the platform section explicitly requires them. Keep prompts deterministic and safe for Claude Code, Codex skills, Codex prompts, and OpenCode JSON command templates.

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
