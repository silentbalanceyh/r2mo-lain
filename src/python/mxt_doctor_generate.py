"""
mxt_doctor_generate.py - Baseline config generation.
Signal discovery -> format -> self-check -> atomic write.
"""
import os, json, tempfile
from mxt_doctor_constants import ALL_CONFIG_FILES, CONFIG_JSON_TEMPLATE, LOC_DIMENSIONS, K8S_DIMENSIONS, MOB_DIMENSIONS, WIN_DIMENSIONS
from mxt_doctor_signals import collect_all_signals, get_tracked_files, detect_injected_vars
from mxt_doctor_selfcheck import selfcheck

def generate(cwd='.', profile='loc'):
    """Generate baseline configs for the given profile."""
    # 1. Ensure .r2mo/doctor/<profile>/ exists
    doctor_dir = os.path.join(cwd, '.r2mo', 'doctor')
    profile_dir = os.path.join(doctor_dir, profile)
    os.makedirs(profile_dir, exist_ok=True)

    # 2. Read or create config.json
    config = _load_config(doctor_dir)

    # 3. Get tracked files
    tracked_files = get_tracked_files(cwd)
    if not tracked_files:
        print('ERROR: no git tracked files found (not a git repo?)')
        return False

    # 4. Collect all signals
    signals = collect_all_signals(tracked_files, config, profile)

    # 5. Detect injected env vars
    env_data = signals.get('meta-env', {})
    injected = detect_injected_vars(env_data)

    # 6. Determine active dimensions for this profile
    if profile == 'k8s':
        active_dims = K8S_DIMENSIONS
    elif profile == 'mob':
        active_dims = MOB_DIMENSIONS
    elif profile == 'win':
        active_dims = WIN_DIMENSIONS
    else:
        active_dims = LOC_DIMENSIONS

    # 6. Generate each config file (only for active dimensions)
    generated = []
    skipped = []
    failed = []

    for conf_name in ALL_CONFIG_FILES:
        base_name = conf_name.replace('.conf', '')
        if base_name not in active_dims:
            # Dimension not active for this profile — remove old file if exists
            old = os.path.join(profile_dir, conf_name)
            if os.path.isfile(old):
                os.remove(old)
            skipped.append(conf_name)
            continue
        base_name = conf_name.replace('.conf', '')
        data = signals.get(base_name, [])

        if base_name == 'meta-env':
            content = _format_meta_env(env_data, injected)
        elif not data:
            # Signal empty: remove old file if exists
            old = os.path.join(profile_dir, conf_name)
            if os.path.isfile(old):
                os.remove(old)
            skipped.append(conf_name)
            continue
        else:
            content = _format_config(base_name, data)

        if not content or not content.strip():
            old = os.path.join(profile_dir, conf_name)
            if os.path.isfile(old):
                os.remove(old)
            skipped.append(conf_name)
            continue

        # Preserve @ / ! manual markers from old file
        content = _preserve_manual_markers(profile_dir, conf_name, content)

        # Atomic write with self-check
        ok, errors = _atomic_write_with_check(
            profile_dir, conf_name, base_name, content, cwd
        )
        if ok:
            entry_count = len([l for l in content.split('\n') if l.strip() and not l.startswith('#')])
            generated.append((conf_name, entry_count))
        else:
            failed.append((conf_name, errors))

    # 7. Update config.json
    _save_config(doctor_dir, config, profile, tracked_files)

    # 8. Print summary
    _print_summary(generated, skipped, failed, profile, cwd)
    return len(failed) == 0

# ── config formatting ────────────────────────────────────────────────

