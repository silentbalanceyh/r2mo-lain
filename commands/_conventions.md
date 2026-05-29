# Slash Command Conventions

Follow these conventions for every finished Codex slash command in this repository.

## Frontmatter

Every runnable command file must start with YAML frontmatter:

```yaml
---
description: One-line summary of what the command does.
argument-hint: [optional-argument-shape]
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---
```

`description` is required. Keep `allowed-tools` narrow and only include tools the command actually needs.

## Required Sections

Each runnable command must include these sections:

- `# /command-name`
- `## Arguments`
- `## Preflight`
- `## Plan`
- `## Commands`
- `## Verification`
- `## Summary`
- `## Next Steps`

## Operational Rules

- Read `AGENTS.md` first and follow the project coding rules.
- Keep this repository CommonJS-only when commands ask Codex to write code.
- Prefer existing `src/epic` and `src/utils/mxt-*` helpers.
- Never ask Codex to use raw `readline` in executors; use `src/utils/mxt-menu.js`.
- Require explicit confirmation before destructive changes, publishing, pushing, or production-impacting actions.
- Do not print secrets or environment variable values.
- State the planned shell commands or file edits before performing them.
- Verify outcomes with concrete commands and summarize results.

## Naming

- File name `run-task.md` becomes `/run-task`.
- Do not create `README.md` in this directory; use `_README.md`.
- Prefix drafts with `_`, for example `_run-task-draft.md`.

## Argument Handling

Reference invocation input with `$ARGUMENTS`.

```md
The user invoked this command with: $ARGUMENTS
```

Parse arguments in plain language inside the command instructions. Ask a concise question only when an unsafe assumption would affect files, credentials, external systems, or production state.
