const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const Module = require("module");
const { spawnSync } = require("child_process");

const MXT_JS = path.resolve(__dirname, "mxt.js");
const TASK_DIR = path.join(".r2mo", "task");
const TASK_DATABASE_CONTENT = [
	"views:",
	"  - type: table",
	"    name: 表格",
	"    filters:",
	"      and:",
	'        - file.basename.startsWith("task-")',
	'        - file.ext.endsWith("md")',
	"    order:",
	"      - file.name",
	"      - runAt",
	"      - author",
	"      - status",
	"      - title",
	"",
].join("\n");

const _slotFilename = (slot) => `task-${String(slot).padStart(3, "0")}.md`;

const _taskContent = (title, body = "# Body") =>
	[
		"---",
		"runAt: 2026-04-19.00-00-00",
		`title: ${title}`,
		"author:",
		"---",
		"",
		body,
		"",
	].join("\n");

const _runTask = (cwd, env = process.env) =>
	spawnSync(process.execPath, [MXT_JS, "task"], {
		cwd,
		encoding: "utf8",
		env,
	});

const _read = (root, relPath) => fs.readFile(path.join(root, relPath), "utf8");

const _hash = (content) =>
	crypto.createHash("sha256").update(content).digest("hex");

const _taskDatabasePaths = (root) => ({
	database: path.join(root, ".r2mo", "任务数据库.base"),
	note: path.join(root, ".r2mo", `${path.basename(root).toUpperCase()}.md`),
});

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
			const entries = await fs.readdir(path.join(taskRoot, day.name), {
				withFileTypes: true,
			});
			for (const entry of entries) {
				if (entry.isFile()) {
					files.push(path.join(day.name, entry.name));
				}
			}
		}
		return files.sort();
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
};

const _readJson = async (root, relPath) =>
	JSON.parse(await _read(root, relPath));

const _withTempDir = async (fn) => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mxt-task-"));
	try {
		await fn(tempDir);
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}
};

const _withTempR2moDir = async (fn) => {
	await _withTempDir(async (root) => {
		const r2moDir = path.join(root, ".r2mo");
		await fs.mkdir(r2moDir, { recursive: true });
		await fn(root, r2moDir);
	});
};

const _runInit = (root) =>
	spawnSync(process.execPath, [MXT_JS, "init", "-d", root], {
		cwd: root,
		encoding: "utf8",
		env: process.env,
	});

const _snapshotTree = async (root) => {
	const entries = [];
	const walk = async (dir, prefix = "") => {
		const children = await fs.readdir(dir, { withFileTypes: true });
		children.sort((left, right) => left.name.localeCompare(right.name));
		for (const child of children) {
			const relativePath = path.join(prefix, child.name);
			const childPath = path.join(root, relativePath);
			entries.push(`${relativePath}:${child.isDirectory() ? "dir" : "file"}`);
			if (child.isDirectory()) {
				await walk(childPath, relativePath);
			}
		}
	};
	await walk(root);
	return entries;
};

const _snapshotFiles = async (root) => {
	const entries = [];
	const walk = async (dir, prefix = "") => {
		const children = await fs.readdir(dir, { withFileTypes: true });
		children.sort((left, right) => left.name.localeCompare(right.name));
		for (const child of children) {
			const relativePath = path.join(prefix, child.name);
			const childPath = path.join(root, relativePath);
			if (child.isDirectory()) {
				await walk(childPath, relativePath);
			} else if (child.isFile()) {
				entries.push(
					`${relativePath}:${_hash(await fs.readFile(childPath, "utf8"))}`,
				);
			}
		}
	};
	await walk(root);
	return entries;
};

const testInitCreatesDeterministicTaskDatabaseArtifacts = async () => {
	await _withTempDir(async (root) => {
		const paths = _taskDatabasePaths(root);
		const result = _runInit(root);
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);

		assert.strictEqual(
			await _read(root, ".r2mo/任务数据库.base"),
			TASK_DATABASE_CONTENT,
		);
		assert.strictEqual(
			await _read(root, `.r2mo/${path.basename(root).toUpperCase()}.md`),
			"",
		);

		const firstHashes = {
			database: _hash(await fs.readFile(paths.database)),
			note: _hash(await fs.readFile(paths.note)),
		};
		const stableTime = new Date("2020-01-01T00:00:00Z");
		await fs.utimes(paths.database, stableTime, stableTime);
		await fs.utimes(paths.note, stableTime, stableTime);

		const secondResult = _runInit(root);
		assert.notStrictEqual(
			secondResult.status,
			1,
			secondResult.stderr || secondResult.stdout,
		);

		assert.deepStrictEqual(
			{
				database: _hash(await fs.readFile(paths.database)),
				note: _hash(await fs.readFile(paths.note)),
			},
			firstHashes,
		);
		assert.strictEqual(
			(await fs.stat(paths.database)).mtimeMs,
			stableTime.getTime(),
		);
		assert.strictEqual((await fs.stat(paths.note)).mtimeMs, stableTime.getTime());
	});
};

const testTaskCreatesDeterministicTaskDatabaseArtifacts = async () => {
	await _withTempDir(async (root) => {
		const paths = _taskDatabasePaths(root);
		const firstResult = _runTask(root, { ...process.env, PATH: "" });
		assert.notStrictEqual(
			firstResult.status,
			1,
			firstResult.stderr || firstResult.stdout,
		);

		assert.strictEqual(
			await fs.readFile(paths.database, "utf8"),
			TASK_DATABASE_CONTENT,
		);
		assert.strictEqual(await fs.readFile(paths.note, "utf8"), "");
		const firstHashes = {
			database: _hash(await fs.readFile(paths.database)),
			note: _hash(await fs.readFile(paths.note)),
		};

		const secondResult = _runTask(root, { ...process.env, PATH: "" });
		assert.notStrictEqual(
			secondResult.status,
			1,
			secondResult.stderr || secondResult.stdout,
		);
		assert.deepStrictEqual(
			{
				database: _hash(await fs.readFile(paths.database)),
				note: _hash(await fs.readFile(paths.note)),
			},
			firstHashes,
		);
	});
};

const testInitCreatesSweDirectoriesAndPreservesExistingContent = async () => {
	await _withTempDir(async (root) => {
		const requirementsDir = path.join(root, ".r2mo", "requirements");
		const designDir = path.join(root, ".r2mo", "design");
		await fs.mkdir(requirementsDir, { recursive: true });
		await fs.mkdir(path.join(designDir, "existing"), { recursive: true });
		await fs.writeFile(
			path.join(requirementsDir, "project.md"),
			"existing project\n",
			"utf8",
		);

		const result = _runInit(root);
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);

		const lifeCycleDirs = [
			"requirements",
			"design",
			"planning",
			"development",
			"testing",
			"maintenance",
		];
		for (const dir of [...lifeCycleDirs, "workflow"]) {
			assert.strictEqual(await _exists(root, path.join(".r2mo", dir)), true);
		}
		assert.strictEqual(await _exists(root, path.join(".r2mo", "task")), true);
		assert.strictEqual(
			await _exists(root, path.join(".r2mo", "work-items")),
			false,
		);
		assert.strictEqual(
			await _read(root, path.join(".r2mo", "requirements", "project.md")),
			"existing project\n",
		);
		assert.strictEqual(
			await _exists(root, path.join(".r2mo", "design", "existing")),
			true,
		);
		assert.strictEqual(
			await _exists(root, path.join(".r2mo", "requirements", ".placeholder")),
			false,
		);

		const before = await _snapshotTree(root);
		const secondResult = _runInit(root);
		assert.notStrictEqual(
			secondResult.status,
			1,
			secondResult.stderr || secondResult.stdout,
		);
		assert.deepStrictEqual(await _snapshotTree(root), before);
	});
};

const testInitPreservesOverflowTasksAboveThreadThreshold = async () => {
	await _withTempDir(async (root) => {
		const taskRoot = path.join(root, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(path.join(taskRoot, "thread"), "25", "utf8");
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(26)),
			_taskContent("Overflow 026"),
			"utf8",
		);
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(77)),
			_taskContent("Overflow 077"),
			"utf8",
		);
		await fs.writeFile(path.join(taskRoot, "goon-026.md"), "overflow goon\n", "utf8");
		const before = await _snapshotTree(taskRoot);

		const result = _runInit(root);

		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
		assert.strictEqual(
			await _read(root, path.join(TASK_DIR, _slotFilename(26))),
			_taskContent("Overflow 026"),
		);
		assert.strictEqual(
			await _read(root, path.join(TASK_DIR, _slotFilename(77))),
			_taskContent("Overflow 077"),
		);
		assert.strictEqual(
			await _read(root, path.join(TASK_DIR, "goon-026.md")),
			"overflow goon\n",
		);
		assert.deepStrictEqual(await _listHistoryFiles(root), []);
		const after = await _snapshotTree(taskRoot);
		assert.ok(after.includes("task-026.md:file"));
		assert.ok(after.includes("task-077.md:file"));
		assert.ok(after.includes("goon-026.md:file"));
		assert.deepStrictEqual(after.slice(0, before.length), before);
	});
};

const testDefaultThreadFallsBackTo30 = async () => {
	await _withTempDir(async (root) => {
		const result = _runTask(root, { ...process.env, PATH: "" });

		const threadValue = (await _read(root, path.join(TASK_DIR, "thread"))).trim();
		assert.strictEqual(threadValue, "30");
		for (let i = 1; i <= 30; i++) {
			assert.strictEqual(
				await _exists(root, path.join(TASK_DIR, _slotFilename(i))),
				true,
			);
		}
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
	});
};

const testThreadOverridesDefault = async () => {
	await _withTempDir(async (root) => {
		const taskRoot = path.join(root, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(path.join(taskRoot, "thread"), "3", "utf8");

		const result = _runTask(root, { ...process.env, PATH: "" });
		assert.strictEqual(
			await _exists(root, path.join(TASK_DIR, _slotFilename(3))),
			true,
		);
		assert.strictEqual(
			await _exists(root, path.join(TASK_DIR, _slotFilename(4))),
			false,
		);
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
	});
};

const testShrinkThreadPreservesOverflowUntilSelected = async () => {
	await _withTempDir(async (root) => {
		const taskRoot = path.join(root, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(path.join(taskRoot, "thread"), "3", "utf8");
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(4)),
			_taskContent("业务任务"),
			"utf-8",
		);
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(5)),
			_taskContent("任务", ""),
			"utf-8",
		);
		await fs.writeFile(
			path.join(taskRoot, "goon-004.md"),
			"历史整改痕迹\n",
			"utf-8",
		);

		const result = _runTask(root, { ...process.env, PATH: "" });

		assert.strictEqual(
			await _exists(root, path.join(TASK_DIR, _slotFilename(4))),
			true,
		);
		assert.strictEqual(
			await _exists(root, path.join(TASK_DIR, _slotFilename(5))),
			true,
		);
		assert.strictEqual(
			await _read(root, path.join(TASK_DIR, "goon-004.md")),
			"历史整改痕迹\n",
		);
		assert.deepStrictEqual(await _listHistoryFiles(root), []);
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
	});
};

