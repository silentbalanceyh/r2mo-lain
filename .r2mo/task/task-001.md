---
runAt: 2026-06-04.15-57-44
title: 更新文档结构
status: Done
author:
---
README.md 调整

在 docs 中存放命令专用子文档：
- docs/command 中存放 mxt 直接命令文档
- docs/ai-cmd.md 中存放 ai-cmd 命令专用文档
- docs/skills 中存放 ai-cmd 安装的三个平台的Skills专用文档

保留部分：
- 顶部引导保留（包括图）
- 工具安装保留
- 命令清单保留（用链接到子文档）
- 闭环流程 mermaid 的图保留
- 参考链接保留
## Changes

- 2026-08-28 11:47: 按 task-001 重写文档结构，README 改为入口教程并拆分命令/AI/Skills 子文档。
  - Files changed: `README.md`, `docs/command/*.md`, `docs/ai-cmd.md`, `docs/skills/README.md`, `docs/skills/claude-code.md`, `docs/skills/codex.md`, `docs/skills/opencode.md`
  - Verification: `node` 文档链接/命令文档/bash 执行块检查通过；`npm run validate:commands` 通过；`node src/mxt.js help` 和 `node src/mxt.js help -c docs` 执行成功。


- 2026-08-28 12:01: 继续按反馈拆散文档，将 `docs/skills/` 扩展为平台入口、每个 `mxt-*` Skill 独立说明，以及每个 R2MO UI Skill 的一页式介绍；任务完成后将 task-001 标记为 Done。
  - Files changed: `README.md`, `docs/ai-cmd.md`, `docs/command/ai-cmd.md`, `docs/skills/README.md`, `docs/skills/mxt-*.md`, `docs/skills/r2mo-ui-*.md`, `docs/skills/claude-code.md`, `docs/skills/codex.md`, `docs/skills/opencode.md`
  - Verification: `node -c src/executor/executeDocs.js` 通过；`npm run validate:commands` 通过；`node src/mxt.js help` 和 `node src/mxt.js help -c docs` 执行成功；自定义 Markdown 链接、命令文档数量、Skills 文档 bash 执行块检查通过（command docs 24/24，skill docs 20）。

- 2026-08-28 12:20: 继续补强命令与 Skills 的总览层：README 章节收束为引导/工具安装/核心功能/参考链接；`docs/command/README.md` 与 `docs/skills/README.md` 增加总体介绍、安装位置、配置来源和索引说明；`docs/command/docs.md` 补充默认启用插件表；模板源头移除 `claudian`，并让 `mxt docs` 同步时清理目标里已不存在的旧插件目录。
  - Files changed: `README.md`, `docs/command/README.md`, `docs/skills/README.md`, `docs/command/docs.md`, `src/executor/executeDocs.js`, `src/_template/LAIN/.obsidian/workspace.json`, `.obsidian/workspace.json`, `.r2mo/.obsidian/workspace.json`
  - Verification: `node -c src/executor/executeDocs.js` 通过；`node -c src/utils/mxt-ai-cmd.js` 通过；`npm run validate:commands` 通过；`node src/mxt.js help` 和 `node src/mxt.js help -c docs` 执行成功；自定义检查确认 README 仅保留 4 个一级章节、两张图与核心 mermaid、命令/Skill 总览链接、`claudian` 已从源头与目标清理、启用插件表与源头一致。


- 2026-08-28 12:28: 按反馈继续收敛文档入口：README 的“入口索引”只保留 `mxt xxx Commands` 与 `mxt-* Skills` 两个主链接；`docs/skills/README.md` 合并 Claude Code / Codex / OpenCode 平台说明，不再拆分平台入口页；移除命令/Skill 文档入口中对 `r2mo-ui-*` Skills 的介绍，仅保留 `mxt-*` 命令 Skill 子文档。
  - Files changed: `README.md`, `docs/ai-cmd.md`, `docs/skills/README.md`, removed generated top-level `docs/skills/claude-code.md`, `docs/skills/codex.md`, `docs/skills/opencode.md`, `docs/skills/r2mo-ui-*.md`
  - Verification: `node -c src/executor/executeDocs.js` 通过；`npm run validate:commands` 通过；`node src/mxt.js help` 和 `node src/mxt.js help -c docs` 执行成功；自定义检查确认 README 仍为 4 个主章节、两张图和 mermaid 保留在首页核心功能中、入口索引仅 2 个链接、top-level Skill 文档收敛为 `README.md` + 8 个 `mxt-*` 文档且链接有效。
