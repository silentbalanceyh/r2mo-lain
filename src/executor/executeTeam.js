/**
 * mxt team [-d <dir>]
 * 判断当前项目的 DPA 架构位置，从架构位置对特殊项目写入 .r2mo/mxt.yaml（metadata.role）。
 * 父项目：Team Leader，并在 API、UI 创建；API：Backend Actor；UI：Frontend Actor。
 * -domain / -provider 目录目前不支持。
 */
const path = require('path');
const fsAsync = require('fs').promises;
const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const { exists, ensureDir } = require('../utils/mxt-file-utils');

const ROLE_PARENT = 'Team Leader';
const ROLE_API = 'Backend Actor';
const ROLE_UI = 'Frontend Actor';

const MXT_YAML = '.r2mo/mxt.yaml';

/** 从 pom.xml 解析 artifactId（排除 parent 节点） */
const _getProjectName = async (basePath) => {
    try {
        const pomPath = path.join(basePath, 'pom.xml');
        const content = await fsAsync.readFile(pomPath, 'utf8');
        const withoutParent = content.replace(/<parent>[\s\S]*?<\/parent>/gi, '');
        const match = withoutParent.match(/<artifactId>([^<]+)<\/artifactId>/);
        return match && match[1] ? match[1].trim() : null;
    } catch {
        return null;
    }
};

/**
 * 检测当前目录在 DPA 中的位置。
 * 返回 { position: 'parent'|'api'|'ui'|'unsupported', projectName, parentPath, basePath, apiPath?, uiPath? }
 */
const _detectDpaPosition = async (basePath) => {
    const dirname = path.basename(basePath);
    const hasPom = exists(path.join(basePath, 'pom.xml'));
    const parentPath = path.dirname(basePath);

    Ec.waiting(`  📁 当前目录名: ${dirname}`);
    Ec.waiting(`  📄 是否存在 pom.xml: ${hasPom}`);

    // -api：有 pom.xml，目录名以 -api 结尾
    if (dirname.endsWith('-api') && hasPom) {
        const projectName = dirname.slice(0, -4);
        Ec.waiting(`  🎯 判定: 位于 -api 模块（项目名: ${projectName}）`);
        return {
            position: 'api',
            projectName,
            parentPath,
            basePath,
            apiPath: basePath
        };
    }

    // -ui：无 pom.xml，目录名以 -ui 结尾
    if (dirname.endsWith('-ui') && !hasPom) {
        const projectName = dirname.slice(0, -3);
        Ec.waiting(`  🎯 判定: 位于 -ui 模块（项目名: ${projectName}）`);
        return {
            position: 'ui',
            projectName,
            parentPath,
            basePath,
            uiPath: basePath
        };
    }

    // -domain / -provider：有 pom.xml 但不支持
    if ((dirname.endsWith('-domain') || dirname.endsWith('-provider')) && hasPom) {
        Ec.waiting(`  ⛔ 判定: 位于 ${dirname}，当前不支持在此目录执行 mxt team`);
        return { position: 'unsupported', projectName: null, parentPath, basePath };
    }

    // 父项目候选：有 pom.xml，且无 -domain/-api/-ui/-provider 后缀
    if (hasPom && !dirname.endsWith('-domain') && !dirname.endsWith('-provider') && !dirname.endsWith('-api') && !dirname.endsWith('-ui')) {
        const projectName = await _getProjectName(basePath);
        Ec.waiting(`  📋 从 pom.xml 解析 artifactId: ${projectName || '(无)'}`);

        if (!projectName) {
            Ec.waiting(`  ⛔ 判定: 无法识别为 DPA 父项目（无 artifactId）`);
            return { position: 'unsupported', projectName: null, parentPath, basePath };
        }

        const domainPath = path.join(basePath, `${projectName}-domain`);
        const providerPath = path.join(basePath, `${projectName}-provider`);
        const apiPath = path.join(basePath, `${projectName}-api`);
        const uiPath = path.join(basePath, `${projectName}-ui`);

        const domainExists = await fsAsync.access(domainPath).then(() => true).catch(() => false);
        const providerExists = await fsAsync.access(providerPath).then(() => true).catch(() => false);
        const apiExists = await fsAsync.access(apiPath).then(() => true).catch(() => false);
        const uiExists = await fsAsync.access(uiPath).then(() => true).catch(() => false);

        Ec.waiting(`  📦 子模块存在情况: -domain=${domainExists}, -provider=${providerExists}, -api=${apiExists}, -ui=${uiExists}`);

        if (domainExists && providerExists && apiExists && uiExists) {
            Ec.waiting(`  🎯 判定: 位于 DPA 父项目根目录`);
            return {
                position: 'parent',
                projectName,
                parentPath: basePath,
                basePath,
                apiPath,
                uiPath
            };
        }

        Ec.waiting(`  ⛔ 判定: 非完整 DPA 结构，当前不支持`);
        return { position: 'unsupported', projectName, parentPath: basePath, basePath };
    }

    // 其他：无 pom 且非 -ui，或无法识别
    Ec.waiting(`  ⛔ 判定: 无法识别为 DPA 架构下的角色目录（需在父项目、-api 或 -ui 下执行）`);
    return { position: 'unsupported', projectName: null, parentPath, basePath };
};

