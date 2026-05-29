# R2MO Lain Codex Slash Commands

This directory is the project-local workspace for Codex `/` command development.

Only finished command files should be exposed as slash commands. Keep work-in-progress notes, templates, and conventions prefixed with `_` so they remain meta-documents instead of user-invocable commands.

## Current State

No runnable slash command is registered yet. The environment is initialized for later command development.

## File Rules

- Use `commands/<name>.md` for a finished command that should be invokable as `/<name>`.
- Use `commands/_<name>.md` for conventions, drafts, templates, and notes.
- Use lower-case kebab-case names, for example `run-task.md`.
- Include YAML frontmatter with at least `description`.
- Use `$ARGUMENTS` in the command body when the command needs user-provided arguments.
- Keep command text operational and verifiable: preflight, plan, commands, verification, summary, next steps.

## Validation

Run:

```bash
npm run validate:commands
```

The validator ignores underscore-prefixed Markdown files and checks finished command files for required structure.