def _format_config(config_name, data):
    """Format signal data into config file text."""
    if config_name == 'file-list':
        # data is a list of path strings; _preserve_manual_markers handles
        # per-entry sha256 upgrades (path\tsha256 lines from old file)
        return '\n'.join(sorted(data)) + '\n'
    elif config_name == 'file-hash':
        lines = [f'{p}\t{s}' for p, s in data]
        return '\n'.join(sorted(lines)) + '\n'
    elif config_name == 'file-oob':
        lines = [p[0] if isinstance(p, tuple) else p for p in data]
        return '\n'.join(sorted(lines)) + '\n'
    elif config_name == 'meta-env':
        # handled separately
        return ''
    elif config_name == 'meta-deps':
        lines = [f'{m}\t{n}\t{v}' for m, n, v in data]
        return '\n'.join(sorted(lines)) + '\n'
    elif config_name == 'meta-ports':
        lines = [f'{s}\t{p}\t{c}' for s, p, c in data]
        return '\n'.join(sorted(lines)) + '\n'
    elif config_name == 'meta-tokens':
        lines = [f'{k}\t{m}\t{pfx}\t{mn}\t{mx}\t{cs}' for k, m, pfx, mn, mx, cs in data]
        return '\n'.join(sorted(lines)) + '\n'
    elif config_name == 'code-interfaces':
        lines = [f'{n}\t{s}\t{l}\t{h}' for n, s, l, h in data]
        return '\n'.join(sorted(lines)) + '\n'
    elif config_name == 'code-idempotency':
        lines = [f'{c}\t{p}\t{e}' for c, p, e in data]
        return '\n'.join(sorted(lines)) + '\n'
    return ''

import re
import re as _re

_PLACEHOLDER_RE = _re.compile(r'CHANGE_ME|CHANGE-|changeme|placeholder|YOUR_|REPLACE_', _re.IGNORECASE)

def _is_template_env_file(env_file, entries):
    """Auto-classify: if ANY var value contains a placeholder pattern,
    the file is a template (name-only check, no value baseline).
    Env-specific files (.env.production, .env.development) are NOT templates —
    their values are fixed per-environment and should be checked per-file.
    .secrets.env and .env are NEVER templates — they contain real values
    that must be value-checked. Individual placeholder values within a real
    file are marked as # template at the line level, not the file level.

    Classification priority:
    1. Filename suffix: .example / .tpl / .template → template (name-only)
    2. Filename exact match: .env / .secrets.env → real (value-checked)
    3. Filename ends with .env (not .example) → real (value-checked)
    4. Content-based: any value has placeholder → template
    5. Default: real (value-checked)
    """
    basename = os.path.basename(env_file)
    # Template suffixes always win — .env.example, .secrets.env.example,
    # user.env.example, app.env.template, etc.
    if basename.endswith('.example') or basename.endswith('.tpl') or basename.endswith('.template'):
        return True
    # .secrets.env and .env are always real (value-checked)
    if basename in ('.env', '.secrets.env'):
        return False
    # Filenames ending with .env (cloud.env, release.env, etc.) — real
    if basename.endswith('.env'):
        return False
    # Per-environment files — real, checked per-file independently
    if re.search(r'\.env\.(production|development|staging|release|local|sandbox)$', basename):
        return False
    # For other files (e.g., *.properties, custom names): check content
    for key, val in entries:
        if _PLACEHOLDER_RE.search(val):
            return True
    return False

def _format_meta_env(env_data, injected):
    """Format env baseline with auto-classification.
    - Real files (.env, .secrets.env): full KEY=VALUE (value drift detection)
    - Template files (.env.example, *.tpl): KEY + # template marker (name-only)
    Classification is content-based: any value with CHANGE_ME/placeholder → template.
    """
    lines = []
    for env_file in sorted(env_data.keys()):
        entries = env_data[env_file]
        is_template = _is_template_env_file(env_file, entries)
        lines.append(f'# {env_file}')
        for key, val in entries:
            if key in injected:
                lines.append(f'{key}=  # injected')
            elif is_template:
                lines.append(f'{key}={val}  # template')
            elif _PLACEHOLDER_RE.search(val):
                # Real file but this specific value is a placeholder
                lines.append(f'{key}={val}  # template')
            else:
                lines.append(f'{key}={val}')
    return '\n'.join(lines) + '\n' if lines else ''

# ── manual marker preservation ───────────────────────────────────────

