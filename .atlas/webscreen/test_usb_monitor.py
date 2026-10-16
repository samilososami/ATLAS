import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from display_state import DisplayState
from usb_monitor import UsbMonitor


class UsbTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.events = []
        self.detaches = []
        self.monitor = UsbMonitor(lambda: self.events.append('attach'), self.root,
                                  on_detach=lambda: self.detaches.append('detach'))

    def device(self, name, device_class='00', vendor='1234', product='5678', removable='unknown', devnum=1):
        path = self.root / name
        path.mkdir()
        (path / 'idVendor').write_text(vendor + '\n')
        (path / 'idProduct').write_text(product + '\n')
        (path / 'removable').write_text(removable + '\n')
        (path / 'devnum').write_text(str(devnum) + '\n')
        (path / 'bDeviceClass').write_text(device_class + '\n')

    def event(self, name, action='add', device_type='usb_device', sender=0):
        message = f'ACTION={action}\0SUBSYSTEM=usb\0DEVTYPE={device_type}\0DEVPATH=/devices/usb1/{name}\0'
        self.monitor.accept(message.encode(), sender)

    def test_startup_hubs_interfaces_duplicates_and_userspace_are_silent(self):
        self.device('1-1')
        self.device('usb1', '09')
        self.device('1-2', '09')
        self.monitor.rescan(announce=False)
        self.event('1-1')
        self.event('usb1')
        self.event('1-2')
        self.event('1-1:1.0', device_type='usb_interface')
        self.device('1-3')
        self.event('1-3', sender=1234)
        self.assertEqual(self.events, [])
        self.event('1-3')
        self.event('1-3')
        self.assertEqual(self.events, ['attach'])
        self.event('1-3', action='remove')
        self.event('1-3', action='remove')
        self.event('usb1', action='remove')
        self.assertEqual(self.detaches, ['detach'])
        self.event('1-3')
        self.assertEqual(self.events, ['attach', 'attach'])

    def test_fallback_scans_only_announce_new_devices(self):
        self.device('1-1')
        self.monitor.rescan(announce=False)
        self.monitor.rescan()
        self.assertEqual(self.events, [])
        self.device('1-2')
        self.device('1-3')
        self.monitor.rescan()
        self.monitor.rescan()
        self.assertEqual(self.events, ['attach'])

    def test_microphone_and_external_hub_count_but_screen_and_fixed_devices_do_not(self):
        self.monitor.rescan(announce=False)
        self.device('3-1', vendor='1a86', product='e5e3')
        self.event('3-1')
        self.device('1-1', removable='fixed')
        self.event('1-1')
        self.assertEqual(self.events, [])
        self.device('3-2', vendor='4c4a', product='4155')
        self.event('3-2')
        self.assertEqual(self.events, ['attach'])
        self.device('3-3', device_class='09')
        self.event('3-3')
        self.assertEqual(self.events, ['attach', 'attach'])
        self.monitor.rescan()
        self.assertEqual(len(self.events), 2)

    def test_reconciliation_reports_a_missed_disconnect_only_once(self):
        self.device('3-2')
        self.monitor.rescan(announce=False)
        device = self.root / '3-2'
        for attribute in device.iterdir():
            attribute.unlink()
        device.rmdir()
        self.monitor.rescan()
        self.monitor.rescan()
        self.assertEqual(self.detaches, ['detach'])

    def test_rapid_attach_detach_changes_direction_without_burst_suppression(self):
        state = DisplayState(self.root / 'mode.json', clock=lambda: 10)
        attached = state.action({'action': 'preview_usb'})
        detached = state.action({'action': 'preview_usb_remove'})
        self.assertEqual(detached['usb']['kind'], 'detached')
        self.assertNotEqual(detached['usb']['id'], attached['usb']['id'])
        self.assertEqual(state.action({'action': 'preview_usb_remove'})['usb']['id'], detached['usb']['id'])
        self.assertEqual(state.action({'action': 'preview_usb'})['usb']['kind'], 'attached')

    def test_delayed_enumeration_and_missed_replug_are_reconciled_once(self):
        self.monitor.rescan(announce=False)
        self.event('3-2')  # Kernel event arrives before attributes can be read.
        self.assertEqual(self.events, [])
        self.device('3-2', devnum=2)
        self.monitor.rescan()
        self.assertEqual(self.events, ['attach'])
        self.event('3-2')
        self.assertEqual(len(self.events), 1)
        (self.root / '3-2' / 'devnum').write_text('3\n')
        self.monitor.rescan()  # No remove event was received.
        self.monitor.rescan()
        self.assertEqual(len(self.events), 2)

    def test_preview_is_ephemeral_and_rejects_extra_arguments(self):
        state = DisplayState(self.root / 'mode.json')
        state.action({'action': 'set', 'mode': 'clock'})
        saved = state.path.read_bytes()
        preview = state.action({'action': 'preview_usb'})
        self.assertEqual(preview['mode'], 'clock')
        self.assertEqual(preview['usb']['ageMs'], 0)
        self.assertEqual(state.path.read_bytes(), saved)
        with self.assertRaises(ValueError):
            state.action({'action': 'preview_usb', 'mode': 'face'})

    def test_attachment_wakes_feed_without_changing_or_persisting_clock(self):
        now = [10.0]
        display = DisplayState(self.root / 'mode.json', clock=lambda: now[0])
        display.action({'action': 'set', 'mode': 'clock'})
        saved = display.path.read_bytes()
        before = display.action({'action': 'status'})
        admitted = threading.Event()
        with ThreadPoolExecutor(1) as pool:
            waiter = pool.submit(display.wait, before['cursor'], admitted.set)
            self.assertTrue(admitted.wait(1))
            display.usb_attached()
            after = waiter.result(1)
        self.assertEqual(after['mode'], 'clock')
        self.assertNotEqual(before['usb']['id'], after['usb']['id'])
        self.assertEqual(after['usb']['ageMs'], 0)
        display.usb_attached()
        self.assertEqual(display.action({'action': 'status'})['usb']['id'], after['usb']['id'])
        now[0] += 5
        self.assertEqual(display.action({'action': 'status'})['usb']['ageMs'], 5000)
        self.assertEqual(saved, display.path.read_bytes())
        restarted = DisplayState(display.path)
        self.assertIsNone(restarted.action({'action': 'status'})['usb']['ageMs'])


if __name__ == '__main__':
    unittest.main()
