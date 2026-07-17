const assert = require('assert');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
const { spawnSync } = require('child_process');

const MXT_JS = path.resolve(__dirname, 'mxt.js');
const TASK_DIR = path.join('.r2mo', 'task');

const _slotFilename = (slot) => `task-${String(slot).padStart(3, '0')}.md`;

const _taskContent = (title, body = '# Body') => [
    '---',
    'runAt: 2026-04-19.00-00-00',
    `title: ${title}`,
    'author:',
    '---',
    '',
    body,
    ''
].join('\n');

const _runTask = (cwd, env = process.env) => spawnSync(process.execPath, [MXT_JS, 'task'], {
    cwd,
    encoding: 'utf8',
    env
});

const _read = (root, relPath) => fs.readFile(path.join(root, relPath), 'utf8');

const _exists = async (root, relPath) => {
    try {
        await fs.access(path.join(root, relPath));
        return true;
    } catch {
        return false;
    }
};

const _listHistoryFiles = async (root) => {
    const taskRoot = path.join(root, TASK_DIR);
    try {
        const days = await fs.readdir(taskRoot, { withFileTypes: true });
        const files = [];
        for (const day of days) {
            if (!day.isDirectory()) continue;
            const entries = await fs.readdir(path.join(taskRoot, day.name), { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile()) {
                    files.push(path.join(day.name, entry.name));
                }
            }
        }
        return files.sort();
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
};

const _readJson = async (root, relPath) => JSON.parse(await _read(root, relPath));

const _withTempDir = async (fn) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mxt-task-'));
    try {
        await fn(tempDir);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
};

const _withTempR2moDir = async (fn) => {
    await _withTempDir(async (root) => {
        const r2moDir = path.join(root, '.r2mo');
        await fs.mkdir(r2moDir, { recursive: true });
        await fn(root, r2moDir);
    });
};

const testDefaultThreadFallsBackTo20 = async () => {
    await _withTempDir(async (root) => {
        const result = _runTask(root, { ...process.env, PATH: '' });

        const threadValue = (await _read(root, path.join(TASK_DIR, 'thread'))).trim();
        assert.strictEqual(threadValue, '20');
        for (let i = 1; i <= 20; i++) {
            assert.strictEqual(await _exists(root, path.join(TASK_DIR, _slotFilename(i))), true);
        }
        assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
    });
};

const testThreadOverridesDefault = async () => {
    await _withTempDir(async (root) => {
        const taskRoot = path.join(root, TASK_DIR);
        await fs.mkdir(taskRoot, { recursive: true });
        await fs.writeFile(path.join(taskRoot, 'thread'), '3', 'utf8');

        const result = _runTask(root, { ...process.env, PATH: '' });
        assert.strictEqual(await _exists(root, path.join(TASK_DIR, _slotFilename(3))), true);
        assert.strictEqual(await _exists(root, path.join(TASK_DIR, _slotFilename(4))), false);
        assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
    });
};

const testShrinkThreadPrunesOverflow = async () => {
    await _withTempDir(async (root) => {
        const taskRoot = path.join(root, TASK_DIR);
        await fs.mkdir(taskRoot, { recursive: true });
        await fs.writeFile(path.join(taskRoot, 'thread'), '3', 'utf8');
        await fs.writeFile(path.join(taskRoot, _slotFilename(1)), _taskContent('任务'), 'utf8');
        await fs.writeFile(path.join(taskRoot, _slotFilename(2)), _taskContent('任务'), 'utf8');
        await fs.writeFile(path.join(taskRoot, _slotFilename(3)), _taskContent('任务'), 'utf8');
        await fs.writeFile(path.join(taskRoot, _slotFilename(4)), _taskContent('业务任务'), 'utf8');
        await fs.writeFile(path.join(taskRoot, _slotFilename(5)), _taskContent('任务', ''), 'utf8');
        await fs.writeFile(path.join(taskRoot, 'goon-004.md'), '历史整改痕迹\n', 'utf8');

        const result = _runTask(root, { ...process.env, PATH: '' });
        assert.strictEqual(await _exists(root, path.join(TASK_DIR, _slotFilename(4))), false);
        assert.strictEqual(await _exists(root, path.join(TASK_DIR, _slotFilename(5))), false);
        assert.strictEqual(await _read(root, path.join(TASK_DIR, 'goon-004.md')), '');

        const historyFiles = await _listHistoryFiles(root);
        assert.strictEqual(historyFiles.length, 1);
        assert.match(historyFiles[0], /TASK@业务任务\.md$/);
        assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
    });
};

const testRunSkipsFocusModeSelection = async () => {
    const runFile = path.resolve(__dirname, 'executor', 'executeRun.js');

    await _withTempDir(async (root) => {
        const taskRoot = path.join(root, TASK_DIR);
        await fs.mkdir(taskRoot, { recursive: true });
        await fs.writeFile(path.join(taskRoot, _slotFilename(1)), _taskContent('直接执行任务', '# Body'), 'utf8');
        await fs.writeFile(path.join(root, 'pom.xml'), '<project><artifactId>demo</artifactId></project>', 'utf8');
        await fs.mkdir(path.join(root, 'demo-domain'), { recursive: true });
        await fs.mkdir(path.join(root, 'demo-provider'), { recursive: true });
        await fs.mkdir(path.join(root, 'demo-api'), { recursive: true });
        await fs.mkdir(path.join(root, 'demo-ui'), { recursive: true });

        const menuTitles = [];
        const originalLoad = Module._load;
        const originalCwd = process.cwd;
        const originalExit = process.exit;
        const originalLog = console.log;
        const originalInfo = console.info;
        const originalWarn = console.warn;
        const originalError = console.error;

        const fakeEc = {
            waiting() {},
            info() {},
            warn() {},
            error() {},
            outCopy: async () => {}
        };

        try {
            Module._load = function(request, parent, isMain) {
                if (parent && parent.filename === runFile) {
                    if (request === '../epic') return fakeEc;
                    if (request === '../utils/mxt-audio') return { playAudio() {} };
                    if (request === '../utils/mxt-file-utils') return { exists: (p) => fsSync.existsSync(p) };
                    if (request === '../utils/mxt-menu') {
                        return {
                            selectSingle: async (items, title) => {
                                menuTitles.push(title);
                                return items[0];
                            }
                        };
                    }
                    if (request === 'colors') return {};
                }
                return originalLoad.call(this, request, parent, isMain);
            };

            process.cwd = () => root;
            process.exit = (code) => {
                throw new Error(`EXIT:${code}`);
            };
            console.log = () => {};
            console.info = () => {};
            console.warn = () => {};
            console.error = () => {};

            delete require.cache[runFile];
            const executeRun = require(runFile);
            await executeRun().catch((error) => {
                if (!/^EXIT:\d+$/.test(error.message)) {
                    throw error;
                }
            });
        } finally {
            delete require.cache[runFile];
            Module._load = originalLoad;
            process.cwd = originalCwd;
            process.exit = originalExit;
            console.log = originalLog;
            console.info = originalInfo;
            console.warn = originalWarn;
            console.error = originalError;
        }

        assert.deepStrictEqual(menuTitles, ['选择要执行的任务']);
    });
};

const testTaskUsesCurrentR2moDirectory = async () => {
    await _withTempR2moDir(async (_root, r2moDir) => {
        const result = _runTask(r2moDir, { ...process.env, PATH: '' });

        const threadValue = (await fs.readFile(path.join(r2moDir, 'task', 'thread'), 'utf8')).trim();
        assert.strictEqual(threadValue, '20');
        assert.strictEqual(await _exists(r2moDir, path.join('task', _slotFilename(1))), true);
        assert.strictEqual(await _exists(r2moDir, path.join('.r2mo', 'task', _slotFilename(1))), false);
        assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
    });
};

const testRunUsesCurrentR2moDirectory = async () => {
    const runFile = path.resolve(__dirname, 'executor', 'executeRun.js');

    await _withTempR2moDir(async (_root, r2moDir) => {
        const taskRoot = path.join(r2moDir, 'task');
        await fs.mkdir(taskRoot, { recursive: true });
        await fs.writeFile(path.join(taskRoot, _slotFilename(1)), _taskContent('R2MO 目录任务', '# Body'), 'utf8');

        const menuTitles = [];
        const copiedPrompts = [];
        const originalLoad = Module._load;
        const originalCwd = process.cwd;
        const originalExit = process.exit;
        const originalLog = console.log;
        const originalInfo = console.info;
        const originalWarn = console.warn;
        const originalError = console.error;

        const fakeEc = {
            waiting() {},
            info() {},
            warn() {},
            error() {},
            outCopy: async (text) => {
                copiedPrompts.push(text);
            }
        };

        try {
            Module._load = function(request, parent, isMain) {
                if (parent && parent.filename === runFile) {
                    if (request === '../epic') return fakeEc;
                    if (request === '../utils/mxt-audio') return { playAudio() {} };
                    if (request === '../utils/mxt-menu') {
                        return {
                            selectSingle: async (items, title) => {
                                menuTitles.push(title);
                                return items[0];
                            }
                        };
                    }
                    if (request === 'colors') return {};
                }
                return originalLoad.call(this, request, parent, isMain);
            };

            process.cwd = () => r2moDir;
            process.exit = (code) => {
                throw new Error(`EXIT:${code}`);
            };
            console.log = () => {};
            console.info = () => {};
            console.warn = () => {};
            console.error = () => {};

            delete require.cache[runFile];
            const executeRun = require(runFile);
            await executeRun().catch((error) => {
                if (!/^EXIT:\d+$/.test(error.message)) {
                    throw error;
                }
            });
        } finally {
            delete require.cache[runFile];
            Module._load = originalLoad;
            process.cwd = originalCwd;
            process.exit = originalExit;
            console.log = originalLog;
            console.info = originalInfo;
            console.warn = originalWarn;
            console.error = originalError;
        }

        assert.deepStrictEqual(menuTitles, ['选择要执行的任务']);
        assert.strictEqual(copiedPrompts.length, 1);
        assert.match(copiedPrompts[0], /当前工作目录下 task\/task-001\.md /);
    });
};

const testPlanUsesCurrentR2moDirectory = async () => {
    const planFile = path.resolve(__dirname, 'executor', 'executePlan.js');

    await _withTempR2moDir(async (_root, r2moDir) => {
        const taskRoot = path.join(r2moDir, 'task');
        await fs.mkdir(taskRoot, { recursive: true });
        await fs.writeFile(path.join(taskRoot, _slotFilename(1)), _taskContent('规划任务', '# Body'), 'utf8');

        const menuTitles = [];
        const copiedPrompts = [];
        const audioCalls = [];
        const originalLoad = Module._load;
        const originalCwd = process.cwd;
        const originalExit = process.exit;
        const originalLog = console.log;
        const originalInfo = console.info;
        const originalWarn = console.warn;
        const originalError = console.error;

        const fakeEc = {
            waiting() {},
            info() {},
            warn() {},
            error() {},
            outCopy: async (text) => {
                copiedPrompts.push(text);
            }
        };

        try {
            Module._load = function(request, parent, isMain) {
                if (parent && parent.filename === planFile) {
                    if (request === '../epic') return fakeEc;
                    if (request === '../utils/mxt-audio') {
                        return {
                            playAudio: (name) => {
                                audioCalls.push(name);
                            }
                        };
                    }
                    if (request === '../utils/mxt-menu') {
                        return {
                            selectSingle: async (items, title) => {
                                menuTitles.push(title);
                                return items[0];
                            }
                        };
                    }
                    if (request === 'colors') return {};
                }
                return originalLoad.call(this, request, parent, isMain);
            };

            process.cwd = () => r2moDir;
            process.exit = (code) => {
                throw new Error(`EXIT:${code}`);
            };
            console.log = () => {};
            console.info = () => {};
            console.warn = () => {};
            console.error = () => {};

            delete require.cache[planFile];
            const executePlan = require(planFile);
            await executePlan().catch((error) => {
                if (!/^EXIT:\d+$/.test(error.message)) {
                    throw error;
                }
            });
        } finally {
            delete require.cache[planFile];
            Module._load = originalLoad;
            process.cwd = originalCwd;
            process.exit = originalExit;
            console.log = originalLog;
            console.info = originalInfo;
            console.warn = originalWarn;
            console.error = originalError;
        }

        assert.deepStrictEqual(menuTitles, ['选择要规划的任务']);
        assert.deepStrictEqual(audioCalls, ['audio/task.ogg']);
        assert.strictEqual(copiedPrompts.length, 1);
        assert.match(copiedPrompts[0], /当前工作目录下 task\/task-001\.md /);
        assert.match(copiedPrompts[0], /追加或更新 ## Plan 章节/);
        assert.match(copiedPrompts[0], /不要修改任务 status，不要追加 Changes/);
    });
};

const testRunPlaysAudioAfterSelection = async () => {
    const runFile = path.resolve(__dirname, 'executor', 'executeRun.js');

    await _withTempDir(async (root) => {
        const taskRoot = path.join(root, TASK_DIR);
        await fs.mkdir(taskRoot, { recursive: true });
        await fs.writeFile(path.join(taskRoot, _slotFilename(1)), _taskContent('音效任务', '# Body'), 'utf8');

        const audioCalls = [];
        const selectionAudioState = [];
        const originalLoad = Module._load;
        const originalCwd = process.cwd;
        const originalExit = process.exit;
        const originalLog = console.log;
        const originalInfo = console.info;
        const originalWarn = console.warn;
        const originalError = console.error;

        const fakeEc = {
            waiting() {},
            info() {},
            warn() {},
            error() {},
            outCopy: async () => {}
        };

        try {
            Module._load = function(request, parent, isMain) {
                if (parent && parent.filename === runFile) {
                    if (request === '../epic') return fakeEc;
                    if (request === '../utils/mxt-audio') {
                        return {
                            playAudio: (name) => {
                                audioCalls.push(name);
                            }
                        };
                    }
                    if (request === '../utils/mxt-menu') {
                        return {
                            selectSingle: async (items) => {
                                selectionAudioState.push(audioCalls.slice());
                                return items[0];
                            }
                        };
                    }
                    if (request === 'colors') return {};
                }
                return originalLoad.call(this, request, parent, isMain);
            };

            process.cwd = () => root;
            process.exit = (code) => {
                throw new Error(`EXIT:${code}`);
            };
            console.log = () => {};
            console.info = () => {};
            console.warn = () => {};
            console.error = () => {};

            delete require.cache[runFile];
            const executeRun = require(runFile);
            await executeRun().catch((error) => {
                if (!/^EXIT:\d+$/.test(error.message)) {
                    throw error;
                }
            });
        } finally {
            delete require.cache[runFile];
            Module._load = originalLoad;
            process.cwd = originalCwd;
            process.exit = originalExit;
            console.log = originalLog;
            console.info = originalInfo;
            console.warn = originalWarn;
            console.error = originalError;
        }

        assert.deepStrictEqual(selectionAudioState, [[]]);
        assert.deepStrictEqual(audioCalls, ['audio/run.ogg']);
    });
};

const testAiCmdInstallsSelectedPlatformsFromAgentCommands = async () => {
    const aiCmd = require('./utils/mxt-ai-cmd');

    await _withTempDir(async (homeDir) => {
        const legacy = 'mo' + 'mo';
        const legacyMarketplace = `${legacy}-skills`;
        const repoDir = path.join(homeDir, 'repo');
        await fs.mkdir(repoDir, { recursive: true });
        await fs.mkdir(path.join(homeDir, '.claude', 'plugins', 'cache', legacyMarketplace, legacy, '1.0.0'), { recursive: true });
        await fs.mkdir(path.join(homeDir, '.claude', 'plugins', 'marketplaces', legacyMarketplace), { recursive: true });
        await fs.mkdir(path.join(homeDir, '.codex', 'plugins', legacy), { recursive: true });
        await fs.mkdir(path.join(homeDir, '.codex', 'plugins', 'cache', legacyMarketplace, legacy, '1.0.0'), { recursive: true });
        await fs.mkdir(path.join(homeDir, '.codex', 'marketplaces', legacyMarketplace), { recursive: true });
        await fs.mkdir(path.join(homeDir, '.codex', 'prompts'), { recursive: true });
        await fs.writeFile(path.join(homeDir, '.codex', 'prompts', `${legacy}-run.md`), '# legacy', 'utf8');
        await fs.mkdir(path.join(homeDir, '.config', 'opencode'), { recursive: true });
        await fs.writeFile(path.join(homeDir, '.config', 'opencode', 'opencode.json'), JSON.stringify({
            command: {
                [`${legacy}:run`]: { template: 'legacy' }
            }
        }), 'utf8');
        await fs.mkdir(path.join(homeDir, '.claude'), { recursive: true });
        await fs.writeFile(path.join(homeDir, '.claude', 'settings.json'), JSON.stringify({
            env: {
                CLAUDE_CODE_SIMPLE: '1',
                KEEP_ME: 'ok'
            },
            enabledPlugins: {
                [`${legacy}@${legacyMarketplace}`]: true
            },
            extraKnownMarketplaces: {
                [legacyMarketplace]: {
                    source: {
                        source: 'directory',
                        path: 'legacy'
                    }
                }
            }
        }), 'utf8');
        await fs.mkdir(path.join(homeDir, '.codex'), { recursive: true });
        await fs.writeFile(path.join(homeDir, '.codex', 'config.toml'), [
            `[plugins."${legacy}@${legacyMarketplace}"]`,
            'enabled = true',
            '',
            `[marketplaces.${legacyMarketplace}]`,
            'source_type = "local"',
            'source = "legacy"',
            ''
        ].join('\n'), 'utf8');

        const installed = await aiCmd.installPlatforms(['claude', 'codex', 'opencode'], { homeDir, repoDir });

        assert.deepStrictEqual(installed.map(item => item.id), ['claude', 'codex', 'opencode']);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', '.claude-plugin', 'plugin.json')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'commands', 'plan.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'commands', 'run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'commands', 'end.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'commands', 'goon.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'marketplaces', 'mxt-skills', '.claude-plugin', 'marketplace.json')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'marketplaces', 'mxt-skills', '.claude-plugin', 'plugin.json')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'marketplaces', 'mxt-skills', 'commands', 'plan.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'marketplaces', 'mxt-skills', 'commands', 'run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:plan.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:end.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:goon.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:debug.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:sync.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:start.md')), true);
        const claudePlugin = await _readJson(homeDir, path.join('.claude', 'plugins', 'marketplaces', 'mxt-skills', '.claude-plugin', 'plugin.json'));
        assert.deepStrictEqual(claudePlugin.commands, [
            './commands/plan.md',
            './commands/run.md',
            './commands/end.md',
            './commands/goon.md',
            './commands/debug.md',
            './commands/sync.md',
            './commands/start.md'
        ]);
        const claudeSettings = await _readJson(homeDir, path.join('.claude', 'settings.json'));
        assert.strictEqual(Object.prototype.hasOwnProperty.call(claudeSettings.env || {}, 'CLAUDE_CODE_SIMPLE'), false);
        assert.strictEqual(claudeSettings.env.KEEP_ME, 'ok');
        assert.strictEqual(claudeSettings.enabledPlugins['mxt@mxt-skills'], true);
        assert.strictEqual(claudeSettings.extraKnownMarketplaces['mxt-skills'].source.source, 'directory');
        assert.strictEqual(claudeSettings.extraKnownMarketplaces['mxt-skills'].source.path, path.join(homeDir, '.claude', 'plugins', 'marketplaces', 'mxt-skills'));
        assert.ok(Array.isArray(installed[0].warnings));
        assert.match(installed[0].warnings[0], /CLAUDE_CODE_SIMPLE/);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', '.orphaned_at')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', legacyMarketplace, legacy, '1.0.0')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'marketplaces', legacyMarketplace)), false);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(claudeSettings.enabledPlugins || {}, `${legacy}@${legacyMarketplace}`), false);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(claudeSettings.extraKnownMarketplaces || {}, legacyMarketplace), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', '.codex-plugin', 'plugin.json')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', 'commands', 'plan.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', 'commands', 'run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', 'commands', 'end.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', 'commands', 'goon.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', 'skills', 'mxt-plan', 'SKILL.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', 'skills', 'mxt-run', 'SKILL.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', 'skills', 'mxt-end', 'SKILL.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt', 'skills', 'mxt-goon', 'SKILL.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', '.codex-plugin', 'plugin.json')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'commands', 'plan.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'commands', 'run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'skills', 'mxt-plan', 'SKILL.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'skills', 'mxt-run', 'SKILL.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', '.agents', 'plugins', 'marketplace.json')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', '.codex-plugin', 'plugin.json')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'commands', 'plan.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'commands', 'run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-plan', 'SKILL.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-run', 'SKILL.md')), true);
        const codexMarketplace = await _readJson(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', '.agents', 'plugins', 'marketplace.json'));
        assert.strictEqual(codexMarketplace.name, 'mxt-skills');
        assert.strictEqual(codexMarketplace.plugins[0].name, 'mxt');
        assert.strictEqual(codexMarketplace.plugins[0].source.path, './plugins/mxt');
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-plan.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-end.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-goon.md')), true);
        const mxtPlanSkill = await _read(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-plan', 'SKILL.md'));
        assert.match(mxtPlanSkill, /name: mxt-plan/);
        assert.match(mxtPlanSkill, /## Plan/);
        assert.match(mxtPlanSkill, /任务：为 `<TASK_PATH>` 生成执行计划/);
        assert.match(mxtPlanSkill, /前置校验/);
        assert.match(mxtPlanSkill, /边界约束/);
        const mxtRunSkill = await _read(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-run', 'SKILL.md'));
        assert.match(mxtRunSkill, /name: mxt-run/);
        assert.match(mxtRunSkill, /请使用 \$mxt-run 001 格式执行/);
        assert.match(mxtRunSkill, /任务：执行 `<TASK_PATH>` 中定义的开发任务/);
        assert.match(mxtRunSkill, /调度策略/);
        const mxtEndSkill = await _read(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-end', 'SKILL.md'));
        assert.match(mxtEndSkill, /任务：验收 `<TASK_PATH>`，并生成 `<GOON_PATH>` 整改队列/);
        assert.match(mxtEndSkill, /goon 标题/);
        const mxtGoonSkill = await _read(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-goon', 'SKILL.md'));
        assert.match(mxtGoonSkill, /任务：根据 `<GOON_PATH>` 完成整改，并回写 `<TASK_PATH>` 闭环记录/);
        assert.match(mxtGoonSkill, /Changes 写回/);
        const codexConfig = await _read(homeDir, path.join('.codex', 'config.toml'));
        assert.match(codexConfig, /\[plugins\."mxt@mxt-skills"\]/);
        assert.match(codexConfig, /\[marketplaces\.mxt-skills\]/);
        assert.match(codexConfig, /source_type = "local"/);
        assert.strictEqual(codexConfig.includes(`[plugins."${legacy}@${legacyMarketplace}"]`), false);
        assert.strictEqual(codexConfig.includes(`[marketplaces.${legacyMarketplace}]`), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', legacy)), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'cache', legacyMarketplace, legacy, '1.0.0')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', legacyMarketplace)), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', `${legacy}-run.md`)), false);
        const opencodeConfig = JSON.parse(await _read(homeDir, path.join('.config', 'opencode', 'opencode.json')));
        assert.strictEqual(Object.prototype.hasOwnProperty.call(opencodeConfig.command || {}, `${legacy}:run`), false);
        assert.ok(opencodeConfig.command['mxt:plan']);
        assert.ok(opencodeConfig.command['mxt:run']);
        assert.ok(opencodeConfig.command['mxt:end']);
        assert.ok(opencodeConfig.command['mxt:goon']);
        assert.match(opencodeConfig.command['mxt:plan'].template, /## Plan/);
        assert.match(opencodeConfig.command['mxt:plan'].template, /立即询问用户提供最新任务号/);
        assert.match(opencodeConfig.command['mxt:plan'].template, /任务：为 `<TASK_PATH>` 生成执行计划/);
        assert.match(opencodeConfig.command['mxt:plan'].template, /边界约束/);
        assert.match(opencodeConfig.command['mxt:run'].template, /三位数字编号/);
        assert.match(opencodeConfig.command['mxt:run'].template, /先在聊天窗口中原样打印本次将执行的提示词/);
        assert.match(opencodeConfig.command['mxt:run'].template, /立即询问用户提供最新任务号/);
        assert.match(opencodeConfig.command['mxt:run'].template, /\.r2mo\/task\/task-\$编号\.md/);
        assert.match(opencodeConfig.command['mxt:run'].template, /任务：执行 `<TASK_PATH>` 中定义的开发任务/);
        assert.match(opencodeConfig.command['mxt:run'].template, /调度策略/);
        assert.match(opencodeConfig.command['mxt:end'].template, /\.r2mo\/task\/goon-\$编号\.md/);
        assert.match(opencodeConfig.command['mxt:end'].template, /写入前必须清空 `<GOON_PATH>` 原始内容/);
        assert.match(opencodeConfig.command['mxt:end'].template, /任务：验收 `<TASK_PATH>`，并生成 `<GOON_PATH>` 整改队列/);
        assert.match(opencodeConfig.command['mxt:end'].template, /goon 标题/);
        assert.match(opencodeConfig.command['mxt:goon'].template, /\.r2mo\/task\/goon-\$编号\.md/);
        assert.match(opencodeConfig.command['mxt:goon'].template, /整改完成后必须先清空 `<GOON_PATH>` 原始内容/);
        assert.match(opencodeConfig.command['mxt:goon'].template, /任务：根据 `<GOON_PATH>` 完成整改，并回写 `<TASK_PATH>` 闭环记录/);
        assert.match(opencodeConfig.command['mxt:goon'].template, /Changes 写回/);
        const installedHarnessFiles = [
            path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'commands', 'run.md'),
            path.join('.claude', 'commands', 'mxt:run.md'),
            path.join('.codex', 'plugins', 'mxt', 'commands', 'run.md'),
            path.join('.codex', 'plugins', 'mxt', 'skills', 'mxt-run', 'SKILL.md'),
            path.join('.codex', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'skills', 'mxt-run', 'SKILL.md'),
            path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-run', 'SKILL.md'),
            path.join('.codex', 'prompts', 'mxt-run.md')
        ];
        for (const file of installedHarnessFiles) {
            const content = await _read(homeDir, file);
            assert.match(content, /## Harness/);
            assert.match(content, /English-first/);
            assert.match(content, /Task isolation lock/);
            assert.match(content, /Fresh evidence before completion claims/);
        }
        assert.match(opencodeConfig.command['mxt:run'].template, /## Harness/);
        assert.match(opencodeConfig.command['mxt:run'].template, /English-first/);
        assert.match(opencodeConfig.command['mxt:run'].template, /Task isolation lock/);
        assert.match(opencodeConfig.command['mxt:run'].template, /Fresh evidence before completion claims/);
    });
};

const testAiCmdUninstallsSelectedPlatforms = async () => {
    const aiCmd = require('./utils/mxt-ai-cmd');

    await _withTempDir(async (homeDir) => {
        const repoDir = path.join(homeDir, 'repo');
        await fs.mkdir(repoDir, { recursive: true });
        await aiCmd.installPlatforms(['claude', 'codex', 'opencode'], { homeDir, repoDir });

        const uninstalled = await aiCmd.uninstallPlatforms(['claude', 'codex', 'opencode'], { homeDir, repoDir });

        assert.deepStrictEqual(uninstalled.map(item => item.id), ['claude', 'codex', 'opencode']);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'marketplaces', 'mxt-skills')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:plan.md')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:run.md')), false);
        const claudeSettings = await _readJson(homeDir, path.join('.claude', 'settings.json'));
        assert.strictEqual(Object.prototype.hasOwnProperty.call(claudeSettings.enabledPlugins || {}, 'mxt@mxt-skills'), false);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(claudeSettings.extraKnownMarketplaces || {}, 'mxt-skills'), false);

        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'mxt')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-plan.md')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-run.md')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-end.md')), false);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-goon.md')), false);
        const codexConfig = await _read(homeDir, path.join('.codex', 'config.toml'));
        assert.doesNotMatch(codexConfig, /\[plugins\."mxt@mxt-skills"\]/);
        assert.doesNotMatch(codexConfig, /\[marketplaces\.mxt-skills\]/);

        const opencodeConfig = JSON.parse(await _read(homeDir, path.join('.config', 'opencode', 'opencode.json')));
        assert.strictEqual(Object.prototype.hasOwnProperty.call(opencodeConfig.command || {}, 'mxt:plan'), false);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(opencodeConfig.command || {}, 'mxt:run'), false);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(opencodeConfig.command || {}, 'mxt:end'), false);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(opencodeConfig.command || {}, 'mxt:goon'), false);
    });
};

