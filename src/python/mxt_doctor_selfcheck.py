"""
mxt_doctor_selfcheck.py - Post-generate self-check for each config file.
Validates format, content completeness, and cross-consistency.
"""
import os, re, hashlib
from mxt_doctor_constants import *

SHA256_RE = re.compile(r'^[0-9a-f]{64}$')

def selfcheck(config_name, tmp_path, project_root='.'):
    """Validate a generated config file. Returns (ok: bool, errors: [str])."""
    errors = []
    if not os.path.isfile(tmp_path):
        return False, ['file does not exist']
    lines = _read_lines(tmp_path)
    data_lines = [l for l in lines if l.strip() and not l.strip().startswith('#')]
    if not data_lines:
        return False, ['no data entries']

    checker = CHECKERS.get(config_name)
    if not checker:
        return True, []

    fmt_ok, fmt_errors = checker(data_lines, project_root)
    errors.extend(fmt_errors)

    content_ok, content_errors = _check_content(config_name, data_lines, project_root)
    errors.extend(content_errors)

    cross_ok, cross_errors = _check_cross(config_name, data_lines, project_root)
    errors.extend(cross_errors)

    return len(errors) == 0, errors

# ── format checkers per config type ──────────────────────────────────

def _check_file_list(lines, root):
    errors = []
    for line in lines:
        stripped = line.lstrip('@!')
        if not stripped.strip():
            errors.append(f'empty path: {line!r}')
            continue
        # @ and ! lines are path-only (optional/forbidden markers)
        if line.startswith('@') or line.startswith('!'):
            continue
        # Regular lines: 1 field (existence-only) or 2 fields (content-locked)
        parts = stripped.split('\t')
        if len(parts) == 2:
            sha = parts[1]
            if not SHA256_RE.match(sha):
                errors.append(f'invalid sha256 in file-list: {sha[:20]}...')
    return len(errors) == 0, errors

def _check_file_hash(lines, root):
    errors = []
    for line in lines:
        parts = line.split('\t')
        if len(parts) == 1:
            # existence-only mode (path only, no hash)
            if not parts[0].strip():
                errors.append(f'empty path: {line!r}')
        elif len(parts) == 2:
            # content-locked mode (path + sha256)
            path, sha = parts
            if not SHA256_RE.match(sha):
                errors.append(f'invalid sha256: {sha[:20]}...')
        else:
            errors.append(f'expected 1 or 2 fields, got {len(parts)}: {line!r}')
    return len(errors) == 0, errors

def _check_file_oob(lines, root):
    errors = []
    for line in lines:
        parts = line.split('\t')
        if len(parts) == 1:
            # existence-only mode (path only, no hash)
            if not parts[0].strip():
                errors.append(f'empty path: {line!r}')
        elif len(parts) == 2:
            # content-locked mode (path + sha256)
            path, sha = parts
            if not SHA256_RE.match(sha):
                errors.append(f'invalid sha256: {sha[:20]}...')
        else:
            errors.append(f'expected 1 or 2 fields, got {len(parts)}: {line!r}')
    return len(errors) == 0, errors

def _check_meta_env(lines, root):
    errors = []
    env_re = re.compile(ENV_LINE_RE)
    for line in lines:
        if not env_re.match(line):
            errors.append(f'not KEY=VALUE: {line!r}')
    return len(errors) == 0, errors

def _check_meta_deps(lines, root):
    errors = []
    for line in lines:
        parts = line.split('\t')
        if len(parts) != 3:
            errors.append(f'expected 3 fields, got {len(parts)}: {line!r}')
    return len(errors) == 0, errors

def _check_meta_ports(lines, root):
    errors = []
    for line in lines:
        parts = line.split('\t')
        if len(parts) != 3:
            errors.append(f'expected 3 fields, got {len(parts)}: {line!r}')
            continue
        if not parts[1].isdigit():
            errors.append(f'port not numeric: {parts[1]}')
    return len(errors) == 0, errors

def _check_meta_tokens(lines, root):
    errors = []
    for line in lines:
        parts = line.split('\t')
        if len(parts) != 6:
            errors.append(f'expected 6 fields, got {len(parts)}: {line!r}')
    return len(errors) == 0, errors

