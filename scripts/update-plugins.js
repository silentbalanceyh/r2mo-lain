#!/usr/bin/env node
/**
 * scripts/update-plugins.js
 *
 * 检查并更新 src/_template/LAIN/.obsidian/plugins/ 下的 Obsidian 社区插件到最新 release 版本。
 *
 * 用法:
 *   node scripts/update-plugins.js                        # 检查并更新所有插件
 *   node scripts/update-plugins.js --check                # 仅检查，不下载
 *   node scripts/update-plugins.js --plugin dataview       # 只更新指定插件
 *   node scripts/update-plugins.js --mirror ghfast         # 使用 GitHub 镜像加速
 *   node scripts/update-plugins.js --mirror auto           # 自动检测可用镜像
 *
 * 镜像选项:
 *   --mirror ghfast    使用 https://ghfast.top 代理
 *   --mirror ghproxy    使用 https://ghproxy.net 代理
 *   --mirror moeyy       使用 https://github.moeyy.xyz 代理
 *   --mirror auto        依次尝试所有镜像，选择第一个可用的
 *   不传则直连 github.com
 *
 * 原理:
 *   不依赖 GitHub API（避免速率限制），而是利用 GitHub releases/latest/download/ 的
 *   302 重定向机制获取版本号和实际下载地址。
 *
 * 依赖: 仅 Node.js 内置模块（fs / path / https），无需额外安装。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── 路径常量 ──────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const PLUGINS_DIR = path.join(ROOT, 'src', '_template', 'LAIN', '.obsidian', 'plugins');

// ─── Obsidian 官方社区插件目录 ───────────────────────────
const OBSIDIAN_REGISTRY_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json';
const OBSIDIAN_PLUGIN_STATS_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json';

// ─── 插件 ID → GitHub 仓库映射兜底（官方目录缺失时使用） ─────────────
const REPO_MAP = {
    'dataview': 'blacksmithgu/obsidian-dataview',
    'obsidian-excalidraw-plugin': 'zsviczian/obsidian-excalidraw-plugin',
    'obsidian-git': 'Vinzent03/obsidian-git',
    'obsidian-kanban': 'community-archive/obsidian-kanban',
    'obsidian-meta-bind-plugin': 'mProjectsCode/obsidian-meta-bind-plugin',
    'obsidian-plantuml': 'joethei/obsidian-plantuml',
    'obsidian-shellcommands': 'Taitava/obsidian-shellcommands',
    'obsidian-tasks-plugin': 'obsidian-tasks-group/obsidian-tasks',
    'obsidian42-brat': 'TfTHacker/obsidian42-brat',
    'realclaudian': 'YishenTu/claudian',
    'templater-obsidian': 'SilentVoid13/Templater',
    'terminal': 'polyipseity/obsidian-terminal'
};

// 每个 release 需要下载的文件名（Obsidian 插件标准三件套）
const ASSET_FILES = ['main.js', 'manifest.json', 'styles.css'];

// ─── GitHub 镜像列表 ──────────────────────────────────────
const MIRRORS = {
    'direct': '',                          // 直连
    'ghfast': 'https://ghfast.top/',       // ghfast.top
    'ghproxy': 'https://ghproxy.net/',     // ghproxy.net
    'moeyy': 'https://github.moeyy.xyz/'   // github.moeyy.xyz
};

// ─── 日志辅助 ──────────────────────────────────────────────
const info = (msg) => console.info('\x1b[32m[MXT]\x1b[0m ' + msg);
const warn = (msg) => console.warn('\x1b[33m[MXT]\x1b[0m ' + msg);
const error = (msg) => console.error('\x1b[31m[MXT]\x1b[0m ' + msg);
const waiting = (msg) => console.info('\x1b[34m[MXT]\x1b[0m ' + msg);

// ─── 延迟（毫秒） ──────────────────────────────────────────
function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// ─── 构造最终 URL（带镜像前缀） ───────────────────────────
function buildUrl(mirrorPrefix, githubUrl) {
    if (mirrorPrefix) {
        // 镜像地址格式: https://ghfast.top/https://github.com/...
        return mirrorPrefix + githubUrl;
    }
    return githubUrl;
}


// ─── 解析相对 URL ──────────────────────────────────────────
function resolveUrl(from, to) {
    if (to.startsWith('http://') || to.startsWith('https://')) {
        return to;
    }
    // 相对路径
    const fromUrl = new URL(from);
    if (to.startsWith('/')) {
        return fromUrl.protocol + '//' + fromUrl.host + to;
    }
    // 相对于当前路径
    const basePath = fromUrl.pathname.substring(0, fromUrl.pathname.lastIndexOf('/') + 1);
    return fromUrl.protocol + '//' + fromUrl.host + basePath + to;
}

// ─── 下载到字符串 ──────────────────────────────────────────
function downloadToString(url, timeoutMs) {
    if (timeoutMs === undefined) timeoutMs = 60000;
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'mxt-plugin-updater' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { return downloadToString(resolveUrl(url, res.headers.location), timeoutMs).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error('HTTP ' + res.statusCode));
            }
            let data = '';
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () { resolve(data); });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, function () { req.destroy(new Error('timeout')); });
    });
}

// ─── HTTPS 下载文件（支持重定向） ─────────────────────────
function downloadFile(url, dest, timeoutMs) {
    if (timeoutMs === undefined) timeoutMs = 180000;
    // 下载到临时文件，成功后原子重命名，避免下载失败产生空文件
    var tmpDest = dest + '.tmp';
    return new Promise((resolve, reject) => {
        var file = fs.createWriteStream(tmpDest);
        var cleanedUp = false;
        function cleanup() {
            if (cleanedUp) return;
            cleanedUp = true;
            try { fs.unlinkSync(tmpDest); } catch (e) {}
        }
        var req = https.get(url, { headers: { 'User-Agent': 'mxt-plugin-updater' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                cleanup();
                return downloadFile(resolveUrl(url, res.headers.location), dest, timeoutMs).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                cleanup();
                return reject(new Error('HTTP ' + res.statusCode));
            }
            res.pipe(file);
            file.on('finish', function () {
                file.close();
                // 验证文件非空
                var stats = fs.statSync(tmpDest);
                if (stats.size === 0) {
                    cleanup();
                    return reject(new Error('下载文件为空'));
                }
                // 原子重命名
                try {
                    fs.renameSync(tmpDest, dest);
                    resolve();
                } catch (e) {
                    cleanup();
                    reject(e);
                }
            });
        });
        req.on('error', function (e) {
            file.close();
            cleanup();
            reject(e);
        });
        req.setTimeout(timeoutMs, function () {
            req.destroy(new Error('download timeout: ' + url));
        });
    });
}

// ─── 从重定向获取 release tag ─────────────────────────────
/**
 * 通过 HEAD 请求 releases/latest/download/manifest.json，
 * 从 302 重定向的 Location 中提取 release tag。
 *
 * @param {string} repo 仓库 "owner/repo"
 * @param {string} mirrorPrefix 镜像前缀
 * @returns {Promise<{tag: string|null, error: string|null}>}
 */
