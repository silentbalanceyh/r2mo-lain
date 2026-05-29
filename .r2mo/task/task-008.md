---
runAt: 2026-05-27
title: 三平台命令闭环补全 — start/sync 规则扫描与结构对齐
status: Done
author:
---

## 背景

task-005/006 对 plan/run/end/goon/debug 五个命令做了三平台统一强化，但 start 和 sync 两个命令存在以下闭环缺失：

## 待执行项

1. **Codex start/sync Preflight 规则扫描不完整**
   - 当前：仅扫描 `.codex/rules/`、`.cursor/rules/` 及其他路径
   - 缺失：`.claude/rules/`、`.opencode/` 目录，以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）
   - 涉及文件：
     - `agent/commands/codex/mxt/commands/start.md`
     - `agent/commands/codex/mxt/commands/sync.md`
   - 对齐目标：与 Claude/OpenCode 版本一致，扫描 `.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`，加上 `~/.codex/rules/r2mo-task-workflow.md`（若存在）

2. **Codex start/sync 缺少 Summary + Next Steps section**
   - 当前：Codex start/sync 结构到 `## Verification` 即结束
   - 缺失：`## Summary` 和 `## Next Steps`（其他5个 Codex 命令均有）
   - 涉及文件：
     - `agent/commands/codex/mxt/commands/start.md`
     - `agent/commands/codex/mxt/commands/sync.md`
   - 对齐目标：补全 `## Summary`（执行摘要）和 `## Next Steps`（后续路径指引，如 sync 后可 run/start，start 后可 run/debug）

3. **Claude/OpenCode start/sync 缺少闭环指引 section**
   - 当前：Claude/OpenCode start/sync 结构到 `## Verification` 即结束，无闭环指引
   - 缺失：`## 闭环指引`（其他5个 Claude/OpenCode 命令均有）
   - 涉及文件：
     - `agent/commands/claude/mxt/commands/start.md`
     - `agent/commands/claude/mxt/commands/sync.md`
     - `agent/commands/opencode/mxt/commands/start.md`
     - `agent/commands/opencode/mxt/commands/sync.md`
   - 对齐目标：补全 `## 闭环指引`，指引 start 后可 run/debug，sync 后可 run/start

## 变更范围

- 2 个 Codex 文件（start.md, sync.md）— 修正 Preflight + 补 Summary/Next Steps
- 4 个 Claude/OpenCode 文件（start.md×2, sync.md×2）— 补闭环指引

## 验证

- Codex start/sync Preflight 包含完整扫描路径（`.claude/rules/` + `.codex/rules/` + `.cursor/rules/` + `.opencode/` + `r2mo-task-workflow.md`）
- Codex start/sync 包含 `## Summary` + `## Next Steps`
- Claude/OpenCode start/sync 包含 `## 闭环指引`
- 三平台 7×3=21 个文件结构完整对齐

## Changes

- 2026-05-27 16:30: 三平台 start/sync 命令闭环补全
  - Files changed: `agent/commands/codex/mxt/commands/start.md`, `agent/commands/codex/mxt/commands/sync.md`, `agent/commands/claude/mxt/commands/start.md`, `agent/commands/claude/mxt/commands/sync.md`, `agent/commands/opencode/mxt/commands/start.md`, `agent/commands/opencode/mxt/commands/sync.md`
  - 变更1: Codex start/sync Preflight 规则扫描补全 `.claude/rules/`、`.opencode/`、`r2mo-task-workflow.md`
  - 变更2: Codex start/sync 追加 `## Summary` + `## Next Steps`
  - 变更3: Claude/OpenCode start/sync 追加 `## 闭环指引`
  - Verification: grep 验证 21/21 文件均含闭合段落（Codex: Summary/Next Steps, Claude/OpenCode: 闭环指引），结构完整对齐
