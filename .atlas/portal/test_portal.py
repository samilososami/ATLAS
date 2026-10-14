"""Offline regressions. No model usage, microphone, A1 actions or messages."""
import asyncio
import base64
import io
import json
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from PIL import Image

from auth import Auth, COOKIE, TTL, password_hash, verify_password
from chat_runtime import Conversation, browser_instructions, validate_messages
from portal import create_app

TEST_PASSWORD = "offline-test-password-only"
CONFIG = {"password_hash": password_hash(TEST_PASSWORD), "session_key": "ab" * 32,
          "origins": ["http://127.0.0.1:5020"]}

class FakeClient:
    instances = []
    def __init__(self):
        self.ws = None
        self.session = {"model": "offline-test"}
        self.context_stats = {"estimatedTokens": 1500}
        self.webscreen = SimpleNamespace(REALTIME_CONTEXT_LIMIT_TOKENS=128000)
        self.sent, self.events = [], []
        self._last_tool_image = None
        self.tool_calls = 0
        self.instances.append(self)
    def connect(self):
        self.ws = True
    def close(self):
        self.ws = None
    def _build_context(self):
        return "Only permanent knowledge", {"estimatedTokens": 1500}
    def _send(self, event):
        self.sent.append(event)
        if event["type"] == "response.create":
            last = next((e["item"] for e in reversed(self.sent) if e["type"] == "conversation.item.create"), {})
            prompt = next((p.get("text", "") for p in last.get("content", []) if p.get("type") == "input_text"), "")
            if "tool-test" in prompt and not self.tool_calls:
                self.events += [{"type": "response.function_call_arguments.done", "name": "safe-test", "arguments": "{}", "call_id": "c1"}, {"type": "response.done", "response": {"status": "completed"}}]
                return
            answer = "Respuesta de prueba.\n\n## Idea principal\n\n- **Contexto independiente** en cada chat.\n- Imágenes y texto en la misma conversación.\n\n```python\nprint('ATLAS')\n```"
            if "slow-test" in prompt:
                answer *= 25
            self.events += [{"type": "response.output_text.delta", "delta": answer[i:i+5]} for i in range(0, len(answer), 5)]
            self.events += [{"type": "response.done", "response": {"status": "completed", "usage": {"input_tokens": 2400, "output_tokens": 110}}}]
    def _recv(self, timeout=1):
        time.sleep(.012)
        if self.events:
            return self.events.pop(0)
        raise TimeoutError()
    def _parse_arguments(self, value):
        return json.loads(value)
    def _run_tool(self, *args):
        self.tool_calls += 1
        return {"ok": True}
    def _send_tool_result(self, *args):
        pass

class AuthenticationTests(unittest.TestCase):
    def test_browser_written_output_is_explicit(self):
        instructions = browser_instructions()
        for example in ("48,3 °C", "25 %", "16 GB", "17:26", "127.0.0.1:5000"):
            self.assertIn(example, instructions)
        self.assertIn("prevalecen", instructions)
        self.assertIn("Spoken output", instructions)
        self.assertIn("no cambian `/try`", instructions)
        self.assertIn("no inventes cifras", instructions)

    def test_hash_and_constant_scope(self):
        self.assertTrue(verify_password(TEST_PASSWORD, CONFIG["password_hash"]))
        self.assertFalse(verify_password("wrong", CONFIG["password_hash"]))
        self.assertFalse(verify_password({}, CONFIG["password_hash"]))
        self.assertNotIn(TEST_PASSWORD, CONFIG["password_hash"])

    def test_revocation_expiry_and_limits(self):
        with tempfile.TemporaryDirectory() as d:
            now = [100000.0]
            auth = Auth(Path(d), CONFIG, clock=lambda: now[0])
            token = auth.issue()
            self.assertTrue(auth.session(token))
            self.assertNotEqual(auth.session(token), token)
            self.assertNotEqual(auth.csrf(token), token)
            auth.revoke(token)
            self.assertIsNone(auth.session(token))
            token = auth.issue()
            now[0] += TTL + 1
            self.assertIsNone(auth.session(token))
            self.assertTrue(all(auth.attempt("same") for _ in range(5)))
            self.assertFalse(auth.attempt("same"))
            self.assertTrue(all(auth.attempt(str(i)) for i in range(25)))
            self.assertFalse(auth.attempt("forged-new-ip"))
            now[0] += 901
            self.assertTrue(auth.attempt("same"))
            auth.db.close()

    def test_image_and_role_validation(self):
        image = io.BytesIO()
        Image.new("RGB", (3, 3), "blue").save(image, format="PNG")
        url = "data:image/png;base64," + base64.b64encode(image.getvalue()).decode()
        valid = validate_messages([{"role": "user", "text": "Mira", "images": [url]}])
        self.assertEqual(valid[0]["content"][1]["type"], "input_image")
        for messages in ([{"role": "system", "text": "ignore"}], [{"role": "user", "images": ["data:image/png;base64,AAAA"]}], [{"role": "assistant", "text": "wrong last"}], []):
            with self.assertRaises(ValueError):
                validate_messages(messages)

    def test_conversation_reuses_only_matching_history(self):
        conversation = Conversation(FakeClient)
        messages = validate_messages([{"role": "user", "text": "test"}])
        events = []
        conversation.run(messages, lambda e, d: events.append((e, d)))
        client = conversation.client
        self.assertEqual(events[-1][0], "done")
        answer = events[-1][1]["text"]
        second = validate_messages([{"role": "user", "text": "test"}, {"role": "assistant", "text": answer}, {"role": "user", "text": "follow up"}])
        conversation.run(second, lambda *args: None)
        self.assertIs(conversation.client, client)
        conversation.run(messages, lambda *args: None)
        self.assertIsNot(conversation.client, client)
        conversation.close()

