/**
 * mxt mod [-d <dir>]
 * 1. 从 gitee 下载 r2mo-spec 到 targetDir/.r2mo/repo/r2mo-spec（ONE=当前项目根，DPA=x-ui）
 * 2. 从 r2mo-spec 仓库内的 src/main/resources/openapi/ 拷贝所有内容（含 *.md）到 targetDir/.r2mo/api/
 * 3. 若存在环境变量 ZERO_MODULE，将子模块 .r2mo/domain 下所有 *.proto 拷贝到 targetDir/.r2mo/domain（区分 DPA/ONE）
 */
const path = require('path');
const fs = require('fs');
const fsAsync = require('fs').promises;
const Ec = require('../epic');
const { parseOptional } = require('../utils/mxt-args');
const { exists, ensureDir, gitClone } = require('../utils/mxt-file-utils');
const { SPEC_REPO_URL, LOCAL_CACHE_DIR, GITIGNORE_ENTRY } = require('../utils/mxt-repo-spec');

const OPENAPI_REL = ['src', 'main', 'resources', 'openapi'];
const R2MO_API_REL = ['.r2mo', 'api'];
const R2MO_DOMAIN_REL = ['.r2mo', 'domain'];
const ZERO_MODULE_ENV = 'ZERO_MODULE';

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

const _isRepositoryUpToDate = (repoPath) => {
    try {
        const { execSync } = require('child_process');
        execSync('git fetch --quiet origin', { cwd: repoPath, stdio: 'ignore', shell: process.platform === 'win32' });
        const remoteCommit = execSync('git rev-parse origin/HEAD', { cwd: repoPath, encoding: 'utf8', shell: process.platform === 'win32' }).trim();
        const localCommit = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8', shell: process.platform === 'win32' }).trim();
        return remoteCommit === localCommit;
    } catch (e) {
        return false;
    }
};

const _cloneOrUpdateSpecRepo = async (projectDir) => {
    const repoPath = path.join(projectDir, LOCAL_CACHE_DIR);
    if (exists(repoPath)) {
        Ec.waiting('正在检查 r2mo-spec 仓库状态...');
        if (_isRepositoryUpToDate(repoPath)) {
            Ec.info('✓ 仓库已是最新，无需更新');
            return repoPath;
        }
        try {
            Ec.waiting('正在更新仓库...');
            const { execSync } = require('child_process');
            execSync('git pull --quiet', { cwd: repoPath, stdio: 'ignore', shell: process.platform === 'win32' });
            Ec.info('✓ 仓库已更新');
        } catch (error) {
            Ec.warn('⚠ 更新失败，尝试重新克隆...');
            await fsAsync.rm(repoPath, { recursive: true, force: true });
            Ec.waiting('正在克隆仓库...');
            await fsAsync.mkdir(path.dirname(repoPath), { recursive: true });
            gitClone(SPEC_REPO_URL, repoPath, { shallow: true });
            Ec.info('✓ 仓库已克隆');
        }
    } else {
        Ec.waiting('正在克隆 r2mo-spec 到 .r2mo/repo/r2mo-spec ...');
        await fsAsync.mkdir(path.dirname(repoPath), { recursive: true });
        gitClone(SPEC_REPO_URL, repoPath, { shallow: true });
        Ec.info('✓ 仓库已克隆');
    }
    return repoPath;
};

const _ensureGitIgnore = (projectDir) => {
    const gitignorePath = path.join(projectDir, '.gitignore');
    try {
        let content = '';
        if (exists(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf8');
        }
        const lines = content.split('\n');
        const hasEntry = lines.some((line) => line.trim() === GITIGNORE_ENTRY);
        if (!hasEntry) {
            const newContent = content.endsWith('\n') || content === ''
                ? content + GITIGNORE_ENTRY + '\n'
                : content + '\n' + GITIGNORE_ENTRY + '\n';
            fs.writeFileSync(gitignorePath, newContent);
            Ec.waiting(`已将 ${GITIGNORE_ENTRY} 写入 .gitignore`);
        }
    } catch (e) {
        Ec.warn(`更新 .gitignore 失败: ${e.message}`);
    }
};

/** 递归收集目录下所有文件相对路径（仅文件，不含目录） */
const _collectFiles = (dir, baseDir = dir, list = []) => {
    if (!exists(dir) || !fs.statSync(dir).isDirectory()) return list;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(baseDir, full);
        if (e.isDirectory()) {
            _collectFiles(full, baseDir, list);
        } else {
            list.push(rel);
        }
    }
    return list;
};

/** 递归收集目录下所有 *.proto 文件相对路径 */
const _collectProtoFiles = (dir, baseDir = dir, list = []) => {
    if (!exists(dir) || !fs.statSync(dir).isDirectory()) return list;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(baseDir, full);
        if (e.isDirectory()) {
            _collectProtoFiles(full, baseDir, list);
        } else if (e.name.toLowerCase().endsWith('.proto')) {
            list.push(rel);
        }
    }
    return list;
};

