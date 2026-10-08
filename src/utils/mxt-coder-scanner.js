/**
 * Regex-based source scanners feeding `mxt coder`.
 *
 * These recognizers intentionally trade compiler-grade precision for
 * zero-dependency speed.  The first version covers Node/JS/TS symbol
 * shapes, route decorators, config keys, Vue component shells, Maven
 * coordinates, Go/Python basics, and structured Markdown headings.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE_EXTENSIONS = new Set([
    '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.vue',
    '.java', '.py', '.go', '.rs', '.md', '.mdc', '.txt', '.json', '.yaml', '.yml',
    '.rb', '.kt', '.swift', '.php', '.scala', '.dart', '.astro', '.lua',
    '.sh', '.bash', '.zsh', '.sql', '.proto', '.hcl', '.tf', '.properties',
    '.css', '.html', '.svg', '.toml', '.ini', '.cfg', '.conf',
    '.snap', '.bazel', '.bzl',
    '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hh'
]);

const SKIP_DIRS = new Set([
    'node_modules', 'dist', 'build', 'target', 'coverage',
    '.git', '.svn', '.hg', '.idea', '.vscode',
    '.r2mo/repo', '__pycache__', '.next', '.nuxt',
    'vendor', '.gradle', '.mvn',
    '.obsidian', '.codex', '.agents', '.cursor', '.claude'
]);

const LANGUAGE_BY_EXT = new Map([
    ['.js', 'javascript'], ['.jsx', 'javascript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'],
    ['.ts', 'typescript'], ['.tsx', 'typescript'], ['.mts', 'typescript'], ['.cts', 'typescript'],
    ['.vue', 'vue'],
    ['.java', 'java'],
    ['.py', 'python'],
    ['.go', 'go'],
    ['.rs', 'rust'],
    ['.md', 'markdown'], ['.mdc', 'markdown'], ['.txt', 'text'],
    ['.json', 'json'],
    ['.yaml', 'yaml'], ['.yml', 'yaml'],
    ['.rb', 'ruby'], ['.kt', 'kotlin'], ['.swift', 'swift'],
    ['.php', 'php'], ['.scala', 'scala'], ['.dart', 'dart'],
    ['.astro', 'typescript'], ['.lua', 'lua'],
    ['.sh', 'bash'], ['.bash', 'bash'], ['.zsh', 'bash'],
    ['.sql', 'sql'], ['.proto', 'protobuf'],
    ['.hcl', 'hcl'], ['.tf', 'terraform'], ['.properties', 'properties'],
    ['.css', 'css'], ['.html', 'html'], ['.svg', 'svg'],
    ['.toml', 'toml'], ['.bazel', 'starlark'], ['.bzl', 'starlark'], ['.snap', 'snapshot'],
    ['.ini', 'ini'], ['.cfg', 'ini'], ['.conf', 'ini'],
    ['.cpp', 'cpp'], ['.cc', 'cpp'], ['.cxx', 'cpp'],
    ['.c', 'c'], ['.h', 'c'], ['.hpp', 'cpp'], ['.hh', 'cpp']
]);

/**
 * Discover source files respecting SKIP_DIRS.
 * @param {string} projectDir absolute path
 * @returns {Promise<Array<{absolute:string,relative:string,ext:string,bytes:number,mtimeMs:number}>>}
 */
const discoverFiles = async (projectDir, excludeDirs = []) => {
    const results = [];
    const walk = async (dir) => {
        let dirents;
        try {
            dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch (_) {
            return;
        }
        for (const entry of dirents) {
            const absolute = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // Hidden directories are runtime/tool/editor state, not project
                // source. Filtering them here also avoids duplicated vendored
                // bundles such as .obsidian and .r2mo snapshots.
                if (entry.name.startsWith('.')) continue;
                const rel = path.relative(projectDir, absolute).replace(/\\/g, '/');
                const globalHit = [...SKIP_DIRS].some(skip => rel === skip || rel.startsWith(skip + '/'));
                const localHit = excludeDirs.some(ex => typeof ex === 'string'
                    ? (rel === ex || rel.startsWith(ex + '/'))
                    : ex(rel));
                if (globalHit || localHit) continue;
                await walk(absolute);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!SOURCE_EXTENSIONS.has(ext)) continue;
                try {
                    const stat = await fs.promises.stat(absolute);
                    results.push({
                        absolute,
                        relative: path.relative(projectDir, absolute).replace(/\\/g, '/'),
                        ext,
                        bytes: stat.size,
                        mtimeMs: stat.mtimeMs
                    });
                } catch (_) { /* vanished mid-walk */ }
            }
        }
    };
    await walk(projectDir);
    results.sort((a, b) => a.relative.localeCompare(b.relative));
    return results;
};

/**
 * Read a file defensively, replacing NUL bytes so SQLite accepts content.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
const readFileSafe = async (filePath) => {
    try {
        const buf = await fs.promises.readFile(filePath);
        return buf.toString('utf8').replace(/\0/g, '');
    } catch (_) {
        return '';
    }
};

const _mkNode = (id, kind, name, uri, line, language, signature, meta) => ({
    id, kind, name, uri, line, language, signature, meta: meta || {}
});

const _collectMatches = (regex, text) => {
    const out = [];
    let m;
    regex.lastIndex = 0;
    while ((m = regex.exec(text)) !== null) {
        if (m.index === regex.lastIndex) regex.lastIndex++;
        const line = _lineOf(regex, text, m.index);
        out.push({ match: m, line });
        if (out.length >= 400) break;
    }
    return out;
};

// Binary-search line offsets once per file; repeated substring scans otherwise
// turn large bundled JavaScript files into quadratic scanning bottlenecks.
const _lineOf = (regex, text, index) => {
    if (!regex.__r2moAnchor) regex.__r2moAnchor = {};
    const cache = regex.__r2moAnchor;
    if (cache.text !== text) {
        const offsets = [0];
        for (let pos = text.indexOf('\n'); pos >= 0; pos = text.indexOf('\n', pos + 1)) {
            offsets.push(pos + 1);
        }
        cache.text = text;
        cache.offsets = offsets;
    }
    const offsets = cache.offsets;
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] <= index) lo = mid;
        else hi = mid - 1;
    }
    return lo + 1;
};

const _camelRank = (name) => /^[a-z]/.test(name) ? 0.85 : 0.75;

/**
 * Extract facts from a JavaScript/TypeScript source file.
 */
