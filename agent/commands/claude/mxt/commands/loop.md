---
description: "三 Agent Team 任务闭环：RUN 执行 → END 审查 → GOON 整改，唯一终止条件：END 审查后 goon 为空"
argument-hint: "<task-number>"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write, Agent, Workflow, TaskCreate, TaskUpdate]
---

# /mxt:loop

启动 RUN / END / GOON 三个 Agent 组成的 Team，闭环处理一个任务直到完成。

**`/mxt:loop <编号>` 的含义**：锁定这个任务，一直循环直到完成。不是执行下一个任务。

The user invoked this command with: $ARGUMENTS

## 参数解析

1. `$ARGUMENTS` 提取任务编号（如 `/mxt:loop 005` → `005`，支持一位或多位数字，自动补零到三位）。
2. 解析后在聊天窗口中声明结果 `📌 闭环锁定: task-<编号>`。

**硬规则**：解析失败→终止 | 任务隔离锁：只读写 task-NNN.md 和 goon-NNN.md | RUN 必须执行质量门禁（编译+lint+test）才标记 Done | END 必须运行质量门禁确认后才能写 goon | 每次 GOON→END 循环，END 必须重新运行质量门禁，不得复用上轮结果 | 连续 2 轮整改项数量不减少 → 触发僵持告警，END 必须在 goon 中标注 WONTFIX + 理由 | **唯一终止条件**：END 审查后 goon 文件内容为空（零条实际整改项条目） | 无轮次上限，无人工截断，一直跑到 goon 为空

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`（若存在），以及它们引用的所有规则文件。
2. 解析 `$ARGUMENTS`，提取三位数字编号。如果 `$ARGUMENTS` 为空或开头不匹配数字，立即停止，提示：`请使用 /mxt:loop 001 格式执行，其中 001 是三位数字任务编号。`
3. 将任务路径设为 `.r2mo/task/task-$编号.md`，整改路径设为 `.r2mo/task/goon-$编号.md`。
4. Write workflow 脚本到 `.claude/workflows/mxt-task-closed-loop.js`（若不存在），然后使用 Workflow 工具启动闭环：

```
Workflow({ scriptPath: ".claude/workflows/mxt-task-closed-loop.js", args: { taskNum: "<编号>" } })
```

## 闭环流程

```
锁定 task-NNN.md
     │
     ▼
┌─ RUN Agent ────────────────────┐
│ 读任务 → 实现代码              │
│ → 质量门禁（编译+lint+test）    │
│ → 写 Changes → status: Done    │
└────────────┬───────────────────┘
             ▼
┌─ END Agent ────────────────────┐
│ 审查代码 vs 任务需求           │
│ → 逐项运行质量门禁确认         │
│ → 无问题: goon = 无待整改项    │
│ → 有问题: goon = 整改清单      │
└────────────┬───────────────────┘
             ▼
       goon 是否为空？
        ╱          ╲
      是            否
       ▼             ▼
   ✅ 完成    ┌─ GOON↺END 循环 ─┐
              │                  │
              │  GOON Agent      │
              │  修复所有整改项  │
              │  → 质量门禁验证  │
              │  → 标记 ✅/⚠️    │
              │       │          │
              │  END Agent 复核  │
              │  逐项验证修复    │
              │  → 通过→移除    │
              │  → 失败→保留    │
              │  → 2轮僵持→WONT │
              │       │          │
              │  goon 空?        │
              │  是→✅ 否→继续   │
              │  (无限循环)      │
              └──────────────────┘
```

## 终止条件（严苛）

| 条件 | 规则 |
|------|------|
| **唯一终止** | END Agent 审查后 goon 文件内容为"无待整改项" |
| 僵持处理 | 连续 2 轮整改项数不减少 → 剩余项标 WONTFIX，不再阻塞闭环 |
| 质量门禁 | GOON 修复后 + END 复核时，各自独立运行，不复用上轮结果 |
| 完成状态 | goon 为空 AND 质量门禁全通过 AND task status=Done |

## Verification

完成后检查：
- goon 文件内容为空（无待整改项）
- task 文件 status 为 Done
- Changes 记录完整

## Summary

报告闭环完成情况：任务编号、整改轮次、变更文件、质量门禁结果。

## Next Steps

闭环完成后的典型路径：
- 继续执行另一个任务 → `/mxt:loop <另一个编号>`
- 手动审查某个任务 → `/mxt:end <编号>`
- 拉起开发环境 → `/mxt:start`
