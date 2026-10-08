# $mxt-debug / /mdebug / /mxt:debug

## Codex /m 用法

Codex 中可以使用 `/mdebug` 作为本工作流的短命令；它与对应的 `$mxt-*` 语义别名共用同一套磁盘状态、锁路径、验收门禁和写回契约。示例：

```bash
/mdebug 登录按钮点击无响应 P1 Deep
```

这条短命令只改变 Codex 里的入口拼写，不改变工作流本身的范围。完整输入、写回、锁路径与下一步见本页下文。

## 基本介绍

`mxt-debug` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-debug` 调用；Claude Code / OpenCode 中对应 `/mxt:debug`。

## 用途

针对明确 BUG 做系统化诊断，并在同一次会话内完成最小修复、验证归档。Bug 档案独立于任务体系存在，不依赖也不创建 task/goon。

## 适用场景

- 用户描述了错误、异常、日志或复现路径。
- 需要立即定位根因并修复，同时留下时间戳形式的 Bug 档案。
- 需要与其他 Agent 共享一份证据充分的故障复盘记录。

## 输入

```bash
$mxt-debug <bug 描述> [P0-P3] [Deep] [WT]
```

- Bug 描述：自然语言，建议包含触发条件和预期行为差异。
- 严重度：省略时按影响自动归类 `P0`–`P3`。
- `Deep`：深入排查，扩大搜索范围和间接依赖。
- `Worktree` / `WT`：在 `.r2mo/worktrees/` 隔离排查。
- 兼容模式：携带三位任务号（例如 `001`）时，额外写入对应的 `goon-NNN.md`；不影响现代独立流程。

## 写回 / 输出

- `.r2mo/bugs/<yyyy-MM-dd>/<yyyy-MM-dd>-<severity>-<slug>.md`：单个 Bug 档案（frontmatter + 九段正文）。
- `.r2mo/bugs/<yyyy-MM-dd>/index.md`：当日问题清单，每次诊断必须新增或更新一行。
- （仅 legacy 模式）`.r2mo/task/goon-NNN.md`：向后兼容的整改交接。

## Bug 档案格式

文件命名沿用 `app-iia` 项目验证过的模式：

```text
.r2mo/bugs/2026-10-08/2026-10-08-P1-pagination-null-guard.md
```

Frontmatter 固定字段：

```yaml
---
title: P1-2026-10-08-pagination-null-guard
date: 2026-10-08
severity: P1          # P0 | P1 | P2 | P3
status: fixed         # open | fixed | wontfix | duplicate
resolved: 2026-10-08  # status=fixed 时必填
owner: <module>
module: <component path>
task_ref:             # 仅在用户显式引用任务时才填
---
```

正文固定九段，顺序不可变：

```md
## Observed Bug
## Trigger Condition
## Impact Scope
## Root Cause
## Fix
## Files Changed
## Recurrence Prevention
## Verification
## Scope
```

诊断期间允许空段落占位；写入 `status: fixed` 前必须把 `Fix`、`Files Changed`、`Verification`、`Scope` 补全，且 `Verification` 附带实际执行命令和退出码。

## 日度索引格式

`index.md` 采用标准表格：

```md
| ID | Severity | Module | Summary | Status | Report |
|---|:---:|---|---|:---:|---|
| 2026-10-08-P1-pagination-null-guard | P1 | src/executor | 分页为 0 时仍请求下一页 | fixed | `2026-10-08-P1-pagination-null-guard.md` |
```

规则：

- 同一 bug 更新时原行原位覆写，不新增重复行。
- `Report` 列永远指向同目录的 bug 文件相对路径。
- 从磁盘读取后写入，不信任会话记忆。

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- `/mdebug` 默认在同一次运行中完成诊断→修复→验证→归档，四步缺一不可。
- 验证失败时不翻转为 `fixed`，把失败证据保留在 `Verification` 段并显式停止。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。

## 注意事项

- 优先使用系统化调试流程（`superpowers:systematic-debugging`）；仅在工具明确不存在时才手动退化。
- 不要将 bug 自动转化为 overflow task；想转任务时用户另行执行 `/mxt:task`。
- `wontfix` 和 `duplicate` 由用户裁决；一旦写入，archive 文件和 index 行同步终结。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-debug/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/debug.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/debug.md`
- 参考实现：`app-iia` 项目 `.r2mo/bugs/` 历史数据

## 命令执行记录

```bash
$mxt-debug 登录按钮点击无响应
$mxt-debug 登录按钮点击无响应 P1 Deep
$mxt-debug 登录按钮点击无响应 WT
$mxt-debug 登录接口 500 001          # legacy 模式，同时写入 goon-001.md
```
