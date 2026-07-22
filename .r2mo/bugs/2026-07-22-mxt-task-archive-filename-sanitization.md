---
severity: P2
title: P2-2026-07-22-mxt-task-archive-filename-sanitization
createdAt: 2026-07-22 11:16 CST
---

# BUG: `mxt task` archive filenames can fail on special title characters

## Observed Bug

When `mxt task` archives an active task, the history filename is derived from the task frontmatter `title`. Titles containing special filename characters or control characters can produce invalid path names and make archive file generation fail.

## Root Cause

The archive filename sanitizer only replaced a small Windows-reserved character set with `-`. It did not follow the requested underscore replacement convention, and it did not strip control characters such as NUL/C0 bytes that can break `fs.writeFile` path handling.

## Fix

- Changed task archive title sanitization to replace reserved filename characters and control characters with `_`.
- Collapsed repeated underscores and removed trailing spaces/dots from the title fragment.
- Added UTF-8 byte truncation for the title fragment to keep generated filename components within a safe length.
- Added a regression test that archives a task whose title contains `/ \ : * ? " < > |` and a control character.

## Files Changed

- `src/executor/executeTask.js`
- `src/index.test.js`

## Verification

- `node src/index.test.js` -> `task tests passed`
- `npm test` -> `task tests passed`
- `node --check src/executor/executeTask.js && node --check src/index.test.js` -> exit 0
