---
description: "Verify R2MO task by 3-digit number such as 001; write current remediation items to .r2mo/task/goon-xxx.md. Remediation items converge toward requirements, never diverge; requirements-satisfied-first."
argument-hint: "[001] [directives...]"
---

# /mxt:end

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

Read `.r2mo/task/task-NNN.md` for the given number, verify task completion, and write current remediation items to `.r2mo/task/goon-NNN.md`.

The user invoked this command with: $ARGUMENTS

## Arguments

1. `$ARGUMENTS` starts with a three-digit number (regex `^[0-9]{3}`), e.g. `001`.
2. Additional tokens are **directives** (space-separated, case-insensitive):
   - `Deep` — enable deep verification: compare each changed file against task requirements
   - `Strict` — strict mode: raise sensitivity within the current task boundary; still only P0/P1 items, never upgrade to P2/P3
3. Declare parsed results, e.g. `📌 Task: 005 | Directives: Deep`. If no directives, declare task number only.

**Hard rules**: Parse failure → abort. Goon: clear-then-write. Never modify task Changes. Path conflict → abort. No reads/writes outside isolation lock.

## Remediation Item Format

Every remediation item in `<GOON_PATH>` MUST use this exact header so the closed-loop count works mechanically:

```md
## Remediation Item N — <short title>

- Requirement link: which task requirement this blocks (quote the requirement phrase)
- Failure fact: observed behavior vs expected behavior
- Acceptance criteria: the precise condition that makes this item resolved
- Suggested fix direction: optional, non-binding hint
```

- `N` is a sequential integer starting at 1. Title is lowercase-hyphenated, max 50 chars.
- The loop counts items via `grep -c '^## Remediation Item [0-9]\+ —'`. Any other header format breaks the closed-loop count and is a violation.
- Keep one item per `## Remediation Item` header. Do not nest items.

## Core Verification Constraints (cannot be overridden by Deep/Strict)

1. Repo rules and MDC are hard constraints. Verification budget / no-repeat / incremental verification rules take priority over any default full-scan language in this command.
2. `/mxt:end` is risk-controlled task verification, not a perfect-system audit. "Every line must be perfect" is not the closing standard.
3. Goon writes **only P0/P1**: issues that directly break task verification, compile/run, or make the change boundary unreliable.
4. **No P2/P3, optimizations, style issues, speculative risks, unrelated legacy debt, or "could be better" refactors.**
5. First end must deliver all current blocking items in one pass within the selected scope. Multiple evidence for the same failure → merge into one item with clear acceptance criteria. No piecemeal additions across rounds.
6. Post-remediation re-verification only checks listed goon items and direct P0/P1 blockers introduced by the fix. Do not re-scan the full scope to manufacture new rounds.
7. **Requirements-first priority**: Judge completion against the task's stated requirements first. A task is done when its requirements are satisfied — not when every adjacent concern is perfect. Only after requirements are met do P0/P1 reliability blockers matter. Never let a non-requirement concern block a requirement-satisfying change.
8. **Convergence, not divergence**: Every remediation item must trace back to a specific task requirement it helps satisfy, or a direct P0/P1 blocker to that requirement. Items must converge the code toward the requirements — fewer, tighter, closer to the goal each round. Forbidden (divergence): items that open new topics, expand to adjacent modules, chase style/optimization, refactor "while here", or add speculative robustness. If an observation does not move the task toward requirement satisfaction, do not write it as an item.
9. **Scope discipline**: Verify against task body, Plan, Changes declared scope, and minimal affected verification results. Do not dig into out-of-scope implementation details, legacy debt, repo-wide potential risks, speculative reasoning, or "let me also check" extra scope. Do not expand from one issue to adjacent modules, style optimizations, or follow-up topics. After completing one pass of in-boundary verification and minimal necessary validation, write the conclusion immediately. If evidence is insufficient, record the unverified scope — do not keep searching for new issues.
10. Verification uses minimal affected targets; once green, it is fixed. Without explicit user authorization, do not run full/workspace gates or repeat already-green checks.
11. Solution stability: goon writes failure facts + acceptance criteria. Unless a single safe path is clearly identified, do not force or repeatedly switch between A/B implementations.

## Verification Hints

Before writing the goon, run these checks (print which were used and their results):

1. **Requirement coverage**: List each task requirement and mark satisfied / unsatisfied / partially. Unsatisfied requirements are the top-priority remediation items.
2. **Diff review**: Read the git diff of changed files. Each change should map to a requirement. Changes with no requirement link are candidates for removal, not for new items.
3. **Build + run**: Compile and (if feasible) run the affected path. Errors that block requirement satisfaction are P0; cosmetic warnings are not items.
4. **Boundary check**: Confirm the change stays within the declared Plan/Changes scope. Out-of-scope drift is a P1 item (scope correction toward requirements), not a chance to expand.
5. **Regression sniff**: Only if the fix touched shared code, check direct callers. Do not launch a repo-wide regression hunt.

