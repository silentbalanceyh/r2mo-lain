---
description: "Closed-loop task workflow: RUN → VERIFY → END → GOON → VERIFY → END_REVIEW cycle with remediation loop and checkpoint resume."
argument-hint: "<task-number>"
---

# /mxt:loop — Scoped Task Loop

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

执行 `RUN → VERIFY → END → [GOON → VERIFY → END_REVIEW]`，仅在审查产生整改项时进入修复循环。调用参数：`$ARGUMENTS`。

## 不可变契约

- 锁定且只读写 `.r2mo/task/task-NNN.md`、`goon-NNN.md`、`loop-NNN.json`。
- RUN/GOON 是执行者；END/END_REVIEW 是独立审查者，不允许自审。
- 整改项用 `grep -c '^## 整改项 [0-9]\+ —'` 机械计数；归零立即结束。
- 每阶段更新状态文件，保留断点恢复、角色调用记录、规则清单和验证证据。
- RUN 只发现一次适用规则并保存到 `mdcFiles`；后续阶段直接复用，不重复 find/grep。
- 默认禁止全 workspace、K8S、BUGS、Chat、热启动稳定性和 `agent-gate.sh all`。仅任务范围、发布验收或用户显式要求时选择。

## 状态文件

`.r2mo/task/loop-NNN.json` 至少保存：`phase`、`loop`、`mdcFiles`、`filesChanged`、`codeFingerprint`、`verification`、`goonItemCount`、`agentCalls`、`lastCheckpoint`。

恢复时先读状态。已完成 RUN 且代码指纹未变化时，END 复用 RUN 的验证结果；GOON 修改代码后使缓存失效，只验证受影响范围。

## Phase 1 — RUN

1. 锁定任务路径，读取任务正文和仓库入口规则。
2. 一次性发现并按任务 scope 选择相关规则，将路径保存至 `mdcFiles`；禁止后续重新发现。
3. 执行者单次实现任务，记录变更文件和代码指纹。
4. 按以下优先级选择最小充分验证：
   1. 真实运行环境、进程归属、监听端口和业务健康路径；
   2. owning submodule 的针对性测试；
   3. 任务要求的 source guard、lint、compile。
5. 记录命令、结果、适用范围和指纹，进入 END。

## Phase 2 — END

1. 使用不同审查者，读取状态中的 `mdcFiles`，不得重新扫描规则。
2. 若代码指纹与 RUN 相同，复用已通过验证；只补做审查特有检查。
3. 对照任务、diff 和证据独立审查。
4. 无问题时将 goon 写为 `status: Done`、`item_count: 0` 并立即结束；有问题时仅写当前整改项，进入 GOON。

## Phase 3 — GOON / END_REVIEW

1. 执行者只修复当前 goon 项，更新代码指纹。
2. 只重跑受影响的运行验证、针对性测试和必要质量门，不重跑无关全量门。
3. 独立审查者复核修复，移除已解决项并机械计数。
4. 计数为零立即结束；仍有项则继续。连续两轮无减少时标记 Blocked/WONTFIX，停止无意义 Agent 重试。

## 完成与写回

闭环完成后 task 为 Done，goon 为 Done/Closed，loop phase 为 DONE。Changes 必须列出变更文件、真实运行验证、针对性测试、必要静态门及跳过重型门禁的范围理由。
