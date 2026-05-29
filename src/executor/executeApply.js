const fs = require('fs');
const path = require('path');
const os = require('os');
const Ec = require('../epic');
const fsAsync = require('fs').promises;
const readline = require('readline');
const { execSync } = require('child_process');
const { parseOptional, parseBool } = require('../utils/mxt-args');
const { copyDir, readJson, parseFile, ensureDir, exists } = require('../utils/mxt-file-utils');
const { selectSingle } = require('../utils/mxt-menu');

// 远程仓库配置文件路径
const REPOSITORIES_CONFIG = path.join(__dirname, '../_skill/repositories.json');
// 本地缓存仓库目录
const LOCAL_REPO_CACHE_DIR = '.r2mo/repo';

// 限定技仓库地址
const RESTRICTED_REPOSITORY = 'https://gitee.com/silentbalanceyh/r2mo-lain.git';

/**
 * 获取目标路径配置（基于当前项目目录）
 * @returns {Array} 目标路径配置列表
 */
const _getTargetPaths = () => {
    const projectDir = process.cwd();
    return [
        {
            name: 'Cursor 默认',
            description: '.claude/skills/',
            path: path.join(projectDir, '.claude', 'skills')
        },
        {
            name: 'Antigravity',
            description: '.agent/skills/',
            path: path.join(projectDir, '.agent', 'skills')
        },
        {
            name: 'Trae CN',
            description: '.trae/skills/',
            path: path.join(projectDir, '.trae', 'skills')
        },
        {
            name: 'Trae',
            description: '.trae/skills/',
            path: path.join(projectDir, '.trae', 'skills')
        },
        {
            name: 'Lingma',
            description: '.lingma/skills/',
            path: path.join(projectDir, '.lingma', 'skills')
        }
    ];
};

/**
 * 确保 .r2mo/repo 在 .gitignore 中
 * @param {string} projectDir 项目目录
 */
const _ensureGitIgnore = (projectDir) => {
    const gitignorePath = path.join(projectDir, '.gitignore');
    const ignoreEntry = '.r2mo/repo';
    
    try {
        let content = '';
        if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf8');
        }
        
        // 检查是否已经存在
        const lines = content.split('\n');
        const hasEntry = lines.some(line => line.trim() === ignoreEntry);
        
        if (!hasEntry) {
            // 添加到 .gitignore
            const newContent = content.endsWith('\n') || content === '' 
                ? content + ignoreEntry + '\n'
                : content + '\n' + ignoreEntry + '\n';
            fs.writeFileSync(gitignorePath, newContent);
            Ec.waiting(`已将 ${ignoreEntry} 添加到 .gitignore`);
        }
    } catch (error) {
        Ec.warn(`更新 .gitignore 失败: ${error.message}`);
    }
};

/**
 * 获取仓库本地缓存路径
 * @param {string} projectDir 项目目录
 * @param {string} repoName 仓库名称
 * @returns {string} 本地缓存路径
 */
