const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SOURCE_ROOT = path.join(ROOT_DIR, "agent", "commands");
const COMMAND_NAME = "mxt";
const MARKETPLACE_NAME = `${COMMAND_NAME}-skills`;
const LEGACY_COMMAND_NAME = "mo" + "mo";
const LEGACY_MARKETPLACE_NAME = `${LEGACY_COMMAND_NAME}-skills`;
const COMMAND_BASENAMES = [
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
const MXT_COMMANDS = COMMAND_BASENAMES.map((name) => `${COMMAND_NAME}:${name}`);
const LEGACY_COMMANDS = [
    "plan",
    "run",
    "end",
    "goon",
    "debug",
    "sync",
    "start",
].map((name) => `${LEGACY_COMMAND_NAME}:${name}`);
const CODEX_COMMANDS = COMMAND_BASENAMES;

// Codex-only short slash commands (/mplan, /mrun, ..., /mtask) use the
// semantic workflow ID but are published as m<workflow>.md. Skills and the
// $mxt-task prompt remain semantic so the workflow count stays consistent.
const codexCommandFilename = (workflow) => `m${workflow}.md`;
const codexPromptFilename = (workflow) => `m${workflow}.md`;

// OpenCode 配置路径：Windows 使用 %APPDATA%，其他平台使用 ~/.config/
// 接受 homeDir 参数以支持测试/临时 home 场景
const openCodeConfigDir = (homeDir) => {
    const base = homeDir || os.homedir();
    if (process.platform === "win32") {
        // Respect Windows APPDATA only when it belongs to the effective user home.
        // Explicit homeDir overrides it for tests, portable installs, and redirected homes.
        const processAppData = process.env.APPDATA;
        const defaultAppData = path.join(base, "AppData", "Roaming");
        const appData =
            !homeDir &&
            processAppData &&
            path.resolve(processAppData) === path.resolve(defaultAppData)
                ? processAppData
                : defaultAppData;
        return path.join(appData, "opencode");
    }
    return path.join(base, ".config", "opencode");
};

// Pi Coding Agent 全局技能目录：~/.pi/agent/skills/<skill>/SKILL.md，调用形式为 /skill:<name>
// 接受 homeDir 参数以支持测试/临时 home 场景
const piSkillsDir = (homeDir) =>
    path.join(homeDir || os.homedir(), ".pi", "agent", "skills");

// Pi 短命令别名目录：~/.pi/agent/prompts/<skill>.md 指向 ../skills/<skill>/SKILL.md
// Pi 的 prompt template 以文件名作为命令名，因此每个技能额外生成 /mxt-<name> 短命令；
// 模板正文中的 $ARGUMENTS 会被 Pi 替换为调用参数，与 /skill:<name> 等价。
const piPromptsDir = (homeDir) =>
    path.join(homeDir || os.homedir(), ".pi", "agent", "prompts");

const PLATFORMS = [
    {
        id: "claude",
        name: "Claude Code",
        description:
            "~/.claude/commands/mxt:*.md plus ~/.claude/plugins/marketplaces/mxt-skills and cache/mxt-skills/mxt/1.0.0",
        sourceDir: path.join(SOURCE_ROOT, "claude", "mxt"),
        targetDir: (homeDir) =>
            path.join(
                homeDir,
                ".claude",
                "plugins",
                "cache",
                "mxt-skills",
                "mxt",
                "1.0.0",
            ),
        installer: "claudeCache",
    },
    {
        id: "codex",
        name: "Codex",
        description: "~/.codex/marketplaces/mxt-skills and plugin cache",
        sourceDir: path.join(SOURCE_ROOT, "codex", "mxt"),
        targetDir: (homeDir) => path.join(homeDir, ".codex", "plugins", "mxt"),
        installer: "codexPlugin",
    },
    {
        id: "opencode",
        name: "OpenCode",
        description: "OpenCode command config",
        sourceDir: path.join(SOURCE_ROOT, "opencode", "mxt"),
        targetDir: (homeDir) =>
            path.join(openCodeConfigDir(homeDir), "opencode.json"),
        installer: "opencodeConfig",
    },
    {
        id: "pi",
        name: "Pi Agent",
        description:
            "~/.pi/agent/skills/mxt-* (Pi skills, invoked as /skill:mxt-*) plus ~/.pi/agent/prompts/mxt-*",
        sourceDir: path.join(SOURCE_ROOT, "codex", "mxt", "skills"),
        targetDir: (homeDir) => piSkillsDir(homeDir),
        installer: "piSkills",
    },
];

const listPlatforms = () => PLATFORMS.map((platform) => ({ ...platform }));

const normalizePlatformIds = (input) => {
    if (!input) return [];
    const values = Array.isArray(input) ? input : String(input).split(",");
    const ids = values
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean);
    if (ids.includes("all")) {
        return PLATFORMS.map((platform) => platform.id);
    }
    return [...new Set(ids)];
};

const resolvePlatforms = (ids) => {
    const selectedIds = normalizePlatformIds(ids);
    const platformMap = new Map(
        PLATFORMS.map((platform) => [platform.id, platform]),
    );
    const unknown = selectedIds.filter((id) => !platformMap.has(id));
    if (unknown.length > 0) {
        const error = new Error(`不支持的平台: ${unknown.join(", ")}`);
        error.code = "MXT_INVALID_PLATFORM";
        error.platformIds = unknown;
        throw error;
    }
    return selectedIds.map((id) => platformMap.get(id));
};
const isKnownFileOperationError = (error) =>
    [
        "ENOENT",
        "EACCES",
        "EPERM",
        "EBUSY",
        "ENOTDIR",
        "ENOTEMPTY",
        "EMFILE",
        "ENFILE",
    ].includes(error && error.code);

