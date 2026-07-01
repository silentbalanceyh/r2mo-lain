---
name: mxt-loop
description: Use when the user asks Codex to run a closed-loop task workflow by number, such as "$mxt-loop 001" or "mxt-loop 001"; sequentially executes RUN→END→GOON↺END phases until the goon remediation file is empty.
---

# MXT Loop

Closed-loop task workflow: AI sequentially performs the three roles (executor, reviewer, fixer) in a loop until the goon remediation queue is empty.

## Arguments

The user must provide a three-digit number such as `001`.

If the number is missing, scan `.r2mo/task/` for `task-*.md` files, read the `title` and `status` from each file's frontmatter, list the number and title for the user to choose from, and continue with the selected number. If no `task-*.md` files exist, tell the user to create a task first.

If the number is provided but does not match `^[0-9]{3}$`, stop and say:

`请使用 $mxt-loop 001 格式执行，其中 001 是三位数字任务编号。`

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Parse the task number. Declare `📌 闭环锁定: task-<number>`.
3. Set task path to `.r2mo/task/task-<number>.md` and goon path to `.r2mo/task/goon-<number>.md`.
4. Execute the closed loop in sequence:

**Phase 1 — RUN**: Read task body → implement → quality gate (build+lint+test) → append Changes → set status: Done.

**Phase 2 — END**: Review code vs task requirements → run quality gate independently → write goon. If no issues, goon is empty ("无待整改项"). If issues found, goon lists each as `## 整改项 N — <description>`.

**Phase 3 — Check goon**: Count actual remediation items (not frontmatter, headers, or placeholder text). If count is 0 → done (go to Phase 5). If count > 0 → enter Phase 4.

**Phase 4 — GOON↺END Loop**:
- GOON: Read goon items → fix each → run quality gate → mark ✅/⚠️WONTFIX → append to task Changes.
- END: Re-verify each fix → re-run quality gate (no reuse of prior results) → remove fixed → keep failed → mark new issues.
- Stalemate: If count doesn't decrease for 2 consecutive rounds, mark remaining as WONTFIX and exit loop.
- Return to Phase 3.

**Phase 5 — Report**: Output closed-loop summary table with task number, total loop rounds, stale rounds, changed files, and quality gate results.

## Hard Rules

- Task isolation lock: only read/write task-NNN.md and goon-NNN.md
- Quality gate must pass before writing Done or clearing goon
- END must re-run quality gate independently each round (no reusing prior results)
- 2 consecutive rounds with no reduction → stalemate: mark remaining WONTFIX
- Unique termination: goon file has zero actual remediation item entries
- No artificial round limit

## Verification

After completion, verify:
- goon file content is empty (zero remediation items)
- task file status is Done
- Changes records are complete with all iteration history
