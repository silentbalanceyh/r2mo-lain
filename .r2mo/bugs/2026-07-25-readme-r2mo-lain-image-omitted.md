---
severity: P3
title: P3-2026-07-25-readme-r2mo-lain-image-omitted
createdAt: 2026-07-25 07:31 CST
---

# BUG: README omitted the early R2MO-Lain image

## Observed Bug

`README.md` no longer showed the early `R2MO-Lain` image that existed in the original README history.

## Root Cause

The README was rewritten during the `mxt` documentation refresh and the `![R2MO-Lain](docs/images/r2mo-lain.png)` reference was dropped, while the image asset itself remained tracked in `docs/images/`.

## Fix

Restored the `R2MO-Lain` image reference in the README guide section.

## Files Changed

- `README.md`

## Verification

- `git show 95057f7^:README.md` confirmed the original `![R2MO-Lain](docs/images/r2mo-lain.png)` reference.
- `rg -n 'R2MO-Lain|docs/images/r2mo-lain.png' README.md && test -f docs/images/r2mo-lain.png` -> exit 0
