---
runAt: 2026-06-04.15-57-44
title: mxt coder local project cognition subsystem
status: Done
author:
---

## Plan

# `mxt coder` Proposal: Local Project Cognition Subsystem

## 1. Conclusion

Developing `mxt coder` directly is feasible. It fits the current system better than introducing a new standalone Codex command at this stage.

- It runs in the terminal. Full scan and incremental analysis do not require an LLM loop.
- Its derived index can live under `.r2mo/repo/self/`. Since `.r2mo/repo/` is ignored by the workspace contract, the generated repository remains local.
- Existing `mxt-*` skills do not gain extra skill-count surface. They only need one consistent routing sentence telling the agent to consult `mxt coder` before broad repository reading.
- Runtime consumption stays inside the existing `$mxt` batch workflow and platform-neutral skills.

The first version should implement a narrow, dependable loop:

```bash
mxt coder scan
mxt coder status
mxt coder update
mxt coder locate "<natural language>"
mxt coder expand <node-id>
```

Its result is a compact projection for agent consumption, not a request for the agent to browse the whole database.

## 2. Goals

| Goal | Mechanism |
|---|---|
| Save tokens | Query the index first; read only selected files afterward |
| Improve precision | Combine natural-language recall, lexical recall, graph expansion, and framework-aware scoring |
| Keep control plane simple | Separate scan, update, status, locate, and expand responsibilities |
| Avoid extra installation | Reuse `mxt`; no mandatory external CLI/package installation |
| Keep platforms consistent | No special command for Codex, Claude, OpenCode, or Pi |
| Make artifacts manageable | Store derived indexes in `.r2mo/repo/self/` and keep them ignored |

## 3. Integration With The Current System

### 3.1 CLI

Add a new `mxt` subcommand:

```bash
mxt coder
```

Expected files in this repository:

```text
src/commander/coder.json
src/executor/executeCoder.js
src/utils/mxt-coder-*
```

Implementation must remain CommonJS, use `../epic` logging helpers, and follow existing argument/menu/filesystem utility contracts.

### 3.2 Skills

Do not add a new skill and do not create a hard execution dependency.

Existing implementation-facing `mxt-*` skills should gain one shared, advisory hint:

```text
If `.r2mo/repo/self/` already contains an `mxt coder` index, consult its `locate`, `expand`, or `status` projections when they help explain repository structure. If the index is absent, continue normally and skip the hint. Never implicitly run `scan` or `update` from a skill; updating remains user-initiated.
```

Semantics:

1. Presence check is cheap: a skill checks whether the index directory exists, then decides whether to mention it.
2. Absence is a normal state, not an error. Skills proceed without coder output.
3. Skills do not auto-scan or auto-update the index. Those actions stay user-initiated.
4. This hint belongs only to skills whose workflow reads or reasons about the current repository broadly. Installation, template-generation, doctor-only, and help skills should omit it.

Separation of concerns:

```text
mxt coder = establish / maintain / query project cognition when an index exists
$mxt batch skills = perform task workflow, consulting the projection opportunistically
```

## 4. Storage

### 4.1 Directory Layout

```text
.r2mo/
  repo/
    self/
      meta.json
      graph.db
      vectors.db
      cache/
      journals/
```

Rules:

1. `self/` means the current repository's long-lived local knowledge index.
2. The directory is derived data and must not be committed.
3. After first scan, ensure current repository `.gitignore` contains `.r2mo/repo/self/`.
4. The ignore-file update must be backed up first and must remain idempotent.

### 4.2 Multi-Store Contract

A single scan fans out into multiple specialized stores. The physical file count depends on the chosen profile, but the conceptual stores are fixed:

```text
meta store    = scan state, schema version, file hashes, drift metadata
graph store   = nodes, edges, traversal closure
lexical store = FTS5/BM25-style inverted index for exact-term recall
vector store  = embeddings for semantic recall
snippet cache = optional raw-chunk cache for projection and debugging
```

Each store serves a different recall signal; no single database covers all of them well.

MVP physical mapping keeps deployment light while honoring the contract:

