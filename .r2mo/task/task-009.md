---
runAt: 2026-05-27
title: ai-cmd 菜单用法说明增强 + Codex 技能补全
status: Done
author:
---

运行 mxt ai-cmd 时将各平台命令用法说明打印到多选菜单上方（header），而非每个选项后边的 description。说明采用列表格式每命令一行，带中文说明和 001 编号含义。同时修复 Codex 缺失 mxt-sync/mxt-start 技能的问题。

## Changes

### 变更摘要

1. **ai-cmd 菜单 header 增强**：用法说明从选项 description 移到菜单上方 header 区域，列表格式每命令一行，附中文说明（如 `/mxt:plan 001  生成执行计划`）
2. **001 编号含义说明**：header 中追加两行说明 001 是三位数字任务编号对应 `task-001.md`，goon 同时对应 `task-001.md` 和 `goon-001.md`
3. **Codex 技能补全**：新增 `skills/mxt-sync/SKILL.md` 和 `skills/mxt-start/SKILL.md`，修复 Codex 不识别 sync/start 命令的问题
4. **Codex plugin.json 更新**：description 补全 sync/start，defaultPrompt 补充 sync/start 用法
5. **Claude plugin.json 更新**：description 补全 debug/sync/start
6. **mxt-menu.js header 支持**：`selectMultiple`/`selectSingle` 新增 header 参数，在标题和选项之间渲染说明文字
7. **README.md 更新**：编号说明改为表格，明确区分不同命令的 001 含义（plan/run/end → task-001.md，goon → task-001.md + goon-001.md）

### 涉及文件

| 文件 | 操作 |
|:---|:---|
| `src/executor/executeAiCmd.js` | 修改 — 用法说明移到 header，列表格式+中文说明+001含义 |
| `src/utils/mxt-menu.js` | 修改 — `_baseSelect`/`selectMultiple`/`selectSingle` 支持 header 参数 |
| `agent/commands/codex/mxt/skills/mxt-sync/SKILL.md` | 新增 — Codex sync 技能 |
| `agent/commands/codex/mxt/skills/mxt-start/SKILL.md` | 新增 — Codex start 技能 |
| `agent/commands/codex/mxt/.codex-plugin/plugin.json` | 修改 — description/defaultPrompt 补全 sync/start |
| `agent/commands/claude/mxt/.claude-plugin/plugin.json` | 修改 — description 补全 debug/sync/start |
| `README.md` | 修改 — 编号说明改为表格区分不同命令含义 |

### 验证命令与结果

```bash
node --check src/executor/executeAiCmd.js    # OK
node --check src/utils/mxt-menu.js          # OK
node --check src/utils/mxt-ai-cmd.js        # OK
# Codex skills 目录：mxt-debug, mxt-end, mxt-goon, mxt-plan, mxt-run, mxt-start, mxt-sync（7 个齐备）
```
