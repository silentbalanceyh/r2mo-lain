const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const Ec = require('../epic');
const Args = require('../utils/mxt-args');

// 源 MCP 脚本路径
const SOURCE_MCP_SCRIPT = path.join(__dirname, '../_mcp/skills-server.mjs');

// 必需的依赖包
const REQUIRED_DEPS = ['@modelcontextprotocol/sdk', 'zod', 'front-matter', 'chokidar'];

/**
 * 检查依赖是否已安装
 */
const _checkDependencies = () => {
    const missing = [];
    const projectRoot = path.join(__dirname, '../..');
    for (const dep of REQUIRED_DEPS) {
        const depPath = path.join(projectRoot, 'node_modules', dep);
        if (!fs.existsSync(depPath)) {
            missing.push(dep);
        }
    }
    return { installed: missing.length === 0, missing };
};

/**
 * 显示依赖安装命令
 */
const _showInstallCommand = (missing) => {
    console.log('');
    Ec.error('❌ 缺少必要依赖，请先安装：');
    console.log(`  npm install ${missing.join(' ')}`.cyan);
    console.log('');
};

/**
 * 生成 MCP 脚本内容
 */
const _getMcpScriptContent = () => {
    return `#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import fm from "front-matter";
import os from "os";

const GLOBAL_SKILLS_DIR = process.env.MXT_GLOBAL_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills');
const PROJECT_SKILLS_DIR = process.env.MXT_PROJECT_SKILLS_DIR || path.join(process.cwd(), '.claude', 'skills');

const server = new McpServer({ name: "MXTSkills", version: "2.0.0" });

async function parseSkillFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = fm(content);
    return { attributes: parsed.attributes, body: parsed.body };
  } catch (err) { return null; }
}

async function scanAndRegister(dir, source) {
    if (!fsSync.existsSync(dir)) return;
    try {
        const items = await fs.readdir(dir);
        for (const item of items) {
            const skillDir = path.join(dir, item);
            try {
                if ((await fs.stat(skillDir)).isDirectory()) {
                    const skillFile = path.join(skillDir, 'SKILL.md');
                    if (fsSync.existsSync(skillFile)) {
                         await registerTool(item, skillFile, source);
                    }
                }
            } catch(e){}
        }
    } catch(e) {}
}

async function registerTool(folderName, filePath, source) {
    try {
        const parsed = await parseSkillFile(filePath);
        if(!parsed || !parsed.attributes) return;
        const attr = parsed.attributes;
        const toolName = attr.name || folderName;
        
        const argsSchema = {};
        if (Array.isArray(attr.arguments)) {
             attr.arguments.forEach(arg => {
                 argsSchema[arg.name] = z.string().describe(arg.description || "");
             });
        }

        server.tool(toolName, attr.description || "No desc", argsSchema, async (args) => {
            let res = parsed.body;
            for (const [k, v] of Object.entries(args)) res = res.replace(new RegExp(\`{{\\\${k}}}\`, 'g'), v);
            return { content: [{ type: "text", text: res }] };
        });
    } catch(e) { console.error(e); }
}

async function main() {
  await scanAndRegister(PROJECT_SKILLS_DIR, 'project');
  await scanAndRegister(GLOBAL_SKILLS_DIR, 'global');
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(err => { console.error(err); process.exit(1); });
`;
};

/**
 * 确保源 MCP 脚本存在
 */
const _ensureSourceScript = () => {
    const mcpDir = path.dirname(SOURCE_MCP_SCRIPT);
    if (!fs.existsSync(mcpDir)) {
        fs.mkdirSync(mcpDir, { recursive: true });
    }
    fs.writeFileSync(SOURCE_MCP_SCRIPT, _getMcpScriptContent());
};

/**
 * 拷贝 MCP 脚本到项目目录
 * @param {string} projectDir 项目目录
 * @returns {string} 目标脚本路径
 */
const _copyMcpScriptToProject = (projectDir) => {
    const targetDir = path.join(projectDir, '.r2mo', 'mcpserver');
    const targetScript = path.join(targetDir, 'skills-server.mjs');
    
    // 创建目录
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        Ec.waiting(`创建目录: ${targetDir}`);
    }
    
    // 拷贝脚本
    const content = _getMcpScriptContent();
    fs.writeFileSync(targetScript, content);
    Ec.waiting(`✓ MCP 脚本已拷贝到: ${targetScript}`);
    
    return targetScript;
};

