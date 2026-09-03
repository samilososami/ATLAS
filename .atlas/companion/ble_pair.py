#!/usr/bin/env python3
"""Temporary BlueZ GATT service for six-digit ATLAS Android pairing."""

import asyncio
import base64
import hashlib
import json
import os
import pathlib
import re
import secrets
import signal
import ssl
import subprocess
import time

from dbus_next import BusType, DBusError, PropertyAccess, Variant
from dbus_next.aio import MessageBus
from dbus_next.service import ServiceInterface, dbus_property, method

ROOT = pathlib.Path(os.environ.get("ATLAS_HOME", "/home/atlas"))
STATE = ROOT / ".atlas/companion/state"
CONFIG = STATE / "config.json"
APP_PATH = "/dev/atlas/pair"
SERVICE_PATH = APP_PATH + "/service0"
CHARACTERISTIC_PATH = SERVICE_PATH + "/characteristic0"
ADVERTISEMENT_PATH = APP_PATH + "/advertisement0"
SERVICE_UUID = "7d2f8c42-7b5d-4a8d-9f20-61746c617331"
CHARACTERISTIC_UUID = "7d2f8c43-7b5d-4a8d-9f20-61746c617331"


def variant(signature, value):
    return Variant(signature, value)


def pairing_payload(config):
    addresses = subprocess.check_output(["hostname", "-I"], text=True).split()
    certificate = ssl.PEM_cert_to_DER_cert((STATE / "certificate.pem").read_text())
    value = {
        "v": 1,
        "name": os.uname().nodename,
        "url": "https://" + (addresses[0] if addresses else "atlas-a1.local") + ":5010",
        "pin": hashlib.sha256(certificate).hexdigest(),
        "key": config["key"],
        "room": config["room"],
        "relay": config.get("relay", ""),
    }
    encoded = base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")
    return ("atlas1:" + encoded).encode()


def save_device(name):
    config = json.loads(CONFIG.read_text())
    config["pairedDevice"] = re.sub(r"[^A-Za-z0-9 ._+-]", "", name).strip()[:40] or "Android"
    config["pairedAt"] = int(time.time())
    temporary = CONFIG.with_suffix(".tmp")
    temporary.write_text(json.dumps(config, separators=(",", ":")))
    temporary.chmod(0o600)
    owner = ROOT.stat()
    os.chown(temporary, owner.st_uid, owner.st_gid)
    os.replace(temporary, CONFIG)


class ObjectManager(ServiceInterface):
    def __init__(self):
        super().__init__("org.freedesktop.DBus.ObjectManager")

    @method()
    def GetManagedObjects(self) -> "a{oa{sa{sv}}}":
        return {
            SERVICE_PATH: {
                "org.bluez.GattService1": {
                    "UUID": variant("s", SERVICE_UUID),
                    "Primary": variant("b", True),
                    "Includes": variant("ao", []),
                }
            },
            CHARACTERISTIC_PATH: {
                "org.bluez.GattCharacteristic1": {
                    "UUID": variant("s", CHARACTERISTIC_UUID),
                    "Service": variant("o", SERVICE_PATH),
                    "Flags": variant("as", ["read", "write"]),
                }
            },
        }


class PairService(ServiceInterface):
    def __init__(self):
        super().__init__("org.bluez.GattService1")

    @dbus_property(access=PropertyAccess.READ)
    def UUID(self) -> "s":
        return SERVICE_UUID

    @dbus_property(access=PropertyAccess.READ)
    def Primary(self) -> "b":
        return True

    @dbus_property(access=PropertyAccess.READ)
    def Includes(self) -> "ao":
        return []


