# $mxt-start / /mxt:start

## 基本介绍

`mxt-start` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-start` 调用；Claude Code / OpenCode 中对应 `/mxt:start`。

## 用途

按项目规则启动开发环境：后端优先、前端并行，并做网络健康检查。

## 适用场景

- 需要启动本地开发环境。
- 项目规则中可能定义了 dev-start/dev-stop/build/health 命令。

## 输入

- 无参数。
- 启动命令从项目 `.mdc` 规则、脚本和端口线索中解析。

## 写回 / 输出

- 本地进程状态和日志。
- 通常不写项目文件。

## 注意事项

- 必须先扫描 MDC 启停规则。
- 已运行服务应先停止、重建、再启动；健康检查失败要报告。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-start/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/start.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/start.md`

## 命令执行记录

```bash
$mxt-start
lsof -i :8080
curl -sf http://localhost:8080/health
```