const testAiCmdReinstallRefreshesPlatforms = async () => {
    const aiCmd = require('./utils/mxt-ai-cmd');

    await _withTempDir(async (homeDir) => {
        const repoDir = path.join(homeDir, 'repo');
        await fs.mkdir(repoDir, { recursive: true });

        await aiCmd.installPlatforms(['claude', 'codex', 'opencode'], { homeDir, repoDir });
        const reinstalled = await aiCmd.installPlatforms(['claude', 'codex', 'opencode'], { homeDir, repoDir });

        assert.deepStrictEqual(reinstalled.map(item => item.id), ['claude', 'codex', 'opencode']);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0', 'commands', 'run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.claude', 'commands', 'mxt:run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-plan.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'prompts', 'mxt-run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-plan', 'SKILL.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'commands', 'run.md')), true);
        assert.strictEqual(await _exists(homeDir, path.join('.codex', 'marketplaces', 'mxt-skills', 'plugins', 'mxt', 'skills', 'mxt-run', 'SKILL.md')), true);
        const opencodeConfig = JSON.parse(await _read(homeDir, path.join('.config', 'opencode', 'opencode.json')));
        assert.ok(opencodeConfig.command['mxt:plan']);
        assert.ok(opencodeConfig.command['mxt:run']);
        assert.ok(opencodeConfig.command['mxt:end']);
        assert.ok(opencodeConfig.command['mxt:goon']);
    });
};

