"""
mxt_doctor_extractors.py - Port, token, interface, OOB extractors.
Split from parsers to respect 200-line limit.
"""
import re, json, hashlib, os
from mxt_doctor_constants import *

# ── port extraction ───────────────────────────────────────────────────

def extract_ports(tracked_files, env_data):
    """Extract ports from multiple sources. Returns [(source_file, port, context), ...]."""
    ports = []
    port_env_re = re.compile(PORT_ENV_RE)
    for env_file, entries in env_data.items():
        for key, val in entries:
            m = port_env_re.match(f'{key}={val}')
            if m:
                ports.append((env_file, m.group(1), key))
    df_re = re.compile(PORT_DOCKERFILE_RE)
    for tf in tracked_files:
        if os.path.basename(tf).startswith('Dockerfile'):
            ports.extend(_extract_from_file(tf, df_re, 'EXPOSE'))
    nx_re = re.compile(PORT_NGINX_RE)
    for tf in tracked_files:
        if 'nginx' in tf.lower() and tf.endswith('.conf'):
            ports.extend(_extract_from_file(tf, nx_re, 'listen'))
    yaml_re = re.compile(PORT_YAML_RE)
    tf_port_re = re.compile(PORT_TF_RE)
    for tf in tracked_files:
        if tf.endswith('.yaml') or tf.endswith('.yml'):
            ports.extend(_extract_from_file(tf, yaml_re, 'port'))
        elif tf.endswith('.tf'):
            ports.extend(_extract_from_file(tf, tf_port_re, 'container_port'))
    return sorted(set(ports), key=lambda x: (x[0], int(x[1]) if x[1].isdigit() else 0))

def _extract_from_file(filepath, regex, context):
    result = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                m = regex.search(line)
                if m:
                    result.append((filepath, m.group(1), context))
    except (OSError, UnicodeDecodeError):
        pass
    return result

# ── token pattern derivation ──────────────────────────────────────────

def derive_token_patterns(env_data):
    """Derive token patterns from env values.
    Deduplicates by key: if the same key appears in multiple env files with
    different patterns, the most strict mode wins.
    Strictness order: fixed > prefix_hex > hex > prefix_alnum > allow_empty > placeholder > env_ref
    """
    # Collect all patterns per key
    key_patterns = {}  # key -> list of (mode, prefix, min_l, max_l, charset)
    for env_file, entries in env_data.items():
        for key, val in entries:
            if not any(kw in key.upper() for kw in TOKEN_KEYWORDS):
                continue
            mode, prefix, min_l, max_l, charset = _classify_token(val)
            if mode:
                if key not in key_patterns:
                    key_patterns[key] = []
                key_patterns[key].append((mode, prefix, min_l, max_l, charset))

    # For each key, pick the most strict pattern
    STRICTNESS = {
        'fixed': 7, 'prefix_hex': 6, 'hex': 5, 'prefix_alnum': 4,
        'allow_empty': 3, 'placeholder': 2, 'env_ref': 1,
    }
    result = []
    for key, pats in key_patterns.items():
        best = max(pats, key=lambda p: STRICTNESS.get(p[0], 0))
        result.append((key, best[0], best[1], best[2], best[3], best[4]))
    return sorted(result, key=lambda x: x[0])

def _classify_token(val):
    if not val:
        return 'allow_empty', '', 0, 0, 'any'
    if re.match(PLACEHOLDER_RE, val):
        return 'placeholder', '', 0, 0, 'any'
    if re.match(ENV_REF_RE, val):
        return 'env_ref', '', 0, 0, 'any'
    m = re.match(PREFIX_HEX_RE, val)
    if m:
        return 'prefix_hex', m.group(1), len(val), len(val), 'hex'
    if re.match(HEX_RE, val):
        return 'hex', '', len(val), len(val), 'hex'
    if re.match(SK_PREFIX_RE, val):
        return 'prefix_alnum', 'sk-', len(val), len(val), 'alphanumeric'
    return 'fixed', '', len(val), len(val), 'any'

# ── interface extraction ─────────────────────────────────────────────

def extract_interfaces(tracked_files):
    """Extract interface definitions from Go/TS/OpenAPI."""
    interfaces = []
    for tf in tracked_files:
        if tf.endswith('.go'):
            interfaces.extend(_extract_go_interfaces(tf))
        elif tf.endswith('.ts') or tf.endswith('.tsx'):
            interfaces.extend(_extract_ts_interfaces(tf))
        elif tf.endswith('.yaml') or tf.endswith('.yml'):
            interfaces.extend(_extract_openapi_interfaces(tf))
    return sorted(interfaces, key=lambda x: (x[2], x[0]))

def _extract_go_interfaces(filepath):
    result = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        struct_re = re.compile(GO_STRUCT_RE, re.MULTILINE)
        tag_re = re.compile(GO_JSON_TAG_RE)
        for m in struct_re.finditer(content):
            name = m.group(1)
            start = m.end()
            depth, idx = 1, start
            while idx < len(content) and depth > 0:
                if content[idx] == '{': depth += 1
                elif content[idx] == '}': depth -= 1
                idx += 1
            body = content[start:idx-1] if depth == 0 else content[start:]
            fields = tag_re.findall(body)
            if fields:
                result.append((name, filepath, 'go', _hash_fields(fields)))
    except (OSError, UnicodeDecodeError):
        pass
    return result

def _extract_ts_interfaces(filepath):
    result = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        iface_re = re.compile(TS_INTERFACE_RE, re.MULTILINE)
        for m in iface_re.finditer(content):
            name = m.group(1)
            start = m.end()
            depth, idx = 1, start
            while idx < len(content) and depth > 0:
                if content[idx] == '{': depth += 1
                elif content[idx] == '}': depth -= 1
                idx += 1
            body = content[start:idx-1] if depth == 0 else content[start:]
            fields = re.findall(r'(\w+)\s*[?:]?', body)
            fields = [f for f in fields if f not in ('type','interface','const','let','var')]
            if fields:
                result.append((name, filepath, 'ts', _hash_fields(fields)))
    except (OSError, UnicodeDecodeError):
        pass
    return result

def _extract_openapi_interfaces(filepath):
    result = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            first_lines = ''.join(f.readline() for _ in range(5))
        if not re.search(OPENAPI_MARKER_RE, first_lines, re.MULTILINE):
            return result
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        schema_re = re.compile(r'^\s{2,4}(\w+):\s*$', re.MULTILINE)
        in_schemas = False
        for m in schema_re.finditer(content):
            if m.group(1) == 'schemas':
                in_schemas = True
                continue
            if in_schemas and m.group(1) in ('paths', 'responses', 'parameters'):
                in_schemas = False
                continue
            if in_schemas:
                fields = _extract_yaml_fields(content, m.end())
                if fields:
                    result.append((m.group(1), filepath, 'openapi', _hash_fields(fields)))
    except (OSError, UnicodeDecodeError):
        pass
    return result

def _extract_yaml_fields(content, start):
    fields = []
    prop_re = re.compile(r'^\s{6,8}(\w+):\s*', re.MULTILINE)
    for m in prop_re.finditer(content, start):
        fields.append(m.group(1))
    return list(dict.fromkeys(fields))

def _hash_fields(fields):
    sorted_fields = sorted(fields)
    return hashlib.sha256(json.dumps(sorted_fields).encode('utf-8')).hexdigest()


