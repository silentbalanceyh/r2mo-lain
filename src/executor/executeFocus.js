/**
 * mxt focus [-d] [-c]
 * 仅在 DPA 父项目运行。维护 .r2mo/focus/ 与 rachel-mxt.yaml（title + taskset）；用户输入任务名称 title。
 * -d：完成，按日期备份配置与三任务，视为历史记录。
 * -c：同步父项目、-api、-ui 的 .r2mo/api/metadata.yaml。
 * 无参且 rachel-mxt.yaml 已存在时：询问是否创建新 focus；若选是则先备份旧配置与 task 再创建新任务（视为原 focus 取消）。
 */
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawnSync } = require('child_process');
const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const { selectSingle } = require('../utils/mxt-menu');
const { exists, ensureDir } = require('../utils/mxt-file-utils');

const FOCUS_DIR = '.r2mo/focus';
const FOCUS_CONFIG = 'rachel-mxt.yaml';
const API_METADATA_REL = '.r2mo/api/metadata.yaml';
const TASK_DIR_REL = '.r2mo/task';
const TASK_FILE_RE = /^task-\d+\.md$/;
const MXT_YAML = '.r2mo/mxt.yaml';
const ROLE_BACKEND = 'Backend Actor';
const ROLE_FRONTEND = 'Frontend Actor';
const ROLE_LEADER = 'Team Leader';

/** 日期目录 YYYY-MM-DD（与 executeTask 一致） */
const _formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/** 从 pom.xml 解析 artifactId */
const _getProjectName = async (basePath) => {
    try {
        const pomPath = path.join(basePath, 'pom.xml');
        const content = await fs.readFile(pomPath, 'utf8');
        const withoutParent = content.replace(/<parent>[\s\S]*?<\/parent>/gi, '');
        const match = withoutParent.match(/<artifactId>([^<]+)<\/artifactId>/);
        return match && match[1] ? match[1].trim() : null;
    } catch {
        return null;
    }
};

/**
 * 仅在 DPA 父项目时返回 { projectName, basePath, apiPath, uiPath }，否则 null。
 */
const _ensureDpaParent = async (cwd) => {
    const dirname = path.basename(cwd);
    const hasPom = exists(path.join(cwd, 'pom.xml'));
    if (!hasPom || dirname.endsWith('-domain') || dirname.endsWith('-provider') || dirname.endsWith('-api') || dirname.endsWith('-ui')) {
        return null;
    }
    const projectName = await _getProjectName(cwd);
    if (!projectName) return null;
    const domainPath = path.join(cwd, `${projectName}-domain`);
    const providerPath = path.join(cwd, `${projectName}-provider`);
    const apiPath = path.join(cwd, `${projectName}-api`);
    const uiPath = path.join(cwd, `${projectName}-ui`);
    const domainExists = await fs.access(domainPath).then(() => true).catch(() => false);
    const providerExists = await fs.access(providerPath).then(() => true).catch(() => false);
    const apiExists = await fs.access(apiPath).then(() => true).catch(() => false);
    const uiExists = await fs.access(uiPath).then(() => true).catch(() => false);
    if (!domainExists || !providerExists || !apiExists || !uiExists) return null;
    return { projectName, basePath: cwd, apiPath, uiPath };
};

/** 读取 .r2mo/mxt.yaml 中的 metadata.role */
const _getRoleFromMXTYaml = async (dir) => {
    try {
        const yaml = require('js-yaml');
        const p = path.join(dir, MXT_YAML);
        const content = await fs.readFile(p, 'utf8');
        const data = yaml.load(content);
        return data && data.metadata && data.metadata.role ? data.metadata.role : null;
    } catch {
        return null;
    }
};

/**
 * 检查 mxt team 是否已执行：三处 .r2mo/mxt.yaml 存在且 role 正确。
 * 返回 { ok, errors }，errors 为不通过项说明数组。
 */