const testTaskSelectedArchiveClearsGoonWithoutBackup = async () => {
	await _withTempDir(async (root) => {
		const taskFile = path.resolve(__dirname, "executor", "executeTask.js");
		const taskRoot = path.join(root, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(path.join(taskRoot, "thread"), "1", "utf8");
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(2)),
			_taskContent("Selected overflow"),
			"utf8",
		);
		await fs.writeFile(
			path.join(taskRoot, "goon-002.md"),
			"pending remediation\n",
			"utf8",
		);

		const originalLoad = Module._load;
		const originalCwd = process.cwd;
		const originalExit = process.exit;
		const originalHomedir = os.homedir;
		const originalInfo = console.info;
		const originalWarn = console.warn;
		const originalError = console.error;
		const selections = [];
		let exitCode;

		try {
			Module._load = function (request, parent, isMain) {
				if (
					parent &&
					parent.filename === taskFile &&
					request === "../utils/mxt-menu"
				) {
					return {
						selectMultiple: async (items, title) => {
							selections.push(title);
							if (title.includes("超额任务")) {
								return {
									items: items.filter((item) => item.name === "task-002"),
								};
							}
							return { items: [] };
						},
					};
				}
					if (parent && parent.filename === taskFile && request === "../epic") {
						return {
							waiting() {},
							info() {},
							warn() {},
							error() {},
						};
					}
					if (
						parent &&
					parent.filename === taskFile &&
					request === "../utils/mxt-audio"
				) {
						return { playAudio() {} };
				}
					return originalLoad.call(this, request, parent, isMain);
			};

			process.cwd = () => root;
			process.exit = (code) => {
				exitCode = code;
			};
			os.homedir = () => root;
			console.info = () => {};
			console.warn = () => {};
			console.error = () => {};

			delete require.cache[taskFile];
			const executeTask = require(taskFile);
			await executeTask();
			await new Promise((resolve) => {
				const timer = setInterval(() => {
					if (exitCode !== undefined) {
						clearInterval(timer);
						resolve();
					}
				}, 1);
				setTimeout(() => {
					clearInterval(timer);
					resolve();
				}, 100);
			});
		} finally {
			delete require.cache[taskFile];
			Module._load = originalLoad;
			process.cwd = originalCwd;
			process.exit = originalExit;
			os.homedir = originalHomedir;
			console.info = originalInfo;
			console.warn = originalWarn;
			console.error = originalError;
		}

		assert.strictEqual(exitCode, 0);
		assert.deepStrictEqual(selections, [
			"选择要归档的超额任务（直接 Enter 跳过）",
			"选择要归档的任务（空槽位无操作）",
		]);
		assert.strictEqual(
			await _exists(root, path.join(TASK_DIR, _slotFilename(2))),
			false,
		);
		assert.strictEqual(
			await _read(root, path.join(TASK_DIR, "goon-002.md")),
			"",
		);
		const historyFiles = await _listHistoryFiles(root);
		assert.strictEqual(historyFiles.length, 1);
		assert.match(historyFiles[0], /TASK@Selected overflow\.md$/);
		assert.doesNotMatch(historyFiles[0], /goon/i);
	});
};

const testTaskSelectAllWritesOnlyNonEmptyTasksToHistory = async () => {
	await _withTempDir(async (root) => {
		const taskFile = path.resolve(__dirname, "executor", "executeTask.js");
		const taskRoot = path.join(root, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(path.join(taskRoot, "thread"), "2", "utf8");
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(1)),
			_taskContent("空任务", ""),
			"utf8",
		);
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(2)),
			_taskContent("有正文任务", "# 正文"),
			"utf8",
		);

		const originalLoad = Module._load;
		const originalCwd = process.cwd;
		const originalExit = process.exit;
		const originalHomedir = os.homedir;
		const originalInfo = console.info;
		const originalWarn = console.warn;
		const originalError = console.error;
		const selections = [];
		let exitCode;

		try {
			Module._load = function (request, parent, isMain) {
				if (
					parent &&
					parent.filename === taskFile &&
					request === "../utils/mxt-menu"
				) {
					return {
						selectMultiple: async (items, title) => {
							selections.push({ title, count: items.length });
							return { items };
						},
					};
				}
				if (parent && parent.filename === taskFile && request === "../epic") {
					return {
						waiting() {},
						info() {},
						warn() {},
						error() {},
					};
				}
				if (
					parent &&
					parent.filename === taskFile &&
					request === "../utils/mxt-audio"
				) {
					return { playAudio() {} };
				}
				return originalLoad.call(this, request, parent, isMain);
			};

			process.cwd = () => root;
			process.exit = (code) => {
				exitCode = code;
			};
			os.homedir = () => root;
			console.info = () => {};
			console.warn = () => {};
			console.error = () => {};

			delete require.cache[taskFile];
			const executeTask = require(taskFile);
			await executeTask();
			await new Promise((resolve) => {
				const timer = setInterval(() => {
					if (exitCode !== undefined) {
						clearInterval(timer);
						resolve();
					}
				}, 1);
				setTimeout(() => {
					clearInterval(timer);
					resolve();
				}, 100);
			});
		} finally {
			delete require.cache[taskFile];
			Module._load = originalLoad;
			process.cwd = originalCwd;
			process.exit = originalExit;
			os.homedir = originalHomedir;
			console.info = originalInfo;
			console.warn = originalWarn;
			console.error = originalError;
		}

		assert.strictEqual(exitCode, 0);
		assert.deepStrictEqual(selections, [
			{
				title: "选择要归档的任务（空槽位无操作）",
				count: 2,
			},
		]);
		const historyFiles = await _listHistoryFiles(root);
		assert.strictEqual(historyFiles.length, 1);
		assert.match(historyFiles[0], /TASK@有正文任务\.md$/);
		assert.match(
			await _read(root, path.join(TASK_DIR, _slotFilename(1))),
			/title: 空任务/,
		);
		assert.strictEqual(
			await _exists(root, path.join(TASK_DIR, _slotFilename(2))),
			true,
		);
	});
};

const testTaskArchiveSanitizesSpecialFilenameCharacters = async () => {
	await _withTempDir(async (root) => {
		const taskRoot = path.join(root, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(2)),
			_taskContent('API/DB\\Auth:Token*Flow?"<>|\u0001. ', "# Body"),
			"utf8",
		);
		await fs.writeFile(
			path.join(taskRoot, "goon-002.md"),
			"历史整改痕迹\n",
			"utf8",
		);

		const result = _runTask(root, { ...process.env, PATH: "" });
		const historyFiles = await _listHistoryFiles(root);

		assert.deepStrictEqual(historyFiles, []);
		assert.match(
			await _read(root, path.join(TASK_DIR, _slotFilename(2))),
			/title: API\/DB\\Auth:Token\*Flow\?"<>\|\u0001\. /,
		);
		assert.strictEqual(
			await _read(root, path.join(TASK_DIR, "goon-002.md")),
			"历史整改痕迹\n",
		);
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
	});
};

const testRunSkipsFocusModeSelection = async () => {
	const runFile = path.resolve(__dirname, "executor", "executeRun.js");

	await _withTempDir(async (root) => {
		const taskRoot = path.join(root, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(1)),
			_taskContent("直接执行任务", "# Body"),
			"utf8",
		);
		await fs.writeFile(
			path.join(root, "pom.xml"),
			"<project><artifactId>demo</artifactId></project>",
			"utf8",
		);
		await fs.mkdir(path.join(root, "demo-domain"), { recursive: true });
		await fs.mkdir(path.join(root, "demo-provider"), { recursive: true });
		await fs.mkdir(path.join(root, "demo-api"), { recursive: true });
		await fs.mkdir(path.join(root, "demo-ui"), { recursive: true });

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
			outCopy: async () => {},
		};

		try {
			Module._load = function (request, parent, isMain) {
				if (parent && parent.filename === runFile) {
					if (request === "../epic") return fakeEc;
					if (request === "../utils/mxt-audio") return { playAudio() {} };
					if (request === "../utils/mxt-file-utils")
						return { exists: (p) => fsSync.existsSync(p) };
					if (request === "../utils/mxt-menu") {
						return {
							selectSingle: async (items, title) => {
								menuTitles.push(title);
								return items[0];
							},
						};
					}
					if (request === "colors") return {};
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

		assert.deepStrictEqual(menuTitles, ["选择要执行的任务"]);
	});
};

const testTaskUsesCurrentR2moDirectory = async () => {
	await _withTempR2moDir(async (_root, r2moDir) => {
		const result = _runTask(r2moDir, { ...process.env, PATH: "" });

		const threadValue = (
			await fs.readFile(path.join(r2moDir, "task", "thread"), "utf8")
		).trim();
		assert.strictEqual(threadValue, "30");
		assert.strictEqual(
			await _exists(r2moDir, path.join("task", _slotFilename(1))),
			true,
		);
		assert.strictEqual(
			await _exists(r2moDir, path.join(".r2mo", "task", _slotFilename(1))),
			false,
		);
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
	});
};

const testRunUsesCurrentR2moDirectory = async () => {
	const runFile = path.resolve(__dirname, "executor", "executeRun.js");

	await _withTempR2moDir(async (_root, r2moDir) => {
		const taskRoot = path.join(r2moDir, "task");
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(1)),
			_taskContent("R2MO 目录任务", "# Body"),
			"utf8",
		);

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
			},
		};

		try {
			Module._load = function (request, parent, isMain) {
				if (parent && parent.filename === runFile) {
					if (request === "../epic") return fakeEc;
					if (request === "../utils/mxt-audio") return { playAudio() {} };
					if (request === "../utils/mxt-menu") {
						return {
							selectSingle: async (items, title) => {
								menuTitles.push(title);
								return items[0];
							},
						};
					}
					if (request === "colors") return {};
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

		assert.deepStrictEqual(menuTitles, ["选择要执行的任务"]);
		assert.strictEqual(copiedPrompts.length, 1);
		assert.match(copiedPrompts[0], /当前工作目录下 task\/task-001\.md /);
	});
};

