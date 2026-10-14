#!/usr/bin/env python3
"""Small authenticated public gateway; never expose the raw Webscreen server."""
from __future__ import annotations
import argparse
import asyncio
import contextlib
import hmac
import json
import mimetypes
import os
import re
import time
from pathlib import Path
from uuid import uuid4

from aiohttp import ClientSession, ClientTimeout, web
from auth import Auth, COOKIE, TTL, verify_password
from chat_runtime import Conversation, validate_messages, load_client

ROOT = Path(__file__).resolve().parent
PREFIX = "/try/screen"
SAFE_GET = {"/api/health", "/api/settings", "/api/codex-usage", "/api/realtime/context", "/api/wake/profiles", "/api/clap/profile", "/api/display-mode", "/api/display-mode/events", "/api/face/events", "/api/whatsapp/display"}
SAFE_POST = {"/api/access/connect", "/api/access/heartbeat", "/api/access/release", "/api/realtime/session", "/api/realtime/offer", "/api/realtime/context-turn", "/api/realtime/capabilities", "/api/realtime/shell", "/api/realtime/phone", "/api/realtime/android", "/api/realtime/routine", "/api/realtime/web-search", "/api/realtime/event", "/api/client-event", "/api/routines/execute", "/api/tts", "/api/tts/stream-ticket", "/api/settings", "/api/display-mode"}

def json_response(data, status=200):
    return web.json_response(data, status=status)

async def read_object(request, maximum=4 * 1024 * 1024):
    if request.content_length and request.content_length > maximum:
        raise web.HTTPRequestEntityTooLarge(max_size=maximum, actual_size=request.content_length)
    raw = await request.read()
    if len(raw) > maximum:
        raise web.HTTPRequestEntityTooLarge(max_size=maximum, actual_size=len(raw))
    try:
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, UnicodeError):
        raise web.HTTPBadRequest(text="JSON no válido") from None

