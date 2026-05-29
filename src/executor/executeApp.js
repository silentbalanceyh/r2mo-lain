const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Ec = require('../epic');
const { selectSingle } = require('../utils/mxt-menu');
const { parseOptional } = require('../utils/mxt-args');

// 应用类型配置
const APP_TYPES = [
    {
        name: 'R2MO / Spring',
        command: 'spring',
        description: '基于 Spring 框架的 R2MO 应用'
    },
    {
        name: 'ZERO / Vertx',
        command: 'zero',
        description: '基于 Vertx 框架的 ZERO 应用'
    }
];

/**
 * 检查命令是否可用
 * @param {string} command 命令名称
 * @returns {Promise<boolean>}
 */
const _isCommandAvailable = async (command) => {
    return new Promise((resolve) => {
        const whereCmd = process.platform === 'win32' ? 'where' : 'which';
        const childProcess = spawn(whereCmd, [command], { stdio: 'pipe', shell: process.platform === 'win32' });
        childProcess.on('close', (code) => {
            resolve(code === 0);
        });
        childProcess.on('error', () => {
            resolve(false);
        });
    });
};

/**
 * 执行 ai 命令
 * @param {string} appType 应用类型 (spring/zero)
 * @param {string} appName 应用名称
 */
const _executeAiCommand = async (appType, appName) => {
    return new Promise((resolve, reject) => {
        Ec.waiting(`🚀 正在创建 ${appType === 'spring' ? 'R2MO/Spring' : 'ZERO/Vertx'} 应用: ${appName.cyan}...`);
        
        const child = spawn('ai', [appType, '-n', appName], {
            stdio: 'inherit',
            shell: process.platform === 'win32'
        });

        child.on('close', (code) => {
            if (code === 0) {
                Ec.info(`✅ 应用创建成功: ${appName.cyan}`);
                resolve();
            } else {
                reject(new Error(`ai 命令执行失败，退出码: ${code}`));
            }
        });

        child.on('error', (error) => {
            reject(new Error(`执行 ai 命令失败: ${error.message}`));
        });
    });
};

module.exports = async (options) => {
    try {
        // 1. 检查 -n 参数是否传入
        const nameArg = parseOptional('name', 'n');
        if (!nameArg.hasFlag || !nameArg.value) {
            Ec.error('❌ 缺少必需参数: -n <应用名称>');
            console.log('');
            console.log('  用法:'.gray);
            console.log('    mxt app -n <应用名称>'.cyan);
            console.log('');
            process.exit(1);
        }

        const appName = nameArg.value;

        // 2. 检查目录是否已存在
        const appDir = path.join(process.cwd(), appName);
        if (fs.existsSync(appDir)) {
            Ec.warn(`⚠ 目录已存在: ${appDir}`);
            console.log('');
            Ec.error('请选择其他应用名称或删除现有目录');
            console.log('');
            process.exit(1);
        }

        // 3. 检查 ai 命令是否存在
        Ec.waiting('正在检查 ai 命令...');
        const aiAvailable = await _isCommandAvailable('ai');
        
        if (!aiAvailable) {
            Ec.error('❌ 未找到 ai 命令');
            console.log('');
            Ec.error('请先安装 zero-ai:');
            console.log('  npm install -g zero-ai'.cyan);
            console.log('');
            process.exit(1);
        }
        
        Ec.info('✓ ai 命令已安装');

        // 4. 显示菜单选择应用类型
        console.log('');
        const menuItems = APP_TYPES.map(type => ({
            name: type.name,
            description: type.description,
            _command: type.command
        }));

        const selected = await selectSingle(menuItems, '选择应用类型');

        if (!selected) {
            Ec.waiting('已取消');
            process.exit(0);
        }

        // 5. 执行 ai 命令
        await _executeAiCommand(selected._command, appName);

        process.exit(0);

    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        process.exit(1);
    }
};
