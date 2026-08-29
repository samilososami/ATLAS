import importlib.machinery
import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "system/libexec/atlas-nmap-report"
loader = importlib.machinery.SourceFileLoader("atlas_nmap_report", str(SCRIPT))
spec = importlib.util.spec_from_loader("atlas_nmap_report", loader)
report = importlib.util.module_from_spec(spec)
loader.exec_module(report)


class NmapReportTests(unittest.TestCase):
    def test_xml_parser_extracts_identity_and_services(self):
        xml = """<?xml version='1.0'?><nmaprun><host><status state='up'/>
        <address addr='192.168.1.20' addrtype='ipv4'/>
        <address addr='AA:BB:CC:DD:EE:FF' addrtype='mac' vendor='Example'/>
        <hostnames><hostname name='windows-pc'/></hostnames><ports>
        <port protocol='tcp' portid='445'><state state='open'/>
        <service name='microsoft-ds' product='Windows'/></port></ports>
        </host></nmaprun>"""
        parsed = report.host_records(xml)
        host = parsed["192.168.1.20"]
        self.assertEqual(host["mac"], "AA:BB:CC:DD:EE:FF")
        self.assertEqual(host["hostnames"], ["windows-pc"])
        self.assertEqual(report.likely_device(host), "probable Windows system")

    def test_automatic_profile_is_bounded(self):
        source = SCRIPT.read_text(encoding="utf-8")
        automatic = source.split("def automatic_scan", 1)[1].split("def deep_scan", 1)[0]
        self.assertIn('"--top-ports", "100"', automatic)
        self.assertNotIn('"-p-"', automatic)
        deep = source.split("def deep_scan", 1)[1]
        self.assertIn('"-p-"', deep)
        self.assertIn("address.is_private", deep)

    def test_router_signature_wins_over_optional_samba_ports(self):
        host = {
            "vendor": "ZTE",
            "ports": [
                {"port": "53", "protocol": "tcp", "service": "domain"},
                {"port": "80", "protocol": "tcp", "service": "http"},
                {"port": "445", "protocol": "tcp", "service": "microsoft-ds"},
            ],
        }
        self.assertEqual(report.likely_device(host), "probable router or network appliance")

    def test_timer_runs_every_ten_minutes(self):
        timer = (ROOT / "system/systemd/atlas-nmap-report.timer").read_text(encoding="utf-8")
        self.assertIn("OnUnitActiveSec=10m", timer)


if __name__ == "__main__":
    unittest.main()
