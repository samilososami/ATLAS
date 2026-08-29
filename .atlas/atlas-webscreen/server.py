#!/usr/bin/env python3
"""Backend de voz de ATLAS WebScreen."""

from __future__ import annotations

import base64
import difflib
import hashlib
import json
import os
import queue
import random
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import unicodedata
import wave
from collections import deque
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo
from codex_usage import CodexUsageCache
from access_control import AccessControl, AccessError

HOST = os.environ.get("ATLAS_WEBSCREEN_HOST", "0.0.0.0")
PORT = int(os.environ.get("ATLAS_WEBSCREEN_PORT", "5000"))
ROOT_DIR = Path(__file__).resolve().parent
STATIC_DIR = ROOT_DIR / "static"
RUNTIME_DIR = ROOT_DIR / ".runtime"
MODEL_DIR = ROOT_DIR / ".models"
LOG_DIR = ROOT_DIR / "logs"
SESSION_FILE = RUNTIME_DIR / "webscreen-session.json"
SETTINGS_FILE = RUNTIME_DIR / "webscreen-settings.json"
GATEWAY_BRIDGE = ROOT_DIR / "gateway_bridge.mjs"
INSTRUCTIONS_FILE = ROOT_DIR / "WEBSCREEN_INSTRUCTIONS.md"
OPENCLAW_CONFIG = Path.home() / ".openclaw" / "openclaw.json"
WHISPER_MODEL_NAME = os.environ.get("ATLAS_WHISPER_MODEL", "tiny")
WHISPER_CPP_BIN = Path(os.environ.get(
    "ATLAS_WHISPER_CPP_BIN",
    Path.home() / ".openclaw/tools/whisper.cpp/build/bin/whisper-cli",
))
WHISPER_CPP_MODEL = Path(os.environ.get(
    "ATLAS_WHISPER_CPP_MODEL", MODEL_DIR / f"ggml-{WHISPER_MODEL_NAME}.bin"
))
WHISPER_CPP_THREADS = os.environ.get("ATLAS_WHISPER_CPP_THREADS", "4")
SESSION_IDLE_SECONDS = int(os.environ.get("ATLAS_WEBSCREEN_SESSION_IDLE", "1800"))
AGENT_TIMEOUT_SECONDS = int(os.environ.get("ATLAS_WEBSCREEN_AGENT_TIMEOUT", "180"))
STARTER_TIMEOUT_SECONDS = int(os.environ.get("ATLAS_WEBSCREEN_STARTER_TIMEOUT", "25"))
STARTER_AGENT_ID = os.environ.get("ATLAS_WEBSCREEN_STARTER_AGENT", "main")
STARTER_SESSION_KEY = os.environ.get(
    "ATLAS_WEBSCREEN_STARTER_SESSION",
    "agent:main:subagent:atlas-webscreen-preamble",
)
RESIDENT_STARTER_SESSION_KEY = os.environ.get(
    "ATLAS_WEBSCREEN_RESIDENT_STARTER_SESSION",
    "agent:main:subagent:atlas-webscreen-hot-listener",
)
RESIDENT_STARTER_TIMEOUT_SECONDS = int(os.environ.get(
    "ATLAS_WEBSCREEN_RESIDENT_STARTER_TIMEOUT", "172800"
))
RESIDENT_STARTER_REARM_SECONDS = int(os.environ.get(
    "ATLAS_WEBSCREEN_RESIDENT_STARTER_REARM", "540"
))
RESIDENT_STARTER_DELIVERY_DEADLINE_SECONDS = float(os.environ.get(
    "ATLAS_WEBSCREEN_RESIDENT_STARTER_DEADLINE", "0.8"
))
SPECULATIVE_STARTER_TTL_SECONDS = 120
PROGRESS_MIN_INTERVAL_SECONDS = int(os.environ.get("ATLAS_WEBSCREEN_PROGRESS_INTERVAL", "8"))
PROGRESS_MAX_MESSAGES = int(os.environ.get("ATLAS_WEBSCREEN_PROGRESS_MAX", "4"))
AGENT_MODEL_OVERRIDE = os.environ.get("ATLAS_WEBSCREEN_AGENT_MODEL", "").strip()
AGENT_FAST_MODE = os.environ.get("ATLAS_WEBSCREEN_FAST_MODE", "1").lower() not in {
    "0", "false", "no", "off"
}
REALTIME_MODEL = os.environ.get("ATLAS_REALTIME_MODEL", "gpt-realtime-2.1").strip()
REALTIME_VOICE = os.environ.get("ATLAS_REALTIME_VOICE", "marin").strip()
REALTIME_VAD_THRESHOLD = float(os.environ.get("ATLAS_REALTIME_VAD_THRESHOLD", "0.45"))
REALTIME_SILENCE_MS = int(os.environ.get("ATLAS_REALTIME_SILENCE_MS", "500"))
REALTIME_PREFIX_PADDING_MS = int(os.environ.get("ATLAS_REALTIME_PREFIX_PADDING_MS", "300"))
MIN_AUDIO_RMS = float(os.environ.get("ATLAS_MIN_AUDIO_RMS", "80"))
MAX_AUDIO_BYTES = 16 * 1024 * 1024
FOLLOW_UP_MARKER = "[[ESPERA_RESPUESTA]]"

WHISPER_LOCK = threading.Lock()
SESSION_LOCK = threading.Lock()
SETTINGS_LOCK = threading.Lock()
LOG_LOCK = threading.Lock()
ACTIVE_RUNS_LOCK = threading.Lock()
SPECULATIVE_STARTERS_LOCK = threading.Lock()
SPECULATIVE_MAIN_RUNS_LOCK = threading.Lock()
STARTER_RUN_LOCK = threading.Lock()
SPECULATIVE_MAIN_RUN_LOCK = threading.Lock()
STARTER_HISTORY_LOCK = threading.Lock()
FAST_DIRECT_PARENTS_LOCK = threading.Lock()
RESIDENT_STARTER_CONDITION = threading.Condition(threading.RLock())
MODEL: Any | None = None
MODEL_ERROR: str | None = None
WHISPER_ENGINE = "python"
ACTIVE_RUNS: dict[str, dict[str, Any]] = {}
SPECULATIVE_STARTERS: dict[str, "SpeculativeStarter"] = {}
SPECULATIVE_MAIN_RUNS: dict[str, "SpeculativeMainRun"] = {}
RECENT_STARTERS: deque[str] = deque(maxlen=6)
FAST_DIRECT_PARENTS: dict[str, float] = {}
FAST_CONTEXT_LOCK = threading.Lock()
FAST_CONTEXT: dict[str, Any] = {"session": "", "turns": deque(maxlen=12), "state": ""}
FAST_DIRECT_PARENT_TTL_SECONDS = 120

DISMISSAL_CORES = {
    "nada", "nada nada", "no nada", "no no nada", "no no nada nada",
    "ah nada", "ah nada nada", "ah no nada", "ah no nada nada",
    "ah no no nada", "ah no no nada nada", "eh nada", "eh nada nada",
    "eh no nada", "ay nada", "ay nada nada", "ay no nada",
    "ay no nada nada", "ay no no nada", "ay no no nada nada",
    "bueno nada", "bueno nada nada", "no era nada",
    "ah no era nada", "eh no era nada", "no es nada", "no queria nada",
    "no necesito nada", "ya no necesito nada", "no hace falta",
    "ya no hace falta", "dejalo", "dejalo estar", "mejor dejalo",
    "olvidalo", "mejor olvidalo", "da igual", "ah da igual",
    "bueno da igual", "falsa alarma", "ha sido falsa alarma",
    "me he equivocado", "perdon me he equivocado", "fue sin querer",
    "ha sido sin querer", "te llame sin querer", "era una prueba",
    "solo era una prueba", "solo estaba probando", "estaba probando",
    "ya esta", "todo bien", "esta todo bien", "no importa",
}
DISMISSAL_SUFFIXES = ("", " gracias", " perdona", " atlas", " gracias atlas")
DISMISSAL_PHRASES = {
    f"{phrase}{suffix}".strip()
    for phrase in DISMISSAL_CORES
    for suffix in DISMISSAL_SUFFIXES
}
DISMISSAL_REPLIES = (
    "Vale.", "De acuerdo.", "Entendido.", "Está bien.", "Perfecto.",
    "Sin problema.", "Okay.", "Como quieras.", "Aquí estaré.", "Cuando quieras.",
)

FOLLOW_UP_DEFER_CORES = {
    "dejame pensarlo", "dejame que lo piense", "me lo pienso",
    "voy a pensarlo", "voy a pensarmelo", "lo voy a pensar",
    "quiero pensarlo", "quiero pensarmelo", "prefiero pensarlo",
    "necesito pensarlo", "tengo que pensarlo", "ya lo pensare",
    "lo pensare", "lo miro con calma", "me lo miro con calma",
    "quiero mirarlo con calma", "necesito mirarlo con calma",
    "ahora mismo no se", "todavia no lo se", "aun no lo se",
    "no lo tengo claro", "no estoy seguro", "no estoy segura",
    "mejor me lo pienso", "mejor lo pienso", "dame tiempo para pensarlo",
}
FOLLOW_UP_DEFER_PREFIXES = (
    "", "bueno ", "vale ", "pues ", "bueno pues ", "a ver ", "mmm ", "eh ",
)
FOLLOW_UP_DEFER_SUFFIXES = (
    "", " y te digo", " y te aviso", " luego te digo", " luego te aviso",
    " y luego te digo", " y luego te aviso", " con calma", " un poco",
    " y hablamos",
)
FOLLOW_UP_DEFER_COURTESIES = (
    "", " gracias", " atlas", " gracias atlas",
)
FOLLOW_UP_DEFER_PHRASES = {
    f"{prefix}{core}{suffix}{courtesy}".strip()
    for prefix in FOLLOW_UP_DEFER_PREFIXES
    for core in FOLLOW_UP_DEFER_CORES
    for suffix in FOLLOW_UP_DEFER_SUFFIXES
    for courtesy in FOLLOW_UP_DEFER_COURTESIES
}
FOLLOW_UP_DEFER_REPLIES = (
    "De acuerdo.", "Vale.", "Perfecto, ya me avisarás.",
    "Claro, tómate tu tiempo.", "Sin problema, cuando lo tengas claro.",
    "Está bien, me dices cuando quieras.", "Perfecto, lo dejamos aquí por ahora.",
    "Entendido, ya me dirás.", "Vale, piénsatelo con calma.",
    "De acuerdo, aquí estaré.",
)


class CancelledRun(RuntimeError):
    pass


class PersistentGatewayBridge:
    """Mantiene un único proceso Node y una única conexión con el Gateway."""

    def __init__(self) -> None:
        self.process: subprocess.Popen[str] | None = None
        self.pending: dict[str, queue.Queue[dict[str, Any]]] = {}
        self.lock = threading.RLock()
        self.write_lock = threading.Lock()
        self.ready = threading.Event()
        self.stderr_file: Any | None = None
        self.last_error = ""

    def start(self, timeout: float = 12.0) -> None:
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                process = self.process
            else:
                node = shutil.which("node") or "/usr/bin/node"
                if not Path(node).exists() or not GATEWAY_BRIDGE.exists():
                    raise RuntimeError("El bridge persistente de OpenClaw no está disponible")
                RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
                self.ready.clear()
                self.last_error = ""
                self.stderr_file = (RUNTIME_DIR / "gateway-bridge.log").open("a", encoding="utf-8")
                process = subprocess.Popen(
                    [node, str(GATEWAY_BRIDGE)], cwd=str(ROOT_DIR),
                    env={**os.environ, "HOME": str(Path.home())},
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=self.stderr_file, text=True, bufsize=1,
                )
                self.process = process
                threading.Thread(
                    target=self._reader, args=(process,), name="gateway-bridge-reader", daemon=True,
                ).start()
        if not self.ready.wait(timeout):
            detail = self.last_error or "el Gateway no confirmó la conexión"
            self.stop()
            raise RuntimeError(f"No se pudo iniciar el bridge persistente: {detail}")

    def _reader(self, process: subprocess.Popen[str]) -> None:
        assert process.stdout is not None
        try:
            for raw_line in process.stdout:
                try:
                    event = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue
                bridge_request_id = str(event.get("bridgeRequestId") or "")
                if bridge_request_id:
                    with self.lock:
                        target = self.pending.get(bridge_request_id)
                    if target is not None:
                        target.put(event)
                    continue
                if event.get("type") == "bridge_ready":
                    self.last_error = ""
                    self.ready.set()
                elif event.get("type") in {"bridge_error", "bridge_status"}:
                    self.last_error = str(event.get("message") or event.get("state") or "")
        finally:
            if process.poll() is None:
                process.wait(timeout=2)
            failure = {
                "type": "error",
                "message": self.last_error or "El bridge persistente de OpenClaw se ha detenido",
            }
            with self.lock:
                targets = list(self.pending.values())
                self.pending.clear()
                if self.process is process:
                    self.process = None
                self.ready.clear()
            for target in targets:
                target.put(failure)

    def send(self, payload: dict[str, Any]) -> None:
        self.start()
        with self.write_lock:
            process = self.process
            if process is None or process.poll() is not None or process.stdin is None:
                raise RuntimeError("El bridge persistente no está disponible")
            process.stdin.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
            process.stdin.flush()

    def run(self, request: dict[str, Any], cancel_event: threading.Event) -> Any:
        bridge_request_id = uuid4().hex
        events: queue.Queue[dict[str, Any]] = queue.Queue()
        with self.lock:
            self.pending[bridge_request_id] = events
        payload = {"command": "run", "bridgeRequestId": bridge_request_id, **request}
        try:
            self.send(payload)
            while True:
                if cancel_event.is_set():
                    try:
                        self.send({"command": "cancel", "bridgeRequestId": bridge_request_id})
                    except RuntimeError:
                        pass
                    raise CancelledRun("Interacción cancelada")
                try:
                    event = events.get(timeout=0.1)
                except queue.Empty:
                    continue
                yield event
                if event.get("type") in {"final", "error"}:
                    return
        finally:
            with self.lock:
                self.pending.pop(bridge_request_id, None)

    def inject(self, request: dict[str, Any], timeout: float = 10.0) -> dict[str, Any]:
        """Añade contexto a una sesión sin arrancar otro turno del modelo."""
        bridge_request_id = uuid4().hex
        events: queue.Queue[dict[str, Any]] = queue.Queue()
        with self.lock:
            self.pending[bridge_request_id] = events
        try:
            self.send({
                "command": "inject", "bridgeRequestId": bridge_request_id, **request,
            })
            deadline = time.monotonic() + timeout
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RuntimeError("OpenClaw no confirmó el contexto rápido a tiempo")
                try:
                    event = events.get(timeout=min(0.25, remaining))
                except queue.Empty:
                    continue
                if event.get("type") == "injected":
                    return event
                if event.get("type") == "error":
                    raise RuntimeError(str(event.get("message") or "Falló chat.inject"))
        finally:
            with self.lock:
                self.pending.pop(bridge_request_id, None)

    def usage(self, timeout: float = 20.0) -> dict[str, Any]:
        """Read the authenticated Gateway's quotas without creating an agent turn."""
        bridge_request_id = uuid4().hex
        events: queue.Queue[dict[str, Any]] = queue.Queue()
        with self.lock:
            self.pending[bridge_request_id] = events
        try:
            self.send({"command": "usage", "bridgeRequestId": bridge_request_id})
            try:
                event = events.get(timeout=timeout)
            except queue.Empty as error:
                raise RuntimeError("La consulta de límites agotó su tiempo") from error
            if event.get("type") != "usage":
                raise RuntimeError("OpenClaw no pudo consultar los límites")
            return event.get("summary") or {}
        finally:
            with self.lock:
                self.pending.pop(bridge_request_id, None)

    def create_talk_session(self, params: dict[str, Any],
                            timeout: float = 20.0) -> dict[str, Any]:
        """Reserva una sesión WebRTC efímera sin exponer el OAuth persistente."""
        bridge_request_id = uuid4().hex
        events: queue.Queue[dict[str, Any]] = queue.Queue()
        with self.lock:
            self.pending[bridge_request_id] = events
        try:
            self.send({
                "command": "talk_create", "bridgeRequestId": bridge_request_id,
                "params": params,
            })
            try:
                event = events.get(timeout=timeout)
            except queue.Empty as error:
                raise RuntimeError("OpenAI Realtime no reservó la sesión a tiempo") from error
            if event.get("type") == "error":
                raise RuntimeError(str(event.get("message") or "OpenAI Realtime no está disponible"))
            if event.get("type") != "talk_session" or not isinstance(event.get("session"), dict):
                raise RuntimeError("OpenClaw devolvió una sesión Realtime inválida")
            return event["session"]
        finally:
            with self.lock:
                self.pending.pop(bridge_request_id, None)

    def health(self) -> dict[str, Any]:
        with self.lock:
            alive = self.process is not None and self.process.poll() is None
            return {
                "ready": bool(alive and self.ready.is_set()),
                "persistent": True,
                "pid": self.process.pid if alive and self.process is not None else None,
                "pending": len(self.pending),
                "error": self.last_error or None,
            }

    def stop(self) -> None:
        with self.lock:
            process = self.process
            self.process = None
            self.ready.clear()
        if process is not None and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=3)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
        if self.stderr_file is not None:
            try:
                self.stderr_file.close()
            except OSError:
                pass
            self.stderr_file = None


