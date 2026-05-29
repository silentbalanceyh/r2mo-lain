---
name: mo-dev-go-module-api
description: Use when adding GET/PUT settings endpoints to existing Go modules with persistent JSON configuration
---

# Adding Module Settings API

## Overview

Add settings APIs to Go modules following the workspace JSON storage pattern with strict validation and response envelope.

## When to Use

- Adding GET/PUT config endpoints to apps/system/widgets modules
- Module needs persistent user-specific settings
- Settings stored as JSON in workspace (not DB)

## Core Pattern

**Endpoint convention:** GET/PUT `/api/<module>/config`
**Storage:** `workspace/<username>/.ft-webos/<module>.json`
**Response:** Always `{"success":bool,"data":any,"error":string}`

## Quick Reference

| File | Purpose |
|------|---------|
| `settings.go` | Model + validation + defaults |
| `service.go` | GetSettings, UpdateSettings, getSettingsPath |
| `handler.go` | GetSettings, UpdateSettings handlers |
| `routes.go` | Register GET/PUT /config |
| `settings_test.go` | Unit tests |

## Implementation Checklist

- [ ] **Response envelope enforced**: All handlers return `{"success":bool,"data":any,"error":string}`
- [ ] **Path validation**: Validate workspace path against root to prevent traversal
- [ ] **GET/PUT /config naming**: Use `/api/<module>/config` (not /settings)
- [ ] **JSON file storage**: `workspace/<username>/.ft-webos/<module>.json` (no DB)
- [ ] **Input validation**: Schema or field checks before processing
- [ ] **Error handling**: Log + HTTP status + error field populated

## Settings Model Template

```go
package mymodule

import "errors"

type MyModuleSettings struct {
    Field1 bool   `json:"field1"`
    Field2 string `json:"field2"`
}

var AllowedField2Values = []string{"option1", "option2"}
var ErrInvalidField2 = errors.New("invalid field2 value")

func DefaultSettings() *MyModuleSettings {
    return &MyModuleSettings{
        Field1: false,
        Field2: "option1",
    }
}

func (s *MyModuleSettings) Validate() error {
    if !contains(AllowedField2Values, s.Field2) {
        return ErrInvalidField2
    }
    return nil
}

func contains(slice []string, item string) bool {
    for _, v := range slice {
        if v == item {
            return true
        }
    }
    return false
}
```

## Service Layer Template

```go
func (s *Service) GetSettings(username string) (*MyModuleSettings, error) {
    path := s.getSettingsPath(username)

    // Validate path against workspace root
    if !strings.HasPrefix(path, s.cfg.WorkspaceRoot) {
        return nil, errors.New("invalid settings path")
    }

    data, err := os.ReadFile(path)
    if os.IsNotExist(err) {
        return DefaultSettings(), nil
    }
    if err != nil {
        return nil, fmt.Errorf("read settings: %w", err)
    }

    var settings MyModuleSettings
    if err := json.Unmarshal(data, &settings); err != nil {
        return nil, fmt.Errorf("parse settings: %w", err)
    }

    return &settings, nil
}

func (s *Service) UpdateSettings(username string, settings *MyModuleSettings) error {
    if err := settings.Validate(); err != nil {
        return err
    }

    path := s.getSettingsPath(username)

    // Validate path against workspace root
    if !strings.HasPrefix(path, s.cfg.WorkspaceRoot) {
        return errors.New("invalid settings path")
    }

    // Ensure directory exists
    if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
        return fmt.Errorf("create settings dir: %w", err)
    }

    data, err := json.MarshalIndent(settings, "", "  ")
    if err != nil {
        return fmt.Errorf("marshal settings: %w", err)
    }

    if err := os.WriteFile(path, data, 0644); err != nil {
        return fmt.Errorf("write settings: %w", err)
    }

    return nil
}

func (s *Service) getSettingsPath(username string) string {
    return filepath.Join(s.cfg.WorkspaceRoot, username, ".ft-webos", "mymodule.json")
}
```

## Handler Template

```go
func (h *Handler) GetSettings(c *gin.Context) {
    userVal, exists := c.Get("user")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{
            "success": false,
            "data":    nil,
            "error":   "unauthorized",
        })
        return
    }

    user := userVal.(models.User)
    settings, err := h.service.GetSettings(user.Username)
    if err != nil {
        logger.Error("Failed to get settings", "error", err)
        c.JSON(http.StatusInternalServerError, gin.H{
            "success": false,
            "data":    nil,
            "error":   "failed to load settings",
        })
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "success": true,
        "data":    settings,
        "error":   "",
    })
}

func (h *Handler) UpdateSettings(c *gin.Context) {
    userVal, exists := c.Get("user")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{
            "success": false,
            "data":    nil,
            "error":   "unauthorized",
        })
        return
    }

    var settings MyModuleSettings
    if err := c.ShouldBindJSON(&settings); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{
            "success": false,
            "data":    nil,
            "error":   "invalid request body",
        })
        return
    }

    user := userVal.(models.User)
    if err := h.service.UpdateSettings(user.Username, &settings); err != nil {
        logger.Error("Failed to update settings", "error", err)
        c.JSON(http.StatusBadRequest, gin.H{
            "success": false,
            "data":    nil,
            "error":   err.Error(),
        })
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "success": true,
        "data":    settings,
        "error":   "",
    })
}
```

## Route Registration

```go
func RegisterRoutes(r *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
    handler := NewHandler(cfg, db)
    group := r.Group("/mymodule")
    {
        group.GET("/config", handler.GetSettings)
        group.PUT("/config", handler.UpdateSettings)
    }
}
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using POST instead of PUT | Use PUT for updates (idempotent) |
| Returning raw struct | Always wrap in `{"success":bool,"data":any,"error":string}` |
| Skipping path validation | Validate against workspace root to prevent traversal |
| Using DB for settings | Use JSON files in workspace/<username>/.ft-webos/ |
| Endpoint named /settings | Use /config for consistency |
| No input validation | Call `settings.Validate()` before saving |

## Red Flags - STOP and Fix

- Response without success/data/error envelope
- File path not validated against workspace root
- Endpoint not named /config
- Settings stored in DB instead of JSON file
- No validation before UpdateSettings
- Swallowing errors without logging

**All of these mean: Fix before proceeding.**
