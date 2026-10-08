---
name: mxt-debug
description: Use when the user asks Codex to run the debug MXT workflow; diagnose, immediately fix, and archive a Bug Report under .r2mo/bugs/.
---

# /mxt:debug

## HARNESS

1. Load before any action; silently skip missing files:
   AGENTS.md · CLAUDE.md · CODEX.md · .claude/rules/*.mdc · .codex/rules/*.mdc · .cursor/rules/*.mdc · .opencode/*.mdc · ~/.codex/rules/r2mo-task-workflow.md
2. Output English-first; quote localized repo strings verbatim when needed.
3. Disk is the only state carrier; re-read before every decision and write-back.
4. Print `Lock: <paths>` before first read; only locked paths may be mutated.
5. Run the smallest sufficient verification per change boundary; record skipped gates with reason.
6. When this skill declares a required superpowers skill, invoke it via the Skill tool; fall back manually only on explicit `skill not found` error.
## PROJECT INDEX HINT

If `.r2mo/repo/self/` already contains an `mxt coder` index, consult its `locate`, `expand`, or `status` projections when they help explain repository structure. If the index is absent, continue normally and skip the hint. Never implicitly run `scan` or `update` from a skill; updating remains user-initiated.



## ARGUMENTS

`$ARGUMENTS` = `${description} [${P0|P1|P2|P3}] [Deep] [Worktree|WT]`

| Token | Effect |
|---|---|
| `Deep` | widen search: indirect deps, boundary conditions |
| `Worktree` / `WT` | investigate in `.r2mo/worktrees/` |

Strip directives from the end. Remaining text = description. Trailing three-digit number → `${GOON_PATH}` = `.r2mo/task/goon-${NUM}.md` (legacy bridge, Rule 8).

Severity: explicit token wins; else blocked-main-flow / data-loss / security → `P1`; workaround-breakage → `P2`; cosmetic → `P3`; recurring production → `P0`. Single level.

Declare before action: `Bug: ${summary} | Severity: ${SEVERITY} | Legacy goon: ${none|NNN} | Directives: ${none|Deep|WT|Deep+WT}`

## PATH

```text
date     = today yyyy-MM-dd
slug     = lowercase kebab, [a-z0-9-], max 60
FILE     = ${date}-${SEVERITY}-${slug}.md
DIR      = .r2mo/bugs/${date}
BUG      = ${DIR}/${FILE}
INDEX    = ${DIR}/index.md
```

Create `DIR` when missing. Never write to other dates, sibling tasks, or unrelated goon.

## BUG FILE TEMPLATE

Instantiate verbatim, then fill per Workflow. Leave no `${…}` or `_pending_` in the saved file.

```md
---
title: ${FILE_STEM}
date: ${date}
severity: ${SEVERITY}
status: open
resolved:
owner: ${module_or_subproject}
module: ${affected_component_path}
task_ref:
---

# ${title}

## Observed Bug
${observed_vs_expected}

## Trigger Condition
${steps_or_precondition}

## Impact Scope
${modules_endpoints_flows}

## Root Cause
_pending_

## Fix
_pending_

## Files Changed
_pending_

## Recurrence Prevention
_pending_

## Verification
_pending_

## Scope
_pending_
```

Field invariants:

- `title` = `${FILE_STEM}` exactly (leading date, then severity, then slug). No reorder.
- `severity` ∈ {`P0`,`P1`,`P2`,`P3`}; matches filename.
- `status` ∈ {`open`,`fixed`,`wontfix`,`duplicate`}.
- `resolved` empty until `status: fixed`; then equals `${date}`.
- `task_ref` written only when user supplied a task number (captured in `${GOON_PATH}`).

Nine body sections are mandatory and ordered. Do not rename, merge, or drop any.

## INDEX ROW

Read `${INDEX}` first; create with header when absent:

```md
# ${date} Bug Index

| ID | Severity | Module | Summary | Status | Report |
|---|:---:|---|---|:---:|---|
```

Row format:

```md
| ${FILE_STEM} | ${SEVERITY} | ${module} | ${summary_120ch} | ${status} | [${FILE}](${FILE}) |
```

Same-bug rerun rewrites its row in place. No duplicate rows.

## WORKFLOW

| # | Action | Writes to |
|---|---|---|
| 1 | Parse `${ARGS}`; lock `${BUG}` + `${INDEX}` (+`${GOON_PATH}` if legacy). Echo locks. | stdout |
| 2 | Init `${BUG}` from §3; seed `Observed Bug`. | `${BUG}` |
| 3 | Invoke `superpowers:systematic-debugging`. Fallback manual only on `skill not found`. | — |
| 4 | Fill `Observed Bug` / `Trigger Condition` / `Impact Scope` with evidence. | `${BUG}` |
| 5 | Implement minimal focused fix targeting the root cause. Do not stage TODOs. | source |
| 6 | Fill `Fix` / `Files Changed` / `Recurrence Prevention` / `Verification` / `Scope` with real commands, diffs, exit codes. | `${BUG}` |
| 7 | Run verification. Pass → `status: fixed`, `resolved: ${date}`. Fail → keep `open`, retain failure in `Verification`, stop. | `${BUG}` |
| 8 | Upsert daily index row to same status. | `${INDEX}` |
| 9 | Legacy only: write classic DEBUG Report to `${GOON_PATH}`. | `${GOON_PATH}` |

Echo `Write-back: ${BUG} | ${INDEX}${LEGACY:+ | ${GOON_PATH}}` before every mutation.

## RULES

1. Never create, match, reserve, or resolve a task; `/mxt:task` owns `.r2mo/task/thread`.
2. Mutate only locked paths.
3. Disk is authoritative. Never trust conversational memory.
4. Never use `bug-HHMMSS-*` or `BUG-HHMMSS-*` filenames.
5. Never flip `status: fixed` before verification passes.
6. Never fabricate logs, stack traces, or command outputs.
7. Nine body sections are mandatory and ordered.
8. Legacy bridge fires only when user supplied three-digit number; never creates task.
9. `wontfix` / `duplicate` are user-decided terminators; `Scope` states rationale.
10. Final report includes: `${BUG}` path, severity, root cause (1 line), changed files, verification commands + exit codes, `status`/`resolved` on disk, index row status, legacy `${GOON_PATH}` state.

Incomplete Rule 10 coverage → report incomplete. No premature success claims.

## NEXT

```text
Convert to overflow task → /mxt:task <requirement>
Independent verify → /mxt:end NNN (when task-linked)
```
