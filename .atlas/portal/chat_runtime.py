"""Isolated browser chats using the existing ATLAS model and tool executor.

Messages and images stay in browser storage and short-lived RAM, never chat logs.
No microphone, TTS, routine pre-dispatch, or global conversation persistence.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import os
import re
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

MAX_HISTORY_CHARS = 120000
MAX_IMAGE_BYTES = 750000
BROKER_LIFECYCLE_LOCK = threading.RLock()

def browser_instructions():
    instructions = Path(__file__).with_name("CHAT_INSTRUCTIONS.md").read_text(encoding="utf-8").strip()
    if not instructions:
        raise ValueError("Las instrucciones del chat web están vacías")
    return instructions

def release_idle_broker(chats):
    with BROKER_LIFECYCLE_LOCK:
        if chats:
            return
        webscreen = sys.modules.get("server")
        if webscreen is not None and hasattr(webscreen, "BROKER"):
            webscreen.BROKER.stop()

def image_part(value):
    if not isinstance(value, str) or len(value) > MAX_IMAGE_BYTES * 4 // 3 + 64:
        raise ValueError("La imagen supera el límite permitido")
    match = re.fullmatch(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)", value)
    if not match:
        raise ValueError("Formato de imagen no permitido")
    from PIL import Image
    try:
        raw = base64.b64decode(match[2], validate=True)
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in {"JPEG", "PNG", "WEBP"} or im.width * im.height > 16000000:
                raise ValueError("Imagen demasiado grande o no válida")
            im.verify()
    except Exception:
        raise ValueError("Imagen no válida; usa JPG, PNG o WebP") from None
    return {"type": "input_image", "image_url": value}

def validate_messages(value):
    if not isinstance(value, list) or not 1 <= len(value) <= 60:
        raise ValueError("Conversación no válida")
    result, chars, images = [], 0, 0
    for message in value:
        if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
            raise ValueError("Solo se admiten mensajes de usuario y asistente")
        text = message.get("text", "")
        attachments = message.get("images", [])
        if not isinstance(text, str) or len(text) > 30000 or not isinstance(attachments, list):
            raise ValueError("Mensaje demasiado largo")
        if len(attachments) > 4 or (attachments and message["role"] != "user"):
            raise ValueError("Adjuntos no válidos")
        chars += len(text)
        images += len(attachments)
        if chars > MAX_HISTORY_CHARS or images > 8:
            raise ValueError("El contexto enviado supera el límite")
        content = [{"type": "input_text" if message["role"] == "user" else "output_text", "text": text}] if text else []
        content.extend(image_part(image) for image in attachments)
        if not content:
            raise ValueError("Mensaje vacío")
        result.append({"type": "message", "role": message["role"], "content": content})
    if result[-1]["role"] != "user":
        raise ValueError("El último mensaje debe ser del usuario")
    return result

def load_client():
    home = Path(os.environ.get("ATLAS_HOME", "/home/atlas"))
    sys.path.insert(0, str(home / ".atlas/chat"))
    from atlas_chat import AtlasChat
    from rich.console import Console

    class BrowserChat(AtlasChat):
        def _prepare_storage(self):
            pass

        def log(self, *args, **kwargs):
            pass

        @staticmethod
        def _terminal_instructions():
            return browser_instructions()

    return BrowserChat(console=Console(file=io.StringIO(), width=100), persist=False)

class Conversation:
    def __init__(self, factory=load_client):
        self.factory, self.client = factory, None
        self.lock = threading.Lock()
        self.cancel = threading.Event()
        self.touched = time.monotonic()
        self.expected = ""

    @staticmethod
    def fingerprint(messages):
        return hashlib.sha256(json.dumps(messages, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

    def close(self):
        self.cancel.set()
        if self.client:
            self.client.close()
            self.client = None
        self.expected = ""

    def run(self, messages, emit, *, reserved=False):
        if not reserved and not self.lock.acquire(False):
            emit("error", {"message": "Este chat ya está respondiendo"})
            return
        self.touched = time.monotonic()
        try:
            if self.cancel.is_set():
                self.close()
                emit("cancelled", {})
                return
            previous = messages[:-1]
            if not self.client or self.client.ws is None or self.expected != self.fingerprint(previous):
                if self.client:
                    self.client.close()
                self.client = self.factory()
                emit("status", {"message": "Conectando con ATLAS"})
                with BROKER_LIFECYCLE_LOCK:
                    self.client.connect()
                if self.cancel.is_set():
                    self.close()
                    emit("cancelled", {})
                    return
                for item in previous:
                    self.client._send({"type": "conversation.item.create", "item": item})
            client = self.client
            emit("meta", {"model": client.session.get("model"), "context": client.context_stats})
            client._send({"type": "conversation.item.create", "item": messages[-1]})
            client._send({"type": "response.create", "response": {"output_modalities": ["text"]}})
            text, tool_count, pending = "", 0, False
            seen_text = set()
            started, deadline = time.monotonic(), time.monotonic() + 180
            first = None
            while not self.cancel.is_set():
                if time.monotonic() > deadline:
                    raise TimeoutError("La respuesta ha superado el tiempo máximo")
                try:
                    event = client._recv(timeout=1)
                except TimeoutError:
                    continue
                kind = event.get("type")
                if kind in {"response.output_text.delta", "response.text.delta"}:
                    delta = str(event.get("delta", ""))
                    seen_text.add(event.get("item_id", "default"))
                    text += delta
                    if delta and first is None:
                        first = time.monotonic() - started
                    emit("delta", {"text": delta})
                elif kind == "response.output_text.done" and event.get("item_id", "default") not in seen_text:
                    text += event.get("text", "")
                    emit("delta", {"text": event.get("text", "")})
                elif kind == "response.function_call_arguments.done":
                    if self.cancel.is_set():
                        break
                    tool_count += 1
                    if tool_count > 16:
                        raise RuntimeError("Límite de herramientas alcanzado; puedes continuar en otro mensaje")
                    name = str(event.get("name", ""))
                    emit("tool", {"name": name})
                    args = client._parse_arguments(event.get("arguments", "{}"))
                    result = client._run_tool(name, args, f"portal-{uuid4().hex}")
                    if self.cancel.is_set():
                        break
                    screenshot = client._last_tool_image
                    client._last_tool_image = None
                    client._send_tool_result(str(event.get("call_id", "")), result, screenshot)
                    pending = True
                elif kind == "error":
                    raise RuntimeError(client._error_text(event))
                elif kind == "response.done":
                    response = event.get("response", {})
                    if response.get("status") != "completed":
                        raise RuntimeError("La respuesta no se pudo completar; no se reenvió automáticamente")
                    if pending:
                        pending, text = False, ""
                        seen_text.clear()
                        emit("replace", {"text": ""})
                        client._send({"type": "response.create", "response": {"output_modalities": ["text"]}})
                        continue
                    usage = response.get("usage", {})
                    self.expected = self.fingerprint(messages + [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": text}]}])
                    emit("done", {"text": text, "usage": usage, "contextLimit": client.webscreen.REALTIME_CONTEXT_LIMIT_TOKENS,
                                  "firstTextMs": round(first * 1000) if first is not None else None,
                                  "durationMs": round((time.monotonic() - started) * 1000)})
                    return
            # Cancellation must not replay tools or retain a half-complete turn.
            self.close()
            emit("cancelled", {})
        except Exception as error:
            self.close()
            # No tracebacks, arguments, tokens or provider headers reach the UI.
            message = str(error)[:240]
            if any(word in message.lower() for word in ("bearer", "token=", "authorization", "api_key", "clientsecret")):
                message = "No se pudo completar la conexión con ATLAS"
            emit("error", {"message": message})
        finally:
            self.touched = time.monotonic()
            self.lock.release()
