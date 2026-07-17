---
name: mxt-debug
description: Use when the user asks Codex to debug a bug or error, such as "$mxt-debug login fails" or "mxt-debug null pointer in UserService"; detects superpowers for systematic diagnosis or falls back to manual root-cause analysis.
---

# MXT Debug

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

Launch a BUG investigation flow: detect superpowers for systematic diagnosis, or fall back to manual root-cause analysis.

## Arguments

The user must provide a bug description and a three-digit task/remediation number, such as `$mxt-debug 001 login fails` or `$mxt-debug 002 null pointer in UserService`.

If the number is missing, ask the user for the number before writing any files. If the description is missing, ask the user to describe the bug they want to investigate.

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Parse `$ARGUMENTS`: extract the first three-digit number as `<编号>`, set `<GOON_PATH>` to `.r2mo/task/goon-<编号>.md`, and use the remaining text as the BUG description.
3. Declare the investigation target: BUG diagnosis, description is the parsed BUG description.
3. Detect whether `superpowers:systematic-debugging` skill exists in the current environment:
   - If it exists, invoke `superpowers:systematic-debugging` skill, passing `$ARGUMENTS` as the BUG description, and follow its workflow for systematic diagnosis.
   - If it does not exist, execute the following fallback investigation flow:
     a. Collect error information: read files, logs, or stack traces mentioned in `$ARGUMENTS`.
     b. Locate related files: search the current repository for modules, functions, or configuration related to the error.
     c. Analyze root cause: infer the fundamental cause based on code logic and error symptoms.
     d. Provide fix suggestions: output diagnostic conclusions and specific fix directions.
4. Before writing, print `📌 写回校验: <GOON_PATH>` and confirm the target path is exactly `.r2mo/task/goon-<编号>.md`.
5. Write a `DEBUG Report` to `<GOON_PATH>` so `$mxt-goon <编号>` can execute the remediation directly:

```md
---
title: 整改-DEBUG-<编号>
status: Pending
author:
---

# DEBUG Report

## BUG

- 描述：
- 触发条件：
- 影响范围：

## Evidence

- 复现步骤：
- 关键日志/错误：
- 相关文件：

## Root Cause

- 根因：
- 证据链：

## Fix Direction

- 修复方向：
- 风险点：
- 验证方式：

## 整改项

- [ ] ...
```

6. After investigation, output the diagnostic conclusion, fix direction, and `<GOON_PATH>` write-back result.

## Verification

Report the investigation conclusion, whether superpowers diagnosis was invoked, the discovered root cause and fix suggestions, and whether the `DEBUG Report` was written to `<GOON_PATH>`.
