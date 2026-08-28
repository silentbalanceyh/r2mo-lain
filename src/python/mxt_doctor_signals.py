"""
mxt_doctor_signals.py - Signal discovery for all 10 dimensions.
Each signal is independent. Missing signal -> empty result -> config not generated.
"""
import os, re, hashlib, subprocess, fnmatch
from mxt_doctor_constants import *
from mxt_doctor_parsers import parse_env_file, discover_env_files, parse_deps
from mxt_doctor_extractors import extract_ports, derive_token_patterns, extract_interfaces

# ── project type context ──────────────────────────────────────────────
# Set once per generate/scan call. Used by _is_noise() to make
# project-type-aware decisions about what constitutes noise vs source.
# Each project type has its own source dirs (kept) and noise dirs (filtered).
_PROJECT_TYPE = 'unknown'

def set_project_type(tracked_files):
    """Detect project type from tracked files. Called once per generate/scan.
    Detection priority: java > go > rust > harmony > frontend > python > unknown.
    This priority ensures polyglot projects (e.g., Java+TS) are classified
    by their primary backend language, since that determines the project
    structure conventions."""
    global _PROJECT_TYPE
    has_java = any(f.endswith('.java') for f in tracked_files)
    has_go = any(f.endswith('.go') for f in tracked_files)
    has_ts = any(f.endswith('.ts') or f.endswith('.tsx') for f in tracked_files)
    has_vue = any(f.endswith('.vue') for f in tracked_files)
    has_rust = any(f.endswith('.rs') for f in tracked_files)
    has_py = any(f.endswith('.py') for f in tracked_files)
    has_ets = any(f.endswith('.ets') for f in tracked_files)
    
    if has_java:
        _PROJECT_TYPE = 'java'
    elif has_go:
        _PROJECT_TYPE = 'go'
    elif has_rust:
        _PROJECT_TYPE = 'rust'
    elif has_ets:
        _PROJECT_TYPE = 'harmony'
    elif has_vue or has_ts:
        _PROJECT_TYPE = 'frontend'
    elif has_py:
        _PROJECT_TYPE = 'python'
    else:
        _PROJECT_TYPE = 'unknown'

def get_project_type():
    return _PROJECT_TYPE

def _is_project_source(filepath):
    """Check if filepath is inside a project-type-specific source directory.
    These directories are kept even if they might otherwise look like noise."""
    source_dirs = PROJECT_SOURCE_DIRS.get(_PROJECT_TYPE, ())
    for src_pattern in source_dirs:
        # Match as consecutive path segments
        if f'/{src_pattern}/' in f'/{filepath}/' or filepath.startswith(src_pattern + '/'):
            return True
    return False

def _is_project_noise(filepath):
    """Check if filepath is inside a project-type-specific noise directory."""
    noise_dirs = PROJECT_NOISE_DIRS.get(_PROJECT_TYPE, ())
    parts = filepath.split('/')
    for part in parts:
        if part in noise_dirs:
            return True
    return False

# ── noise / lock-file helpers ─────────────────────────────────────────

