# mxt ai-cmd 教程

`mxt ai-cmd` 是 R2MO / MXT 的 AI 命令安装器，用于把同一套闭环命令安装到 Claude Code、Codex、OpenCode、Pi Agent。平台不再拆成三份文档；安装位置、配置信息和命令对照统一放在 [mxt-* Skills 总览](skills/README.md)。

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
| :--- | :--- | :--- |
| `mxt xxx` commands | `agent/commands/claude/mxt/commands/*.md`、`agent/commands/opencode/mxt/commands/*.md` | Claude Code / OpenCode 的 `/mxt:*` 命令模板 |
| `mxt-*` Skills | `agent/commands/codex/mxt/skills/mxt-*/SKILL.md` | Codex 的 `$mxt-*` plugin skills，以及 Pi Agent 的 `/skill:mxt-*` 全局 skills 和等价短命令 `/mxt-*` |
| Pi 专属 `/goal` | `agent/commands/pi/prompts/goal.md` | 仅安装到 Pi Agent 的 `~/.pi/agent/prompts/`：命令面对齐 Codex 原生 `/goal` 与 `@narumitw/pi-goal`（`status` / `edit` / `pause` / `resume` / `clear`（别名 `stop`）/ `--tokens`），底层映射到 pi-subagents goal mission，其它平台不读取也不写入 |

## Pi Agent 的运行位置

Pi Agent 的配置目录是 `~/.pi/agent`（可用 `PI_CODING_AGENT_DIR` 覆盖）：`mxt ai-cmd` 装入的 `mxt-*` skills、`/goal`，以及通过 `pi install` 装入的包与主题都在这里。

`ft-cli` 启动的 Pi 与系统内直接运行的 `pi` **共用同一份配置目录**：`ft-cli` 不修改 `HOME`、不设置 `PI_*`、也不传主题参数，最终执行的是 PATH 里的同一个 `pi`（`exec pi --provider <domain>-pi --model <model>`），只往 `~/.pi/agent/models.json` 合并 provider 条目。

| 情况 | 结果 |
| :--- | :--- |
| 默认（`HH_CLI_PI_BIN`、`PI_CODING_AGENT_DIR` 都未设置） | 与系统 `pi` 完全一致：skills、`/goal`、已安装包与主题全部生效 |
| 设置了 `HH_CLI_PI_BIN` 或 `PI_CODING_AGENT_DIR` | 换成另一个 Pi 安装或另一份配置目录，上述内容不会跟随 |

> `ft-cli` 菜单里每个模型有 3 行，按 **Claude → Codex → Pi** 的顺序排列（标签相同，用 `↑/↓` 计数区分），只有第 3 行启动的才是 Pi Agent。该顺序已用 `HH_CLI_DRY_RUN=1` 实测：第 3 行输出 `exec pi --provider ftm-pi --model ftm`。

## 闭环命令

| 工作流 | 说明 | 写回 |
| :--- | :--- | :--- |
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

> 安装/卸载前请关闭正在运行的 Claude Code / Codex / OpenCode / Pi Agent。Windows 上若遇到 `EPERM` / `EBUSY`，关闭应用后重试。
