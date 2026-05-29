/**
 * mxt openapi：解析各子项目中的 src/main/resources/openapi，提取 Operation/Schema 的 md，
 * 统一拷贝到 -ui/.r2mo/api/ 下（不包含子项目名），保持与源头一致的结构；重复文件名时确认是否覆盖。
 */
const fs = require('fs');
const path = require('path');
const Ec = require('../epic');
const { parseOptional } = require('../utils/mxt-args');
const { exists, ensureDir } = require('../utils/mxt-file-utils');
const fsAsync = require('fs').promises;

const OPENAPI_REL = ['src', 'main', 'resources', 'openapi'];
const R2MO_API_REL = ['.r2mo', 'api'];

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
 * 递归收集目录下所有 .md 文件路径
 */
const _collectMdFiles = (dir) => {
    const list = [];
    if (!exists(dir) || !fs.statSync(dir).isDirectory()) return list;
    const walk = (current) => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(current, e.name);
            if (e.isDirectory()) walk(full);
            else if (e.name.endsWith('.md')) list.push(full);
        }
    };
    walk(dir);
    return list;
};

/**
 * 根据相对路径判断类型：Operation / Schema / 其他
 */
const _mdType = (relPath) => {
    const lower = relPath.toLowerCase();
    if (lower.includes('operation')) return 'Operation';
    if (lower.includes('schema')) return 'Schema';
    return null;
};

/**
 * 规范化相对路径为 / 分隔（便于展示与去重）
 */
const _normalizeRel = (p) => p.split(path.sep).join('/');

module.exports = async (options) => {
    try {
        const dirArg = parseOptional('dir', 'd');
        const targetDir = dirArg.hasFlag && dirArg.value
            ? path.resolve(dirArg.value)
            : process.cwd();

        if (!exists(targetDir) || !fs.statSync(targetDir).isDirectory()) {
            Ec.error(`❌ 目录不存在或不是目录: ${targetDir}`);
            process.exit(1);
        }

        const pomPath = path.join(targetDir, 'pom.xml');
        if (!exists(pomPath)) {
            Ec.error('❌ 当前目录下未找到 pom.xml，请在有根 pom 的项目根目录执行');
            process.exit(1);
        }

        const artifactId = _parsePomXml(pomPath);
        if (!artifactId) {
            Ec.error('❌ 无法从 pom.xml 解析 artifactId');
            process.exit(1);
        }

        const uiDir = path.join(targetDir, `${artifactId}-ui`);
        const apiBase = path.join(uiDir, ...R2MO_API_REL);
        if (!exists(uiDir)) {
            Ec.error(`❌ 未找到 -ui 项目: ${uiDir}`);
            process.exit(1);
        }

        Ec.info(`📋 mxt openapi`);
        Ec.info(`   项目根: ${targetDir}`);
        Ec.info(`   统一输出路径: ${apiBase}（不包含子项目名）`);
        Ec.info('');

        // 子项目：当前目录下直接子目录
        const entries = fs.readdirSync(targetDir, { withFileTypes: true });
        const subprojects = entries
            .filter(e => e.isDirectory())
            .map(e => path.join(targetDir, e.name));

        // 先收集所有 (relPath, mdPath, subName)，统一按 relPath 输出
        const items = [];
        for (const subDir of subprojects) {
            const openapiDir = path.join(subDir, ...OPENAPI_REL);
            if (!exists(openapiDir) || !fs.statSync(openapiDir).isDirectory()) continue;
            const subName = path.basename(subDir);
            const mdFiles = _collectMdFiles(openapiDir);
            for (const mdPath of mdFiles) {
                const rel = path.relative(openapiDir, mdPath);
                items.push({ relPath: _normalizeRel(rel), mdPath, subName });
            }
        }

        // 按 relPath 分组，检测重复
        const byRel = new Map();
        for (const it of items) {
            if (!byRel.has(it.relPath)) byRel.set(it.relPath, []);
            byRel.get(it.relPath).push(it);
        }

        let totalOperation = 0;
        let totalSchema = 0;
        let totalOther = 0;
        let skipped = 0;

        for (const [relPath, sources] of byRel) {
            const destPath = path.join(apiBase, relPath);
            const source = sources[sources.length - 1];
            const needConfirm = sources.length > 1 || exists(destPath);

            if (needConfirm) {
                const msg = sources.length > 1
                    ? `发现重复文件 ${relPath}（来源: ${sources.map(s => s.subName).join(', ')}），是否覆盖？(y/N): `
                    : `发现重复文件 ${relPath}（目标已存在），是否覆盖？(y/N): `;
                const answer = await Ec.ask(msg);
                if (answer.trim().toLowerCase() !== 'y') {
                    skipped++;
                    Ec.info(`   跳过 ${relPath}`);
                    continue;
                }
                if (sources.length > 1) {
                    Ec.warn(`   使用来源: ${source.subName}`);
                }
            }

            await ensureDir(path.dirname(destPath));
            await fsAsync.copyFile(source.mdPath, destPath);

            const type = _mdType(relPath);
            if (type === 'Operation') {
                totalOperation++;
                Ec.info(`   ✓ [Operation] ${relPath}`);
            } else if (type === 'Schema') {
                totalSchema++;
                Ec.info(`   ✓ [Schema] ${relPath}`);
            } else {
                totalOther++;
                Ec.info(`   ✓ ${relPath}`);
            }
        }

        const total = totalOperation + totalSchema + totalOther;
        Ec.info('-'.repeat(40));
        Ec.info(`🎉 处理完成: Operation ${totalOperation}，Schema ${totalSchema}，其他 ${totalOther}，跳过 ${skipped}，共 ${total} 个 md → ${apiBase}`);
        try { Ec.askClose(); } catch (_) {}
        process.exit(0);
    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        try { Ec.askClose(); } catch (_) {}
        process.exit(1);
    }
};
