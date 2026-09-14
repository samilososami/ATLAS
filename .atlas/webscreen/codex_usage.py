"""Small, read-only quota view. Never return auth, billing or account details."""

from __future__ import annotations

import math
import threading
import time
from copy import deepcopy
from typing import Any, Callable


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def normalize_usage(summary: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "fiveHour": None,
        "weekly": None,
        "updatedAt": None,
        "planProfile": "auto",
    }
    if not isinstance(summary, dict):
        return result
    # The standalone ATLAS broker already returns this stable DTO. Keep the
    # validation here so callers cannot smuggle account/auth fields through.
    if "fiveHour" in summary or "weekly" in summary:
        for source_key, target_key in (("fiveHour", "fiveHour"), ("weekly", "weekly")):
            window = summary.get(source_key)
            if not isinstance(window, dict):
                continue
            used = window.get("usedPercent")
            if not finite_number(used):
                continue
            used = round(max(0.0, min(100.0, float(used))), 1)
            reset = window.get("resetAt")
            result[target_key] = {
                "usedPercent": used,
                "remainingPercent": round(100.0 - used, 1),
                "resetAt": int(reset) if finite_number(reset) and reset > 0 else None,
            }
        profile = str(summary.get("planProfile") or "auto").strip().lower()
        result["planProfile"] = profile if profile in {"auto", "plus", "pro"} else "auto"
        updated = summary.get("updatedAt")
        if finite_number(updated) and updated > 0:
            result["updatedAt"] = int(updated)
        if result["planProfile"] == "auto":
            result["planProfile"] = "plus" if result["fiveHour"] else "pro" if result["weekly"] else "auto"
        return result
    return result


class CodexUsageCache:
    """One background fetch per minute, shared by every connected browser."""

    def __init__(self, fetch: Callable[[], dict[str, Any]], refresh_seconds: float = 60,
                 failure_retry_seconds: float = 5) -> None:
        self.fetch = fetch
        self.refresh_seconds = refresh_seconds
        self.failure_retry_seconds = failure_retry_seconds
        self.lock = threading.Lock()
        self.data = normalize_usage({})
        self.inflight = False
        self.next_refresh = 0.0
        self.failed = False

    def _refresh(self) -> None:
        try:
            data = normalize_usage(self.fetch())
            if data["fiveHour"] is None and data["weekly"] is None:
                raise ValueError("No quota windows available")
            if data["updatedAt"] is None:
                data["updatedAt"] = int(time.time() * 1000)
            with self.lock:
                self.data = data
                self.failed = False
        except Exception:
            # Keep the last good reading; upstream errors can contain private details.
            with self.lock:
                self.failed = True
        finally:
            with self.lock:
                self.inflight = False
                has_data = self.data["fiveHour"] is not None or self.data["weekly"] is not None
                delay = (self.failure_retry_seconds
                         if self.failed and not has_data else self.refresh_seconds)
                self.next_refresh = time.monotonic() + delay

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            if not self.inflight and time.monotonic() >= self.next_refresh:
                self.inflight = True
                threading.Thread(target=self._refresh, name="codex-usage", daemon=True).start()
            data = deepcopy(self.data)
            available = data["fiveHour"] is not None or data["weekly"] is not None
            stale = available and (self.failed or
                time.time() * 1000 - (data["updatedAt"] or 0) > 120_000 or
                any(window is not None and window["resetAt"] is not None and
                    time.time() * 1000 >= window["resetAt"]
                    for window in (data["fiveHour"], data["weekly"])))
            return {**data, "available": available, "stale": stale,
                    "refreshing": self.inflight,
                    "message": ("Última lectura; no se ha podido actualizar" if self.failed and available
                                else "Límites no disponibles" if self.failed
                                else "Actualizando límites" if self.inflight
                                else "Lectura pendiente de actualizar" if stale
                                else "Cuenta de Codex de ATLAS")}
