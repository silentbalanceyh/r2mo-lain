---
description: "Use when the user asks Codex to run the start MXT workflow; starts backend → frontend → health-verified dev environment."
argument-hint: ""
---

# /mxt:start

## HARNESS

1. Load before any action; silently skip missing files:
   AGENTS.md · CLAUDE.md · CODEX.md · .claude/rules/*.mdc · .codex/rules/*.mdc · .cursor/rules/*.mdc · .opencode/*.mdc · ~/.codex/rules/r2mo-task-workflow.md
2. Output English-first; quote localized repo strings verbatim when needed.
3. Disk is the only state carrier; re-read before every decision and write-back.
4. Print `Lock: <paths>` before first read; only locked paths may be mutated.
5. Run the smallest sufficient verification per change boundary; record skipped gates with reason.
6. When this skill declares a required superpowers skill, invoke it via the Skill tool; fall back manually only on explicit `skill not found` error.


## ARGUMENTS

None.

## CONTRACT

Startup order is fixed: **backend first → frontend parallel → network health**.
Idempotent restart: stop existing → verify stopped → build → start → health-check.
Every action cites its rule source: `[MDC]` or `[INFERRED]`.
Failure cleanup: stop only processes this run started.
Backend must pass health before frontend starts.

## MDC SCAN

Priority order (silently skip missing):

1. `.claude/rules/*.mdc`
2. `.codex/rules/*.mdc`
3. `.cursor/rules/*.mdc`
4. `.opencode/*.mdc`
5. Project root `*.mdc`
6. Files referenced by AGENTS.md / CLAUDE.md / CODEX.md

Extract and label `[MDC]` or `[INFERRED]`:

- start / stop / build commands + args
- ports
- health endpoints
- dependency order
- required env vars

## WORKFLOW

| # | Phase | Action |
|---|---|---|
| 1 | Backend stop | Detect (pgrep/port). Running → stop → re-detect. Still alive → abort. |
| 2 | Backend build | Run build command. Failure → abort. |
| 3 | Backend start | Run start command (detached). Capture PID. |
| 4 | Backend health | Poll endpoint every 3s ≤60s. Timeout → abort before frontend. |
| 5 | Frontend start | Parallel-start all declared frontends. |
| 6 | Network health | Verify every declared URL returns 2xx. |
| 7 | Report | Started services + ports + health URLs + rule sources. |

## FAILURE MODES

- Stop failure → abort; never force-kill silently.
- Build failure → no start; existing healthy processes remain.
- Backend health failure → no frontend; cleanup backend.
- Frontend failure → backend keeps running; report and suggest retry.
- Network failure → report all endpoints; mark partial state.

## RULES

- Never start frontend before backend health passes.
- Success requires health evidence, not a spawned PID.
- Every MDC command overrides inferred defaults.
- Every kill cites its detection evidence.

## NEXT

```text
Dev work → /mxt:run NNN
Baseline → /mxt:doctor
Sync → /mxt:sync
```
