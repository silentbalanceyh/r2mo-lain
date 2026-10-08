/**
 * Shared scanning pipeline for `mxt coder`.
 *
 * Supports two deterministic repo topologies:
 *   monorepo-with-submodules — one aggregate scan at the top boundary,
 *       with each submodule excluded from the parent file walk and wired
 *       in through SUBMODULE reference nodes + MODULEREF edges.
 *   autonomous-leaf — bare `mxt coder` inside a submodule or standalone
 *       repo resolves to the deepest enclosing git boundary and operates
 *       on it exactly like any single-root project.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const Scanner = require('./mxt-coder-scanner');

/**
 * Resolve the checked-out Git branch (or detached-head SHA prefix) for a repo.
 * Returns null for non-git directories.
 */
const getGitBranch = (absRoot) => {
    try {
        const { execFileSync } = require('child_process');
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
            { cwd: absRoot, encoding: 'utf8', timeout: 5000 }).trim();
        if (branch && branch !== 'HEAD') return branch;
        // Detached: use short SHA for identification.
        const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'],
            { cwd: absRoot, encoding: 'utf8', timeout: 5000 }).trim();
        return sha || null;
    } catch (_) { return null; }
};

const { CoderIndexStore, resolveIndexPath, SCHEMA_VERSION } = require('./mxt-coder-index');

const noopLog = { waiting(){}, info(){}, warn(){}, error(){} };

/* ── boundary helpers ─────────────────────────────────────────────── */

const _isBoundary = (dir) =>
    fs.existsSync(path.join(dir, '.gitmodules')) || fs.existsSync(path.join(dir, '.git'));

/**
 * Deepest nested boundary that is a proper prefix of `dir`, or the nearest
 * enclosing boundary walking upward.  Falls back to `dir` itself for
 * non-repo trees.
 */
const resolveLeafBoundary = (dir) => {
    let enclosing = dir;
    let probe = dir;
    while (probe !== path.dirname(probe)) {
        if (_isBoundary(probe)) { enclosing = probe; break; }
        probe = path.dirname(probe);
    }
    // Descend: pick the LONGEST nested boundary prefix strictly inside enclosing.
    let rel = path.relative(enclosing, dir).replace(/\\/g, '/');
    let best = '';
    if (rel && rel !== '.') {
        const segs = rel.split('/');
        let acc = '';
        for (const seg of segs) {
            acc = acc ? acc + '/' + seg : seg;
            const cand = path.join(enclosing, acc);
            if (_isBoundary(cand)) best = acc;
        }
    }
    return best ? path.join(enclosing, best) : enclosing;
};

/** Climb to the topmost contiguous boundary that owns `leaf`. */
const resolveTopBoundary = (leaf) => {
    let top = leaf;
    let probe = leaf;
    while (probe !== path.dirname(probe)) {
        const parent = path.dirname(probe);
        if (!_isBoundary(parent)) break;
        top = parent;
        probe = parent;
    }
    return top;
};

/**
 * True when `dir` has its own git material (real .git dir, worktree
 * .git file, or equivalent).  A directory satisfying this is treated
 * as an AUTONOMOUS unit regardless of whether a parent aggregator
 * exists further up — that mirrors how developers think: `cd r2mo-lain`
 * feels like opening a standalone project even if matrix envelopes it.
 */
const hasOwnGit = (dir) => {
    const dot = path.join(dir, '.git');
    try {
        const st = fs.lstatSync(dot);
        return st.isFile() || st.isDirectory();
    } catch (_) {
        return false;
    }
};

/* ── hash & gitignore ─────────────────────────────────────────────── */

const hashFile = async (absolute) => {
    try {
        const buf = await fs.promises.readFile(absolute);
        return crypto.createHash('sha256').update(buf).digest('hex');
    } catch (_) {
        return null;
    }
};

const ensureGitignore = (projectDir, entry) => {
    const ignorePath = path.join(projectDir, '.gitignore');
    let content = '';
    try { content = fs.readFileSync(ignorePath, 'utf8'); } catch (_) { /* absent */ }
    const lines = content.split('\n').map(l => l.trim());
    if (lines.includes(entry)) return false;
    if (content && !content.endsWith('\n')) content += '\n';
    fs.writeFileSync(ignorePath, content + entry + '\n');
    return true;
};

/* ── fact extraction ──────────────────────────────────────────────── */

const buildFactForUri = async (absRoot, uri) => {
    const absolute = path.join(absRoot, uri);
    const file = {
        absolute,
        relative: uri,
        ext: path.extname(uri).toLowerCase(),
        bytes: fs.existsSync(absolute) ? fs.statSync(absolute).size : 0
    };
    return Scanner.scanFile(file);
};

