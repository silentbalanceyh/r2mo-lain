---
description: "Intelligently verify and remediate anti-drift baseline metadata in .r2mo/doctor/<profile>/; analyzes project characteristics, runs mxt doctor --gen??? for comparison, then directly fixes .conf files to align with project structure."
argument-hint: "[profile] [Deep] [Dry]"
---

# /mxt:doctor

## Harness

Binding execution contract for all MXT commands across Claude Code, Codex, and OpenCode.

- **English-first.** Write all output in English. Use Chinese only when quoting existing repo content.
- **Rule loading.** Load `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `.claude/rules/*.mdc`, `.codex/rules/*.mdc`, `.cursor/rules/*.mdc`, `.opencode/*.mdc`, and `~/.codex/rules/r2mo-task-workflow.md` before task action. Missing files do not block.
- **Disk source of truth.** Re-read files from disk before decisions.
- **No side effects on source.** This skill only modifies `.r2mo/doctor/` metadata. It never touches source code, deploy scripts, env files, or git state.

Intelligently verify and remediate `.r2mo/doctor/<profile>/` metadata to align with the project's actual characteristics. Runs `mxt doctor --gen???` for fresh comparison, analyzes project structure, then **directly edits `.conf` files** to fix misclassifications, remove redundancies, add missing signals, and align profile scope.

The user invoked this command with: $ARGUMENTS

## Arguments

1. `$ARGUMENTS` is optional:
   - A profile name: `k8s`, `loc`, `mob`, `win` — if omitted, process all profiles
   - `Deep` — thorough cross-verification (slower)
   - `Dry` — read-only mode, report issues but do NOT modify `.conf` files

## Workflow

Follow the full workflow in `skills/mxt-doctor/SKILL.md`. Core loop:
1. Analyze project characteristics (git ls-files, project type, env conventions, deploy chain)
2. Save committed baseline, then run `mxt doctor --gen<profile>` + `mxt doctor --profile <profile>`
3. Diff committed vs fresh baseline, categorize discrepancies
4. **Directly remediate `.r2mo/doctor/<profile>/*.conf` files** based on findings (all 9 dimensions: file-list, file-hash, file-oob, meta-env, meta-deps, meta-tokens, meta-ports, code-interfaces, code-idempotency)
5. Re-scan to verify convergence (iterate up to 3 rounds)
6. Output remediation report

## What this skill CAN do

- Run `mxt doctor --gen<profile>` and `mxt doctor --profile <profile>`
- Run `git ls-files`, `git branch --show-current`, `diff`
- Read all files in `.r2mo/doctor/` and project source files
- **Modify `.r2mo/doctor/<profile>/*.conf` files** (baseline configs)
- **Modify `.r2mo/doctor/config.json`** (metadata)

## What this skill MUST NOT do

- Modify project source code, deploy scripts, env files, or deployment infrastructure
- Commit or push to git
- Delete `.r2mo/doctor/` directories or `.conf` files
- Reorder `.conf` files unnecessarily — only change lines that are wrong
