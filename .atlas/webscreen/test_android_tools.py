#!/usr/bin/env python3
"""Focused contract and security tests for Realtime Android tools."""

from __future__ import annotations

import base64
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("atlas_webscreen_server_android_tests", ROOT / "server.py")
assert SPEC and SPEC.loader
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class AndroidControlTests(unittest.TestCase):
    def test_enter_key_is_allowed_and_auto_inspected(self) -> None:
        self.assertIn("androiduse.key", SERVER.ATLAS_ANDROID_OPERATIONS)
        self.assertIn("androiduse.key", SERVER.ATLAS_ANDROID_AUTO_INSPECT)

    @mock.patch.object(SERVER.shutil, "which", return_value="/usr/local/bin/atlas-app")
    @mock.patch.object(SERVER.subprocess, "run")
    def test_native_alias_uses_argv_without_shell(self, run: mock.Mock, _which: mock.Mock) -> None:
        run.return_value = subprocess.CompletedProcess([], 0, '{"ok":true,"latitude":1}', "")
        result = SERVER.execute_atlas_app_control(
            "get_location", {}, SERVER.ATLAS_PHONE_OPERATIONS,
            SERVER.ATLAS_PHONE_OPERATION_ALIASES,
        )
        self.assertTrue(result["ok"])
        argv = run.call_args.args[0]
        self.assertEqual(argv[:3], ["/usr/local/bin/atlas-app", "control", "location.get"])
        self.assertEqual(argv[-3:], ["--params", "{}", "--json"])
        self.assertNotIn("shell", run.call_args.kwargs)

    @mock.patch.object(SERVER.subprocess, "run")
    def test_unknown_operation_never_starts_process(self, run: mock.Mock) -> None:
        with self.assertRaisesRegex(ValueError, "no permitida"):
            SERVER.execute_atlas_app_control(
                "androiduse.shell; poweroff", {}, SERVER.ATLAS_ANDROID_OPERATIONS,
            )
        run.assert_not_called()

    @mock.patch.object(SERVER.shutil, "which", return_value="/usr/local/bin/atlas-app")
    @mock.patch.object(SERVER.subprocess, "run")
    def test_offline_error_is_exact(self, run: mock.Mock, _which: mock.Mock) -> None:
        run.return_value = subprocess.CompletedProcess(
            [], 1, "", "Error: Android device not connected\n",
        )
        with self.assertRaisesRegex(
            SERVER.AndroidDeviceDisconnected, r"^Error: Android device not connected$",
        ):
            SERVER.execute_atlas_app_control(
                "androiduse.status", {}, SERVER.ATLAS_ANDROID_OPERATIONS,
            )

    def test_screenshot_is_validated_and_separated(self) -> None:
        encoded = base64.b64encode(b"\x89PNG\r\n\x1a\nfixture").decode("ascii")
        capture = SERVER.normalize_android_screenshot({
            "mime": "image/png", "width": 1440, "height": 3088,
            "captureWidth": 720, "captureHeight": 1544, "data": encoded,
        })
        self.assertEqual(capture["pngBase64"], encoded)
        self.assertEqual((capture["width"], capture["height"]), (720, 1544))
        self.assertEqual((capture["screenWidth"], capture["screenHeight"]), (1440, 3088))
        public = SERVER.public_android_result({
            "mime": "image/png", "width": 1440, "height": 3088, "data": encoded,
        })
        self.assertNotIn("data", public)
        self.assertNotIn("pngBase64", public)
        self.assertTrue(public["captureAttached"])

    @mock.patch.object(SERVER, "execute_atlas_app_control")
    def test_http_handler_preserves_exact_offline_error(self, execute: mock.Mock) -> None:
        execute.side_effect = SERVER.AndroidDeviceDisconnected(
            SERVER.ATLAS_APP_CONTROL_OFFLINE_ERROR,
        )
        responses: list[tuple[int, dict[str, object]]] = []
        handler = SimpleNamespace(
            _read_realtime_device_tool=lambda: (
                "androiduse.status", {}, True, "interaction",
            ),
            log_client=lambda: {},
            send_json=lambda status, payload: responses.append((status, payload)),
        )
        SERVER.AtlasScreenHandler.handle_realtime_android(handler)
        self.assertEqual(responses, [(503, {
            "error": "Error: Android device not connected",
        })])

    @mock.patch.object(SERVER, "append_realtime_event")
    @mock.patch.object(SERVER, "execute_atlas_app_control")
    def test_visual_action_auto_inspects_unless_disabled(
        self, execute: mock.Mock, _event: mock.Mock,
    ) -> None:
        encoded = base64.b64encode(b"\x89PNG\r\n\x1a\nfixture").decode("ascii")
        execute.side_effect = [
            {"ok": True, "dispatched": True},
            {"mime": "image/png", "width": 1080, "height": 2400, "data": encoded},
        ]
        responses: list[tuple[int, dict[str, object]]] = []
        handler = SimpleNamespace(
            _read_realtime_device_tool=lambda: (
                "androiduse.tap", {"x": 0.5, "y": 0.5}, True, "interaction",
            ),
            log_client=lambda: {},
            send_json=lambda status, payload: responses.append((status, payload)),
        )
        SERVER.AtlasScreenHandler.handle_realtime_android(handler)
        self.assertEqual(execute.call_count, 2)
        self.assertEqual(execute.call_args_list[1].args[0], "androiduse.screenshot")
        self.assertEqual(responses[0][0], 200)
        self.assertEqual(responses[0][1]["screenshot"]["pngBase64"], encoded)


if __name__ == "__main__":
    unittest.main()