const persistFacts = (store, facts, flushedUris) => {
    const allNodes = [];
    const allEdges = [];
    const allChunks = [];
    const fileStates = [];
    for (const fact of facts) {
        allNodes.push(...fact.nodes);
        allEdges.push(...fact.edges);
        allChunks.push(...fact.chunks);
        fileStates.push({
            uri: fact.relative,
            content_hash: fact.content_hash,
            byte_size: fact.byte_size
        });
    }
    const uniqueNodes = new Map();
    for (const n of allNodes) uniqueNodes.set(n.id, n);
    const nodes = [...uniqueNodes.values()];
    const edges = allEdges.filter(e => uniqueNodes.has(e.from_id) && uniqueNodes.has(e.to_id));
    store.persist({ nodes, edges, chunks: allChunks, fileStates },
        flushedUris || facts.map(f => f.relative), []);
    return { nodes, edges, chunks: allChunks, files: facts.length };
};

const classifyDiff = (current, previous) => {
    const changed = []; const added = []; const deleted = [];
    const prevMap = new Map(previous.map(r => [r.uri, r.content_hash]));
    for (const [uri, info] of current) {
        const curHash = typeof info === 'string' ? info : info.hash;
        const prevHash = prevMap.get(uri);
        if (prevHash === undefined) added.push(uri);
        else if (prevHash !== curHash) changed.push(uri);
    }
    for (const [uri] of prevMap) if (!current.has(uri)) deleted.push(uri);
    return { changed, added, deleted };
};

const walkCurrentState = async (absRoot, extraExclude = []) => {
    const files = await Scanner.discoverFiles(absRoot, extraExclude);
    const current = new Map();
    for (const file of files) {
        const hash = await hashFile(file.absolute);
        if (hash) current.set(file.relative, { absolute: file.absolute, hash, bytes: file.bytes });
    }
    return current;
};

const computeDrift = async (store, absRoot, extraExclude = []) => {
    const previous = store.getAllFileStates();
    const current = await walkCurrentState(absRoot, extraExclude);
    const diff = classifyDiff(current, previous);
    const drifted = diff.changed.length + diff.added.length + diff.deleted.length;
    const driftLevel = drifted === 0 ? 'clean'
        : drifted <= 5 ? 'low' : drifted <= 30 ? 'medium' : 'high';
    return { previous, current, ...diff, drifted, driftLevel };
};

/* ── full scan pipeline ───────────────────────────────────────────── */

/**
 * Full (re)build of one store.  Pure — no process.exit, no Ec coupling.
 * Caller supplies logger + decides whether to flush gitignore etc.
 */
