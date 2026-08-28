"""
mxt_doctor_scan.py - Scanner: read baseline -> re-parse current files -> compare -> report.
Read-only. Never modifies project files or baseline configs.
"""
import os, re, hashlib, subprocess, fnmatch
from mxt_doctor_constants import *
from mxt_doctor_signals import (
    get_tracked_files, collect_all_signals, detect_injected_vars,
)
from mxt_doctor_report import write_report
from mxt_doctor_parsers import parse_env_file, discover_env_files
from mxt_doctor_extractors import extract_ports, derive_token_patterns, extract_interfaces

SHA256_RE = re.compile(r'^[0-9a-f]{64}$')


def scan(cwd='.', profile=None):
    """Run a full doctor scan against the baseline."""
    doctor_dir = os.path.join(cwd, '.r2mo', 'doctor')
    if not os.path.isdir(doctor_dir):
        print('ERROR: .r2mo/doctor/ not found. Run "mxt doctor --generate" first.')
        return False

    config = _load_config(doctor_dir)

    # Resolve profile
    if profile is None:
        profile = config.get('default_profile')
        if not profile:
            print('ERROR: no default_profile in config.json')
            return False
    elif profile == '':
        _list_profiles(doctor_dir)
        return True

    profile_dir = os.path.join(doctor_dir, profile)
    if not os.path.isdir(profile_dir):
        print(f'ERROR: profile directory not found: .r2mo/doctor/{profile}/')
        return False

    project_name = os.path.basename(os.path.abspath(cwd))
    tracked_files = get_tracked_files(cwd)
    current_signals = collect_all_signals(tracked_files, config, profile)
    injected = detect_injected_vars(current_signals.get('meta-env', {}))

    from mxt_doctor_report import Report
    report = Report(project_name, profile)
    section_data = []

    # ── branch check ──
    report.section_start('branch')
    _check_branch(config, cwd, report)
    section_data.append(('branch', report.section_end()))

    # ── file-list ──
    report.section_start('file-list')
    _scan_file_list(profile_dir, cwd, report)
    section_data.append(('file-list', report.section_end()))

    # ── file-hash ──
    report.section_start('file-hash')
    _scan_file_hash(profile_dir, cwd, report)
    section_data.append(('file-hash', report.section_end()))

    # ── file-oob ──
    report.section_start('file-oob')
    _scan_file_oob(profile_dir, cwd, report)
    section_data.append(('file-oob', report.section_end()))

    # ── meta-env ──
    report.section_start('meta-env')
    _scan_meta_env(profile_dir, cwd, report, injected)
    section_data.append(('meta-env', report.section_end()))

    # ── meta-deps ──
    report.section_start('meta-deps')
    _scan_meta_deps(profile_dir, cwd, report, current_signals)
    section_data.append(('meta-deps', report.section_end()))

    # ── meta-ports ──
    report.section_start('meta-ports')
    _scan_meta_ports(profile_dir, cwd, report, current_signals)
    section_data.append(('meta-ports', report.section_end()))

    # ── meta-tokens ──
    report.section_start('meta-tokens')
    _scan_meta_tokens(profile_dir, cwd, report, current_signals)
    section_data.append(('meta-tokens', report.section_end()))

    # ── code-interfaces ──
    report.section_start('code-interfaces')
    _scan_code_interfaces(profile_dir, cwd, report, current_signals)
    section_data.append(('code-interfaces', report.section_end()))

    # ── code-idempotency ──
    report.section_start('code-idempotency')
    _scan_code_idempotency(profile_dir, cwd, report)
    section_data.append(('code-idempotency', report.section_end()))

    from datetime import datetime
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    md = report.to_markdown(timestamp, section_data)
    write_report(cwd, project_name, profile, md)

    print(f'\n  PASS={report.pass_count}  FAIL={report.fail_count}  WARN={report.warn_count}  SKIP={report.skip_count}')
    return report.fail_count == 0


# ── branch ────────────────────────────────────────────────────────────

def _check_branch(config, cwd, report):
    sec_lines = []
    expected = config.get('expected_branch', '')
    if not expected:
        # No expected_branch set — skip branch check
        report.skip('branch: no expected_branch in config.json')
        sec_lines.append('⊘ SKIP branch: no expected_branch set')
        return sec_lines
    try:
        result = subprocess.run(
            ['git', 'branch', '--show-current'], cwd=cwd,
            capture_output=True, text=True, encoding='utf-8'
        )
        branch = result.stdout.strip() if result.returncode == 0 else 'unknown'
    except Exception:
        branch = 'unknown'
    if branch == expected:
        report.ok(f'branch: {branch}')
        sec_lines.append(f'✅ PASS branch: {branch}')
    else:
        report.fail(f'branch: {branch} (expected {expected})')
        sec_lines.append(f'❌ FAIL branch: {branch} (expected {expected})')
    return sec_lines