```text
graph.db   = SQLite hosting meta, graph, and lexical stores together
vectors.db = embedded vector store for embeddings plus filtered retrieval
```

If a lightweight local vector store is unavailable initially, a degradation mode is acceptable:

```text
SQLite + FTS5 + BM25-like ranking + bounded brute-force cosine similarity
```

That is sufficient for a medium-size repository and should not block the first usable loop.

Later high-performance mode evolves the same conceptual stores onto dedicated engines:

```text
Kuzu       # graph traversal
LanceDB    # vectors and lexical retrieval
SQLite     # metadata and drift state
```

The query layer must depend on abstractions, not direct database details:

```text
CoderMetaStore
CoderGraphStore
CoderLexicalStore
CoderVectorStore
```

## 5. Scanning

### 5.1 Scan

Behavior:

1. If `.r2mo/repo/self/meta.json` and its databases exist and `schemaVersion` matches, do nothing except print indexed status.
2. If absent or incomplete, perform a full scan.
3. Detect project type, languages, frameworks, scripts, build tooling, and important directory groups.
4. Fan out persistence across meta, graph, lexical, and vector stores.
5. Ensure `.r2mo/repo/self/` appears in `.gitignore`.
6. Print statistics: files, nodes, edges, chunks, languages, frameworks.

Initial supported shapes may stay narrow:

```text
Node.js / JavaScript / TypeScript
CJS / ESM
basic Vue / React
package scripts
Maven recognition as a shallow placeholder for a later phase
```

Deep Java/Maven semantic support belongs to a later phase.

### 5.2 Update

`mxt coder update` is explicit only.

It should:

1. Walk source files.
2. Compute content hashes.
3. Compare hashes with stored file states.
4. Classify additions, modifications, deletions, and moves.
5. Rebuild only changed files' nodes, edges, chunks, and embeddings.
6. Remove orphan nodes, dangling edges, and obsolete vectors.

Readonly operations such as `locate` and `expand` must never implicitly trigger `scan` or `update`.

### 5.3 Drift Reporting

Query responses carry freshness metadata:

```json
{
  "indexedAt": "2026-01-01T00:00:00Z",
  "changedFiles": 3,
  "deletedFiles": 0,
  "driftLevel": "low",
  "recommendation": null
}
```

If drift is material, recommendation should say:

```text
Run 'mxt coder update' to refresh analysis.
```

Stale results may still be returned, but must expose drift warnings.

## 6. Languages And LSP

The first version should not implement language servers itself.

It should adapt according to project evidence:

| Type | Detection Signals | Initial Strategy |
|---|---|---|
| JavaScript / TypeScript | `package.json`, `tsconfig` | AST/rules first; optional TS-family LSP verification |
| Vue | Vue files plus dependencies | Vue-aware heuristics; later Vue language server |
| Java / Maven | `pom.xml` | Shallow structure first; deep LSP later |
| Go | `go.mod` | Later adapter |
| Python | Python project files | Later adapter |
| Unknown | fallback | Text/file heuristics only |

During early phases, avoid resident LSP during scan. Build the coarse graph first. At query time, selectively verify high-ranking candidates with LSP-backed definition/reference checks when available.

This keeps indexing inexpensive while improving precision at the critical tail of retrieval.

## 7. Initial Graph Model

Initial node kinds should be intentionally restrained:

```text
PROJECT
MODULE
DIRECTORY_GROUP
FILE
CLASS
FUNCTION
METHOD
INTERFACE
TYPE
CONSTANT
CONFIG_KEY
ROUTE
COMPONENT
STORE
SERVICE
DATA_MODEL
TABLE_OR_SCHEMA_HINT
EVENT
TEST
DOC_ANCHOR
SCRIPT
ENTRYPOINT
ERROR_OR_LOG_ANCHOR
```

Initial edge kinds:

