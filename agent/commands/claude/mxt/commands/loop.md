---
description: "任务闭环 v3.1：Status 状态机 + Agent 角色隔离 + grep 机械计数 + MDC 意图驱动加载 + 断点续跑"
argument-hint: "<task-number>"
allowed-tools: [Read, Bash, Edit, Write, Grep, Glob, Task]
---

# /mxt:loop — 任务闭环 v3.1（MDC 规则感知）

启动任务闭环：AI 手动顺序执行 RUN→END→CHECK_GOON→[GOON_FIX→END_REVIEW]↺CHECK_GOON，循环直到 goon 整改队列机械计数归零。

> **v3.1 升级**：
> - **MDC 意图驱动加载** ⚠️ NEW：RUN 阶段一次性执行 发现→意图分析(grep)→匹配→cat 注入，不盲加载全量 mdc；END/GOON/END_REVIEW 从状态文件读取，不重复发现
> - **v3 核心**：Status 状态机 + Agent 角色隔离 + grep 机械计数 + 断点续跑

The user invoked this command with: $ARGUMENTS

## 参数解析

1. `$ARGUMENTS` 提取任务编号。如 `/mxt:loop 005` → `005`。
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
| Agent 单任务原则 | 每个 agent 调用只做一件事 |
| **Agent 角色隔离** | 执行者（RUN/GOON）≠ 审查者（END），严禁混用 |
| **Status 显式流转** | 每阶段必须变更 task/goon frontmatter status，不跳过 |
| **MDC 规则加载** | 执行前 `find` 发现 + `cat` 注入 Agent prompt，机械操作不靠模型猜测 |

## Status 状态机

> v3 新增。task 和 goon 各自拥有独立的状态机，每阶段必须显式变更 frontmatter status。

### Task Status 流转

```
          ┌──────────────────────────────────┐
          │                                  │
          ▼                                  │
Active ──→ Running ──→ Done                  │
          │           │                      │
          │           ▼                      │
          └──────→ Blocked ──→ (人工介入) ──┘
```

| 状态 | 含义 | 何时设置 |
|------|------|---------|
| `Active` | 任务待执行 | Phase 0 全新启动时（若 task 非 Done） |
| `Running` | 正在执行 | Phase 1 Step 1.0 — 开始执行前 |
| `Done` | 执行完成 | Phase 1 Step 1.3 — 质量门禁通过后 |
| `Blocked` | 阻塞/僵持 | Phase 4 连续 2 轮僵持时 |

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

### Status 变更规则（硬性约束）

- 每进入一个新 Phase，必须先检查并变更对应的 frontmatter status
- 不允许跳过 status 变更（如 Active 直接 → Done 而不经过 Running）
- Phase 0 预检：若 task status ≠ Active 且 ≠ Running → 设置 Active
- 闭环完成时：task status=Done, goon status=Done 或 Closed

## 国产模型适配原则

### 原则 1：机械优先（Machine First）

**所有需要"判断有几个、判断是否为空、判断是否相等"的操作，必须用 Bash 命令，禁止靠模型阅读理解。**

| 操作 | 机械方式 | 禁止方式 |
|------|---------|----------|
| 统计整改项数量 | `grep -c '^## 整改项 [0-9]\+ —' goon-NNN.md` | 模型读文件后数 |
| 判断 goon 是否为空 | grep 返回 0 或 frontmatter `item_count: 0` | 模型读文件判断 |
| 检查质量门禁 | 实际运行 build/lint/test 命令 | 模型猜测 |
| 检查文件变更 | `git diff --stat` | 模型回忆 |
| 格式合规检查 | grep 检查非法格式 | 模型判断 |
| 状态文件读取 | Bash `cat` + 模型只看 phase 字段 | 模型全文理解 |
| **Status 检查** | `grep 'status:' task-NNN.md` 机械提取 | 模型读文件判断 |

### 原则 2：单任务 Agent（Single-Task Agent）

**每次 agent 调用只做一件事，纯中文 prompt，避免中英混杂。**

### 原则 3：显式状态（Explicit State）

**状态文件是唯一真相源。每次进入新 phase 前必须读状态文件。每次完成一个 phase 必须写状态文件。**

### 原则 4：断点续跑（Checkpoint Resume）

**如果状态文件存在且 phase != DONE，从该 phase 恢复执行，不从头开始。**

