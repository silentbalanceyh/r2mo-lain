# Codex Project Guide for r2mo-lain

This file gives Codex the project-specific rules for working in this repository. It is derived from `CLAUDE.md` and adapted for Codex coding workflows.

## Project Identity

`r2mo-lain` is a Node.js RAD CLI for R2MO / MXT workflows.

- Package name: `mxt-ai`
- CLI binaries: `mxt` and `lain`
- Main entry: `src/mxt.js`
- Command metadata: `src/commander/*.json`
- Command executors: `src/executor/execute*.js`
- Shared utilities: `src/utils/mxt-*.js`
- Core runtime/logging helpers: `src/epic/`

This repository is not itself a Maven application. Do not apply Java, Spring, R2MO framework, or Zero framework coding rules unless the active task explicitly targets a generated Maven project outside this CLI or a Maven project is proven by a relevant `pom.xml`.

## Critical Coding Rules

### Module System

Use CommonJS only.

```js
const Ec = require('../epic');
const Args = require('../utils/mxt-args');

module.exports = async (options) => {
    // implementation
};
```

Do not introduce ESM syntax.

```js
// Do not use in this project
import Ec from '../epic';
export default handler;
```

### Core Imports

Use the existing project modules instead of adding parallel abstractions.

```js
const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const FS = require('../utils/mxt-fs');
const { selectSingle, selectMultiple } = require('../utils/mxt-menu');
```

Path depth may vary by file location, but keep the same module families:

- `../epic` for logging, metadata parsing, flow control, and shared runtime helpers.
- `../utils/mxt-*` for filesystem, menu, argument, repository, and other utility behavior.
- `src/commander/*.json` for command declaration and option metadata.
- `src/executor/execute*.js` for command implementation.

### Interactive Input

All interactive selection UI must use `src/utils/mxt-menu.js`.

- Use `selectSingle()` for one choice.
- Use `selectMultiple()` for multiple choices.
- Use `clearScreen()` when matching existing menu behavior.
- Do not add raw `readline`, `inquirer`, `prompts`, or another prompt package in command executors.
- `readline` belongs in `mxt-menu.js`; do not duplicate raw terminal handling elsewhere.

### Logging And Output

Use `Ec` for normal command output.

```js
Ec.info('Done');
Ec.warn('Skipped existing file');
Ec.error('Path not found');
Ec.waiting('Working...');
```

Avoid direct `console.log()` in new business logic. Only preserve or extend direct console output when the file is already a dedicated renderer, such as detailed help output or low-level terminal UI, and the existing style requires formatted raw output.

### Process Exit

Executors are CLI command handlers and commonly terminate explicitly.

- On success, use `process.exit(0)` when the existing command pattern does so.
- On handled failure, log with `Ec.error()` and use `process.exit(1)`.
- Do not silently swallow errors.
- Keep cleanup before exit for temp directories, raw terminal mode, and copied/generated resources.

## Project Architecture

```text
src/
├── commander/          # Command configuration JSON files
│   └── {cmd}.json
├── executor/           # Command implementations
│   └── execute{Cmd}.js
├── utils/              # Shared CLI utilities
│   ├── mxt-args.js
│   ├── mxt-menu.js
│   └── mxt-*.js
├── epic/               # Core runtime helpers and logging
├── python/             # Python helpers invoked by CLI commands
├── _template/          # Project, prompt, MCP, and agent templates
├── _agent/             # Agent metadata/templates
├── _skill/             # Skill repository metadata
└── _mcp/               # MCP skills server
```

## Command Implementation Workflow

When adding a `mxt` command:

1. Add command metadata in `src/commander/{cmd}.json`.
2. Implement the executor in `src/executor/execute{Cmd}.js`.
3. Export the executor from `src/executor/index.js`.
4. Use `Ec.parseMetadata()` / existing command loading behavior instead of custom discovery.
5. Test with `node src/mxt.js help` and the specific command path.

Command config shape:

```json
{
  "executor": "executeName",
  "command": "name",
  "description": "Command description",
  "options": [
    {
      "name": "argument",
      "alias": "a",
      "type": "string",
      "description": "Option description"
    }
  ]
}
```

Executor pattern:

