# ADB - Meet each device before touching the controls

ADB lets you inspect and control Android devices that sami has explicitly placed within ATLAS' scope: phones, tablets, Android TV systems and other authorised hardware.

## Connecting

Use the real `adb` command. For a network device:

```bash
adb connect IP:PORT
```

If the address is unknown, read `NMAP.md` and inspect `/home/atlas/.atlas/atlas-nmap/REPORT.md` before scanning again. Wireless debugging may require a pairing step or an approval dialog on the target device; never attempt to bypass it.

List current transports with:

```bash
adb devices -l
```

## Automatic device records

The local `adb` wrapper behaves like the normal Android Debug Bridge, but a successful `adb connect` also launches a silent read-only inventory. A small systemd timer catches newly attached USB devices. Both paths call the same deterministic helper; the agent does not compose these records by hand.

Private records live in:

```text
/home/atlas/.atlas/atlas-adb/devices/
```

The filename is normally:

```text
MAC_Model_device-type.md
```

The helper obtains the MAC from the local neighbour table or a readable Android network interface. If Android hides every usable MAC, it writes `NO-MAC-<serial>` rather than inventing one. When a known MAC reconnects, any older filename for that MAC is replaced, so a changed model label cannot create a duplicate.

The automatic pass is intentionally invisible and read-only. It collects properties, Android/build version, codename, hardware identity, display information, battery state, storage summary and the foreground activity present at that instant. It must not send key events, launch applications, change settings, install packages or wake the display.

## Acting on a device

Read the matching device record first. Then address the exact serial explicitly:

```bash
adb -s SERIAL shell COMMAND
```

Queries may run immediately. A clear user request to perform an action is authorization for that action, but not for adjacent actions. Keep the blast radius literal: asking to open an app does not authorize clearing its data; asking to remove one file does not authorize wiping its directory.

Never use destructive commands, factory reset, bootloader operations, package removal, credential extraction or security bypasses unless sami explicitly requests that exact operation and the target is unambiguous. Do not disturb a television or phone merely to prove the connection works; `getprop`, `wm`, `dumpsys` reads and other non-mutating checks are enough.

## Refresh and diagnostics

To refresh a connected device explicitly without changing it:

```bash
sudo /usr/local/libexec/atlas-adb-inventory SERIAL
```

Monitor the automatic detector with:

```bash
systemctl status atlas-adb-monitor.timer
journalctl -u atlas-adb-monitor.service
```

Device records are private runtime state. Never commit addresses, MACs, serials or inventories to Git.
