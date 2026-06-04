---
runAt: 2026-05-25.17-57-24
title: 追加新的命令
status: Done
author:
---
基于当前 /mxt 系列命令，追加新的 /mxt:debug 专用命令，这种任务应该是直接处理成 BUG 排查，检查当前环境中是否存在 superpowers，如果有，调用系统排查的命令进行BUG诊断。

## Plan

### 目标拆解

1. **新增 `/mxt:debug` AI 命令**：作为 `/mxt:plan|run|end|goon` 之外的第五个专用命令，面向 BUG 排查场景
2. **Superpowers 检测与调度**：命令执行时先检测当前环境是否安装了 superpowers 插件；有则调用 `superpowers:systematic-debugging` 进行系统化 BUG 诊断；无则降级为手动排查工作流
3. **全平台覆盖**：Claude Code / Codex / OpenCode 三平台均需安装该命令
4. **安装/卸载闭环**：`mxt ai-cmd` 安装和卸载时正确处理 `debug` 命令

### 涉及文件/模块

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `agent/commands/claude/mxt/commands/debug.md` | 新增 | Claude Code slash command 定义 |
| `agent/commands/codex/mxt/commands/debug.md` | 新增 | Codex prompt command 定义 |
| `agent/commands/opencode/mxt/commands/debug.md` | 新增 | OpenCode command 定义 |
| `src/utils/mxt-ai-cmd.js` | 修改 | `MXT_COMMANDS` 数组追加 `'mxt:debug'`，卸载清理逻辑自动生效 |
| `agent/commands/claude/mxt/plugin.json` | 修改 | `description` 字段追加 `/mxt:debug` |

### 执行步骤

**Step 1 — 创建 `agent/commands/claude/mxt/commands/debug.md`**

- YAML frontmatter：`description: "BUG 排查：检测 superpowers 并调用系统化诊断命令"`，`argument-hint: "[bug-description]"`
- 正文 Workflow：
  1. 声明本次执行目标（BUG 排查）
  2. 检测 superpowers 是否可用（检查 skill 列表中是否存在 `superpowers:systematic-debugging`）
  3. **有 superpowers**：调用 `superpowers:systematic-debugging` skill，传入 `$ARGUMENTS` 作为 BUG 描述，按其工作流执行
  4. **无 superpowers**：降级为手动排查流程——收集错误信息、定位相关文件、分析根因、给出修复建议
  5. 排查完成后输出诊断结论和修复方向
- 风格与 plan.md / run.md 保持一致（Workflow 编号、Verification 段落）

**Step 2 — 创建 `agent/commands/codex/mxt/commands/debug.md`**

- 与 Step 1 内容一致，Codex 平台无需额外适配

**Step 3 — 创建 `agent/commands/opencode/mxt/commands/debug.md`**

- 与 Step 1 内容一致，OpenCode 平台无需额外适配

**Step 4 — 修改 `src/utils/mxt-ai-cmd.js`**

- 将 `MXT_COMMANDS` 数组从 `['mxt:plan', 'mxt:run', 'mxt:end', 'mxt:goon']` 更新为 `['mxt:plan', 'mxt:run', 'mxt:end', 'mxt:goon', 'mxt:debug']`
- `removeOpenCodeCommandEntries` 函数依赖此数组进行卸载清理，追加后自动生效，无需额外修改

**Step 5 — 修改 `agent/commands/claude/mxt/plugin.json`**

- 更新 `description` 字段为 `"R2MO task workflow slash commands: /mxt:plan, /mxt:run, /mxt:end, /mxt:goon, /mxt:debug."`

### 验证方式

1. **语法检查**：`node --check src/utils/mxt-ai-cmd.js` 确认无语法错误
2. **安装测试**：`node src/mxt.js ai-cmd` 选择 Claude 平台安装，确认 `debug.md` 被复制到目标目录
3. **命令发现**：在 Claude Code 中输入 `/mxt:debug` 确认命令可被发现
4. **卸载测试**：`node src/mxt.js ai-cmd -u` 确认 `mxt:debug` 条目被正确清理
5. **功能验证**：在 Claude Code 中执行 `/mxt:debug 问题描述` 确认 superpowers 检测逻辑和降级路径均正常工作

### 风险与交接说明

- **风险**：superpowers 检测依赖于 skill 列表在运行时可见，若 Claude Code 版本差异导致 skill 发现机制不同，降级路径需作为兜底保障
- **边界**：本 Plan 仅覆盖 `/mxt:debug` 命令的创建与安装，不涉及 superpowers 插件本身的修改
- **交接**：实施者需确认三平台 debug.md 内容一致；安装后需在真实环境执行一次端到端验证

## Changes

- 2026-05-26 11:00: 新增 `/mxt:debug` AI 命令，覆盖 Claude Code / Codex / OpenCode 三平台
  - Files changed: `agent/commands/claude/mxt/commands/debug.md` (新增), `agent/commands/codex/mxt/commands/debug.md` (新增), `agent/commands/opencode/mxt/commands/debug.md` (新增), `src/utils/mxt-ai-cmd.js` (MXT_COMMANDS 追加 `mxt:debug`), `agent/commands/claude/mxt/plugin.json` (description 追加 `/mxt:debug`)
  - Verification: `node --check src/utils/mxt-ai-cmd.js` 通过；三平台 debug.md 文件存在且 frontmatter 正确；`require('./src/utils/mxt-ai-cmd')` 加载正常

- 2026-05-26 11:15: 整改闭环 — 修复两处遗漏
  - 整改项 1：`src/utils/mxt-ai-cmd.js` marketplace JSON description 追加 `/mxt:debug`（L307）
  - 整改项 2：`src/utils/mxt-ai-cmd.js` `uninstallCodexPlugin` 追加 `mxt-debug.md` 卸载清理（L510）
  - Verification: `node --check src/utils/mxt-ai-cmd.js` 通过；`require('./src/utils/mxt-ai-cmd')` 加载正常