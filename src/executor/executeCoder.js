const fs = require('fs');
const path = require('path');
const Ec = require('../epic');
const Args = require('../utils/mxt-args');
const Core = require('../utils/mxt-coder-core');
const { resolveIndexPath, CoderIndexStore, tokenize, cjkBigramTerms } = require('../utils/mxt-coder-index');

const HELP_HINT = [
    '',
    'Usage: mxt coder [action]',
    '',
    'Actions:',
    '  mxt coder                    # full index build (bare call defaults to scan)',
    '  mxt coder scan               # explicit full rebuild',
    '  mxt coder status             # index statistics + drift',
    '  mxt coder update             # incremental refresh',
    '  mxt coder locate "<query>"   # hybrid retrieval (parent+submodule aware)',
    '  mxt coder expand <node-id>   # graph neighbourhood closure',
    '',
    'Parent repositories scan their own code and register checked-out',
    'submodules as MODULEREF anchors; submodule coders run autonomously.',
    ''
].join('\n');

const _stashLog = () => {
    const logs = [];
    return {
        logs,
        log: {
            waiting(msg) { logs.push({ lvl: 'waiting', msg }); },
            info(msg)    { logs.push({ lvl: 'info', msg }); },
            warn(msg)    { logs.push({ lvl: 'warn', msg }); },
            error(msg)   { logs.push({ lvl: 'error', msg }); }
        },
        drain(level = 'info') {
            const hit = logs.find(l => l.lvl === level);
            if (hit) Ec[level](hit.msg);
            return hit ? hit.msg : null;
        },
        drainAll() {
            for (const item of logs) Ec[item.lvl](item.msg);
        }
    };
};

const _formatSubResult = (alias, result) => {
    if (result.skipped) {
        return `  ${alias.padEnd(20)} (unchanged)`;
    }
    const t = ((result.tookMs || 0) / 1000).toFixed(2);
    const parts = [`files=${result.stats.files}`, `nodes=${result.stats.nodes}`];
    if (result.stats.submodules) parts.push(`sub=${result.stats.submodules}`);
    return `  ${alias.padEnd(20)} ${parts.join(' ')} [${t}s]`;
};

/* Locate: query ALL accessible stores from the current viewpoint and merge by rank. */
const _locateAcrossStores = async (query, stores) => {
    const qTokens = tokenize(query);
    if (!qTokens.length) throw new Error('unable to tokenize query');
    const ftsExpr = qTokens.map(t => "" + t + "").join(' OR ');
    const cngExpr = cjkBigramTerms(qTokens).join(' OR ') || null;
    const vec = CoderIndexStore.embedText(query);
    const matches = [];
    const related = [];
    const relatedSeen = new Set();
    for (const st of stores) {
        const store = new CoderIndexStore(st.root_path);
        try {
            const lex = store.lexicalSearch(ftsExpr, 30);
            const cjk = cngExpr ? store.lexicalCjkSearch(cngExpr, 30) : [];
            const vrc = store.searchVectors(vec, 30);
            const chunkScore = new Map();
            for (const [chan, arr] of [['lex', lex], ['cjk', cjk]]) {
                arr.forEach((row, i) => {
                    const c = 1 / (60 + i);
                    const x = chunkScore.get(row.chunk_id);
                    if (x) { x.score += c; x.src += '+' + chan; }
                    else chunkScore.set(row.chunk_id, { node: row.node_id, score: c, src: chan });
                });
            }
            const ranked = [...chunkScore.values()].sort((a, b) => b.score - a.score).slice(0, 16);
            const nid = [...new Set(ranked.filter(r => r.node).map(r => r.node))];
            const rows = store.getNodesByIds(nid);
            const scoreByNode = new Map();
            for (const e of ranked) {
                if (!e.node) continue;
                scoreByNode.set(e.node, (scoreByNode.get(e.node) || 0) + e.score);
            }
            for (const r of rows) {
                const sc = scoreByNode.get(r.id) || 0;
                if (sc > 0) matches.push({ ...r, _score: sc, __store: st.alias });
            }
            const seedIds = rows.slice(0, 4).map(r => r.id);
            for (const nb of store.expandClosure(seedIds, 2, 30)) {
                if (relatedSeen.has(nb.id) || seedIds.includes(nb.id)) continue;
                relatedSeen.add(nb.id);
                related.push({ ...nb, __store: st.alias });
            }
            for (const v of vrc.slice(0, 12)) {
                if (v.node_id && !nid.includes(v.node_id)) {
                    const n = store.getNode(v.node_id);
                    if (n) matches.push({ ...n, _score: 0.001, __store: st.alias, __vec: true });
                }
            }
        } finally {
            store.close();
        }
    }
    matches.sort((a, b) => (b._score - a._score) || a.__store.localeCompare(b.__store));
    return { rows: matches.slice(0, 12), related: related.slice(0, 20) };
};