# ── file-list ─────────────────────────────────────────────────────────

def _scan_file_list(profile_dir, cwd, report):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'file-list.conf')
    if not os.path.isfile(conf_path):
        report.skip('file-list.conf not found')
        sec_lines.append('⊘ SKIP file-list.conf not found')
        return sec_lines
    lines = _read_conf(conf_path)
    for line in lines:
        if line.startswith('@'):
            path = line[1:].strip()
            if os.path.exists(os.path.join(cwd, path)):
                report.ok(f'@{path} (optional, exists)')
                sec_lines.append(f'✅ PASS @{path} (optional, exists)')
            else:
                report.skip(f'@{path} (optional, not found)')
                sec_lines.append(f'⊘ SKIP @{path} (optional, not found)')
        elif line.startswith('!'):
            pattern = line[1:].strip()
            matches = _glob_match(cwd, pattern)
            if matches:
                report.fail(f'!{pattern} (forbidden file exists: {", ".join(matches[:3])})')
                sec_lines.append(f'❌ FAIL !{pattern} (forbidden file exists)')
            else:
                report.ok(f'!{pattern} (forbidden, not present)')
                sec_lines.append(f'✅ PASS !{pattern} (forbidden, not present)')
        else:
            parts = line.split('\t')
            path = parts[0].strip()
            full = os.path.join(cwd, path)
            if not os.path.exists(full):
                report.fail(f'{path} (missing)')
                sec_lines.append(f'❌ FAIL {path} (missing)')
            elif not _is_git_tracked(cwd, path):
                report.fail(f'{path} (exists but not git-tracked)')
                sec_lines.append(f'❌ FAIL {path} (not git-tracked)')
            elif len(parts) == 2:
                # content-locked mode: verify sha256
                sha = parts[1]
                current_sha = _sha256_file(full)
                if current_sha == sha:
                    report.ok(f'{path} (content-locked, sha256: {sha[:12]}...)')
                    sec_lines.append(f'✅ PASS {path} (content-locked: {sha[:12]}...)')
                else:
                    report.fail(f'{path} (content drifted: {sha[:12]}... -> {current_sha[:12]}...)')
                    sec_lines.append(f'❌ FAIL {path} (content drifted)')
            else:
                # existence-only mode (default)
                report.ok(f'{path} (tracked, exists)')
                sec_lines.append(f'✅ PASS {path} (tracked, exists)')
    return sec_lines


# ── file-hash ─────────────────────────────────────────────────────────

def _scan_file_hash(profile_dir, cwd, report):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'file-hash.conf')
    if not os.path.isfile(conf_path):
        report.skip('file-hash.conf not found')
        sec_lines.append('⊘ SKIP file-hash.conf not found')
        return sec_lines
    # Flexible lock: each entry can be 1-field (existence-only) or
    # 2-field (content-locked with sha256).
    # - 1-field: path only → check existence + git-tracked
    # - 2-field: path + sha256 → check content hash
    for line in _read_conf(conf_path):
        parts = line.split('\t')
        path = parts[0]
        full = os.path.join(cwd, path)
        if not os.path.exists(full):
            report.fail(f'{path} (file missing)')
            sec_lines.append(f'❌ FAIL {path} (file missing)')
            continue
        if len(parts) == 1:
            # existence-only mode
            if not _is_git_tracked(cwd, path):
                report.fail(f'{path} (exists but not git-tracked)')
                sec_lines.append(f'❌ FAIL {path} (not git-tracked)')
            else:
                report.ok(f'{path} (existence-only, tracked)')
                sec_lines.append(f'✅ PASS {path} (existence-only)')
        elif len(parts) == 2:
            # content-locked mode
            sha = parts[1]
            current_sha = _sha256_file(full)
            if current_sha == sha:
                report.ok(f'{path} (sha256: {sha[:12]}...)')
                sec_lines.append(f'✅ PASS {path} (sha256: {sha[:12]}...)')
            else:
                report.fail(f'{path} (sha256 drifted: {sha[:12]}... -> {current_sha[:12]}...)')
                sec_lines.append(f'❌ FAIL {path} (sha256 drifted)')
    return sec_lines


# ── file-oob ──────────────────────────────────────────────────────────

