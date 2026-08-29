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

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- 输出必须包含可追踪的输入、变更/执行范围、验证方式和实际结果；无法验证的内容不得宣称完成。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。
- 失败必须显式停止并保留恢复信息；不允许通过降低标准、扩大范围或改写目标来制造“完成”。

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
