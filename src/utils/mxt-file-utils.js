/**
 * @module mxt-fs
 * 文件、目录、YAML 解析与 Git 操作的集合库
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const fsAsync = require('fs').promises;
const { execSync } = require('child_process');

// --- 基础文件操作 ---
const ensureDir = async (p) => fsAsync.mkdir(p, { recursive: true });
const exists = (p) => fs.existsSync(p);
const readJson = (p) => exists(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
const writeJson = async (p, d, i = 4) => {
    await ensureDir(path.dirname(p));
    await fsAsync.writeFile(p, JSON.stringify(d, null, i));
};

const copyDir = async (src, dest) => {
    await ensureDir(dest);
    const items = await fsAsync.readdir(src);
    for (const item of items) {
        const sPath = path.join(src, item), dPath = path.join(dest, item);
        const stat = await fsAsync.lstat(sPath);
        if (stat.isDirectory()) {
            await copyDir(sPath, dPath);
        } else if (stat.isSymbolicLink()) {
            const linkTarget = await fsAsync.readlink(sPath);
            await fsAsync.symlink(linkTarget, dPath);
        } else {
            await fsAsync.copyFile(sPath, dPath);
        }
    }
};

const scanDir = (dir, filter = () => true) => {
    if (!exists(dir)) return [];
    return fs.readdirSync(dir).reduce((acc, item) => {
        const p = path.join(dir, item);
        try {
            if (fs.statSync(p).isDirectory() && filter(item, p)) acc.push({ name: item, path: p, isDirectory: true });
        } catch (e) {}
        return acc;
    }, []);
};

// --- 临时目录 ---
const createTempDir = (pre = 'mxt') => path.join(os.tmpdir(), `.${pre}-${Date.now()}`);
const cleanup = async (p) => p && exists(p) ? fsAsync.rm(p, { recursive: true, force: true }).then(() => true).catch(() => false) : false;

// --- Git ---
const gitClone = (url, dest, { shallow = true } = {}) => {
    try {
        execSync(`git clone ${shallow ? '--depth 1' : ''} "${url}" "${dest}"`, { stdio: 'ignore', shell: process.platform === 'win32' });
        return true;
    } catch (e) { throw new Error(`Git clone failed: ${e.message}`); }
};

// --- YAML ---
const parseYaml = (str) => { // 简易解析
    const meta = {}; let arrKey = null;
    str.split('\n').forEach(line => {
        if (!line.trim() || line.trim().startsWith('#')) return;
        const arrM = line.match(/^(\s+)-\s+(.+)$/);
        if (arrM && arrKey) { (meta[arrKey] = meta[arrKey] || []).push(arrM[2].trim().replace(/^["']|["']$/g, '')); return; }
        const kvM = line.match(/^(\w[\w-]*):\s*(.*)$/);
        if (kvM) {
            const k = kvM[1], v = kvM[2].trim().replace(/^["']|["']$/g, '');
            if (!v) { arrKey = k; meta[k] = []; } else { meta[k] = v === 'true' ? true : v === 'false' ? false : !isNaN(v) ? Number(v) : v; arrKey = null; }
        }
    });
    return meta;
};

const parseFile = (p) => {
    if (!exists(p)) return null;
    const content = fs.readFileSync(p, 'utf8');
    const match = content.match(/^---\n([\s\S]+?)\n---/);
    return match ? { attributes: parseYaml(match[1]), body: content.replace(match[0], '').trim() } : null;
};

module.exports = { copyDir, scanDir, createTempDir, cleanup, ensureDir, exists, readJson, writeJson, gitClone, parseFile, parseYaml };