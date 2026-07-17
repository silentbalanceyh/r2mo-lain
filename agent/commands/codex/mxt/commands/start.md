---
description: "Start dev environment: backend first → frontend parallel → network health check."
argument-hint: ""
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-start

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

## Arguments

The user invoked this command with: $ARGUMENTS

本命令无参数。直接执行环境拉起流程。

**硬规则**：项目 mdc 启停规则优先于默认推断 | 后端优先→前端 | 已启动→先停止再编译再启动 | 启动后必做网络验证 | 幂等执行（中途失败不残留半启动状态）

## Preflight — MDC 启停规则扫描协议

1. 读取并遵守 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在）及引用的规则文件；读取 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. **扫描项目 mdc 启停规则**（强制步骤，不可跳过）：
   - 扫描路径：`.claude/rules/*.mdc`、`.codex/rules/*.mdc`、`.cursor/rules/*.mdc`、`.opencode/*.mdc` 及项目内任意 `.mdc` 文件。
   - 搜索关键词：`dev-start`、`dev-stop`、`dev-build`、`start`、`stop`、`launch`、`serve`、`run dev`、`npm run`、`mvn`、`spring-boot`、`vertx`、`hap`、`hvigor`、`health`、`port`、`env`、`环境变量`。
   - 提取信息：启动命令、停止命令、构建命令、端口配置、健康检查端点、依赖顺序、环境变量。
   - **mdc 中定义了启停命令 → 必须按 mdc 执行，不使用默认推断。**
   - **mdc 中无启停规则 → 使用下方默认推断逻辑。**
3. 输出提取到的启停规则摘要。

## Plan

### Phase 1 — 后端：停止→编译→启动（幂等）

1. **停止**：检测后端进程是否已运行（`pgrep -f "dev-start.sh"` 或 mdc 中提取的命令特征）：
   - 若已运行 → 执行停止命令（`./dev-stop.sh` 或 mdc 中定义的停止命令）。
   - 若停止失败 → **记录错误但不终止**，尝试继续编译（进程可能已僵死）。
   - 若未运行 → 继续。
2. **编译**：执行构建命令（`./dev-build.sh`、`mvn compile` 或 mdc 中定义的构建命令）。
   - 若编译失败 → **终止流程，不启动后端**，报告编译错误。
3. **启动**：执行启动命令（`./dev-start.sh`、`mvn spring-boot:run` 或 mdc 中定义的启动命令）。
   - 后台启动，不阻塞终端。
4. **后端就绪等待**：轮询健康检查端点（从 mdc 提取，默认 `http://localhost:<port>/health` 或 `http://localhost:<port>/actuator/health`），最多等待 60 秒（3 秒间隔）。
   - 若后端未就绪 → **报告错误并终止，不继续前端启动**。

### Phase 2 — 前端：停止→启动（幂等）

1. 检测前端项目目录：
   - HarmonyOS 多应用结构（`app-center/` + `app-*/`）→ 默认启动 `app-center`。
   - 标准前后端分离（`frontend/`、`web/`、`client/`）→ 启动对应目录。
   - 无独立前端目录 → 跳过前端启动。
2. **停止**：检测前端进程是否已运行（`pgrep -f "npm.*dev"` 或 mdc 中提取的命令特征）：
   - 若已运行 → 先停止。
   - 若未运行 → 继续。
3. 安装依赖（仅当 `node_modules` 缺失时：`npm install` 或 `pnpm install`）。
4. **启动**：执行前端启动命令（`npm run dev` 或 mdc 中定义的前端启动命令）。

### Phase 3 — 网络健康验证

1. **后端验证**：`curl -sf http://localhost:<port>/health` 或 mdc 提取的健康端点。
   - 返回 2xx → 后端 OK。
   - 无响应或非 2xx → 后端 FAIL，报告错误详情。
2. **前端验证**：`curl -sf http://localhost:<port>/` 或 mdc 提取的前端访问地址。
   - 返回 2xx → 前端 OK。
   - 无响应 → 前端 WARN（可能需要更多启动时间）。
3. 输出验证汇总表：

| 服务 | 地址 | 状态 |
|------|------|------|
| 后端 | http://localhost:xxxx | OK/FAIL |
| 前端 | http://localhost:xxxx | OK/FAIL/WARN |

### Phase 4 — 自检闭环（防漂移）

1. 对比实际执行的启动命令与 mdc 中定义的启停规则：
   - 若实际执行的命令与 mdc 定义不一致 → **输出警告**，标注差异项。
   - 若实际执行的命令与 mdc 定义一致 → 确认对齐。
2. 检查是否有遗漏的启停相关 mdc 规则未被执行：
   - 重新扫描 mdc 中是否包含未被提取到的启停关键字。
   - 若发现遗漏 → **输出警告**，标注遗漏规则。

## Commands

1. 读取 `.mdc` 规则文件中启停相关命令配置
2. `pgrep -f "dev-start.sh"` — 检测后端进程
3. `./dev-stop.sh` — 停止后端（如已运行）
4. `./dev-build.sh` — 编译后端
5. `./dev-start.sh` — 启动后端
6. `curl -sf http://localhost:<port>/health` — 后端健康检查
7. 检测前端目录：`ls -d app-center frontend web client 2>/dev/null`
8. `pgrep -f "npm run dev"` — 检测前端进程
9. `cd <frontend-dir> && npm run dev` — 启动前端
10. `curl -sf http://localhost:<port>/` — 前端访问验证
11. 对比实际执行命令与 mdc 规则 — 自检闭环

## Verification

完成后输出启动汇总：
- mdc 启停规则提取结果（找到/未找到，提取到的命令清单）
- 后端：启动命令、编译结果、健康检查状态
- 前端：启动命令、运行状态、访问地址
- 网络：各端点可达性验证结果
- 自检：实际执行命令与 mdc 规则的对齐状态
- 若任何验证失败，明确标注 FAIL 并给出排查建议

## Summary

报告 mdc 启停规则提取结果、项目启动命令、编译结果、前后端运行状态、网络验证结果和自检对齐状态。

## Next Steps

Start 完成后的典型路径：
- 开发调试 → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`
- 执行任务 → `/mxt-run <编号>` 或 `$mxt-run <编号>`
- 同步项目 → `/mxt-sync` 或 `$mxt-sync`
