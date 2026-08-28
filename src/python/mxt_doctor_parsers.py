"""
mxt_doctor_parsers.py - Env and dependency parsers.
No project-specific logic.
"""
import re, json, os, fnmatch
from mxt_doctor_constants import *

# ── env parser ─────────────────────────────────────────────────────────

def parse_env_file(filepath):
    """Parse .env / *.env / *.properties. Returns [(key, value), ...].
    Handles: export KEY=VALUE, KEY="VALUE" # comment, KEY=VALUE # comment
    Strips: surrounding quotes, inline comments (space+#), trailing whitespace.
    """
    entries = []
    env_re = re.compile(ENV_LINE_RE)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.rstrip('\n\r')
                stripped = line.strip()
                if not stripped or stripped.startswith('#'):
                    continue
                m = env_re.match(line)
                if m:
                    key, val = m.group(1), m.group(2)
                    val = _clean_env_value(val)
                    if key:
                        entries.append((key, val))
    except (OSError, UnicodeDecodeError):
        pass
    return entries


def _clean_env_value(raw_val):
    """Clean an env value: strip inline comments, then quotes, then whitespace."""
    val = raw_val.strip()
    # Strip inline comment: if there's a space+# sequence outside quotes
    # Handle quoted values: KEY="value # not comment" # real comment
    if val.startswith('"'):
        end = val.find('"', 1)
        if end != -1:
            inner = val[1:end]
            return inner.strip()
        # No closing quote — take everything
        return val.lstrip('"').strip()
    if val.startswith("'"):
        end = val.find("'", 1)
        if end != -1:
            inner = val[1:end]
            return inner.strip()
        return val.lstrip("'").strip()
    # Unquoted: strip inline comment (space + #)
    comment_pos = val.find(' #')
    if comment_pos != -1:
        val = val[:comment_pos].strip()
    # Also handle tab+#
    comment_pos = val.find('\t#')
    if comment_pos != -1:
        val = val[:comment_pos].strip()
    # Strip any remaining surrounding quotes
    val = val.strip().strip('"').strip("'")
    return val

def discover_env_files(tracked_files):
    """Filter tracked_files for env file matches.
    Excludes non-env files that match *.properties:
    - i18n message bundles (Message*.properties, *_zh_CN.properties, etc.)
    - PDF.js viewer locale files (viewer.properties, locale.properties)
    - Jakarta validation messages (vertx-validation_*.properties)
    - Database config properties (MYSQL.properties, etc.)
    - Framework configs (gradle.properties, spy.properties, application.properties,
      gradle-wrapper.properties, log4j*.properties, etc.)
    """
    # Patterns that look like *.properties but are NOT env files
    I18N_RE = re.compile(
        r'(Message|message_|vertx-validation|vertx-error|vertx-)*'
        r'(_zh_CN|_en_US|_ja_JP|_ko_KR|_fr_FR|_de_DE|_es_ES|_pt_BR|_it_IT|_ru_RU)\.properties$'
    )
    # Files in locale/ directories are i18n bundles, not env files
    LOCALE_DIR_RE = re.compile(r'/locale/.*\.properties$')
    # Database/plugin/framework config properties
    DB_CONFIG_RE = re.compile(r'(/database/|/plugins/).*\.properties$')
    # Framework config filenames — never env variable files
    FRAMEWORK_CONFIG_NAMES = {
        'gradle.properties',
        'gradle-wrapper.properties',
        'spy.properties',
        'application.properties',
        'application.yml',
        'application.yaml',
        'log4j.properties',
        'log4j2.properties',
        'locale.properties',
        'viewer.properties',
        'MYSQL.properties',
        'postgres.properties',
        'redis.properties',
        'kafka.properties',
        'zookeeper.properties',
    }
    result = []
    for f in tracked_files:
        basename = os.path.basename(f)
        # Quick exclusion by exact filename for known framework configs
        if basename in FRAMEWORK_CONFIG_NAMES:
            continue
        matched = False
        for pattern in ENV_GLOBS:
            if fnmatch.fnmatch(basename, pattern):
                matched = True
                break
        if not matched:
            continue
        # Exclude i18n message bundles (Message*, vertx-validation*)
        if I18N_RE.search(f):
            continue
        # Exclude files in locale/ directories (PDF.js viewer, etc.)
        if LOCALE_DIR_RE.search(f):
            continue
        # Exclude database/plugin config properties
        if DB_CONFIG_RE.search(f):
            continue
        result.append(f)
    return sorted(result)

# ── dependency parsers ────────────────────────────────────────────────

