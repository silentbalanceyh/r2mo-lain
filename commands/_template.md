---
description: Replace with a one-line command summary.
argument-hint: [arguments]
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# /replace-command-name

Replace this template name with the slash command name. Rename the file to `commands/<command-name>.md` only when the command is ready to expose.

## Arguments

The user invoked this command with: $ARGUMENTS

- `arg`: describe expected argument shape.

## Preflight

1. Read `AGENTS.md`.
2. Confirm the current working directory is the intended project root.
3. Check `git status --short` and do not overwrite unrelated dirty worktree changes.
4. Inspect the files relevant to the requested command before editing.

## Plan

State the action plan before executing it.

Include:

- Files or directories that may be read or edited.
- Shell commands that may run.
- Any confirmation required before destructive or external actions.

## Commands

Describe the operational steps Codex should perform.

Prefer:

- Existing project utilities in `src/utils/mxt-*`.
- `Ec` logging through `src/epic`.
- Targeted verification over broad unbounded scans.

## Verification

Run the smallest concrete verification that proves the command completed correctly.

Use relevant checks such as:

```bash
node src/mxt.js version
node src/mxt.js help
npm run validate:commands
```

## Summary

Report:

- What changed.
- What was verified.
- Any skipped validation and why.

## Next Steps

List only actionable follow-ups that naturally follow from the result.
