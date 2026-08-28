"""Browser migration checks without starting a browser or touching services."""
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ChromeLaunchers(unittest.TestCase):
    def test_shell_syntax(self):
        for path in ('system/libexec/atlas-screen-kiosk',
                     'system/libexec/atlas-screen-kiosk-session',
                     '.atlas/atlas-desktop/bin/open-chrome',
                     '.atlas/atlas-desktop/bin/start-desktop',
                     'atlas-commands/atlas-desktop'):
            with self.subTest(path=path):
                subprocess.run(['bash', '-n', str(ROOT / path)], check=True)

    def test_both_launchers_use_official_chrome_with_sandbox(self):
        for path in ('system/libexec/atlas-screen-kiosk-session',
                     '.atlas/atlas-desktop/bin/open-chrome'):
            source = (ROOT / path).read_text()
            self.assertIn('google-chrome-stable ', source)
            self.assertIn('runuser -u sami', source)
            self.assertNotIn('--no-sandbox', source)
            self.assertNotIn('chromium', source.lower())

    def test_profiles_are_independent_and_ignored(self):
        kiosk = (ROOT / 'system/libexec/atlas-screen-kiosk-session').read_text()
        self.assertIn('/atlas-screen/chrome-profile', kiosk)
        desktop = (ROOT / '.atlas/atlas-desktop/bin/open-chrome').read_text()
        self.assertIn('ROOT="/home/atlas/.atlas/atlas-desktop"', desktop)
        self.assertIn('--user-data-dir="$ROOT/chrome-profile"', desktop)
        self.assertIn('chrome-profile/', (ROOT / '.gitignore').read_text().splitlines())

    def test_microphone_permission_only_for_local_webscreen(self):
        policy = json.loads((ROOT / 'system/etc/opt/chrome/policies/managed/atlas-webscreen.json').read_text())
        self.assertEqual(policy['AudioCaptureAllowedUrls'], ['http://localhost:5000'])

    def test_desktop_close_cannot_kill_kiosk_by_process_name(self):
        source = (ROOT / 'atlas-commands/atlas-desktop').read_text()
        close = source.split('nuke_desktop() {', 1)[1].split('capture_screenshot()', 1)[0]
        for line in close.splitlines():
            if 'pkill ' in line:
                self.assertIn('--user-data-dir=$ROOT/chrome-profile', line)
                self.assertNotIn(' -x ', line)


if __name__ == '__main__':
    unittest.main()