const platformOperationHint = (errorCode) => {
    if (errorCode === "EPERM" || errorCode === "EBUSY") {
        return "目标文件可能被正在运行的 AI 工具占用。请退出 Claude Code / Codex / OpenCode 后重试；Windows 可先等待数秒。";
    }
    if (errorCode === "EACCES") {
        return "当前用户没有目标目录写权限。请确认 HOME / APPDATA 指向当前用户配置目录，并以当前用户身份运行 mxt。";
    }
    if (errorCode === "ENOENT" || errorCode === "ENOTDIR") {
        return "目标路径不存在或类型不正确。请确认目标磁盘已挂载，且配置目录没有被文件或符号链接占用。";
    }
    if (errorCode === "EMFILE" || errorCode === "ENFILE") {
        return "进程打开文件数达到系统限制。请关闭其他占用文件句柄的程序后重试。";
    }
    return "请检查目标路径、磁盘空间和当前用户权限。";
};

const withPlatformError = async (
    operation,
    platform,
    homeDir,
    targetPath,
    fn,
) => {
    try {
        return await fn();
    } catch (error) {
        if (!isKnownFileOperationError(error)) throw error;
        const target =
            typeof targetPath === "function" ? targetPath(homeDir) : targetPath;
        error.message = [
            `${operation} ${platform.name} 配置失败 | home=${homeDir} | target=${target}`,
            `原因: ${error.code} ${error.message}`,
            `建议: ${platformOperationHint(error.code)}`,
        ].join("\n");
        error.platformId = platform.id;
        error.targetPath = target;
        throw error;
    }
};

const copyDir = async (sourceDir, targetDir) => {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    await fs.mkdir(targetDir, { recursive: true });
    let copied = 0;
    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copied += await copyDir(sourcePath, targetPath);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await retryOnWindows(() => fs.copyFile(sourcePath, targetPath));
            copied++;
        }
    }
    return copied;
};

// Codex plugin artifacts keep semantic skills and manifest data, while command
// files are published under short Codex-only names.
const copyCodexPluginArtifacts = async (sourceDir, targetDir) => {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    await fs.mkdir(targetDir, { recursive: true });
    let copied = 0;

    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        if (entry.isDirectory() && entry.name !== "commands") {
            copied += await copyDir(sourcePath, path.join(targetDir, entry.name));
        } else if (entry.isDirectory() && entry.name === "commands") {
            const commandTarget = path.join(targetDir, "commands");
            await fs.mkdir(commandTarget, { recursive: true });
            const commandEntries = await fs.readdir(sourcePath, {
                withFileTypes: true,
            });
            for (const command of commandEntries) {
                if (!command.isFile() || !command.name.endsWith(".md")) continue;
                const workflow = command.name.replace(/\.md$/, "");
                await fs.copyFile(
                    path.join(sourcePath, command.name),
                    path.join(commandTarget, codexCommandFilename(workflow)),
                );
                copied++;
            }
        } else if (entry.isFile() || entry.isSymbolicLink()) {
            await retryOnWindows(() =>
                fs.copyFile(sourcePath, path.join(targetDir, entry.name)),
            );
            copied++;
        }
    }
    return copied;
};

const stripJsonComments = (content) =>
    String(content || "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

const stripTrailingCommas = (content) => content.replace(/,\s*([}\]])/g, "$1");

