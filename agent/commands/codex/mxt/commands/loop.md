---
description: "任务闭环 v3.1：Status 状态机 + Agent 角色隔离 + grep 机械计数 + MDC 意图驱动加载 + 断点续跑"
argument-hint: "<task-number>"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-loop — 任务闭环 v3.1（MDC 规则感知）

启动任务闭环：顺序执行 RUN→END→CHECK_GOON→[GOON_FIX→END_REVIEW]↺CHECK_GOON，循环直到 goon 整改队列 grep 机械计数归零。

> **v3.1 升级**：
> - **MDC 规则加载** ⚠️ NEW：Phase 0 提取 scope，每个 Agent 阶段按 scope 过滤发现 `.cursor/rules/*.mdc` + `.claude/rules/*.mdc`，`cat` 注入 prompt
> - **v3 核心**：Status 状态机 + 角色隔离 + 机械优先 + 断点续跑

## Arguments

The user invoked this command with: $ARGUMENTS

1. `$ARGUMENTS` 提取任务编号。如 `/mxt-loop 005` → `005`。
2. 声明 `📌 闭环锁定: task-<编号>`。

**硬规则**：
| 规则 | 说明 |
|------|------|
| 任务隔离锁 | 只读写 `task-NNN.md` / `goon-NNN.md` / `loop-NNN.json` |
| 质量门禁必通过 | 编译/lint/测试全过 → 才可写 Done + Changes |
| 唯一终止条件 | `grep -c '^## 整改项 [0-9]\+ —' goon-NNN.md` 返回 0 |
| 连续 2 轮僵持 | 剩余项标 WONTFIX，不再进入循环 |
| 无轮次上限 | 只要整改项在减少就继续 |
| 每轮质量门禁独立运行 | 不复用上轮结果 |
| 状态文件每阶段更新 | 支持断点续跑 |
| **Status 显式流转** | 每阶段必须变更 task/goon frontmatter status，不跳过 |
| **角色隔离** | RUN/GOON（执行）和 END（审查）必须分步执行，严禁交叉混用 |
| **MDC 意图加载** | RUN 阶段一次性：发现→意图分析→匹配→cat 注入。END/GOON 从状态文件读取，不重复发现 |

## Preflight

1. 读取并遵守 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及 `~/.codex/rules/r2mo-task-workflow.md`。
2. 解析 `$ARGUMENTS`，提取编号。若为空或不匹配数字，立即停止。
3. 任务路径：`.r2mo/task/task-$编号.md`，整改路径：`.r2mo/task/goon-$编号.md`。

### Step 0：状态恢复 + 智能预检

```bash
cat .r2mo/task/loop-<编号>.json 2>/dev/null || echo '{"phase":"INIT"}'
grep 'status:' .r2mo/task/task-<编号>.md | head -1
grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<编号>.md 2>/dev/null; true
grep 'status:' .r2mo/task/goon-<编号>.md 2>/dev/null | head -1
```

判定入口：
- task=Done + goon 机械计数=0 + goon status=Done/Closed → ✅ 跳到 Phase 5（闭环报告，0 操作）
- loop-NNN.json 不存在 / phase=INIT → Phase 1
- phase=RUN/END/CHECK_GOON/GOON_FIX/END_REVIEW → 从对应 phase 恢复
- 若 task status ≠ Active 且 ≠ Running → Edit frontmatter `status: Active`

### Step 0.5：识别任务 Scope（为 MDC 过滤做准备）

> ⚠️ v3.1 新增。从任务和 loop-NNN.json 提取 subproject。

```bash
SUB=$(grep '"subproject"' .r2mo/task/loop-<编号>.json 2>/dev/null | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$SUB" ]; then
  SUB=$(grep 'subproject:' .r2mo/task/task-<编号>.md 2>/dev/null | head -1 | sed 's/.*subproject:\s*//')
fi
echo "SCOPE_SUB=${SUB:-未指定}"
```

若 subproject 为空，标记 `SCOPE="workspace"`（仅加载 workspace 级 mdc）。

## Plan — Status 状态机

> v3 新增。task 和 goon 各自拥有独立的状态机。

### Task Status 流转

