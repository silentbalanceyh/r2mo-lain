---
name: mxt-start
description: Use when the user asks Codex to start the dev environment with "$mxt-start"; detects backend/frontend, starts both, verifies via health check.
---

# MXT Start

Start the current project dev environment: detect backend and frontend, start backend first then frontend, verify via network health check.

## Arguments

This command takes no arguments. Execute the environment startup flow directly.

**Hard rules**: Must reference project mdc startup/shutdown rules before executing | Backend first, then frontend | Health check required after startup | If already running → stop first, then rebuild, then start

## Preflight

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, and `~/.codex/rules/r2mo-task-workflow.md` when present.
2. **Scan project mdc rules for startup/shutdown commands**: Search all `.mdc` files (`.claude/rules/`, `.codex/rules/`, `.cursor/rules/`, `.opencode/`) for sections containing `dev-start`, `dev-stop`, `dev-build`, `npm run`, `mvn`, `spring-boot:run`, or any startup/shutdown related directives. These mdc-defined rules **override** default heuristics — if mdc specifies exact commands, use them.

## Plan

### Step 1 — Detect Project Structure

Scan the project root for backend and frontend directories:

- **Backend indicators**: `pom.xml`, `build.gradle`, `package.json` with `dev-build.sh`/`dev-start.sh`, Spring Boot main class, Vert.x main class
- **Frontend indicators**: `package.json` in a sub-directory (e.g. `app-center/`, `web/`, `frontend/`) with `dev`/`start`/`serve` scripts
- **Multi-app workspace**: if multiple `app-*/` directories each have their own `package.json` and scripts (HarmonyOS pattern), detect the entry app from mdc rules

### Step 2 — Detect Running State

For each component (backend → frontend order):

1. Check if the process is already running based on mdc rule command signatures (e.g. `pgrep -f "dev-start.sh"`)
2. If running → execute stop command (`./dev-stop.sh` or equivalent)
3. If not running → proceed

### Step 3 — Build

1. Build backend first: `./dev-build.sh` or equivalent from mdc rules
2. Build frontend if detected: `npm run build` or equivalent
3. For multi-app workspaces: build the entry app (e.g. `app-center`) which covers dependencies

### Step 4 — Start

Start in dependency order — backend first, then frontend:

1. Start backend: `./dev-start.sh` or equivalent
2. Wait for backend to become ready (poll health endpoint or check process)
3. Start frontend: `npm run dev` or equivalent (if detected)
4. For multi-app workspaces: start the entry app only (others are loaded through it)

### Step 5 — Health Check

Verify each started component is actually reachable:

1. **Backend**: `curl -sf http://localhost:<port>/health` or the health endpoint from mdc rules. Retry up to 30s (3s intervals).
2. **Frontend**: `curl -sf http://localhost:<port>` or the dev server URL from mdc rules. Retry up to 20s (2s intervals).
3. Report per-component status: ✅ reachable or ❌ unreachable with last error.

## Commands

1. Read `.mdc` rules for `dev-start` / `dev-build` / `dev-stop` and port/URL configuration
2. Detect backend/frontend structure: `ls -d */package.json pom.xml build.gradle` and scan mdc rules
3. `./dev-stop.sh` — stop (if running)
4. `./dev-build.sh` — build backend
5. `./dev-start.sh` — start backend
6. `curl -sf http://localhost:<port>/health` — verify backend
7. `npm run dev` (frontend dir) — start frontend (if detected)
8. `curl -sf http://localhost:<port>` — verify frontend

## Verification

Report per component: startup command, build result, running status, and health check result (HTTP status or error).

## Summary

Report the detected project structure (backend-only / full-stack / multi-app), per-component startup status, and health check outcomes.

## Next Steps

Start completion typical paths:
- Development debugging → `$mxt-debug <description>`
- Execute a task → `$mxt-run <number>`
- Sync project → `$mxt-sync`
