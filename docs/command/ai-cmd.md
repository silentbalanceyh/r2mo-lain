# mxt ai-cmd

## 用途

安装 mxt AI 命令到 Claude Code / Codex / OpenCode；Codex 安装为 plugin skills。

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-u` / `--uninstall` | 全量卸载 Claude Code / Codex / OpenCode 中的 mxt 命令 | boolean |

## 平台检测与安装位置

安装前会按当前平台解析用户配置目录，并按所选工具写入固定目标：

| 平台 | macOS / Linux | Windows |
|:---|:---|:---|
| Claude Code | `$HOME/.claude/...` | `%USERPROFILE%\.claude\...` |
| Codex | `$HOME/.codex/...` | `%USERPROFILE%\.codex\...` |
| OpenCode | `$HOME/.config/opencode/opencode.json` | `%USERPROFILE%\AppData\Roaming\opencode\opencode.json` |

Windows 上会优先使用属于当前用户主目录的 `APPDATA`；若 `HOME` / `USERPROFILE` / `APPDATA` 被重定向，则按有效用户主目录推导，避免写入错误位置。

## 说明

- 安装前建议关闭目标 AI 工具，避免文件锁定。
- 详细教程见 [`docs/ai-cmd.md`](../ai-cmd.md)。
- 平台与 Skills 的拆分文档见 [`docs/skills/README.md`](../skills/README.md)。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c ai-cmd
[MXT AI] SDD / Spec Driven Development ...

安装 mxt AI 命令到 Claude Code / Codex / OpenCode；Codex 安装为 plugin skills

Usage:
mxt ai-cmd [options]

Options:
[-u|--uninstall]         全量卸载 Claude Code / Codex / OpenCode 中的 mxt 命令
$ echo $?
0
```

## 安装可靠性

- 非交互安装会校验平台 ID，未知平台会返回结构化错误，不会误写默认位置。
- Windows 文件占用（`EPERM` / `EBUSY`）会自动重试，并给出关闭目标工具的建议。
- 权限、路径类型、句柄数量等文件系统错误会保留原始错误码，并附上平台、home 和目标路径。
- 检测不到宿主 CLI 时不会阻塞文件安装；CLI 注册步骤失败时会返回明确原因。
- 安装前建议关闭 Claude Code / Codex / OpenCode；安装后重启已打开的会话。