```js
const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const FS = require('../utils/mxt-fs');
const { selectSingle } = require('../utils/mxt-menu');

module.exports = async (options) => {
    try {
        const opts = Args.parseStandard(options);
        const target = Args.parsePositional()[0];

        Ec.waiting('Working...');

        if (target && !FS.exists(target)) {
            Ec.error('Path not found');
            process.exit(1);
        }

        const item = await selectSingle([{ name: 'Go' }], 'Title');
        if (!item) {
            process.exit(0);
        }

        Ec.info('Done');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message);
        process.exit(1);
    }
};
```

## Codex Slash Command Development

This repository is also initialized as a project-local Codex plugin workspace for `/` command development.

- Plugin manifest: `.codex-plugin/plugin.json`
- Slash command directory: `commands/`
- Command conventions: `commands/_conventions.md`
- Command template: `commands/_template.md`
- Command validator: `scripts/validate-commands.js`

Rules for Codex slash commands:

- Finished commands live at `commands/<name>.md` and become invokable as `/<name>`.
- Drafts, templates, and notes must start with `_`, for example `commands/_template.md`; underscore files are meta-documents and should not be treated as runnable commands.
- Every runnable command must include YAML frontmatter with `description`.
- Use `$ARGUMENTS` in command files for user-provided invocation text.
- Keep runnable command files operational: include `Arguments`, `Preflight`, `Plan`, `Commands`, `Verification`, `Summary`, and `Next Steps` sections.
- Validate command files with `npm run validate:commands` before claiming command setup is complete.
- Do not add a runnable slash command until its workflow is specific, safe, and verifiable.

## Existing Utility Contracts

Argument parsing:

```js
const Args = require('../utils/mxt-args');

const opts = Args.parseStandard(options);
const value = Args.parseOptional('flag', 'f');
const enabled = Args.parseBool('flag', 'f');
const args = Args.parsePositional();
```

Interactive menus:

```js
const { selectSingle, selectMultiple, clearScreen } = require('../utils/mxt-menu');

const item = await selectSingle(items, 'Title');
const result = await selectMultiple(items, 'Title');
clearScreen();
```

Core logging:

```js
const Ec = require('../epic');

Ec.info('Information message');
Ec.warn('Warning message');
Ec.error('Error message');
Ec.waiting('Processing...');
```

## Testing And Verification

There is no broad test suite configured beyond the package script. Prefer targeted CLI verification.

- Run `node src/mxt.js version` after changes touching startup or package metadata.
- Run `node src/mxt.js help` after changes touching command metadata, executor registration, or help behavior.
- Run `node src/mxt.js help -c <command>` after adding or changing one command.
- Run the changed command with a safe temp directory or fixture when it writes files.
- Run `npm test` only if the current task requires the package script; note that it maps directly to `src/index.test.js`.

Do not claim verification succeeded unless the command was actually run and completed successfully.

## MXT CLI Context

Common user-facing commands are:

- `mxt help [-c <command>]`
- `mxt env`
- `mxt init [-d <dir>]`
- `mxt app -n <name>`
- `mxt open [-d <dir>]`
- `mxt domain [-d <dir>] [-e]`
- `mxt ui -n <name> [-d <dir>] [-u]`
- `mxt admin [-d <dir>]`
- `mxt mod [-d <dir>]`
- `mxt openapi [-d <dir>]`
- `mxt docs [-d <dir>]`
- `mxt menu [-d <dir>]`
- `mxt dict [-d <dir>] [-r]`
- `mxt mmr0`
- `mxt mmr2`
- `mxt apply [-r [repo_name]]`
- `mxt mcp [-c]`
- `mxt ask`
- `mxt task`
- `mxt run`
- `mxt team`
- `mxt focus`

When command details are needed, prefer reading the corresponding `src/commander/{cmd}.json` and `src/executor/execute{Cmd}.js` instead of relying on this summary.

## Editing Discipline

- Keep changes small and aligned with the existing style.
- Do not introduce new dependencies for behavior already covered by `src/utils` or `src/epic`.
- Do not rewrite unrelated command executors while implementing a specific command.
- Preserve existing generated/template assets unless the task explicitly targets them.
- Respect dirty worktree changes that were not made for the current task.
- Update templates under `src/_template/` only when the user asks for template behavior changes.

## Repository Metadata

- Repository: `https://gitee.com/silentbalanceyh/r2mo-lain.git`
- Keywords: `r2mo`, `rad`, `lain`, `nodejs`, `cli`, `mxt`


<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://localhost:37777
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>