/**
 * 更新 .cursor/mcp.json 配置
 * @param {string} projectDir 项目目录
 * @param {string} mcpScriptPath MCP 脚本路径
 * @param {string} skillsDir 技能目录路径
 */
const _updateMcpConfig = (projectDir, mcpScriptPath, skillsDir) => {
    const cursorDir = path.join(projectDir, '.cursor');
    const mcpConfigPath = path.join(cursorDir, 'mcp.json');
    
    // 确保 .cursor 目录存在
    if (!fs.existsSync(cursorDir)) {
        fs.mkdirSync(cursorDir, { recursive: true });
        Ec.waiting(`创建目录: ${cursorDir}`);
    }
    
    // 读取现有配置或创建新配置
    let config = { mcpServers: {} };
    
    if (fs.existsSync(mcpConfigPath)) {
        try {
            const content = fs.readFileSync(mcpConfigPath, 'utf8');
            config = JSON.parse(content);
            if (!config.mcpServers) {
                config.mcpServers = {};
            }
            Ec.waiting(`读取现有配置: ${mcpConfigPath}`);
        } catch (e) {
            Ec.warn(`配置文件解析失败，将创建新配置`);
            config = { mcpServers: {} };
        }
    }
    
    // 添加/更新 mxt-skills 配置
    config.mcpServers['mxt-skills'] = {
        command: 'node',
        args: [mcpScriptPath],
        env: {
            NODE_ENV: 'production',
            MXT_PROJECT_SKILLS_DIR: skillsDir,
            MXT_GLOBAL_SKILLS_DIR: path.join(os.homedir(), '.claude', 'skills')
        },
        disabled: false,
        alwaysAllow: []
    };
    
    // 写入配置
    fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
    Ec.info(`✓ MCP 配置已更新: ${mcpConfigPath}`);
    
    return mcpConfigPath;
};

/**
 * 确保 .r2mo/mcpserver 在 .gitignore 中
 * @param {string} projectDir 项目目录
 */
