/**
 * LLM command implementation
 *
 * 查看所有大模型配置信息，包括名称、token、主页等
 */

const fs = require('fs');
const path = require('path');

const llmCommand = (context) => {
    console.log('');
    console.log('大模型配置信息：'.bold.brightCyan);

    // 定义所有支持的 LLM 及其主页信息
    const llmInfo = {
        'openspec': { name: 'OpenSpec', homepage: 'https://openspec.dev/', isLLM: false },
        'spec-kit': { name: 'SpecKit', homepage: 'https://github.com/github/spec-kit', isLLM: false },
        'kiro': { name: 'Kiro', homepage: 'https://kiro.dev/', isLLM: false },
        'trea': { name: 'Trea', homepage: 'https://www.trae.ai/', isLLM: false },
        'cursor': { name: 'Cursor', homepage: 'https://cursor.com/', isLLM: false },
        'lingma': { name: 'Lingma', homepage: 'https://lingma.aliyun.com/', isLLM: false },
        'qoder': { name: 'Qoder', homepage: 'https://qoder.com/', isLLM: false },
        'windsurf': { name: 'WindSurf', homepage: 'https://windsurf.com/', isLLM: false },
        'github': { name: 'GitHub Copilot', homepage: 'https://github.com/features/copilot', isLLM: false },
        'claude-code': { name: 'Claude Code', homepage: 'https://claude.ai/code', isLLM: true },
        'chatgpt': { name: 'ChatGPT', homepage: 'https://chatgpt.com/', isLLM: true },
        'auggie': { name: 'Auggie', homepage: 'https://auggie.dev', isLLM: false },
        'cline': { name: 'Cline', homepage: 'https://cline.bot/', isLLM: false },
        'roocode': { name: 'RooCode', homepage: 'https://roocode.com', isLLM: false },
        'codebuddy': { name: 'CodeBuddy', homepage: 'https://codebuddy.ai', isLLM: false },
        'crush': { name: 'Crush', homepage: 'https://github.com/charmbracelet/crush', isLLM: false },
        'factory': { name: 'Factory Droid', homepage: 'https://factory.ai/', isLLM: false },
        'gemini': { name: 'Gemini', homepage: 'https://gemini.google.com', isLLM: true },
        'opencode': { name: 'OpenCode', homepage: 'https://opencode.ai', isLLM: false },
        'kilo': { name: 'Kilo Code', homepage: 'https://kilo.ai/', isLLM: false },
        'codex': { name: 'Codex', homepage: 'https://chatgpt.com/codex', isLLM: false },
        'qwen': { name: 'Qwen Code', homepage: 'https://chat.qwen.ai/', isLLM: true },
        'deepseek': { name: 'Deep Seek', homepage: 'https://www.deepseek.com/', isLLM: true },
        'silicon': { name: 'Silicon Flow', homepage: 'https://www.siliconflow.com/', isLLM: false },
        'kimi': { name: 'Kimi', homepage: 'https://www.kimi.com/', isLLM: false },
        'grok': { name: 'Grok', homepage: 'https://grok.com/', isLLM: true }
    };

    // 获取当前项目中的 integration 目录
    const integrationBaseDir = path.resolve(process.cwd(), 'integration');

    // 确保 integration 目录存在
    if (!fs.existsSync(integrationBaseDir)) {
        try {
            fs.mkdirSync(integrationBaseDir, { recursive: true });
        } catch (e) {
            // 创建目录出错
            console.log('  无法创建 integration 目录'.brightRed);
            console.log('');
            return;
        }
    }

    // 获取所有 integration 目录
    let integrationDirs = [];
    try {
        if (fs.existsSync(integrationBaseDir)) {
            integrationDirs = fs.readdirSync(integrationBaseDir)
                .filter(dir => fs.statSync(path.join(integrationBaseDir, dir)).isDirectory());
        }
    } catch (e) {
        // 读取目录出错
        console.log('  无法读取 integration 目录'.brightRed);
        console.log('');
        return;
    }

    // 构建所有支持模型的数据
    const allModels = Object.keys(llmInfo).map(key => {
        const info = llmInfo[key];
        return {
            dir: key,
            name: info.name,
            homepage: info.homepage,
            isLLM: info.isLLM
        };
    });

    // 获取每个目录的详细信息并排序
    const llmData = allModels.map(model => {
        let name = model.name;
        let homepage = model.homepage;
        let configured = ''; // 默认为空
        let isLLM = model.isLLM;

        // 尝试读取对应 integration 目录中的 config.json
        try {
            const configPath = path.resolve(integrationBaseDir, model.dir, 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                const token = config.token || '-';

                // 处理 token 显示，避免显示完整 token
                if (token !== '-' && token.length > 0) {
                    configured = '✅'; // 有token则标记为已配置
                } else if (isLLM) {
                    configured = '❌'; // 是LLM但没有token
                }
            } else if (isLLM) {
                configured = '❌'; // 是LLM但没有配置文件
                
                // 自动创建目录和基本配置文件
                const modelDir = path.resolve(integrationBaseDir, model.dir);
                if (!fs.existsSync(modelDir)) {
                    fs.mkdirSync(modelDir, { recursive: true });
                }
                
                // 创建默认配置文件
                const defaultConfig = {
                    llm: model.dir,
                    token: "",
                    baseUrl: "",
                    model: "",
                    temperature: 0.7,
                    maxTokens: 2048,
                    topP: 1,
                    frequencyPenalty: 0,
                    presencePenalty: 0
                };
                
                const configPath = path.resolve(modelDir, 'config.json');
                if (!fs.existsSync(configPath)) {
                    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
                }
            } else if (!isLLM) {
                // 对于非LLM，如果没有配置文件也创建一个
                const modelDir = path.resolve(integrationBaseDir, model.dir);
                if (!fs.existsSync(modelDir)) {
                    fs.mkdirSync(modelDir, { recursive: true });
                }
                
                // 创建默认配置文件
                const defaultConfig = {
                    llm: model.dir,
                    token: "",
                    baseUrl: "",
                    model: "",
                    temperature: 0.7,
                    maxTokens: 2048,
                    topP: 1,
                    frequencyPenalty: 0,
                    presencePenalty: 0
                };
                
                const configPath = path.resolve(modelDir, 'config.json');
                if (!fs.existsSync(configPath)) {
                    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
                }
            }
        } catch (e) {
            // 读取配置文件出错
        }

        // 如果是LLM，在名称后添加(LLM)和emoji
        if (isLLM) {
            name = name + ' (LLM) 🌟';
        }

        return {
            dir: model.dir,
            name: name,
            homepage: homepage,
            configured: configured,
            isLLM: isLLM
        };
    });

    // 按类型排序，LLM优先，然后按名称排序
    llmData.sort((a, b) => {
        // 首先按类型排序（LLM在前）
        if (a.isLLM && !b.isLLM) return -1;
        if (!a.isLLM && b.isLLM) return 1;
        // 然后按名称排序
        return a.name.localeCompare(b.name);
    });

    // 表格头部，调整列宽
    console.log('  ' + '名称'.padEnd(25) + '标识符'.padEnd(15) + '主页'.padEnd(45) + '状态');
    console.log('  ' + '-'.repeat(85));

    // 显示每个 LLM 的信息
    llmData.forEach(item => {
        // 输出格式：名称  标识符  主页  状态
        console.log('  ' + item.name.padEnd(25) + item.dir.padEnd(15) + item.homepage.padEnd(45) + item.configured);
    });

    console.log('');
};

module.exports = llmCommand;