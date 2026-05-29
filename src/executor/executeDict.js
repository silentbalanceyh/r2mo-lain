/**
 * mxt dict [-d <dir>] [-r]
 * 正向：从 schemas + 业务库导出字典到 targetDir/.r2mo/data/dbdict/
 * 逆向 -r：以 .r2mo/data/dbdict 的 yaml 为输入，在 -domain 或当前项目 flyway 目录下生成 SQL 脚本
 */
const path = require('path');
const fs = require('fs');
const fsAsync = require('fs').promises;
const Ec = require('../epic');
const { parseOptional, parseBool } = require('../utils/mxt-args');
const { exists, ensureDir, parseFile } = require('../utils/mxt-file-utils');

/** 懒加载可选依赖，缺失时自动执行 npm install -g 并重试，仍失败则返回 null */
const _requireOptional = (moduleName, installHint) => {
    const pkg = installHint || moduleName.split('/')[0];
    const tryRequire = () => {
        try {
            return require(moduleName);
        } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND' || (e.message && e.message.includes('Cannot find module'))) {
                return null;
            }
            throw e;
        }
    };
    let mod = tryRequire();
    if (mod !== null) return mod;
    Ec.waiting(`未找到模块 ${moduleName}，正在全局安装: npm install -g ${pkg}`);
    try {
        const { execSync } = require('child_process');
        execSync(`npm install -g ${pkg}`, { stdio: 'inherit', shell: process.platform === 'win32' });
    } catch (installErr) {
        Ec.warn(`全局安装失败: ${installErr.message}`);
        return null;
    }
    mod = tryRequire();
    if (mod === null) {
        Ec.warn(`安装后仍无法加载 ${moduleName}，Node 可能未使用全局模块路径，请在本项目执行: npm install ${pkg}`);
    }
    return mod;
};

const R2MO_API_SCHEMAS_REL = ['.r2mo', 'api', 'components', 'schemas'];
const R2MO_DBDICT_REL = ['.r2mo', 'data', 'dbdict'];
const GITIGNORE_UNIGNORE_DBDICT = ['.r2mo/data/', '.r2mo/data/dbdict/'];
const APP_ENV_FILE = '.r2mo/app.env';
const TABLE_TABULAR = 'X_TABULAR';
const TABLE_CATEGORY = 'X_CATEGORY';
const TYPE_FIELD = 'TYPE';

/** 数据库列名（UPPER_SNAKE）转 Schema 属性名（camelCase） */
const _snakeToCamel = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str
        .split('_')
        .map((part, i) => (i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
        .join('');
};

/** camelCase 转 UPPER_SNAKE（逆向写 SQL 列名用） */
const _camelToSnake = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toUpperCase();
};

/** 从 Schema .md 中解析 properties 下的属性名列表（顺序与 Schema 一致） */
const _parseSchemaProperties = (schemasDir, entityName) => {
    const mdPath = path.join(schemasDir, `${entityName}.md`);
    if (!exists(mdPath)) return [];
    const content = fs.readFileSync(mdPath, 'utf8');
    const blockMatch = content.match(/```yaml\s*\n[\s\S]*?properties:\s*\n([\s\S]*?)```/);
    if (!blockMatch) return [];
    const propsSection = blockMatch[1] || '';
    const names = [];
    propsSection.split('\n').forEach((line) => {
        const m = line.match(/^\s{2}(\w+):\s*$/);
        if (m) names.push(m[1]);
    });
    return names;
};

/** 从行对象中取 TYPE 字段（列名可能为 TYPE 或 type） */
const _getTypeFromRow = (row) => {
    if (!row || typeof row !== 'object') return '';
    const key = Object.keys(row).find((k) => k.toUpperCase() === 'TYPE');
    const v = key ? row[key] : row[TYPE_FIELD];
    return v != null ? String(v).trim() : '';
};

/** Schema 中布尔类型属性名（DB 可能返回 Buffer/0|1） */
const BOOLEAN_PROPS = new Set(['active', 'leaf']);