const readJsonc = async (filePath) => {
    try {
        const content = await fs.readFile(filePath, "utf8");
        const raw = content.trim();
        if (!raw) return {};
        try {
            return JSON.parse(raw);
        } catch {
            // Fall through for JSONC files. Plain JSON may contain command templates
            // with literal '//' text, so do not strip comments before trying JSON.
        }
        const normalized = stripTrailingCommas(
            stripJsonComments(content),
        ).trim();
        return normalized ? JSON.parse(normalized) : {};
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
};

const readJsonFile = async (filePath) => {
    try {
        const content = await fs.readFile(filePath, "utf8");
        const trimmed = content.trim();
        return trimmed ? JSON.parse(trimmed) : {};
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
};

const writeJsonFile = async (filePath, value) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
};

const ensureTrailingNewline = (content) =>
    content.endsWith("\n") ? content : `${content}\n`;

const ensureTomlBlock = (content, header, lines) => {
    const blockLines = [`[${header}]`, ...lines];
    const existingLines = String(content || "")
        .replace(/\s+$/g, "")
        .split(/\r?\n/);
    const start = existingLines.findIndex(
        (line) => line.trim() === `[${header}]`,
    );

    if (start >= 0) {
        let end = start + 1;
        while (
            end < existingLines.length &&
            !/^\s*\[.+\]\s*$/.test(existingLines[end])
        ) {
            end++;
        }
        existingLines.splice(start, end - start, ...blockLines);
        return `${existingLines.join("\n")}\n`;
    }

    const normalized = String(content || "").trimEnd();
    return `${normalized}${normalized ? "\n\n" : ""}${blockLines.join("\n")}\n`;
};

const removeTomlBlock = (content, header) => {
    const existingLines = String(content || "")
        .replace(/\s+$/g, "")
        .split(/\r?\n/);
    const start = existingLines.findIndex(
        (line) => line.trim() === `[${header}]`,
    );
    if (start < 0) {
        return ensureTrailingNewline(String(content || ""));
    }

    let end = start + 1;
    while (
        end < existingLines.length &&
        !/^\s*\[.+\]\s*$/.test(existingLines[end])
    ) {
        end++;
    }
    existingLines.splice(start, end - start);
    return ensureTrailingNewline(
        existingLines
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
    );
};

const commandExists = (command) => {
    const isWindows = process.platform === "win32";
    const lookup = isWindows ? "where.exe" : "which";
    try {
        const result = spawnSync(lookup, [command], {
            stdio: "ignore",
        });
        return !result.error && result.status === 0;
    } catch {
        return false;
    }
};

const runOptionalCommand = (command, args, options = {}) => {
    if (!commandExists(command)) {
        return false;
    }

    let result = null;
    try {
        result = spawnSync(command, args, {
            encoding: "utf8",
            stdio: "pipe",
        });
    } catch {
        return false;
    }
    if (!result || result.error || result.status !== 0) {
        if (options.ignoreFailure) {
            return false;
        }
        const output = [result && result.stdout, result && result.stderr]
            .filter(Boolean)
            .join("\n")
            .trim();
        const failure =
            result && result.error
                ? result.error.message
                : `exit ${result ? result.status : "unknown"}`;
        throw new Error(
            `${command} ${args.join(" ")} 执行失败 (${failure})${output ? `: ${output}` : ""}`,
        );
    }
    return true;
};

const parseCommandFile = (content) => {
    const text = String(content || "");
    const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
    let description = "";
    let body = text;
    if (match) {
        body = text.slice(match[0].length).trimStart();
        const descriptionLine = match[1]
            .split(/\r?\n/)
            .find((line) => /^\s*description\s*:/.test(line));
        if (descriptionLine) {
            description = descriptionLine
                .replace(/^\s*description\s*:\s*/, "")
                .trim()
                .replace(/^['"]|['"]$/g, "");
        }
    }
    return { description, template: body };
};

const retryOnWindows = async (fn, maxRetries = 3) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const isWindowsLocked =
                process.platform === "win32" &&
                (error.code === "EPERM" || error.code === "EBUSY");
            if (!isWindowsLocked || attempt === maxRetries) {
                throw error;
            }
            await new Promise((resolve) =>
                setTimeout(resolve, 500 * (attempt + 1)),
            );
        }
    }
};

const removeIfExists = async (targetPath) => {
    await retryOnWindows(() =>
        fs.rm(targetPath, { recursive: true, force: true }),
    );
};

const removeExistingPath = async (targetPath) => {
    try {
        await fs.lstat(targetPath);
        await retryOnWindows(() =>
            fs.rm(targetPath, { recursive: true, force: true }),
        );
        return 1;
    } catch (error) {
        if (error.code === "ENOENT") return 0;
        throw error;
    }
};

const removeClaudePluginState = async (
    homeDir,
    pluginName,
    marketplaceName,
    cacheDir,
    marketplaceDir,
) => {
    let removed = 0;

    removed += await removeExistingPath(cacheDir);
    removed += await removeExistingPath(marketplaceDir);

    const settingsFile = path.join(homeDir, ".claude", "settings.json");
    const settings = await readJsonFile(settingsFile);
    const pluginKey = `${pluginName}@${marketplaceName}`;
    if (
        settings.enabledPlugins &&
        Object.hasOwn(settings.enabledPlugins, pluginKey)
    ) {
        delete settings.enabledPlugins[pluginKey];
        removed++;
    }
    if (
        settings.extraKnownMarketplaces &&
        Object.hasOwn(settings.extraKnownMarketplaces, marketplaceName)
    ) {
        delete settings.extraKnownMarketplaces[marketplaceName];
        removed++;
    }
    await writeJsonFile(settingsFile, settings);
    return removed;
};

const removeClaudeHostPluginState = async (
    homeDir,
    pluginName,
    marketplaceName,
) => {
    let removed = 0;
    const knownFile = path.join(
        homeDir,
        ".claude",
        "plugins",
        "known_marketplaces.json",
    );
    const installedFile = path.join(
        homeDir,
        ".claude",
        "plugins",
        "installed_plugins.json",
    );
    const known = await readJsonFile(knownFile);
    const installed = await readJsonFile(installedFile);
    const pluginKey = `${pluginName}@${marketplaceName}`;

    if (Object.hasOwn(known, marketplaceName)) {
        delete known[marketplaceName];
        removed++;
    }
    if (installed.plugins && Object.hasOwn(installed.plugins, pluginKey)) {
        delete installed.plugins[pluginKey];
        removed++;
    }

    if (Object.keys(known).length > 0 || removed > 0) {
        await writeJsonFile(knownFile, known);
    }
    if (installed.version || installed.plugins || removed > 0) {
        installed.version = installed.version || 2;
        installed.plugins =
            installed.plugins && typeof installed.plugins === "object"
                ? installed.plugins
                : {};
        await writeJsonFile(installedFile, installed);
    }
    return removed;
};

const uninstallClaudeUserCommands = async (homeDir) => {
    let removed = 0;
    for (const commandName of MXT_COMMANDS) {
        removed += await removeExistingPath(
            path.join(homeDir, ".claude", "commands", `${commandName}.md`),
        );
    }
    for (const commandName of LEGACY_COMMANDS) {
        removed += await removeExistingPath(
            path.join(homeDir, ".claude", "commands", `${commandName}.md`),
        );
    }
    removed += await removeExistingPath(
        path.join(homeDir, ".claude", "commands", LEGACY_COMMAND_NAME),
    );
    return removed;
};

