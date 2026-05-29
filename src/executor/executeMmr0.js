const fs = require('fs');
const path = require('path');
const Ec = require('../epic');
const fsAsync = require('fs').promises;
const { execSync } = require('child_process');
const { parseFile, exists, gitClone } = require('../utils/mxt-file-utils');
const { selectSingle, selectMultiple } = require('../utils/mxt-menu');
const { SPEC_REPO_URL, LOCAL_CACHE_DIR, GITIGNORE_ENTRY } = require('../utils/mxt-repo-spec');
require('colors');

/**
 * 检查命令是否可用
 */
const _isCommandAvailable = (command) => {
    try {
        const whereCmd = process.platform === 'win32' ? 'where' : 'which';
        execSync(`${whereCmd} ${command}`, { stdio: 'ignore', shell: process.platform === 'win32' });
        return true;
    } catch {
        return false;
    }
};

/**
 * 解析 pom.xml 提取 artifactId（排除 parent 节点）
 */
const _parsePomXml = (pomPath) => {
    try {
        const content = fs.readFileSync(pomPath, 'utf8');
        const withoutParent = content.replace(/<parent>[\s\S]*?<\/parent>/gi, '');
        const match = withoutParent.match(/<artifactId>([^<]+)<\/artifactId>/);
        return match && match[1] ? match[1].trim() : null;
    } catch {
        return null;
    }
};

/**
 * 检查仓库是否是最新的
 */
const _isRepositoryUpToDate = (repoPath) => {
    try {
        execSync('git fetch --quiet origin', { cwd: repoPath, stdio: 'ignore', shell: process.platform === 'win32' });
        const remoteCommit = execSync('git rev-parse origin/HEAD', { cwd: repoPath, encoding: 'utf8', shell: process.platform === 'win32' }).trim();
        const localCommit = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8', shell: process.platform === 'win32' }).trim();
        return remoteCommit === localCommit;
    } catch (error) {
        return false;
    }
};

/**
 * 克隆或更新仓库
 */
const _cloneOrUpdateRepository = async (projectDir) => {
    const repoPath = path.join(projectDir, LOCAL_CACHE_DIR);
    
    if (exists(repoPath)) {
        Ec.waiting('正在检查仓库状态...');
        if (_isRepositoryUpToDate(repoPath)) {
            Ec.info('✓ 仓库已是最新版本，无需更新');
            return repoPath;
        }
        
        try {
            Ec.waiting('正在更新仓库...');
            execSync('git pull --quiet', { cwd: repoPath, stdio: 'ignore', shell: process.platform === 'win32' });
            Ec.info('✓ 仓库已更新');
        } catch (error) {
            Ec.warn('⚠ 更新失败，尝试重新克隆...');
            await fsAsync.rm(repoPath, { recursive: true, force: true });
            Ec.waiting('正在克隆仓库...');
            gitClone(SPEC_REPO_URL, repoPath, { shallow: true });
            Ec.info('✓ 仓库已克隆');
        }
    } else {
        Ec.waiting('正在克隆仓库...');
        await fsAsync.mkdir(path.dirname(repoPath), { recursive: true });
        gitClone(SPEC_REPO_URL, repoPath, { shallow: true });
        Ec.info('✓ 仓库已克隆');
    }
    
    return repoPath;
};

/**
 * 递归扫描所有 .md 文件
 */
const _scanMarkdownFiles = (dir) => {
    const files = [];
    
    const scan = (currentDir) => {
        if (!exists(currentDir)) return;
        
        const items = fs.readdirSync(currentDir);
        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                scan(itemPath);
            } else if (item.endsWith('.md')) {
                files.push(itemPath);
            }
        }
    };
    
    scan(dir);
    return files;
};

/**
 * 解析 MD 文件的 front-matter
 */
const _parseMarkdownFile = (filePath) => {
    const parsed = parseFile(filePath);
    if (!parsed || !parsed.attributes) {
        return null;
    }
    
    const attrs = parsed.attributes;
    // 检查是否包含必需的字段（mmr0 需要 sql 字段）
    if (!attrs.name || !attrs.java || !attrs.table || !attrs.sql) {
        return null;
    }
    
    return {
        name: attrs.name,
        alias: attrs.alias || '',
        identifier: attrs.identifier || '',
        table: attrs.table,
        java: attrs.java,
        sql: attrs.sql || '',
        body: parsed.body || '',
        filePath: filePath
    };
};