const _checkMXTTeamEnv = async (dpa) => {
    const errors = [];
    const parentRole = await _getRoleFromMXTYaml(dpa.basePath);
    const apiRole = await _getRoleFromMXTYaml(dpa.apiPath);
    const uiRole = await _getRoleFromMXTYaml(dpa.uiPath);

    const parentPath = path.relative(dpa.basePath, path.join(dpa.basePath, MXT_YAML));
    const apiPathRel = path.relative(dpa.basePath, path.join(dpa.apiPath, MXT_YAML));
    const uiPathRel = path.relative(dpa.basePath, path.join(dpa.uiPath, MXT_YAML));

    if (!exists(path.join(dpa.basePath, MXT_YAML))) {
        errors.push(`父项目 缺少 ${MXT_YAML}`);
    } else if (parentRole !== ROLE_LEADER) {
        errors.push(`父项目 ${MXT_YAML} metadata.role 应为 "${ROLE_LEADER}"，当前: ${parentRole || '(无)'}`);
    }
    if (!exists(path.join(dpa.apiPath, MXT_YAML))) {
        errors.push(`-api 缺少 ${apiPathRel}`);
    } else if (apiRole !== ROLE_BACKEND) {
        errors.push(`-api ${MXT_YAML} metadata.role 应为 "${ROLE_BACKEND}"，当前: ${apiRole || '(无)'}`);
    }
    if (!exists(path.join(dpa.uiPath, MXT_YAML))) {
        errors.push(`-ui 缺少 ${uiPathRel}`);
    } else if (uiRole !== ROLE_FRONTEND) {
        errors.push(`-ui ${MXT_YAML} metadata.role 应为 "${ROLE_FRONTEND}"，当前: ${uiRole || '(无)'}`);
    }

    return { ok: errors.length === 0, errors };
};

