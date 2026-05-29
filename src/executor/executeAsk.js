const fs = require('fs');
const path = require('path');
const Ec = require('../epic');
const { selectSingle } = require('../utils/mxt-menu');
const { parseFile, exists } = require('../utils/mxt-file-utils');
require('colors');

/**
 * 扫描模板目录，加载所有提示词文件
 * @param {string} templateDir 模板目录路径
 * @returns {Array} 提示词文件列表
 */
const _scanTemplates = (templateDir) => {
    if (!exists(templateDir)) {
        return [];
    }
    
    const files = fs.readdirSync(templateDir);
    const templates = [];
    
    for (const file of files) {
        if (!file.endsWith('.md')) {
            continue;
        }
        
        const filePath = path.join(templateDir, file);
        try {
            if (fs.statSync(filePath).isFile()) {
                const parsed = parseFile(filePath);
                if (parsed && parsed.attributes) {
                    // 从 attributes 中提取 title 和 version
                    // 注意：parseYaml 返回的值可能包含前后空格
                    const title = String(parsed.attributes.title || '').trim() || file.replace('.md', '');
                    const version = String(parsed.attributes.version || '').trim() || '1.0.0';
                    
                    // 读取完整文件内容用于提取 BEGIN/END 之间的内容
                    const fullContent = fs.readFileSync(filePath, 'utf8');
                    
                    const order = parsed.attributes.order != null ? Number(parsed.attributes.order) : NaN;
                    templates.push({
                        file: file,
                        filePath: filePath,
                        title: title,
                        version: version,
                        order: Number.isNaN(order) ? null : order,
                        attributes: parsed.attributes || {},
                        content: fullContent  // 使用完整内容，而不是 parsed.body
                    });
                } else {
                    // 如果解析失败，尝试直接读取文件内容
                    const fullContent = fs.readFileSync(filePath, 'utf8');
                    // 尝试手动解析 front-matter
                    const frontMatterMatch = fullContent.match(/^---\s*\n([\s\S]+?)\n---/);
                    if (frontMatterMatch) {
                        const yamlContent = frontMatterMatch[1];
                        const lines = yamlContent.split('\n');
                        let title = file.replace('.md', '');
                        let version = '1.0.0';
                        
                        for (const line of lines) {
                            const titleMatch = line.match(/^title:\s*(.+)$/);
                            if (titleMatch) {
                                title = titleMatch[1].trim();
                            }
                            const versionMatch = line.match(/^version:\s*(.+)$/);
                            if (versionMatch) {
                                version = versionMatch[1].trim();
                            }
                        }
                        
                        let order = NaN;
                        for (const line of lines) {
                            const orderMatch = line.match(/^order:\s*(.+)$/);
                            if (orderMatch) {
                                order = Number(orderMatch[1].trim());
                                break;
                            }
                        }
                        const manualAttrs = { title, version };
                        if (!Number.isNaN(order)) manualAttrs.order = order;
                        templates.push({
                            file: file,
                            filePath: filePath,
                            title: title,
                            version: version,
                            order: Number.isNaN(order) ? null : order,
                            attributes: manualAttrs,
                            content: fullContent
                        });
                    } else {
                        Ec.warn(`⚠ 无法解析模板文件: ${file} (缺少 front-matter)`);
                    }
                }
            }
        } catch (error) {
            Ec.warn(`⚠ 读取模板文件失败: ${file} - ${error.message}`);
        }
    }
    
    // 排序：优先按 front-matter 的 order 数字，其次按 title 字符串（支持 01-、02- 等前缀）
    templates.sort((a, b) => {
        const oa = a.order != null ? a.order : Infinity;
        const ob = b.order != null ? b.order : Infinity;
        if (oa !== ob) return oa - ob;
        return (a.title || a.file).localeCompare(b.title || b.file, 'zh-CN');
    });
    return templates;
};

/**
 * 提取 --- BEGIN 和 --- END 之间的内容
 * @param {string} content 文件内容
 * @returns {string|null} 提取的内容，如果未找到返回 null
 */
const _extractPromptContent = (content) => {
    const beginMatch = content.indexOf('--- BEGIN');
    const endMatch = content.indexOf('--- END');
    
    if (beginMatch === -1 || endMatch === -1 || endMatch <= beginMatch) {
        return null;
    }
    
    // 提取 BEGIN 之后到 END 之前的内容
    const startPos = content.indexOf('\n', beginMatch) + 1;
    const endPos = endMatch;
    
    if (startPos <= 0 || endPos <= startPos) {
        return null;
    }
    
    return content.substring(startPos, endPos).trim();
};

/**
 * 显示模板列表（表格形式）
 * @param {Array} templates 模板列表
 */