const testPlanUsesCurrentR2moDirectory = async () => {
	const planFile = path.resolve(__dirname, "executor", "executePlan.js");

	await _withTempR2moDir(async (_root, r2moDir) => {
		const taskRoot = path.join(r2moDir, "task");
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(1)),
			_taskContent("规划任务", "# Body"),
			"utf8",
		);

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
			},
		};

		try {
			Module._load = function (request, parent, isMain) {
				if (parent && parent.filename === planFile) {
					if (request === "../epic") return fakeEc;
					if (request === "../utils/mxt-audio") {
						return {
							playAudio: (name) => {
								audioCalls.push(name);
							},
						};
					}
					if (request === "../utils/mxt-menu") {
						return {
							selectSingle: async (items, title) => {
								menuTitles.push(title);
								return items[0];
							},
						};
					}
					if (request === "colors") return {};
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

		assert.deepStrictEqual(menuTitles, ["选择要规划的任务"]);
		assert.deepStrictEqual(audioCalls, ["audio/task.ogg"]);
		assert.strictEqual(copiedPrompts.length, 1);
		assert.match(copiedPrompts[0], /当前工作目录下 task\/task-001\.md /);
		assert.match(copiedPrompts[0], /追加或更新 ## Plan 章节/);
		assert.match(copiedPrompts[0], /不要修改任务 status，不要追加 Changes/);
	});
};

const testRunPlaysAudioAfterSelection = async () => {
	const runFile = path.resolve(__dirname, "executor", "executeRun.js");

	await _withTempDir(async (root) => {
		const taskRoot = path.join(root, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(1)),
			_taskContent("音效任务", "# Body"),
			"utf8",
		);

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
			outCopy: async () => {},
		};

		try {
			Module._load = function (request, parent, isMain) {
				if (parent && parent.filename === runFile) {
					if (request === "../epic") return fakeEc;
					if (request === "../utils/mxt-audio") {
						return {
							playAudio: (name) => {
								audioCalls.push(name);
							},
						};
					}
					if (request === "../utils/mxt-menu") {
						return {
							selectSingle: async (items) => {
								selectionAudioState.push(audioCalls.slice());
								return items[0];
							},
						};
					}
					if (request === "colors") return {};
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
		assert.deepStrictEqual(audioCalls, ["audio/run.ogg"]);
	});
};

const testAiCmdInstallsSelectedPlatformsFromAgentCommands = async () => {
	const aiCmd = require("./utils/mxt-ai-cmd");

	await _withTempDir(async (homeDir) => {
		const legacy = "mo" + "mo";
		const legacyMarketplace = `${legacy}-skills`;
		const repoDir = path.join(homeDir, "repo");
		await fs.mkdir(repoDir, { recursive: true });
		await fs.mkdir(
			path.join(
				homeDir,
				".claude",
				"plugins",
				"cache",
				legacyMarketplace,
				legacy,
				"1.0.0",
			),
			{ recursive: true },
		);
		await fs.mkdir(
			path.join(homeDir, ".claude", "plugins", "marketplaces", legacyMarketplace),
			{ recursive: true },
		);
		await fs.mkdir(path.join(homeDir, ".codex", "plugins", legacy), {
			recursive: true,
		});
		await fs.mkdir(
			path.join(
				homeDir,
				".codex",
				"plugins",
				"cache",
				legacyMarketplace,
				legacy,
				"1.0.0",
			),
			{ recursive: true },
		);
		await fs.mkdir(
			path.join(homeDir, ".codex", "marketplaces", legacyMarketplace),
			{ recursive: true },
		);
		await fs.mkdir(path.join(homeDir, ".codex", "prompts"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(homeDir, ".codex", "prompts", `${legacy}-run.md`),
			"# legacy",
			"utf8",
		);
		await fs.mkdir(path.join(homeDir, ".config", "opencode"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(homeDir, ".config", "opencode", "opencode.json"),
			JSON.stringify({
				command: {
					[`${legacy}:run`]: { template: "legacy" },
				},
			}),
			"utf8",
		);
		await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
		await fs.writeFile(
			path.join(homeDir, ".claude", "settings.json"),
			JSON.stringify({
				env: {
					CLAUDE_CODE_SIMPLE: "1",
					KEEP_ME: "ok",
				},
				enabledPlugins: {
					[`${legacy}@${legacyMarketplace}`]: true,
				},
				extraKnownMarketplaces: {
					[legacyMarketplace]: {
						source: {
							source: "directory",
							path: "legacy",
						},
					},
				},
			}),
			"utf8",
		);
		await fs.mkdir(path.join(homeDir, ".codex"), { recursive: true });
		await fs.writeFile(
			path.join(homeDir, ".codex", "config.toml"),
			[
				`[plugins."${legacy}@${legacyMarketplace}"]`,
				"enabled = true",
				"",
				`[marketplaces.${legacyMarketplace}]`,
				'source_type = "local"',
				'source = "legacy"',
				"",
			].join("\n"),
			"utf8",
		);

		const installed = await aiCmd.installPlatforms(
			["claude", "codex", "opencode"],
			{ homeDir, repoDir },
		);

		assert.deepStrictEqual(
			installed.map((item) => item.id),
			["claude", "codex", "opencode"],
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					".claude-plugin",
					"plugin.json",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"plan.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"run.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"end.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"goon.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"marketplaces",
					"mxt-skills",
					".claude-plugin",
					"marketplace.json",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"marketplaces",
					"mxt-skills",
					".claude-plugin",
					"plugin.json",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"marketplaces",
					"mxt-skills",
					"commands",
					"plan.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"marketplaces",
					"mxt-skills",
					"commands",
					"run.md",
				),
			),
			true,
		);
		// User-level ~/.claude/commands/mxt:*.md is intentionally not written.
		// The enabled plugin cache is the single command source.
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:plan.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:run.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:end.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:goon.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:debug.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:sync.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:start.md")),
			false,
		);
		const claudePlugin = await _readJson(
			homeDir,
			path.join(
				".claude",
				"plugins",
				"marketplaces",
				"mxt-skills",
				".claude-plugin",
				"plugin.json",
			),
		);
		assert.deepStrictEqual(claudePlugin.commands, [
			"./commands/plan.md",
			"./commands/run.md",
			"./commands/end.md",
			"./commands/goon.md",
			"./commands/debug.md",
			"./commands/sync.md",
			"./commands/start.md",
			"./commands/loop.md",
			"./commands/doctor.md",
			"./commands/task.md",
		]);
		const claudeSettings = await _readJson(
			homeDir,
			path.join(".claude", "settings.json"),
		);
		assert.strictEqual(
			Object.hasOwn(claudeSettings.env || {}, "CLAUDE_CODE_SIMPLE"),
			false,
		);
		assert.strictEqual(claudeSettings.env.KEEP_ME, "ok");
		assert.strictEqual(claudeSettings.enabledPlugins["mxt@mxt-skills"], true);
		assert.strictEqual(
			claudeSettings.extraKnownMarketplaces["mxt-skills"].source.source,
			"directory",
		);
		assert.strictEqual(
			claudeSettings.extraKnownMarketplaces["mxt-skills"].source.path,
			path.join(homeDir, ".claude", "plugins", "marketplaces", "mxt-skills"),
		);
		assert.ok(Array.isArray(installed[0].warnings));
		assert.match(installed[0].warnings[0], /CLAUDE_CODE_SIMPLE/);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					".orphaned_at",
				),
			),
			false,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					legacyMarketplace,
					legacy,
					"1.0.0",
				),
			),
			false,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".claude", "plugins", "marketplaces", legacyMarketplace),
			),
			false,
		);
		assert.strictEqual(
			Object.hasOwn(
				claudeSettings.enabledPlugins || {},
				`${legacy}@${legacyMarketplace}`,
			),
			false,
		);
		assert.strictEqual(
			Object.hasOwn(
				claudeSettings.extraKnownMarketplaces || {},
				legacyMarketplace,
			),
			false,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", ".codex-plugin", "plugin.json"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "commands", "mplan.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "commands", "mrun.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "commands", "mend.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "commands", "mgoon.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "skills", "mxt-plan", "SKILL.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "skills", "mxt-run", "SKILL.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "skills", "mxt-end", "SKILL.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "skills", "mxt-goon", "SKILL.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					".codex-plugin",
					"plugin.json",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"mplan.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"mrun.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"skills",
					"mxt-plan",
					"SKILL.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"skills",
					"mxt-run",
					"SKILL.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					".agents",
					"plugins",
					"marketplace.json",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					".codex-plugin",
					"plugin.json",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					"commands",
					"mplan.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					"commands",
					"mrun.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					"skills",
					"mxt-plan",
					"SKILL.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					"skills",
					"mxt-run",
					"SKILL.md",
				),
			),
			true,
		);
		const codexMarketplace = await _readJson(
			homeDir,
			path.join(
				".codex",
				"marketplaces",
				"mxt-skills",
				".agents",
				"plugins",
				"marketplace.json",
			),
		);
		assert.strictEqual(codexMarketplace.name, "mxt-skills");
		assert.strictEqual(codexMarketplace.plugins[0].name, "mxt");
		assert.strictEqual(codexMarketplace.plugins[0].source.path, "./plugins/mxt");
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mplan.md")),
			true,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mrun.md")),
			true,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mend.md")),
			true,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mgoon.md")),
			true,
		);
		const mxtPlanSkill = await _read(
			homeDir,
			path.join(
				".codex",
				"marketplaces",
				"mxt-skills",
				"plugins",
				"mxt",
				"skills",
				"mxt-plan",
				"SKILL.md",
			),
		);
		assert.match(mxtPlanSkill, /name: mxt-plan/);
		assert.match(mxtPlanSkill, /## Plan/);
		assert.match(mxtPlanSkill, /requirement-traceable execution contract/);
		assert.match(mxtPlanSkill, /CONTRACT/);
		assert.match(mxtPlanSkill, /RULES/);
		const mxtRunSkill = await _read(
			homeDir,
			path.join(
				".codex",
				"marketplaces",
				"mxt-skills",
				"plugins",
				"mxt",
				"skills",
				"mxt-run",
				"SKILL.md",
			),
		);
		assert.match(mxtRunSkill, /name: mxt-run/);
		assert.match(
			mxtRunSkill,
			/Parse `NNN` \+ directives; emit `Lock:`/,
		);
		assert.match(
			mxtRunSkill,
			/Requirement traceability:/,
		);
		assert.match(mxtRunSkill, /WORKFLOW/);
		const mxtEndSkill = await _read(
			homeDir,
			path.join(
				".codex",
				"marketplaces",
				"mxt-skills",
				"plugins",
				"mxt",
				"skills",
				"mxt-end",
				"SKILL.md",
			),
		);
		assert.match(
			mxtEndSkill,
			/3-Layer verify every Changes entry/,
		);
		assert.match(mxtEndSkill, /Remediation Item N/);
		const mxtGoonSkill = await _read(
			homeDir,
			path.join(
				".codex",
				"marketplaces",
				"mxt-skills",
				"plugins",
				"mxt",
				"skills",
				"mxt-goon",
				"SKILL.md",
			),
		);
		assert.match(
			mxtGoonSkill,
			/Closure evidence appended to task `## Changes`/,
		);
		assert.match(mxtGoonSkill, /closure evidence/);
		const codexConfig = await _read(homeDir, path.join(".codex", "config.toml"));
		assert.match(codexConfig, /\[plugins\."mxt@mxt-skills"\]/);
		assert.match(codexConfig, /\[marketplaces\.mxt-skills\]/);
		assert.match(codexConfig, /source_type = "local"/);
		assert.strictEqual(
			codexConfig.includes(`[plugins."${legacy}@${legacyMarketplace}"]`),
			false,
		);
		assert.strictEqual(
			codexConfig.includes(`[marketplaces.${legacyMarketplace}]`),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "plugins", legacy)),
			false,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "cache", legacyMarketplace, legacy, "1.0.0"),
			),
			false,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "marketplaces", legacyMarketplace),
			),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", `${legacy}-run.md`)),
			false,
		);
		const opencodeConfig = JSON.parse(
			await _read(homeDir, path.join(".config", "opencode", "opencode.json")),
		);
		assert.strictEqual(
			Object.hasOwn(opencodeConfig.command || {}, `${legacy}:run`),
			false,
		);
		assert.ok(opencodeConfig.command["mxt:plan"]);
		assert.ok(opencodeConfig.command["mxt:run"]);
		assert.ok(opencodeConfig.command["mxt:end"]);
		assert.ok(opencodeConfig.command["mxt:goon"]);
		assert.match(opencodeConfig.command["mxt:plan"].template, /## Plan/);
		assert.match(
			opencodeConfig.command["mxt:plan"].template,
			/Scan `.r2mo\/task\/task-\*.md`/,
		);
		assert.match(
			opencodeConfig.command["mxt:plan"].template,
			/Replace `## Plan` in place; never append duplicates/,
		);
		assert.match(opencodeConfig.command["mxt:plan"].template, /RULES/);
		assert.match(
			opencodeConfig.command["mxt:run"].template,
			/Operate on `\.r2mo\/task\/task-NNN\.md`/,
		);
		assert.match(
			opencodeConfig.command["mxt:run"].template,
			/Force multi-agent coordination/,
		);
		assert.match(
			opencodeConfig.command["mxt:run"].template,
			/Force worktree/,
		);
		assert.match(
			opencodeConfig.command["mxt:run"].template,
			/\.r2mo\/task\/task-NNN\.md/,
		);
		assert.match(
			opencodeConfig.command["mxt:run"].template,
			/Requirement traceability:/,
		);
		assert.match(opencodeConfig.command["mxt:run"].template, /WORKFLOW/);
		assert.match(
			opencodeConfig.command["mxt:end"].template,
			/\.r2mo\/task\/(goon-NNN\.md|archive a Bug Report)/,
		);
		assert.match(
			opencodeConfig.command["mxt:end"].template,
			/Verify `\.r2mo\/task\/task-NNN\.md`/,
		);
		assert.match(
			opencodeConfig.command["mxt:end"].template,
			/3-Layer verify every Changes entry/
		);
		assert.match(
			opencodeConfig.command["mxt:end"].template,
			/Remediation Item N/,
		);
		assert.match(
			opencodeConfig.command["mxt:goon"].template,
			/\.r2mo\/task\/(goon-NNN\.md|archive a Bug Report)/,
		);
		assert.match(
			opencodeConfig.command["mxt:goon"].template,
			/Fix exactly the listed/,
		);
		assert.match(
			opencodeConfig.command["mxt:goon"].template,
			/Closure evidence appended to task `## Changes`/,
		);
		const installedHarnessFiles = [
			path.join(
				".claude",
				"plugins",
				"cache",
				"mxt-skills",
				"mxt",
				"1.0.0",
				"commands",
				"run.md",
			),
			path.join(".codex", "plugins", "mxt", "commands", "mrun.md"),
			path.join(".codex", "plugins", "mxt", "skills", "mxt-run", "SKILL.md"),
			path.join(
				".codex",
				"plugins",
				"cache",
				"mxt-skills",
				"mxt",
				"1.0.0",
				"skills",
				"mxt-run",
				"SKILL.md",
			),
			path.join(
				".codex",
				"marketplaces",
				"mxt-skills",
				"plugins",
				"mxt",
				"skills",
				"mxt-run",
				"SKILL.md",
			),
			path.join(".codex", "prompts", "mrun.md"),
		];
		for (const file of installedHarnessFiles) {
			const content = await _read(homeDir, file);
			assert.match(content, /## Harness/i);
			assert.match(content, /English-first/);
			assert.match(content, /Print `Lock: <paths>`/);
			assert.match(content, /smallest sufficient verification/);
		}
		assert.ok(opencodeConfig.command["mxt:doctor"]);
		assert.match(opencodeConfig.command["mxt:run"].template, /## Harness/i);
		assert.match(opencodeConfig.command["mxt:run"].template, /English-first/);
		assert.match(opencodeConfig.command["mxt:run"].template, /LOCKED/);
		assert.match(opencodeConfig.command["mxt:run"].template, /CONTRACT/);
	});
};

