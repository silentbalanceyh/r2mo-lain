const { spawn, execSync } = require('child_process');
const fs = require('fs');
const fsAsync = require('fs').promises;
const path = require('path');
const os = require('os');
const Ec = require('../epic');
const { parseOptional } = require('../utils/mxt-args');
const { copyDir } = require('../utils/mxt-file-utils');

/**
 * 检查 Obsidian 是否已安装
 * @returns {Promise<boolean>}
 */
const _isObsidianInstalled = async () => {
    const platform = os.platform();
    
    if (platform === 'darwin') {
        // macOS: 检查 Applications 目录
        const obsidianPath = '/Applications/Obsidian.app';
        return fs.existsSync(obsidianPath);
    } else if (platform === 'win32') {
        // Windows: 检查常见安装路径或注册表
        const localAppData = process.env.LOCALAPPDATA || '';
        const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
        const possiblePaths = [
            path.join(localAppData, 'Obsidian', 'Obsidian.exe'),
            path.join(programFiles, 'Obsidian', 'Obsidian.exe')
        ];
        return possiblePaths.some(p => fs.existsSync(p));
    } else {
        // Linux/macOS: 检查 which obsidian 或常见路径
        try {
            const whereCmd = process.platform === 'win32' ? 'where' : 'which';
            execSync(`${whereCmd} obsidian`, { stdio: 'pipe', shell: process.platform === 'win32' });
            return true;
        } catch {
            // 检查 flatpak 或 snap 安装
            const snapPath = '/snap/bin/obsidian';
            const flatpakCheck = () => {
                try {
                    execSync('flatpak list | grep -i obsidian', { stdio: 'pipe' });
                    return true;
                } catch {
                    return false;
                }
            };
            return fs.existsSync(snapPath) || flatpakCheck();
        }
    }
};

/**
 * 检查 Obsidian 进程是否正在运行
 * @returns {Promise<boolean>}
 */
