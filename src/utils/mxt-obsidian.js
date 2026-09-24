const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const runFile = promisify(execFile);

const marker = 'MXT_VAULT_RESULT:';

// Only unregistered paths require Obsidian's internal vault-manager action.
const registrationCode = (targetDir) => `(() => {
    const ipc = require('electron').ipcRenderer;
    const target = ${JSON.stringify(targetDir)};
    const result = ipc.sendSync('vault-open', target, false);
    if (result !== true) throw new Error(String(result));
    const matches = Object.entries(ipc.sendSync('vault-list')).filter(([, vault]) => vault.path === target);
    if (matches.length !== 1) throw new Error('Vault registration is ambiguous or missing');
    const [id, vault] = matches[0];
    if (vault.open !== true) throw new Error('Vault is not open');
    return ${JSON.stringify(marker)} + JSON.stringify({id, path: vault.path, open: vault.open});
})()`;

const parseResult = (stdout, targetDir) => {
    const line = stdout.split(/\r?\n/).find(entry => entry.startsWith(`=> ${marker}`));
    if (!line) throw new Error('Obsidian 未确认仓库注册。请启用 Obsidian CLI，并先打开一个仓库后重试。');
    const result = JSON.parse(line.slice(3 + marker.length));
    if (result.open !== true || !/^[a-f0-9]{16}$/i.test(result.id) || !pathsEqual(result.path, targetDir, process.platform)) {
        throw new Error('Obsidian 返回的 Vault ID 或路径不符合请求');
    }
    return result;
};

const registryPath = (platform = process.platform, env = process.env, home = os.homedir()) => {
    if (platform === 'win32') {
        const appData = env.APPDATA || path.win32.join(env.USERPROFILE || home, 'AppData', 'Roaming');
        return path.win32.join(appData, 'obsidian', 'obsidian.json');
    }
    if (platform === 'darwin') return path.join(home, 'Library/Application Support/obsidian/obsidian.json');
    return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obsidian', 'obsidian.json');
};

const normalizePath = (value, platform = process.platform) => {
    const resolved = (platform === 'win32' ? path.win32 : path.posix).normalize(value);
    return platform === 'win32' ? resolved.replaceAll('\\', '/').toLowerCase() : resolved;
};

const pathsEqual = (left, right, platform = process.platform) => normalizePath(left, platform) === normalizePath(right, platform);

const readRegistry = (platform = process.platform, env = process.env, home = os.homedir()) => {
    try {
        const data = JSON.parse(fs.readFileSync(registryPath(platform, env, home), 'utf8'));
        return data && data.vaults && typeof data.vaults === 'object' ? data : { vaults: {} };
    } catch {
        return { vaults: {} };
    }
};

const findVaultByPath = (targetDir, registry, platform = process.platform) => {
    const matches = Object.entries(registry.vaults || {}).filter(([, vault]) =>
        vault && typeof vault.path === 'string' && pathsEqual(vault.path, targetDir, platform));
    if (matches.length > 1) throw new Error(`Obsidian 注册表中存在重复路径: ${targetDir}`);
    return matches.length ? { id: matches[0][0], ...matches[0][1] } : null;
};

const executable = () => {
    if (process.platform === 'darwin') return '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
    if (process.platform === 'win32') {
        const candidates = [process.env.LOCALAPPDATA, process.env.ProgramFiles || process.env.PROGRAMFILES,
            process.env['ProgramFiles(x86)'] || process.env['PROGRAMFILES(X86)']].filter(Boolean)
            .map(root => path.join(root, 'Obsidian', 'Obsidian.com'));
        const cli = candidates.find(file => fs.existsSync(file));
        if (!cli) throw new Error('找不到 Obsidian.com，请更新 Windows Obsidian 安装器并启用 CLI。');
        return cli;
    }
    return 'obsidian';
};

const buildLaunchPlan = (platform, id) => {
    if (!/^[a-f0-9]{16}$/i.test(id)) throw new Error('Invalid Vault ID');
    const uri = `obsidian://open?vault=${id}`;
    if (platform === 'darwin') return { command: '/usr/bin/open', args: [uri] };
    if (platform === 'win32') return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', uri] };
    return { command: 'xdg-open', args: [uri] };
};

const openVault = async (directory) => {
    const targetDir = fs.realpathSync(path.resolve(directory));
    if (!fs.statSync(targetDir).isDirectory()) throw new Error(`不是目录: ${targetDir}`);
    const registry = readRegistry();
    const existing = findVaultByPath(targetDir, registry);
    if (existing) {
        const plan = buildLaunchPlan(process.platform, existing.id);
        await runFile(plan.command, plan.args, { timeout: 5000, killSignal: 'SIGKILL' });
        // OS protocol dispatch is not a renderer acknowledgement.
        return { id: existing.id, path: targetDir, status: 'requested' };
    }
    // An unscoped eval selects a vault from cwd, potentially opening the
    // parent project. Pin the request to one already-open host instead.
    const host = Object.entries(registry.vaults || {}).find(([id, vault]) =>
        /^[a-f0-9]{16}$/i.test(id) && vault.open === true);
    if (!host) throw new Error(`目标路径尚未注册: ${targetDir}。没有可用的已打开仓库，请在 Obsidian 仓库管理中“打开文件夹作为仓库”。`);
    let stdout;
    try {
        ({ stdout } = await runFile(executable(), [
            `vault=${host[0]}`, 'eval', `code=${registrationCode(targetDir)}`
        ], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 }));
    } catch (error) {
        if (error.killed) throw new Error(`新仓库注册等待超过 10 秒，已停止命令且不会重试: ${targetDir}。请在 Obsidian 仓库管理中确认是否已注册。`);
        throw error;
    }
    const errorLine = stdout.split(/\r?\n/).find(line => line.startsWith('Error:'));
    if (errorLine) throw new Error(`新仓库注册失败（执行仓库 ${host[0]}）: ${errorLine}`);
    return { ...parseResult(stdout, targetDir), status: 'confirmed' };
};

module.exports = {
    openVault, registrationCode, parseResult, executable, registryPath,
    findVaultByPath, pathsEqual, buildLaunchPlan
};
