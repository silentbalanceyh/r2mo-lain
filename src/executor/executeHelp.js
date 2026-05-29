const Ec = require('../epic');

module.exports = (options) => {
    const parsed = Ec.parseArgument(options);
    const metadata = Ec.parseMetadata();

    // 优先读取 options 中的 command，如果没有则尝试读取位置参数
    const commandName = parsed.command ? parsed.command : (process.argv[3] && !process.argv[3].startsWith('-') ? process.argv[3] : null);

    if (commandName) {
        // ---------------------------------------------------------
        // 单命令详细模式
        // ---------------------------------------------------------
        const runner = metadata.find(runner => runner.command === commandName);
        if (!runner) {
            Ec.error(`未找到命令 [ ${commandName} ] 的定义信息！`);
            process.exit(1);
        }

        // 处理描述文字
        let description = runner.description;
        if (description.includes("（CV）")) {
            description = description.replace("（CV）", "（CV）📋️ ");
        }

        console.log(``);
        console.log(`${description}`);
        console.log(``);

        console.log(`Usage:`);
        console.log(`mxt ${runner.command} [options]`);
        console.log(``);

        const opts = runner.options || [];
        if (opts.length > 0) {
            console.log(`Options:`);
            opts.forEach(option => {
                const flags = `[-${option.alias}|--${option.name}]`;
                let desc = option.description;
                if (option.hasOwnProperty('default')) {
                    desc += ` (默认: ${option.default})`.blue;
                }

                // 对齐设置
                const minPadding = 25;
                let paddingSpace = minPadding - flags.length;
                if (paddingSpace < 2) paddingSpace = 2;

                console.log(`${flags.yellow}${' '.repeat(paddingSpace)}${desc}`);
            });
            console.log(``);
        }

    } else {
        // ---------------------------------------------------------
        // 所有命令列表模式
        // ---------------------------------------------------------
        console.log(``);
        console.log(`Usage:`);
        console.log(`mxt <command>`);
        console.log(``);
        console.log(`All commands:`);
        console.log(``);

        // 计算最大长度以对齐
        let maxCmdLen = 0;
        metadata.forEach(r => {
            if (r.command.length > maxCmdLen) maxCmdLen = r.command.length;
        });
        const alignLen = maxCmdLen + 6;

        metadata.forEach(runner => {
            let description = runner.description;
            if (description.includes("（CV）")) {
                description = description.replace("（CV）", "📋️");
            }

            const padding = ' '.repeat(alignLen - runner.command.length);
            console.log(`    ${runner.command.green}${padding}${description}`);
        });

        console.log(``);
        console.log(`Run "mxt help -c <command>" for more info`);
        console.log(``);
    }

    // 退出程序
    process.exit(0);
}