const _ensureGitIgnore = (projectDir) => {
    const gitignorePath = path.join(projectDir, '.gitignore');
    const ignoreEntry = '.r2mo/mcpserver';
    
    try {
        let content = '';
        if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf8');
        }
        
        const lines = content.split('\n');
        const hasEntry = lines.some(line => line.trim() === ignoreEntry);
        
        if (!hasEntry) {
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

// MCP 子项目依赖及版本（front-matter 仅存在 4.0.2，勿用 ^4.0.3）
const MCP_PACKAGE_DEPS = {
    '@modelcontextprotocol/sdk': '^1.0.0',
    'front-matter': '4.0.2',
    'zod': '^3.22.0',
    'chokidar': '^3.5.0'
};

/**
 * 在 .r2mo/mcpserver 目录中安装依赖
 * @param {string} projectDir 项目目录
 */
const _installDependencies = (projectDir) => {
    const mcpServerDir = path.join(projectDir, '.r2mo', 'mcpserver');
    
    // 确保目录存在
    if (!fs.existsSync(mcpServerDir)) {
        fs.mkdirSync(mcpServerDir, { recursive: true });
    }
    
    const packageJsonPath = path.join(mcpServerDir, 'package.json');
    let packageJson;
    if (fs.existsSync(packageJsonPath)) {
        try {
            packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            packageJson.dependencies = packageJson.dependencies || {};
            Object.assign(packageJson.dependencies, MCP_PACKAGE_DEPS);
            packageJson.type = packageJson.type || 'module';
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
            Ec.waiting(`已同步 MCP 依赖版本: ${packageJsonPath}`);
        } catch (e) {
            Ec.warn(`读取/更新 package.json 失败: ${e.message}`);
        }
    } else {
        packageJson = {
            name: 'mxt-mcp-server',
            version: '1.0.0',
            type: 'module',
            dependencies: { ...MCP_PACKAGE_DEPS }
        };
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        Ec.waiting(`创建 package.json: ${packageJsonPath}`);
    }
    
    // 执行 npm install
    try {
        Ec.waiting('正在安装 MCP 依赖...');
        execSync('npm install', {
            cwd: mcpServerDir,
            stdio: 'inherit',
            shell: process.platform === 'win32'
        });
        Ec.info('✓ MCP 依赖安装完成');
    } catch (error) {
        Ec.warn(`⚠ 依赖安装失败: ${error.message}`);
        Ec.warn('   请手动执行: cd .r2mo/mcpserver && npm install');
    }
};

module.exports = async (options) => {
    try {
        const opts = Args.parseStandard(options);
        const dirOpt = opts.dir || opts.d || '.';
        let projectDir = path.resolve(process.cwd(), dirOpt);
        // 若当前目录已是 .r2mo/mcpserver，则使用其上级作为项目根，避免路径出现 .r2mo/mcpserver/.r2mo/mcpserver
        const baseName = path.basename(projectDir);
        const parentName = path.basename(path.dirname(projectDir));
        if (baseName === 'mcpserver' && parentName === '.r2mo') {
            projectDir = path.resolve(projectDir, '..', '..');
        }
        const skillsDir = path.join(projectDir, '.claude', 'skills');

        Ec.waiting(`项目目录（拷贝与加载路径）: ${projectDir}`);
        
        // 1. 检查依赖
        Ec.waiting('正在检查依赖...');
        const { installed, missing } = _checkDependencies();
        
        if (!installed) {
            _showInstallCommand(missing);
            process.exit(1);
        }
        Ec.info('✓ 所有依赖已安装');
        
        // 2. 确保源脚本存在
        _ensureSourceScript();
        
        // 3. 拷贝 MCP 脚本到项目
        console.log('');
        const mcpScriptPath = _copyMcpScriptToProject(projectDir);
        
        // 4. 更新 .cursor/mcp.json
        console.log('');
        const mcpConfigPath = _updateMcpConfig(projectDir, mcpScriptPath, skillsDir);
        
        // 5. 更新 .gitignore
        _ensureGitIgnore(projectDir);
        
        // 6. 安装 MCP 依赖
        console.log('');
        _installDependencies(projectDir);
        
        // 7. 显示结果
        // 将项目目录内的绝对路径转换为 {ROOT} 相对路径
        const formatPath = (absPath) => {
            if (absPath.startsWith(projectDir)) {
                return absPath.replace(projectDir, '{ROOT}');
            }
            return absPath;
        };
        
        const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
        
        console.log('');
        console.log('─'.repeat(60));
        console.log(' MCP Skills Server 配置完成'.green);
        console.log('─'.repeat(60));
        console.log(` 脚本位置: ${formatPath(mcpScriptPath)}`);
        console.log(` 配置文件: ${formatPath(mcpConfigPath)}`);
        console.log(` 项目技能: ${formatPath(skillsDir)}`);
        console.log(` 全局技能: ${globalSkillsPath}`);
        console.log('─'.repeat(60));
        console.log('');
        console.log(`  {ROOT} = 当前目录`.gray);
        console.log('');
        
        // 8. 读取并打印 mcp.json 内容，复制到剪切板
        try {
            const mcpConfigContent = fs.readFileSync(mcpConfigPath, 'utf8');
            const mcpConfigJson = JSON.parse(mcpConfigContent);
            const formattedJson = JSON.stringify(mcpConfigJson, null, 2);
            
            console.log('─'.repeat(60));
            console.log(' MCP 配置文件内容'.green);
            console.log('─'.repeat(60));
            console.log(formattedJson);
            console.log('─'.repeat(60));
            console.log('');
            
            // 复制到剪切板
            try {
                await Ec.outCopy(formattedJson);
                Ec.info('✓ 配置内容已复制到剪切板');
            } catch (copyError) {
                Ec.warn(`⚠ 复制到剪切板失败: ${copyError.message}`);
                Ec.warn('   请手动复制上述配置内容');
            }
        } catch (readError) {
            Ec.warn(`⚠ 读取配置文件失败: ${readError.message}`);
        }
        
        console.log('');
        Ec.info('🎉 配置完成！重启 Cursor 后生效');
        
        process.exit(0);
    } catch (error) {
        Ec.error(`❌ 执行失败: ${error.message}`);
        process.exit(1);
    }
};
