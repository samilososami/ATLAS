"""Passive USB hotplug notifications for the A1 display (no device access)."""

import re
import socket
import threading
import time
from pathlib import Path


# A1's built-in touch controller, identified from its USB inventory. Exclude
# that hardware identity rather than its port: an external microphone plugged
# into the same port later must still be announced.
A1_SCREEN_IDS = frozenset({("1a86", "e5e3")})


class UsbMonitor:
    """Watch kernel uevents, with a low-frequency sysfs fallback on other hosts.

    Seed the attached-device set before listening: rebooting WebScreen must not
    announce every microphone, touch panel or composite USB interface again.
    """

    def __init__(self, on_attach, sysfs=Path("/sys/bus/usb/devices"), ignored_ids=A1_SCREEN_IDS, on_detach=None):
        self.on_attach = on_attach
        self.on_detach = on_detach or (lambda: None)
        self.sysfs = Path(sysfs)
        self.ignored_ids = set(ignored_ids)
        self.known = {}
        self.stop_event = threading.Event()
        self.thread = None
        self.transport = "stopped"

    def identity(self, name):
        if not re.fullmatch(r"[0-9]+-[0-9]+(?:\.[0-9]+)*", name):
            return None  # Not a physical device; excludes root hubs/interfaces.
        try:
            path = self.sysfs / name
            vendor = (path / "idVendor").read_text().strip().lower()
            product = (path / "idProduct").read_text().strip().lower()
            if (vendor, product) in self.ignored_ids:
                return None
            removable = path / "removable"
            if removable.is_file() and removable.read_text().strip() == "fixed":
                return None
            # devnum changes even if an unplug/replug at the same port was missed.
            return vendor, product, (path / "devnum").read_text().strip()
        except OSError:
            return None  # An early add is reconciled once sysfs is populated.

    def is_device(self, name):
        return self.identity(name) is not None

    def scan(self):
        try:
            return {path.name: identity for path in self.sysfs.iterdir()
                    if (identity := self.identity(path.name)) is not None}
        except OSError:
            return {}

    def rescan(self, announce=True):
        current = self.scan()
        added = [name for name, identity in current.items() if self.known.get(name) != identity]
        removed = self.known.keys() - current.keys()
        self.known = current
        if announce and removed:
            self.on_detach()
        if announce and added:
            self.on_attach()  # A hub/enumeration burst gets one finite animation.

    def accept(self, data, sender_pid=0):
        if sender_pid != 0 or len(data) > 16384:
            return
        fields = dict(part.split("=", 1) for part in data.decode("utf-8", "replace").split("\0") if "=" in part)
        if fields.get("SUBSYSTEM") != "usb" or fields.get("DEVTYPE") != "usb_device":
            return
        name = fields.get("DEVPATH", "").rsplit("/", 1)[-1]
        if fields.get("ACTION") == "remove":
            if self.known.pop(name, None) is not None:
                self.on_detach()
        elif fields.get("ACTION") == "add":
            identity = self.identity(name)
            if identity is not None and self.known.get(name) != identity:
                self.known[name] = identity
                self.on_attach()

    def run(self):
        seeded = False
        try:
            # NETLINK_KOBJECT_UEVENT, group 1: read-only kernel broadcasts.
            # Bind before baseline to avoid losing an attach during startup.
            with socket.socket(socket.AF_NETLINK, socket.SOCK_DGRAM, 15) as channel:
                channel.bind((0, 1))
                channel.settimeout(1)
                self.rescan(announce=False)
                seeded = True
                self.transport = "kernel"
                reconcile_at = time.monotonic() + 2
                while not self.stop_event.is_set():
                    try:
                        payload, sender = channel.recvfrom(16385)
                        self.accept(payload, sender[0])
                    except socket.timeout:
                        pass
                    if time.monotonic() >= reconcile_at:
                        self.rescan()
                        reconcile_at = time.monotonic() + 2
        except (OSError, AttributeError):
            self.transport = "sysfs"
            self.rescan(announce=seeded)
            while not self.stop_event.wait(1):
                self.rescan()
        finally:
            self.transport = "stopped"

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self.run, name="atlas-usb-display", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2)