const updateClaudeHostPluginState = async (
    homeDir,
    pluginName,
    marketplaceName,
    cacheDir,
    marketplaceDir,
) => {
    const now = new Date().toISOString();
    const knownFile = path.join(
        homeDir,
        ".claude",
        "plugins",
        "known_marketplaces.json",
    );
    const installedFile = path.join(
        homeDir,
        ".claude",
        "plugins",
        "installed_plugins.json",
    );
    const known = await readJsonFile(knownFile);
    const installed = await readJsonFile(installedFile);
    const pluginKey = `${pluginName}@${marketplaceName}`;

    known[marketplaceName] = {
        source: {
            source: "directory",
            path: marketplaceDir,
        },
        installLocation: marketplaceDir,
        lastUpdated: now,
    };

    installed.version = installed.version || 2;
    installed.plugins =
        installed.plugins && typeof installed.plugins === "object"
            ? installed.plugins
            : {};
    installed.plugins[pluginKey] = [
        {
            scope: "user",
            installPath: cacheDir,
            version: "1.0.0",
            installedAt: now,
            lastUpdated: now,
        },
    ];

    await writeJsonFile(knownFile, known);
    await writeJsonFile(installedFile, installed);
};

const clearClaudeSimpleMode = (settings) => {
    if (!settings.env || typeof settings.env !== "object") {
        return [];
    }

    if (!Object.hasOwn(settings.env, "CLAUDE_CODE_SIMPLE")) {
        return [];
    }

    delete settings.env.CLAUDE_CODE_SIMPLE;
    return [
        "已移除 ~/.claude/settings.json env.CLAUDE_CODE_SIMPLE；该模式会跳过 Claude Code 插件同步，导致 /mxt: 命令不显示。",
    ];
};

const removeCodexPromptFiles = async (promptsDir, commandName) => {
    let removed = 0;
    removed += await removeExistingPath(path.join(promptsDir, commandName));
    for (const name of CODEX_COMMANDS) {
        removed += await removeExistingPath(
            path.join(promptsDir, `${commandName}-${name}.md`),
        );
    }
    return removed;
};

const removeCodexConfigBlocks = async (
    homeDir,
    pluginName,
    marketplaceName,
) => {
    const configFile = path.join(homeDir, ".codex", "config.toml");
    let content = "";

    try {
        content = await fs.readFile(configFile, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") return 0;
        throw error;
    }

    const updated = removeTomlBlock(
        removeTomlBlock(content, `plugins."${pluginName}@${marketplaceName}"`),
        `marketplaces.${marketplaceName}`,
    );
    if (updated === ensureTrailingNewline(content)) {
        return 0;
    }
    await fs.writeFile(configFile, updated, "utf8");
    return 1;
};

const removeCodexPluginState = async (homeDir, pluginName, marketplaceName) => {
    const promptsDir = path.join(homeDir, ".codex", "prompts");
    let removed = 0;

    removed += await removeExistingPath(
        path.join(homeDir, ".codex", "plugins", pluginName),
    );
    removed += await removeExistingPath(
        path.join(
            homeDir,
            ".codex",
            "plugins",
            "cache",
            marketplaceName,
            pluginName,
            "1.0.0",
        ),
    );
    removed += await removeExistingPath(
        path.join(homeDir, ".codex", "marketplaces", marketplaceName),
    );
    removed += await removeCodexPromptFiles(promptsDir, pluginName);
    removed += await removeCodexConfigBlocks(
        homeDir,
        pluginName,
        marketplaceName,
    );
    return removed;
};

const copyCodexPromptFiles = async (sourceCommandDir, promptsDir) => {
    const files = await fs.readdir(sourceCommandDir, { withFileTypes: true });
    await fs.mkdir(promptsDir, { recursive: true });
    let copied = 0;

    for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".md")) continue;
        const sourcePath = path.join(sourceCommandDir, file.name);
        const workflow = file.name.replace(/\.md$/, "");
        const targetPath = path.join(promptsDir, codexPromptFilename(workflow));
        await fs.copyFile(sourcePath, targetPath);
        copied++;
    }

    return copied;
};

const installOpenCodeCommands = async (platform, homeDir) => {
    await uninstallOpenCodeCommands(platform, homeDir);
    const targetFile = platform.targetDir(homeDir);
    const sourceCommandDir = path.join(platform.sourceDir, "commands");
    const files = await fs.readdir(sourceCommandDir, { withFileTypes: true });
    const config = await readJsonc(targetFile);
    config.command =
        config.command && typeof config.command === "object"
            ? config.command
            : {};

    let copied = 0;
    for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".md")) continue;
        const commandName = `mxt:${file.name.replace(/\.md$/, "")}`;
        const sourcePath = path.join(sourceCommandDir, file.name);
        const parsed = parseCommandFile(await fs.readFile(sourcePath, "utf8"));
        config.command[commandName] = {
            description: parsed.description || `R2MO ${commandName}`,
            template: parsed.template,
        };
        copied++;
    }

    await writeJsonFile(targetFile, config);
    return {
        id: platform.id,
        name: platform.name,
        sourceDir: platform.sourceDir,
        targetDir: targetFile,
        copied,
    };
};

const removeOpenCodeCommandEntries = async (targetFile) => {
    const config = await readJsonc(targetFile);
    let removed = 0;

    if (config.command && typeof config.command === "object") {
        [...MXT_COMMANDS, ...LEGACY_COMMANDS].forEach((name) => {
            if (Object.hasOwn(config.command, name)) {
                delete config.command[name];
                removed++;
            }
        });
    }

    if (removed > 0 || targetFile.endsWith("opencode.json")) {
        await writeJsonFile(targetFile, config);
    }
    return removed;
};

