# mxt-task

## 用途

从自然语言需求创建或复用一个超过 `thread` 阈值的 R2MO 扩展任务，并立即执行。任务仍是标准 `task-NNN.md`，执行完成后追加 `## Changes` 并写回 `status: Done`，因此可继续进入 `run / end / goon` 闭环。

## 调用形式

| 平台 | 调用 |
| :--- | :--- |
| Codex | `$mxt-task <requirement>` 或 `/mtask <requirement>` |
| Claude Code | `/mxt:task <requirement>` |
| OpenCode | `/mxt:task <requirement>` |
| Pi Agent | `/mxt-task <requirement>` |

## 输入

- 必须提供非空自然语言需求；不支持无参数模式。
- 不解析任务编号；整个参数就是需求。
- 读取 `.r2mo/task/thread` 作为阈值，只在大于阈值的槽位中查找或创建任务。

## 行为

1. 搜索大于 `thread` 阈值的现有 `task-NNN.md`，若语义唯一匹配则复用。
2. 无匹配时使用大于阈值的最小未占用槽位创建标准任务文件。
3. 写入需求后立即执行。
4. 通过最小充分验证后追加 `## Changes`，并将 `status` 设置为 `Done`。
5. 不因超过 `thread` 自动归档；归档必须由用户显式选择。

## 与标准闭环的关系

`mxt-task` 生成的任务不是另一套状态系统。它只是位于标准槽位之外的扩展、临时或无计划任务；后续仍可使用 `/mxt:run`、`/mxt:end`、`/mxt:goon` 或对应平台等价命令继续处理。

## 命令执行记录

```bash
# 由安装器写入后的源文件检查
find agent/commands/codex/mxt/skills -maxdepth 2 -name SKILL.md | sort
```
