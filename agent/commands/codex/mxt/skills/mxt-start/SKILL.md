---
name: mxt-start
description: Use when the user asks Codex to start the dev environment with "$mxt-start"; scans project mdc rules for startup commands, starts backend then frontend, verifies via network health check.
---

# MXT Start

## Harness

This Harness is the binding execution contract for this MXT command across Claude Code, Codex, and OpenCode. Treat localized sections below as legacy detail; this section wins when wording conflicts.

- English-first: write instructions, analysis, verification notes, and summaries in English by default. Use Chinese only when quoting existing repository content, preserving task titles/frontmatter/status values, showing exact localized command errors already required by this file, or when the user explicitly asks for Chinese.
- Rule loading: before task action, load repository entry rules (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`), project rule files (`.claude/rules`, `.codex/rules`, `.cursor/rules`, `.opencode`, other relevant `.mdc`), and `~/.codex/rules/r2mo-task-workflow.md` when present. Missing optional files do not block execution.
- Argument contract: resolve the explicit three-digit number first. If absent, list current-directory `.r2mo/task/` candidates only. Never resolve from parent, child, sibling, or historical timestamped task directories unless the user names that path.
- Task isolation lock: after resolving paths, print the locked path(s) before reading task content, and only read/write those locked `task-*.md`, `goon-*.md`, or `loop-*.json` files for this invocation.
- Disk source of truth: Do not trust conversation memory, previous summaries, installed plugin cache, or earlier reads. Re-read the locked files from disk immediately before decisions and again before write-back.
- Prompt echo: before editing, verification, or task execution, print the final action prompt in one Markdown code block with concrete paths substituted.
- Write-back guard: before any write, verify the destination exactly matches the isolation lock. Never duplicate `Plan` or `Changes`; update in place or append under the existing canonical section as instructed.
- Fresh evidence before completion claims: run the smallest sufficient verification for the changed boundary, read the output, and only then report success. Record skipped gates with the reason.
- Cross-agent portability: avoid tool-specific assumptions unless the platform section explicitly requires them. Keep prompts deterministic and safe for Claude Code, Codex skills, Codex prompts, and OpenCode JSON command templates.

Start the current project dev environment: scan project mdc for startup rules, start backend first then frontend, verify via network health check.

## Arguments

This command takes no arguments. Execute the environment startup flow directly.

**Hard rules**: Scan project mdc for startup rules first — mdc rules override defaults | Backend first, then frontend | Stop→Build→Start is idempotent | Health check required after startup | Self-check: verify executed commands match mdc rules

## MDC Scan Protocol

**Mandatory first step** — scan all project `.mdc` files for startup/shutdown rules before any action:

1. **Scan paths** (in order): `.claude/rules/*.mdc` → `.codex/rules/*.mdc` → `.cursor/rules/*.mdc` → `.opencode/*.mdc` → project root `*.mdc` → `AGENTS.md`/`CLAUDE.md`/`CODEX.md` embedded rules
2. **Search keywords**: `dev-start`, `dev-stop`, `dev-build`, `start`, `stop`, `launch`, `serve`, `run dev`, `npm run`, `mvn`, `spring-boot:run`, `vertx`, `hap`, `hvigor`, `health`, `port`, `environment`
3. **Extract**: startup command, stop command, build command, port config, health endpoint, dependency order, environment variables
4. **Rule**: If mdc defines startup commands → **must use mdc commands, not defaults**. If mdc has no startup rules → use default heuristics below.
5. **Output**: Print extracted startup rule summary before executing (so user can verify correctness).

## Idempotent Startup Guard

Every startup follows the same idempotent sequence — no half-states:

```
stop (if running) → build → start → health check
```

- If any step fails mid-sequence → report which step failed and the current state. Do NOT silently continue.
- If `stop` fails (process not found) → proceed to `build` (not an error).
- If `build` fails → **do not start**, report build error.
- If `start` fails → **do not health-check**, report start error.
- If health check fails → report error, suggest manual investigation.

## Workflow

### Phase 1 — Backend

1. Check if backend is running (based on mdc command signatures or port detection).
2. If running → stop first (`./dev-stop.sh` or mdc-defined stop command).
3. Build backend (`./dev-build.sh` or mdc-defined build command).
4. Start backend (`./dev-start.sh` or mdc-defined start command).
5. Health check: poll mdc-defined or default health endpoint (`curl -sf http://localhost:<port>/health`). Retry up to 60s (3s intervals).
   - If backend health check fails → **report error, do NOT start frontend**.

### Phase 2 — Frontend

1. Detect frontend directory: `app-center/`, `frontend/`, `web/`, `client/`, or mdc-defined path.
2. If running → stop first.
3. Install dependencies (only if `node_modules` missing or lockfile changed).
4. Start frontend (`npm run dev` or mdc-defined command).
5. Health check: `curl -sf http://localhost:<port>`. Retry up to 30s.

### Phase 3 — Self-Check (Drift Prevention)

Verify the commands actually executed match the mdc rules:

1. Compare executed commands against mdc-defined commands.
2. If any command was substituted (mdc not found, used default) → **warn the user**.
3. If mdc rules exist but were not followed → **report as error**.

## Commands

1. `find . -name "*.mdc" -exec grep -l "dev-start\|dev-stop\|dev-build\|start\|stop" {} +` — locate mdc startup rules
2. `pgrep -f "<startup-keyword>"` — detect running processes
3. `./dev-stop.sh` — stop (if running)
4. `./dev-build.sh` — build
5. `./dev-start.sh` — start
6. `curl -sf http://localhost:<port>/health` — backend health check
7. `ls -d app-center frontend web client 2>/dev/null` — detect frontend
8. `npm run dev` — start frontend
9. `curl -sf http://localhost:<port>` — frontend health check

## Verification

Report per component:
- mdc rule source file and extracted commands
- Executed commands vs mdc-defined commands (match/substituted)
- Build result, running status, health check result
- Any drift warnings (command substituted, mdc rule not followed)

## Summary

Report: mdc rule scan results, per-component startup status, health check outcomes, drift check result.

## Next Steps

Start completion typical paths:
- Development debugging → `$mxt-debug <description>`
- Execute a task → `$mxt-run <number>`
- Sync project → `$mxt-sync`
