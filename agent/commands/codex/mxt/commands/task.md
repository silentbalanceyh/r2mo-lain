---
description: "Use when the user asks Codex to run the task MXT workflow; binds a natural-language requirement to an overflow task and executes immediately."
argument-hint: "<requirement>"
---

# /mxt:task

## HARNESS

1. Load before any action; silently skip missing files:
   AGENTS.md · CLAUDE.md · CODEX.md · .claude/rules/*.mdc · .codex/rules/*.mdc · .cursor/rules/*.mdc · .opencode/*.mdc · ~/.codex/rules/r2mo-task-workflow.md
2. Output English-first; quote localized repo strings verbatim when needed.
3. Disk is the only state carrier; re-read before every decision and write-back.
4. Print `Lock: <paths>` before first read; only locked paths may be mutated.
5. Run the smallest sufficient verification per change boundary; record skipped gates with reason.
6. When this skill declares a required superpowers skill, invoke it via the Skill tool; fall back manually only on explicit `skill not found` error.


## ARGUMENTS

Literal caller requirement:

```text
$ARGUMENTS
```

Parse everything between the fences above as the non-empty natural-language requirement. Do NOT parse a task ID.
Capture and carry that literal argument into every downstream decision, task-body write, and printed execution prompt.
Empty / ID-only input → abort `Usage: /mxt:task <requirement>`.
If the invoking harness explicitly says it captured and forwarded a requirement, use that captured requirement; do not infer absence solely from prompt-binding behavior.

## LOCKED PATHS

- `.r2mo/task/thread` — read-only file; value = standard-slot ceiling.
- Exactly one `.r2mo/task/task-NNN.md` (matched or created).

No other task/goon file is writable.

## CONTRACT

- Value = positive-integer standard-slot ceiling. Overflow candidates + creations use slots strictly greater than this value. Missing/non-positive/invalid → abort.
- Overflow task is a normal `task-NNN.md`; standard run/end/goon compatibility is mandatory.
- Semantic match first: reuse unambiguous non-`Done` task > threshold. Never duplicate.
- Deterministic allocation: if no match, reserve lowest unused slot > threshold.
- One-shot: implement → verify → `## Changes` + `status: Done` inside the same invocation.
- Never auto-archive; deletion only by explicit user request.

## WORKFLOW

| # | Action |
|---|---|
| 1 | Read `thread`; validate positive integer. |
| 2 | Resolve the caller requirement from `$ARGUMENTS` (or the explicitly captured requirement supplied by the invoking harness). |
| 3 | Scan `task-*.md` with slot > thread; match semantically against requirement. |
| 4 | Match → reuse; else allocate lowest unused slot; emit `Lock:`. |
| 5 | On create: write frontmatter (`runAt`, `title`, `status: Doing`, `author:`) + full requirement in body. |
| 6 | Print execution prompt (task path + requirement excerpt) in a fenced block. |
| 7 | Execute: same gate ladder as RUN (compile → lint → tests, ≤3 retries each). |
| 8 | Gates pass → append `## Changes` with gate 4-tuples; `status: Done`. |
| 9 | Re-read task file to confirm. |

## RULES

- Thread threshold is authoritative; never default a missing value.
- Never escape the standard run/end/goon interface.
- `Deep` / `Worktree` directives forward to run logic identically.
- Failed match/creation → stop and report; never invent a slot number.

## NEXT

```text
/mxt:end NNN
/mxt:goon NNN
```