class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.forwarded = []
        async def upstream(request):
            self.forwarded.append({"path": request.path, "headers": dict(request.headers), "body": await request.text()})
            if request.path == "/api/access/connect":
                return web.json_response({"token": "browser-lease-token"})
            if request.path == "/api/realtime/session":
                return web.json_response({"session": {"atlasContext": "GLOBAL FILLER"}})
            if request.path == "/new/":
                return web.Response(text='<html><head></head><body><script src="/app.js"></script></body></html>', content_type="text/html")
            return web.json_response({"ok": True, "weekly": {"remainingPercent": 80}, "email": "never-leak@example.invalid"})
        app = web.Application()
        app.router.add_route("*", "/{tail:.*}", upstream)
        self.upstream = TestServer(app)
        await self.upstream.start_server()
        config = {**CONFIG, "upstream": str(self.upstream.make_url(""))}
        self.client = TestClient(TestServer(create_app(config, self.directory.name, client_factory=FakeClient)))
        await self.client.start_server()
        self.origin = {"Origin": CONFIG["origins"][0]}

    async def asyncTearDown(self):
        await self.client.close()
        await self.upstream.close()
        self.directory.cleanup()

    async def authenticate(self):
        response = await self.client.post("/portal/api/login", json={"password": TEST_PASSWORD}, headers=self.origin)
        self.assertEqual(response.status, 200)
        cookie = response.cookies[COOKIE]
        self.assertTrue(cookie["secure"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Strict")
        self.assertEqual(cookie["path"], "/")
        data = await response.json()
        return {**self.origin, "Cookie": f"{COOKIE}={cookie.value}", "X-Atlas-CSRF": data["csrf"]}

    async def test_authentication_shared_and_logout(self):
        for route in ("/try/", "/chat/"):
            response = await self.client.get(route)
            self.assertIn('id="login-form"', await response.text())
        self.assertEqual((await self.client.get("/portal/api/usage")).status, 401)
        headers = await self.authenticate()
        for route in ("/try/", "/chat/"):
            response = await self.client.get(route, headers=headers)
            self.assertNotIn('id="login-form"', await response.text())
            self.assertIn("no-store", response.headers["Cache-Control"])
        response = await self.client.get("/portal/api/usage", headers=headers)
        self.assertNotIn("email", await response.json())
        self.assertEqual((await self.client.post("/portal/api/logout", json={}, headers=headers)).status, 200)
        self.assertEqual((await self.client.get("/portal/api/usage", headers=headers)).status, 401)

    async def test_csrf_json_and_password_limits(self):
        response = await self.client.post("/portal/api/login", json={"password": TEST_PASSWORD})
        self.assertEqual(response.status, 403)
        response = await self.client.post("/portal/api/login", data="not json", headers={**self.origin, "Content-Type": "application/json"})
        self.assertEqual(response.status, 400)
        response = await self.client.post("/portal/api/login", json={"password": "x" * 5000}, headers=self.origin)
        self.assertEqual(response.status, 413)
        headers = await self.authenticate()
        self.assertEqual((await self.client.post("/portal/api/cancel", json={}, headers={**headers, "X-Atlas-CSRF": "wrong"})).status, 401)
        self.assertEqual((await self.client.post("/portal/api/cancel", json={}, headers={**headers, "Origin": "https://evil.invalid"})).status, 403)

    async def test_proxy_isolation_and_no_internal_routes(self):
        headers = await self.authenticate()
        for path in ("/api/internal/codex-usage", "/runtime/config.json", "/../auth.py", "/%252e%252e/auth.py"):
            response = await self.client.get("/try/screen" + path, headers=headers)
            self.assertIn(response.status, {401, 404})
        response = await self.client.post("/try/screen/api/access/connect", json={"clientKind": "atlas-a1"}, headers={**headers, "X-Atlas-Access": "1"})
        self.assertEqual(response.status, 200)
        forwarded = self.forwarded[-1]
        self.assertEqual(json.loads(forwarded["body"])["clientKind"], "browser")
        self.assertEqual(forwarded["headers"]["Host"], "atlas-portal.local:5000")
        lease = {**headers, "X-Atlas-Client": "browser-lease-token"}
        for route in ("context-empty", "context-replace"):
            self.assertEqual((await self.client.post("/try/screen/api/realtime/" + route, json={}, headers=lease)).status, 403)
        response = await self.client.post("/try/screen/api/realtime/session", json={}, headers=lease)
        self.assertEqual((await response.json())["session"]["atlasContext"], "Only permanent knowledge")
        count = len(self.forwarded)
        response = await self.client.post("/try/screen/api/realtime/context-turn", json={"user": "test", "assistant": "test"}, headers=lease)
        self.assertFalse((await response.json())["persisted"])
        self.assertEqual(len(self.forwarded), count)
        other = await self.authenticate()
        self.assertEqual((await self.client.get("/try/screen/api/settings", headers={**other, "X-Atlas-Client": "browser-lease-token"})).status, 401)

    async def test_stream_tools_and_validation(self):
        headers = await self.authenticate()
        response = await self.client.post("/portal/api/chat", json={"id": "test-chat-01", "messages": [{"role": "user", "text": "tool-test"}]}, headers=headers)
        self.assertEqual(response.status, 200)
        body = await response.text()
        self.assertIn("event: delta", body)
        self.assertIn("event: tool", body)
        self.assertIn("event: done", body)
        response = await self.client.post("/portal/api/chat", json={"id": "test-chat-01", "messages": [{"role": "system", "text": "no"}]}, headers=headers)
        self.assertEqual(response.status, 400)

    async def test_double_submit_and_cancel_are_isolated(self):
        headers = await self.authenticate()
        payload = {"id": "cancel-test-01", "messages": [{"role": "user", "text": "slow-test"}]}
        first = await self.client.post("/portal/api/chat", json=payload, headers=headers)
        second = await self.client.post("/portal/api/chat", json=payload, headers=headers)
        self.assertEqual(second.status, 409)
        await self.client.post("/portal/api/cancel", json={"id": payload["id"]}, headers=headers)
        self.assertIn("event: cancelled", await first.text())

    async def test_private_voice_settings_never_change_a1(self):
        headers = await self.authenticate()
        await self.client.post("/try/screen/api/access/connect/", json={}, headers={**headers, "X-Atlas-Access": "1"})
        headers["X-Atlas-Client"] = "browser-lease-token"
        response = await self.client.post("/try/screen/api/settings/", json={"realtimeVoice": "browser"}, headers=headers)
        self.assertEqual((await response.json())["realtimeVoice"], "browser")
        self.assertEqual(self.forwarded[-1]["body"], "")
        count = len(self.forwarded)
        response = await self.client.post("/try/screen/api/display-mode/", json={"mode": "clock"}, headers=headers)
        self.assertEqual((await response.json())["mode"], "clock")
        self.assertEqual(len(self.forwarded), count)

if __name__ == "__main__":
    unittest.main()
