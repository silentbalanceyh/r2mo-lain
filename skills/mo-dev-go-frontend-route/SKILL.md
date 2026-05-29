---
name: mo-dev-go-frontend-route
description: Use when adding, removing, or moving Vue modules under web/src/apps, web/src/system, web/src/widgets, or web/src/jobs where module routing is code-generated
---

# Frontend Dynamic Routing (Codegen)

## Overview

Frontend module routing is **compile-time generated**. Manually importing modules or skipping codegen creates missing registry entries and runtime module errors.

## When to Use

- You add/remove/move a module under:
  - `web/src/apps/<name>/`
  - `web/src/system/<name>/`
  - `web/src/widgets/<name>/`
  - `web/src/jobs/<name>/`
- You change a module `index.ts` manifest
- You see errors like `Cannot find module '@/generated/modules'` or modules missing in UI

## Quick Reference

- **Codegen script:** `web/scripts/codegen.js`
- **Generated output:** `web/src/generated/modules.ts`
- **Run:**
  - `cd web && npm run codegen`
  - or `make codegen`

## Required Manifest Contract

```ts
export const manifest: AppManifest = {
  id: 'app-name',
  title: { en: 'App Name', zh: '应用名称' },
  icon: 'icon-name',
  component: () => import('./App.vue')
}
```

**Critical:** Use `title` (not `name`) for i18n labels.

## Hard Rules (No Exceptions)

- **Never** hand-edit `web/src/generated/modules.ts`.
- **Never** manually import/register modules in window manager or control panel.
- **Never** skip codegen after adding/moving a module.

## Common Rationalizations (and Why They’re Wrong)

| Excuse | Reality |
|---|---|
| “It’s faster to import manually.” | Registry stays stale; module won’t appear in app launcher. |
| “Codegen is optional.” | Generated registry is required for discovery and lazy-loading. |
| “I can tweak generated file.” | Overwritten on next codegen run; breaks consistency. |

## Red Flags — STOP

- You are about to edit `web/src/generated/modules.ts`
- You are about to add manual imports for a module
- You are skipping `npm run codegen`

**All of these mean: run codegen and use the manifest discovery pattern.**
