/**
 * Local multi-store index backing `mxt coder`.
 *
 * Meta, graph, lexical stores are persisted in one SQLite database.
 * Vector recall is provided as a bounded in-memory fallback so the first
 * usable loop carries zero additional npm dependencies.  A later
 * high-performance profile may swap this module for dedicated engines.
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = '2.2.3';

const _defaultRoot = () => path.join(process.cwd(), '.r2mo', 'repo', 'self');

/**
 * Resolve the coder index root for a project directory.
 * @param {string} [projectDir] defaults to process.cwd()
 * @returns {{root:string, graphPath:string, vectorPath:string, metaPath:string}}
 */
const resolveIndexPath = (projectDir) => {
    const root = projectDir
        ? path.join(projectDir, '.r2mo', 'repo', 'self')
        : _defaultRoot();
    return {
        root,
        graphPath: path.join(root, 'graph.db'),
        vectorPath: path.join(root, 'graph.db'),
        metaPath: path.join(root, 'meta.json')
    };
};

const _tuneSqlite = (db) => {
    try {
        db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -65536;
            PRAGMA mmap_size = 134217728;
        `);
    } catch (_) { /* best effort */ }
};

const _initGraphDb = (db) => {
    _tuneSqlite(db);
    db.exec(`
        CREATE TABLE IF NOT EXISTS vectors (
            chunk_id TEXT PRIMARY KEY,
            dim INTEGER NOT NULL,
            cell INTEGER,
            blob BLOB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_vectors_cell ON vectors(cell);
        CREATE TABLE IF NOT EXISTS ivf_centroids (
            cell INTEGER PRIMARY KEY,
            dim INTEGER NOT NULL,
            blob BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ivf_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS meta_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS file_states (
            uri TEXT PRIMARY KEY,
            content_hash TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            indexed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            uri TEXT,
            line INTEGER,
            language TEXT,
            signature TEXT,
            content_hash TEXT,
            meta_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_uri ON nodes(uri);
        CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
        CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
        CREATE TABLE IF NOT EXISTS edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id TEXT NOT NULL,
            to_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            strength REAL NOT NULL DEFAULT 1.0
        );
        CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
        CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
        CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            chunk_id UNINDEXED,
            node_id UNINDEXED,
            uri UNINDEXED,
            title,
            body
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_cn_fts USING fts5(
            chunk_id UNINDEXED,
            node_id UNINDEXED,
            uri UNINDEXED,
            title,
            body
        );
    `);
};

/**
 * Expand contiguous CJK runs into character bigrams so SQLite unicode61 can
 * recall partial Chinese phrases.  Latin words remain unchanged.
 * @param {string} text
 * @returns {string} token-space text suited to the auxiliary FTS index
 */

/* ---------- IVF vector index helpers ---------- */

const _serializeVec = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
const _deserializeVec = (buf, dim) => {
    const out = new Float32Array(dim);
    new Uint8Array(out.buffer).set(new Uint8Array(buf));
    return out;
};

const _trainCentroids = (points, k, dim, iterations = 8) => {
    if (!points.length) return [];
    const effK = Math.max(1, Math.min(k, points.length));
    const centroids = [];
    for (let i = 0; i < effK; i++) {
        centroids.push(Float32Array.from(points[Math.floor(i * points.length / effK)]));
    }
    for (let iter = 0; iter < iterations; iter++) {
        const sums = Array.from({ length: centroids.length }, () => new Float32Array(dim));
        const counts = new Array(centroids.length).fill(0);
        for (const pt of points) {
            let bi = 0; let bs = Infinity;
            for (let ci = 0; ci < centroids.length; ci++) {
                let d = 0; const c = centroids[ci];
                for (let di = 0; di < dim; di++) { const f = c[di] - pt[di]; d += f * f; }
                if (d < bs) { bs = d; bi = ci; }
            }
            for (let di = 0; di < dim; di++) sums[bi][di] += pt[di];
            counts[bi]++;
        }
        for (let ci = 0; ci < centroids.length; ci++) {
            if (!counts[ci]) continue;
            for (let di = 0; di < dim; di++) centroids[ci][di] = sums[ci][di] / counts[ci];
        }
    }
    return centroids;
};


const _rankCentroids = (vec, centroids, dim) => {
    const dists = centroids.map((c, i) => {
        let d = 0;
        for (let di = 0; di < dim; di++) { const f = c[di] - vec[di]; d += f * f; }
        return { i, d };
    });
    dists.sort((a, b) => a.d - b.d);
    return dists.map(x => x.i);
};
const _nearestCentroid = (vec, centroids, dim) => {
    let bi = 0; let bs = Infinity;
    for (let ci = 0; ci < centroids.length; ci++) {
        let d = 0; const c = centroids[ci];
        for (let di = 0; di < dim; di++) { const f = c[di] - vec[di]; d += f * f; }
        if (d < bs) { bs = d; bi = ci; }
    }
    return bi;
};

const _cjkBigramText = (text) => {
    if (!text) return '';
    return String(text).toLowerCase().split(/(\s+)/).map(part => {
        if (!/[\u4e00-\u9fff]/.test(part)) return part;
        return part.replace(/[\u4e00-\u9fff]+/g, (run) => {
            if (run.length <= 2) return run;
            const grams = [];
            for (let i = 0; i < run.length - 1; i++) grams.push(run.slice(i, i + 2));
            return grams.join(' ');
        });
    }).join('');
};

/**
 * Pure lexical tokenizer.  Lowercases, splits camelCase and snake-case
 * tokens, strips non-word noise, and drops single-letter dust so Chinese
 * phrases survive as whole tokens.
 * @param {string} text
 * @returns {string[]} normalized tokens
 */
/**
 * Convert lexical tokens into quoted CJK bigrams for recall against
 * `_cjkBigramText`.
 * @param {string[]} tokens
 * @returns {string[]} FTS-ready quoted terms
 */
const cjkBigramTerms = (tokens) => {
    const terms = [];
    for (const token of tokens || []) {
        const expanded = _cjkBigramText(token).split(/\s+/).filter(Boolean);
        if (!expanded.length) expanded.push(token);
        for (const term of expanded) terms.push(`"${term}"`);
    }
    return [...new Set(terms)];
};

const tokenize = (text) => {
    if (!text) return [];
    return String(text)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff]+/)
        .filter(token => token.length > 1);
};

class CoderIndexStore {
    /**
     * @param {string} graphPath absolute path to the SQLite database file
     */
    constructor(graphPath) {
        this.graphPath = graphPath;
        this.db = new DatabaseSync(graphPath);
        this._vectors = null;
        this._ivf = null;
        _initGraphDb(this.db);
        this._ivfLoaded = false;
    }

    close() {
        if (this.db) {
            try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) { /* best effort */ }
            try { this.db.exec('PRAGMA journal_mode = DELETE;'); } catch (_) { /* leave valid WAL */ }
            this.db.close();
            this.db = undefined;
        }
    }

    // ---------------------------------------------------------------
    // meta store
    // ---------------------------------------------------------------

    /** @param {string} key @param {string} value */
    setMeta(key, value) {
        this.db.prepare(
            'INSERT INTO meta_store(key,value) VALUES (?,?) ' +
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        ).run(String(key), String(value));
    }

    /** @param {string} key @returns {string|null} */
    getMeta(key) {
        const row = this.db.prepare('SELECT value FROM meta_store WHERE key = ?').get(String(key));
        return row ? row.value : null;
    }

    /** @returns {string} current schema version stored in meta */
    getSchemaVersion() {
        return this.getMeta('schemaVersion');
    }

    // ---------------------------------------------------------------
    // graph + lexical + vector store writers
    // ---------------------------------------------------------------

    /**
     * Persist the supplied facts transactionally.  All four conceptual
     * stores (meta / graph / lexical / vector) are refreshed inside one
     * BEGIN IMMEDIATE transaction keyed by file URI.
     * @param {{
     *   nodes:Array<{id:string,kind:string,name:string,uri:string,line:number?,
     *     language:string?,signature:string?,content_hash?:string,meta?:object}>,
     *   edges:Array<{from_id:string,to_id:string,kind:string,strength?:number}>,
     *   chunks:Array<{chunk_id:string,node_id:string,uri:string,title:string,
     *     text:string,vector:Float32Array|number[]}>,
     *   fileStates:Array<{uri:string,content_hash:string,byte_size:number}>
     * }} facts
     * @param {Array<string>} changedUris uris whose previous rows must be replaced
     * @param {Array<string>} [removedUris] uris deleted from disk entirely
     */
    persist(facts, changedUris, removedUris = []) {
        const byId = new Map(facts.nodes.map(n => [n.id, n]));
        const allUris = [...changedUris, ...removedUris];
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const delEdges = this.db.prepare(
                'DELETE FROM edges WHERE from_id = ? OR to_id = ?'
            );
            const delNodes = this.db.prepare('DELETE FROM nodes WHERE uri = ?');
            const delFile = this.db.prepare('DELETE FROM file_states WHERE uri = ?');
            const delFts = this.db.prepare('DELETE FROM chunks_fts WHERE uri = ?');
            const delCnFts = this.db.prepare('DELETE FROM chunks_cn_fts WHERE uri = ?');

            for (const uri of allUris) {
                const nodeIds = this.db.prepare(
                    'SELECT id FROM nodes WHERE uri = ?'
                ).all(uri).map(row => row.id);
                for (const nodeId of nodeIds) delEdges.run(nodeId, nodeId);
                delFts.run(uri);
                delCnFts.run(uri);
                delNodes.run(uri);
                delFile.run(uri);
            }

            const insNode = this.db.prepare(`
                INSERT INTO nodes(id,kind,name,uri,line,language,signature,content_hash,meta_json)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    kind=excluded.kind,name=excluded.name,uri=excluded.uri,
                    line=excluded.line,language=excluded.language,
                    signature=excluded.signature,content_hash=excluded.content_hash,
                    meta_json=excluded.meta_json
            `);
            for (const n of facts.nodes) {
                insNode.run(
                    n.id, n.kind, n.name, n.uri || null,
                    Number.isFinite(n.line) ? Math.trunc(n.line) : null,
                    n.language || null, n.signature || null,
                    n.content_hash || null,
                    n.meta ? JSON.stringify(n.meta) : null
                );
            }

            const seen = new Set();
            const insEdge = this.db.prepare(
                'INSERT INTO edges(from_id,to_id,kind,strength) VALUES (?,?,?,?)'
            );
            for (const e of facts.edges) {
                if (!byId.has(e.from_id)) continue;
                const key = `${e.from_id}\u0000${e.to_id}\u0000${e.kind}`;
                if (seen.has(key)) continue;
                seen.add(key);
                insEdge.run(e.from_id, e.to_id, e.kind,
                    Number.isFinite(e.strength) ? e.strength : 1.0);
            }

            const insFts = this.db.prepare(`
                INSERT INTO chunks_fts(chunk_id,node_id,uri,title,body)
                VALUES (?,?,?,?,?)
            `);
            const insCnFts = this.db.prepare(`
                INSERT INTO chunks_cn_fts(chunk_id,node_id,uri,title,body)
                VALUES (?,?,?,?,?)
            `);
            for (const c of facts.chunks) {
                if (!byId.has(c.node_id)) continue;
                insFts.run(c.chunk_id, c.node_id, c.uri || '', c.title || '', c.text || '');
                insCnFts.run(c.chunk_id, c.node_id, c.uri || '', c.title || '', _cjkBigramText(c.text || ''));
                this._putVector(c.chunk_id, c.vector);
            }

            const insFile = this.db.prepare(`
                INSERT INTO file_states(uri,content_hash,byte_size,indexed_at)
                VALUES (?,?,?,datetime('now'))
            `);
            for (const f of facts.fileStates) {
                insFile.run(f.uri, f.content_hash, f.byte_size);
            }

            this.db.exec('COMMIT');
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
            throw error;
        }
    }

    /** Drop everything and restore blank tables (used by forced rescan). */
    truncateAll() {
        this.db.exec(`
            DELETE FROM edges;
            DELETE FROM chunks_fts;
            DELETE FROM chunks_cn_fts;
            DELETE FROM nodes;
            DELETE FROM file_states;
            DELETE FROM meta_store;
            DELETE FROM vectors;
            DELETE FROM ivf_centroids;
            DELETE FROM ivf_meta;
        `);
        this._vectors = null;
        this._ivf = null;
        this._ivfLoaded = false;
    }

    // ---------------------------------------------------------------
    // vector fallback store
    // ---------------------------------------------------------------

    _loadVectors(forceRefresh = false) {
        if (this._vectors && !forceRefresh) return this._vectors;
        const map = new Map();
        try {
            const rows = this.db.prepare('SELECT chunk_id, blob FROM vectors').all();
            for (const r of rows) map.set(r.chunk_id, _deserializeVec(r.blob, this._dimFor()));
        } catch (_) { /* fresh store */ }
        this._vectors = map;
        this._loadIvf();
        return map;
    }

    _dimFor() { return 128; }

    _loadIvf() {
        if (this._ivfLoaded) return;
        try {
            const cnt = this.db.prepare('SELECT COUNT(*) AS n FROM ivf_centroids').get().n;
            if (!cnt) { this._ivfLoaded = true; return; }
            const rows = this.db.prepare('SELECT cell, blob FROM ivf_centroids ORDER BY cell').all();
            this._ivf = rows.map(r => _deserializeVec(r.blob, this._dimFor()));
        } catch (_) { this._ivf = null; }
        this._ivfLoaded = true;
    }

    _persistVectors() {
        if (!this._vectors) return;
        this._putVectorsFromCacheIntoDb();
        this._maybeTrainIvf();
    }

    _putVectorsFromCacheIntoDb() {
        const map = this._vectors;
        if (!map) return;
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const alive = new Set(
                this.db.prepare('SELECT chunk_id FROM chunks_fts').all().map(r => r.chunk_id)
            );
            const del = this.db.prepare('DELETE FROM vectors WHERE chunk_id = ?');
            const ins = this.db.prepare('INSERT OR REPLACE INTO vectors(chunk_id, dim, cell, blob) VALUES (?,?,NULL,?)');
            for (const [id, vec] of map.entries()) {
                del.run(id);
                if (alive.has(id)) ins.run(id, vec.length, _serializeVec(vec));
            }
            this.db.exec('COMMIT');
        } catch (e) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            throw e;
        }
    }

    _maybeTrainIvf() {
        const cnt = this.db.prepare('SELECT COUNT(*) AS n FROM vectors').get().n;
        if (cnt < 32) return;                       // brute force below threshold
        const existing = this.db.prepare("SELECT value FROM ivf_meta WHERE key='trained_count'").get();
        const trained = existing ? Number(existing.value) : 0;
        if (Math.abs(cnt - trained) < Math.ceil(cnt * 0.25)) return;  // 25% drift gate
        const k = Math.max(8, Math.round(Math.sqrt(cnt)));
        const rows = this.db.prepare('SELECT chunk_id, blob FROM vectors LIMIT 5000').all();
        const sample = rows.map(r => _deserializeVec(r.blob, this._dimFor()));
        const cents = _trainCentroids(sample, k, this._dimFor(), 6);
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.exec('DELETE FROM ivf_centroids; DELETE FROM ivf_meta;');
            const ins = this.db.prepare('INSERT INTO ivf_centroids(cell,dim,blob) VALUES (?,?,?)');
            cents.forEach((c, i) => ins.run(i, this._dimFor(), _serializeVec(c)));
            this.db.prepare("INSERT INTO ivf_meta(key,value) VALUES ('trained_count',?)").run(String(cnt));
            // assign each vector its cell
            const all = this.db.prepare('SELECT chunk_id, blob FROM vectors').all();
            const upd = this.db.prepare('UPDATE vectors SET cell=? WHERE chunk_id=?');
            for (const r of all) {
                const v = _deserializeVec(r.blob, this._dimFor());
                upd.run(_nearestCentroid(v, cents, this._dimFor()), r.chunk_id);
            }
            this.db.exec('COMMIT');
            this._ivf = cents;
            this._ivfLoaded = true;
        } catch (e) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            throw e;
        }
    }

    /** @private */
    _putVector(chunkId, vector) {
        if (!vector || !vector.length) return;
        if (!this._vectors) this._vectors = new Map();
        this._vectors.set(chunkId, Float32Array.from(vector));
    }

    /**
     * Naive bag-of-character-trigram embedding.  Cheap, deterministic,
     * language-agnostic.  Good enough to give locate a semantic signal in
     * addition to exact FTS hits; a real embedding model plugs in later.
     * @param {string} text
     * @returns {Float32Array}
     */
    static embedText(text) {
        const DIM = 128;
        const vec = new Float32Array(DIM);
        const clean = String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
        const grams = [];
        const parts = clean.split(/\s+/).filter(Boolean);
        for (const part of parts) {
            if (part.length <= 3) {
                grams.push(part);
                continue;
            }
            for (let i = 0; i <= part.length - 3; i++) grams.push(part.slice(i, i + 3));
        }
        for (const gram of grams) {
            let hash = 2166136261;
            for (let i = 0; i < gram.length; i++) {
                hash ^= gram.charCodeAt(i);
                hash = Math.imul(hash, 16777619) >>> 0;
            }
            vec[hash % DIM] += 1;
        }
        let norm = 0;
        for (const v of vec) norm += v * v;
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < DIM; i++) vec[i] /= norm;
        return vec;
    }

    /**
     * Bounded cosine similarity scan across cached vectors.
     * @param {Float32Array} queryVec
     * @param {number} limit
     * @returns {Array<{chunkId:string,score:number}>}
     */
    searchVectors(queryVec, limit = 20) {
        this._loadIvf();   // cheap: centroid-only read
        const results = [];
        let pool = [];
        const PROBES = 2;
        if (this._ivf && this._ivf.length > 0) {
            const ranked = _rankCentroids(queryVec, this._ivf, this._dimFor()).slice(0, PROBES);
            const stmt = this.db.prepare('SELECT chunk_id, blob FROM vectors WHERE cell = ? LIMIT 8000');
            for (const cell of ranked) {
                for (const r of stmt.all(cell)) {
                    pool.push([r.chunk_id, _deserializeVec(r.blob, this._dimFor())]);
                }
                if (pool.length >= 6000) break;
            }
        }
        if (!pool.length) {
            // Brute-force fallback, paginated to bound memory.
            const PAGE = 10000;
            let offset = 0;
            const stmt = this.db.prepare('SELECT chunk_id, blob FROM vectors LIMIT ' + PAGE + ' OFFSET ?');
            while (true) {
                const rows = stmt.all(offset);
                if (!rows.length) break;
                for (const r of rows) pool.push([r.chunk_id, _deserializeVec(r.blob, this._dimFor())]);
                offset += PAGE;
                if (offset > 400000) break;   // safety valve
            }
        }
        for (const [chunkId, v] of pool) {
            if (v.length !== queryVec.length) continue;
            let dot = 0;
            for (let i = 0; i < queryVec.length; i++) dot += queryVec[i] * v[i];
            if (dot > 0.001) results.push({ chunkId, score: dot });
        }
        results.sort((a, b) => b.score - a.score);
        const top = results.slice(0, limit);
        if (!top.length) return top;
        const marks = top.map(() => '?').join(',');
        try {
            const chunkRows = this.db.prepare(
                `SELECT chunk_id, node_id FROM chunks_fts WHERE chunk_id IN (${marks})`
            ).all(...top.map(row => row.chunkId));
            const nodeByChunk = new Map(chunkRows.map(row => [row.chunk_id, row.node_id]));
            for (const row of top) row.nodeId = nodeByChunk.get(row.chunkId) || null;
        } catch (_) {
            for (const row of top) row.nodeId = null;
        }
        return top;
    }
    flushVectors() {
        this._persistVectors();
    }

    // ---------------------------------------------------------------
    // readers
    // ---------------------------------------------------------------

    /** @returns {Array<{uri:string,content_hash:string,byte_size:number,indexed_at:string}>} */
    getAllFileStates() {
        return this.db.prepare(
            'SELECT uri, content_hash, byte_size, indexed_at FROM file_states'
        ).all();
    }

    /**
     * Secondary CJK-bigram recall.  Input terms have already been expanded by
     * {@link cjkBigramTerms}.
     * @param {string} matchExpression escaped FTS5 match expression fragment
     * @param {number} [limit]
     */
    lexicalCjkSearch(matchExpression, limit = 30) {
        try {
            return this.db.prepare(
                `SELECT chunk_id, node_id, uri, title, body,
                        bm25(chunks_cn_fts) AS rank
                   FROM chunks_cn_fts
                  WHERE chunks_cn_fts MATCH ?
                  ORDER BY rank
                  LIMIT ?`
            ).all(String(matchExpression), limit);
        } catch (_) {
            return [];
        }
    }

    /** @param {string} term escaped FTS5 match expression fragment */
    lexicalSearch(matchExpression, limit = 30) {
        try {
            return this.db.prepare(
                `SELECT chunk_id, node_id, uri, title, body,
                        bm25(chunks_fts) AS rank
                   FROM chunks_fts
                  WHERE chunks_fts MATCH ?
                  ORDER BY rank
                  LIMIT ?`
            ).all(String(matchExpression), limit);
        } catch (_) {
            return [];
        }
    }

    /** @param {string} nodeId */
    getNode(nodeId) {
        return this.db.prepare(
            'SELECT id,kind,name,uri,line,language,signature,content_hash,meta_json FROM nodes WHERE id = ?'
        ).get(nodeId);
    }

    getNodesByIds(ids) {
        if (!ids.length) return [];
        const marks = ids.map(() => '?').join(',');
        return this.db.prepare(
            `SELECT id,kind,name,uri,line,language,signature,content_hash,meta_json FROM nodes WHERE id IN (${marks})`
        ).all(...ids);
    }

    /**
     * Outgoing + incoming neighbours of a node, optionally filtered by edge kind.
     * @param {string} nodeId
     * @param {string[]} [edgeKinds]
     * @param {number} [limit]
     */
    getNeighbours(nodeId, edgeKinds, limit = 40) {
        const clause = edgeKinds && edgeKinds.length
            ? `AND e.kind IN (${edgeKinds.map(() => '?').join(',')})`
            : '';
        const outgoing = this.db.prepare(`
            SELECT e.kind, e.strength, n.*
              FROM edges e JOIN nodes n ON n.id = e.to_id
             WHERE e.from_id = ? ${clause}
             ORDER BY e.strength DESC LIMIT ?
        `).all(nodeId, ...(edgeKinds || []), limit);
        const incoming = this.db.prepare(`
            SELECT e.kind, e.strength, n.*
              FROM edges e JOIN nodes n ON n.id = e.from_id
             WHERE e.to_id = ? ${clause}
             ORDER BY e.strength DESC LIMIT ?
        `).all(nodeId, ...(edgeKinds || []), limit);
        return { outgoing, incoming };
    }

    /** Recursive breadth expansion using iterative bounded queries. */
    expandClosure(startIds, maxDepth = 2, maxNodes = 80, edgeKinds) {
        const visited = new Set(startIds);
        let frontier = [...startIds];
        for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
            const next = [];
            for (const nodeId of frontier) {
                const { outgoing, incoming } = this.getNeighbours(nodeId, edgeKinds, 24);
                for (const row of [...outgoing, ...incoming]) {
                    if (!visited.has(row.id) && visited.size < maxNodes) {
                        visited.add(row.id);
                        next.push(row.id);
                    }
                }
                if (visited.size >= maxNodes) break;
            }
            frontier = next;
        }
        return this.getNodesByIds([...visited]);
    }

    /**
     * Canonical framework hints detected from graph node metadata, kept
     * synchronized by scanner-sourced PROJECT facts.
     * @returns {Array<{name:string,total:number}>}
     */
    getFrameworks() {
        try {
            const projected = this.getMeta("detectedTechnologies");
            if (projected) {
                const rows = JSON.parse(projected);
                if (Array.isArray(rows) && rows.length) {
                    return rows.filter(row => row.category === 'framework').map(row => ({ name: row.name, total: row.score, signals: row.signals }));
                }
            }
        } catch (_) { /* fall back to node-derived framework hints */ }
        try {
            return this.db.prepare(`
                SELECT nf.framework AS name, COUNT(*) AS total
                  FROM (
                    SELECT COALESCE(json_extract(meta_json, '$.framework'), '') AS framework
                      FROM nodes
                     WHERE meta_json IS NOT NULL
                       AND json_valid(meta_json)
                  ) nf
                 WHERE nf.framework != ''
                 GROUP BY nf.framework
                 ORDER BY nf.framework ASC
            `).all();
        } catch (_) {
            return [];
        }
    }

    /** Aggregate statistics for `status`. */
    getStats() {
        const scalar = (sql) => {
            try {
                return this.db.prepare(sql).get();
            } catch (_) {
                return null;
            }
        };
        const countOf = (row) => row ? Object.values(row)[0] : 0;
        const languages = this.db.prepare(
            'SELECT COALESCE(language, \'unknown\') AS language, COUNT(*) AS total FROM nodes GROUP BY language ORDER BY total DESC'
        ).all();
        const kinds = this.db.prepare(
            'SELECT kind, COUNT(*) AS total FROM nodes GROUP BY kind ORDER BY total DESC'
        ).all();
        return {
            files: countOf(scalar('SELECT COUNT(*) AS v FROM file_states')),
            nodes: countOf(scalar('SELECT COUNT(*) AS v FROM nodes')),
            edges: countOf(scalar('SELECT COUNT(*) AS v FROM edges')),
            chunks: countOf(scalar('SELECT COUNT(*) AS v FROM chunks_fts')),
            languages,
            kinds
        };
    }
}

module.exports = {
    SCHEMA_VERSION,
    CoderIndexStore,
    resolveIndexPath,
    tokenize,
    cjkBigramTerms
};