function fetchLatestVersion(repo, mirrorPrefix) {
    return new Promise((resolve) => {
        const latestUrl = buildUrl(mirrorPrefix, 'https://github.com/' + repo + '/releases/latest/download/manifest.json');
        const req = https.get(latestUrl, { headers: { 'User-Agent': 'mxt-plugin-updater' } }, (res) => {
            // 第一层 302 重定向 → 真实下载 URL
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const finalUrl = res.headers.location;
                // 从 URL 提取 tag: .../releases/download/TAG/manifest.json
                const match = finalUrl.match(/\/releases\/download\/([^/]+)\//);
                resolve({
                    tag: match ? match[1] : null,
                    version: match ? match[1].replace(/^v/, '') : null,
                    error: null
                });
            } else if (res.statusCode === 404) {
                resolve({ tag: null, version: null, error: '仓库无 release (404)' });
            } else {
                // 消费 body 防止连接泄漏
                res.resume();
                resolve({ tag: null, version: null, error: 'HTTP ' + res.statusCode });
            }
        });
        req.on('error', function (e) {
            resolve({ tag: null, version: null, error: e.message });
        });
        req.setTimeout(30000, function () { req.destroy(new Error('timeout')); });
    });
}

// ─── 测试镜像是否可用 ──────────────────────────────────────
function testMirror(mirrorPrefix) {
    return new Promise((resolve) => {
        const testUrl = buildUrl(mirrorPrefix, 'https://github.com/blacksmithgu/obsidian-dataview/releases/latest/download/manifest.json');
        const req = https.get(testUrl, { headers: { 'User-Agent': 'mxt-plugin-updater' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(true);
            } else {
                resolve(res.statusCode === 200);
            }
            res.resume();
        });
        req.on('error', function () { resolve(false); });
        req.setTimeout(15000, function () { req.destroy(); resolve(false); });
    });
}