```text
CONTAINS
DEFINES
IMPORTS
EXTENDS
IMPLEMENTS
CALLS
READS
WRITES
ROUTES_TO
BINDS_CONFIG
EMITS_EVENT
HANDLES_EVENT
USES_COMPONENT
DEPENDS_ON_MODULE
DOCUMENTS
VALIDATES
THROWS
TESTS
DERIVES_FROM_TEMPLATE
SAME_DOMAIN_AS
```

The model serves requirement location, reading-order suggestion, and bounded impact discovery—not exhaustive compiler semantics.

## 8. Retrieval Outputs

### 8.1 `locate`

Input:

```bash
mxt coder locate "<requirement or concept>"
```

Output sections:

```text
Entry Points
Related Symbols
Routes / Services / Models / Config
Suggested Reading Order
Impact Candidates
Confidence
Drift Warning
```

Pipeline:

1. Normalize user intent.
2. Recall by lexical and/or vector indices.
3. Expand candidates through graph edges.
4. Re-score with framework-aware weights.
5. Downrank overly generic utility/base-class noise.
6. Package a bounded projection.

### 8.2 `expand`

Input:

```bash
mxt coder expand <node-id>
```

Output sections:

```text
Direct Relations
Caller / Callee View
Configuration View
Data View
Recommended Closure
Token Estimate
Confidence
```

### 8.3 Packaging Levels

```text
Level 1: short answer plus top anchors
Level 2: bounded graph neighborhood plus reading order
Level 3: deeper curated context for explicit deep-dive requests
```

Default to Level 2.

## 9. Relationship To `$mxt` Batch Skills

`mxt coder` should act as an optional shared aid for workflow skills.

| Workflow | Useful Coder Capability |
|---|---|
| plan | Locate likely requirement anchors before writing the plan |
| run | Expand only the context needed by implementation |
| end | Verify real locus of changes and associated neighborhood |
| goon | Restore semantic context quickly |
| debug | Locate symptoms, exceptions, configs, and log anchors |
| sync | Inspect structural drift around merge boundaries |

A consistent skill instruction should say:

```text
For repository-wide understanding, use `mxt coder` instead of ad hoc glob/read exploration.
For large refactors, require `mxt coder status` and consider `mxt coder update`.
```

`mxt coder` does not replace MXT task closure. It improves the underlying project awareness of those flows.

## 10. Phases

### Phase 0

Deliver:

1. `mxt coder` command skeleton.
2. Idempotent scan.
3. `.r2mo/repo/self/` initialization.
4. Idempotent `.gitignore` correction.
5. Multi-store bootstrap: meta, graph, and lexical stores inside SQLite plus a bounded vector fallback.
6. Status and basic drift reporting.
7. Basic locate.
8. One dogfood test against this repository.

### Phase 1

Deliver:

1. Expand command.
2. Hash-based incremental update.
3. Content-hash embedding reuse.
4. Stronger lexical weighting.
5. Framework-aware node weighting.
6. Deeper Node/TS/Vue adaptation.
7. Optional LSP verification.

### Phase 2

Deliver:

1. Switchable high-performance profile.
2. Kuzu graph store.
3. LanceDB vector store.
4. Generation snapshots.
5. Parallel scanner.
6. Large Java/Maven semantic adapters.
7. Impact command.

## 11. Acceptance Criteria

Minimum acceptance:

1. Running first `mxt coder scan` on this repository succeeds and writes `.r2mo/repo/self/`.
2. Running scan again does not rebuild.
3. After scan, `.gitignore` includes `.r2mo/repo/`.
4. `mxt coder locate` returns plausible top candidates for at least one clear feature query.
5. `mxt coder status` reports files, nodes, edges, chunks, languages, frameworks, and drift.
6. Explicit `update` handles a small file change without a full rebuild.
7. Relevant focused tests pass.
8. `mxt help -c coder` describes all first-version subcommands.

## Changes

