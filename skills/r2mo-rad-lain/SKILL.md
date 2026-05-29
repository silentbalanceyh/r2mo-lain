---
name: r2mo-rad-lain
description: R2MO RAD CLI Dev Skill (Lain Native)
version: 3.0.0
tags: [r2mo, rad, lain, nodejs, cli, mxt]
repository: https://gitee.com/silentbalanceyh/r2mo-lain.git
---

# Role: R2MO RAD Expert (Lain Project)

## 🚨 Critical Rules
1.  **Stack**: CommonJS (`require`). **NO** ESM.
2.  **Core Libs**:
    - Use `const Ec = require('../epic');` for logging/flow.
    - Use `const Utils = require('../utils/mxt-*');` for helpers.
3.  **Interactive**: MUST use `require('../utils/mxt-menu')`. **NO** raw readline.
4.  **Style**: Use `Ec` for all logging.

## 📂 Architecture
- **Config**: `src/commander/{cmd}.json`
- **Executor**: `src/executor/execute{Cmd}.js`
- **Utils**: `src/utils/` (mxt-fs, mxt-menu, mxt-args)

## 📝 Config Schema (JSON)
```json
{
  "executor": "executeName", "command": "name", "description": "desc",
  "options": [{ "name": "arg", "alias": "a", "type": "string" }]
}
```

## 💻 Executor Template(Native)

```js
const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const FS = require('../utils/mxt-fs');
const { selectSingle } = require('../utils/mxt-menu');

module.exports = async (options) => {
    try {
        // 1. Parsing
        const opts = Args.parseStandard(options);
        const target = Args.parsePositional()[0];

        // 2. Logic
        Ec.waiting('Working...');
        if (!FS.exists(target)) Ec.error('Path not found');

        // 3. Menu Example
        const item = await selectSingle([{name: 'Go'}], 'Title');
        if(!item) process.exit(0);

        // 4. Finish
        Ec.info('✅ Done');
        process.exit(0);
    } catch (e) { Ec.error(e.message); process.exit(1); }
};
```

## 📚 API Reference (Project Context)

### 1. File System ( `mxt-fs.js` )

Combines file-utils and yaml-parser.

```js
const FS = require('../utils/mxt-fs');
// Methods:
ensureDir(path), exists(path), readJson(path), writeJson(path, data)
copyDir(src, dest), scanDir(dir, filterFn?), createTempDir(prefix?)
cleanup(path), gitClone(url, dest)
parseFile(path) // YAML Frontmatter
```

### 2. Interactive Menu ( `mxt-menu.js` )

```js
const { selectMultiple, selectSingle, clearScreen } = require('../utils/mxt-menu');
// selectMultiple returns { indices: [], items: [] }
// selectSingle returns Item | null
```

### 3. Argument Parser ( `mxt-args.js` )

```js
const Args = require('../utils/mxt-args');
// Methods:
parseStandard(options) // Standard KV
parseOptional(flag, alias)
parseBool(flag, alias)
parsePositional()
```

### 4. Core (`../epic`)

`Ec.info/warn/error/waiting(msg)`

`await Ec.ask(query)` (Use only AFTER menu closes)

String colors: `.green, .blue, .bold`, etc.