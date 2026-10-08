---
name: mxt-doctor
description: Use when the user asks Codex to run the doctor MXT workflow; audits and remediates anti-drift baseline metadata under .r2mo/doctor/.
---

# /mxt:doctor

## HARNESS

1. Load before any action; silently skip missing files:
   AGENTS.md · CLAUDE.md · CODEX.md · .claude/rules/*.mdc · .codex/rules/*.mdc · .cursor/rules/*.mdc · .opencode/*.mdc · ~/.codex/rules/r2mo-task-workflow.md
2. Output English-first; quote localized repo strings verbatim when needed.
3. Disk is the only state carrier; re-read before every decision and write-back.
4. Print `Lock: <paths>` before first read; only locked paths may be mutated.
5. Run the smallest sufficient verification per change boundary; record skipped gates with reason.
6. When this skill declares a required superpowers skill, invoke it via the Skill tool; fall back manually only on explicit `skill not found` error.


## ARGUMENTS

| Form | Behaviour |
|---|---|
| `<profile>` (`k8s`/`loc`/`mob`/`win`) | Restrict to profile. |
| `Deep` | Broader file-sweep. |
| `Dry` | Analyse only; no `.conf` mutation. |
| *(empty)* | Process all profiles in `.r2mo/doctor/`. |

## LOCKED PATHS

- `.r2mo/doctor/config.json` — read-only.
- `.r2mo/doctor/<profile>/*.conf` — writable outside Dry.
- `.r2mo/doctor/<profile>/snapshot-<profile>.json` / `analysis-<profile>.json` — generated evidence; read-only.

Source, deploy scripts, env files, git state are never mutated.

## CONTRACT

- Baseline reconciliation: committed vs freshly-generated. Every deviation classified.
- Every `.conf` edit cites: profile, file, entry, mismatch evidence, correction.
- Never unexplain a deletion; structural drift ≠ generator misclassification.
- Convergence: ≤3 remediation rounds. Rounds without FAIL/WARN reduction → `Doctor baseline did not converge`.
- Post-edit rerun `mxt doctor --profile <p>`; record PASS/FAIL/WARN/SKIP counts.
- Dry skips mutation + final verification (explicitly reported).

## `.conf` FORMAT

TSV. Loader hints come from `.r2mo/doctor/config.json`:

- `default_profile`, `env_sources[]`, `expected_branch`, `language`, `project_type`

Cell markers:

- `@optional` — soft presence
- `!forbidden` — must NOT exist
- value anchor — fixed value match; empty string = runtime-injected secret

## CLASSIFICATION

Exactly one of:

- `NORMAL_EXPECTED`
- `ABNORMAL_DRIFT`
- `UNCLASSIFIED`

Never invent a fourth class. Never promote `UNCLASSIFIED` without evidence.

## WORKFLOW

| # | Phase | Action |
|---|---|---|
| 1 | Preflight | Require `.r2mo/doctor/` with ≥1 profile. Else instruct `mxt doctor --gen<k8s\|loc>`. |
| 2 | Snapshot | Record committed baseline checksums. |
| 3 | Generate | `mxt doctor --gen<profile>` for each target. |
| 4 | Diff | Baseline vs generated. Classify each delta. |
| 5 | Corroborate | Read `snapshot-<p>.json` + `analysis-<p>.json` against project evidence. |
| 6 | Remediate | Edit offending `.conf` entries. Dry proposes only. |
| 7 | Verify | Re-run scan; record counts. Skipped in Dry. |
| 8 | Iterate | Repeat 6-7; max 3 rounds. |
| 9 | Report | Counts, classification histogram, edits, rounds used. |

## FAILURE MODES

- No `.r2mo/doctor/` → abort with runbook hint.
- Generator crash → capture stderr, abort.
- Non-decreasing counts → `Doctor baseline did not converge`.
- Invalid `config.json` → abort; never auto-repair.

## RULES

- Never mutate outside `.r2mo/doctor/`.
- Dry mode leaves no trace.
- Every edit cites evidence; gut-feel forbidden.
- `UNCLASSIFIED` → follow-up, never silence.
- Pure evidence-reconciliation; no superpowers call.

## NEXT

```text
Re-run → /mxt:doctor <profile>
Resume dev → /mxt:run NNN
```
