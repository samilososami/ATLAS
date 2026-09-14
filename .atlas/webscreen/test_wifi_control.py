import unittest

import wifi_control as wifi


class FakeNmcli:
    def __init__(self, *, connect_code=0):
        self.calls = []
        self.connect_code = connect_code

    def __call__(self, arguments, timeout):
        self.calls.append((arguments, timeout))
        if arguments[:3] == ["radio", "wifi", "on"]:
            return 0, "", ""
        if "DEVICE,TYPE,STATE" in arguments:
            return 0, "wlan0:wifi:connected\np2p-dev-wlan0:wifi-p2p:disconnected", ""
        if "IN-USE,SSID,SIGNAL,SECURITY" in arguments:
            return 0, "*:casa\\:5G:74:WPA2\n:abierta:31:\n:casa\\:5G:50:WPA2", ""
        if "connect" in arguments:
            return self.connect_code, "connected" if not self.connect_code else "", "bad password"
        raise AssertionError(arguments)


class WifiControlTests(unittest.TestCase):
    def test_split_nmcli_preserves_escaped_values(self):
        self.assertEqual(wifi.split_nmcli(r"*:casa\:red\\wifi:80:WPA2"),
                         ["*", "casa:red\\wifi", "80", "WPA2"])

    def test_scan_deduplicates_and_marks_active_network(self):
        result = wifi.scan_networks(FakeNmcli())
        self.assertEqual(result["interface"], "wlan0")
        self.assertEqual(result["active"], "casa:5G")
        self.assertEqual([item["ssid"] for item in result["networks"]], ["casa:5G", "abierta"])
        self.assertTrue(result["networks"][0]["secured"])
        self.assertFalse(result["networks"][1]["secured"])

    def test_connect_uses_argv_without_a_shell_and_redacts_password_errors(self):
        fake = FakeNmcli(connect_code=1)
        with self.assertRaisesRegex(wifi.WifiControlError, "bad password"):
            wifi.connect_network("test", "12345678", fake)
        connect = next(arguments for arguments, _ in fake.calls if "connect" in arguments)
        self.assertEqual(connect[-2:], ["password", "12345678"])
        self.assertNotIn("bash", connect)

    def test_connect_returns_a_fresh_snapshot_without_deadlocking(self):
        result = wifi.connect_network("casa:5G", "12345678", FakeNmcli())
        self.assertTrue(result["connected"])
        self.assertEqual(result["active"], "casa:5G")

    def test_connect_validates_untrusted_values_before_networkmanager(self):
        fake = FakeNmcli()
        for ssid, password in [("", "12345678"), ("x\nname", "12345678"), ("test", "x\nsecret")]:
            with self.subTest(ssid=ssid):
                with self.assertRaises(wifi.WifiControlError):
                    wifi.connect_network(ssid, password, fake)
        self.assertEqual(fake.calls, [])

    def test_open_network_failure_is_reported_without_empty_secret_replacement(self):
        with self.assertRaisesRegex(wifi.WifiControlError, "bad password"):
            wifi.connect_network("abierta", "", FakeNmcli(connect_code=1))


if __name__ == "__main__":
    unittest.main()
