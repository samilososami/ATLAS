"""Installer regression fixtures use temporary roots, never /usr/local or live Pi files."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ('server.py', 'access_control.py', 'gateway_bridge.mjs', 'README.md',
          'NEW_DESIGN.md', 'CLAP.md', 'static/access.js', 'static/clap.js',
          'static/app.js', 'static/index.html', 'static/navigation.js', 'static/realtime.js', 'static/styles.css',
          'static/new/face.css', 'static/new/face.js', 'static/new/audio.js',
          'static/new/petting.js', 'static/new/logo.png', 'static/new/atlas-wordmark.svg')
SYSTEM = ('atlas-commands/atlas-screen', 'atlas-commands/atlas-webscreen', 'system/libexec/atlas-screen-kiosk-session',
          'system/libexec/atlas-screen-browser-watchdog.cjs')


class WebScreenInstaller(unittest.TestCase):
    def test_nested_public_assets_backup_and_system_helpers_without_private_overwrite(self):
        if os.geteuid() != 0:
            allowed = subprocess.run(['sudo', '-n', 'true'], capture_output=True).returncode == 0
            if not allowed:
                self.skipTest('root or noninteractive sudo required for ownership fixture')
        with tempfile.TemporaryDirectory(prefix='atlas-install-test-') as temp:
            fixture = Path(temp)
            repo, home, system = fixture / 'repo', fixture / 'home', fixture / 'system-root'
            runtime = home / '.atlas/webscreen'
            runtime.mkdir(parents=True)
            (runtime / 'start.sh').write_text('existing runtime')
            (runtime / 'settings.json').write_text('private settings stay')
            (runtime / 'REALTIME_INSTRUCTIONS.md').write_text('private context stays')
            (runtime / 'static/new').mkdir(parents=True)
            (runtime / 'static/new/face.js').write_text('previous face')
            for path in PUBLIC:
                file = repo / '.atlas/webscreen' / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('public fixture: ' + path)
            for path in SYSTEM:
                file = repo / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('system fixture: ' + path)
            install = repo / 'system/install-webscreen-resilience.sh'
            shutil.copyfile(ROOT / 'system/install-webscreen-resilience.sh', install)
            command = ['env', f'ATLAS_HOME={home}', f'ATLAS_SYSTEM_ROOT={system}',
                       'bash', str(install)]
            if os.geteuid() != 0:
                command = ['sudo', '-n', *command]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((runtime / 'settings.json').read_text(), 'private settings stay')
            self.assertEqual((runtime / 'REALTIME_INSTRUCTIONS.md').read_text(), 'private context stays')
            for path in PUBLIC:
                file = runtime / path
                self.assertEqual(file.read_text(), 'public fixture: ' + path)
                self.assertEqual(file.stat().st_mode & 0o777, 0o644)
            backup = next((home / '.atlas/backups').iterdir())
            self.assertEqual((backup / 'static/new/face.js').read_text(), 'previous face')
            helper = system / 'usr/local/libexec/atlas-screen-browser-watchdog.cjs'
            self.assertTrue(helper.is_file())
            self.assertEqual(helper.stat().st_mode & 0o777, 0o755)
            self.assertTrue((system / 'usr/local/bin/atlas-screen').is_file())
            self.assertTrue((system / 'usr/local/bin/atlas-webscreen').is_file())
            # Root-owned backup descendants are private. Return this *fixture*
            # to the test runner for ordinary TemporaryDirectory cleanup.
            if os.geteuid() != 0:
                subprocess.run(['sudo', '-n', 'chown', '-R', str(os.getuid()), str(fixture)], check=True)


if __name__ == '__main__':
    unittest.main()
