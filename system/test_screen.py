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
enable_boot_screen() { echo "ENABLE:$1"; }
disable_boot_screen() { echo DISABLE; }
selected_boot_mode() { echo last; }
boot_screen_on() { echo BOOT; }
main "$@"
'''
        return subprocess.run(['bash', '-c', script, 'test', str(ROOT / 'atlas-commands/atlas-screen'), *args], capture_output=True, text=True)

    def test_all_modes_and_both_orders(self):
        for mode in ('atlas', 'atlas-hide', 'terminal', 'desktop', 'rafas'):
            for args in ((f'--{mode}', 'on'), ('on', f'--{mode}')):
                with self.subTest(args=args):
                    result = self.call(*args)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn('SAVE:' + mode, result.stdout)
                    self.assertTrue(result.stdout.endswith('ON\n'))

    def test_mode_alone_switches_immediately(self):
        for mode in ('atlas', 'atlas-hide', 'rafas', 'desktop', 'terminal'):
            self.assertEqual(self.call('--' + mode).stdout, 'SAVE:' + mode + '\nON\n')
        self.assertEqual(self.call('--RAFAS').stdout, 'SAVE:rafas\nON\n')

    def test_power_and_status(self):
        for args, expected in (((), 'STATUS\n'), (('off',), 'OFF\n'), (('on',), 'ON\n')):
            self.assertEqual(self.call(*args).stdout, expected)

    def test_enable_fixed_mode_does_not_switch_current_surface(self):
        for mode in ('atlas', 'atlas-hide', 'rafas', 'desktop', 'terminal', 'last'):
            for args in (('enable', '--' + mode), ('--' + mode, 'enable')):
                result = self.call(*args)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, 'ENABLE:' + mode + '\n')

    def test_enable_default_and_disable(self):
        self.assertEqual(self.call('enable').stdout, 'ENABLE:last\n')
        self.assertEqual(self.call('disable').stdout, 'DISABLE\n')

    def test_internal_boot_entry(self):
        self.assertEqual(self.call('boot').stdout, 'BOOT\n')

    def test_mode_and_off_selects_without_starting_surface(self):
        self.assertEqual(self.call('--atlas', 'off').stdout, 'SAVE:atlas\nOFF\n')

    def test_invalid_requests_do_nothing(self):
        for args in (('--atlas', '--terminal'), ('--atlas', '--rafas'),
                     ('--rafas', '--RAFAS', '--atlas'), ('--desktop', 'on', 'off'),
                     ('on', 'surprise'), ('--on',), ('--off',),
                     ('enable', '--last', '--atlas'), ('enable', 'disable'),
                     ('disable', '--atlas'), ('--last',), ('on', '--last'),
                     ('boot', '--atlas')):
            result = self.call(*args)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, '')

    def test_duplicate_same_value_is_safe(self):
        self.assertEqual(self.call('--atlas', '--atlas', 'on', 'on').stdout.count('SAVE:'), 1)

    def test_mode_only_switch_leaves_its_own_terminal_cgroup_first(self):
        script = '''source "$1"
grep() { return 0; }
systemd-run() { printf 'DELEGATED:%s\\n' "$*"; }
save_mode() { echo UNEXPECTED_SAVE; }
screen_on() { echo UNEXPECTED_START; }
main --atlas
'''
        result = subprocess.run(['bash', '-c', script, 'test', str(ROOT / 'atlas-commands/atlas-screen')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('DELEGATED:', result.stdout)
        self.assertIn('/usr/local/bin/atlas-screen --atlas', result.stdout)
        self.assertNotIn('UNEXPECTED', result.stdout)

    def test_last_boot_status_remains_parseable_by_atlas_status(self):
        script = '''source "$1"
selected_mode() { echo terminal; }
selected_boot_mode() { echo last; }
connector_path() { return 1; }
systemctl() { [[ "$1" == is-enabled ]]; }
print_status | awk -F': ' '$1 == "Boot default" { print $2 }'
'''
        result = subprocess.run(['bash', '-c', script, 'test', str(ROOT / 'atlas-commands/atlas-screen')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'on (last -> terminal)\n')


class BootSelection(unittest.TestCase):
    def call(self, policy, last_mode):
        script = '''source "$1"
test_policy="$2"
test_last="$3"
selected_boot_mode() { echo "$test_policy"; }
selected_mode() { echo "$test_last"; }
save_mode() { test_last="$1"; echo "SAVE:$1"; }
screen_on() { echo "ON:$(selected_mode)"; }
boot_screen_on
'''
        return subprocess.run(['bash', '-c', script, 'test', str(ROOT / 'atlas-commands/atlas-screen'), policy, last_mode], capture_output=True, text=True)

    def test_last_tracks_the_runtime_mode(self):
        for mode in ('atlas', 'atlas-hide', 'rafas', 'desktop', 'terminal'):
            self.assertEqual(self.call('last', mode).stdout, 'ON:' + mode + '\n')

    def test_fixed_boot_mode_is_independent_of_last_runtime_mode(self):
        self.assertEqual(self.call('atlas', 'terminal').stdout, 'SAVE:atlas\nON:atlas\n')


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

    def test_console_reveals_every_banner_line_at_one_tenth(self):
        console = ROOT / 'system/libexec/atlas-rafas-console'
        banner_path = ROOT / 'system/share/atlas/rafas-banner.txt'
        script = r'''source "$1"
sleep() { printf 'delay:%s\n' "$1" >&2; }
render_banner "$2"
'''
        result = subprocess.run(
            ['bash', '-c', script, 'test', str(console), str(banner_path)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = '\x1b[?25l' + banner_path.read_text() + '\x1b[?25h'
        self.assertEqual(result.stdout, expected)
        delays = result.stderr.splitlines()
        self.assertEqual(len(delays), len(banner_path.read_text().splitlines()) - 1)
        self.assertTrue(all(delay == 'delay:0.1' for delay in delays))


if __name__ == '__main__':
    unittest.main()