class PairCharacteristic(ServiceInterface):
    def __init__(self, code, payload, done):
        super().__init__("org.bluez.GattCharacteristic1")
        self.code = code
        self.payload = payload
        self.done = done
        self.authorized = False
        self.failures = 0

    @dbus_property(access=PropertyAccess.READ)
    def UUID(self) -> "s":
        return CHARACTERISTIC_UUID

    @dbus_property(access=PropertyAccess.READ)
    def Service(self) -> "o":
        return SERVICE_PATH

    @dbus_property(access=PropertyAccess.READ)
    def Flags(self) -> "as":
        return ["read", "write"]

    @method()
    def WriteValue(self, value: "ay", options: "a{sv}"):
        try:
            request = json.loads(bytes(value).decode())
            supplied = re.sub(r"\D", "", str(request.get("code", "")))
            device = str(request.get("device", "Android"))
        except Exception as error:
            raise DBusError("org.bluez.Error.InvalidValueLength", "Solicitud inválida") from error
        if supplied != self.code:
            self.failures += 1
            if self.failures >= 10:
                self.done.set()
            raise DBusError("org.bluez.Error.NotAuthorized", "Código incorrecto")
        save_device(device)
        self.authorized = True

    @method()
    def ReadValue(self, options: "a{sv}") -> "ay":
        if not self.authorized:
            raise DBusError("org.bluez.Error.NotAuthorized", "Introduce primero el código")
        offset = int(options.get("offset", Variant("q", 0)).value)
        result = self.payload[offset:]
        asyncio.get_running_loop().call_later(1.5, self.done.set)
        return result


class Advertisement(ServiceInterface):
    def __init__(self):
        super().__init__("org.bluez.LEAdvertisement1")

    @method()
    def Release(self):
        return

    @dbus_property(access=PropertyAccess.READ)
    def Type(self) -> "s":
        return "peripheral"

    @dbus_property(access=PropertyAccess.READ)
    def ServiceUUIDs(self) -> "as":
        return [SERVICE_UUID]

    @dbus_property(access=PropertyAccess.READ)
    def LocalName(self) -> "s":
        return "ATLAS A1"

    @dbus_property(access=PropertyAccess.READ)
    def Includes(self) -> "as":
        return ["tx-power"]


async def main():
    if os.geteuid() != 0:
        raise SystemExit("El emparejamiento Bluetooth necesita privilegios de administrador")
    config = json.loads(CONFIG.read_text())
    code = f"{secrets.randbelow(1_000_000):06d}"
    done = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, done.set)

    subprocess.run(["systemctl", "start", "bluetooth.service"], check=True)
    bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
    bluez = await bus.introspect("org.bluez", "/")
    manager = bus.get_proxy_object("org.bluez", "/", bluez).get_interface("org.freedesktop.DBus.ObjectManager")
    objects = await manager.call_get_managed_objects()
    adapter_path = next((path for path, interfaces in objects.items()
                         if "org.bluez.GattManager1" in interfaces and "org.bluez.LEAdvertisingManager1" in interfaces), None)
    if not adapter_path:
        raise SystemExit("No se encontró un adaptador Bluetooth LE compatible")

    adapter_info = await bus.introspect("org.bluez", adapter_path)
    adapter_object = bus.get_proxy_object("org.bluez", adapter_path, adapter_info)
    properties = adapter_object.get_interface("org.freedesktop.DBus.Properties")
    await properties.call_set("org.bluez.Adapter1", "Powered", Variant("b", True))
    await properties.call_set("org.bluez.Adapter1", "Alias", Variant("s", "ATLAS A1"))
    gatt = adapter_object.get_interface("org.bluez.GattManager1")
    advertising = adapter_object.get_interface("org.bluez.LEAdvertisingManager1")

    characteristic = PairCharacteristic(code, pairing_payload(config), done)
    bus.export(APP_PATH, ObjectManager())
    bus.export(SERVICE_PATH, PairService())
    bus.export(CHARACTERISTIC_PATH, characteristic)
    bus.export(ADVERTISEMENT_PATH, Advertisement())
    await gatt.call_register_application(APP_PATH, {})
    await advertising.call_register_advertisement(ADVERTISEMENT_PATH, {})

    print("ATLAS A1 está visible por Bluetooth durante 120 segundos.")
    print(f"Código: {code[:3]}-{code[3:]}")
    print("Pulsa Ctrl+C para cancelar.")
    try:
        await asyncio.wait_for(done.wait(), timeout=120)
    except asyncio.TimeoutError:
        print("Tiempo de emparejamiento agotado.")
    finally:
        try:
            await advertising.call_unregister_advertisement(ADVERTISEMENT_PATH)
        except Exception:
            pass
        try:
            await gatt.call_unregister_application(APP_PATH)
        except Exception:
            pass
        bus.disconnect()
    if characteristic.authorized:
        print("ATLAS A1 emparejado correctamente.")


if __name__ == "__main__":
    asyncio.run(main())
