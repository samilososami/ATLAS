#!/usr/bin/env python3
"""Contract tests for the ATLAS Android command-line wrappers."""
import importlib.machinery
import importlib.util
import json
import pathlib
import base64
import tempfile
import types
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent


def load_script(name, filename):
    loader = importlib.machinery.SourceFileLoader(name, str(HERE / filename))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


ATLAS_APP = load_script("atlas_app_wrapper", "atlas-app")
ANDROID_USE = load_script("atlas_androiduse_wrapper", "atlas-androiduse")


class AtlasAppControlContractTests(unittest.TestCase):
    def test_tailscale_status_endpoint_prefers_private_ipv4(self):
        payload = {
            "BackendState": "Running",
            "Self": {
                "Online": True, "HostName": "atlas-a1",
                "TailscaleIPs": ["100.112.71.111", "fd7a:115c:a1e0::1"],
            },
            "Peer": {},
        }
        completed = types.SimpleNamespace(stdout=json.dumps(payload))
        with mock.patch.object(ATLAS_APP.subprocess, "run", return_value=completed), \
             mock.patch("shutil.which", return_value="/usr/bin/tailscale"):
            result = ATLAS_APP.tailscale_state()
        self.assertEqual(result["host"], "atlas-a1")
        self.assertEqual(result["endpoint"], "wss://100.112.71.111:5010/app")

    def test_friendly_aliases_are_normalized_to_wire_methods(self):
        expected = {
            "location": "control.location.get",
            "get_location": "control.location.get",
            "capabilities": "control.phone.capabilities",
            "call": "control.phone.call",
            "calls.place": "control.phone.call",
        }
        for operation, method in expected.items():
            with self.subTest(operation=operation):
                self.assertEqual(ATLAS_APP.normalize_control_method(operation), method)

    def test_canonical_names_and_existing_control_prefix_are_preserved(self):
        expected = {
            "location.get": "control.location.get",
            "phone.capabilities": "control.phone.capabilities",
            "phone.call": "control.phone.call",
            "control.location.get": "control.location.get",
            "control.control.phone.call": "control.phone.call",
            "androiduse.start": "androiduse.start",
            "control.androiduse.start": "androiduse.start",
        }
        for operation, method in expected.items():
            with self.subTest(operation=operation):
                self.assertEqual(ATLAS_APP.normalize_control_method(operation), method)

    def test_empty_operation_is_rejected(self):
        with self.assertRaises(SystemExit):
            ATLAS_APP.normalize_control_method("control.")


class AndroidUseParameterTests(unittest.TestCase):
    def test_zero_argument_actions(self):
        for action in ("start", "stop", "status", "screenshot", "tree", "back", "home", "recents"):
            with self.subTest(action=action):
                self.assertEqual(ANDROID_USE.parameters(action, []), {})
                with self.assertRaises(SystemExit):
                    ANDROID_USE.parameters(action, ["unexpected"])

    def test_gesture_parameters(self):
        self.assertEqual(ANDROID_USE.parameters("tap", ["0.25", "1040"]), {"x": 0.25, "y": 1040.0})
        self.assertEqual(
            ANDROID_USE.parameters("long_press", ["0.5", "0.6", "900"]),
            {"x": 0.5, "y": 0.6, "duration": 900},
        )

    def test_semantic_click_joins_the_human_label(self):
        self.assertEqual(
            ANDROID_USE.parameters("click", ["Buscar", "en", "Amazon"]),
            {"text": "Buscar en Amazon", "exact": True},
        )
        self.assertEqual(
            ANDROID_USE.parameters("swipe", ["0.5", "0.8", "0.5", "0.2", "420"]),
            {"x1": 0.5, "y1": 0.8, "x2": 0.5, "y2": 0.2, "duration": 420},
        )

    def test_launch_uses_the_native_package_or_uri_field(self):
        self.assertEqual(ANDROID_USE.parameters("launch", ["com.android.chrome"]), {"package": "com.android.chrome"})
        self.assertEqual(ANDROID_USE.parameters("launch", ["https://example.com"]), {"uri": "https://example.com"})
        self.assertEqual(ANDROID_USE.parameters("launch", ["geo:41.4,2.1"]), {"uri": "geo:41.4,2.1"})

    def test_wait_and_key_are_validated(self):
        self.assertEqual(ANDROID_USE.parameters("wait", []), {})
        self.assertEqual(ANDROID_USE.parameters("wait", ["450"]), {"ms": 450})
        self.assertEqual(
            ANDROID_USE.parameters("wait_for", ["Buscar", "en", "Amazon"]),
            {"text": "Buscar en Amazon", "exact": True, "timeoutMs": 3500},
        )
        self.assertEqual(ANDROID_USE.parameters("key", ["enter"]), {"key": "ENTER"})
        with self.assertRaises(SystemExit):
            ANDROID_USE.parameters("key", ["volume_up"])

    def test_call_forwards_one_canonical_androiduse_method(self):
        completed = types.SimpleNamespace(returncode=0, stdout='{"ok":true}\n', stderr="")
        with mock.patch.object(ANDROID_USE.subprocess, "run", return_value=completed) as run:
            result = ANDROID_USE.call("home", {}, 12)
        self.assertEqual(result, {"ok": True})
        command = run.call_args.args[0]
        self.assertEqual(command[-2:], ["control", "androiduse.home"])
        self.assertEqual(json.loads(command[command.index("--params") + 1]), {})

    def test_jpeg_screenshot_is_saved_with_capture_dimensions(self):
        encoded = base64.b64encode(b"\xff\xd8\xfffixture").decode("ascii")
        with tempfile.TemporaryDirectory() as directory:
            requested = pathlib.Path(directory) / "capture.png"
            result = ANDROID_USE.save_screenshot({
                "mime": "image/jpeg", "data": encoded,
                "width": 1440, "height": 3088,
                "captureWidth": 640, "captureHeight": 1372,
            }, str(requested))
            target = pathlib.Path(result["path"])
            self.assertEqual(target.suffix, ".jpg")
            self.assertFalse(requested.exists())
            self.assertEqual(target.read_bytes(), b"\xff\xd8\xfffixture")
            self.assertEqual((result["width"], result["height"]), (640, 1372))
            self.assertEqual(result["mime"], "image/jpeg")

    def test_batch_accepts_an_array_or_object_file(self):
        actions = [
            {"action": "click", "params": {"text": "Buscar", "timeoutMs": 3500}},
            {"action": "text", "params": {"text": "ESP32"}},
        ]
        with tempfile.TemporaryDirectory() as directory:
            array_path = pathlib.Path(directory) / "array.json"
            object_path = pathlib.Path(directory) / "object.json"
            array_path.write_text(json.dumps(actions), encoding="utf-8")
            object_path.write_text(json.dumps({"actions": actions, "autoStop": False}), encoding="utf-8")
            self.assertEqual(ANDROID_USE.parameters("batch", [str(array_path)]), {"actions": actions})
            self.assertEqual(
                ANDROID_USE.parameters("batch", [str(object_path)]),
                {"actions": actions, "autoStop": False},
            )


if __name__ == "__main__":
    unittest.main()
