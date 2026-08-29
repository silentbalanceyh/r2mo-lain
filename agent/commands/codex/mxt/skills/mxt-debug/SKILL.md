---
name: mxt-debug
description: Use when the user asks Codex to run the debug MXT workflow; enforces scoped inputs, evidence-backed execution, and closed-loop handoff.
---

# /mxt:debug

## Harness

Binding execution contract for all MXT commands across Claude Code, Codex, and OpenCode.

- **English-first.** Write all output in English. Use Chinese only when quoting existing repo content (task titles, frontmatter values, status fields, localized error messages) or when the user explicitly asks.
- **Rule loading.** Load `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `.claude/rules/*.mdc`, `.codex/rules/*.mdc`, `.cursor/rules/*.mdc`, `.opencode/*.mdc`, and `~/.codex/rules/r2mo-task-workflow.md` before task action. Missing files do not block.
- **Argument contract.** Resolve the three-digit task number first. If absent, list `.r2mo/task/` candidates in the current directory only. Never resolve from parent/sibling/historical directories.
- **Isolation lock.** Print locked path(s) before reading. Only read/write locked `task-*.md` and `goon-*.md` files.
- **Disk source of truth.** Re-read locked files from disk before decisions and before write-back. Do not trust conversation memory, summaries, or cache.
- **Prompt echo.** Print the final action prompt in a code block before editing or execution.
- **Write-back guard.** Verify destination matches isolation lock before any write. Never duplicate `Plan` or `Changes`; update in place.
- **Fresh evidence.** Run the smallest sufficient verification for the changed boundary before claiming success. Record skipped gates with reason.
- **Cross-agent portability.** Keep prompts deterministic and safe for Claude Code, Codex skills, and OpenCode JSON templates.

Launch a bug investigation flow: invoke superpowers systematic-debugging directly, or fall back to manual root-cause analysis only if the skill tool reports it as absent. Archive a Bug Report to `.r2mo/bugs/<yyyy-MM-dd>/` recording the problem, diagnostics, and solution.

The user invoked this command with: $ARGUMENTS

## Arguments

1. `$ARGUMENTS` is a bug description text, optionally containing a three-digit task number, with optional **directives** at the end (space-separated, case-insensitive):
   - `Deep` — enable deep diagnosis, broaden investigation scope
   - `Worktree` / `WT` — isolate investigation in a Worktree
2. Parse from the end of `$ARGUMENTS` for known directive keywords; extract the first three-digit number from the remaining text; if no number, ask the user.
3. Set `<GOON_PATH>` to `.r2mo/task/goon-NNN.md`. Remaining text is the bug description. Declare parsed results, e.g. `📌 Bug: memory leak | Task: 001 | Directives: Deep`.

**Hard rules**: Parse failure → abort. Superpowers: invoke directly (fallback only on explicit "skill not found" error). Worktree → `.r2mo/worktrees/`. Write-back guard: confirm both the goon target path and the bug archive path before writing.

## Output Targets

Two outputs per debug run:

1. **Goon (remediation handoff)** — `<GOON_PATH>` = `.r2mo/task/goon-NNN.md`: current remediation items so `/mxt:goon <number>` can execute the fix directly.
2. **Bug archive (appended output)** — `.r2mo/bugs/<yyyy-MM-dd>/bug-<HHmmss>-<slug>.md`: a full record of **Problem**, **Diagnostics**, and **Solution**. The `<yyyy-MM-dd>` directory is created if absent; one directory per calendar day. Use the current date (timezone-aware) for the directory, and current time for the filename. Derive `<slug>` from the bug description (lowercase, hyphen-separated, max 40 chars).

## Closed-Loop Contract

`mxt-debug` closes the bug-to-remediation handoff, not the full task loop.

- **Diagnosis must be reproducible or evidence-backed.** Record the trigger, observed result, expected result, relevant files, and command/output evidence. Do not infer a root cause from a summary alone.
- **Remediation must be actionable.** If a task number is linked, write each remediation item in the exact `## Remediation Item N — <short title>` format with failure evidence, required correction, verification command, and scope reason. If no task number is linked, keep the checkbox items equally concrete.
- **Handoff must continue the loop.** Linked tasks proceed to `mxt-goon NNN`; independent bugs retain the bug archive and can be linked to a task later.
- **Boundary.** Do not modify production source while diagnosing unless the user explicitly authorizes a fix. The debug output is diagnosis and remediation handoff, not an implementation report.
- **Closure evidence.** A bug is closed only after the stated verification method passes and the fix result is recorded. A diagnosis alone is not closure.

## Workflow

1. Load repo entry rules and all `.mdc` rule files (see Harness § Rule loading).
2. Declare investigation target: bug diagnosis, description is the parsed bug text.
3. Assume `superpowers:systematic-debugging` is installed and invoke it directly via the Skill tool. Do not rely on context banners or model self-introspection — these are unreliable and cause false negatives.
   - If the Skill tool returns an explicit "skill not found / not registered" error → execute fallback:
     a. Collect error info: read files, logs, or stack traces mentioned in `$ARGUMENTS`.
     b. Locate related files: search the repository for modules, functions, or config related to the error.
     c. Analyze root cause: infer fundamental cause from code logic and error symptoms.
     d. Provide fix suggestions: output diagnostic conclusions and specific fix directions.
   - If the call succeeds → must follow its workflow. Do not skip or self-downgrade.
4. Declare investigation path: `📌 Path: Superpowers[systematic-debugging]` or `📌 Path: Manual`.
5. **Deep diagnosis**: If `Deep` directive detected, broaden scope: search more related files, check indirect dependencies, analyze boundary conditions.
6. **Worktree isolation**: If `Worktree` directive detected, execute investigation in a Worktree under `.r2mo/worktrees/`.
7. Generate a `DEBUG Report` and write to `<GOON_PATH>` so `/mxt:goon <number>` can execute remediation directly.
8. **Bug archive (appended output)**: Generate a `Bug Report` and write to `.r2mo/bugs/<yyyy-MM-dd>/bug-<HHmmss>-<slug>.md` recording Problem, Diagnostics, and Solution. Create the dated directory if it does not exist. Do not overwrite existing bug files in the same directory — append a sequence suffix if a name collision occurs.
9. Before writing each output, declare `📌 Write-back check:` with the target path and confirm it matches the intended destination.

## DEBUG Report

Write `<GOON_PATH>` with the following format:

```md
---
title: Remediation-DEBUG-NNN
status: Pending
author:
---

# DEBUG Report

## Bug

- Description:
- Trigger condition:
- Impact scope:

## Evidence

- Reproduction steps:
- Key logs/errors:
- Related files:

## Root Cause

- Root cause:
- Evidence chain:

## Fix Direction

- Fix direction:
- Risk points:
- Verification method:

## Remediation Items

- [ ] ...
```

## Bug Report

Write `.r2mo/bugs/<yyyy-MM-dd>/bug-<HHmmss>-<slug>.md` with the following format:

```md
---
title: Bug-<slug>
date: <yyyy-MM-dd HH:mm:ss>
status: Reported
author:
related-task: <NNN or none>
---

# Bug Report

## Problem

- Summary:
- Trigger condition:
- Impact scope:
- Severity:

## Diagnostics

- Reproduction steps:
- Key logs / errors / stack traces:
- Related files:
- Investigation path (Superpowers / Manual):
- Evidence chain:

## Solution

- Root cause:
- Fix direction:
- Applied fix (if any):
- Risk points:
- Verification method:
- Follow-up: `/mxt:goon <number>` for remediation
```

## Next Steps

- Confirm bug then fix → verify after code changes
- Remediate from DEBUG report → `/mxt:goon <number>`
- Verify after fix → `/mxt:end <number>` (if linked to a task)
- Complex fix needs planning → `/mxt:plan <number>`
- Continue execution → `/mxt:run <number>`

## Verification

Report: investigation conclusion, whether superpowers diagnosis was invoked, root cause found, fix suggestions, confirmation that the `DEBUG Report` was written to `<GOON_PATH>`, and confirmation that the `Bug Report` was archived to `.r2mo/bugs/<yyyy-MM-dd>/bug-<HHmmss>-<slug>.md`.