const _displayTemplatesTable = (templates) => {
    if (templates.length === 0) {
        Ec.warn('未找到任何提示词模板');
        return;
    }
    
    // 计算列宽
    const titleWidth = Math.max(
        '标题'.length,
        ...templates.map(t => t.title.length)
    );
    const versionWidth = Math.max(
        '版本'.length,
        ...templates.map(t => t.version.length)
    );
    
    // 表头
    console.log('');
    console.log('─'.repeat(60));
    console.log(' 提示词模板列表'.green.bold);
    console.log('─'.repeat(60));
    
    // 表头行
    const header = `  ${'标题'.padEnd(titleWidth)}  ${'版本'.padEnd(versionWidth)}`;
    console.log(header.cyan);
    console.log('─'.repeat(60));
    
    // 数据行
    templates.forEach((template, index) => {
        const title = template.title.padEnd(titleWidth);
        const version = template.version.padEnd(versionWidth);
        console.log(`  ${title}  ${version}`);
    });
    
    console.log('─'.repeat(60));
    console.log('');
};

/**
 * 创建菜单项列表
 * @param {Array} templates 模板列表
 * @returns {Array} 菜单项列表
 */
const _createMenuItems = (templates) => {
    return templates.map((template, index) => ({
        name: `${template.title} (${template.version})`,
        description: template.file,
        index: index
    }));
};

/** 检测提示词中是否包含「模块：ID,NAME,PATH」占位行 */
const _hasModulePlaceholder = (content) => {
    if (!content || typeof content !== 'string') return false;
    return /模块\s*[：:]\s*ID\s*,\s*NAME\s*,\s*PATH/i.test(content);
};

/**
 * 扫描当前目录 src/pages/{module}/requirement.module.md，解析笔记属性，返回模块清单
 * @param {string} cwd 当前目录（项目根）
 * @returns {Array<{id:string,name:string,path:string,code:string,filePath:string}>}
 */
const _scanModuleRequirements = (cwd) => {
    const pagesDir = path.join(cwd, 'src', 'pages');
    const list = [];
    if (!exists(pagesDir)) return list;
    try {
        const moduleDirs = fs.readdirSync(pagesDir, { withFileTypes: true });
        for (const dirent of moduleDirs) {
            if (!dirent.isDirectory()) continue;
            const reqPath = path.join(pagesDir, dirent.name, 'requirement.module.md');
            if (!exists(reqPath)) continue;
            const parsed = parseFile(reqPath);
            if (!parsed || !parsed.attributes) continue;
            const attrs = parsed.attributes;
            const id = String(attrs.id || attrs.identifier || '').trim().replace(/^"|"$/g, '');
            const name = String(attrs.name || '').trim().replace(/^"|"$/g, '');
            const route = String(attrs.route || '').trim().replace(/^"|"$/g, '');
            const code = String(attrs.code || dirent.name || '').trim().replace(/^"|"$/g, '');
            const pathVal = route || (code ? '/' + code : '');
            if (!id && !name) continue;
            const hasPlaceholder = [id, name, route, code].some((v) => /\{[^}]*\}/.test(String(v)));
            if (hasPlaceholder) continue;
            list.push({
                id: id || code || dirent.name,
                name: name || dirent.name,
                path: pathVal,
                code: code || dirent.name,
                filePath: reqPath
            });
        }
    } catch (e) {
        Ec.warn(`扫描模块配置失败: ${e.message}`);
    }
    return list;
};

/** 将提示词中的「模块：ID,NAME,PATH」占位行替换为选中模块的实际值 */
const _replaceModulePlaceholder = (content, module) => {
    if (!content || !module) return content;
    const lineRe = /^.*模块\s*[：:]\s*ID\s*,\s*NAME\s*,\s*PATH.*$/im;
    const replacement = `模块：${module.id},${module.name},${module.path}`;
    return content.replace(lineRe, replacement);
};

