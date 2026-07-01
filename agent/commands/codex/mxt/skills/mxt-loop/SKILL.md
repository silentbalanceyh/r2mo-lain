---
name: mxt-loop
description: Use when the user asks Codex to run a closed-loop task workflow by number, such as "$mxt-loop 001" or "mxt-loop 001"; sequentially executes RUN→END→CHECK_GOON→[GOON_FIX→END_REVIEW]↺CHECK_GOON until the goon remediation file is empty. v3.1 adds MDC intent-driven rule loading (discover→analyze intent→match→inject at RUN only), Status state machine (task: Active→Running→Done/Blocked, goon: Active→InProgress→Done/Closed), role separation (execution ≠ review), machine-first counting (grep-based), and checkpoint resume via loop-NNN.json.
---

# MXT Loop v3.1 — Task Closed Loop (MDC Intent-Driven)

Closed-loop task workflow with status state machine, role separation, machine-first counting, checkpoint resume, and MDC intent-driven rule loading.

**v3.1 Upgrades**:
- **MDC Intent-Driven Loading** ⚠️ NEW: RUN phase discovers available .mdc → analyzes task intent via grep signal keywords → matches relevant rules → cat injects only matched rules into Agent prompt. END/GOON/END_REVIEW reference from state file. No blind full-loading, no repeated discovery.
- **v3 Core**: Status State Machine, Role Separation, Machine First, Checkpoint Resume

## Arguments

The user must provide a task number such as `001`.

If the number is missing, scan `.r2mo/task/` for `task-*.md` files, read the `title` and `status` from each file's frontmatter, list the number and title for the user to choose from, and continue with the selected number. If no `task-*.md` files exist, tell the user to create a task first.

If the number is provided but does not match a valid number pattern, stop and say:

`请使用 $mxt-loop 001 格式执行，其中 001 是任务编号。`

## Smart Preflight

Before starting, perform mechanical checks to determine entry point:

```bash
cat .r2mo/task/loop-<number>.json 2>/dev/null || echo '{"phase":"INIT"}'
grep 'status:' .r2mo/task/task-<number>.md | head -1
grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<number>.md 2>/dev/null; true
grep 'status:' .r2mo/task/goon-<number>.md 2>/dev/null | head -1
```

Entry point determination:
- task=Done + goon count=0 + goon status=Done/Closed → ✅ Skip to Phase 5 (report, zero operations)
- loop-NNN.json missing or phase=INIT → Phase 1
- Other phases → resume from checkpoint

If task status ≠ Active and ≠ Running → set `status: Active` in task frontmatter.

## Status State Machine

### Task Status Flow
```
Active → Running → Done
  ↓        ↓        ↓
  └────────┴───→ Blocked → (manual intervention)
```

### Goon Status Flow
```
Active → InProgress → Done
  ↓                    ↓
  └────────────────────┘
           ↓
        Closed (all WONTFIX)
```

**Hard constraint**: Every phase must change the corresponding frontmatter status. No skipping allowed (e.g., Active directly → Done without passing through Running).

## Workflow

### Hard Rules

| Rule | Description |
|------|-------------|
| Task isolation | Only read/write task-NNN.md, goon-NNN.md, loop-NNN.json |
| Quality gate mandatory | Build/lint/test must all pass before writing Done + Changes |
| Unique termination | `grep -c '^## 整改项 [0-9]\+ —' goon-NNN.md` returns 0 |
| 2-round stalemate | Remaining items marked WONTFIX, no more loop iterations |
| No round limit | Continue as long as goon items decrease |
| Independent quality gates | Each round runs fresh, no reusing prior results |
| Checkpoint every phase | State file updated after each phase |
| Status explicit transition | Change frontmatter status at every phase boundary |
| Role separation | Execution and review phases do not share the same step |
| MDC intent-driven | RUN: discover→analyze intent→match→inject. END/GOON: read from state file. No blind full-load |

### Machine-First Principle

All counting/judgment operations use Bash — NEVER rely on model reading comprehension:

| Operation | Machine Method |
|-----------|---------------|
| Count goon items | `grep -c '^## 整改项 [0-9]\+ —' goon-NNN.md` |
| Check goon empty | grep returns 0 or frontmatter `item_count: 0` |
| Check quality gates | Actually run build/lint/test commands |
| Format compliance | grep for illegal formats |
| Status check | `grep 'status:' task-NNN.md` |
| Discover MDC candidates | `find . -maxdepth 3 \( -path "*/.cursor/rules/*.mdc" -o -path "*/.claude/rules/*.mdc" \)` |
| Analyze task intent | `grep -qiE 'auth|security|...' task-NNN.md` extract signal keywords |
| Match MDC to intent | Cross-reference signals with mdc filenames (security↔security, dbe↔dbe, etc.) |

### State File

Path: `.r2mo/task/loop-<number>.json`

```json
{
  "task": "<number>",
  "phase": "INIT|RUN|END|CHECK_GOON|GOON_FIX|END_REVIEW|DONE",
  "loop": 0,
  "prevRemaining": -1,
  "staleCount": 0,
  "startedAt": "<ISO8601>",
  "lastCheckpoint": "<ISO8601>",
  "goonItemCount": 0,
  "filesChanged": [],
  "qualityGateResults": {},
  "subproject": "",
  "errorLog": [],
  "mdcFiles": []
}
```

