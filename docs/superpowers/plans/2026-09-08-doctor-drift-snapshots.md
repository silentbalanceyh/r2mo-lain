# Doctor Drift Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `mxt doctor` with structured snapshots and cross-run drift analysis that distinguishes expected changes from abnormal drift.

**Architecture:** Keep `.conf` files as the authoritative baseline. During each scan, collect structured Git/baseline/current observations, write a reviewable `snapshot.json` beside the existing Markdown report, compare it with the latest prior snapshot, classify changes, and emit an `analysis.json` plus terminal analysis summary. SQLite is intentionally not introduced.

**Tech Stack:** Python 3 standard library, existing `mxt doctor` Python engine, existing CLI command contract.

**Spec:** The approved Option B design from the current conversation: audit snapshot + drift analyzer + JSON artifacts, with Markdown remaining human-readable.

## Global Constraints

- Do not add SQLite or any dependency.
- Preserve existing `mxt doctor --generate` and `mxt doctor --profile` behavior.
- Snapshot artifacts must be deterministic except explicit timestamp/run identifiers.
- Never store secret values in snapshots; store only baseline/current classification and, where needed, a hash.
- Existing user worktree changes outside this task must remain untouched.
- Run focused Python tests before implementation, then run package and CLI verification.

---

### Task 1: Snapshot and analysis primitives

**Files:**
- Create: `src/python/mxt_doctor_snapshot.py`
- Create: `tests/mxt_doctor_snapshot_test.py`

**Interfaces:**
- Produces:
  - `collect_git_context(cwd) -> dict`
  - `baseline_fingerprint(cwd, profile) -> dict`
  - `build_snapshot(cwd, profile, counts, baseline_fingerprint, git_context) -> dict`
  - `find_latest_snapshot(cwd, profile, exclude_path=None) -> path or None`
  - `load_json(path) -> dict`
  - `write_json_atomic(path, data)`
  - `analyze_snapshots(previous, current) -> dict`
  - `analysis_verdict(analysis) -> str`

**Steps:**
- [ ] Write failing tests for Git context, baseline fingerprint, snapshot write, prior-snapshot lookup, and expected/abnormal/unclassified classifications.
- [ ] Run the tests and confirm the module import fails.
- [ ] Implement minimal snapshot and analyzer primitives using only stdlib.
- [ ] Run tests until green.

### Task 2: Integrate snapshots into doctor scan

**Files:**
- Modify: `src/python/mxt_doctor_scan.py`
- Modify: `src/python/mxt_doctor_report.py`
- Test: `tests/mxt_doctor_snapshot_test.py`

**Steps:**
- [ ] Write a failing integration test that builds a temporary git project, generates a baseline, scans it, and asserts both `snapshot.json` and `analysis.json` exist with valid schemas.
- [ ] Modify `write_report` to create one timestamped report directory and return both Markdown and snapshot paths.
- [ ] Collect Git context and baseline fingerprints before scanning.
- [ ] Write `snapshot.json` after all dimensions are recorded.
- [ ] Write `analysis.json` after comparing with the latest valid prior snapshot.
- [ ] Run tests until green.

### Task 3: Human-readable drift analysis

**Files:**
- Modify: `src/python/mxt_doctor_report.py`
- Modify: `src/python/mxt_doctor_scan.py`
- Test: `tests/mxt_doctor_snapshot_test.py`

**Steps:**
- [ ] Write a failing test that asserts the Markdown report contains a `## Drift Analysis` section with verdict and classified changes.
- [ ] Extend `Report` to retain a structured analysis payload.
- [ ] Render verdict, previous run, baseline changed, Git changed, and each classified change.
- [ ] Print a concise terminal summary after the existing PASS/FAIL/WARN/SKIP counts.
- [ ] Run tests until green.

### Task 4: Documentation and command verification

**Files:**
- Modify: `docs/command/doctor.md`
- Modify: `docs/skills/mxt-doctor.md`
- Modify: `agent/commands/codex/mxt/skills/mxt-doctor/SKILL.md`
- Modify: `agent/commands/claude/mxt/commands/doctor.md`
- Modify: `agent/commands/codex/mxt/commands/doctor.md`
- Modify: `agent/commands/opencode/mxt/commands/doctor.md`

**Steps:**
- [ ] Update command documentation with snapshot/analysis artifacts and interpretation.
- [ ] Update the doctor skill workflow to require reading `snapshot.json` and `analysis.json`.
- [ ] Run focused Python tests.
- [ ] Run `npm test`.
- [ ] Run `node src/mxt.js help -c doctor`.
- [ ] Run an isolated temporary project scan twice to verify snapshot creation and analysis.
