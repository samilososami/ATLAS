"""Pure CLI/cursor tests: never touch the display, systemd or user settings."""
import importlib.machinery
import importlib.util
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader('cursor', str(ROOT / 'system/libexec/atlas-screen-cursor'))
spec = importlib.util.spec_from_loader(loader.name, loader)
cursor = importlib.util.module_from_spec(spec)
loader.exec_module(cursor)


class ScreenCLI(unittest.TestCase):
    def call(self, *args):
        script = '''source "$1"
shift
save_mode() { echo "SAVE:$1"; }
screen_on() { echo ON; }
screen_off() { echo OFF; }
print_status() { echo STATUS; }
main "$@"
'''
        return subprocess.run(['bash', '-c', script, 'test', str(ROOT / 'atlas-commands/atlas-screen'), *args], capture_output=True, text=True)

    def test_all_modes_and_both_orders(self):
        for mode in ('atlas', 'terminal', 'desktop', 'rafas'):
            for args in ((f'--{mode}', '--on'), ('on', f'--{mode}')):
                with self.subTest(args=args):
                    result = self.call(*args)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn('SAVE:' + mode, result.stdout)
                    self.assertTrue(result.stdout.endswith('ON\n'))

    def test_select_does_not_power_on(self):
        self.assertEqual(self.call('--atlas').stdout.splitlines()[-1], 'STATUS')
        self.assertEqual(self.call('--rafas').stdout.splitlines()[-1], 'STATUS')
        self.assertEqual(self.call('--RAFAS', '--on').stdout.splitlines()[-1], 'ON')

    def test_legacy_power_and_status(self):
        for args, expected in (((), 'STATUS\n'), (('off',), 'OFF\n'), (('--off',), 'OFF\n'), (('on',), 'ON\n')):
            self.assertEqual(self.call(*args).stdout, expected)

    def test_invalid_requests_do_nothing(self):
        for args in (('--atlas', '--terminal'), ('--atlas', '--rafas'), ('--rafas', '--RAFAS', '--atlas'), ('--desktop', '--on', '--off'), ('on', 'surprise')):
            result = self.call(*args)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, '')

    def test_duplicate_same_value_is_safe(self):
        self.assertEqual(self.call('--atlas', '--atlas', 'on', '--on').stdout.count('SAVE:'), 1)


class CursorDetection(unittest.TestCase):
    def test_real_mice(self):
        for bus in ('usb', 'bluetooth'):
            self.assertTrue(cursor.mouse_present(['test'], lambda _: 'ID_INPUT_MOUSE=1\nID_BUS=' + bus))

    def test_touch_and_virtual_pointers_do_not_count(self):
        for props in ('ID_INPUT_MOUSE=1\nID_INPUT_TOUCHSCREEN=1\nID_BUS=usb',
                      'ID_INPUT_TOUCHSCREEN=1\nID_BUS=usb', 'ID_INPUT_MOUSE=1', ''):
            self.assertFalse(cursor.mouse_present(['test'], lambda _: props))

    def test_disconnect_during_query(self):
        def missing(_):
            raise FileNotFoundError()
        self.assertFalse(cursor.mouse_present(['test'], missing))
        self.assertFalse(cursor.mouse_present([]))


class RecoveryBanner(unittest.TestCase):
    def test_plain_banner_fits_native_console(self):
        banner = (ROOT / 'system/share/atlas/rafas-banner.txt').read_text()
        self.assertNotIn('\x1b', banner)
        self.assertTrue(banner.startswith('\n\n'))
        self.assertLessEqual(max(map(len, banner.splitlines())), 102)
        self.assertLess(len(banner.splitlines()), 29)  # Leave room for the prompt.
        self.assertIn('Recovery Access For ATLAS Systems', banner)


if __name__ == '__main__':
    unittest.main()