def create_app(config, directory, *, client_factory=None):
    app = web.Application(client_max_size=4 * 1024 * 1024)
    auth = Auth(Path(directory), config)
    app["auth"], app["config"], app["chats"] = auth, config, {}
    app["factory"] = client_factory
    app["leases"] = {}
    app["lease_times"] = {}
    app["voice_context"] = {}
    app["preferences"], app["displays"] = {}, {}
    allowed_origins = set(config["origins"])

    @web.middleware
    async def guard(request, handler):
        path = request.path.rstrip("/")
        public = path in {"/portal/api/login", "/portal/api/session", "/portal/health"} or path.startswith("/portal/assets/")
        token = request.cookies.get(COOKIE, "")
        sid = auth.session(token) if token else None
        request["sid"], request["token"] = sid, token
        if request.method not in {"GET", "HEAD"}:
            origin = request.headers.get("Origin", "")
            if origin not in allowed_origins or request.headers.get("Sec-Fetch-Site") == "cross-site":
                raise web.HTTPForbidden(text="Origen no permitido")
            if request.content_type != "application/json":
                raise web.HTTPUnsupportedMediaType()
            if path != "/portal/api/login" and (not sid or not hmac.compare_digest(request.headers.get("X-Atlas-CSRF", ""), auth.csrf(token))):
                return json_response({"error": "La sesión ha caducado"}, 401)
        if not public and not sid:
            if path.rstrip("/") in {"/chat", "/try"}:
                return web.FileResponse(ROOT / "static/login.html")
            return json_response({"error": "Acceso privado. Inicia sesión."}, 401)
        return await handler(request)
    app.middlewares.append(guard)

    async def headers(request, response):
        response.headers.update({
            "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive",
            "X-Frame-Options": "SAMEORIGIN", "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://api.openai.com wss://api.openai.com; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
        })
        response.headers.pop("ETag", None)
    app.on_response_prepare.append(headers)

    async def login(request):
        # Forwarded addresses only narrow a bucket. The independent global cap
        # remains effective even if an attacker spoofs all forwarding headers.
        ip = request.headers.get("X-Real-IP", request.remote or "unknown")[:100]
        if not auth.attempt(ip):
            response = json_response({"error": "Demasiados intentos. Vuelve a intentarlo en 15 minutos."}, 429)
            response.headers["Retry-After"] = "900"
            return response
        payload = await read_object(request, 4096)
        password = payload.get("password", "") if isinstance(payload, dict) else ""
        valid = await asyncio.to_thread(verify_password, password, config["password_hash"])
        if not valid:
            return json_response({"error": "Contraseña incorrecta"}, 401)
        token = auth.issue()
        response = json_response({"ok": True, "csrf": auth.csrf(token)})
        response.set_cookie(COOKIE, token, max_age=TTL, secure=True, httponly=True, samesite="Strict", path="/")
        return response

    async def session(request):
        return json_response({"authenticated": bool(request["sid"]), "csrf": auth.csrf(request["token"]) if request["sid"] else None})

    async def logout(request):
        auth.revoke(request["token"])
        for key, chat in list(app["chats"].items()):
            if key[0] == request["sid"]:
                chat.cancel.set()
                if not chat.lock.locked():
                    await asyncio.to_thread(chat.close)
                    app["chats"].pop(key, None)
        response = json_response({"ok": True})
        response.del_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="Strict")
        return response

    async def page(request):
        name = "try.html" if request.path.rstrip("/") == "/try" else "chat.html"
        return web.FileResponse(ROOT / "static" / name)

    async def asset(request):
        path = request.match_info["name"]
        # No arbitrary paths, source files, dotfiles, credentials, or directory listings.
        allowed = {"app.js", "api.js", "store.js", "render.js", "login.js", "styles.css", "embed.js", "try.js", "vendor.js", "logo.png", "wordmark.svg"}
        if path not in allowed:
            raise web.HTTPNotFound()
        return web.FileResponse(ROOT / "static" / path)

    async def usage(request):
        try:
            async with app["http"].get(config["upstream"] + "/api/internal/codex-usage", timeout=ClientTimeout(total=8)) as response:
                data = await response.json()
        except Exception:
            return json_response({"available": False}, 503)
        return json_response({key: data.get(key) for key in ("available", "stale", "fiveHour", "weekly", "updatedAt")})

    async def proxy(request):
        target = "/" + request.match_info.get("tail", "").rstrip("/")
        if ".." in target or "%" in target or "\\" in target or target.startswith("//"):
            raise web.HTTPNotFound()
        if target == "/":
            target = "/new/"
        if request.method in {"GET", "HEAD"}:
            static = target == "/new/" or bool(re.fullmatch(r"/(?:new/)?[a-zA-Z0-9_-]+\.(?:js|css|png|svg)", target))
            if not static and target not in SAFE_GET and not re.fullmatch(r"/api/tts/stream/[A-Za-z0-9_-]+", target):
                raise web.HTTPNotFound()
        elif request.method == "POST":
            if target not in SAFE_POST:
                # Global settings, Wi-Fi, history deletion and internal routes
                # are deliberately not exposed by an internet-facing proxy.
                return json_response({"error": "Este ajuste se administra desde el A1"}, 403)
        else:
            raise web.HTTPMethodNotAllowed(request.method, ["GET", "POST"])
        # A loopback Host is interpreted as the physical kiosk by Webscreen.
        # Use an explicit virtual host, never the external visitor's Host.
        upstream_headers = {"Host": "atlas-portal.local:5000", "Origin": "http://atlas-portal.local:5000", "Sec-Fetch-Site": "same-origin"}
        for key in ("Content-Type", "X-Atlas-Access", "X-Atlas-Client", "Authorization"):
            if request.headers.get(key):
                upstream_headers[key] = request.headers[key]
        # Prevent a public lease from being labelled as the physical kiosk.
        body = await request.read()
        if target == "/api/access/connect":
            if len(app["leases"]) >= 8 or sum(owner == request["sid"] for owner in app["leases"].values()) >= 3:
                return json_response({"error": "Cierra otra pestaña del Webscreen o espera un minuto."}, 429)
            payload = await read_object(request, 4096)
            payload["clientKind"] = "browser"
            body = json.dumps(payload).encode()
        lease = request.headers.get("X-Atlas-Client")
        if lease and app["leases"].get(lease) != request["sid"]:
            return json_response({"error": "Sesión del Webscreen no válida"}, 401)
        if lease:
            app["lease_times"][lease] = time.monotonic()
        if target.startswith("/api/") and target not in {"/api/access/connect", "/api/health"} and not target.startswith("/api/tts/stream/") and not lease:
            return json_response({"error": "Falta la sesión del Webscreen"}, 401)
        if target == "/api/realtime/context-turn":
            # Live conversation already lives in its own WebRTC session. Never
            # append a public browser's turns to the physical A1's filler file.
            return json_response({"stats": app["voice_context"].get(lease, {}), "autoCompact": False, "persisted": False})
        if target == "/api/realtime/context" and lease in app["voice_context"]:
            return json_response(app["voice_context"][lease])
        if target in {"/api/display-mode", "/api/display-mode/events"}:
            state = app["displays"].setdefault(lease, {"mode": "face", "epoch": uuid4().hex, "sequence": 0, "event": asyncio.Event()})
            if request.method == "POST":
                payload = await read_object(request, 4096)
                mode = payload.get("mode")
                if mode not in {"face", "clock"}:
                    return json_response({"error": "Modo no válido"}, 400)
                if mode != state["mode"]:
                    state["mode"], state["sequence"] = mode, state["sequence"] + 1
                    state["event"].set()
                    state["event"] = asyncio.Event()
            cursor = f'{state["epoch"]}:{state["sequence"]}'
            if target.endswith("/events") and request.query.get("after") == cursor:
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(state["event"].wait(), 12)
            return json_response({"ok": True, "mode": state["mode"], "clockModeActive": state["mode"] == "clock",
                                  "sequence": state["sequence"], "cursor": f'{state["epoch"]}:{state["sequence"]}'})
        if target == "/api/settings" and request.method == "POST":
            payload = await read_object(request, 4096)
            choices = {"realtimeVoice": {"ash", "cedar", "marin", "verse", "elevenlabs", "browser"},
                       "realtimeReasoningEffort": {"default", "minimal", "low", "medium", "high", "xhigh"}}
            if not payload or any(key not in choices or not isinstance(value, str) or value not in choices[key] for key, value in payload.items()):
                return json_response({"error": "Este ajuste se administra desde el A1"}, 403)
            app["preferences"].setdefault(lease, {}).update(payload)
            async with app["http"].get(config["upstream"] + target, headers=upstream_headers) as upstream:
                settings = await upstream.json()
            return json_response({**settings, **app["preferences"][lease]})
        async with app["http"].request(request.method, config["upstream"] + target,
                                       params=request.query, data=body or None, headers=upstream_headers,
                                       allow_redirects=False) as upstream:
            content_type = upstream.headers.get("Content-Type", "application/octet-stream")
            if target.startswith("/api/tts/stream/"):
                response = web.StreamResponse(status=upstream.status, headers={"Content-Type": content_type})
                await response.prepare(request)
                async for chunk in upstream.content.iter_chunked(16384):
                    await response.write(chunk)
                return response
            data = await upstream.read()
            if target == "/api/access/connect" and upstream.status == 200:
                result = json.loads(data)
                app["leases"][result["token"]] = request["sid"]
                app["lease_times"][result["token"]] = time.monotonic()
            if target == "/api/access/release" and lease:
                app["leases"].pop(lease, None)
                app["lease_times"].pop(lease, None)
                app["voice_context"].pop(lease, None)
                app["preferences"].pop(lease, None)
                app["displays"].pop(lease, None)
            if target == "/api/settings" and upstream.status == 200:
                data = json.dumps({**json.loads(data), **app["preferences"].get(lease, {})}).encode()
            if target == "/api/realtime/session" and upstream.status == 200:
                result = json.loads(data)
                def fresh_context():
                    client = (client_factory or load_client)()
                    return client._build_context()
                context, stats = await asyncio.to_thread(fresh_context)
                # Stable revision prevents global A1 context updates from
                # forcing an unrelated browser session to reconnect.
                stats = {**stats, "revision": "portal-isolated", "compactionRequested": False}
                result["session"]["atlasContext"] = context
                result["session"]["atlasContextStats"] = stats
                app["voice_context"][lease] = stats
                data = json.dumps(result).encode()
            if target == "/new/" and upstream.status == 200:
                html = data.decode().replace('<head>', '<head><script src="/portal/assets/embed.js"></script>')
                html = re.sub(r'(src|href)="/(?!/)', lambda m: m[1] + '="' + PREFIX + '/', html)
                html = html.replace(PREFIX + '/portal/assets/embed.js', '/portal/assets/embed.js')
                data = html.encode()
            elif content_type.startswith("text/css"):
                data = re.sub(rb'url\(["\']?/(?!/)', lambda m: m[0][:-1] + PREFIX.encode() + b'/', data)
            elif "javascript" in content_type:
                data = re.sub(rb'(["\'])/new/', lambda m: m[1] + PREFIX.encode() + b'/new/', data)
            return web.Response(body=data, status=upstream.status, headers={"Content-Type": content_type})

    async def stream(request):
        try:
            payload = await read_object(request)
            chat_id = payload.get("id", "")
            if not isinstance(chat_id, str) or not re.fullmatch(r"[a-zA-Z0-9-]{8,64}", chat_id):
                raise ValueError("Identificador no válido")
            messages = validate_messages(payload.get("messages"))
        except (ValueError, TypeError, AttributeError) as error:
            return json_response({"error": str(error)}, 400)
        key = (request["sid"], chat_id)
        chats = app["chats"]
        chat = chats.get(key)
        if chat and chat.lock.locked():
            return json_response({"error": "Este chat ya está respondiendo"}, 409)
        if not chat:
            if len(chats) >= 8 or sum(k[0] == key[0] for k in chats) >= 3:
                inactive = [(k, c) for k, c in chats.items() if not c.lock.locked() and k[0] == key[0]]
                if not inactive:
                    return json_response({"error": "Hay demasiadas sesiones activas. Cierra una o espera."}, 429)
                oldest, previous = min(inactive, key=lambda item: item[1].touched)
                await asyncio.to_thread(previous.close)
                chats.pop(oldest, None)
            chat = Conversation(app["factory"]) if app["factory"] else Conversation()
            chats[key] = chat
        response = web.StreamResponse(headers={"Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no"})
        # Reserve before the first await so double submissions cannot cancel or
        # overwrite each other while the worker is still waiting to start.
        if not chat.lock.acquire(False):
            return json_response({"error": "Este chat ya está respondiendo"}, 409)
        chat.cancel.clear()
        try:
            await response.prepare(request)
        except BaseException:
            chat.lock.release()
            raise
        queue, loop = asyncio.Queue(), asyncio.get_running_loop()
        def emit(event, data):
            loop.call_soon_threadsafe(queue.put_nowait, (event, data))
        task = asyncio.create_task(asyncio.to_thread(chat.run, messages, emit, reserved=True))
        try:
            while True:
                if not auth.session(request["token"]):
                    chat.cancel.set()
                    break
                try:
                    event, data = await asyncio.wait_for(queue.get(), 8)
                    await response.write((f"event: {event}\ndata: " + json.dumps(data, ensure_ascii=False) + "\n\n").encode())
                    if event in {"done", "error", "cancelled"}:
                        break
                except asyncio.TimeoutError:
                    await response.write(b": keepalive\n\n")
                    if task.done():
                        break
        except (ConnectionResetError, asyncio.CancelledError):
            chat.cancel.set()
        finally:
            if not task.done():
                chat.cancel.set()
            # Worker sees cancellation before every subsequent tool call.
        return response

    async def cancel(request):
        payload = await read_object(request, 4096)
        key = (request["sid"], str(payload.get("id", "")))
        chat = app["chats"].get(key)
        if chat:
            chat.cancel.set()
            if not chat.lock.locked():
                await asyncio.to_thread(chat.close)
                app["chats"].pop(key, None)
        return json_response({"ok": True})

    async def lifecycle(app):
        app["http"] = ClientSession(timeout=ClientTimeout(total=195, connect=5))
        async def prune():
            while True:
                await asyncio.sleep(30)
                for key, chat in list(app["chats"].items()):
                    if not chat.lock.locked() and time.monotonic() - chat.touched > 180:
                        await asyncio.to_thread(chat.close)
                        app["chats"].pop(key, None)
                for lease, touched in list(app["lease_times"].items()):
                    if time.monotonic() - touched > 60:
                        for name in ("leases", "lease_times", "voice_context", "preferences", "displays"):
                            app[name].pop(lease, None)
                if not app["chats"]:
                    # AtlasChat imports its own broker in this process. Release
                    # its subprocess when all short-lived text sessions expire.
                    # This does not touch the Webscreen/WhatsApp service brokers.
                    from chat_runtime import release_idle_broker
                    await asyncio.to_thread(release_idle_broker, app["chats"])
        cleaner = asyncio.create_task(prune())
        yield
        cleaner.cancel()
        for chat in app["chats"].values():
            chat.cancel.set()
            if not chat.lock.locked():
                await asyncio.to_thread(chat.close)
        await app["http"].close()
        auth.db.close()
    app.cleanup_ctx.append(lifecycle)
    async def health(request):
        return json_response({"ok": True, "service": "atlas-portal"})
    app.router.add_get("/portal/health", health)
    app.router.add_get("/portal/health/", health)
    app.router.add_get("/portal/assets/{name}", asset)
    # Vercel's existing website canonicalizes extensionless URLs with a slash.
    # Accept both without a redirect loop or losing a streamed POST body.
    for ending in ("", "/"):
        app.router.add_get("/portal/api/session" + ending, session)
        app.router.add_post("/portal/api/login" + ending, login)
        app.router.add_post("/portal/api/logout" + ending, logout)
        app.router.add_get("/portal/api/usage" + ending, usage)
        app.router.add_post("/portal/api/chat" + ending, stream)
        app.router.add_post("/portal/api/cancel" + ending, cancel)
    for path in ("/chat", "/chat/", "/try", "/try/"):
        app.router.add_get(path, page)
    app.router.add_route("*", PREFIX + "/{tail:.*}", proxy)
    return app

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=os.environ.get("ATLAS_PORTAL_CONFIG", "/home/atlas/.atlas/portal/runtime/config.json"))
    args = parser.parse_args()
    config_file = Path(args.config)
    config = json.loads(config_file.read_text())
    # Loopback only, including when someone edits the config. Funnel is the edge.
    web.run_app(create_app(config, config_file.parent), host="127.0.0.1", port=5020, access_log=None, print=None)
