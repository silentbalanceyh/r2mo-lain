---
runAt: 2026-05-25.11-26-41
title: 追加新命令mxt ai-cmd
status: Done
author:
---
运行 mxt ai-cmd 的时候将 Claude , OpenCode 以及 Codex 中的用法打印到多选菜单上边进行说明

/mxt:sync 新命令，一旦执行，直接同步 git
- 将当前系统中所有改动（全量提交）
- 从远程拉取最新版和当前所有改动进行合并
- 确认环境中没有多余 stash
- 确认环境中没有多余 worktree
- 合并最新版到 develop（第一优先级），如果没有 develop 则 master
- 合并完成后 push 一份到远程对应分支中

/mxt:start 新命令，一旦执行，直接拉起当前环境
- 必须参考 mdc 进行环境拉起
- 如果环境已经启动，则停止之后编译最新版然后再拉起
- 确保拉起环境的整体稳定性，不要出现其他额外流程

## Changes

### 变更摘要

1. **ai-cmd 菜单增强**：安装时多选菜单中展示各平台命令用法说明（Claude/OpenCode 用 `/mxt:plan` 格式，Codex 用 `$mxt-plan` 格式）
2. **新增 mxt sync 命令**：全量提交 → fetch/pull → 检查 stash/worktree → 合并到 develop(优先)/master → push
3. **新增 mxt start 命令**：扫描 mdc 规则检测启动命令 → 检测运行状态 → 停止(若已启动) → 编译 → 拉起环境
4. **README.md 更新**：新增 sync/start 命令文档，命令按字典序排列，AI 平台命令表补充 debug/sync/start

### 涉及文件

| 文件 | 操作 |
|:---|:---|
| `src/executor/executeAiCmd.js` | 修改 — 添加平台用法说明常量，菜单 description 展示用法 |
| `src/executor/executeSync.js` | 新增 — sync 命令执行器 |
| `src/executor/executeStart.js` | 新增 — start 命令执行器 |
| `src/executor/index.js` | 修改 — 注册 executeSync、executeStart |
| `src/commander/sync.json` | 新增 — sync 命令配置 |
| `src/commander/start.json` | 新增 — start 命令配置 |
| `src/utils/mxt-ai-cmd.js` | 修改 — MXT_COMMANDS 添加 sync/start，卸载清理 sync/start prompts，plugin description 更新 |
| `agent/commands/claude/mxt/commands/sync.md` | 新增 — Claude Code sync 命令 |
| `agent/commands/claude/mxt/commands/start.md` | 新增 — Claude Code start 命令 |
| `agent/commands/codex/mxt/commands/sync.md` | 新增 — Codex sync 命令 |
| `agent/commands/codex/mxt/commands/start.md` | 新增 — Codex start 命令 |
| `agent/commands/opencode/mxt/commands/sync.md` | 新增 — OpenCode sync 命令 |
| `agent/commands/opencode/mxt/commands/start.md` | 新增 — OpenCode start 命令 |
| `agent/commands/claude/mxt/plugin.json` | 修改 — description 添加 sync/start |
| `README.md` | 修改 — 新增命令文档、字典序重排、闭环流程补充 |

### 验证命令与结果

```bash
node --check src/executor/executeSync.js    # OK
node --check src/executor/executeStart.js   # OK
node --check src/executor/executeAiCmd.js   # OK
node --check src/executor/index.js          # OK
node --check src/utils/mxt-ai-cmd.js       # OK
# 全部通过，7 个 agent command 文件（3 平台 × sync+start）均已创建
```

### 整改闭环（goon-007）

#### 整改项 1：sync 失败路径未中断

- 修复：新增 `_must()` 函数，关键 git 操作失败立即 `process.exit(1)`
- 涉及 9 处 `_run()` → `_must()` 替换：add、commit、fetch、pull、checkout、merge、push
- 验证：`grep -c '_must(' src/executor/executeSync.js` → 9 处

#### 整改项 2：OpenCode 安装路径未尊重 homeDir

- 修复：`openCodeConfigDir(homeDir)` 接受 homeDir 参数，Windows 下仅真实 home 使用 `%APPDATA%`
- `PLATFORMS.opencode.targetDir` 改为 `(homeDir) => path.join(openCodeConfigDir(homeDir), 'opencode.json')`
- `openCodeConfigFiles` 内部调用传入 `homeDir`
- 验证：`grep -n 'openCodeConfigDir' src/utils/mxt-ai-cmd.js` → 三处均传入 homeDir

#### 整改项 3：start 进程检测过于宽泛

- 修复：移除全局 `pgrep -f "node"` / `pgrep -f "java"` 检测
- 新增 `_isProjectRunning(startCmd, cwd)`：从 mdc 提取的启动命令中反推进程特征（脚本名/路径）
- 启动/构建/停止命令统一由 mdc 优先提供，磁盘脚本作为 fallback
- 验证：`grep -c 'pgrep.*node\|pgrep.*java' src/executor/executeStart.js` → 0

#### 整改项 4（第二轮）：三平台 start.md 进程检测说明未对齐

- 修复：Codex `start.md` 去掉 `pgrep -f "node|java"`，改为基于启动命令特征（脚本名/路径）检测
- Claude/OpenCode `start.md` Workflow 步骤 3 补充"基于启动命令特征检测"和"不使用全局 node/java 进程检测"说明
- 三平台行为说明现已与 `executeStart.js` 的 `_isProjectRunning()` 逻辑一致
- 涉及文件：`agent/commands/codex/mxt/commands/start.md`、`agent/commands/claude/mxt/commands/start.md`、`agent/commands/opencode/mxt/commands/start.md`
- 验证：三平台 start.md 中无全局 `pgrep -f "node|java"`，均为"基于启动命令特征"检测