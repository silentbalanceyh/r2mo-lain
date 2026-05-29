const path = require('path');
const fs = require('fs').promises;

const Ec = require('../epic');
const { playAudio } = require('../utils/mxt-audio');

const TASK_DIR = '.r2mo/task';
const TASK_FILE_RE = /^task-(\d+)\.md$/;

const _resolveTaskDir = (cwd) => {
    if (path.basename(cwd) === '.r2mo') {
        return path.resolve(cwd, 'task');
    }
    return path.resolve(cwd, TASK_DIR);
};

const _stripFrontmatter = (content) => {
    if (!content) return '';
    const m = content.match(/^---\s*\r?\n[\s\S]+?\r?\n---\s*\r?\n?/);
    return m ? content.slice(m[0].length).replace(/^\s+/, '') : content;
};

const _parseTitleFromContent = (content) => {
    if (!content) return null;
    const m = content.match(/^---\s*\n([\s\S]+?)\n---/);
    if (!m) return null;
    const titleLine = m[1].split('\n').find((line) => /^\s*title\s*:/.test(line));
    if (!titleLine) return null;
    const value = titleLine.replace(/^\s*title\s*:\s*/, '').trim();
    return value.replace(/^['"]|['"]$/g, '').trim() || null;
};

const _listTaskFiles = async (taskDir) => {
    const entries = await fs.readdir(taskDir, { withFileTypes: true }).catch(() => []);
    const files = entries
        .filter((e) => e.isFile() && TASK_FILE_RE.test(e.name))
        .map((e) => ({ name: e.name, slot: parseInt(e.name.match(TASK_FILE_RE)[1], 10) }));
    files.sort((a, b) => a.slot - b.slot);
    return files.map((f) => f.name);
};

const _promptForTask = (relativePath) => `读取当前工作目录下 ${relativePath} 的正文（frontmatter 之后），按其中需求只制定执行计划，不进行实现。1）在 ${relativePath} 中追加或更新 ## Plan 章节，Plan 要足够细，便于后续不同 AI Agent 直接执行；至少包含目标拆解、涉及文件/模块、执行步骤、验证方式、风险与交接说明。2）不要修改任务 status，不要追加 Changes，不要生成或修改 goon 文件。3）如果已存在 ## Plan，以当前任务正文和已有 Changes 为准更新该章节，避免重复追加多个 Plan。4）该 Plan 是完整工作流 requirement(task.md) -> Plan(task.md) -> Changes(task.md) -> end(goon.md) -> Changes(task.md) 的规划阶段交接内容；其中 task.md / goon.md 是流程占位写法，实际表示当前编号对应的 task-xxx.md / goon-xxx.md。`;

module.exports = async () => {
    const cwd = process.cwd();
    const taskDir = _resolveTaskDir(cwd);

    try {
        require('colors');
        const { selectSingle } = require('../utils/mxt-menu');
        const taskFiles = await _listTaskFiles(taskDir);
        if (taskFiles.length === 0) {
            Ec.warn('.r2mo/task 下暂无 task-00X.md 任务文件');
            process.exit(0);
        }

        const menuItems = [];
        for (const name of taskFiles) {
            const taskPath = path.join(taskDir, name);
            let desc = '无标题';
            try {
                const content = await fs.readFile(taskPath, 'utf8');
                const title = _parseTitleFromContent(content);
                if (title) desc = title;
            } catch (_) {}
            menuItems.push({ name, description: desc });
        }

        const selected = await selectSingle(menuItems, '选择要规划的任务');
        if (!selected) {
            Ec.warn('已取消');
            process.exit(0);
        }

        playAudio('audio/task.ogg');

        const taskPath = path.join(taskDir, selected.name);
        const displayPath = path.relative(cwd, taskPath).split(path.sep).join('/');

        const content = await fs.readFile(taskPath, 'utf8');
        const body = _stripFrontmatter(content);

        Ec.waiting('-------- 任务正文 --------');
        console.log(body);
        Ec.waiting('------------------------');

        const prompt = _promptForTask(displayPath);
        await Ec.outCopy(prompt);
        Ec.info('已写入剪贴板: ' + prompt);
        process.exit(0);
    } catch (err) {
        Ec.error('mxt plan 执行失败: ' + err.message);
        process.exit(1);
    }
};
