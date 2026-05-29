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

/** 去掉顶部 YAML 属性笔记，只保留正文（支持 \n 与 \r\n） */
const _stripFrontmatter = (content) => {
    if (!content) return '';
    const m = content.match(/^---\s*\r?\n[\s\S]+?\r?\n---\s*\r?\n?/);
    return m ? content.slice(m[0].length).replace(/^\s+/, '') : content;
};

/** 从内容中解析 YAML 的 title */
const _parseTitleFromContent = (content) => {
    if (!content) return null;
    const m = content.match(/^---\s*\n([\s\S]+?)\n---/);
    if (!m) return null;
    const titleLine = m[1].split('\n').find((line) => /^\s*title\s*:/.test(line));
    if (!titleLine) return null;
    const value = titleLine.replace(/^\s*title\s*:\s*/, '').trim();
    return value.replace(/^['"]|['"]$/g, '').trim() || null;
};

/** 读取 .r2mo/task 下存在的 task-00X.md 列表（按槽位号排序） */
const _listTaskFiles = async (taskDir) => {
    const entries = await fs.readdir(taskDir, { withFileTypes: true }).catch(() => []);
    const files = entries
        .filter((e) => e.isFile() && TASK_FILE_RE.test(e.name))
        .map((e) => ({ name: e.name, slot: parseInt(e.name.match(TASK_FILE_RE)[1], 10) }));
    files.sort((a, b) => a.slot - b.slot);
    return files.map((f) => f.name);
};

/** 提示词模板：阅读后为所选 md 的相对路径（统一模板） */
const _promptForTask = (relativePath) => `读取当前工作目录下 ${relativePath} 的正文（frontmatter 之后），按其中要求完成任务。0）如果 ${relativePath} 中存在 ## Plan 章节，优先按 Plan 执行；如果没有 Plan，则先在心中补足必要执行计划但不要写入 Plan。1）根据任务评估复杂度，复杂度过大的任务使用 Team 模式（创建更多 teammates）执行。2）评估是否要创建 worktrees，用户若指定则必须创建，否则根据你的判断询问。3）执行完成后将变更回写 ${relativePath} 追加 Changes 记录，并将任务文档笔记中 status 改成 Done。`;


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

        const selected = await selectSingle(menuItems, '选择要执行的任务');
        if (!selected) {
            Ec.warn('已取消');
            process.exit(0);
        }

        playAudio('audio/run.ogg');

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
        Ec.error('mxt run 执行失败: ' + err.message);
        process.exit(1);
    }
};
