"""
mxt_doctor_snapshot.py - Structured audit snapshots and drift analysis.

JSON snapshots are reviewable audit artifacts. They do not replace the
authoritative .conf baseline files.
"""
import hashlib
import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone

SCHEMA_VERSION = 1
SNAPSHOT_FILENAME = 'snapshot-{profile}.json'
ANALYSIS_FILENAME = 'analysis-{profile}.json'


def collect_git_context(cwd='.'):
    """Return compact Git context used by drift classification."""
    def run(*args):
        try:
            result = subprocess.run(
                ['git', *args], cwd=cwd, capture_output=True, text=True,
                encoding='utf-8', errors='replace'
            )
            return result.stdout.strip() if result.returncode == 0 else ''
        except (OSError, subprocess.SubprocessError):
            return ''

    changed_files = sorted({
        line[2:].strip()
        for line in run('status', '--porcelain').splitlines()
        if line
    })
    return {
        'branch': run('branch', '--show-current') or 'unknown',
        'commit': run('rev-parse', 'HEAD') or None,
        'dirty': bool(changed_files),
        'changed_files': changed_files,
    }


def baseline_fingerprint(cwd='.', profile='loc'):
    """Fingerprint baseline config files without embedding their contents."""
    profile_dir = os.path.join(cwd, '.r2mo', 'doctor', profile)
    files = {}
    if os.path.isdir(profile_dir):
        for name in sorted(os.listdir(profile_dir)):
            if not name.endswith('.conf'):
                continue
            path = os.path.join(profile_dir, name)
            if not os.path.isfile(path):
                continue
            try:
                with open(path, 'rb') as f:
                    files[name] = hashlib.sha256(f.read()).hexdigest()
            except OSError:
                files[name] = None
    return {
        'files': files,
        'overall': _hash_json(files),
    }


def build_snapshot(cwd='.', profile='loc', counts=None, baseline=None, git=None):
    """Build one structured scan snapshot."""
    now = datetime.now(timezone.utc)
    return {
        'schema_version': SCHEMA_VERSION,
        'run_id': f'{now.strftime("%Y%m%dT%H%M%SZ")}-{uuid.uuid4().hex[:8]}',
        'created_at': now.isoformat(timespec='seconds'),
        'profile': profile,
        'summary': {
            'PASS': int((counts or {}).get('PASS', 0)),
            'FAIL': int((counts or {}).get('FAIL', 0)),
            'WARN': int((counts or {}).get('WARN', 0)),
            'SKIP': int((counts or {}).get('SKIP', 0)),
        },
        'baseline': baseline or {},
        'git': git or {},
    }


def find_latest_snapshot(cwd='.', profile='loc', exclude_path=None):
    """Find the newest valid snapshot for a profile, excluding one path."""
    root = os.path.join(cwd, '.r2mo', 'verify', 'doctor')
    if not os.path.isdir(root):
        return None
    candidates = []
    for run_dir in os.listdir(root):
        candidate = os.path.join(root, run_dir, SNAPSHOT_FILENAME.format(profile=profile))
        if not os.path.isfile(candidate):
            continue
        if exclude_path and os.path.abspath(candidate) == os.path.abspath(exclude_path):
            continue
        try:
            data = load_json(candidate)
            if data.get('schema_version') == SCHEMA_VERSION and data.get('profile') == profile:
                candidates.append((run_dir, candidate))
        except (OSError, ValueError):
            continue
    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_json_atomic(path, data):
    """Write deterministic pretty JSON using an atomic temp file."""
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix='.snapshot-', dir=directory)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write('\n')
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    return path


def analyze_snapshots(previous, current):
    """Compare snapshots and classify the dominant change signals.

    Classification is intentionally conservative:
    - baseline-only change with no failures -> NORMAL_EXPECTED
    - failures plus Git change -> ABNORMAL_DRIFT
    - Git-only change -> UNCLASSIFIED
    """
    previous_baseline = (previous or {}).get('baseline', {}).get('overall')
    current_baseline = current.get('baseline', {}).get('overall')
    baseline_changed = bool(previous and previous_baseline and previous_baseline != current_baseline)

    previous_git = (previous or {}).get('git', {})
    current_git = current.get('git', {})
    git_changed = bool(
        current_git.get('dirty') or
        set(current_git.get('changed_files', [])) - set(previous_git.get('changed_files', []))
    )
    failed = current.get('summary', {}).get('FAIL', 0) > 0

    changed_files = current_git.get('changed_files', [])
    baseline_only_git_change = all(_is_expected_doctor_artifact(file) for file in changed_files)

    changes = []
    if baseline_changed:
        changes.append({
            'subject': 'baseline',
            'type': 'updated',
            'classification': 'ABNORMAL_DRIFT' if failed and git_changed else 'NORMAL_EXPECTED',
            'reason': 'Baseline fingerprint changed' + (' while FAIL and Git changes coexist' if failed and git_changed else ''),
        })
    if git_changed:
        if failed and not baseline_only_git_change:
            git_classification = 'ABNORMAL_DRIFT'
        elif baseline_only_git_change:
            git_classification = 'NORMAL_EXPECTED'
        else:
            git_classification = 'UNCLASSIFIED'
        changes.append({
            'subject': 'git',
            'type': 'updated',
            'classification': git_classification,
            'reason': 'Working tree changed since the previous snapshot',
            'files': changed_files,
        })

    return {
        'schema_version': SCHEMA_VERSION,
        'previous_run_id': previous.get('run_id') if previous else None,
        'baseline_changed': baseline_changed,
        'git_changed': git_changed,
        'has_failures': failed,
        'changes': changes,
    }


def _is_expected_doctor_artifact(filepath):
    """Return True for doctor-owned baseline and verification artifacts."""
    return (
        filepath == '.r2mo/doctor' or
        filepath.startswith('.r2mo/doctor/') or
        filepath == '.r2mo/verify/doctor' or
        filepath.startswith('.r2mo/verify/doctor/')
    )

def analysis_verdict(analysis):
    if any(c['classification'] == 'ABNORMAL_DRIFT' for c in analysis.get('changes', [])):
        return 'FAIL_DRIFT'
    if any(c['classification'] == 'UNCLASSIFIED' for c in analysis.get('changes', [])):
        return 'NEEDS_REVIEW'
    if analysis.get('baseline_changed') and not analysis.get('has_failures'):
        return 'PASS_WITH_EXPECTED_CHANGES'
    return 'PASS'


def _hash_json(value):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()
