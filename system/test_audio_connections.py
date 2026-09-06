"""Bluetooth command regressions: fake radio/audio programs, no live devices."""
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'atlas-commands/atlas-audio').read_text()


def function(name, next_name):
    return SOURCE[SOURCE.index(name + '() {'):SOURCE.index(next_name + '() {')]


class AudioConnectionsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = dict(os.environ, PATH=self.temp.name + ':' + os.environ['PATH'])
        # Non-private fake identity; stdout used to be swallowed by a heredoc.
        self.program('bluetoothctl', '''#!/usr/bin/env python3
import os, sys, time
args = sys.argv[1:]
if args == ['devices']:
    print(os.environ.get('FAKE_DEVICES', 'Device AA:BB:CC:DD:EE:FF Test Soundbar'))
elif 'scan' in args:
    time.sleep(float(os.environ.get('FAKE_SCAN_SLEEP', '0')))
elif 'connect' in args:
    print('Failed to connect: org.bluez.Error.Failed br-connection-profile-unavailable')
    sys.exit(1)
''')
        self.program('pactl', '''#!/usr/bin/env python3
import sys
if sys.argv[1:] == ['list', 'sinks']:
    print('Sink #7\\n Name: physical.hdmi\\n Description: Display Speakers')
elif sys.argv[1:] == ['list', 'short', 'sinks']:
    print('8\\tbluez_output.AA_BB_CC_DD_EE_FF.1\\tPipeWire')
''')

    def program(self, name, text):
        path = Path(self.temp.name, name)
        path.write_text(text)
        path.chmod(0o755)

    def run_shell(self, definitions, invocation, **env):
        return subprocess.run(['bash', '-c', definitions + '\n' + invocation],
                              env=dict(self.env, **env), capture_output=True,
                              text=True, timeout=6)

    def test_known_name_uses_cached_records_without_scanning(self):
        result = self.run_shell('discover_bt_for_query() { echo UNEXPECTED >&2; return 9; }\n'
                                + function('resolve_bt_device', 'pair_bt_device'),
                                'resolve_bt_device "test soundbar"')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'AA:BB:CC:DD:EE:FF')
        self.assertEqual(result.stderr, '')

    def test_ambiguous_partial_name_never_scans_or_picks_first(self):
        result = self.run_shell('discover_bt_for_query() { echo UNEXPECTED >&2; return 9; }\n'
                                + function('resolve_bt_device', 'pair_bt_device'),
                                'resolve_bt_device "Test"',
                                FAKE_DEVICES='Device AA:BB:CC:DD:EE:FF Test One\nDevice 11:22:33:44:55:66 Test Two')
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')
        self.assertIn('ambiguous', result.stderr)
        self.assertNotIn('UNEXPECTED', result.stderr)

    def test_audio_sink_description_resolution_has_real_input(self):
        result = self.run_shell('resolve_bt_device() { return 1; }\n'
                                + function('resolve_sink', 'set_default_sink'),
                                'resolve_sink "Display Speakers"')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'physical.hdmi')

    def test_lowercase_mac_matches_pipewire_uppercase_sink(self):
        result = self.run_shell(function('sink_for_bt_mac', 'wait_for_bt_sink'),
                                'sink_for_bt_mac aa:bb:cc:dd:ee:ff')
        self.assertEqual(result.stdout.strip(), 'bluez_output.AA_BB_CC_DD_EE_FF.1')

    def test_silent_discovery_is_bounded(self):
        start = time.monotonic()
        result = self.run_shell('bt_power_on() { :; }\n'
                                + function('discover_bt_for_query', 'render_bt_devices'),
                                'discover_bt_for_query "Test Soundbar"',
                                ATLAS_AUDIO_AUTODISCOVER_SECONDS='1', FAKE_SCAN_SLEEP='10')
        self.assertNotEqual(result.returncode, 0)
        self.assertLess(time.monotonic() - start, 4.5)

    def test_profile_failure_does_not_reset_live_voice_or_bluetooth(self):
        result = self.run_shell('ensure_bluetooth_audio_support() { :; }\n'
                                'restart_audio_stack() { echo FORBIDDEN >&2; exit 99; }\n'
                                'sudo() { echo FORBIDDEN >&2; exit 99; }\n'
                                + function('explain_connect_failure', 'connect_bt_device')
                                + function('connect_bt_device', 'resolve_sink'),
                                'connect_bt_device AA:BB:CC:DD:EE:FF')
        self.assertEqual(result.returncode, 1)
        self.assertNotIn('FORBIDDEN', result.stderr)
        self.assertEqual(result.stdout.count('Failed to connect'), 1)
        self.assertIn('Audio Source', result.stderr)

    def test_disconnect_default_targets_audio_not_companion_bluetooth(self):
        definitions = '''bluetoothctl() {
  printf 'Device AA:BB:CC:DD:EE:FF Speaker\nDevice 11:22:33:44:55:66 Phone\n';
}
default_sink() { echo physical.hdmi; }
sink_for_bt_mac() { if [ "$1" = AA:BB:CC:DD:EE:FF ]; then echo bluez.speaker; fi; }
'''
        result = self.run_shell(definitions + function('current_audio_mac', 'toggle_output_device'),
                                'current_audio_mac')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'AA:BB:CC:DD:EE:FF')

    def test_ambiguous_connected_audio_requires_target(self):
        definitions = '''bluetoothctl() {
  printf 'Device AA:BB:CC:DD:EE:FF Speaker\nDevice 11:22:33:44:55:66 Headphones\n';
}
default_sink() { echo physical.hdmi; }
sink_for_bt_mac() { echo "bluez.$1"; }
'''
        result = self.run_shell(definitions + function('current_audio_mac', 'toggle_output_device'),
                                'current_audio_mac')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, '')

    def test_discovery_does_not_choose_ambiguous_first_advertiser(self):
        result = self.run_shell('bt_power_on() { :; }\n'
                                + function('discover_bt_for_query', 'render_bt_devices'),
                                'discover_bt_for_query "Test"',
                                ATLAS_AUDIO_AUTODISCOVER_SECONDS='1',
                                FAKE_DEVICES='Device AA:BB:CC:DD:EE:FF Test One\nDevice 11:22:33:44:55:66 Test Two')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, '')
        self.assertIn('Ambiguous', result.stderr)

    def test_headless_config_is_narrow_and_installer_does_not_reset_servers(self):
        config = (ROOT / 'system/config/wireplumber/51-atlas-headless-bluetooth.conf').read_text()
        self.assertIn('monitor.bluez.seat-monitoring = disabled', config)
        installer = (ROOT / 'system/install-device-connections.sh').read_text()
        self.assertIn('systemctl --user restart wireplumber.service', installer)
        self.assertNotIn('systemctl restart bluetooth', installer)
        self.assertNotIn('restart pipewire', installer)


if __name__ == '__main__':
    unittest.main()
