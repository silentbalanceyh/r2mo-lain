const fs = require('fs');
const path = require('path');
const Ec = require('../epic');
const fsAsync = require('fs').promises;
const { execSync } = require('child_process');
const { parseFile, exists, gitClone, scanDir } = require('../utils/mxt-file-utils');
const { selectSingle, selectMultiple } = require('../utils/mxt-menu');
const { SPEC_REPO_URL, LOCAL_CACHE_DIR, GITIGNORE_ENTRY } = require('../utils/mxt-repo-spec');
require('colors');

// BaseEntity 中已存在的字段（不需要重复生成）
// 注意：需要同时检查下划线命名（SQL 格式）和驼峰命名（Java 格式）
const BASE_ENTITY_FIELDS = new Set([
    // 下划线命名（SQL 格式）
    'id', 'code', 'created_by', 'created_at', 'updated_by', 'updated_at',
    'active', 'language', 'version', 'sigma', 'tenant_id', 'app_id', 'metadata',
    // 驼峰命名（Java 格式）
    'createdBy', 'createdAt', 'updatedBy', 'updatedAt',
    'tenantId', 'appId'
]);

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
        // 获取远程最新 commit
        execSync('git fetch --quiet origin', { cwd: repoPath, stdio: 'ignore', shell: process.platform === 'win32' });
        const remoteCommit = execSync('git rev-parse origin/HEAD', { cwd: repoPath, encoding: 'utf8', shell: process.platform === 'win32' }).trim();
        // 获取本地 commit
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
        // 检查是否是最新的
        Ec.waiting('正在检查仓库状态...');
        if (_isRepositoryUpToDate(repoPath)) {
            Ec.info('✓ 仓库已是最新版本，无需更新');
            return repoPath;
        }
        
        // 需要更新
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
    // 检查是否包含必需的字段
    if (!attrs.name || !attrs.java || !attrs.table) {
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
 * 从 SQL 中提取字段信息
 */
const _extractFieldsFromSql = (sqlContent, tableName) => {
    const fields = [];
    
    if (!sqlContent || !sqlContent.trim()) {
        return fields;
    }
    
    // 查找 CREATE TABLE 语句（支持多种格式）
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?[\w.]+`?\.)?`?(\w+)`?\s*\(([\s\S]+?)\)(?:\s*ENGINE|\s*DEFAULT\s*CHARSET|$)/i;
    const createTableMatch = sqlContent.match(createTableRegex);
    if (!createTableMatch) {
        return fields;
    }
    
    const tableDef = createTableMatch[2];
    // 更智能的分割：考虑括号嵌套和字符串引号
    const parts = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let inComment = false; // 处理行注释
    
    for (let i = 0; i < tableDef.length; i++) {
        const char = tableDef[i];
        const nextChar = i < tableDef.length - 1 ? tableDef[i + 1] : null;
        const prevChar = i > 0 ? tableDef[i - 1] : null;
        
        // 处理行注释 -- 
        if (char === '-' && nextChar === '-' && !inString) {
            // 跳过注释直到行尾
            while (i < tableDef.length && tableDef[i] !== '\n') {
                i++;
            }
            continue;
        }
        
        // 处理字符串引号
        if ((char === '"' || char === "'") && !inString) {
            inString = true;
            stringChar = char;
            current += char;
        } else if (char === stringChar && inString) {
            // 检查是否是转义的引号
            if (nextChar === stringChar) {
                current += char + nextChar;
                i++; // 跳过下一个字符
            } else {
                inString = false;
                stringChar = null;
                current += char;
            }
        } else if (inString) {
            current += char;
        } else if (char === '(') {
            depth++;
            current += char;
        } else if (char === ')') {
            depth--;
            current += char;
        } else if (char === ',' && depth === 0 && !inString) {
            parts.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) {
        parts.push(current.trim());
    }
    
    for (const part of parts) {
        // 移除行注释（-- 开头的注释）
        let trimmed = part.trim();
        const commentIndex = trimmed.indexOf('--');
        if (commentIndex !== -1) {
            trimmed = trimmed.substring(0, commentIndex).trim();
        }
        
        if (!trimmed || 
            trimmed.match(/^(PRIMARY\s+KEY|UNIQUE\s+(?:KEY|INDEX)?|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY)/i)) {
            continue;
        }
        
        // 匹配字段定义：`field_name` 或 field_name TYPE [约束] [COMMENT 'comment']
        // 先提取字段名（支持反引号）
        let fieldNameMatch = trimmed.match(/^`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+/i);
        if (!fieldNameMatch) {
            // 尝试匹配不带反引号的字段名
            fieldNameMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+/i);
        }
        if (!fieldNameMatch) continue;
        
        const fieldName = fieldNameMatch[1];
        
        // 提取字段类型（支持带括号的类型，如 VARCHAR(128)）
        const typeMatch = trimmed.substring(fieldNameMatch[0].length).match(/^(\w+(?:\([^)]+\))?)/i);
        if (!typeMatch) continue;
        
        const fieldType = typeMatch[1].toUpperCase();
        
        // 单独匹配 COMMENT 部分，因为 COMMENT 可能在字段定义的任何位置
        let fullComment = '';
        const commentMatch = trimmed.match(/COMMENT\s+(['"])(.*?)\1/i);
        if (commentMatch) {
            fullComment = commentMatch[2] || '';
        }
        
        // 从 COMMENT 中提取 "-" 之后的中文部分
        // 例如：'「alias」- 别名' -> '别名'
        const extractCommentAfterDash = (text) => {
            if (!text || !text.trim()) return '';
            
            // 查找 "-" 的位置（可能是中文或英文的破折号）
            const dashMatch = text.match(/[-－—]/);
            if (!dashMatch) {
                // 如果没有 "-"，尝试提取所有中文
                const chineseMatch = text.match(/[\u4e00-\u9fa5]+/g);
                return chineseMatch && chineseMatch.length > 0 ? chineseMatch.join('') : '';
            }
            
            // 找到 "-" 的位置
            const dashIndex = dashMatch.index;
            // 提取 "-" 之后的所有内容（跳过破折号字符）
            let afterDash = text.substring(dashIndex + 1);
            // 去除前后空格和可能的其他字符
            afterDash = afterDash.trim();
            
            // 提取中文部分（只提取中文字符，连续的中文字符）
            const chineseMatch = afterDash.match(/[\u4e00-\u9fa5]+/g);
            if (chineseMatch && chineseMatch.length > 0) {
                // 返回第一个匹配的中文部分（通常是描述）
                return chineseMatch[0];
            }
            
            // 如果没有找到中文，返回空字符串
            return '';
        };
        const comment = extractCommentAfterDash(fullComment);
        
        // 跳过 BaseEntity 中已存在的字段
        // 检查下划线命名（SQL 格式）和驼峰命名（Java 格式）
        const fieldNameLower = fieldName.toLowerCase();
        const fieldNameCamel = _toCamelCase(fieldName);
        
        if (BASE_ENTITY_FIELDS.has(fieldName) || 
            BASE_ENTITY_FIELDS.has(fieldNameLower) || 
            BASE_ENTITY_FIELDS.has(fieldNameCamel)) {
            continue;
        }
        
        // 转换 SQL 类型到 Java 类型
        let javaType = 'String';
        let imports = new Set();
        let useTypedUUID = false;
        let existFalse = false;
        
        if (fieldType.match(/INT(?!EGER)/) && !fieldType.includes('BIGINT')) {
            javaType = 'int';
        } else if (fieldType.includes('BIGINT')) {
            javaType = 'Long';
            imports.add('java.lang.Long');
        } else if (fieldType.includes('DECIMAL') || fieldType.includes('NUMERIC') || 
                  fieldType.includes('FLOAT') || fieldType.includes('DOUBLE')) {
            javaType = 'BigDecimal';
            imports.add('java.math.BigDecimal');
        } else if (fieldType.includes('BOOLEAN') || fieldType.match(/TINYINT\s*\(\s*1\s*\)/)) {
            javaType = 'boolean';
        } else if (fieldType.includes('DATE') || fieldType.includes('TIME')) {
            javaType = 'LocalDateTime';
            imports.add('java.time.LocalDateTime');
        } else if (fieldType.includes('UUID') || fieldType.match(/CHAR\s*\(\s*36\s*\)/)) {
            javaType = 'UUID';
            imports.add('java.util.UUID');
            useTypedUUID = true;
        }
        
        // 检查字段名是否包含特殊后缀（如 _id 结尾可能是 UUID）
        if (fieldName.toLowerCase().endsWith('_id') && !useTypedUUID) {
            javaType = 'UUID';
            imports.add('java.util.UUID');
            useTypedUUID = true;
        }
        
        fields.push({
            name: fieldName,
            javaName: _toCamelCase(fieldName),
            type: javaType,
            comment: comment,
            imports: imports,
            useTypedUUID: useTypedUUID,
            existFalse: existFalse
        });
    }
    
    return fields;
};

/**
 * 转换为驼峰命名
 */
const _toCamelCase = (str) => {
    return str.split('_').map((word, index) => {
        if (index === 0) {
            return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join('');
};

/**
 * 转换为 PascalCase
 */
const _toPascalCase = (str) => {
    const camel = _toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
};

/**
 * 查找 Java 包路径（优先查找 domain 包）
 */
const _findJavaPackage = (domainPath) => {
    const javaSrcPath = path.join(domainPath, 'src', 'main', 'java');
    if (!exists(javaSrcPath)) {
        return null;
    }
    
    // 优先查找 domain 包
    const findDomainPackage = (dir, packageParts = []) => {
        const items = fs.readdirSync(dir);
        
        // 先查找 domain 目录
        for (const item of items) {
            const itemPath = path.join(dir, item);
            try {
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory() && item.toLowerCase() === 'domain') {
                    const newParts = [...packageParts, item];
                    // 在 domain 目录中查找 Java 文件来确定完整包路径
                    const found = findDomainPackage(itemPath, newParts);
                    if (found) return found;
                }
            } catch (e) {
                // 忽略错误，继续查找
            }
        }
        
        // 如果当前目录有 Java 文件，返回包路径
        for (const item of items) {
            const itemPath = path.join(dir, item);
            try {
                const stat = fs.statSync(itemPath);
                if (stat.isFile() && item.endsWith('.java')) {
                    return packageParts.length > 0 ? packageParts.join('.') : null;
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        // 递归查找子目录
        for (const item of items) {
            const itemPath = path.join(dir, item);
            try {
                const stat = fs.statSync(itemPath);
                if (stat.isDirectory()) {
                    const newParts = [...packageParts, item];
                    const found = findDomainPackage(itemPath, newParts);
                    if (found) return found;
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        return null;
    };
    
    return findDomainPackage(javaSrcPath);
};

/**
 * 生成 Java Entity 类
 */
const _generateEntityClass = (spec, fields, packageName) => {
    const className = spec.java;
    const tableName = spec.table;
    
    // 收集所有需要的导入
    const imports = new Set([
        'com.baomidou.mybatisplus.annotation.TableField',
        'com.baomidou.mybatisplus.annotation.TableName',
        'io.r2mo.dbe.mybatisplus.core.domain.BaseEntity',
        'io.r2mo.dbe.mybatisplus.core.typehandler.TypedUUIDHandler',
        'io.swagger.v3.oas.annotations.media.Schema',
        'lombok.Data',
        'lombok.EqualsAndHashCode'
    ]);
    
    // 添加字段需要的导入
    fields.forEach(field => {
        field.imports.forEach(imp => imports.add(imp));
    });
    
    // 检查是否需要 BigDecimal
    if (fields.some(f => f.type === 'BigDecimal')) {
        imports.add('java.math.BigDecimal');
    }
    
    // 检查是否需要 UUID
    if (fields.some(f => f.type === 'UUID')) {
        imports.add('java.util.UUID');
    }
    
    // 检查是否需要 LocalDateTime
    if (fields.some(f => f.type === 'LocalDateTime')) {
        imports.add('java.time.LocalDateTime');
    }
    
    // 生成导入语句
    const importStatements = Array.from(imports).sort().map(imp => `import ${imp};`).join('\n');
    
    // 生成字段代码
    const fieldStatements = fields.map(field => {
        const comment = field.comment ? `\n    /**\n     * ${field.comment}\n     */` : '';
        // Schema description 使用提取的中文注释，如果没有则使用字段的 Java 名称
        const schemaDescription = field.comment || field.javaName;
        const schemaAnnotation = `    @Schema(description = "${schemaDescription}")`;
        
        // 生成 TableField 注解，设置列名 value 属性
        let tableFieldAnnotation = '';
        const tableFieldValue = `value = "${field.name}"`;
        
        if (field.useTypedUUID) {
            tableFieldAnnotation = `\n    @TableField(${tableFieldValue}, typeHandler = TypedUUIDHandler.class)`;
        } else if (field.existFalse) {
            tableFieldAnnotation = `\n    @TableField(${tableFieldValue}, exist = false)`;
        } else {
            tableFieldAnnotation = `\n    @TableField(${tableFieldValue})`;
        }
        
        const fieldDef = `    private ${field.type} ${field.javaName};`;
        
        const annotations = [schemaAnnotation, tableFieldAnnotation];
        
        return `${comment}\n${annotations.join('')}\n${fieldDef}`;
    }).join('\n\n');
    
    // 获取当前日期
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // 生成完整的类代码
    // 类级别的 @Schema 使用 alias
    const schemaName = spec.alias || spec.name;
    const classCode = `package ${packageName};

${importStatements}

/**
 * @author lang : ${dateStr}
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("${tableName}")
@Schema(name = "${schemaName}")
public class ${className} extends BaseEntity {

${fieldStatements}
}
`;
    
    return classCode;
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
    
    // 固定列宽
    const identifierWidth = 20;
    const nameWidth = 25;
    const tableWidth = 25;
    const aliasWidth = 20;
    
    // 计算实际需要的宽度（用于截断过长的内容）
    const maxIdentifierLen = Math.max('Identifier'.length, ...specs.map(s => (s.identifier || '').length));
    const maxNameLen = Math.max('Name'.length, ...specs.map(s => (s.name || '').length));
    const maxTableLen = Math.max('Table'.length, ...specs.map(s => (s.table || '').length));
    const maxAliasLen = Math.max('Alias'.length, ...specs.map(s => (s.alias || '').length));
    
    // 表头
    console.log('');
    console.log('─'.repeat(95));
    console.log(' 规范列表'.green.bold);
    console.log('─'.repeat(95));
    
    // 表头行
    const header = `  ${'Identifier'.padEnd(identifierWidth)}│${'Name'.padEnd(nameWidth)}│${'Table'.padEnd(tableWidth)}│${'Alias'.padEnd(aliasWidth)}`;
    console.log(header.cyan);
    console.log('─'.repeat(95));
    
    // 数据行
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

module.exports = async (options) => {
    try {
        const projectDir = process.cwd();
        
        // 1. 检查 git 命令
        if (!_isCommandAvailable('git')) {
            Ec.error('❌ 未找到 git 命令');
            Ec.waiting('请先安装 Git');
            process.exit(1);
        }
        
        // 2. 确保 .r2mo/repo 在 .gitignore 中（与 domain/mmr0 共享目录一致）
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
        
        // 3. 扫描所有 MD 文件
        Ec.waiting('正在扫描 Markdown 文件...');
        const allMdFiles = _scanMarkdownFiles(repoPath);
        
        if (allMdFiles.length === 0) {
            Ec.error('❌ 未找到任何 Markdown 文件');
            process.exit(1);
        }
        
        Ec.info(`✓ 找到 ${allMdFiles.length} 个 Markdown 文件`);
        
        // 4. 解析所有 MD 文件
        Ec.waiting('正在解析文件...');
        const specs = [];
        for (const file of allMdFiles) {
            const spec = _parseMarkdownFile(file);
            if (spec) {
                specs.push(spec);
            }
        }
        
        if (specs.length === 0) {
            Ec.error('❌ 未找到有效的规范文件（需要包含 name, java, table 字段）');
            process.exit(1);
        }
        
        Ec.info(`✓ 找到 ${specs.length} 个有效规范`);
        
        // 5. 加载 metadata.json
        const metadata = _loadMetadata(repoPath);
        
        // 6. 按目录组织并显示目录清单
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
        
        // 6. 解析 pom.xml 获取 artifactId
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
        
        // 7. 检查 domain 模块
        const domainModulePath = path.join(projectDir, `${artifactId}-domain`);
        if (!exists(domainModulePath)) {
            Ec.error(`❌ 未找到 ${artifactId}-domain 模块`);
            Ec.waiting('请先创建 domain 模块');
            process.exit(1);
        }
        
        // 8. 查找 domain 包
        const packageName = _findJavaPackage(domainModulePath);
        if (!packageName) {
            Ec.error('❌ 未找到 domain 包');
            Ec.waiting('请先创建 domain 包结构');
            process.exit(1);
        }
        
        const domainPackagePath = packageName.replace(/\./g, path.sep);
        const domainJavaPath = path.join(domainModulePath, 'src', 'main', 'java', domainPackagePath);
        
        if (!exists(domainJavaPath)) {
            Ec.error(`❌ 未找到 domain 包目录: ${domainJavaPath}`);
            Ec.waiting('请先创建 domain 包目录');
            process.exit(1);
        }
        
        Ec.info(`✓ 找到 domain 包: ${packageName}`);
        
        // 9. 处理每个选中的规范
        for (const spec of selectedSpecs) {
            Ec.waiting(`正在处理: ${spec.name} (${spec.java})...`);
            
            // 从 SQL 中提取字段
            const fields = _extractFieldsFromSql(spec.body, spec.table);
            
            if (fields.length === 0) {
                Ec.warn(`⚠ ${spec.name} 未找到字段信息，跳过`);
                continue;
            }
            
            // 生成 Entity 类
            const classCode = _generateEntityClass(spec, fields, packageName);
            
            // 写入文件
            const javaFilePath = path.join(domainJavaPath, `${spec.java}.java`);
            const fileExists = exists(javaFilePath);
            
            await fsAsync.writeFile(javaFilePath, classCode, 'utf8');
            
            if (fileExists) {
                Ec.info(`✓ 已覆盖: ${spec.java}.java`.yellow);
            } else {
                Ec.info(`✓ 已生成: ${spec.java}.java`.green);
            }
        }
        
        Ec.info('🎉 所有规范处理完成！');
        process.exit(0);
        
    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
};