const testAiCmdOpenCodePreservesJsonStringCommentMarkers = async () => {
    const aiCmd = require('./utils/mxt-ai-cmd');

    await _withTempDir(async (homeDir) => {
        await fs.mkdir(path.join(homeDir, '.config', 'opencode'), { recursive: true });
        await fs.writeFile(path.join(homeDir, '.config', 'opencode', 'opencode.json'), JSON.stringify({
            command: {
                custom: {
                    description: 'Custom command',
                    template: 'https://example.test/path\nconst value = 1; // this is template text'
                }
            }
        }, null, 2), 'utf8');

        await aiCmd.installPlatforms(['opencode'], { homeDir });

        const opencodeConfig = JSON.parse(await _read(homeDir, path.join('.config', 'opencode', 'opencode.json')));
        assert.strictEqual(opencodeConfig.command.custom.template.includes('// this is template text'), true);
        assert.ok(opencodeConfig.command['mxt:goon']);
    });
};

const testAiCmdClaudeInstallWritesHostPluginState = async () => {
    const aiCmd = require('./utils/mxt-ai-cmd');

    await _withTempDir(async (homeDir) => {
        await aiCmd.installPlatforms(['claude'], { homeDir });

        const known = await _readJson(homeDir, path.join('.claude', 'plugins', 'known_marketplaces.json'));
        const installed = await _readJson(homeDir, path.join('.claude', 'plugins', 'installed_plugins.json'));

        assert.strictEqual(known['mxt-skills'].source.source, 'directory');
        assert.strictEqual(known['mxt-skills'].source.path, path.join(homeDir, '.claude', 'plugins', 'marketplaces', 'mxt-skills'));
        assert.strictEqual(known['mxt-skills'].installLocation, path.join(homeDir, '.claude', 'plugins', 'marketplaces', 'mxt-skills'));
        assert.strictEqual(installed.version, 2);
        assert.strictEqual(installed.plugins['mxt@mxt-skills'][0].scope, 'user');
        assert.strictEqual(installed.plugins['mxt@mxt-skills'][0].installPath, path.join(homeDir, '.claude', 'plugins', 'cache', 'mxt-skills', 'mxt', '1.0.0'));
        assert.strictEqual(installed.plugins['mxt@mxt-skills'][0].version, '1.0.0');
    });
};

