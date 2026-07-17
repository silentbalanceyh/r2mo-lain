---
severity: P2
title: P2-2026-07-16-mxt-goon-cache-skip-checks
date: 2026-07-16
---

# P2-2026-07-16-mxt-goon-cache-skip-checks

## Observed Bug

`mxt goon` could be executed by cache-heavy models such as Deepseek using prior conversation or cached summaries instead of reloading the current `.r2mo/task/goon-xxx.md` file. This could make the agent skip remediation checks or incorrectly conclude that there were no pending goon items.

During remote rollout, the OpenCode installer also failed on a valid `opencode.json` because JSONC comment stripping ran before plain JSON parsing and treated `//` inside command template strings as comments.

## Root Cause

- The goon command and Codex skill prompts did not explicitly make a fresh filesystem read of `goon-xxx.md` the first required step for every invocation.
- `readJsonc()` stripped comments before trying plain JSON parsing, corrupting valid JSON strings that contained `//` in embedded command templates.

## Fix

- Added mandatory "强制重新加载" guidance to Claude, Codex, and OpenCode goon command templates.
- Added the same no-cache requirement to the Codex `mxt-goon` skill.
- Made the fresh `goon-xxx.md` body the only remediation input for a goon invocation.
- Updated `readJsonc()` to parse valid JSON first and only fall back to JSONC normalization when raw JSON parsing fails.
- Refreshed local and remote global installations for Codex, Claude, and OpenCode.

## Files Changed

- `agent/commands/claude/mxt/commands/goon.md`
- `agent/commands/opencode/mxt/commands/goon.md`
- `agent/commands/codex/mxt/commands/goon.md`
- `agent/commands/codex/mxt/skills/mxt-goon/SKILL.md`
- `src/utils/mxt-ai-cmd.js`
- `src/index.test.js`

## Verification

- `npm test` -> `task tests passed`
- `npm run validate:commands` -> `No runnable slash commands found. Meta files only.`
- Local `installPlatforms(['codex','claude','opencode'])` completed: Codex 59 files, Claude 28 files, OpenCode 8 commands.
- Local global content check passed for Codex plugin/prompt/cache/marketplace, Claude user command/cache/marketplace, and OpenCode `mxt:goon`.
- Remote `installPlatforms(['codex','claude','opencode'])` on `lang@mxt.vms.io` completed: Codex 59 files, Claude 28 files, OpenCode 8 commands.
- Remote global content check passed for Codex plugin/prompt/cache/marketplace, Claude user command/cache/marketplace, and OpenCode `mxt:goon`.
- Remote `node src/index.test.js` -> `task tests passed`.
