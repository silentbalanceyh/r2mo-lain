---
runAt: 2026-05-25.11-26-41
title: 强化 mxt 子命令 — 规则加载与硬规则
status: Done
author:
---
- 所有命令执行前必须加载完整规则：AGENTS.md/CLAUDE.md/CODEX.md 及其引用的所有规则文件，扫描项目中所有可检索的 .mdc 规则文件
- 追加硬规则：一行摘要式，禁止性语言约束关键执行路径
- end 验收仅核验 Changes 声明范围，不触碰非本次变更的脏文件
- Worktree 规范：必须存储在项目内 .r2mo/worktrees/task-<编号>，三平台共享
- Superpowers 检测必执行（无则降级），不可跳过也不因缺失而失败
- 规则持久化到项目记忆 mxt-hard-rules.md 和 Priority Context

## Changes

### 变更摘要

1. **规则加载补全**：15 个文件扩展规则加载步骤为读取引用规则文件 + 扫描项目中所有可检索的 `.mdc` 规则文件
2. **硬规则**：15 个文件统一追加一行硬规则摘要
3. **end 验收边界**：3 个 end.md 追加"验收仅核验Changes声明范围，不触碰非本次变更的脏文件"
4. **Worktree 规范**：6 个 run/goon 文件追加项目内 `.r2mo/worktrees/task-<编号>` 规则
5. **规则持久化**：写入项目记忆 `mxt-hard-rules.md` 和 Priority Context

### 涉及文件

- 15 个命令文件（3 平台 × 5 命令）
- `.claude/projects/.../memory/mxt-hard-rules.md` — 规则持久化

### 验证

- 15/15 文件包含 `扫描项目中所有可检索的 .mdc`
- 15/15 文件包含 `硬规则` 一行摘要
- 6/6 run/goon 包含 Worktree 规范
- 3/3 end 包含验收边界约束

### 整改闭环（goon-006）

4 项整改全部修复：

1. **三文件统一加载**：15 个文件统一为 `AGENTS.md` + `CLAUDE.md` + `CODEX.md`（若存在）
2. **Superpowers 硬规则全覆盖**：9 个 run/end/goon 文件硬规则追加 `Superpowers检测必执行（无则降级）`，15/15 全覆盖
3. **mxt-hard-rules.md 持久化**：文件存在于 `.claude/projects/.../memory/mxt-hard-rules.md`，MEMORY.md 索引已补充
4. **Priority Context 持久化**：通过 OMC notepad API 写入，运行时可自动加载

### goon-006 二次整改闭环（2026-05-27）

1. **mxt-hard-rules.md 内容修正**：将"plan/debug 必须检测 superpowers 技能"更新为"所有命令执行前必检测 superpowers 技能，无则降级走标准流程"，与 15/15 命令文件实现一致
2. **Priority Context 落盘证据**：确认 `.omc/notepad.md` Priority Context 区域已持久化硬规则摘要，后续 Agent 可通过读取该文件直接发现和核验

### 验证（goon-006 二次）

- mxt-hard-rules.md Superpowers 规则描述已与 15/15 命令文件一致
- `.omc/notepad.md` Priority Context 可被后续 Agent 直接读取核验
- goon-006.md 已清空，无待整改项
