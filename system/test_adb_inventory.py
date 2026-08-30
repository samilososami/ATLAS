import importlib.machinery
import importlib.util
import tempfile
import unittest
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