const openCodeConfigFiles = (platform, homeDir) => {
    const targetFile = platform.targetDir(homeDir);
    const configDir = openCodeConfigDir(homeDir);
    const legacyJsonc = path.join(configDir, "opencode.jsonc");
    return targetFile === legacyJsonc
        ? [targetFile]
        : [targetFile, legacyJsonc];
};

const uninstallOpenCodeCommands = async (platform, homeDir) => {
    const targetFile = platform.targetDir(homeDir);
    let removed = 0;

    for (const filePath of openCodeConfigFiles(platform, homeDir)) {
        removed += await removeOpenCodeCommandEntries(filePath);
    }

    return {
        id: platform.id,
        name: platform.name,
        targetDir: targetFile,
        removed,
    };
};

const installClaudePlugin = async (platform, homeDir) => {
    await uninstallClaudePlugin(platform, homeDir);
    const targetDir = platform.targetDir(homeDir);
    const marketplaceDir = path.join(
        homeDir,
        ".claude",
        "plugins",
        "marketplaces",
        "mxt-skills",
    );
    const marketplaceMetaDir = path.join(marketplaceDir, ".claude-plugin");
    const marketplaceFile = path.join(marketplaceMetaDir, "marketplace.json");
    const cacheMarketplaceFile = path.join(
        targetDir,
        ".claude-plugin",
        "marketplace.json",
    );
    const marketplace = {
        $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
        name: "mxt-skills",
        description: "Local R2MO MXT slash commands.",
        owner: {
            name: "R2MO",
        },
        plugins: [
            {
                name: "mxt",
                description:
                    "R2MO closed-loop task workflow slash commands: /mxt:plan, /mxt:run, /mxt:end, /mxt:goon, /mxt:debug, /mxt:sync, /mxt:start, /mxt:loop, /mxt:doctor.",
                version: "1.0.0",
                source: "./",
                author: {
                    name: "R2MO",
                },
            },
        ],
    };

    const cacheCopied = await copyDir(platform.sourceDir, targetDir);
    const marketplaceCopied = await copyDir(platform.sourceDir, marketplaceDir);
    // User-level ~/.claude/commands/mxt:*.md is intentionally NOT written.
    // The enabled plugin cache is the single command source to avoid duplicate
    // /mxt:* registrations in Claude Code autocomplete.
    await uninstallClaudeUserCommands(homeDir);
    await fs.mkdir(marketplaceMetaDir, { recursive: true });
    await fs.writeFile(
        marketplaceFile,
        JSON.stringify(marketplace, null, 2) + "\n",
        "utf8",
    );
    await fs.writeFile(
        cacheMarketplaceFile,
        JSON.stringify(marketplace, null, 2) + "\n",
        "utf8",
    );
    await removeIfExists(path.join(targetDir, ".orphaned_at"));

    const settingsFile = path.join(homeDir, ".claude", "settings.json");
    const settings = await readJsonFile(settingsFile);
    const warnings = clearClaudeSimpleMode(settings);
    settings.enabledPlugins =
        settings.enabledPlugins && typeof settings.enabledPlugins === "object"
            ? settings.enabledPlugins
            : {};
    settings.enabledPlugins["mxt@mxt-skills"] = true;
    settings.extraKnownMarketplaces =
        settings.extraKnownMarketplaces &&
        typeof settings.extraKnownMarketplaces === "object"
            ? settings.extraKnownMarketplaces
            : {};
    settings.extraKnownMarketplaces["mxt-skills"] = {
        source: {
            source: "directory",
            path: marketplaceDir,
        },
    };
    await writeJsonFile(settingsFile, settings);
    await updateClaudeHostPluginState(
        homeDir,
        COMMAND_NAME,
        MARKETPLACE_NAME,
        targetDir,
        marketplaceDir,
    );

    if (homeDir === os.homedir()) {
        runOptionalCommand(
            "claude",
            [
                "plugin",
                "uninstall",
                `${LEGACY_COMMAND_NAME}@${LEGACY_MARKETPLACE_NAME}`,
            ],
            { ignoreFailure: true },
        );
        runOptionalCommand(
            "claude",
            ["plugin", "marketplace", "remove", LEGACY_MARKETPLACE_NAME],
            { ignoreFailure: true },
        );
        runOptionalCommand("claude", [
            "plugin",
            "marketplace",
            "add",
            marketplaceDir,
        ]);
        runOptionalCommand("claude", [
            "plugin",
            "marketplace",
            "update",
            "mxt-skills",
        ]);
        runOptionalCommand("claude", ["plugin", "install", "mxt@mxt-skills"]);
    }

    return {
        id: platform.id,
        name: platform.name,
        sourceDir: platform.sourceDir,
        targetDir,
        copied: cacheCopied + marketplaceCopied,
        warnings,
    };
};

