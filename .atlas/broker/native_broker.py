"""Native ATLAS authentication, quota and Realtime-session broker.

The long-lived Codex app-server owns OAuth refresh.  Persistent credentials are
read only when a short-lived Realtime client secret must be minted, and neither
tokens nor account identifiers are ever included in logs or public diagnostics.
"""

from __future__ import annotations

import base64
import contextlib
import json
import math
import os
import queue
import re
import shutil
import stat
import subprocess
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence


CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls"
DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1"
DEFAULT_REALTIME_VOICE = "marin"
MAX_AUTH_BYTES = 1024 * 1024


class BrokerError(RuntimeError):
    """Base class for safe, user-presentable broker errors."""


class AuthStoreError(BrokerError):
    """The Codex credential store is missing, unsafe or malformed."""


class CodexProtocolError(BrokerError):
    """The Codex app-server exited or returned an invalid response."""


class RealtimeBrokerError(BrokerError):
    """A short-lived OpenAI Realtime reservation could not be created."""


_SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*:\s*bearer\s+)[^\s,;]+"),
    re.compile(r"(?i)\b(?:sk|ek)[-_][A-Za-z0-9._-]{8,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    # Defensive fallback for opaque credentials that are neither JWTs nor use
    # the documented sk_/ek_ prefixes.  Human-readable diagnostics rarely
    # contain an uninterrupted 40-character identifier.
    re.compile(r"(?<![A-Za-z0-9._-])[A-Za-z0-9._-]{40,}(?![A-Za-z0-9._-])"),
)


def redact_sensitive(value: object, limit: int = 500) -> str:
    """Return bounded diagnostic text with common credential forms removed."""

    text = str(value or "").replace("\r", " ").replace("\n", " ")
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(
            (lambda match: f"{match.group(1)}[redacted]")
            if pattern is _SECRET_PATTERNS[0]
            else "[redacted]",
            text,
        )
    return text[: max(0, int(limit))]


def _jwt_claims(token: str) -> dict[str, Any]:
    """Decode non-authoritative JWT metadata without validating the token."""

    try:
        encoded = token.split(".")[1]
        encoded += "=" * (-len(encoded) % 4)
        value = json.loads(base64.urlsafe_b64decode(encoded))
    except (IndexError, ValueError, TypeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


@dataclass(frozen=True, repr=False)
class Credential:
    access_token: str
    account_id: str
    expires_at: int | None = None

    def __repr__(self) -> str:
        return (
            "Credential(access_token=<redacted>, account_id=<redacted>, "
            f"expires_at={self.expires_at!r})"
        )


def default_auth_path() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))).expanduser()
    return codex_home / "auth.json"


