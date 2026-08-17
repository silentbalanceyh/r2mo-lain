---
description: "Start dev environment: backend first → frontend parallel → network health check. Rebuilds if already running."
argument-hint: ""
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt:start

## Harness

Binding execution contract for all MXT commands across Claude Code, Codex, and OpenCode.

- **English-first.** Write all output in English. Use Chinese only when quoting existing repo content (task titles, frontmatter values, status fields, localized error messages) or when the user explicitly asks.
- **Rule loading.** Load `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `.claude/rules/*.mdc`, `.codex/rules/*.mdc`, `.cursor/rules/*.mdc`, `.opencode/*.mdc`, and `~/.codex/rules/r2mo-task-workflow.md` before task action. Missing files do not block.
- **Argument contract.** Resolve the three-digit task number first. If absent, list `.r2mo/task/` candidates in the current directory only. Never resolve from parent/sibling/historical directories.
- **Isolation lock.** Print locked path(s) before reading. Only read/write locked `task-*.md` and `goon-*.md` files.
- **Disk source of truth.** Re-read locked files from disk before decisions and before write-back. Do not trust conversation memory, summaries, or cache.
- **Prompt echo.** Print the final action prompt in a code block before editing or execution.
- **Write-back guard.** Verify destination matches isolation lock before any write. Never duplicate `Plan` or `Changes`; update in place.
- **Fresh evidence.** Run the smallest sufficient verification for the changed boundary before claiming success. Record skipped gates with reason.
- **Cross-agent portability.** Keep prompts deterministic and safe for Claude Code, Codex skills, and OpenCode JSON templates.

Start the current project dev environment: backend first → frontend in parallel → network health verification.

The user invoked this command with: $ARGUMENTS

This command takes no arguments. Execute the environment startup flow directly.

**Hard rules**: Backend first → frontend parallel. Already running → stop, rebuild, restart. Network verification mandatory after startup. Verification failure → report error. MDC startup/shutdown rules take priority over default inference. Idempotent: stop must succeed before continuing.

## Preflight

1. Load repo entry rules and all `.mdc` rule files (see Harness § Rule loading).

2. **MDC startup/shutdown rule scan protocol** (mandatory, cannot be skipped):

   **Scan paths** (in priority order):
   - `.claude/rules/*.mdc` → `.codex/rules/*.mdc` → `.cursor/rules/*.mdc` → `.opencode/*.mdc`
   - All `.mdc` files in project root and subdirectories
   - Rule files referenced by `AGENTS.md`, `CLAUDE.md`, `CODEX.md`

   **Search keywords** (any match → extract):
   - Start: `dev-start`, `npm run dev`, `npm start`, `mvn spring-boot:run`, `vertx`, `hvigor`, `hap`, `serve`, `launch`
   - Stop: `dev-stop`, `stop`, `shutdown`, `kill`
   - Build: `dev-build`, `npm run build`, `mvn compile`, `mvn package`, `hvigor build`
   - Port: `port`, `localhost:`, `0.0.0.0:`
   - Health: `health`, `actuator`, `ping`, `readiness`
   - Order: `depends on`, `before`, `after`

   **Extract**: start/stop/build commands and args, port config, health check endpoints, startup dependency order, environment variable requirements.

   **Execution strategy**: If MDC defines startup/shutdown rules → **must use MDC**. If MDC is undefined → use default inference from Plan. Output a rule summary table as input for all subsequent steps.

## Plan

### Phase 1 — Backend Check and Start (Idempotent)

1. **Stop backend** (if running):
   - Detect process via startup command pattern (e.g. `pgrep -f "dev-start.sh"`) or port (`lsof -i :<port>`)
   - If running → execute stop command (MDC-defined or `./dev-stop.sh`)
   - **Idempotent guarantee**: After stop, re-detect process; if still running → report error and abort
   - If not running → continue

2. **Build backend**: Execute build command (MDC-defined or `./dev-build.sh`). Build failure → report error and abort.

3. **Start backend**: Execute start command (MDC-defined or `./dev-start.sh`).

4. **Backend readiness**:
   - Poll health check endpoint (MDC-defined or `http://localhost:<port>/health`), max 60 seconds (3s interval)
   - Backend not ready → report error and abort, **do not start frontend**

### Phase 2 — Frontend Check and Start (Parallel)

1. **Detect frontend project directory**:
   - HarmonyOS multi-app structure (`app-center/`, `entry/`) → identify as multi-frontend workspace, default start `app-center`
   - Standard structure (`frontend/`, `web/`, `client/`) → standard frontend-backend separation
   - No independent frontend dir → skip frontend startup

2. **Stop frontend** (if running): Detect (`pgrep -f "vite"` or `pgrep -f "npm.*dev"`). If running → stop; else continue.

3. **Install frontend dependencies** (only if `node_modules` missing or `package-lock` changed)

4. **Start frontend**: Execute start command (MDC-defined or `npm run dev`)

### Phase 3 — Network Health Verification

1. Backend: `curl -sf http://localhost:<port>/health` or MDC-extracted health endpoint
   - 2xx → OK; no response or non-2xx → FAIL, report error details

2. Frontend: `curl -sf http://localhost:<port>/` or MDC-extracted frontend URL
   - 2xx → OK; no response → WARN (may need more startup time, report warning not abort)

3. **Self-check**: Compare actual executed commands with MDC rules
   - Used default inference instead of MDC rules → report "MDC has no startup/shutdown rules, used default inference"
   - MDC rules inconsistent with actual execution → report drift warning

4. Output verification summary:

| Service | Address | Status | Rule Source |
|---------|---------|--------|-------------|
| Backend | http://localhost:xxxx | OK/FAIL | mdc:xxx / default |
| Frontend | http://localhost:xxxx | OK/FAIL/WARN | mdc:xxx / default |

## Verification

Report: backend start command, build result, health check status, rule source; frontend start command, running status, access address, rule source; network endpoint reachability; MDC consistency self-check result. Mark FAIL explicitly with troubleshooting suggestions for any failure.

## Next Steps

- Development/debugging → `/mxt:debug <description>` or `$mxt-debug <description>`
- Execute task → `/mxt:run <number>` or `$mxt-run <number>`
- Sync project → `/mxt:sync` or `$mxt-sync`
