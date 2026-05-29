#!/usr/bin/env node
const Ec = require('./epic');
const Executor = require('./executor');
const path = require('path');
const fs = require('fs');

// 检查是否是 version 命令模式
const _isVersionMode = () => {
    const args = process.argv.slice(2);
    return args.includes('version') || args.includes('-v') || args.includes('--version');
};

// 获取项目版本号
const _getVersion = () => {
    try {
        const packagePath = path.resolve(__dirname, '../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageJson.version || '未知版本';
    } catch (error) {
        return '未知版本';
    }
};

// 如果是 version 命令，则只输出版本号并退出
if (_isVersionMode()) {
    console.log(_getVersion());
    process.exit(0);
}

// 输出头部
Ec.info("SDD / Spec Driven Development ...")
// Ec.executeHeader("Rachel MXT / SDD");

// 读取配置文件
const configArr = Ec.parseMetadata();
Ec.executeBody(configArr, Executor);


// 输出尾部
Ec.executeEnd();