const _getLocalRepoPath = (projectDir, repoName) => {
    // 将 / 替换为 - 避免路径问题
    const safeName = repoName.replace(/\//g, '-');
    return path.join(projectDir, LOCAL_REPO_CACHE_DIR, safeName);
};

/**
 * 检查错误是否为服务器端错误
 * @param {Error} error 错误对象
 * @returns {boolean} 是否为服务器错误
 */
const _isServerError = (error) => {
    const errorMsg = error.message || '';
    // 检查常见的服务器错误代码
    return /500|502|503|504|Internal Server Error/i.test(errorMsg);
};

/**
 * 克隆或更新远程仓库到本地缓存
 * @param {string} url 仓库 URL
 * @param {string} localPath 本地缓存路径
 * @returns {boolean} 是否成功
 */
const _cloneOrUpdateRepository = (url, localPath) => {
    // 确保父目录存在
    const parentDir = path.dirname(localPath);
    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }
    
    // 检查是否已有本地缓存
    if (fs.existsSync(localPath)) {
        Ec.waiting(`发现本地缓存: ${localPath}`.cyan);
        Ec.waiting('正在拉取最新更新...');
        try {
            execSync('git pull --quiet', {
                cwd: localPath,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: process.platform === 'win32'
            });
            Ec.waiting('✓ 仓库已更新'.green);
            return true;
        } catch (error) {
            // 检查是否为服务器错误
            if (_isServerError(error)) {
                Ec.warn('⚠️  远程服务器暂时不可用（可能是 GitHub/Gitee 服务器问题）');
                Ec.waiting('将使用本地缓存继续操作...'.yellow);
                // 保留现有缓存，不删除
                return true;
            }
            
            Ec.warn(`更新失败，将重新克隆: ${error.message}`);
            // 删除损坏的缓存
            fs.rmSync(localPath, { recursive: true, force: true });
        }
    }
    
    // 克隆仓库
    Ec.waiting(`正在克隆仓库: ${url}`.cyan);
    Ec.waiting(`本地缓存: ${localPath}`);
    
    try {
        execSync(`git clone --depth 1 "${url}" "${localPath}"`, {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
        });
        Ec.waiting('✓ 仓库克隆完成'.green);
        return true;
    } catch (error) {
        // 检查是否为服务器错误
        if (_isServerError(error)) {
            Ec.error('❌ 远程服务器暂时不可用（可能是 GitHub/Gitee 服务器问题）');
            Ec.waiting('请稍后重试，或检查网络连接');
            return false;
        }
        
        Ec.error(`克隆仓库失败: ${error.message}`);
        return false;
    }
};

/**
 * 读取远程仓库配置
 * @returns {Array} 仓库列表
 */
const _loadRepositories = () => {
    try {
        const config = readJson(REPOSITORIES_CONFIG);
        return config ? (config.repositories || []) : [];
    } catch (error) {
        Ec.warn(`读取仓库配置失败: ${error.message}`);
        return [];
    }
};

/**
 * 解析 SKILL.md 文件的 YAML 头部
 * @param {string} filePath SKILL.md 文件路径
 * @returns {Object|null} 解析的元数据对象
 */
const _parseSkillYaml = (filePath) => {
    const parsed = parseFile(filePath);
    return parsed ? parsed.attributes : null;
};

/**
 * 扫描技能目录
 * @param {string} skillsDir 技能目录路径
 * @returns {Array} 技能列表
 */
const _scanSkillsFromDir = (skillsDir) => {
    const skills = [];

    if (!fs.existsSync(skillsDir)) {
        return skills;
    }

    const items = fs.readdirSync(skillsDir);

    for (const item of items) {
        const skillDir = path.join(skillsDir, item);
        
        try {
            const stat = fs.statSync(skillDir);

            if (stat.isDirectory()) {
                const skillFile = path.join(skillDir, 'SKILL.md');
                const metadata = _parseSkillYaml(skillFile);

                if (metadata) {
                    // 判断技能类型：检查 repository 字段
                    const repository = metadata.repository || '';
                    const skillType = repository === RESTRICTED_REPOSITORY ? '限定技' : '通用技';
                    
                    skills.push({
                        dirname: item,
                        path: skillDir,
                        name: metadata.name || item,
                        description: metadata.description || '无描述',
                        version: metadata.version || '未知',
                        category: metadata.category || '未分类',
                        tags: metadata.tags || [],
                        skillType: skillType,
                        repository: repository
                    });
                } else {
                    skills.push({
                        dirname: item,
                        path: skillDir,
                        name: item,
                        description: '(未找到 SKILL.md)',
                        version: '未知',
                        category: '未分类',
                        tags: [],
                        skillType: '通用技',
                        repository: ''
                    });
                }
            }
        } catch (e) {
            // 忽略无法访问的目录
        }
    }

    return skills;
};

/**
 * 递归拷贝目录
 * @param {string} src 源目录
 * @param {string} dest 目标目录
 */
const _copyDirectory = async (src, dest) => {
    await copyDir(src, dest);
};

/**
 * 截断描述文本
 * @param {string} text 原始文本
 * @param {number} maxLen 最大长度
 * @returns {string} 截断后的文本
 */
