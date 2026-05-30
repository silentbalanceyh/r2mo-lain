---
name: mxt-debug
description: Use when the user asks Codex to debug a bug or error, such as "$mxt-debug login fails" or "mxt-debug null pointer in UserService"; detects superpowers for systematic diagnosis or falls back to manual root-cause analysis.
---

# MXT Debug

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
