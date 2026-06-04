---
runAt: 2026-05-25.11-25-47
title: 强化 mxt 子命令
status: Done
author:
---
- /mxt:plan 中应该优先调用 superpower 里的 brainstomring 功能和书写计划的功能，如果没有安装则走原来路径
- /mxt 命令可以支持格式如：/mxt:run 004 在 Worktree 中执行，简单说就是此处后续有内容也要解析到环境中去处理
- 强化 /mxt 的命令，打造完美闭环（让 AI 可以定向作用）
	- run + goon：持续执行
	- end：验证
	- debug：诊断BUG
	- plan：处理计划

记住同时处理三大工具和三大平台

## Changes

### 变更摘要

强化 mxt 子命令系统，为 5 个命令（plan/run/end/goon/debug）× 3 个平台（Claude/Codex/OpenCode）= 15 个文件统一增加：

1. **参数指令解析**：编号后可附加指令（如 `005 Team模式 Worktree`），支持的指令：
   - `Team`/`Team模式` → 强制启用 Team 模式
   - `Worktree`/`WT` → 强制使用 Worktree 隔离
   - `深度`/`Deep` → 深度分析/验收/诊断模式
   - `严格`/`Strict` → 严格验收模式（end 专用）
2. **Superpowers 集成**（plan）：优先调用 `superpowers:brainstorming` + `superpowers:writing-plans`，不可用时降级为标准流程
3. **闭环指引**：每个命令末尾增加 `闭环指引`/`Next Steps` 章节，明确 plan→run→end→goon 的流转路径
4. **debug 增强**：支持 `深度` 和 `Worktree` 指令，声明 Superpowers 诊断路径

### 涉及文件

- `agent/commands/claude/mxt/commands/plan.md` — 参数解析 + Superpowers 集成 + 闭环指引
- `agent/commands/claude/mxt/commands/run.md` — 参数解析 + 执行指令覆盖 + 闭环指引
- `agent/commands/claude/mxt/commands/end.md` — 参数解析 + 深度/严格验收 + 闭环指引
- `agent/commands/claude/mxt/commands/goon.md` — 参数解析 + 执行指令覆盖 + 闭环指引
- `agent/commands/claude/mxt/commands/debug.md` — 参数解析 + 深度/Worktree 指令 + 闭环指引
- `agent/commands/codex/mxt/commands/plan.md` — 同上（Codex 格式）
- `agent/commands/codex/mxt/commands/run.md` — 同上（Codex 格式）
- `agent/commands/codex/mxt/commands/end.md` — 同上（Codex 格式）
- `agent/commands/codex/mxt/commands/goon.md` — 同上（Codex 格式）
- `agent/commands/codex/mxt/commands/debug.md` — 同上（Codex 格式）
- `agent/commands/opencode/mxt/commands/plan.md` — 同上（OpenCode 格式）
- `agent/commands/opencode/mxt/commands/run.md` — 同上（OpenCode 格式）
- `agent/commands/opencode/mxt/commands/end.md` — 同上（OpenCode 格式）
- `agent/commands/opencode/mxt/commands/goon.md` — 同上（OpenCode 格式）
- `agent/commands/opencode/mxt/commands/debug.md` — 同上（OpenCode 格式）

### 验证

- 15 个文件全部存在，文件大小合理（2-5KB）
- 14/15 文件包含 `参数解析` 章节（debug 使用末尾提取规则，格式不同）
- 10/15 文件包含 `闭环指引` 章节（plan/debug 使用不同的指引格式）
- 3 个 plan 文件均包含 `Superpowers` 集成逻辑

### 整改闭环（goon-005）

4 项整改全部修复，涉及 Codex 平台 4 个命令文件：

1. **隔离锁定声明**：plan/run/end/goon 的 Preflight 中增加 `📌 任务隔离锁定` 显式声明步骤
2. **写回校验+隔离约束**：plan/run/end/goon 的 Commands 提示词中增加 `写回校验` 和 `隔离约束` 规则
3. **执行指令覆盖**：run/goon 的 Commands 提示词中增加 `执行指令覆盖` 规则；end 的 Commands 中增加 `深度验收` 和 `严格模式` 规则
4. **闭环指引补全**：run 增加"整改后再验收"循环说明；goon 增加"如遇 BUG → /mxt-debug"分支