class SpeculativeStarter:
    def __init__(self, interaction_id: str, transcript: str, tts_provider: str) -> None:
        self.interaction_id = interaction_id
        self.transcript = transcript
        self.tts_provider = tts_provider
        self.created_at = time.time()
        self.started_at = time.perf_counter()
        self.done = threading.Event()
        self.cancel = threading.Event()
        self.text = ""
        self.audio: bytes = b""
        self.model_ms = 0.0
        self.tts_ms = 0.0
        self.error = ""
        self.route = "delegate"
        self.conversation_state = ""


class ResidentStarterPool:
    """Mantiene un turno de Luna dormido dentro de la herramienta de espera."""

    def __init__(self) -> None:
        self.pending: dict[str, SpeculativeStarter] = {}
        self.input_payload: dict[str, Any] | None = None
        self.active: SpeculativeStarter | None = None
        self.run_cancel: threading.Event | None = None
        self.shutdown = threading.Event()
        self.status = "stopped"
        self.last_error = ""
        self.run_started_at = 0.0

    def begin_run(self, cancel_event: threading.Event) -> None:
        with RESIDENT_STARTER_CONDITION:
            self.run_cancel = cancel_event
            self.input_payload = None
            self.active = None
            self.status = "warming"
            self.last_error = ""
            self.run_started_at = time.time()
            RESIDENT_STARTER_CONDITION.notify_all()

    def wait_for_input(self) -> dict[str, Any]:
        with RESIDENT_STARTER_CONDITION:
            self.status = "ready"
            RESIDENT_STARTER_CONDITION.notify_all()
            deadline = time.monotonic() + RESIDENT_STARTER_REARM_SECONDS
            while self.input_payload is None:
                if self.shutdown.is_set() or (self.run_cancel and self.run_cancel.is_set()):
                    raise CancelledRun("El oyente caliente se está reiniciando")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self.status = "rearming"
                    RESIDENT_STARTER_CONDITION.notify_all()
                    return {"phase": "rearm"}
                RESIDENT_STARTER_CONDITION.wait(timeout=min(0.5, remaining))
            payload = self.input_payload
            self.input_payload = None
            self.status = "generating"
            RESIDENT_STARTER_CONDITION.notify_all()
            return payload

    def claim(self, interaction_id: str, transcript: str,
              tts_provider: str) -> tuple[bool, str]:
        with RESIDENT_STARTER_CONDITION:
            if self.status != "ready" or self.input_payload is not None or self.active is not None:
                return False, self.status
            state = SpeculativeStarter(interaction_id, transcript, tts_provider)
            self.pending[interaction_id] = state
            self.active = state
            self.input_payload = {
                "phase": "partial",
                "interactionId": interaction_id,
                "transcript": transcript,
                "conversation": fast_context_snapshot(),
                "currentTime": datetime.now(ZoneInfo("Europe/Madrid")).isoformat(),
            }
            self.status = "claimed"
            RESIDENT_STARTER_CONDITION.notify_all()
            return True, "hot-listener-claimed"

    def complete(self, text: str, error: str = "", route: str = "delegate",
                 conversation_state: str = "") -> None:
        with RESIDENT_STARTER_CONDITION:
            state = self.active
            self.active = None
            self.status = "recycling"
            if state is not None:
                state.model_ms = (time.perf_counter() - state.started_at) * 1000
                state.error = error[:300]
                state.text = text[:1400]
                state.route = route
                state.conversation_state = conversation_state[:800]
                state.done.set()
            RESIDENT_STARTER_CONDITION.notify_all()

    def end_run(self, error: str = "") -> None:
        with RESIDENT_STARTER_CONDITION:
            state = self.active
            self.active = None
            self.input_payload = None
            self.run_cancel = None
            self.status = "restarting" if not self.shutdown.is_set() else "stopped"
            self.last_error = error[:300]
            if state is not None and not state.done.is_set():
                state.error = self.last_error or "El oyente caliente terminó sin respuesta"
                state.done.set()
            RESIDENT_STARTER_CONDITION.notify_all()

    def take(self, interaction_id: str, final_transcript: str,
             tts_provider: str, cancel_event: threading.Event
             ) -> tuple[bool, SpeculativeStarter | None]:
        with RESIDENT_STARTER_CONDITION:
            state = self.pending.pop(interaction_id, None)
        if state is None:
            return False, None
        if not starter_transcript_matches(state.transcript, final_transcript):
            self.cancel(interaction_id)
            return True, None
        deadline = time.monotonic() + RESIDENT_STARTER_DELIVERY_DEADLINE_SECONDS
        while not state.done.wait(0.05):
            if cancel_event.is_set():
                self.cancel(interaction_id)
                raise CancelledRun("Interacción cancelada")
            if time.monotonic() >= deadline:
                state.error = "El oyente caliente superó su límite de entrega"
                self.cancel(interaction_id)
                return True, None
        if state.error or not state.text:
            return True, None
        if (state.route == "direct" and
                normalize_spoken_phrase(state.transcript) != normalize_spoken_phrase(final_transcript)):
            return True, None
        if tts_provider == "elevenlabs" and not state.audio:
            tts_started = time.perf_counter()
            state.audio = text_to_speech(extract_follow_up_intent(state.text)[0])
            state.tts_ms = (time.perf_counter() - tts_started) * 1000
        return True, state

    def cancel(self, interaction_id: str) -> None:
        with RESIDENT_STARTER_CONDITION:
            state = self.pending.pop(interaction_id, None)
            if state is None and self.active is not None:
                if self.active.interaction_id == interaction_id:
                    state = self.active
            if state is not None:
                state.cancel.set()
            if self.active is state and self.run_cancel is not None:
                self.run_cancel.set()
            RESIDENT_STARTER_CONDITION.notify_all()

    def has(self, interaction_id: str) -> bool:
        with RESIDENT_STARTER_CONDITION:
            return interaction_id in self.pending

    def health(self) -> dict[str, Any]:
        with RESIDENT_STARTER_CONDITION:
            return {
                "enabled": True,
                "ready": self.status == "ready",
                "status": self.status,
                "pending": len(self.pending),
                "runAgeSeconds": round(max(0.0, time.time() - self.run_started_at), 1)
                if self.run_started_at else None,
                "error": self.last_error or None,
            }

    def stop(self) -> None:
        self.shutdown.set()
        with RESIDENT_STARTER_CONDITION:
            if self.run_cancel is not None:
                self.run_cancel.set()
            RESIDENT_STARTER_CONDITION.notify_all()


class SpeculativeMainRun:
    """Turno anticipado y de solo lectura del agente principal."""

    def __init__(self, interaction_id: str, transcript: str, session_key: str,
                 tts_provider: str) -> None:
        self.interaction_id = interaction_id
        self.transcript = transcript
        self.session_key = session_key
        self.tts_provider = tts_provider
        self.created_at = time.time()
        self.started_at = time.perf_counter()
        self.done = threading.Event()
        self.cancel = threading.Event()
        self.events: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue()
        self.result: tuple[str, list[dict[str, Any]], list[str], str] | None = None
        self.model_ms = 0.0
        self.error = ""


BRIDGE = PersistentGatewayBridge()
CODEX_USAGE = CodexUsageCache(BRIDGE.usage)
RESIDENT_STARTERS = ResidentStarterPool()


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def safe_identifier(value: str | None, fallback: str | None = None) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.:-]", "", (value or "").strip())[:96]
    return cleaned or fallback or uuid4().hex


def load_openclaw_config() -> dict[str, Any]:
    try:
        value = json.loads(OPENCLAW_CONFIG.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def configured_model() -> str:
    if AGENT_MODEL_OVERRIDE:
        return AGENT_MODEL_OVERRIDE
    model = load_openclaw_config().get("agents", {}).get("defaults", {}).get("model", {})
    if isinstance(model, str):
        return model
    return str(model.get("primary") or "") if isinstance(model, dict) else ""


def session_fingerprint(session_key: str) -> str:
    return hashlib.sha256(session_key.encode()).hexdigest()[:10]


def current_session() -> tuple[str, bool, float]:
    """Reutiliza una sesión WebScreen y la renueva tras 30 minutos sin uso."""
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    now = time.time()
    with SESSION_LOCK:
        try:
            state = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            state = {}
        key = str(state.get("sessionKey") or "")
        last_activity = float(state.get("lastActivity") or 0)
        idle_seconds = max(0.0, now - last_activity) if last_activity else 0.0
        renewed = not key or not last_activity or idle_seconds >= SESSION_IDLE_SECONDS
        if renewed:
            key = f"agent:main:atlas-webscreen:{uuid4().hex}"
            idle_seconds = 0.0
        SESSION_FILE.write_text(
            json.dumps({"sessionKey": key, "lastActivity": now}, separators=(",", ":")),
            encoding="utf-8",
        )
        SESSION_FILE.chmod(0o600)
        return key, renewed, idle_seconds


def session_health() -> dict[str, Any]:
    try:
        state = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
        key = str(state.get("sessionKey") or "")
        last = float(state.get("lastActivity") or 0)
    except (OSError, ValueError, json.JSONDecodeError):
        return {"active": False, "idleTimeoutSeconds": SESSION_IDLE_SECONDS}
    return {
        "active": bool(key),
        "id": session_fingerprint(key) if key else None,
        "idleSeconds": round(max(0.0, time.time() - last), 1) if last else None,
        "idleTimeoutSeconds": SESSION_IDLE_SECONDS,
    }


class InteractionLog:
    def __init__(self, interaction_id: str) -> None:
        self.interaction_id = safe_identifier(interaction_id)
        now = datetime.now().astimezone()
        directory = LOG_DIR / now.strftime("%Y-%m-%d")
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)
        self.path = directory / f"{now:%H-%M-%S-%f}-{self.interaction_id}.log"
        self.path.touch(mode=0o600, exist_ok=False)

    def add(self, stage: str, message: str, duration_ms: float | None = None, **details: Any) -> None:
        record: dict[str, Any] = {
            "timestamp": now_iso(), "interaction": self.interaction_id,
            "stage": stage, "message": message,
        }
        if duration_ms is not None:
            record["duration_ms"] = round(float(duration_ms), 1)
        record.update({key: value for key, value in details.items() if value is not None})
        with LOG_LOCK, self.path.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


def append_client_event(payload: dict[str, Any]) -> Path:
    interaction_id = safe_identifier(str(payload.get("interactionId") or ""), "")
    if not interaction_id:
        raise ValueError("Falta interactionId")
    candidates = sorted(LOG_DIR.glob(f"*/*-{interaction_id}.log"), reverse=True)
    if not candidates:
        raise FileNotFoundError("No existe el log de la interacción")
    stage = re.sub(r"[^a-zA-Z0-9_.-]", "", str(payload.get("stage") or ""))[:80]
    if not stage:
        raise ValueError("Falta stage")
    record: dict[str, Any] = {
        "timestamp": now_iso(),
        "interaction": interaction_id,
        "stage": f"browser.{stage}",
        "message": str(payload.get("message") or "Evento del navegador")[:500],
    }
    duration = payload.get("durationMs")
    if isinstance(duration, (int, float)):
        record["duration_ms"] = round(float(duration), 1)
    error = payload.get("error")
    if error:
        record["error"] = str(error)[:500]
    client_build = payload.get("clientBuild")
    if client_build:
        record["client_build"] = str(client_build)[:80]
    with LOG_LOCK, candidates[0].open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    return candidates[0]


