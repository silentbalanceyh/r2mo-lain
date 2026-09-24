const Ec = require("../epic");
const Args = require("../utils/mxt-args");
const { selectMultiple } = require("../utils/mxt-menu");
const AiCmd = require("../utils/mxt-ai-cmd");

const _isUninstall = () => Args.parseBool("uninstall", "u");

// 各平台 mxt 命令用法说明
const USAGE_CLAUDE = [
    "/mxt:plan 001  生成执行计划",
    "/mxt:run 001   执行任务开发",
    "/mxt:end 001   验证并写整改项",
    "/mxt:goon 001  整改后闭环验证",
    "/mxt:debug     BUG 排查",
    "/mxt:sync      Git 全量同步",
    "/mxt:loop 001  双会话任务闭环",
    "/mxt:start     拉起开发环境",
];
const USAGE_CODEX = [
    "$mxt-plan 001  生成执行计划",
    "$mxt-run 001   执行任务开发",
    "$mxt-end 001   验证并写整改项",
    "$mxt-goon 001  整改后闭环验证",
    "$mxt-debug     BUG 排查",
    "$mxt-sync      Git 全量同步",
    "$mxt-loop 001  双会话任务闭环",
    "$mxt-start     拉起开发环境",
];
// Pi Agent 以全局 skills 形式加载 mxt 闭环能力，同时生成 /mxt-* 短命令（等价 /skill:mxt-*）
const USAGE_PI = [
    "/mxt-plan 001   生成执行计划",
    "/mxt-run 001    执行任务开发",
    "/mxt-end 001    验证并写整改项",
    "/mxt-goon 001   整改后闭环验证",
    "/mxt-debug      BUG 排查",
    "/mxt-sync       Git 全量同步",
    "/mxt-loop 001   双会话任务闭环",
    "/mxt-start      拉起开发环境",
    "/mxt-doctor loc 防漂移基线校验",
    "/goal <objective>  设定目标（Pi 专属，对齐 Codex /goal）",
    "/goal --tokens 1.5m <objective>  带预算设定目标",
];

const _buildUsageHeader = () => {
    const lines = [];
    lines.push("  001 为三位数字任务编号，对应 .r2mo/task/task-001.md".gray);
    lines.push("  goon 的 001 同时对应 task-001.md 和 goon-001.md".gray);
    lines.push("");
    lines.push("  Claude Code / OpenCode:".bold);
    USAGE_CLAUDE.forEach((cmd) => lines.push("    " + cmd.gray));
    lines.push("  Codex:".bold);
    USAGE_CODEX.forEach((cmd) => lines.push("    " + cmd.gray));
    lines.push("  Pi Agent:".bold);
    USAGE_PI.forEach((cmd) => lines.push("    " + cmd.gray));
    lines.push(
        "    /mxt-* 为短命令别名，始终等价于 /skill:mxt-*；/goal 为 Pi 专属目标管理（status / edit / pause / resume / clear|stop，可用 --tokens <budget> 限定预算，命令面对齐 @narumitw/pi-goal）"
            .gray,
    );
    lines.push("");
    return lines.join("\n");
};

module.exports = async (_options) => {
    try {
        const isUninstall = _isUninstall();
        let selectedIds = [];

        if (isUninstall) {
            selectedIds = AiCmd.listPlatforms().map((platform) => platform.id);
        }

        if (!isUninstall) {
            const items = AiCmd.listPlatforms().map((platform) => ({
                name: platform.id,
                description: platform.name,
            }));
            const selected = await selectMultiple(
                items,
                "选择要安装的 AI 命令平台",
                _buildUsageHeader(),
            );
            selectedIds = (selected.items || []).map((item) => item.name);
        }

        if (selectedIds.length === 0) {
            Ec.warn("未选择平台，已取消安装");
            process.exit(0);
        }

        const results = isUninstall
            ? await AiCmd.uninstallPlatforms(selectedIds)
            : await AiCmd.installPlatforms(selectedIds);
        results.forEach((result) => {
            if (isUninstall) {
                Ec.info(
                    `已卸载 ${result.name}: 清理 ${result.removed} 项 -> ${result.targetDir}`,
                );
            } else {
                Ec.info(
                    `已安装 ${result.name}: ${result.copied} 个文件 -> ${result.targetDir}`,
                );
                if (result.prompts) {
                    Ec.info(
                        `  短命令别名: ${result.prompts.created} 个 /mxt-* -> ${result.prompts.targetDir}`,
                    );
                    (result.prompts.skipped || []).forEach((name) =>
                        Ec.warn(`  已跳过用户自建模板: ${name}.md`),
                    );
                }
                if (result.commands) {
                    if ((result.commands.created || []).length > 0) {
                        Ec.info(
                            `  目标命令: /${result.commands.created.join("、/")} -> ${result.commands.targetDir}`,
                        );
                    }
                    (result.commands.skipped || []).forEach((name) =>
                        Ec.warn(`  已跳过用户自建模板: ${name}.md`),
                    );
                }
                (result.warnings || []).forEach((warning) => Ec.warn(warning));
            }
        });
        Ec.info(
            isUninstall
                ? "AI 命令卸载完成。"
                : "AI 命令安装完成，Claude Code / OpenCode 使用 /mxt:plan、/mxt:run、/mxt:end、/mxt:goon、/mxt:sync、/mxt:start，Codex 使用 $mxt-plan、$mxt-run、$mxt-end、$mxt-goon、$mxt-sync、$mxt-start，Pi Agent 使用 /mxt-plan、/mxt-run、/mxt-end、/mxt-goon、/mxt-sync、/mxt-start（亦可用 /skill:mxt-*），并附带 Pi 专属的 /goal 目标管理命令（命令面对齐 Codex /goal 与 @narumitw/pi-goal：status / edit / pause / resume / clear|stop / --tokens，映射到 pi-subagents goal mission，仅写入 ~/.pi/agent/prompts；若已安装原生 @narumitw/pi-goal 则由其接管 /goal）。Claude Code 已打开的会话需退出后重新进入，Pi Agent 需执行 /reload 后生效。",
        );
        process.exit(0);
    } catch (e) {
        Ec.error(e.message);
        process.exit(1);
    }
};
