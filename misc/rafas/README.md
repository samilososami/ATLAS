# R.A.F.A.S.

**Recovery Access For ATLAS Systems**

Your escape hatch when the clever parts have called in sick. RAFAS is a native
Linux console on `tty8`, independent of Chrome, Xorg, OpenClaw, model providers
and networking. It opens a plain root Bash prompt in `/home/atlas`, with the
ATLAS logo and a monochrome R.A.F.A.S. banner. No user shell plugins are loaded.
The recovery header reveals itself from top to bottom, one line every two
tenths of a second, with the cursor hidden until the root prompt is ready.

## Open and leave

Hold either Ctrl key and tap **W, O, W**, releasing each letter before the next.
Keep Ctrl held throughout, with less than three seconds between presses.
Release Ctrl before trying again. A USB wireless receiver counts as USB;
native Bluetooth keyboards are deliberately not enabled yet.

Or use `atlas-screen --rafas` (`--RAFAS` is also accepted). A mode flag switches
the screen immediately, waking it if necessary. To leave, use
`atlas-screen --atlas`, `--desktop`, `--terminal` or `atlas-screen off`.
Boot behavior is separate: `enable --rafas` always starts in recovery,
`enable --last` follows the latest mode, and `disable` restores boot-off.
`exit` reopens a clean recovery shell. Ctrl+L and `clear` work normally.

## Minimal, not magical

The C hotkey service blocks in `poll()` on Linux input events and an inotify
hotplug watch. It enumerates devices at startup and after device changes, not
on a timer. It records no typed text, forwards nothing over the network and
does not grab the keyboard. It keeps only modifier and W-O-W sequence state.
Because it is passive, the current application can also receive the Ctrl-key
prefixes; the shortcut is not a keyboard remapper.

Systemd restarts the listener after a crash and enables it at boot. The listener
only asks a separate activation unit to switch surfaces; it never waits for a
browser to exit. Graphical shutdown is bounded and can kill only the stuck
physical display service, not the Gateway, WebScreen backend or network.

This is recovery from userspace failures, not an alternate boot image. It cannot
work through loss of power, a frozen kernel, broken USB/display hardware, an
unreadable root filesystem or a dead service manager. It is not remote access.

**This development version gives local root access without a password.** The
shortcut is not a secret or authentication mechanism. Anyone with physical
keyboard access can administer the device. Do not use this setup on unattended
or untrusted equipment. Do not add network listeners to this console.

## Build and install

Build the small native listener on the target architecture:

```sh
cc -O2 -std=c11 -Wall -Wextra -Werror atlas-rafas-hotkey.c -o atlas-rafas-hotkey
cc -O2 -std=c11 -Wall -Wextra -Werror test_hotkey.c -o test_hotkey
./test_hotkey
sudo install -m755 atlas-rafas-hotkey /usr/local/libexec/atlas-rafas-hotkey
```

The remaining source files live in `../../system/`: install `libexec/atlas-rafas-console`,
`etc/atlas/rafas.bashrc`, `share/atlas/rafas-banner.txt` and the three
`systemd/atlas-rafas*.service` files into their corresponding system paths.
Also install the updated `../../atlas-commands/atlas-screen` wrapper.
Run `systemctl daemon-reload`, then enable only `atlas-rafas-hotkey.service`.
Neither the activation service nor the root console is enabled directly at boot;
the optional `atlas-screen-boot-on.service` selects and starts the requested surface.

Runtime dependencies: Bash, systemd, glibc, kbd, console fonts and util-linux.
The banner is generated with `build_banner.py` and pyfiglet at development time;
RAFAS itself does not need Python or pyfiglet to start.

Diagnostics: `systemctl status atlas-rafas-hotkey.service atlas-rafas.service`
and `journalctl -u atlas-rafas-hotkey.service`. Input characters never enter those logs.

The companion `atlas-rafas-logger.service` keeps the private logbook under
`/home/atlas/.atlas/rafas/logs`. `power.log` records clean shutdowns,
abrupt previous boots and Raspberry Pi throttling flags; `rafas.log` records
recovery requests and console sessions. It samples the firmware flag every
fifteen seconds but only appends when that state changes, because a logbook
should observe the patient, not become the patient. Install
`../../system/libexec/atlas-rafas-logger`, its systemd unit and the supplied
logrotate policy, then enable the logger for future boots.