### Phase 1 — RUN (Execution)

> ⚠️ Execution phase: write code only, no reviewing.

**MDC Intent-Driven Loading (before each Agent call)**:
1. **Discover**: `find` all .mdc candidates (workspace + subproject scope)
2. **Analyze intent**: `grep` task content for signal keywords (auth/security/dbe/spring/plugin/extension/rbac)
3. **Match**: Cross-reference signals with mdc filenames, select only relevant rules
4. **Inject**: `cat` matched mdc content into Agent prompt as `## MDC 规则上下文`

> ⚠️ No blind full-loading. END/GOON phases reference mdcFiles from state file.

1. Set task status: `Active` → `Running`
2. Load MDC rules (intent-driven, see above)
3. Read task file (skip frontmatter), implement according to requirements
4. **Quality gate (mandatory)**:
   - Go: `GOPROXY=https://goproxy.cn,direct go build ./...`
   - TypeScript: `npx tsc -b --noEmit`
5. On pass: Append `## Changes` to task, set status to `Done`
6. Write state file: phase="END", include mdcFiles matched list

### Phase 2 — END (Review)

> ⚠️ Review phase: review code only, no modifications. MDC rules from state file mdcFiles (loaded at RUN, not re-discovered).

1. `cat` mdcFiles from state file for rule context
2. Get code changes: `git diff --stat` or directory comparison
3. Run quality gate independently (no reuse of Phase 1 results)
4. Review against task requirements + MDC rules: completeness, quality, naming, omissions, bugs
5. Write goon file with correct format:
   - No issues: `status: Done, item_count: 0, "无待整改项"`
   - Issues found: `status: Active, item_count: <N>`, each as `## 整改项 N — <description>`
   - **Format rule**: Title must use `## 整改项 N —` (Chinese em-dash). No `- [ ]` checkboxes. No numbered markdown.
5. Format verification (mechanical): grep for illegal formats; rewrite if found
6. Write state file: phase="CHECK_GOON"

### Phase 3 — Check Goon (Mechanical)

```bash
GOON_COUNT=$(grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<number>.md 2>/dev/null; true)
STATUS=$(grep 'status:' .r2mo/task/goon-<number>.md 2>/dev/null | head -1)
```

- GOON_COUNT=0 or STATUS contains Done/Closed → ✅ Phase 5
- GOON_COUNT>0 → Phase 4

### Phase 4 — GOON → END Loop

Initialize from state file: loop count, prevRemaining, staleCount.

**Phase 4a — GOON Fix (Execution)**:
> ⚠️ Execution phase: fix code only, no reviewing. MDC rules from state file mdcFiles.

1. `cat` mdcFiles from state file for rule context
2. Set goon status: `Active` → `InProgress`
3. Read goon items, fix each one: analyze root cause → modify files → run quality gate
3. Mark each item: ✅ fixed or ⚠️ WONTFIX with reason
4. Append fix record to task Changes
5. Output: `GOON_RESULT: 修复X项 跳过Y项`

**Phase 4b — END Review (Review)**:
> ⚠️ Review phase: verify fixes only, no modifications. MDC rules from state file mdcFiles.

1. `cat` mdcFiles from state file for rule context
2. Re-verify each fix: re-run quality gate (no reuse), remove fixed items, keep failures, add new issues
2. **Stalemate detection**: current remaining ≥ previous → staleCount++; 2 consecutive rounds → mark remaining as WONTFIX, set task status to `Blocked`
3. Rewrite goon file with updated status: Done (all fixed), Closed (all WONTFIX), Active (items remain)
4. Append review record to task Changes
5. Output: `END_RECHECK: 剩余X项 新发现Y项 僵持:true/false`
6. Update state file, loop++, return to Phase 3

### Phase 5 — Closure Report

1. Run final mechanical verification:
   ```bash
   grep -c '^## 整改项 [0-9]\+ —' .r2mo/task/goon-<number>.md 2>/dev/null; true
   grep 'status:' .r2mo/task/task-<number>.md | head -1
   grep 'status:' .r2mo/task/goon-<number>.md | head -1
   ```
2. Write state file: phase="DONE"
3. Output closure report with: task number, status flow, loop rounds, stalemate count, changed files, quality gate results

### Termination Conditions

| Condition | Rule |
|-----------|------|
| **Normal** | goon count=0 + task Done + goon Done/Closed |
| **Stalemate** | 2 consecutive rounds no reduction → task Blocked, goon Closed |
| **Preflight skip** | task Done + goon empty → Phase 5 directly, zero operations |

## Verification

After completion, verify:
- goon mechanical count is 0
- task status is Done
- goon status is Done or Closed
- Changes records are complete with all iteration history
- Quality gates pass

## Summary

Report: task number, total loop rounds, final goon status, key changed files, quality gate results.

## Next Steps

- Continue with another task → `$mxt-loop <another-number>`
- Manual review → `$mxt-end <number>`
- Manual fix → `$mxt-goon <number>`
- Dev environment → `$mxt-start`
