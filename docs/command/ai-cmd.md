# mxt ai-cmd

## 用途

安装 mxt AI 命令到 Claude Code / Codex / OpenCode / Pi Agent；Codex 安装为 plugin skills 并提供 `/m<workflow>` 短命令与 `$mxt-task` 语义别名，Pi Agent 安装为全局 skills 与 /mxt-* 短命令。

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-u` / `--uninstall` | 全量卸载 Claude Code / Codex / OpenCode / Pi Agent 中的 mxt 命令 | boolean |

## 平台检测与安装位置

安装前会按当前平台解析用户配置目录，并按所选工具写入固定目标：

| Platform | macOS / Linux | Windows |
| :--- | :--- | :--- |
| Claude Code | `$HOME/.claude/...` | `%USERPROFILE%\.claude\...` |
| Codex | `$HOME/.codex/...` | `%USERPROFILE%\.codex\...` |
| OpenCode | `$HOME/.config/opencode/opencode.json` | `%USERPROFILE%\AppData\Roaming\opencode\opencode.json` |
| Pi Agent | `$HOME/.pi/agent/skills/mxt-*/SKILL.md`、`$HOME/.pi/agent/prompts/mxt-*.md` | `%USERPROFILE%\.pi\agent\skills\mxt-*\SKILL.md`、`%USERPROFILE%\.pi\agent\prompts\mxt-*.md` |

Windows 上会优先使用属于当前用户主目录的 `APPDATA`；若 `HOME` / `USERPROFILE` / `APPDATA` 被重定向，则按有效用户主目录推导，避免写入错误位置。

## 说明

- 每个平台保持 10 个 MXT 工作流：`plan`、`run`、`end`、`goon`、`debug`、`sync`、`start`、`loop`、`doctor`、`task`。
- Codex 插件命令文件使用短名 `/mplan`、`/mrun`、`/mend`、`/mgoon`、`/mdebug`、`/msync`、`/mstart`、`/mloop`、`/mdoctor`、`/mtask`；技能与语义提示别名保持 `$mxt-*`（其中 task 的别名为 `$mxt-task`）。Claude Code 与 OpenCode 只使用 `/mxt:task`，不会安装任何 `/m*` 短命令。
- 安装前建议关闭目标 AI 工具，避免文件锁定。
- Pi Agent 额外生成 `~/.pi/agent/prompts/mxt-*.md` 短命令别名（软链接，Windows 退化为复制），因此 `/mxt-run 001` 与 `/skill:mxt-run 001` 等价。安装完成后需在 Pi 中执行 `/reload` 才能看到新命令。
- 本命令只管理自身命名的 `mxt-*`；不干预 `~/.pi/agent/prompts/` 中其他命令。
- 用户自建的同名 prompt 模板（`~/.pi/agent/prompts/mxt-*.md`）不会被覆盖或删除，安装时以“跳过”提示。
- 详细教程见 [`docs/ai-cmd.md`](../ai-cmd.md)。
- 平台与 Skills 的拆分文档见 [`docs/skills/README.md`](../skills/README.md)。
- Codex `/m*` 短命令映射和安装语义见 [`docs/skills/codex-short-commands.md`](../skills/codex-short-commands.md)。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c ai-cmd
[MXT AI] SDD / Spec Driven Development ...

安装 mxt AI 命令到 Claude Code / Codex / OpenCode / Pi Agent；Codex 安装为 plugin skills，Pi Agent 安装为全局 skills 与 /mxt-* 短命令

Usage:
mxt ai-cmd [options]

Options:
[-u|--uninstall]         全量卸载 Claude Code / Codex / OpenCode / Pi Agent 中的 mxt 命令
$ echo $?
0
```

## 安装可靠性

- 非交互安装会校验平台 ID，未知平台会返回结构化错误，不会误写默认位置。
- Windows 文件占用（`EPERM` / `EBUSY`）会自动重试，并给出关闭目标工具的建议。
- 权限、路径类型、句柄数量等文件系统错误会保留原始错误码，并附上平台、home 和目标路径。
- 检测不到宿主 CLI 时不会阻塞文件安装；CLI 注册步骤失败时会返回明确原因。
- 安装前建议关闭 Claude Code / Codex / OpenCode；安装后重启已打开的会话。
- Pi Agent 安装到全局技能目录 `~/.pi/agent/skills/`，逐个写入 `mxt-*` 技能目录，调用形式为 `/skill:mxt-*`；卸载只清理 `mxt-*`，不会删除同目录下用户自己的技能。并在 `~/.pi/agent/prompts/` 写入 `/mxt-*` 短命令别名。