def append_realtime_event(payload: dict[str, Any]) -> Path:
    """Registra también los turnos resueltos íntegramente dentro de Realtime."""
    interaction_id = safe_identifier(str(payload.get("interactionId") or ""), "")
    if not interaction_id:
        raise ValueError("Falta interactionId")
    stage = re.sub(r"[^a-zA-Z0-9_.-]", "", str(payload.get("stage") or ""))[:80]
    if not stage:
        raise ValueError("Falta stage")
    current = datetime.now(ZoneInfo("Europe/Madrid"))
    folder = LOG_DIR / current.strftime("%Y-%m-%d")
    folder.mkdir(parents=True, exist_ok=True)
    candidates = sorted(folder.glob(f"*-{interaction_id}.log"))
    path = candidates[0] if candidates else folder / f"{current.strftime('%H%M%S')}-{interaction_id}.log"
    record: dict[str, Any] = {
        "timestamp": now_iso(), "interaction": interaction_id,
        "stage": f"realtime.{stage}",
        "message": str(payload.get("message") or "Evento OpenAI Realtime")[:1000],
    }
    for key in ("role", "text", "model", "voice", "status", "source"):
        value = payload.get(key)
        if value not in (None, ""):
            record[key] = str(value)[:8000 if key == "text" else 500]
    duration = payload.get("durationMs")
    if isinstance(duration, (int, float)):
        record["duration_ms"] = round(float(duration), 1)
    with LOG_LOCK, path.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    return path


def register_run(request_id: str) -> threading.Event:
    event = threading.Event()
    with ACTIVE_RUNS_LOCK:
        ACTIVE_RUNS[request_id] = {"cancel": event, "processes": []}
    return event


def set_run_process(request_id: str, process: subprocess.Popen[str]) -> None:
    with ACTIVE_RUNS_LOCK:
        run = ACTIVE_RUNS.get(request_id)
        if run is None:
            return
        run["processes"].append(process)
        cancelled = run["cancel"].is_set()
    if cancelled:
        terminate_process(process)


def terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=2)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            process.kill()
        except ProcessLookupError:
            pass


def cancel_run(request_id: str | None) -> int:
    with ACTIVE_RUNS_LOCK:
        targets = [run for run_id, run in ACTIVE_RUNS.items() if request_id is None or run_id == request_id]
        for run in targets:
            run["cancel"].set()
        processes = [process for run in targets for process in run.get("processes", [])]
    for process in processes:
        terminate_process(process)
    return len(targets)


def raise_if_cancelled(event: threading.Event) -> None:
    if event.is_set():
        raise CancelledRun("Interacción cancelada")


def get_tts_settings() -> tuple[str, str]:
    sag = load_openclaw_config().get("skills", {}).get("entries", {}).get("sag", {})
    env = sag.get("env", {}) if isinstance(sag, dict) else {}
    api_key = os.environ.get("ELEVENLABS_API_KEY") or sag.get("apiKey", "")
    with SETTINGS_LOCK:
        try:
            stored = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            stored = {}
    voice_id = (stored.get("elevenlabsVoiceId")
                or os.environ.get("ELEVENLABS_VOICE_ID")
                or env.get("ELEVENLABS_VOICE_ID") or env.get("SAG_VOICE_ID") or "")
    return str(api_key), str(voice_id)


def get_webscreen_settings() -> dict[str, Any]:
    with SETTINGS_LOCK:
        try:
            stored = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            stored = {}
    _, effective_voice_id = get_tts_settings()
    return {
        "elevenlabsVoiceId": effective_voice_id,
        "voiceIdOverride": bool(stored.get("elevenlabsVoiceId")),
    }


def save_webscreen_voice_id(voice_id: str) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"elevenlabsVoiceId": voice_id} if voice_id else {}
    with SETTINGS_LOCK:
        SETTINGS_FILE.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        SETTINGS_FILE.chmod(0o600)


def load_whisper_model() -> None:
    global MODEL, MODEL_ERROR, WHISPER_ENGINE
    if WHISPER_CPP_BIN.exists() and WHISPER_CPP_MODEL.exists():
        MODEL, MODEL_ERROR, WHISPER_ENGINE = {"engine": "whisper.cpp"}, None, "whisper.cpp"
        print(f"Whisper local preparado: whisper.cpp {WHISPER_MODEL_NAME}", flush=True)
        return
    try:
        import whisper  # type: ignore
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        MODEL = whisper.load_model(WHISPER_MODEL_NAME, device="cpu", download_root=str(MODEL_DIR))
        MODEL_ERROR, WHISPER_ENGINE = None, "python"
        print(f"Whisper local preparado: Python {WHISPER_MODEL_NAME}", flush=True)
    except Exception as error:
        MODEL, MODEL_ERROR = None, f"{type(error).__name__}: {error}"
        print(f"Whisper no disponible: {MODEL_ERROR}", flush=True)


def clean_transcript(text: str) -> str:
    text = re.sub(r"\[(?:música|music|silencio|silence|blank_audio|inaudible)\]", " ", text,
                  flags=re.IGNORECASE)
    return " ".join(text.strip().split())


def spanish_number(value: int) -> str:
    units = (
        "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete",
        "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince",
        "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte",
        "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
        "veintiséis", "veintisiete", "veintiocho", "veintinueve",
    )
    if 0 <= value < len(units):
        return units[value]
    tens = {
        30: "treinta", 40: "cuarenta", 50: "cincuenta", 60: "sesenta",
        70: "setenta", 80: "ochenta", 90: "noventa",
    }
    if value < 100:
        base = value // 10 * 10
        return tens[base] if value == base else f"{tens[base]} y {units[value % 10]}"
    if value == 100:
        return "cien"
    if value < 200:
        return f"ciento {spanish_number(value - 100)}"
    if value < 1000:
        hundreds = ("", "ciento", "doscientos", "trescientos", "cuatrocientos",
                    "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos")
        prefix = hundreds[value // 100]
        return prefix + (f" {spanish_number(value % 100)}" if value % 100 else "")
    thousands, remainder = divmod(value, 1000)
    prefix = "mil" if thousands == 1 else f"{spanish_number(thousands)} mil"
    return prefix + (f" {spanish_number(remainder)}" if remainder else "")


def prepare_voice_text(text: str) -> str:
    """Convierte siglas, unidades e IPs a texto estable para TTS en español."""
    def expand_ipv4(match: re.Match[str]) -> str:
        values = [int(part) for part in match.group(0).split(".")]
        if any(value > 255 for value in values):
            return match.group(0)
        return " punto ".join(spanish_number(value) for value in values)

    text = re.sub(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", expand_ipv4, text)
    text = re.sub(
        r"\b(IDENTITY|SOUL)\.md\b",
        lambda match: f"{match.group(1).lower()} punto eme de",
        text,
        flags=re.IGNORECASE,
    )
    substitutions = (
        (r"(?<!\w)i\.?\s*p\.?(?!\w)", "i pe"),
        (r"(?<!\w)wi[‐‑‒–—-]?fi(?!\w)", "wifi"),
        (r"\bHDMI\b", "h d m i"),
        (r"\bHTTPS\b", "h t t p s"),
        (r"\bHTTP\b", "h t t p"),
        (r"\bAPI\b", "api"),
        (r"\bRAFAS\b", "rafas"),
        (r"\bIDENTITY\b", "identity"),
        (r"\bSOUL\b", "soul"),
        (r"\bURL\b", "u r l"),
        (r"\bDNS\b", "d n s"),
        (r"\bSSD\b", "s s d"),
        (r"\bHDD\b", "h d d"),
        (r"\bNVMe\b", "n v m e"),
        (r"\bLCD\b", "l c d"),
        (r"\bLED\b", "led"),
        (r"\bRAM\b", "ram"),
        (r"\bCPU\b", "ce pe u"),
        (r"\bGPU\b", "ge pe u"),
        (r"\bSSH\b", "ese ese hache"),
        (r"\bUSB\b", "u ese be"),
        (r"\b(?:GB|GiB)\b", "gigabáits"),
        (r"\b(?:MB|MiB)\b", "megabáits"),
        (r"°\s*C\b", "grados Celsius"),
        (r"%", " por ciento"),
    )
    for pattern, replacement in substitutions:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    # Capitalization is not a pronunciation rule. Preserve other words;
    # the voice prompt decides which unfamiliar initialisms need spelling out.
    text = re.sub(r"[«»“”„‟\"]", "", text)
    text = re.sub(r"\s*:\s*", " ", text)
    text = re.sub(r"\s*;\s*", ". ", text)
    text = re.sub(r"\s*,\s*punto\s*,?\s*", " punto ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(ayer|hoy|mañana),\s+", r"\1 ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(ATLAS A uno)\s+que\b", r"\1, que", text, flags=re.IGNORECASE)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)
    return text.strip()


def normalize_spoken_phrase(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.lower())
    normalized = "".join(character for character in normalized
                         if unicodedata.category(character) != "Mn")
    normalized = re.sub(r"\bnono\b", "no no", normalized)
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return " ".join(normalized.split())


def starter_requires_private_context(text: str) -> bool:
    """Reserva el silencio solo para referencias cuya intención aún sea ambigua."""
    phrase = normalize_spoken_phrase(text)
    patterns = (
        r"\bde que estabamos hablando\b",
        r"\bque recuerdas de (?:eso|esto|lo anterior)\b",
    )
    return any(re.search(pattern, phrase) for pattern in patterns)


def resident_can_answer_directly(text: str) -> bool:
    """Reserva la vía ultrarrápida para conversación inmediata inequívoca."""
    phrase = normalize_spoken_phrase(text)
    patterns = (
        r"^(?:hola|buenas|hey|ey)(?: atlas)?$",
        r"^(?:hola|buenas)(?: atlas)? (?:que tal|como estas|como te va)$",
        r"^(?:que tal|como estas|como te va|todo bien)(?: atlas)?$",
        r"^(?:buenos dias|buenas tardes|buenas noches)(?: atlas)?$",
        r"^(?:adios|hasta luego|hasta pronto|nos vemos)(?: atlas)?$",
    )
    return any(re.fullmatch(pattern, phrase) for pattern in patterns)


def requires_main_agent(text: str) -> bool:
    """Keep private context and real-world actions out of the lightweight lane."""
    phrase = normalize_spoken_phrase(text)
    return bool(re.search(
        r"\b(correos?|gmail|bandeja|calendario|agenda|archivos?|carpetas?|"
        r"sistema|almacenamiento|discos?|puertos?|wifi|ram|memoria|monitor|pantalla|"
        r"audio|sonido|bluetooth|dispositivos?|auriculares?|altavoces?|"
        r"raspberry|openclaw|openatlas|identity|soul|proyecto|herramientas?|"
        r"borr\w*|elimin\w*|instal\w*|reinici\w*|apag\w*|enciend\w*|"
        r"envi\w*|public\w*|ejecut\w*|configur\w*|descarg\w*|guard\w*|"
        r"recuerd\w*|busca\w*|investig\w*|noticias|tiempo|temperatura)\b|"
        r"\b(quien soy|quien eres|describete|presentate)\b",
        phrase,
    ))


def fast_context_snapshot() -> dict[str, Any]:
    session_key, _, _ = current_session()
    with FAST_CONTEXT_LOCK:
        if FAST_CONTEXT["session"] != session_key:
            FAST_CONTEXT.update(session=session_key, turns=deque(maxlen=12), state="")
        return {"turns": list(FAST_CONTEXT["turns"]), "state": FAST_CONTEXT["state"]}


def remember_voice_exchange(session_key: str, transcript: str, answer: str,
                            state: str | None = None) -> None:
    with FAST_CONTEXT_LOCK:
        if FAST_CONTEXT["session"] != session_key:
            FAST_CONTEXT.update(session=session_key, turns=deque(maxlen=12), state="")
        FAST_CONTEXT["turns"].append({"user": transcript[:1800], "atlas": answer[:2200]})
        if state is not None:
            FAST_CONTEXT["state"] = state[:800]


def parse_resident_reply(text: str) -> tuple[str, str, str]:
    """Only an explicit, well-formed decision can skip the main agent."""
    try:
        value = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip()))
        if not isinstance(value, dict) or value.get("route") not in {"direct", "delegate"}:
            return "delegate", "", ""
        reply = value.get("text", "")
        state = value.get("state", "")
        if not isinstance(reply, str) or not isinstance(state, str) or len(reply) > 1400:
            return "delegate", "", ""
        reply = strip_starter_name_vocative(reply.strip())
        if value["route"] == "direct" and not reply:
            return "delegate", "", ""
        if value.get("expectsReply") is True and reply:
            reply += " " + FOLLOW_UP_MARKER
        return value["route"], reply, state[:800]
    except (ValueError, TypeError):
        return "delegate", "", ""


def is_local_date_query(text: str) -> bool:
    return bool(re.fullmatch(
        r"(?:atlas )?(?:(?:dime|me dices) )?(?:a que dia estamos|que dia es(?: hoy)?|"
        r"que fecha es(?: hoy)?|cual es la fecha(?: de hoy)?|en que dia estamos)(?: atlas)?",
        normalize_spoken_phrase(text),
    ))


def is_local_time_query(text: str) -> bool:
    """Detecta únicamente peticiones completas y simples de la hora actual."""
    phrase = normalize_spoken_phrase(text)
    patterns = (
        r"^(?:atlas )?que hora es(?: ahora)?$",
        r"^(?:atlas )?(?:dime|me dices|puedes decirme) que hora es(?: ahora)?$",
        r"^(?:atlas )?(?:dime|me dices|puedes decirme) la hora(?: actual)?$",
        r"^(?:atlas )?que hora tenemos(?: ahora)?$",
    )
    return any(re.fullmatch(pattern, phrase) for pattern in patterns)


def starter_should_be_omitted(text: str) -> bool:
    """Evita un acuse separado cuando la respuesta debe ser prácticamente inmediata."""
    phrase = normalize_spoken_phrase(text)
    if is_local_date_query(text) or is_local_time_query(text) or re.fullmatch(
        r"(?:atlas )?(?:(?:dime|me dices|puedes decirme) que hora es|que hora(?: es)?|dime la hora|me dices la hora)", phrase
    ):
        return True
    return False


