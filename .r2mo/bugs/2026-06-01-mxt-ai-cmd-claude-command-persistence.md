---
severity: P2
title: P2-2026-06-01-mxt-ai-cmd-claude-command-persistence
createdAt: 2026-06-01 09:24 CST
---

# BUG: `mxt ai-cmd` Claude Code commands disappear after restart or update

## Observed Bug

`mxt ai-cmd` installed `mxt@mxt-skills` into Claude Code, but `/mxt:*` commands could disappear after Claude Code restart, reinstall, or update. `claude plugin list` could still show `mxt@mxt-skills` as installed, so plugin state alone was not a reliable verification signal.

## Root Cause

Claude Code command discovery was treated as equivalent to plugin installation. The installer wrote the plugin marketplace/cache state, but did not also write stable user command files under `~/.claude/commands/`. Since plugin cache and command indexing can be refreshed by Claude Code, relying on plugin/cache state made the command availability fragile.

## Fix

- Kept the existing `mxt@mxt-skills` identity unchanged.
- Added stable Claude user command installation to `~/.claude/commands/mxt:*.md`.
- Added explicit `commands` entries to the Claude plugin manifest.
- Updated tests to assert Claude user command files, Codex plugin config, and OpenCode command config.
- Updated README verification to check `/mxt:plan` availability instead of relying only on `claude plugin list`.

## Files Changed

- `src/utils/mxt-ai-cmd.js`
- `agent/commands/claude/mxt/.claude-plugin/plugin.json`
- `agent/commands/claude/mxt/plugin.json`
- `src/index.test.js`
- `README.md`

## Verification

- `npm test`
- Temp-home install check confirmed:
  - Claude writes `mxt:plan.md`, `mxt:run.md`, `mxt:end.md`, `mxt:goon.md`, `mxt:debug.md`, `mxt:sync.md`, `mxt:start.md` under `.claude/commands`
  - Claude only enables `mxt@mxt-skills`, not a new plugin identity
  - Codex config includes `mxt@mxt-skills`
  - OpenCode config contains all `mxt:*` commands
- `git diff --check`