const runFullScan = async (absRoot, opts = {}) => {
    const log = opts.logger || noopLog;
    const idx = resolveIndexPath(absRoot);
    fs.mkdirSync(idx.root, { recursive: true });

    if (!opts.force &&
        fs.existsSync(idx.metaPath) && fs.existsSync(idx.graphPath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(idx.metaPath, 'utf8'));
            if (existing && existing.schemaVersion === SCHEMA_VERSION) {
                // Schema matches but the user may have switched Git branches.
                // Branch change invalidates the snapshot: rebuild.
                const currentBranch = getGitBranch(absRoot);
                const indexedBranch = existing.gitBranch || null;
                if (currentBranch && indexedBranch && currentBranch !== indexedBranch) {
                    // fall through to full rebuild
                } else {
                    return { skipped: true, stats: existing.stats };
                }
            }
        } catch (_) { /* corrupt meta → rebuild */ }
    }

    if (opts.ensureIgnore !== false) {
        // The repo namespace itself is derived runtime state. Ignore the whole
        // directory (covers self and future store siblings), never create backups.
        ensureGitignore(absRoot, '.r2mo/repo/');
    }

    // Submodule wiring for parent boundaries.
    const modules = Scanner.parseGitmodules(absRoot);
    const excludeDirs = modules.map(m => m.path);

    log.waiting(`Scanning ${absRoot} ...`);
    const t0 = Date.now();
    const store = new CoderIndexStore(idx.graphPath);
    store.truncateAll();

    const scan = await Scanner.scanProjectWithExclude ?
        await Scanner.scanProjectWithExclude(absRoot, excludeDirs, msg => log.waiting(msg)) :
        await _scanWithExclude(absRoot, excludeDirs, msg => log.waiting(msg));

    let subInfo = { count: 0, healthy: 0 };
    if (modules.length) subInfo = _persistSubmoduleRefs(store, absRoot, modules);

    const persisted = persistFacts(store, scan.results, scan.results.map(r => r.relative));

    // Reconcile: files discovered but producing NO facts (empty source,
    // unsupported shape, transient read failure) must still be recorded
    // in file_states, otherwise every future drift comparison ghosts
    // them as perpetual additions.
    const discovered = await Scanner.discoverFiles(absRoot, excludeDirs);
    const seenUris = new Set(scan.results.map(r => r.relative));
    const orphanStates = [];
    for (const f of discovered) {
        if (seenUris.has(f.relative)) continue;
        const h = await hashFile(f.absolute);
        if (h) orphanStates.push({ uri: f.relative, content_hash: h, byte_size: f.bytes });
    }
    if (orphanStates.length) {
        store.persist({ nodes: [], edges: [], chunks: [], fileStates: orphanStates }, [], []);
    }

    // Project-level stack classification combines file census, manifest
    // content and parsed source samples rather than one primary manifest.
    const byExt = {};
    for (const file of discovered) {
        byExt[file.ext] = (byExt[file.ext] || 0) + 1;
    }
    const sourceSamples = [];
    const sampledUris = new Set();
    for (const chunk of persisted.chunks) {
        if (sourceSamples.length >= 500 || sampledUris.has(chunk.uri)) continue;
        sampledUris.add(chunk.uri);
        sourceSamples.push(String(chunk.text || "").slice(0, 4000));
    }
    const stackRows = Scanner.stackRowsFromScores(
        await Scanner.analyzeTechnologyStack(absRoot, { byExt }, sourceSamples)
    );
    store.setMeta("detectedTechnologies", JSON.stringify(stackRows));
    store.flushVectors();
    store.setMeta('schemaVersion', SCHEMA_VERSION);
    store.setMeta('indexedAt', new Date().toISOString());
    const branch = getGitBranch(absRoot);
    store.setMeta('projectDir', absRoot);
    if (branch) store.setMeta('gitBranch', branch);
    store.setMeta('submodules', subInfo);
    store.close();

    const stats = {
        files: persisted.files,
        nodes: persisted.nodes.length,
        edges: persisted.edges.length,
        chunks: persisted.chunks.length,
        submodules: subInfo.count,
        technologies: stackRows
    };
    fs.writeFileSync(idx.metaPath, JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        indexedAt: new Date().toISOString(),
        projectDir: absRoot,
        gitBranch: branch || undefined,
        stats
    }, null, 2));
    return {
        skipped: false,
        tookMs: Date.now() - t0,
        stats,
        submodules: subInfo
    };
};

/* Internal scanner-with-exclude wrapper so we don't depend on a newer
 * scanner export (backwards compatible). */
// Worker threads have proven unreliable on very large mixed-content repos:
// a silent pool-wide exit loses every fact and reports Files=0. Sequential
// parsing is slightly slower but deterministic, streaming-safe and easier to
// diagnose. Re-enable batching only behind an explicit opt-in flag.
const WORKER_COUNT = 1;
const PARALLEL_THRESHOLD = 30;   // below this, single-thread is cheaper

/**
 * Fan a list of discovered files across a worker pool.  Each worker loads
 * the same pure scanner module (cached), processes its slice, and posts
 * per-file facts back.  Falls back to sequential scanning for tiny inputs
 * or when worker spawn fails.
 */
const _scanFilesParallel = async (files, progress) => {
    if (files.length < PARALLEL_THRESHOLD || WORKER_COUNT < 2) {
        const results = [];
        for (const f of files) {
            const fact = await Scanner.scanFile(f);
            if (fact) results.push(fact);
            if (progress && results.length % 200 === 0 && results.length > 0) {
                progress(`indexed ${results.length}/${files.length}`);
            }
        }
        return results;
    }
    const batchSize = Math.ceil(files.length / WORKER_COUNT);
    const batches = [];
    for (let i = 0; i < files.length; i += batchSize) batches.push(files.slice(i, i + batchSize));
    const settled = await Promise.all(batches.map((batch, idx) => new Promise((resolve, reject) => {
        let w;
        try {
            w = new Worker(__filename, { workerData: { files: batch } });
        } catch (spawnErr) {
            // Sequential fallback for this batch only.
            (async () => {
                const seq = [];
                for (const f of batch) {
                    const fact = await Scanner.scanFile(f);
                    if (fact) seq.push(fact);
                }
                resolve(seq);
            })();
            return;
        }
        let settled = false;
        w.once('message', (msg) => {
            if (settled) return;
            settled = true;
            resolve(msg.facts || []);
            w.terminate().catch(() => {});
        });
        w.once('error', (err) => {
            if (settled) return;
            settled = true;
            // Fall back to sequential on any worker error.
            (async () => {
                const seq = [];
                for (const f of batch) {
                    try {
                        const fact = await Scanner.scanFile(f);
                        if (fact) seq.push(fact);
                    } catch (_) { /* skip unreadable */ }
                }
                resolve(seq);
            })();
        });
        w.once('exit', (code) => {
            if (settled) return;
            settled = true;
            if (code === 0) resolve([]);
            else reject(new Error('worker exited ' + code));
        });
        void batch;
        void progress;
    })));
    const flat = settled.flat();
    if (progress) progress(`parallel scan: ${flat.length}/${files.length} facts collected`);
    return flat;
};

