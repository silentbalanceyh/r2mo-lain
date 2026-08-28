"""
mxt_doctor_report.py - Report formatting and output.
Markdown report with PASS/FAIL/WARN/SKIP per dimension.
"""
import os
from datetime import datetime

class Report:
    def __init__(self, project_name, profile):
        self.project = project_name
        self.profile = profile
        self.pass_count = 0
        self.fail_count = 0
        self.warn_count = 0
        self.skip_count = 0
        self._current_lines = []

    def ok(self, msg):
        self.pass_count += 1
        print(f'  ✅ PASS {msg}')
        self._current_lines.append(f'✅ PASS {msg}')

    def fail(self, msg):
        self.fail_count += 1
        print(f'  ❌ FAIL {msg}')
        self._current_lines.append(f'❌ FAIL {msg}')

    def warn(self, msg):
        self.warn_count += 1
        print(f'  ⚠️  WARN {msg}')
        self._current_lines.append(f'⚠️ WARN {msg}')

    def skip(self, msg):
        self.skip_count += 1
        print(f'  ⊘ SKIP {msg}')
        self._current_lines.append(f'⊘ SKIP {msg}')

    def section_start(self, name):
        print(f'\n── {name} ──')
        self._current_lines = []

    def section_end(self):
        return list(self._current_lines)

    def to_markdown(self, timestamp, section_data):
        """section_data: list of (section_name, [md_lines])."""
        lines = []
        lines.append(f'# Doctor Report — {self.project} / {self.profile}')
        lines.append('')
        lines.append(f'Generated: {timestamp}')
        lines.append(f'Project: {self.project}')
        lines.append(f'Profile: {self.profile}')
        lines.append(f'Baseline: .r2mo/doctor/{self.profile}/')
        lines.append('')
        lines.append('## Summary')
        lines.append('')
        lines.append(f'PASS={self.pass_count}  FAIL={self.fail_count}  WARN={self.warn_count}  SKIP={self.skip_count}')
        lines.append('')
        lines.append('## Dimensions')
        lines.append('')
        for sec_name, sec_lines in section_data:
            lines.append(f'### {sec_name}')
            lines.append('```bash')
            for sl in sec_lines:
                lines.append(sl)
            lines.append('```')
            lines.append('')
        return '\n'.join(lines)


def write_report(cwd, project_name, profile, report_md):
    """Write report to .r2mo/verify/doctor/{timestamp}/{project}-{profile}.md"""
    timestamp = datetime.now().strftime('%Y%m%d-%H%M')
    report_dir = os.path.join(cwd, '.r2mo', 'verify', 'doctor', timestamp)
    os.makedirs(report_dir, exist_ok=True)
    filename = f'{project_name}-{profile}.md'
    report_path = os.path.join(report_dir, filename)
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report_md)
    print(f'\nReport: {report_path}')
    return report_path