const testAiCmdUninstallsSelectedPlatforms = async () => {
	const aiCmd = require("./utils/mxt-ai-cmd");

	await _withTempDir(async (homeDir) => {
		const repoDir = path.join(homeDir, "repo");
		await fs.mkdir(repoDir, { recursive: true });
		await aiCmd.installPlatforms(["claude", "codex", "opencode"], {
			homeDir,
			repoDir,
		});

		const uninstalled = await aiCmd.uninstallPlatforms(
			["claude", "codex", "opencode"],
			{ homeDir, repoDir },
		);

		assert.deepStrictEqual(
			uninstalled.map((item) => item.id),
			["claude", "codex", "opencode"],
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".claude", "plugins", "cache", "mxt-skills", "mxt", "1.0.0"),
			),
			false,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".claude", "plugins", "marketplaces", "mxt-skills"),
			),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:plan.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:run.md")),
			false,
		);
		const claudeSettings = await _readJson(
			homeDir,
			path.join(".claude", "settings.json"),
		);
		assert.strictEqual(
			Object.hasOwn(claudeSettings.enabledPlugins || {}, "mxt@mxt-skills"),
			false,
		);
		assert.strictEqual(
			Object.hasOwn(claudeSettings.extraKnownMarketplaces || {}, "mxt-skills"),
			false,
		);

		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "plugins", "mxt")),
			false,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "cache", "mxt-skills", "mxt", "1.0.0"),
			),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "marketplaces", "mxt-skills")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mxt")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mplan.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mrun.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mend.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mgoon.md")),
			false,
		);
		const codexConfig = await _read(homeDir, path.join(".codex", "config.toml"));
		assert.doesNotMatch(codexConfig, /\[plugins\."mxt@mxt-skills"\]/);
		assert.doesNotMatch(codexConfig, /\[marketplaces\.mxt-skills\]/);

		const opencodeConfig = JSON.parse(
			await _read(homeDir, path.join(".config", "opencode", "opencode.json")),
		);
		assert.strictEqual(
			Object.hasOwn(opencodeConfig.command || {}, "mxt:plan"),
			false,
		);
		assert.strictEqual(
			Object.hasOwn(opencodeConfig.command || {}, "mxt:run"),
			false,
		);
		assert.strictEqual(
			Object.hasOwn(opencodeConfig.command || {}, "mxt:end"),
			false,
		);
		assert.strictEqual(
			Object.hasOwn(opencodeConfig.command || {}, "mxt:goon"),
			false,
		);
	});
};

const testAiCmdReinstallRefreshesPlatforms = async () => {
	const aiCmd = require("./utils/mxt-ai-cmd");

	await _withTempDir(async (homeDir) => {
		const repoDir = path.join(homeDir, "repo");
		await fs.mkdir(repoDir, { recursive: true });

		await aiCmd.installPlatforms(["claude", "codex", "opencode"], {
			homeDir,
			repoDir,
		});
		const reinstalled = await aiCmd.installPlatforms(
			["claude", "codex", "opencode"],
			{ homeDir, repoDir },
		);

		assert.deepStrictEqual(
			reinstalled.map((item) => item.id),
			["claude", "codex", "opencode"],
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"run.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".claude", "commands", "mxt:run.md")),
			false,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mplan.md")),
			true,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mrun.md")),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					"skills",
					"mxt-plan",
					"SKILL.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					"commands",
					"mrun.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					"skills",
					"mxt-run",
					"SKILL.md",
				),
			),
			true,
		);
		const opencodeConfig = JSON.parse(
			await _read(homeDir, path.join(".config", "opencode", "opencode.json")),
		);
		assert.ok(opencodeConfig.command["mxt:plan"]);
		assert.ok(opencodeConfig.command["mxt:run"]);
		assert.ok(opencodeConfig.command["mxt:end"]);
		assert.ok(opencodeConfig.command["mxt:goon"]);
	});
};