### 原则 5：角色隔离（Role Separation）⚠️ v3 新增

**执行者（RUN/GOON）和审查者（END）必须用不同的 Agent，严禁同一 Agent 既写代码又审查自己。**

| Phase | 角色 | 必须使用的 Agent 类型 | 说明 |
|-------|------|----------------------|------|
| Phase 1 RUN | 执行者 | `executor` | 写代码、实现功能 |
| Phase 2 END | 审查者 | `code-reviewer` | 审查代码、生成 goon |
| Phase 4a GOON | 执行者 | `executor` | 修复整改项 |
| Phase 4b END_REVIEW | 审查者 | `code-reviewer` | 复核修复结果 |

```
执行者链路: executor ──→ executor ──→ ...
审查者链路:             code-reviewer ──→ code-reviewer ──→ ...

严禁: executor 审查自己的代码
严禁: code-reviewer 修改代码
严禁: 同一个 agentId 既做 RUN 又做 END
```

### 原则 6：MDC 意图驱动加载（Intent-Driven Rule Loading）⚠️ v3.1 新增

**RUN 阶段一次性分析任务意图 → 匹配相关 .mdc → 加载注入。禁止全量盲加载，禁止 END/GOON 阶段重复发现。**

核心流程：**发现可用 mdc → 分析任务意图 → 规则匹配过滤 → cat 注入 → 写入状态文件**

| 步骤 | 机械方式 | 说明 |
|------|---------|------|
| ① 发现可用 mdc | `find` workspace + subproject 两级 | 列出所有候选 .mdc 文件路径 |
| ② 分析任务意图 | Bash `grep` 任务文件提取信号关键词 | 机械关键词匹配，不靠模型猜测 |
| ③ 规则匹配过滤 | 信号词 → mdc 文件名/路径交叉匹配 | 仅加载与任务领域相关的 .mdc |
| ④ cat 注入 | `cat` 匹配到的 .mdc，注入 Agent prompt | 不加载无关规则，避免噪声干扰 |
| ⑤ 写入状态 | 将匹配的 mdcFiles 写入 loop-NNN.json | END/GOON/END_REVIEW 从状态文件读取，不重复发现 |

**信号 → 规则匹配表（机械 grep 用）**：

| 信号关键词（从任务内容 grep） | 匹配的 mdc 文件/路径模式 |
|------------------------------|--------------------------|
| auth, security, token, OAuth, JWT, LDAP, captcha, RBAC, session, 认证, 鉴权, 权限 | `*security*`, `*auth*` |
| criteria, pager, sorter, projection, DBE, 分页, 排序, 查询条件 | `*dbe*`, `*database*` |
| spring, boot, r2mo-spring, auto-config, 自动配置 | `*spring*`, `*boot*` |
| plugin, SPID, META-INF/services, 插件 | `*plugin*` |
| extension, exmodule, 扩展模块 | `*extension*`, `*exmodule*` |
| RBAC_RESOURCE, PERM.yml, seekSyntax, 资源 | `*rbac*`, `*perm*` |

**无匹配时**：仅加载 workspace 级 `CLAUDE.md` / `AGENTS.md` 中引用的通用规则，不加载领域专属 mdc。

**加载规则**：
- **仅在 RUN 阶段**（Step 1.1）执行完整流程：发现 → 意图分析 → 匹配 → cat → 写状态
- **END / GOON / END_REVIEW** 阶段：直接从 loop-NNN.json 的 `mdcFiles` 字段读取，`cat` 注入，不重复 find + 意图分析
- mdc 内容注入到 Agent prompt 的 `## MDC 规则上下文` 段，放在 `## 输入` 之后、`## 步骤` 之前
- Agent 必须先理解项目规则约束，再阅读任务需求

## 状态文件（防序列化断裂）

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
  "agentCalls": [],
  "totalTokens": 0,
  "mdcFiles": []
}
```

> v3 新增 `agentCalls` 和 `totalTokens` 字段，追踪每次 Agent 调用和 Token 消耗。

**状态文件操作规范**：
- **读取**：每次进入新 phase 前，Bash `cat .r2mo/task/loop-<编号>.json 2>/dev/null || echo '{"phase":"INIT"}'`
- **写入**：每完成一个 phase，Write 更新整个状态文件，更新 `phase`、`lastCheckpoint`、`agentCalls`、`totalTokens`

## Phase 0 — 状态恢复 + 智能预检

**目的**：确定当前应该进入哪个阶段。

### Step 0.1：读状态文件

```bash
cat .r2mo/task/loop-<编号>.json 2>/dev/null || echo '{"phase":"INIT"}'
```

### Step 0.2：智能预检（机械）

```bash
# 检查 task status
grep 'status:' .r2mo/task/task-<编号>.md | head -1

