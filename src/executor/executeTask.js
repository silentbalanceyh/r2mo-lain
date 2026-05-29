const path = require('path');
const fs = require('fs').promises;
const Ec = require('../epic');
const { playAudio } = require('../utils/mxt-audio');

const TASK_DIR = '.r2mo/task';
const THREAD_FILE = 'thread';
const DEFAULT_SLOTS = 20;
const HIDDEN_HISTORY_DIR = path.join(require('os').homedir(), '.r2mo', '.task-history');

const TASK_FILE_RE = /^task-(\d+)\.md$/;

const _resolveTaskDir = (cwd) => {
    if (path.basename(cwd) === '.r2mo') {
        return path.resolve(cwd, 'task');
    }
    return path.resolve(cwd, TASK_DIR);
};

/**
 * 槽位数量以 .r2mo/task/thread 为准。
 * 只有 thread 不存在或值非法时，才回落到默认值 20。
 */
const _readSlotCount = async (taskDir) => {
    const threadPath = path.join(taskDir, THREAD_FILE);
    try {
        const raw = await fs.readFile(threadPath, 'utf8');
        const count = parseInt(String(raw).trim(), 10);
        if (Number.isNaN(count) || count < 1) return DEFAULT_SLOTS;
        return count;
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(threadPath, String(DEFAULT_SLOTS), 'utf8');
            return DEFAULT_SLOTS;
        }
        throw error;
    }
};

const _slotFilename = (slot) => `task-${String(slot).padStart(3, '0')}.md`;

