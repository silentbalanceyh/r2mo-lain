---
description: "Intelligently verify and remediate anti-drift baseline metadata in .r2mo/doctor/<profile>/; analyzes project characteristics, runs mxt doctor --gen??? for comparison, then directly fixes .conf files to align with project structure."
argument-hint: "[profile] [Deep] [Dry]"
---

# /mxt:doctor

## Harness

Binding execution contract for all MXT commands across Claude Code, Codex, and OpenCode.

- **English-first.** Write all output in English. Use Chinese only when quoting existing repo content.
- **Rule loading.** Load `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `.claude/rules/*.mdc`, `.codex/rules/*.mdc`, `.cursor/rules/*.mdc`, `.opencode/*.mdc`, and `~/.codex/rules/r2mo-task-workflow.md` before task action. Missing files do not block.
- **Disk source of truth.** Re-read files from disk before decisions.
- **No side effects on source.** This skill only modifies `.r2mo/doctor/` metadata. It never touches source code, deploy scripts, env files, or git state.

Intelligently verify and remediate `.r2mo/doctor/<profile>/` metadata to align with the project's actual characteristics. Runs `mxt doctor --gen???` for fresh comparison, analyzes project structure, then **directly edits `.conf` files** to fix misclassifications, remove redundancies, add missing signals, and align profile scope.

The user invoked this command with: $ARGUMENTS

## Arguments

1. `$ARGUMENTS` is optional:
   - A profile name: `k8s`, `loc`, `mob`, `win` — if omitted, process all profiles
   - `Deep` — thorough cross-verification (slower)
   - `Dry` — read-only mode, report issues but do NOT modify `.conf` files

## Pre-conditions

If `.r2mo/doctor/` does not exist or has no profile subdirectories:

```
ERROR: No .r2mo/doctor/ directory found.
Run "mxt doctor --genk8s" or "mxt doctor --genloc" first.
```

## Configuration file formats

Each `.conf` file in `.r2mo/doctor/<profile>/` uses tab-separated values (TSV).

### config.json

```json
{
  "default_profile": "loc",
  "env_sources": [],
  "expected_branch": "master",
  "language": "go",
  "project_type": "go"
}
```

### file-list.conf

One path per line. Prefixes: (none)=required, `@`=optional, `!`=forbidden.

### file-hash.conf / file-oob.conf

TSV: `<relative_path>\t<sha256_hash>`

### meta-env.conf

File path as comment header (`# .env`), then KEY=VALUE lines. Inline markers: `# template` (name-only), `# injected` (runtime), `# secrets` (real secret), (none)=real fixed.

File classification: `.env.example`→template, `.env`/`.secrets.env`→real, `.env.production`/`.env.development`→per-environment real.

### meta-deps.conf

TSV: `<manifest_path>\t<dep_name>\t<version>`

### meta-tokens.conf

TSV: `<key>\t<mode>\t<prefix>\t<min_len>\t<max_len>\t<charset>`

Modes: `fixed`(highest) > `prefix_hex` > `hex` > `prefix_alnum` > `allow_empty` > `placeholder` > `env_ref`(lowest). Most strict wins across files.

### meta-ports.conf

TSV: `<file_path>\t<port_number>\t<source_type>`

### code-interfaces.conf

TSV: `<interface_name>\t<file_path>\t<language>\t<sha256_hash>`

### code-idempotency.conf (k8s only)

TSV: `<rule_name>\t<pattern>\t<requirement>`

Rules: `deploy_cross_verify`, `deploy_order`, `secret_upsert`, `sql_data`, `sql_ddl`, `sts_pvc`, `tf_adopt`, `tf_apply_plan`, `tf_lifecycle`, `verify_count`.

## Workflow

### Step 1 — Profile discovery and project analysis

1. Read `.r2mo/doctor/config.json` for `default_profile`, `project_type`, `language`, `expected_branch`.
2. List profile subdirectories. Determine which to process (from `$ARGUMENTS` or all).
3. **Analyze project characteristics**:
   - Run `git ls-files` to get all tracked files
   - Identify project type: Go / Java(Maven) / Java(Gradle) / Rust(Tauri) / UniApp(Mobile) / HarmonyOS / Node/TS / Python / mixed
   - Identify env file conventions: templates (`.env.example`, `*.tpl`), real (`.env`, `.secrets.env`), per-environment (`.env.production`, `.env.development`)
   - Identify deploy chain: `deploy-k8s.sh`? `*.tf`? `*.sql` with INSERT?
   - Identify special files: `manifest.json` (mobile), `tauri.conf.json` (desktop), `oh-package.json5` (HarmonyOS)

### Step 2 — Fresh generate and scan

Before running `--gen`, save the committed baseline:

```bash
mkdir -p /tmp/mxt-doctor-saved
cp -r .r2mo/doctor/<profile>/ /tmp/mxt-doctor-saved/<profile>/
```

Then for each profile:

```bash
mxt doctor --gen<profile>     # generate fresh baseline
mxt doctor --profile <profile> # scan to get PASS/FAIL/SKIP
```

Record the scan summary (PASS/FAIL/WARN/SKIP counts) and which dimensions are SKIP.

### Step 3 — Diff and identify discrepancies

Compare saved committed baseline with fresh generate:

```bash
diff -r /tmp/mxt-doctor-saved/<profile>/ .r2mo/doctor/<profile>/
```

Categorize: expected drift, script gap, classification error, missing signal, stale entry.

### Step 4 — Intelligent remediation of .conf files

Directly edit `.r2mo/doctor/<profile>/*.conf` files. If `Dry` argument, skip edits and only report.

#### 4a. file-list.conf — scope alignment
- k8s: remove dev files (`dev-*.sh`, `loc-*.sh`, `run-*.sh`)
- loc: remove deploy files (`deploy-k8s.sh`, `deploy/release/*`)
- mob: ensure `manifest.json`, `pages.json`, `App.vue` if present
- win: ensure `tauri.conf.json` or `Trunk.toml` if present
- Add `@optional` for legitimately absent files
- Verify `!forbidden` patterns match project structure

#### 4b. meta-env.conf — classification correction
- `.env.example`→template, `.env`/`.secrets.env`→real, `.env.production`/`.env.development`→per-environment real
- Empty value in one file + real value in another → `# injected`
- Mixed placeholder+real → real with `# template` on placeholder lines

#### 4c. meta-deps.conf — deduplication and completeness
- Remove duplicate `(manifest_path, dep_name)` entries
- Verify all manifests: go.mod, package.json, Cargo.toml, pom.xml, build.gradle, pyproject.toml

#### 4d. meta-tokens.conf — stale entry removal and strictness
- Remove keys not in any env file
- Most strict mode wins across files
- Add missing TOKEN_KEYWORD keys (SECRET/TOKEN/KEY/PASSWORD/PASS/AUTHTOKEN)

#### 4e. file-hash.conf — redundancy elimination
- Remove lock files, generated artifacts, cache files
- Redundancy with file-list is WARN, not ERROR

#### 4f. file-oob.conf — out-of-band file verification
- Remove entries for deleted files
- Update paths for moved files

#### 4g. code-interfaces.conf — interface contract verification
- Remove entries for deleted files
- Investigate SKIP if project has source files with type declarations

#### 4h. meta-ports.conf — port declaration verification
- Remove entries for deleted files
- Port changes are real drifts — report to user

#### 4i. code-idempotency.conf (k8s only) — rule alignment
- Remove rules for absent file types
- Verify `verify_count` uses `require_no_less_than` (= and >= valid; only < is FAIL)

#### 4j. config.json — metadata correction
- Verify `project_type` matches actual language
- Verify `expected_branch` matches `git branch --show-current`
- Add undiscoverable env files to `env_sources`

### Step 5 — Re-scan and verify convergence

```bash
mxt doctor --profile <profile>
```

- 0 FAIL: convergence achieved
- FAILs remain: classify as real drift vs metadata issue. If metadata, iterate Step 4.
- Iterate up to 3 rounds. After 3, report as "needs manual review".

### Step 6 — Output report

```
── mxt-doctor remediation: <project> / <profile> ──

Project type: <go/java/rust/node/mixed>
Env files: <count> (template: X, real: Y, injected: Z, secrets: W)
Deploy chain: <yes/no>

Scan before: PASS=A  FAIL=B  WARN=C  SKIP=D
Scan after:  PASS=A'  FAIL=B'  WARN=C'  SKIP=D'

Remediation applied:
  file-list.conf: <changes>
  meta-env.conf: <changes>
  meta-deps.conf: <changes>
  meta-tokens.conf: <changes>
  file-hash.conf: <changes>
  file-oob.conf: <changes>
  code-interfaces.conf: <changes>
  meta-ports.conf: <changes>
  code-idempotency.conf: <changes>
  config.json: <changes>

Converged: 0 FAIL after remediation
  Remaining FAILs: 0

OR

Partial convergence: N FAIL remain (real drifts)
  1. <file> (<reason>)
```

## Intelligence rules

1. **Project-type awareness**: Go→go.mod in deps; UniApp→manifest.json in mob file-list; Gradle→build.gradle in deps
2. **Env file naming convention**: `.env.example`→template; `.env`→real; `.secrets.env`→real+secrets; `.env.production`/`.env.development`→per-environment real
3. **Profile scope strictness**: k8s excludes dev files; loc excludes deploy files; mob/win extend loc
4. **Token strictness**: most strict mode wins (fixed > prefix_hex > hex > prefix_alnum > allow_empty > placeholder > env_ref)
5. **Redundancy heuristic**: file in both file-list and file-hash = WARN, not ERROR; only remove from file-hash if lock/cache/generated
6. **SKIP diagnosis**: investigate WHY; check if files exist but glob didn't match → script gap; if files genuinely absent → SKIP is correct
7. **Drift vs metadata**: real drift = user action; metadata issue = skill fixes .conf
8. **Idempotency semantics**: `verify_count` = `require_no_less_than`; both `=` and `>=` valid; only `<` is FAIL
9. **Noise directory exclusion**: `.omc/`, `.r2mo/.obsidian/`, `.r2mo/task/`, `.r2mo/bugs/`, `.r2mo/worktrees/`, `.r2mo/verify/`, `.r2mo/doctor/`, `.vscode/`, `.idea/`, `.cursor/`, `.claude/`, `.codex/` are auto-excluded — never in baseline
10. **Lock file exclusion at any depth**: `package-lock.json`, `go.sum`, `yarn.lock`, `pnpm-lock.yaml` excluded at any nesting level

## What this skill CAN do

- Run `mxt doctor --gen<profile>` and `mxt doctor --profile <profile>`
- Run `git ls-files`, `git branch --show-current`, `diff`
- Read all files in `.r2mo/doctor/` and project source files
- **Modify `.r2mo/doctor/<profile>/*.conf` files** (baseline configs)
- **Modify `.r2mo/doctor/config.json`** (metadata)

## What this skill MUST NOT do

- Modify project source code, deploy scripts, env files, or deployment infrastructure
- Commit or push to git
- Delete `.r2mo/doctor/` directories or `.conf` files
- Reorder `.conf` files unnecessarily — only change lines that are wrong
