const path = require('path');
const fs = require('fs').promises;
const Ec = require('../epic');
const Args = require('../utils/mxt-args');

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

const _detectProjectType = async (basePath, projectName, skipMkdir = false) => {
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
        if (!skipMkdir) {
            await fs.mkdir(uiPath, { recursive: true });
        }
        return { type: 'DPA', targetDir: uiPath };
    }

    return { type: 'ONE', targetDir: basePath };
};

// 目录与说明（与 R2MO 规范模版一致）
const SPEC_DIRS = [
    [".r2mo/", "R2MO 规范工程根目录"],
    [".r2mo/requirements/", "项目需求（含 project.md、模版）"],
    [".r2mo/requirements/modules/", "模块需求，下挂 modules/{id}/proposal.md"],
    [".r2mo/pages/", "页面需求与设计，下挂 pages/{id}/proposal.md、spec.md、*.html"],
    [".r2mo/design/", "全局设计规范（spec.md、模版 spec-page.md）"],
    [".r2mo/domain/", "数据模型 · Protobuf 3（*.proto）"],
    [".r2mo/api/", "API 规范根目录"],
    [".r2mo/api/components/schemas/", "数据模型 · OpenAPI"],
    [".r2mo/api/operations/", "接口规范 · OpenAPI（{uri}/*.md）"]
];

/** @returns {Array<[string,string]>} 实际创建的目录列表 [path, desc] */
const _ioDirectory = async (baseDir) => {
    const created = [];
    for (const [folder, desc] of SPEC_DIRS) {
        Ec.waiting(`创建目录: ${folder}  → ${desc}`);
        const directory = path.resolve(baseDir, folder);
        try {
            await fs.mkdir(directory, { recursive: true });
            created.push([folder, desc]);
            const files = await fs.readdir(directory);
            if (files.length === 0) {
                const placeholderPath = path.join(directory, '.placeholder');
                await fs.writeFile(placeholderPath, '');
                Ec.waiting(`  占位: ${folder}.placeholder`);
            }
        } catch (error) {
            if (process.platform === 'win32') {
                Ec.waiting(`💡 Windows 用户提示: 创建目录失败，可能是由于权限不足或路径包含非法字符`);
            }
            throw error;
        }
    }
    return created;
};

/** project.md、design/spec.md 存在且内容与模版不同时仅跳过覆盖并打印，不做交互 */
const MD_COMPARE_SKIP_PATHS = ['.r2mo/requirements/project.md', '.r2mo/design/spec.md'];

/** 规范化字符串便于比对（统一换行、去除末尾空行） */
const _normalizeMdForCompare = (s) => (s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();

/** @returns {Array<string>} 实际拷贝的模版文件路径（相对 .r2mo 父级） */
const _copyTemplates = async (targetDir) => {
    const templateBasePath = path.resolve(__dirname, '../_template/SPEC');
    const copied = [];

    try {
        const entries = await fs.readdir(templateBasePath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const sourceDir = path.join(templateBasePath, entry.name);
                const destDir = path.resolve(targetDir, '.r2mo', entry.name);

                await fs.mkdir(destDir, { recursive: true });

                const files = await fs.readdir(sourceDir, { withFileTypes: true });

                for (const file of files) {
                    if (file.isFile()) {
                        const sourceFile = path.join(sourceDir, file.name);
                        const targetFile = path.join(destDir, file.name);
                        const relPath = `.r2mo/${entry.name}/${file.name}`;

                        const fileExists = await fs.access(targetFile).then(() => true).catch(() => false);

                        if (fileExists && MD_COMPARE_SKIP_PATHS.includes(relPath)) {
                            const templateContent = await fs.readFile(sourceFile, 'utf8');
                            const existingContent = await fs.readFile(targetFile, 'utf8');
                            if (_normalizeMdForCompare(existingContent) !== _normalizeMdForCompare(templateContent)) {
                                Ec.waiting(`  跳过（内容已变更）: ${relPath}`);
                                continue;
                            }
                        }
                        // 除 project.md、design/spec.md 外，其他路径直接覆盖（模版优先）

                        const content = await fs.readFile(sourceFile, 'utf8');
                        await fs.writeFile(targetFile, content, 'utf8');
                        copied.push(relPath);
                        Ec.waiting(`  拷贝: ${relPath}`);
                    }
                }
            }
        }
    } catch (error) {
        Ec.warn(`模板拷贝失败（可忽略）: ${error.message}`);
    }
    return copied;
};