const _formatRunAt = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}.${h}-${mm}-${s}`;
};

const _formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const _parseTitleFromContent = (content) => {
    if (!content) return null;
    const match = content.match(/^---\s*\n([\s\S]+?)\n---/);
    if (!match) return null;
    const titleLine = match[1].split('\n').find((line) => /^\s*title\s*:/.test(line));
    if (!titleLine) return null;
    const value = titleLine.replace(/^\s*title\s*:\s*/, '').trim();
    return value.replace(/^['"]|['"]$/g, '').trim() || null;
};

const _sanitizeTitleForFilename = (title) => (title || '任务').replace(/[/\\:*?"<>|]/g, '-').trim() || '任务';

const _stripFrontmatter = (content) => String(content || '').replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

const _hasTaskBody = (content) => _stripFrontmatter(content).trim().length > 0;

const _isDefaultPlaceholder = (content) => {
    const title = _parseTitleFromContent(content) || '任务';
    return title === '任务' && !_hasTaskBody(content);
};

const _yamlFrontmatter = (attrs) => {
    const lines = ['---'];
    lines.push(`runAt: ${attrs.runAt}`);
    lines.push(`title: ${attrs.title}`);
    lines.push(`status: ${attrs.status || 'Pending'}`);
    lines.push('author:');
    lines.push('---');
    return lines.join('\n') + '\n';
};

const _archiveTask = async (taskDir, filename, content, cwd, withAudio) => {
    const now = new Date();
    const title = _parseTitleFromContent(content) || '任务';
    const titleSafe = _sanitizeTitleForFilename(title);
    const dateDir = _formatDate(now);
    const historyFilename = `${_formatRunAt(now)}-TASK@${titleSafe}.md`;
    const historyDir = path.join(taskDir, dateDir);
    const historyPath = path.join(historyDir, historyFilename);
    await fs.mkdir(historyDir, { recursive: true });
    if (withAudio) {
        playAudio('audio/task.ogg');
    }
    // 归档前将 status 强制改为 Done
    const fmMatch = content.match(/^---\s*\n([\s\S]+?)\n---/);
    if (fmMatch) {
        let fm = fmMatch[1];
        if (/^\s*status\s*:/m.test(fm)) {
            fm = fm.replace(/^\s*status\s*:.*$/m, 'status: Done');
        } else {
            fm += '\nstatus: Done';
        }
        content = content.replace(fmMatch[0], '---\n' + fm + '\n---');
    }
    await fs.writeFile(historyPath, content, 'utf8');
    // 静默副本：写入 ~/.r2mo/.task-history/日期/ 同名文件
    const hiddenDir = path.join(HIDDEN_HISTORY_DIR, dateDir);
    await fs.mkdir(hiddenDir, { recursive: true });
    await fs.writeFile(path.join(hiddenDir, historyFilename), content, 'utf8');
    await fs.unlink(path.join(taskDir, filename));
    Ec.waiting(`已转移到历史: ${filename} → ${path.relative(cwd, historyPath)}`);
    return historyPath;
};

const _pruneOverflowTasks = async (taskDir, taskSlots, cwd) => {
    const entries = await fs.readdir(taskDir, { withFileTypes: true }).catch(() => []);
    const taskFiles = entries.filter((entry) => entry.isFile() && TASK_FILE_RE.test(entry.name)).map((entry) => entry.name).sort();
    let archived = 0;
    let deleted = 0;
    let audioPlayed = false;

    for (const name of taskFiles) {
        const match = name.match(TASK_FILE_RE);
        if (!match) continue;
        const slot = parseInt(match[1], 10);
        if (slot <= taskSlots) continue;
        const srcPath = path.join(taskDir, name);
        let content;
        try {
            content = await fs.readFile(srcPath, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        if (_isDefaultPlaceholder(content)) {
            await fs.unlink(srcPath);
            deleted++;
            Ec.waiting(`阈值已降低，已删除默认任务: ${name}`);
            continue;
        }
        await _archiveTask(taskDir, name, content, cwd, !audioPlayed);
        archived++;
        audioPlayed = true;
    }
    return { archived, deleted };
};

/** 校准所有任务文件的 status：正文含 ## Changes → Done，否则 → Pending；缺失则补齐，不一致则修正 */
const _ensureStatusField = async (taskDir, taskSlots, cwd) => {
    let patched = 0;
    let corrected = 0;
    for (let i = 1; i <= taskSlots; i++) {
        const name = _slotFilename(i);
        const taskPath = path.join(taskDir, name);
        let content;
        try {
            content = await fs.readFile(taskPath, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        const fmMatch = content.match(/^---\s*\n([\s\S]+?)\n---/);
        if (!fmMatch) continue;
        const body = _stripFrontmatter(content);
        const expected = /^##\s+Changes\b/m.test(body) ? 'Done' : 'Pending';
        const statusLine = fmMatch[1].split('\n').find((line) => /^\s*status\s*:/.test(line));
        if (statusLine) {
            const current = statusLine.replace(/^\s*status\s*:\s*/, '').trim();
            if (current === expected) continue;
            // 修正已有但不一致的 status
            const fixedFm = fmMatch[1].replace(/^\s*status\s*:.*$/m, `status: ${expected}`);
            const newContent = content.replace(fmMatch[0], '---\n' + fixedFm + '\n---');
            await fs.writeFile(taskPath, newContent, 'utf8');
            corrected++;
            Ec.info(`已修正 ${path.relative(cwd, taskPath)} 的 status: ${current} → ${expected}`);
        } else {
            // 补齐缺失的 status
            const patchedFm = fmMatch[1] + `\nstatus: ${expected}`;
            const newContent = content.replace(fmMatch[0], '---\n' + patchedFm + '\n---');
            await fs.writeFile(taskPath, newContent, 'utf8');
            patched++;
            Ec.info(`已补齐 ${path.relative(cwd, taskPath)} 的 status: ${expected}`);
        }
    }
    return { patched, corrected };
};

const _ensurePlaceholderTasks = async (taskDir, taskSlots, cwd) => {
    let created = 0;
    for (let i = 1; i <= taskSlots; i++) {
        const taskFile = _slotFilename(i);
        const taskPath = path.join(taskDir, taskFile);
        try {
            await fs.access(taskPath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            const yaml = _yamlFrontmatter({ runAt: _formatRunAt(new Date()), title: '任务' });
            await fs.writeFile(taskPath, yaml, 'utf8');
            created++;
            Ec.info(`已补齐 ${path.relative(cwd, taskPath)}（YAML: runAt, title）`);
        }
    }
    return created;
};

const _loadSlots = async (taskDir, taskSlots) => {
    const slots = [];
    for (let i = 1; i <= taskSlots; i++) {
        const name = _slotFilename(i);
        const fullPath = path.join(taskDir, name);
        let content = '';
        try {
            content = await fs.readFile(fullPath, 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        slots.push({
            slot: i,
            name,
            fullPath,
            content,
            title: _parseTitleFromContent(content) || '任务',
            hasBody: _hasTaskBody(content),
            isPlaceholder: _isDefaultPlaceholder(content)
        });
    }
    return slots;
};

const _selectTaskSlots = async (slots) => {
    require('colors');
    const { selectMultiple } = require('../utils/mxt-menu');
    const menuItems = slots.map((item) => ({
        name: item.name.replace(/\.md$/, ''),
        description: item.isPlaceholder ? '空' : (item.title || '任务'),
        slot: item.slot
    }));
    return selectMultiple(menuItems, `选择要归档的任务（空槽位无操作）`);
};

module.exports = (options) => {
    try {
        const cwd = process.cwd();
        const taskDir = _resolveTaskDir(cwd);

        (async () => {
            await fs.mkdir(taskDir, { recursive: true });
            const taskSlots = await _readSlotCount(taskDir);
            const pruned = await _pruneOverflowTasks(taskDir, taskSlots, cwd);
            const created = await _ensurePlaceholderTasks(taskDir, taskSlots, cwd);
            if (created > 0) {
                Ec.waiting(`已对齐到 ${taskSlots} 个 task 槽位`);
            }
            const statusResult = await _ensureStatusField(taskDir, taskSlots, cwd);
            if (statusResult.patched > 0 || statusResult.corrected > 0) {
                Ec.waiting(`status 校准：补齐 ${statusResult.patched}，修正 ${statusResult.corrected}`);
            }
            if (pruned.archived > 0 || pruned.deleted > 0) {
                Ec.waiting(`已清理超额槽位：归档 ${pruned.archived}，删除默认任务 ${pruned.deleted}`);
            }

            const slots = await _loadSlots(taskDir, taskSlots);
            if (slots.length !== taskSlots) {
                Ec.error(`task 槽位对齐失败，期望 ${taskSlots}，实际 ${slots.length}`);
                process.exit(1);
            }

            // 展示所有槽位：有内容→归档到历史，空位→跳过
            const result = await _selectTaskSlots(slots);
            if (!result || result.items.length === 0) {
                Ec.warn('已取消');
                process.exit(0);
            }
            let audioPlayed = false;
            for (const chosen of result.items) {
                const target = slots.find((item) => item.slot === chosen.slot);
                if (!target) continue;

                if (target.isPlaceholder) {
                    // 空槽位：不做任何操作
                    Ec.info(`${target.name} 为空，已跳过`);
                    continue;
                }
                // 有内容：归档到历史，回写空占位保持槽位
                await _archiveTask(taskDir, target.name, target.content, cwd, !audioPlayed);
                audioPlayed = true;
                const yaml = _yamlFrontmatter({ runAt: _formatRunAt(new Date()), title: '任务' });
                await fs.writeFile(target.fullPath, yaml, 'utf8');
                Ec.info(`已回写 ${target.name}（空占位）`);
            }
            Ec.waiting('mxt task 已准备好任务文件；如需复制执行提示词，请运行 mxt run');
            process.exit(0);
        })().catch((error) => {
            Ec.error('mxt task 执行失败: ' + error.message);
            process.exit(1);
        });
    } catch (error) {
        Ec.error(error.message);
        process.exit(1);
    }
};
