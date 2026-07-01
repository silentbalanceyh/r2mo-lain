---
description: "三 Agent Team 任务闭环：AI 顺序执行 RUN→END→GOON↺END，直到 goon 整改队列清空"
argument-hint: "<task-number>"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-loop

启动任务闭环处理：AI 顺序扮演执行者→审查者→修复者，循环直到 goon 整改队列清空。

**`/mxt-loop <编号>` 的含义**：锁定这个任务，一直循环直到完成。不是执行下一个任务。

## Arguments

The user invoked this command with: $ARGUMENTS

`$ARGUMENTS` 提取任务编号（如 `/mxt-loop 005` → `005`，支持一位或多位数字，自动补零到三位）。

如果 `$ARGUMENTS` 为空或开头不匹配数字，立即停止，提示：`请使用 /mxt-loop 001 格式执行，其中 001 是三位数字任务编号。`

**硬规则**：解析失败→终止 | 任务隔离锁：只读写 task-NNN.md 和 goon-NNN.md | 质量门禁必通过→才可写Done+Changes | 唯一终止条件：END 审查后 goon 内容为空（零条实际整改项条目） | 连续2轮整改项数不减少→僵持→剩余项标WONTFIX | 无轮次上限 | 每轮 END 必须重新运行质量门禁，不得复用上轮结果

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件。
2. 解析 `$ARGUMENTS`，提取三位数字编号。声明 `📌 闭环锁定: task-<编号>`。
3. 将任务路径设为 `.r2mo/task/task-$编号.md`，整改路径设为 `.r2mo/task/goon-$编号.md`。

## Plan — 闭环执行

你将在同一个上下文中顺序执行以下阶段，循环直到 goon 清空：

```
Phase 1: RUN（执行者）
   读 task → 实现代码 → 质量门禁 → 写 Changes → status: Done

Phase 2: END（审查者）
   审查 vs 需求 → 运行质量门禁确认 → 写 goon（无问题=空，有问题=整改清单）

Phase 3: 检查 goon
   Read goon，统计实际整改项条目数（不含 frontmatter、标题、"无待整改项"占位文本）
   条目数=0 → ✅ 闭环完成，跳到 Phase 5
   条目数>0 → 进入 Phase 4

Phase 4: GOON → END 循环
   a) GOON（修复者）：读 goon → 逐项修复 → 质量门禁 → 标记 ✅/⚠️ → 写 Changes
   b) END（审查者复核）：重新运行质量门禁 → 通过→移除该项 | 失败→保留 | 连续2轮不减少→标WONTFIX
   c) 返回 Phase 3 检查 goon

Phase 5: 报告
   输出闭环报告：任务编号、整改轮次、变更文件、质量门禁结果
```

## Commands

### Phase 1 — RUN（执行者）

1. Read `<TASK_PATH>`，跳过 frontmatter，理解任务需求。
2. 按需求实现代码。
3. **质量门禁（不可跳过）**：
   - Go: `GOPROXY=https://goproxy.cn,direct go build ./... && golangci-lint run ./... && go test -race ./...`
   - TypeScript: `npx tsc -b --noEmit && npx eslint . && npm run build`
4. 全部通过后，Edit `<TASK_PATH>`：
   - 末尾追加 `## Changes` + 变更摘要 + 验证结果
   - frontmatter status 改为 `Done`

### Phase 2 — END（审查者）

1. Read `<TASK_PATH>`（含 Changes），Bash 检查代码变更。
2. 逐项对照任务需求审查：需求完成度、编译、Lint、命名规范、遗漏/bug。
3. 运行质量门禁确认。
4. Write `<GOON_PATH>`：

**无问题（空整改单）**：
```
---
title: 整改-<项目名>
status: Done
source: <TASK_PATH>
---
# 整改队列
无待整改项。所有检查已通过。
```

**有问题**：
```
---
title: 整改-<项目名>
status: Active
source: <TASK_PATH>
---
# 整改队列
## 整改项 1 — <描述>
- 文件: <path>
- 问题: <具体描述>
- 期望: <目标状态>
```

### Phase 3 — 检查 goon

Read `<GOON_PATH>`，统计实际整改项条目：

- **算作整改项的**：`## 整改项 N — <描述>`、`N. **<标题>**` 后跟整改证据、`- [ ] **<标题>**`、任何带编号且有具体描述和方案的条目
- **不算的**：frontmatter、`# 整改队列`、`无待整改项`占位文本、空白行

判断：
- 实际条目数 == 0 → `✅ goon 已清空，闭环完成` → 跳到 Phase 5
- 实际条目数 > 0 → 进入 Phase 4

### Phase 4 — GOON → END 循环

初始化：`loopCount = 0`，`prevRemaining = -1`，`staleCount = 0`

**GOON 修复**：
1. Read `<GOON_PATH>`，找到所有整改项。
2. Read `<TASK_PATH>`，理解原始需求。
3. 逐项修复：分析根因 → 修改文件 → 运行质量门禁确认。
4. Edit `<GOON_PATH>`：已修复→标题加 ✅，无法修复→标题加 ⚠️ WONTFIX: <原因>。
5. Edit `<TASK_PATH>` Changes 追加：`YYYY-MM-DD HH:mm: goon 第N轮 — 修复X项 跳过Y项`。

**END 复核**：
1. Read `<TASK_PATH>` 和 `<GOON_PATH>` 最新状态。
2. 逐项验证（严苛）：检查代码是否真正修复 → 重新运行质量门禁（不得复用上轮结果）→ 通过→移除 | 失败→保留 | 新问题→追加。
3. **僵持检测**：本轮剩余 vs 上轮剩余。不减少 → `staleCount++`；连续2轮 → 剩余项标 `WONTFIX: 连续2轮无法收敛，建议人工介入`。
4. Write 重写 `<GOON_PATH>`：全部通过→`status: Done, 无待整改项`；仍有未标记 WONTFIX 的→`status: Active`。
5. `loopCount++`，返回 Phase 3。

### Phase 5 — 闭环报告

输出：

## 任务闭环报告

| 字段 | 值 |
|------|-----|
| 任务 | task-<编号> |
| 状态 | Done |
| 整改轮次 | <N> |
| 僵持次数 | <N> |
| 变更文件 | <从 Changes 提取> |
| 质量门禁 | <验证命令和结果> |

## Verification

完成后确认：
- goon 文件内容为空（无待整改项）
- task 文件 status 为 Done
- Changes 记录完整（含每次 GOON/END 迭代记录）

## Summary

报告闭环完成：任务编号、总整改轮次、最终 goon 状态、关键变更文件。

## Next Steps

- 继续下一个任务 → `/mxt-loop <另一个编号>`
- 手动审查 → `/mxt-end <编号>`
- 如遇 BUG → `/mxt-debug <描述>`
