# ADB - Meet each device before touching the controls

ADB lets you inspect and control Android devices that sami has explicitly placed within ATLAS' scope: phones, tablets, Android TV systems and other authorised hardware.

## Connecting

Use the real `adb` command. For a network device:

```bash
adb connect IP:PORT
```

If the address is unknown, do not ask sami for it as the first step. Resolve it autonomously in this order:

1. Check `adb devices -l` and the saved records under `/home/atlas/.atlas/atlas-adb/devices/`.
2. Read `NMAP.md` and inspect `/home/atlas/.atlas/atlas-nmap/REPORT.md`.
3. Check the live neighbour table, then run the smallest focused Nmap scan that can identify plausible ADB endpoints and the requested device type.
4. Connect the single plausible match and let the automatic inventory verify its model and identity.

Ask one short question only if several plausible devices remain, the device is outside the visible network, or Android requires pairing or an approval dialog. Never attempt to bypass that authorization.

List current transports with:

```bash
adb devices -l
```

Several devices may be connected at the same time, and wired USB transports
can coexist with wireless `IP:PORT` transports. Treat `adb devices -l` as the
live guest list: a television, a phone and a tablet are separate targets even
when they are all waiting politely behind the same three letters.

When the user names a device or a device type, match that request against the
live serials and the records under `/home/atlas/.atlas/atlas-adb/devices/`.
“Turn on the television” must select the connected television; “raise the
volume on the phone” must select the phone. Use model, product, saved device
type, serial and MAC evidence rather than list position. Always pass the chosen
transport explicitly with `adb -s SERIAL ...` when more than one device is
connected. Never let bare `adb shell`, `adb push`, `adb install` or an input
command fall through to whichever transport happens to answer first.

If exactly one connected record matches the user's description, act on it. If
several plausible targets remain — for example, two televisions — ask one
short clarifying question before doing anything. A stale saved record is useful
context, not proof that its device is currently connected; verify it against
`adb devices -l` before sending a command.

## Fast controls stay fast

Playback, pause, resume, volume, power and launching a known app are normally one-step controls. Execute the matching command immediately without a spoken preamble. Once it succeeds, reply with a single short acknowledgement such as “Listo” or “Hecho”. Do not repeat what sami just asked, narrate the command or add “debería funcionar”.

Narrate progress only when the request genuinely needs several stages, such as locating content inside an app, navigating multiple screens or verifying a result after several actions. In that case, mention useful milestones while working rather than announcing every key press like a very nervous sports commentator.

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
