/**
 * mxt menu [-d <dir>]
 * 先按 DPA 检测目标目录，再在 targetDir/src/pages 下扫描所有 menu.yaml，
 * 合并后按 parentId 建树、按 order 排序，打印树型（name, text, icon 同一行）。
 */
const path = require('path');
const fs = require('fs');
const fsAsync = require('fs').promises;
const Ec = require('../epic');
const { parseOptional } = require('../utils/mxt-args');
const { exists, scanDir } = require('../utils/mxt-file-utils');

const PAGES_BASE = 'src/pages';
const MENU_FILE = 'menu.yaml';

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

/** 递归收集目录下所有 menu.yaml 的绝对路径 */
const _collectMenuYamls = (dir) => {
    const results = [];
    if (!exists(dir)) return results;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                results.push(..._collectMenuYamls(full));
            } else if (e.name === MENU_FILE) {
                results.push(full);
            }
        }
    } catch (err) {}
    return results;
};

/** 解析单条 - id: "..." parentId: ... name: "..." 等，返回 { id, parentId, name, text, icon, order } */
const _parseYamlItem = (block) => {
    const item = { order: 0 };
    const lines = block.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    for (const line of lines) {
        const m = line.trim().match(/^(\w+):\s*(.*)$/);
        if (!m) continue;
        const key = m[1];
        let val = m[2].trim().replace(/^["']|["']$/g, '');
        if (val === 'null' || key === 'parentId') {
            item[key] = val === 'null' || val === '' ? null : val;
        } else if (key === 'order' || key === 'level') {
            item[key] = parseInt(val, 10) || 0;
        } else {
            item[key] = val;
        }
    }
    return item.id ? item : null;
};

/** 从文件内容解析出菜单项数组（按 YAML 列表项 - 分块） */
const _parseMenuYamlContent = (content) => {
    const items = [];
    const blocks = content.split(/\n\s*-\s+/).filter((b) => b.trim());
    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const item = _parseYamlItem(trimmed);
        if (item) items.push(item);
    }
    return items;
};

/** 建树：parentId 为 null 的为根，子节点由 _sortTree 按 order 排序 */
const _buildTree = (flat) => {
    const byId = new Map();
    flat.forEach((item) => byId.set(item.id, { ...item, children: [] }));
    const roots = [];
    flat.forEach((item) => {
        const node = byId.get(item.id);
        if (item.parentId == null || item.parentId === '') {
            roots.push(node);
        } else {
            const parent = byId.get(item.parentId);
            if (parent) parent.children.push(node);
            else roots.push(node);
        }
    });
    return roots;
};

/** 递归排序子节点 */
const _sortTree = (nodes) => {
    nodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    nodes.forEach((n) => _sortTree(n.children));
};

/** 递归收集所有节点（扁平），用于计算列宽 */
const _collectFlat = (nodes, out = []) => {
    for (const node of nodes) {
        out.push({ name: String(node.name || ''), icon: String(node.icon || ''), text: String(node.text || '') });
        if (node.children && node.children.length) _collectFlat(node.children, out);
    }
    return out;
};

/** 递归打印树：树形前缀 + name、icon、text 三列对齐，text 在最后 */
const _printTree = (nodes, opts) => {
    const { maxNameLen, maxIconLen, parentPrefix = '', parentHasMore = false } = opts;
    const n = nodes.length;
    nodes.forEach((node, i) => {
        const isLast = i === n - 1 && (!node.children || node.children.length === 0);
        const hasChildren = node.children && node.children.length > 0;
        const branch = isLast && !hasChildren ? '└── ' : '├── ';
        const linePrefix = parentPrefix + branch;
        const name = String(node.name || '');
        const icon = String(node.icon || '');
        const text = String(node.text || '');
        const nameCol = name.padEnd(maxNameLen);
        const iconCol = icon.padEnd(maxIconLen);
        Ec.info(linePrefix + nameCol + '  ' + iconCol + '  ' + text);
        if (hasChildren) {
            const nextPrefix = parentPrefix + (isLast ? '    ' : '│   ');
            _printTree(node.children, { ...opts, parentPrefix: nextPrefix });
        }
    });
};

module.exports = async () => {
    try {
        const dirArg = parseOptional('dir', 'd');
        const directory = (dirArg.value && dirArg.value.trim()) || '.';
        const basePath = path.resolve(process.cwd(), directory);

        Ec.waiting(`项目根目录: ${basePath}`);

        const projectName = await _getProjectName(basePath);
        if (projectName) Ec.waiting(`检测到 Maven 项目: ${projectName}`);

        const { type, targetDir } = await _detectProjectType(basePath, projectName);
        if (type === 'DPA') {
            Ec.waiting('项目类型: DPA / Domain, Provider, Api 经典架构');
            Ec.waiting(`目标目录: ${targetDir}`);
        } else {
            Ec.waiting('项目类型: ONE / 独立项目');
            Ec.waiting(`目标目录: ${targetDir}`);
        }

        const pagesDir = path.join(targetDir, PAGES_BASE);
        if (!exists(pagesDir)) {
            Ec.error(`目录不存在: ${pagesDir}`);
            process.exit(1);
        }

        const yamlPaths = _collectMenuYamls(pagesDir);
        if (yamlPaths.length === 0) {
            Ec.warn(`未在 ${pagesDir} 下找到任何 ${MENU_FILE}`);
            process.exit(0);
        }

        Ec.waiting(`找到 ${yamlPaths.length} 个 ${MENU_FILE}`);

        const allItems = [];
        const seenIds = new Set();
        for (const yamlPath of yamlPaths) {
            const content = await fsAsync.readFile(yamlPath, 'utf8');
            const items = _parseMenuYamlContent(content);
            for (const item of items) {
                if (!seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    allItems.push(item);
                }
            }
        }

        const tree = _buildTree(allItems);
        _sortTree(tree);

        const flat = _collectFlat(tree);
        const maxNameLen = Math.max(16, ...flat.map((x) => x.name.length));
        const maxIconLen = Math.max(8, ...flat.map((x) => x.icon.length));

        console.log('');
        Ec.info('-------- 菜单树 (name | icon | text) --------');
        const headerPrefix = '';
        Ec.info(headerPrefix + 'name'.padEnd(maxNameLen) + '  ' + 'icon'.padEnd(maxIconLen) + '  ' + 'text');
        Ec.info(headerPrefix + ''.padEnd(maxNameLen + 2 + maxIconLen + 2, '─'));
        _printTree(tree, { maxNameLen, maxIconLen });
        console.log('');
        Ec.info('✅ 输出完成');
        console.log('');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message || e);
        process.exit(1);
    }
};
