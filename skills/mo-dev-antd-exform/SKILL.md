---
name: mo-dev-antd-exform
description: Use when implementing ADD/EDIT/FILTER forms with ExForm component in React/Ant Design projects using the zero-ui framework
---

# ExForm Component Patterns

## Overview

ExForm provides standardized form handling with three modes (ADD/EDIT/FILTER), automatic validation, i18n integration, and Redux state synchronization.

## When to Use

- Building ADD forms for creating new records
- Building EDIT forms for updating existing records
- Building FILTER forms for search/query interfaces
- Need automatic form validation and submission handling
- Need integration with framework's dialog/notification system

## Form Modes Quick Reference

| Mode | yoForm Call | Purpose |
|------|-------------|---------|
| ADD | `Ex.yoForm(this, null)` | Create new record |
| EDIT | `Ex.yoForm(this, null, $inited)` | Edit existing record |
| FILTER | `Ex.yoFilter(this)` | Filter/search form |

## Hard Rules (No Exceptions)

- **Never** use raw Ant Design `<Form>` instead of `<ExForm>`
- **Never** hardcode form configuration in JSX (use resource JSON `_form` block)
- **Never** write custom `onFinish` handlers (use `$op` prop with `Ex.form()` API)
- **Never** skip `@Ux.zero` decorator with `Ux.rxEtat` builder
- **Never** forget `.form()` in decorator for FILTER mode
- **Never** forget `.raft(1)` for single-column FILTER layout
- **Never** pass `$inited` to ADD mode (only EDIT needs it)

## Basic Pattern

```jsx
import {ExForm} from "ei";

// ADD mode
const form = Ex.yoForm(this, null);
return <ExForm {...form} $height="300px" $op={Op.actions}/>;

// EDIT mode with data
const {$inited = {}} = this.props;
const form = Ex.yoForm(this, null, $inited);
return <ExForm {...form} $height="300px" $op={Op.actions}/>;

// FILTER mode
const form = Ex.yoFilter(this);
return <ExForm {...form} $op={Op.actions}/>;
```

## RxEtat Decorator Configuration

```js
// ADD form
@Ux.zero(Ux.rxEtat(require('../Cab'))
    .cab("UI.Add")
    .to()
)

// EDIT form
@Ux.zero(Ux.rxEtat(require('../Cab'))
    .cab("UI.Edit")
    .to()
)

// FILTER form (single column)
@Ux.zero(Ux.rxEtat(require('../Cab'))
    .cab("UI.Filter")
    .raft(1)            // Single column layout
    .form()             // Enable form binding
    .to()
)
```

## Op.js Handler Pattern

```js
// All handlers MUST have $op prefix
const $opAdd = (reference) => (params) =>
    Ex.form(reference).add(params, {
        uri: '/api/resource',
        dialog: 'added'     // i18n key for success message
    });

const $opSave = (reference) => (params) =>
    Ex.form(reference).save(params, {
        uri: '/api/resource/:key',
        dialog: 'saved'
    });

const $opFilter = (reference) => (params) =>
    Ex.form(reference).filter(params);

export default { $opAdd, $opSave, $opFilter };
```

## Post-Operation Redux Chaining

```js
// Update Redux after save
const $opAdd = (reference) => (params) =>
    Ex.form(reference).add(params, { uri: "/api/dept", dialog: "added" })
        .then(data => Ux.of(reference)._.ioIn(Ex.K.DEPT, data));

// Remove from Redux after delete
const $opDelete = (reference) => (params) =>
    Ex.form(reference).remove(params, { uri: "/api/dept/:key", dialog: "removed" })
        .then(data => Ux.of(reference)._.ioOut(Ex.K.DEPT, data));
```

## Resource JSON Configuration

```json
{
    "_form": {
        "ui": ["name", "code", "status"],
        "hidden": ["id", "tenantId"],
        "rules": {
            "name": [{ "required": true, "message": "Name is required" }]
        }
    }
}
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using raw `<Form>` | Use `<ExForm>` from "ei" |
| Hardcoding form config in JSX | Define in resource JSON `_form` block |
| Custom `onFinish` with fetch/axios | Use `$op` prop with `Ex.form().add/save` |
| Missing `.form()` in FILTER decorator | Add `.form()` to enable form binding |
| Missing `.raft(1)` for FILTER | Add `.raft(1)` for single-column layout |
| Passing `$inited` to ADD mode | Only pass to EDIT: `Ex.yoForm(this, null, $inited)` |
| Op handler without `$op` prefix | All handler keys MUST start with `$op` |
| Hardcoded success messages | Use `dialog` option with i18n key |

## Red Flags — STOP and Fix

- You're using `<Form>` from antd instead of `<ExForm>` from ei
- You're writing custom form submission logic with fetch/axios
- You're hardcoding form fields in JSX instead of resource JSON
- You're missing `@Ux.zero` decorator
- You're missing `.form()` or `.raft(1)` for FILTER mode
- Op handler keys don't start with `$op`

**All of these mean: Follow the ExForm pattern exactly.**

## Common Rationalizations (and Why They're Wrong)

| Excuse | Reality |
|--------|---------|
| "Raw Form is more flexible" | ExForm provides validation, i18n, Redux integration automatically |
| "Hardcoding is faster" | Resource JSON enables reuse and i18n; hardcoding breaks framework |
| "Custom handlers give more control" | `Ex.form()` API handles dialogs, loading states, Redux updates automatically |
| "Decorator is too complex" | Decorator wires i18n, Redux, lifecycle; skipping breaks integration |
