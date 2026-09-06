import importlib.machinery
import importlib.util
import tempfile
import subprocess
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str, module_name: str):
    path = ROOT / "system/libexec" / name
    loader = importlib.machinery.SourceFileLoader(module_name, str(path))
    spec = importlib.util.spec_from_loader(module_name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


inventory = load_script("atlas-adb-inventory", "atlas_adb_inventory")
monitor = load_script("atlas-adb-monitor", "atlas_adb_monitor")


class AdbMonitorTests(unittest.TestCase):
    def test_only_ready_transports_enter_inventory(self):
        result = SimpleNamespace(returncode=0, stdout='List of devices attached\nready\tdevice\nwaiting\tunauthorized\ngone\toffline\n')
        with patch.object(monitor.subprocess, 'run', return_value=result):
            self.assertEqual(monitor.connected_devices(), {'ready'})

    def test_server_error_preserves_state(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(monitor, 'ROOT', Path(directory)), \
             patch.object(monitor, 'connected_devices', side_effect=RuntimeError('offline')), \
             patch.object(monitor, 'save_state') as save:
            self.assertEqual(monitor.main(), 1)
            save.assert_not_called()

    def test_failed_inventory_is_retried_instead_of_recorded(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(monitor, 'ROOT', Path(directory)), \
             patch.object(monitor, 'connected_devices', return_value={'ok', 'fail', 'old'}), \
             patch.object(monitor, 'previous_devices', return_value={'old'}), \
             patch.object(monitor, 'save_state') as save, \
             patch.object(monitor.subprocess, 'run') as run:
            run.side_effect = lambda args, **kw: SimpleNamespace(returncode=1 if args[-1] == 'fail' else 0)
            self.assertEqual(monitor.main(), 1)
            save.assert_called_once_with({'old', 'ok'})

    def test_inventory_timeout_keeps_other_transports(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(monitor, 'ROOT', Path(directory)), \
             patch.object(monitor, 'connected_devices', return_value={'new', 'old'}), \
             patch.object(monitor, 'previous_devices', return_value={'old'}), \
             patch.object(monitor, 'save_state') as save, \
             patch.object(monitor.subprocess, 'run', side_effect=subprocess.TimeoutExpired('inventory', 90)):
            self.assertEqual(monitor.main(), 1)
            save.assert_called_once_with({'old'})


class AdbInventoryTests(unittest.TestCase):
    def test_mac_validation_rejects_android_placeholder(self):
        self.assertEqual(inventory.valid_mac("link/ether 02:00:00:00:00:00"), "")
        self.assertEqual(
            inventory.valid_mac("lladdr aa:bb:cc:dd:ee:ff REACHABLE"),
            "AA:BB:CC:DD:EE:FF",
        )

    def test_same_mac_replaces_old_filename(self):
        properties = "\n".join([
            "[ro.product.manufacturer]: [Sony]",
            "[ro.product.model]: [BRAVIA 4K]",
            "[ro.product.device]: [bravia]",
            "[ro.build.characteristics]: [tv]",
            "[ro.build.version.release]: [12]",
        ])
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(inventory, "ROOT", Path(directory)), \
             patch.object(inventory, "DEVICES_DIR", Path(directory) / "devices"), \
             patch.object(inventory, "wait_for_device", return_value=True), \
             patch.object(inventory, "neighbour_mac", return_value="AA:BB:CC:DD:EE:FF"), \
             patch.object(inventory, "adb") as adb:
            adb.side_effect = lambda serial, *args, **kwargs: (
                properties if args == ("shell", "getprop") else
                "SERIAL" if args == ("get-serialno",) else ""
            )
            devices = Path(directory) / "devices"
            devices.mkdir()
            old = devices / "AA:BB:CC:DD:EE:FF_Old-tv_tv.md"
            old.write_text(
                "# Old inventory\n\n# NOTES\n\n- Launch Prime Video with the component intent.\n",
                encoding="utf-8",
            )
            destination = inventory.inventory("192.168.1.50:5555")
            self.assertTrue(destination.exists())
            self.assertFalse(old.exists())
            self.assertEqual(len(list(devices.glob("AA:BB:CC:DD:EE:FF_*.md"))), 1)
            report = destination.read_text(encoding="utf-8")
            self.assertIn("# NOTES\n\n- Launch Prime Video with the component intent.", report)

            destination.write_text(
                report.replace(
                    "- Launch Prime Video with the component intent.",
                    "- Use the component intent to launch Prime Video; the launcher intent fails on this television.",
                ),
                encoding="utf-8",
            )
            refreshed = inventory.inventory("192.168.1.50:5555").read_text(encoding="utf-8")
            self.assertEqual(refreshed.count("# NOTES"), 1)
            self.assertIn("the launcher intent fails on this television", refreshed)

    def test_new_report_contains_notes_section(self):
        properties = "\n".join([
            "[ro.product.manufacturer]: [Google]",
            "[ro.product.model]: [Pixel]",
            "[ro.build.characteristics]: [phone]",
        ])
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(inventory, "ROOT", Path(directory)), \
             patch.object(inventory, "DEVICES_DIR", Path(directory) / "devices"), \
             patch.object(inventory, "wait_for_device", return_value=True), \
             patch.object(inventory, "neighbour_mac", return_value="11:22:33:44:55:66"), \
             patch.object(inventory, "adb") as adb:
            adb.side_effect = lambda serial, *args, **kwargs: (
                properties if args == ("shell", "getprop") else
                "PIXEL-SERIAL" if args == ("get-serialno",) else ""
            )
            report = inventory.inventory("usb-pixel").read_text(encoding="utf-8")
            self.assertTrue(report.endswith("# NOTES\n\n_No device-specific notes recorded yet._\n"))

    def test_wrapper_calls_real_adb_without_mutating_commands(self):
        wrapper = (ROOT / "system/bin/adb").read_text(encoding="utf-8")
        self.assertIn("REAL_ADB=/usr/bin/adb", wrapper)
        self.assertIn('case "${1:-}"', wrapper)
        self.assertIn("connect)", wrapper)
        self.assertNotIn("input keyevent", wrapper)


if __name__ == "__main__":
    unittest.main()
