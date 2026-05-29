/**
 * mxt ui -n <name> [-d <dir>] [-u]
 * 从 https://gitee.com/silentbalanceyh/r2mo-ui.git 下载模板，清理无关目录，重写 Cargo.toml 名称；
 * -u 更新模式：同步根 MD、src/pages/components、src/pages/utils，其他有变化的文件多选更新；
 * 不更新 src/{api, context, models, pages, service}。
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fsAsync = require('fs').promises;
const Ec = require('../epic');
const { parseOptional, parseBool } = require('../utils/mxt-args');
const { exists, gitClone, ensureDir, copyDir, createTempDir, cleanup } = require('../utils/mxt-file-utils');
const { selectMultiple } = require('../utils/mxt-menu');

const UI_REPO_URL = 'https://gitee.com/silentbalanceyh/r2mo-ui.git';

// 需要移除的目录和文件（与模板无关）
const REMOVE_ENTRIES = ['.r2mo', 'dist', 'target', '.git', 'Cargo.lock'];

// 更新模式 -u 下跳过的目录（不参与“其他文件”的 MD5 比对与多选更新）
const UPDATE_SKIP_DIRS = ['src/api', 'src/context', 'src/models', 'src/pages', 'src/service', 'src-tauri'];

// 更新模式 -u 下跳过的根文件（Rust/Tauri 环境相关，不参与“其他文件”更新）
const UPDATE_SKIP_ROOT_FILES = ['.gitignore', 'Cargo.lock', 'Cargo.toml', 'Trunk.toml', 'index.html', 'start-web.sh'];

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

const _isValidUiName = (name) => typeof name === 'string' && name.length > 0 && name.endsWith('-ui');

const _confirmCreate = async (name) => {
    try {
        const answer = await Ec.ask(`名称 "${name}" 不符合 xxx-ui 命名规则，是否仍要创建？(y/n): `);
        return /^y|yes$/i.test((answer || '').trim());
    } catch {
        return false;
    }
};

const _removeEntry = async (targetDir, entry) => {
    const fullPath = path.join(targetDir, entry);
    if (!exists(fullPath)) return;
    try {
        const stat = await fsAsync.stat(fullPath);
        if (stat.isDirectory()) {
            await fsAsync.rm(fullPath, { recursive: true, force: true });
        } else {
            await fsAsync.unlink(fullPath);
        }
        Ec.waiting(`已移除: ${entry}`);
    } catch (e) {
        Ec.warn(`移除 ${entry} 失败: ${e.message}`);
    }
};

const _setCargoName = (cargoPath, packageName) => {
    if (!exists(cargoPath)) return;
    let content = fs.readFileSync(cargoPath, 'utf8');
    content = content.replace(/^name\s*=\s*"[^"]*"/m, `name = "${packageName}"`);
    fs.writeFileSync(cargoPath, content);
};

const _fileMd5 = (filePath) => {
    if (!exists(filePath)) return '';
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buf).digest('hex');
};

const _isUnderSkip = (relPath) => {
    const n = relPath.replace(/\\/g, '/');
    if (UPDATE_SKIP_DIRS.some(skip => n === skip || n.startsWith(skip + '/'))) return true;
    const base = path.basename(n);
    if (!n.includes('/') && UPDATE_SKIP_ROOT_FILES.includes(base)) return true;
    return false;
};

const _walkDir = (dir, baseDir, acc = []) => {
    if (!exists(dir)) return acc;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(baseDir, full).replace(/\\/g, '/');
        if (e.isDirectory()) {
            _walkDir(full, baseDir, acc);
        } else {
            acc.push({ relPath: rel, fullPath: full });
        }
    }
    return acc;
};

module.exports = async () => {
    try {
        const nameArg = parseOptional('name', 'n');
        const dirArg = parseOptional('dir', 'd');
        const isUpdate = parseBool('update', 'u');

        const dir = (dirArg.value && dirArg.value.trim()) || '.';
        const basePath = path.resolve(process.cwd(), dir);

        // 更新模式 -u：目标为当前目录（或 -d 指定目录），不要求 -n
        const targetDir = isUpdate
            ? (nameArg.hasFlag && nameArg.value ? path.join(basePath, nameArg.value.trim()) : basePath)
            : (() => {
                if (!nameArg.hasFlag || !nameArg.value) {
                    Ec.error('缺少必需参数: -n <项目名称>');
                    console.log('');
                    console.log('  用法:'.gray);
                    console.log('    mxt ui -n <项目名称> [-d <父目录>]'.cyan);
                    console.log('    mxt ui -u [-d <父目录>]   # 更新模式，目标为当前目录'.cyan);
                    console.log('  示例:'.gray);
                    console.log('    mxt ui -n my-app-ui -d .'.cyan);
                    console.log('    mxt ui -u   # 在当前目录更新'.cyan);
                    console.log('');
                    process.exit(1);
                }
                return path.join(basePath, nameArg.value.trim());
            })();

        const name = nameArg.hasFlag && nameArg.value ? nameArg.value.trim() : '';

        if (isUpdate) {
            if (!exists(targetDir)) {
                Ec.error(`更新模式 -u 要求目标目录已存在: ${targetDir}`);
                process.exit(1);
            }
            Ec.waiting('更新模式：拉取模板并同步根 MD、components、utils...');
            const tempDir = createTempDir('r2mo-ui');
            try {
                gitClone(UI_REPO_URL, tempDir, { shallow: true });
                const templateRoot = tempDir;

                // 1. 根项目下的 MD 文档
                const rootEntries = fs.readdirSync(templateRoot, { withFileTypes: true });
                for (const e of rootEntries) {
                    if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue;
                    const src = path.join(templateRoot, e.name);
                    const dest = path.join(targetDir, e.name);
                    fs.copyFileSync(src, dest);
                    Ec.waiting(`  根 MD: ${e.name}`);
                }

                // 2. src/pages/components/
                const tplComponents = path.join(templateRoot, 'src', 'pages', 'components');
                const dstComponents = path.join(targetDir, 'src', 'pages', 'components');
                if (exists(tplComponents)) {
                    await ensureDir(dstComponents);
                    await copyDir(tplComponents, dstComponents);
                    Ec.waiting('  src/pages/components/ 已同步');
                }

                // 3. src/pages/utils/
                const tplUtils = path.join(templateRoot, 'src', 'pages', 'utils');
                const dstUtils = path.join(targetDir, 'src', 'pages', 'utils');
                if (exists(tplUtils)) {
                    await ensureDir(dstUtils);
                    await copyDir(tplUtils, dstUtils);
                    Ec.waiting('  src/pages/utils/ 已同步');
                }

                // 4. 其他文件：MD5 检查，多选更新（跳过 src/api, context, models, pages, service）
                const allFiles = _walkDir(templateRoot, templateRoot);
                const changed = [];
                for (const { relPath, fullPath } of allFiles) {
                    if (_isUnderSkip(relPath)) continue;
                    const isRootMd = !relPath.includes('/') && relPath.toLowerCase().endsWith('.md');
                    const isComponents = relPath.startsWith('src/pages/components/');
                    const isUtils = relPath.startsWith('src/pages/utils/');
                    if (isRootMd || isComponents || isUtils) continue;
                    const destPath = path.join(targetDir, relPath);
                    if (!exists(destPath)) continue;
                    const md5Tpl = _fileMd5(fullPath);
                    const md5Dst = _fileMd5(destPath);
                    if (md5Tpl !== md5Dst) {
                        changed.push({ name: relPath, relPath, templatePath: fullPath, destPath });
                    }
                }
                if (changed.length > 0) {
                    const result = await selectMultiple(
                        changed.map(c => ({ name: c.relPath, description: '', relPath: c.relPath, templatePath: c.templatePath, destPath: c.destPath })),
                        '以下文件与模板不一致，选择要更新的项（Space 切换 A 全选 N 取消）'
                    );
                    if (result && result.items && result.items.length > 0) {
                        for (const item of result.items) {
                            const destPath = item.destPath || path.join(targetDir, item.name);
                            await ensureDir(path.dirname(destPath));
                            fs.copyFileSync(item.templatePath, destPath);
                            Ec.waiting(`  已更新: ${item.name}`);
                        }
                    }
                }
            } finally {
                await cleanup(tempDir);
            }
            Ec.info('✅ UI 项目更新完成: ' + targetDir);
            console.log('');
            process.exit(0);
        }

        Ec.waiting(`准备在 "${basePath}" 下创建 UI 项目: ${name}`);

        const projectName = await _getProjectName(basePath);
        if (projectName) {
            Ec.waiting(`检测到 Maven 项目: ${projectName}`);
        }

        const { type } = await _detectProjectType(basePath, projectName);
        if (type === 'DPA') {
            Ec.waiting('项目类型: DPA / Domain, Provider, Api 经典架构');
            if (!_isValidUiName(name)) {
                const ok = await _confirmCreate(name);
                if (!ok) {
                    Ec.warn('已取消创建。DPA 结构下建议使用 xxx-ui 命名（如 ' + (projectName ? projectName + '-ui' : 'app-xxx-ui') + '）。');
                    process.exit(0);
                }
            }
        }

        if (exists(targetDir)) {
            Ec.error(`目标目录已存在: ${targetDir}`);
            process.exit(1);
        }

        await ensureDir(path.dirname(targetDir));
        Ec.waiting('正在克隆 r2mo-ui 模板到: ' + targetDir);
        gitClone(UI_REPO_URL, targetDir, { shallow: true });

        for (const entry of REMOVE_ENTRIES) {
            await _removeEntry(targetDir, entry);
        }

        const rootCargo = path.join(targetDir, 'Cargo.toml');
        const tauriCargo = path.join(targetDir, 'src-tauri', 'Cargo.toml');
        const nameBase = name.replace(/-ui$/, '') || name;
        const tauriName = nameBase + '-tauri';
        _setCargoName(rootCargo, name);
        _setCargoName(tauriCargo, tauriName);
        Ec.waiting(`已设置 Cargo.toml: 根 name="${name}", src-tauri name="${tauriName}" (去掉 -ui 后加 -tauri)`);

        Ec.info('✅ UI 项目创建完成: ' + targetDir);
        console.log('');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message || e);
        process.exit(1);
    }
};
