"""Small, bounded NetworkManager adapter for the physical WebScreen.

The HTTP layer restricts these operations to the loopback kiosk.  This module
never invokes a shell and never includes a Wi-Fi password in returned errors.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
from typing import Callable


class WifiControlError(RuntimeError):
    pass


Command = Callable[[list[str], int], tuple[int, str, str]]
SecretCommand = Callable[[list[str], str, int], tuple[int, str, str]]
WIFI_LOCK = threading.RLock()


def split_nmcli(line: str) -> list[str]:
    """Split nmcli terse output while preserving escaped colons/backslashes."""
    fields: list[str] = []
    buffer = ""
    escaped = False
    for character in line:
        if escaped:
            buffer += character
            escaped = False
        elif character == "\\":
            escaped = True
        elif character == ":":
            fields.append(buffer)
            buffer = ""
        else:
            buffer += character
    if escaped:
        buffer += "\\"
    fields.append(buffer)
    return fields


def run_nmcli(arguments: list[str], timeout: int = 20) -> tuple[int, str, str]:
    executable = shutil.which("nmcli") or "/usr/bin/nmcli"
    command = [executable, *arguments]
    if os.geteuid() != 0:
        sudo = shutil.which("sudo") or "/usr/bin/sudo"
        command = [sudo, "-n", *command]
    try:
        completed = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
            env={**os.environ, "LC_ALL": "C"},
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return 127, "", str(error)
    return completed.returncode, completed.stdout.strip(), completed.stderr.strip()


def run_nmcli_secret(arguments: list[str], secret: str, timeout: int = 45) -> tuple[int, str, str]:
    """Answer nmcli's password prompt through stdin, never argv or environment."""
    executable = shutil.which("nmcli") or "/usr/bin/nmcli"
    command = [executable, "--ask", *arguments]
    if os.geteuid() != 0:
        sudo = shutil.which("sudo") or "/usr/bin/sudo"
        command = [sudo, "-n", *command]
    try:
        completed = subprocess.run(
            command,
            input=f"{secret}\n",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
            env={**os.environ, "LC_ALL": "C"},
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return 127, "", str(error)
    return completed.returncode, completed.stdout.strip(), completed.stderr.strip()


def wifi_interfaces(command: Command = run_nmcli) -> list[str]:
    code, output, error = command(
        ["-t", "--escape", "yes", "-f", "DEVICE,TYPE,STATE", "device", "status"], 8
    )
    if code:
        raise WifiControlError(error or "NetworkManager no está disponible")
    interfaces = []
    for line in output.splitlines():
        fields = split_nmcli(line)
        if len(fields) >= 2 and fields[1] == "wifi" and fields[0] not in interfaces:
            interfaces.append(fields[0])
    if not interfaces:
        raise WifiControlError("No se ha encontrado ningún adaptador Wi-Fi")
    return interfaces


def scan_networks(command: Command = run_nmcli, *, rescan: bool = True) -> dict:
    with WIFI_LOCK:
        # Enabling the radio is local and reversible. It makes this recovery
        # surface useful after Wi-Fi was disabled before moving A1.
        code, _, error = command(["radio", "wifi", "on"], 8)
        if code:
            raise WifiControlError(error or "No se pudo activar el Wi-Fi")
        interface = wifi_interfaces(command)[0]
        code, output, error = command([
            "-t", "--escape", "yes", "-f", "IN-USE,SSID,SIGNAL,SECURITY",
            "device", "wifi", "list", "ifname", interface,
            "--rescan", "yes" if rescan else "no",
        ], 25 if rescan else 10)
        if code:
            raise WifiControlError(error or "No se pudieron escanear las redes Wi-Fi")

    by_ssid: dict[str, dict] = {}
    for line in output.splitlines():
        fields = split_nmcli(line)
        if len(fields) != 4:
            continue
        active, ssid, signal, security = fields
        if not ssid or len(ssid.encode("utf-8")) > 32:
            continue
        try:
            strength = max(0, min(100, int(signal)))
        except ValueError:
            strength = 0
        secured = bool(security and security != "--")
        item = {
            "ssid": ssid,
            "signal": strength,
            "security": security if secured else "Abierta",
            "secured": secured,
            "active": active == "*",
        }
        previous = by_ssid.get(ssid)
        if previous is None or item["active"] or strength > previous["signal"]:
            by_ssid[ssid] = item
    networks = sorted(
        by_ssid.values(), key=lambda item: (not item["active"], -item["signal"], item["ssid"].casefold())
    )
    active = next((item["ssid"] for item in networks if item["active"]), None)
    return {"interface": interface, "active": active, "networks": networks}


def connect_network(
    ssid: object,
    password: object,
    command: Command = run_nmcli,
    secret_command: SecretCommand | None = None,
) -> dict:
    if not isinstance(ssid, str):
        raise WifiControlError("Selecciona una red Wi-Fi válida")
    ssid = ssid.strip()
    if not ssid or len(ssid.encode("utf-8")) > 32 or any(ch in ssid for ch in "\r\n\0"):
        raise WifiControlError("Selecciona una red Wi-Fi válida")
    if not isinstance(password, str):
        raise WifiControlError("La contraseña no tiene un formato válido")
    if len(password) > 128 or any(ch in password for ch in "\r\n\0"):
        raise WifiControlError("La contraseña no tiene un formato válido")

    with WIFI_LOCK:
        interface = wifi_interfaces(command)[0]
        arguments = ["--wait", "40", "device", "wifi", "connect", ssid, "ifname", interface]
        if password:
            # nmcli stores the secret in NetworkManager's root-only connection
            # profile. --ask reads it from stdin, outside argv, environment,
            # sudo's command journal and the WebScreen response.
            if secret_command is not None:
                code, output, error = secret_command(arguments, password, 45)
            elif command is run_nmcli:
                code, output, error = run_nmcli_secret(arguments, password, 45)
            else:
                # Dependency-injected unit runners receive the public argv only.
                code, output, error = command(arguments, 45)
        else:
            code, output, error = command(arguments, 45)
        if code:
            # nmcli may echo an SSID but must never echo the submitted secret.
            message = error or output or "No se pudo conectar a la red"
            if password:
                message = message.replace(password, "••••")
            raise WifiControlError(message[:300])
    snapshot = scan_networks(command, rescan=False)
    return {"connected": snapshot.get("active") == ssid, **snapshot}