/** 将 DB 行转为 Schema 属性名键的对象；若提供 schemaPropList 则仅包含其中属性且按该顺序，否则全部键转为 camelCase；值做序列化处理 */
const _rowToSchemaShape = (row, schemaPropList) => {
    if (!row || typeof row !== 'object') return row;
    const normalize = (v, prop) => {
        if (BOOLEAN_PROPS.has(prop)) {
            if (v == null) return v;
            if (Buffer.isBuffer(v)) return v[0] ? true : false;
            if (typeof v === 'number') return v ? true : false;
            if (typeof v === 'boolean') return v;
            return v ? true : false;
        }
        if (typeof v === 'bigint') return Number(v);
        if (v instanceof Date) return v.toISOString();
        return v;
    };
    const propSet = schemaPropList.length > 0 ? new Set(schemaPropList) : null;
    const out = {};
    if (schemaPropList.length > 0) {
        for (const prop of schemaPropList) {
            const dbKey = Object.keys(row).find((k) => _snakeToCamel(k) === prop);
            if (dbKey !== undefined) out[prop] = normalize(row[dbKey], prop);
        }
    } else {
        for (const [dbKey, v] of Object.entries(row)) {
            out[_snakeToCamel(dbKey)] = normalize(v, _snakeToCamel(dbKey));
        }
    }
    return out;
};

const _getProjectName = async (basePath) => {
    try {
        const pomPath = path.join(basePath, 'pom.xml');
        const content = await fsAsync.readFile(pomPath, 'utf8');
        const withoutParent = content.replace(/<parent>[\s\S]*?<\/parent>/gi, '');
        const match = withoutParent.match(/<artifactId>([^<]+)<\/artifactId>/);
        return match && match[1] ? match[1].trim() : null;
    } catch (error) {
        return null;
    }
};

const _detectProjectType = async (basePath, projectName) => {
    if (!projectName) {
        return { type: 'ONE', targetDir: basePath };
    }
    const domainPath = path.join(basePath, `${projectName}-domain`);
    const providerPath = path.join(basePath, `${projectName}-provider`);
    const apiPath = path.join(basePath, `${projectName}-api`);
    const domainExists = await fsAsync.access(domainPath).then(() => true).catch(() => false);
    const providerExists = await fsAsync.access(providerPath).then(() => true).catch(() => false);
    const apiExists = await fsAsync.access(apiPath).then(() => true).catch(() => false);
    if (domainExists && providerExists && apiExists) {
        return { type: 'DPA', targetDir: path.join(basePath, `${projectName}-ui`) };
    }
    return { type: 'ONE', targetDir: basePath };
};

/** 解析单行 export KEY="value" 或 KEY='value'，支持行末 # 注释；返回 [key, value] 或 null */
const _parseExportLine = (line) => {
    const m = line.match(/^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\n]*)["']?\s*(#.*)?$/);
    return m ? [m[1], m[2].trim()] : null;
};

/** 找到 app.env 则 source 到当前进程环境（逐行 export 写入 process.env） */
const _sourceAppEnv = (appEnvPath) => {
    if (!exists(appEnvPath)) return false;
    const content = fs.readFileSync(appEnvPath, 'utf8');
    const lines = (content || '').split(/\r?\n/);
    for (const line of lines) {
        const parsed = _parseExportLine(line);
        if (parsed) process.env[parsed[0]] = parsed[1];
    }
    return true;
};

