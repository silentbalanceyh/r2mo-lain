---
description: "Debug R2MO issues: detects superpowers for systematic diagnosis, supports additional directives"
argument-hint: "[bug-description] [指令...]"
---

# /mxt:debug

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

启动 BUG 排查流程：检测当前环境是否安装 superpowers，有则调用系统化诊断命令，无则降级为手动排查。

The user invoked this command with: $ARGUMENTS

## 参数解析

1. `$ARGUMENTS` 为 BUG 描述文本，可包含三位数字任务编号，末尾可附加**执行指令**，以空格分隔，不区分大小写。支持的指令：
   - `深度` / `Deep` — 启用深度诊断，扩大排查范围
   - `Worktree` / `WT` — 在 Worktree 中隔离排查
2. 解析规则：从 `$ARGUMENTS` 末尾提取已知指令词；从剩余文本中提取第一个三位数字作为编号；若没有编号，立即询问用户提供编号。
3. 设定 `<GOON_PATH>` 为 `.r2mo/task/goon-$编号.md`，剩余文本作为 BUG 描述。解析后在聊天窗口中声明结果，例如 `📌 BUG描述: 内存泄漏 | 编号: 001 | 指令: 深度`。

**硬规则**：解析失败→终止 | Superpowers检测必执行（无则降级） | Worktree→`.r2mo/worktrees/` | 写回前确认目标路径等于 `<GOON_PATH>`

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`）。
2. 声明本次执行目标：BUG 排查，问题描述为 BUG 描述部分。
2. 检测当前环境中是否存在 `superpowers:systematic-debugging` 技能：
   - 若存在，调用 `superpowers:systematic-debugging` 技能，将 BUG 描述传入，按其工作流执行系统化诊断。
   - 若不存在，执行以下降级排查流程：
     a. 收集错误信息：读取 BUG 描述中提及的文件、日志或堆栈。
     b. 定位相关文件：在当前仓库中搜索与错误相关的模块、函数或配置。
     c. 分析根因：基于代码逻辑和错误现象推断根本原因。
     d. 给出修复建议：输出诊断结论和具体修复方向。
3. 在聊天窗口声明排查路径：`📌 诊断路径: Superpowers[systematic-debugging]` 或 `📌 诊断路径: 标准排查`。
4. **深度诊断**：若参数解析中检测到 `深度` 指令，扩大排查范围：搜索更多关联文件、检查间接依赖、分析边界条件。
5. **Worktree 隔离**：若参数解析中检测到 `Worktree` 指令，在 Worktree 中执行排查，避免影响当前工作区。
6. 排查完成后生成 `DEBUG Report` 并写入 `<GOON_PATH>`，使后续 `/mxt:goon <编号>` 可直接执行整改。
7. 写入 `<GOON_PATH>` 前必须再次声明 `📌 写回校验: <GOON_PATH>`，确认没有写入其他 `goon-*.md`。

## DEBUG Report

将 `<GOON_PATH>` 内容更新为以下格式：

```md
---
title: 整改-DEBUG-$编号
status: Pending
author:
---

# DEBUG Report

## BUG

- 描述：
- 触发条件：
- 影响范围：

## Evidence

- 复现步骤：
- 关键日志/错误：
- 相关文件：

## Root Cause

- 根因：
- 证据链：

## Fix Direction

- 修复方向：
- 风险点：
- 验证方式：

## 整改项

- [ ] ...
```

## 闭环指引

Debug 完成后的典型路径：
- 确认 BUG 后修复 → 修改代码后验证
- 直接整改 DEBUG 报告 → `/mxt:goon <编号>`
- 修复后验收 → `/mxt:end <编号>`（若关联具体任务）
- 复杂修复需规划 → `/mxt:plan <编号>`
- 修复后持续执行 → `/mxt:run <编号>`

## Verification

完成后说明排查结论、是否调用了 superpowers 诊断、发现的根因和修复建议，并确认 `DEBUG Report` 已写入 `<GOON_PATH>`。