- Added `mxt coder` Phase 0: `src/commander/coder.json`, `src/executor/executeCoder.js`, `src/utils/mxt-coder-index.js`, and `src/utils/mxt-coder-scanner.js`; registered the executor and added six focused regressions.
- Added secondary CJK-bigram FTS, public `cjkBigramTerms`, and hydration of vector-search candidates with their owning node IDs; fixed Chinese-partial recall and prevented anonymous vector winners.
- Converged historical stale assertions to shipped skill/command semantics and restored parser coherence.
- Added the task-approved advisory `## PROJECT INDEX HINT` to six broad repository workflows (`plan`, `run`, `end`, `goon`, `debug`, and `sync`) and mirrored all four platform packs consistently.
- Removed the Pi-specific dependency wording from loop: Pi now uses the same generic two-session disk-driven mechanism. Pi remains 10 skills + 10 `/mxt-*` prompts.
- Installed/refreshed ai-cmd artifacts: Claude 26 copied, Codex 73 copied, OpenCode 10 copied, Pi 10 copied; persistent Codex caches also resynced. Counts are 10 skills and 10 commands on every surface.
- Upgraded the scan pipeline to worker-thread parallelism (bounded pool sized to CPU cores, batched dispatch, graceful sequential fallback for tiny inputs), reducing the reference repository full scan from 9.19s to 3.89s.
- Completed Phase 2 storage upgrade in-place: SQLite WAL tuning, intra-SQLite vector persistence, deterministic IVF clustering (k = sqrt(N), 25% drift-triggered retrains), idempotent truncate coverage, and dedicated regression locking vectors/centroid/recall lifecycle.
- Added framework detection during indexing and rendered detected frameworks in `mxt coder status`; framework facts attach to the owning manifest files to preserve idempotent updates.
- Verification: `node src/index.test.js` green, `npm test` green, `node scripts/test-docs-vault.js` green, `npm run validate:commands` succeeds, and `mxt help -c coder` registers all five subcommands.
- Enhanced structural indexing: class methods, fields, inheritance/implementation links, and bounded CALLS edges are captured; symbol bodies become preferred retrieval chunks instead of raw file-window clones.
- Hardened full scans: hidden directories are excluded as non-source state, oversized/minified payloads are represented as bounded assets, document/config extraction is size-capped, and line lookup uses precomputed offsets. Full reference scan completed in 0.44s with no backup/checkpoint/WAL residue.
- Changed ignore policy to append the complete `.r2mo/repo/` namespace directly to `.gitignore`; explicitly no backup files or `.gitignore` copies are generated.
- Ran the final 31-repository app-zero rebuild against schema 2.2.2: 31/31 succeeded, all stores ended with only graph.db plus meta.json, and no WAL/SHM remained after close. Largest stores included app-aisz at 5.47GB/105,920 files, iia.ai.experiment at 2.67GB/54,610 files, and zero-ecotope at 1.86GB/8,100 files; sample locate/expand recall stayed subsecond on project-sized workloads.

## Acceptance Evidence

| Criterion | Evidence |
|---|---|
| 1. First scan succeeds and writes index | Scratch fixture scan produced `meta.json`, `graph.db`, vector sidecar; stats files=3 nodes=9 edges=6 chunks=3. |
| 2. Repeat scan does not rebuild | Second scan printed `Scan skipped: index already exists with matching schema.`; regression compares unchanged `graph.db` mtime. |
| 3. Ignore entry ensured | First scan prints `Repo namespace ignored: .r2mo/repo/`; regression asserts `.gitignore` contains the whole repo namespace and creates no backup. |
| 4. Feature locate finds clear anchor | `locate "登录验证码 长度校验"` returned `auth.ts`, `DOC_ANCHOR`, and graph neighbours; focused recall regression also validates vector hydration and CJK FTS. |
| 5. Status reports contract fields | Scratch `status` reported files/nodes/edges/chunks, languages, node kinds, and `Drift: 0 files (clean)`; the framework-reporting regression also verifies status emits a `Frameworks:` section. |
| 6. Explicit update increments | Regression modifies `auth.ts`, observes `Drift: 1 files (low)`, updates, then observes clean. |
| 7. Relevant tests pass | `node src/index.test.js` and `npm test` exit 0. |
| 8. Help covers subcommands | `mxt help -c coder` renders description and the scan/status/update/locate/expand usage block; top-level help lists `coder`. |
