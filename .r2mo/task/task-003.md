---
runAt: 2026-05-26.14-41-00
title: 强化跨平台兼容性（Windows / Linux / macOS）
status: Done
author: Claude
---

## 目标

全量扫描 r2mo-lain 所有命令源码，修复 Windows / Linux / macOS 三平台兼容性问题，确保安装、卸载、命令执行在三个平台上行为一致。

## 扫描结果

### 高严重度：Windows `spawn`/`execSync` 缺少 `shell: true`

Windows 上 npm 全局安装的 CLI 是 `.cmd` 文件，`spawn`/`execSync` 不加 `shell: true` 会抛 `ENOENT`。

| 文件 | 调用 |
|------|------|
| `src/utils/mxt-audio.js` | `spawnSync(checker)`, `spawn(player.command)` |
| `src/utils/mxt-ai-cmd.js` | `spawnSync(lookup)`, `spawnSync(command)` |
| `src/executor/executeOpen.js` | `spawn(whereCmd)`, `spawn(command)` |
| `src/executor/executeApp.js` | `spawn(whereCmd)`, `spawn('ai')` |
| `src/executor/executeMmr0.js` | `execSync(whereCmd)`, `execSync(git fetch/rev-parse/pull)` |
| `src/executor/executeMmr2.js` | `execSync(whereCmd)`, `execSync(git fetch/rev-parse/pull)` |
| `src/executor/executeDomain.js` | `spawn(whereCmd)`, `execSync(git fetch/rev-parse/pull)` |
| `src/executor/executeDocs.js` | `execSync(whereCmd obsidian)` |
| `src/executor/executeMod.js` | `execSync(git fetch/rev-parse/pull)` |
| `src/executor/executeMcp.js` | `execSync(npm install)` |
| `src/executor/executeApply.js` | `execSync(git pull/clone)` |
| `src/executor/executeDict.js` | `execSync(npm install -g)` |
| `src/executor/executeEnv.js` | `execAsync(whereCmd/java/node/npm/git/codex)` 共 8 处 |
| `src/utils/mxt-file-utils.js` | `execSync(git clone)` |

### 高严重度：OpenCode 配置路径

- `mxt-ai-cmd.js` OpenCode 平台 `targetDir` 硬编码 `~/.config/opencode/`，Windows 不使用此路径，应使用 `%APPDATA%\opencode\`

### 中严重度：Windows 文件锁定

- `mxt-ai-cmd.js` 中 `fs.rm`/`fs.copyFile` 在文件被占用时抛 `EPERM`/`EBUSY`，无重试机制

### 中严重度：符号链接

- `mxt-ai-cmd.js` 和 `mxt-file-utils.js` 中 `copyDir` 只处理 `isFile()`，跳过 `isSymbolicLink()`

### 低严重度：README 缺少跨平台安装说明

- 2.1 安装章节只有一行 `npm install -g mxt-ai`，无平台差异说明
- 缺 Windows 排错提示（PowerShell 执行策略、文件锁定）

## Changes

### 代码修复

1. **`src/utils/mxt-ai-cmd.js`**
   - `commandExists` / `runOptionalCommand`：加 `shell: process.platform === 'win32'`
   - 新增 `openCodeConfigDir()`：Windows 使用 `%APPDATA%\opencode\`，其他平台使用 `~/.config/opencode/`
   - `PLATFORMS[2].targetDir` 改为调用 `openCodeConfigDir()`
   - `openCodeConfigFiles` 使用 `openCodeConfigDir()` 查找 legacy jsonc
   - 新增 `retryOnWindows()`：对 `removeIfExists`、`removeExistingPath`、`copyFile` 自动重试 `EPERM`/`EBUSY`
   - `copyDir` 增加 `entry.isSymbolicLink()` 分支

2. **`src/utils/mxt-audio.js`**
   - `_isCommandAvailable`：`spawnSync` 加 `shell: process.platform === 'win32'`
   - `_playWith`：`spawn` 加 `shell: process.platform === 'win32'`

3. **`src/utils/mxt-file-utils.js`**
   - `gitClone`：`execSync` 加 `shell: process.platform === 'win32'`

4. **`src/executor/executeOpen.js`**
   - `_isCommandAvailable`：`spawn` 加 `shell`
   - `_openWithSpawn`：`spawn` 加 `shell`

5. **`src/executor/executeApp.js`**
   - `_isCommandAvailable`：`spawn` 加 `shell`
   - `_executeAiCommand`：`spawn('ai')` 改 `shell: false` 为 `shell: process.platform === 'win32'`

6. **`src/executor/executeMmr0.js`**
   - `_isCommandAvailable`、`_isRepositoryUpToDate`、`_cloneOrUpdateRepository` 中所有 `execSync` 加 `shell`

7. **`src/executor/executeMmr2.js`**
   - 同上，4 处 `execSync` 加 `shell`

8. **`src/executor/executeDomain.js`**
   - `_isCommandAvailable`：`spawn` 加 `shell`
   - git 操作 3 处 `execSync` 加 `shell`

9. **`src/executor/executeDocs.js`**
   - `execSync(whereCmd obsidian)` 加 `shell`

10. **`src/executor/executeMod.js`**
    - git 操作 3 处 `execSync` 加 `shell`

11. **`src/executor/executeMcp.js`**
    - `execSync('npm install')` 加 `shell`

12. **`src/executor/executeApply.js`**
    - `execSync(git pull/clone)` 2 处加 `shell`

13. **`src/executor/executeDict.js`**
    - `execSync(npm install -g)` 加 `shell`

14. **`src/executor/executeEnv.js`**
    - 新增 `_shellOpt()` 辅助函数
    - 8 处 `execAsync` 调用全部加 `_shellOpt()`

### README.md 修复

- 2.1 安装章节：补充 macOS / Linux / Windows 三平台安装命令、权限处理、卸载命令
- 添加 Windows 文件锁定排错提示
- 2.3 AI 平台命令安装：闭环流程 Mermaid 图改纵向（`flowchart TD`）
- 文字按子章节拆分（闭环流程、前置校验、各平台调用方式、卸载、平台安装细节）
- SDD 表格按平台拆分为两个独立表格
- 平台安装细节表格改为 bullet list
- 各列表行加 `<br/>` 换行避免拥挤

### 验证

- 14 个修改文件全部通过 `node --check` 语法检查

### Goon 整改闭环（goon-003）

整改项：`mxt-file-utils.js` 的 `copyDir` 使用 `fsAsync.stat()`（跟随符号链接），需改为 `fsAsync.lstat()`（不跟随），并补齐 `isSymbolicLink()` 分支。

修复内容：
- `fsAsync.stat(sPath)` → `fsAsync.lstat(sPath)`
- 新增 `stat.isSymbolicLink()` 分支：使用 `fsAsync.readlink()` 读取链接目标，再用 `fsAsync.symlink()` 重建链接
- 目录和普通文件分支保持不变

涉及文件：`src/utils/mxt-file-utils.js:20-33`

验证：`node --check src/utils/mxt-file-utils.js` 通过，goon-003.md 整改项已清空。
