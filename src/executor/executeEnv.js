const {exec} = require('child_process');
const util = require('util');
const Ec = require('../epic');
const path = require('path');
const fs = require('fs');

// 将 exec 转换为 Promise 版本
const execAsync = util.promisify(exec);

/**
 * 获取项目版本号
 * @returns {string} 版本号
 */
const _getVersion = () => {
    try {
        const packagePath = path.resolve(__dirname, '../../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageJson.version || '未知版本';
    } catch (error) {
        return '未知版本';
    }
};

/**
 * 检查命令是否可用
 * @param {string} command 命令名称
 * @returns {Promise<boolean>} 命令是否可用
 */
const _isCommandAvailable = async (command) => {
    try {
        // 在 Windows 上使用 where 命令，在其他系统上使用 which 命令
        const whereCmd = process.platform === 'win32' ? 'where' : 'which';
        await execAsync(`${whereCmd} ${command}`, { shell: process.platform === 'win32' });
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * 获取命令版本信息
 * @param {string} command 命令名称
 * @returns {Promise<string>} 命令版本信息
 */
const _shellOpt = () => process.platform === 'win32' ? { shell: true } : {};

const _getCommandVersion = async (command) => {
    try {
        const {stdout} = await execAsync(`${command} --version`, _shellOpt());
        return stdout.trim();
    } catch (error) {
        try {
            const {stdout} = await execAsync(`${command} -v`, _shellOpt());
            return stdout.trim();
        } catch (vError) {
            return '未知版本';
        }
    }
};

module.exports = async () => {
    Ec.waiting('正在检查环境信息...');

    // 需要检查的命令列表
    const requiredCommands = ['node', 'npm', 'git', 'mxt'];

    let allCommandsAvailable = true;

    // 检查每个命令
    for (const command of requiredCommands) {
        const isAvailable = await _isCommandAvailable(command);

        if (isAvailable) {
            // const version = await _getCommandVersion(command);
            // Ec.waiting(`✅ ${command}: ${version}`);
        } else {
            Ec.waiting(`❌ ${command}: 未找到命令`);
            allCommandsAvailable = false;
        }
    }

    Ec.waiting('------------------------------------------------------------');

    // 检查操作系统信息
    try {
        const os = require('os');
        const osType = os.type();
        const displayOs = osType === 'Darwin' ? 'macOS' : osType;
        Ec.waiting(`🖥️ OS 版本      : ${displayOs} ${os.release()} ${os.arch()}`);
    } catch (error) {
        Ec.waiting('⚠️ 无法获取 OS 系统信息');
    }

    // 检查 JDK 版本
    try {
        // java -version 输出通常在 stderr
        const { stderr } = await execAsync('java -version', _shellOpt());
        const versionLine = stderr.split('\n')[0]; // 取第一行
        // 尝试提取引号中的版本号
        const versionMatch = versionLine.match(/"([^"]+)"/);
        const version = versionMatch ? versionMatch[1] : versionLine;
        Ec.waiting(`♨️  JDK 版本     : ${version}`);
    } catch (error) {
        Ec.waiting('⚠️ JDK 未安装或无法获取版本信息');
    }

    // 检查额外的环境信息
    try {
        const {stdout: nodeVersion} = await execAsync('node --version', _shellOpt());
        Ec.waiting(`💻  Node.js 版本 : ${nodeVersion.trim()}`);
    } catch (error) {
        Ec.waiting('⚠️ 无法获取 Node.js 版本信息');
    }

    try {
        const {stdout: npmVersion} = await execAsync('npm --version', _shellOpt());
        Ec.waiting(`📦  NPM 版本     : ${npmVersion.trim()}`);
    } catch (error) {
        Ec.waiting('⚠️ 无法获取 NPM 版本信息');
    }

    try {
        const {stdout: gitVersion} = await execAsync('git --version', _shellOpt());
        Ec.waiting(`🌱  Git 版本     : ${gitVersion.trim()}`);
    } catch (error) {
        Ec.waiting('⚠️ 无法获取 Git 版本信息');
    }

    // 定义可选工具列表
    const optionalTools = [
        { cmd: 'opencode', label: 'OpenCode 版本', emoji: '🔓' },
        { cmd: 'trae', label: 'Trae 版本   ', emoji: '🎯' },
        { cmd: 'lingma', label: 'Lingma 版本 ', emoji: '🧠' },
        { cmd: 'cursor', label: 'Cursor 版本 ', emoji: '👾' },
        { cmd: 'kiro', label: 'Kiro 版本   ', emoji: '🔮' },
        { cmd: 'kimi', label: 'Kimi 版本   ', emoji: '🌙' },
        { cmd: 'claude', label: 'Claude 版本 ', emoji: '🤖' },
        { cmd: 'gemini', label: 'Gemini 版本 ', emoji: '🌟' },
        { cmd: 'codex', label: 'Codex 版本  ', emoji: '💬' }
    ];

    for (const tool of optionalTools) {
        try {
            const {stdout} = await execAsync(`${tool.cmd} --version`, _shellOpt());
            const versionLines = stdout.split("\n");
            const currentVersion = versionLines[0].trim();
            if (tool.cmd === 'codex') {
                try {
                    const {stdout: latestOut} = await execAsync('npm view @openai/codex version', _shellOpt());
                    const latestVersion = latestOut.trim();
                    Ec.waiting(`----> ${tool.emoji} ${tool.label}: ${currentVersion.cyan}（最新: ${latestVersion.green}）`);
                } catch (_) {
                    Ec.waiting(`----> ${tool.emoji} ${tool.label}: ${currentVersion.cyan}`);
                }
            } else {
                Ec.waiting(`----> ${tool.emoji} ${tool.label}: ${currentVersion.cyan}`);
            }
        } catch (error) {
             const name = tool.label.trim().replace(' 版本', '');
             Ec.waiting(`⚠️ ${name} 未安装或无法获取版本信息（可选工具）`);
        }
    }

    // 显示 MXT 版本
    const mxtVersion = _getVersion();
    Ec.waiting(`🤖 MXT 版本: ${mxtVersion.red}`);

    // 总结（只检查必需命令）
    if (allCommandsAvailable) {
        Ec.info('✅ 所有必需的命令都已安装');
    } else {
        Ec.waiting('❌ 部分必需的命令未安装，请检查并安装缺失的命令');
        process.exit(1);
    }

    process.exit(0);
};