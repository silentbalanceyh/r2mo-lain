# mxt-* Skills 总览

## 总体介绍

`mxt-*` Skills 是 `mxt ai-cmd` 安装的 AI 闭环能力集合。它们和 Claude Code / OpenCode 的 `/mxt:*` 命令保持同一套语义：

- `plan → run → end → goon` 是核心任务闭环，`loop` 是强制双会话的自动闭环入口。
- `debug` / `doctor` / `sync` / `start` 分别负责诊断、基线收敛、Git 同步和运行环境闭环。
- 所有技能共享统一闭环契约：磁盘状态、真实证据、可追踪范围、显式失败与安全交接。
- 平台差异只体现在调用形式和安装位置，文档不再拆成 Claude / Codex / OpenCode 三套入口页。

## 安装位置

`mxt ai-cmd` 的安装源头在仓库 `agent/commands/` 下。安装时会先清理旧内容，再写入当前源头。

| 平台 | 调用形式 | 仓库源头 | 安装目标 |
| :--- | :--- | :--- | :--- |
| Claude Code | `/mxt:*` | `agent/commands/claude/mxt` | `~/.claude/plugins/cache/mxt-skills/mxt/1.0.0` 与 `~/.claude/plugins/marketplaces/mxt-skills` |
| Codex | `$mxt-*` | `agent/commands/codex/mxt` | `~/.codex/plugins/mxt`、`~/.codex/plugins/cache/mxt-skills/mxt/1.0.0`、`~/.codex/marketplaces/mxt-skills` |
| OpenCode | `/mxt:*` | `agent/commands/opencode/mxt` | `~/.config/opencode/opencode.json`（Windows 为 `%APPDATA%\opencode\opencode.json`） |
| Pi Agent | `/mxt-*`（等价 `/skill:mxt-*`）、`/goal` | `agent/commands/codex/mxt/skills`、`agent/commands/pi/prompts` | `~/.pi/agent/skills/mxt-*/SKILL.md`、`~/.pi/agent/prompts/mxt-*.md`、`~/.pi/agent/prompts/goal.md` |

## 跨平台安装规则

- macOS / Linux：Claude Code 和 Codex 使用 `$HOME/.claude` / `$HOME/.codex`；OpenCode 使用 `$HOME/.config/opencode/opencode.json`；Pi Agent 使用 `$HOME/.pi/agent/skills` 与 `$HOME/.pi/agent/prompts`。
- Windows：Claude Code 和 Codex 使用 `%USERPROFILE%\.claude` / `%USERPROFILE%\.codex`；OpenCode 使用 `%USERPROFILE%\AppData\Roaming\opencode\opencode.json`；Pi Agent 使用 `%USERPROFILE%\.pi\agent\skills` 与 `%USERPROFILE%\.pi\agent\prompts`。
- Windows 仅当 `APPDATA` 属于当前有效用户主目录时才采用；否则按用户主目录推导，避免重定向环境写入错误位置。
- 每个平台先清理旧安装，再写入新的命令、Skill、marketplace 和配置状态。
- Pi Agent 按技能目录逐个写入，卸载只清理 `mxt-*`，不会删除 `~/.pi/agent/skills` 下用户自己的技能。
- Pi Agent 同时为每个技能生成短命令别名 `~/.pi/agent/prompts/<skill>.md`（macOS / Linux 为指向 `../skills/<skill>/SKILL.md` 的软链接，Windows 无法建软链接时退化为复制），因此 `/mxt-run 001` 等价于 `/skill:mxt-run 001`；模板正文里的 `$ARGUMENTS` 会被 Pi 替换为调用参数。卸载只回收本安装器创建的别名，用户自建的同名模板会保留并在安装时记录为跳过。
- Pi Agent 还安装自有 prompt 模板 `/goal`（`agent/commands/pi/prompts/goal.md` → `~/.pi/agent/prompts/goal.md`），用于对齐 Codex 原生 `/goal` 与第三方扩展 `@narumitw/pi-goal` 的命令面：把目标映射到 pi-subagents 的 goal mission，支持 `status` / `edit` / `pause` / `resume` / `clear`（别名 `stop`），以及 `--tokens <budget>` 预算（可为 `100k`、`1.5m`）。它同样是内容比对判定归属，用户自建或改过的 `goal.md` 不会被覆盖或删除。
- `/goal` 只针对 Pi Agent：`agent/commands/pi/prompts` 只被 Pi 平台读取，安装或卸载 Claude Code / Codex / OpenCode 都不会创建、修改或删除 `~/.pi/agent/prompts/goal.md`。
- 未知平台、目标路径冲突、权限不足、Windows 文件占用、路径类型错误等都会返回可行动的错误信息，而不是裸异常。

## 配置信息