/** 输出完成后，将 .r2mo/data/dbdict 从 .gitignore 中移除（添加否定规则，使该目录可被提交） */
const _ensureDbdictNotIgnored = (projectDir) => {
    const gitignorePath = path.join(projectDir, '.gitignore');
    try {
        let content = exists(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
        const lines = content.split('\n');
        let changed = false;
        for (const entry of GITIGNORE_UNIGNORE_DBDICT) {
            const negated = '!' + entry;
            if (!lines.some((line) => line.trim() === negated)) {
                const newContent = content.endsWith('\n') || content === ''
                    ? content + negated + '\n'
                    : content + '\n' + negated + '\n';
                content = newContent;
                changed = true;
            }
        }
        if (changed) {
            fs.writeFileSync(gitignorePath, content);
            Ec.waiting('已将 .r2mo/data/dbdict 从 .gitignore 中移除（可被版本管理）');
        }
    } catch (e) {
        Ec.warn(`更新 .gitignore 失败: ${e.message}`);
    }
};

/** 从当前环境变量读取业务数据库连接配置；Z_DBS_INSTANCE 未设置则返回 null */
const _getDbConfigFromEnv = () => {
    const dbInstance = process.env.Z_DBS_INSTANCE;
    if (!dbInstance || !dbInstance.trim()) return null;
    return {
        host: process.env.Z_DB_HOST || '127.0.0.1',
        port: parseInt(process.env.Z_DB_PORT || '3306', 10),
        user: process.env.Z_DB_APP_USER || '',
        password: process.env.Z_DB_APP_PASS || '',
        database: dbInstance.trim()
    };
};

// ---------- 逆向 -r：dbdict yaml -> flyway SQL ----------

/** 递归查找包含 .sql 的 flyway 目录（优先 MYSQL，其次任意含 .sql 的目录） */
const _findFlywaySqlDir = (startDir, maxDepth = 6) => {
    const search = (dir, depth) => {
        if (depth > maxDepth) return null;
        if (!exists(dir) || !fs.statSync(dir).isDirectory()) return null;
        const lower = dir.toLowerCase();
        if (lower.includes('flyway') && (lower.includes('mysql') || path.basename(dir) === 'MYSQL')) {
            try {
                const files = fs.readdirSync(dir);
                if (files.some((f) => f.endsWith('.sql'))) return dir;
            } catch (e) {}
        }
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                if (!e.isDirectory()) continue;
                const next = path.join(dir, e.name);
                const found = search(next, depth + 1);
                if (found) return found;
            }
        } catch (e) {}
        return null;
    };
    return search(startDir, 0);
};

/** 在 flyway 目录中查找与 tableName + typeLabel 匹配的 SQL 文件，返回 { sqlFile, sqlPath } 或 null */
const _findMatchingSqlFile = (flywaySqlDir, tableName, typeLabel) => {
    if (!exists(flywaySqlDir)) return null;
    const safeType = (typeLabel || '').replace(/\s+/g, '.');
    const suffix = `.${tableName}.${safeType}.sql`;
    const files = fs.readdirSync(flywaySqlDir).filter((f) => f.endsWith('.sql') && f.endsWith(suffix));
    if (files.length === 0) return null;
    const sqlFile = files[0];
    const sqlPath = path.resolve(flywaySqlDir, sqlFile);
    return { sqlFile, sqlPath };
};

/** 从 flyway 目录中解析已有 SQL 文件名（匹配表名+type），取最大版本号并返回下一段 */
const _nextSqlVersion = (flywaySqlDir, tableName, typeLabel) => {
    if (!exists(flywaySqlDir)) return '001.000.001';
    const files = fs.readdirSync(flywaySqlDir).filter((f) => f.endsWith('.sql'));
    const safeType = (typeLabel || '').replace(/\s+/g, '.');
    const versionRe = new RegExp(`^R__([\\d.]+)\\.${tableName}\\.${safeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.sql$`, 'i');
    let maxThird = 0;
    const fallbackRe = new RegExp(`^R__([\\d.]+)\\.${tableName}\\.`, 'i');
    for (const f of files) {
        let m = f.match(versionRe);
        if (!m && safeType) m = f.match(fallbackRe);
        if (m) {
            const parts = m[1].split('.').map(Number);
            const third = parts.length >= 3 ? parts[2] : 0;
            if (third > maxThird) maxThird = third;
        }
    }
    const nextThird = maxThird + 1;
    return `211.001.${String(nextThird).padStart(3, '0')}`;
};

