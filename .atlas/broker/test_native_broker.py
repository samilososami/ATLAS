from __future__ import annotations

import json
import queue
import tempfile
import unittest
from pathlib import Path

from native_broker import (
    AuthStoreError,
    CodexAppServer,
    Credential,
    HTTPResult,
    NativeBroker,
    RealtimeBrokerError,
    normalize_codex_usage,
    public_session_summary,
    read_codex_auth,
    redact_sensitive,
)


class QueueStream:
    def __init__(self) -> None:
        self.lines: queue.Queue[str | None] = queue.Queue()

    def put(self, value: dict) -> None:
        self.lines.put(json.dumps(value) + "\n")

    def close(self) -> None:
        self.lines.put(None)

    def __iter__(self):
        while True:
            value = self.lines.get()
            if value is None:
                return
            yield value


class FakeStdin:
    def __init__(self, process: "FakeProcess") -> None:
        self.process = process

    def write(self, value: str) -> int:
        message = json.loads(value)
        self.process.messages.append(message)
        if "id" in message:
            method = message["method"]
            if method == "account/read":
                result = {
                    "account": {"type": "chatgpt", "planType": "prolite"},
                    "requiresOpenaiAuth": True,
                }
            elif method == "account/rateLimits/read":
                result = self.process.rate_limits
            else:
                result = {}
            self.process.stdout.put({"method": "test/notification", "params": {"safe": True}})
            self.process.stdout.put({"id": message["id"], "result": result})
        return len(value)

    def flush(self) -> None:
        return None


class FakeProcess:
    next_pid = 3000

    def __init__(self) -> None:
        self.pid = FakeProcess.next_pid
        FakeProcess.next_pid += 1
        self.stdout = QueueStream()
        self.stderr = QueueStream()
        self.stdin = FakeStdin(self)
        self.messages: list[dict] = []
        self.returncode = None
        self.rate_limits = {
            "rateLimitsByLimitId": {
                "codex": {
                    "limitId": "codex",
                    "planType": "prolite",
                    "primary": {"usedPercent": 20, "windowDurationMins": 10080, "resetsAt": 1000},
                    "secondary": None,
                }
            }
        }

    def poll(self):
        return self.returncode

    def terminate(self):
        self.returncode = 0
        self.stdout.close()
        self.stderr.close()

    def kill(self):
        self.terminate()

    def wait(self, timeout=None):
        return self.returncode