const _isObsidianProcessRunning = async () => {
    const platform = os.platform();

    try {
        if (platform === 'darwin') {
            execSync('pgrep -x Obsidian', { stdio: 'pipe' });
            return true;
        }

        if (platform === 'win32') {
            const output = execSync('tasklist /FI "IMAGENAME eq Obsidian.exe" /NH', {
                stdio: 'pipe'
            }).toString();
            return output.includes('Obsidian.exe');
        }

        execSync('pgrep -x obsidian', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
};

/**
 * 检查指定 vault 是否正在运行
 * 必须同时满足：1) Obsidian 进程在运行 2) vault 在配置中标记为 open
 * @param {string} vaultPath vault 路径
 * @returns {Promise<boolean>}
 */
const _isVaultRunning = async (vaultPath) => {
    // 首先检查 Obsidian 进程是否在运行
    const isProcessRunning = await _isObsidianProcessRunning();
    if (!isProcessRunning) {
        return false;
    }

    // 进程在运行，再检查配置文件
    const platform = os.platform();
    let configPath;

    if (platform === 'darwin') {
        configPath = path.join(os.homedir(), 'Library/Application Support/obsidian/obsidian.json');
    } else if (platform === 'win32') {
        configPath = path.join(process.env.APPDATA || '', 'obsidian', 'obsidian.json');
    } else {
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
        configPath = path.join(xdgConfig, 'obsidian', 'obsidian.json');
    }

    try {
        if (!fs.existsSync(configPath)) {
            return false;
        }

        const content = await fsAsync.readFile(configPath, 'utf8');
        const config = JSON.parse(content);

        // 检查是否有 vault 的 open 状态为 true 且路径匹配
        const openVault = Object.values(config.vaults || {}).find(
            vault => vault.path === vaultPath && vault.open === true
        );

        return !!openVault;
    } catch {
        return false;
    }
};

/**
 * 生成 vault ID（模仿 Obsidian 的 16 位十六进制 ID）
 * @returns {string}
 */
const _generateVaultId = () => {
    const chars = '0123456789abcdef';
    let id = '';
    for (let i = 0; i < 16; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
};

/**
 * 注册 vault 到 Obsidian 配置
 * @param {string} vaultPath vault 路径
 * @returns {Promise<string|null>} 返回 vault ID，失败返回 null
 */
const _registerVaultToObsidian = async (vaultPath) => {
    const platform = os.platform();
    let configPath;
    
    if (platform === 'darwin') {
        configPath = path.join(os.homedir(), 'Library/Application Support/obsidian/obsidian.json');
    } else if (platform === 'win32') {
        configPath = path.join(process.env.APPDATA || '', 'obsidian', 'obsidian.json');
    } else {
        // Linux
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
        configPath = path.join(xdgConfig, 'obsidian', 'obsidian.json');
    }
    
    try {
        let config = { vaults: {}, frame: 'custom' };
        
        // 读取现有配置
        if (fs.existsSync(configPath)) {
            const content = await fsAsync.readFile(configPath, 'utf8');
            config = JSON.parse(content);
        }
        
        // 检查 vault 是否已存在
        const existingVault = Object.entries(config.vaults || {}).find(
            ([, vault]) => vault.path === vaultPath
        );
        
        let vaultId;
        if (existingVault) {
            // 已存在，更新 ts 和 open 状态
            [vaultId] = existingVault;
            config.vaults[vaultId].ts = Date.now();
            config.vaults[vaultId].open = true;
        } else {
            // 新 vault，生成 ID 并添加
            vaultId = _generateVaultId();
            config.vaults[vaultId] = {
                path: vaultPath,
                ts: Date.now(),
                open: true
            };
        }
        
        // 确保配置目录存在
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            await fsAsync.mkdir(configDir, { recursive: true });
        }
        
        // 写入配置
        await fsAsync.writeFile(configPath, JSON.stringify(config), 'utf8');
        return vaultId;
    } catch (error) {
        Ec.warn(`⚠ 无法注册 vault 到配置: ${error.message}`);
        return null;
    }
};

/**
 * 检查指定 vault 是否已注册到 Obsidian 配置
 * @param {string} vaultPath vault 路径
 * @returns {Promise<{registered: boolean, vaultId: string|null}>}
 */
const _checkVaultRegistration = async (vaultPath) => {
    const platform = os.platform();
    let configPath;

    if (platform === 'darwin') {
        configPath = path.join(os.homedir(), 'Library/Application Support/obsidian/obsidian.json');
    } else if (platform === 'win32') {
        configPath = path.join(process.env.APPDATA || '', 'obsidian', 'obsidian.json');
    } else {
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
        configPath = path.join(xdgConfig, 'obsidian', 'obsidian.json');
    }

    try {
        if (!fs.existsSync(configPath)) {
            return { registered: false, vaultId: null };
        }

        const content = await fsAsync.readFile(configPath, 'utf8');
        const config = JSON.parse(content);

        const entry = Object.entries(config.vaults || {}).find(
            ([, vault]) => vault.path === vaultPath
        );

        if (entry) {
            return { registered: true, vaultId: entry[0] };
        }
        return { registered: false, vaultId: null };
    } catch {
        return { registered: false, vaultId: null };
    }
};

/**
 * 使用 Obsidian 打开目录
 * 支持双模式：URI scheme（vault 已注册时）或路径启动
 * @param {string} targetDir 目标目录绝对路径
 * @param {string|null} vaultId Obsidian 分配的 vault ID
 * @returns {Promise<void>}
 */
const _openWithObsidian = async (targetDir, vaultId = null) => {
    const platform = os.platform();

    if (platform === 'darwin') {
        if (vaultId) {
            // vault 已注册：使用 URI scheme 打开/切换
            const obsidianUri = `obsidian://open?vault=${vaultId}`;
            return new Promise((resolve, reject) => {
                const child = spawn('open', [obsidianUri], { stdio: 'ignore' });
                child.on('error', (error) => reject(new Error(`打开 Obsidian 失败: ${error.message}`)));
                child.on('close', (code) => {
                    if (code === 0) setTimeout(() => resolve(), 1500);
                    else reject(new Error(`打开 Obsidian 失败，退出码: ${code}`));
                });
            });
        }
        // vault 未注册：直接按路径启动
        return new Promise((resolve, reject) => {
            const child = spawn('open', ['-a', 'Obsidian', targetDir], { stdio: 'ignore' });
            child.on('error', (error) => reject(new Error(`启动 Obsidian 失败: ${error.message}`)));
            child.on('close', (code) => {
                if (code === 0) setTimeout(() => resolve(), 2000);
                else reject(new Error(`启动 Obsidian 失败，退出码: ${code}`));
            });
        });
    } else if (platform === 'win32') {
        if (vaultId) {
            const obsidianUri = `obsidian://open?vault=${vaultId}`;
            return new Promise((resolve, reject) => {
                const child = spawn('cmd', ['/c', 'start', '', obsidianUri], { stdio: 'ignore' });
                child.on('error', (error) => reject(new Error(`打开 Obsidian 失败: ${error.message}`)));
                child.on('close', (code) => {
                    if (code === 0) setTimeout(() => resolve(), 1500);
                    else reject(new Error(`打开 Obsidian 失败，退出码: ${code}`));
                });
            });
        }
        const localAppData = process.env.LOCALAPPDATA || '';
        const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
        const possiblePaths = [
            path.join(localAppData, 'Obsidian', 'Obsidian.exe'),
            path.join(programFiles, 'Obsidian', 'Obsidian.exe')
        ];

        const obsidianExe = possiblePaths.find(p => fs.existsSync(p));
        if (!obsidianExe) throw new Error('找不到 Obsidian 可执行文件');

        return new Promise((resolve, reject) => {
            const child = spawn(obsidianExe, [targetDir], { detached: true, stdio: 'ignore' });
            child.on('error', (error) => reject(new Error(`启动 Obsidian 失败: ${error.message}`)));
            child.unref();
            setTimeout(() => resolve(), 2000);
        });
    } else {
        if (vaultId) {
            const obsidianUri = `obsidian://open?vault=${vaultId}`;
            return new Promise((resolve, reject) => {
                const child = spawn('xdg-open', [obsidianUri], { stdio: 'ignore' });
                child.on('error', (error) => reject(new Error(`打开 Obsidian 失败: ${error.message}`)));
                child.on('close', (code) => {
                    if (code === 0) setTimeout(() => resolve(), 1500);
                    else reject(new Error(`打开 Obsidian 失败，退出码: ${code}`));
                });
            });
        }
        const snapPath = '/snap/bin/obsidian';
        const flatpakPath = 'flatpak run md.obsidian.Obsidian';
        let obsidianCmd = 'obsidian';
        let args = [targetDir];
        let useShell = false;

        if (fs.existsSync(snapPath)) {
            obsidianCmd = snapPath;
        } else {
            try {
                execSync('flatpak list | grep -i obsidian', { stdio: 'pipe' });
                obsidianCmd = flatpakPath;
                useShell = true;
            } catch {
                // 使用默认命令
            }
        }

        return new Promise((resolve, reject) => {
            const spawnOptions = { detached: true, stdio: 'ignore' };
            if (useShell) spawnOptions.shell = true;
            const child = spawn(obsidianCmd, args, spawnOptions);
            child.on('error', (error) => reject(new Error(`启动 Obsidian 失败: ${error.message}`)));
            child.unref();
            setTimeout(() => resolve(), 2000);
        });
    }
};

/**
 * 获取操作系统名称
 * @returns {string}
 */
const _getOsName = () => {
    const platform = os.platform();
    switch (platform) {
        case 'darwin': return 'macOS';
        case 'win32': return 'Windows';
        case 'linux': return 'Linux';
        default: return platform;
    }
};

/**
 * 初始化 .obsidian 目录
 * 从模板目录复制默认配置
 * @param {string} targetDir 目标目录
 * @returns {Promise<boolean>} 是否成功初始化
 */
const _initObsidianConfig = async (targetDir) => {
    const obsidianSourcePath = path.resolve(__dirname, '../_template/LAIN/.obsidian');
    const obsidianTargetPath = path.join(targetDir, '.obsidian');

    // 检查模板目录是否存在
    if (!fs.existsSync(obsidianSourcePath)) {
        Ec.warn(`⚠ 模板目录不存在: ${obsidianSourcePath}`);
        return false;
    }

    try {
        const stat = await fsAsync.stat(obsidianSourcePath);
        if (!stat.isDirectory()) {
            Ec.warn(`⚠ 模板路径不是目录: ${obsidianSourcePath}`);
            return false;
        }

        Ec.waiting('正在初始化 .obsidian 配置...');
        await copyDir(obsidianSourcePath, obsidianTargetPath);
        Ec.info('✓ 已创建 .obsidian 配置目录');
        return true;
    } catch (error) {
        Ec.error(`初始化 .obsidian 失败: ${error.message}`);
        return false;
    }
};

/**
 * 递归收集目录下所有相对路径
 * @param {string} dir 目录路径
 * @param {string} base 基准路径（用于计算相对路径）
 * @returns {Promise<string[]>} 相对路径列表
 */
const _collectRelativePaths = async (dir, base = dir) => {
    const result = [];
    if (!fs.existsSync(dir)) return result;
    const items = await fsAsync.readdir(dir);
    for (const item of items) {
        const full = path.join(dir, item);
        const rel = path.relative(base, full);
        if ((await fsAsync.stat(full)).isDirectory()) {
            result.push(...(await _collectRelativePaths(full, base)));
        } else {
            result.push(rel);
        }
    }
    return result;
};

/**
 * 同步插件配置（幂等）
 * 对比 _template/.obsidian/plugins 与目标 vault 的插件目录
 * - vault 中已存在的插件：全量覆盖（新增/更新/删除陈旧文件）
 * - vault 中不存在的插件：跳过（不强制安装）
 * @param {string} targetDir 目标 vault 目录
 * @returns {Promise<{synced: number, skipped: number}>} 同步/跳过的插件数
 */
const _syncPlugins = async (targetDir) => {
    const srcPluginsDir = path.resolve(__dirname, '../_template/.obsidian/plugins');
    const destPluginsDir = path.join(targetDir, '.obsidian', 'plugins');

    if (!fs.existsSync(srcPluginsDir)) {
        return { synced: 0, skipped: 0 };
    }

    await fsAsync.mkdir(destPluginsDir, { recursive: true });

    const srcPlugins = await fsAsync.readdir(srcPluginsDir);
    let synced = 0;
    let skipped = 0;

    for (const pluginName of srcPlugins) {
        const srcPlugin = path.join(srcPluginsDir, pluginName);
        const destPlugin = path.join(destPluginsDir, pluginName);

        const stat = await fsAsync.stat(srcPlugin);
        if (!stat.isDirectory()) continue;

        // vault 中不存在此插件 → 跳过，不强制安装
        if (!fs.existsSync(destPlugin)) {
            skipped++;
            continue;
        }

        // 收集模板和目标的相对路径集合
        const srcFiles = new Set(await _collectRelativePaths(srcPlugin));
        const destFiles = new Set(await _collectRelativePaths(destPlugin));

        let pluginChanged = false;

        // 检查模板中有但目标缺失或内容不同的文件
        for (const rel of srcFiles) {
            const srcFile = path.join(srcPlugin, rel);
            const destFile = path.join(destPlugin, rel);

            if (!fs.existsSync(destFile)) {
                pluginChanged = true;
                break;
            }

            const srcContent = await fsAsync.readFile(srcFile);
            const destContent = await fsAsync.readFile(destFile);
            if (!srcContent.equals(destContent)) {
                pluginChanged = true;
                break;
            }
        }

        // 检查目标中有但模板中已移除的陈旧文件
        if (!pluginChanged) {
            for (const rel of destFiles) {
                if (!srcFiles.has(rel)) {
                    pluginChanged = true;
                    break;
                }
            }
        }

        if (pluginChanged) {
            // 删除旧插件目录后重新复制，确保全量覆盖
            await fsAsync.rm(destPlugin, { recursive: true, force: true });
            await copyDir(srcPlugin, destPlugin);
            synced++;
        }
    }

    return { synced, skipped };
};

/**
 * 更新目标目录的 .gitignore 文件
 * 添加 .obsidian/workspace.json 到忽略列表
 * @param {string} targetDir 目标目录
 * @returns {Promise<void>}
 */
const _updateGitignore = async (targetDir) => {
    const gitignorePath = path.join(targetDir, '.gitignore');
    const ignoreEntry = '.obsidian/workspace.json';
    
    try {
        let gitignoreContent = '';
        
        // 读取现有的 .gitignore 内容
        if (fs.existsSync(gitignorePath)) {
            gitignoreContent = await fsAsync.readFile(gitignorePath, 'utf8');
        }
        
        // 检查是否已经包含该条目
        if (gitignoreContent.includes(ignoreEntry)) {
            Ec.info('✓ .gitignore 已包含 .obsidian/workspace.json');
            return;
        }
        
        // 添加条目
        if (gitignoreContent && !gitignoreContent.endsWith('\n')) {
            gitignoreContent += '\n';
        }
        
        gitignoreContent += `${ignoreEntry}\n`;
        
        // 写入 .gitignore 文件
        await fsAsync.writeFile(gitignorePath, gitignoreContent, 'utf8');
        Ec.info('✓ 已添加 .obsidian/workspace.json 到 .gitignore');
    } catch (error) {
        Ec.warn(`⚠ 更新 .gitignore 失败: ${error.message}`);
    }
};

module.exports = async (_options) => {
    try {
        // 1. 解析 -d 参数，获取目标目录
        const dirArg = parseOptional('dir', 'd');
        const targetDir = dirArg.hasFlag && dirArg.value 
            ? path.resolve(dirArg.value) 
            : process.cwd();

        Ec.info(`📁 目标目录: ${targetDir.cyan}`);
        Ec.info(`💻 操作系统: ${_getOsName().cyan}`);

        // 2. 检查目标目录是否存在
        if (!fs.existsSync(targetDir)) {
            Ec.error(`❌ 目录不存在: ${targetDir}`);
            process.exit(1);
        }

        // 3. 检查目录是否是文件夹
        const stat = fs.statSync(targetDir);
        if (!stat.isDirectory()) {
            Ec.error(`❌ 路径不是目录: ${targetDir}`);
            process.exit(1);
        }

        // 4. 检查 .obsidian 配置是否存在，不存在则自动初始化
        const obsidianConfigPath = path.join(targetDir, '.obsidian');
        if (!fs.existsSync(obsidianConfigPath)) {
            Ec.warn(`⚠ 目录中不存在 .obsidian 配置，正在自动初始化...`);

            const initSuccess = await _initObsidianConfig(targetDir);
            if (!initSuccess) {
                Ec.error('❌ 无法初始化 .obsidian 配置');
                console.log('');
                Ec.error('请手动使用 Obsidian 打开该目录以初始化配置');
                console.log('  下载地址: https://obsidian.md/download'.cyan);
                console.log('');
                process.exit(1);
            }
        } else {
            Ec.info('✓ 检测到 .obsidian 配置');
        }

        // 4.1 同步插件配置（每次打开前都检查，含首次初始化后）
        Ec.waiting('正在同步插件配置...');
        const { synced, skipped } = await _syncPlugins(targetDir);
        if (synced > 0) {
            Ec.info(`✓ 已同步 ${synced} 个插件更新`);
        }
        if (skipped > 0) {
            Ec.info(`→ 跳过 ${skipped} 个未安装插件`);
        }

        // 4.5. 更新 .gitignore，添加 .obsidian/workspace.json
        await _updateGitignore(targetDir);

        // 5. 检查 Obsidian 是否已安装
        Ec.waiting('正在检查 Obsidian 安装状态...');
        const obsidianInstalled = await _isObsidianInstalled();

        if (!obsidianInstalled) {
            Ec.error('❌ 未检测到 Obsidian 安装');
            console.log('');
            Ec.error('请先安装 Obsidian:');
            console.log('  下载地址: https://obsidian.md/download'.cyan);
            console.log('');
            process.exit(1);
        }

        Ec.info('✓ Obsidian 已安装');

        // 6. 检查当前 vault 是否正在运行
        const isVaultRunning = await _isVaultRunning(targetDir);

        // 7. 检查 Obsidian 进程是否正在运行
        const isObsidianRunning = await _isObsidianProcessRunning();

        if (isVaultRunning) {
            Ec.info('✓ 当前 vault 已在运行，继续拉起目标仓库...');
        }

        // 8. 检查 vault 是否已在 Obsidian 注册
        const { registered, vaultId: registeredVaultId } = await _checkVaultRegistration(targetDir);

        // 9. 注册 vault 到 Obsidian 配置
        Ec.waiting('正在注册 vault 到 Obsidian...');
        const vaultId = await _registerVaultToObsidian(targetDir);
        if (vaultId) {
            Ec.info(`✓ Vault 已注册 (ID: ${vaultId.substring(0, 8)}...)`);
        } else {
            Ec.warn('⚠ Vault 注册失败，将尝试直接打开');
        }

        // 10. 使用 Obsidian 打开目录
        Ec.waiting(`正在打开 vault: ${targetDir.cyan}...`);
        try {
            const activeVaultId = registered ? registeredVaultId : null;
            await _openWithObsidian(targetDir, activeVaultId);
            console.log('');
            Ec.info(`✅ 已成功打开 vault`);
            if (!isObsidianRunning && vaultId) {
                Ec.info('💡 提示: 该 vault 现在会出现在 Obsidian 的本地仓库列表中');
            }
            console.log('');
        } catch (error) {
            console.log('');
            Ec.error(`❌ 打开失败: ${error.message}`);
            console.log('');
            Ec.warn('您可以手动使用 Obsidian 打开该目录');
            console.log('');
        }

        // 短暂延迟后退出，确保进程完成
        setTimeout(() => {
            process.exit(0);
        }, 1000);

    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        process.exit(1);
    }
};
