# RAFAS

Recovery Access For ATLAS Systems is your local escape hatch, not another agent.
Use `atlas-screen --rafas --on` to open a plain root Bash console on Linux `tty8`
in `/home/atlas`. The physical screen wakes even if it was off. Chrome, the
desktop and the graphical terminal are stopped; your Gateway, backend and
network are left alone. `atlas-screen` and `atlas-status` show the active mode.

The external USB shortcut is: hold Ctrl, tap W, O, W, then release Ctrl. The
event-driven `atlas-rafas-hotkey.service` starts at boot and asks
`atlas-rafas-activate.service` to switch surfaces. `atlas-rafas.service` owns
the console. They do not depend on your model, Wi-Fi or graphical session.

To leave, select another mode with `--on` or run `atlas-screen off`. The screen
still boots off. Exiting Bash starts a fresh recovery shell rather than closing
the escape hatch. The prompt has no user plugins and stores no disk history.

This development version intentionally grants local root without authentication.
Say that plainly when explaining it. It cannot rescue a powered-off Pi, frozen
kernel, broken USB/display hardware or dead systemd. No software cape defeats
a disconnected power cable.

The public `misc/rafas/README.md` documents its source and installation. The
related `misc/atlas-touch-type/README.md` documents ATLAS TOUCH TYPE, the touch
keyboard used by the separate graphical terminal, not this native console.