const uninstallClaudePlugin = async (platform, homeDir) => {
    const targetDir = platform.targetDir(homeDir);
    const marketplaceDir = path.join(
        homeDir,
        ".claude",
        "plugins",
        "marketplaces",
        "mxt-skills",
    );
    const legacyTargetDir = path.join(
        homeDir,
        ".claude",
        "plugins",
        "cache",
        LEGACY_MARKETPLACE_NAME,
        LEGACY_COMMAND_NAME,
        "1.0.0",
    );
    const legacyMarketplaceDir = path.join(
        homeDir,
        ".claude",
        "plugins",
        "marketplaces",
        LEGACY_MARKETPLACE_NAME,
    );
    let removed = 0;

    if (homeDir === os.homedir()) {
        runOptionalCommand(
            "claude",
            ["plugin", "uninstall", "mxt@mxt-skills"],
            { ignoreFailure: true },
        );
        runOptionalCommand(
            "claude",
            ["plugin", "marketplace", "remove", "mxt-skills"],
            { ignoreFailure: true },
        );
        runOptionalCommand(
            "claude",
            [
                "plugin",
                "uninstall",
                `${LEGACY_COMMAND_NAME}@${LEGACY_MARKETPLACE_NAME}`,
            ],
            { ignoreFailure: true },
        );
        runOptionalCommand(
            "claude",
            ["plugin", "marketplace", "remove", LEGACY_MARKETPLACE_NAME],
            { ignoreFailure: true },
        );
    }

    removed += await removeClaudePluginState(
        homeDir,
        COMMAND_NAME,
        MARKETPLACE_NAME,
        targetDir,
        marketplaceDir,
    );
    removed += await removeClaudePluginState(
        homeDir,
        LEGACY_COMMAND_NAME,
        LEGACY_MARKETPLACE_NAME,
        legacyTargetDir,
        legacyMarketplaceDir,
    );
    removed += await removeClaudeHostPluginState(
        homeDir,
        COMMAND_NAME,
        MARKETPLACE_NAME,
    );
    removed += await removeClaudeHostPluginState(
        homeDir,
        LEGACY_COMMAND_NAME,
        LEGACY_MARKETPLACE_NAME,
    );
    removed += await uninstallClaudeUserCommands(homeDir);

    return {
        id: platform.id,
        name: platform.name,
        targetDir,
        removed,
    };
};

const installCodexMarketplace = async (platform, homeDir) => {
    const marketplaceDir = path.join(
        homeDir,
        ".codex",
        "marketplaces",
        "mxt-skills",
    );
    const marketplacePluginsDir = path.join(marketplaceDir, "plugins", "mxt");
    const marketplaceMetaDir = path.join(marketplaceDir, ".agents", "plugins");
    const marketplaceFile = path.join(marketplaceMetaDir, "marketplace.json");
    const marketplace = {
        name: "mxt-skills",
        interface: {
            displayName: "MXT Skills",
        },
        plugins: [
            {
                name: "mxt",
                source: {
                    source: "local",
                    path: "./plugins/mxt",
                },
                policy: {
                    installation: "AVAILABLE",
                    authentication: "ON_INSTALL",
                },
                category: "Coding",
            },
        ],
    };

    const copied = await copyCodexPluginArtifacts(
        platform.sourceDir,
        marketplacePluginsDir,
    );
    await fs.mkdir(marketplaceMetaDir, { recursive: true });
    await fs.writeFile(
        marketplaceFile,
        JSON.stringify(marketplace, null, 2) + "\n",
        "utf8",
    );

    return {
        marketplaceDir,
        copied,
    };
};

const updateCodexConfig = async (homeDir, marketplaceDir) => {
    const configDir = path.join(homeDir, ".codex");
    const configFile = path.join(configDir, "config.toml");
    let content = "";

    try {
        content = await fs.readFile(configFile, "utf8");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }

    content = ensureTomlBlock(content, "marketplaces.mxt-skills", [
        'source_type = "local"',
        `source = "${marketplaceDir.replace(/\\/g, "\\\\")}"`,
    ]);
    content = ensureTomlBlock(content, 'plugins."mxt@mxt-skills"', [
        "enabled = true",
    ]);

    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configFile, ensureTrailingNewline(content), "utf8");
};

const removeCodexConfig = async (homeDir) => {
    return removeCodexConfigBlocks(homeDir, COMMAND_NAME, MARKETPLACE_NAME);
};

const installCodexPlugin = async (platform, homeDir) => {
    await uninstallCodexPlugin(platform, homeDir);
    const targetDir = platform.targetDir(homeDir);
    const promptsDir = path.join(homeDir, ".codex", "prompts");
    const cacheDir = path.join(
        homeDir,
        ".codex",
        "plugins",
        "cache",
        "mxt-skills",
        "mxt",
        "1.0.0",
    );
    const copied = await copyCodexPluginArtifacts(platform.sourceDir, targetDir);
    const marketplace = await installCodexMarketplace(platform, homeDir);
    const cacheCopied = await copyCodexPluginArtifacts(
        platform.sourceDir,
        cacheDir,
    );
    const sourceCommandDir = path.join(platform.sourceDir, "commands");
    const promptCopied = await copyCodexPromptFiles(
        sourceCommandDir,
        promptsDir,
    );
    await updateCodexConfig(homeDir, marketplace.marketplaceDir);

    if (homeDir === os.homedir()) {
        runOptionalCommand(
            "codex",
            [
                "plugin",
                "remove",
                `${LEGACY_COMMAND_NAME}@${LEGACY_MARKETPLACE_NAME}`,
            ],
            { ignoreFailure: true },
        );
        runOptionalCommand(
            "codex",
            ["plugin", "marketplace", "remove", LEGACY_MARKETPLACE_NAME],
            { ignoreFailure: true },
        );
        runOptionalCommand("codex", [
            "plugin",
            "marketplace",
            "add",
            marketplace.marketplaceDir,
        ]);
        runOptionalCommand("codex", ["plugin", "add", "mxt@mxt-skills"]);
    }

    return {
        id: platform.id,
        name: platform.name,
        sourceDir: platform.sourceDir,
        targetDir,
        copied: copied + promptCopied + marketplace.copied + cacheCopied,
    };
};