const testDebugCommandsRequireGoonDebugReport = async () => {
    const files = [
        path.join('agent', 'commands', 'claude', 'mxt', 'commands', 'debug.md'),
        path.join('agent', 'commands', 'opencode', 'mxt', 'commands', 'debug.md'),
        path.join('agent', 'commands', 'codex', 'mxt', 'commands', 'debug.md'),
        path.join('agent', 'commands', 'codex', 'mxt', 'skills', 'mxt-debug', 'SKILL.md')
    ];

    for (const file of files) {
        const content = await fs.readFile(path.resolve(__dirname, '..', file), 'utf8');
        assert.match(content, /DEBUG Report/);
        assert.match(content, /GOON_PATH/);
        assert.match(content, /goon-\$编号\.md|goon-<编号>\.md/);
        assert.match(content, /整改项/);
    }
};

const testLoopCommandsUseScopedVerificationAndReuse = async () => {
    const files = [
        'agent/commands/claude/mxt/commands/loop.md',
        'agent/commands/opencode/mxt/commands/loop.md',
        'agent/commands/codex/mxt/commands/loop.md',
        'agent/commands/codex/mxt/skills/mxt-loop/SKILL.md'
    ];
    for (const file of files) {
        const content = await fs.readFile(path.resolve(__dirname, '..', file), 'utf8');
        assert.match(content, /代码指纹.*未变化.*复用|代码指纹与 RUN 相同，复用/s);
        assert.match(content, /真实运行环境、进程归属、监听端口和业务健康路径/);
        assert.match(content, /无问题.*立即结束/s);
        assert.match(content, /RUN 只发现一次适用规则/);
        assert.match(content, /默认禁止全 workspace、K8S、BUGS、Chat、热启动稳定性/);
        assert.match(content, /只重跑受影响的运行验证/);
    }
};

