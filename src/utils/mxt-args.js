/**
 * @module args
 * 高级参数解析工具
 */
const Ec = require('../epic');

// 标准解析 (key-value)
const parseStandard = (options) => Ec.parseArgument(options);

// 解析可选值 (-r [val]) -> { hasFlag, value }
const parseOptional = (flag, alias) => {
    const args = process.argv.slice(3);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === `-${alias}` || args[i] === `--${flag}`) {
            const next = args[i+1];
            return { hasFlag: true, value: (next && !next.startsWith('-')) ? next : null };
        }
    }
    return { hasFlag: false, value: null };
};

// 解析布尔值 (-v) -> boolean
const parseBool = (flag, alias) => {
    const args = process.argv.slice(3);
    return args.includes(`--${flag}`) || args.includes(`-${alias}`);
};

// 解析位置参数 -> array
const parsePositional = () => {
    const args = process.argv.slice(3);
    const res = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('-')) { i++; continue; } // Skip flags and their potential values (simple heuristic)
        res.push(args[i]);
    }
    return res;
};

module.exports = { parseStandard, parseOptional, parseBool, parsePositional };