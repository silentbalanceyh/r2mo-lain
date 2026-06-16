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

**硬规则**：后端优先→前端并行 | 已启动→先停止再编译再启动 | 启动后必须网络验证 | 验证失败→报告错误

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. **提取项目 mdc 启停规则（核心强化）**：在所有 mdc 文件中搜索启停相关规则，必须提取以下信息并严格执行：
   - 启动命令：`dev-start`、`npm run dev`、`mvn spring-boot:run` 等脚本路径与参数
   - 停止命令：`dev-stop`、`kill` 等脚本路径与参数
   - 编译命令：`dev-build`、`mvn compile`、`npm run build` 等脚本路径与参数
   - 端口配置：后端端口、前端端口、健康检查端口
   - 健康检查端点：`/health`、`/actuator/health`、`/api/ping` 等 URL
   - 依赖顺序：是否需要先启某个服务再启另一个（如先启后端再启前端）
   - 环境变量：启动前是否需要设置特定环境变量
   - **若项目 mdc 中定义了启停规则，必须以 mdc 规则为准，不使用默认推断值**
   - **若项目 mdc 中未定义启停规则，才使用下文 Plan 中的默认推断逻辑**

## Plan

### Phase 1 — 后端检查与启动

1. 检测后端进程是否已启动（基于 mdc 中的启动命令特征，如 `pgrep -f "dev-start.sh"` 或端口检测）：
   - 若已启动，先执行停止操作（`./dev-stop.sh` 或对应停止命令）。
   - 若未启动，继续下一步。
2. 编译后端（执行 `./dev-build.sh` 或对应构建命令）。
3. 拉起后端（执行 `./dev-start.sh` 或对应启动命令）。
4. 等待后端就绪：轮询后端健康检查端点（从 mdc 提取，默认 `http://localhost:<port>/health` 或 `http://localhost:<port>/actuator/health`），最多等待 60 秒。
   - 若后端未就绪，报告错误并终止，不继续前端启动。

### Phase 2 — 前端检查与启动

1. 检测前端项目目录：
   - 若当前仓库含 `app-center/`、`entry/` 等 HarmonyOS 多应用结构 → 识别为多前端工作区，默认启动 `app-center`。
   - 若含 `frontend/`、`web/`、`client/` 目录 → 识别为标准前后端分离项目。
   - 若无独立前端目录 → 跳过前端启动。
2. 检测前端进程是否已启动：
   - 若已启动，先停止。
   - 若未启动，继续下一步。
3. 进入前端目录，安装依赖（如 `npm install`，仅当 `node_modules` 缺失时）。
4. 拉起前端（执行 `npm run dev` 或 mdc 中提取的前端启动命令）。

### Phase 3 — 网络健康验证

1. 后端验证：`curl -sf http://localhost:<port>/health` 或从 mdc 提取的健康端点。
   - 若返回 2xx → 后端 OK。
   - 若无响应或非 2xx → 后端 FAIL，报告错误详情。
2. 前端验证：`curl -sf http://localhost:<port>/` 或从 mdc 提取的前端访问地址。
   - 若返回 2xx → 前端 OK。
   - 若无响应 → 前端 FAIL（可能需要更多启动时间，报告警告而非终止）。
3. 输出验证汇总表：

| 服务 | 地址 | 状态 |
|------|------|------|
| 后端 | http://localhost:xxxx | OK/FAIL |
| 前端 | http://localhost:xxxx | OK/FAIL/WARN |

## Commands

### 后端
1. 读取 `.mdc` 规则文件中 `dev-start` / `dev-build` / `dev-stop` 相关命令
2. `pgrep -f "dev-start.sh"` — 检测后端进程
3. `./dev-stop.sh` — 停止后端（如已运行）
4. `./dev-build.sh` — 编译后端
5. `./dev-start.sh` — 启动后端
6. `curl -sf http://localhost:<port>/health` — 后端健康检查

### 前端
1. 检测前端目录：`ls -d app-center frontend web client 2>/dev/null`
2. `pgrep -f "npm run dev"` — 检测前端进程
3. `cd <frontend-dir> && npm run dev` — 启动前端
4. `curl -sf http://localhost:<port>/` — 前端访问验证

### 验证
1. `curl -sf <health-endpoint>` — 后端网络验证
2. `curl -sf <frontend-url>` — 前端网络验证

## Verification

完成后输出启动汇总：
- 后端：启动命令、编译结果、健康检查状态
- 前端：启动命令、运行状态、访问地址
- 网络：各端点可达性验证结果
- 若任何验证失败，明确标注 FAIL 并给出排查建议

## Summary

报告项目启动命令、编译结果、前后端运行状态和网络验证结果。

## Next Steps

Start 完成后的典型路径：
- 开发调试 → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
- 执行任务 → `/mxt-run <编号>` 或 `$mxt-run <编号>`
- 同步项目 → `/mxt-sync` 或 `$mxt-sync`
