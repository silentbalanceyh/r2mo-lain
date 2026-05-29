const fs = require('fs');
const path = require('path');
const Ec = require('../epic');
const { spawn } = require('child_process');
const { selectSingle } = require('../utils/mxt-menu');

// AI 工具配置
const AI_TOOLS = [
    {
        name: 'Antigravity',
        command: 'antigravity',
        description: 'Claude Code 官方客户端',
        openMethod: 'spawn'  // 使用 spawn 直接执行
    },
    {
        name: 'Trae',
        command: 'trae',
        description: '字节跳动 AI IDE',
        openMethod: 'spawn'
    },
    {
        name: 'Cursor',
        command: 'cursor',
        description: 'Cursor AI IDE',
        openMethod: 'spawn'
    }
];

/**
 * 解析 -d 参数
 * @returns {string|null} 目录路径
 */
const _parseDirArg = () => {
    const args = process.argv.slice(3);
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-d' || args[i] === '--dir') {
            const next = args[i + 1];
            if (next && !next.startsWith('-')) {
                return next;
            }
        }
    }
    
    return null;
};

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
 * 使用 spawn 方式打开目录
 * @param {string} command 命令
 * @param {string} targetDir 目标目录
 */
const _openWithSpawn = async (command, targetDir) => {
    return new Promise((resolve, reject) => {
        const child = spawn(command, [targetDir], {
            stdio: 'inherit',
            detached: true,
            shell: process.platform === 'win32'
        });

        // 分离子进程，让它独立运行
        child.unref();

        // 给一点时间让进程启动
        setTimeout(() => {
            resolve();
        }, 500);

        child.on('error', (error) => {
            if (error.code === 'ENOENT') {
                reject(new Error(`未找到命令: ${command}`));
            } else {
                reject(error);
            }
        });
    });
};

/**
 * 打开目录
 * @param {Object} tool 工具配置
 * @param {string} targetDir 目标目录
 */
const _openDirectory = async (tool, targetDir) => {
    Ec.waiting(`🚀 正在使用 ${tool.name.cyan} 打开目录...`);
    
    switch (tool.openMethod) {
        case 'spawn':
        default:
            await _openWithSpawn(tool.command, targetDir);
            break;
    }
    
    Ec.info(`✅ 已启动 ${tool.name}`);
};

module.exports = async (options) => {
    try {
        // 1. 解析目录参数
        const dirArg = _parseDirArg();
        let targetDir = dirArg ? path.resolve(dirArg) : process.cwd();
        
        // 验证目录是否存在
        if (!fs.existsSync(targetDir)) {
            Ec.error(`❌ 目录不存在: ${targetDir}`);
            process.exit(1);
        }
        
        if (!fs.statSync(targetDir).isDirectory()) {
            Ec.error(`❌ 路径不是目录: ${targetDir}`);
            process.exit(1);
        }
        
        // 2. 检查可用工具
        const availableTools = [];
        
        for (const tool of AI_TOOLS) {
            if (await _isCommandAvailable(tool.command)) {
                availableTools.push(tool);
            }
        }
        
        if (availableTools.length === 0) {
            Ec.error('❌ 未找到可用的 AI 工具');
            console.log('');
            console.log('  支持的工具:'.gray);
            AI_TOOLS.forEach(tool => {
                console.log(`    - ${tool.name}: ${tool.description}`.gray);
            });
            process.exit(1);
        }
        
        // 3. 显示目标目录
        console.log('');
        Ec.info(`📂 目标目录: ${targetDir.cyan}`);
        console.log('');
        
        // 4. 交互式选择工具
        const menuItems = availableTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            _tool: tool
        }));
        
        const selected = await selectSingle(menuItems, '选择 AI 工具');
        
        if (!selected) {
            Ec.waiting('已取消');
            process.exit(0);
        }
        
        // 5. 打开目录
        await _openDirectory(selected._tool, targetDir);
        
        process.exit(0);
        
    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        process.exit(1);
    }
};
