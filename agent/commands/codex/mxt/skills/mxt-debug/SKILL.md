---
name: mxt-debug
description: Use when the user asks Codex to debug a bug or error, such as "$mxt-debug login fails" or "mxt-debug null pointer in UserService"; detects superpowers for systematic diagnosis or falls back to manual root-cause analysis.
---

# MXT Debug

Launch a BUG investigation flow: detect superpowers for systematic diagnosis, or fall back to manual root-cause analysis.

## Arguments

The user must provide a bug description, such as `login fails` or `null pointer in UserService`.

If the description is missing, ask the user to describe the bug they want to investigate.

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Declare the investigation target: BUG diagnosis, description is `$ARGUMENTS`.
3. Detect whether `superpowers:systematic-debugging` skill exists in the current environment:
   - If it exists, invoke `superpowers:systematic-debugging` skill, passing `$ARGUMENTS` as the BUG description, and follow its workflow for systematic diagnosis.
   - If it does not exist, execute the following fallback investigation flow:
     a. Collect error information: read files, logs, or stack traces mentioned in `$ARGUMENTS`.
     b. Locate related files: search the current repository for modules, functions, or configuration related to the error.
     c. Analyze root cause: infer the fundamental cause based on code logic and error symptoms.
     d. Provide fix suggestions: output diagnostic conclusions and specific fix directions.
4. After investigation, output the diagnostic conclusion and fix direction.

## Verification

Report the investigation conclusion, whether superpowers diagnosis was invoked, and the discovered root cause and fix suggestions.
