const fs = require('fs');
const os = require("os");

const __LOG = require("./mxt.fn.log");
const __FX = require("./mxt.fn.fx");

const __outFile = (paths, content, sync) => {
    if (sync) {
        fs.writeFileSync(paths, content);
        __LOG.info(`（Sync）成功将数据写入到文件：${paths.cyan}！`);
    } else {
        fs.writeFile(paths, content, (res) => {
            __LOG.info(`（Async）成功将数据写入到文件：${paths.cyan}！`);
        });
    }
};

const outJson = (paths, content, sync = false) => __FX.fxContinue(!!content, () => __outFile(paths, JSON.stringify(content, null, 4), sync));
const outString = (paths, content, sync = false) => __FX.fxContinue(!!content, () => __outFile(paths, content, sync));


const outCopy = (data) => new Promise(function (resolve, reject) {
    const platform = os.platform();

    if (platform === 'win32') {
        // 避免 stdin/控制台代码页导致的中文乱码：
        // 1) Node 侧将文本转为 UTF-8 Base64
        // 2) PowerShell 侧按 UTF-8 还原后写入剪贴板
        const b64 = Buffer.from(String(data), 'utf8').toString('base64');
        const command = `$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}')); Set-Clipboard -Value $text`;
        const proc = require('child_process').spawn(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', command],
            { env: { ...process.env } }
        );
        proc.on('error', function (err) { reject(err); });
        proc.on('close', function (code) {
            if (code === 0) resolve();
            else reject(new Error(`剪贴板进程退出码: ${code}`));
        });
    } else if (platform === 'darwin') {
        const proc = require('child_process').spawn('pbcopy', []);
        proc.on('error', function (err) { reject(err); });
        proc.on('close', function (code) {
            if (code === 0) resolve();
            else reject(new Error(`剪贴板进程退出码: ${code}`));
        });
        proc.stdin.write(data);
        proc.stdin.end();
    } else {
        // Linux: 尝试 xclip
        const proc = require('child_process').spawn('xclip', ['-selection', 'clipboard']);
        proc.on('error', function (err) { reject(err); });
        proc.on('close', function (code) {
            if (code === 0) resolve();
            else reject(new Error(`剪贴板进程退出码: ${code}`));
        });
        proc.stdin.write(data);
        proc.stdin.end();
    }
});
module.exports = {
    outCopy,
    outString,
    outJson,
}