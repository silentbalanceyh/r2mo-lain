import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = REPO_ROOT / 'src' / 'python'
sys.path.insert(0, str(PYTHON_DIR))

from mxt_doctor_snapshot import (
    analyze_snapshots, analysis_verdict, baseline_fingerprint, build_snapshot,
    collect_git_context, find_latest_snapshot, load_json, write_json_atomic,
)


class MxtDoctorSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.previous_version = sys.path[:]
    def tearDown(self):
        sys.path[:] = self.previous_version

    def test_collect_git_context_reports_clean_state(self):
        with tempfile.TemporaryDirectory() as root:
            self._git(root, 'init', '--initial-branch=master')
            self._write(root, 'README.md', 'hello\n')
            self._git(root, 'add', '.')
            self._git(root, 'commit', '-m', 'init')
            context = collect_git_context(root)
            self.assertEqual(context['branch'], 'master')
            self.assertEqual(context['dirty'], False)
            self.assertEqual(context['changed_files'], [])
            self.assertTrue(context['commit'])
            self.assertRegex(context['commit'], r'^[0-9a-f]{40}$')

    def test_collect_git_context_reports_changed_files(self):
        with tempfile.TemporaryDirectory() as root:
            self._git(root, 'init', '--initial-branch=master')
            self._write(root, 'README.md', 'hello\n')
            self._git(root, 'add', '.')
            self._git(root, 'commit', '-m', 'init')
            self._write(root, 'README.md', 'changed\n')
            self._write(root, 'config.json', '{}\n')
            context = collect_git_context(root)
            self.assertEqual(context['dirty'], True)
            self.assertEqual(context['changed_files'], ['README.md', 'config.json'])

    def test_baseline_fingerprint_hashes_profile_files(self):
        with tempfile.TemporaryDirectory() as root:
            profile = Path(root, '.r2mo', 'doctor', 'loc')
            profile.mkdir(parents=True)
            Path(profile, 'file-list.conf').write_text('README.md\n', encoding='utf-8')
            fingerprint = baseline_fingerprint(root, 'loc')
            expected = hashlib.sha256(b'README.md\n').hexdigest()
            self.assertEqual(fingerprint['files']['file-list.conf'], expected)
            self.assertEqual(fingerprint['overall'], hashlib.sha256(json.dumps(fingerprint['files'], ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest())

    def test_write_and_find_snapshot(self):
        with tempfile.TemporaryDirectory() as root:
            verify = Path(root, '.r2mo', 'verify', 'doctor')
            first = verify / '20260101-000000'
            first.mkdir(parents=True)
            data = {'schema_version': 1, 'profile': 'loc'}
            write_json_atomic(first / 'snapshot.json', data)
            found = find_latest_snapshot(root, 'loc')
            self.assertEqual(Path(found), first / 'snapshot.json')
            self.assertEqual(load_json(found), data)

    def test_analyze_expected_baseline_change(self):
        previous = self._snapshot(fingerprint='a', counts={'FAIL': 0})
        current = self._snapshot(fingerprint='b', counts={'FAIL': 0})
        analysis = analyze_snapshots(previous, current)
        self.assertEqual(analysis['baseline_changed'], True)
        self.assertEqual(analysis['git_changed'], False)
        self.assertEqual(analysis['changes'][0]['classification'], 'NORMAL_EXPECTED')
        self.assertEqual(analysis_verdict(analysis), 'PASS_WITH_EXPECTED_CHANGES')

    def test_analyze_abnormal_result_and_git_drift(self):
        previous = self._snapshot(fingerprint='a', counts={'FAIL': 0})
        current = self._snapshot(fingerprint='b', counts={'FAIL': 1}, git={'dirty': True, 'changed_files': ['.env']})
        analysis = analyze_snapshots(previous, current)
        self.assertEqual(analysis['changes'][0]['classification'], 'ABNORMAL_DRIFT')
        self.assertEqual(analysis_verdict(analysis), 'FAIL_DRIFT')

    def test_analyze_unclassified_change(self):
        previous = self._snapshot(fingerprint='a', counts={'FAIL': 0})
        current = self._snapshot(fingerprint='a', counts={'FAIL': 0}, git={'dirty': True, 'changed_files': ['src/main.py']})
        analysis = analyze_snapshots(previous, current)
        self.assertEqual(analysis['changes'][0]['classification'], 'UNCLASSIFIED')
        self.assertEqual(analysis_verdict(analysis), 'NEEDS_REVIEW')

    def test_build_snapshot_contains_required_metadata(self):
        snapshot = build_snapshot(
            cwd='.', profile='loc', counts={'PASS': 1, 'FAIL': 0, 'WARN': 0, 'SKIP': 0},
            baseline={'overall': 'baseline'}, git={'branch': 'master', 'dirty': False, 'changed_files': []}
        )
        for key in ('schema_version', 'run_id', 'profile', 'created_at', 'summary', 'baseline', 'git'):
            self.assertIn(key, snapshot)
        self.assertEqual(snapshot['schema_version'], 1)

    @staticmethod
    def _git(root, *args, env=None):
        subprocess.run(['git', *args], cwd=root, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env or os.environ)

    @staticmethod
    def _write(root, name, content):
        Path(root, name).write_text(content, encoding='utf-8')

    @staticmethod
    def _snapshot(fingerprint, counts, git=None):
        return {
            'run_id': 'run', 'profile': 'loc', 'baseline': {'overall': fingerprint},
            'git': git or {'dirty': False, 'changed_files': []}, 'summary': counts,
        }


    def test_scan_writes_snapshot_and_analysis(self):
        with tempfile.TemporaryDirectory() as root:
            self._git(root, 'init', '--initial-branch=master')
            self._write(root, 'README.md', 'hello\n')
            self._write(root, 'package.json', '{"dependencies":{"left-pad":"1.0.0"}}\n')
            self._git(root, 'add', '.')
            env = {**os.environ, 'GIT_AUTHOR_NAME': 'test', 'GIT_AUTHOR_EMAIL': 'test@example.com', 'GIT_COMMITTER_NAME': 'test', 'GIT_COMMITTER_EMAIL': 'test@example.com'}
            self._git(root, 'commit', '-m', 'init', env=env)
            from mxt_doctor_generate import generate
            from mxt_doctor_scan import scan
            self.assertTrue(generate(cwd=root, profile='loc'))
            self.assertTrue(scan(cwd=root, profile='loc'))
            reports = list(Path(root, '.r2mo', 'verify', 'doctor').glob('*/analysis.json'))
            self.assertEqual(len(reports), 1)
            analysis = json.loads(reports[0].read_text(encoding='utf-8'))
            self.assertIn(analysis['verdict'], ('PASS', 'PASS_WITH_EXPECTED_CHANGES'))
            self.assertTrue((reports[0].parent / 'snapshot.json').is_file())

if __name__ == '__main__':
    unittest.main()

    def test_scan_renders_drift_analysis_in_markdown(self):
        with tempfile.TemporaryDirectory() as root:
            self._git(root, 'init', '--initial-branch=master')
            self._write(root, 'README.md', 'hello\n')
            self._git(root, 'add', '.')
            env = {**os.environ, 'GIT_AUTHOR_NAME': 'test', 'GIT_AUTHOR_EMAIL': 'test@example.com', 'GIT_COMMITTER_NAME': 'test', 'GIT_COMMITTER_EMAIL': 'test@example.com'}
            self._git(root, 'commit', '-m', 'init', env=env)
            from mxt_doctor_generate import generate
            from mxt_doctor_scan import scan
            self.assertTrue(generate(cwd=root, profile='loc'))
            self.assertTrue(scan(cwd=root, profile='loc'))
            markdown_files = list(Path(root, '.r2mo', 'verify', 'doctor').glob('*/*.md'))
            self.assertEqual(len(markdown_files), 1)
            content = markdown_files[0].read_text(encoding='utf-8')
            self.assertIn('## Drift Analysis', content)
            self.assertIn('Verdict:', content)