/** 从父项目 pom.xml 解析子模块名列表（<modules><module>xxx</module></modules>） */
const _getPomModules = async (parentDir) => {
    const pomPath = path.join(parentDir, 'pom.xml');
    try {
        const content = await fsAsync.readFile(pomPath, 'utf8');
        const modules = [];
        const moduleMatch = content.match(/<modules>[\s\S]*?<\/modules>/i);
        if (!moduleMatch) return modules;
        const moduleBlock = moduleMatch[0];
        const modRe = /<module>\s*([^<]+)\s*<\/module>/gi;
        let m;
        while ((m = modRe.exec(moduleBlock)) !== null) {
            const name = m[1].trim();
            if (name) modules.push(name);
        }
        return modules;
    } catch (e) {
        return [];
    }
};

/** 从 pom.xml 解析 artifactId（用于 DPA *-ui 检测） */
const _getPomArtifactId = async (dir) => {
    const pomPath = path.join(dir, 'pom.xml');
    try {
        const content = await fsAsync.readFile(pomPath, 'utf8');
        const withoutParent = content.replace(/<parent>[\s\S]*?<\/parent>/gi, '');
        const match = withoutParent.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/i);
        return match && match[1] ? match[1].trim() : null;
    } catch (e) {
        return null;
    }
};

/**
 * 深度递归收集父项目及所有子模块下的 .r2mo/domain/*.proto，支持 DPA（*-ui/.r2mo/domain）。
 * rootPathForRel：ZERO_MODULE 根路径，origRel 相对此路径。
 * modulesChecked：收集到的模块名会加入此 Set。
 * dpaParentModules：存在 *-ui 子目录的模块名（DPA 父模块），仅此类模块参与“未发现 proto”的警告。
 * 返回 { moduleLabel, relPath, srcDir, origRel }[]。
 */
