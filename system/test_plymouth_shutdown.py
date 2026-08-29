import struct
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PlymouthShutdown(unittest.TestCase):
    def test_poweroff_art_is_exact_screen_size(self):
        image = ROOT / "system/plymouth/atlas/atlas-powering-off.png"
        with image.open("rb") as stream:
            self.assertEqual(stream.read(8), b"\x89PNG\r\n\x1a\n")
            length = struct.unpack(">I", stream.read(4))[0]
            self.assertEqual(stream.read(4), b"IHDR")
            width, height = struct.unpack(">II", stream.read(8))
        self.assertGreaterEqual(length, 13)
        self.assertEqual((width, height), (1024, 600))

    def test_theme_uses_farewell_art_for_shutdown_and_reboot(self):
        script = (ROOT / "system/plymouth/atlas/atlas.script").read_text()
        self.assertIn('Plymouth.GetMode() == "boot"', script)
        self.assertIn('Plymouth.GetMode() == "shutdown"', script)
        self.assertIn('Plymouth.GetMode() == "reboot"', script)
        self.assertIn('Plymouth.GetMode() == "shutdown" || Plymouth.GetMode() == "reboot"', script)
        self.assertIn('shutdown_art = Image("atlas-powering-off.png")', script)
        self.assertIn("shutdown_art_sprite.SetOpacity(1)", script)

    def test_poweroff_helper_enforces_minimum_delay(self):
        helper = (ROOT / "system/libexec/atlas-plymouth-poweroff").read_text()
        self.assertIn("/usr/bin/plymouth show-splash", helper)
        self.assertIn("/usr/bin/sleep 1.5", helper)
        self.assertIn("screen_is_on", helper)
        self.assertNotIn("printf on", helper)
        self.assertNotIn("/sys/class/graphics/fb0/blank", helper)
        for name in ("plymouth-poweroff", "plymouth-halt", "plymouth-reboot"):
            drop_in = ROOT / f"system/systemd/{name}.service.d/atlas-minimum.conf"
            text = drop_in.read_text()
            self.assertIn("atlas-plymouth-poweroff", text)
            self.assertIn("ExecCondition=/usr/local/libexec/atlas-plymouth-poweroff screen-is-on", text)
            self.assertIn("--tty=/dev/tty1", text)
            self.assertIn("--graphical-boot", text)


if __name__ == "__main__":
    unittest.main()
