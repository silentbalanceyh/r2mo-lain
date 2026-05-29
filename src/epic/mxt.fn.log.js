const colors = require("colors");
const readline = require("readline");

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

// 创建 readline 接口实例
const _rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const error = (message = '') => console.error(`[MXT ER] `.red.bold + `${message}`.red);
const info = (message = '') => console.info(`[MXT AI]`.green.bold + ` ${message ? message : ''}`);
const execute = (message = '') => console.info(`[MXT AI]`.blue.bold + ` ${message ? message : ''}`);
const warn = (message = '') => console.warn(`[MXT AI]`.yellow.bold + ` ${message}`.yellow);

// 询问用户输入的函数
const ask = (question) => {
    const askQ = `[MXT AI] `.blue.bold + `${question}`.yellow;
    return new Promise((resolve) => {
        _rl.question(askQ, (answer) => {
            resolve(answer);
        });
    });
};

// 关闭 readline 接口
const askClose = () => {
    _rl.close();
};

module.exports = {
    execute,
    info,
    warn,
    error,
    ask,
    askClose
};