```
Active ──→ Running ──→ Done
  │           │           │
  └───────────┴──────→ Blocked ──→ (人工介入)
```

| 状态 | 含义 | 何时设置 |
|------|------|---------|
| `Active` | 任务待执行 | Phase 0 全新启动时 |
| `Running` | 正在执行 | Phase 1 开始执行前 |
| `Done` | 执行完成 | Phase 1 质量门禁通过后 |
| `Blocked` | 阻塞/僵持 | 连续 2 轮僵持时 |

### Goon Status 流转

```
Active ──→ InProgress ──→ Done
  │                        │
  └────────────────────────┘
             │
             ▼
          Closed (全部 WONTFIX)
```

| 状态 | 含义 | 何时设置 |
|------|------|---------|
| `Active` | 有未处理整改项 | Phase 2 END 发现问题时 |
| `InProgress` | 正在整改 | Phase 4a GOON 开始修复前 |
| `Done` | 全部修复完成 | Phase 4b END 复核确认 0 剩余 |
| `Closed` | 已闭环（含 WONTFIX） | Phase 4b 全部标记 WONTFIX 时 |

**Status 变更规则（硬性约束）**：每进入新 Phase 必须先变更对应 frontmatter status，不允许跳过（如 Active 直接 → Done 不经过 Running）。

## Commands

### 国产模型适配原则（贯穿全流程）

**原则 1：机械优先** — 所有"判断有几个、是否为空、是否相等"必须用 Bash，禁止模型阅读理解。

| 操作 | 机械方式 | 禁止方式 |
|------|---------|----------|
| 统计整改项数量 | `grep -c '^## 整改项 [0-9]\+ —' goon-NNN.md` | 模型读文件后数 |
| 判断 goon 是否为空 | grep 返回 0 或 frontmatter `item_count: 0` | 模型读文件判断 |
| 检查质量门禁 | 实际运行 build/lint/test 命令 | 模型猜测 |
| 格式合规检查 | grep 检查非法格式 | 模型判断 |
| Status 检查 | `grep 'status:' task-NNN.md` 机械提取 | 模型读文件判断 |
| 发现 mdc | `find <scope> \( -path "*/.cursor/rules/*.mdc" -o -path "*/.claude/rules/*.mdc" \)` | 模型猜测 |

**原则 2：显式状态** — loop-NNN.json 是唯一真相源，每 phase 前后必读写。

**原则 3：断点续跑** — loop-NNN.json 存在且 phase ≠ DONE → 从该 phase 恢复。

**原则 4：MDC 意图驱动加载（v3.1）** — RUN 阶段一次性执行：发现可用 mdc → 分析任务意图（机械 grep 信号关键词）→ 规则匹配过滤 → cat 注入。**禁止全量盲加载**。END/GOON/END_REVIEW 从状态文件 mdcFiles 读取，不重复发现和意图分析。

### Phase 1 — RUN（执行阶段）

> ⚠️ 执行阶段：只写代码，不做审查。

#### Step 1.0：Status 变更
Edit task frontmatter：`status: Active` → `status: Running`

#### Step 1.1：执行任务（含 MDC 意图驱动加载）