def _scan_file_oob(profile_dir, cwd, report):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'file-oob.conf')
    if not os.path.isfile(conf_path):
        report.skip('file-oob.conf not found')
        sec_lines.append('⊘ SKIP file-oob.conf not found')
        return sec_lines
    # Flexible lock: each entry can be 1-field (existence-only, default)
    # or 2-field (content-locked with sha256, manually upgraded by SKILL).
    # - 1-field: path only → check existence + git-tracked
    # - 2-field: path + sha256 → check content hash
    for line in _read_conf(conf_path):
        parts = line.split('\t')
        path = parts[0].strip()
        full = os.path.join(cwd, path)
        if not os.path.exists(full):
            report.fail(f'{path} (SQL file missing)')
            sec_lines.append(f'❌ FAIL {path} (SQL file missing)')
            continue
        if not _is_git_tracked(cwd, path):
            report.fail(f'{path} (exists but not git-tracked)')
            sec_lines.append(f'❌ FAIL {path} (not git-tracked)')
            continue
        if len(parts) == 1:
            # existence-only mode (default for SQL seed files)
            report.ok(f'{path} (existence-only, tracked)')
            sec_lines.append(f'✅ PASS {path} (existence-only)')
        elif len(parts) == 2:
            # content-locked mode (manually upgraded)
            sha = parts[1]
            current_sha = _sha256_file(full)
            if current_sha == sha:
                report.ok(f'{path} (content-locked, sha256: {sha[:12]}...)')
                sec_lines.append(f'✅ PASS {path} (content-locked: {sha[:12]}...)')
            else:
                report.fail(f'{path} (content drifted: {sha[:12]}... -> {current_sha[:12]}...)')
                sec_lines.append(f'❌ FAIL {path} (content drifted)')
    return sec_lines


# ── meta-env ──────────────────────────────────────────────────────────

def _scan_meta_env(profile_dir, cwd, report, injected):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'meta-env.conf')
    if not os.path.isfile(conf_path):
        report.skip('meta-env.conf not found')
        sec_lines.append('⊘ SKIP meta-env.conf not found')
        return sec_lines
    baseline = _read_env_conf(conf_path)  # [(env_file, key, metadata)]
    # Re-parse current env files into per-file structure: {env_file: {key: val}}
    tracked = get_tracked_files(cwd)
    env_files = discover_env_files(tracked)
    current_by_file = {}  # {env_file: {key: val}}
    all_names = set()
    for ef in env_files:
        basename = os.path.basename(ef)
        is_template = 'example' in basename or 'tpl' in basename or 'template' in basename
        file_vars = {}
        for key, val in parse_env_file(ef):
            all_names.add(key)
            if not is_template:
                file_vars[key] = val
        current_by_file[ef] = file_vars

    # Collect baseline names (non-injected, non-template) and injected/template names
    baseline_keys = set(k for _, k, v in baseline if not v.get('injected') and not v.get('template'))
    injected_keys = set(k for _, k, v in baseline if v.get('injected') or v.get('template'))
    current_keys = all_names

    # Name drift
    missing_names = baseline_keys - current_keys
    extra_names = current_keys - baseline_keys - injected_keys
    for name in sorted(missing_names):
        report.fail(f'{name} (name missing from current env)')
        sec_lines.append(f'❌ FAIL {name} (name missing)')
    for name in sorted(extra_names):
        report.warn(f'{name} (extra in current env)')
        sec_lines.append(f'⚠️ WARN {name} (extra in current env)')

    # Value drift — per-file comparison
    # Group baseline by env_file
    from collections import defaultdict
    baseline_by_file = defaultdict(list)
    for ef, key, meta in baseline:
        baseline_by_file[ef].append((key, meta))

    for env_file in sorted(baseline_by_file.keys()):
        file_vars = current_by_file.get(env_file, {})
        for key, meta in baseline_by_file[env_file]:
            if meta.get('injected'):
                if key in current_keys:
                    report.ok(f'{key} (injected, name exists)')
                    sec_lines.append(f'✅ PASS {key} (injected, name exists)')
                else:
                    report.warn(f'{key} (injected, name missing)')
                    sec_lines.append(f'⚠️ WARN {key} (injected, name missing)')
                continue
            if meta.get('template'):
                if key in current_keys:
                    report.ok(f'{key} (template, name exists)')
                    sec_lines.append(f'✅ PASS {key} (template, name exists)')
                else:
                    report.fail(f'{key} (template, name missing)')
                    sec_lines.append(f'❌ FAIL {key} (template, name missing)')
                continue
            current_val = file_vars.get(key)
            if current_val is None:
                if key not in current_keys:
                    continue  # already reported in name drift
                # Key exists in another env file but not this one — not a drift
                continue
            if current_val == meta['value']:
                report.ok(f'{key}={current_val}')
                sec_lines.append(f'✅ PASS {key}={current_val}')
            else:
                report.fail(f'{key}: value drifted (baseline: {meta["value"][:40]}, current: {current_val[:40]})')
                sec_lines.append(f'❌ FAIL {key}: value drifted')
    return sec_lines


# ── meta-deps ─────────────────────────────────────────────────────────

_MANIFEST_ECOSYSTEM = {
    'go.mod': 'go',
    'package.json': 'npm',
    'Cargo.toml': 'cargo',
    'pom.xml': 'maven',
    'build.gradle': 'gradle',
    'pyproject.toml': 'python',
}

def _dep_ecosystem(manifest_path):
    """Return ecosystem label from manifest file basename."""
    basename = os.path.basename(manifest_path)
    return _MANIFEST_ECOSYSTEM.get(basename, 'unknown')

