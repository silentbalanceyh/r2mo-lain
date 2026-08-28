# AI 平台命令与 Skill 总览

## 总体介绍

`mxt ai-cmd` 把同一套 R2MO / MXT 闭环命令安装到 Claude Code、Codex、OpenCode。三个平台的命令语义保持一致：

- Claude Code / OpenCode 使用 `/mxt:*` 风格命令。
- Codex 使用 `$mxt-*` 风格 plugin skills。
- `plan → run → end → goon` 是核心任务闭环，`loop` 是自动闭环入口，`debug` / `sync` / `start` 是辅助能力。

本页是 AI 命令与 Skill 的总览页，负责说明安装位置、配置文件和索引；每个子命令的具体用途、输入、写回和执行记录放在独立 Skill 文档中。

## 安装位置

`mxt ai-cmd` 的安装源头在仓库 `agent/commands/` 下，安装时会先清理旧内容，再写入当前源头。

| 平台 | 仓库源头 | 安装目标 |
|:---|:---|:---|
| Claude Code | `agent/commands/claude/mxt` | `~/.claude/plugins/cache/mxt-skills/mxt/1.0.0` 与 `~/.claude/plugins/marketplaces/mxt-skills` |
| Codex | `agent/commands/codex/mxt` | `~/.codex/plugins/mxt`、`~/.codex/plugins/cache/mxt-skills/mxt/1.0.0`、`~/.codex/marketplaces/mxt-skills` |
| OpenCode | `agent/commands/opencode/mxt` | `~/.config/opencode/opencode.json`（Windows 为 `%APPDATA%\\opencode\\opencode.json`） |

## 配置信息

| 平台 | 配置文件 | 写入内容 | 验证方式 |
|:---|:---|:---|:---|
| Claude Code | `~/.claude/settings.json`、`~/.claude/plugins/known_marketplaces.json`、`~/.claude/plugins/installed_plugins.json` | 注册 `mxt-skills` marketplace，启用 `mxt@mxt-skills` | `claude plugin list` |
| Codex | `~/.codex/config.toml` | 写入 `[marketplaces.mxt-skills]` 和 `[plugins."mxt@mxt-skills"]` | `codex plugin list`、`codex debug prompt-input` |
| OpenCode | `~/.config/opencode/opencode.json` | 写入 `command["mxt:*"]` 模板 | `cat ~/.config/opencode/opencode.json` |

## 平台文档索引

- [Claude Code](claude-code.md)
- [Codex](codex.md)
- [OpenCode](opencode.md)

## 命令和 Skill 专用章节

以下子文档用于介绍每个闭环命令 / Codex Skill 的用途、适用场景、输入、写回和执行记录：

- [mxt-plan](mxt-plan.md)
- [mxt-run](mxt-run.md)
- [mxt-end](mxt-end.md)
- [mxt-goon](mxt-goon.md)
- [mxt-loop](mxt-loop.md)
- [mxt-debug](mxt-debug.md)
- [mxt-sync](mxt-sync.md)
- [mxt-start](mxt-start.md)

## R2MO UI Skills

这些是 `docs/skills/r2mo-ui-*/SKILL.md` 的可读入口页，每个 Skill 保留原始源文件，同时提供一页式说明。

- [r2mo-ui-admin](r2mo-ui-admin.md)
- [r2mo-ui-login](r2mo-ui-login.md)
- [r2mo-ui-pagedash](r2mo-ui-pagedash.md)
- [r2mo-ui-pageform](r2mo-ui-pageform.md)
- [r2mo-ui-pagelist](r2mo-ui-pagelist.md)
- [r2mo-ui-route](r2mo-ui-route.md)
- [r2mo-ui-tree](r2mo-ui-tree.md)
- [r2mo-ui-upload](r2mo-ui-upload.md)

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
