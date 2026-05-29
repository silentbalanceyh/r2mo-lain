const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const fsAsync = require('fs').promises;
const Ec = require('../epic');
const { parseOptional } = require('../utils/mxt-args');
const { exists, gitClone } = require('../utils/mxt-file-utils');
const { SPEC_REPO_URL, LOCAL_CACHE_DIR, GITIGNORE_ENTRY } = require('../utils/mxt-repo-spec');

// 脚本路径（相对于项目根目录）
const SCRIPT_PATH_DOMAIN = 'src/python/r2mo_proto_domain.py';
const SCRIPT_PATH_DATABASE = 'src/python/r2mo_proto_database.py';

/**
 * 检查命令是否可用
 * @param {string} command 命令名称
 * @returns {Promise<boolean>}
 */
const _isCommandAvailable = async (command) => {
    return new Promise((resolve) => {
        const whereCmd = process.platform === 'win32' ? 'where' : 'which';
        const childProcess = spawn(whereCmd, [command], { stdio: 'pipe', shell: process.platform === 'win32' });
        childProcess.on('close', (code) => {
            resolve(code === 0);
        });
        childProcess.on('error', () => {
            resolve(false);
        });
    });
};

/**
 * 解析 pom.xml 提取 artifactId（排除 parent 节点）
 * @param {string} pomPath pom.xml 文件路径
 * @returns {string|null} artifactId，如果解析失败返回 null
 */
const _parsePomXml = (pomPath) => {
    try {
        const content = fs.readFileSync(pomPath, 'utf8');
        
        // 移除 <parent>...</parent> 节点，避免提取 parent 的 artifactId
        const withoutParent = content.replace(/<parent>[\s\S]*?<\/parent>/gi, '');
        
        // 在剩余内容中查找 artifactId
        const match = withoutParent.match(/<artifactId>([^<]+)<\/artifactId>/);
        if (match && match[1]) {
            return match[1].trim();
        }
        return null;
    } catch (error) {
        return null;
    }
};

/**
 * 检查仓库是否是最新的
 * @param {string} repoPath 仓库路径
 * @returns {boolean}
 */
const _isRepositoryUpToDate = (repoPath) => {
    try {
        execSync('git fetch --quiet origin', { cwd: repoPath, stdio: 'ignore', shell: process.platform === 'win32' });
        const remoteCommit = execSync('git rev-parse origin/HEAD', { cwd: repoPath, encoding: 'utf8', shell: process.platform === 'win32' }).trim();
        const localCommit = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8', shell: process.platform === 'win32' }).trim();
        return remoteCommit === localCommit;
    } catch {
        return false;
    }
};

/**
 * 克隆或更新 .r2mo/repo 仓库（与 mmr0/mmr2 共享）
 * @param {string} projectDir 项目根目录
 * @returns {Promise<string>} 仓库路径
 */
const _cloneOrUpdateRepository = async (projectDir) => {
    const repoPath = path.join(projectDir, LOCAL_CACHE_DIR);

    if (exists(repoPath)) {
        Ec.waiting('正在检查仓库状态...');
        if (_isRepositoryUpToDate(repoPath)) {
            Ec.info('✓ 仓库已是最新版本，无需更新');
            return repoPath;
        }
        try {
            Ec.waiting('正在更新仓库...');
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
        Ec.waiting('正在克隆仓库...');
        await fsAsync.mkdir(path.dirname(repoPath), { recursive: true });
        gitClone(SPEC_REPO_URL, repoPath, { shallow: true });
        Ec.info('✓ 仓库已克隆');
    }

    return repoPath;
};

/**
 * 验证 Maven 项目结构
 * @param {string} targetDir 目标目录
 * @returns {Object} { isValid: boolean, artifactId: string|null, missing: string[] }
 */
const _validateMavenProject = (targetDir) => {
    const pomPath = path.join(targetDir, 'pom.xml');
    
    // 1. 检查 pom.xml 是否存在
    if (!fs.existsSync(pomPath)) {
        return {
            isValid: false,
            artifactId: null,
            missing: ['pom.xml'],
            error: '目录中未找到 pom.xml 文件'
        };
    }
    
    // 2. 解析 pom.xml 提取 artifactId
    const artifactId = _parsePomXml(pomPath);
    if (!artifactId) {
        return {
            isValid: false,
            artifactId: null,
            missing: ['artifactId'],
            error: '无法从 pom.xml 中提取 artifactId'
        };
    }
    
    // 3. 检查 -domain 模块是否存在
    const missing = [];
    const domainPath = path.join(targetDir, `${artifactId}-domain`);
    
    // 检查同级目录
    if (!fs.existsSync(domainPath)) {
        missing.push(`${artifactId}-domain`);
    }
    
    return {
        isValid: missing.length === 0,
        artifactId: artifactId,
        missing: missing,
        error: missing.length > 0 ? `缺少必需的模块: ${missing.join(', ')}` : null
    };
};

/**
 * 检查目录中是否存在 Flyway 目录（仅考虑 src/main/resources 下）
 * @param {string} targetDir 目标目录
 * @returns {boolean}
 */
const _checkFlywayDirectory = (targetDir) => {
    try {
        const resourcesDir = path.join(targetDir, 'src', 'main', 'resources');
        if (!fs.existsSync(resourcesDir) || !fs.statSync(resourcesDir).isDirectory()) {
            return false;
        }
        const checkDir = (dir, depth = 0) => {
            if (depth > 8) return false;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        const lowerPath = fullPath.toLowerCase();
                        if (lowerPath.includes('flyway') && lowerPath.includes('mysql')) {
                            return true;
                        }
                        if (checkDir(fullPath, depth + 1)) return true;
                    }
                } catch (e) {}
            }
            return false;
        };
        return checkDir(resourcesDir);
    } catch (error) {
        return false;
    }
};