def _scan_meta_deps(profile_dir, cwd, report, current_signals):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'meta-deps.conf')
    if not os.path.isfile(conf_path):
        report.skip('meta-deps.conf not found')
        sec_lines.append('⊘ SKIP meta-deps.conf not found')
        return sec_lines
    baseline = {}
    for line in _read_conf(conf_path):
        parts = line.split('\t')
        if len(parts) == 3:
            baseline[(parts[0], parts[1])] = parts[2]
    current_list = current_signals.get('meta-deps', [])
    current = {}
    for m, n, v in current_list:
        current[(m, n)] = v

    for key, ver in sorted(baseline.items()):
        eco = _dep_ecosystem(key[0])
        label = f'[{eco}] {key[0]}:{key[1]}'
        if key not in current:
            report.fail(f'{label} (missing dep)')
            sec_lines.append(f'❌ FAIL {label} (missing)')
        elif current[key] != ver:
            report.fail(f'{label} version drift ({ver} -> {current[key]})')
            sec_lines.append(f'❌ FAIL {label} version drift ({ver} -> {current[key]})')
        else:
            report.ok(f'{label}={ver}')
            sec_lines.append(f'✅ PASS {label}={ver}')
    for key in sorted(set(current.keys()) - set(baseline.keys())):
        eco = _dep_ecosystem(key[0])
        label = f'[{eco}] {key[0]}:{key[1]}'
        report.warn(f'{label} (extra dep: {current[key]})')
        sec_lines.append(f'⚠️ WARN {label} (extra: {current[key]})')
    return sec_lines


# ── meta-ports ────────────────────────────────────────────────────────

def _scan_meta_ports(profile_dir, cwd, report, current_signals):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'meta-ports.conf')
    if not os.path.isfile(conf_path):
        report.skip('meta-ports.conf not found')
        sec_lines.append('⊘ SKIP meta-ports.conf not found')
        return sec_lines
    baseline = set()
    for line in _read_conf(conf_path):
        parts = line.split('\t')
        if len(parts) == 3:
            baseline.add((parts[0], parts[1], parts[2]))
    current = set()
    for s, p, c in current_signals.get('meta-ports', []):
        current.add((s, p, c))
    for item in sorted(baseline):
        if item in current:
            report.ok(f'{item[0]}:{item[2]}={item[1]}')
            sec_lines.append(f'✅ PASS {item[0]}:{item[2]}={item[1]}')
        else:
            report.fail(f'{item[0]}:{item[2]}={item[1]} (port changed or missing)')
            sec_lines.append(f'❌ FAIL {item[0]}:{item[2]}={item[1]} (changed)')
    for item in sorted(current - baseline):
        report.warn(f'{item[0]}:{item[2]}={item[1]} (new port)')
        sec_lines.append(f'⚠️ WARN {item[0]}:{item[2]}={item[1]} (new)')
    return sec_lines


# ── meta-tokens ───────────────────────────────────────────────────────

def _scan_meta_tokens(profile_dir, cwd, report, current_signals):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'meta-tokens.conf')
    if not os.path.isfile(conf_path):
        report.skip('meta-tokens.conf not found')
        sec_lines.append('⊘ SKIP meta-tokens.conf not found')
        return sec_lines
    baseline = {}
    for line in _read_conf(conf_path):
        parts = line.split('\t')
        if len(parts) == 6:
            baseline[parts[0]] = {
                'mode': parts[1], 'prefix': parts[2],
                'min': parts[3], 'max': parts[4], 'charset': parts[5],
            }
    current = {}
    for k, m, pfx, mn, mx, cs in current_signals.get('meta-tokens', []):
        current[k] = {'mode': m, 'prefix': pfx, 'min': mn, 'max': mx, 'charset': cs}

    for key, meta in sorted(baseline.items()):
        if key not in current:
            report.fail(f'{key} (token not found in current env)')
            sec_lines.append(f'❌ FAIL {key} (token missing)')
            continue
        cur = current[key]
        if meta['mode'] in ('allow_empty', 'placeholder', 'env_ref'):
            report.ok(f'{key} (mode={meta["mode"]}, skip value check)')
            sec_lines.append(f'✅ PASS {key} (mode={meta["mode"]})')
        elif cur['mode'] == meta['mode']:
            report.ok(f'{key} (mode={meta["mode"]})')
            sec_lines.append(f'✅ PASS {key} (mode={meta["mode"]})')
        else:
            report.fail(f'{key} (mode drift: {meta["mode"]} -> {cur["mode"]})')
            sec_lines.append(f'❌ FAIL {key} (mode drift: {meta["mode"]} -> {cur["mode"]})')
    return sec_lines


# ── code-interfaces ───────────────────────────────────────────────────

