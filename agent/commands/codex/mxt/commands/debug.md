---
description: "BUG 排查：检测 superpowers 并调用系统化诊断命令，支持附加指令"
argument-hint: "[bug-description] [指令...]"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-debug

启动 BUG 排查流程：检测当前环境是否安装 superpowers，有则调用系统化诊断命令，无则降级为手动排查。

## Arguments

The user invoked this command with: $ARGUMENTS

`$ARGUMENTS` 为 BUG 描述文本，可包含三位数字任务编号，末尾可附加**执行指令**，以空格分隔，不区分大小写。支持的指令：
- `深度` / `Deep` — 启用深度诊断，扩大排查范围
- `Worktree` / `WT` — 在 Worktree 中隔离排查

解析规则：
1. 从 `$ARGUMENTS` 末尾提取已知指令词。
2. 从剩余文本中提取第一个三位数字作为编号；若没有编号，立即询问用户提供编号。
3. 设定 `<GOON_PATH>` 为 `.r2mo/task/goon-$编号.md`，剩余文本作为 BUG 描述。
4. 解析后在聊天窗口中声明结果，例如 `📌 BUG描述: 内存泄漏 | 编号: 001 | 指令: 深度`。

**硬规则**：解析失败→终止 | Superpowers检测必执行（无则降级） | Worktree→`.r2mo/worktrees/` | 写回前确认目标路径等于 `<GOON_PATH>`

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`）。
2. 声明本次执行目标：BUG 排查，问题描述为 BUG 描述部分。

## Plan

1. 检测当前环境中是否存在 `superpowers:systematic-debugging` 技能。
2. 若存在，调用该技能，将 BUG 描述传入，按其工作流执行系统化诊断。
3. 若不存在，执行降级排查流程：收集错误信息 → 定位相关文件 → 分析根因 → 给出修复建议。
4. 在聊天窗口声明排查路径：`📌 诊断路径: Superpowers[systematic-debugging]` 或 `📌 诊断路径: 标准排查`。
5. **深度诊断**：若参数解析中检测到 `深度` 指令，扩大排查范围：搜索更多关联文件、检查间接依赖、分析边界条件。
6. **Worktree 隔离**：若参数解析中检测到 `Worktree` 指令，在 Worktree 中执行排查，避免影响当前工作区。
7. 诊断完成后生成 `DEBUG Report` 并写入 `<GOON_PATH>`，使后续 `$mxt-goon $编号` 可直接执行整改。

## Commands

1. 按上述 Plan 执行排查流程。
2. 写入 `<GOON_PATH>` 前必须再次声明 `📌 写回校验: <GOON_PATH>`，确认没有写入其他 `goon-*.md`。
3. 将 `<GOON_PATH>` 内容更新为以下格式：

```md
---
title: 整改-DEBUG-$编号
status: Pending
author:
---

# DEBUG Report

## BUG

- 描述：
- 触发条件：
- 影响范围：

## Evidence

- 复现步骤：
- 关键日志/错误：
- 相关文件：

## Root Cause

- 根因：
- 证据链：

## Fix Direction

- 修复方向：
- 风险点：
- 验证方式：

## 整改项

- [ ] ...
```

4. 排查完成后输出诊断结论、修复方向和 `<GOON_PATH>` 写回结果。

## Verification

完成后说明排查结论、是否调用了 superpowers 诊断、发现的根因和修复建议，并确认 `DEBUG Report` 已写入 `<GOON_PATH>`。

## Summary

报告诊断结论、根因分析、修复方向和 `DEBUG Report` 写回路径。

## Next Steps

Debug 完成后的典型路径：
- 确认 BUG 后修复 → 修改代码后验证
- 直接整改 DEBUG 报告 → `$mxt-goon <编号>` 或 `/mxt:goon <编号>`
- 修复后验收 → `/mxt-end <编号>` 或 `$mxt-end <编号>`（若关联具体任务）
- 复杂修复需规划 → `/mxt-plan <编号>` 或 `$mxt-plan <编号>`