const testGoonCommandsForceFreshDiskLoad = async () => {
    const files = [
        'agent/commands/claude/mxt/commands/goon.md',
        'agent/commands/opencode/mxt/commands/goon.md',
        'agent/commands/codex/mxt/commands/goon.md',
        'agent/commands/codex/mxt/skills/mxt-goon/SKILL.md'
    ];
    for (const file of files) {
        const content = await fs.readFile(path.resolve(__dirname, '..', file), 'utf8');
        assert.match(content, /强制重新加载/);
        assert.match(content, /禁止使用上下文缓存/);
        assert.match(content, /goon-xxx\.md/);
        assert.match(content, /唯一整改输入/);
    }
};

const testEndCommandsConstrainAcceptanceDepth = async () => {
    const files = [
        'agent/commands/claude/mxt/commands/end.md',
        'agent/commands/opencode/mxt/commands/end.md',
        'agent/commands/codex/mxt/commands/end.md',
        'agent/commands/codex/mxt/skills/mxt-end/SKILL.md'
    ];
    for (const file of files) {
        const content = await fs.readFile(path.resolve(__dirname, '..', file), 'utf8');
        assert.match(content, /收敛验收/);
        assert.match(content, /禁止深挖/);
        assert.match(content, /不得扩散整改项/);
        assert.match(content, /到点停止/);
    }
};

