# mxt-* Skills 总览

## 总体介绍

`mxt-*` Skills 是 `mxt ai-cmd` 安装的 AI 闭环能力集合。它们和 Claude Code / OpenCode 的 `/mxt:*` 命令保持同一套语义：

- `plan → run → end → goon` 是核心任务闭环。
- `loop` 是自动闭环入口。
- `debug` / `sync` / `start` 是辅助能力。
- 平台差异只体现在调用形式和安装位置，文档不再拆成 Claude / Codex / OpenCode 三套入口页。

## 安装位置

`mxt ai-cmd` 的安装源头在仓库 `agent/commands/` 下。安装时会先清理旧内容，再写入当前源头。

| 平台 | 调用形式 | 仓库源头 | 安装目标 |
|:---|:---|:---|:---|
| Claude Code | `/mxt:*` | `agent/commands/claude/mxt` | `~/.claude/plugins/cache/mxt-skills/mxt/1.0.0` 与 `~/.claude/plugins/marketplaces/mxt-skills` |
| Codex | `$mxt-*` | `agent/commands/codex/mxt` | `~/.codex/plugins/mxt`、`~/.codex/plugins/cache/mxt-skills/mxt/1.0.0`、`~/.codex/marketplaces/mxt-skills` |
| OpenCode | `/mxt:*` | `agent/commands/opencode/mxt` | `~/.config/opencode/opencode.json`（Windows 为 `%APPDATA%\opencode\opencode.json`） |

## 配置信息

| 平台 | 配置文件 | 写入内容 | 验证方式 |
|:---|:---|:---|:---|
| Claude Code | `~/.claude/settings.json`、`~/.claude/plugins/known_marketplaces.json`、`~/.claude/plugins/installed_plugins.json` | 注册 `mxt-skills` marketplace，启用 `mxt@mxt-skills` | `claude plugin list` |
| Codex | `~/.codex/config.toml` | 写入 `[marketplaces.mxt-skills]` 和 `[plugins."mxt@mxt-skills"]` | `codex plugin list`、`codex debug prompt-input` |
| OpenCode | `~/.config/opencode/opencode.json` | 写入 `command["mxt:*"]` 模板 | `cat ~/.config/opencode/opencode.json` |

## 命令与 Skill 对照

| 工作流 | Codex Skill | Claude Code / OpenCode | 文档 |
|:---|:---|:---|:---|
| 计划 | `$mxt-plan 001` | `/mxt:plan 001` | [mxt-plan](mxt-plan.md) |
| 执行 | `$mxt-run 001` | `/mxt:run 001` | [mxt-run](mxt-run.md) |
| 验收 | `$mxt-end 001` | `/mxt:end 001` | [mxt-end](mxt-end.md) |
| 整改 | `$mxt-goon 001` | `/mxt:goon 001` | [mxt-goon](mxt-goon.md) |
| 自动闭环 | `$mxt-loop 001` | `/mxt:loop 001` | [mxt-loop](mxt-loop.md) |
| 调试 | `$mxt-debug 001 login fails` | `/mxt:debug 001 login fails` | [mxt-debug](mxt-debug.md) |
| 防漂移 | `$mxt-doctor loc` | `/mxt:doctor loc` | [mxt-doctor](mxt-doctor.md) |
| 同步 | `$mxt-sync` | `/mxt:sync` | [mxt-sync](mxt-sync.md) |
| 启动 | `$mxt-start` | `/mxt:start` | [mxt-start](mxt-start.md) |

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
```