If a check is N/A for this task, record it as "skipped (N/A)" with reason — do not leave it silent.

## Workflow

1. Load repo entry rules and all `.mdc` rule files (see Harness § Rule loading).
2. Parse `$ARGUMENTS`: extract task number and directives. If empty, scan `.r2mo/task/task-*.md`, list for user selection. If no task files exist, prompt user. If non-empty but does not match `^[0-9]{3}`, stop and print: `Usage: /mxt:end 001 [directives...] where 001 is a 3-digit task number.`
3. Set task path to `.r2mo/task/task-NNN.md` and goon path to `.r2mo/task/goon-NNN.md`. If task file does not exist, do not guess — ask user for correct number.
4. **Isolation lock**: Print `📌 Locked: .r2mo/task/task-NNN.md | .r2mo/task/goon-NNN.md`. All reads/writes target these two paths only.
5. Read task body (after frontmatter). If empty, stop and return: `Task body is empty. Cannot execute /mxt:end.`
6. Print the final execution prompt in a Markdown code block before editing.
7. Execute the prompt below with paths replaced by actual relative paths:

> **Task**: Verify `<TASK_PATH>` and generate remediation queue `<GOON_PATH>`.
>
> - **Input**: Read body after frontmatter of `<TASK_PATH>`.
> - **Pre-check**: If body is empty, return "Task body is empty, verification skipped" and do not modify any file.
> - **Verification basis**: Compare task body, existing Plan, existing Changes, and current code state to determine completion.
> - **Core constraints**: This is risk-controlled verification, not a perfect-system audit. Repo MDC / verification budget takes priority. Deep/Strict cannot override.
> - **Requirements-first**: Judge completion against stated requirements first. Done = requirements satisfied, not "everything perfect". A non-requirement concern must not block a requirement-satisfying change.
> - **Convergence**: Every remediation item must trace to a requirement or a direct P0/P1 blocker of a requirement. Items must converge toward requirements — fewer and tighter each round. No divergence: no new topics, no adjacent modules, no style/optimization, no speculative robustness, no "while here" refactors. If it does not move toward requirement satisfaction, do not write it.
> - **Scope discipline**: Verify against task body, Plan, Changes declared scope, and minimal affected verification results. No out-of-scope digging, legacy debt, repo-wide risks, speculative reasoning, or "let me also check" extras. Do not expand from one issue to adjacent modules or follow-up topics. Complete one pass → write conclusion.
> - **Remediation threshold**: Only write P0/P1 issues that directly break task verification, compile/run, or change boundary reliability. No P2/P3, optimizations, style, speculative risks, or unrelated legacy debt.
> - **Item format**: Write each item as `## Remediation Item N — <title>` with Requirement link / Failure fact / Acceptance criteria / Suggested fix direction. This exact header is required for the loop count.
> - **One-shot completeness**: All current blocking items in the selected scope must be delivered in one pass. Multiple evidence for same failure → merge into one item with acceptance criteria. No piecemeal additions.
> - **Re-verification boundary**: If this is a post-goon re-verification, only check listed goon items and direct P0/P1 blockers from the fix. Do not re-scan to create new rounds.
> - **Verification hints**: Run the checks in § Verification Hints (requirement coverage, diff review, build+run, boundary check, regression sniff). Record each as used/skipped with result. Unmet requirements are top-priority items.
> - **Deep mode**: If `Deep` directive detected, read each changed file and compare against task requirements. Otherwise, standard granularity.
> - **Strict mode**: If `Strict` directive detected, raise sensitivity within current task boundary. Still only P0/P1, never P2/P3.
> - **Goon title**: `<GOON_PATH>` frontmatter title must be `Remediation-` + `<TASK_PATH>` frontmatter title.
> - **Goon write**: Clear `<GOON_PATH>` original content before writing current remediation items.
> - **Write-back guard**: Verify destination matches isolation lock before writing. If mismatch, stop and report path conflict.
> - **Content boundary**: `<GOON_PATH>` stores only current remediation items. No Changes, history, or completed items.
> - **No items**: If no remediation items, rewrite `<GOON_PATH>` as empty / no-pending-items status.
> - **Prohibited**: Do not modify `<TASK_PATH>` Changes.
> - **Isolation**: Do not read, edit, or create any `task-*.md` or `goon-*.md` other than `<TASK_PATH>` and `<GOON_PATH>`.

## Next Steps

- No items → task is complete, loop closed
- Has items → `/mxt:goon <number>`
- Re-verify after remediation → `/mxt:end <number>` (loop until clean)
- New bug → `/mxt:debug <description>`

## Verification

Report: requirement coverage (satisfied/unsatisfied/partial counts), verification hints used (each check: used/skipped + result), remediation item count, convergence confirmation (every item traces to a requirement), and the written `.r2mo/task/goon-NNN.md` path.
