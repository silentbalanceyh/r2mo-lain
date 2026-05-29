const fs = require('fs');
const U = require("underscore");
const path = require("path");

// Import
const __TO = require("./mxt.fn.to");
const __IS = require('./mxt.fn.is');
const __V = require('./mxt.v.constant');
const __ELE = require("./mxt.fn.element");

const __CX = require('./mxt.fn.cx');
const __FX = require('./mxt.fn.fx');
const __U = require('./mxt.fn.find');
const __OUT = require("./mxt.fn.out");

const ioJObject = (path) => __IS.isFile(path) ? __TO.toJObject(fs.readFileSync(path, "utf-8")) : {};
const ioJArray = (path) => __IS.isFile(path) ? __TO.toJArray(fs.readFileSync(path, "utf-8")) : [];
const ioString = (path) => __IS.isFile(path) ? fs.readFileSync(path, "utf-8") : "";
const ioStream = (path) => __IS.isFile(path) ? fs.readFileSync(path) : null;
const ioProp = (path) => {
    if (__IS.isFile(path)) {
        const content = ioString(path);
        const lines = content.split('\n');
        const result = {};
        lines.forEach(line => {
            const kv = line.split('=');
            const key = kv[0] ? kv[0].trim() : undefined;
            const value = kv[1] ? kv[1].trim() : undefined;
            if (key && value) {
                result[key] = value;
            }
        });
        return result;
    } else {
        return {};
    }
};
const ioFiles = (folder) => {
    const fileArr = [];
    if (__IS.isDirectory(folder)) {
        const files = fs.readdirSync(folder);
        files.forEach(item => {
            const file = item;
            const path = `${folder}${__V.FILE_DELIMITER}${item}`;
            fileArr.push({file, path})
        });
    }
    return fileArr;
};
const ioCsv = (file, separator) => {
    const data = ioString(file).split('\n');
    const header = data.shift();
    const lines = [];
    data.forEach(line => {
        if (line && 0 < line.trim().length) {
            const item = __ELE.elementZip(header.split(separator), line.split(separator), true);
            lines.push(item);
        }
    });
    return lines;
};

const ioName = (path = '.') => {
    const stat = fs.statSync(path);
    if (stat.isDirectory()) {
        return path.substring(path.lastIndexOf(__V.FILE_DELIMITER) + 1);
    }
};

const ioRoot = () => {
    const folderInfo = __U.findTrace(__dirname);
    let root = folderInfo.filter(item => item.endsWith("src"));
    __FX.fxError(1 !== root.length, 10022, __dirname);
    return root[0];
};


const __ioDeleteDir = (path) => {
    if (fs.existsSync(path)) {
        const etat = fs.statSync(path);
        if (etat.isDirectory()) {
            const children = fs.readdirSync(path);
            if (0 === children.length) {
                fs.rmdirSync(path);
            } else {
                children.forEach(item => {
                    const hitted = path + __V.FILE_DELIMITER + item;
                    __ioDeleteDir(hitted);
                });
            }
        } else {
            __LOG.info(`删除文件：${path}`);
            fs.unlinkSync(path);
        }
    }
};

const ioCopy = (from, to) => {
    __FX.fxContinue(__IS.isExist(from) && !__IS.isExist(to) && __IS.isFile(from), () => {
        const content = __IO.ioString(from);
        __OUT.outString(to, content);
    });
};

const ioDelete = (path) => {
    __FX.fxError(__V.FILE_DELIMITER === path.trim(), 10024, path);
    __ioDeleteDir(path);
};

const ioDataA = (path) => {
    // 先读取数据信息
    __CX.cxExist(path);
    const content = ioString(path);
    try {
        const parsed = JSON.parse(content);
        if (U.isArray(parsed)) {
            return parsed;
        } else {
            if (parsed.data && U.isArray(parsed.data)) {
                return parsed.data;
            } else {
                return [];
            }
        }
    } catch (error) {
        return [];
    }
}
const ioSwitch = (pathDir = ".") => {
    // 截取当前运行目录
    let pathStart;
    if (pathDir.startsWith("/")) {
        pathStart = pathDir;
    } else {
        pathStart = path.resolve(process.cwd(), pathDir);
    }
    return pathStart;
}
module.exports = {
    ioJArray,
    ioJObject,
    ioString,
    ioStream,
    ioProp,
    ioFiles,
    ioCsv,


    ioName,
    ioRoot,
    ioDataA,
    ioSwitch,


    ioCopy,
    ioDelete,
}