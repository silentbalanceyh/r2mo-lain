---
description: "拉起当前项目环境：后端优先→前端并行→网络验证"
argument-hint: ""
---

# /mxt:start

拉起当前项目开发环境：后端优先启动，前端并行启动，启动后网络健康验证。

The user invoked this command with: $ARGUMENTS

## 参数解析

本命令无参数。直接执行环境拉起流程。

**硬规则**：必须参考 mdc 规则 | 后端先于前端 | 启动后必须网络验证 | 已启动→先停止再编译再启动

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. **后端检测与启动**：
   - 从 mdc 规则中检索后端启动命令（如 `./dev-build.sh`、`./dev-start.sh`、`mvn spring-boot:run` 等）。
   - 基于启动命令特征检测后端进程是否已启动：
     - 若已启动，先执行停止操作（`./dev-stop.sh` 或对应停止命令）。
   - 编译后端最新版。
   - 拉起后端环境。
3. **前端检测与启动**：
   - 从 mdc 规则中检索前端启动命令（如 `npm run dev`、`npm start`、前端 `dev-start.sh` 等）。
   - 检测前端项目目录是否存在（`frontend/`、`web/`、`ui/`、`app-*/` 等子目录）。
   - 若存在前端项目：
     - 检测前端进程是否已启动，若已启动则先停止。
     - 并行拉起前端环境（不阻塞后端已启动的服务）。
   - 若不存在前端项目，跳过此步骤。
4. **多应用工作区**（如 HarmonyOS 多 app 项目）：
   - 若 mdc 规则或项目结构表明是多应用工作区，识别需要启动的子应用列表。
   - 按 mdc 规则中定义的依赖顺序或逐一拉起各子应用。
5. **启动后网络健康验证**：
   - 根据 mdc 规则提取后端端口和健康检查路径（如 `http://localhost:8080/health`、`http://localhost:3000`）。
   - 对后端服务执行 HTTP 健康检查（`curl -sf` 或 `wget -q`），最多重试 5 次，间隔 3 秒。
   - 若前端已启动，对前端执行 HTTP 可达性检查。
   - 验证失败时输出失败的服务和端点信息，不自动终止——提示用户排查。

## Verification

完成后报告：
- 后端启动命令、编译结果、运行状态、健康检查结果（端口 + 响应状态）
- 前端启动命令、运行状态、可达性检查结果
- 各服务的访问地址

## 闭环指引

Start 完成后的典型路径：
- 开发调试 → `/mxt:debug <描述>`
- 执行任务 → `/mxt:run <编号>`
- 同步项目 → `/mxt:sync`
