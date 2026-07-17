---
severity: P2
title: P2-2026-07-07-mxt-task-goon-history-residue
createdAt: 2026-07-07 10:12 CST
---

# BUG: `mxt task` archived tasks leave stale `goon-xxx.md` remediation traces

## Observed Bug

When `mxt task` moves `task-xxx.md` into history, the corresponding `.r2mo/task/goon-xxx.md` file is left unchanged. Old remediation content can remain visible after the task itself has already been archived.

## Root Cause

The task archive path only wrote the historical `task-xxx.md` copy and removed the active task file. It did not derive the matching `goon-xxx.md` path from the task slot number or clear that file during archival.

## Fix

- Added archive-time cleanup for the matching `goon-xxx.md` file.
- Kept the goon file in place but rewrote it to an empty file, so no prior remediation traces remain.
- Skipped cleanup silently when the matching goon file does not exist.
- Added a regression assertion for thread-shrink archival to verify `goon-004.md` is cleared when `task-004.md` is archived.

## Files Changed

- `src/executor/executeTask.js`
- `src/index.test.js`

## Verification

- `node --check src/executor/executeTask.js`
- Focused temp-project verification: archived `task-004.md` and confirmed `.r2mo/task/goon-004.md` content became empty.
- `node src/index.test.js` currently stops on an existing OpenCode goon template wording assertion: expected `整改完成后必须先清空 <GOON_PATH> 原始内容`, while the current template says `质量门禁全部通过后，先清空 <GOON_PATH> 原始内容`.
