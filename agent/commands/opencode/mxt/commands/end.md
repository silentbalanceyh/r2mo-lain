---
description: "Use when the user asks Codex to run the end MXT workflow; adversarially verifies task completion and writes remediation items."
argument-hint: "[NNN] [Deep|Strict]"
---

# /mxt:end

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

| Form | Behaviour |
|---|---|
| `NNN` | Verify `.r2mo/task/task-NNN.md`. |
| `NNN Deep` | Widen content-match sweep. |
| `NNN Strict` | Raise P0/P1 sensitivity in-boundary; never escalate to P2+. |
| *(empty)* | Scan `.r2mo/task/task-*.md`; interactive picker. |
| Other | Abort with `Usage: /mxt:end NNN [Deep\|Strict]` |

## LOCKED PATHS

- `.r2mo/task/task-NNN.md` — read-only.
- `.r2mo/task/goon-NNN.md` — clear-then-write.

Nothing else.

## CONTRACT

- Adversarial stance: assume `## Changes` are untrusted until diff + disk + requirements agree.
- Write **P0/P1 only**. Style / optimisation / speculative / legacy-debt → out of scope forever.
- First END delivers all current P0/P1 in one pass. Re-END inspects only existing goon items + new P0/P1 from those fixes.
- 3-Layer Verification on every `## Changes` entry:
  - **L1 Existence**: claimed file/symbol exists on disk.
  - **L2 Content-match**: change content satisfies stated requirement; reject stubs / placeholders / hardcoded fakes.
  - **L3 Coverage**: every explicit task requirement has a matching change; enumerate gaps.
- Verdict per entry: `PASS [L1][L2][L3] <path>` or per-layer FAIL with concrete gap.
- Requirements-first: requirement satisfaction beats adjacent perfection; non-requirement concerns never block closure.

## GOON ITEM FORMAT (mechanical)

```md
## Remediation Item N — <title-lowercase-hyphenated-max-50-chars>

- Requirement link: <quoted phrase from task requirement>
- Failure fact: observed vs expected
- Acceptance criteria: precise resolution condition
- Verification command: owning command that must fail before and pass after correction
- Scope reason: why this is a P0/P1 task blocker
```

- Counter: `grep -c '^## Remediation Item [0-9]\+ —'`.
- Zero items → write explicit no-pending state. No historic narrative.

## WORKFLOW

| # | Action |
|---|---|
| 1 | Parse `NNN` + directives; emit `Lock:` on task + goon. |
| 2 | Read body + Plan + Changes from disk; build changed-file inventory from git diff. |
| 3 | 3-Layer verify every Changes entry; record verdicts. |
| 4 | Merge duplicate evidence into one item per failure. |
| 5 | Write P0/P1 `## Remediation Item N — …` entries to goon; zero cases → explicit no-pending. |
| 6 | Write-back guard: re-read goon + task. |
| 7 | Report: verdict table, goon count, convergence state. |

## RULES

- Verification commands come from actual project scripts; never imagined.
- P0 = task-blocking. P1 = correctness/side-effect. P2+ / style = out of scope.
- Pure verification skill. No superpowers invocation. No implementation.

## NEXT

```text
/mxt:goon NNN      # if goon has items
```
