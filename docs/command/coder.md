# mxt coder

## 用途

构建并使用本地代码知识库。扫描当前 Git 项目及其子模块，抽取文件、符号、路由、配置、依赖与文档锚点，写入图谱、全文检索和向量多层索引，供开发者与 AI Agent 以低 token 成本定位实现、追溯调用关系和理解仓库结构。

`mxt coder` 的默认职责是让 AI 先读投影，再读源码：不改变源代码、不依赖外部服务、不创建临时备份。

## 参数

无选项参数。第一个位置参数决定动作，缺省动作为全量扫描：

| 调用 | 语义 |
|:---|:---|
| `mxt coder` | 默认全量扫描。若已有相同 `schemaVersion` 且 Git 分支未变化的索引，直接跳过。 |
| `mxt coder scan` | 显式强制全量重建，会先清空并重建当前 store。 |
| `mxt coder status` | 展示索引时间、统计、Git 分支、语言、框架和漂移概况。 |
| `mxt coder update` | 按 `file_states` 做增量刷新；分支变化时自动重建全量。 |
| `mxt coder locate "<query>"` | 词法、中文二元语法和向量混合检索，输出 AI 可读的三段投影。 |
| `mxt coder expand <node-id>` | 给定图谱节点，返回直接关系和推荐闭合邻域。 |

动作之外没有额外 CLI 选项；查询语句用引号包裹更稳。

## 说明

- **边界选择**：包含自身 `.git` 的目录按自治仓库处理；顶层发现 `.gitmodules` 时，父仓聚合扫描，子模块目录排除在父仓文件遍历之外，并以 `SUBMODULE` 节点和 `MODULEREF` 边登记。子模块内部仍可独立执行 `mxt coder`，拥有自己的 store。
- **落盘与忽略**：索引写入 `.r2mo/repo/self/graph.db` 与 `.r2mo/repo/self/meta.json`。首次扫描会检查并向 `.gitignore` 追加一行 `.r2mo/repo/`，不生成备份文件。图谱、英文/中文全文索引、向量和运行元数据在同一个 SQLite 物理库中分层存放。
- **低成本 AI 阅读入口**：`locate` 的输出以 `# /mcode Result — <query>` 开头，分 `Entry Points`、`Related Graph Neighbourhood`、`Suggested Reading Order` 三段；这是面向 Agent 的投影，不表示存在独立的 `/mcode` CLI 命令。投影中的节点可直接作为 `expand` 输入。
- **分支感知**：索引记录当前 Git 分支。分支切换后 `update` 会判定失效并重建；`status` 用 `BRANCH CHANGED` 提醒用户。
- **增量语义**：`update` 基于 `file_states` 计算 added、changed、deleted；必要时同步刷新受影响子模块索引。没有漂移时输出 `Up to date. Nothing to incrementally update.`。
- **多信号技术栈识别**：技术栈综合 root manifests、文件扩展分布、关键目录/文件形态和源码抽样，而不是只看单一主 manifest。多语言与多框架可共存；`status` 中 `Languages` 与 `Frameworks` 分类输出。
- **支持面**：内置 JavaScript/TypeScript、Java、Python、Go、Rust、Ruby、Kotlin、Swift、PHP、Scala、Dart、Lua、Shell、SQL、Markdown 和常见配置格式的抽取器，并有文本普查兜底。空文件或无符号文件仍进入 `file_states`，避免增量漂移误判。
- **隐藏目录过滤**：`.` 开头目录不作为项目源码遍历，避免把编辑器、缓存、快照或 vendored bundle 当作业务代码。`.github/workflows` 这类识别目标由技术栈识别规则处理，不代表 `.github` 一般业务文件会被纳入文件图谱。
- **前向引用**：生成的 `ref:*` 目标允许悬空，用来表达静态扫描发现的对外引用意图；这不是数据库完整性错误。
- **性能特征**：为保证大仓确定性，当前实现使用顺序流式扫描，不启用不可靠的并行 worker；十万级文件的仓库可能耗时数分钟。
- **Node 提示**：Node.js 当前会输出 `ExperimentalWarning: SQLite ...`。这是 CLI 使用的内置 SQLite 实验特性提示，出现于 stderr 不代表扫描失败。
- **Skills 对接**：Codex Skills 内的 `PROJECT INDEX HINT` 允许 AI 在 `.r2mo/repo/self/` 已有索引时调用 `locate`、`expand` 或 `status` 投影；Skill 不会隐式执行 `scan` 或 `update`，更新仍由用户显式触发。

