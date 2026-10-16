"""Persistent, latest-only presentation preference for the new WebScreen."""

import json
import os
import re
import tempfile
import threading
import time
from pathlib import Path
from uuid import uuid4


DISPLAY_MODES = ("face", "clock")


class DisplayState:
    """Keep a tiny user preference durable without owning voice or screen I/O."""

    def __init__(self, path: Path, clock=time.monotonic):
        self.path = Path(path)
        self.clock = clock
        self.condition = threading.Condition()
        self.epoch = uuid4().hex
        self.sequence = 0
        self.waiters = threading.BoundedSemaphore(8)
        self.mode = self._load()
        self.usb_sequence = 0
        self.usb_at = None
        self.usb_kind = "attached"

    def _load(self) -> str:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            active = payload.get("clockModeActive")
            if isinstance(active, bool):
                return "clock" if active else "face"
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        return "face"

    def _persist(self) -> None:
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=".display-mode-", dir=self.path.parent, text=True)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump({"version": 1, "clockModeActive": self.mode == "clock"}, stream,
                          separators=(",", ":"))
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass

    def _snapshot(self):
        return {
            "ok": True,
            "mode": self.mode,
            "clockModeActive": self.mode == "clock",
            "sequence": self.sequence,
            "cursor": f"{self.epoch}:{self.sequence}",
            "usb": {"id": f"{self.epoch}:{self.usb_sequence}",
                    "kind": self.usb_kind,
                    "ageMs": None if self.usb_at is None else max(0, round((self.clock() - self.usb_at) * 1000))},
        }

    def usb_attached(self):
        self.usb_changed("attached")

    def usb_detached(self):
        self.usb_changed("detached")

    def usb_changed(self, kind):
        """Ephemeral feedback only; never persist USB history or device identity."""
        with self.condition:
            now = self.clock()
            if self.usb_at is not None and kind == self.usb_kind and now - self.usb_at < .6:
                return
            self.usb_kind = kind
            self.usb_at = now
            self.usb_sequence += 1
            self.sequence += 1
            self.condition.notify_all()

    def action(self, payload):
        if not isinstance(payload, dict) or set(payload) - {"action", "mode"}:
            raise ValueError("Unknown display payload fields")
        action = payload.get("action")
        if action not in ("status", "set", "preview_usb", "preview_usb_remove"):
            raise ValueError("Action must be status, set, preview_usb or preview_usb_remove")
        if action != "set" and set(payload) != {"action"}:
            raise ValueError("Only set accepts mode")
        mode = payload.get("mode")
        if action == "set" and mode not in DISPLAY_MODES:
            raise ValueError("Mode must be face or clock")
        with self.condition:
            if action == "preview_usb":
                self.usb_attached()
            elif action == "preview_usb_remove":
                self.usb_detached()
            if action == "set" and mode != self.mode:
                self.mode = mode
                self._persist()
                self.sequence += 1
                self.condition.notify_all()
            return self._snapshot()

    def wait(self, cursor, authorize, timeout=12):
        if cursor and not re.fullmatch(r"[a-f0-9]{32}:[0-9]{1,16}", cursor):
            raise ValueError("Invalid display cursor")
        if not self.waiters.acquire(blocking=False):
            raise RuntimeError("Too many display listeners")
        try:
            until = self.clock() + timeout
            with self.condition:
                while True:
                    authorize()
                    snapshot = self._snapshot()
                    if snapshot["cursor"] != cursor or self.clock() >= until:
                        return snapshot
                    self.condition.wait(min(1, until - self.clock()))
        finally:
            self.waiters.release()