// ─── 自动检测可用镜像 ──────────────────────────────────────
async function detectMirror() {
    warn('正在检测可用的 GitHub 镜像...');
    const names = Object.keys(MIRRORS);
    for (const name of names) {
        const prefix = MIRRORS[name];
        if (!prefix) continue; // 跳过 direct
        process.stdout.write('  测试 ' + name + ' (' + prefix + ')... ');
        const ok = await testMirror(prefix);
        if (ok) {
            console.log('\x1b[32m可用\x1b[0m');
            return { name: name, prefix: prefix };
        }
        console.log('\x1b[31m不可用\x1b[0m');
    }
    // 最后测试直连
    process.stdout.write('  测试 direct (github.com)... ');
    const directOk = await testMirror('');
    if (directOk) {
        console.log('\x1b[32m可用\x1b[0m');
        return { name: 'direct', prefix: '' };
    }
    console.log('\x1b[31m不可用\x1b[0m');
    return null;
}

// ─── 读取插件 manifest.json ───────────────────────────────
function readManifest(pluginDir) {
    const manifestPath = path.join(pluginDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
        return null;
    }
}

// ─── 版本比较（只比较数字段；用于 Obsidian 兼容版本筛选） ───────────
function compareVersions(a, b) {
    const pa = String(a || '0').replace(/^v/, '').split(/[.-]/).map(function (x) { return parseInt(x, 10) || 0; });
    const pb = String(b || '0').replace(/^v/, '').split(/[.-]/).map(function (x) { return parseInt(x, 10) || 0; });
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da > db) return 1;
        if (da < db) return -1;
    }
    return 0;
}

function isVersionLike(value) {
    return typeof value === 'string' && /^v?\d+\.\d+\.\d+/.test(value);
}

function fetchJson(url, timeoutMs) {
    return downloadToString(url, timeoutMs || 60000).then(function (text) {
        return JSON.parse(text);
    });
}

async function fetchObsidianRegistry() {
    const plugins = await fetchJson(OBSIDIAN_REGISTRY_URL);
    const registry = {};
    for (const plugin of plugins) {
        if (plugin && plugin.id && plugin.repo) registry[plugin.id] = plugin.repo;
    }
    return registry;
}

async function fetchObsidianPluginStats() {
    return fetchJson(OBSIDIAN_PLUGIN_STATS_URL);
}

function latestVersionFromStats(pluginStats) {
    if (!pluginStats || typeof pluginStats !== 'object') return null;
    const versions = Object.keys(pluginStats)
        .filter(function (key) { return isVersionLike(key); })
        .map(function (key) { return key.replace(/^v/, ''); })
        .sort(compareVersions);
    return versions.length > 0 ? versions[versions.length - 1] : null;
}