# 检查 goon（如果存在）
grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<编号>.md 2>/dev/null; true
grep 'status:' .r2mo/task/goon-<编号>.md 2>/dev/null | head -1
```

### Step 0.3：判定入口

| 条件 | 行为 |
|------|------|
| task=Done + goon 机械计数=0 + goon status=Done/Closed | ✅ 已完成 → 跳到 Phase 5（闭环报告，0 Agent） |
| loop-NNN.json 不存在 / phase=INIT / phase=DONE | 全新启动 → Phase 1 |
| phase=RUN | 检查 task status。若 Done → Phase 2；否则 Phase 1 |
| phase=END | Phase 2 |
| phase=CHECK_GOON | Phase 3 |
| phase=GOON_FIX | Phase 4a |
| phase=END_REVIEW | Phase 4b |

### Step 0.4：初始化 Status（若全新启动）

若 task status 非 `Active` 且非 `Running`：
- Edit task frontmatter `status: Active`

声明：`📌 闭环锁定: task-<编号> | 初始状态: <当前phase> → <目标phase>`

### Step 0.5：识别任务 Scope（为 MDC 过滤做准备）

> ⚠️ v3.1 新增。从任务 frontmatter 和 loop-NNN.json 提取 subproject，后续每个 Agent 阶段基于 scope 做 MDC 发现。

```bash
# 提取 subproject（优先 loop-NNN.json，其次 task frontmatter）
SUB=$(grep '"subproject"' .r2mo/task/loop-<编号>.json 2>/dev/null | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$SUB" ]; then
  SUB=$(grep 'subproject:' .r2mo/task/task-<编号>.md 2>/dev/null | head -1 | sed 's/.*subproject:\s*//')
fi
echo "SCOPE_SUB=${SUB:-未指定}"
```

若 subproject 为空且 loop-NNN.json 中已有 subproject 字段，按原值继续。若两个都无，标记 `SCOPE="workspace"`（仅加载 workspace 级 mdc）。

---

## Phase 1 — RUN（执行者 · executor Agent）

> ⚠️ **角色隔离**：必须使用 `executor` 类型的 Agent。禁止使用 `code-reviewer`。

### Step 1.0：Status 变更

Edit task frontmatter：`status: Active` → `status: Running`

### Step 1.1：执行任务（Agent · executor）

> ⚠️ **调用前必做 — MDC 意图驱动加载（4 步机械流程）**：
> 
> **① 发现可用 mdc（workspace + subproject 两级）**：
> ```bash
> WS_MDC=$(find . -maxdepth 2 \( -path "*/.cursor/rules/*.mdc" -o -path "*/.claude/rules/*.mdc" \) 2>/dev/null | sort)
> if [ -n "${SCOPE_SUB}" ] && [ -d "${SCOPE_SUB}" ]; then
>   SUB_MDC=$(find "${SCOPE_SUB}" -maxdepth 3 \( -path "*/.cursor/rules/*.mdc" -o -path "*/.claude/rules/*.mdc" \) 2>/dev/null | sort)
> fi
> ALL_CANDIDATES=$( (echo "$WS_MDC"; echo "${SUB_MDC:-}") | sed '/^$/d' | sort -u )
> echo "=== CANDIDATE MDC FILES ==="
> echo "$ALL_CANDIDATES"
> echo "CANDIDATE_COUNT: $(echo "$ALL_CANDIDATES" | grep -c .)"
> ```
> 
> **② 分析任务意图（机械关键词 grep）**：
> ```bash
> TASK_CONTENT=$(cat .r2mo/task/task-<编号>.md)
> # 提取信号关键词（从任务内容匹配信号表）
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
> **③ 规则匹配过滤（信号 → mdc 文件路径交叉匹配）**：
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
> # 去重 + 始终追加 workspace 级通用规则（CLAUDE.md 同级 .cursor/rules/*.mdc）
> MATCHED=$(echo "$MATCHED" | tr ' ' '\n' | sort -u)
> # 若无匹配（general），仅加载 workspace 根级 .mdc（非子项目目录）
> if [ -z "$(echo "$MATCHED" | grep -v '^$')" ]; then
>   MATCHED=$(echo "$ALL_CANDIDATES" | grep -v '/iia\.\|/app-' | head -5)
> fi
> echo "=== MATCHED MDC ($(echo "$MATCHED" | grep -c .) files) ==="
> echo "$MATCHED"
> ```
> 
> **④ cat 注入**：
> ```bash
> # 只 cat 匹配到的 .mdc，不加载无关规则
> for f in $MATCHED; do echo "=== $f ==="; cat "$f"; echo ""; done
> ```
> ⚠️ **不加载全量 mdc**：仅注入与任务意图（信号匹配）相关的规则文件。信号无匹配时仅加载 workspace 根级通用规则。

```
你是任务执行者。你只做一件事：读取任务文件并实现代码。

## 输入
- 任务文件: .r2mo/task/task-<编号>.md
- 项目根: /Users/lang/zero-cloud/app-zero/r2mo-apps/app-iia

## MDC 规则上下文（仅包含与当前任务 scope 匹配的 .mdc，按上述 bash 输出注入）
<每个 .mdc 文件：=== 文件路径 === + 文件内容>

## 步骤
1. 先仔细阅读 ## MDC 规则上下文，理解项目编码规范、目录结构、命名约定
2. 读任务文件（跳过 --- 之间的 frontmatter）
3. 读 AGENTS.md、CLAUDE.md 了解项目规则
4. 按任务需求写代码。如果有 ## Plan，按 Plan 执行
5. 完成后在最后一行输出: RUN_DONE: <简要总结做了什么>

## 规则
- 严格遵守 ## MDC 规则上下文 中的约束
- 只修改任务范围内的文件
- 不改其他 task-*.md 或 goon-*.md
- 不写 Changes（后续步骤会写）
- 不改 status（后续步骤会改）
```

**Agent 调用参数**：`subagent_type="executor"`

用 Bash 验证 Agent 返回结果中是否包含 `RUN_DONE:`。若不包含，重新执行（最多 2 次）。

### Step 1.2：质量门禁（机械执行）

```bash
cd <subproject> && GOPROXY=https://goproxy.cn,direct go build ./... 2>&1
```

若失败，用 **executor** Agent 修复（最多 3 轮）。

### Step 1.3：写 Changes + Status 变更

质量门禁通过后：
- Edit task 末尾追加 `## Changes` + 变更摘要 + 门禁验证结果
- Edit task frontmatter：`status: Running` → `status: Done`

### Step 1.4：更新状态文件

Write `loop-<编号>.json`：phase="END"，记录 agentCalls、totalTokens、**mdcFiles**（MDC 在此完成一次性加载，后续 END/GOON/END_REVIEW 直接引用，不再重复发现）。

---

## Phase 2 — END（审查者 · code-reviewer Agent）

> ⚠️ **角色隔离**：必须使用 `code-reviewer` 类型的 Agent。禁止使用 `executor`。

### Step 2.1：获取代码变更（机械）

```bash
git diff --stat 2>&1 || echo "(非 git repo，改用目录对比)"
```

### Step 2.2：质量门禁确认（机械）

```bash
cd <subproject> && GOPROXY=https://goproxy.cn,direct go build ./... 2>&1
```

### Step 2.3：审查并生成 goon（Agent · code-reviewer）

> ⚠️ **MDC 规则上下文**：RUN 阶段已完成一次性加载并写入 `loop-NNN.json` 的 `mdcFiles` 字段。审查者从状态文件读取 mdcFiles 列表，直接 `cat` 注入 prompt（不重复 `find` 发现）。若状态文件中 mdcFiles 为空，仅加载 AGENTS.md/CLAUDE.md。

```
你是代码审查者。你只做一件事：审查任务完成情况并生成整改清单。

## 输入
- 任务文件: .r2mo/task/task-<编号>.md
- 项目根: /Users/lang/zero-cloud/app-zero/r2mo-apps/app-iia

## MDC 规则上下文（仅包含与当前任务 scope 匹配的 .mdc）
<每个 .mdc 文件：=== 文件路径 === + 文件内容>

## 步骤
1. 先仔细阅读 ## MDC 规则上下文，以规则约束为审查基准
2. 读任务文件（含 ## Changes），理解需求和已完成的变更
3. 逐项对照检查：完成度、合规性（对照 mdc 规则）、代码质量、命名规范、遗漏、潜在 bug
4. 运行实际 build 命令确认编译通过
5. 根据检查结果生成整改文件

## 输出
Write .r2mo/task/goon-<编号>.md：

无问题 → status: Done, item_count: 0, "无待整改项"
有问题 → status: Active, item_count: <N>，每项 "## 整改项 N —" 格式

## 格式铁律
- 整改项标题必须是 "## 整改项 N —"（N 从 1 递增，"—" 中文破折号）
- 禁止 "- [ ]" checkbox
- 禁止 "1. **标题**" 数字编号

完成后在最后一行输出: END_RESULT: <N>个问题
```

**Agent 调用参数**：`subagent_type="code-reviewer"`

### Step 2.4：格式验证（机械）

```bash
STD_COUNT=$(grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<编号>.md 2>/dev/null; true) && echo "STD=${STD_COUNT:-0}"
CB_COUNT=$(grep -c '^- \[' .r2mo/task/goon-<编号>.md 2>/dev/null; true) && echo "CB=${CB_COUNT:-0}"
```

若 CB_COUNT > 0，用 **code-reviewer** Agent 重写格式（不改内容）。

### Step 2.5：Status 变更

goon 文件已由 Agent 生成，status 已设为 `Active`（有问题）或 `Done`（无问题）。

### Step 2.6：更新状态文件

Write `loop-<编号>.json`：phase="CHECK_GOON"，记录 agentCalls 和 totalTokens。

---

## Phase 3 — 检查 goon（机械计数）

### Step 3.1：机械计数

```bash
GOON_COUNT=$(grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<编号>.md 2>/dev/null; true) && echo "GOON_COUNT=${GOON_COUNT:-0}"
STATUS=$(grep 'status:' .r2mo/task/goon-<编号>.md 2>/dev/null | head -1) && echo "STATUS=$STATUS"
```

### Step 3.2：判定

```
GOON_COUNT=0 或 STATUS 含 "Done" 或 STATUS 含 "Closed" → ✅ Phase 5
GOON_COUNT>0 → Phase 4
```

### Step 3.3：更新状态文件

phase="GOON_FIX" 或 phase="DONE"。

---

## Phase 4 — GOON → END 循环

从 `loop-<编号>.json` 读取 `loop`, `prevRemaining`, `staleCount`。

### Phase 4a — GOON 修复（执行者 · executor Agent）

> ⚠️ **角色隔离**：必须使用 `executor`。禁止使用 `code-reviewer`。

#### Step 4a.0：Status 变更

Edit goon frontmatter：`status: Active` → `status: InProgress`

#### Step 4a.1：修复（Agent · executor）

> ⚠️ **MDC 规则上下文**：从状态文件 `mdcFiles` 读取，直接 `cat` 注入（RUN 阶段已加载，不重复 `find`）。修复方案必须符合 MDC 规则约束。

```
你是修复者。你只做一件事：修复整改清单中的所有项目。

## 输入
- 整改文件: .r2mo/task/goon-<编号>.md
- 任务文件: .r2mo/task/task-<编号>.md
- 项目根: /Users/lang/zero-cloud/app-zero/r2mo-apps/app-iia

## MDC 规则上下文（仅包含与当前任务 scope 匹配的 .mdc）
<每个 .mdc 文件：=== 文件路径 === + 文件内容>

## 步骤
1. 先仔细阅读 ## MDC 规则上下文，确保修复方案符合项目约束
2. 读整改文件和任务文件
3. 逐项处理: 分析根因 → 修改文件 → 运行质量门禁
4. 成功 → "- 状态: ✅ fixed" / 失败 → "- 状态: ⚠️ WONTFIX: <原因>"
5. Edit 任务文件 ## Changes 末尾追加记录

完成后输出: GOON_RESULT: 修复X项 跳过Y项
```

**Agent 调用参数**：`subagent_type="executor"`

#### Step 4a.2：质量门禁（机械）

```bash
cd <subproject> && GOPROXY=https://goproxy.cn,direct go build ./... 2>&1
```

### Phase 4b — END 复核（审查者 · code-reviewer Agent）

> ⚠️ **角色隔离**：必须使用 `code-reviewer`。禁止使用 `executor`。必须与 Phase 4a 的 Agent 不同。

#### Step 4b.0：复核（Agent · code-reviewer）

> ⚠️ **MDC 规则上下文**：从状态文件 `mdcFiles` 读取，直接 `cat` 注入（RUN 阶段已一次性完成意图分析+加载，不重复 `find` 和信号匹配）。复核以 MDC 规则为基准。

```
你是复核者。你只做一件事：复核本轮修复是否真正解决了问题。

## 输入
- 任务文件: .r2mo/task/task-<编号>.md
- 整改文件: .r2mo/task/goon-<编号>.md
- 上轮剩余: <prevRemaining>
- 僵持计数: <staleCount>

## MDC 规则上下文（仅包含与当前任务 scope 匹配的 .mdc）
<每个 .mdc 文件：=== 文件路径 === + 文件内容>

## 步骤
1. 先仔细阅读 ## MDC 规则上下文，以规则约束为复核基准
2. 读最新文件
3. 逐项验证: 重新运行质量门禁 → 通过则删除 / 失败则保留 / 新问题追加（对照 mdc 规则）
4. 僵持检测: 本轮剩余 ≥ 上轮 → 僵持；连续2轮 → WONTFIX
5. Write 重写 goon，更新 frontmatter status:
   - 全部通过 → status: Done, item_count: 0
   - 仍有 WONTFIX → status: Closed, item_count: <WONTFIX数>
   - 仍有未修复项 → status: Active, item_count: <N>
6. Edit 任务文件 ## Changes 末尾追加复核记录

完成后输出: END_RECHECK: 剩余X项 新发现Y项 僵持:true/false
```

**Agent 调用参数**：`subagent_type="code-reviewer"`

### Phase 4c：机械判定

```bash
REMAINING=$(echo "<agent输出>" | grep -o '剩余[0-9]\+项' | grep -o '[0-9]\+')
STALE=$(echo "<agent输出>" | grep -o '僵持:true\|僵持:false')
```

**更新**：`loop++`, `prevRemaining=REMAINING`, `staleCount` 按规则 ±, phase="CHECK_GOON"。
**Status 变更**：若僵持触发 → Edit task frontmatter `status: Blocked`。
Write `loop-<编号>.json`，返回 Phase 3。

---

## Phase 5 — 闭环报告

### Step 5.1：最终验证（机械）

```bash
grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<编号>.md 2>/dev/null; true
grep 'status:' .r2mo/task/task-<编号>.md | head -1
grep 'status:' .r2mo/task/goon-<编号>.md | head -1
cd <subproject> && GOPROXY=https://goproxy.cn,direct go build ./... 2>&1
```

### Step 5.2：写状态文件

Write `loop-<编号>.json`：phase="DONE"，含完整 agentCalls 和 totalTokens。

### Step 5.3：输出报告

```
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

### Agent 调用统计

| # | Phase | Agent 类型 | Token |
|---|-------|-----------|-------|
| 1 | RUN | executor | xxx |
| 2 | END | code-reviewer | xxx |
| ... | ... | ... | ... |
| **合计** | | **N 次** | **xxx Token** |

<简短总结>
```

## 终止条件

| 条件 | 规则 |
|------|------|
| **正常终止** | goon 机械计数=0 + task Done + goon Done/Closed |
| 僵持终止 | 连续 2 轮僵持 → task Blocked, goon Closed |
| 预检跳过 | task Done + goon 空 → 0 Agent, 直接 Phase 5 |

## Agent 调用追踪格式

每次 Agent 调用后，更新 `loop-NNN.json`：

```json
{
  "agentCalls": [
    {"phase": "RUN", "agentType": "executor", "agentId": "a...", "tokens": 150000},
    {"phase": "END", "agentType": "code-reviewer", "agentId": "b...", "tokens": 80000}
  ],
  "totalTokens": 230000
}
```

## Next Steps

- 下一个任务 → `/mxt:loop <编号>`
- 手动审查 → `/mxt:end <编号>`
- 手动整改 → `/mxt:goon <编号>`
- 拉起环境 → `/mxt:start`