/** 列出目录下 .r2mo/task/task-*.md，返回 { fullPath, name }[]，按文件名排序 */
const _listTaskFiles = async (roleDir) => {
    const taskDir = path.join(roleDir, TASK_DIR_REL);
    if (!exists(taskDir)) return [];
    const entries = await fs.readdir(taskDir, { withFileTypes: true }).catch(() => []);
    const files = entries
        .filter((e) => e.isFile() && TASK_FILE_RE.test(e.name))
        .map((e) => ({ name: e.name, fullPath: path.join(taskDir, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return files;
};

/** 从 task 文件内容解析 title（与 executeTask 一致） */
const _parseTitleFromContent = (content) => {
    if (!content) return null;
    const m = content.match(/^---\s*\n([\s\S]+?)\n---/);
    if (!m) return null;
    const titleLine = m[1].split('\n').find((line) => /^\s*title\s*:/.test(line));
    if (!titleLine) return null;
    const value = titleLine.replace(/^\s*title\s*:\s*/, '').trim();
    return value.replace(/^['"]|['"]$/g, '').trim() || null;
};

/**
 * 执行 focus 备份：按日期目录备份 rachel-mxt.yaml 与 taskset 中的三个 task 文件。
 * 与 -d 行为一致，供「创建新 focus」时复用。
 */
const _doBackupFocus = async (configPath, dpa, focusRoot) => {
    const yaml = require('js-yaml');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = yaml.load(configContent);
    const taskset = config && config.taskset ? config.taskset : {};
    const dateDir = _formatDate(new Date());
    const backupDir = path.join(focusRoot, dateDir);
    await ensureDir(backupDir);
    Ec.waiting(`  📁 备份目录: ${path.relative(dpa.basePath, backupDir)}`);
    const backupConfigPath = path.join(backupDir, FOCUS_CONFIG);
    await fs.writeFile(backupConfigPath, configContent, 'utf8');
    Ec.waiting(`  ✏️ 已备份配置: ${FOCUS_CONFIG}`);
    const roleLabels = { backend: '后端', frontend: '前端', leader: '集体' };
    for (const [key, relPath] of Object.entries(taskset)) {
        if (!relPath) continue;
        const taskFull = path.join(dpa.basePath, relPath);
        if (!exists(taskFull)) continue;
        const content = await fs.readFile(taskFull, 'utf8');
        const baseName = path.basename(relPath, '.md');
        const destName = `${key}-${baseName}.md`;
        await fs.writeFile(path.join(backupDir, destName), content, 'utf8');
        Ec.waiting(`  ✏️ 已备份${roleLabels[key] || key}任务: ${destName}`);
    }
    return backupDir;
};

/**
 * 同步 .r2mo/api/metadata.yaml 到父项目、-api、-ui 三处。
 * 以父项目为源，若无则创建默认内容后写入三处。
 */
const _syncApiMetadata = async (dpa) => {
    const yaml = require('js-yaml');
    const parentMetaPath = path.join(dpa.basePath, API_METADATA_REL);
    let content;
    if (exists(parentMetaPath)) {
        content = await fs.readFile(parentMetaPath, 'utf8');
        Ec.waiting(`  📄 以父项目为源: ${API_METADATA_REL}`);
    } else {
        const defaultMeta = { focus: { dir: FOCUS_DIR, config: FOCUS_CONFIG } };
        content = yaml.dump(defaultMeta, { lineWidth: -1 });
        await ensureDir(path.dirname(parentMetaPath));
        await fs.writeFile(parentMetaPath, content, 'utf8');
        Ec.waiting(`  ✏️ 父项目无此文件，已创建默认并写入: ${API_METADATA_REL}`);
    }
    const apiMetaPath = path.join(dpa.apiPath, API_METADATA_REL);
    const uiMetaPath = path.join(dpa.uiPath, API_METADATA_REL);
    await ensureDir(path.dirname(apiMetaPath));
    await ensureDir(path.dirname(uiMetaPath));
    await fs.writeFile(apiMetaPath, content, 'utf8');
    await fs.writeFile(uiMetaPath, content, 'utf8');
    Ec.waiting(`  ✏️ 已同步到 -api: ${path.relative(dpa.basePath, apiMetaPath)}`);
    Ec.waiting(`  ✏️ 已同步到 -ui: ${path.relative(dpa.basePath, uiMetaPath)}`);
};

/**
 * 将 task 类型 md 的 YAML 头部中的 title 设为统一名称，保持 Leader/Frontend/Backend 一致。
 * 若有 frontmatter 则更新 title 并写回，若无则跳过。
 */
const _writeTitleToTaskMd = async (taskFullPath, focusTitle, basePath) => {
    const content = await fs.readFile(taskFullPath, 'utf8');
    const m = content.match(/^---\s*\n([\s\S]+?)\n---\s*\n?([\s\S]*)$/);
    if (!m) return false;
    const yaml = require('js-yaml');
    let attrs;
    try {
        attrs = yaml.load(m[1]) || {};
    } catch {
        return false;
    }
    attrs.title = focusTitle;
    const newFront = yaml.dump(attrs, { lineWidth: -1 }).trim();
    const body = m[2] || '';
    await fs.writeFile(taskFullPath, '---\n' + newFront + '\n---\n' + body, 'utf8');
    Ec.waiting(`  ✏️ 已同步 title: ${path.relative(basePath, taskFullPath)}`);
    return true;
};

/** 在指定目录下执行 mxt task（创建新任务） */
const _runMXTTask = (roleDir, mxtJsPath) => {
    Ec.waiting(`  📌 在 ${path.basename(roleDir)} 下执行 mxt task 创建新任务...`);
    const result = spawnSync(process.execPath, [mxtJsPath, 'task'], {
        cwd: roleDir,
        stdio: 'inherit'
    });
    return result.status === 0;
};

/**
 * 让用户在 roleDir 的 .r2mo/task 下单选一个任务；若无则先执行 mxt task 再选。
 * 返回相对 parentRoot 的路径，如 "xxx-api/.r2mo/task/task-001.md"。
 */
const _pickTaskPath = async (roleDir, parentRoot, roleLabel, expectedRole, mxtJsPath) => {
    const role = await _getRoleFromMXTYaml(roleDir);
    Ec.waiting(`  📄 ${roleLabel} 目录: ${path.relative(parentRoot, roleDir)} | mxt.yaml role: ${role || '(无)'}`);
    if (role !== expectedRole) {
        Ec.warn(`  ⚠️ 建议先在该目录执行 mxt team 以写入 role: ${expectedRole}`);
    }
    let list = await _listTaskFiles(roleDir);
    if (list.length === 0) {
        Ec.waiting(`  📂 ${roleLabel} 下暂无任务文件，将调用 mxt task 创建`);
        const ok = _runMXTTask(roleDir, mxtJsPath);
        if (!ok) {
            Ec.error(`  ⛔ mxt task 未成功，跳过 ${roleLabel}`);
            return null;
        }
        list = await _listTaskFiles(roleDir);
        if (list.length === 0) {
            Ec.warn(`  ⚠️ 创建后仍无任务文件，跳过 ${roleLabel}`);
            return null;
        }
    }
    const menuItems = list.map((f) => {
        let desc = f.name;
        try {
            const content = fsSync.readFileSync(f.fullPath, 'utf8');
            const t = _parseTitleFromContent(content);
            if (t) desc = t;
        } catch (_) {}
        return { name: f.name, description: desc, fullPath: f.fullPath };
    });
    menuItems.push({ name: '__create__', description: '➕ 创建新任务 (mxt task)', fullPath: null });
    const selected = await selectSingle(menuItems, `${roleLabel}：选择任务`);
    if (!selected) return null;
    if (selected.name === '__create__') {
        const ok = _runMXTTask(roleDir, mxtJsPath);
        if (!ok) return null;
        const listAfter = await _listTaskFiles(roleDir);
        if (listAfter.length === 0) {
            Ec.warn(`  ⚠️ 创建后仍无任务文件，跳过 ${roleLabel}`);
            return null;
        }
        const newest = listAfter.reduce((a, b) => {
            const mtimeA = fsSync.statSync(a.fullPath).mtimeMs;
            const mtimeB = fsSync.statSync(b.fullPath).mtimeMs;
            return mtimeB > mtimeA ? b : a;
        });
        const rel = path.relative(parentRoot, newest.fullPath);
        Ec.waiting(`  ✅ 已选（新创建）: ${rel}`);
        return rel;
    }
    const rel = path.relative(parentRoot, selected.fullPath);
    Ec.waiting(`  ✅ 已选: ${rel}`);
    return rel;
};

module.exports = async (options) => {
    try {
        const opts = Args.parseStandard(options);
        const isDone = Args.parseBool('done', 'd');
        const isConfig = Args.parseBool('config', 'c');
        const cwd = process.cwd();
        const mxtJsPath = path.resolve(__dirname, '../mxt.js');

        Ec.waiting('🔍 mxt focus：仅支持在 DPA 父项目根目录执行');
        Ec.waiting(`  📂 当前目录: ${cwd}`);

        const dpa = await _ensureDpaParent(cwd);
        if (!dpa) {
            Ec.error('⛔ 当前目录不是 DPA 父项目（需含 pom.xml 且存在 -domain/-provider/-api/-ui 子模块），无法执行 mxt focus');
            process.exit(1);
        }

        Ec.waiting(`  ✅ 已识别 DPA 父项目: ${dpa.projectName}`);
        Ec.waiting(`  📦 子模块: ${dpa.projectName}-api, ${dpa.projectName}-ui（及 -domain, -provider）`);

        Ec.waiting('');
        Ec.waiting('🔍 环境检查：mxt team 是否已执行（三处 .r2mo/mxt.yaml 存在且 role 正确）');
        const envCheck = await _checkMXTTeamEnv(dpa);
        if (!envCheck.ok) {
            envCheck.errors.forEach((msg) => Ec.warn(`  ⚠️ ${msg}`));
            Ec.error('环境未就绪，请先在 DPA 父项目根目录执行: mxt team');
            process.exit(1);
        }
        Ec.waiting('  ✅ 父项目 / -api / -ui 的 .r2mo/mxt.yaml 及 role 均正确');
        Ec.waiting('');

        const focusRoot = path.join(dpa.basePath, FOCUS_DIR);
        const configPath = path.join(focusRoot, FOCUS_CONFIG);

        if (isConfig) {
            Ec.waiting('📋 -c 配置：同步 .r2mo/api/metadata.yaml 到父项目、-api、-ui');
            await _syncApiMetadata(dpa);
            Ec.info('\n✅ 已同步 .r2mo/api/metadata.yaml');
            process.exit(0);
            return;
        }

        if (isDone) {
            Ec.waiting('');
            Ec.waiting('📋 -d 完成：备份 focus 配置与三任务到按日期目录');
            Ec.waiting(`  📌 配置文件路径: ${path.relative(dpa.basePath, configPath)}`);
            if (!exists(configPath)) {
                Ec.error('⛔ 未找到 focus 配置文件: ' + configPath + '，请先执行 mxt focus 生成配置');
                process.exit(1);
            }
            const yaml = require('js-yaml');
            const configContent = await fs.readFile(configPath, 'utf8');
            const config = yaml.load(configContent);
            const taskset = config && config.taskset ? config.taskset : {};
            Ec.waiting(`  📄 配置内容 title: ${(config && config.title) || '(无)'}`);
            Ec.waiting(`  📄 配置内容 taskset: backend=${taskset.backend || '(空)'}, frontend=${taskset.frontend || '(空)'}, leader=${taskset.leader || '(空)'}`);
            const backupDir = await _doBackupFocus(configPath, dpa, focusRoot);
            Ec.info('\n✅ 历史记录已完成并写入 ' + path.relative(dpa.basePath, backupDir));
            process.exit(0);
            return;
        }

        if (exists(configPath)) {
            Ec.waiting('📋 检测到已有 focus 配置: rachel-mxt.yaml');
            const answer = await Ec.ask('是否创建新的 focus？(y/N): ');
            const createNew = /^y|yes$/i.test((answer || '').trim());
            if (!createNew) {
                Ec.info('已保留当前 focus。');
                process.exit(0);
                return;
            }
            Ec.waiting('📁 备份当前 focus（配置 + 三角色 task）后创建新任务...');
            await _doBackupFocus(configPath, dpa, focusRoot);
            Ec.waiting('');
        }

        // ---------- 正常：确保 focus 目录，输入 title，选任务，写配置 ----------
        await ensureDir(focusRoot);
        Ec.waiting(`  📁 已确保目录: ${FOCUS_DIR}/`);
        Ec.waiting('');

        Ec.waiting('📝 步骤 0/5: 输入 focus 任务名称 (title)');
        const titleAnswer = await Ec.ask('请输入 focus 任务名称 (title): ');
        const title = (titleAnswer && String(titleAnswer).trim()) || '未命名';
        Ec.waiting(`  📋 title: ${title}`);
        Ec.waiting('');

        Ec.waiting('📝 步骤 1/5: 后端任务（查找 mxt.yaml Backend Actor，.r2mo/task/ 下单选）');
        const backendRel = await _pickTaskPath(dpa.apiPath, dpa.basePath, '🔧 后端(Backend)', ROLE_BACKEND, mxtJsPath);
        Ec.waiting('');
        Ec.waiting('📝 步骤 2/5: 前端任务（查找 mxt.yaml Frontend Actor，.r2mo/task/ 下单选）');
        const frontendRel = await _pickTaskPath(dpa.uiPath, dpa.basePath, '🎨 前端(Frontend)', ROLE_FRONTEND, mxtJsPath);
        Ec.waiting('');
        Ec.waiting('📝 步骤 3/5: 集体任务（查找 mxt.yaml Team Leader，.r2mo/task/ 下单选）');
        const leaderRel = await _pickTaskPath(dpa.basePath, dpa.basePath, '👑 集体(Leader)', ROLE_LEADER, mxtJsPath);

        const taskset = {
            backend: backendRel || null,
            frontend: frontendRel || null,
            leader: leaderRel || null
        };
        Ec.waiting('');
        Ec.waiting('📝 步骤 4/5: 写入 focus 配置（含 title、taskset）');
        const yaml = require('js-yaml');
        const config = { title, taskset };
        const content = yaml.dump(config, { lineWidth: -1 });
        await fs.writeFile(configPath, content, 'utf8');
        Ec.waiting(`  ✏️ 已写入: ${path.relative(dpa.basePath, configPath)}`);
        Ec.waiting('  📋 title: ' + title);
        Ec.waiting('  📋 taskset.backend: ' + (taskset.backend || '(未选)'));
        Ec.waiting('  📋 taskset.frontend: ' + (taskset.frontend || '(未选)'));
        Ec.waiting('  📋 taskset.leader: ' + (taskset.leader || '(未选)'));

        if (title && title !== '未命名') {
            Ec.waiting('');
            Ec.waiting('📝 步骤 5/5: 将 title 同步到 Leader / Frontend / Backend 三个 task 的 md 头部');
            for (const [key, relPath] of Object.entries(taskset)) {
                if (!relPath) continue;
                const taskFull = path.join(dpa.basePath, relPath);
                if (!exists(taskFull)) {
                    Ec.warn(`  ⚠️ 任务文件不存在，跳过: ${relPath}`);
                    continue;
                }
                await _writeTitleToTaskMd(taskFull, title, dpa.basePath);
            }
        } else {
            Ec.waiting('');
            Ec.waiting('📝 步骤 5/5: 未输入名称，跳过同步 title 到 task md');
        }

        Ec.info('\n✅ focus 配置已更新。使用 mxt focus -d 完成并备份历史记录。');
        process.exit(0);
    } catch (e) {
        Ec.error(e.message);
        process.exit(1);
    }
};
