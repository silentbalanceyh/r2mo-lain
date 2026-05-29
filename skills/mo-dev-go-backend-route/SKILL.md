---
name: mo-dev-go-backend-route
description: Use when adding, removing, or moving Go backend modules under internal/apps, internal/system, internal/widgets, or internal/jobs where routes are generated
---

# Backend Dynamic Routing (Codegen)

## Overview

Backend module routing is **compile-time generated**. If you add/move a module and skip codegen, you create missing routes or duplicate route panics.

## When to Use

- You add/remove/move a module directory under:
  - `internal/apps/<name>/`
  - `internal/system/<name>/`
  - `internal/widgets/<name>/`
  - `internal/jobs/<name>/`
- You modify a module’s `routes.go` or its `RegisterRoutes` signature
- You see:
  - “module not found” during mounting
  - duplicate route registration panics

## Quick Reference

- **Codegen entry:** `cmd/codegen/main.go`
- **Generated output:** `internal/api/routes_gen.go`
- **Run:**
  - `go run cmd/codegen/main.go`
  - or `make codegen`

## Required Contract

### RegisterRoutes signature (MUST match)

```go
func RegisterRoutes(r *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
    handler := NewHandler(cfg, db)
    group := r.Group("/mymodule")
    {
        group.GET("/endpoint", handler.GetData)
    }
}
```

### Registry mounting (don’t bypass)

- Use `internal/registry/` to mount **generated** `BuiltinModules`.
- Do **not** manually import/register modules in `router.go`.

## Hard Rules (No Exceptions)

- **Never** hand-edit `internal/api/routes_gen.go`.
- **Never** “just wire it up quickly” by manually importing a module into `router.go`.
- **Never** re-apply `authMiddleware` inside module routes (parent group already has it).

## Common Rationalizations (and Why They’re Wrong)

| Excuse | Reality |
|---|---|
| “It’s one module, manual import is faster.” | Creates duplicates / drift; next codegen run breaks or overwrites behavior. |
| “Codegen is optional.” | Architecture requires generated registry; skipping causes missing mounts. |
| “I can tweak routes_gen.go directly.” | Generated file is overwritten; manual edits are lost and can break builds. |

## Red Flags — STOP

- You are about to edit `internal/api/routes_gen.go`
- You are about to import a module directly in `router.go`
- You changed `RegisterRoutes` signature

**All of these mean: run codegen and follow registry mounting.**