def _scan_code_interfaces(profile_dir, cwd, report, current_signals):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'code-interfaces.conf')
    if not os.path.isfile(conf_path):
        report.skip('code-interfaces.conf not found')
        sec_lines.append('⊘ SKIP code-interfaces.conf not found')
        return sec_lines
    # Flexible lock: 3 fields = existence-only (name, source, lang)
    #                 4 fields = content-locked (name, source, lang, hash)
    baseline_existence = set()  # (name, lang) for 3-field entries
    baseline_hashed = {}       # (name, lang) -> hash for 4-field entries
    for line in _read_conf(conf_path):
        parts = line.split('\t')
        if len(parts) == 3:
            baseline_existence.add((parts[0], parts[2]))
        elif len(parts) == 4:
            baseline_hashed[(parts[0], parts[2])] = parts[3]
    current = {}
    for n, s, l, h in current_signals.get('code-interfaces', []):
        current[(n, l)] = h

    # Check content-locked entries (4-field)
    for key, h in sorted(baseline_hashed.items()):
        if key not in current:
            report.fail(f'{key[0]} ({key[1]}) (interface missing)')
            sec_lines.append(f'❌ FAIL {key[0]} ({key[1]}) (missing)')
        elif current[key] == h:
            report.ok(f'{key[0]} ({key[1]}) (content-locked, hash: {h[:12]}...)')
            sec_lines.append(f'✅ PASS {key[0]} ({key[1]}) (content-locked)')
        else:
            report.fail(f'{key[0]} ({key[1]}) (field hash drifted)')
            sec_lines.append(f'❌ FAIL {key[0]} ({key[1]}) (field hash drifted)')
    # Check existence-only entries (3-field)
    current_keys = set(current.keys())
    for key in sorted(baseline_existence):
        if key in current_keys:
            report.ok(f'{key[0]} ({key[1]}) (existence-only)')
            sec_lines.append(f'✅ PASS {key[0]} ({key[1]}) (existence-only)')
        else:
            report.fail(f'{key[0]} ({key[1]}) (interface missing)')
            sec_lines.append(f'❌ FAIL {key[0]} ({key[1]}) (missing)')
    return sec_lines


# ── code-idempotency ──────────────────────────────────────────────────
def _scan_code_idempotency(profile_dir, cwd, report):
    sec_lines = []
    conf_path = os.path.join(profile_dir, 'code-idempotency.conf')
    if not os.path.isfile(conf_path):
        report.skip('code-idempotency.conf not found')
        sec_lines.append('⊘ SKIP code-idempotency.conf not found')
        return sec_lines
    rules = []
    for line in _read_conf(conf_path):
        parts = line.split('\t')
        if len(parts) == 3:
            rules.append((parts[0], parts[1], parts[2]))

    tracked = get_tracked_files(cwd)
    for check_type, pattern, expected in rules:
        violations = _check_idempotency_rule(check_type, pattern, expected, tracked, cwd)
        if violations:
            for v in violations[:5]:
                report.fail(f'{check_type}: {v}')
                sec_lines.append(f'❌ FAIL {check_type}: {v}')
        else:
            report.ok(f'{check_type}: {pattern} ({expected})')
            sec_lines.append(f'✅ PASS {check_type}: {pattern} ({expected})')
    return sec_lines