def _preserve_manual_markers(profile_dir, conf_name, new_content):
    """Preserve manual modifications from old file across regeneration.

    Two types of manual modifications are preserved:
    1. @/! marker lines in file-list.conf (optional/forbidden patterns)
    2. Per-entry check mode overrides in file-hash.conf and file-oob.conf:
       - If old entry has 2 fields (path + sha256) but new entry has 1
         field (path only), the old 2-field entry is kept (content-locked
         mode preserved).
       - If old entry has 1 field (path only) but new entry has 2 fields
         (path + sha256), the old 1-field entry is kept (existence-only
         mode preserved).
       This allows the SKILL to upgrade/downgrade individual entries
       without losing changes on the next --generate.
    """
    old_path = os.path.join(profile_dir, conf_name)
    if not os.path.isfile(old_path):
        return new_content
    try:
        with open(old_path, 'r', encoding='utf-8') as f:
            old_lines = f.read().splitlines()
    except OSError:
        return new_content

    # 1. Extract @/! manual markers (for file-list.conf)
    manual = [l for l in old_lines if l.startswith('@') or l.startswith('!')]

    # 2. Extract per-entry mode overrides (for file-hash.conf, file-oob.conf)
    # Build old path -> full old line mapping (skip comments and markers)
    old_path_map = {}  # {path: full_old_line}
    for l in old_lines:
        stripped = l.strip()
        if not stripped or stripped.startswith('#') or stripped.startswith('@') or stripped.startswith('!'):
            continue
        parts = l.split('\t')
        path_key = parts[0]
        old_path_map[path_key] = l

    # Build new line list, replacing entries where old had a different mode
    new_lines = new_content.rstrip('\n').split('\n')
    preserved_lines = []
    for nl in new_lines:
        stripped = nl.strip()
        if not stripped or stripped.startswith('#'):
            preserved_lines.append(nl)
            continue
        parts = nl.split('\t')
        path_key = parts[0]
        if path_key in old_path_map:
            old_line = old_path_map[path_key]
            old_parts = old_line.split('\t')
            new_parts = nl.split('\t')
            # If old and new have different field counts, keep old (preserve mode)
            if len(old_parts) != len(new_parts):
                preserved_lines.append(old_line)
                continue
        preserved_lines.append(nl)

    result = '\n'.join(preserved_lines)

    # Append @/! markers
    existing = set(l for l in result.split('\n') if l.strip())
    appended = [l for l in manual if l not in existing]
    if appended:
        result = result.rstrip('\n') + '\n# ── manual markers ──\n' + '\n'.join(appended) + '\n'
    return result

# ── atomic write with self-check ─────────────────────────────────────

def _atomic_write_with_check(profile_dir, conf_name, base_name, content, project_root):
    """Write to .tmp, self-check, then os.replace."""
    conf_path = os.path.join(profile_dir, conf_name)
    fd, tmp_path = tempfile.mkstemp(dir=profile_dir, prefix=f'.tmp_{conf_name}_')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(content)
        ok, errors = selfcheck(base_name, tmp_path, project_root)
        if ok:
            os.replace(tmp_path, conf_path)
            return True, []
        else:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            return False, errors
    except Exception as e:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return False, [str(e)]

# ── config.json management ───────────────────────────────────────────

def _load_config(doctor_dir):
    config_path = os.path.join(doctor_dir, 'config.json')
    if os.path.isfile(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return dict(CONFIG_JSON_TEMPLATE)

def _save_config(doctor_dir, config, profile, tracked_files):
    config['default_profile'] = config.get('default_profile', profile)
    config['project_type'] = _detect_project_type(tracked_files)
    config['language'] = _detect_language(tracked_files)
    # Detect current branch as expected_branch (first generate only; don't overwrite if already set)
    if not config.get('expected_branch') or config.get('expected_branch') == 'master':
        import subprocess as _sp
        try:
            r = _sp.run(['git', 'branch', '--show-current'], cwd=doctor_dir,
                        capture_output=True, text=True, encoding='utf-8')
            if r.returncode == 0 and r.stdout.strip():
                config['expected_branch'] = r.stdout.strip()
        except Exception:
            pass
    config_path = os.path.join(doctor_dir, 'config.json')
    fd, tmp = tempfile.mkstemp(dir=doctor_dir, prefix='.tmp_config_')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, sort_keys=True)
            f.write('\n')
        os.replace(tmp, config_path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)

def _detect_project_type(tracked_files):
    if any(f.endswith('.go') for f in tracked_files):
        return 'go'
    if any(f.endswith('.rs') for f in tracked_files):
        return 'rust'
    if any(f.endswith('.java') for f in tracked_files):
        return 'java'
    if any(f.endswith('.py') for f in tracked_files):
        return 'python'
    if any(f.endswith('.ets') for f in tracked_files):
        return 'harmony'
    if any(f.endswith('.ts') or f.endswith('.tsx') for f in tracked_files):
        return 'typescript'
    if any(f.endswith('.vue') for f in tracked_files):
        return 'frontend'
    if any(f.endswith('.js') or f.endswith('.jsx') for f in tracked_files):
        return 'javascript'
    if any(f.endswith('.cs') for f in tracked_files):
        return 'csharp'
    return 'unknown'