async function fetchRepoManifest(repo, ref = 'HEAD') {
    return fetchJson('https://raw.githubusercontent.com/' + repo + '/' + ref + '/manifest.json');
}

async function fetchCompatibleVersion(repo, latestVersion, obsidianVersion, ref = 'HEAD') {
    if (!obsidianVersion) {
        return latestVersion;
    }

    try {
        const versions = await fetchJson('https://raw.githubusercontent.com/' + repo + '/' + ref + '/versions.json');
        const entries = Object.entries(versions || {})
            .filter(function ([pluginVersion]) { return isVersionLike(pluginVersion); });
        const candidates = entries
            .filter(function ([pluginVersion, minAppVersion]) {
                return compareVersions(pluginVersion, latestVersion) <= 0
                    && compareVersions(obsidianVersion, minAppVersion) >= 0;
            })
            .map(function ([pluginVersion]) { return pluginVersion.replace(/^v/, ''); })
            .sort(compareVersions);
        return candidates.length > 0 ? candidates[candidates.length - 1] : latestVersion;
    } catch (e) {
        return latestVersion;
    }
}

function detectLocalObsidianVersion() {
    try {
        if (process.platform === 'darwin') {
            const plist = '/Applications/Obsidian.app/Contents/Info.plist';
            if (fs.existsSync(plist)) {
                return execSync('/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "' + plist + '"', { stdio: 'pipe' })
                    .toString()
                    .trim();
            }
        }
    } catch (e) {}
    return null;
}

// ─── 解析命令行参数 ────────────────────────────────────────
const argv = process.argv.slice(2);
const checkOnly = argv.indexOf('--check') !== -1;
const pluginFlagIdx = argv.indexOf('--plugin');
const targetPlugin = (pluginFlagIdx !== -1 && argv[pluginFlagIdx + 1])
    ? argv[pluginFlagIdx + 1]
    : null;
const mirrorFlagIdx = argv.indexOf('--mirror');
const mirrorChoice = (mirrorFlagIdx !== -1 && argv[mirrorFlagIdx + 1])
    ? argv[mirrorFlagIdx + 1]
    : null;
const obsidianVersionFlagIdx = argv.indexOf('--obsidian-version');
const explicitObsidianVersion = (obsidianVersionFlagIdx !== -1 && argv[obsidianVersionFlagIdx + 1])
    ? argv[obsidianVersionFlagIdx + 1]
    : null;