module.exports = async (options) => {
    try {
        // 获取主项目根目录（mxt 命令所在的目录）
        const mainProjectRoot = path.resolve(__dirname, '../..');
        const templateDir = path.join(mainProjectRoot, 'src', '_template', 'R2MO');
        
        // 1. 检查模板目录是否存在
        if (!exists(templateDir)) {
            Ec.error(`❌ 模板目录不存在: ${templateDir}`);
            console.log('');
            Ec.warn('请确保主项目中存在 src/_template/R2MO 目录');
            console.log('');
            process.exit(1);
        }
        
        // 2. 扫描模板文件
        Ec.waiting('正在扫描提示词模板...');
        const templates = _scanTemplates(templateDir);
        
        if (templates.length === 0) {
            Ec.warn('未找到任何提示词模板文件');
            console.log('');
            Ec.info(`请确保在 ${templateDir} 目录中存在 .md 格式的模板文件`);
            console.log('');
            process.exit(1);
        }
        
        Ec.info(`✓ 找到 ${templates.length} 个提示词模板`);
        
        // 3. 显示表格
        _displayTemplatesTable(templates);
        
        // 4. 创建菜单并让用户选择
        const menuItems = _createMenuItems(templates);
        const selectedItem = await selectSingle(menuItems, '请选择提示词模板');
        
        if (selectedItem === null || selectedItem === undefined) {
            Ec.warn('已取消选择');
            process.exit(0);
        }
        
        // 从选中的菜单项中获取索引
        const selectedIndex = selectedItem.index;
        if (selectedIndex === undefined || selectedIndex === null || selectedIndex < 0 || selectedIndex >= templates.length) {
            Ec.error('❌ 无效的选择');
            process.exit(1);
        }
        
        const selectedTemplate = templates[selectedIndex];
        
        if (!selectedTemplate || !selectedTemplate.content) {
            Ec.error('❌ 模板数据无效');
            process.exit(1);
        }
        
        // 5. 提取提示词内容
        let promptContent = _extractPromptContent(selectedTemplate.content);
        
        if (!promptContent) {
            Ec.error(`❌ 无法从模板中提取提示词内容`);
            console.log('');
            Ec.warn('请确保模板文件包含 --- BEGIN 和 --- END 标记');
            console.log('');
            process.exit(1);
        }

        // 5.1 若提示词含「模块：ID,NAME,PATH」占位，从当前目录 src/pages/*/requirement.module.md 拉清单供选择并替换
        if (_hasModulePlaceholder(promptContent)) {
            const cwd = process.cwd();
            const modules = _scanModuleRequirements(cwd);
            if (modules.length > 0) {
                const moduleMenuItems = modules.map((m, idx) => ({
                    name: `${m.name} (${m.id})`,
                    description: m.path || m.code,
                    index: idx,
                    module: m
                }));
                const chosen = await selectSingle(moduleMenuItems, '选择要填入的模块（来自 src/pages/*/requirement.module.md）');
                if (chosen != null && chosen.module) {
                    promptContent = _replaceModulePlaceholder(promptContent, chosen.module);
                    Ec.waiting(`已替换为模块: ${chosen.module.id}, ${chosen.module.name}, ${chosen.module.path}`);
                }
            }
        }
        
        // 6. 复制到剪切板
        try {
            await Ec.outCopy(promptContent);
            Ec.info('✓ 提示词已复制到剪切板');
        } catch (copyError) {
            Ec.warn(`⚠ 复制到剪切板失败: ${copyError.message}`);
            console.log('');
            Ec.info('提示词内容：');
            console.log('─'.repeat(60));
            console.log(promptContent);
            console.log('─'.repeat(60));
            console.log('');
            process.exit(1);
        }
        
        // 7. 显示详细信息（含 skills、commands 等笔记属性，不显示路径）
        const attrLabels = { title: '标题', version: '版本', skill: '技能', skills: '技能', command: '命令', commands: '命令', order: '排序', priority: '优先级', tool: '工具' };
        const printedKeys = new Set(['title', 'version']);
        const _label = (k) => attrLabels[k] || k;
        const _fmt = (v) => (Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v).trim());
        console.log('');
        console.log('─'.repeat(60));
        console.log(' 模板详细信息'.green.bold);
        console.log('─'.repeat(60));
        console.log(` 文件: ${selectedTemplate.file}`);
        console.log(` 标题: ${selectedTemplate.title}`);
        console.log(` 版本: ${selectedTemplate.version}`);
        const attrs = selectedTemplate.attributes || {};
        const knownOrder = ['skill', 'skills', 'command', 'commands', 'order', 'priority', 'tool'];
        for (const k of knownOrder) {
            if (attrs[k] != null && attrs[k] !== '') {
                console.log(` ${_label(k)}: ${_fmt(attrs[k])}`);
                printedKeys.add(k);
            }
        }
        Object.keys(attrs).sort().forEach((k) => {
            if (printedKeys.has(k)) return;
            console.log(` ${_label(k)}: ${_fmt(attrs[k])}`);
        });
        console.log('─'.repeat(60));
        console.log('');
        console.log(' 提示词内容：'.cyan);
        console.log('─'.repeat(60));
        console.log(promptContent);
        console.log('─'.repeat(60));
        console.log('');
        
        Ec.info('🎉 操作完成！');
        console.log('');
        
        process.exit(0);
    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        console.log('');
        process.exit(1);
    }
};
