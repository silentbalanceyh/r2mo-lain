---
description: "Start dev environment: backend first → frontend parallel → network health check."
argument-hint: ""
---

# /mxt:start

## Harness

This Harness is the binding execution contract for this MXT command across Claude Code, Codex, and OpenCode. Treat localized sections below as legacy detail; this section wins when wording conflicts.

- English-first: write instructions, analysis, verification notes, and summaries in English by default. Use Chinese only when quoting existing repository content, preserving task titles/frontmatter/status values, showing exact localized command errors already required by this file, or when the user explicitly asks for Chinese.
- Rule loading: before task action, load repository entry rules (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`), project rule files (`.claude/rules`, `.codex/rules`, `.cursor/rules`, `.opencode`, other relevant `.mdc`), and `~/.codex/rules/r2mo-task-workflow.md` when present. Missing optional files do not block execution.
- Argument contract: resolve the explicit three-digit number first. If absent, list current-directory `.r2mo/task/` candidates only. Never resolve from parent, child, sibling, or historical timestamped task directories unless the user names that path.
- Task isolation lock: after resolving paths, print the locked path(s) before reading task content, and only read/write those locked `task-*.md`, `goon-*.md`, or `loop-*.json` files for this invocation.
- Disk source of truth: Do not trust conversation memory, previous summaries, installed plugin cache, or earlier reads. Re-read the locked files from disk immediately before decisions and again before write-back.
- Prompt echo: before editing, verification, or task execution, print the final action prompt in one Markdown code block with concrete paths substituted.
- Write-back guard: before any write, verify the destination exactly matches the isolation lock. Never duplicate `Plan` or `Changes`; update in place or append under the existing canonical section as instructed.
- Fresh evidence before completion claims: run the smallest sufficient verification for the changed boundary, read the output, and only then report success. Record skipped gates with the reason.
- Cross-agent portability: avoid tool-specific assumptions unless the platform section explicitly requires them. Keep prompts deterministic and safe for Claude Code, Codex skills, Codex prompts, and OpenCode JSON command templates.

拉起当前项目开发环境：后端优先启动，前端并行启动，启动后网络健康验证。

The user invoked this command with: $ARGUMENTS

## 参数解析

本命令无参数。直接执行环境拉起流程。

**硬规则**：必须扫描项目 mdc 启停规则并优先执行 | 幂等保证：停→编→启三步原子 | 后端先于前端 | 启动后必须网络验证 | 自检防漂移 | 已启动→先停止再编译再启动

## Mdc Scan Protocol

在执行任何启停操作前，必须完成以下 mdc 扫描：

1. 扫描路径（按顺序，全部扫描，不跳过）：
   - `.claude/rules/*.mdc`
   - `.codex/rules/*.mdc`
   - `.cursor/rules/*.mdc`
   - `.opencode/*.mdc`
   - 项目根目录及子目录中的其他 `.mdc` 文件
   - `~/.codex/rules/r2mo-task-workflow.md`（若存在）
2. 搜索关键字：`dev-start`、`dev-stop`、`dev-build`、`npm run`、`mvn`、`spring-boot:run`、`vertx`、`hap`、`hvigor`、`start`、`stop`、`launch`、`serve`、`port`、`health`
3. 提取规则：
   - 启动命令及参数
   - 停止命令及参数
   - 编译命令及参数
   - 端口配置
   - 健康检查端点
   - 依赖顺序
   - 环境变量要求
4. **mdc 中定义的启停命令优先于通用推断**。若 mdc 中无启停规则 → 使用通用推断逻辑。

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件。
2. 执行 Mdc Scan Protocol，提取启停规则摘要。
3. **后端检测与启动（幂等保证）**：
   - 检测后端进程是否已启动：
     - 若已启动 → 执行停止（`./dev-stop.sh` 或 mdc 中的停止命令）→ 确认进程已完全退出 → 编译 → 启动。
     - 若未启动 → 编译 → 启动。
   - **编译失败 → 终止，不启动后端**。
   - **启动后等待就绪**：轮询健康检查端点，最多 60 秒。后端未就绪 → 报告错误，不启动前端。
4. **前端检测与启动**：
   - 检测前端项目目录是否存在（`frontend/`、`web/`、`ui/`、`app-*/` 等子目录）。
   - 若存在前端项目：
     - 检测前端进程是否已启动，若已启动则先停止。
     - 并行拉起前端环境（不阻塞后端已启动的服务）。
   - 若不存在前端项目，跳过此步骤。
5. **多应用工作区**（如 HarmonyOS 多 app 项目）：
   - 若 mdc 规则或项目结构表明是多应用工作区，识别需要启动的子应用列表。
   - 按 mdc 规则中定义的依赖顺序或逐一拉起各子应用。
6. **启动后网络健康验证**：
   - 对后端服务执行 HTTP 健康检查（`curl -sf`），最多重试 5 次，间隔 3 秒。
   - 若前端已启动，对前端执行 HTTP 可达性检查。
   - 验证失败时输出失败的服务和端点信息。
7. **自检防漂移**：
   - 核对实际执行的命令是否与 mdc 规则一致。
   - 若执行了通用推断命令但 mdc 中有对应规则 → 报告漂移警告。

## Verification

完成后报告：
- mdc 扫描结果（找到/未找到启停规则）
- 后端启动命令、编译结果、运行状态、健康检查结果
- 前端启动命令、运行状态、可达性检查结果
- 自检结果（mdc 一致性/漂移警告）

## 闭环指引

Start 完成后的典型路径：
- 开发调试 → `/mxt:debug <描述>`
- 执行任务 → `/mxt:run <编号>`
- 同步项目 → `/mxt:sync`