const testAiCmdOpenCodePreservesJsonStringCommentMarkers = async () => {
	const aiCmd = require("./utils/mxt-ai-cmd");

	await _withTempDir(async (homeDir) => {
		await fs.mkdir(path.join(homeDir, ".config", "opencode"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(homeDir, ".config", "opencode", "opencode.json"),
			JSON.stringify(
				{
					command: {
						custom: {
							description: "Custom command",
							template:
								"https://example.test/path\nconst value = 1; // this is template text",
						},
					},
				},
				null,
				2,
			),
			"utf8",
		);

		await aiCmd.installPlatforms(["opencode"], { homeDir });

		const opencodeConfig = JSON.parse(
			await _read(homeDir, path.join(".config", "opencode", "opencode.json")),
		);
		assert.strictEqual(
			opencodeConfig.command.custom.template.includes("// this is template text"),
			true,
		);
		assert.ok(opencodeConfig.command["mxt:goon"]);
	});
};

const testAiCmdClaudeInstallWritesHostPluginState = async () => {
	const aiCmd = require("./utils/mxt-ai-cmd");

	await _withTempDir(async (homeDir) => {
		await aiCmd.installPlatforms(["claude"], { homeDir });

		const known = await _readJson(
			homeDir,
			path.join(".claude", "plugins", "known_marketplaces.json"),
		);
		const installed = await _readJson(
			homeDir,
			path.join(".claude", "plugins", "installed_plugins.json"),
		);

		assert.strictEqual(known["mxt-skills"].source.source, "directory");
		assert.strictEqual(
			known["mxt-skills"].source.path,
			path.join(homeDir, ".claude", "plugins", "marketplaces", "mxt-skills"),
		);
		assert.strictEqual(
			known["mxt-skills"].installLocation,
			path.join(homeDir, ".claude", "plugins", "marketplaces", "mxt-skills"),
		);
		assert.strictEqual(installed.version, 2);
		assert.strictEqual(installed.plugins["mxt@mxt-skills"][0].scope, "user");
		assert.strictEqual(
			installed.plugins["mxt@mxt-skills"][0].installPath,
			path.join(
				homeDir,
				".claude",
				"plugins",
				"cache",
				"mxt-skills",
				"mxt",
				"1.0.0",
			),
		);
		assert.strictEqual(installed.plugins["mxt@mxt-skills"][0].version, "1.0.0");
	});
};

const testAiCmdValidatesCrossPlatformInstallTargets = async () => {
	const aiCmd = require("./utils/mxt-ai-cmd");

	await _withTempDir(async (homeDir) => {
		const originalPlatform = process.platform;
		const originalAppdata = process.env.APPDATA;
		const originalHomedir = os.homedir;
		Object.defineProperty(process, "platform", {
			value: "win32",
			configurable: true,
		});
		os.homedir = () => homeDir;
		process.env.APPDATA = path.join(homeDir, "AppData", "Roaming");
		try {
			const installed = await aiCmd.installPlatforms("all", { homeDir });

			assert.deepStrictEqual(
				installed.map((item) => item.id),
				["claude", "codex", "opencode", "pi"],
			);
			assert.strictEqual(
				await _exists(
					homeDir,
					path.join(
						".claude",
						"plugins",
						"cache",
						"mxt-skills",
						"mxt",
						"1.0.0",
						"commands",
						"loop.md",
					),
				),
				true,
			);
			assert.strictEqual(
				await _exists(
					homeDir,
					path.join(
						".claude",
						"plugins",
						"marketplaces",
						"mxt-skills",
						"commands",
						"loop.md",
					),
				),
				true,
			);
			assert.strictEqual(
				await _exists(
					homeDir,
					path.join(".codex", "plugins", "mxt", "commands", "mloop.md"),
				),
				true,
			);
			assert.strictEqual(
				await _exists(
					homeDir,
					path.join(".codex", "plugins", "mxt", "skills", "mxt-loop", "SKILL.md"),
				),
				true,
			);
			assert.strictEqual(
				await _exists(
					homeDir,
					path.join(
						".codex",
						"plugins",
						"cache",
						"mxt-skills",
						"mxt",
						"1.0.0",
						"commands",
						"mloop.md",
					),
				),
				true,
			);
			assert.strictEqual(
				await _exists(
					homeDir,
					path.join(
						".codex",
						"marketplaces",
						"mxt-skills",
						"plugins",
						"mxt",
						"skills",
						"mxt-loop",
						"SKILL.md",
					),
				),
				true,
			);
			assert.strictEqual(
				await _exists(homeDir, path.join(".codex", "prompts", "mloop.md")),
				true,
			);

			const configPath = path.join(
				homeDir,
				"AppData",
				"Roaming",
				"opencode",
				"opencode.json",
			);
			const config = JSON.parse(await fs.readFile(configPath, "utf8"));
			assert.ok(config.command["mxt:loop"]);
			assert.ok(config.command["mxt:end"]);
			assert.ok(config.command["mxt:goon"]);
			assert.ok(config.command["mxt:debug"]);
			assert.match(
				config.command["mxt:loop"].template,
				/## HOST RUNTIME/,
			);

			assert.strictEqual(
				await _exists(
					homeDir,
					path.join(".pi", "agent", "skills", "mxt-loop", "SKILL.md"),
				),
				true,
			);
			assert.strictEqual(
				await _exists(
					homeDir,
					path.join(".pi", "agent", "skills", "mxt-doctor", "SKILL.md"),
				),
				true,
			);
		} finally {
			Object.defineProperty(process, "platform", {
				value: originalPlatform,
				configurable: true,
			});
			os.homedir = originalHomedir;
			if (originalAppdata === undefined) delete process.env.APPDATA;
			else process.env.APPDATA = originalAppdata;
		}
	});
};

const testAiCmdMaintainsConsistentCommandCountsAndInstallsTaskWorkflow =
	async () => {
		const aiCmd = require("./utils/mxt-ai-cmd");
		const workflows = [
			"plan",
			"run",
			"end",
			"goon",
			"debug",
			"sync",
			"start",
			"loop",
			"doctor",
			"task",
		];
		const expectedCodexCommands = workflows
			.map((name) => `m${name}.md`)
			.sort();
		const expectedSkills = workflows.map((name) => `mxt-${name}`).sort();

		for (const platform of ["claude", "opencode"]) {
			const commands = await fs.readdir(
				path.resolve(
					__dirname,
					"..",
					"agent/commands",
					platform,
					"mxt/commands",
				),
			);
			assert.deepStrictEqual(
				commands.filter((name) => name.endsWith(".md")).sort(),
				[...workflows.map((name) => `${name}.md`)].sort(),
				`${platform} command inventory drifted`,
			);
		}

		const codexCommands = await fs.readdir(
			path.resolve(__dirname, "..", "agent/commands/codex/mxt/commands"),
		);
		assert.deepStrictEqual(
			codexCommands.filter((name) => name.endsWith(".md")).sort(),
			[...workflows.map((name) => `${name}.md`)].sort(),
		);

		const codexSkills = await fs.readdir(
			path.resolve(__dirname, "..", "agent/commands/codex/mxt/skills"),
		);
		assert.deepStrictEqual(codexSkills.sort(), expectedSkills);

		await _withTempDir(async (homeDir) => {
			const installed = await aiCmd.installPlatforms(
				["claude", "codex", "opencode", "pi"],
				{ homeDir },
			);
			assert.deepStrictEqual(
				installed.map((item) => item.id),
				["claude", "codex", "opencode", "pi"],
			);

			const claudeCommands = await fs.readdir(
				path.join(
					homeDir,
					".claude/plugins/cache/mxt-skills/mxt/1.0.0/commands",
				),
			);
			assert.deepStrictEqual(
				claudeCommands.filter((name) => name.endsWith(".md")).sort(),
				[...workflows.map((name) => `${name}.md`)].sort(),
			);
			assert.strictEqual(
				await _exists(homeDir, path.join(".claude/commands/mtask.md")),
				false,
			);

			const codexPluginCommands = await fs.readdir(
				path.join(homeDir, ".codex/plugins/mxt/commands"),
			);
			assert.deepStrictEqual(
				codexPluginCommands.filter((name) => name.endsWith(".md")).sort(),
				expectedCodexCommands,
			);
			assert.strictEqual(
				await _exists(homeDir, path.join(".codex/prompts/mtask.md")),
				true,
			);
			assert.strictEqual(
				await _exists(homeDir, path.join(".codex/prompts/mxt-task.md")),
				false,
			);

			const codexCacheCommands = await fs.readdir(
				path.join(
					homeDir,
					".codex/plugins/cache/mxt-skills/mxt/1.0.0/commands",
				),
			);
			assert.deepStrictEqual(
				codexCacheCommands.filter((name) => name.endsWith(".md")).sort(),
				expectedCodexCommands,
			);

			const codexMarketCommands = await fs.readdir(
				path.join(
					homeDir,
					".codex/marketplaces/mxt-skills/plugins/mxt/commands",
				),
			);
			assert.deepStrictEqual(
				codexMarketCommands.filter((name) => name.endsWith(".md")).sort(),
				expectedCodexCommands,
			);

			const opencodeConfig = JSON.parse(
				await fs.readFile(
					path.join(homeDir, ".config/opencode/opencode.json"),
					"utf8",
				),
			);
			assert.deepStrictEqual(
				Object.keys(opencodeConfig.command).sort(),
				[...workflows.map((name) => `mxt:${name}`)].sort(),
			);

			const piSkills = await fs.readdir(
				path.join(homeDir, ".pi/agent/skills"),
			);
			assert.deepStrictEqual(piSkills.sort(), expectedSkills);
			assert.deepStrictEqual(
				installed.find((item) => item.id === "pi").skills.sort(),
				expectedSkills,
			);

			const piPrompts = path.join(homeDir, ".pi/agent/prompts");
			assert.strictEqual(
				Object.hasOwn(
					installed.find((item) => item.id === "pi"),
					"commands",
				),
				false,
			);
			assert.deepStrictEqual(
				(await fs.readdir(piPrompts))
					.filter((name) => name.endsWith(".md"))
					.sort(),
				expectedSkills.map((skill) => `${skill}.md`).sort(),
			);
		});
	};

const testOtherAiCmdWorkflowsDoNotMutateR2moTaskState = async () => {
	const aiCmd = require("./utils/mxt-ai-cmd");

	await _withTempDir(async (homeDir) => {
		const taskRoot = path.join(homeDir, TASK_DIR);
		await fs.mkdir(taskRoot, { recursive: true });
		await fs.writeFile(path.join(taskRoot, "thread"), "25", "utf8");
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(26)),
			_taskContent("Overflow 026"),
			"utf8",
		);
		await fs.writeFile(
			path.join(taskRoot, _slotFilename(77)),
			_taskContent("Overflow 077"),
			"utf8",
		);
		await fs.writeFile(path.join(taskRoot, "goon-026.md"), "goon 026\n", "utf8");
		const before = await _snapshotFiles(taskRoot);

		await aiCmd.installPlatforms(["claude", "codex", "opencode", "pi"], {
			homeDir,
		});

		assert.deepStrictEqual(await _snapshotFiles(taskRoot), before);
	});
};

const testAiCmdInstallReportsActionablePlatformErrors = async () => {
	const aiCmd = require("./utils/mxt-ai-cmd");

	await _withTempDir(async (homeDir) => {
		await assert.rejects(
			() => aiCmd.installPlatforms("unknown-platform", { homeDir }),
			(error) => {
				assert.strictEqual(error.code, "MXT_INVALID_PLATFORM");
				assert.match(error.message, /不支持的平台: unknown-platform/);
				assert.deepStrictEqual(error.platformIds, ["unknown-platform"]);
				return true;
			},
		);

		const blocked = path.join(homeDir, ".claude", "plugins", "cache");
		await fs.mkdir(path.dirname(blocked), { recursive: true });
		await fs.writeFile(blocked, "blocked-by-file", "utf8");

		await assert.rejects(
			() => aiCmd.installPlatforms(["claude"], { homeDir }),
			(error) => {
				assert.strictEqual(error.code, "ENOTDIR");
				assert.match(error.message, /安装 Claude Code 配置失败/);
				assert.match(error.message, /target=.*mxt-skills/);
				assert.match(error.message, /建议:/);
				assert.strictEqual(error.platformId, "claude");
				return true;
			},
		);
	});
};

const testHelpExecutorHandlesMetadataFailureSafely = async () => {
	const helpFile = path.resolve(__dirname, "executor", "executeHelp.js");
	const originalLoad = Module._load;
	const originalExit = process.exit;
	const originalLog = console.log;
	const originalError = console.error;
	const outputs = [];

	Module._load = function (request, parent, isMain) {
		if (request === "../epic") {
			return {
				parseArgument: () => ({}),
				parseMetadata: () => {
					throw new Error("metadata read failed");
				},
				error: (message) => outputs.push(`error:${message}`),
			};
		}
		return originalLoad.call(this, request, parent, isMain);
	};
	process.exit = (code) => {
		throw new Error(`EXIT:${code}`);
	};
	console.log = (value) => outputs.push(String(value));
	console.error = (value) => outputs.push(String(value));

	try {
		delete require.cache[helpFile];
		const executeHelp = require(helpFile);
		executeHelp();
		throw new Error("help executor should exit");
	} catch (error) {
		assert.match(error.message, /^EXIT:1$/);
		assert.deepStrictEqual(outputs, ["error:metadata read failed"]);
	} finally {
		delete require.cache[helpFile];
		Module._load = originalLoad;
		process.exit = originalExit;
		console.log = originalLog;
		console.error = originalError;
	}
};

