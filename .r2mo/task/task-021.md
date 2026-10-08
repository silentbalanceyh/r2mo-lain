---
runAt: 2026-10-08.21-24-00
title: 修复 Codex /mtask 参数传递丢失
status: Done
author:
---

# Requirement

用户执行 Codex 的 `/mtask` 或 `$mxt-task` 时，模型收到的是“Using mxt:task ... The requirement argument is missing ... Usage: /mxt:task <requirement>”，即使调用方已经提供了自然语言需求也会误判为空。

Requirements:

1. 定位并修复 Codex MXT task prompt 无法携带用户提供 requirement 的结构性问题。
2. 生成/安装产物必须能在 Codex 会话中把 requirement 显式纳入任务执行上下文。
3. 保持 R2MO/MXT task 语义：先读 `.r2mo/task/thread`，在阈值之后的 `task-NNN.md` 中创建或匹配任务。
4. 以提供的提示词为准执行任务，任务完成后在该任务单中追加 `## Changes`。
5. Completion 时同步更新该任务单 frontmatter `status: Done`。

Acceptance:

- Source prompt template 明确引用 requirement 占位符，不能再只有 `argument-hint` 这类界面元数据。
- Regenerated Codex prompt 与 source template 保持一致，同一占位符存在。
- Installer-focused verification passes without regressing platform publication.

Deliverables:

- Fix `agent/commands/codex/mxt/commands/task.md` prompt template.
- Sync regenerated Codex plugin/prompt artifacts on the host.
- Record targeted verification and changed files in `## Changes`.

## Changes

- 2026-10-08 22:32:37: Fixed Codex `/mtask` requirement resolution by adding `$ARGUMENTS` binding and explicit captured-requirement forwarding rules; aligned the `$mxt-task` skill with the same input-resolution contract. Created this thresholded overflow task (`.r2mo/task/thread=15` → `task-021.md`), synced all five Codex source/prompt/plugin/cache copies, verified source/install parity and ran the owning task installer test.
  - Files changed: `agent/commands/codex/mxt/commands/task.md`, `agent/commands/codex/mxt/skills/mxt-task/SKILL.md`, installed Codex prompt/plugin/cache artifacts, `.r2mo/task/task-021.md`
  - Verification: PASS — source/install parity 5/5; `` present in promoted `/mtask`; `INPUT RESOLUTION` present in promoted `-task`; thread validation passed; `node src/index.test.js` exit 0 (“task tests passed”).
