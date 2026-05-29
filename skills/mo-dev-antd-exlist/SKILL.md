---
name: mo-dev-antd-exlist
description: Use when building list/table pages with ExListFast or ExListComplex components in React/Ant Design projects using the zero-ui framework
---

# ExList Component Family

## Overview

ExList provides two variants for list/table pages with built-in search, pagination, and CRUD operations.

## When to Use

- Building list/table pages with search and pagination
- Need quick list without embedded forms (use ExListFast)
- Need full CRUD with Add/Edit/Filter forms (use ExListComplex)
- Displaying data with custom column renderers
- Implementing batch operations

## Component Variants

| Component | Features | Use Case |
|-----------|----------|----------|
| `ExListFast` | Search + Pagination + Actions | Quick list without forms |
| `ExListComplex` | All Fast + Add/Edit/Filter forms | Full CRUD list page |

## Hard Rules (No Exceptions)

- **Never** use raw Ant Design `<Table>` instead of ExList components
- **Never** skip the attributes builder pattern (`yoList()` with `Ex.yoAmbient()`)
- **Never** use raw `fetch/axios` instead of `Ux.ajaxPost` for search
- **Never** implement manual pagination logic (use `$options`)
- **Never** hardcode columns array (use `$renders` pattern)
- **Never** skip `$executor` pattern for actions
- **Never** hardcode grid config (load from resource JSON via `Ux.fromHoc`)

## Basic ExListFast Pattern

```jsx
import {ExListFast} from "ei";

<ExListFast {...attrList}
    $renders={columnFn(this)}
    $executor={executeFn(this)}
    rxSearch={query => Ux.ajaxPost("/api/search", query)}
/>
```

## Attributes Builder (Op.js)

```js
const yoList = (reference) => {
    const inherits = Ex.yoAmbient(reference);

    // Load grid config from resource JSON
    inherits.config = Ux.fromHoc(reference, "grid");

    // Pagination options
    inherits.$options = {
        pageSize: 20,
        showSizeChanger: true
    };

    return inherits;
};
```

## Custom Column Renderers

```js
const columnFn = (reference) => ({
    // Custom text rendering
    name: (text, record) => (
        <a onClick={() => handleEdit(record)}>{text}</a>
    ),

    // Status tag
    status: (text) => (
        <Tag color={text === 'active' ? 'green' : 'red'}>
            {text === 'active' ? 'Active' : 'Inactive'}
        </Tag>
    ),

    // Date formatting
    createdAt: (text) => moment(text).format('YYYY-MM-DD HH:mm'),

    // Actions column
    $op: (text, record) => (
        <Space>
            <a onClick={() => editFn(record)}>Edit</a>
            <a onClick={() => deleteFn(record)}>Delete</a>
        </Space>
    )
});
```
