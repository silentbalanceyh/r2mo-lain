---
description: "拉起当前项目环境：后端优先→前端并行→网络验证，已启动则重启编译后拉起"
argument-hint: ""
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-start

拉起当前项目开发环境：后端优先检查与启动，前端并行拉起，启动后网络健康验证。

## Arguments

The user invoked this command with: $ARGUMENTS

本命令无参数。直接执行环境拉起流程。

**硬规则**：后端优先→前端并行 | 已启动→先停止再编译再启动 | 启动后必须网络验证 | 验证失败→报告错误 | mdc 启停规则优先于默认推断 | 幂等保障：停止必须成功才能继续

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。

2. **MDC 启停规则扫描协议（强制，不可跳过）**：

   **扫描范围**（按优先级顺序）：
   - `.claude/rules/*.mdc` → `.codex/rules/*.mdc` → `.cursor/rules/*.mdc` → `.opencode/*.mdc`
   - 项目根目录及子目录中所有 `.mdc` 文件
   - `AGENTS.md`、`CLAUDE.md`、`CODEX.md` 中引用的规则文件

   **搜索关键字**（任一匹配即提取）：
   - 启动：`dev-start`、`npm run dev`、`npm start`、`mvn spring-boot:run`、`vertx`、`hvigor`、`hap`、`serve`、`launch`
   - 停止：`dev-stop`、`stop`、`shutdown`、`kill`
   - 编译：`dev-build`、`npm run build`、`mvn compile`、`mvn package`、`hvigor build`
   - 端口：`port`、`localhost:`、`0.0.0.0:`
   - 健康：`health`、`actuator`、`ping`、`readiness`
   - 顺序：`先启`、`后启`、`依赖`、`depends on`、`before`、`after`

   **提取规则**：
   - 启动命令路径与参数
   - 停止命令路径与参数
   - 编译命令路径与参数
   - 端口配置（后端端口、前端端口）
   - 健康检查端点 URL
   - 启动依赖顺序
   - 环境变量要求

   **执行策略**：
   - 若 mdc 定义了启停规则 → **必须按 mdc 执行**，不使用默认推断值
   - 若 mdc 未定义启停规则 → 使用 Plan 中的默认推断逻辑
   - 将提取结果输出为启停规则摘要表，作为后续所有步骤的输入

## Plan

### Phase 1 — 后端检查与启动（幂等）

1. **停止后端**（若已运行）：
   - 基于启停规则摘要中的启动命令特征检测进程（如 `pgrep -f "dev-start.sh"` 或端口 `lsof -i :<port>`）
   - 若已运行 → 执行停止命令（mdc 定义 or `./dev-stop.sh`）
   - **幂等保障**：停止命令执行后，再次检测进程是否已消失；若未消失 → 报告错误并终止，不继续编译启动
   - 若未运行 → 继续

2. **编译后端**：执行编译命令（mdc 定义 or `./dev-build.sh`）
   - 编译失败 → 报告错误并终止

3. **启动后端**：执行启动命令（mdc 定义 or `./dev-start.sh`）

4. **后端就绪验证**：
   - 轮询健康检查端点（mdc 定义 or `http://localhost:<port>/health`），最多等待 60 秒（3 秒间隔）
   - 后端未就绪 → 报告错误并终止，**不继续前端启动**

### Phase 2 — 前端检查与启动（并行）

1. **检测前端项目目录**：
   - 若当前仓库含 `app-center/`、`entry/` 等 HarmonyOS 多应用结构 → 识别为多前端工作区，默认启动 `app-center`
   - 若含 `frontend/`、`web/`、`client/` 目录 → 识别为标准前后端分离项目
   - 若无独立前端目录 → 跳过前端启动

2. **停止前端**（若已运行）：
   - 检测前端进程（如 `pgrep -f "vite"` 或 `pgrep -f "npm.*dev"`）
   - 若已运行 → 停止；未运行 → 继续

3. **安装前端依赖**（仅当 `node_modules` 缺失或 `package-lock` 变更时）

4. **启动前端**：执行前端启动命令（mdc 定义 or `npm run dev`）

### Phase 3 — 网络健康验证

1. 后端验证：`curl -sf http://localhost:<port>/health` 或 mdc 提取的健康端点
   - 2xx → 后端 OK
   - 无响应或非 2xx → 后端 FAIL，报告错误详情

2. 前端验证：`curl -sf http://localhost:<port>/` 或 mdc 提取的前端访问地址
   - 2xx → 前端 OK
   - 无响应 → 前端 WARN（可能需要更多启动时间，报告警告而非终止）

3. **闭合自检**：对比实际执行的启停命令与 mdc 规则是否一致
   - 若使用了默认推断而非 mdc 规则 → 报告提示"当前项目 mdc 未定义启停规则，使用了默认推断"
   - 若 mdc 规则与实际执行不一致 → 报告漂移警告

4. 输出验证汇总表：

| 服务 | 地址 | 状态 | 规则来源 |
|------|------|------|---------|
| 后端 | http://localhost:xxxx | OK/FAIL | mdc:xxx / 默认推断 |
| 前端 | http://localhost:xxxx | OK/FAIL/WARN | mdc:xxx / 默认推断 |

## Commands

### 后端
1. 读取 `.mdc` 规则文件中启停相关命令 — `grep -r "dev-start\|dev-stop\|dev-build\|port\|health" .claude/rules/ .codex/rules/ .cursor/rules/ .opencode/ --include="*.mdc"`
2. `pgrep -f "dev-start.sh"` 或 `lsof -i :<port>` — 检测后端进程
3. `./dev-stop.sh` — 停止后端（如已运行）；停止后再次 `pgrep` 确认
4. `./dev-build.sh` — 编译后端
5. `./dev-start.sh` — 启动后端
6. `curl -sf http://localhost:<port>/health` — 后端健康检查

### 前端
1. 检测前端目录：`ls -d app-center frontend web client 2>/dev/null`
2. `pgrep -f "npm run dev"` 或 `pgrep -f "vite"` — 检测前端进程
3. `cd <frontend-dir> && npm run dev` — 启动前端
4. `curl -sf http://localhost:<port>/` — 前端访问验证

### 闭合自检
1. 对比实际命令与 mdc 规则 — 确认无漂移
2. 输出规则来源标注

## Verification

完成后输出启动汇总：
- 后端：启动命令、编译结果、健康检查状态、规则来源
- 前端：启动命令、运行状态、访问地址、规则来源
- 网络：各端点可达性验证结果
- 闭合：mdc 规则一致性自检结果
- 若任何验证失败，明确标注 FAIL 并给出排查建议

## Summary

报告项目启动命令、编译结果、前后端运行状态、网络验证结果和 mdc 规则一致性。

## Next Steps

Start 完成后的典型路径：
- 开发调试 → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
- 执行任务 → `/mxt-run <编号>` 或 `$mxt-run <编号>`
- 同步项目 → `/mxt-sync` 或 `$mxt-sync`