const _renderLocate = (rows, query, related = [], branchTag = '') => {
    const branchSuffix = branchTag ? ` [${branchTag}]` : '';
    const lines = ['', '# /mcode Result — ' + query + branchSuffix, ''];
    lines.push('## Entry Points');
    if (!rows.length) lines.push('(no confident match — try broader keywords or `mxt coder scan`)');
    for (const r of rows) {
        const tag = r.__store && r.__store !== 'self' ? '[' + r.__store + '] ' : '';
        lines.push('- ' + tag + '`' + (r.uri || r.id) + '`  (' + r.kind + ')  ' + r.name);
    }
    if (related.length) {
        lines.push('', '## Related Graph Neighbourhood');
        for (const nb of related.slice(0, 20)) {
            const tag = nb.__store && nb.__store !== 'self' ? '[' + nb.__store + '] ' : '';
            lines.push('- ' + tag + nb.kind + ': ' + nb.name + '  `' + nb.id + '`  → ' + (nb.uri || '-'));
        }
    }
    lines.push('', '## Suggested Reading Order');
    rows.slice(0, 5).forEach((r, i) => {
        const tag = r.__store && r.__store !== 'self' ? '[' + r.__store + '] ' : '';
        lines.push((i + 1) + '. ' + tag + '`' + (r.uri || r.id) + '`');
    });
    lines.push('');
    return lines.join('\n');
};

/* Expand: same node could exist in multiple stores; find whichever holds it. */
const _expandAcrossStores = (nodeId, stores) => {
    for (const st of stores) {
        const store = new CoderIndexStore(st.root_path);
        try {
            const seed = store.getNode(nodeId);
            if (!seed) continue;
            const nb = store.getNeighbours(nodeId, null, 30);
            const cl = store.expandClosure([nodeId], 2, 60).filter(n => n.id !== nodeId);
            return {
                storeAlias: st.alias,
                seed,
                outgoing: nb.outgoing,
                incoming: nb.incoming,
                closure: cl
            };
        } finally {
            store.close();
        }
    }
    return null;
};

