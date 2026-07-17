---
severity: P2
title: P2-2026-07-16-mxt-end-acceptance-scope-creep
date: 2026-07-16
---

# P2-2026-07-16-mxt-end-acceptance-scope-creep

## Observed Bug

`mxt end` could turn a bounded acceptance pass into open-ended investigation. Small implementation work could lead to hours of deep review and expanding remediation items beyond the current task boundary.

## Root Cause

The end command already limited goon output to P0/P1 issues, but the instruction set did not explicitly stop depth expansion. Deep/strict wording could still encourage task-external implementation digging, adjacent-module investigation, speculative risk hunting, or follow-up topic discovery.

## Fix

- Added mandatory "收敛验收" constraints to Claude, Codex, and OpenCode end command templates.
- Added "禁止深挖", "不得扩散整改项", and "到点停止" requirements to the final end prompt.
- Added the same constraints to Codex `mxt-end` skill.
- Added a regression assertion covering all four end sources.
- Refreshed local and remote global installations for Codex, Claude, and OpenCode.

## Files Changed

- `agent/commands/claude/mxt/commands/end.md`
- `agent/commands/opencode/mxt/commands/end.md`
- `agent/commands/codex/mxt/commands/end.md`
- `agent/commands/codex/mxt/skills/mxt-end/SKILL.md`
- `src/index.test.js`

## Verification

- `npm test` -> `task tests passed`
- `npm run validate:commands` -> `No runnable slash commands found. Meta files only.`
- Local `installPlatforms(['codex','claude','opencode'])` completed: Codex 59 files, Claude 28 files, OpenCode 8 commands.
- Local global content check passed for Codex plugin/prompt/cache/marketplace, Claude user command/cache/marketplace, and OpenCode `mxt:end`.
- Remote `node src/index.test.js` on `lang@mxt.vms.io` -> `task tests passed`.
- Remote `installPlatforms(['codex','claude','opencode'])` completed: Codex 59 files, Claude 28 files, OpenCode 8 commands.
- Remote global content check passed for Codex plugin/prompt/cache/marketplace, Claude user command/cache/marketplace, and OpenCode `mxt:end`.