const _scanWithExclude = async (absRoot, excludeDirs, progress) => {
    const files = await Scanner.discoverFiles(absRoot, excludeDirs);
    const results = await _scanFilesParallel(files, progress);
    const frameworks = new Set();
    for (const fact of results) {
        for (const node of fact.nodes) {
            if (node.kind === 'PROJECT' && node.meta && node.meta.framework) frameworks.add(node.meta.framework);
        }
    }
    return { filesScanned: files.length, results };
};
const _persistSubmoduleRefs = (store, absRoot, modules) => {
    const nodes = [];
    const edges = [];
    let healthy = 0;
    for (const mod of modules) {
        const modAbs = path.join(absRoot, mod.path);
        const hasCheckout = fs.existsSync(modAbs) && fs.readdirSync(modAbs).length > 0;
        if (hasCheckout) healthy++;
        const id = `sm:${mod.path}`;
        nodes.push({
            id, kind: 'SUBMODULE',
            name: mod.name,
            uri: mod.path,
            line: 1,
            language: null,
            signature: null,
            meta: { url: mod.url, branch: mod.branch, healthy: hasCheckout ? 1 : 0 }
        });
        edges.push({ from_id: `f:.gitmodules`, to_id: id, kind: 'MODULEREF', strength: 0.9 });
    }
    // Make sure the synthetic .gitmodules FILE node exists for the edge target.
    if (modules.length) {
        nodes.unshift({
            id: 'f:.gitmodules', kind: 'FILE', name: '.gitmodules',
            uri: '.gitmodules', line: 1, language: 'ini',
            signature: null, meta: { synthetic: true }
        });
    }
    if (nodes.length) {
        const unique = new Map(nodes.map(n => [n.id, n]));
        store.persist({ nodes: [...unique.values()], edges, chunks: [], fileStates: [] }, [], []);
    }
    return { count: modules.length, healthy };
};

/* ── incremental update pipeline ──────────────────────────────────── */