def _detect_language(tracked_files):
    return _detect_project_type(tracked_files)

# ── summary ──────────────────────────────────────────────────────────

# ── skip reason mapping ──────────────────────────────────────────────
SKIP_REASONS = {
    'file-list.conf': 'no git tracked files',
    'file-hash.conf': 'no config-type files found',
    'file-oob.conf': 'no SQL files with INSERT found',
    'meta-env.conf': 'no env files found (.env, *.properties)',
    'meta-deps.conf': 'no dependency manifests found (package.json/go.mod/etc.)',
    'meta-ports.conf': 'no port declarations found in env/Dockerfile/config',
    'meta-tokens.conf': 'no token/secret/password env vars found',
    'code-interfaces.conf': 'no interface definitions found (Go struct/TS interface/OpenAPI)',
    'code-idempotency.conf': 'no SQL/TF/deploy scripts found (no idempotency rules to check)',
}

# ── dimension completeness tracking ───────────────────────────────────
ALL_DIMENSIONS = [
    'file-list', 'file-hash', 'file-oob', 'meta-env', 'meta-deps',
    'meta-ports', 'meta-tokens', 'code-interfaces', 'code-idempotency',
]


def _print_summary(generated, skipped, failed, profile, cwd='.'):
    print(f'\n── mxt doctor --generate --profile {profile} ──\n')

    # Build status map
    gen_names = {n.replace('.conf', '') for n, _ in generated}
    skip_names = {n.replace('.conf', '') for n in skipped}
    fail_names = {n.replace('.conf', '') for n, _ in failed}

    print('Dimension Status:')
    for dim in ALL_DIMENSIONS:
        conf_name = f'{dim}.conf'
        if dim in gen_names:
            count = next((c for n, c in generated if n == conf_name), 0)
            print(f'  ✅ {conf_name:30s} {count:>5d} entries')
        elif dim in fail_names:
            errors = next((e for n, e in failed if n == conf_name), [])
            print(f'  ❌ {conf_name:30s} FAILED ({len(errors)} errors)')
            for e in errors[:3]:
                print(f'      {e}')
        elif dim in skip_names:
            reason = SKIP_REASONS.get(conf_name, 'signal not found')
            print(f'  ⊘  {conf_name:30s} SKIP — {reason}')
        else:
            print(f'  ⚠️  {conf_name:30s} UNKNOWN (not processed)')

    total = len(ALL_DIMENSIONS)
    gen_count = len(gen_names)
    skip_count = len(skip_names)
    fail_count = len(fail_names)

    print(f'\nTotal: {gen_count}/{total} generated, {skip_count}/{total} skipped, {fail_count}/{total} failed')

    # Dep ecosystem breakdown
    deps_generated = any(n == 'meta-deps.conf' for n, _ in generated)
    if deps_generated:
        # Read the generated meta-deps.conf to extract ecosystems
        import os as _os
        eco_counts = {}
        for profile_dir_candidate in [profile]:
            deps_path = _os.path.join(cwd, '.r2mo', 'doctor', profile, 'meta-deps.conf')
            if _os.path.isfile(deps_path):
                with open(deps_path, 'r', encoding='utf-8') as df:
                    for dline in df:
                        dline = dline.strip()
                        if not dline or dline.startswith('#'):
                            continue
                        parts = dline.split('\t')
                        if len(parts) >= 1:
                            bname = _os.path.basename(parts[0])
                            eco_map = {
                                'go.mod': 'go', 'package.json': 'npm',
                                'Cargo.toml': 'cargo', 'pom.xml': 'maven',
                                'build.gradle': 'gradle', 'pyproject.toml': 'python',
                            }
                            eco = eco_map.get(bname, 'unknown')
                            eco_counts[eco] = eco_counts.get(eco, 0) + 1
        if eco_counts:
            eco_str = ', '.join(f'{k}: {v}' for k, v in sorted(eco_counts.items()))
            print(f'\n  📦 Dep ecosystems: {eco_str}')

    # Convergence warning
    if skip_count > 0:
        print(f'\n⚠️  {skip_count} dimension(s) skipped — review if these should have signals.')
        print('   Skipped dimensions mean the project does not have the corresponding')
        print('   file types. This is expected for some projects (e.g., frontend has no SQL).')
        print('   If a dimension should have signals, check file patterns in mxt_doctor_constants.py.')
