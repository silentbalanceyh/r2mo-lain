---
name: mxt-start
description: Use when the user asks Codex to start the dev environment with "$mxt-start"; reads mdc rules for startup commands, stops if running, rebuilds, then starts.
---

# MXT Start

Start the current project dev environment: follow mdc rules for commands, stop if already running, rebuild, then start.

## Arguments

This command takes no arguments. Execute the environment startup flow directly.

**Hard rules**: Must reference mdc rules | If already running → stop first, then rebuild, then start | Ensure starter stability

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. Scan mdc rules for project startup commands (e.g. `./dev-build.sh`, `./dev-start.sh`, `npm run dev`).
3. Detect if the environment is already running:
   - If running, execute the stop command first (e.g. `./dev-stop.sh`).
   - If not running, proceed to the next step.
4. Build the latest version (execute `./dev-build.sh` or the equivalent build command).
5. Start the environment (execute `./dev-start.sh` or the equivalent start command), ensuring stability with no extra steps.

## Verification

Report the startup command used, build result, and running status.