const uninstallCodexPlugin = async (platform, homeDir) => {
    const targetDir = platform.targetDir(homeDir);
    const promptsDir = path.join(homeDir, ".codex", "prompts");
    const cacheDir = path.join(
        homeDir,
        ".codex",
        "plugins",
        "cache",
        "mxt-skills",
        "mxt",
        "1.0.0",
    );
    const marketplaceDir = path.join(
        homeDir,
        ".codex",
        "marketplaces",
        "mxt-skills",
    );
    let removed = 0;

    if (homeDir === os.homedir()) {
        runOptionalCommand("codex", ["plugin", "remove", "mxt@mxt-skills"], {
            ignoreFailure: true,
        });
        runOptionalCommand(
            "codex",
            ["plugin", "marketplace", "remove", "mxt-skills"],
            { ignoreFailure: true },
        );
        runOptionalCommand(
            "codex",
            [
                "plugin",
                "remove",
                `${LEGACY_COMMAND_NAME}@${LEGACY_MARKETPLACE_NAME}`,
            ],
            { ignoreFailure: true },
        );
        runOptionalCommand(
            "codex",
            ["plugin", "marketplace", "remove", LEGACY_MARKETPLACE_NAME],
            { ignoreFailure: true },
        );
    }

    removed += await removeExistingPath(targetDir);
    removed += await removeExistingPath(
        path.join(homeDir, ".codex", "prompts", "mxt"),
    );
    removed += await removeExistingPath(path.join(promptsDir, "mxt-plan.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-run.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-end.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-goon.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-debug.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-sync.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-start.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-loop.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-doctor.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mxt-task.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mplan.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mrun.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mend.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mgoon.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mdebug.md"));
    removed += await removeExistingPath(path.join(promptsDir, "msync.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mstart.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mloop.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mdoctor.md"));
    removed += await removeExistingPath(path.join(promptsDir, "mtask.md"));
    removed += await removeExistingPath(cacheDir);
    removed += await removeExistingPath(marketplaceDir);
    removed += await removeCodexConfig(homeDir);
    removed += await removeCodexPluginState(
        homeDir,
        LEGACY_COMMAND_NAME,
        LEGACY_MARKETPLACE_NAME,
    );

    return {
        id: platform.id,
        name: platform.name,
        targetDir,
        removed,
    };
};

const listSkillDirs = async (skillsRoot) => {
    let entries = [];
    try {
        entries = await fs.readdir(skillsRoot, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }

    const skills = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sourceDir = path.join(skillsRoot, entry.name);
        try {
            await fs.access(path.join(sourceDir, "SKILL.md"));
        } catch {
            continue;
        }
        skills.push({ name: entry.name, sourceDir });
    }
    return skills;
};

const piPromptAliasPath = (promptsDir, skillName) =>
    path.join(promptsDir, `${skillName}.md`);

// 只清理本安装器创建的别名：软链接指向本技能的 SKILL.md，或内容与该 SKILL.md 完全一致
// （Windows 无法建软链接时回退为复制）。用户自建的同名模板会被保留。
const isOwnedPiPromptAlias = async (aliasPath, skillFilePath) => {
    let stats = null;
    try {
        stats = await fs.lstat(aliasPath);
    } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
    }

    if (stats.isSymbolicLink()) {
        let target = "";
        try {
            target = await fs.readlink(aliasPath);
        } catch {
            return false;
        }
        return (
            path.resolve(path.dirname(aliasPath), target) ===
            path.resolve(skillFilePath)
        );
    }

    if (!stats.isFile()) return false;
    const [current, source] = await Promise.all([
        fs.readFile(aliasPath, "utf8"),
        fs.readFile(skillFilePath, "utf8"),
    ]);
    return current === source;
};

const removePiPromptFile = async (aliasPath) => {
    try {
        // unlink 不会跟随软链接，避免误删技能源文件
        await fs.unlink(aliasPath);
        return 1;
    } catch (error) {
        if (error.code === "ENOENT") return 0;
        throw error;
    }
};

const pathExists = async (targetPath) => {
    try {
        await fs.lstat(targetPath);
        return true;
    } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
    }
};

const createPiPromptAlias = async (aliasPath, skillName, skillsDir) => {
    const relativeTarget = path.join("..", "skills", skillName, "SKILL.md");
    try {
        await fs.symlink(relativeTarget, aliasPath, "file");
        return "symlink";
    } catch (error) {
        const canFallback = ["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(
            error.code,
        );
        if (!canFallback) throw error;
    }
    // Windows 无软链接权限时退化为复制，内容与已安装技能一致，仍可被本安装器回收
    await fs.copyFile(path.join(skillsDir, skillName, "SKILL.md"), aliasPath);
    return "copy";
};

const installPiPromptAliases = async (skills, skillsDir, homeDir) => {
    const targetDir = piPromptsDir(homeDir);
    const skipped = [];
    let created = 0;

    if (skills.length > 0) {
        await fs.mkdir(targetDir, { recursive: true });
    }

    for (const skill of skills) {
        const aliasPath = piPromptAliasPath(targetDir, skill.name);
        const installedSkillFile = path.join(skillsDir, skill.name, "SKILL.md");
        const exists = await pathExists(aliasPath);
        // 用户自建的同名模板不覆盖，只记录跳过
        if (
            exists &&
            !(await isOwnedPiPromptAlias(aliasPath, installedSkillFile))
        ) {
            skipped.push(skill.name);
            continue;
        }
        if (exists) {
            await removePiPromptFile(aliasPath);
        }
        await createPiPromptAlias(aliasPath, skill.name, skillsDir);
        created++;
    }

    return { targetDir, created, skipped };
};