const runIncrementalUpdate = async (absRoot, opts = {}) => {
    const log = opts.logger || noopLog;
    const idx = resolveIndexPath(absRoot);
    if (!fs.existsSync(idx.graphPath)) {
        const full = await runFullScan(absRoot, { ...opts, force: false });
        return { fallbackToFull: true, ...full };
    }
    // Branch switch invalidates the old snapshot: force a full rebuild.
    const currentBranch = getGitBranch(absRoot);
    let indexedBranch = null;
    try {
        const meta = JSON.parse(fs.readFileSync(idx.metaPath, 'utf8'));
        indexedBranch = meta.gitBranch || null;
    } catch (_) { /* absent meta */ }
    if (currentBranch && indexedBranch && currentBranch !== indexedBranch) {
        return { fallbackToFull: true, ...(await runFullScan(absRoot, { ...opts, force: true })) };
    }

    const modules = Scanner.parseGitmodules(absRoot);
    const extraExclude = modules.map(m => m.path);
    const store = new CoderIndexStore(idx.graphPath);
    const drift = await computeDrift(store, absRoot, extraExclude);
    if (drift.drifted === 0) {
        store.close();
        return { updated: 0, added: 0, changed: 0, deleted: 0 };
    }
    const touched = [...drift.added, ...drift.changed];
    const touchedPlusDeleted = [...touched, ...drift.deleted];
    store.persist({ nodes: [], edges: [], chunks: [], fileStates: [] },
        touchedPlusDeleted, drift.deleted);
    const FactScanner = require('./mxt-coder-scanner');
    const CryptoLib = require('crypto');
    for (const uri of touched) {
        const fact = await buildFactForUri(absRoot, uri);
        if (fact) {
            const ownIds = new Set(fact.nodes.map(n => n.id));
            const validEdges = fact.edges.filter(e => ownIds.has(e.from_id) && (
                ownIds.has(e.to_id) ||
                String(e.to_id || '').startsWith('ref:') ||
                store.db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(e.to_id)
            ));
            store.persist({
                nodes: fact.nodes, edges: validEdges, chunks: fact.chunks,
                fileStates: [{ uri: fact.relative, content_hash: fact.content_hash, byte_size: fact.byte_size }]
            }, [fact.relative], []);
            continue;
        }
        // Empty / read-failed / unsupported files still need a file_state
        // row so future drift comparisons don't endlessly report them as
        // new additions.
        try {
            const abs = path.join(absRoot, uri);
            const body = await FactScanner.discoverFiles ? await fs.promises.readFile(abs).then(b => b.toString('utf8').replace(/\0/g,'')) : '';
            const hash = CryptoLib.createHash('sha256').update(body).digest('hex');
            const byteSize = Buffer.byteLength(body, 'utf8');
            store.persist({
                nodes: [], edges: [], chunks: [],
                fileStates: [{ uri, content_hash: hash, byte_size: byteSize }]
            }, [uri], []);
        } catch (_) { /* vanished mid-update; leave deletion pending next cycle */ }
    }
    store.flushVectors();
    store.setMeta('updatedAt', new Date().toISOString());
    store.close();
    try {
        const meta = JSON.parse(fs.readFileSync(idx.metaPath, 'utf8'));
        meta.updatedAt = new Date().toISOString();
        fs.writeFileSync(idx.metaPath, JSON.stringify(meta, null, 2));
    } catch (_) { /* meta file unavailable */ }
    return { updated: touched.length, added: drift.added.length, changed: drift.changed.length, deleted: drift.deleted.length };
};

/* ── two-mode hierarchy resolution ────────────────────────────────── */

/**
 * Topology resolver.  Autonomous-first:
 *   • cwd (or nearest enclosing dir) carries .git material  → that dir
 *     is treated as the effective top AND leaf; if it ALSO has
 *     .gitmodules it becomes an aggregate.
 *   • otherwise fall back to single-store rooted at cwd (non-repo tree).
 */
const resolveTopology = (cwd) => {
    // Walk down from cwd only — never climb past a dir with own .git.
    let root = cwd;
    // If cwd is a plain subdir inside a boundary, we STILL treat the
    // deepest boundary encountered downward from cwd as authoritative.
    // Simplification: prefer cwd's own git material when present.
    const modulesHere = Scanner.parseGitmodules(root);
    if (hasOwnGit(root) && !modulesHere.length) {
        return { mode: 'single', topBoundary: root, leafBoundary: root,
                 stores: [{ alias: 'self', root, primary: true }] };
    }
    if (modulesHere.length) {
        const aggregates = modulesHere
            .map(m => ({ ...m, abs: path.join(root, m.path) }))
            .filter(m => fs.existsSync(m.abs))
            .filter(m => Scanner.parseGitmodules(m.abs).length === 0)  // leaf submodules only
            .filter(m => fs.readdirSync(m.abs).length > 0);
        return {
            mode: 'aggregate',
            topBoundary: root,
            leafBoundary: root,
            stores: [
                { alias: 'self', root, primary: true },
                ...aggregates.map(m => ({
                    alias: m.name, root: m.abs, primary: false, url: m.url
                }))
            ]
        };
    }
    // Neither own-git nor .gitmodules here → fall back to plain single.
    return { mode: 'single', topBoundary: root, leafBoundary: root,
             stores: [{ alias: 'self', root, primary: true }] };
};


/* Worker bootstrap: runs when this file is loaded inside a worker_thread. */
if (!isMainThread) {
    (async () => {
        try {
            const files = workerData && workerData.files ? workerData.files : [];
            const facts = [];
            for (const f of files) {
                const fact = await Scanner.scanFile(f);
                if (fact) facts.push(fact);
            }
            parentPort.postMessage({ facts });
        } catch (e) {
            parentPort.postMessage({ facts: [], error: String(e && e.message || e) });
        }
    })();
}

module.exports = {
    hasOwnGit,
    getGitBranch,
    resolveLeafBoundary,
    resolveTopBoundary,
    hashFile,
    ensureGitignore,
    classifyDiff,
    walkCurrentState,
    computeDrift,
    buildFactForUri,
    persistFacts,
    runFullScan,
    runIncrementalUpdate,
    resolveTopology,
    SCHEMA_VERSION
};
// touch marker
