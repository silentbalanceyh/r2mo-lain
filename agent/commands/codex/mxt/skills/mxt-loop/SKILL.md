---
name: mxt-loop
description: Use when the user asks Codex to run the loop MXT workflow; enforces scoped inputs, evidence-backed execution, and closed-loop handoff.
---

# /mxt:loop — Scoped Task Loop

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

Execute `RUN → VERIFY → END → [GOON → VERIFY → END_REVIEW]` — only enter the remediation loop when review produces items. Argument: `$ARGUMENTS`.

## Session Isolation Contract

必须开启两个独立会话：Development session（RUN/GOON）与 Review session（END/END_REVIEW）。

1. **Development session owns implementation.**
   - It may load task rules, read locked files, edit the task diff, run scoped verification, and produce the required artifacts below.
   - It must not act as the reviewer, grade its own implementation, or write acceptance conclusions into goon.

2. **Review session owns adversarial review.**
   - It must start with a fresh context and independently re-read disk state; 不得共享上下文，禁止在同一会话内自我审查。
   - It must not modify source code or rewrite task `Changes`; it only writes `goon-NNN.md`.
   - It must treat the development session as untrusted and distrust self-reported success unless evidenced by disk, diff, commands, and exit codes.

3. **Allowlisted artifacts between sessions.**
   - Locked `task-NNN.md`, `goon-NNN.md`, selected rule paths, changed-file inventory, git diff/patch, and commands with captured results/exit codes.
   - 每次通信只允许白名单工件；禁止传递聊天历史、隐藏 reasoning、未写入磁盘的摘要、无关任务上下文或 implementation intent。
   - Do not use a subagent as an alias for the same context; it must be a genuinely separate session/process with no shared message history.

4. **Hard failure.**
   - If two independent sessions are unavailable, stop and report `Session isolation unavailable`; do not silently downgrade to self-review.

## Closed-Loop Contract

The loop is closed only by mechanical goon convergence, not by conversation agreement.

- **Session isolation is mandatory.** Development owns RUN/GOON; Review owns END/END_REVIEW. If two independent sessions are unavailable, report `Session isolation unavailable` and stop.
- **State is disk-only.** `task-NNN.md` carries requirements, Plan, and Changes; `goon-NNN.md` carries only current remediation items. Do not add extra state files.
- **Count is mechanical.** Count only `grep -c '^## Remediation Item [0-9]\+ —'`. Zero closes the loop.
- **Each phase has a gate.** RUN implements; END adversarially reviews; GOON remediates only listed items; END_REVIEW independently removes only resolved items.
- **Actionable items only.** Failure evidence, required correction, verification command, and scope reason are mandatory. New findings must be introduced or exposed by the current diff.
- **Convergence.** Two consecutive rounds without an item-count decrease stop as Blocked/WONTFIX. Do not silently retry or replace the queue with cosmetic findings.

## File Model

Only two files per task:
- `.r2mo/task/task-NNN.md` — task body, `## Plan` section, and `## Changes` section.
- `.r2mo/task/goon-NNN.md` — current remediation items only. Cleared when no items remain.

No `loop-NNN.json`, no extra tracking files. Loop state is derived from the goon file: if goon-NNN.md is empty or has no pending items, the loop is closed.

## Immutable Contract

- Lock and only read/write `task-NNN.md` and `goon-NNN.md`.
- RUN/GOON are executors; END/END_REVIEW are independent reviewers — self-review is prohibited.
- Count remediation items mechanically via `grep -c '^## Remediation Item [0-9]\\+ —'`; zero count ends immediately. This count is the single source of truth for loop closure. END writes items and GOON clears them in this exact header format (see `/mxt:end` Remediation Item Format) so the count stays valid.
- RUN discovers applicable rules once and saves to memory; subsequent phases reuse without re-scanning.
- Full-workspace, K8S, BUGS, Chat, hot-start stability, and `agent-gate.sh all` are forbidden by default. Only enabled for task-scope, release verification, or explicit user request.

## Phase 1 — RUN

1. Lock task path, read task body and repo entry rules.
2. Discover and select relevant rules by task scope in one pass; reuse in later phases without re-scanning.
3. Executor implements the task in one pass, recording changed files.
4. Select minimal sufficient verification by priority:
   1. Real runtime environment, process ownership, listening ports, and business health paths
   2. Owning submodule targeted tests
   3. Task-required source guard, lint, compile
5. Record commands and results. Proceed to END.

## Adversarial Review Contract

The Review session is an adversarial reviewer.

- **Assume the implementation is incomplete** until task requirements, changed code, and fresh evidence agree.
- Build the changed-file inventory directly from disk/diff, then check every changed file for **scope leak**, accidental deletion, dead code, test bypass, and stale claims.
- Perform spec-to-diff traceability: map each requirement and verification claim to concrete file/path evidence.
- Separate three outcomes: real blocker, missing requirement, and cosmetic/style preference.
- Only emit **real remediation items** for P0/P1 blockers or unmet task requirements; reject cosmetic findings and unrelated pre-existing issues.
- Verify command evidence itself: command, changed boundary, expected result, actual result, and exit code. A passed command outside the changed boundary is not sufficient acceptance evidence.
- Search for hidden contradictions: task says X while code implements Y; Tests changed to weaken assertions; logs claim success without a captured exit code; partial files omitted from the diff inventory.

## Phase 2 — END

1. Use the isolated Review session. Read rules from RUN's selected rule-path list — do not re-scan and do not inherit RUN's conversation.
2. Independently review against task body, changed-file inventory, full diff, and fresh evidence.
3. No real P0/P1 issue → write goon as `status: Done`, empty items, loop closed immediately.
4. Has issues → write only current P0/P1 remediation items to goon, proceed to GOON.

### Real Remediation Item Format

Each item must contain:

- **Failure evidence:** exact file/path, line or symbol, and observed command/result.
- **Required correction:** the concrete code/test/document change required.
- **Verification command:** the command that must fail now and pass after correction.
- **Scope reason:** why it is P0/P1 and why it must be fixed in this task.

Every remediation item 必须由当前 diff 引入或暴露；禁止写泛化建议、样式意见、重构愿望或不可验证项。

## Phase 3 — GOON / END_REVIEW

1. The Development session fixes only current goon items; do not use review findings as permission for unrelated refactoring.
2. Re-run only affected runtime verification, targeted tests, and necessary quality gates — do not re-run unrelated full gates.
3. The Review session independently re-checks fixes, only removes resolved items, and mechanically recounts remaining items; 只保留未解决项，禁止复制历史说明。
4. **Zero items** → clear goon-NNN.md (rewrite as empty / no-pending-items), loop closed.
5. Still has items → continue loop. END_REVIEW 新发现 must meet the same actionable P0/P1 evidence format and must be introduced or exposed by the remediation diff.
6. Two consecutive rounds with no item-count decrease → mark Blocked/WONTFIX, stop meaningless retries.

## Completion

Loop complete: task-NNN.md is Done, goon-NNN.md is empty/cleared. Changes in task-NNN.md must list changed files, real runtime verification, targeted tests, necessary static gates, and scope rationale for skipped heavy gates.