def parse_deps(tracked_files):
    """Parse all dep manifests. Returns [(manifest_path, dep_name, version), ...].
    Deduplicates by (manifest_path, dep_name) — if the same dep appears in
    multiple sections (dependencies + devDependencies), keep first occurrence."""
    deps = []
    seen = set()
    for manifest in DEP_MANIFESTS:
        for tf in tracked_files:
            if os.path.basename(tf) == manifest:
                parsed = _parse_manifest(tf, manifest)
                for entry in parsed:
                    key = (entry[0], entry[1])
                    if key not in seen:
                        seen.add(key)
                        deps.append(entry)
    return sorted(deps, key=lambda x: (x[0], x[1]))

def _parse_manifest(filepath, manifest_type):
    if manifest_type == 'package.json':
        return _parse_package_json(filepath)
    elif manifest_type == 'go.mod':
        return _parse_go_mod(filepath)
    elif manifest_type == 'Cargo.toml':
        return _parse_cargo_toml(filepath)
    elif manifest_type == 'pom.xml':
        return _parse_pom_xml(filepath)
    elif manifest_type == 'pyproject.toml':
        return _parse_pyproject(filepath)
    elif manifest_type == 'build.gradle':
        return _parse_build_gradle(filepath)
    return []

def _parse_package_json(filepath):
    deps = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for section in ('dependencies', 'devDependencies', 'peerDependencies'):
            for name, ver in sorted(data.get(section, {}).items()):
                deps.append((filepath, name, ver))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        pass
    return deps

def _parse_go_mod(filepath):
    deps = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            in_require = False
            for line in f:
                line = line.strip()
                if line.startswith('require ('):
                    in_require = True
                    continue
                if in_require and line == ')':
                    in_require = False
                    continue
                if in_require and line:
                    parts = line.split()
                    if len(parts) >= 2:
                        deps.append((filepath, parts[0], parts[1]))
                elif line.startswith('require '):
                    parts = line.replace('require ', '').split()
                    if len(parts) >= 2:
                        deps.append((filepath, parts[0], parts[1]))
    except (OSError, UnicodeDecodeError):
        pass
    return deps

def _parse_cargo_toml(filepath):
    deps = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            in_deps = False
            for line in f:
                stripped = line.strip()
                if stripped.startswith('[') and 'dependencies' in stripped:
                    in_deps = True
                    continue
                if stripped.startswith('[') and 'dependencies' not in stripped:
                    in_deps = False
                    continue
                if in_deps and '=' in stripped:
                    name = stripped.split('=')[0].strip()
                    ver = stripped.split('=', 1)[1].strip().strip('"')
                    deps.append((filepath, name, ver))
    except (OSError, UnicodeDecodeError):
        pass
    return deps

def _parse_pom_xml(filepath):
    deps = []
    try:
        import xml.etree.ElementTree as ET
        tree = ET.parse(filepath)
        root = tree.getroot()
        ns = ''
        if root.tag.startswith('{'):
            ns = root.tag.split('}')[0] + '}'
        for dep in root.iter(f'{ns}dependency'):
            gid = dep.findtext(f'{ns}groupId', '')
            aid = dep.findtext(f'{ns}artifactId', '')
            ver = dep.findtext(f'{ns}version', '')
            if aid:
                name = f'{gid}:{aid}' if gid else aid
                deps.append((filepath, name, ver))
    except (OSError, Exception):
        pass
    return deps

def _parse_pyproject(filepath):
    deps = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            in_deps = False
            for line in f:
                stripped = line.strip()
                if 'dependencies' in stripped and '=' in stripped:
                    if stripped.endswith('['):
                        in_deps = True
                    continue
                if in_deps:
                    if stripped.startswith(']'):
                        in_deps = False
                        continue
                    val = stripped.strip('"').strip("'").rstrip(',')
                    if val:
                        deps.append((filepath, val, ''))
    except (OSError, UnicodeDecodeError):
        pass
    return deps


# ── Gradle dependency parser ──────────────────────────────────────────

def _parse_build_gradle(filepath):
    """Parse build.gradle for dependencies.
    Handles Groovy DSL: implementation 'group:name:version'
    Also handles: api, compile, runtimeOnly, testImplementation, etc.
    """
    deps = []
    # Pattern: <config> 'group:artifact:version'  or  <config> "group:artifact:version"
    dep_re = re.compile(
        r"""(?:implementation|api|compileOnly|runtimeOnly|testImplementation|"""
        r"""testCompileOnly|testRuntimeOnly|annotationProcessor|"""
        r"""compile|testCompile)\s+['"]([^:]+):([^:]+):([^'"]+)['"]"""
    )
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                for m in dep_re.finditer(line):
                    gid, aid, ver = m.group(1), m.group(2), m.group(3)
                    name = f'{gid}:{aid}' if gid else aid
                    deps.append((filepath, name, ver))
    except (OSError, UnicodeDecodeError):
        pass
    return deps
