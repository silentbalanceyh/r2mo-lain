# R2MO RAD CLI Development Guide

This project is **r2mo-lain**, a RAD (Rapid Application Development) CLI tool built with Node.js.

## 🚨 Critical Development Rules

### 1. Module System
- **MUST use CommonJS** (`require`/`module.exports`)
- **NO ESM** (`import`/`export`) allowed

### 2. Core Libraries
```js
const Ec = require('../epic');              // Logging and flow control
const Utils = require('../utils/mxt-*');   // Helper utilities
```

### 3. Interactive Components
- **MUST use** `require('../utils/mxt-menu')` for all interactive prompts
- **NO raw readline** or other prompt libraries

### 4. Logging Style
- Use `Ec` methods for all console output
- Available methods: `Ec.info()`, `Ec.warn()`, `Ec.error()`, `Ec.waiting()`

## 📂 Project Architecture

```
src/
├── commander/          # Command configurations (JSON)
│   └── {cmd}.json
├── executor/           # Command implementations
│   └── execute{Cmd}.js
└── utils/              # Utility modules
    ├── mxt-fs.js      # File system operations
    ├── mxt-menu.js    # Interactive menus
    └── mxt-args.js    # Argument parsing
```

## 📝 Command Configuration Schema

Create JSON config in `src/commander/{cmd}.json`:

```json
{
  "executor": "executeName",
  "command": "name",
  "description": "Command description",
  "options": [
    {
      "name": "argument",
      "alias": "a",
      "type": "string"
    }
  ]
}
```

## 💻 Executor Template

Standard executor pattern in `src/executor/execute{Cmd}.js`:

```js
const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const FS = require('../utils/mxt-fs');
const { selectSingle } = require('../utils/mxt-menu');

module.exports = async (options) => {
    try {
        // 1. Parse arguments
        const opts = Args.parseStandard(options);
        const target = Args.parsePositional()[0];

        // 2. Business logic
        Ec.waiting('Working...');
        if (!FS.exists(target)) Ec.error('Path not found');

        // 3. Interactive menu (if needed)
        const item = await selectSingle([{name: 'Go'}], 'Title');
        if(!item) process.exit(0);

        // 4. Complete
        Ec.info('✅ Done');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message);
        process.exit(1);
    }
};
```

## 📚 API Reference

### File System (`mxt-fs.js`)

```js
const FS = require('../utils/mxt-fs');

// Directory operations
FS.ensureDir(path)
FS.exists(path)
FS.copyDir(src, dest)
FS.scanDir(dir, filterFn?)
FS.createTempDir(prefix?)
FS.cleanup(path)

// File operations
FS.readJson(path)
FS.writeJson(path, data)
FS.parseFile(path)  // YAML Frontmatter parser

// Git operations
FS.gitClone(url, dest)
```

### Interactive Menu (`mxt-menu.js`)

```js
const { selectMultiple, selectSingle, clearScreen } = require('../utils/mxt-menu');

// Single selection - returns Item | null
const item = await selectSingle(items, 'Title');

// Multiple selection - returns { indices: [], items: [] }
const result = await selectMultiple(items, 'Title');

// Clear screen
clearScreen();
```

### Argument Parser (`mxt-args.js`)

```js
const Args = require('../utils/mxt-args');

// Parse standard key-value options
const opts = Args.parseStandard(options);

// Parse optional flag
const value = Args.parseOptional('flag', 'alias');

// Parse boolean flag
const isEnabled = Args.parseBool('flag', 'alias');

// Get positional arguments
const args = Args.parsePositional();
```

### Core Logging (`epic`)

```js
const Ec = require('../epic');

// Logging methods
Ec.info('Information message');
Ec.warn('Warning message');
Ec.error('Error message');
Ec.waiting('Processing...');

// Interactive prompt (use AFTER menu closes)
const answer = await Ec.ask('Your question?');

// String colors
console.log('Text'.green);
console.log('Text'.blue);
console.log('Text'.bold);
```

## 🎯 Development Workflow

1. **Create command config**: Add JSON to `src/commander/`
2. **Implement executor**: Create JS file in `src/executor/`
3. **Use standard patterns**: Follow the executor template
4. **Test locally**: Run command to verify functionality

## 📦 Repository

- **Git**: https://gitee.com/silentbalanceyh/r2mo-lain.git
- **Version**: 3.0.0
- **Tags**: r2mo, rad, lain, nodejs, cli, mxt