def _is_noise(filepath):
    """Return True if filepath is inside a noise directory or is a noise file.
    
    Universal rules (all project types):
    1. Path starts with a noise directory prefix (.r2mo/, .obsidian/, .claude/, etc.)
    2. Any path segment is a hidden dot-directory (starts with '.')
    3. Any path segment is a universal build artifact (node_modules, dist, target, etc.)
    4. Filename is a known noise dot-file (.DS_Store, .gitignore, etc.)
    5. Any path segment is .tmp or .cache
    
    Project-type-aware rules:
    6. If filepath is inside a PROJECT_SOURCE_DIRS pattern → NOT noise (source)
    7. If filepath is inside a PROJECT_NOISE_DIRS entry → noise
    8. For non-Java projects: standalone 'resources/' (not src/main/resources
       or src/test/resources) is treated as build artifact.
    """
    # 1. Root-level prefix match
    for prefix in NOISE_DIR_PREFIXES:
        if filepath.startswith(prefix):
            return True

    parts = filepath.split('/')
    basename = parts[-1] if parts else ''

    # 2. Check for hidden dot-directories at any path level
    for part in parts[:-1]:
        if part.startswith('.') and len(part) > 1:
            return True

    # 3. Check for universal build artifact directories
    for part in parts:
        if part in BUILD_ARTIFACT_DIRS:
            return True

    # 4. Check for noise dot-files
    if basename in NOISE_DOT_FILES:
        return True

    # 5. Check for .tmp / .cache
    for part in parts:
        if part in ('.tmp', '.cache'):
            return True

    # 6. Project-type-aware: type-specific noise dirs (check BEFORE source)
    #    This ensures that noise dirs inside source dirs (e.g., META-INF inside
    #    src/main/resources, doctor/ inside go project) are still filtered.
    if _is_project_noise(filepath):
        return True

    # 7. Project-type-aware: source dirs are NOT noise (early exit)
    if _is_project_source(filepath):
        return False

    # 8. Non-Java: standalone 'resources/' is build artifact
    #    But Maven/Gradle paths (src/main/resources, src/test/resources) are always kept
    if _PROJECT_TYPE != 'java':
        for i, part in enumerate(parts[:-1]):
            if part == 'resources':
                if i >= 1 and parts[i-1] in ('main', 'test') and i >= 2 and parts[i-2] == 'src':
                    continue
                return True

    return False

def _is_lock_file(filepath):
    """Return True if filepath is a lock file at any nesting level.
    Also handles dotted variants like .package-lock.json."""
    basename = os.path.basename(filepath)
    lock_names = (
        'package-lock.json', '.package-lock.json',
        'go.sum', '.go.sum',
        'yarn.lock', '.yarn.lock',
        'pnpm-lock.yaml', '.pnpm-lock.yaml',
    )
    return basename in lock_names

# ── git tracked files ─────────────────────────────────────────────────