const testAiCmdUsesWindowsSafeCommandExecution = async () => {
	const source = await fs.readFile(
		path.resolve(__dirname, "utils/mxt-ai-cmd.js"),
		"utf8",
	);
	const spawnCalls = [...source.matchAll(/spawnSync\(([^;]+)\);/gs)].length;
	assert.ok(spawnCalls > 0);
	assert.strictEqual(/shell\s*:\s*true/.test(source), false);
	assert.strictEqual(/shell\s*:/.test(source), false);
	assert.strictEqual(
		/const lookup = isWindows \? ["']where\.exe["'] : ["']which["'];/.test(
			source,
		),
		true,
	);
};

const testDebugCommandsRequireGoonDebugReport = async () => {
	const files = [
		path.join("agent", "commands", "claude", "mxt", "commands", "debug.md"),
		path.join("agent", "commands", "opencode", "mxt", "commands", "debug.md"),
		path.join("agent", "commands", "codex", "mxt", "commands", "debug.md"),
		path.join(
			"agent",
			"commands",
			"codex",
			"mxt",
			"skills",
			"mxt-debug",
			"SKILL.md",
		),
	];

	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /DEBUG Report/);
		assert.match(content, /GOON_PATH/);
		assert.match(content, /(goon-NNN\.md|archive a Bug Report)/);
		assert.match(content, /Legacy Bridge|legacy bridge|debug report|DEBUG Report/);
	}
};

const testAiCmdAllSkillsEnforceClosedLoopContracts = async () => {
	const names = [
		"debug",
		"doctor",
		"end",
		"goon",
		"loop",
		"plan",
		"run",
		"start",
		"sync",
	];
	const files = [
		...names.flatMap((name) => [
			`agent/commands/claude/mxt/commands/${name}.md`,
			`agent/commands/opencode/mxt/commands/${name}.md`,
			`agent/commands/codex/mxt/commands/${name}.md`,
			`agent/commands/codex/mxt/skills/mxt-${name}/SKILL.md`,
		]),
	];

	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /## (CONTRACT|RULES|HOST RUNTIME|SESSION ISOLATION|LOCKED PATHS)/);
		assert.match(content, /disk state|disk-only|Disk|disk/i);
		assert.match(content, /evidence|Verification|verification|health/i);
		assert.match(content, /boundary|scope|Boundary|Profile/i);
		assert.match(content, /stop|Stop|blocked|Blocked|abort|failure/i);
	}

	for (const name of names) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", `docs/skills/mxt-${name}.md`),
			"utf8",
		);
		assert.match(content, /## 闭环契约/);
		assert.match(content, /磁盘状态/);
		assert.match(content, /真实证据/);
	}
};