// ─── 主流程 ────────────────────────────────────────────────
(async function () {
    info('Obsidian 插件更新工具');
    info('插件目录: ' + PLUGINS_DIR);
    console.log('');

    if (!fs.existsSync(PLUGINS_DIR)) {
        error('插件目录不存在: ' + PLUGINS_DIR);
        process.exit(1);
    }

    // ─── 确定镜像 ────────────────────────────────────────
    let mirrorName = 'direct';
    let mirrorPrefix = '';

    if (mirrorChoice === 'auto') {
        const detected = await detectMirror();
        if (!detected) {
            error('✗ 所有镜像均不可用，请检查网络连接');
            process.exit(1);
        }
        mirrorName = detected.name;
        mirrorPrefix = detected.prefix;
    } else if (mirrorChoice && MIRRORS[mirrorChoice] !== undefined) {
        mirrorName = mirrorChoice;
        mirrorPrefix = MIRRORS[mirrorChoice];
    } else if (mirrorChoice) {
        // 用户传了自定义镜像前缀
        mirrorName = 'custom';
        mirrorPrefix = mirrorChoice;
    }

    if (mirrorPrefix) {
        info('使用镜像: ' + mirrorName + ' (' + mirrorPrefix + ')');
    } else {
        info('直连 github.com');
    }

    const obsidianVersion = explicitObsidianVersion || detectLocalObsidianVersion();
    if (obsidianVersion) {
        info('Obsidian 兼容版本: ' + obsidianVersion);
    } else {
        warn('未检测到 Obsidian 版本，将使用插件官方 manifest.json 的最新版');
    }

    let officialRegistry = {};
    let officialStats = {};
    try {
        officialRegistry = await fetchObsidianRegistry();
        info('已加载 Obsidian 官方插件目录');
    } catch (e) {
        warn('⚠ 无法加载 Obsidian 官方插件目录，回退到本地仓库映射: ' + e.message);
    }
    try {
        officialStats = await fetchObsidianPluginStats();
        info('已加载 Obsidian 官方插件版本索引');
    } catch (e) {
        warn('⚠ 无法加载 Obsidian 官方插件版本索引，将回退到插件仓库版本信息: ' + e.message);
    }
    console.log('');

    const allPlugins = fs.readdirSync(PLUGINS_DIR)
        .filter(function (name) {
            return fs.statSync(path.join(PLUGINS_DIR, name)).isDirectory();
        })
        .filter(function (name) {
            return fs.existsSync(path.join(PLUGINS_DIR, name, 'manifest.json'));
        });

    const plugins = targetPlugin
        ? allPlugins.filter(function (name) { return name === targetPlugin; })
        : allPlugins;

    if (plugins.length === 0) {
        warn(targetPlugin ? '未找到插件: ' + targetPlugin : '未找到任何插件');
        process.exit(1);
    }

    const results = [];
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < plugins.length; i++) {
        const pluginId = plugins[i];
        const pluginDir = path.join(PLUGINS_DIR, pluginId);
        const manifest = readManifest(pluginDir);
        if (!manifest) {
            warn('⚠ ' + pluginId + ': 无法读取 manifest.json，跳过');
            results.push({ pluginId: pluginId, current: '?', latest: '?', status: 'skip' });
            skipped++;
            continue;
        }

        const currentVersion = manifest.version || '?';
        const repo = officialRegistry[pluginId] || REPO_MAP[pluginId];

        if (!repo) {
            warn('⚠ ' + pluginId + ': 未在 Obsidian 官方目录或本地映射中找到 GitHub 仓库，跳过');
            results.push({ pluginId: pluginId, current: currentVersion, latest: '?', status: 'no-repo' });
            skipped++;
            continue;
        }

        waiting('正在检查 ' + pluginId + ' (' + repo + ')...');

        const latestRelease = await fetchLatestVersion(repo, mirrorPrefix);
        let latestVersion = latestRelease.version;
        let latestManifest;

        if (!latestVersion) {
            try {
                latestManifest = await fetchRepoManifest(repo);
                latestVersion = latestManifest.version ? String(latestManifest.version).replace(/^v/, '') : null;
            } catch (e) {
                error('✗ ' + pluginId + ': 无法读取官方 manifest.json: ' + e.message);
                results.push({ pluginId: pluginId, current: currentVersion, latest: '?', status: 'fail' });
                failed++;
                if (i < plugins.length - 1) await sleep(500);
                continue;
            }
        }

        if (!latestVersion) {
            latestVersion = latestVersionFromStats(officialStats[pluginId]) || '?';
        }

        try {
            if (!latestManifest) {
                latestManifest = await fetchRepoManifest(repo, latestRelease.tag || 'HEAD');
            }
        } catch (e) {
            latestManifest = null;
        }

        latestVersion = await fetchCompatibleVersion(repo, latestVersion, obsidianVersion, latestRelease.tag || 'HEAD');

        const versionCompare = compareVersions(currentVersion, latestVersion);

        if (versionCompare >= 0) {
            if (versionCompare > 0) {
                info('✓ ' + pluginId + ': ' + currentVersion + ' (当前版本高于 release，跳过)');
                results.push({ pluginId: pluginId, current: currentVersion, latest: latestVersion, status: 'newer' });
            } else {
                info('✓ ' + pluginId + ': ' + currentVersion + ' (已是最新)');
                results.push({ pluginId: pluginId, current: currentVersion, latest: latestVersion, status: 'latest' });
            }
            skipped++;
        } else if (latestVersion === '?') {
            warn('⚠ ' + pluginId + ': 无法确定最新版本号，跳过');
            results.push({ pluginId: pluginId, current: currentVersion, latest: '?', status: 'fail' });
            failed++;
        } else {
            info('当前版本: ' + currentVersion + '  →  最新版本: ' + latestVersion);

            if (checkOnly) {
                warn('→ --check 模式，跳过下载');
                results.push({ pluginId: pluginId, current: currentVersion, latest: latestVersion, status: 'check-only' });
            } else {
                const downloadTag = latestRelease.tag || latestVersion;
                const baseDownloadUrl = buildUrl(mirrorPrefix, 'https://github.com/' + repo + '/releases/download/' + downloadTag);

                let downloadOk = true;
                for (const file of ASSET_FILES) {
                    const fileUrl = baseDownloadUrl + '/' + file;
                    const destPath = path.join(pluginDir, file);
                    try {
                        waiting('  下载 ' + file + '...');
                        await downloadFile(fileUrl, destPath);
                        if (file === 'manifest.json') {
                            const downloadedManifest = readManifest(pluginDir);
                            if (downloadedManifest && downloadedManifest.version !== latestVersion) {
                                downloadedManifest.version = latestVersion;
                                fs.writeFileSync(destPath, JSON.stringify(downloadedManifest, null, 2) + '\n');
                                warn('  → manifest.json 版本已按 Obsidian 索引校正为 ' + latestVersion);
                            }
                        }
                        info('  ✓ ' + file + ' 完成');
                    } catch (e) {
                        if (file === 'styles.css' && e.message.indexOf('HTTP 404') !== -1) {
                            info('  → ' + file + ' 不存在（该插件无 CSS，属正常）');
                        } else {
                            error('  ✗ ' + file + ' 下载失败: ' + e.message);
                            downloadOk = false;
                        }
                    }
                }

                if (downloadOk) {
                    info('✓ ' + pluginId + ': 已更新 ' + currentVersion + ' → ' + latestVersion);
                    results.push({ pluginId: pluginId, current: currentVersion, latest: latestVersion, status: 'updated' });
                    updated++;
                } else {
                    error('✗ ' + pluginId + ': 部分文件下载失败，请重试');
                    results.push({ pluginId: pluginId, current: currentVersion, latest: latestVersion, status: 'partial' });
                    failed++;
                }
            }
        }

        console.log('');
        if (i < plugins.length - 1) await sleep(300);
    }

    // ─── 汇总 ────────────────────────────────────────────
    console.log('═══════════════════════════════════════════');
    info('更新完成: ' + updated + ' 个已更新, ' + skipped + ' 个跳过, ' + failed + ' 个失败');
    console.log('═══════════════════════════════════════════');
    console.log('');

    const nameWidth = Math.max.apply(null, results.map(function (r) { return r.pluginId.length; }).concat([10]));
    console.log('  ' + '插件'.padEnd(nameWidth) + '  ' + '当前版本'.padEnd(14) + '  ' + '最新版本'.padEnd(14) + '  状态');
    console.log('  ' + '─'.repeat(nameWidth + 14 + 14 + 8));
    for (const r of results) {
        const statusLabel = ({
            'updated': '✓ 已更新',
            'latest': '✓ 已是最新',
            'check-only': '→ 需更新',
            'skip': '⚠ 跳过',
            'no-repo': '⚠ 无仓库映射',
            'fail': '✗ 失败',
            'partial': '⚠ 部分失败'
        })[r.status] || r.status;
        console.log('  ' + (r.pluginId || '').padEnd(nameWidth) + '  ' + (r.current || '?').padEnd(14) + '  ' + (r.latest || '?').padEnd(14) + '  ' + statusLabel);
    }

    process.exit(failed > 0 ? 1 : 0);
})();