def _get_submodule_paths(cwd='.'):
    """Parse .gitmodules to get submodule directory paths.
    Returns a set of path strings (e.g., {'iia.core', 'iia.web.user'}).
    If no .gitmodules exists, returns empty set."""
    paths = set()
    gms_path = os.path.join(cwd, '.gitmodules')
    if not os.path.isfile(gms_path):
        return paths
    try:
        with open(gms_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('path = '):
                    sub_path = line[7:].strip()
                    if sub_path:
                        paths.add(sub_path)
    except OSError:
        pass
    return paths


def get_tracked_files(cwd='.'):
    """Run git ls-files, return sorted list of tracked files.
    Filters out submodule paths — submodules have their own git repos
    and should be scanned independently. This prevents parent projects
    (e.g., app-iia, app-qxx) from redundantly scanning child content."""
    try:
        result = subprocess.run(
            ['git', 'ls-files'], cwd=cwd,
            capture_output=True, text=True, encoding='utf-8'
        )
        if result.returncode != 0:
            return []
        files = [f for f in result.stdout.strip().split('\n') if f]
        # Filter out submodule paths
        sub_paths = _get_submodule_paths(cwd)
        if sub_paths:
            filtered = []
            for f in files:
                # A submodule entry is either exactly the path (e.g., 'iia.core')
                # or starts with path/ (e.g., 'iia.core/...')
                is_submodule = False
                for sp in sub_paths:
                    if f == sp or f.startswith(sp + '/'):
                        is_submodule = True
                        break
                if not is_submodule:
                    filtered.append(f)
            files = filtered
        # Filter out tracked-but-deleted files (removed from working tree
        # but still tracked by git). These should not be in baselines.
        existing = []
        for f in files:
            full_path = os.path.join(cwd, f)
            if os.path.exists(full_path):
                existing.append(f)
        return sorted(existing)
    except (OSError, subprocess.SubprocessError):
        return []

# ── file-list signal ──────────────────────────────────────────────────

def signal_file_list(tracked_files, profile='loc'):
    """Return tracked files filtered by profile scope.
    LOC: local dev chain files only (dev-*.sh, loc-*.sh, *.env, config/, dev/, etc.)
    K8S: deploy chain files only (deploy-k8s.sh, deploy/, *.tf, *.sql, etc.)
    MOB: loc + mobile-specific config (manifest.json, pages.json, App.vue, etc.)
    WIN: loc + desktop-specific config (tauri.conf.json, Trunk.toml, etc.)
    Both profiles also include forbidden patterns (! prefix) for profile-specific checks.
    """
    import fnmatch as _fn

    if profile == 'k8s':
        globs = K8S_FILE_GLOBS
        dir_prefixes = K8S_FILE_DIR_PREFIXES
        forbidden = K8S_FORBIDDEN_PATTERNS
    elif profile == 'mob':
        globs = MOB_FILE_GLOBS
        dir_prefixes = MOB_FILE_DIR_PREFIXES
        forbidden = LOC_FORBIDDEN_PATTERNS
    elif profile == 'win':
        globs = WIN_FILE_GLOBS
        dir_prefixes = WIN_FILE_DIR_PREFIXES
        forbidden = LOC_FORBIDDEN_PATTERNS
    else:
        globs = LOC_FILE_GLOBS
        dir_prefixes = LOC_FILE_DIR_PREFIXES
        forbidden = LOC_FORBIDDEN_PATTERNS

    result = []
    for tf in tracked_files:
        # Filter out noise directories (IDE state, task mgmt, etc.)
        if _is_noise(tf):
            continue
        # Filter out lock files at any nesting level
        if _is_lock_file(tf):
            continue
        basename = os.path.basename(tf)
        matched = False
        # Check glob match on basename
        for pattern in globs:
            if _fn.fnmatch(basename, pattern):
                matched = True
                break
        # Check directory prefix match
        if not matched:
            for prefix in dir_prefixes:
                if tf.startswith(prefix):
                    matched = True
                    break
        if matched:
            result.append(tf)

    # Append forbidden patterns (these are ! lines, not file paths)
    for fp in forbidden:
        result.append(fp)

    return sorted(result)

# ── env signal ────────────────────────────────────────────────────────

def signal_env(tracked_files, config=None):
    """Discover and parse env files. Returns {filename: [(key, value), ...]}.
    Filters out env files inside noise directories (IDE state, task mgmt,
    build artifacts, etc.) — these are not project-level env files."""
    env_files = discover_env_files(tracked_files)
    result = {}
    for ef in env_files:
        # Skip env files inside noise directories (e.g., .r2mo/out/task-xxx/config.env,
        # aisz-app/sub/.r2mo/app.env, node_modules/pkg/.env)
        if _is_noise(ef):
            continue
        entries = parse_env_file(ef)
        if entries:
            result[ef] = entries
    # also check config.json env_sources
    if config and config.get('env_sources'):
        for src in config['env_sources']:
            if os.path.isfile(src) and src not in result:
                entries = parse_env_file(src)
                if entries:
                    result[src] = entries
    return result

def detect_injected_vars(env_data):
    """Detect .env.example vars not in .env -> mark as injected."""
    example_vars = set()
    real_vars = set()
    for filename, entries in env_data.items():
        basename = os.path.basename(filename)
        if 'example' in basename or 'tpl' in basename:
            for key, _ in entries:
                example_vars.add(key)
        elif not basename.startswith('.env.example'):
            for key, _ in entries:
                real_vars.add(key)
    injected = example_vars - real_vars
    return injected

# ── content-hash signal ───────────────────────────────────────────────

def signal_content_hash(tracked_files):
    """Hash config-type files. Returns [(file_path, sha256_hex), ...]."""
    result = []
    for tf in tracked_files:
        if _is_config_file(tf) and not _is_excluded(tf):
            sha = _sha256_file(tf)
            if sha:
                result.append((tf, sha))
    return sorted(result, key=lambda x: x[0])

def _is_config_file(filepath):
    basename = os.path.basename(filepath)
    for pattern in CONFIG_HASH_GLOBS:
        if fnmatch.fnmatch(basename, pattern):
            return True
    return False

def _is_excluded(filepath):
    # Noise directories (IDE state, task mgmt, build artifacts, etc.)
    if _is_noise(filepath):
        return True
    # Lock files at any nesting level
    if _is_lock_file(filepath):
        return True
    for pattern in CONFIG_HASH_EXCLUDES:
        if fnmatch.fnmatch(filepath, pattern):
            return True
    return False

# ── OOB signal ────────────────────────────────────────────────────────

def signal_oob(tracked_files):
    """Find SQL files with INSERT. Returns [(sql_file,), ...].
    Only tracks file existence — SQL content is NOT locked (content may
    evolve during development). This prevents AI from silently deleting
    or renaming seed data files, while allowing legitimate schema/data
    changes."""
    result = []
    insert_re = re.compile(INSERT_RE, re.IGNORECASE)
    for tf in tracked_files:
        if fnmatch.fnmatch(tf, SQL_GLOB):
            try:
                with open(tf, 'r', encoding='utf-8') as f:
                    content = f.read()
                if insert_re.search(content):
                    result.append((tf,))
            except (OSError, UnicodeDecodeError):
                pass
    return sorted(result, key=lambda x: x[0])

# ── deps signal ────────────────────────────────────────────────────────

def signal_deps(tracked_files):
    """Parse dependency manifests."""
    return parse_deps(tracked_files)

# ── ports signal ──────────────────────────────────────────────────────

def signal_ports(tracked_files, env_data):
    """Extract port declarations from multiple sources."""
    return extract_ports(tracked_files, env_data)

# ── tokens signal ─────────────────────────────────────────────────────

def signal_tokens(env_data):
    """Derive token patterns from env data — real env files only.
    Skip .env.example / *.tpl / *.example — their CHANGE_ME placeholders
    would create spurious 'placeholder' mode entries alongside real values."""
    real_env = {}
    for env_file, entries in env_data.items():
        basename = os.path.basename(env_file)
        if 'example' in basename or 'tpl' in basename or 'template' in basename:
            continue
        real_env[env_file] = entries
    return derive_token_patterns(real_env)

# ── interfaces signal ─────────────────────────────────────────────────

def signal_interfaces(tracked_files):
    """Extract interface definitions from Go/TS/OpenAPI."""
    return extract_interfaces(tracked_files)

# ── idempotency signal (all profiles) ────────────────────────────────

def signal_idempotency(tracked_files, profile='loc'):
    """Scan deploy scripts/SQL/TF for idempotency rules.
    Each rule is triggered by actual file content, not just file extension.
    Projects without deploy scripts / TF / SQL -> empty rules -> SKIP.
    Scans ALL deploy-related .sh files (deploy-*.sh, deploy/*.sh, deploy/**/*.sh),
    not just top-level deploy-k8s.sh.
    Works for ANY profile (loc/k8s) — SQL idempotency applies universally;
    TF/deploy-script checks only trigger when those files exist.
    However, LOC profile skips all K8S-specific deploy/TF/kubectl checks.
    """
    rules = set()

    # LOC profile: only SQL idempotency (CREATE TABLE / INSERT), no deploy/TF/k8s checks
    if profile != 'k8s':
        sql_files = [f for f in tracked_files if fnmatch.fnmatch(f, SQL_GLOB)]
        has_create = False
        has_insert = False
        for sf in sql_files:
            try:
                with open(sf, 'r', encoding='utf-8') as f:
                    content = f.read()
                if re.search(r'CREATE\s+TABLE', content, re.IGNORECASE):
                    has_create = True
                if re.search(INSERT_WITHOUT_GUARD_RE, content, re.IGNORECASE):
                    has_insert = True
            except (OSError, UnicodeDecodeError):
                pass
        if has_create:
            rules.add(('sql_ddl', 'CREATE TABLE', 'require_if_not_exists'))
        if has_insert:
            rules.add(('sql_data', 'INSERT INTO', 'require_on_conflict_or_where_not_exists'))
        return sorted(rules, key=lambda x: x[0])

    # ── classify files ──
    sql_files = [f for f in tracked_files if fnmatch.fnmatch(f, SQL_GLOB)]
    # Only deploy/release/terraform/*.tf (maxdepth 1) — matches old k8s-doctor.sh.
    # Infra TF (deploy/infra/terraform/**) is shared infrastructure, not project-owned.
    tf_files = [
        f for f in tracked_files
        if f.endswith('.tf')
        and (
            f.startswith('deploy/release/terraform/')
            or (f.startswith('deploy/terraform/') and f.count('/') <= 2)
        )
        and f.count('/') <= 3
    ]
    # Only top-level deploy-k8s.sh — matches old k8s-doctor.sh scope.
    # Infra/site deploy scripts (deploy/infra/**, deploy/global/**, deploy/sites/**)
    # are not checked for idempotency rules; they have different lifecycle patterns.
    deploy_scripts = [
        f for f in tracked_files
        if re.match(DEPLOY_SCRIPT_RE, os.path.basename(f))
        and '/' not in f
    ]

    # ── SQL rules (k8s: only deploy-chain SQL, not example/test data) ──
    # For k8s profile, only check SQL files inside deploy/, migrations/, or
    # initial/ directories. Example/test SQL (e.g., app-zero-example/) should
    # NOT trigger idempotency rules — they are not part of the deploy chain.
    deploy_sql_prefixes = ('deploy/', 'migrations/', 'initial/', 'deploy/release/')
    deploy_sql_files = [
        f for f in sql_files
        if any(f.startswith(p) for p in deploy_sql_prefixes)
    ]

    has_create = False
    has_insert = False
    for sf in deploy_sql_files:
        try:
            with open(sf, 'r', encoding='utf-8') as f:
                content = f.read()
            if re.search(r'CREATE\s+TABLE', content, re.IGNORECASE):
                has_create = True
            if re.search(INSERT_WITHOUT_GUARD_RE, content, re.IGNORECASE):
                has_insert = True
        except (OSError, UnicodeDecodeError):
            pass
    if has_create:
        rules.add(('sql_ddl', 'CREATE TABLE', 'require_if_not_exists'))
    if has_insert:
        rules.add(('sql_data', 'INSERT INTO', 'require_on_conflict_or_where_not_exists'))

    # ── deploy script rules (scan ALL deploy-related .sh files) ──
    deploy_content = ''
    for ds in deploy_scripts:
        try:
            with open(ds, 'r', encoding='utf-8') as f:
                deploy_content += f.read() + '\n'
        except (OSError, UnicodeDecodeError):
            pass

    if deploy_content:
        # terraform apply plan-file check: look for 'terraform' + 'apply' + 'plan'
        if re.search(r'terraform.*apply', deploy_content, re.IGNORECASE) or re.search(r'plan.{0,20}file', deploy_content, re.IGNORECASE):
            rules.add(('tf_apply_plan', 'terraform apply', 'require_plan_file'))
        # terraform import check: look for 'import' near 'terraform' or 'adopt'
        if re.search(r'terraform.*import|adopt.*resource|import.*state', deploy_content, re.IGNORECASE):
            rules.add(('tf_adopt', 'terraform import', 'require_import_existing'))
        # secret upsert check: look for 'secret' + 'apply' or 'dry-run'
        if re.search(r'secret.*apply|apply.*secret|dry.run.*secret|k8s_apply_secret', deploy_content, re.IGNORECASE):
            rules.add(('secret_upsert', 'kubectl apply secret', 'require_dry_run'))
        # deploy order check (DDL -> data -> security)
        has_ddl_ref = bool(re.search(DEPLOY_DDL_RE, deploy_content, re.IGNORECASE))
        has_data_ref = bool(re.search(DEPLOY_DATA_RE, deploy_content, re.IGNORECASE))
        has_sec_ref = bool(re.search(DEPLOY_SECURITY_RE, deploy_content, re.IGNORECASE))
        if has_ddl_ref and has_data_ref:
            rules.add(('deploy_order', 'ddl_data_security', 'require_sequential'))
        # ── kubectl delete: simplified single-line guard check ──
        # RS cleanup (delete rs) is inherently safe — skip those.
        # Non-RS deletes need || true or 2>/dev/null guard on the same line.
        kd_lines = [l for l in deploy_content.split('\n')
                    if re.search(r'kubectl\s+delete', l, re.IGNORECASE)
                    and not re.search(r'kubectl\s+delete\s+rs\b', l, re.IGNORECASE)]
        if kd_lines:
            rules.add(('kubectl_delete', 'kubectl delete (non-rs)', 'require_guard_or_fail'))

        # ── rollout restart: just note presence (safe re-run) ──
        if re.search(ROLLOUT_RESTART_RE, deploy_content, re.IGNORECASE):
            rules.add(('rollout_restart', 'kubectl rollout restart', 'safe_rerun'))

        # ── deploy cross-verify (sub-script references exist) ──
        source_refs = re.findall(SOURCE_REF_RE, deploy_content, re.MULTILINE)
        if source_refs:
            rules.add(('deploy_cross_verify', 'source references', 'require_all_exist'))

    # ── verify_count: scan deploy-data-verify*.sh for less-than comparisons ──
    # = (exact) and >= (elastic) are both valid for post-deploy data verification.
    # Only < (-lt/-le) is wrong because data may have grown after initial deploy.
    verify_scripts = [
        f for f in tracked_files
        if re.match(VERIFY_SCRIPT_RE, os.path.basename(f))
        and f.startswith('deploy/')
    ]
    if verify_scripts:
        rules.add(('verify_count', 'deploy-data-verify', 'require_no_less_than'))

    # ── TF lifecycle rules ──
    tf_content = ''
    for tfp in tf_files:
        try:
            with open(tfp, 'r', encoding='utf-8') as f:
                tf_content += f.read() + '\n'
        except (OSError, UnicodeDecodeError):
            pass
    if tf_content:
        res_re = re.compile(TF_RESOURCE_RE)
        resource_types = set(res_re.findall(tf_content))
        if 'kubernetes_stateful_set_v1' in resource_types:
            rules.add(('tf_lifecycle', 'kubernetes_stateful_set_v1', 'require_ignore_changes'))
            rules.add(('sts_pvc', 'volumeClaimTemplates', 'require_standalone_pvc'))
        if 'kubernetes_deployment_v1' in resource_types:
            rules.add(('tf_lifecycle', 'kubernetes_deployment_v1', 'require_ignore_changes'))
        if 'kubernetes_secret_v1' in resource_types:
            rules.add(('tf_lifecycle', 'kubernetes_secret_v1', 'require_ignore_changes_or_placeholder'))

    return sorted(rules, key=lambda x: x[0])

# ── master signal collection ──────────────────────────────────────────

def collect_all_signals(tracked_files, config=None, profile='loc'):
    """Run all signal discoveries. Returns dict of dimension -> data.
    Profile controls which dimensions are active and how file-list is scoped.
    LOC: no code-idempotency dimension (returns empty -> SKIP).
    K8S: all dimensions including code-idempotency.
    """
    # Set project type context for project-type-aware noise filtering
    set_project_type(tracked_files)
    env_data = signal_env(tracked_files, config)
    result = {
        'file-list': signal_file_list(tracked_files, profile),
        'meta-env': env_data,
        'meta-deps': signal_deps(tracked_files),
        'file-hash': signal_content_hash(tracked_files),
        'file-oob': signal_oob(tracked_files),
        'meta-ports': signal_ports(tracked_files, env_data),
        'meta-tokens': signal_tokens(env_data),
        'code-interfaces': signal_interfaces(tracked_files),
    }
    # code-idempotency only for k8s profile
    if profile == 'k8s':
        result['code-idempotency'] = signal_idempotency(tracked_files, profile)
    else:
        result['code-idempotency'] = []  # empty -> SKIP for loc/mob/win
    return result

# ── utility ───────────────────────────────────────────────────────────

def _sha256_file(filepath):
    try:
        with open(filepath, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None
