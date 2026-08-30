import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOGGER = ROOT / "system/libexec/atlas-rafas-logger"


class RafasLogger(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.state = Path(self.temporary.name) / "rafas"
        self.boot_id = Path(self.temporary.name) / "boot-id"
        self.boot_id.write_text("boot-one\n")
        self.environment = os.environ | {
            "ATLAS_RAFAS_STATE_DIR": str(self.state),
            "ATLAS_RAFAS_OWNER": str(os.getuid()),
            "ATLAS_RAFAS_GROUP": str(os.getgid()),
            "ATLAS_BOOT_ID_FILE": str(self.boot_id),
            "ATLAS_THROTTLED_STATE": "0x0",
        }

    def tearDown(self):
        self.temporary.cleanup()

    def run_logger(self, command, **extra):
        return subprocess.run(
            ["bash", str(LOGGER), command],
            env=self.environment | extra,
            capture_output=True,
            text=True,
        )

    def power_log(self):
        return (self.state / "logs/power.log").read_text()

    def test_first_observation_creates_active_marker(self):
        result = self.run_logger("boot")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("event=MONITOR_STARTED", self.power_log())
        self.assertIn("previous=unknown_first_observation", self.power_log())
        self.assertIn("BOOT_ID=boot-one", (self.state / "boot-active.state").read_text())
        self.assertIn("STATE=active", (self.state / "boot-active.state").read_text())

    def test_old_active_marker_is_classified_as_unclean(self):
        self.run_logger("boot")
        self.boot_id.write_text("boot-two\n")
        result = self.run_logger("boot")
        self.assertEqual(result.returncode, 0, result.stderr)
        log = self.power_log()
        self.assertIn("event=UNCLEAN_PREVIOUS_SHUTDOWN", log)
        self.assertIn("previous_boot_id=boot-one", log)
        self.assertIn("reason=power_loss_forced_reset_or_crash", log)

    def test_same_boot_is_a_monitor_restart_not_a_power_loss(self):
        self.run_logger("boot")
        self.run_logger("boot")
        self.assertIn("event=MONITOR_RESTARTED", self.power_log())
        self.assertNotIn("event=UNCLEAN_PREVIOUS_SHUTDOWN", self.power_log())

    def test_clean_shutdown_removes_active_marker(self):
        self.run_logger("boot")
        result = self.run_logger(
            "stop",
            ATLAS_SYSTEM_STATE="stopping",
            ATLAS_SHUTDOWN_KIND="poweroff",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.state / "boot-active.state").exists())
        self.assertIn("event=CLEAN_SHUTDOWN", self.power_log())
        self.assertIn("kind=poweroff", self.power_log())
        self.assertTrue((self.state / "last-clean-shutdown.state").exists())

    def test_manual_monitor_stop_does_not_claim_clean_shutdown(self):
        self.run_logger("boot")
        self.run_logger("stop", ATLAS_SYSTEM_STATE="running")
        self.assertIn("event=MONITOR_STOPPED", self.power_log())
        self.assertIn("STATE=monitor_stopped", (self.state / "boot-active.state").read_text())

    def test_undervoltage_flags_are_decoded(self):
        result = self.run_logger("power-sample", ATLAS_THROTTLED_STATE="0x10001")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("status=undervoltage_now,undervoltage_seen", self.power_log())


if __name__ == "__main__":
    unittest.main()
