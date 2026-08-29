const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const { selectMultiple } = require('../utils/mxt-menu');
const AiCmd = require('../utils/mxt-ai-cmd');

const _isUninstall = () => Args.parseBool('uninstall', 'u');

// 各平台 mxt 命令用法说明
const USAGE_CLAUDE = [
    '/mxt:plan 001  生成执行计划',
    '/mxt:run 001   执行任务开发',
    '/mxt:end 001   验证并写整改项',
    '/mxt:goon 001  整改后闭环验证',
    '/mxt:debug     BUG 排查',
    '/mxt:sync      Git 全量同步',
    '/mxt:loop 001  双会话任务闭环',
    '/mxt:start     拉起开发环境'
];
const USAGE_CODEX = [
    '$mxt-plan 001  生成执行计划',
    '$mxt-run 001   执行任务开发',
    '$mxt-end 001   验证并写整改项',
    '$mxt-goon 001  整改后闭环验证',
    '$mxt-debug     BUG 排查',
    '$mxt-sync      Git 全量同步',
    '$mxt-loop 001  双会话任务闭环',
    '$mxt-start     拉起开发环境'
];

const _buildUsageHeader = () => {
    const lines = [];
    lines.push('  001 为三位数字任务编号，对应 .r2mo/task/task-001.md'.gray);
    lines.push('  goon 的 001 同时对应 task-001.md 和 goon-001.md'.gray);
    lines.push('');
    lines.push('  Claude Code / OpenCode:'.bold);
    USAGE_CLAUDE.forEach((cmd) => lines.push('    ' + cmd.gray));
    lines.push('  Codex:'.bold);
    USAGE_CODEX.forEach((cmd) => lines.push('    ' + cmd.gray));
    lines.push('');
    return lines.join('\n');
};

module.exports = async (options) => {
    try {
        const isUninstall = _isUninstall();
        let selectedIds = [];

        if (isUninstall) {
            selectedIds = AiCmd.listPlatforms().map((platform) => platform.id);
        }

        if (!isUninstall) {
            const items = AiCmd.listPlatforms().map((platform) => ({
                name: platform.id,
                description: platform.name
            }));
            const selected = await selectMultiple(items, '选择要安装的 AI 命令平台', _buildUsageHeader());
            selectedIds = (selected.items || []).map((item) => item.name);
        }

        if (selectedIds.length === 0) {
            Ec.warn('未选择平台，已取消安装');
            process.exit(0);
        }

        const results = isUninstall
            ? await AiCmd.uninstallPlatforms(selectedIds)
            : await AiCmd.installPlatforms(selectedIds);
        results.forEach((result) => {
            if (isUninstall) {
                Ec.info(`已卸载 ${result.name}: 清理 ${result.removed} 项 -> ${result.targetDir}`);
            } else {
                Ec.info(`已安装 ${result.name}: ${result.copied} 个文件 -> ${result.targetDir}`);
                (result.warnings || []).forEach((warning) => Ec.warn(warning));
            }
        });
        Ec.info(isUninstall
            ? 'AI 命令卸载完成。'
            : 'AI 命令安装完成，Claude Code / OpenCode 使用 /mxt:plan、/mxt:run、/mxt:end、/mxt:goon、/mxt:sync、/mxt:start，Codex 使用 $mxt-plan、$mxt-run、$mxt-end、$mxt-goon、$mxt-sync、$mxt-start。Claude Code 已打开的会话需退出后重新进入。');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message);
        process.exit(1);
    }
};