def _check_idempotency_rule(check_type, pattern, expected, tracked, cwd):
    """Check one idempotency rule against current project files.
    Returns list of violation strings (empty = PASS)."""
    violations = []

    if check_type == 'sql_ddl':
        # All SQL files with CREATE TABLE must use IF NOT EXISTS
        # Strip comment lines (--) before checking
        bare_re = re.compile(BARE_CREATE_TABLE_RE, re.IGNORECASE)
        for tf in tracked:
            if fnmatch.fnmatch(tf, SQL_GLOB):
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        raw = f.read()
                    # Strip SQL comments (-- to end of line)
                    lines = [l for l in raw.split('\n') if not l.strip().startswith('--')]
                    content = '\n'.join(lines)
                    # Also skip files that only reference CREATE TABLE in strings/functions
                    if bare_re.search(content):
                        violations.append(f'{tf}: bare CREATE TABLE without IF NOT EXISTS')
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'sql_data':
        # INSERT INTO must have ON CONFLICT or WHERE NOT EXISTS guard
        insert_re = re.compile(INSERT_WITHOUT_GUARD_RE, re.IGNORECASE)
        conflict_re = re.compile(ON_CONFLICT_RE, re.IGNORECASE)
        where_ne_re = re.compile(WHERE_NOT_EXISTS_RE, re.IGNORECASE)
        for tf in tracked:
            if fnmatch.fnmatch(tf, SQL_GLOB):
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        content = f.read()
                    if insert_re.search(content) and not conflict_re.search(content) and not where_ne_re.search(content):
                        violations.append(f'{tf}: INSERT without ON CONFLICT or WHERE NOT EXISTS')
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'kubectl_delete':
        # Non-RS kubectl delete needs || true or 2>/dev/null guard (single-line)
        # Only check top-level deploy-*.sh and deploy/ scripts (same scope as signal)
        for tf in tracked:
            if tf.endswith('.sh') and (
                (re.match(DEPLOY_SCRIPT_RE, os.path.basename(tf)) and '/' not in tf)
                or (tf.startswith('deploy/') and tf.count('/') <= 1)
            ):
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        for line in f:
                            if re.search(r'kubectl\s+delete', line, re.IGNORECASE):
                                if not re.search(r'kubectl\s+delete\s+rs\b', line, re.IGNORECASE):
                                    if not re.search(r'\|\|\s*true|2>/dev/null', line, re.IGNORECASE):
                                        violations.append(f'{tf}: unguarded kubectl delete (non-rs)')
                                        break
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'tf_lifecycle':
        # Check per-resource: find each resource block of the given type and
        # verify it has a lifecycle { ignore_changes } block within it.
        # Only scan project-owned TF files (deploy/release/terraform/ and
        # deploy/terraform/ at maxdepth 2-3) — same scope as signal generation.
        # Infra TF (deploy/infra/terraform/**) is shared infrastructure, not
        # project-owned, so it is excluded from lifecycle checks.
        for tf in tracked:
            if tf.endswith('.tf') and (
                tf.startswith('deploy/release/terraform/')
                or (tf.startswith('deploy/terraform/') and tf.count('/') <= 2)
            ) and tf.count('/') <= 3:
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        content = f.read()
                    # Find all resource blocks of the matching type
                    # Pattern: resource "TYPE" "NAME" { ... }  (matching braces)
                    res_pattern = re.compile(
                        r'resource\s+"' + re.escape(pattern) + r'"\s+"(\w+)"\s*\{',
                        re.IGNORECASE
                    )
                    for m in res_pattern.finditer(content):
                        res_name = m.group(1)
                        # Extract the resource block (find matching closing brace)
                        start = m.end() - 1  # position of opening {
                        depth = 0
                        block_end = start
                        for i in range(start, len(content)):
                            if content[i] == '{':
                                depth += 1
                            elif content[i] == '}':
                                depth -= 1
                                if depth == 0:
                                    block_end = i
                                    break
                        block = content[start:block_end+1]
                        if not re.search(TF_IGNORE_CHANGES_RE, block, re.IGNORECASE):
                            # For secrets: placeholder-managed secrets don't need ignore_changes
                            if pattern == 'kubernetes_secret_v1':
                                if re.search(r'placeholder|base64encode.*replace', block, re.IGNORECASE):
                                    continue
                            violations.append(f'{tf}: {pattern} "{res_name}" without ignore_changes')
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'tf_apply_plan':
        # terraform apply should use saved plan file, not bare -auto-approve
        # Only check top-level deploy-*.sh (same scope as signal generation)
        for tf in tracked:
            if tf.endswith('.sh') and re.match(DEPLOY_SCRIPT_RE, os.path.basename(tf)) and '/' not in tf:
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        content = f.read()
                    if re.search(r'terraform\s+apply\s+.*-auto-approve', content, re.IGNORECASE):
                        if not re.search(r'tf_adopt_resources|delete.*deploy.*--wait|delete.*deploy.*--timeout', content, re.IGNORECASE):
                            violations.append(f'{tf}: terraform apply -auto-approve without tf_adopt or delete-then-recreate')
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'tf_adopt':
        # Only check top-level deploy-k8s.sh — same scope as signal generation.
        # Infra sub-scripts (deploy/infra/**) use terraform apply in different
        # contexts (plan, etc.) and are not project-owned deploy scripts.
        for tf in tracked:
            if tf == 'deploy-k8s.sh':
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        content = f.read()
                    if re.search(r'terraform\s+apply', content, re.IGNORECASE):
                        if not re.search(r'tf_adopt_resources|terraform\s+import', content, re.IGNORECASE):
                            # Check if it uses delete-then-recreate pattern
                            if not re.search(r'delete.*deploy.*--wait|delete.*deploy.*--timeout', content, re.IGNORECASE):
                                violations.append(f'{tf}: terraform apply without tf_adopt/import (may fail on re-deploy)')
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'secret_upsert':
        # Secrets should use dry-run+apply pattern (idempotent upsert)
        # Only check top-level deploy-*.sh (same scope as signal generation)
        for tf in tracked:
            if tf.endswith('.sh') and re.match(DEPLOY_SCRIPT_RE, os.path.basename(tf)) and '/' not in tf:
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        content = f.read()
                    if re.search(r'k8s_apply_secret|create\s+secret.*--dry-run|kubectl\s+apply.*secret', content, re.IGNORECASE):
                        pass  # has idempotent secret pattern
                    elif re.search(r'kubernetes_secret_v1', content, re.IGNORECASE):
                        pass  # TF-managed secret
                        # check if tf_adopt covers it
                        if not re.search(r'tf_adopt_resources.*secret|kubernetes_secret_v1.*secret', content, re.IGNORECASE):
                            # Check TF files for ignore_changes = [data]
                            tf_has_ignore = False
                            for tf2 in tracked:
                                if tf2.endswith('.tf'):
                                    try:
                                        with open(os.path.join(cwd, tf2), 'r', encoding='utf-8') as f2:
                                            tf2_content = f2.read()
                                        if re.search(r'kubernetes_secret_v1', tf2_content, re.IGNORECASE):
                                            if re.search(r'ignore_changes.*data', tf2_content, re.IGNORECASE):
                                                tf_has_ignore = True
                                                break
                                    except (OSError, UnicodeDecodeError):
                                        pass
                            if not tf_has_ignore:
                                violations.append(f'{tf}: secret management without dry-run or TF ignore_changes=[data]')
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'rollout_restart':
        # rollout restart is inherently safe (idempotent) — always PASS
        pass

    elif check_type == 'deploy_order':
        # DDL -> data -> security must appear in correct order (by line number)
        # Only check top-level deploy-*.sh (same scope as signal generation)
        for tf in tracked:
            if tf.endswith('.sh') and re.match(DEPLOY_SCRIPT_RE, os.path.basename(tf)) and '/' not in tf:
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    ddl_line = data_line = sec_line = None
                    for i, line in enumerate(lines, 1):
                        if not line.strip().startswith('#'):
                            if re.search(DEPLOY_DDL_RE, line, re.IGNORECASE) and ddl_line is None:
                                ddl_line = i
                            if re.search(DEPLOY_DATA_RE, line, re.IGNORECASE) and data_line is None:
                                data_line = i
                            if re.search(DEPLOY_SECURITY_RE, line, re.IGNORECASE) and sec_line is None:
                                sec_line = i
                    if ddl_line and data_line and sec_line:
                        if ddl_line == data_line == sec_line:
                            # Loop mode: all 3 on same line — check textual order
                            loop_line = lines[ddl_line - 1]
                            ddl_pos = loop_line.lower().find('deploy-ddl')
                            data_pos = loop_line.lower().find('deploy-data')
                            sec_pos = loop_line.lower().find('deploy-security')
                            if not (0 <= ddl_pos < data_pos < sec_pos):
                                violations.append(f'{tf}: DDL->data->security order broken (loop L{ddl_line})')
                        elif not (ddl_line < data_line < sec_line):
                            violations.append(f'{tf}: DDL->data->security order broken (L{ddl_line},L{data_line},L{sec_line})')
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'deploy_cross_verify':
        # All source/bash references in deploy scripts must resolve to existing files
        # Only check top-level deploy-*.sh (same scope as signal generation)
        for tf in tracked:
            if tf.endswith('.sh') and (
                (re.match(DEPLOY_SCRIPT_RE, os.path.basename(tf)) and '/' not in tf)
                or (tf.startswith('deploy/') and tf.count('/') <= 1)
            ):
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        content = f.read()
                    refs = re.findall(SOURCE_REF_RE, content, re.MULTILINE)
                    for ref in refs:
                        ref = ref.strip().strip('"\'')
                        # Resolve shell variables: $VAR, ${VAR}, $SCRIPT_DIR, etc.
                        # Extract the basename after the last /
                        ref_clean = ref
                        for var_pat in [r'\$\{?(\w+)\}?', r'\$(\w+)']:
                            ref_clean = re.sub(var_pat, '', ref_clean)
                        ref_clean = ref_clean.lstrip('/')
                        # Get just the filename for matching
                        ref_basename = os.path.basename(ref_clean)
                        if not ref_basename:
                            continue
                        # Try to find the file by basename in the project
                        script_dir = os.path.dirname(tf)
                        candidates = [
                            os.path.join(cwd, ref_clean),
                            os.path.join(cwd, script_dir, ref_clean),
                            os.path.join(cwd, script_dir, ref_basename),
                        ]
                        # Also search tracked files for matching basename
                        found = any(os.path.exists(c) for c in candidates)
                        if not found:
                            # Last resort: check if any tracked file ends with this basename
                            for tf2 in tracked:
                                if os.path.basename(tf2) == ref_basename:
                                    found = True
                                    break
                        if not found:
                            violations.append(f'{tf}: referenced script not found: {ref}')
                except (OSError, UnicodeDecodeError):
                    pass

    elif check_type == 'verify_count':
        # Scan deploy-data-verify*.sh for less-than comparisons.
        # = (exact) and >= (elastic) are both valid; only < (-lt/-le) is FAIL.
        verify_scripts = [
            tf for tf in tracked
            if re.match(VERIFY_SCRIPT_RE, os.path.basename(tf))
            and tf.startswith('deploy/')
        ]
        lt_re = re.compile(VERIFY_LT_RE)
        eq_re = re.compile(VERIFY_EQ_RE)
        ge_re = re.compile(VERIFY_GE_RE)
        for vs in verify_scripts:
            try:
                with open(os.path.join(cwd, vs), 'r', encoding='utf-8') as f:
                    vs_content = f.read()
                lt_matches = lt_re.findall(vs_content)
                if lt_matches:
                    violations.append(f'{vs}: {len(lt_matches)} less-than (<) comparison(s) — may fail on re-deploy with grown data')
            except (OSError, UnicodeDecodeError):
                pass

    elif check_type == 'sts_pvc':
        # StatefulSet should use volumeClaimTemplates or have standalone PVC
        # Same TF scope as tf_lifecycle (project-owned only)
        for tf in tracked:
            if tf.endswith('.tf') and (
                tf.startswith('deploy/release/terraform/')
                or (tf.startswith('deploy/terraform/') and tf.count('/') <= 2)
            ) and tf.count('/') <= 3:
                try:
                    with open(os.path.join(cwd, tf), 'r', encoding='utf-8') as f:
                        content = f.read()
                    if re.search(r'kubernetes_stateful_set_v1', content, re.IGNORECASE):
                        has_vct = re.search(r'volume_claim_template', content, re.IGNORECASE)
                        has_pvc = re.search(r'kubernetes_persistent_volume_claim_v1', content, re.IGNORECASE)
                        # Also check other TF files in same directory
                        if not has_vct and not has_pvc:
                            tf_dir = os.path.dirname(tf)
                            for tf2 in tracked:
                                if tf2.endswith('.tf') and os.path.dirname(tf2) == tf_dir and tf2 != tf:
                                    try:
                                        with open(os.path.join(cwd, tf2), 'r', encoding='utf-8') as f2:
                                            if re.search(r'kubernetes_persistent_volume_claim_v1', f2.read(), re.IGNORECASE):
                                                has_pvc = True
                                                break
                                    except (OSError, UnicodeDecodeError):
                                        pass
                        if not has_vct and not has_pvc:
                            violations.append(f'{tf}: StatefulSet without volumeClaimTemplates or standalone PVC')
                except (OSError, UnicodeDecodeError):
                    pass

    return violations