def _check_code_interfaces(lines, root):
    errors = []
    for line in lines:
        parts = line.split('\t')
        if len(parts) == 3:
            # existence-only mode (name, source, lang — no hash)
            if not parts[0].strip():
                errors.append(f'empty interface name: {line!r}')
        elif len(parts) == 4:
            # content-locked mode (name, source, lang, hash)
            if not SHA256_RE.match(parts[3]):
                errors.append(f'invalid sha256 in interfaces: {parts[3][:20]}...')
        else:
            errors.append(f'expected 3 or 4 fields, got {len(parts)}: {line!r}')
    return len(errors) == 0, errors

def _check_code_idempotency(lines, root):
    errors = []
    for line in lines:
        parts = line.split('	')
        if len(parts) != 3:
            errors.append(f'expected 3 fields, got {len(parts)}: {line!r}')
    return len(errors) == 0, errors


CHECKERS = {
    'file-list': _check_file_list,
    'file-hash': _check_file_hash,
    'file-oob': _check_file_oob,
    'meta-env': _check_meta_env,
    'meta-deps': _check_meta_deps,
    'meta-ports': _check_meta_ports,
    'meta-tokens': _check_meta_tokens,
    'code-interfaces': _check_code_interfaces,
    'code-idempotency': _check_code_idempotency,
}

# ── content completeness ─────────────────────────────────────────────

def _check_content(config_name, lines, root):
    errors = []
    if config_name in ('file-hash', 'file-list'):
        # file-list: 1-field=existence, 2-field=content-locked
        # file-hash: 1-field=existence, 2-field=content-locked
        # format: file_path  OR  file_path<TAB>sha256
        for line in lines:
            # Skip manual marker lines: @ = optional, ! = forbidden
            if line.startswith("@") or line.startswith("!"):
                continue
            parts = line.split('\t')
            path = parts[0]
            if not os.path.isfile(os.path.join(root, path)):
                errors.append(f'file not found: {path}')
            elif len(parts) == 2:
                # content-locked: verify hash matches
                sha = parts[1]
                if SHA256_RE.match(sha):
                    actual = _sha256_file(os.path.join(root, path))
                    if actual and actual != sha:
                        errors.append(f'sha256 mismatch: {path}')
            # 1-field entries: existence-only, no hash check
    elif config_name == 'code-interfaces':
        # format: name<TAB>source<TAB>lang  OR  name<TAB>source<TAB>lang<TAB>hash
        for line in lines:
            parts = line.split('\t')
            if len(parts) >= 2:
                path = parts[1]  # source file is field 2, not field 1
                if not os.path.isfile(os.path.join(root, path)):
                    errors.append(f'file not found: {path}')
    return len(errors) == 0, errors

# ── cross-consistency ────────────────────────────────────────────────

def _check_cross(config_name, lines, root):
    """Cross-consistency: referenced files should either be in file-list
    (git-tracked) OR exist on disk (untracked but present). Only fail if
    the file doesn't exist at all."""
    errors = []
    list_path = os.path.join(root, '.r2mo', 'doctor')
    if not os.path.isdir(list_path):
        return len(errors) == 0, errors
    if config_name in ('file-hash', 'file-oob', 'meta-ports', 'code-interfaces'):
        for profile_dir in os.listdir(list_path):
            candidate = os.path.join(list_path, profile_dir, 'file-list.conf')
            if os.path.isfile(candidate):
                fl_lines = _read_lines(candidate)
                fl_set = set(
                    l.strip() for l in fl_lines
                    if l.strip() and not l.startswith('#')
                    and not l.startswith('@') and not l.startswith('!')
                )
                for line in lines:
                    parts = line.split('\t')
                    if config_name == 'code-interfaces':
                        ref_path = parts[1] if len(parts) >= 2 else ''
                    elif config_name == 'meta-ports':
                        ref_path = parts[0] if len(parts) >= 1 else ''
                    else:
                        ref_path = parts[0] if len(parts) >= 1 else ''
                    if ref_path and ref_path not in fl_set:
                        # File not in git-tracked list — check if it exists on disk
                        full_path = os.path.join(root, ref_path)
                        if not os.path.exists(full_path):
                            errors.append(f'cross-check: {ref_path} not in file-list and not on disk')
                        # If it exists on disk but isn't tracked, that's OK (untracked file)
                break
    return len(errors) == 0, errors

# ── utilities ─────────────────────────────────────────────────────────

def _read_lines(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read().splitlines()
    except OSError:
        return []

def _sha256_file(filepath):
    try:
        with open(filepath, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None