const _collectAllProtoSources = async (parentPath, rootPathForRel, list = [], modulesChecked = new Set(), dpaParentModules = new Set()) => {
    const submoduleNames = await _getPomModules(parentPath);
    for (const modName of submoduleNames) {
        modulesChecked.add(modName);
        const subDir = path.join(parentPath, modName);
        const protoDir = path.join(subDir, ...R2MO_DOMAIN_REL);
        if (exists(protoDir) && fs.statSync(protoDir).isDirectory()) {
            const files = _collectProtoFiles(protoDir);
            for (const rel of files) {
                const absSrc = path.join(protoDir, rel);
                const origRel = path.relative(rootPathForRel, absSrc).split(path.sep).join('/');
                list.push({ moduleLabel: modName, relPath: rel, srcDir: protoDir, origRel });
            }
        }
        const artifactId = await _getPomArtifactId(subDir);
        if (artifactId) {
            const uiDir = path.join(subDir, `${artifactId}-ui`);
            const uiProtoDir = path.join(uiDir, ...R2MO_DOMAIN_REL);
            if (exists(uiDir) && fs.statSync(uiDir).isDirectory()) {
                dpaParentModules.add(modName);
            }
            if (exists(uiProtoDir) && fs.statSync(uiProtoDir).isDirectory()) {
                const files = _collectProtoFiles(uiProtoDir);
                for (const rel of files) {
                    const absSrc = path.join(uiProtoDir, rel);
                    const origRel = path.relative(rootPathForRel, absSrc).split(path.sep).join('/');
                    list.push({ moduleLabel: modName, relPath: rel, srcDir: uiProtoDir, origRel });
                }
            }
        }
        await _collectAllProtoSources(subDir, rootPathForRel, list, modulesChecked, dpaParentModules);
    }
    return list;
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
            Ec.waiting(`目标目录（.r2mo 落点）: ${targetDir}`);
        } else {
            Ec.waiting('项目类型: ONE / 独立项目');
            Ec.waiting(`目标目录（.r2mo 落点）: ${targetDir}`);
        }
        Ec.waiting('openapi 输入源: r2mo-spec 仓库内 src/main/resources/openapi');

        _ensureGitIgnore(targetDir);
        const repoPath = await _cloneOrUpdateSpecRepo(targetDir);

        const apiDestDir = path.join(targetDir, ...R2MO_API_REL);
        await ensureDir(apiDestDir);

        const openapiSourceDir = path.join(repoPath, ...OPENAPI_REL);
        const openapiSources = [];
        if (exists(openapiSourceDir) && fs.statSync(openapiSourceDir).isDirectory()) {
            openapiSources.push({ subName: 'r2mo-spec', openapiDir: openapiSourceDir });
        }

        Ec.waiting(`找到 ${openapiSources.length} 个 openapi 来源（r2mo-spec 仓库内）`);
        if (openapiSources.length === 0) {
            Ec.warn('未发现 r2mo-spec 仓库内的 src/main/resources/openapi 目录，已检查路径:');
            Ec.warn('  ' + openapiSourceDir);
            Ec.warn('请确认 r2mo-spec 仓库中是否存在该目录及 *.md 等文件');
        }

        const byRelPath = new Map();
        for (const { openapiDir } of openapiSources) {
            const files = _collectFiles(openapiDir);
            for (const rel of files) {
                const norm = rel.split(path.sep).join('/');
                byRelPath.set(norm, { openapiDir });
            }
        }

        const copiedList = [];
        for (const [relPath, { openapiDir }] of byRelPath) {
            const srcFile = path.join(openapiDir, relPath);
            const destFile = path.join(apiDestDir, relPath);
            if (!exists(srcFile) || !fs.statSync(srcFile).isFile()) continue;
            await ensureDir(path.dirname(destFile));
            await fsAsync.copyFile(srcFile, destFile);
            copiedList.push({ relPath, destFull: path.resolve(destFile) });
        }

        copiedList.sort((a, b) => a.relPath.localeCompare(b.relPath));

        const cwdApi = process.cwd();
        const apiRelList = copiedList.map((p) => path.relative(cwdApi, p.destFull));
        console.log('');
        Ec.info('-------- 已拷贝到 .r2mo/api/ 的文件（路径相对当前目录）--------');
        copiedList.forEach((p, i) => Ec.info('  ' + apiRelList[i]));
        console.log('');
        Ec.info(`✅ 共拷贝 ${copiedList.length} 个文件 → ${path.relative(cwdApi, path.resolve(apiDestDir))}`);
        if (byRelPath.size !== copiedList.length) {
            Ec.warn(`校验: 收集 ${byRelPath.size} 个相对路径，实际拷贝 ${copiedList.length} 个（应一致）`);
        }
        console.log('');

        const zeroModule = process.env[ZERO_MODULE_ENV];
        if (!zeroModule || !String(zeroModule).trim()) {
            Ec.warn(`环境变量 ${ZERO_MODULE_ENV} 未设置，跳过 .proto 拷贝`);
        } else {
            const parentPath = path.isAbsolute(zeroModule.trim())
                ? zeroModule.trim()
                : path.resolve(basePath, zeroModule.trim());
            const modulesChecked = new Set();
            const dpaParentModules = new Set();
            const allProto = await _collectAllProtoSources(parentPath, parentPath, [], modulesChecked, dpaParentModules);
            if (modulesChecked.size === 0) {
                Ec.warn(`未在父项目中解析到子模块: ${parentPath}`);
            } else if (allProto.length === 0) {
                Ec.warn(`请在 ${[...modulesChecked].sort().join('、')} 的模块中执行 mxt domain 命令生成 *.proto 文件`);
            } else {
                const domainDestDir = path.join(targetDir, ...R2MO_DOMAIN_REL);
                await ensureDir(domainDestDir);
                const byRel = new Map();
                for (const { moduleLabel, relPath, srcDir, origRel } of allProto) {
                    byRel.set(relPath, { moduleLabel, srcDir, origRel });
                }
                const protoCopied = [];
                for (const [relPath, { moduleLabel, srcDir, origRel }] of byRel) {
                    const srcFile = path.join(srcDir, relPath);
                    const destFile = path.join(domainDestDir, relPath);
                    if (!exists(srcFile) || !fs.statSync(srcFile).isFile()) continue;
                    await ensureDir(path.dirname(destFile));
                    await fsAsync.copyFile(srcFile, destFile);
                    protoCopied.push({ relPath, moduleLabel, destFull: path.resolve(destFile), origRel });
                }
                protoCopied.sort((a, b) => a.relPath.localeCompare(b.relPath));
                const cwd = process.cwd();
                const destRelList = protoCopied.map((p) => path.relative(cwd, p.destFull));
                const maxLen = Math.max(0, ...destRelList.map((s) => s.length));
                Ec.info('-------- 已拷贝到 .r2mo/domain/ 的 *.proto 文件（目标相对当前目录，右侧为 ZERO_MODULE 下原始路径）--------');
                protoCopied.forEach((p, i) => {
                    const destRel = destRelList[i];
                    Ec.info(`  ${destRel.padEnd(maxLen)}  <-  ${p.origRel}`);
                });
                const modulesWithProto = new Set(allProto.map((p) => p.moduleLabel));
                const dpaWithoutProto = [...dpaParentModules].filter((m) => !modulesWithProto.has(m)).sort();
                for (const modName of dpaWithoutProto) {
                    Ec.warn(`[警告] 模块 ${modName} 未发现 .proto 文件，请在该模块中执行 mxt domain 命令生成`);
                }
                Ec.info(`✅ 共拷贝 ${protoCopied.length} 个 .proto 文件（已去重）→ ${path.relative(cwd, path.resolve(domainDestDir))}`);
            }
        }
        console.log('');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message || e);
        process.exit(1);
    }
};