/** 将 yaml 行数组转为 INSERT IGNORE SQL（camelCase 键转 UPPER_SNAKE，占位符 ${SIGMA}/${TENANT_ID}/${APP_ID}） */
const _yamlRowsToInsertSql = (rows, tableName, typeLabel) => {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const escape = (v) => {
        if (v == null) return 'NULL';
        if (typeof v === 'boolean') return v ? '1' : '0';
        if (typeof v === 'number') return String(v);
        return "'" + String(v).replace(/'/g, "''") + "'";
    };
    const cols = ['ID', 'CODE', 'NAME', 'COMMENT', 'ICON', 'SORT', 'TYPE', 'SIGMA', 'TENANT_ID', 'APP_ID', 'ACTIVE', 'LANGUAGE', 'CREATED_AT', 'CREATED_BY', 'UPDATED_AT', 'UPDATED_BY'];
    const header = `-- =============================================================\n-- 逆向生成: ${tableName} (${typeLabel})\n-- =============================================================\n\nINSERT IGNORE INTO \`${tableName}\` (\n    \`${cols.join('`, `')}\`\n) VALUES\n`;
    const placeholders = "'${SIGMA}', '${TENANT_ID}', '${APP_ID}', 1, 'zh_CN', NOW(), '9a0d5018-33ad-4c64-80bf-8ae7947c482f', NOW(), '9a0d5018-33ad-4c64-80bf-8ae7947c482f'";
    const vals = rows.map((row) => {
        const code = escape(row.code);
        const name = escape(row.name);
        const comment = escape(row.comment);
        const icon = escape(row.icon);
        const sort = row.sort != null ? Number(row.sort) : 0;
        const type = escape(row.type || typeLabel);
        return `(UUID(), ${code}, ${name}, ${comment}, ${icon}, ${sort}, ${type}, ${placeholders})`;
    });
    return header + vals.join(',\n') + ';';
};

module.exports = async () => {
    try {
        const dirArg = parseOptional('dir', 'd');
        const isReverse = parseBool('reverse', 'r');
        const directory = (dirArg.value && dirArg.value.trim()) || '.';
        const basePath = path.resolve(process.cwd(), directory);

        Ec.waiting(`项目根目录: ${basePath}`);

        const projectName = await _getProjectName(basePath);
        if (projectName) Ec.waiting(`检测到 Maven 项目: ${projectName}`);

        const { type, targetDir } = await _detectProjectType(basePath, projectName);

        if (isReverse) {
            const dbdictDir = path.join(targetDir, ...R2MO_DBDICT_REL);
            if (!exists(dbdictDir) || !fs.statSync(dbdictDir).isDirectory()) {
                Ec.warn(`未找到 dbdict 目录: ${dbdictDir}`);
                Ec.warn('逆向 -r 需要 DPA 时 -ui 下或 ONE 时当前项目下存在 .r2mo/data/dbdict');
                process.exit(1);
            }
            Ec.waiting(`dbdict 输入: ${dbdictDir}`);

            const yaml = _requireOptional('js-yaml', 'js-yaml');
            if (!yaml) {
                Ec.warn('需要 js-yaml，请执行: npm install js-yaml');
                process.exit(1);
            }
            const yamlFiles = fs.readdirSync(dbdictDir).filter((f) => f.endsWith('.yaml') && (f.startsWith('dict.') || f.startsWith('tree.')));
            if (yamlFiles.length === 0) {
                Ec.warn(`未找到 dict.*.yaml 或 tree.*.yaml: ${dbdictDir}`);
                process.exit(1);
            }
            const withMetadata = [];
            for (const file of yamlFiles) {
                const fullPath = path.join(dbdictDir, file);
                const parsed = parseFile(fullPath);
                if (!parsed || !parsed.attributes || !parsed.attributes.sqlPath) {
                    Ec.waiting(`跳过（无 metadata）: ${file}`);
                    continue;
                }
                const sqlPath = String(parsed.attributes.sqlPath || '').trim();
                const sqlFile = String(parsed.attributes.sqlFile || path.basename(sqlPath)).trim();
                if (!sqlPath) continue;
                let rows;
                try {
                    rows = yaml.load(parsed.body || '[]');
                } catch (e) {
                    Ec.warn(`跳过 ${file}: 解析 body 失败 ${e.message}`);
                    continue;
                }
                rows = Array.isArray(rows) ? rows : (rows && rows.items ? rows.items : []);
                if (!rows.length) continue;
                const isTree = file.startsWith('tree.');
                const tableName = isTree ? TABLE_CATEGORY : TABLE_TABULAR;
                const typeLabel = file.replace(/^(dict|tree)\.|\.yaml$/gi, '').trim() || 'default';
                withMetadata.push({ file, fullPath, sqlFile, sqlPath, rows, tableName, typeLabel });
            }
            if (withMetadata.length === 0) {
                Ec.warn('未找到含有 sqlPath 元数据的 yaml 文件，逆向跳过');
                process.exit(0);
            }
            Ec.info(`检测到 ${withMetadata.length} 个 yaml 含有 SQL 路径元数据`);
            try {
                const answer = await Ec.ask('是否全覆盖已存在的 SQL 文件？(y/N): ');
                if (!/^y|yes$/i.test((answer || '').trim())) {
                    Ec.waiting('已取消覆盖');
                    process.exit(0);
                }
            } catch (e) {
                Ec.waiting('已取消');
                process.exit(0);
            }
            const written = [];
            for (const item of withMetadata) {
                const sqlContent = _yamlRowsToInsertSql(item.rows, item.tableName, item.typeLabel);
                await fsAsync.writeFile(item.sqlPath, sqlContent, 'utf8');
                written.push({ rel: item.sqlFile, full: item.sqlPath });
                Ec.waiting(`  ✓ 覆盖: ${item.sqlFile}`);
            }
            console.log('');
            Ec.info('-------- 逆向已覆盖的 flyway SQL --------');
            written.forEach(({ rel }) => Ec.info('  ' + rel));
            Ec.info(`✅ 共覆盖 ${written.length} 个 SQL`);
            console.log('');
            process.exit(0);
        }

        if (type === 'DPA') {
            Ec.waiting('项目类型: DPA / Domain, Provider, Api 经典架构');
            Ec.waiting(`目标目录（.r2mo/data/dbdict 落点）: ${targetDir}`);
            Ec.waiting('数据库配置来源: x-api/.r2mo/app.env');
        } else {
            Ec.waiting('项目类型: ONE / 独立项目');
            Ec.waiting(`目标目录（.r2mo/data/dbdict 落点）: ${targetDir}`);
            Ec.waiting('数据库配置来源: 当前项目根 .r2mo/app.env');
        }

        const schemasDir = path.join(targetDir, ...R2MO_API_SCHEMAS_REL);
        if (!exists(schemasDir) || !fs.statSync(schemasDir).isDirectory()) {
            Ec.warn(`未找到 .r2mo/api/components/schemas 目录: ${schemasDir}`);
            Ec.warn('请先执行 mxt mod 确保 .r2mo/api 下已有 XTabular、XCategory 等 schema');
        } else {
            Ec.waiting(`字典结构目录: ${schemasDir}`);
        }

        const appEnvPath = type === 'DPA' && projectName
            ? path.join(basePath, `${projectName}-api`, APP_ENV_FILE)
            : path.join(basePath, APP_ENV_FILE);
        if (_sourceAppEnv(appEnvPath)) {
            Ec.waiting(`已 source: ${appEnvPath}`);
        } else {
            Ec.warn(`未找到 app.env: ${appEnvPath}`);
        }
        const dbConfig = _getDbConfigFromEnv();
        if (!dbConfig) {
            Ec.warn('环境变量 Z_DBS_INSTANCE 未设置，跳过字典导出（可在 app.env 中配置后重试）');
            process.exit(0);
        }
        Ec.waiting(`业务数据库实例: ${dbConfig.database}`);

        const dbdictDir = path.join(targetDir, ...R2MO_DBDICT_REL);
        await ensureDir(dbdictDir);

        const tabularPropList = _parseSchemaProperties(schemasDir, 'XTabular');
        const categoryPropList = _parseSchemaProperties(schemasDir, 'XCategory');
        if (tabularPropList.length) Ec.waiting(`已解析 XTabular Schema 属性: ${tabularPropList.length} 个`);
        if (categoryPropList.length) Ec.waiting(`已解析 XCategory Schema 属性: ${categoryPropList.length} 个`);

        const mysql = _requireOptional('mysql2/promise', 'mysql2');
        if (!mysql) {
            process.exit(0);
        }
        const conn = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database
        });

        try {
            const tabularRows = await conn.query(`SELECT * FROM ${TABLE_TABULAR}`);
            const categoryRows = await conn.query(`SELECT * FROM ${TABLE_CATEGORY}`);
            const rawTabular = (tabularRows[0] || []);
            const rawCategory = (categoryRows[0] || []);

            const tabularByType = new Map();
            for (const row of rawTabular) {
                const typeVal = _getTypeFromRow(row);
                if (!tabularByType.has(typeVal)) tabularByType.set(typeVal, []);
                tabularByType.get(typeVal).push(_rowToSchemaShape(row, tabularPropList));
            }
            const categoryByType = new Map();
            for (const row of rawCategory) {
                const typeVal = _getTypeFromRow(row);
                if (!categoryByType.has(typeVal)) categoryByType.set(typeVal, []);
                categoryByType.get(typeVal).push(_rowToSchemaShape(row, categoryPropList));
            }

            const yaml = _requireOptional('js-yaml', 'js-yaml');
            if (!yaml) {
                process.exit(0);
            }
            let flywaySqlDir = null;
            if (type === 'DPA' && projectName) {
                const domainPath = path.join(basePath, `${projectName}-domain`);
                flywaySqlDir = _findFlywaySqlDir(domainPath);
            }
            if (!flywaySqlDir) flywaySqlDir = _findFlywaySqlDir(basePath);

            const written = [];
            for (const [typeVal, rows] of tabularByType) {
                const safeType = typeVal || 'default';
                const filePath = path.join(dbdictDir, `dict.${safeType}.yaml`);
                let metadata = null;
                if (flywaySqlDir) metadata = _findMatchingSqlFile(flywaySqlDir, TABLE_TABULAR, safeType);
                const body = yaml.dump(rows, { lineWidth: -1 });
                const content = metadata
                    ? '---\n' + yaml.dump({ sqlFile: metadata.sqlFile, sqlPath: metadata.sqlPath }) + '---\n' + body
                    : body;
                await fsAsync.writeFile(filePath, content, 'utf8');
                written.push({ rel: `dict.${safeType}.yaml`, full: filePath });
            }
            for (const [typeVal, rows] of categoryByType) {
                const safeType = typeVal || 'default';
                const filePath = path.join(dbdictDir, `tree.${safeType}.yaml`);
                let metadata = null;
                if (flywaySqlDir) metadata = _findMatchingSqlFile(flywaySqlDir, TABLE_CATEGORY, safeType);
                const body = yaml.dump(rows, { lineWidth: -1 });
                const content = metadata
                    ? '---\n' + yaml.dump({ sqlFile: metadata.sqlFile, sqlPath: metadata.sqlPath }) + '---\n' + body
                    : body;
                await fsAsync.writeFile(filePath, content, 'utf8');
                written.push({ rel: `tree.${safeType}.yaml`, full: filePath });
            }

            console.log('');
            Ec.info('-------- 已写入 .r2mo/data/dbdict/ 的字典文件 --------');
            written.forEach(({ rel, full }) => Ec.info('  ' + full));
            console.log('');
            Ec.info(`✅ 共写入 ${written.length} 个文件 → 目标目录: ${path.resolve(dbdictDir)}`);
            _ensureDbdictNotIgnored(targetDir);
        } finally {
            await conn.end();
        }

        console.log('');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message || e);
        process.exit(1);
    }
};
