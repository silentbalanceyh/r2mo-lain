# mxt ai-cmd

## 用途

安装 mxt AI 命令到 Claude Code / Codex / OpenCode；Codex 安装为 plugin skills。

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-u` / `--uninstall` | 全量卸载 Claude Code / Codex / OpenCode 中的 mxt 命令 | boolean |

## 说明

- 安装前建议关闭目标 AI 工具，避免文件锁定。
- 详细教程见 [`docs/ai-cmd.md`](../ai-cmd.md)。
- 平台与 Skills 的拆分文档见 [`docs/skills/README.md`](../skills/README.md)。

## 命令执行记录

```bash
mxt ai-cmd
mxt ai-cmd --uninstall
```