def _read_private_file(path: Path) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except FileNotFoundError as error:
        raise AuthStoreError(f"No existe el login OAuth de Codex en {path}") from error
    except OSError as error:
        raise AuthStoreError(f"No se puede abrir de forma segura el login OAuth de Codex en {path}") from error
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise AuthStoreError("El almacén OAuth de Codex no es un archivo regular")
        if stat.S_IMODE(metadata.st_mode) & 0o077:
            raise AuthStoreError("El almacén OAuth de Codex debe tener permisos 0600")
        effective_uid = os.geteuid()
        if effective_uid != 0 and metadata.st_uid != effective_uid:
            raise AuthStoreError("El almacén OAuth de Codex pertenece a otro usuario")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptor, min(65536, MAX_AUTH_BYTES + 1 - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > MAX_AUTH_BYTES:
                raise AuthStoreError("El almacén OAuth de Codex es demasiado grande")
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def read_codex_auth(path: Path | str | None = None) -> Credential:
    """Read Codex OAuth with strict ownership and mode checks.

    The returned object's repr is redacted.  Callers must also avoid serialising
    its fields or attaching them to exceptions.
    """

    auth_path = Path(path).expanduser() if path is not None else default_auth_path()
    try:
        data = json.loads(_read_private_file(auth_path))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise AuthStoreError("El almacén OAuth de Codex contiene JSON inválido") from error
    if not isinstance(data, dict):
        raise AuthStoreError("El almacén OAuth de Codex tiene un formato inválido")
    tokens = data.get("tokens")
    if not isinstance(tokens, dict):
        raise AuthStoreError("El almacén OAuth de Codex no contiene tokens")
    access_token = tokens.get("access_token")
    if not isinstance(access_token, str) or len(access_token) < 16:
        raise AuthStoreError("El almacén OAuth de Codex no contiene un access token válido")
    claims = _jwt_claims(access_token)
    auth_claims = claims.get("https://api.openai.com/auth")
    if not isinstance(auth_claims, dict):
        auth_claims = {}
    account_id = tokens.get("account_id") or auth_claims.get("chatgpt_account_id")
    if not isinstance(account_id, str) or not account_id.strip():
        raise AuthStoreError("El almacén OAuth de Codex no contiene el identificador de cuenta")
    expires_at = claims.get("exp")
    if not isinstance(expires_at, int):
        expires_at = None
    return Credential(access_token=access_token, account_id=account_id, expires_at=expires_at)


def _codex_command() -> list[str]:
    candidates = (
        shutil.which("codex"),
        str(Path.home() / ".local" / "bin" / "codex"),
        "/usr/local/bin/codex",
        "/usr/bin/codex",
    )
    binary = next((candidate for candidate in candidates if candidate and Path(candidate).is_file()), None)
    if not binary:
        raise CodexProtocolError("No se encontró Codex CLI")
    return [binary, "app-server", "--stdio", "-c", "mcp_servers={}"]


class CodexAppServer:
    """Thread-safe JSON-RPC client around one persistent Codex app-server."""

    def __init__(
        self,
        command: Sequence[str] | None = None,
        *,
        timeout: float = 30.0,
        cwd: Path | str | None = None,
        env: Mapping[str, str] | None = None,
        popen_factory: Callable[..., Any] = subprocess.Popen,
    ) -> None:
        self.command = list(command) if command is not None else None
        self.timeout = max(0.1, float(timeout))
        self.cwd = str(cwd) if cwd is not None else None
        self.env = dict(env) if env is not None else None
        self.popen_factory = popen_factory
        self.process: Any | None = None
        self._initialized = False
        self._closing = False
        self._next_id = 1
        self._pending: dict[int, queue.Queue[dict[str, Any]]] = {}
        self._notifications: queue.Queue[dict[str, Any]] = queue.Queue()
        self._state_lock = threading.RLock()
        self._start_lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._stderr_tail: deque[str] = deque(maxlen=8)

    def start(self) -> None:
        with self._start_lock:
            with self._state_lock:
                if self._initialized and self.process is not None and self.process.poll() is None:
                    return
                command = self.command or _codex_command()
                self._closing = False
                try:
                    process = self.popen_factory(
                        command,
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        bufsize=1,
                        cwd=self.cwd,
                        env=self.env,
                    )
                except OSError as error:
                    raise CodexProtocolError("No se pudo iniciar Codex app-server") from error
                if process.stdin is None or process.stdout is None or process.stderr is None:
                    with contextlib.suppress(Exception):
                        process.terminate()
                    raise CodexProtocolError("Codex app-server no abrió sus canales estándar")
                self.process = process
                self._initialized = False
                self._stderr_tail.clear()
                threading.Thread(target=self._read_stdout, args=(process,), daemon=True).start()
                threading.Thread(target=self._read_stderr, args=(process,), daemon=True).start()
            try:
                self._rpc(
                    "initialize",
                    {
                        "clientInfo": {
                            "name": "atlas-native-broker",
                            "title": "ATLAS Native Broker",
                            "version": "0.1.0",
                        },
                        "capabilities": {"experimentalApi": True},
                    },
                )
                self._send({"method": "initialized", "params": {}})
            except Exception:
                self.close()
                raise
            with self._state_lock:
                if self.process is process and process.poll() is None:
                    self._initialized = True

    def _read_stdout(self, process: Any) -> None:
        try:
            for raw_line in process.stdout:
                try:
                    message = json.loads(raw_line)
                except (json.JSONDecodeError, TypeError):
                    continue
                if not isinstance(message, dict):
                    continue
                response_id = message.get("id")
                if isinstance(response_id, int):
                    with self._state_lock:
                        target = self._pending.get(response_id)
                    if target is not None:
                        target.put(message)
                elif isinstance(message.get("method"), str):
                    self._notifications.put(message)
        finally:
            self._process_ended(process)

    def _read_stderr(self, process: Any) -> None:
        for raw_line in process.stderr:
            line = redact_sensitive(raw_line, 300)
            if line:
                self._stderr_tail.append(line)

    def _process_ended(self, process: Any) -> None:
        failure = {"_transport_error": True}
        with self._state_lock:
            if self.process is not process:
                return
            targets = list(self._pending.values())
            self._pending.clear()
            self._initialized = False
        for target in targets:
            target.put(failure)

    def _send(self, message: dict[str, Any]) -> None:
        with self._write_lock:
            process = self.process
            if process is None or process.poll() is not None or process.stdin is None:
                raise CodexProtocolError("Codex app-server no está disponible")
            try:
                process.stdin.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
                process.stdin.flush()
            except (BrokenPipeError, OSError) as error:
                raise CodexProtocolError("Se perdió la conexión con Codex app-server") from error

    def _rpc(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        with self._state_lock:
            request_id = self._next_id
            self._next_id += 1
            response_queue: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
            self._pending[request_id] = response_queue
        try:
            self._send({"id": request_id, "method": method, "params": params or {}})
            try:
                response = response_queue.get(timeout=self.timeout)
            except queue.Empty as error:
                raise CodexProtocolError(f"Codex no respondió a {method} a tiempo") from error
            if response.get("_transport_error"):
                detail = self._stderr_tail[-1] if self._stderr_tail else "proceso finalizado"
                raise CodexProtocolError(f"Codex app-server se cerró: {detail}")
            if "error" in response:
                error = response.get("error")
                if isinstance(error, dict):
                    message = redact_sensitive(error.get("message") or "Error JSON-RPC")
                else:
                    message = "Error JSON-RPC"
                raise CodexProtocolError(f"Codex rechazó {method}: {message}")
            result = response.get("result")
            if result is None:
                return {}
            if not isinstance(result, dict):
                raise CodexProtocolError(f"Codex devolvió una respuesta inválida para {method}")
            return result
        finally:
            with self._state_lock:
                self._pending.pop(request_id, None)

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.start()
        return self._rpc(method, params)

    def account(self, refresh: bool = False) -> dict[str, Any]:
        return self.request("account/read", {"refreshToken": bool(refresh)})

    def rate_limits(self) -> dict[str, Any]:
        return self.request("account/rateLimits/read", {})

    def next_notification(self, timeout: float | None = None) -> dict[str, Any] | None:
        try:
            return self._notifications.get(timeout=timeout)
        except queue.Empty:
            return None

    def health(self) -> dict[str, Any]:
        with self._state_lock:
            alive = self.process is not None and self.process.poll() is None
            return {
                "running": bool(alive),
                "initialized": bool(alive and self._initialized),
                "pid": self.process.pid if alive else None,
                "pendingRequests": len(self._pending),
                "lastError": self._stderr_tail[-1] if self._stderr_tail else None,
            }

    def close(self) -> None:
        with self._state_lock:
            process = self.process
            self.process = None
            self._initialized = False
            self._closing = True
            targets = list(self._pending.values())
            self._pending.clear()
        for target in targets:
            target.put({"_transport_error": True})
        if process is None or process.poll() is not None:
            return
        with contextlib.suppress(Exception):
            process.terminate()
        try:
            process.wait(timeout=3)
        except Exception:
            with contextlib.suppress(Exception):
                process.kill()
            with contextlib.suppress(Exception):
                process.wait(timeout=3)

    def __enter__(self) -> "CodexAppServer":
        self.start()
        return self

    def __exit__(self, _type: object, _value: object, _traceback: object) -> None:
        self.close()


@dataclass(frozen=True)
class HTTPResult:
    status: int
    payload: dict[str, Any]


def _default_http_post(
    url: str,
    payload: dict[str, Any],
    headers: Mapping[str, str],
    timeout: float,
) -> HTTPResult:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=dict(headers), method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status_code = int(getattr(response, "status", response.getcode()))
            raw = response.read(512 * 1024)
    except urllib.error.HTTPError as error:
        status_code = int(error.code)
        raw = error.read(64 * 1024)
    except urllib.error.URLError as error:
        raise RealtimeBrokerError("No se pudo conectar con OpenAI Realtime") from error
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        value = {}
    return HTTPResult(status=status_code, payload=value if isinstance(value, dict) else {})


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _reset_milliseconds(value: Any) -> int | None:
    if not _finite_number(value) or value <= 0:
        return None
    numeric = int(value)
    return numeric if numeric >= 10_000_000_000 else numeric * 1000


def _normalise_window(window: dict[str, Any]) -> dict[str, Any] | None:
    used = window.get("usedPercent")
    if not _finite_number(used):
        return None
    bounded = round(max(0.0, min(100.0, float(used))), 1)
    return {
        "usedPercent": bounded,
        "remainingPercent": round(100.0 - bounded, 1),
        "resetAt": _reset_milliseconds(window.get("resetsAt", window.get("resetAt"))),
    }


def normalize_codex_usage(summary: dict[str, Any], *, now_ms: int | None = None) -> dict[str, Any]:
    """Convert the authoritative ``codex`` bucket to ATLAS' stable quota DTO."""

    result: dict[str, Any] = {
        "fiveHour": None,
        "weekly": None,
        "updatedAt": int(time.time() * 1000) if now_ms is None else int(now_ms),
        "planProfile": "auto",
        "available": False,
    }
    if not isinstance(summary, dict):
        return result
    buckets = summary.get("rateLimitsByLimitId")
    bucket = buckets.get("codex") if isinstance(buckets, dict) else None
    if not isinstance(bucket, dict):
        candidate = summary.get("rateLimits")
        if isinstance(candidate, dict) and candidate.get("limitId", "codex") == "codex":
            bucket = candidate
    if not isinstance(bucket, dict):
        return result
    for window in (bucket.get("primary"), bucket.get("secondary")):
        if not isinstance(window, dict):
            continue
        duration = window.get("windowDurationMins")
        if not _finite_number(duration):
            continue
        normalised = _normalise_window(window)
        if normalised is None:
            continue
        minutes = int(duration)
        if minutes == 300:
            result["fiveHour"] = normalised
        elif minutes == 10080:
            result["weekly"] = normalised
    plan_type = str(bucket.get("planType") or "").strip().lower()
    if plan_type.startswith("pro"):
        result["planProfile"] = "pro"
    elif result["fiveHour"] is not None:
        result["planProfile"] = "plus"
    elif plan_type:
        result["planProfile"] = plan_type
    result["available"] = bool(result["fiveHour"] or result["weekly"])
    return result


def _clamped_number(value: Any, default: float, minimum: float, maximum: float) -> float:
    if not _finite_number(value):
        return default
    return max(minimum, min(maximum, float(value)))


def _clamped_integer(value: Any, default: int, minimum: int, maximum: int) -> int:
    if not _finite_number(value):
        return default
    return max(minimum, min(maximum, int(value)))


def _session_request(params: Mapping[str, Any]) -> dict[str, Any]:
    model = str(params.get("model") or DEFAULT_REALTIME_MODEL).strip()
    if not model or len(model) > 128:
        raise RealtimeBrokerError("El modelo Realtime no es válido")
    voice = str(params.get("voice") or DEFAULT_REALTIME_VOICE).strip()
    if not voice or len(voice) > 128:
        raise RealtimeBrokerError("La voz Realtime no es válida")
    turn_detection = {
        "type": "server_vad",
        "threshold": _clamped_number(params.get("vadThreshold"), 0.5, 0.0, 1.0),
        "silence_duration_ms": _clamped_integer(params.get("silenceDurationMs"), 500, 100, 5000),
        "prefix_padding_ms": _clamped_integer(params.get("prefixPaddingMs"), 300, 0, 5000),
        "create_response": True,
        "interrupt_response": True,
    }
    session: dict[str, Any] = {
        "type": "realtime",
        "model": model,
        "output_modalities": ["audio"],
        "audio": {
            "input": {"turn_detection": turn_detection},
            "output": {"voice": voice},
        },
    }
    effort = str(params.get("reasoningEffort") or "").strip().lower()
    if effort and effort != "default":
        if effort not in {"minimal", "low", "medium", "high", "xhigh"}:
            raise RealtimeBrokerError("El nivel de razonamiento Realtime no es válido")
        session["reasoning"] = {"effort": effort}
    return session


def public_session_summary(session: Mapping[str, Any]) -> dict[str, Any]:
    """Return CLI-safe reservation metadata without the ephemeral secret."""

    return {
        "ok": bool(session.get("clientSecret")),
        "provider": session.get("provider"),
        "transport": session.get("transport"),
        "model": session.get("model"),
        "voice": session.get("voice"),
        "expiresAt": session.get("expiresAt"),
        "offerUrl": session.get("offerUrl"),
        "clientSecretIssued": bool(session.get("clientSecret")),
    }


class NativeBroker:
    """High-level API consumed by WebScreen, atlas-chat and Companion."""

    def __init__(
        self,
        app_server: CodexAppServer | None = None,
        *,
        auth_path: Path | str | None = None,
        credential_reader: Callable[[], Credential] | None = None,
        http_post: Callable[[str, dict[str, Any], Mapping[str, str], float], HTTPResult] = _default_http_post,
        request_timeout: float = 30.0,
    ) -> None:
        self.app_server = app_server or CodexAppServer(timeout=request_timeout)
        self.auth_path = Path(auth_path).expanduser() if auth_path is not None else default_auth_path()
        self.credential_reader = credential_reader or (lambda: read_codex_auth(self.auth_path))
        self.http_post = http_post
        self.request_timeout = max(1.0, float(request_timeout))
        self._refresh_lock = threading.Lock()

    def account(self, refresh: bool = False) -> dict[str, Any]:
        raw = self.app_server.account(refresh=refresh)
        account = raw.get("account")
        if not isinstance(account, dict):
            account = {}
        return {
            "authenticated": account.get("type") == "chatgpt",
            "type": account.get("type"),
            "planType": account.get("planType"),
            "requiresOpenaiAuth": bool(raw.get("requiresOpenaiAuth")),
        }

    def usage(self) -> dict[str, Any]:
        return normalize_codex_usage(self.app_server.rate_limits())

    def health(self, *, probe: bool = False) -> dict[str, Any]:
        oauth_configured = False
        oauth_expires_at: int | None = None
        auth_error: str | None = None
        try:
            credential = self.credential_reader()
            oauth_configured = True
            oauth_expires_at = credential.expires_at
        except BrokerError as error:
            auth_error = redact_sensitive(error)
        account: dict[str, Any] | None = None
        if probe:
            try:
                account = self.account(refresh=False)
            except BrokerError as error:
                auth_error = redact_sensitive(error)
        return {
            "ok": bool(oauth_configured and (not probe or account and account.get("authenticated"))),
            "oauthConfigured": oauth_configured,
            "oauthExpiresAt": oauth_expires_at,
            "account": account,
            "appServer": self.app_server.health(),
            "error": auth_error,
        }

    def _headers(self, credential: Credential) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {credential.access_token}",
            "chatgpt-account-id": credential.account_id,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "atlas-native-broker/0.1.0",
        }

    def _reserve_once(self, body: dict[str, Any], credential: Credential) -> HTTPResult:
        return self.http_post(
            CLIENT_SECRETS_URL,
            body,
            self._headers(credential),
            self.request_timeout,
        )

    def create_talk_session(self, params: Mapping[str, Any]) -> dict[str, Any]:
        if str(params.get("provider") or "openai").lower() != "openai":
            raise RealtimeBrokerError("ATLAS Native Broker solo admite el proveedor OpenAI")
        if str(params.get("transport") or "webrtc").lower() != "webrtc":
            raise RealtimeBrokerError("ATLAS Native Broker solo admite WebRTC")
        session_request = _session_request(params)
        ttl = _clamped_integer(params.get("expiresAfterSeconds"), 600, 10, 7200)
        body = {
            "expires_after": {"anchor": "created_at", "seconds": ttl},
            "session": session_request,
        }
        self.app_server.account(refresh=False)
        credential = self.credential_reader()
        response = self._reserve_once(body, credential)
        if response.status == 401:
            # Only the refresh path is serialised. Independent successful
            # reservations remain concurrent, while simultaneous 401s reuse
            # the first caller's newly rotated token instead of racing it.
            with self._refresh_lock:
                current = self.credential_reader()
                if current.access_token == credential.access_token:
                    self.app_server.account(refresh=True)
                    current = self.credential_reader()
                credential = current
                response = self._reserve_once(body, credential)
        if response.status not in {200, 201}:
            raise RealtimeBrokerError(
                f"OpenAI rechazó la reserva Realtime (HTTP {response.status})"
            )
        secret = response.payload.get("value")
        if not isinstance(secret, str) or len(secret) < 8:
            raise RealtimeBrokerError("OpenAI no devolvió un client secret Realtime válido")
        expires_at = response.payload.get("expires_at")
        if not isinstance(expires_at, int):
            expires_at = None
        effective_session = response.payload.get("session")
        if not isinstance(effective_session, dict):
            effective_session = {}
        return {
            "provider": "openai",
            "transport": "webrtc",
            "clientSecret": secret,
            "expiresAt": expires_at,
            "offerUrl": REALTIME_CALLS_URL,
            "offerHeaders": {},
            "model": session_request["model"],
            "voice": session_request["audio"]["output"]["voice"],
            "session": effective_session,
        }

    def close(self) -> None:
        self.app_server.close()