> ⚠️ **MDC 意图驱动加载（4 步机械流程）**：
> 
> **① 发现可用 mdc**：
> ```bash
> WS_MDC=$(find . -maxdepth 2 \( -path "*/.cursor/rules/*.mdc" -o -path "*/.claude/rules/*.mdc" \) 2>/dev/null | sort)
> if [ -n "${SCOPE_SUB}" ] && [ -d "${SCOPE_SUB}" ]; then
>   SUB_MDC=$(find "${SCOPE_SUB}" -maxdepth 3 \( -path "*/.cursor/rules/*.mdc" -o -path "*/.claude/rules/*.mdc" \) 2>/dev/null | sort)
> fi
> ALL_CANDIDATES=$( (echo "$WS_MDC"; echo "${SUB_MDC:-}") | sed '/^$/d' | sort -u )
> echo "CANDIDATE_COUNT: $(echo "$ALL_CANDIDATES" | grep -c .)"
> ```
> 
> **② 分析任务意图（机械 grep 信号关键词）**：
> ```bash
> TASK_CONTENT=$(cat .r2mo/task/task-<编号>.md)
> SIGNALS=""
> echo "$TASK_CONTENT" | grep -qiE 'auth|security|token|OAuth|JWT|LDAP|captcha|RBAC|session|认证|鉴权|权限' && SIGNALS="$SIGNALS security"
> echo "$TASK_CONTENT" | grep -qiE 'criteria|pager|sorter|projection|DBE|分页|排序|查询条件' && SIGNALS="$SIGNALS dbe"
> echo "$TASK_CONTENT" | grep -qiE 'spring|boot|r2mo-spring|auto-config|自动配置' && SIGNALS="$SIGNALS spring"
> echo "$TASK_CONTENT" | grep -qiE 'plugin|SPID|META-INF/services|插件' && SIGNALS="$SIGNALS plugin"
> echo "$TASK_CONTENT" | grep -qiE 'extension|exmodule|扩展模块' && SIGNALS="$SIGNALS extension"
> echo "$TASK_CONTENT" | grep -qiE 'RBAC_RESOURCE|PERM\.yml|seekSyntax|资源' && SIGNALS="$SIGNALS rbac"
> echo "SIGNALS=${SIGNALS:-general}"
> ```
> 
> **③ 规则匹配过滤（信号 → mdc 文件名交叉匹配）**：
> ```bash
> MATCHED=""
> for f in $ALL_CANDIDATES; do
>   fname=$(basename "$f")
>   for sig in $SIGNALS; do
>     case "$sig" in
>       security) echo "$fname" | grep -qiE 'security|auth' && MATCHED="$MATCHED $f" ;;
>       dbe)      echo "$fname" | grep -qiE 'dbe|database' && MATCHED="$MATCHED $f" ;;
>       spring)   echo "$fname" | grep -qiE 'spring|boot' && MATCHED="$MATCHED $f" ;;
>       plugin)   echo "$fname" | grep -qiE 'plugin' && MATCHED="$MATCHED $f" ;;
>       extension) echo "$fname" | grep -qiE 'extension|exmodule' && MATCHED="$MATCHED $f" ;;
>       rbac)     echo "$fname" | grep -qiE 'rbac|perm' && MATCHED="$MATCHED $f" ;;
>     esac
>   done
> done
> MATCHED=$(echo "$MATCHED" | tr ' ' '\n' | sort -u)
> if [ -z "$(echo "$MATCHED" | grep -v '^$')" ]; then
>   MATCHED=$(echo "$ALL_CANDIDATES" | grep -v '/iia\.\|/app-' | head -5)
> fi
> echo "MATCHED: $(echo "$MATCHED" | grep -c .) files"
> ```
> 
> **④ cat 注入**：`for f in $MATCHED; do echo "=== $f ==="; cat "$f"; echo ""; done`
> 
> ⚠️ **不加载全量 mdc**：仅注入与任务意图匹配的规则。无信号匹配时仅加载 workspace 根级通用规则。

1. 先阅读 ## MDC 规则上下文（从上述 bash 输出注入），理解项目编码规范、目录结构、命名约定
2. Read `<TASK_PATH>`，跳过 frontmatter，理解任务需求。
3. 按需求实现代码。如果有 ## Plan，按 Plan 执行。
4. 严格遵守 ## MDC 规则上下文中的约束。
5. 完成后输出: `RUN_DONE: <简要总结做了什么>`

#### Step 1.2：质量门禁（机械执行）
```bash
# Go 项目
cd <subproject> && GOPROXY=https://goproxy.cn,direct go build ./... 2>&1
# TypeScript 项目
npx tsc -b --noEmit 2>&1
```
若失败，修复后重新验证（最多 3 轮）。

#### Step 1.3：写 Changes + Status 变更
质量门禁通过后：
- Edit task 末尾追加 `## Changes` + 变更摘要 + 验证结果
- Edit task frontmatter：`status: Running` → `status: Done`

#### Step 1.4：更新状态文件
Write `loop-<编号>.json`：phase="END"，记录 agentCalls、totalTokens、**mdcFiles（Step 1.1 匹配到的文件列表，后续 END/GOON/END_REVIEW 从此读取）**。

### Phase 2 — END（审查阶段）

