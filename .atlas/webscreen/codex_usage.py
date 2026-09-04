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
    providers = summary.get("providers")
    if not isinstance(providers, list):
        return result
    for provider in providers:
        if not isinstance(provider, dict) or provider.get("provider") not in {
            "openai", "openai-codex", "codex",
        }:
            continue
        windows = provider.get("windows")
        if provider.get("error") or not isinstance(windows, list):
            continue
        plan = str(provider.get("plan") or "").strip().lower()
        if plan.startswith("pro"):
            result["planProfile"] = "pro"
        elif plan:
            result["planProfile"] = "plus"
        for window in windows:
            if not isinstance(window, dict):
                continue
            label = str(window.get("label") or "").lower().replace(" ", "")
            key = {"5h": "fiveHour", "300m": "fiveHour", "week": "weekly",
                   "weekly": "weekly", "7d": "weekly", "168h": "weekly"}.get(label)
            used = window.get("usedPercent")
            if not key or not finite_number(used):
                continue
            used = round(max(0.0, min(100.0, used)), 1)
            reset = window.get("resetAt")
            result[key] = {"usedPercent": used, "remainingPercent": round(100 - used, 1),
                           "resetAt": int(reset) if finite_number(reset) and reset > 0 else None}
    # Older Gateway builds did not report a plan name. The shape of the
    # authoritative quota response is still enough to select the presentation.
    if result["planProfile"] == "auto":
        if result["fiveHour"] is not None:
            result["planProfile"] = "plus"
        elif result["weekly"] is not None:
            result["planProfile"] = "pro"
    updated = summary.get("updatedAt")
    if finite_number(updated) and updated > 0:
        result["updatedAt"] = int(updated)
    return result


class CodexUsageCache:
    """One background fetch per minute, shared by every connected browser."""

    def __init__(self, fetch: Callable[[], dict[str, Any]], refresh_seconds: float = 60) -> None:
        self.fetch = fetch
        self.refresh_seconds = refresh_seconds
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
                self.next_refresh = time.monotonic() + self.refresh_seconds

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