| 平台 | 配置文件 | 写入内容 | 验证方式 |
| :--- | :--- | :--- | :--- |
| Claude Code | `~/.claude/settings.json`、`~/.claude/plugins/known_marketplaces.json`、`~/.claude/plugins/installed_plugins.json` | 注册 `mxt-skills` marketplace，启用 `mxt@mxt-skills` | `claude plugin list` |
| Codex | `~/.codex/config.toml` | 写入 `[marketplaces.mxt-skills]` 和 `[plugins."mxt@mxt-skills"]` | `codex plugin list`、`codex debug prompt-input` |
| OpenCode | `~/.config/opencode/opencode.json` | 写入 `command["mxt:*"]` 模板 | `cat ~/.config/opencode/opencode.json` |
| Pi Agent | `~/.pi/agent/skills/mxt-*/SKILL.md`、`~/.pi/agent/prompts/mxt-*.md`、`~/.pi/agent/prompts/goal.md` | 写入 `mxt-*` 全局技能目录、`/mxt-*` 短命令别名与 Pi 专属 `/goal` 目标命令 | `/skill:mxt-list`、`ls ~/.pi/agent/skills ~/.pi/agent/prompts` |

## 命令与 Skill 对照

| 工作流 | Codex Skill | Pi Agent Skill | Claude Code / OpenCode | 文档 |
| :--- | :--- | :--- | :--- | :--- |
| 计划 | `$mxt-plan 001` | `/mxt-plan 001` | `/mxt:plan 001` | [mxt-plan](mxt-plan.md) |
| 执行 | `$mxt-run 001` | `/mxt-run 001` | `/mxt:run 001` | [mxt-run](mxt-run.md) |
| 验收 | `$mxt-end 001` | `/mxt-end 001` | `/mxt:end 001` | [mxt-end](mxt-end.md) |
| 整改 | `$mxt-goon 001` | `/mxt-goon 001` | `/mxt:goon 001` | [mxt-goon](mxt-goon.md) |
| 自动闭环 | `$mxt-loop 001` | `/mxt-loop 001` | `/mxt:loop 001` | [mxt-loop](mxt-loop.md) |
| 调试 | `$mxt-debug 001 login fails` | `/mxt-debug 001 login fails` | `/mxt:debug 001 login fails` | [mxt-debug](mxt-debug.md) |
| 防漂移 | `$mxt-doctor loc` | `/mxt-doctor loc` | `/mxt:doctor loc` | [mxt-doctor](mxt-doctor.md) |
| 同步 | `$mxt-sync` | `/mxt-sync` | `/mxt:sync` | [mxt-sync](mxt-sync.md) |
| 启动 | `$mxt-start` | `/mxt-start` | `/mxt:start` | [mxt-start](mxt-start.md) |

> Pi Agent 的 `/mxt-*` 短命令来自 `~/.pi/agent/prompts/mxt-*.md` 模板别名，与原生长形式 `/skill:mxt-*` 完全等价；两者都可用，短命令更适合日常输入。
>
> Pi Agent 的 `/goal` 是 Codex `/goal` 的等价物，命令面对齐第三方扩展 `@narumitw/pi-goal`（`status` / `edit` / `pause` / `resume` / `clear`、别名 `stop`、`--tokens <budget>` 预算），只安装在 Pi（`~/.pi/agent/prompts/goal.md`），映射到 pi-subagents 的 goal mission（`/goal <objective>` 设定、`/goal status` 查看、`/goal pause` 或 `resume` 或 `clear` 控制），不依赖 Codex 专属的 `create_goal`，其它平台不读取也不写入。注意 Pi 优先派发扩展命令，因此装了原生 `@narumitw/pi-goal` 后由它的 `/goal` 接管，本模板会被遮蔽（它的 `goal_complete` / `goal_blocked` / `goal_wait` 与空闲续跑能力更强）。

## mxt-* Skill 子文档索引

以下子文档专门介绍每个闭环命令 / Codex Skill 的用途、适用场景、输入、写回和执行记录：

- [mxt-plan](mxt-plan.md)
- [mxt-run](mxt-run.md)
- [mxt-end](mxt-end.md)
- [mxt-goon](mxt-goon.md)
- [mxt-loop](mxt-loop.md)
- [mxt-debug](mxt-debug.md)
- [mxt-doctor](mxt-doctor.md)
- [mxt-sync](mxt-sync.md)
- [mxt-start](mxt-start.md)

## 参考源头

- [Codex skill 源文件](../../agent/commands/codex/mxt/skills/)
- [Claude Code 命令源文件](../../agent/commands/claude/mxt/commands/)
- [OpenCode 命令源文件](../../agent/commands/opencode/mxt/commands/)

## 命令执行记录

```bash
mxt ai-cmd
find agent/commands/codex/mxt/skills -maxdepth 2 -name SKILL.md | sort
find agent/commands/claude/mxt/commands -maxdepth 2 -name '*.md' | sort
find agent/commands/opencode/mxt/commands -maxdepth 2 -name '*.md' | sort
find "$HOME/.pi/agent/skills" -maxdepth 2 -name SKILL.md | sort
ls -l "$HOME/.pi/agent/prompts" | grep -E 'mxt-|goal'
```
