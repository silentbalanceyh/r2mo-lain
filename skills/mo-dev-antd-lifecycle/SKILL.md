---
name: mo-dev-antd-lifecycle
description: Use when creating or updating React/Ant Design pages that must follow the zero-ui yi/yu/yo lifecycle pattern and @Ux.zero decorator
---

# Page Lifecycle Patterns (yi/yu/yo)

## Overview

All Ant Design pages must use the zero-ui lifecycle pattern with `@Ux.zero` decorator, `yi/yu/yo` naming, and `Ex.yoRender` gated by `$ready`.

## When to Use

- Creating a new page component
- Refactoring a page component
- Fixing page initialization, data loading, or render issues
- Migrating a function component to zero-ui class component

## Hard Rules (No Exceptions)

- **Never** use function components or hooks for pages
- **Always** use class components with `React.PureComponent`
- **Always** use `@Ux.zero(Ux.rxEtat(...).to())` decorator
- **Always** call `Ex.yiAssist(this)` or `Ex.yiStandard(this)` in `componentDidMount`
- **Always** render with `Ex.yoRender(this, fn, debug)`
- **Always** gate rendering by `$ready` (handled by `Ex.yoRender`)
- **Always** use Op handlers with `$op` prefix and `(reference) => (params) => Promise`

## Canonical Pattern

```js
import Ux from 'ux';
import Ex from 'ex';
import Op from './Op';

@Ux.zero(Ux.rxEtat(require('./Cab.json'))
    .cab("UI")
    .ready(true)
    .connect(state => Ux.dataIn(state).revamp(["datum"]), true)
    .state({})
    .to()
)
class Component extends React.PureComponent {
    componentDidMount() {
        Ex.yiAssist(this);  // yi = initialize
    }
    render() {
        return Ex.yoRender(this, () => {
            // render logic here
        }, Ex.parserOfColor("PageName"));
    }
}

export default Component;
```

## RxEtat Builder Checklist

```js
Ux.rxEtat(require('./Cab'))
    .cab("UI")
    .ready(true)
    .state({})
    .connect(s2pFn)
    .bind(OP)
    .to()
```

## Op Handler Pattern

```js
const $opAdd = (reference) => (params) =>
    Ex.form(reference).add(params, {
        uri: '/api/resource',
        dialog: 'added'
    });

export default { $opAdd };
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using hooks/function component | Use class component + @Ux.zero decorator |
| Missing `Ex.yiAssist` | Call in `componentDidMount` |
| Rendering without `Ex.yoRender` | Wrap render with `Ex.yoRender` |
| Missing `$ready` gate | Use `.ready(true)` + `Ex.yoRender` |
| Op handler without `$op` prefix | Prefix keys with `$op` |

## Red Flags — STOP and Fix

- You are writing a function component for a page
- You are using React hooks in a page
- You are rendering without `Ex.yoRender`
- You are missing `@Ux.zero` decorator
- You are calling `setState` before `$ready`
- Op handlers are missing `$op` prefix

**All of these mean: refactor to the zero-ui lifecycle pattern.**

## Common Rationalizations (and Why They're Wrong)

| Excuse | Reality |
|--------|---------|
| "Hooks are modern best practice" | Zero-ui framework requires class components for decorator wiring |
| "Decorator is too complex" | Decorator injects i18n, Redux, lifecycle; skipping breaks framework |
| "Render directly is fine" | `Ex.yoRender` provides loading/error gate and `$ready` handling |