# ── utilities ─────────────────────────────────────────────────────────

def _load_config(doctor_dir):
    import json
    path = os.path.join(doctor_dir, 'config.json')
    if os.path.isfile(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return dict(CONFIG_JSON_TEMPLATE)

def _list_profiles(doctor_dir):
    print('Available profiles:')
    for entry in sorted(os.listdir(doctor_dir)):
        full = os.path.join(doctor_dir, entry)
        if os.path.isdir(full) and not entry.startswith('.') and entry != 'verify':
            conf_count = sum(1 for f in os.listdir(full) if f.endswith('.conf'))
            print(f'  {entry} ({conf_count} configs)')

def _read_conf(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.read().splitlines()
        return [l for l in lines if l.strip() and not l.strip().startswith('#')]
    except OSError:
        return []

def _read_kv(path, expected_fields):
    result = []
    for line in _read_conf(path):
        parts = line.split('\t')
        if len(parts) >= expected_fields:
            result.append(parts[:expected_fields])
    return result

def _read_env_conf(path):
    """Parse meta-env.conf. Returns list of (env_file, key, metadata).
    Preserves the # env_file header grouping so per-file value comparison works."""
    result = []
    current_file = ''
    for line in _read_conf(path):
        if line.startswith('# '):
            # File header: "# path/to/.env"
            current_file = line[2:].strip()
            continue
        if line.startswith('#'):
            continue
        injected = '# injected' in line
        template = '# template' in line
        secrets = '# secrets' in line
        clean = line.replace('# injected', '').replace('# template', '').replace('# secrets', '').strip()
        if '=' in clean:
            key, val = clean.split('=', 1)
            result.append((current_file, key.strip(), {
                'value': val.strip(),
                'injected': injected,
                'template': template,
                'secrets': secrets,
            }))
    return result

def _glob_match(cwd, pattern):
    import glob
    full = os.path.join(cwd, pattern)
    return [os.path.relpath(p, cwd) for p in glob.glob(full)]

def _is_git_tracked(cwd, path):
    try:
        result = subprocess.run(
            ['git', 'ls-files', '--error-unmatch', path], cwd=cwd,
            capture_output=True, text=True, encoding='utf-8'
        )
        return result.returncode == 0
    except Exception:
        return False

def _sha256_file(filepath):
    try:
        with open(filepath, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None

def _analyze_sql(filepath):
    """Return (insert_count, has_on_conflict) for report enhancement."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        insert_count = len(re.findall(r'INSERT\s+INTO', content, re.IGNORECASE))
        has_conflict = bool(re.search(ON_CONFLICT_RE, content, re.IGNORECASE))
        return insert_count, has_conflict
    except (OSError, UnicodeDecodeError):
        return 0, False