/**
 * 读取 metadata.json 文件
 */
const _loadMetadata = (repoPath) => {
    const metadataPath = path.join(repoPath, 'metadata', 'io', 'metadata', 'domain', 'metadata.json');
    if (!exists(metadataPath)) {
        return {};
    }
    
    try {
        const content = fs.readFileSync(metadataPath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        Ec.warn(`⚠ 无法解析 metadata.json: ${error.message}`);
        return {};
    }
};

/**
 * 获取目录的备注信息
 */
const _getDirectoryNote = (dirName, metadata) => {
    if (!metadata || typeof metadata !== 'object') {
        return '';
    }
    
    // 尝试多种可能的键名格式
    const possibleKeys = [
        dirName,
        dirName.toLowerCase(),
        dirName.toUpperCase(),
        path.basename(dirName)
    ];
    
    for (const key of possibleKeys) {
        if (metadata[key] && typeof metadata[key] === 'object' && metadata[key].note) {
            return metadata[key].note;
        }
        if (metadata[key] && typeof metadata[key] === 'string') {
            return metadata[key];
        }
    }
    
    return '';
};

/**
 * 按目录组织 MD 文件
 */
const _organizeByDirectory = (files, metadata = {}) => {
    const dirMap = new Map();
    
    for (const file of files) {
        const dir = path.dirname(file);
        if (!dirMap.has(dir)) {
            dirMap.set(dir, []);
        }
        dirMap.get(dir).push(file);
    }
    
    return Array.from(dirMap.entries()).map(([dir, files]) => {
        const dirName = path.basename(dir);
        const note = _getDirectoryNote(dirName, metadata);
        return {
            name: dirName,
            path: dir,
            files: files,
            note: note
        };
    });
};

/**
 * 显示规范列表表格（四列：identifier, name, table, alias）
 */
const _displaySpecsTable = (specs) => {
    if (specs.length === 0) {
        return;
    }
    
    const identifierWidth = 20;
    const nameWidth = 25;
    const tableWidth = 25;
    const aliasWidth = 20;
    
    console.log('');
    console.log('─'.repeat(95));
    console.log(' 规范列表'.green.bold);
    console.log('─'.repeat(95));
    
    const header = `  ${'Identifier'.padEnd(identifierWidth)}│${'Name'.padEnd(nameWidth)}│${'Table'.padEnd(tableWidth)}│${'Alias'.padEnd(aliasWidth)}`;
    console.log(header.cyan);
    console.log('─'.repeat(95));
    
    specs.forEach((spec, index) => {
        const identifier = (spec.identifier || '').substring(0, identifierWidth).padEnd(identifierWidth);
        const name = (spec.name || '').substring(0, nameWidth).padEnd(nameWidth);
        const table = (spec.table || '').substring(0, tableWidth).padEnd(tableWidth);
        const alias = (spec.alias || '').substring(0, aliasWidth).padEnd(aliasWidth);
        console.log(`  ${identifier}│${name}│${table}│${alias}`);
    });
    
    console.log('─'.repeat(95));
    console.log('');
};

/**
 * 从 body 中提取 SQL 内容
 */
const _extractSqlContent = (body) => {
    if (!body || !body.trim()) {
        return null;
    }
    
    // 查找 SQL 代码块
    const sqlBlockMatch = body.match(/```(?:sql|mysql)?\s*\n([\s\S]*?)\n```/i);
    if (sqlBlockMatch) {
        return sqlBlockMatch[1].trim();
    }
    
    // 如果没有代码块，尝试查找 CREATE TABLE 语句
    const createTableMatch = body.match(/(CREATE\s+TABLE[\s\S]*?;)/i);
    if (createTableMatch) {
        return createTableMatch[1].trim();
    }
    
    // 如果都没有，返回整个 body（可能整个文件就是 SQL）
    return body.trim();
};

module.exports = async (options) => {
    try {
        const projectDir = process.cwd();
        
        // 1. 检查 git 命令
        if (!_isCommandAvailable('git')) {
            Ec.error('❌ 未找到 git 命令');
            Ec.waiting('请先安装 Git');
            process.exit(1);
        }
        
        // 2. 确保 .r2mo/repo 在 .gitignore 中（与 domain/mmr2 共享目录一致）
        const gitignorePath = path.join(projectDir, '.gitignore');
        if (exists(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            const lines = content.split('\n');
            const hasEntry = lines.some(line => line.trim() === GITIGNORE_ENTRY);
            if (!hasEntry) {
                const newContent = content.endsWith('\n') || content === ''
                    ? content + GITIGNORE_ENTRY + '\n'
                    : content + '\n' + GITIGNORE_ENTRY + '\n';
                fs.writeFileSync(gitignorePath, newContent);
            }
        } else {
            fs.writeFileSync(gitignorePath, GITIGNORE_ENTRY + '\n');
        }
        
        // 3. 克隆或更新仓库
        const repoPath = await _cloneOrUpdateRepository(projectDir);
        
        // 4. 扫描所有 MD 文件
        Ec.waiting('正在扫描 Markdown 文件...');
        const allMdFiles = _scanMarkdownFiles(repoPath);
        
        if (allMdFiles.length === 0) {
            Ec.error('❌ 未找到任何 Markdown 文件');
            process.exit(1);
        }
        
        Ec.info(`✓ 找到 ${allMdFiles.length} 个 Markdown 文件`);
        
        // 5. 解析所有 MD 文件
        Ec.waiting('正在解析文件...');
        const specs = [];
        for (const file of allMdFiles) {
            const spec = _parseMarkdownFile(file);
            if (spec) {
                specs.push(spec);
            }
        }
        
        if (specs.length === 0) {
            Ec.error('❌ 未找到有效的规范文件（需要包含 name, java, table, sql 字段）');
            process.exit(1);
        }
        
        Ec.info(`✓ 找到 ${specs.length} 个有效规范`);
        
        // 6. 加载 metadata.json
        const metadata = _loadMetadata(repoPath);
        
        // 7. 按目录组织并显示目录清单
        const dirs = _organizeByDirectory(specs.map(s => s.filePath), metadata);
        
        // 显示目录表格（包含备注）
        console.log('');
        console.log('─'.repeat(100));
        console.log(' 目录列表'.green.bold);
        console.log('─'.repeat(100));
        
        const nameWidth = Math.max('目录名'.length, ...dirs.map(d => d.name.length));
        const fileCountWidth = Math.max('文件数'.length, 8);
        const noteWidth = 40;
        
        const header = `  ${'目录名'.padEnd(nameWidth)}│${'文件数'.padEnd(fileCountWidth)}│${'备注'.padEnd(noteWidth)}`;
        console.log(header.cyan);
        console.log('─'.repeat(100));
        
        dirs.forEach((dir, idx) => {
            const name = dir.name.padEnd(nameWidth);
            const fileCount = `${dir.files.length} 个文件`.padEnd(fileCountWidth);
            const note = (dir.note || '').substring(0, noteWidth).padEnd(noteWidth);
            console.log(`  ${name}│${fileCount}│${note}`);
        });
        
        console.log('─'.repeat(100));
        console.log('');
        
        const dirItems = dirs.map((dir, idx) => ({
            name: `${dir.name.padEnd(nameWidth)}│${`${dir.files.length} 个文件`.padEnd(fileCountWidth)}│${(dir.note || '').substring(0, noteWidth).padEnd(noteWidth)}`,
            description: '',
            index: idx,
            dir: dir
        }));
        
        // 一级菜单：选择目录（组）
        const selectedDir = await selectSingle(dirItems, '请选择目录（组）');
        if (selectedDir === null || selectedDir === undefined) {
            Ec.warn('已取消操作');
            process.exit(0);
        }
        
        // 获取该目录下的所有规范
        const dirSpecs = dirs[selectedDir.index].files.map(file => 
            specs.find(s => s.filePath === file)
        ).filter(Boolean);
        
        if (dirSpecs.length === 0) {
            Ec.warn('该目录下没有有效的规范文件');
            process.exit(0);
        }
        
        // 二级菜单：显示该组中的所有模型，让用户选择
        _displaySpecsTable(dirSpecs);
        
        const specItems = dirSpecs.map((spec, idx) => ({
            name: `${(spec.identifier || '').padEnd(20)}│${(spec.name || '').padEnd(25)}│${(spec.table || '').padEnd(25)}│${(spec.alias || '').padEnd(20)}`,
            description: '',
            index: idx
        }));
        
        const selected = await selectMultiple(specItems, `请选择要安装的规范（可多选）- 组: ${dirs[selectedDir.index].name}`);
        
        // 处理退出情况
        if (!selected || (selected.indices && selected.indices.length === 0) || 
            (Array.isArray(selected) && selected.length === 0)) {
            Ec.warn('已取消操作');
            process.exit(0);
        }
        
        // 处理返回格式
        let selectedSpecs = [];
        if (selected.indices && Array.isArray(selected.indices)) {
            selectedSpecs = selected.indices.map(idx => dirSpecs[idx]).filter(Boolean);
        } else if (Array.isArray(selected)) {
            selectedSpecs = selected.map(item => {
                if (typeof item === 'object' && item.index !== undefined) {
                    return dirSpecs[item.index];
                }
                return null;
            }).filter(Boolean);
        } else {
            Ec.error('❌ 无效的选择结果');
            process.exit(1);
        }
        
        Ec.info(`✓ 已选择 ${selectedSpecs.length} 个规范`);
        
        // 7. 解析 pom.xml 获取 artifactId
        const pomPath = path.join(projectDir, 'pom.xml');
        if (!exists(pomPath)) {
            Ec.error('❌ 当前目录未找到 pom.xml');
            Ec.waiting('请确保在 Maven 项目根目录执行此命令');
            process.exit(1);
        }
        
        const artifactId = _parsePomXml(pomPath);
        if (!artifactId) {
            Ec.error('❌ 无法从 pom.xml 中提取 artifactId');
            process.exit(1);
        }
        
        Ec.info(`✓ 项目 ID: ${artifactId}`);
        
        // 8. 检查 domain 模块
        const domainModulePath = path.join(projectDir, `${artifactId}-domain`);
        if (!exists(domainModulePath)) {
            Ec.error(`❌ 未找到 ${artifactId}-domain 模块`);
            Ec.waiting('请先创建 domain 模块');
            process.exit(1);
        }
        
        // 9. 创建 SQL 文件目录
        const sqlDir = path.join(domainModulePath, 'src', 'main', 'resources', 'plugins', artifactId, 'flyway', 'MYSQL');
        await fsAsync.mkdir(sqlDir, { recursive: true });
        
        Ec.info(`✓ SQL 文件目录: ${sqlDir}`);
        
        // 10. 处理每个选中的规范，生成 SQL 文件
        for (const spec of selectedSpecs) {
            Ec.waiting(`正在处理: ${spec.name} (${spec.table})...`);
            
            // 从 body 中提取 SQL 内容
            const sqlContent = _extractSqlContent(spec.body);
            
            if (!sqlContent) {
                Ec.warn(`⚠ ${spec.name} 未找到 SQL 内容，跳过`);
                continue;
            }
            
            // 生成 SQL 文件名：{sql属性}__{表名}.sql
            const sqlFileName = `${spec.sql}__${spec.table}.sql`;
            const sqlFilePath = path.join(sqlDir, sqlFileName);
            
            // 检查文件是否已存在
            const fileExists = exists(sqlFilePath);
            
            // 写入 SQL 文件
            await fsAsync.writeFile(sqlFilePath, sqlContent, 'utf8');
            
            if (fileExists) {
                Ec.info(`✓ 已覆盖: ${sqlFileName}`.yellow);
            } else {
                Ec.info(`✓ 已生成: ${sqlFileName}`.green);
            }
        }
        
        Ec.info('🎉 所有 SQL 文件生成完成！');
        process.exit(0);
        
    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
};
