const path = require('path');
const fs = require('fs').promises;

const DATABASE_FILENAME = '任务数据库.base';
const DATABASE_CONTENT = [
    'views:',
    '  - type: table',
    '    name: 表格',
    '    filters:',
    '      and:',
    '        - file.basename.startsWith("task-")',
    '        - file.ext.endsWith("md")',
    '    order:',
    '      - file.name',
    '      - runAt',
    '      - author',
    '      - status',
    '      - title',
    ''
].join('\n');

const _writeIfDifferent = async (filePath, content) => {
    let current = null;
    try {
        current = await fs.readFile(filePath, 'utf8');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    if (current === content) return false;
    await fs.writeFile(filePath, content, 'utf8');
    return true;
};

/** 在项目根目录或 .r2mo 目录中确保任务数据库与项目空标记文件存在。 */
const ensureTaskDatabase = async (cwd) => {
    const basePath = path.resolve(cwd);
    const isR2moDirectory = path.basename(basePath) === '.r2mo';
    const r2moDir = isR2moDirectory ? basePath : path.join(basePath, '.r2mo');
    const projectDir = isR2moDirectory ? path.dirname(basePath) : basePath;
    const noteFilename = `${path.basename(projectDir).toUpperCase()}.md`;
    const databasePath = path.join(r2moDir, DATABASE_FILENAME);
    const notePath = path.join(r2moDir, noteFilename);

    await fs.mkdir(r2moDir, { recursive: true });
    const databaseChanged = await _writeIfDifferent(databasePath, DATABASE_CONTENT);
    const noteChanged = await _writeIfDifferent(notePath, '');

    return {
        r2moDir,
        databasePath,
        notePath,
        databaseChanged,
        noteChanged
    };
};

module.exports = {
    DATABASE_FILENAME,
    DATABASE_CONTENT,
    ensureTaskDatabase
};
