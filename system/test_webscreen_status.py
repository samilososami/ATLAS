"""Read-only command output fixtures; never contact a real system service."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class WebScreenStatus(unittest.TestCase):
    def status(self, addresses):
        with tempfile.TemporaryDirectory(prefix="atlas-status-fixture-") as temp:
            mocks = {
                "hostname": 'printf "%s\\n" "$TEST_ADDRESSES"',
                "systemctl": 'if [ "$1" = show ]; then printf "123\\n"; fi',
                "ss": "exit 0",
                "curl": 'printf \'{"ready":true}\\n\'',
            }
            for name, body in mocks.items():
                script = Path(temp) / name
                script.write_text("#!/bin/sh\n" + body + "\n")
                script.chmod(0o755)
            result = subprocess.run(
                ["bash", str(ROOT / "atlas-commands/atlas-webscreen"), "status"],
                env={**os.environ, "PATH": temp + os.pathsep + os.environ["PATH"],
                     "TEST_ADDRESSES": addresses, "ATLAS_NO_COLOR": "1"},
                text=True, capture_output=True, check=True)
            return result.stdout

    def test_both_presentations_have_local_and_network_urls(self):
        output = self.status("192.0.2.10 192.0.2.11 ")
        self.assertIn("Local URL: http://localhost:5000\n", output)
        self.assertIn("Network URLs: http://192.0.2.10:5000 http://192.0.2.11:5000", output)
        self.assertIn("New Webscreen: http://localhost:5000/new/\n", output)
        self.assertIn("New network URLs: http://192.0.2.10:5000/new/ http://192.0.2.11:5000/new/ http://atlas-a1.local:5000/new/", output)

    def test_no_address_keeps_mdns_and_local_entry(self):
        output = self.status("")
        self.assertIn("New network URLs: http://atlas-a1.local:5000/new/", output)
        self.assertNotIn("unknown/new/", output)


if __name__ == "__main__":
    unittest.main()
