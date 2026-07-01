---
description: "三 Agent Team 任务闭环：AI 顺序执行 RUN→END→GOON↺END，直到 goon 整改队列清空"
argument-hint: "<task-number>"
---

# /mxt:loop

启动任务闭环处理：AI 顺序扮演执行者→审查者→修复者，循环直到 goon 整改队列清空。

**`/mxt:loop <编号>` 的含义**：锁定这个任务，一直循环直到完成。不是执行下一个任务。

The user invoked this command with: $ARGUMENTS

## 参数解析

1. `$ARGUMENTS` 提取任务编号（如 `/mxt:loop 005` → `005`，支持一位或多位数字，自动补零到三位）。
2. 解析后在聊天窗口中声明结果 `📌 闭环锁定: task-<编号>`。

**硬规则**：解析失败→终止 | 任务隔离锁：只读写 task-NNN.md 和 goon-NNN.md | 质量门禁必通过→才可写Done+Changes | 唯一终止条件：END 审查后 goon 内容为空（零条实际整改项条目） | 连续2轮整改项数不减少→僵持→剩余项标WONTFIX | 无轮次上限 | 每轮 END 必须重新运行质量门禁，不得复用上轮结果

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`（若存在），以及它们引用的所有规则文件。
2. 解析 `$ARGUMENTS`，提取三位数字编号。如果 `$ARGUMENTS` 为空或开头不匹配数字，立即停止。
3. 将任务路径设为 `.r2mo/task/task-$编号.md`，整改路径设为 `.r2mo/task/goon-$编号.md`。

## 闭环执行

你将在同一个上下文中顺序执行以下阶段，循环直到 goon 清空：

### Phase 1 — RUN（执行者）

1. Read `<TASK_PATH>`，跳过 frontmatter，理解任务需求。
2. 按需求实现代码。
3. **质量门禁（不可跳过）**：
   - Go: `GOPROXY=https://goproxy.cn,direct go build ./... && golangci-lint run ./... && go test -race ./...`
   - TypeScript: `npx tsc -b --noEmit && npx eslint . && npm run build`
4. 全部通过后，Edit `<TASK_PATH>`：末尾追加 `## Changes` + 变更摘要 + 验证结果；frontmatter status 改为 `Done`。

### Phase 2 — END（审查者）

1. Read `<TASK_PATH>`（含 Changes），Bash 检查代码变更。
2. 逐项对照任务需求审查：需求完成度、编译、Lint、命名规范、遗漏/bug。
3. 运行质量门禁确认。
4. Write `<GOON_PATH>`：无问题→`无待整改项。所有检查已通过。`；有问题→`## 整改项 N — <描述>` 列出每条。

### Phase 3 — 检查 goon

Read `<GOON_PATH>`，统计实际整改项条目。不算 frontmatter/标题/"无待整改项"占位文本。条目数=0→✅ 闭环完成；>0→进入 Phase 4。

### Phase 4 — GOON → END 循环

- `loopCount = 0`, `prevRemaining = -1`, `staleCount = 0`

**GOON 修复**：读 goon → 逐项修复 → 质量门禁 → 标记 ✅/⚠️WONTFIX → Edit task Changes。

**END 复核**：读最新状态 → 逐项验证（重新运行质量门禁，不复用上轮）→ 通过→移除 | 失败→保留。僵持检测：连续2轮不减少→剩余项标WONTFIX。Write 重写 goon。`loopCount++`，返回 Phase 3。

### Phase 5 — 闭环报告

输出表格：任务编号、整改轮次、僵持次数、变更文件、质量门禁结果。

## 终止条件（严苛）

| 条件 | 规则 |
|------|------|
| **唯一终止** | END 审查后 goon 文件内容为"无待整改项" |
| 僵持处理 | 连续 2 轮整改项数不减少 → 剩余项标 WONTFIX，不再阻塞闭环 |
| 质量门禁 | GOON 修复后 + END 复核时，各自独立运行，不复用上轮结果 |
| 完成状态 | goon 为空 AND 质量门禁全通过 AND task status=Done |

## Verification

完成后确认：goon 为空、task status=Done、Changes 记录完整。

## Next Steps

- 继续下一个任务 → `/mxt:loop <另一个编号>`
- 手动审查 → `/mxt:end <编号>`
- 拉起开发环境 → `/mxt:start`
