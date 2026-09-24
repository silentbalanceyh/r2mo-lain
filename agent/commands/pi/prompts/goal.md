---
description: Manage a Pi Agent goal (mirrors the Codex /goal and @narumitw/pi-goal command surface)
argument-hint: "[--tokens <budget>] <objective> | status | edit | pause | resume | clear"
---

# /goal — Pi Agent Goal

Codex ships a built-in `/goal`. On Pi the strongest equivalent is the third-party extension
`@narumitw/pi-goal`, whose command surface this file mirrors: `status`, `edit`, `pause`, `resume`, `clear`
(alias `stop`), plus an optional `--tokens` budget. This command reproduces that surface without the
extension by mapping the same intent onto a **pi-subagents goal mission** — a durable mission in goal mode
that re-notifies this session on each idle turn with the remaining token budget and the next ready action.

Pi Agent has no native Goal API, so two capabilities of the native extension are **not** reproduced here:

- A mission never launches work by itself. The native extension continues from Pi's settled idle boundary
  (`agent_settled`); a mission only reminds, so a continuation still needs a model turn.
- The native extension enforces runaway guards (`continuationLimits.automaticTurns`, default 25, and a
  no-progress guard). A mission does not. Only `--tokens` limits spending here.

Pi dispatches extension commands **before** prompt templates, so installing `@narumitw/pi-goal` silently
shadows this file. When that happens use the native `/goal` — its `goal_complete` / `goal_blocked` /
`goal_wait` tools and idle-boundary continuation are strictly stronger — and read this file as reference only.

Argument: `$ARGUMENTS`

## Parse

Split `$ARGUMENTS` exactly like the native command before dispatching.

1. An optional `--tokens <budget>` flag, allowed only as the **first** token. Accept a plain integer or a
   `k` / `m` suffix (`100k` → 100000, `1.5m` → 1500000). It must be a positive whole number; otherwise
   report the bad value and stop.
2. The rest is either the single route word `status`, `pause`, `resume`, `clear`, `stop`, `edit`, or free text.

Route words reject trailing arguments (`/goal pause now` is a usage error) and free text becomes the
objective. Reject an objective longer than 4000 characters and tell the user to reference a file instead.
When the first word is ambiguous, print the usage line instead of guessing a route.

## Dispatch

Run exactly one branch. Print the mission id and its status after every mutation so the user can recover it later.

1. **Empty argument or `status`** — report the current goal. Call the `subagent` tool with `action: "mission.list"`,
   pick the entry whose goal is `active` (or `budget-exhausted` / paused), and print title, id, status, token
   budget versus usage, and `state.nextReadyAction`. If no goal is active, say so and show the create form.
2. **`[--tokens <budget>] <objective>`** — any other free text. Check for an existing goal first; one goal per
   task, so offer `edit`, `pause`, or `clear` instead of silently replacing it. Then create the goal in one call:
   `subagent({ action: "mission.create", mission: { title: <short title>, objective: "<objective>", goal: true, budget: { tokens: <N> } } })`
   - `goal: true` requires `budget.tokens` as a positive integer. Use the `--tokens` value when given;
     otherwise use `200000` and state that assumption.
   - The objective must be self-contained: what to achieve, the boundary, and the completion criteria.
   - If creation fails, report the exact error and stop. Never claim a goal exists when it does not.
3. **`edit [--tokens <budget>] <objective>`** — patch the active goal with
   `subagent({ action: "mission.update", missionId: <id>, missionUpdate: { objective: "<new objective>" } })`.
   Pass `budget` only when `--tokens` was given. Editing keeps the existing goal, its elapsed time, and its
   cumulative usage: never reset the budget to hide spend that already happened.
4. **`pause`** — `subagent({ action: "mission.update", missionId: <id>, missionUpdate: { goal: { paused: true } } })`.
   Pause preserves progress and cancels pending continuation; it does not roll back work already done.
5. **`resume`** — the same call with `{ goal: { paused: false } }`. In the native extension resume also wakes a
   waiting goal; here it re-arms the notices of a goal that was paused or waiting.
6. **`clear`** / **`stop`** — `subagent({ action: "mission.close", missionId: <id>, missionStatus: "cancelled", summary: "<why it was cleared>" })`,
   then confirm with `mission.list`. Clearing is immediate and stops the goal notices; it must not touch
   unrelated in-flight work.

## State vocabulary

Report states with the native names so the user is not surprised when they switch to the extension. Map them
onto the mission record like this:

| Native state | Mission equivalent | Meaning |
| --- | --- | --- |
| `active` | `status: "active"`, goal not paused | Goal-owned work may continue |
| `paused` | `goal: { paused: true }` | Stopped by the user or a guard, progress preserved |
| `blocked` | `status: "needs_decision"` | Needs a user or external action before work can continue |
| `waiting` | `status: "waiting"` | Quiet: an external wake source was arranged |
| `usage_limited` | `status: "waiting"` with a provider note | Provider or account limit stopped the turn |
| `budget_limited` | goal state `budget-exhausted` | The token budget was reached; continuation stopped |
| `complete` | `status: "completed"` | Verified completion, with evidence |
| `cleared` | `status: "cancelled"` | Discarded by the user |

## Rules

- **Completion needs evidence.** Plain assistant text never completes a goal. Before closing as `completed`,
  inspect evidence for every named artifact, command, test, gate, and deliverable and match each check to the
  requirement it supports; weak, indirect, or missing evidence means the goal stays open. Record the checks in
  the `summary`, which is completion evidence rather than a status token.
- **`blocked` is narrow.** Report `blocked` only when the same blocker recurred for at least three consecutive
  goal turns, and include the specific required user or external action plus the concrete evidence from the
  failed attempts. Difficulty, uncertainty, ordinary clarification, and recoverable tool or provider failures
  are not blockers — keep working instead.
- **`waiting` needs a real wake source.** Report `waiting` only after arranging a monitor or other source that
  will inject a non-goal message when external state changes, and state the reason. Treat any deadline as a
  safety wake-up rather than a polling interval, prefer minute-scale deadlines, and omit it for an indefinite
  quiet wait.
- **Budgets are token budgets, not cost caps.** The final model call may exceed `budget.tokens`. Reaching it
  flips the goal to `budget-exhausted` and stops notices **without** closing the mission or declaring success;
  report that state and offer `edit` (raise the budget or narrow the objective) or `clear`.
- **Mission status values:** `planned`, `active`, `waiting`, `needs_decision`, `completed`, `failed`, `cancelled`;
  the goal itself can additionally be `budget-exhausted`. Allowed `missionUpdate` keys: `title`, `objective`,
  `goal`, `budget`, `status`, `summary`, `labels`, `artifacts`, `receipts`, `decisions`; `mission.close` accepts
  only `completed`, `failed`, or `cancelled`.
- **Keep continuation honest.** Goal mode only reminds, so the actual next step still comes from the task/goon
  artifacts on disk, re-read before every phase. Never claim a transition the tool did not return.
- **Never hand-edit mission records.** Always go through the `subagent` tool so the durable record under
  `~/.pi/agent/missions/` stays consistent.
