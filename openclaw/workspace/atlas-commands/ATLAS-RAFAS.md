# RAFAS

Recovery Access For ATLAS Systems is your local escape hatch, not another agent.

## Diagnose and repair

Run `atlas-rafas` for network routes, active Wi-Fi, DNS, HTTPS, clock sync,
disk/inodes (including `/tmp`), RAM, temperature/power flags, USB and services.
`atlas-rafas --json` is the machine-readable version. Reports are read-only;
an unavailable measurement is not proof that hardware is broken.

`atlas-rafas doctor --check` performs diagnostics without changes.
`sudo atlas-rafas doctor` starts failed/inactive **enabled** core services,
then checks again. With no default route, it scans Wi-Fi, offers numbered
networks and lets NetworkManager prompt privately for credentials. Run this
from a real terminal; noninteractive sessions cannot choose a network.

Doctor never restarts a healthy NetworkManager, enables disabled services,
turns on an intentionally disabled screen, deletes files, resets OAuth or
reboots the Pi. Disk pressure, failed hardware, power and account problems need
an explicit next step. It cannot guarantee repair of arbitrary failures.
Use `atlas-app` for the Android service, pairing and relay state; see
`ATLAS-APP.md`. `atlas-status` remains the general overview.

## Recovery console

Use `atlas-screen --rafas` to open a plain root Bash console on Linux `tty8`
in `/home/atlas`. The physical screen wakes even if it was off. Chrome, the
desktop and the graphical terminal are stopped; your Gateway, backend and
network are left alone. `atlas-screen` and `atlas-status` show the active mode.
The monochrome header appears line by line every tenth of a second before
the root prompt arrives, because even an emergency hatch may enter with timing.

The external USB shortcut is: hold Ctrl, tap W, O, W, then release Ctrl. The
event-driven `atlas-rafas-hotkey.service` starts at boot and asks
`atlas-rafas-activate.service` to switch surfaces. `atlas-rafas.service` owns
the console. They do not depend on your model, Wi-Fi or graphical session.

To leave, switch directly with `atlas-screen --atlas`, `--desktop` or `--terminal`,
or run `atlas-screen off`. Startup is controlled separately by `enable` and
`disable`; `enable --rafas` fixes recovery mode for boot, while `enable --last`
follows the latest selected mode. Exiting Bash starts a fresh recovery shell rather than closing
the escape hatch. The prompt has no user plugins and stores no disk history.

## Private logs

RAFAS keeps its quiet black box in `/home/atlas/.atlas/rafas/logs`.
`rafas.log` records recovery requests plus console openings and closures.
`power.log` records clean systemd shutdowns, monitor restarts, firmware power
flags and previous boots that disappeared without saying goodbye. An
`UNCLEAN_PREVIOUS_SHUTDOWN` entry means a cut, forced reset or crash is
possible; call it an electrical failure only when the throttling fields or the
system journal provide that evidence. Logs rotate locally and are never part
of the public repository.

This development version intentionally grants local root without authentication.
Say that plainly when explaining it. It cannot rescue a powered-off Pi, frozen
kernel, broken USB/display hardware or dead systemd. No software cape defeats
a disconnected power cable.

The public `misc/rafas/README.md` documents its source and installation. The
related `misc/atlas-touch-type/README.md` documents ATLAS TOUCH TYPE, the touch
keyboard used by the separate graphical terminal, not this native console.
