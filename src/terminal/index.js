/**
 * Terminal Commands Index
 * 
 * 所有终端命令的入口文件
 * 除 help 和 quit 命令外，所有新追加的命令都应在此处导出
 */

// 基础命令
const helpCommand = require('./commandHelp');
const quitCommand = require('./commandQuit');

// 在此处添加新命令的导入
const llmCommand = require('./commandLlm');

// 导出所有命令
module.exports = {
    // 基础命令
    help: helpCommand,
    quit: quitCommand,
    
    // 在此处添加新命令的导出
    llm: llmCommand
};