/**
 * Test command implementation
 * 
 * 这是一个示例测试命令，用于演示如何添加新命令
 */

const testCommand = (context) => {
    console.log('');
    console.log('测试命令执行结果：'.bold.brightCyan);
    console.log('  这是一个测试命令的输出'.white);
    console.log('  当前时间: ' + new Date().toLocaleString().yellow);
    console.log('  您可以在此处添加任何测试逻辑'.gray);
    console.log('');
    
    // 示例：访问上下文中的信息
    const commandCount = Object.keys(context.commands).length;
    console.log(`  当前系统中可用命令数量: ${commandCount.toString().green}`);
    console.log('');
};

module.exports = testCommand;