## 命令执行记录

以下记录来自一个小型 Express/FastAPI 双栈 fixture，终端颜色控制符已去除，输出内容保持原语义。

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/tmp/mxt-coder-docs-demo.TsQc11"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" coder
[MXT AI] Scanning /private/tmp/mxt-coder-docs-demo.TsQc11 ...
(node:74176) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
[MXT AI] Scan complete in 0.04s.
[MXT AI] Files: 6  Nodes: 14  Edges: 8  Chunks: 8
[MXT AI] Repo namespace ignored: .r2mo/repo/
$ echo $?
0

$ node "$REPO/src/mxt.js" coder status
[MXT AI]  Indexed at: 2026-10-08T15:11:41.932Z
[MXT AI]  Files: 6  Nodes: 14  Edges: 8  Chunks: 8
[MXT AI]  Branch: main
[MXT AI] Languages:
  javascript     6
  python         2
  markdown       2
  json           2
  text           1
  unknown        1
[MXT AI] Frameworks:
  Express            1
  FastAPI            1
[MXT AI]  Drift: 0 files (clean)

$ node "$REPO/src/mxt.js" coder update
[MXT AI] Up to date. Nothing to incrementally update.

$ node "$REPO/src/mxt.js" coder locate "inventory reconciliation route"

# /mcode Result — inventory reconciliation route [main]

## Entry Points
- `README.md`  (FILE)  README.md
- `python/reconcile_inventory.py`  (FILE)  reconcile_inventory.py
- `src/server.js`  (FILE)  server.js
- `package.json`  (FILE)  package.json
- `src/server.js`  (FUNCTION)  startInventoryServer
- `src/routes/inventory.js`  (FILE)  inventory.js

## Related Graph Neighbourhood
- DOC_ANCHOR: Inventory Service  `doc:README.md:L3`  → README.md
- FUNCTION: reconcile_inventory  `fn:python/reconcile_inventory.py:reconcile_inventory`  → python/reconcile_inventory.py
- FUNCTION: lookupInventory  `fn:src/routes/inventory.js:lookupInventory`  → src/routes/inventory.js
- PROJECT: Express  `fw:package.json:express`  → package.json
- ROUTE: GET /:id  `rt:src/routes/inventory.js:L8:/:id`  → src/routes/inventory.js
- SCRIPT: start  `scr:package.json:start`  → package.json

## Suggested Reading Order
1. `README.md`
2. `python/reconcile_inventory.py`
3. `src/server.js`
4. `package.json`
5. `src/server.js`

$ node "$REPO/src/mxt.js" coder expand "rt:src/routes/inventory.js:L8:/:id"
[MXT AI] Store: self
[MXT AI] Node:  rt:src/routes/inventory.js:L8:/:id  (ROUTE)  GET /:id
[MXT AI] File:  src/routes/inventory.js:8
[MXT AI]
[MXT AI] Direct Relations:
  ← FILE  inventory.js  `f:src/routes/inventory.js`
[MXT AI]
[MXT AI] Recommended Closure:
  FILE: inventory.js  `f:src/routes/inventory.js`  → src/routes/inventory.js
  FUNCTION: lookupInventory  `fn:src/routes/inventory.js:lookupInventory`  → src/routes/inventory.js
  FUNCTION: summarizeInventory  `fn:src/routes/inventory.js:summarizeInventory`  → src/routes/inventory.js
$ echo $?
0
```