const testAiCmdAllSkillsUseSharedPromptBodies = async () => {
	const names = [
		"debug",
		"doctor",
		"end",
		"goon",
		"loop",
		"plan",
		"run",
		"start",
		"sync",
	];
	for (const name of names) {
		const command = await fs.readFile(
			path.resolve(
				__dirname,
				"..",
				`agent/commands/codex/mxt/commands/${name}.md`,
			),
			"utf8",
		);
		const skill = await fs.readFile(
			path.resolve(
				__dirname,
				"..",
				`agent/commands/codex/mxt/skills/mxt-${name}/SKILL.md`,
			),
			"utf8",
		);

		if (name === "doctor") {
			assert.match(
				command,
				/audits and remediates anti-drift baseline metadata/,
			);
			assert.match(skill, /## CONTRACT/);
			assert.match(skill, /\.conf` FORMAT/);
		} else {
			assert.strictEqual(
				skill.slice(skill.indexOf("\n---\n", 4) + 5),
				command.slice(command.indexOf("\n---\n", 4) + 5),
				`Codex skill body does not match command body: ${name}`,
			);
		}

		for (const platform of ["claude", "opencode"]) {
			const platformCommand = await fs.readFile(
				path.resolve(
					__dirname,
					"..",
					`agent/commands/${platform}/mxt/commands/${name}.md`,
				),
				"utf8",
			);
			assert.strictEqual(
				platformCommand,
				command,
				`${platform}/${name}.md drifted from Codex source`,
			);
		}
	}
};

const testAiCmdRegistersDoctorAcrossAllPlatforms = async () => {
	const claude = JSON.parse(
		await fs.readFile(
			path.resolve(
				__dirname,
				"..",
				"agent/commands/claude/mxt/.claude-plugin/plugin.json",
			),
			"utf8",
		),
	);
	assert.ok(claude.commands.includes("./commands/doctor.md"));
	assert.match(claude.description, /doctor/);

	const claudeManifestDirs = [
		"agent/commands/claude/mxt/.claude-plugin/plugin.json",
		"agent/commands/claude/mxt/plugin.json",
	];
	const taskManifests = await Promise.all(
		claudeManifestDirs.map((file) =>
			fs
				.readFile(path.resolve(__dirname, "..", file), "utf8")
				.then(JSON.parse),
		),
	);
	taskManifests.forEach((manifest, index) => {
		assert.match(manifest.description, /\/mxt:task/);
		assert.ok(
			manifest.commands.includes("./commands/task.md"),
			`Missing task command in ${claudeManifestDirs[index]}`,
		);
	});

	const aiCmd = require("./utils/mxt-ai-cmd");
	await _withTempDir(async (homeDir) => {
		const installed = await aiCmd.installPlatforms(
			["claude", "codex", "opencode"],
			{ homeDir },
		);
		assert.deepStrictEqual(
			installed.map((item) => item.id),
			["claude", "codex", "opencode"],
		);

		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".claude",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"doctor.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "commands", "mdoctor.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"commands",
					"mdoctor.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"marketplaces",
					"mxt-skills",
					"plugins",
					"mxt",
					"commands",
					"mdoctor.md",
				),
			),
			true,
		);
		assert.strictEqual(
			await _exists(homeDir, path.join(".codex", "prompts", "mdoctor.md")),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(".codex", "plugins", "mxt", "skills", "mxt-doctor", "SKILL.md"),
			),
			true,
		);
		assert.strictEqual(
			await _exists(
				homeDir,
				path.join(
					".codex",
					"plugins",
					"cache",
					"mxt-skills",
					"mxt",
					"1.0.0",
					"skills",
					"mxt-doctor",
					"SKILL.md",
				),
			),
			true,
		);

		const opencodeConfig = JSON.parse(
			await _read(homeDir, path.join(".config", "opencode", "opencode.json")),
		);
		assert.ok(opencodeConfig.command["mxt:doctor"]);
		assert.match(
			opencodeConfig.command["mxt:doctor"].template,
			/## (CONTRACT|RULES|HOST RUNTIME|SESSION ISOLATION|LOCKED PATHS)/,
		);
	});
};

const testLoopCommandsUseScopedVerificationAndReuse = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/loop.md",
		"agent/commands/opencode/mxt/commands/loop.md",
		"agent/commands/codex/mxt/commands/loop.md",
		"agent/commands/codex/mxt/skills/mxt-loop/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /cycles RUN\/END\/GOON\/END_REVIEW/);
		assert.match(
			content,
			/Two independent sessions, same host/,
		);
		assert.match(content, /Counter \(mechanical\).*Remediation Item/s);
		assert.match(
			content,
			/Each phase obeys the corresponding single-phase skill contract verbatim/,
		);
		assert.match(
			content,
			/Cosmetic \/ speculative findings never replace the queue/,
		);
		assert.match(content, /until item count = 0/);
	}
};

const testLoopCommandsRequireIsolatedDevelopmentAndReviewSessions =
	async () => {
		const files = [
			"agent/commands/claude/mxt/commands/loop.md",
			"agent/commands/opencode/mxt/commands/loop.md",
			"agent/commands/codex/mxt/commands/loop.md",
			"agent/commands/codex/mxt/skills/mxt-loop/SKILL.md",
		];
		for (const file of files) {
			const content = await fs.readFile(
				path.resolve(__dirname, "..", file),
				"utf8",
			);
			assert.match(content, /SESSION ISOLATION \(MANDATORY\)/);
			assert.match(content, /Dev \| RUN \+ GOON[\s\S]*Review \| END \+ END_REVIEW/);
			assert.match(content, /No shared context/);
			assert.match(content, /Self-review prohibited/);
			assert.match(content, /task-NNN\.md.*goon-NNN\.md/s);
			assert.match(content, /Two independent sessions, same host/);
			assert.match(content, /Cross-tool delegation forbidden/);
			assert.match(
				content,
				/never collapse into one session/,
			);
		}
	};

const testLoopReviewerUsesAdversarialChangeAnalysis = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/loop.md",
		"agent/commands/opencode/mxt/commands/loop.md",
		"agent/commands/codex/mxt/commands/loop.md",
		"agent/commands/codex/mxt/skills/mxt-loop/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /adversarially/i);
		assert.match(content, /Cosmetic \/ speculative findings never replace the queue/);
		assert.match(content, /END adversarially reviews[\s\S]*Cosmetic \/ speculative findings never replace the queue/s);
		assert.match(content, /Phase identity is immutable/);
		assert.match(content, /Remediation Item/);
		assert.match(content, /Cosmetic \/ speculative findings never replace the queue/);
	}
};

const testLoopRemediationItemsMustBeActionableAcrossRounds = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/loop.md",
		"agent/commands/opencode/mxt/commands/loop.md",
		"agent/commands/codex/mxt/commands/loop.md",
		"agent/commands/codex/mxt/skills/mxt-loop/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /END adversarially reviews/);
		assert.match(content, /GOON remediates only listed items/);
		assert.match(content, /Invoke the named/);
		assert.match(content, /until item count = 0/);
		assert.match(content, /END_REVIEW independently verifies removals/);
		assert.match(content, /END_REVIEW independently verifies/);
	}
};

const testGoonCommandsForceFreshDiskLoad = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/goon.md",
		"agent/commands/opencode/mxt/commands/goon.md",
		"agent/commands/codex/mxt/commands/goon.md",
		"agent/commands/codex/mxt/skills/mxt-goon/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /Goon is the sole input/);
		assert.match(content, /renumber survivors from 1/);
		assert.match(content, /(goon-NNN\.md|archive a Bug Report)/);
		assert.match(content, /sole input/);
	}
};

const testEndCommandsConstrainAcceptanceDepth = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/end.md",
		"agent/commands/opencode/mxt/commands/end.md",
		"agent/commands/codex/mxt/commands/end.md",
		"agent/commands/codex/mxt/skills/mxt-end/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /3-Layer verify every Changes entry/);
		assert.match(content, /Style \/ optimisation \/ speculative/);
		assert.match(content, /Requirements-first/);
		assert.match(content, /Verdict per entry/);
	}
};

const testLoopCommandsRequireHostAwareLongRunningContract = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/loop.md",
		"agent/commands/opencode/mxt/commands/loop.md",
		"agent/commands/codex/mxt/commands/loop.md",
		"agent/commands/codex/mxt/skills/mxt-loop/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /## HOST RUNTIME/);
		assert.match(content, /Platform \| Mechanism/);
		assert.match(content, /Codex.*create_goal/s);
		assert.match(content, /completes on 0 goon items/);
		assert.match(content, /external blocker/);
		assert.match(content, /Blocked = 2 consecutive rounds/);
		assert.match(content, /Session isolation unavailable/);
		assert.match(content, /OpenCode.*drive from disk/s);
		assert.match(content, /`\/loop` wrapper/);
		assert.match(content, /Two independent sessions; drive from disk/);
		assert.match(content, /Dev \| RUN \+ GOON/);
		assert.match(content, /Sessions communicate \*\*only\*\* via `task-NNN\.md` \+ `goon-NNN\.md`/);
		assert.match(content, /END_REVIEW/);
		assert.match(content, /status: Done.*goon = 0/s);
		assert.match(content, /item count = 0/);
		assert.match(content, /Blocked.*2 consecutive rounds/s);
		assert.match(
			content,
			/Two consecutive rounds with no item-count decrease/,
		);
		assert.match(content, /stop, preserve state/);
		assert.match(content, /until item count = 0/s);
		assert.match(
			content,
			/Preserve task\/goon as audit trail/,
		);
	}
};

const testEndCommandsRequireFreshContext = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/end.md",
		"agent/commands/opencode/mxt/commands/end.md",
		"agent/commands/codex/mxt/commands/end.md",
		"agent/commands/codex/mxt/skills/mxt-end/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /## CONTRACT/);
		assert.match(content, /every `## Changes` entry/);
		assert.match(
			content,
			/^## Remediation Item N — <title-lowercase-hyphenated-max-50-chars>$/m,
		);
		assert.match(
			content,
			/changed-file inventory/,
		);
		assert.match(content, /assume `## Changes` are untrusted/);
		assert.match(
			content,
			/diff \+ disk \+ requirements agree/,
		);
		assert.match(content, /git diff/);
		assert.match(content, /3-Layer Verification/);
	}
};

const testGoonCommandsRequireFreshSoleInput = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/goon.md",
		"agent/commands/opencode/mxt/commands/goon.md",
		"agent/commands/codex/mxt/commands/goon.md",
		"agent/commands/codex/mxt/skills/mxt-goon/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /## CONTRACT/);
		assert.match(content, /Goon is the sole input/);
		assert.match(content, /Fix exactly the listed `## Remediation Item N/);
		assert.match(
			content,
			/Disk is the only state carrier; re-read before every decision/,
		);
		assert.match(content, /run its stated verification command/);
		assert.match(content, /capture exit code/);
	}
};

const testDebugCommandsRequireIssueInventory = async () => {
	const files = [
		"agent/commands/claude/mxt/commands/debug.md",
		"agent/commands/opencode/mxt/commands/debug.md",
		"agent/commands/codex/mxt/commands/debug.md",
		"agent/commands/codex/mxt/skills/mxt-debug/SKILL.md",
	];
	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /## BUG FILE TEMPLATE/);
		assert.match(content, /Read `\$\{INDEX\}` first/);
		assert.match(content, /Leave no `\$\{…\}` or `_pending_`/);
		assert.match(content, /Upsert daily index row/);
		assert.match(content, /Same-bug rerun rewrites its row in place\. No duplicate rows\./);
		assert.match(content, /Never fabricate logs, stack traces, or command outputs\./);
		assert.match(content, /Never flip `status: fixed` before verification passes\./);
		assert.match(content, /Nine body sections are mandatory and ordered\./);
		assert.match(content, /Final report includes:/);
		assert.match(content, /No premature success claims\./);
	}
};

const testAiCmdPromptsUseEnglishFirstHarness = async () => {
	const files = [
		...["claude", "codex", "opencode"].flatMap((platform) =>
			["plan", "run", "end", "goon", "debug", "sync", "start", "loop"].map(
				(name) => `agent/commands/${platform}/mxt/commands/${name}.md`,
			),
		),
		...["plan", "run", "end", "goon", "debug", "sync", "start", "loop"].map(
			(name) => `agent/commands/codex/mxt/skills/mxt-${name}/SKILL.md`,
		),
	];

	for (const file of files) {
		const content = await fs.readFile(
			path.resolve(__dirname, "..", file),
			"utf8",
		);
		assert.match(content, /## Harness/i);
		assert.match(content, /English-first/);
		assert.match(content, /quote localized repo strings verbatim/);
		assert.match(content, /Print `Lock: <paths>`/);
		assert.match(content, /smallest sufficient verification/);
		assert.match(content, /Disk is the (?:only state carrier|authoritative)/);
	}
};

const main = async () => {
	await testInitCreatesDeterministicTaskDatabaseArtifacts();
	await testTaskCreatesDeterministicTaskDatabaseArtifacts();
	await testInitCreatesSweDirectoriesAndPreservesExistingContent();
	await testInitPreservesOverflowTasksAboveThreadThreshold();
	await testDefaultThreadFallsBackTo30();
	await testThreadOverridesDefault();
	await testShrinkThreadPreservesOverflowUntilSelected();
	await testTaskArchiveSanitizesSpecialFilenameCharacters();
	await testTaskSelectedArchiveClearsGoonWithoutBackup();
	await testTaskSelectAllWritesOnlyNonEmptyTasksToHistory();
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
	await testAiCmdValidatesCrossPlatformInstallTargets();
	await testAiCmdMaintainsConsistentCommandCountsAndInstallsTaskWorkflow();
	await testOtherAiCmdWorkflowsDoNotMutateR2moTaskState();
	await testAiCmdInstallReportsActionablePlatformErrors();
	await testHelpExecutorHandlesMetadataFailureSafely();
	await testAiCmdUsesWindowsSafeCommandExecution();
	await testDebugCommandsRequireGoonDebugReport();
	await testAiCmdAllSkillsEnforceClosedLoopContracts();
	await testAiCmdAllSkillsUseSharedPromptBodies();
	await testAiCmdRegistersDoctorAcrossAllPlatforms();
	await testLoopCommandsUseScopedVerificationAndReuse();
	await testLoopCommandsRequireIsolatedDevelopmentAndReviewSessions();
	await testLoopReviewerUsesAdversarialChangeAnalysis();
	await testLoopRemediationItemsMustBeActionableAcrossRounds();
	await testGoonCommandsForceFreshDiskLoad();
	await testEndCommandsConstrainAcceptanceDepth();
	await testLoopCommandsRequireHostAwareLongRunningContract();
	await testEndCommandsRequireFreshContext();
	await testGoonCommandsRequireFreshSoleInput();
	await testDebugCommandsRequireIssueInventory();
	await testAiCmdPromptsUseEnglishFirstHarness();
	await testCoderScanCreatesMultiStoreIndexAndIgnoresDerivedArtifact();
	await testCoderScanIsIdempotentWithMatchingSchema();
	await testCoderPhase2UsesSqliteBackedVectorIndex();
	await testCoderExtractsStructuralSymbolGraph();
	await testCoderStatusReportsDetectedFrameworks();
	await testCoderStatusTracksRealFileDriftCorrectly();
	await testCoderLocateSurfacesChineseDocAnchor();
	await testCoderRecallHydratesVectorAndCjkCandidates();
	await testCoderExpandReturnsFileNeighborhood();
	await testCoderDetectsGitBranch();
	await testCoderScanRebuildsOnBranchSwitch();
	console.log("task tests passed");
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

// ---------------------------------------------------------------------------
// mxt coder regression tests (Phase 0)
// ---------------------------------------------------------------------------

const CODER_EXEC = path.resolve(__dirname, "executor/executeCoder.js");
const CODER_FIXTURE_FILES = {
    "package.json": JSON.stringify({
        name: "coder-fix",
        scripts: { build: "noop" }
    }),
    "auth.ts": [
        "// 登录验证码长度校验， 最短六位",
        "export const MIN_CAPTCHA_LEN = 6;",
        "export function validateCaptcha(input: string): boolean {",
        "  return /^[0-9]+$/.test(input) && input.length >= MIN_CAPTCHA_LEN;",
        "}",
        "export class LoginController {",
        "  route = '/auth/login';",
        "  submit(p: unknown) { return validateCaptcha(String(p)); }",
        "}",
    ].join("\n"),
    "order.js": [
        "// 订单取消后触发库存回滚",
        "const express = require('express');",
        "const router = express.Router();",
        "router.post('/orders/:id/cancel', async (req, res) => { res.json({ ok: true }); });",
        "module.exports = router;",
    ].join("\n"),
};

const _runCoderCli = (cwd, subcommand, ...rest) =>
	spawnSync(process.execPath, [MXT_JS, "coder", subcommand, ...rest], {
		cwd,
		encoding: "utf8",
	});

const _runCoderModule = async (fixtureFn) => {
	await _withTempDir(async (root) => {
		for (const [name, body] of Object.entries(CODER_FIXTURE_FILES)) {
			await fs.writeFile(path.join(root, name), body, "utf8");
		}
		await fixtureFn(root);
	});
};

const testCoderScanCreatesMultiStoreIndexAndIgnoresDerivedArtifact = async () => {
	await _runCoderModule(async (root) => {
		const result = _runCoderCli(root, "scan");
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);

		const indexPath = path.join(root, ".r2mo", "repo", "self");
		for (const name of ["meta.json", "graph.db"]) {
			assert.ok(
				fsSync.existsSync(path.join(indexPath, name)),
				`expected ${name} inside ${indexPath}`,
			);
		}
		const gitignore = await _read(root, ".gitignore");
		assert.ok(
			gitignore.split("\n").map((line) => line.trim()).includes(".r2mo/repo/"),
			"first scan must ignore the derived repo namespace",
		);
		// No backup should linger after an originally-absent .gitignore.
		assert.strictEqual(
			fsSync.readdirSync(root).filter((name) => name.includes(".mcode-backup")).length,
			0,
		);
		const meta = JSON.parse(await _read(root, ".r2mo/repo/self/meta.json"));
		assert.strictEqual(meta.schemaVersion, "2.2.3");
		assert.ok(meta.stats.files >= 3, "scanner should discover all seeded files");
		assert.ok(meta.stats.nodes > 0, "scanner must produce nodes");
	});
};

const testCoderPhase2UsesSqliteBackedVectorIndex = async () => {
	const { CoderIndexStore } = require("./utils/mxt-coder-index");
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "coder-p2-"));
	const dbPath = path.join(root, "graph.db");
	try {
		const store = new CoderIndexStore(dbPath);
		const mk = (i) => {
			const fid = "f:mod" + i + ".js";
			const cid = "ch:mod" + i + ":0";
			const words = "alpha beta gamma delta epsilon cluster subject topic area " + i;
			return {
				nodes: [{ id: fid, kind: "FILE", name: "mod" + i + ".js", uri: "mod" + i + ".js" }],
				edges: [],
				chunks: [{ chunk_id: cid, node_id: fid, uri: "mod" + i + ".js", title: "mod", text: words, vector: CoderIndexStore.embedText(words) }],
				fileStates: [{ uri: "mod" + i + ".js", content_hash: "h" + i, byte_size: 128 }]
			};
		};
		for (let i = 0; i < 48; i++) store.persist(mk(i), ["mod" + i + ".js"], []);
		store.flushVectors();
		const vc = store.db.prepare("SELECT COUNT(*) n FROM vectors").get().n;
		assert.ok(vc >= 48, "vectors must persist inside sqlite");
		store.close();
		const reopen = new CoderIndexStore(dbPath);
		const cc = reopen.db.prepare("SELECT COUNT(*) n FROM ivf_centroids").get().n;
		reopen.close();
		assert.ok(cc >= 8, "ivf centroids must train at scale");
		const q = CoderIndexStore.embedText("alpha beta gamma cluster");
		const third = new CoderIndexStore(dbPath);
		const hits = third.searchVectors(q, 5);
		third.close();
		assert.ok(hits.length > 0, "recall must return matches");
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
};

const testCoderExtractsStructuralSymbolGraph = async () => {
	const Scanner = require("./utils/mxt-coder-scanner");
	const osMod = require("os");
	const root = await fs.mkdtemp(path.join(osMod.tmpdir(), "coder-structural-"));
	const file = path.join(root, "service.ts");
	const body = [
		"export class LoginService {",
		"  private minLength = 6;",
		"  validate(input: string) { return input.length >= this.minLength; }",
		"}",
		"export function submitLogin(v: string) { return new LoginService().validate(v); }",
	].join("\n");
	await fs.writeFile(file, body, "utf8");
	try {
		const fact = await Scanner.scanFile({ absolute: file, relative: "service.ts", ext: ".ts", bytes: body.length });
		assert.ok(fact.nodes.some(n => n.kind === "METHOD" && n.name === "validate"), "class methods must become METHOD nodes");
		assert.ok(fact.nodes.some(n => n.kind === "FIELD" && n.name === "minLength"), "class fields must become FIELD nodes");
		assert.ok(fact.chunks.filter(c => c.node_id !== "f:service.ts").length >= 2, "symbol-owned chunks must be attached to declarations");
		assert.ok(fact.edges.some(e => e.kind === "CALLS" && e.to_id === "ref:LoginService"), "constructor/identifier calls must be retained");
		assert.ok(!fact.nodes.some(n => n.id === "ref:LoginService"), "unresolved call targets must remain edges, not synthetic nodes");
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
};

const testCoderStatusReportsDetectedFrameworks = async () => {
	await _runCoderModule(async (root) => {
		// Seed a recognized dependency so status exercises the framework branch.
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "coder-framework-fix",
				dependencies: { express: "4.0.0" },
				devDependencies: { vite: "5.0.0" },
			}),
			"utf8",
		);
		_runCoderCli(root, "scan");

		const { CoderIndexStore } = require("./utils/mxt-coder-index");
		const store = new CoderIndexStore(path.join(root, ".r2mo/repo/self/graph.db"));
		const rows = store.getFrameworks();
		store.close();
		assert.deepStrictEqual(
			rows.map((row) => row.name).sort(),
			["Express", "Vite"],
			"recognized package dependencies must persist as framework facts",
		);

		const status = _runCoderCli(root, "status");
		assert.match(status.stdout, /Frameworks:/);
		assert.match(status.stdout, /Express/);
		assert.match(status.stdout, /Vite/);
	});
};

const testCoderScanIsIdempotentWithMatchingSchema = async () => {
	await _runCoderModule(async (root) => {
		_runCoderCli(root, "scan");
		const graphPath = path.join(root, ".r2mo/repo/self/graph.db");
		const statBefore = fsSync.statSync(graphPath);
		await new Promise((r) => setTimeout(r, 1200));
		const second = _runCoderCli(root, "scan");
		assert.notStrictEqual(second.status, 1, second.stderr || second.stdout);
		assert.ok(
			second.stdout.includes("already exists"),
			"idempotent scan should announce skip; got:" + second.stdout,
		);
		const statAfter = fsSync.statSync(graphPath);
		assert.strictEqual(statAfter.mtimeMs, statBefore.mtimeMs);
	});
};

const testCoderStatusTracksRealFileDriftCorrectly = async () => {
	await _runCoderModule(async (root) => {
		_runCoderCli(root, "scan");
		const preStatus = _runCoderCli(root, "status");
		assert.match(preStatus.stdout, /Drift: 0 files \(clean\)/);

		await fs.writeFile(
			path.join(root, "auth.ts"),
			CODER_FIXTURE_FILES["auth.ts"] + "\n// drift marker xyz\n",
			"utf8",
		);
		const mid = _runCoderCli(root, "status");
		assert.match(mid.stdout, /Drift: 1 files \(low\)/);

		const updated = _runCoderCli(root, "update");
		assert.notStrictEqual(updated.status, 1, updated.stderr || updated.stdout);
		const post = _runCoderCli(root, "status");
		assert.match(post.stdout, /Drift: 0 files \(clean\)/);
	});
};

const testCoderLocateSurfacesChineseDocAnchor = async () => {
	await _runCoderModule(async (root) => {
		_runCoderCli(root, "scan");
		const result = _runCoderCli(root, "locate", "登录验证码 长度校验");
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
		assert.match(result.stdout, /Entry Points/);
		assert.match(result.stdout, /auth\.ts/);
	});
};

const testCoderRecallHydratesVectorAndCjkCandidates = async () => {
	await _runCoderModule(async (root) => {
		_runCoderCli(root, "scan");
		const { CoderIndexStore, cjkBigramTerms, tokenize } = require("./utils/mxt-coder-index");
		const store = new CoderIndexStore(path.join(root, ".r2mo/repo/self/graph.db"));

		const vectorRows = store.searchVectors(
			CoderIndexStore.embedText("登录验证码 长度校验"), 10,
		);
		assert.ok(vectorRows.length > 0, "vector recall must return candidates");
		assert.equal(vectorRows[0].chunkId, "ch:auth.ts:0");
		assert.equal(vectorRows[0].nodeId, "f:auth.ts");

		const cngExpr = cjkBigramTerms(tokenize("登录验证码 长度校验")).join(" OR ");
		const cjkRows = store.lexicalCjkSearch(cngExpr, 10);
		assert.ok(
			cjkRows.some((row) => row.chunk_id === "ch:auth.ts:0"),
			"CJK-bigram FTS must recall partial Chinese phrases",
		);
		store.close();

		const result = _runCoderCli(root, "locate", "登录验证码 长度校验");
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
		assert.match(result.stdout, /DOC_ANCHOR/);
		assert.match(result.stdout, /登录验证码长度校验/);
	});
};

const testCoderExpandReturnsFileNeighborhood = async () => {
	await _runCoderModule(async (root) => {
		_runCoderCli(root, "scan");
		const lookup = new (require("./utils/mxt-coder-index").CoderIndexStore)(
			path.join(root, ".r2mo/repo/self/graph.db"),
		);
		const row = lookup.db
			.prepare("SELECT id FROM nodes WHERE uri='auth.ts' AND kind='FILE' LIMIT 1")
			.get();
		lookup.close();
		assert.ok(row, "expected FILE node for auth.ts");
		const result = _runCoderCli(root, "expand", row.id);
		assert.notStrictEqual(result.status, 1, result.stderr || result.stdout);
		assert.match(result.stdout, /Direct Relations/);
		assert.match(result.stdout, /LoginController/);
	});
};

const testCoderDetectsGitBranch = async () => {
	const {execFileSync} = require("child_process");
	const os = require("os");
	const tmpRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), "coder-branch-det-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd: tmpRoot });
		execFileSync("git", ["checkout", "-q", "-b", "main"], { cwd: tmpRoot });
		fsSync.writeFileSync(path.join(tmpRoot, "placeholder.txt"), "x");
		execFileSync("git", ["add", "-A"], { cwd: tmpRoot });
		execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init"], { cwd: tmpRoot });
		execFileSync("git", ["checkout", "-q", "-b", "feature/detect"], { cwd: tmpRoot });
		const Core = require("./utils/mxt-coder-core");
		const branch = Core.getGitBranch(tmpRoot);
		assert.strictEqual(branch, "feature/detect", "expected feature/detect got "+branch);
	} finally {
		fsSync.rmSync(tmpRoot, { recursive: true, force: true });
	}
};

const testCoderScanRebuildsOnBranchSwitch = async () => {
	const {execFileSync} = require("child_process");
	const os = require("os");
	const tmpRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), "coder-branch-swit-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd: tmpRoot });
		execFileSync("git", ["checkout", "-q", "-b", "main"], { cwd: tmpRoot });
		fsSync.writeFileSync(path.join(tmpRoot, "a.ts"), "export const a = 1\n");
		execFileSync("git", ["add", "-A"], { cwd: tmpRoot });
		execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "v1"], { cwd: tmpRoot });

		const Core = require("./utils/mxt-coder-core");
		const { resolveIndexPath } = require("./utils/mxt-coder-index");

		await Core.runFullScan(tmpRoot);
		let store = new (require("./utils/mxt-coder-index").CoderIndexStore)(resolveIndexPath(tmpRoot).graphPath);
		let metaRow = store.db.prepare("SELECT value FROM meta_store WHERE key='gitBranch'").get();
		store.close();
		assert.strictEqual(metaRow?.value, "main", "expected main got "+metaRow?.value);

		// Switch to develop; runFullScan sees branch change → rebuild.
		execFileSync("git", ["checkout", "-q", "-b", "develop"], { cwd: tmpRoot });
		await Core.runFullScan(tmpRoot);
		store = new (require("./utils/mxt-coder-index").CoderIndexStore)(resolveIndexPath(tmpRoot).graphPath);
		metaRow = store.db.prepare("SELECT value FROM meta_store WHERE key='gitBranch'").get();
		store.close();
		assert.strictEqual(metaRow?.value, "develop", "expected develop got "+metaRow?.value);
	} finally {
		fsSync.rmSync(tmpRoot, { recursive: true, force: true });
	}
};