def local_utility_answer(text: str) -> str:
    """Resuelve utilidades instantáneas sin pagar un turno completo de OpenClaw."""
    now = datetime.now(ZoneInfo("Europe/Madrid"))
    if is_local_date_query(text):
        days = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
        months = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                  "septiembre", "octubre", "noviembre", "diciembre")
        return (f"Hoy es {days[now.weekday()]} {spanish_number(now.day)} de "
                f"{months[now.month - 1]} de {spanish_number(now.year)}.")
    if not is_local_time_query(text):
        return ""
    hour = now.hour % 12 or 12
    hour_word = "una" if hour == 1 else spanish_number(hour)
    if now.minute == 0:
        clock = f"{hour_word} en punto"
    else:
        clock = f"{hour_word} y {spanish_number(now.minute)}"
    if now.hour < 6:
        period = "de la madrugada"
    elif now.hour < 12:
        period = "de la mañana"
    elif now.hour < 20:
        period = "de la tarde"
    else:
        period = "de la noche"
    prefix = "Es la" if hour == 1 else "Son las"
    return f"{prefix} {clock} {period}."


def resident_can_answer_greeting_followup(text: str) -> bool:
    """Acepta reacciones cortas solo tras un saludo rápido conocido."""
    phrase = normalize_spoken_phrase(text)
    patterns = (
        r"^(?:bien|muy bien|todo bien|genial|fenomenal|perfecto|de lujo|tirando|regular|mal|muy mal)(?: gracias)?(?: y tu)?(?: atlas)?$",
        r"^(?:y tu|y tu que tal|y tu como estas)(?: atlas)?$",
    )
    return any(re.fullmatch(pattern, phrase) for pattern in patterns)


def remember_fast_direct_parent(interaction_id: str) -> None:
    cutoff = time.time() - FAST_DIRECT_PARENT_TTL_SECONDS
    with FAST_DIRECT_PARENTS_LOCK:
        expired = [key for key, created_at in FAST_DIRECT_PARENTS.items()
                   if created_at < cutoff]
        for key in expired:
            FAST_DIRECT_PARENTS.pop(key, None)
        FAST_DIRECT_PARENTS[interaction_id] = time.time()


def is_fast_direct_parent(interaction_id: str) -> bool:
    if not interaction_id:
        return False
    cutoff = time.time() - FAST_DIRECT_PARENT_TTL_SECONDS
    with FAST_DIRECT_PARENTS_LOCK:
        created_at = FAST_DIRECT_PARENTS.get(interaction_id, 0.0)
        if created_at < cutoff:
            FAST_DIRECT_PARENTS.pop(interaction_id, None)
            return False
        return True


def can_speculate_read_only(text: str) -> bool:
    """Autoriza anticipación solo cuando la frase parcial parece inequívocamente consultiva."""
    phrase = normalize_spoken_phrase(text)
    unsafe_patterns = (
        r"\b(borr\w*|elimin\w*|quit\w*)\b",
        r"\b(crea\w*|haz|hacer|genera\w*)\b",
        r"\b(instal\w*|desinstal\w*|actualiz\w*)\b",
        r"\b(cambi\w*|modific\w*|edit\w*|configur\w*)\b",
        r"\b(escrib\w*|guard\w*|muev\w*|mov\w*|copi\w*)\b",
        r"\b(reinici\w*|apag\w*|suspend\w*|enciend\w*)\b",
        r"\b(envi\w*|mand\w*|respond\w*|public\w*|sub\w*)\b",
        r"\b(descarg\w*|ejecut\w*|lanz\w*|compr\w*|"
        r"conect(?:ate|alo|ala|ame|anos|ar|emos|en|ad|a)|"
        r"emparej(?:ate|alo|ala|ame|anos|ar|emos|en|ad|a))\b",
    )
    if any(re.search(pattern, phrase) for pattern in unsafe_patterns):
        return False
    intent_patterns = (
        r"\b(cuanto|cuantos|cuanta|cuantas|cual|cuales|que|quien|cuando|donde|como)\b",
        r"\b(hay|existe|existen|esta conectado|estan conectados)\b",
        r"\b(mira|revisa|comprueba|consulta|busca|escanea|lee|lista|muestra|dime|cuentame|averigua|analiza|describe)\b",
    )
    subject_patterns = (
        r"\b(estado|almacenamiento|espacio|ram|memoria|puertos|procesos|temperatura|wifi|correo|correos|calendario|archivos|audio|sonido|bluetooth|dispositivos|auriculares|altavoces)\b",
    )
    has_intent = any(re.search(pattern, phrase) for pattern in intent_patterns)
    has_subject = any(re.search(pattern, phrase) for pattern in subject_patterns)
    return has_intent and (has_subject or len(phrase.split()) >= 3)


def speculative_main_matches(partial: str, final: str) -> bool:
    """Acepta el resultado anticipado solo si la frase final conserva la misma consulta."""
    if not can_speculate_read_only(final):
        return False
    partial_norm = normalize_spoken_phrase(partial)
    final_norm = normalize_spoken_phrase(final)
    if not partial_norm or not final_norm:
        return False
    if final_norm.startswith(partial_norm):
        extra = final_norm[len(partial_norm):].strip()
        if re.search(r"\b(y|ademas|tambien|pero|aunque|luego|despues|borra|cambia|crea)\b", extra):
            return False
        return len(partial_norm) / max(1, len(final_norm)) >= 0.42
    return difflib.SequenceMatcher(None, partial_norm, final_norm).ratio() >= 0.9


def is_dismissal_phrase(text: str) -> bool:
    """Solo acepta frases completas; nunca busca la palabra 'nada' dentro de otra petición."""
    return normalize_spoken_phrase(text) in DISMISSAL_PHRASES


def is_silent_stop_phrase(text: str) -> bool:
    """Acepta repeticiones completas de calla o nada, sin coincidir dentro de una petición."""
    words = normalize_spoken_phrase(text).split()
    return (
        1 <= len(words) <= 16
        and any(word in {"calla", "nada"} for word in words)
        and all(word in {"calla", "nada", "no", "ya"} for word in words)
    )


def is_follow_up_defer_phrase(text: str) -> bool:
    """Detecta aplazamientos completos de una continuación, sin búsquedas parciales."""
    return normalize_spoken_phrase(text) in FOLLOW_UP_DEFER_PHRASES


def extract_follow_up_intent(text: str) -> tuple[str, bool]:
    """Retira la señal no pronunciable y decide si la respuesta espera contestación."""
    expects_reply = FOLLOW_UP_MARKER in text
    cleaned = " ".join(text.replace(FOLLOW_UP_MARKER, " ").split()).strip()
    if not expects_reply:
        expects_reply = bool(re.search(r"[?¿]\s*$", cleaned))
    return cleaned, expects_reply


def wav_rms(wav_path: Path) -> float:
    try:
        with wave.open(str(wav_path), "rb") as wav_file:
            if wav_file.getsampwidth() != 2:
                return 0.0
            frames = wav_file.readframes(wav_file.getnframes())
    except (OSError, wave.Error):
        return 0.0
    samples = [int.from_bytes(frames[i:i + 2], "little", signed=True)
               for i in range(0, len(frames) - 1, 2)]
    return (sum(value * value for value in samples) / len(samples)) ** 0.5 if samples else 0.0


def transcribe_audio(audio_path: Path, wav_path: Path) -> str:
    if MODEL is None:
        raise RuntimeError("El modelo local de Whisper no está disponible")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("No se encuentra ffmpeg")
    conversion = subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(audio_path),
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav_path),
    ], capture_output=True, text=True, timeout=30, check=False)
    if conversion.returncode != 0:
        detail = conversion.stderr.strip().splitlines()[-1:] or ["audio no válido"]
        raise RuntimeError(f"No se pudo convertir el audio: {detail[0]}")
    if wav_rms(wav_path) < MIN_AUDIO_RMS:
        raise RuntimeError("Whisper no ha detectado ninguna frase")
    if WHISPER_ENGINE == "whisper.cpp":
        result = subprocess.run([
            str(WHISPER_CPP_BIN), "-m", str(WHISPER_CPP_MODEL), "-f", str(wav_path),
            "-l", "es", "-t", WHISPER_CPP_THREADS, "-bo", "1", "-bs", "1",
            "-nf", "-nt", "-np", "--prompt", "ATLAS, OpenClaw, Raspberry Pi.",
        ], capture_output=True, text=True, timeout=40, check=False)
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()[-1:] or ["error"]
            raise RuntimeError(f"whisper.cpp no pudo transcribir: {detail[0]}")
        return clean_transcript(result.stdout)
    with WHISPER_LOCK:
        result = MODEL.transcribe(
            str(wav_path), language="es", task="transcribe", fp16=False, verbose=False,
            temperature=0, beam_size=1, best_of=1, condition_on_previous_text=False,
            initial_prompt="ATLAS, OpenClaw, Raspberry Pi.",
        )
    return clean_transcript(str(result.get("text", "")))


