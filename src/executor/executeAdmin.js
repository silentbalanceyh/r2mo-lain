const path = require('path');
const fs = require('fs').promises;
const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const { parseFile, exists } = require('../utils/mxt-file-utils');

const MXT_TEMPLATE_DIR = path.resolve(__dirname, '../_template/MXT');

const _readTemplate = async (filename) => {
    const p = path.join(MXT_TEMPLATE_DIR, filename);
    if (!exists(p)) return null;
    return fs.readFile(p, 'utf8');
};

/** 仅当目标文件不存在时写入，避免覆盖已有菜单/配置/yaml 等 */
const _writeIfNotExists = async (filePath, content) => {
    if (exists(filePath)) return false;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content || '', 'utf8');
    return true;
};

const _applyModulePlaceholders = (content, module) => {
    if (!content) return content;
    return content
        .replace(/\{module\}/gi, module.code || '')
        .replace(/\{module_id\}/gi, module.id || '')
        .replace(/\{module_name\}/gi, (module.name || '').replace(/"/g, '\\"'))
        .replace(/MOD_SYS_ADMIN/g, (module.id || 'MOD_SYS_ADMIN').toUpperCase().replace(/-/g, '_'))
        .replace(/sys-admin/g, module.code || 'sys-admin')
        .replace(/系统管理模块/g, module.name || '系统管理模块')
        .replace(/\/sys-admin/g, `/${module.code || 'sys-admin'}`)
        .replace(/useSysAdmin/g, `use${(module.code || 'sys-admin').split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`)
        .replace(/sysadmin/g, (module.code || 'sysadmin').replace(/-/g, ''));
};

const _applyPagePlaceholders = (content, module, pageId, pageName, routeOverride) => {
    if (!content) return content;
    const routePath = routeOverride != null
        ? routeOverride
        : (module ? `/${module.code}/${pageId}` : `/${pageId}`);
    return content
        .replace(/\{PAGE_ID\}/g, (pageId || '').toUpperCase().replace(/-/g, '_'))
        .replace(/\{MODULE_ID\}/g, module ? module.id : 'PERSONAL')
        .replace(/\{Page Name\}/g, pageName || pageId || '')
        .replace(/\{page_code\}/g, pageId || '')
        .replace(/\{page-name\}/g, pageId || '')
        .replace(/\{route_path\}/g, routePath)
        .replace(/\{ComponentName\}/g, (pageId || 'Page').split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(''))
        .replace(/page-name/g, (pageId || 'page-name').replace(/\//g, '-'));
};

const _getProjectName = async (basePath) => {
    try {
        const pomPath = path.join(basePath, 'pom.xml');
        const content = await fs.readFile(pomPath, 'utf8');
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

    const domainExists = await fs.access(domainPath).then(() => true).catch(() => false);
    const providerExists = await fs.access(providerPath).then(() => true).catch(() => false);
    const apiExists = await fs.access(apiPath).then(() => true).catch(() => false);

    if (domainExists && providerExists && apiExists) {
        const uiPath = path.join(basePath, `${projectName}-ui`);
        return { type: 'DPA', targetDir: uiPath };
    }

    return { type: 'ONE', targetDir: basePath };
};

const _parseProjectFile = async (targetDir) => {
    const projectFilePath = path.join(targetDir, '.r2mo/requirements/project.md');
    
    if (!await fs.access(projectFilePath).then(() => true).catch(() => false)) {
        throw new Error(`项目需求文件不存在: ${projectFilePath}`);
    }

    const content = await fs.readFile(projectFilePath, 'utf8');
    const parsed = parseFile(projectFilePath);
    
    if (!parsed) {
        throw new Error('解析项目需求文件失败');
    }

    return parsed;
};

const _extractModules = (parsed) => {
    const content = parsed.body;
    const modules = [];

    const moduleRegex = /###\s+[^\n]+?\s+\/\s+`mod-([a-z0-9-]+)`/g;
    let match;
    
    while ((match = moduleRegex.exec(content)) !== null) {
        const moduleName = match[1];
        const fullText = match[0];
        const titleMatch = fullText.match(/###\s+([^\n]+)/);
        const title = titleMatch ? titleMatch[1].trim() : moduleName;
        
        modules.push({
            id: `mod-${moduleName}`,
            name: title,
            code: moduleName
        });
    }

    return modules;
};

const _getTechStack = (parsed) => {
    const content = parsed.body;
    const techStack = {};

    const frameworkMatch = content.match(/- 核心框架\s+`(.+?)`/);
    if (frameworkMatch) {
        techStack.framework = frameworkMatch[1];
    }

    const langMatch = content.match(/- 核心语言\s+`(.+?)`/);
    if (langMatch) {
        techStack.language = langMatch[1];
    }

    return techStack;
};

const _getFileExtension = (techStack) => {
    const framework = techStack.framework || '';
    const language = techStack.language || '';

    if (framework.includes('React') || framework.includes('Next.js')) {
        return '.jsx';
    }
    if (framework.includes('Vue')) {
        return '.vue';
    }
    if (framework.includes('Angular')) {
        return '.component.ts';
    }
    if (framework.includes('Tauri + Leptos') || language.includes('Rust')) {
        return '.rs';
    }
    if (framework.includes('Svelte')) {
        return '.svelte';
    }
    if (framework.includes('Flutter')) {
        return '.dart';
    }

    return '.tsx';
};

const _createPageStructure = async (baseDir, modules, fileExt) => {
    const pageTypes = [
        { id: 'dashboard', name: '模块首页' },
        { id: 'manage-list', name: '管理首页（列表）' },
        { id: 'manage-tree', name: '管理首页（树形）' },
        { id: 'manage-add', name: '添加页' },
        { id: 'manage-edit', name: '编辑页' },
        { id: 'manage-view', name: '详情页' },
        { id: 'settings', name: '配置页' }
    ];

    const srcPagesDir = path.join(baseDir, 'src', 'pages');
    await fs.mkdir(srcPagesDir, { recursive: true });

    const metadataTpl = await _readTemplate('metadata.yaml');
    const requirementModuleTpl = await _readTemplate('requirement.module.md');
    const pageYamlTpl = await _readTemplate('page.yaml');
    const requirementPageTpl = await _readTemplate('requirement.page.md');

    Ec.waiting('\n模块页面生成记录：');
    Ec.waiting('=' .repeat(60));

    for (const module of modules) {
        Ec.waiting(`\n模块: ${module.name} (${module.id})`);
        Ec.waiting(`  代码: ${module.code}`);

        const moduleDir = path.join(srcPagesDir, module.code);
        await fs.mkdir(moduleDir, { recursive: true });

        const metadataPath = path.join(moduleDir, 'metadata.yaml');
        const metadataContent = metadataTpl ? _applyModulePlaceholders(metadataTpl, module) : '';
        Ec.waiting((await _writeIfNotExists(metadataPath, metadataContent)) ? '  ✓ 拷贝模版: metadata.yaml' : '  ○ 跳过(已存在): metadata.yaml');

        if (requirementModuleTpl) {
            const reqModulePath = path.join(moduleDir, 'requirement.module.md');
            const reqModuleContent = _applyModulePlaceholders(requirementModuleTpl, module);
            Ec.waiting((await _writeIfNotExists(reqModulePath, reqModuleContent)) ? '  ✓ 拷贝模版: requirement.module.md' : '  ○ 跳过(已存在): requirement.module.md');
        }

        for (const pageType of pageTypes) {
            const pageDir = path.join(moduleDir, pageType.id);
            await fs.mkdir(pageDir, { recursive: true });

            const pageYamlPath = path.join(pageDir, 'page.yaml');
            const pageYamlContent = pageYamlTpl ? _applyPagePlaceholders(pageYamlTpl, module, pageType.id, pageType.name) : '';
            Ec.waiting((await _writeIfNotExists(pageYamlPath, pageYamlContent)) ? `  ✓ 拷贝模版: ${pageType.id}/page.yaml (${pageType.name})` : `  ○ 跳过(已存在): ${pageType.id}/page.yaml`);

            if (requirementPageTpl) {
                const reqPagePath = path.join(pageDir, 'requirement.page.md');
                const reqPageContent = _applyPagePlaceholders(requirementPageTpl, module, pageType.id, pageType.name);
                Ec.waiting((await _writeIfNotExists(reqPagePath, reqPageContent)) ? `  ✓ 拷贝模版: ${pageType.id}/requirement.page.md` : `  ○ 跳过(已存在): ${pageType.id}/requirement.page.md`);
            }
        }
    }

    Ec.waiting('\n' + '='.repeat(60));
};

const _createPersonalPages = async (baseDir) => {
    const personalPages = [
        { path: 'personal/sec-account', name: '账号管理' },
        { path: 'personal/sec-profile', name: '个人信息管理页' },
        { path: 'personal/sec-mfa', name: '双重认证' },
        { path: 'personal/sec-history', name: '登录日志' },
        { path: 'personal/my-tenant', name: '租户信息' },
        { path: 'personal/my-company', name: '公司信息' },
        { path: 'personal/my-dept', name: '部门信息' },
        { path: 'personal/my-employee', name: '员工信息' },
        { path: 'personal/pref-settings', name: '个人设置' },
        { path: 'personal/pref-subscription', name: '我的订阅' },
        { path: 'personal/pref-notify', name: '提醒设置' },
        { path: 'personal/logout', name: '登出系统（占位）' }
    ];

    const personalModule = { id: 'mod-personal', name: '个人中心', code: 'personal' };

    const srcPagesDir = path.join(baseDir, 'src', 'pages');
    const metadataTpl = await _readTemplate('metadata.yaml');
    const requirementModuleTpl = await _readTemplate('requirement.module.md');
    const pageYamlTpl = await _readTemplate('page.yaml');
    const requirementPageTpl = await _readTemplate('requirement.page.md');

    Ec.waiting('\n个人中心模块与页面生成记录：');
    Ec.waiting('=' .repeat(60));
    Ec.waiting(`\n模块: ${personalModule.name} (${personalModule.id})`);
    Ec.waiting(`  代码: ${personalModule.code}`);

    const personalDir = path.join(srcPagesDir, 'personal');
    await fs.mkdir(personalDir, { recursive: true });

    const personalMetadataPath = path.join(personalDir, 'metadata.yaml');
    const metadataContent = metadataTpl ? _applyModulePlaceholders(metadataTpl, personalModule) : '';
    Ec.waiting((await _writeIfNotExists(personalMetadataPath, metadataContent)) ? '  ✓ 拷贝模版: metadata.yaml' : '  ○ 跳过(已存在): metadata.yaml');

    if (requirementModuleTpl) {
        const reqModulePath = path.join(personalDir, 'requirement.module.md');
        const reqModuleContent = _applyModulePlaceholders(requirementModuleTpl, personalModule);
        Ec.waiting((await _writeIfNotExists(reqModulePath, reqModuleContent)) ? '  ✓ 拷贝模版: requirement.module.md' : '  ○ 跳过(已存在): requirement.module.md');
    }

    for (const page of personalPages) {
        const pageDir = path.join(srcPagesDir, page.path);
        await fs.mkdir(pageDir, { recursive: true });
        const pageId = path.basename(page.path);

        const routePath = '/' + page.path.split(path.sep).join('/');
        const pageYamlPath = path.join(pageDir, 'page.yaml');
        const pageYamlContent = pageYamlTpl ? _applyPagePlaceholders(pageYamlTpl, null, pageId, page.name, routePath) : '';
        Ec.waiting((await _writeIfNotExists(pageYamlPath, pageYamlContent)) ? `  ✓ 拷贝模版: ${page.path}/page.yaml (${page.name})` : `  ○ 跳过(已存在): ${page.path}/page.yaml`);

        if (requirementPageTpl) {
            const reqPagePath = path.join(pageDir, 'requirement.page.md');
            const reqPageContent = _applyPagePlaceholders(requirementPageTpl, null, pageId, page.name, routePath);
            Ec.waiting((await _writeIfNotExists(reqPagePath, reqPageContent)) ? `  ✓ 拷贝模版: ${page.path}/requirement.page.md` : `  ○ 跳过(已存在): ${page.path}/requirement.page.md`);
        }
    }

    Ec.waiting('\n' + '='.repeat(60));
};

module.exports = async (options) => {
    try {
        const opts = Args.parseStandard(options);
        const directory = opts.dir || opts.d || '.';
        const basePath = path.resolve(process.cwd(), directory);

        Ec.waiting(`准备在目录 "${basePath}" 中生成前端页面结构...`);

        const projectName = await _getProjectName(basePath);
        
        if (projectName) {
            Ec.waiting(`检测到 Maven 项目: ${projectName}`);
        }

        const { type, targetDir } = await _detectProjectType(basePath, projectName);

        if (type === 'DPA') {
            Ec.waiting(`项目类型: DPA / Domain, Provider, Api 经典架构`);
            Ec.waiting(`目标目录: ${targetDir}`);
        } else {
            Ec.waiting(`项目类型: ONE / 独立项目`);
            Ec.waiting(`目标目录: ${targetDir}`);
        }

        Ec.waiting('\n解析项目需求文档...');
        const projectFilePath = path.join(targetDir, '.r2mo/requirements/project.md');
        Ec.waiting(`  文档路径: ${projectFilePath}`);
        const parsed = await _parseProjectFile(targetDir);
        
        Ec.waiting('提取模块信息...');
        const modules = _extractModules(parsed);
        
        if (modules.length === 0) {
            Ec.warn('未找到任何模块信息');
            process.exit(0);
        }

        Ec.waiting(`找到 ${modules.length} 个模块`);

        Ec.waiting('\n解析技术栈信息...');
        const techStack = _getTechStack(parsed);
        Ec.waiting(`核心框架: ${techStack.framework || '未知'}`);
        Ec.waiting(`核心语言: ${techStack.language || '未知'}`);

        const fileExt = _getFileExtension(techStack);
        Ec.waiting(`文件后缀: ${fileExt}`);

        Ec.waiting('\n开始创建页面目录结构...');
        await _createPageStructure(targetDir, modules, fileExt);

        Ec.waiting('\n开始创建个人中心页面...');
        await _createPersonalPages(targetDir);

        const srcPagesDir = path.join(targetDir, 'src', 'pages');

        Ec.info('\n✅ 前端页面结构生成完成！');
        console.log('');
        Ec.info('生成的目录结构（模版来自 src/_template/MXT）：');
        console.log(`  ${srcPagesDir}/`);
        console.log(`    ├── ${modules.map(m => m.code).join('/\n    ├── ') + '/'}`);
        console.log(`    │   ├── metadata.yaml            # 模块元数据（模版拷贝）`);
        console.log(`    │   ├── requirement.module.md    # 模块需求（模版拷贝）`);
        console.log(`    │   ├── dashboard/page.yaml, requirement.page.md`);
        console.log(`    │   ├── manage-list/page.yaml, requirement.page.md`);
        console.log(`    │   ├── manage-tree/page.yaml, requirement.page.md`);
        console.log(`    │   ├── manage-add/page.yaml, requirement.page.md`);
        console.log(`    │   ├── manage-edit/page.yaml, requirement.page.md`);
        console.log(`    │   ├── manage-view/page.yaml, requirement.page.md`);
        console.log(`    │   └── settings/page.yaml, requirement.page.md`);
        console.log(`    └── personal/`);
        console.log(`        ├── metadata.yaml            # 个人中心模块元数据（模版拷贝）`);
        console.log(`        ├── requirement.module.md    # 个人中心模块需求（模版拷贝）`);
        console.log(`        ├── sec-account/page.yaml, requirement.page.md     # 账号管理`);
        console.log(`        ├── sec-profile/page.yaml, requirement.page.md   # 个人信息`);
        console.log(`        └── ... (其余个人中心页面同上)`);
        console.log('');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message);
        process.exit(1);
    }
};