const _truncateDescription = (text, maxLen = 50) => {
    if (!text) return '无描述';
    // 移除引号
    text = text.replace(/^["']|["']$/g, '');
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen - 3) + '...';
};

/**
 * 选择目标路径
 * @returns {Promise<Object|null>} 选中的目标路径配置
 */
const _selectTargetPath = async () => {
    const targetPaths = _getTargetPaths();
    const selected = await selectSingle(targetPaths, '选择安装目标路径');
    return selected;
};

/**
 * 选择技能（多选菜单）
 * @param {Array} skills 技能列表
 * @param {string} title 菜单标题
 * @returns {Promise<Array>} 选中的技能索引列表
 */
const _selectSkills = async (skills, title) => {
    // 对于远程技能（官方），不显示描述
    const showDescription = false;

    return new Promise((resolve) => {
        const selected = new Array(skills.length).fill(false);
        let cursor = 0;

        const maxNameLen = Math.max(...skills.map(s => s.name.length), 4);
        const maxTypeLen = Math.max(...skills.map(s => (s.skillType || '').length), 4);

        const render = () => {
            process.stdout.write('\x1B[2J\x1B[0f');

            console.log('');
            console.log('[MXT AI]'.blue.bold + ` ====== ${title} ======`.blue);
            console.log('');

            skills.forEach((skill, index) => {
                const isActive = index === cursor;
                const checkbox = selected[index] ? '[✓]'.green : '[ ]';
                const pointer = isActive ? '▸'.cyan : ' ';
                const name = skill.name.padEnd(maxNameLen);
                const version = skill.version ? `v${skill.version}`.yellow : '';
                
                // 技能类型标记（限定技/通用技）
                const skillType = skill.skillType || '通用技';
                const typeTag = skillType === '限定技' 
                    ? `[${skillType}]`.red 
                    : `[${skillType}]`.green;
                // 统一对齐：限定技和通用技都是3个字符，使用固定宽度确保对齐
                const typeTagPadded = typeTag.padEnd(25); // 固定宽度确保对齐

                // 统一技能名称样式，不加粗
                const nameStyled = isActive ? name.cyan.bold : name.cyan;
                console.log(`  ${pointer} ${checkbox} ${typeTagPadded}${nameStyled}  ${version}`);

                // 显示描述（可选，远程技能不显示）
                if (showDescription) {
                    const desc = _truncateDescription(skill.description, 50);
                    console.log(`       ${desc.gray}`);
                }
            });

            console.log('');
            console.log('  ─────────────────────────────────────────────────'.gray);
            console.log('  ↑/↓ 移动  │  空格 选择/取消  │  a 全选  │  n 清空  │  回车 确认  │  q 退出'.gray);
            console.log('');

            const selectedCount = selected.filter(s => s).length;
            if (selectedCount > 0) {
                console.log(`  已选择 ${selectedCount} 个技能`.green);
            } else {
                console.log('  未选择任何技能'.yellow);
            }
        };

        const getSelectedResult = () => {
            const indices = [];
            const names = [];
            selected.forEach((sel, idx) => {
                if (sel) {
                    indices.push(idx);
                    names.push(skills[idx].name);
                }
            });
            return { indices, names };
        };

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        render();

        const onKeypress = (str, key) => {
            if (!key) return;

            if (key.ctrl && key.name === 'c') {
                process.stdin.setRawMode(false);
                process.stdin.removeListener('keypress', onKeypress);
                process.exit(0);
            }

            if (key.name === 'q' || key.name === 'escape') {
                process.stdin.setRawMode(false);
                process.stdin.removeListener('keypress', onKeypress);
                process.stdout.write('\x1B[2J\x1B[0f');
                resolve([]);
                return;
            }

            if (key.name === 'up') {
                cursor = cursor > 0 ? cursor - 1 : skills.length - 1;
                render();
                return;
            }

            if (key.name === 'down') {
                cursor = cursor < skills.length - 1 ? cursor + 1 : 0;
                render();
                return;
            }

            if (key.name === 'space') {
                selected[cursor] = !selected[cursor];
                render();
                return;
            }

            if (key.name === 'a') {
                selected.fill(true);
                render();
                return;
            }

            if (key.name === 'n') {
                selected.fill(false);
                render();
                return;
            }

            if (key.name === 'return') {
                const result = getSelectedResult();
                
                if (result.indices.length === 0) {
                    render();
                    return;
                }

                process.stdin.setRawMode(false);
                process.stdin.removeListener('keypress', onKeypress);
                
                process.stdout.write('\x1B[2J\x1B[0f');
                console.log('');
                console.log('[MXT AI]'.blue.bold + ' 即将安装以下技能:');
                console.log('');
                result.names.forEach(name => {
                    console.log(`  ✓ ${name}`.green);
                });
                console.log('');

                // 等待用户确认
                resolve(result.indices);
                return;
            }
        };

        process.stdin.on('keypress', onKeypress);
    }).then(async (indices) => {
        if (indices.length === 0) {
            return [];
        }

        const answer = await Ec.ask('确认安装？(y/N): ');
        if (answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes') {
            return indices;
        } else {
            Ec.waiting('已取消安装');
            return [];
        }
    });
};

/**
 * 安装选中的技能
 * @param {Array} skills 技能列表
 * @param {Array} selectedIndices 选中的索引
 * @param {string} targetDir 目标目录
 */
const _installSkills = async (skills, selectedIndices, targetDir) => {
    await fsAsync.mkdir(targetDir, { recursive: true });

    for (const index of selectedIndices) {
        const skill = skills[index];
        const destPath = path.join(targetDir, skill.dirname);

        Ec.waiting(`正在安装技能: ${skill.name}`.cyan);

        if (fs.existsSync(destPath)) {
            Ec.warn(`  技能 "${skill.name}" 已存在，将覆盖...`);
            await fsAsync.rm(destPath, { recursive: true, force: true });
        }

        await _copyDirectory(skill.path, destPath);

        Ec.waiting(`  ✓ 已安装到 ${destPath}`.green);
    }
};

/**
 * 选择远程仓库
 * @param {Array} repositories 仓库列表
 * @param {string} remoteValue -r 参数的值（如果提供）
 * @returns {Promise<Object|null>} 选中的仓库
 */
const _selectRepository = async (repositories, remoteValue) => {
    // 如果 -r 有值，直接查找对应的仓库
    if (remoteValue) {
        const repo = repositories.find(r => 
            r.name === remoteValue || 
            r.name.toLowerCase() === remoteValue.toLowerCase()
        );
        if (repo) {
            return repo;
        }
        Ec.warn(`未找到仓库: ${remoteValue}`);
        Ec.waiting('将显示仓库选择菜单...');
    }

    // 显示仓库选择菜单
    const menuItems = repositories.map(repo => ({
        name: repo.name,
        description: `${repo.url} - ${repo.description || ''}`,
        repo: repo  // 保存原始仓库对象的引用
    }));

    const selected = await selectSingle(menuItems, '选择远程仓库');
    
    // 返回原始仓库对象
    return selected ? selected.repo : null;
};

/**
 * 从远程仓库安装技能
 * @param {Object} repository 仓库配置
 * @param {string} targetPath 目标路径
 */
const _installFromRemote = async (repository, targetPath) => {
    const projectDir = process.cwd();
    
    console.log('');
    Ec.info(`已选择仓库: ${repository.name}`);
    Ec.waiting(`仓库地址: ${repository.url}`);
    Ec.waiting(`技能目录: ${repository.skillsPath || 'skills'}`);
    console.log('');

    // 确保 .r2mo/repo 在 .gitignore 中
    _ensureGitIgnore(projectDir);

    // 获取本地缓存路径
    const localRepoPath = _getLocalRepoPath(projectDir, repository.name);

    // 克隆或更新仓库
    const success = _cloneOrUpdateRepository(repository.url, localRepoPath);
    if (!success) {
        return;
    }

    // 检查技能目录是否存在
    const skillsPath = path.join(localRepoPath, repository.skillsPath || 'skills');
    
    if (!fs.existsSync(skillsPath)) {
        Ec.error(`❌ 仓库中未找到技能目录: ${repository.skillsPath || 'skills'}`);
        Ec.waiting('请检查仓库配置中的 skillsPath 是否正确');
        return;
    }

    Ec.waiting('✓ 技能目录存在，正在扫描...'.green);
    const skills = _scanSkillsFromDir(skillsPath);

    if (skills.length === 0) {
        Ec.warn('技能目录存在，但未找到任何有效技能');
        return;
    }

    Ec.info(`找到 ${skills.length} 个远程技能，正在打开选择菜单...`);

    const selectedIndices = await _selectSkills(skills, `远程技能 (${repository.name})`);

    if (selectedIndices.length === 0) {
        Ec.waiting('未选择任何技能，退出');
        return;
    }

    console.log('');
    Ec.info(`将安装 ${selectedIndices.length} 个技能到 ${targetPath}`);

    await _installSkills(skills, selectedIndices, targetPath);

    Ec.info(`✅ 成功安装 ${selectedIndices.length} 个技能！`);
};

/**
 * -i 模式：将当前项目 skills/ 拷贝到 Z_LAIN_SKILL/skills，重名时逐个询问是否覆盖
 */
const _importToLainSkills = async () => {
    const projectDir = process.cwd();
    const projectSkillsDir = path.join(projectDir, 'skills');
    const lainRoot = process.env.Z_LAIN_SKILL;
    if (!lainRoot || !String(lainRoot).trim()) {
        Ec.error('❌ 环境变量 Z_LAIN_SKILL 未设置');
        Ec.warn('请设置 Z_LAIN_SKILL 指向 Lain 技能根目录后再执行 mxt apply -i');
        process.exit(1);
    }
    const destDir = path.join(lainRoot.trim(), 'skills');
    if (!exists(projectSkillsDir) || !fs.statSync(projectSkillsDir).isDirectory()) {
        Ec.warn(`当前项目下未找到 skills/ 目录: ${projectSkillsDir}`);
        process.exit(1);
    }
    const skills = _scanSkillsFromDir(projectSkillsDir);
    if (skills.length === 0) {
        Ec.warn('skills/ 目录下未找到任何有效技能');
        process.exit(0);
    }
    Ec.waiting(`当前项目 skills/: ${projectSkillsDir}`);
    Ec.waiting(`目标目录: ${destDir}`);
    await ensureDir(destDir);
    let copied = 0;
    for (const skill of skills) {
        const destPath = path.join(destDir, skill.dirname);
        if (exists(destPath)) {
            try {
                const answer = await Ec.ask(`技能 "${skill.name}" 已存在，是否覆盖？(y/N): `);
                if (!/^y|yes$/i.test((answer || '').trim())) {
                    Ec.waiting(`  跳过: ${skill.name}`);
                    continue;
                }
            } catch (e) {
                Ec.waiting('已取消');
                process.exit(0);
            }
            await fsAsync.rm(destPath, { recursive: true, force: true });
        }
        await _copyDirectory(skill.path, destPath);
        Ec.waiting(`  ✓ 已拷贝: ${skill.name}`);
        copied++;
    }
    Ec.info(`✅ 已反馈 ${copied} 个技能到 ${destDir}`);
};

module.exports = async (options) => {
    const isImport = parseBool('import', 'i');
    const { value: remoteValue } = parseOptional('remote', 'r');

    if (isImport) {
        await _importToLainSkills();
        process.exit(0);
    }

    // 默认：从远程仓库安装技能到当前项目（原 mxt apply -r）
    const repositories = _loadRepositories();
    if (repositories.length === 0) {
        Ec.error('❌ 未找到任何远程仓库配置');
        Ec.warn(`请检查配置文件: ${REPOSITORIES_CONFIG}`);
        process.exit(1);
    }

    const repository = await _selectRepository(repositories, remoteValue);
    if (!repository) {
        Ec.waiting('已取消选择仓库');
        process.exit(0);
    }

    const targetPathConfig = await _selectTargetPath();
    if (!targetPathConfig) {
        Ec.waiting('已取消选择目标路径');
        process.exit(0);
    }

    await _installFromRemote(repository, targetPathConfig.path);
    process.exit(0);
};
