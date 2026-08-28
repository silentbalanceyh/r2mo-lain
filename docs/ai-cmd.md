# mxt ai-cmd 教程

`mxt ai-cmd` 是 R2MO / MXT 的 AI 命令安装器，用于把同一套闭环命令安装到 Claude Code、Codex、OpenCode。平台不再拆成三份文档；安装位置、配置信息和命令对照统一放在 [mxt-* Skills 总览](skills/README.md)。

## 安装

安装过程会交互式选择平台。每次安装会先清理旧命令，再写入最新命令源并重新注册。

```bash
mxt ai-cmd
```

## 卸载

```bash
mxt ai-cmd --uninstall
mxt ai-cmd -u
```

## 命令源

| 类型 | 仓库源 | 说明 |
|:---|:---|:---|
| `mxt xxx` commands | `agent/commands/claude/mxt/commands/*.md`、`agent/commands/opencode/mxt/commands/*.md` | Claude Code / OpenCode 的 `/mxt:*` 命令模板 |
| `mxt-*` Skills | `agent/commands/codex/mxt/skills/mxt-*/SKILL.md` | Codex 的 `$mxt-*` plugin skills |

## 闭环命令

| 工作流 | 说明 | 写回 |
|:---|:---|:---|
| `plan` | 生成实现计划 | `task-NNN.md` 的 `## Plan` |
| `run` | 执行任务 | `task-NNN.md` 的 `## Changes` |
| `end` | 验证任务 | `goon-NNN.md` 当前整改项 |
| `goon` | 处理整改 | `task-NNN.md` 的 `## Changes` |
| `loop` | 自动闭环 | `goon-NNN.md` 直到清空 |
| `debug` | 系统化 BUG 排查 | `.r2mo/bugs/` |
| `sync` | Git 同步 | git 提交/推送 |
| `start` | 启动环境 | 后端/前端进程 |

## 子文档

- [mxt-* Skills 总览](skills/README.md)
- [mxt ai-cmd 命令文档](command/ai-cmd.md)

## 命令执行记录

```bash
mxt ai-cmd
mxt ai-cmd --uninstall
mxt ai-cmd -u
```

> 安装/卸载前请关闭正在运行的 Claude Code / Codex / OpenCode。Windows 上若遇到 `EPERM` / `EBUSY`，关闭应用后重试。
