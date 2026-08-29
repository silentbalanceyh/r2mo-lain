---
name: mxt-doctor
description: Use when the user asks Codex to run the doctor MXT workflow; enforces scoped inputs, evidence-backed execution, and closed-loop handoff.
---

# /mxt:doctor

## Harness

Binding execution contract for all MXT commands across Claude Code, Codex, and OpenCode.

- **English-first.** Write all output in English. Use Chinese only when quoting existing repo content.
- **Rule loading.** Load `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `.claude/rules/*.mdc`, `.codex/rules/*.mdc`, `.cursor/rules/*.mdc`, `.opencode/*.mdc`, and `~/.codex/rules/r2mo-task-workflow.md` before task action. Missing files do not block.
- **Disk source of truth.** Re-read files from disk before decisions.
- **Fresh evidence.** Read `.r2mo/doctor/<profile>/` from disk at each step. Do not assume content.
- **No side effects on source.** This skill only modifies `.r2mo/doctor/` metadata. It never touches source code, deploy scripts, env files, or git state.

## Closed-Loop Contract

`mxt-doctor` closes baseline generation → intelligent remediation → verification convergence.

- **Before/after evidence.** Save or record the committed baseline before running generation; compare it before editing.
- **Every edit must have a reason.** For each `.r2mo/doctor/<profile>/` change, record the profile, file, entry, mismatch evidence, and correction.
- **No unexplained deletions.** Never remove an entry merely because a generator omits it; distinguish legitimate structural drift from generator misclassification.
- **Verification is mandatory.** After remediation, rerun `mxt doctor --profile <profile>` and record the final PASS/FAIL/WARN/SKIP counts. `Dry` mode must clearly report that verification was not applied.
- **Convergence rule.** Stop after a maximum of three remediation rounds. If FAIL/WARN counts do not decrease for two consecutive rounds, stop and report `Doctor baseline did not converge`.
- **Boundary.** Only `.r2mo/doctor/` metadata may be edited. Source code, deploy scripts, environment files, and Git state remain untouched.

## Purpose

This skill **intelligently remediates** `.r2mo/doctor/` metadata to align with the project's actual characteristics and current state. It is not a passive reviewer — it actively fixes configs based on project analysis.

### The core problem

`mxt doctor --gen???` uses fixed glob patterns and regex. Different projects have different structures, env file conventions, and config layouts. The script cannot know that:

- A `.env.production` in project X has fixed values that must be value-checked, but in project Y the same filename has placeholders
- A `config.yaml` is the primary config in project X (should be in file-hash) but a generated artifact in project Y (should be excluded)
- A `*.json5` file is a HarmonyOS build config in project X (should be checked) but a VS Code settings file in project Y (should be excluded)
- An env file with `Z_DB_PASSWORD=""` in one file and `Z_DB_PASSWORD="realpass"` in another means the empty one is intentionally deferred to runtime injection

An LLM can read the project, understand intent, and **directly edit `.r2mo/doctor/<profile>/*.conf` files** to correct these issues.

### Core anti-drift principle

The fundamental goal of `mxt doctor` is to **confine AI development to source code and resources, preventing configuration drift**. Specifically:

- **What IS locked (config-level, pre-compile)**: environment variable names and values, dependency versions, port assignments, token/secret patterns, config file content hashes, file structure (existence + git-tracked), interface contract hashes, deploy script idempotency rules, SQL seed file existence.
- **What is NOT locked (source-level, freely evolvable)**: API route definitions, SQL schema columns/types, Dockerfile base image content (covered by file-hash but not separately tracked), function implementations, business logic, source code structure.

This ensures AI can freely write and modify source code, add routes, evolve schemas, and implement features — but cannot silently change environment variable names, swap dependency versions, alter port assignments, delete seed data files, or break deploy idempotency without triggering a detectable drift.

## What this skill actively does

1. **Runs `mxt doctor --gen<profile>`** to produce a fresh script-generated baseline
2. **Runs `mxt doctor --profile <profile>`** to get current scan status (PASS/FAIL/WARN/SKIP)
3. **Analyzes project characteristics** — reads source files, env files, deploy scripts, config files to understand the project's actual structure and conventions
4. **Diffs committed baseline vs fresh generate** — identifies what changed and why
5. **Remediates `.r2mo/doctor/<profile>/*.conf` files directly** — fixes misclassifications, removes redundancies, adds missing `@optional` / `!forbidden` markers, adjusts env template/real/secrets classification
6. **Re-runs `mxt doctor --profile <profile>`** after remediation to verify convergence
7. **Iterates** until scan shows 0 FAIL or remaining FAILs are all real drifts (not metadata issues)

## Arguments

`$ARGUMENTS` is optional:

- A profile name: `k8s`, `loc`, `mob`, `win` — if omitted, process all profiles in `.r2mo/doctor/`
- `Deep` — read more source files for thorough cross-verification (slower but more accurate)
- `Dry` — analyze and report issues but do NOT modify any `.conf` files (read-only mode)

## Pre-conditions

If `.r2mo/doctor/` does not exist or has no profile subdirectories:

```
ERROR: No .r2mo/doctor/ directory found.
Run "mxt doctor --genk8s" or "mxt doctor --genloc" first.
```

## Configuration file formats

Each `.conf` file in `.r2mo/doctor/<profile>/` uses tab-separated values (TSV). Understanding the exact column layout is essential for correct remediation.

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

- `default_profile`: profile used when `--profile` is omitted
- `env_sources`: extra env file paths not discoverable by standard globs
- `expected_branch`: git branch to verify (usually `master`)
- `language` / `project_type`: primary language and project classification

### file-list.conf

Supports three line types plus optional content locking:

| Format | Meaning | Check |
|--------|---------|-------|
| `path` | Required file (existence-only) | FAIL if missing or not git-tracked |
| `path\tsha256` | Required file (content-locked) | FAIL if missing, not git-tracked, or content hash differs |
| `@path` | Optional file | SKIP if absent, PASS if exists |
| `!pattern` | Forbidden pattern | FAIL if any matching file exists |

Default on `--generate`: all entries are existence-only (path only). The SKILL can upgrade individual entries to content-locked by appending a sha256 hash. Mode overrides survive `--generate` regeneration.

### file-hash.conf

Supports two per-entry check modes (flexible locking):

| Format | Mode | Check |
|--------|------|-------|
| `<path>` (1 field) | existence-only | File must exist and be git-tracked. Content is NOT checked. |
| `<path>\t<sha256>` (2 fields) | content-locked | File must exist and content hash must match. |

Default on `--generate`: all entries are content-locked (2 fields). The SKILL can downgrade high-churn files to existence-only by removing the hash field. This prevents false FAILs on files that change frequently during active development (e.g., `docker-compose.yml` during feature work).

Manual mode overrides survive `--generate` regeneration — `_preserve_manual_markers()` keeps per-entry field-count differences from the old file.

#### Edge-case config files — content-locked by default

The following edge-case configuration files are **always content-locked** (sha256 hashed) in `file-hash.conf`. These are the most drift-sensitive files in a project — AI must never silently modify them:

| Category | File patterns | Why locked |
|----------|---------------|------------|
| Git/Docker/Editor | `.gitignore`, `.gitattributes`, `.dockerignore`, `.editorconfig` | Defines what is tracked, built, ignored — silent changes break repo hygiene and build behavior |
| Prettier | `.prettierrc`, `.prettierrc.{json,yml,yaml,json5,js,cjs,mjs,ts}`, `prettier.config.{js,cjs,mjs,ts}` | Code formatting rules — silent changes cause spurious diffs across the codebase |
| ESLint | `.eslintrc`, `.eslintrc.{json,yml,yaml,js,cjs,mjs}`, `eslint.config.{js,cjs,mjs,ts,mts}` | Linting rules — silent changes suppress or introduce errors |
| Babel | `.babelrc`, `.babelrc.{json,js,cjs,mjs}`, `babel.config.{js,cjs,mjs,json}` | Transpilation config — silent changes alter output |
| PostCSS | `.postcssrc`, `.postcssrc.{json,js,cjs}`, `postcss.config.{js,cjs,mjs,json}` | CSS processing — silent changes alter styles |
| Tailwind | `tailwind.config.{js,cjs,mjs,ts,json}` | Design system config — silent changes alter UI |
| Package manager | `.npmrc`, `.yarnrc`, `.yarnrc.yml`, `.pnpmrc` | Registry/auth config — silent changes break installs |
| Build tools | `webpack.config.*`, `rollup.config.*` | Build pipeline — silent changes alter output |
| Test config | `vitest.config.*`, `vitest.workspace.*`, `jest.config.*` | Test runner config — silent changes affect test behavior |
| Stylelint | `.stylelintrc`, `.stylelintrc.{json,js,cjs}`, `stylelint.config.{js,cjs}` | CSS linting — silent changes alter quality gates |
| TypeScript | `tsconfig*.json` | Compiler config — silent changes alter type checking and build output |
| Vite | `vite.config.*` | Dev server and build config — silent changes alter dev/build behavior |

During calibration, verify that all edge-case config files present in the project appear in both `file-list.conf` (existence check) and `file-hash.conf` (content-locked). If any are missing from `file-hash.conf`, it is a bug.

### file-oob.conf

Supports two per-entry check modes (flexible locking):

| Format | Mode | Check |
|--------|------|-------|
| `<path>` (1 field, default) | existence-only | SQL file must exist and be git-tracked. Content may evolve freely. |
| `<path>\t<sha256>` (2 fields) | content-locked | SQL file content hash must match. Use for critical seed data that must not change. |

Default on `--generate`: all entries are existence-only (1 field). The SKILL can upgrade critical seed files to content-locked by appending the sha256 hash. This allows selective content protection for data that must remain stable across deploys.

Manual mode overrides survive `--generate` regeneration — `_preserve_manual_markers()` keeps per-entry field-count differences from the old file.

### meta-env.conf

One env file per block. File path as comment header, then KEY=VALUE lines:

```
# .env
KEY1=value1
KEY2=value2
KEY3=  # injected
# .env.example
KEY1=placeholder  # template
```

Line-level markers (appended as inline comments):

| Marker | Meaning | Verification |
|--------|---------|-------------|
| `# template` | Placeholder value — name-only check, value not baselined | Variable name must exist; value is not compared |
| `# injected` | Runtime-injected — variable exists in template but empty in real env | Variable name must exist; value is not compared |
| `# secrets` | Real production secret — full KEY=VALUE baseline | Both name and value are checked |
| (no marker) | Real fixed value — full KEY=VALUE baseline | Both name and value are checked |

File-level classification rules:
- `.env.example` / `*.tpl` / `*.example` → always template (name-only)
- `.env` / `.secrets.env` → always real (value-checked)
- `.env.production` / `.env.development` / `.env.staging` → real, per-environment fixed values, checked per-file independently
- Custom names (`user.env`, `app.env`, `cloud.env`) → real unless content has placeholders

### meta-deps.conf

TSV: `<manifest_path>\t<dep_name>\t<version>`

Dependency manifest entries. Deduplication rule: if the same `(manifest_path, dep_name)` appears multiple times (e.g., in both `dependencies` and `devDependencies` of package.json), keep the first occurrence only.

### meta-tokens.conf

TSV: `<key>\t<mode>\t<prefix>\t<min_len>\t<max_len>\t<charset>`

Token pattern verification for secret-bearing env variables.

| Mode | Meaning | Strictness |
|------|---------|:----------:|
| `fixed` | Exact value match | highest |
| `prefix_hex` | Must match prefix, then hex chars | |
| `hex` | Must be hex string of specified length | |
| `prefix_alnum` | Must match prefix, then alphanumeric | |
| `allow_empty` | Empty value allowed (runtime-injected) | |
| `placeholder` | Placeholder value (CHANGE_ME etc.) | |
| `env_ref` | Value is an env variable reference | lowest |

When the same key has different modes across files, the most strict mode wins.

### meta-ports.conf

TSV: `<file_path>\t<port_number>\t<source_type>`

Port declarations extracted from config files, Dockerfiles, env examples, and Terraform. `source_type` can be `EXPOSE`, `listen`, `port`, `container_port`, `REDIS_PORT`, etc.

### code-interfaces.conf

Supports two per-entry check modes (flexible locking):

| Format | Mode | Check |
|--------|------|-------|
| `name\tsource\tlang` (3 fields) | existence-only | Interface must exist in current source. Field hash is NOT checked. |
| `name\tsource\tlang\tsha256` (4 fields) | content-locked | Interface field hash must match. |

Default on `--generate`: all entries are content-locked (4 fields). The SKILL can downgrade high-churn interfaces to existence-only by removing the hash field. Mode overrides survive `--generate` regeneration.

### code-idempotency.conf (k8s profile only)

TSV: `<rule_name>\t<pattern>\t<requirement>`

Idempotency rules for deployment infrastructure. Each rule checks that a specific pattern in deploy scripts meets a requirement:

| Rule | Pattern | Requirement |
|------|---------|-------------|
| `deploy_cross_verify` | `source references` | `require_all_exist` |
| `deploy_order` | `ddl_data_security` | `require_sequential` |
| `secret_upsert` | `kubectl apply secret` | `require_dry_run` |
| `sql_data` | `INSERT INTO` | `require_on_conflict_or_where_not_exists` |
| `sql_ddl` | `CREATE TABLE` | `require_if_not_exists` |
| `sts_pvc` | `volumeClaimTemplates` | `require_standalone_pvc` |
| `tf_adopt` | `terraform import` | `require_import_existing` |
| `tf_apply_plan` | `terraform apply` | `require_plan_file` |
| `tf_lifecycle` | `kubernetes_deployment_v1` | `require_ignore_changes` |
| `tf_lifecycle` | `kubernetes_secret_v1` | `require_ignore_changes_or_placeholder` |
| `tf_lifecycle` | `kubernetes_stateful_set_v1` | `require_ignore_changes` |
| `verify_count` | `deploy-data-verify` | `require_no_less_than` |

## Workflow

### Step 1 — Profile discovery and project analysis

1. Read `.r2mo/doctor/config.json` for `default_profile`, `project_type`, `language`, `expected_branch`.
2. List profile subdirectories. Determine which to process (from `$ARGUMENTS` or all).
3. **Analyze project characteristics**:
   - Run `git ls-files` to get all tracked files
   - Identify project type: Go / Java(Maven) / Java(Gradle) / Rust(Tauri) / Rust(WASM) / UniApp(Mobile) / HarmonyOS / Node/TS / Python / mixed
   - Identify env file conventions: which files are templates (`.env.example`, `*.tpl`), which are real (`.env`, `.secrets.env`), which are per-environment (`.env.production`, `.env.development`)
   - Identify config file conventions: which `*.yaml`/`*.json`/`*.toml` are primary configs vs generated artifacts
   - Identify deploy chain: does project have `deploy-k8s.sh`? `*.tf`? `*.sql` with INSERT?
   - Identify special files: `manifest.json` (mobile), `tauri.conf.json` (desktop), `oh-package.json5` (HarmonyOS)

### Step 2 — Fresh generate and scan

Before running `--gen`, save the committed baseline for later diffing:

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

Categorize discrepancies:
- **Expected drift**: project files legitimately changed since last commit → user should commit updated baseline
- **Script gap**: `--gen` produces wrong content because glob/regex doesn't match project's file naming → needs `.conf` remediation
- **Classification error**: env file marked wrong (template vs real vs secrets) → needs `.conf` remediation
- **Missing signal**: dimension SKIP but project has the relevant files → needs `.conf` remediation or `config.json` `env_sources` addition
- **Stale entry**: baseline references a file that no longer exists in the project → needs `.conf` cleanup

### Step 4 — Intelligent remediation of .conf files

This is the core step. Based on project analysis (Step 1) and discrepancy findings (Step 3), **directly edit `.r2mo/doctor/<profile>/*.conf` files**.

If the `Dry` argument was given, skip all edits and only report what would be changed.

#### 4a. file-list.conf — scope alignment

- Remove files that don't belong in this profile scope:
  - k8s: remove `dev-*.sh`, `loc-*.sh`, `run-*.sh` if present (these are local dev chain files)
  - loc: remove `deploy-k8s.sh`, `deploy/release/*`, `deploy-k8s-verify*` if present (these are deploy chain files)
  - mob: should include `manifest.json`, `pages.json`, `App.vue` if the project has them
  - win: should include `tauri.conf.json` or `Trunk.toml` if the project has them
- Add `@optional` markers for files that may be legitimately absent (e.g., `.codex/config.toml` in some environments)
- Verify `!forbidden` patterns are correct for this project:
  - k8s: `!deploy/release/*kubeconfig` only if project has `deploy/release/` directory
  - Remove `!` patterns for directories that don't exist in this project

#### 4b. meta-env.conf — classification correction

Read each env file referenced in `meta-env.conf` and verify/correct its classification:

- **Template** (`# template`): file contains placeholder values (CHANGE_ME, YOUR_, REPLACE_) → name-only check
- **Real** (no marker): file contains actual fixed values → full KEY=VALUE baseline
- **Secrets** (`# secrets`): file contains real production secrets → full KEY=VALUE baseline
- **Injected** (`# injected`): variable exists in template but empty/absent in real env → name-only check

Specific rules:
- `.env.example` / `*.tpl` / `*.example` → always template (check values for placeholders to confirm)
- `.env` / `.secrets.env` → always real (value-checked)
- `.env.production` / `.env.development` / `.env.staging` → real, per-environment fixed values, checked per-file independently
- If a file has mixed placeholder + real values → classify as real, but add `# template` to individual lines with placeholders
- If a key has empty value in one env file but real value in another → the empty one is runtime-injected, mark as `# injected` on that file's line

#### 4c. meta-deps.conf — deduplication and completeness

- Remove duplicate `(manifest_path, dep_name)` entries (keep first occurrence)
- Verify all dependency manifests are represented and ecosystem-labeled:
  - Go (`[go]`): `go.mod` — parse both `require ( ... )` blocks and single-line `require` statements
  - Node/TS (`[npm]`): `package.json` — check for nested ones in monorepos; parse `dependencies`, `devDependencies`, `peerDependencies`
  - Rust (`[cargo]`): `Cargo.toml` — parse `[dependencies]` and `[dev-dependencies]` sections
  - Java/Maven (`[maven]`): `pom.xml` — parse `<dependency>` blocks including inherited parent deps
  - Java/Gradle (`[gradle]`): `build.gradle` / `build.gradle.kts` — parse `implementation`, `api`, `compileOnly`, `runtimeOnly`, `testImplementation` and similar configuration keywords
  - Python (`[python]`): `pyproject.toml` / `requirements.txt`
- Flag version strings that are `${...}` placeholders (should be resolved or excluded)
- During calibration, run `mxt doctor --gen<profile>` and verify the `📦 Dep ecosystems:` line matches the project's actual languages. If a Go project shows `[npm]` entries without `[go]`, something is wrong.
- Version drift detection: if `--gen<profile>` shows a different version than the baseline `.conf`, the scan will report `❌ FAIL [eco] manifest:dep version drift (old -> new)`. This is legitimate drift — calibrate by re-running `--gen<profile>` only if the version change is intentional.

#### 4d. meta-tokens.conf — stale entry removal and strictness

- Remove keys that no longer exist in any env file referenced in `meta-env.conf`
- Verify mode classification: if a key has both `fixed` and `allow_empty` modes across files, the most strict (`fixed`) should win
- Add keys that exist in `meta-env.conf` with TOKEN_KEYWORDS (SECRET/TOKEN/KEY/PASSWORD/PASS/AUTHTOKEN) but are missing from tokens
- Verify `min_len` and `max_len` match actual value lengths in the env files

#### 4e. file-hash.conf — redundancy elimination

- If a file appears in both `file-list.conf` and `file-hash.conf`, evaluate: is file-hash providing additional value (content-level drift detection) beyond file-list (existence-level + git-tracked)? If not, remove from file-hash.
- Remove lock files (`package-lock.json`, `go.sum`, `yarn.lock`, `pnpm-lock.yaml`) if they slipped through
- Remove generated artifacts (`dist/`, `build/`, `node_modules/`) if they slipped through
- Remove cache files (`.kube/cache/*`) if they slipped through

#### 4f. file-oob.conf — SQL seed file flexible verification

- Verify each file in `file-oob.conf` still exists in the project (`git ls-files` check)
- Remove entries for files that have been deleted from the project
- These are SQL files containing INSERT statements (seed data, migration data)
- **Default mode is existence-only** (1 field: path only). Content may evolve freely during development.
- **Mode management**: Review each entry:
  - SQL seed data that must match across deploys → upgrade to content-locked (append sha256 hash)
  - SQL migrations that evolve with schema → keep existence-only (default)
  - A 2-field entry in file-oob means "content-locked" — this is a manual upgrade, preserve it
- If a file has moved (path changed), update the path to match the new location

#### 4g. code-interfaces.conf — interface contract verification

- Verify each interface entry still exists at the recorded file path
- Remove entries for files that no longer exist
- If `code-interfaces.conf` is SKIP but the project has source files with type declarations, investigate whether the glob pattern in the script matched the correct file extensions for this project's language

#### 4h. meta-ports.conf — port declaration verification

- Verify each port entry's file still exists
- Remove entries for deleted files
- If a port was legitimately changed (e.g., service port reassignment), the baseline hash will not match — this is a real drift, report to user

#### 4i. code-idempotency.conf (k8s only) — rule alignment

- Verify each rule corresponds to actual project files
- Remove rules for file types the project doesn't have (e.g., `tf_lifecycle` if no `.tf` files)
- Add rules the script missed (e.g., if project has `deploy-data-verify*.sh` but no `verify_count` rule)
- Verify `verify_count` requirement is `require_no_less_than` (both `=` and `>=` are valid; only `<` is FAIL)

#### 4j. config.json — metadata correction

- Verify `project_type` matches actual language (check file extensions in `git ls-files`)
- Verify `expected_branch` matches `git branch --show-current`
- If project has env files not discoverable by standard globs, add them to `env_sources`
- Verify `default_profile` is set and valid

### Step 5 — Re-scan and verify convergence

After remediation, re-run:

```bash
mxt doctor --profile <profile>
```

Check results:
- **0 FAIL**: convergence achieved. Report what was fixed.
- **FAILs remain**: check if each FAIL is a **real drift** (project file actually changed/missing) or a **metadata issue** (`.conf` still wrong). If metadata issue, iterate Step 4. If real drift, report to user.

Iterate Steps 4–5 up to 3 rounds. If still failing after 3 rounds, report remaining issues as "needs manual review".

### Step 6 — Output report

```
── mxt-doctor remediation: <project> / <profile> ──

Project type: <go/java/rust/node/mixed>
Env files: <count> (template: X, real: Y, injected: Z, secrets: W)
Deploy chain: <yes/no> (deploy-k8s.sh, *.tf, *.sql)

Scan before: PASS=A  FAIL=B  WARN=C  SKIP=D
Scan after:  PASS=A'  FAIL=B'  WARN=C'  SKIP=D'

Remediation applied:
  file-list.conf: removed 3 dev-only files (loc profile), added @optional for .codex/config.toml
  meta-env.conf: reclassified .env.example as template (was real), fixed per-file headers
  meta-deps.conf: removed 2 duplicate entries, added build.gradle deps
  meta-tokens.conf: removed 1 stale key (Z_OLD_TOKEN), added 2 missing keys
  file-hash.conf: removed config.yaml (redundant with file-list)
  file-oob.conf: removed 1 stale entry (deleted SQL file)
  code-interfaces.conf: no changes needed
  meta-ports.conf: no changes needed
  code-idempotency.conf: removed tf_lifecycle (no .tf files in this project)
  config.json: corrected project_type from "java" to "go"

Converged: 0 FAIL after remediation
  Remaining FAILs: 0

OR

Partial convergence: 2 FAIL remain (both real drifts)
  1. .codex/config.toml (deleted from working tree — user action needed)
  2. deploy/release/terraform/main.tf (content changed — review and commit or revert)
```

## Intelligence rules

The skill uses these intelligence rules when analyzing and remediating:

1. **Project-type awareness**: A Go project with `go.mod` should have `meta-deps.conf` with go.mod entries. If SKIP, something is wrong. A Rust project with `Cargo.toml` should have deps. A UniApp project should have `manifest.json` in file-list for mob profile. A Gradle project should have `build.gradle` entries in deps.

2. **Env file naming convention**: `.env.example` is always a template (name-only check). `.env` is always real (value-checked). `.secrets.env` is always real+secrets. `.env.production` / `.env.development` are per-environment real (checked independently per-file). Custom names (`user.env`, `app.env`, `cloud.env`) are real unless content has placeholders.

3. **Profile scope strictness**: k8s profile must not contain local dev files (`dev-*.sh`, `loc-*.sh`). loc profile must not contain deploy chain files (`deploy-k8s.sh`, `deploy/release/*`). mob/win profiles extend loc with platform-specific files. If a file appears in the wrong profile, it is a scope error.

4. **Token strictness**: when the same key has different modes across files, most strict wins (fixed > prefix_hex > hex > prefix_alnum > allow_empty > placeholder > env_ref). This prevents a `Z_DB_PASSWORD=""` in one file from downgrading the mode from `fixed` to `allow_empty` when another file has the real value.

5. **Redundancy heuristic**: if a file is in both `file-list.conf` (existence check) AND `file-hash.conf` (content hash), the content check subsumes the existence check. But this is not necessarily wrong — file-list also checks git-tracked status. So redundancy is a WARN, not an ERROR. Only remove from file-hash if the file is a lock file, cache file, or generated artifact.

6. **SKIP diagnosis**: when a dimension is SKIP, always investigate WHY. Run `git ls-files | grep <pattern>` to check if the files exist but the glob did not match. If files exist but were missed, the glob pattern in the script needs updating — report this as a script gap. If the files genuinely do not exist (e.g., no `.tf` files in a frontend project), SKIP is correct and no action is needed.

7. **Drift vs metadata**: a FAIL in the scan can be either:
   - **Real drift**: project file actually changed (content hash differs, file deleted, env value changed) → user must decide to commit or revert. This skill does NOT fix real drifts.
   - **Metadata issue**: `.conf` baseline is wrong (wrong classification, stale entry, wrong scope) → this skill fixes the `.conf` file directly.

8. **Idempotency requirement semantics**: `verify_count` uses `require_no_less_than`, meaning both `=` (exact match) and `>=` (more rows than baseline) are valid. Only `<` (fewer rows) is a FAIL. This applies to SQL data verification scripts. Do not change the requirement to `require_exact` — data growth is legitimate.

9. **Noise and build-artifact exclusion**: The script automatically excludes:
    - **Hidden dot-directories at any nesting level** (any path segment that is a directory starting with `.`): `.claude/`, `.codex/`, `.cursor/`, `.vscode/`, `.idea/`, `.obsidian/`, `.r2mo/`, `.github/`, `.gitlab/`, `.trae/`, `.hbuilderx/`, `.kube/`, `.opencode/`, `.plan/`, `.vite/`, `.chglog/`, `.svelte-kit/`, `.next/`, `.nuxt/`, `.gradle/`, `.mvn/`, `.omc/`, `.omx/`
    - **Build artifact directories at any nesting level**: `node_modules/`, `dist/`, `target/`, `build/`, `out/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `vendor/`, `Pods/`
    - **Noise dot-files (filenames)**: `.DS_Store`, `.gitignore`, `.gitattributes`, `.gitmodules`, `.editorconfig`, `.envrc`, `.nvmrc`, `.node-version`, `.prettierrc`, `.prettierignore`, `.eslintignore`, `.dockerignore`, `.npmignore`, `.tool-versions`
    
    **Critical**: `.env`, `.env.example`, `.env.production`, `.secrets.env`, `.secrets.env.example`, `.golangci.yml`, `.ko.yaml`, `.mcp.json`, `.air.toml` are NOT noise — they are env files or source-level config that must be kept in the baseline. The dot-dir filter only applies to directory segments, not filenames.

    Doctor checks **source-level resources only**: pre-compile config, source code, env files, deploy scripts. If any noise or build artifact appears in `file-list.conf` or `file-hash.conf`, it is a script gap — remove them and report that `NOISE_DIR_PREFIXES`, `BUILD_ARTIFACT_DIRS`, or `NOISE_DOT_FILES` in `mxt_doctor_constants.py` may need updating.

10. **Lock file exclusion at any depth**: Lock files (`package-lock.json`, `go.sum`, `yarn.lock`, `pnpm-lock.yaml`) are excluded at any nesting level, not just the root. If a nested lock file appears in `file-hash.conf`, it is a bug — the `_is_lock_file()` helper checks basename, not full path.

11. **Env file discovery rules**: The script discovers env files using `ENV_GLOBS` patterns: `.env*`, `*.env`, `*.env.*`, `*secrets*env*`, `*.properties`. However, not all `*.properties` files are env files:
    - **Excluded as framework config**: `gradle.properties`, `gradle-wrapper.properties`, `spy.properties`, `application.properties`, `application.yml`, `log4j*.properties`, `MYSQL.properties`, `viewer.properties`, `locale.properties`
    - **Excluded as i18n bundles**: `Message*_*.properties`, `vertx-validation_*_*.properties`, any file in a `locale/` directory
    - **Excluded as database/plugin config**: `*.properties` in `/database/` or `/plugins/` paths
    - **Kept as real env files**: `env.properties`, `env-test.properties`, `env-hotel.properties` — these contain `KEY=VALUE` pairs with uppercase keys (e.g., `Z_DB_TYPE=MYSQL`)
    
    If a `.properties` file appears in `meta-env.conf` but has no entries (0 KEY=VALUE pairs matched by `ENV_LINE_RE`), it was discovered but produced no signal — this is harmless but indicates the file shouldn't have been discovered. If a real env file is missing from `meta-env.conf`, check if it's being incorrectly excluded by the framework config or i18n patterns.

12. **Template vs real env file classification**: File classification priority:
    1. Filename ends with `.example`, `.tpl`, or `.template` → **template** (name-only check, value not baselined)
    2. Filename is `.env` or `.secrets.env` → **real** (value-checked)
    3. Filename ends with `.env` (e.g., `cloud.env`, `release.env`) → **real** (value-checked)
    4. Filename matches `.env.(production|development|staging|release|local|sandbox)` → **real**, per-environment fixed values, checked per-file independently
    5. Content-based: any value contains `CHANGE_ME`/`placeholder`/`YOUR_`/`REPLACE_` → **template**
    6. Default → **real** (value-checked)
    
    `.secrets.env.example` is a template (suffix `.example` wins). `.secrets.env` is always real. Individual placeholder values within a real file get `# template` at the line level, not the file level.

13. **Project-type-aware resource filtering**: The script detects the project type from tracked files (`java`, `go`, `rust`, `harmony`, `frontend`, `python`, `unknown`) and applies different noise rules:
    - **Java projects**: `src/main/resources/` and `src/test/resources/` are source-level paths — their contents (env.properties, application.yml, etc.) are kept in baselines. This is where Java projects store environment configuration.
    - **Non-Java projects**: Standalone `resources/` directories (not under `src/main/` or `src/test/`) are treated as build artifacts and filtered out. However, Maven/Gradle paths (`src/main/resources/`, `src/test/resources/`) are always kept regardless of project type, because some polyglot projects use Java conventions.
    - **All projects**: Hidden dot-directories (`.claude/`, `.r2mo/`, `.obsidian/`, `.github/`, etc.) and build artifacts (`node_modules/`, `dist/`, `target/`, `build/`, `locale/`, `hybrid/`) are always filtered.
    
    When verifying metadata, check that the project type in `config.json` matches the actual file extensions. If a Java project is misclassified as `unknown`, its `src/main/resources/env.properties` might be incorrectly filtered.

14. **WARN stability — env_var_added is legitimate drift**: When the scan reports `WARN env_var_added` (an env file has new variables not in the baseline), this is a legitimate signal that the project has evolved. The correct action is to regenerate the baseline (`mxt doctor --gen<profile>`) so the new variables are captured. Do NOT suppress these WARNs — they are the primary mechanism for detecting when AI has added new environment variables without updating the baseline.

15. **SKIP stability — empty signals are expected**: When a dimension is SKIP, it means the project does not have the corresponding file types. This is expected and correct for many projects:
    - Frontend-only projects: SKIP `file-oob` (no SQL), SKIP `code-idempotency` (no deploy scripts)
    - Backend-only projects: SKIP `code-interfaces` if no Go/TS/OpenAPI type declarations exist
    - Projects without k8s: SKIP `code-idempotency` for loc profile (no deploy chain)
    - Doc-only repositories: SKIP most dimensions (only `file-list` and `file-hash` have signals)
    
    SKIP is only a problem if the project DOES have the relevant files but the script's glob patterns failed to discover them. In that case, report it as a script gap — the glob patterns in `mxt_doctor_constants.py` may need updating.

16. **Anti-noise enforcement**: The script automatically filters hidden dot-directories (`.claude/`, `.r2mo/`, `.obsidian/`, `.github/`, etc.), build artifacts (`node_modules/`, `dist/`, `target/`, `build/`, `out/`, `vendor/`, `Pods/`, `locale/`, `hybrid/`), and noise dot-files (`.DS_Store`, `.gitignore`, `.editorconfig`, etc.). If any of these appear in a `.conf` file, it is a bug — remove them immediately. The doctor checks **pre-compile source-level resources only**: configuration files, source code contracts, environment files, deploy scripts, and dependency manifests. Compiled output, vendored dependencies, IDE state, and task management directories are always excluded.

17. **SQL content is NOT locked**: `file-oob.conf` tracks SQL files with INSERT statements at the **existence level only**. The file must exist and be git-tracked, but its content (schema, columns, seed data) may evolve freely. This is intentional: schema migration, column addition, and seed data updates are legitimate development activities. Only file deletion or renaming triggers a FAIL. Do NOT add content hashes to `file-oob.conf` — it uses path-only format.

18. **Closed-loop verification**: The full verification cycle is: (1) `mxt doctor --gen<profile>` generates fresh baseline → (2) `mxt-doctor` skill calibrates metadata to match project reality → (3) `mxt doctor --profile <profile>` runs final drift check. All three steps must pass for a project to be considered verified. If any step produces unexpected results, the issue is in the script or skill — NOT in the project. Never modify project source to satisfy doctor checks.

19. **Dependency version drift detection**: The `meta-deps.conf` dimension tracks every dependency declared in `go.mod`, `package.json`, `Cargo.toml`, `pom.xml`, `build.gradle`, and `pyproject.toml`. During scan, each dependency is printed with an **ecosystem label** (`[go]`, `[npm]`, `[cargo]`, `[maven]`, `[gradle]`, `[python]`) to make the dep origin immediately visible. Three drift scenarios are detected:
    - **Version drift**: `❌ FAIL [eco] manifest:dep version drift (old -> new)` — a dep version changed from baseline. This is the primary anti-drift signal: AI must not silently upgrade/downgrade dependency versions.
    - **Missing dep**: `❌ FAIL [eco] manifest:dep (missing)` — a dep was removed from the manifest. If intentional, regenerate the baseline.
    - **Extra dep**: `⚠️ WARN [eco] manifest:dep (extra: version)` — a new dep was added. Legitimate during feature development; regenerate to capture it.
    During `--generate`, a `📦 Dep ecosystems:` summary line shows the count of deps per ecosystem, making it easy to verify all manifest types were detected.

20. **Submodule delegation**: When a project has `.gitmodules`, the engine automatically filters out all submodule paths from `git ls-files`. Parent projects (e.g., `app-iia`, `app-qxx`) only scan their own coordination files. Each submodule is scanned independently. This prevents redundant parent-child scanning.

## Continuous development workflow

The baseline is NOT frozen — it moves forward with the project. The locking philosophy is **prevent drift and accidental changes, not freeze evolution**.

### Lifecycle of a baseline entry

```
Generate → Lock → Develop → Drift detected → Review → Regenerate or Revert
                                                      ↓
                                                  New baseline committed
```

### Baseline advancement scenarios

1. **Legitimate content change** (e.g., config file updated for new feature):
   - `mxt doctor --profile <profile>` reports FAIL (sha256 drifted)
   - Developer reviews the change — if intentional, regenerate: `mxt doctor --gen<profile>`
   - New baseline committed with the feature commit

2. **New file added** (e.g., new migration SQL):
   - `mxt doctor --profile <profile>` reports the new file as missing from baseline (or WARN)
   - Regenerate to capture the new file in the baseline

3. **File deleted** (e.g., obsolete config removed):
   - `mxt doctor --profile <profile>` reports FAIL (file missing)
   - If deletion is intentional, regenerate to remove the entry from baseline

4. **Environment variable renamed**:
   - `mxt doctor --profile <profile>` reports FAIL (name missing) + WARN (new name)
   - This is exactly the drift the system is designed to catch — AI must not silently rename env vars
   - If the rename is intentional, regenerate to update the baseline

5. **Mode upgrade** (existence-only → content-locked):
   - SKILL appends sha256 hash to a file-oob entry: `path` → `path\t<sha256>`
   - Next scan checks content, not just existence
   - Survives `--generate` regeneration

6. **Mode downgrade** (content-locked → existence-only):
   - SKILL removes sha256 hash from a file-hash entry: `path\t<sha256>` → `path`
   - Next scan checks existence only, allowing free content evolution
   - Survives `--generate` regeneration

### When to upgrade vs downgrade

| Scenario | Action |
|----------|--------|
| File changes frequently during active development | Downgrade to existence-only |
| File is stable config that should not change | Keep content-locked |
| SQL seed data that must match across deploys | Upgrade to content-locked |
| SQL migration that evolves with schema | Keep existence-only |
| Dockerfile base image must not drift | Keep content-locked (default) |
| docker-compose.yml under active feature work | Downgrade to existence-only |

## Submodule delegation

When a project has `.gitmodules` (e.g., `app-iia`, `app-qxx`), the engine automatically:
- Parses `.gitmodules` to identify submodule directory paths
- Filters out all submodule paths from `git ls-files` results
- Prevents the parent project from redundantly scanning child content

**Parent project**: Only scans its own files (coordination configs, deploy scripts, dev orchestration). Submodule paths like `iia.core`, `iia.web.user`, `pms-sass-service` are excluded from all dimensions.

**Child projects**: Each submodule is an independent git repository and should be scanned separately with its own `mxt doctor --gen<profile>` and `mxt doctor --profile <profile>`.

This means:
- Running `mxt doctor` in `app-iia/` does NOT scan `iia.core/` content
- Running `mxt doctor` in `app-iia/iia.core/` scans only `iia.core`'s own files
- The closed-loop verification cycle must be run in each submodule independently

## What this skill CAN do

- Run `mxt doctor --gen<profile>` and `mxt doctor --profile <profile>`
- Run `git ls-files`, `git branch --show-current`, `diff`
- Read all files in `.r2mo/doctor/` and project source files
- **Modify `.r2mo/doctor/<profile>/*.conf` files** (the baseline configs)
- **Modify `.r2mo/doctor/config.json`** (metadata)
- Output structured reports

## What this skill MUST NOT do

- Modify project source code (`.go`, `.ts`, `.java`, `.py`, `.rs`, `.vue`, `.ets`, etc.)
- Modify `.tf` files, `deploy-k8s.sh`, `Dockerfile`, or any deployment infrastructure
- Modify env files (`.env`, `.secrets.env`, etc.)
- Commit or push to git
- Delete `.r2mo/doctor/<profile>/` directories or `.conf` files (only edit content)
- Reorder or rewrite `.conf` files unnecessarily — only change lines that are wrong