const scanJsTs = (relative, ext, text) => {
    const language = ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript';
    const fileId = `f:${relative}`;
    const nodes = [_mkNode(fileId, 'FILE', path.basename(relative), relative, 1, language)];
    const edges = [];
    const symbols = [];

    // Classes
    for (const { match, line } of _collectMatches(
        /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g, text)) {
        const cid = `c:${relative}:${match[1]}`;
        nodes.push(_mkNode(cid, 'CLASS', match[1], relative, line, language,
            match[0], { role: 'class' }));
        edges.push({ from_id: fileId, to_id: cid, kind: 'DEFINES', strength: 1 });
        symbols.push({ id: cid, kind: 'CLASS', name: match[1], line });
    }

    // Interfaces / Types
    for (const { match, line } of _collectMatches(
        /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g, text)) {
        const iid = `i:${relative}:${match[1]}`;
        nodes.push(_mkNode(iid, 'INTERFACE', match[1], relative, line, language));
        edges.push({ from_id: fileId, to_id: iid, kind: 'DEFINES', strength: 1 });
        symbols.push({ id: iid, kind: 'INTERFACE', name: match[1], line });
    }
    for (const { match, line } of _collectMatches(
        /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g, text)) {
        const tid = `t:${relative}:${match[1]}`;
        nodes.push(_mkNode(tid, 'TYPE', match[1], relative, line, language));
        edges.push({ from_id: fileId, to_id: tid, kind: 'DEFINES', strength: 0.9 });
    }

    // Functions (declaration, arrow assigned to const)
    for (const { match, line } of _collectMatches(
        /\b(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g, text)) {
        const fid = `fn:${relative}:${match[1]}`;
        nodes.push(_mkNode(fid, 'FUNCTION', match[1], relative, line, language, match[0]));
        edges.push({ from_id: fileId, to_id: fid, kind: 'DEFINES', strength: 1 });
        symbols.push({ id: fid, kind: 'FUNCTION', name: match[1], line });
    }
    for (const { match, line } of _collectMatches(
        /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g, text)) {
        const fid = `fn:${relative}:${match[1]}`;
        nodes.push(_mkNode(fid, 'FUNCTION', match[1], relative, line, language, match[0]));
        edges.push({ from_id: fileId, to_id: fid, kind: 'DEFINES', strength: 0.95 });
        symbols.push({ id: fid, kind: 'FUNCTION', name: match[1], line });
    }

    // Router surface — Express/Koa style
    for (const { match, line } of _collectMatches(
        /\.(get|post|put|delete|patch|all)\s*\(\s*[`'\"]([^`'\"]+)[`'\"]/g, text)) {
        const rid = `rt:${relative}:L${line}:${match[2]}`;
        nodes.push(_mkNode(rid, 'ROUTE', `${match[1].toUpperCase()} ${match[2]}`, relative, line, language,
            match[0], { verb: match[1].toUpperCase(), path: match[2] }));
        edges.push({ from_id: fileId, to_id: rid, kind: 'DEFINES', strength: 0.9 });
    }

    // ENV / config key access
    for (const { match, line } of _collectMatches(
        /process\.env\.([A-Z][A-Z0-9_]{2,})/g, text)) {
        const kid = `cfg:${relative}:${match[1]}:L${line}`;
        nodes.push(_mkNode(kid, 'CONFIG_KEY', match[1], relative, line, language));
        edges.push({ from_id: fileId, to_id: kid, kind: 'READS', strength: 0.8 });
    }

    // Import graph
    for (const { match } of _collectMatches(
        /(?:^|\n)\s*(?:import\s+[^;\n]+from\s+|require\s*\(\s*)([`'\"])([^`'\"]+)\1/g, text)) {
        const spec = match[2];
        const target = spec.startsWith('.')
            ? `m:${spec}`
            : `pkg:${spec.split('/')[0]}`;
        edges.push({ from_id: fileId, to_id: target, kind: 'IMPORTS', strength: 0.6 });
    }

    // comments as DOC_ANCHOR for Chinese docs
    const cnComments = /\/\/\s*([\u4e00-\u9fff][^*\n]{4,80})/g;
    let cnCount = 0;
    for (const { match, line } of _collectMatches(cnComments, text)) {
        const did = `doc:${relative}:L${line}`;
        nodes.push(_mkNode(did, 'DOC_ANCHOR', match[1].trim().slice(0, 60), relative, line, language));
        edges.push({ from_id: fileId, to_id: did, kind: 'DOCUMENTS', strength: 0.6 });
        if (++cnCount >= 20) break;
    }

    // Entrypoint heuristics
    const base = path.basename(relative);
    if (base === 'mxt.js' || base === 'index.js' || base === 'main.js' ||
        base === 'index.ts' || base === 'main.ts' || base === 'app.js') {
        nodes.push(_mkNode(`ep:${relative}`, 'ENTRYPOINT', base, relative, 1, language, null, { guess: true }));
    }

    // Class methods and fields: structural members omitted by v1.
    for (const { match, line } of _collectMatches(
        /(?:^|\n)\s*(?:public|private|protected|readonly|static|async|get|set|\*)?\s*(?:public|private|protected|readonly|static|async|get|set|\*)?\s*([A-Za-z_$][\w$]*)\s*\(\s*(?:this\s*:\s*[A-Za-z_$][\w$]*)?[^)]*\)\s*(?::\s*[^{;=]+)?\s*\{/g, text)) {
        const name = match[1];
        if (['if', 'for', 'while', 'switch', 'catch', 'function'].includes(name)) continue;
        const mid = `m:${relative}:${name}:L${line}`;
        nodes.push(_mkNode(mid, 'METHOD', name, relative, line, language, match[0].trim()));
        symbols.push({ id: mid, kind: 'METHOD', name, line });
    }
    for (const { match, line } of _collectMatches(
        /(?:^|\n)\s*(?:public|private|protected|readonly|static)?\s*(?:public|private|protected|readonly|static)?\s*([A-Za-z_$][\w$]*)\s*(?::\s*[^=;\n]+)?\s*=\s*[^=\n]/g, text)) {
        const name = match[1];
        if (['const', 'let', 'var', 'export'].includes(name)) continue;
        nodes.push(_mkNode(`fld:${relative}:${name}:L${line}`, 'FIELD', name, relative, line, language, match[0].trim()));
    }


    // Structural relations: inheritance, implementation, references.
    for (const { match, line } of _collectMatches(
        /\bclass\s+([A-Za-z_$][\w$]*)\s+extends\s+([A-Za-z_$][\w$]*)/g, text)) {
        edges.push({ from_id: `c:${relative}:${match[1]}`, to_id: `c:${relative}:${match[2]}`, kind: 'INHERITS', strength: 1 });
    }
    for (const { match, line } of _collectMatches(
        /\bclass\s+([A-Za-z_$][\w$]*)\s+implements\s+([A-Za-z_$][\w$]*)/g, text)) {
        edges.push({ from_id: `c:${relative}:${match[1]}`, to_id: `i:${relative}:${match[2]}`, kind: 'IMPLEMENTS', strength: 1 });
    }
    // CALLS: keep bounded, synthesize endpoint nodes so closure stays navigable.
    let callCount = 0;
    for (const { match, line } of _collectMatches(
        /(?<![\w$.])([A-Z][A-Za-z0-9_$]{2,}|[a-z][A-Za-z0-9_$]{2,})\s*\(/g, text)) {
        const name = match[1];
        if (['return','typeof','instanceof','delete','switch','catch'].includes(name)) continue;
        const owner = [...symbols].reverse().find(sym => sym.line <= line);
        const source = owner ? owner.id : fileId;
        const target = `ref:${name}`;
        edges.push({ from_id: source, to_id: target, kind: 'CALLS', strength: 0.7 });
        if (++callCount >= 300) break;
    }
    return { fileId, nodes, edges, symbols };
};

/**
 * Extract facts from a Vue SFC.
 */
const scanVue = (relative, text) => {
    const fileId = `f:${relative}`;
    const base = path.basename(relative, '.vue');
    const nodes = [
        _mkNode(fileId, 'FILE', path.basename(relative), relative, 1, 'vue'),
        _mkNode(`cmp:${relative}`, 'COMPONENT', base, relative, 1, 'vue')
    ];
    const edges = [{ from_id: fileId, to_id: `cmp:${relative}`, kind: 'DEFINES', strength: 1 }];

    // defineProps / defineEmits
    for (const kind of ['defineProps', 'defineEmits']) {
        const rx = new RegExp(`${kind}\\s*[(<]`, 'g');
        for (const { line } of _collectMatches(rx, text)) {
            edges.push({ from_id: fileId, to_id: `cmp:${relative}`, kind: 'USES_COMPONENT', strength: 0.7 });
            void line;
        }
    }
    // Chinese labels/comments become DOC_ANCHOR
    const cn = /(?:\/\/|#|<!--)\s*([\u4e00-\u9fff][^<>\n-]{3,60})/g;
    let count = 0;
    for (const { match, line } of _collectMatches(cn, text)) {
        const did = `doc:${relative}:L${line}`;
        nodes.push(_mkNode(did, 'DOC_ANCHOR', match[1].trim().slice(0, 50), relative, line, 'vue'));
        edges.push({ from_id: fileId, to_id: did, kind: 'DOCUMENTS', strength: 0.5 });
        if (++count >= 15) break;
    }
    return { fileId, nodes, edges };
};

/**
 * Maven pom.xml / Gradle discovery (deep symbol graph comes later).
 */
const scanMavenOrGradle = (relative, text) => {
    const fileId = `f:${relative}`;
    const nodes = [_mkNode(fileId, 'FILE', path.basename(relative), relative, 1, 'xml')];
    const edges = [];
    if (/pom\.xml$/.test(relative)) {
        const groupId = /<groupId>([^<]+)<\/groupId>/.exec(text)?.[1];
        const artifactId = /<artifactId>([^<]+)<\/artifactId>/.exec(text)?.[1];
        if (groupId && artifactId) {
            nodes.push(_mkNode(`svc:maven:${groupId}.${artifactId}`, 'SERVICE',
                `${groupId}.${artifactId}`, relative, 1, 'xml',
                null, { buildTool: 'maven' }));
            edges.push({ from_id: fileId, to_id: `svc:maven:${groupId}.${artifactId}`, kind: 'DEFINES', strength: 1 });
        }
    } else if (/build\.gradle$/.test(relative)) {
        const groupMatch = /group\s*=\s*['"]([^'"]+)['"]/.exec(text);
        const artMatch = /(?:rootProject\.name|archivesBaseName)\s*=\s*['"]([^'"]+)['"]/.exec(text);
        if (groupMatch && artMatch) {
            const key = `${groupMatch[1]}.${artMatch[1]}`;
            nodes.push(_mkNode(`svc:gradle:${key}`, 'SERVICE', key, relative, 1, 'groovy', null, { buildTool: 'gradle' }));
            edges.push({ from_id: fileId, to_id: `svc:gradle:${key}`, kind: 'DEFINES', strength: 1 });
        }
    }
    return { fileId, nodes, edges };
};

/**
 * Go / Python basics — declarations only.
 */
const scanGoPy = (relative, ext, text) => {
    const language = ext === '.go' ? 'go' : 'python';
    const fileId = `f:${relative}`;
    const nodes = [_mkNode(fileId, 'FILE', path.basename(relative), relative, 1, language)];
    const edges = [];
    const patterns = ext === '.go'
        ? [
            { rx: /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/g, kind: 'FUNCTION', prefix: 'fn' },
            { rx: /\btype\s+([A-Za-z_]\w*)\s+struct\b/g, kind: 'TYPE', prefix: 'ty' }
        ]
        : [
            { rx: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm, kind: 'FUNCTION', prefix: 'fn' },
            { rx: /^\s*class\s+([A-Za-z_]\w*)/gm, kind: 'CLASS', prefix: 'cl' }
        ];
    for (const p of patterns) {
        for (const { match, line } of _collectMatches(p.rx, text)) {
            const nid = `${p.prefix}:${relative}:${match[1]}`;
            nodes.push(_mkNode(nid, p.kind, match[1], relative, line, language, match[0]));
            edges.push({ from_id: fileId, to_id: nid, kind: 'DEFINES', strength: 1 });
        }
    }
    return { fileId, nodes, edges };
};



/**
 * Dedicated Rust scanner: fn, impl blocks, trait defs, struct/enum, use-imports.
 */
const scanRust = (relative, text) => {
    const fileId = `f:${relative}`;
    const nodes = [_mkNode(fileId, 'FILE', path.basename(relative), relative, 1, 'rust')];
    const edges = [];
    const symbols = [];

    const addItem = (id, kind, name, line, sig) => {
        const nid = id || `sr:${relative}:${name}:L${line}`;
        nodes.push(_mkNode(nid, kind, name, relative, line, 'rust', sig));
        if (kind !== 'USE') symbols.push({ id: nid, kind, name, line });
        return nid;
    };

    for (const { match, line } of _collectMatches(/\buse\s+([A-Za-z_][\w:<>]*)/g, text)) {
        const uid = `use:${relative}:${match[1]}:L${line}`;
        nodes.push(_mkNode(uid, 'USE', match[1], relative, line, 'rust', match[0]));
        edges.push({ from_id: fileId, to_id: uid, kind: 'IMPORTS', strength: 0.6 });
    }
    for (const { match, line } of _collectMatches(/\bfn\s+([A-Za-z_][\w]*)/g, text)) {
        addItem(null, 'FUNCTION', match[1], line, match[0].trim());
        edges.push({ from_id: fileId, to_id: `fn:${relative}:${match[1]}:L${line}`, kind: 'DEFINES', strength: 1 });
    }
    for (const { match, line } of _collectMatches(/\bimpl(?:<[^>]*>)?\s+(?:for\s+)?([A-Za-z_][\w<>,\s:]*)\{/g, text)) {
        const nm = match[1].trim().slice(0, 80);
        addItem(null, 'TYPE', 'impl '+nm, line, match[0].trim());
    }
    for (const { match, line } of _collectMatches(/\btrait\s+([A-Za-z_][\w]*)/g, text)) {
        addItem(null, 'INTERFACE', match[1], line, match[0].trim());
    }
    for (const { match, line } of _collectMatches(/\b(struct|enum)\s+([A-Za-z_][\w]*)/g, text)) {
        addItem(null, 'TYPE', match[2], line, match[0].trim());
    }
    for (const { match, line } of _collectMatches(/\bmacro_rules!\s+([a-zA-Z_][\w]*)/g, text)) {
        addItem(null, 'MACRO', match[1], line, match[0].trim());
    }
    return { fileId, nodes, edges, symbols };
};

/**
 * Minimal Shell / SQL recognizer — routes & statements worth remembering.
 */
const scanShellSql = (relative, ext, text) => {
    const language = ext === '.sql' ? 'sql' : 'bash';
    const fileId = `f:${relative}`;
    const nodes = [_mkNode(fileId, 'FILE', path.basename(relative), relative, 1, language)];
    const edges = [];
    if (ext === '.sql') {
        for (const { match, line } of _collectMatches(/\b(CREATE\s+TABLE|CREATE\s+INDEX|ALTER\s+TABLE)\s+(IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w.]*)/gi, text)) {
            const nid = `tbl:${relative}:${match[3]}:L${line}`;
            nodes.push(_mkNode(nid, 'TYPE', match[3], relative, line, 'sql', match[0]));
            edges.push({ from_id: fileId, to_id: nid, kind: 'DEFINES', strength: 1 });
        }
    } else {
        for (const { match, line } of _collectMatches(/^\s*(?:function\s+([A-Za-z_][\w]*)|([A-Za-z_][\w]*)\s*\(\)\s*\{)/gm, text)) {
            const name = match[1] || match[2];
            if (!name) continue;
            const nid = `fn:${relative}:${name}:L${line}`;
            nodes.push(_mkNode(nid, 'FUNCTION', name, relative, line, 'bash', match[0].trim()));
            edges.push({ from_id: fileId, to_id: nid, kind: 'DEFINES', strength: 1 });
        }
    }
    return { fileId, nodes, edges };
};

/**
 * Markdown heading + bullet chunker.  Chinese headings split into their
 * own chunks so document prose participates in lexical and vector recall.
 */
const scanMarkdown = (relative, text, bytes) => {
    const fileId = `f:${relative}`;
    const nodes = [_mkNode(fileId, 'FILE', path.basename(relative), relative, 1, 'markdown')];
    const edges = [];
    if (bytes > DOC_MAX_BYTES) return { fileId, nodes, edges, symbols: [] };
    const sections = [];
    const lines = text.split('\n');
    let currentHeading = '(intro)';
    let buffer = [];
    for (let i = 0; i < lines.length; i++) {
        const headingRx = /^(#{1,4})\s+(.+)$/;
        const hm = headingRx.exec(lines[i]);
        if (hm) {
            if (buffer.length) {
                sections.push({ title: currentHeading, startLine: i - buffer.length + 1, text: buffer.join('\n').trim() });
            }
            currentHeading = hm[2].trim();
            buffer = [];
        } else if (lines[i].trim()) {
            buffer.push(lines[i]);
        }
        if (sections.length >= 120) break;
    }
    if (buffer.length && sections.length < 130) {
        sections.push({ title: currentHeading, startLine: lines.length - buffer.length, text: buffer.join('\n').trim() });
    }

    for (const sec of sections) {
        if (!sec.text || sec.text.length < 16) continue;
        const nodeId = `doc:${relative}:L${sec.startLine}`;
        nodes.push(_mkNode(nodeId, 'DOC_ANCHOR', sec.title.slice(0, 80), relative, sec.startLine, 'markdown'));
        edges.push({ from_id: fileId, to_id: nodeId, kind: 'DOCUMENTS', strength: 0.85 });
    }
    return { fileId, nodes, edges };
};

/**
 * package.json, tsconfig, docker-compose etc. — expose scripts and keys.
 */
const scanConfigFile = (relative, ext, text, bytes) => {
    const fileId = `f:${relative}`;
    const language = ext === '.json' ? 'json' : 'yaml';
    const nodes = [_mkNode(fileId, 'FILE', path.basename(relative), relative, 1, language)];
    const edges = [];
    if (bytes > CONFIG_MAX_BYTES) return { fileId, nodes, edges, symbols: [] };
    if (relative === 'package.json') {
        try {
            const pkg = JSON.parse(text);
            for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
                const sid = `scr:package.json:${name}`;
                nodes.push(_mkNode(sid, 'SCRIPT', name, relative, 1, 'json', String(cmd)));
                edges.push({ from_id: fileId, to_id: sid, kind: 'DEFINES', strength: 0.8 });
            }
        } catch (_) { /* malformed package.json skipped */ }
    }
    if (/(docker-compose|compose)\.(ya?ml)$/i.test(relative)) {
        const svcRx = /^\s{2}([A-Za-z0-9_-]+):\s*$/gm;
        for (const { match, line } of _collectMatches(svcRx, text)) {
            const sid = `svr:${relative}:${match[1]}`;
            nodes.push(_mkNode(sid, 'SERVICE', match[1], relative, line, 'yaml'));
            edges.push({ from_id: fileId, to_id: sid, kind: 'DEFINES', strength: 0.7 });
        }
    }
    return { fileId, nodes, edges };
};


/* ── multi-signal technology-stack detection ──────────────────────── *
 * Combines manifests, extension census, directory structure, source
 * imports and infrastructure filenames.  Signals are additive; several
 * independent confirmations outrank any single manifest string.
 */
const LANG_RULES = [
    { slug: 'python', name: 'Python', exts: ['.py'], manifests: ['requirements.txt','pyproject.toml','setup.py','setup.cfg'], rx: /\bimport\s+\w+|^\s*def\s+\w+|^\s*class\s+\w+/ },
    { slug: 'ruby', name: 'Ruby', exts: ['.rb'], manifests: ['Gemfile','gems.rb'], rx: /^\s*(?:module|class|def)\s+\w+|^require(?:_relative)?\s+['"]/ },
    { slug: 'kotlin', name: 'Kotlin', exts: ['.kt','.kts'], manifests: ['build.gradle.kts'], rx: /^\s*(?:fun|class|object|val|var)\s+\w+/ },
    { slug: 'typescript', name: 'TypeScript', exts: ['.ts','.tsx','.mts','.cts'], manifests: ['tsconfig.json'], rx: /\b(?:interface|type)\s+\w+|:\s*(?:string|number|boolean)\b/ },
    { slug: 'javascript', name: 'JavaScript', exts: ['.js','.jsx','.mjs','.cjs'], rx: /\brequire\(|\bmodule\.exports\b|\bexport\s+(?:default|const|function|class)\b/ },
    { slug: 'java', name: 'Java', exts: ['.java'], manifests: ['pom.xml','build.gradle','settings.gradle'], rx: /^\s*(?:public|private|protected)\s+(?:final\s+)?class\s+\w+/ },
    { slug: 'go', name: 'Go', exts: ['.go'], manifests: ['go.mod','go.sum'], rx: /^\s*(?:func|package)\s+\w+/ },
    { slug: 'rust', name: 'Rust', exts: ['.rs'], manifests: ['Cargo.toml','Cargo.lock'], rx: /^\s*(?:fn|impl|trait|struct|enum)\s+\w+/ },
    { slug: 'php', name: 'PHP', exts: ['.php'], manifests: ['composer.json','composer.lock'], rx: /<(?:\?php)|^\s*(?:namespace|use)\s+\w+/ },
    { slug: 'swift', name: 'Swift', exts: ['.swift'], manifests: ['Package.swift'], rx: /^\s*(?:func|struct|class|protocol)\s+\w+/ },
    { slug: 'dart', name: 'Dart', exts: ['.dart'], manifests: ['pubspec.yaml','pubspec.lock'], rx: /^\s*(?:class|extension|mixin)\s+\w+|^import\s+['"]/ },
    { slug: 'scala', name: 'Scala', exts: ['.scala'], manifests: ['build.sbt'], rx: /^\s*(?:object|trait|class)\s+\w+/ },
    { slug: 'elixir', name: 'Elixir', exts: ['.ex','.exs'], manifests: ['mix.exs','mix.lock'], rx: /^\s*(?:defmodule|def|defp)\s+\w+/ },
    { slug: 'lua', name: 'Lua', exts: ['.lua'], rx: /^\s*(?:local\s+)?function\s+\w+|^require\s*\(['"]/ },
    { slug: 'shell', name: 'Shell', exts: ['.sh','.bash','.zsh'], rx: /^(?:#!.*\b(?:bash|zsh|sh)\b)|^(?:function\s+)?\w+\s*\(\)\s*\{/ },
    { slug: 'sql', name: 'SQL', exts: ['.sql'], rx: /^\s*(?:CREATE|ALTER|WITH|SELECT)\b/i }
];

const FRAMEWORK_RULES = [
    { slug: 'react', name: 'React', packages: ['react','react-dom'], files: ['vite.config.ts'], exts: [] },
    { slug: 'vue', name: 'Vue', packages: ['vue','@vue/runtime-core'], exts: ['.vue'] },
    { slug: 'angular', name: 'Angular', packages: ['@angular/core'], files: ['angular.json'] },
    { slug: 'svelte', name: 'Svelte', packages: ['svelte'] },
    { slug: 'solidjs', name: 'SolidJS', packages: ['solid-js'] },
    { slug: 'astro', name: 'Astro', packages: ['astro'], exts: ['.astro'] },
    { slug: 'next', name: 'Next.js', packages: ['next'] },
    { slug: 'nuxt', name: 'Nuxt', packages: ['nuxt'] },
    { slug: 'vite', name: 'Vite', packages: ['vite'], files: ['vite.config.js','vite.config.ts'] },
    { slug: 'webpack', name: 'Webpack', packages: ['webpack'], files: ['webpack.config.js','webpack.config.ts'] },
    { slug: 'eslint', name: 'ESLint', packages: ['eslint'] },
    { slug: 'jest', name: 'Jest', packages: ['jest'] },
    { slug: 'vitest', name: 'Vitest', packages: ['vitest'] },
    { slug: 'playwright', name: 'Playwright', packages: ['@playwright/test','playwright'] },
    { slug: 'express', name: 'Express', packages: ['express'] },
    { slug: 'fastify', name: 'Fastify', packages: ['fastify'] },
    { slug: 'hono', name: 'Hono', packages: ['hono'] },
    { slug: 'nest', name: 'NestJS', packages: ['@nestjs/common','@nestjs/core'] },
    { slug: 'react_native', name: 'React Native', packages: ['react-native'] },
    { slug: 'electron', name: 'Electron', packages: ['electron'] },
    { slug: 'springboot', name: 'Spring Boot', any: [/org\.springframework\.boot/, /<artifactId>spring-boot[^<]*</] },
    { slug: 'spring', name: 'Spring', any: [/org\.springframework/, /<artifactId>spring[^<]*</] },
    { slug: 'quarkus', name: 'Quarkus', any: [/io\.quarkus/, /<artifactId>quarkus[^<]*</] },
    { slug: 'vertx', name: 'Vert.x', any: [/io\.vertx/, /<artifactId>(?:vertx|zero-)[^<]*</] },
    { slug: 'mybatis', name: 'MyBatis', any: [/<artifactId>(?:mybatis|mybatis-plus)[^<]*</] },
    { slug: 'hibernate', name: 'Hibernate', any: [/<artifactId>hibernate[^<]*</] },
    { slug: 'rails', name: 'Ruby on Rails', gems: ['rails'], files: ['config/application.rb','bin/rails'] },
    { slug: 'sinatra', name: 'Sinatra', gems: ['sinatra'] },
    { slug: 'django', name: 'Django', reqs: ['django'], files: ['manage.py'] },
    { slug: 'flask', name: 'Flask', reqs: ['flask'], source: /\bfrom\s+flask\b|\bimport\s+flask\b/ },
    { slug: 'fastapi', name: 'FastAPI', reqs: ['fastapi'], source: /\bfrom\s+fastapi\b|\bimport\s+fastapi\b/ },
    { slug: 'celery', name: 'Celery', reqs: ['celery'] },
    { slug: 'sqlalchemy', name: 'SQLAlchemy', reqs: ['sqlalchemy'] },
    { slug: 'gin', name: 'Gin', gomods: ['gin-gonic/gin'] },
    { slug: 'echo', name: 'Echo', gomods: ['labstack/echo'] },
    { slug: 'cobra', name: 'Cobra', gomods: ['spf13/cobra'] },
    { slug: 'actix', name: 'Actix Web', cargos: ['actix-web'] },
    { slug: 'axum', name: 'Axum', cargos: ['axum'] },
    { slug: 'rocket', name: 'Rocket', cargos: ['rocket'] },
    { slug: 'tokio', name: 'Tokio', cargos: ['tokio'] },
    { slug: 'laravel', name: 'Laravel', composer: ['laravel/framework','illuminate/support'] },
    { slug: 'symfony', name: 'Symfony', composer: ['symfony/framework-bundle'] },
    { slug: 'flutter', name: 'Flutter', pubspecs: ['flutter'] },
    { slug: 'swiftui', name: 'SwiftUI', source: /\bimport\s+SwiftUI\b/ },
    { slug: 'android', name: 'Android', any: [/^androidx\./m, /com\.android\.(?:application|library)/] },
    { slug: 'grpc', name: 'gRPC', packages: ['@grpc/grpc-js','grpc'], exts: ['.proto'] },
    { slug: 'graphql', name: 'GraphQL', packages: ['graphql','apollo-server'] },
    { slug: 'prisma', name: 'Prisma', packages: ['prisma','@prisma/client'], files: ['schema.prisma'] },
    { slug: 'typeorm', name: 'TypeORM', packages: ['typeorm'] },
    { slug: 'postgres', name: 'PostgreSQL', packages: ['pg','postgres'], any: [/jdbc:postgresql:/, /psycopg2/, /postgres(?:ql)?:\/\//] },
    { slug: 'mysql', name: 'MySQL', packages: ['mysql','mysql2'], any: [/jdbc:mysql:/, /mysql:\/\//] },
    { slug: 'redis', name: 'Redis', packages: ['redis','ioredis'], source: /\bredis\b/ },
    { slug: 'mongodb', name: 'MongoDB', packages: ['mongodb','mongoose'], source: /\bmongodb(?:\+srv)?:\/\// },
    { slug: 'terraform', name: 'Terraform', exts: ['.tf','.tfvars'] },
    { slug: 'kubernetes', name: 'Kubernetes', dirs: ['charts','helm','k8s','manifests'] },
    { slug: 'githubactions', name: 'GitHub Actions', dirs: ['.github/workflows'] },
    { slug: 'docker', name: 'Docker', files: ['Dockerfile','docker-compose.yml','docker-compose.yaml'] },
    { slug: 'monorepo', name: 'Monorepo', files: ['pnpm-workspace.yaml','turbo.json','nx.json','lerna.json'] }
];

const MANIFEST_CANDIDATES = [
    'package.json','tsconfig.json','pnpm-workspace.yaml','turbo.json','nx.json','lerna.json',
    'requirements.txt','pyproject.toml','setup.py','setup.cfg','Pipfile','Poetry.lock',
    'Gemfile','gems.rb','composer.json','Cargo.toml','Cargo.lock','go.mod','go.sum',
    'pom.xml','build.gradle','build.gradle.kts','settings.gradle','settings.gradle.kts','build.sbt',
    'mix.exs','mix.lock','pubspec.yaml','pubspec.lock','Package.swift','Podfile','DCO'
];

const _normalizedSlugValue = (value) => String(value || '').toLowerCase();

const _mergeTech = (technologies, slug, displayName, score, signal, category = 'framework') => {
    const item = technologies.get(slug) || { displayName, score: 0, signals: [], category };
    item.score += score;
    item.category = category;
    if (!item.signals.includes(signal)) item.signals.push(signal);
    technologies.set(slug, item);
};

const _safeReadManifests = async (projectDir) => {
    const texts = [];
    for (const name of MANIFEST_CANDIDATES) {
        try {
            const stat = await fs.promises.stat(path.join(projectDir, name));
            if (!stat.isFile() || stat.size > 512 * 1024) continue;
            texts.push(await fs.promises.readFile(path.join(projectDir, name), 'utf8'));
        } catch (_) { /* candidate not present */ }
    }
    return texts;
};

const analyzeTechnologyStack = async (projectDir, sourceStats, sourceSamples = []) => {
    const technologies = new Map();
    const joinedManifest = (await _safeReadManifests(projectDir)).join('\n;\n');
    const counts = new Map();
    for (const [ext, value] of Object.entries(sourceStats.byExt || {})) {
        counts.set(ext, Number(value && value.count != null ? value.count : value) || 0);
    }
    const dirExists = (...names) => names.some(name => fs.existsSync(path.join(projectDir, name)));

    // Language family: structure, manifest and parser-body samples reinforce
    // each other.  More files yield more votes, but one authoritative
    // manifest is enough to establish presence.
    for (const rule of LANG_RULES) {
        let score = rule.exts.reduce((sum, ext) => sum + (counts.get(ext) || 0), 0) / 25;
        let signals = [];
        if (score > 0) signals.push('extension');
        if (rule.manifests?.some(name => fs.existsSync(path.join(projectDir, name)))) {
            score += 1; signals.push('manifest');
        }
        if (rule.rx && sourceSamples.some(sample => rule.rx.test(sample))) {
            score += .4; signals.push('syntax');
        }
        if (score > 0) _mergeTech(technologies, rule.slug, rule.name, score, rule.slug, 'language');
    }

    // Framework/library/platform profiles.
    for (const rule of FRAMEWORK_RULES) {
        let hits = 0;
        let signal = '';
        if (rule.packages?.every(dep => new RegExp(`["']${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(joinedManifest))) { hits++; signal = 'manifest'; }
        if (rule.gems?.every(dep => new RegExp(`^gem\\s+["']${dep}\\b`).test(joinedManifest))) { hits++; signal = 'manifest'; }
        if (rule.reqs?.every(dep => new RegExp(`^\\s*${dep}\\b`, 'im').test(joinedManifest))) { hits++; signal = 'manifest'; }
        if (rule.gomods?.every(dep => joinedManifest.includes(dep))) { hits++; signal = 'manifest'; }
        if (rule.cargos?.every(dep => new RegExp(`^\\s*${dep}\\b`, 'm').test(joinedManifest))) { hits++; signal = 'manifest'; }
        if (rule.composer?.every(dep => new RegExp(`["']${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(joinedManifest))) { hits++; signal = 'manifest'; }
        if (rule.pubspecs?.every(dep => new RegExp(`^\\s*${dep}\\s*:`, 'm').test(joinedManifest))) { hits++; signal = 'manifest'; }
        if (rule.files?.some(name => fs.existsSync(path.join(projectDir, name)))) { hits++; signal = signal || 'layout'; }
        if (rule.dirs?.some(name => dirExists(name))) { hits++; signal = signal || 'layout'; }
        if (rule.exts?.some(ext => (counts.get(ext) || 0) > 0)) { hits++; signal = signal || 'extension'; }
        if (rule.any?.some(rx => rx.test(joinedManifest))) { hits++; signal = signal || 'manifest'; }
        if (rule.source && sourceSamples.some(sample => rule.source.test(sample))) { hits++; signal = signal || 'source'; }
        if (hits > 0) _mergeTech(technologies, rule.slug, rule.name, hits >= 2 ? 1.6 : 1.0, rule.slug);
    }

    sourceStats.detectedTechnologies = technologies;
    return technologies;
};

const stackRowsFromScores = (scores, limit = 10) => [...scores.entries()]
    .map(([slug, value]) => ({ slug, name: value.displayName, score: Number(value.score.toFixed(2)), signals: value.signals, category: value.category || 'framework' }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);

const detectFrameworks = (relative, text) => {
    const found = new Set();
    if (path.basename(relative) === 'package.json') {
        try {
            const parsed = JSON.parse(text);
            const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}), ...(parsed.peerDependencies || {}) };
            const names = [
                ['@angular/core','Angular'],['astro','Astro'],['express','Express'],['fastify','Fastify'],
                ['hono','Hono'],['next','Next.js'],['nuxt','Nuxt'],['react','React'],['react-dom','React'],
                ['solid-js','SolidJS'],['svelte','Svelte'],['vite','Vite'],['vue','Vue'],['@vue/runtime-core','Vue']
            ];
            for (const [dep, name] of names) if (deps[dep]) found.add(name);
        } catch (_) { /* malformed manifest */ }
    }
    if (/(^|\/)pom\.xml$/.test(relative)) {
        if (/org\.springframework\.boot|<artifactId>spring-boot[^<]*</.test(text)) found.add('Spring Boot');
        if (/io\.quarkus|<artifactId>quarkus[^<]*</.test(text)) found.add('Quarkus');
        if (/io\.vertx|<artifactId>vertx[^<]*</.test(text)) found.add('Vert.x');
    }
    if (/(^|\/)build\.gradle(?:\.kts)?$/.test(relative)) {
        if (/org\.springframework\.boot/.test(text)) found.add('Spring Boot');
        if (/io\.quarkus/.test(text)) found.add('Quarkus');
        if (/io\.vertx/.test(text)) found.add('Vert.x');
    }
    return [...found].sort();
};

/**
 * Chunk text into fixed windows suitable for embedding.
 * @param {string} text
 * @param {number} [size] characters per window
 */
const SYMBOL_CHUNK_MAX = 80;
const BYTE_WINDOW_SIZE = 700;
const MAX_FULLTEXT_WINDOWS = 8;
const LARGE_FILE_TEXT_THRESHOLD = 48 * 1024;
const MAX_SCANNABLE_SOURCE_BYTES = 1.5 * 1024 * 1024;
const TEXT_SAMPLE_ROWS = 80;
const TEXT_ROW_WIDTH = 180;
const CONFIG_MAX_BYTES = 64 * 1024;
const DOC_MAX_BYTES = 128 * 1024;

const chunkText = (text, size = 700) => {
    if (!text) return [];
    const out = [];
    for (let offset = 0; offset < text.length; offset += size) {
        out.push(text.slice(offset, offset + size));
        if (out.length >= 8) break;
    }
    return out.filter(chunk => chunk.trim().length > 12);
};

/**
 * Analyse a single file, returning facts for the indexer.
 * @param {{absolute:string,relative:string,ext:string,bytes:number}} file
 * @returns {Promise<{
 *   relative:string, nodes:Array, edges:Array,
 *   chunks:Array<{chunk_id,node_id,uri,title,text,vector}>,
 *   content_hash:string, byte_size:number
 * }|null>}
 */
/**
 * Generic fallback for any accepted text artifact: it always creates one
 * graph anchor plus one searchable file identity.  Programming languages
 * use richer parsers where available; configs/docs/lockfiles still matter.
 */
const scanUnknownTextFile = (relative, ext, text, bytes) => {
    const fileId = `f:${relative}`;
    const language = LANGUAGE_BY_EXT.get(ext) || 'text';
    const isBinaryLikeAsset = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf'].includes(ext);
    const nodes = [_mkNode(fileId, isBinaryLikeAsset ? 'ASSET' : 'FILE', path.basename(relative),
        relative, 1, language, null, { bytes: bytes || 0, generic: true })];
    return { fileId, nodes, edges: [], symbols: [] };
};

/**
 * Dependency-free declaration extraction for languages not yet owned by a
 * production-grade parser.  These rules prioritize recall over perfect AST
 * semantics: enough anchors to navigate without inventing compiler duties.
 */
const GENERIC_LANGUAGE_RULES = [
    { exts: ['.rb'], declarations: [
        { rx: /^\s*def\s+([A-Za-z_][\w?!.]*)/, kind: 'FUNCTION' },
        { rx: /^\s*(?:class|module)\s+([A-Z][\w:]*)/, kind: 'TYPE' }
    ], imports: { rx: /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/ } },
    { exts: ['.kt', '.kts'], declarations: [
        { rx: /^\s*(?:suspend\s+)?fun\s+([A-Za-z_][\w<>]*)/, kind: 'FUNCTION' },
        { rx: /^\s*(?:class|interface|object|enum class)\s+([A-Za-z_][\w]*)/, kind: 'TYPE' }
    ] },
    { exts: ['.swift'], declarations: [
        { rx: /^\s*func\s+([A-Za-z_][\w]*)/, kind: 'FUNCTION' },
        { rx: /^\s*(?:class|struct|enum|protocol|extension)\s+([A-Za-z_][\w]*)/, kind: 'TYPE' }
    ], imports: { rx: /^\s*import\s+([\w.]+)/ } },
    { exts: ['.dart'], declarations: [
        { rx: /^\s*(?:[A-Za-z_][\w<>,\s.?]*\s+)?([A-Za-z_][\w]*)\s*\([^;]*\)\s*\{/, kind: 'FUNCTION' },
        { rx: /^\s*(?:abstract\s+)?(?:class|extension|mixin|enum)\s+([A-Za-z_][\w]*)/, kind: 'TYPE' }
    ], imports: { rx: /^\s*import\s+['"]([^'"]+)['"]/ } },
    { exts: ['.php'], declarations: [
        { rx: /^\s*(?:public|private|protected)?\s*function\s+([A-Za-z_][\w]*)/, kind: 'FUNCTION' },
        { rx: /^\s*(?:abstract\s+)?(?:class|interface|trait)\s+([A-Za-z_][\w]*)/, kind: 'TYPE' }
    ], imports: { rx: /^\s*use\s+([\w\\]+);/ } },
    { exts: ['.scala'], declarations: [
        { rx: /^\s*def\s+([A-Za-z_][\w]*)/, kind: 'FUNCTION' },
        { rx: /^\s*(?:class|object|trait)\s+([A-Za-z_][\w]*)/, kind: 'TYPE' }
    ], imports: { rx: /^\s*import\s+([\w.{]+)/ } },
    { exts: ['.lua'], declarations: [
        { rx: /^\s*(?:local\s+)?function\s+([A-Za-z_][\w.:]*)/, kind: 'FUNCTION' }
    ], imports: { rx: /^\s*local\s+\w+\s*=\s*require\s*['"]([^'"]+)['"]/ } },
    { exts: ['.ex', '.exs'], declarations: [
        { rx: /^\s*defp?\s+([A-Za-z_][\w?!]*)/, kind: 'FUNCTION' },
        { rx: /^\s*defmodule\s+([A-Za-z_.][\w.]*)/, kind: 'TYPE' }
    ] },
    { exts: ['.c', '.h'], declarations: [
        { rx: /^[A-Za-z_][\w\s*]*?\b([A-Za-z_][\w]*)\s*\([^;]*\)\s*\{/, kind: 'FUNCTION' },
        { rx: /^\s*(?:typedef\s+)?struct\s+([A-Za-z_][\w]*)/, kind: 'TYPE' }
    ], imports: { rx: /^\s*#include\s+[<"]([^>"]+)[>"]/ } },
    { exts: ['.cpp', '.cc', '.cxx', '.hpp', '.hh'], declarations: [
        { rx: /^[A-Za-z_][\w:<>,\s*&]*?\b([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?:const\s*)?\{/, kind: 'FUNCTION' },
        { rx: /^\s*(?:class|struct)\s+([A-Za-z_][\w]*)/, kind: 'TYPE' }
    ], imports: { rx: /^\s*#include\s+[<"]([^>"]+)[>"]/ } }
];
const GENERIC_RULES_BY_EXT = new Map(GENERIC_LANGUAGE_RULES.flatMap(rule => rule.exts.map(ext => [ext, rule])));

const scanGenericSource = (relative, ext, text) => {
    const rule = GENERIC_RULES_BY_EXT.get(ext);
    if (!rule) return null;
    const fileId = `f:${relative}`;
    const language = LANGUAGE_BY_EXT.get(ext) || ext.slice(1);
    const nodes = [_mkNode(fileId, 'FILE', path.basename(relative), relative, 1, language)];
    const edges = [];
    const symbols = [];
    for (const decl of rule.declarations || []) {
        for (const { match, line } of _collectMatches(new RegExp(decl.rx.source, 'gm'), text)) {
            const name = match[1];
            if (!name) continue;
            const id = `g:${relative}:${name}:L${line}`;
            nodes.push(_mkNode(id, decl.kind, name, relative, line, language, match[0].trim()));
            edges.push({ from_id: fileId, to_id: id, kind: 'DEFINES', strength: 1 });
            symbols.push({ id, kind: decl.kind, name, line });
        }
    }
    if (rule.imports) {
        for (const { match, line } of _collectMatches(new RegExp(rule.imports.rx.source, 'gm'), text)) {
            const target = match.slice(1).find(Boolean);
            if (!target) continue;
            edges.push({
                from_id: fileId, to_id: `ref:${target}`, kind: 'REFERENCES',
                strength: 0.75, line
            });
        }
    }
    return { fileId, nodes, edges, symbols };
};


const scanFile = async (file) => {
    const text = await readFileSafe(file.absolute);
    if (!text) return null;

    const { fileId, nodes, edges, symbols = [] } = (() => {
        const ext = file.ext;
        const relative = file.relative;
        if (file.bytes > MAX_SCANNABLE_SOURCE_BYTES) {
            const sampleLines = text.split('\n').slice(0, TEXT_SAMPLE_ROWS).map(x => x.slice(0, TEXT_ROW_WIDTH));
            const sampled = sampleLines.join('\n').trim();
            const fileId0 = `f:${relative}`;
            if (!sampled) return { fileId: fileId0, nodes: [_mkNode(fileId0, 'ASSET', path.basename(relative), relative, 1, 'text')], edges: [], symbols: [] };
            return {
                fileId: fileId0,
                nodes: [_mkNode(fileId0, 'ASSET', path.basename(relative), relative, 1, 'text', null, { truncated: true, bytes: file.bytes })],
                edges: [],
                symbols: []
            };
        }
        if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs' ||
            ext === '.ts' || ext === '.tsx') {
            return scanJsTs(relative, ext, text);
        }
        if (ext === '.vue') return scanVue(relative, text);
        if (ext === '.java') {
            const fileId2 = `f:${relative}`;
            const nodes2 = [_mkNode(fileId2, 'FILE', path.basename(relative), relative, 1, 'java')];
            const edges2 = [];
            const symbols2 = [];
            for (const { match, line } of _collectMatches(
                /\b(?:public|protected|private|final|abstract|static)?\s*(?:public|protected|private|final|abstract|static)?\s*(?:class|interface|enum|record)\s+([A-Za-z_][\w]*)/g, text)) {
                const cid = `c:${relative}:${match[1]}`;
                nodes2.push(_mkNode(cid, 'CLASS', match[1], relative, line, 'java', match[0]));
                edges2.push({ from_id: fileId2, to_id: cid, kind: 'DEFINES', strength: 1 });
                symbols2.push({ id: cid, kind: 'CLASS', name: match[1], line });
            }
            for (const { match, line } of _collectMatches(
                /\b(?:public|protected|private|static|final|synchronized|abstract)?\s*(?:public|protected|private|static|final|synchronized|abstract)?\s*[A-Za-z_$][\w$.<>\[\]]*\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?:throws\s+[\w.,\s]+)?\s*\{/g, text)) {
                const mid = `m:${relative}:${match[1]}:L${line}`;
                nodes2.push(_mkNode(mid, 'METHOD', match[1], relative, line, 'java', match[0].trim()));
                symbols2.push({ id: mid, kind: 'METHOD', name: match[1], line });
            }
            for (const { match, line } of _collectMatches(
                /\b(?:public|protected|private)?\s*(?:static\s+)?final\s+[A-Za-z_$][\w$.<>\[\]]*\s+([A-Z][A-Z0-9_]*)\s*=/g, text)) {
                nodes2.push(_mkNode(`fld:${relative}:${match[1]}:L${line}`, 'FIELD', match[1], relative, line, 'java', match[0].trim()));
            }
            return { fileId: fileId2, nodes: nodes2, edges: edges2, symbols: symbols2 };
        }
        if (ext === '.go' || ext === '.py') return scanGoPy(relative, ext, text);
        if (ext === '.rs') return scanRust(relative, text);
        if (ext === '.sql' || ext === '.sh' || ext === '.bash' || ext === '.zsh') return scanShellSql(relative, ext, text);
        const genericFact = scanGenericSource(relative, ext, text);
        if (genericFact) return genericFact;
        if (ext === '.md') return scanMarkdown(relative, text, file.bytes);
        if (ext === '.json') return scanConfigFile(relative, ext, text, file.bytes);
        if (ext === '.yaml' || ext === '.yml') return scanConfigFile(relative, ext, text, file.bytes);
        return scanUnknownTextFile(relative, ext, text, file.bytes);
    })();

    if (!nodes || !nodes.length) return null;

    // Deduplicate structural nodes by id while preserving first declaration.
    const seenIds = new Set();
    for (let i = nodes.length - 1; i >= 0; i--) {
        const id = nodes[i].id;
        if (seenIds.has(id)) nodes.splice(i, 1);
        else seenIds.add(id);
    }
    const seenEdges = new Set();
    for (let i = edges.length - 1; i >= 0; i--) {
        const e = edges[i];
        const key = e.from_id + '\u0000' + e.to_id + '\u0000' + e.kind;
        if (seenEdges.has(key)) edges.splice(i, 1);
        else seenEdges.add(key);
    }

    // Framework hints belong to their owning manifest so incremental updates
    // naturally replace them without synthesizing duplicate file states.
    for (const framework of detectFrameworks(file.relative, text)) {
        const slug = framework.toLowerCase().replace(/\W+/g, '-');
        const fid = `fw:${file.relative}:${slug}`;
        nodes.push(_mkNode(fid, 'PROJECT', framework, file.relative, 1, null,
            null, { framework }));
        edges.push({ from_id: fileId, to_id: fid, kind: 'DEFINES', strength: 0.8 });
    }

    const content_hash = crypto.createHash('sha256').update(text).digest('hex');

    const lines = text.split('\n');
    const symbolChunks = [];
    const orderedSymbols = symbols.slice().sort((a, b) =>
        (a.line - b.line) || String(a.id).localeCompare(String(b.id)));
    for (let si = 0; si < orderedSymbols.length && symbolChunks.length < SYMBOL_CHUNK_MAX; si++) {
        const sym = orderedSymbols[si];
        const start = Math.max(0, sym.line - 1);
        const nextLine = si + 1 < orderedSymbols.length
            ? Math.max(sym.line + 1, orderedSymbols[si + 1].line)
            : lines.length + 1;
        const body = lines.slice(start, Math.min(nextLine - 1, start + 180)).join('\n');
        if (!body || body.trim().length < 24) continue;
        const Store = require('./mxt-coder-index');
        symbolChunks.push({
            chunk_id: `sch:${file.relative}:${sym.id}:0`,
            node_id: sym.id,
            uri: file.relative,
            title: `${sym.name} :: ${sym.kind}`,
            text: body,
            vector: Store.CoderIndexStore.embedText(`${sym.kind} ${sym.name}\n${body}`)
        });
    }
    const chunks = [...symbolChunks];
    if (file.bytes <= LARGE_FILE_TEXT_THRESHOLD) {
        chunkText(text, BYTE_WINDOW_SIZE).forEach((win, i) => {
            const Store = require('./mxt-coder-index');
            chunks.push({
                chunk_id: `ch:${file.relative}:${i}`,
                node_id: fileId,
                uri: file.relative,
                title: `${file.relative}#${i}`,
                text: win,
                vector: Store.CoderIndexStore.embedText(win)
            });
        });
    }

    return {
        relative: file.relative,
        nodes,
        edges,
        chunks,
        content_hash,
        byte_size: file.bytes
    };
};

/**
 * One-pass project scan.  Returns per-file facts ready to feed into the index store.
 * @param {string} projectDir
 * @param {(msg:string)=>void} [progress]
 */
const scanProject = async (projectDir, progress) => {
    const files = await discoverFiles(projectDir);
    const results = [];
    for (const file of files) {
        const fact = await scanFile(file);
        if (fact) results.push(fact);
        if (progress && results.length % 200 === 0 && results.length > 0) {
            progress(`indexed ${results.length}/${files.length}`);
        }
    }
    const frameworks = new Set();
    for (const fact of results) {
        for (const node of fact.nodes) {
            if (node.kind === 'PROJECT' && node.meta && node.meta.framework) {
                frameworks.add(node.meta.framework);
            }
        }
    }
    return {
        filesScanned: files.length,
        frameworks: [...frameworks].sort((a, b) => a.localeCompare(b)),
        results
    };
};


/**
 * Parse `.gitmodules` at the repository root.  Submodule paths are returned
 * so a parent-repo scan can (a) exclude them from its own file walk and
 * (b) register SUBMODULE reference nodes pointing at the child checkouts.
 * Empty array when the file is absent or malformed.
 */
const parseGitmodules = (projectDir) => {
    const gmPath = path.join(projectDir, '.gitmodules');
    let text;
    try { text = fs.readFileSync(gmPath, 'utf8'); } catch (_) { return []; }
    const modules = [];
    let current = null;
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        const sec = /^\[submodule\s+"([^"]+)"\]$/.exec(line);
        if (sec) {
            if (current) modules.push(current);
            current = { name: sec[1] };
            continue;
        }
        if (!current) continue;
        const kv = /^(\w+)\s*=\s*(.+)$/.exec(line);
        if (!kv) continue;
        if (kv[1] === 'path') current.path = kv[2].trim();
        else if (kv[1] === 'url') current.url = kv[2].trim();
        else if (kv[1] === 'branch') current.branch = kv[2].trim();
    }
    if (current) modules.push(current);
    return modules.filter(m => m.path && !m.path.includes('..') && !path.isAbsolute(m.path));
};

module.exports = {
    SOURCE_EXTENSIONS,
    SKIP_DIRS,
    discoverFiles,
    parseGitmodules,
    scanProject,
    scanFile,
    analyzeTechnologyStack,
    stackRowsFromScores,
    detectFrameworks,
    chunkText
};