const testAiCmdPromptsUseEnglishFirstHarness = async () => {
    const files = [
        ...['claude', 'codex', 'opencode'].flatMap((platform) => (
            ['plan', 'run', 'end', 'goon', 'debug', 'sync', 'start', 'loop']
                .map((name) => `agent/commands/${platform}/mxt/commands/${name}.md`)
        )),
        ...['plan', 'run', 'end', 'goon', 'debug', 'sync', 'start', 'loop']
            .map((name) => `agent/commands/codex/mxt/skills/mxt-${name}/SKILL.md`)
    ];

    for (const file of files) {
        const content = await fs.readFile(path.resolve(__dirname, '..', file), 'utf8');
        assert.match(content, /## Harness/);
        assert.match(content, /English-first/);
        assert.match(content, /Use Chinese only when quoting existing repository content/);
        assert.match(content, /Task isolation lock/);
        assert.match(content, /Fresh evidence before completion claims/);
        assert.match(content, /Do not trust conversation memory/);
    }
};

const main = async () => {
    await testDefaultThreadFallsBackTo20();
    await testThreadOverridesDefault();
    await testShrinkThreadPrunesOverflow();
    await testRunSkipsFocusModeSelection();
    await testTaskUsesCurrentR2moDirectory();
    await testPlanUsesCurrentR2moDirectory();
    await testRunUsesCurrentR2moDirectory();
    await testRunPlaysAudioAfterSelection();
    await testAiCmdInstallsSelectedPlatformsFromAgentCommands();
    await testAiCmdUninstallsSelectedPlatforms();
    await testAiCmdReinstallRefreshesPlatforms();
    await testAiCmdOpenCodePreservesJsonStringCommentMarkers();
    await testAiCmdClaudeInstallWritesHostPluginState();
    await testDebugCommandsRequireGoonDebugReport();
    await testLoopCommandsUseScopedVerificationAndReuse();
    await testGoonCommandsForceFreshDiskLoad();
    await testEndCommandsConstrainAcceptanceDepth();
    await testAiCmdPromptsUseEnglishFirstHarness();
    console.log('task tests passed');
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