> ⚠️ 审查阶段：只审查代码，不做修改。必须与 Phase 1 的执行角色分开。

#### Step 2.1：获取代码变更（机械）
```bash
git diff --stat 2>&1 || echo "(非 git repo，改用目录对比)"
```

#### Step 2.2：质量门禁确认（机械）
```bash
cd <subproject> && GOPROXY=https://goproxy.cn,direct go build ./... 2>&1
```

#### Step 2.3：审查并生成 goon

> ⚠️ **MDC 规则上下文**：从状态文件 `mdcFiles` 读取，直接 `cat` 注入（RUN 阶段已完成一次性意图分析+加载，不重复发现）。

1. 先 `cat` 状态文件中的 mdcFiles，理解项目规则约束。
2. Read `<TASK_PATH>`（含 Changes），理解需求和已完成的变更。
3. 逐项对照检查：完成度、代码质量、命名规范、遗漏、潜在 bug。
4. 运行实际 build 命令确认编译通过。
5. Write `.r2mo/task/goon-<编号>.md`：

**无问题（空整改单）**：
```
---
title: 整改-<项目名>
status: Done
source: <TASK_PATH>
item_count: 0
---
# 整改队列
无待整改项。
```

**有问题**：
```
---
title: 整改-<项目名>
status: Active
source: <TASK_PATH>
item_count: <N>
---
# 整改队列
## 整改项 1 — <描述>
- 文件: <path>
- 问题: <具体描述>
- 期望: <目标状态>
```

**格式铁律**：整改项标题必须是 `## 整改项 N —`（"—" 中文破折号）。禁止 `- [ ]` checkbox。禁止 `1. **标题**` 数字编号。

完成后输出: `END_RESULT: <N>个问题`

#### Step 2.4：格式验证（机械）
```bash
STD_COUNT=$(grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<编号>.md 2>/dev/null; true) && echo "STD=${STD_COUNT:-0}"
CB_COUNT=$(grep -c '^- \[' .r2mo/task/goon-<编号>.md 2>/dev/null; true) && echo "CB=${CB_COUNT:-0}"
```
若 CB_COUNT > 0 → 重写格式（不改内容）。

#### Step 2.5：更新状态文件
Write `loop-<编号>.json`：phase="CHECK_GOON"。

### Phase 3 — 检查 goon（机械计数）

```bash
GOON_COUNT=$(grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<编号>.md 2>/dev/null; true) && echo "GOON_COUNT=${GOON_COUNT:-0}"
STATUS=$(grep 'status:' .r2mo/task/goon-<编号>.md 2>/dev/null | head -1) && echo "STATUS=$STATUS"
```

判定：GOON_COUNT=0 或 STATUS 含 Done/Closed → ✅ Phase 5；GOON_COUNT>0 → Phase 4。

### Phase 4 — GOON → END 循环

从 `loop-<编号>.json` 读取 `loop`, `prevRemaining`, `staleCount`。初始化：loop=0, prevRemaining=-1, staleCount=0。

#### Phase 4a — GOON 修复（执行阶段）

> ⚠️ 执行阶段：只修复代码，不做审查。

##### Step 4a.0：Status 变更
Edit goon frontmatter：`status: Active` → `status: InProgress`

##### Step 4a.1：修复

> ⚠️ **MDC 规则上下文**：从状态文件 `mdcFiles` 读取，直接 `cat` 注入（RUN 阶段已加载，不重复发现）。修复方案必须符合 MDC 规则约束。

1. `cat` 状态文件中的 mdcFiles，理解项目规则约束。
2. Read `<GOON_PATH>`，找到所有整改项。
3. 逐项修复：分析根因 → 修改文件 → 运行质量门禁。
3. Edit goon 每项：成功 → 标记 `✅ fixed`；失败 → 标记 `⚠️ WONTFIX: <原因>`。
4. Edit `<TASK_PATH>` Changes 追加：`YYYY-MM-DD HH:mm: goon 第N轮 — 修复X项 跳过Y项`。

完成后输出: `GOON_RESULT: 修复X项 跳过Y项`

##### Step 4a.2：质量门禁（机械）
```bash
cd <subproject> && GOPROXY=https://goproxy.cn,direct go build ./... 2>&1
```

