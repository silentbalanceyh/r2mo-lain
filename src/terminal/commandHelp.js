/**
 * Help command implementation
 */

const helpCommand = (context) => {
    console.log('');
    console.log('帮助信息：'.bold.brightYellow);
    
    console.log('  help     - 显示此帮助信息'.white);
    console.log('  llm      - 查看大模型配置信息'.white);
    console.log('  quit     - 退出控制台'.white);
    console.log('');
};

module.exports = helpCommand;