/** 向指定目录写入 .r2mo/mxt.yaml（metadata.role） */
const _writeMXTYaml = async (targetDir, role) => {
    const yaml = require('js-yaml');
    const r2moDir = path.join(targetDir, '.r2mo');
    const filePath = path.join(r2moDir, 'mxt.yaml');
    await ensureDir(r2moDir);
    const content = yaml.dump({ metadata: { role } }, { lineWidth: -1 });
    await fsAsync.writeFile(filePath, content, 'utf8');
    Ec.waiting(`  ✏️ 已写入: ${filePath} (role: ${role})`);
};

module.exports = async (options) => {
    try {
        const opts = Args.parseStandard(options);
        const dir = opts.dir || opts.d || '.';
        const basePath = path.resolve(process.cwd(), dir);

        Ec.waiting('🔍 检索目录（DPA 架构位置检测）：');
        Ec.waiting(`  📌 解析目标: -d / --dir = "${dir}"`);
        Ec.waiting(`  📂 绝对路径: ${basePath}`);

        if (!exists(basePath)) {
            Ec.error(`⛔ 目录不存在: ${basePath}`);
            process.exit(1);
        }

        const stat = await fsAsync.stat(basePath);
        if (!stat.isDirectory()) {
            Ec.error(`⛔ 不是目录: ${basePath}`);
            process.exit(1);
        }
        Ec.waiting(`  📁 类型: 目录`);

        const detected = await _detectDpaPosition(basePath);

        if (detected.position === 'unsupported') {
            Ec.error('⛔ 当前目录不在 DPA 支持的角色下（请在父项目根目录、-api 或 -ui 目录中执行 mxt team）；-domain / -provider 暂不支持。');
            process.exit(1);
        }

        Ec.waiting('');
        Ec.waiting('📝 写入 .r2mo/mxt.yaml：');

        if (detected.position === 'parent') {
            await _writeMXTYaml(detected.basePath, ROLE_PARENT);
            await _writeMXTYaml(detected.apiPath, ROLE_API);
            await _writeMXTYaml(detected.uiPath, ROLE_UI);
            Ec.info('\n✅ 已在父项目、API、UI 目录创建 .r2mo/mxt.yaml（角色: 👑 Team Leader / 🔧 Backend Actor / 🎨 Frontend Actor）');
        } else if (detected.position === 'api') {
            await _writeMXTYaml(detected.apiPath, ROLE_API);
            Ec.info('\n✅ 已在当前 API 目录创建 .r2mo/mxt.yaml（角色: 🔧 Backend Actor）');
        } else if (detected.position === 'ui') {
            await _writeMXTYaml(detected.uiPath, ROLE_UI);
            Ec.info('\n✅ 已在当前 UI 目录创建 .r2mo/mxt.yaml（角色: 🎨 Frontend Actor）');
        }

        process.exit(0);
    } catch (e) {
        Ec.error(e.message);
        process.exit(1);
    }
};
