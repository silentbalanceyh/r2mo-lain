/**
 * Quit command implementation
 */

const quitCommand = (context) => {
    console.log('');
    console.log('感谢使用 MXT AI / Lain 控制台，再见！'.brightGreen);
    console.log('');
    process.exit(0);
};

module.exports = quitCommand;