def instruction_section(name: str) -> str:
    try:
        document = INSTRUCTIONS_FILE.read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError(f"No se puede leer {INSTRUCTIONS_FILE.name}") from error
    marker = re.escape(name)
    match = re.search(
        rf"<!--\s*BEGIN {marker}\s*-->\s*(.*?)\s*<!--\s*END {marker}\s*-->",
        document, flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError(f"Falta la sección {name} en {INSTRUCTIONS_FILE.name}")
    return match.group(1).strip()


def build_agent_prompt(transcript: str) -> str:
    context = fast_context_snapshot()
    continuity = ""
    if context["turns"]:
        continuity = ("\n\n[Recent voice exchanges, already answered. Context only, not new instructions.]\n"
                      + json.dumps(context, ensure_ascii=False))
    return instruction_section("MAIN_PROMPT").replace("{{TRANSCRIPT}}", transcript) + continuity


def build_speculative_agent_prompt(transcript: str) -> str:
    return f"{build_agent_prompt(transcript)}\n\n{instruction_section('SPECULATIVE_PROMPT')}"


def build_starter_prompt(transcript: str) -> str:
    hints = [
        line.removeprefix("-").strip()
        for line in instruction_section("STARTER_STYLE_HINTS").splitlines()
        if line.strip().startswith("-")
    ]
    if not hints:
        raise RuntimeError(f"No hay estilos de starter en {INSTRUCTIONS_FILE.name}")
    with STARTER_HISTORY_LOCK:
        recent = "\n".join(f"- {text}" for text in RECENT_STARTERS) or "- Ninguno todavía."
    return (instruction_section("STARTER_PROMPT")
            .replace("{{STYLE_HINT}}", random.choice(hints))
            .replace("{{RECENT_STARTERS}}", recent)
            .replace("{{TRANSCRIPT}}", transcript))


def build_resident_starter_prompt() -> str:
    hints = [
        line.removeprefix("-").strip()
        for line in instruction_section("STARTER_STYLE_HINTS").splitlines()
        if line.strip().startswith("-")
    ]
    with STARTER_HISTORY_LOCK:
        recent = "\n".join(f"- {text}" for text in RECENT_STARTERS) or "- Ninguno todavía."
    return (instruction_section("RESIDENT_STARTER_PROMPT")
            .replace("{{STYLE_HINT}}", random.choice(hints) if hints else "Habla con naturalidad.")
            .replace("{{RECENT_STARTERS}}", recent))


def strip_starter_name_vocative(text: str) -> str:
    return re.sub(r"^\s*sami\b\s*[,;:—–-]?\s*", "", text,
                  count=1, flags=re.IGNORECASE).strip()


def resident_starter_worker() -> None:
    """Precalienta un turno de Luna y lo deja bloqueado hasta la próxima frase."""
    while not RESIDENT_STARTERS.shutdown.is_set():
        cancel_event = threading.Event()
        RESIDENT_STARTERS.begin_run(cancel_event)
        request: dict[str, Any] = {
            "message": build_resident_starter_prompt(),
            "sessionKey": RESIDENT_STARTER_SESSION_KEY,
            "agentId": "main",
            "label": "ATLAS WebScreen oyente caliente",
            "resetBefore": True,
            "fastMode": AGENT_FAST_MODE,
            "thinking": "off",
            "timeoutMs": RESIDENT_STARTER_TIMEOUT_SECONDS * 1000,
        }
        if configured_model():
            request["model"] = configured_model()
        accepted = terminal = False
        final_text = bridge_error = ""
        try:
            for event in BRIDGE.run(request, cancel_event):
                kind = event.get("type")
                if kind == "accepted":
                    accepted = True
                elif kind == "delta":
                    text = str(event.get("text") or "")
                    final_text = text if event.get("replace") is True else final_text + text
                elif kind == "final":
                    terminal = True
                elif kind == "error":
                    bridge_error = str(event.get("message") or "El oyente caliente falló")
            if bridge_error or not accepted or not terminal:
                raise RuntimeError(
                    bridge_error or "El oyente caliente terminó de forma inesperada")
            route, starter, conversation_state = parse_resident_reply(final_text)
            if starter and route == "delegate":
                with STARTER_HISTORY_LOCK:
                    RECENT_STARTERS.append(starter[:300])
            RESIDENT_STARTERS.complete(starter, route=route, conversation_state=conversation_state)
            RESIDENT_STARTERS.end_run()
        except CancelledRun:
            RESIDENT_STARTERS.end_run("cancelled")
        except Exception as error:
            message = str(error).replace("\n", " ")[:300]
            RESIDENT_STARTERS.complete("", message)
            RESIDENT_STARTERS.end_run(message)
        if not RESIDENT_STARTERS.shutdown.wait(0.5):
            continue
        break


def inject_fast_exchange(session_key: str, transcript: str, answer: str,
                         log: "InteractionLog") -> None:
    """Conserva en la conversación principal lo resuelto por el oyente residente."""
    message = (
        "[ATLAS WebScreen / intercambio inmediato ya respondido]\n"
        f"El usuario dijo: {transcript}\n"
        f"ATLAS respondió: {answer}"
    )
    try:
        event = BRIDGE.inject({
            "sessionKey": session_key,
            "agentId": "main",
            "label": "ATLAS WebScreen respuesta inmediata",
            "message": message,
        })
        log.add(
            "openclaw.session.fast_context.injected",
            "El intercambio inmediato quedó registrado en la sesión principal",
            message_id=event.get("messageId"),
        )
    except Exception as error:
        log.add(
            "openclaw.session.fast_context.error",
            "No se pudo registrar el intercambio inmediato en la sesión principal",
            error=str(error).replace("\n", " ")[:300],
        )


def text_to_speech(text: str) -> bytes:
    api_key, voice_id = get_tts_settings()
    if not api_key or not voice_id:
        raise RuntimeError("ElevenLabs no está configurado en OpenClaw")
    endpoint = ("https://api.elevenlabs.io/v1/text-to-speech/"
                f"{urllib.parse.quote(voice_id, safe='')}/stream"
                "?output_format=mp3_44100_128&optimize_streaming_latency=4")
    payload = json.dumps({
        "text": text, "model_id": "eleven_flash_v2_5", "language_code": "es",
        "voice_settings": {"stability": 0.48, "similarity_boost": 0.78,
                           "style": 0.08, "use_speaker_boost": False, "speed": 1.04},
    }).encode()
    request = urllib.request.Request(endpoint, data=payload, method="POST", headers={
        "Accept": "audio/mpeg", "Content-Type": "application/json", "xi-api-key": api_key,
    })
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"ElevenLabs respondió con HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError("No se pudo conectar con ElevenLabs") from error


def stream_openclaw_agent(transcript: str, session_key: str, emit: Any,
                          cancel_event: threading.Event, request_id: str,
                          stream_voice: bool = False,
                          prompt_override: str | None = None,
                          ) -> tuple[str, list[dict[str, Any]], list[str], str]:
    raise_if_cancelled(cancel_event)
    run_started = time.perf_counter()
    request: dict[str, Any] = {
        "message": prompt_override or build_agent_prompt(transcript), "sessionKey": session_key,
        "agentId": "main", "label": "ATLAS WebScreen principal",
        "fastMode": AGENT_FAST_MODE, "thinking": "off",
        "timeoutMs": AGENT_TIMEOUT_SECONDS * 1000,
    }
    if configured_model():
        request["model"] = configured_model()
    accepted = terminal = False
    final_text = bridge_error = ""
    tool_events: list[dict[str, Any]] = []
    pending_preamble = ""
    last_progress = ""
    last_progress_at = 0.0
    progress_messages = 0
    tool_started_once = False
    first_delta_seen = False
    first_preamble_seen = False
    first_preamble_emitted = False
    streamed_voice_chunks: list[str] = []
    streamed_voice_cursor = 0
    stream_voice_safe = stream_voice
    for event in BRIDGE.run(request, cancel_event):
        kind = event.get("type")
        if kind == "accepted":
            accepted = True
            emit("metric", name="gatewayAccepted",
                 durationMs=round((time.perf_counter() - run_started) * 1000, 1))
        elif kind == "delta":
            text = str(event.get("text") or "")
            replacing = event.get("replace") is True
            if replacing:
                if streamed_voice_chunks:
                    emit("speech_stream_abort", reason="openclaw_replace")
                    streamed_voice_chunks.clear()
                    streamed_voice_cursor = 0
                final_text = text
                stream_voice_safe = False
            else:
                final_text += text
            if not first_delta_seen and final_text:
                first_delta_seen = True
                emit("metric", name="firstOpenClawDelta",
                     durationMs=round((time.perf_counter() - run_started) * 1000, 1))
            emit("response_delta", text=final_text, replace=replacing)
            if stream_voice_safe:
                remainder = final_text[streamed_voice_cursor:]
                last_end = 0
                for match in re.finditer(r".+?[.!?](?=\s|$)", remainder, flags=re.DOTALL):
                    raw_chunk = match.group(0).strip()
                    last_end = match.end()
                    if not raw_chunk or FOLLOW_UP_MARKER in raw_chunk:
                        continue
                    voice_chunk = prepare_voice_text(raw_chunk)
                    if voice_chunk:
                        streamed_voice_chunks.append(voice_chunk)
                        emit("speech_chunk", text=voice_chunk,
                             index=len(streamed_voice_chunks))
                if last_end:
                    streamed_voice_cursor += last_end
        elif kind == "preamble":
            text = " ".join(str(event.get("text") or "").split()).strip()
            if text:
                if not first_preamble_seen:
                    first_preamble_seen = True
                    emit("metric", name="firstOpenClawPreamble",
                         durationMs=round((time.perf_counter() - run_started) * 1000, 1))
                pending_preamble = text
                if not first_preamble_emitted and re.search(r"[.!?]\s*$", text):
                    emit("agent_preamble", text=text)
                    first_preamble_emitted = True
        elif kind in {"tool", "tool_output"}:
            tool_events.append(event)
            if kind == "tool":
                phase = event.get("phase")
                if phase == "start":
                    now = time.monotonic()
                    if not tool_started_once:
                        if pending_preamble and not first_preamble_emitted:
                            emit("agent_preamble", text=pending_preamble)
                            first_preamble_emitted = True
                        pending_preamble = ""
                    else:
                        can_emit = (
                            pending_preamble and pending_preamble != last_progress
                            and progress_messages < PROGRESS_MAX_MESSAGES
                            and now - last_progress_at >= PROGRESS_MIN_INTERVAL_SECONDS
                        )
                        if can_emit:
                            emit("progress", text=pending_preamble)
                            last_progress = pending_preamble
                            last_progress_at = now
                            progress_messages += 1
                            pending_preamble = ""
                    tool_started_once = True
                emit("tool", phase=event.get("phase"),
                     title=event.get("title") or event.get("name") or "herramienta")
        elif kind == "final":
            terminal = True
        elif kind == "error":
            bridge_error = str(event.get("message") or "OpenClaw no pudo responder")
    raise_if_cancelled(cancel_event)
    if bridge_error:
        raise RuntimeError(bridge_error)
    if not accepted or not terminal:
        raise RuntimeError("El turno de OpenClaw terminó de forma inesperada")
    answer = " ".join(final_text.split()).strip()
    if not answer:
        raise RuntimeError("OpenClaw no devolvió texto")
    remaining_voice = ""
    if streamed_voice_chunks:
        remaining_voice = prepare_voice_text(
            final_text[streamed_voice_cursor:].replace(FOLLOW_UP_MARKER, " ").strip()
        )
    return answer, tool_events, streamed_voice_chunks, remaining_voice


def generate_parallel_starter(transcript: str, cancel_event: threading.Event,
                              request_id: str) -> str:
    """Genera un acuse con una sesión sin tools del mismo agente principal."""
    raise_if_cancelled(cancel_event)
    if starter_requires_private_context(transcript):
        return ""
    request: dict[str, Any] = {
        "message": build_starter_prompt(transcript),
        "sessionKey": STARTER_SESSION_KEY,
        "agentId": STARTER_AGENT_ID,
        "label": "ATLAS WebScreen preámbulos del agente principal",
        "resetBefore": True,
        "denyAllTools": True,
        "fastMode": AGENT_FAST_MODE, "thinking": "off",
        "timeoutMs": STARTER_TIMEOUT_SECONDS * 1000,
    }
    if configured_model():
        request["model"] = configured_model()
    accepted = terminal = False
    final_text = bridge_error = ""
    with STARTER_RUN_LOCK:
        for event in BRIDGE.run(request, cancel_event):
            kind = event.get("type")
            if kind == "accepted":
                accepted = True
            elif kind == "delta":
                text = str(event.get("text") or "")
                final_text = text if event.get("replace") is True else final_text + text
            elif kind == "final":
                terminal = True
            elif kind == "error":
                bridge_error = str(event.get("message") or "OpenClaw no pudo generar el starter")
    raise_if_cancelled(cancel_event)
    if bridge_error or not accepted or not terminal:
        raise RuntimeError(bridge_error or "El starter de OpenClaw terminó de forma inesperada")
    starter = strip_starter_name_vocative(" ".join(final_text.split()).strip())
    if normalize_spoken_phrase(starter) in {"omitir", "omit", "skip"}:
        return ""
    with STARTER_HISTORY_LOCK:
        RECENT_STARTERS.append(starter[:300])
    return starter[:300]


def starter_transcript_matches(partial: str, final: str) -> bool:
    partial_norm = normalize_spoken_phrase(partial)
    final_norm = normalize_spoken_phrase(final)
    if not partial_norm or not final_norm:
        return False
    if final_norm.startswith(partial_norm):
        return True
    prefix = final_norm[:max(len(partial_norm), min(len(final_norm), len(partial_norm) + 12))]
    return difflib.SequenceMatcher(None, partial_norm, prefix).ratio() >= 0.82


def cleanup_speculative_starters() -> None:
    cutoff = time.time() - SPECULATIVE_STARTER_TTL_SECONDS
    with SPECULATIVE_STARTERS_LOCK:
        expired = [key for key, state in SPECULATIVE_STARTERS.items()
                   if state.created_at < cutoff]
        for key in expired:
            SPECULATIVE_STARTERS.pop(key).cancel.set()


def prime_speculative_starter(interaction_id: str, transcript: str,
                              tts_provider: str) -> tuple[bool, str]:
    cleanup_speculative_starters()
    if starter_requires_private_context(transcript):
        return False, "context-dependent"
    with SPECULATIVE_STARTERS_LOCK:
        if interaction_id in SPECULATIVE_STARTERS:
            return False, "already-primed"
        state = SpeculativeStarter(interaction_id, transcript, tts_provider)
        SPECULATIVE_STARTERS[interaction_id] = state

    def worker() -> None:
        try:
            model_started = time.perf_counter()
            raw_text = generate_parallel_starter(transcript, state.cancel, interaction_id)
            state.model_ms = (time.perf_counter() - model_started) * 1000
            if not raw_text or state.cancel.is_set():
                return
            state.text = prepare_voice_text(raw_text)
            if tts_provider == "elevenlabs":
                tts_started = time.perf_counter()
                state.audio = text_to_speech(state.text)
                state.tts_ms = (time.perf_counter() - tts_started) * 1000
        except CancelledRun:
            pass
        except Exception as error:
            state.error = str(error).replace("\n", " ")[:300]
        finally:
            state.done.set()

    threading.Thread(
        target=worker, name=f"starter-prime-{interaction_id}", daemon=True,
    ).start()
    return True, "started"


def cancel_speculative_starter(interaction_id: str) -> None:
    with SPECULATIVE_STARTERS_LOCK:
        state = SPECULATIVE_STARTERS.pop(interaction_id, None)
    if state is not None:
        state.cancel.set()


def take_speculative_starter(interaction_id: str, final_transcript: str,
                             tts_provider: str, cancel_event: threading.Event
                             ) -> SpeculativeStarter | None:
    with SPECULATIVE_STARTERS_LOCK:
        state = SPECULATIVE_STARTERS.pop(interaction_id, None)
    if state is None:
        return None
    if starter_requires_private_context(final_transcript):
        state.cancel.set()
        return None
    if not starter_transcript_matches(state.transcript, final_transcript):
        state.cancel.set()
        return None
    while not state.done.wait(0.1):
        if cancel_event.is_set():
            state.cancel.set()
            raise CancelledRun("Interacción cancelada")
    if state.error:
        return None
    if state.text and tts_provider == "elevenlabs" and not state.audio:
        tts_started = time.perf_counter()
        state.audio = text_to_speech(state.text)
        state.tts_ms = (time.perf_counter() - tts_started) * 1000
    return state


def cleanup_speculative_main_runs() -> None:
    cutoff = time.time() - SPECULATIVE_STARTER_TTL_SECONDS
    with SPECULATIVE_MAIN_RUNS_LOCK:
        expired = [key for key, state in SPECULATIVE_MAIN_RUNS.items()
                   if state.created_at < cutoff]
        for key in expired:
            SPECULATIVE_MAIN_RUNS.pop(key).cancel.set()


def prime_speculative_main(interaction_id: str, transcript: str, session_key: str,
                           tts_provider: str) -> tuple[bool, str]:
    cleanup_speculative_main_runs()
    if not can_speculate_read_only(transcript):
        return False, "not-read-only"
    with SPECULATIVE_MAIN_RUNS_LOCK:
        if interaction_id in SPECULATIVE_MAIN_RUNS:
            return False, "already-primed"
        state = SpeculativeMainRun(interaction_id, transcript, session_key, tts_provider)
        SPECULATIVE_MAIN_RUNS[interaction_id] = state

    def worker() -> None:
        try:
            def capture(event_type: str, **data: Any) -> None:
                state.events.put((event_type, data))

            with SPECULATIVE_MAIN_RUN_LOCK:
                state.result = stream_openclaw_agent(
                    transcript, session_key, capture, state.cancel, interaction_id,
                    stream_voice=tts_provider == "browser",
                    prompt_override=build_speculative_agent_prompt(transcript),
                )
            state.model_ms = (time.perf_counter() - state.started_at) * 1000
        except CancelledRun:
            pass
        except Exception as error:
            state.error = str(error).replace("\n", " ")[:300]
        finally:
            state.done.set()

    threading.Thread(
        target=worker, name=f"main-prime-{interaction_id}", daemon=True,
    ).start()
    return True, "read-only-main-started"


def take_speculative_main(interaction_id: str, final_transcript: str,
                          session_key: str) -> SpeculativeMainRun | None:
    with SPECULATIVE_MAIN_RUNS_LOCK:
        state = SPECULATIVE_MAIN_RUNS.pop(interaction_id, None)
    if state is None:
        return None
    if state.session_key != session_key or not speculative_main_matches(
            state.transcript, final_transcript):
        state.cancel.set()
        state.done.wait(3)
        return None
    return state


def cancel_speculative_main(interaction_id: str) -> None:
    with SPECULATIVE_MAIN_RUNS_LOCK:
        state = SPECULATIVE_MAIN_RUNS.pop(interaction_id, None)
    if state is not None:
        state.cancel.set()


def local_network_addresses() -> list[str]:
    addresses: set[str] = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = info[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    return sorted(addresses)


def access_backend_busy() -> bool:
    with ACTIVE_RUNS_LOCK:
        if ACTIVE_RUNS:
            return True
    # Speculative work can outlive the HTTP request which started it.
    with SPECULATIVE_MAIN_RUNS_LOCK:
        if any(not state.done.is_set() for state in SPECULATIVE_MAIN_RUNS.values()):
            return True
    with SPECULATIVE_STARTERS_LOCK:
        if any(not state.done.is_set() for state in SPECULATIVE_STARTERS.values()):
            return True
    with RESIDENT_STARTER_CONDITION:
        if RESIDENT_STARTERS.active is not None and not RESIDENT_STARTERS.active.done.is_set():
            return True
    return False


ACCESS = AccessControl(busy=access_backend_busy)


class AtlasScreenHandler(SimpleHTTPRequestHandler):
    server_version = "AtlasWebScreen/3.2"
    protocol_version = "HTTP/1.1"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "microphone=(self)")
        self.send_header("Content-Security-Policy",
            "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; "
            "media-src 'self' blob:; connect-src 'self' https://api.openai.com wss://api.openai.com; "
            "object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        super().end_headers()

    def log_message(self, message_format: str, *args: object) -> None:
        if self.path == "/api/access/heartbeat" and len(args) > 1 and str(args[1]) == "200":
            return
        print(f"[atlas-webscreen] {self.address_string()} - {message_format % args}")

    def send_json(self, status: int, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def write_event(self, event_type: str, **data: Any) -> None:
        line = json.dumps({"type": event_type, **data}, ensure_ascii=False, separators=(",", ":"))
        self.wfile.write((line + "\n").encode())
        self.wfile.flush()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in {"/api/settings", "/api/codex-usage"}:
            try:
                ACCESS.authorize(self.headers.get("X-Atlas-Client", ""))
            except AccessError as error:
                self.send_json(error.status, {"error": str(error)})
                return
        if parsed.path == "/api/codex-usage":
            self.send_json(200, CODEX_USAGE.snapshot())
            return
        if parsed.path == "/api/resident/wait":
            if self.headers.get("Sec-Fetch-Site") is not None or self.headers.get("Origin"):
                self.send_json(403, {"error": "Ruta interna del oyente"})
                return
            if self.client_address[0] not in {"127.0.0.1", "::1"}:
                self.send_json(403, {"error": "El oyente solo acepta conexiones locales"})
                return
            phase = urllib.parse.parse_qs(parsed.query).get("phase", [""])[0]
            if phase != "next":
                self.send_json(400, {"error": "Fase de oyente inválida"})
                return
            try:
                payload = RESIDENT_STARTERS.wait_for_input()
            except CancelledRun as error:
                self.send_json(503, {"error": str(error)})
                return
            self.send_json(200, payload)
            return
        if parsed.path == "/api/health":
            api_key, voice_id = get_tts_settings()
            bridge_health = BRIDGE.health()
            self.send_json(200, {
                "ready": bool(bridge_health.get("ready")),
                "transcription": {"ready": True, "provider": "chrome-native",
                                  "language": "es-ES"},
                "realtime": {"ready": bool(bridge_health.get("ready")),
                             "provider": "openai", "model": REALTIME_MODEL,
                             "voice": REALTIME_VOICE, "transport": "webrtc",
                             "brain": "agent-consult", "legacyFallback": True},
                "whisper": {"ready": MODEL is not None, "model": WHISPER_MODEL_NAME,
                            "engine": WHISPER_ENGINE, "error": MODEL_ERROR},
                "openclaw": {"ready": bool(bridge_health.get("ready")),
                             "transport": "persistent-gateway-stream",
                             "model": configured_model() or "OpenClaw default", "thinking": "off",
                             "fastMode": AGENT_FAST_MODE,
                             "starterAgent": STARTER_AGENT_ID,
                             "hotListener": RESIDENT_STARTERS.health(),
                             "bridge": bridge_health},
                "session": session_health(),
                "tts": {"ready": True, "default": "browser", "browser": True,
                        "elevenlabs": bool(api_key and voice_id)},
            })
            return
        if parsed.path == "/api/settings":
            api_key, voice_id = get_tts_settings()
            self.send_json(200, {
                **get_webscreen_settings(),
                "elevenlabsReady": bool(api_key and voice_id),
            })
            return
        super().do_GET()

    def do_POST(self) -> None:
        # No CORS; a custom header also prevents cross-origin form submissions.
        origin = self.headers.get("Origin")
        if origin and origin not in {f"http://{self.headers.get('Host')}", f"https://{self.headers.get('Host')}"}:
            self.close_connection = True
            self.send_json(403, {"error": "Origen no permitido"})
            return
        if self.path.startswith("/api/access/"):
            self.handle_access()
            return
        try:
            ACCESS.authorize(self.headers.get("X-Atlas-Client", ""), begin=True)
        except AccessError as error:
            self.close_connection = True
            self.send_json(error.status, {"error": str(error)})
            return
        try:
            self.connection.settimeout(15)
            self.handle_controlled_post()
        finally:
            ACCESS.finish()

    def handle_access(self) -> None:
        try:
            if self.headers.get("X-Atlas-Access") != "1":
                raise AccessError(403, "Solicitud de acceso inválida")
            self.connection.settimeout(10)
            payload = self.read_json_payload(2048)
            token = self.headers.get("X-Atlas-Client", "")
            action = self.path.removeprefix("/api/access/")
            if action == "connect":
                result = ACCESS.connect()
            elif action == "heartbeat":
                result = ACCESS.heartbeat(token, payload.get("idle"))
            elif action == "takeover":
                result = ACCESS.takeover(token)
                if result.get("replacedOwner"):
                    cancel_run(None)
            elif action == "release":
                ACCESS.release(token)
                result = {"released": True}
            else:
                raise AccessError(404, "Ruta de acceso desconocida")
            self.send_json(200, result)
        except AccessError as error:
            self.close_connection = True
            self.send_json(error.status, {"error": str(error)})
        except (ValueError, TimeoutError) as error:
            self.close_connection = True
            self.send_json(400, {"error": "Solicitud de acceso inválida"})

    def handle_controlled_post(self) -> None:
        if self.path == "/api/cancel":
            self.handle_cancel()
        elif self.path == "/api/client-event":
            self.handle_client_event()
        elif self.path == "/api/starter":
            self.handle_starter()
        elif self.path == "/api/tts":
            self.handle_tts_preview()
        elif self.path == "/api/settings":
            self.handle_settings()
        elif self.path == "/api/realtime/session":
            self.handle_realtime_session()
        elif self.path == "/api/realtime/consult":
            self.handle_realtime_consult()
        elif self.path == "/api/realtime/event":
            self.handle_realtime_event()
        elif self.path == "/api/text":
            self.handle_text()
        elif self.path == "/api/voice":
            self.handle_voice()
        else:
            self.send_error(404)

    def read_json_payload(self, maximum: int = 32 * 1024) -> dict[str, Any]:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Longitud inválida") from error
        if content_length <= 0 or content_length > maximum:
            raise ValueError("Solicitud vacía o demasiado grande")
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("JSON inválido") from error
        if not isinstance(payload, dict):
            raise ValueError("Formato inválido")
        return payload

    def handle_tts_preview(self) -> None:
        try:
            payload = self.read_json_payload()
            text = str(payload.get("text") or "").strip()
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        if not text:
            self.send_json(400, {"error": "Escribe un texto para reproducir"})
            return
        if len(text) > 4000:
            self.send_json(413, {"error": "El texto supera los cuatro mil caracteres"})
            return
        started = time.perf_counter()
        try:
            audio = text_to_speech(text)
        except RuntimeError as error:
            self.send_json(502, {"error": str(error)})
            return
        elapsed = (time.perf_counter() - started) * 1000
        self.send_json(200, {
            "audio": base64.b64encode(audio).decode("ascii"),
            "provider": "elevenlabs",
            "generationMs": round(elapsed, 1),
            "bytes": len(audio),
        })

    def handle_settings(self) -> None:
        try:
            payload = self.read_json_payload(maximum=4096)
            voice_id = str(payload.get("elevenlabsVoiceId") or "").strip()
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        if voice_id and not re.fullmatch(r"[A-Za-z0-9_-]{8,128}", voice_id):
            self.send_json(400, {"error": "El Voice ID no tiene un formato válido"})
            return
        save_webscreen_voice_id(voice_id)
        api_key, effective_voice_id = get_tts_settings()
        self.send_json(200, {
            **get_webscreen_settings(),
            "elevenlabsReady": bool(api_key and effective_voice_id),
            "saved": True,
        })

    def handle_realtime_session(self) -> None:
        try:
            payload = self.read_json_payload(maximum=4096)
        except ValueError:
            payload = {}
        session_key, _, _ = current_session()
        voice = str(payload.get("voice") or REALTIME_VOICE).strip().lower()
        if voice not in {"alloy", "ash", "ballad", "coral", "echo", "marin", "sage", "shimmer", "verse"}:
            voice = REALTIME_VOICE
        params = {
            "mode": "realtime", "sessionKey": session_key,
            "provider": "openai", "model": REALTIME_MODEL,
            "transport": "webrtc", "brain": "agent-consult", "voice": voice,
            "vadThreshold": REALTIME_VAD_THRESHOLD,
            "silenceDurationMs": REALTIME_SILENCE_MS,
            "prefixPaddingMs": REALTIME_PREFIX_PADDING_MS,
        }
        try:
            session = BRIDGE.create_talk_session(params)
        except RuntimeError as error:
            self.send_json(503, {"error": str(error)[:500], "legacyFallback": True})
            return
        if session.get("transport") != "webrtc" or not session.get("clientSecret"):
            self.send_json(502, {"error": "OpenClaw no devolvió una sesión WebRTC utilizable",
                                 "legacyFallback": True})
            return
        self.send_json(200, {"session": session, "sessionKey": session_key,
                             "legacyFallback": True})

    def handle_realtime_consult(self) -> None:
        try:
            payload = self.read_json_payload(maximum=64 * 1024)
            args = payload.get("args")
            if isinstance(args, str):
                args = json.loads(args or "{}")
            if not isinstance(args, dict):
                raise ValueError("Argumentos de consulta inválidos")
            question = str(args.get("question") or args.get("prompt") or
                           args.get("query") or args.get("task") or "").strip()
            if not question:
                raise ValueError("La consulta no contiene una pregunta")
            context = str(args.get("context") or "").strip()
            response_style = str(args.get("responseStyle") or "").strip()
            request_id = safe_identifier(str(payload.get("requestId") or ""))
            interaction_id = safe_identifier(str(payload.get("interactionId") or ""), request_id)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)[:300]})
            return
        session_key, _, _ = current_session()
        cancel_event = register_run(request_id)
        log = InteractionLog(interaction_id)
        message = question
        if context:
            message += f"\n\nContexto de la conversación en directo:\n{context}"
        if response_style:
            message += f"\n\nEstilo hablado solicitado:\n{response_style}"
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        started = time.perf_counter()

        def emit(event_type: str, **data: Any) -> None:
            self.write_event(event_type, **data)

        try:
            log.add("realtime.consult.started", "OpenAI Realtime delegó trabajo al agente principal",
                    question=question, model=configured_model() or "OpenClaw default")
            emit("state", state="consulting", model=configured_model() or "OpenClaw default")
            answer, tools, _, _ = stream_openclaw_agent(
                question, session_key, emit, cancel_event, request_id,
                prompt_override=build_agent_prompt(message),
            )
            elapsed = (time.perf_counter() - started) * 1000
            log.add("realtime.consult.completed", "El agente principal respondió a OpenAI Realtime",
                    elapsed, text=answer, tools=len(tools))
            emit("result", text=answer, durationMs=round(elapsed, 1), tools=len(tools))
        except CancelledRun:
            try:
                emit("cancelled", message="Consulta cancelada")
            except (BrokenPipeError, ConnectionResetError):
                pass
        except (BrokenPipeError, ConnectionResetError):
            cancel_event.set()
        except Exception as error:
            safe_message = str(error).replace("\n", " ")[:500]
            log.add("realtime.consult.error", "Falló la consulta delegada", error=safe_message)
            try:
                emit("error", message=safe_message)
            except (BrokenPipeError, ConnectionResetError):
                pass
        finally:
            with ACTIVE_RUNS_LOCK:
                ACTIVE_RUNS.pop(request_id, None)

    def handle_realtime_event(self) -> None:
        try:
            payload = self.read_json_payload(maximum=16 * 1024)
            path = append_realtime_event(payload)
        except (ValueError, OSError) as error:
            self.send_json(400, {"error": str(error)[:300]})
            return
        self.send_json(200, {"saved": True, "log": str(path.relative_to(ROOT_DIR))})

    def handle_starter(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > 32 * 1024:
            self.send_json(413, {"error": "Transcripción provisional vacía o demasiado grande"})
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            transcript = clean_transcript(str(payload.get("transcript") or ""))
            interaction_id = safe_identifier(str(payload.get("interactionId") or ""), "")
            tts_provider = str(payload.get("ttsProvider") or "browser").strip().lower()
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            self.send_json(400, {"error": "Solicitud provisional inválida"})
            return
        transcript_is_immediate = resident_can_answer_directly(transcript)
        if (not interaction_id
                or ((len(transcript) < 8 or len(transcript.split()) < 2)
                    and not transcript_is_immediate)):
            self.send_json(400, {"error": "La transcripción provisional todavía es insuficiente"})
            return
        if tts_provider not in {"browser", "elevenlabs"}:
            tts_provider = "browser"
        if starter_should_be_omitted(transcript):
            self.send_json(202, {
                "accepted": False,
                "reason": "immediate-answer",
                "mode": "omitted",
                "hotListener": False,
                "interactionId": interaction_id,
                "characters": len(transcript),
            })
            return
        resident_accepted, resident_reason = RESIDENT_STARTERS.claim(
            interaction_id, transcript, tts_provider)
        accepted = resident_accepted
        reason = resident_reason
        mode = "resident-preamble" if resident_accepted else "preamble"
        if can_speculate_read_only(transcript) and requires_main_agent(transcript):
            session_key, _, _ = current_session()
            main_accepted, main_reason = prime_speculative_main(
                interaction_id, transcript, session_key, tts_provider)
            accepted = accepted or main_accepted
            reason = main_reason if main_accepted else resident_reason
            if main_accepted:
                mode = "read-only-main"
        elif not resident_accepted:
            accepted, reason = prime_speculative_starter(
                interaction_id, transcript, tts_provider)
        self.send_json(202, {
            "accepted": accepted,
            "reason": reason,
            "mode": mode,
            "hotListener": resident_accepted,
            "interactionId": interaction_id,
            "characters": len(transcript),
        })

    def handle_text(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > 128 * 1024:
            self.send_json(413, {"error": "Transcripción vacía o demasiado grande"})
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            transcript = clean_transcript(str(payload.get("transcript") or ""))
            transcription_ms = max(0.0, float(payload.get("transcriptionDurationMs") or 0))
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError, TypeError, ValueError):
            self.send_json(400, {"error": "Transcripción inválida"})
            return
        if not transcript:
            self.send_json(400, {"error": "Chrome no ha detectado ninguna frase"})
            return
        self.handle_voice(provided_transcript=transcript,
                          native_transcription_ms=transcription_ms)

    def handle_voice(self, provided_transcript: str | None = None,
                     native_transcription_ms: float = 0.0) -> None:
        if provided_transcript is None:
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                content_length = 0
            if content_length <= 0 or content_length > MAX_AUDIO_BYTES:
                self.send_json(413, {"error": "Audio vacío o demasiado grande"})
                return
            content_type = self.headers.get("Content-Type", "audio/webm").split(";", 1)[0]
            audio_bytes = self.rfile.read(content_length)
        else:
            content_type = "text/plain"
            audio_bytes = b""
        tts_provider = self.headers.get("X-Atlas-TTS-Provider", "browser").strip().lower()
        if tts_provider not in {"browser", "elevenlabs"}:
            tts_provider = "browser"
        input_mode = self.headers.get("X-Atlas-Input-Mode", "wake").strip().lower()
        if input_mode not in {"wake", "manual", "followup", "interrupt"}:
            input_mode = "wake"
        raw_parent_id = self.headers.get("X-Atlas-Parent-Interaction-Id", "").strip()
        parent_interaction_id = safe_identifier(raw_parent_id, "") if raw_parent_id else ""
        suffix = {"audio/webm": ".webm", "audio/ogg": ".ogg",
                  "audio/mp4": ".m4a", "audio/wav": ".wav"}.get(content_type, ".audio")
        request_id = safe_identifier(self.headers.get("X-Atlas-Request-Id"))
        interaction_id = safe_identifier(self.headers.get("X-Atlas-Interaction-Id"), request_id)
        cancel_event = register_run(request_id)
        session_key, session_renewed, session_idle = current_session()
        log = InteractionLog(interaction_id)
        total_started = time.perf_counter()
        if input_mode == "wake":
            log.add("wake.detected", "Wake word ATLAS detectada",
                    client_timestamp=self.headers.get("X-Atlas-Wake-At"),
                    acknowledgement=self.headers.get("X-Atlas-Wake-Reply") or None)
        else:
            log.add("conversation.input", "Entrada conversacional sin wake word",
                    mode=input_mode, parent_interaction=parent_interaction_id or None)
        try:
            recording_ms = float(self.headers.get("X-Atlas-Recording-Duration-Ms", "0"))
        except ValueError:
            recording_ms = 0
        try:
            silence_threshold_ms = max(
                0.0, float(self.headers.get("X-Atlas-Silence-Threshold-Ms", "0")))
        except ValueError:
            silence_threshold_ms = 0
        stop_reason = self.headers.get("X-Atlas-Stop-Reason", "").strip()[:160]
        if provided_transcript is None:
            log.add("recording.started", "Grabación iniciada",
                    client_timestamp=self.headers.get("X-Atlas-Recording-Started-At"))
            log.add("recording.stopped", "Grabación detenida tras silencio", recording_ms,
                    client_timestamp=self.headers.get("X-Atlas-Recording-Stopped-At"),
                    bytes=len(audio_bytes))
        else:
            log.add("browser.transcription.started",
                    "Transcripción nativa de Chrome iniciada",
                    client_timestamp=self.headers.get("X-Atlas-Recording-Started-At"))
            log.add("browser.transcription.stopped",
                    "Transcripción nativa detenida tras silencio", recording_ms,
                    client_timestamp=self.headers.get("X-Atlas-Recording-Stopped-At"),
                    characters=len(provided_transcript),
                    stop_reason=stop_reason or None,
                    silence_threshold_ms=round(silence_threshold_ms, 1))
        log.add("session.selected", "Sesión WebScreen seleccionada",
                session=session_fingerprint(session_key), renewed=session_renewed,
                previous_idle_seconds=round(session_idle, 1))
        log.add("tts.selected", "Motor de voz seleccionado", provider=tts_provider)
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        event_write_lock = threading.Lock()

        def emit_stream(event_type: str, **data: Any) -> None:
            with event_write_lock:
                self.write_event(event_type, **data)

        transcript = answer = ""
        starter_obsolete = threading.Event()
        starter_delivered = threading.Event()
        starter_thread: threading.Thread | None = None
        speculative_main: SpeculativeMainRun | None = None
        resident_starter_claimed = RESIDENT_STARTERS.has(request_id)
        try:
            emit_stream("request", id=request_id, interactionId=interaction_id,
                        session=session_fingerprint(session_key), sessionRenewed=session_renewed)
            with tempfile.TemporaryDirectory(prefix="voice-", dir=RUNTIME_DIR) as temp_dir:
                input_path, wav_path = Path(temp_dir) / f"input{suffix}", Path(temp_dir) / "speech.wav"
                transcription_provider = "whisper" if provided_transcript is None else "chrome-native"
                emit_stream("state", state="transcribing", startedAt=now_iso(),
                            provider=transcription_provider)
                if provided_transcript is None:
                    input_path.write_bytes(audio_bytes)
                    started = time.perf_counter()
                    transcript = transcribe_audio(input_path, wav_path)
                    elapsed = (time.perf_counter() - started) * 1000
                    transcription_message = "Transcripción local completada"
                else:
                    transcript = provided_transcript
                    elapsed = native_transcription_ms
                    transcription_message = "Transcripción nativa de Chrome completada"
                raise_if_cancelled(cancel_event)
                if not transcript:
                    raise RuntimeError("No se ha detectado ninguna frase")
                log.add("transcription.completed", transcription_message, elapsed,
                        transcript=transcript, provider=transcription_provider)
                emit_stream("stage", name="transcription", durationMs=round(elapsed, 1),
                            provider=transcription_provider)
                emit_stream("transcript", text=transcript)
                # El usuario puede decir "ATLAS, calla" en un único resultado
                # de Chrome o activar primero la wake word y decir "calla" en
                # la escucha inmediatamente posterior. Ambos recorridos deben
                # terminar aquí, antes de iniciar el agente principal.
                if input_mode in {"wake", "interrupt"} and is_silent_stop_phrase(transcript):
                    RESIDENT_STARTERS.cancel(request_id)
                    cancel_speculative_starter(request_id)
                    cancel_speculative_main(request_id)
                    log.add(
                        "interaction.silenced",
                        "Interrupción silenciosa resuelta sin llamar a OpenClaw",
                        transcript=transcript,
                    )
                    emit_stream("dismissed", text=transcript, reason="silent")
                    total_ms = (time.perf_counter() - total_started) * 1000
                    log.add(
                        "interaction.completed",
                        "Interrupción silenciosa completada",
                        total_ms,
                        openclaw_called=False,
                    )
                    emit_stream(
                        "done",
                        durationMs=round(total_ms, 1),
                        log=str(log.path.relative_to(ROOT_DIR)),
                        expectsReply=False,
                    )
                    return
                instant_answer = local_utility_answer(transcript)
                if instant_answer:
                    RESIDENT_STARTERS.cancel(request_id)
                    cancel_speculative_starter(request_id)
                    cancel_speculative_main(request_id)
                    answer = prepare_voice_text(instant_answer)
                    log.add(
                        "interaction.local_utility",
                        "WebScreen resolvió una utilidad inmediata sin esperar a OpenClaw",
                        transcript=transcript,
                        answer=answer,
                        utility="date" if is_local_date_query(transcript) else "time",
                    )
                    emit_stream("response", text=answer, expectsReply=False)
                    emit_stream("state", state="synthesizing", startedAt=now_iso(),
                                provider=tts_provider)
                    started = time.perf_counter()
                    audio = text_to_speech(answer) if tts_provider == "elevenlabs" else b""
                    elapsed = (time.perf_counter() - started) * 1000
                    log.add(
                        "tts.completed",
                        "ElevenLabs generó la utilidad inmediata"
                        if tts_provider == "elevenlabs"
                        else "La utilidad inmediata se delegó al navegador",
                        elapsed,
                        provider=tts_provider,
                        bytes=len(audio),
                    )
                    emit_stream("stage", name="tts", durationMs=round(elapsed, 1),
                                provider=tts_provider)
                    emit_stream(
                        "speech",
                        text=answer,
                        provider=tts_provider,
                        audio=base64.b64encode(audio).decode("ascii") if audio else None,
                        expectsReply=False,
                    )
                    remember_voice_exchange(session_key, transcript, answer)
                    threading.Thread(
                        target=inject_fast_exchange,
                        args=(session_key, transcript, answer, log),
                        name=f"local-context-{interaction_id}",
                        daemon=True,
                    ).start()
                    total_ms = (time.perf_counter() - total_started) * 1000
                    log.add(
                        "interaction.completed",
                        "Utilidad inmediata completada",
                        total_ms,
                        openclaw_called=False,
                    )
                    emit_stream(
                        "done",
                        durationMs=round(total_ms, 1),
                        log=str(log.path.relative_to(ROOT_DIR)),
                        expectsReply=False,
                    )
                    return
                dismissal_kind = "accidental" if is_dismissal_phrase(transcript) else None
                if input_mode == "followup" and is_follow_up_defer_phrase(transcript):
                    dismissal_kind = "deferred"
                if dismissal_kind:
                    cancel_speculative_starter(request_id)
                    cancel_speculative_main(request_id)
                    answer = random.choice(
                        FOLLOW_UP_DEFER_REPLIES if dismissal_kind == "deferred"
                        else DISMISSAL_REPLIES
                    )
                    recognised_variants = (
                        len(FOLLOW_UP_DEFER_PHRASES) if dismissal_kind == "deferred"
                        else len(DISMISSAL_PHRASES)
                    )
                    log.add("interaction.dismissed", "Petición descartada sin llamar a OpenClaw",
                            transcript=transcript, answer=answer, reason=dismissal_kind,
                            recognised_variants=recognised_variants)
                    emit_stream("dismissed", text=transcript, reason=dismissal_kind)
                    emit_stream("response", text=answer, expectsReply=False)
                    emit_stream("state", state="synthesizing", startedAt=now_iso(),
                                provider=tts_provider)
                    started = time.perf_counter()
                    audio = text_to_speech(answer) if tts_provider == "elevenlabs" else b""
                    elapsed = (time.perf_counter() - started) * 1000
                    log.add("tts.completed",
                            "ElevenLabs generó la respuesta de descarte"
                            if tts_provider == "elevenlabs"
                            else "La respuesta de descarte se delegó al navegador",
                            elapsed, provider=tts_provider, bytes=len(audio))
                    emit_stream("stage", name="tts", durationMs=round(elapsed, 1),
                                provider=tts_provider)
                    emit_stream("speech", text=answer, provider=tts_provider,
                                audio=base64.b64encode(audio).decode("ascii") if audio else None,
                                expectsReply=False)
                    total_ms = (time.perf_counter() - total_started) * 1000
                    log.add("interaction.completed", "Interacción descartada completada", total_ms,
                            openclaw_called=False)
                    emit_stream("done", durationMs=round(total_ms, 1),
                                log=str(log.path.relative_to(ROOT_DIR)), expectsReply=False)
                    return
                emit_stream("state", state="processing", startedAt=now_iso())
                processing_started = time.perf_counter()
                cached_resident: SpeculativeStarter | None = None
                resident_consumed = False
                if not resident_starter_claimed and not requires_main_agent(transcript):
                    resident_starter_claimed, _ = RESIDENT_STARTERS.claim(
                        request_id, transcript, tts_provider)
                if resident_starter_claimed and not requires_main_agent(transcript):
                    resident_claimed, direct_reply = RESIDENT_STARTERS.take(
                        request_id, transcript, tts_provider, cancel_event)
                    resident_consumed = resident_claimed
                    if direct_reply is not None and direct_reply.route == "delegate":
                        cached_resident = direct_reply
                    if (resident_claimed and direct_reply is not None
                            and direct_reply.route == "direct" and direct_reply.text):
                        raw_answer = direct_reply.text
                        answer, expects_reply = extract_follow_up_intent(raw_answer)
                        answer = prepare_voice_text(answer)
                        elapsed = (time.perf_counter() - processing_started) * 1000
                        log.add(
                            "openclaw.resident.direct",
                            "El oyente caliente resolvió una conversación inmediata",
                            elapsed,
                            transcript=transcript,
                            answer=answer,
                            raw_answer=raw_answer if raw_answer != answer else None,
                            expects_reply=expects_reply,
                            source="hot-listener",
                        )
                        emit_stream("stage", name="processing", durationMs=round(elapsed, 1))
                        emit_stream("response", text=answer, expectsReply=expects_reply)
                        emit_stream("state", state="synthesizing", startedAt=now_iso(),
                                    provider=tts_provider)
                        audio = direct_reply.audio if tts_provider == "elevenlabs" else b""
                        log.add(
                            "tts.completed",
                            "ElevenLabs generó la voz durante el turno residente"
                            if tts_provider == "elevenlabs"
                            else "La voz inmediata se delegó al navegador",
                            direct_reply.tts_ms,
                            provider=tts_provider,
                            bytes=len(audio),
                        )
                        emit_stream("stage", name="tts",
                                    durationMs=round(direct_reply.tts_ms, 1),
                                    provider=tts_provider)
                        emit_stream(
                            "speech", text=answer, provider=tts_provider,
                            audio=base64.b64encode(audio).decode("ascii") if audio else None,
                            expectsReply=expects_reply,
                        )
                        remember_voice_exchange(session_key, transcript, answer,
                                                direct_reply.conversation_state)
                        threading.Thread(
                            target=inject_fast_exchange,
                            args=(session_key, transcript, answer, log),
                            name=f"fast-context-{interaction_id}",
                            daemon=True,
                        ).start()
                        remember_fast_direct_parent(interaction_id)
                        total_ms = (time.perf_counter() - total_started) * 1000
                        log.add("interaction.completed",
                                "Interacción inmediata completada", total_ms,
                                openclaw_called=True, resident=True, main_agent_called=False)
                        emit_stream(
                            "done", durationMs=round(total_ms, 1),
                            log=str(log.path.relative_to(ROOT_DIR)),
                            expectsReply=expects_reply,
                        )
                        return
                speculative_main = take_speculative_main(
                    request_id, transcript, session_key)
                if speculative_main is not None:
                    log.add(
                        "openclaw.main.speculative.reused",
                        "Se reutilizó el turno principal iniciado durante la transcripción",
                        partial_transcript=speculative_main.transcript,
                        lead_ms=round(max(
                            0.0, (processing_started - speculative_main.started_at) * 1000
                        ), 1),
                        read_only=True,
                    )

                def starter_worker() -> None:
                    try:
                        starter_started = time.perf_counter()
                        if resident_consumed:
                            resident_claimed, primed = True, cached_resident
                        else:
                            resident_claimed, primed = RESIDENT_STARTERS.take(
                                request_id, transcript, tts_provider, cancel_event)
                        if primed is not None and primed.route == "direct":
                            primed = None
                        starter_source = "hot-listener" if resident_claimed else "per-request"
                        if resident_claimed and primed is None:
                            log.add(
                                "openclaw.starter.resident.fallback",
                                "El oyente caliente no llegó a tiempo; activo el preámbulo de respaldo",
                                (time.perf_counter() - starter_started) * 1000,
                            )
                            resident_claimed = False
                            starter_source = "resident-fallback"
                        if not resident_claimed:
                            primed = take_speculative_starter(
                                request_id, transcript, tts_provider, cancel_event)
                        if primed is not None:
                            raw_starter_text = primed.text
                            starter_audio_bytes = primed.audio
                            log.add(
                                "openclaw.starter.resident.reused"
                                if resident_claimed else "openclaw.starter.speculative.reused",
                                "Se reutilizó el oyente caliente preparado antes de la petición"
                                if resident_claimed
                                else "Se reutilizó el preámbulo iniciado durante la transcripción",
                                primed.model_ms,
                                partial_transcript=primed.transcript,
                                lead_ms=round(max(0.0, (processing_started - primed.started_at) * 1000), 1),
                                tts_duration_ms=round(primed.tts_ms, 1),
                                agent=STARTER_AGENT_ID,
                                source=starter_source,
                            )
                        else:
                            if speculative_main is not None:
                                return
                            raw_starter_text = generate_parallel_starter(
                                transcript, cancel_event, request_id)
                            starter_audio_bytes = b""
                        starter_elapsed = (time.perf_counter() - starter_started) * 1000
                        if not raw_starter_text:
                            log.add("openclaw.starter.omitted",
                                    "ATLAS determinó que no hacía falta respuesta inicial",
                                    starter_elapsed, model=configured_model() or "OpenClaw default",
                                    agent=STARTER_AGENT_ID, speculative=primed is not None)
                            return
                        starter_text = prepare_voice_text(raw_starter_text)
                        if (starter_obsolete.is_set() or starter_delivered.is_set()
                                or cancel_event.is_set()):
                            log.add("openclaw.starter.obsolete",
                                    "La respuesta final llegó antes que el starter",
                                    starter_elapsed, text=starter_text)
                            return
                        if tts_provider == "elevenlabs" and not starter_audio_bytes:
                            tts_started = time.perf_counter()
                            starter_audio_bytes = text_to_speech(starter_text)
                            tts_elapsed = (time.perf_counter() - tts_started) * 1000
                            log.add("starter.tts.completed",
                                    "ElevenLabs generó la respuesta inicial",
                                    tts_elapsed, bytes=len(starter_audio_bytes))
                        starter_audio = (base64.b64encode(starter_audio_bytes).decode("ascii")
                                         if starter_audio_bytes else None)
                        log.add("openclaw.starter", "ATLAS emitió una respuesta inicial",
                                (time.perf_counter() - processing_started) * 1000,
                                text=starter_text, provider=tts_provider,
                                model=configured_model() or "OpenClaw default",
                                agent=STARTER_AGENT_ID, speculative=primed is not None,
                                source=starter_source,
                                raw_text=raw_starter_text if raw_starter_text != starter_text else None)
                        starter_delivered.set()
                        emit_stream("starter", text=starter_text, provider=tts_provider,
                                    audio=starter_audio)
                    except CancelledRun:
                        return
                    except Exception as error:
                        log.add("openclaw.starter.error", "Falló el starter paralelo",
                                error=str(error).replace("\n", " ")[:300])

                if speculative_main is None or resident_starter_claimed:
                    starter_thread = threading.Thread(
                        target=starter_worker, name=f"starter-{interaction_id}", daemon=True)
                    starter_thread.start()

                def emit_main_event(event_type: str, **data: Any) -> None:
                    if event_type == "agent_preamble":
                        if (speculative_main is None or starter_obsolete.is_set()
                                or starter_delivered.is_set()):
                            return
                        raw_starter_text = str(data.get("text") or "").strip()
                        starter_text = prepare_voice_text(raw_starter_text)
                        if not starter_text:
                            return
                        starter_audio = None
                        if tts_provider == "elevenlabs":
                            tts_started = time.perf_counter()
                            rendered = text_to_speech(starter_text)
                            log.add(
                                "starter.tts.completed",
                                "ElevenLabs generó el preámbulo del turno anticipado",
                                (time.perf_counter() - tts_started) * 1000,
                                bytes=len(rendered),
                            )
                            starter_audio = base64.b64encode(rendered).decode("ascii")
                        log.add(
                            "openclaw.main.speculative.preamble",
                            "El agente principal narró el trabajo anticipado",
                            (time.perf_counter() - processing_started) * 1000,
                            text=starter_text,
                            raw_text=(raw_starter_text
                                      if raw_starter_text != starter_text else None),
                        )
                        starter_delivered.set()
                        emit_stream("starter", text=starter_text, provider=tts_provider,
                                    audio=starter_audio)
                        return
                    if event_type == "tool":
                        log.add("openclaw.tool", "OpenClaw actualizó una herramienta",
                                phase=data.get("phase"), title=data.get("title"))
                        emit_stream(event_type, **data)
                        return
                    if event_type == "metric":
                        log.add("openclaw.metric", "OpenClaw alcanzó un hito del turno",
                                data.get("durationMs"), name=data.get("name"))
                        emit_stream(event_type, **data)
                        return
                    if event_type == "speech_chunk":
                        starter_obsolete.set()
                        log.add("openclaw.speech.chunk", "La voz final empezó por streaming",
                                (time.perf_counter() - processing_started) * 1000,
                                index=data.get("index"), text=data.get("text"))
                        emit_stream(event_type, **data)
                        return
                    if event_type != "progress":
                        emit_stream(event_type, **data)
                        return
                    raw_progress = str(data.get("text") or "").strip()
                    progress_text = prepare_voice_text(raw_progress)
                    progress_audio = None
                    if tts_provider == "elevenlabs":
                        tts_started = time.perf_counter()
                        rendered = text_to_speech(progress_text)
                        tts_elapsed = (time.perf_counter() - tts_started) * 1000
                        log.add("progress.tts.completed",
                                "ElevenLabs generó una actualización de progreso",
                                tts_elapsed, bytes=len(rendered))
                        progress_audio = base64.b64encode(rendered).decode("ascii")
                    log.add("openclaw.progress", "ATLAS narró un cambio de fase",
                            (time.perf_counter() - processing_started) * 1000,
                            text=progress_text, provider=tts_provider,
                            raw_text=raw_progress if raw_progress != progress_text else None)
                    emit_stream("progress", text=progress_text, provider=tts_provider,
                                audio=progress_audio)

                started = processing_started
                if speculative_main is not None:
                    while True:
                        raise_if_cancelled(cancel_event)
                        try:
                            event_type, event_data = speculative_main.events.get(timeout=0.1)
                        except queue.Empty:
                            if speculative_main.done.is_set():
                                break
                            continue
                        emit_main_event(event_type, **event_data)
                    while not speculative_main.events.empty():
                        event_type, event_data = speculative_main.events.get_nowait()
                        emit_main_event(event_type, **event_data)
                    if speculative_main.error or speculative_main.result is None:
                        log.add(
                            "openclaw.main.speculative.error",
                            "El turno anticipado falló; se repitió la petición confirmada",
                            error=speculative_main.error or "resultado vacío",
                        )
                        answer, tools, streamed_voice_chunks, remaining_voice = stream_openclaw_agent(
                            transcript, session_key, emit_main_event, cancel_event, request_id,
                            stream_voice=tts_provider == "browser")
                    else:
                        answer, tools, streamed_voice_chunks, remaining_voice = speculative_main.result
                        log.add(
                            "openclaw.main.speculative.completed",
                            "El turno anticipado resolvió la petición confirmada",
                            speculative_main.model_ms,
                            partial_transcript=speculative_main.transcript,
                        )
                else:
                    answer, tools, streamed_voice_chunks, remaining_voice = stream_openclaw_agent(
                        transcript, session_key, emit_main_event, cancel_event, request_id,
                        stream_voice=tts_provider == "browser")
                elapsed = (time.perf_counter() - started) * 1000
                starter_obsolete.set()
                raw_answer = answer
                answer, expects_reply = extract_follow_up_intent(answer)
                answer = prepare_voice_text(answer)
                remember_voice_exchange(session_key, transcript, answer)
                log.add("openclaw.completed", "OpenClaw completó la respuesta", elapsed,
                        model=configured_model() or "OpenClaw default", answer=answer,
                        raw_answer=raw_answer if raw_answer != answer else None,
                        tool_events=len(tools), expects_reply=expects_reply,
                        streamed_voice_chunks=len(streamed_voice_chunks),
                        remaining_voice=remaining_voice or None)
                if expects_reply:
                    log.add("conversation.followup.requested",
                            "ATLAS indicó que espera una respuesta del usuario")
                emit_stream("stage", name="processing", durationMs=round(elapsed, 1))
                emit_stream("response", text=answer, expectsReply=expects_reply)
                emit_stream("state", state="synthesizing", startedAt=now_iso(),
                            provider=tts_provider)
                started = time.perf_counter()
                audio = text_to_speech(answer) if tts_provider == "elevenlabs" else b""
                elapsed = (time.perf_counter() - started) * 1000
                log.add("tts.completed",
                        "ElevenLabs generó la voz" if tts_provider == "elevenlabs"
                        else "La voz se delegó al navegador",
                        elapsed, provider=tts_provider, bytes=len(audio))
                emit_stream("stage", name="tts", durationMs=round(elapsed, 1),
                            provider=tts_provider)
                emit_stream("speech", text=answer, provider=tts_provider,
                            audio=base64.b64encode(audio).decode("ascii") if audio else None,
                            expectsReply=expects_reply,
                            streamedChunks=len(streamed_voice_chunks),
                            remainingText=remaining_voice)
            total_ms = (time.perf_counter() - total_started) * 1000
            log.add("interaction.completed", "Interacción completada", total_ms)
            emit_stream("done", durationMs=round(total_ms, 1),
                        log=str(log.path.relative_to(ROOT_DIR)), expectsReply=expects_reply)
        except CancelledRun:
            log.add("interaction.cancelled", "Interacción cancelada")
            try:
                emit_stream("cancelled")
            except (BrokenPipeError, ConnectionResetError):
                pass
        except (BrokenPipeError, ConnectionResetError):
            log.add("client.disconnected", "El navegador cerró la conexión")
        except Exception as error:
            safe_message = str(error).replace("\n", " ")[:300]
            log.add("interaction.error", "La interacción terminó con error",
                    (time.perf_counter() - total_started) * 1000, error=safe_message,
                    transcript=transcript or None, answer=answer or None)
            try:
                emit_stream("error", message=safe_message)
            except (BrokenPipeError, ConnectionResetError):
                pass
        finally:
            starter_obsolete.set()
            RESIDENT_STARTERS.cancel(request_id)
            cancel_speculative_starter(request_id)
            cancel_speculative_main(request_id)
            if starter_thread is not None:
                starter_thread.join(timeout=0.2)
            with ACTIVE_RUNS_LOCK:
                ACTIVE_RUNS.pop(request_id, None)

    def handle_cancel(self) -> None:
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 2048)
        except ValueError:
            length = 0
        request_id = None
        if length:
            try:
                payload = json.loads(self.rfile.read(length).decode())
                raw_id = str(payload.get("requestId") or "")
                request_id = safe_identifier(raw_id, "") if raw_id else None
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                pass
        if request_id:
            RESIDENT_STARTERS.cancel(request_id)
            cancel_speculative_starter(request_id)
            cancel_speculative_main(request_id)
        self.send_json(200, {"cancelled": cancel_run(request_id), "requestId": request_id})

    def handle_client_event(self) -> None:
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 8192)
        except ValueError:
            length = 0
        if length <= 0:
            self.send_json(400, {"error": "Evento vacío"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Formato inválido")
            path = append_client_event(payload)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, FileNotFoundError) as error:
            self.send_json(400, {"error": str(error)[:200]})
            return
        self.send_json(200, {"saved": True, "log": str(path.relative_to(ROOT_DIR))})


def main() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    load_whisper_model()
    try:
        BRIDGE.start()
    except RuntimeError as error:
        raise SystemExit(f"No se pudo preparar OpenClaw: {error}") from error
    handler = partial(AtlasScreenHandler, directory=str(STATIC_DIR))
    try:
        server = ThreadingHTTPServer((HOST, PORT), handler)
    except OSError as error:
        raise SystemExit(f"No se pudo iniciar ATLAS WebScreen en {HOST}:{PORT}: {error}") from error
    threading.Thread(
        target=resident_starter_worker,
        name="atlas-webscreen-hot-listener",
        daemon=True,
    ).start()
    print(f"ATLAS WebScreen disponible en http://localhost:{PORT}", flush=True)
    for address in local_network_addresses():
        print(f"ATLAS WebScreen en red local: http://{address}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("ATLAS WebScreen detenido.", flush=True)
    finally:
        RESIDENT_STARTERS.stop()
        BRIDGE.stop()
        server.server_close()


if __name__ == "__main__":
    main()