// 模版用途说明（仅说明各模版后续会被拷贝到哪，并非本次已执行的操作）
const TEMPLATE_USAGE = [
    ['.r2mo/requirements/project-module.md', '模版，后续拷贝到 requirements/modules/{id}/proposal.md'],
    ['.r2mo/requirements/project-page.md', '模版，后续拷贝到 pages/{id}/proposal.md'],
    ['.r2mo/design/spec-page.md', '模版，后续拷贝到 pages/{id}/spec.md']
];

const _printTemplateUsage = () => {
    Ec.info('模版用途说明（上述模版在新建模块/页面时会被拷贝到以下位置，并非本次已执行）：');
    TEMPLATE_USAGE.forEach(([relPath, usage]) => {
        console.log(`  ${relPath.padEnd(42)} → ${usage}`);
    });
    console.log('');
};

/** 创建完成后的单独打印：只打实际创建过的目录、实际拷贝过的模版，再打模版用途说明 */
const _printCreatedResult = (targetDir, createdDirs, copiedFiles) => {
    console.log('');
    Ec.info('-------- 创建结果 --------');
    Ec.info('目标目录: ' + targetDir);
    console.log('');
    Ec.info('已创建目录：');
    (createdDirs || []).forEach(([folder, desc]) => {
        console.log(`  ${folder.padEnd(42)} # ${desc}`);
    });
    console.log('');
    Ec.info('已拷贝模版（本次实际拷贝到 .r2mo 下的文件）：');
    (copiedFiles || []).forEach((relPath) => {
        console.log('  ' + relPath);
    });
    console.log('');
    _printTemplateUsage();
};

/** 有参数、未创建文件时的统一打印：列举当前参数，将创建的目录与将拷贝的模版，再打模版用途说明 */
const _printPreviewResult = (targetDir, dirValue) => {
    console.log('');
    Ec.info('-------- 说明（未创建任何目录与文件）--------');
    Ec.info('当前参数：');
    console.log('  -d, --dir  ' + (dirValue != null && dirValue !== '' ? dirValue : '.'));
    console.log('');
    Ec.info('目标路径: ' + targetDir);
    console.log('');
    Ec.info('将创建的目录：');
    SPEC_DIRS.forEach(([folder, desc]) => {
        console.log(`  ${folder.padEnd(42)} # ${desc}`);
    });
    console.log('');
    Ec.info('将拷贝的模版（实际会拷贝到 .r2mo 下的文件）：');
    console.log('  .r2mo/requirements/project.md');
    console.log('  .r2mo/requirements/project-module.md');
    console.log('  .r2mo/requirements/project-page.md');
    console.log('  .r2mo/design/spec.md');
    console.log('  .r2mo/design/spec-page.md');
    console.log('');
    _printTemplateUsage();
    Ec.info('✅ 说明输出完成。执行 mxt init（无 -d）将实际创建上述目录与文件。');
    console.log('');
};

module.exports = (options) => {
    try {
        const opts = Args.parseStandard(options);
        const dirArg = Args.parseOptional('dir', 'd');
        const directory = opts.dir || opts.d || '.';
        const basePath = path.resolve(process.cwd(), directory);
        const previewOnly = dirArg.hasFlag;

        if (previewOnly) {
            Ec.waiting('【仅打印】已传入 -d 参数，不创建目录，仅输出目标路径与结构说明。');
        }
        Ec.waiting(`准备在目录 "${basePath}" 中初始化 R2MO 规范目录...`);

        _getProjectName(basePath)
            .then(async (projectName) => {
                if (projectName) {
                    Ec.waiting(`检测到 Maven 项目: ${projectName}`);
                }

                const { type, targetDir } = await _detectProjectType(basePath, projectName, previewOnly);

                if (type === 'DPA') {
                    Ec.waiting(`项目类型: DPA / Domain, Provider, Api 经典架构`);
                    Ec.waiting(`目标目录: ${targetDir}`);
                } else {
                    Ec.waiting(`项目类型: ONE / 独立项目`);
                    Ec.waiting(`目标目录: ${targetDir}`);
                }

                if (previewOnly) {
                    _printPreviewResult(targetDir, dirArg.value);
                    process.exit(0);
                    return;
                }

                const createdDirs = await _ioDirectory(targetDir);
                return { targetDir, createdDirs };
            })
            .then(async (result) => {
                if (previewOnly) return;
                const { targetDir, createdDirs } = result;
                const copiedFiles = await _copyTemplates(targetDir);

                Ec.info('✅ R2MO 规范目录初始化完成！');
                _printCreatedResult(targetDir, createdDirs, copiedFiles);
                process.exit(0);
            })
            .catch((error) => {
                Ec.error('R2MO 规范目录初始化失败: ' + error.message);
                process.exit(1);
            });
    } catch (e) {
        Ec.error(e.message);
        process.exit(1);
    }
};
