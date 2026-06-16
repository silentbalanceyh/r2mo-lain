---
description: "拉起当前项目环境：后端优先→前端并行→网络验证"
argument-hint: ""
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-start

拉起当前项目开发环境：先启后端再启前端，启动后通过网络访问验证健康状态。

## Arguments

The user invoked this command with: $ARGUMENTS

本命令无参数。直接执行环境拉起流程。

**硬规则**：必须参考项目 mdc 启停规则 | mdc 中的启停命令优先于默认推断 | 后端优先→前端 | 已启动→先停止再编译再启动 | 启动后必做网络验证 | 确保 starter 稳定性

## Preflight — 项目 mdc 启停规则扫描

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. **从 mdc 中提取启停规则**（此步骤为强制，不可跳过）：
   - 搜索 mdc 文件中包含 `dev-start`、`dev-build`、`dev-stop`、`npm run`、`mvn`、`spring-boot`、`vertx`、`start`、`stop`、`build`、`health`、`port` 等关键词的段落。
   - 提取并记录：启动命令、停止命令、构建命令、端口配置、健康检查端点、启动顺序约束、环境变量要求。
   - 若 mdc 中定义了启停命令 → **必须按 mdc 执行**，不使用默认推断。
   - 若 mdc 中无启停相关规则 → 使用默认推断逻辑（`./dev-build.sh` / `./dev-start.sh` / `./dev-stop.sh`）。
3. 输出提取到的启停规则摘要，供后续步骤使用。

## Plan — 后端优先启动

**第一步：检测项目结构**

从 mdc 规则和目录结构判断项目类型：

| 目录特征 | 项目类型 | 启动策略 |
|---------|---------|---------|
| `app-center/` + `app-*/` | HarmonyOS 多应用 | 先启动中心应用后端，再启动前端 |
| `pom.xml` + `src/main/` | Spring/Java 后端 | 仅后端 |
| `package.json` + 无后端 | 纯前端 | 仅前端 |
| 顶层 `pom.xml` + 子目录 `package.json` | 前后端分离 | 先启后端再启前端 |
| `dev-build.sh` / `dev-start.sh` | 脚本驱动 | 按脚本逻辑 |

**第二步：后端启动**

1. 检测后端进程是否已运行（基于 mdc 中的启动命令特征）：
   - 若已运行 → 先停止（`./dev-stop.sh` 或对应命令）
   - 若未运行 → 继续
2. 编译后端（`./dev-build.sh`、`mvn compile` 或对应命令）
3. 启动后端（`./dev-start.sh`、`mvn spring-boot:run` 或对应命令）
4. **后端网络验证**：向后端健康检查端点发 HTTP 请求确认服务可用
   - 常见端点：`http://localhost:8080/actuator/health`、`http://localhost:8080/api/health`、`http://localhost:<port>/`
   - 验证方式：`curl -sf <health-url>` 或 `wget -qO- <health-url>`
   - 若验证失败 → 报告错误，不继续前端启动

**第三步：前端启动**

1. 检测前端进程是否已运行（`node`、`npm`、`vite` 等进程特征）：
   - 若已运行 → 先停止
   - 若未运行 → 继续
2. 安装前端依赖（`npm install` 或 `pnpm install`，仅当 `node_modules` 不存在或 `package-lock` 变更时）
3. 启动前端（`npm run dev`、`pnpm dev` 或对应命令）
4. **前端网络验证**：向前端开发服务器发 HTTP 请求确认服务可用
   - 常见地址：`http://localhost:5173`、`http://localhost:3000`、`http://localhost:8081`
   - 验证方式：`curl -sf <frontend-url>` 或 `wget -qO- <frontend-url>`
   - 若验证失败 → 报告错误

**第四步：汇总报告**

汇总后端和前端的状态：
- ✅ 后端: `<health-url>` 响应正常
- ✅ 前端: `<frontend-url>` 响应正常
- 或对应错误信息

## Commands

1. 读取 `.mdc` 规则文件中的启动命令配置
2. 检测后端进程 — `pgrep -f "dev-start.sh"` 或从 mdc 中提取的关键字
3. `./dev-stop.sh` — 停止（如已运行）
4. `./dev-build.sh` — 编译后端
5. `./dev-start.sh` — 启动后端
6. `curl -sf http://localhost:8080/actuator/health` — 验证后端
7. 检测前端进程 — `pgrep -f "vite"` 或 `pgrep -f "npm.*dev"`
8. 停止前端（如已运行）
9. `npm run dev` 或 `pnpm dev` — 启动前端
10. `curl -sf http://localhost:5173` — 验证前端

## Verification

完成后说明：
- 后端启动命令、编译结果、健康检查结果
- 前端启动命令、健康检查结果
- 若任一层验证失败，明确标注失败原因

## Summary

报告后端和前端的启动命令、编译结果、网络验证结果。

## Next Steps

Start 完成后的典型路径：
- 开发调试 → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
- 执行任务 → `/mxt-run <编号>` 或 `$mxt-run <编号>`
- 同步项目 → `/mxt-sync` 或 `$mxt-sync`