class NativeBrokerTests(unittest.TestCase):
    def test_auth_file_requires_private_mode_and_repr_is_redacted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "auth.json"
            path.write_text(json.dumps({"tokens": {"access_token": "test-access-token", "account_id": "account-private"}}))
            path.chmod(0o600)
            credential = read_codex_auth(path)
            self.assertEqual(credential.account_id, "account-private")
            self.assertNotIn("test-access", repr(credential))
            self.assertNotIn("account-private", repr(credential))
            path.chmod(0o644)
            with self.assertRaises(AuthStoreError):
                read_codex_auth(path)

    def test_app_server_is_persistent_correlates_requests_and_enables_experimental_api(self):
        processes: list[FakeProcess] = []

        def factory(*_args, **_kwargs):
            process = FakeProcess()
            processes.append(process)
            return process

        app = CodexAppServer(command=["codex", "app-server"], popen_factory=factory, timeout=1)
        try:
            account = app.account(refresh=True)
            limits = app.rate_limits()
            self.assertEqual(len(processes), 1)
            initialize = next(item for item in processes[0].messages if item.get("method") == "initialize")
            self.assertTrue(initialize["params"]["capabilities"]["experimentalApi"])
            account_request = next(item for item in processes[0].messages if item.get("method") == "account/read")
            self.assertTrue(account_request["params"]["refreshToken"])
            self.assertEqual(account["account"]["planType"], "prolite")
            self.assertIn("rateLimitsByLimitId", limits)
            self.assertEqual(app.next_notification(timeout=0.2)["method"], "test/notification")
        finally:
            app.close()

    def test_normalizes_only_codex_bucket_and_seconds_to_milliseconds(self):
        value = normalize_codex_usage({
            "rateLimitsByLimitId": {
                "codex_other": {
                    "primary": {"usedPercent": 99, "windowDurationMins": 300, "resetsAt": 1}
                },
                "codex": {
                    "planType": "plus",
                    "primary": {"usedPercent": 12.34, "windowDurationMins": 300, "resetsAt": 1000},
                    "secondary": {"usedPercent": 56, "windowDurationMins": 10080, "resetsAt": 2000},
                },
            }
        }, now_ms=123)
        self.assertEqual(value["fiveHour"]["usedPercent"], 12.3)
        self.assertEqual(value["fiveHour"]["resetAt"], 1_000_000)
        self.assertEqual(value["weekly"]["remainingPercent"], 44.0)
        self.assertEqual(value["weekly"]["resetAt"], 2_000_000)
        self.assertEqual(value["updatedAt"], 123)
        self.assertEqual(value["planProfile"], "plus")
        self.assertTrue(value["available"])

    def test_reservation_maps_params_and_returns_legacy_shape_without_oauth(self):
        app = FakeAppServer()
        posts: list[tuple] = []

        def post(url, payload, headers, timeout):
            posts.append((url, payload, headers, timeout))
            return HTTPResult(200, {
                "value": "ek_test_client_secret",
                "expires_at": 777,
                "session": {"type": "realtime", "id": "safe-session-id"},
            })

        broker = NativeBroker(
            app_server=app,
            credential_reader=lambda: Credential("oauth-secret-token", "account-secret"),
            http_post=post,
        )
        session = broker.create_talk_session({
            "provider": "openai", "transport": "webrtc",
            "model": "gpt-realtime-2.1", "voice": "cedar",
            "vadThreshold": 0.6, "silenceDurationMs": 420,
            "prefixPaddingMs": 240, "reasoningEffort": "low",
        })
        self.assertEqual(app.account_calls, [False])
        self.assertEqual(session["transport"], "webrtc")
        self.assertEqual(session["clientSecret"], "ek_test_client_secret")
        self.assertNotIn("oauth-secret-token", json.dumps(session))
        request_session = posts[0][1]["session"]
        self.assertEqual(request_session["audio"]["output"]["voice"], "cedar")
        self.assertEqual(request_session["audio"]["input"]["turn_detection"]["threshold"], 0.6)
        self.assertEqual(request_session["reasoning"], {"effort": "low"})
        self.assertEqual(posts[0][2]["Authorization"], "Bearer oauth-secret-token")
        public = public_session_summary(session)
        self.assertTrue(public["clientSecretIssued"])
        self.assertNotIn("clientSecret", public)
        self.assertNotIn("ek_test", json.dumps(public))

    def test_401_forces_one_refresh_and_exactly_one_retry(self):
        app = FakeAppServer()
        statuses = iter((401, 200))
        post_calls = []

        def post(*args):
            post_calls.append(args)
            status = next(statuses)
            return HTTPResult(status, {"value": "ek_retry_success", "expires_at": 9, "session": {}})

        broker = NativeBroker(
            app_server=app,
            credential_reader=lambda: Credential("oauth-token-value", "account-id"),
            http_post=post,
        )
        session = broker.create_talk_session({"transport": "webrtc"})
        self.assertEqual(session["clientSecret"], "ek_retry_success")
        self.assertEqual(app.account_calls, [False, True])
        self.assertEqual(len(post_calls), 2)

    def test_concurrent_refresh_result_can_be_reused_without_a_second_rotation(self):
        app = FakeAppServer()
        credentials = iter((
            Credential("oauth-old-token-value", "account-id"),
            Credential("oauth-new-token-value", "account-id"),
        ))
        statuses = iter((401, 200))

        def post(*_args):
            return HTTPResult(next(statuses), {"value": "ek_reused_refresh", "expires_at": 9, "session": {}})

        broker = NativeBroker(
            app_server=app,
            credential_reader=lambda: next(credentials),
            http_post=post,
        )
        session = broker.create_talk_session({"transport": "webrtc"})
        self.assertEqual(session["clientSecret"], "ek_reused_refresh")
        self.assertEqual(app.account_calls, [False])

    def test_non_401_is_not_retried_and_error_contains_no_response_payload(self):
        app = FakeAppServer()
        calls = []

        def post(*args):
            calls.append(args)
            return HTTPResult(500, {"error": {"message": "Bearer oauth-super-secret"}})

        broker = NativeBroker(
            app_server=app,
            credential_reader=lambda: Credential("oauth-super-secret", "account-id"),
            http_post=post,
        )
        with self.assertRaises(RealtimeBrokerError) as caught:
            broker.create_talk_session({"transport": "webrtc"})
        self.assertEqual(len(calls), 1)
        self.assertNotIn("oauth-super-secret", str(caught.exception))

    def test_redaction_covers_bearer_jwt_and_ephemeral_keys(self):
        source = "Authorization: Bearer secret-value eyJaaaaaaaa.bbbbbbbb.cccccccc ek_secretvalue"
        redacted = redact_sensitive(source)
        self.assertNotIn("secret-value", redacted)
        self.assertNotIn("eyJaaaaaaaa", redacted)
        self.assertNotIn("ek_secretvalue", redacted)


class FakeAppServer:
    def __init__(self) -> None:
        self.account_calls: list[bool] = []

    def account(self, refresh=False):
        self.account_calls.append(bool(refresh))
        return {"account": {"type": "chatgpt", "planType": "prolite"}, "requiresOpenaiAuth": True}

    def rate_limits(self):
        return {}

    def health(self):
        return {"running": True, "initialized": True, "pid": 1, "pendingRequests": 0, "lastError": None}

    def close(self):
        return None


if __name__ == "__main__":
    unittest.main()