const uninstallPiPromptAliases = async (skills, skillsDir, homeDir) => {
    const promptsDir = piPromptsDir(homeDir);
    let removed = 0;

    for (const skill of skills) {
        const aliasPath = piPromptAliasPath(promptsDir, skill.name);
        const installedSkillFile = path.join(skillsDir, skill.name, "SKILL.md");
        if (!(await isOwnedPiPromptAlias(aliasPath, installedSkillFile))) {
            continue;
        }
        removed += await removePiPromptFile(aliasPath);
    }

    return removed;
};

// Pi 安装只管理本命令拥有的 mxt-* 技能与对应命令别名。
// 因此这里按技能目录逐个安装，而不是整体覆盖 ~/.pi/agent/skills；
// 同时生成 ~/.pi/agent/prompts/<skill>.md 短命令（/mxt-<name>）。
const installPiSkills = async (platform, homeDir) => {
    await uninstallPiSkills(platform, homeDir);
    const targetDir = platform.targetDir(homeDir);
    const skills = await listSkillDirs(platform.sourceDir);
    let copied = 0;

    for (const skill of skills) {
        copied += await copyDir(
            skill.sourceDir,
            path.join(targetDir, skill.name),
        );
    }

    const prompts = await installPiPromptAliases(skills, targetDir, homeDir);

    return {
        id: platform.id,
        name: platform.name,
        sourceDir: platform.sourceDir,
        targetDir,
        copied,
        skills: skills.map((skill) => skill.name),
        prompts,
    };
};

const uninstallPiSkills = async (platform, homeDir) => {
    const targetDir = platform.targetDir(homeDir);
    const skills = await listSkillDirs(platform.sourceDir);
    let removed = 0;

    // 先回收短命令别名：复制型别名需要比对已安装的 SKILL.md，必须在删除技能前判断归属
    removed += await uninstallPiPromptAliases(skills, targetDir, homeDir);

    for (const skill of skills) {
        removed += await removeExistingPath(path.join(targetDir, skill.name));
    }

    return {
        id: platform.id,
        name: platform.name,
        targetDir,
        removed,
    };
};

const installPlatforms = async (ids, options = {}) => {
    const homeDir = options.homeDir || os.homedir();
    const platforms = resolvePlatforms(ids);
    if (platforms.length === 0) {
        return [];
    }

    const results = [];
    for (const platform of platforms) {
        if (platform.installer === "claudeCache") {
            results.push(
                await withPlatformError(
                    "安装",
                    platform,
                    homeDir,
                    platform.targetDir,
                    () => installClaudePlugin(platform, homeDir),
                ),
            );
            continue;
        }
        if (platform.installer === "codexPlugin") {
            results.push(
                await withPlatformError(
                    "安装",
                    platform,
                    homeDir,
                    platform.targetDir,
                    () => installCodexPlugin(platform, homeDir),
                ),
            );
            continue;
        }
        if (platform.installer === "opencodeConfig") {
            results.push(
                await withPlatformError(
                    "安装",
                    platform,
                    homeDir,
                    platform.targetDir,
                    () => installOpenCodeCommands(platform, homeDir),
                ),
            );
            continue;
        }
        if (platform.installer === "piSkills") {
            results.push(
                await withPlatformError(
                    "安装",
                    platform,
                    homeDir,
                    platform.targetDir,
                    () => installPiSkills(platform, homeDir),
                ),
            );
            continue;
        }
        const targetDir = platform.targetDir(homeDir);
        const copied = await copyDir(platform.sourceDir, targetDir);
        results.push({
            id: platform.id,
            name: platform.name,
            sourceDir: platform.sourceDir,
            targetDir,
            copied,
        });
    }
    return results;
};

const uninstallPlatforms = async (ids, options = {}) => {
    const homeDir = options.homeDir || os.homedir();
    const platforms = resolvePlatforms(ids);
    if (platforms.length === 0) {
        return [];
    }

    const results = [];
    for (const platform of platforms) {
        if (platform.installer === "claudeCache") {
            results.push(
                await withPlatformError(
                    "卸载",
                    platform,
                    homeDir,
                    platform.targetDir,
                    () => uninstallClaudePlugin(platform, homeDir),
                ),
            );
            continue;
        }
        if (platform.installer === "codexPlugin") {
            results.push(
                await withPlatformError(
                    "卸载",
                    platform,
                    homeDir,
                    platform.targetDir,
                    () => uninstallCodexPlugin(platform, homeDir),
                ),
            );
            continue;
        }
        if (platform.installer === "opencodeConfig") {
            results.push(
                await withPlatformError(
                    "卸载",
                    platform,
                    homeDir,
                    platform.targetDir,
                    () => uninstallOpenCodeCommands(platform, homeDir),
                ),
            );
            continue;
        }
        if (platform.installer === "piSkills") {
            results.push(
                await withPlatformError(
                    "卸载",
                    platform,
                    homeDir,
                    platform.targetDir,
                    () => uninstallPiSkills(platform, homeDir),
                ),
            );
            continue;
        }
        const targetDir = platform.targetDir(homeDir);
        const removed = await removeExistingPath(targetDir);
        results.push({
            id: platform.id,
            name: platform.name,
            targetDir,
            removed,
        });
    }
    return results;
};

module.exports = {
    listPlatforms,
    normalizePlatformIds,
    resolvePlatforms,
    installPlatforms,
    uninstallPlatforms,
    listSkillDirs,
    piSkillsDir,
    piPromptsDir,
};
