#!/usr/bin/env node

/**
 * Lain Console - 独立的交互式控制台入口
 */

const readline = require('readline');
const colors = require('colors');
const path = require('path');
const fs = require('fs');
const terminalCommands = require('./terminal');

// 设置颜色主题
colors.setTheme({
    silly: 'rainbow',
    input: 'grey',
    verbose: 'cyan',
    prompt: 'red',
    info: 'green',
    data: 'blue',
    help: 'cyan',
    warn: 'yellow',
    debug: 'magenta',
    error: 'red'
});

// 显示欢迎界面和菜单
const showMenu = () => {
    // 清屏
    process.stdout.write('\x1Bc');

    // 显示标准头部信息
    showHeader();

    // 使用96个字符宽度
    const width = 96;
    const headerBorder = '='.repeat(width).blue;
    const footerBorder = '-'.repeat(width).blue;

    console.log('');
    console.log(headerBorder);
    const title = 'MXT AI / Lain Console';
    const padding = ' '.repeat(Math.floor((width - title.length) / 2) - 1);
    console.log(`${padding}${title}`.bold.brightCyan);
    console.log(headerBorder);

    console.log('');
    console.log('欢迎使用 MXT AI / Lain 控制台！'.green);
    console.log('这是一个交互式命令行界面。'.yellow);
    console.log('');

    console.log('可用命令：'.bold);
    console.log('  help     - 显示帮助信息'.white);
    console.log('  llm      - 查看大模型配置信息'.white);
    console.log('  quit     - 退出控制台'.white);
    console.log('');

    console.log('请在提示符后输入命令。'.gray);
    console.log(footerBorder);
};

// 显示标准头部信息
const showHeader = () => {
    const appInfo = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

    console.log(`[MXT AI]`.green.bold + ` ----------------- Rachel MXT / AI工具项  ------------------`.rainbow);
    console.log(`[MXT AI]`.green.bold + ' 应用名称: '.bold + 'Rachel MXT / SDD');
    console.log(`[MXT AI]`.green.bold + ' 工具主页: '.bold + appInfo.homepage.blue);
    console.log(`[MXT AI]`.green.bold + ` 工具版本: ` + `${appInfo.version}`.red + '  ' + `( Node >= 22.x )`.yellow);
    console.log(`[MXT AI]`.green.bold);
    console.log(`[MXT AI]`.green.bold + ` ----------------- AI 系统启动…… ----------------------------`.rainbow);
};

// 处理用户输入
const handleInput = (input, commands) => {
    const command = input.trim().toLowerCase();

    // 创建命令上下文
    const context = {
        commands: commands
    };

    switch (command) {
        case '':
            // 空命令，不处理
            break;
        case 'help':
            commands.help(context);
            break;
        case 'test':
            commands.test(context);
            break;
        case 'llm':
            commands.llm(context);
            break;
        case 'quit':
            commands.quit(context);
            break;
        default:
            console.log('');
            console.log(`未知命令: ${command}`.brightRed);
            console.log('输入 "help" 查看可用命令。'.yellow);
            console.log('');
    }
};

// 主函数
const main = async () => {
    showMenu();

    // 创建 readline 接口
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '[Lain AI] > '.cyan.bold
    });

    rl.prompt();

    rl.on('line', (line) => {
        const input = line.trim();
        handleInput(input, terminalCommands);
        rl.prompt();
    }).on('close', () => {
        console.log('\n' + '感谢使用 MXT AI / Lain 控制台，再见！'.brightGreen + '\n');
        process.exit(0);
    });

    // 处理 Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n\n' + '感谢使用 MXT AI / Lain 控制台，再见！'.brightGreen + '\n');
        rl.close();
        process.exit(0);
    });
};

// 启动程序
main().catch(err => {
    console.error('启动控制台时出错:', err);
    process.exit(1);
});