/**
 * 执行 Python 脚本
 * @param {string} targetDir 目标目录（工作目录）
 * @param {string} scriptPath 脚本路径（绝对路径）
 * @param {string[]} [args] 传给脚本的参数，如 ['-i', '.', '-o', '/path/to/out']
 */
const _executePythonScript = async (targetDir, scriptPath, pythonCmd, args = []) => {
    return new Promise((resolve, reject) => {
        Ec.waiting(`🚀 正在执行脚本: ${path.basename(scriptPath).cyan}...`);
        Ec.waiting(`📁 工作目录: ${targetDir.cyan}`);

        const child = spawn(pythonCmd, [scriptPath, ...args], {
            cwd: targetDir,
            stdio: 'inherit',
            shell: false
        });

        child.on('close', (code) => {
            if (code === 0) {
                Ec.info(`✅ 脚本执行成功`);
                resolve();
            } else {
                reject(new Error(`脚本执行失败，退出码: ${code}`));
            }
        });

        child.on('error', (error) => {
            reject(new Error(`执行脚本失败: ${error.message}`));
        });
    });
};

module.exports = async (options) => {
    try {
        // 1. 解析参数
        const dirArg = parseOptional('dir', 'd');
        const entityArg = parseOptional('entity', 'e');
        
        const targetDir = dirArg.hasFlag && dirArg.value 
            ? path.resolve(dirArg.value) 
            : process.cwd();
        
        // 默认从 Entity 生成（-e true 或不传参数）
        const fromEntity = !entityArg.hasFlag || entityArg.value === 'true' || entityArg.value === true;
        
        const mode = fromEntity ? 'Entity (Java Domain)' : 'Database (Flyway SQL)';
        const scriptPath = fromEntity ? SCRIPT_PATH_DOMAIN : SCRIPT_PATH_DATABASE;
        
        Ec.info(`📋 生成模式: ${mode.cyan}`);
        
        // 2. 验证目录是否存在
        if (!fs.existsSync(targetDir)) {
            Ec.error(`❌ 目录不存在: ${targetDir}`);
            process.exit(1);
        }
        
        if (!fs.statSync(targetDir).isDirectory()) {
            Ec.error(`❌ 路径不是目录: ${targetDir}`);
            process.exit(1);
        }
        
        // 3. 如果是 Entity 模式，验证 Maven 项目结构
        if (fromEntity) {
            Ec.waiting('正在验证 Maven 项目结构...');
            const validation = _validateMavenProject(targetDir);
            
            if (!validation.isValid) {
                if (!validation.artifactId) {
                    Ec.error(`❌ ${validation.error}`);
                    if (validation.missing.includes('pom.xml')) {
                        Ec.waiting('请确保指定目录是包含 pom.xml 的 Maven 项目根目录');
                    } else {
                        Ec.waiting('请检查 pom.xml 文件格式是否正确');
                    }
                    console.log('');
                    process.exit(1);
                } else {
                    Ec.error(`❌ ${validation.error}`);
                    console.log('');
                    Ec.waiting(`项目 ID: ${validation.artifactId.cyan}`);
                    Ec.waiting(`缺少的模块:`);
                    validation.missing.forEach(module => {
                        Ec.waiting(`  - ${module.red}`);
                    });
                    console.log('');
                    Ec.waiting('请确保以下模块存在于项目根目录:');
                    Ec.waiting(`  - ${validation.artifactId}-domain`.cyan);
                    console.log('');
                    process.exit(1);
                }
            }
            
            Ec.info(`✓ Maven 项目验证通过`);
            Ec.info(`  项目 ID: ${validation.artifactId.cyan}`);
            Ec.info(`  找到模块: ${validation.artifactId}-domain`.green);

            // 与 mmr0/mmr2 共享 .r2mo/repo：确保仓库存在并可选更新
            Ec.waiting('正在检查 .r2mo/repo 仓库...');
            const gitAvailable = await _isCommandAvailable('git');
            if (!gitAvailable) {
                Ec.warn('⚠ 未找到 git 命令，将跳过仓库拉取；若本地无 .r2mo/repo，文档注释可能缺失');
            } else {
                const gitignorePath = path.join(targetDir, '.gitignore');
                if (exists(gitignorePath)) {
                    const content = fs.readFileSync(gitignorePath, 'utf8');
                    const lines = content.split('\n');
                    const hasEntry = lines.some(line => line.trim() === GITIGNORE_ENTRY);
                    if (!hasEntry) {
                        const newContent = content.endsWith('\n') || content === ''
                            ? content + GITIGNORE_ENTRY + '\n'
                            : content + '\n' + GITIGNORE_ENTRY + '\n';
                        fs.writeFileSync(gitignorePath, newContent);
                    }
                } else {
                    fs.writeFileSync(gitignorePath, GITIGNORE_ENTRY + '\n');
                }
                await _cloneOrUpdateRepository(targetDir);
            }
        } else {
            // Database 模式：检查是否有 flyway 目录
            Ec.waiting('正在检查 Flyway SQL 文件...');
            const hasFlywayDir = _checkFlywayDirectory(targetDir);
            if (!hasFlywayDir) {
                Ec.warn(`⚠ 未在目录中找到 flyway/MYSQL 目录`);
                Ec.waiting('将尝试扫描所有 SQL 文件...');
            } else {
                Ec.info('✓ 找到 Flyway 目录');
            }
        }
        
        // 4. 检查 python3/python 是否安装（优先主命令，备用命令兜底）
        const primaryCmd = process.platform === 'win32' ? 'python' : 'python3';
        const fallbackCmd = process.platform === 'win32' ? 'python3' : 'python';
        let pythonCmd = null;
        if (await _isCommandAvailable(primaryCmd)) {
            pythonCmd = primaryCmd;
        } else if (await _isCommandAvailable(fallbackCmd)) {
            pythonCmd = fallbackCmd;
        }

        if (!pythonCmd) {
            Ec.error('❌ 未找到 python3 或 python 命令');
            console.log('');
            Ec.error('请先安装 Python 3:');
            if (process.platform === 'darwin') {
                console.log('  brew install python3'.cyan);
            } else if (process.platform === 'win32') {
                console.log('  从 https://www.python.org/downloads/ 下载安装'.cyan);
            } else {
                console.log('  sudo apt-get install python3'.cyan);
            }
            console.log('');
            process.exit(1);
        }

        Ec.info(`✓ ${pythonCmd} 已安装`);
        
        // 5. 检查脚本文件是否存在
        const projectRoot = path.resolve(__dirname, '../..');
        const fullScriptPath = path.join(projectRoot, scriptPath);
        
        if (!fs.existsSync(fullScriptPath)) {
            Ec.error(`❌ 脚本文件不存在: ${fullScriptPath}`);
            Ec.waiting(`请确保 ${scriptPath} 文件存在`);
            process.exit(1);
        }
        
        Ec.info(`✓ 找到脚本: ${scriptPath}`);
        
        // 6. 执行 Python 脚本（Database 模式需指定输出到 -ui/.r2mo/domain，与 Domain 模式一致）
        console.log('');
        let scriptArgs = [];
        if (!fromEntity) {
            const rootDir = targetDir.endsWith('-domain') ? path.join(targetDir, '..') : targetDir;
            const artifactId = _parsePomXml(path.join(rootDir, 'pom.xml'));
            const outputDir = artifactId
                ? path.join(rootDir, `${artifactId}-ui`, '.r2mo', 'domain')
                : path.join(targetDir, 'proto');
            scriptArgs = ['-i', targetDir, '-o', outputDir];
            Ec.info(`  输出目录: ${outputDir.cyan}`);
        }
        await _executePythonScript(targetDir, fullScriptPath, pythonCmd, scriptArgs);
        
        process.exit(0);
        
    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        process.exit(1);
    }
};