#### Phase 4b — END 复核（审查阶段）

> ⚠️ 审查阶段：只复核代码，不做修改。严禁与 Phase 4a 执行角色交叉。

##### Step 4b.0：复核

> ⚠️ **MDC 规则上下文**：从状态文件 `mdcFiles` 读取，直接 `cat` 注入（RUN 阶段已一次性完成意图分析+加载，不重复 find 和信号匹配）。复核以 MDC 规则为基准。

1. `cat` 状态文件中的 mdcFiles，理解项目规则约束。
2. Read `<TASK_PATH>` 和 `<GOON_PATH>` 最新状态。
3. 逐项验证：重新运行质量门禁（不得复用上轮结果）→ 通过→删除该项 | 失败→保留 | 新问题→追加（对照 mdc 规则）。
4. **僵持检测**：本轮剩余 ≥ 上轮 → `staleCount++`；连续2轮 → 剩余项标 `WONTFIX: 连续2轮无法收敛，建议人工介入`，Edit task frontmatter `status: Blocked`。
5. Write 重写 `<GOON_PATH>`，更新 frontmatter：
   - 全部通过 → `status: Done, item_count: 0`
   - 仍有 WONTFIX → `status: Closed, item_count: <WONTFIX数>`
   - 仍有未修复项 → `status: Active, item_count: <N>`
6. Edit `<TASK_PATH>` Changes 追加复核记录。

完成后输出: `END_RECHECK: 剩余X项 新发现Y项 僵持:true/false`

##### Step 4b.1：机械判定
从输出中提取 `REMAINING` 和 `STALE`。
更新 `loop-<编号>.json`：loop++, prevRemaining=REMAINING, phase="CHECK_GOON"。返回 Phase 3。

### Phase 5 — 闭环报告

#### Step 5.1：最终验证（机械）
```bash
grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<编号>.md 2>/dev/null; true
grep 'status:' .r2mo/task/task-<编号>.md | head -1
grep 'status:' .r2mo/task/goon-<编号>.md | head -1
cd <subproject> && GOPROXY=https://goproxy.cn,direct go build ./... 2>&1
```

#### Step 5.2：写状态文件
Write `loop-<编号>.json`：phase="DONE"。

#### Step 5.3：输出报告

## 任务闭环报告

| 字段 | 值 |
|------|-----|
| 任务 | task-<编号> |
| task status | Active → Running → Done |
| goon status | Active → InProgress → Done/Closed |
| 整改轮次 | <N> |
| 僵持次数 | <N> |
| 变更文件 | <列表> |
| 质量门禁 | <命令+结果> |
| MDC 规则 | <N> 个 .mdc 文件加载 |

### 终止条件

| 条件 | 规则 |
|------|------|
| **正常终止** | goon 机械计数=0 + task Done + goon Done/Closed |
| 僵持终止 | 连续 2 轮僵持 → task Blocked, goon Closed |
| 预检跳过 | task Done + goon 空 → 0 操作，直接 Phase 5 |

### 状态文件格式

路径：`.r2mo/task/loop-<编号>.json`

```json
{
  "task": "<编号>",
  "phase": "INIT|RUN|END|CHECK_GOON|GOON_FIX|END_REVIEW|DONE",
  "loop": 0,
  "prevRemaining": -1,
  "staleCount": 0,
  "startedAt": "<ISO8601>",
  "lastCheckpoint": "<ISO8601>",
  "goonItemCount": 0,
  "filesChanged": [],
  "qualityGateResults": {},
  "subproject": "",
  "errorLog": [],
  "mdcFiles": []
}
```

## Verification

完成后确认：
- goon 机械计数为 0
- task status 为 Done
- goon status 为 Done 或 Closed
- Changes 记录完整（含每次迭代记录）
- 质量门禁通过

## Summary

报告闭环完成：任务编号、总整改轮次、最终 goon 状态、变更文件、质量门禁结果。

## Next Steps

- 继续下一个任务 → `/mxt-loop <另一个编号>`
- 手动审查 → `/mxt-end <编号>`
- 手动整改 → `/mxt-goon <编号>`
- 如遇 BUG → `/mxt-debug <描述>`