module.exports = async () => {
    const positional = Args.parsePositional();
    const action = positional[0] || '';         // empty means bare → full scan
    const projectDir = process.cwd();

    try {
        const topology = Core.resolveTopology(projectDir);

        /* ── FULL SCAN (also triggered by bare `mxt coder`) ──────────── */
        if (!action || action === 'scan') {
            const stash = _stashLog();
            const selfRes = await Core.runFullScan(topology.topBoundary, { logger: stash.log });
            stash.drainAll();

            if (!topology.stores.length && !selfRes) throw new Error('nothing scanned');
            // Aggregate sub-stores: each gets its own full scan.
            const subResults = [];
            for (const st of topology.stores) {
                if (st.primary) continue;
                const subStash = _stashLog();
                const r = await Core.runFullScan(st.root, { logger: subStash.log, ensureIgnore: false });
                if (r && !r.skipped) subResults.push({ alias: st.alias, ...r });
            }

            if (selfRes.skipped && !subResults.length) {
                Ec.info('Scan skipped: index already exists with matching schema.');
                Ec.info(`Root: ${topology.topBoundary}`);
            } else if (!selfRes.skipped) {
                Ec.info(`Scan complete in ${(selfRes.tookMs / 1000).toFixed(2)}s.`);
                const s = selfRes.stats;
                Ec.info(`Files: ${s.files}  Nodes: ${s.nodes}  Edges: ${s.edges}  Chunks: ${s.chunks}` +
                    (s.submodules ? `  Submodules: ${s.submodules}` : ''));
                Ec.info('Repo namespace ignored: .r2mo/repo/');
            } else if (subResults.length) {
                Ec.info('Parent unchanged, refreshed submodule indexes:');
                for (const sr of subResults) {
                    Ec.info(_formatSubResult(sr.alias, sr));
                }
            }
            process.exit(0);
        }

        /* ── STATUS ─────────────────────────────────────────────────── */
        if (action === 'status') {
            for (const st of topology.stores) {
                if (!fs.existsSync(resolveIndexPath(st.root).graphPath)) {
                    if (st.primary) {
                        Ec.warn('No coder index found. Run `mxt coder scan` first.');
                        process.exit(1);
                    }
                    continue;
                }
                const store = new CoderIndexStore(resolveIndexPath(st.root).graphPath);
                const drift = await Core.computeDrift(store, st.root, []);
                const stats = store.getStats();
                const label = topology.stores.length > 1 ? `[${st.alias}]` : '';
                Ec.info(`${label} Indexed at: ${(() => {
                    try { return JSON.parse(fs.readFileSync(resolveIndexPath(st.root).metaPath, 'utf8')).indexedAt; } catch (_) { return '(?)'; }
                })()}`);
                Ec.info(`${label} Files: ${stats.files}  Nodes: ${stats.nodes}  Edges: ${stats.edges}  Chunks: ${stats.chunks}`);
                const idxBranch = (() => {
                    try { return JSON.parse(fs.readFileSync(resolveIndexPath(st.root).metaPath, 'utf8')).gitBranch; } catch (_) { return null; }
                })();
                const curBranch = Core.getGitBranch(st.root);
                if (idxBranch || curBranch) {
                    const warn = curBranch && idxBranch && curBranch !== idxBranch;
                    const tag = warn ? '  ⚠ BRANCH CHANGED — run mxt coder update' : '';
                    Ec.info(`${label} Branch: ${curBranch || '(unknown)'}${warn ? ` (was: ${idxBranch})${tag}` : tag}`);
                }
                if (st.primary && topology.stores.length > 1) {
                    const mods = topology.stores.filter(x => !x.primary).length;
                    Ec.info(`Submodule stores tracked: ${mods}`);
                }
                if (stats.languages.length) {
                    Ec.info('Languages:');
                    for (const lang of stats.languages.slice(0, 8)) console.log(`  ${lang.language.padEnd(14)} ${lang.total}`);
                }
                const fw = store.getFrameworks();
                if (fw.length) {
                    Ec.info('Frameworks:');
                    for (const it of fw.slice(0, 10)) console.log(`  ${String(typeof it === 'object' ? it.name : it).padEnd(18)} ${typeof it === 'object' ? it.total : ''}`);
                }
                Ec.info(`${label} Drift: ${drift.drifted} files (${drift.driftLevel})`);
                store.close();
            }
            process.exit(0);
        }

        /* ── INCREMENTAL UPDATE ─────────────────────────────────────── */
        if (action === 'update') {
            const aggregate = [];
            const rebuilt = [];
            for (const st of topology.stores) {
                const r = await Core.runIncrementalUpdate(st.root, {});
                if (r.fallbackToFull && r.stats) {
                    rebuilt.push({ alias: st.alias, stats: r.stats, tookMs: r.tookMs });
                } else if (!r.fallbackToFull && r.updated !== undefined) {
                    aggregate.push({ alias: st.alias, ...r });
                }
            }
            for (const rb of rebuilt) {
                const br = Core.getGitBranch(rb.alias ? topology.stores.find(x=>x.alias===rb.alias)?.root || process.cwd() : process.cwd());
                Ec.info(`Branch changed → rebuilt [${rb.alias}] in ${((rb.tookMs||0)/1000).toFixed(2)}s (${rb.stats.files} files)`);
            }
            const totAdd = aggregate.reduce((a, b) => a + b.added, 0);
            const totChg = aggregate.reduce((a, b) => a + b.changed, 0);
            const totDel = aggregate.reduce((a, b) => a + b.deleted, 0);
            if (!totAdd && !totChg && !totDel && !rebuilt.length) {
                Ec.info('Up to date. Nothing to incrementally update.');
            } else if (totAdd || totChg || totDel) {
                Ec.info(`Update complete: added=${totAdd}, changed=${totChg}, deleted=${totDel}.`);
                for (const agg of aggregate) {
                    if (agg.updated) Ec.info(`  ${agg.alias}: updated=${agg.updated}`);
                }
            }
            process.exit(0);
        }

        /* ── LOCATE ─────────────────────────────────────────────────── */
        if (action === 'locate') {
            const q = positional.slice(1).join(' ').trim();
            if (!q) {
                Ec.error('Missing query. Usage: mxt coder locate "<requirement>"');
                process.exit(1);
            }
            const stores = topology.stores
                .map(st => ({ ...st, root_path: resolveIndexPath(st.root).graphPath }))
                .filter(st => fs.existsSync(st.root_path));
            if (!stores.length) {
                Ec.warn('No coder index found. Run `mxt coder scan` first.');
                process.exit(1);
            }
            const located = await _locateAcrossStores(q, stores);
            console.log(_renderLocate(located.rows, q, located.related, Core.getGitBranch(process.cwd()) || ''));
            process.exit(0);
        }

        /* ── EXPAND ─────────────────────────────────────────────────── */
        if (action === 'expand') {
            const nid = positional[1];
            if (!nid) {
                Ec.error('Missing node id. Usage: mxt coder expand <node-id>');
                process.exit(1);
            }
            const stores = topology.stores
                .map(st => ({ ...st, root_path: resolveIndexPath(st.root).graphPath }))
                .filter(st => fs.existsSync(st.root_path));
            const result = _expandAcrossStores(nid, stores);
            if (!result) {
                Ec.error(`Unknown node: ${nid}`);
                process.exit(1);
            }
            console.log(`Store: ${result.storeAlias}`);
            console.log(`Node:  ${result.seed.id}  (${result.seed.kind})  ${result.seed.name}`);
            if (result.seed.uri) console.log(`File:  ${result.seed.uri}${result.seed.line ? ':' + result.seed.line : ''}`);
            console.log('\nDirect Relations:');
            for (const r of result.outgoing.slice(0, 12)) console.log(`  → ${r.kind}  ${r.name}  \`${r.id}\``);
            for (const r of result.incoming.slice(0, 12)) console.log(`  ← ${r.kind}  ${r.name}  \`${r.id}\``);
            console.log('\nRecommended Closure:');
            for (const n of result.closure.slice(0, 15)) console.log(`  ${n.kind}: ${n.name}  \`${n.id}\`  → ${n.uri || '-'}`);
            process.exit(0);
        }

        /* ── Unknown / help ─────────────────────────────────────────── */
        console.log(HELP_HINT);
        process.exit(action ? 1 : 0);
    } catch (e) {
        Ec.error(e.message || String(e));
        process.exit(1);
    }
};
