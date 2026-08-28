# mxt ai-cmd 教程

`mxt ai-cmd` 是 R2MO / MXT 的 AI 命令安装器，用于把同一套闭环命令安装到 Claude Code、Codex、OpenCode。

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

| 平台 | 仓库源 | 安装后调用 |
|:---|:---|:---|
| Claude Code | `agent/commands/claude/mxt/commands/*.md` | `/mxt:plan 001` |
| Codex | `agent/commands/codex/mxt/skills/mxt-*/SKILL.md` | `$mxt-plan 001` |
| OpenCode | `agent/commands/opencode/mxt/commands/*.md` | `/mxt:plan 001` |

## 详细拆分文档

- [平台与 Skills 索引](skills/README.md)
- [Claude Code](skills/claude-code.md)
- [Codex](skills/codex.md)
- [OpenCode](skills/opencode.md)
- [mxt-plan](skills/mxt-plan.md)
- [mxt-run](skills/mxt-run.md)
- [mxt-end](skills/mxt-end.md)
- [mxt-goon](skills/mxt-goon.md)
- [mxt-loop](skills/mxt-loop.md)
- [mxt-debug](skills/mxt-debug.md)
- [mxt-sync](skills/mxt-sync.md)
- [mxt-start](skills/mxt-start.md)

## 闭环命令

| 命令 | 作用 | 写回 |
|:---|:---|:---|
| plan | 生成实现计划 | `task-NNN.md` 的 `## Plan` |
| run | 执行任务 | `task-NNN.md` 的 `## Changes` |
| end | 验证任务 | `goon-NNN.md` 当前整改项 |
| goon | 处理整改 | `task-NNN.md` 的 `## Changes` |
| loop | 自动闭环 | `goon-NNN.md` 直到清空 |
| debug | 系统化 BUG 排查 | `.r2mo/bugs/` |
| sync | Git 同步 | git 提交/推送 |
| start | 启动环境 | 后端/前端进程 |

## Claude Code / OpenCode 命令执行记录

```bash
/mxt:plan 001
/mxt:run 001
/mxt:end 001
/mxt:goon 001
/mxt:loop 001
/mxt:debug login fails
/mxt:sync
/mxt:start
```

## Codex 命令执行记录

```bash
$mxt-plan 001
$mxt-run 001
$mxt-end 001
$mxt-goon 001
$mxt-loop 001
$mxt-debug login fails
$mxt-sync
$mxt-start
```

## 验证安装

```bash
# Claude Code
claude plugin list

# Codex
codex plugin list
codex debug prompt-input

# OpenCode
cat ~/.config/opencode/opencode.json
```

> 安装/卸载前请关闭正在运行的 Claude Code / Codex / OpenCode。Windows 上若遇到 `EPERM` / `EBUSY`，关闭应用后重试。
