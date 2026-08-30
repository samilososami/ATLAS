# ATLAS runtime

This is the public source layout for `/home/atlas/.atlas`. Your working parts
live here; OpenClaw keeps your identity and memory in its own workspace.

- `webscreen/`: voice UI, HTTP backend, Gateway bridge, runtime plugin,
  instructions and regression tests. Its README explains the voice pipeline.
  `starter/` keeps the dedicated starter workspace and `workspace/` holds
  projects requested through the voice interface.
- `desktop/`: the separate virtual desktop, Openbox configuration and
  shared wallpapers. It is not the physical screen's desktop.
- `screen/`: storage for the current physical display mode and optional
  boot choice. Startup stays off until explicitly enabled with `atlas-screen`.
- `rafas/`: private RAFAS and power-lifecycle records. `logs/power.log`
  distinguishes clean shutdowns from a previous boot that vanished without a
  goodbye; `logs/rafas.log` records recovery-console openings and closures.
  Runtime logs and state markers stay out of Git. Even a good logbook cannot
  write after instant power loss, so an unclean marker is evidence of an abrupt
  ending, not a crystal ball that can name the electrical culprit by itself.
- `adb/`: private, automatically refreshed Android device inventories.
  The deterministic helper keys records by MAC when Android or the neighbour
  table exposes one. Addresses, serials and device records stay out of Git.
- `nmap/`: the private `REPORT.md` cache produced every ten minutes by a
  bounded LAN scan. Full-port reports are focused, manual artefacts rather than
  a permanent storm of probes around the house.
- `wallpapers/`: optional shared wallpaper drop point outside the desktop's
  own curated wallpaper set.

No Google Chrome profile, runtime state, recordings, conversation logs, certificates,
model weights or private generated projects belong in this public tree.
The starter workspace now lives under `webscreen/starter/` for compatibility
and diagnostics. The hot listener normally uses the existing OpenClaw `main`
agent through its persistent gateway stream.

## Files outside this directory

The repository's `system/` directory mirrors supporting installation targets:

- `libexec/` → `/usr/local/libexec/`: physical screen, terminal, audio, recovery
  lifecycle logging, ADB inventory and Nmap reporting helpers.
- `etc/logrotate.d/` → `/etc/logrotate.d/`: bounded retention for local ATLAS logs.
- `etc/atlas/` → `/etc/atlas/`: Zsh, LXTerminal and Openbox terminal settings.
- `etc/X11/` → `/etc/X11/`: Raspberry Pi HDMI configuration.
- `etc/opt/chrome/` → `/etc/opt/chrome/`: managed Google Chrome policies.
- `systemd/` → `/etc/systemd/system/`: service definitions, not automatic enablement.
- `share/atlas/` → `/usr/local/share/atlas/`: Fastfetch/Neofetch ASCII assets and the RAFAS banner.
- `config/` → each user's `.config/`: fetch-tool appearance.
- `plymouth/atlas/` → `/usr/share/plymouth/themes/atlas/`: the native boot theme.

The executable wrappers live in `atlas-commands/` and belong in
`/usr/local/bin/`, available to both the normal user and root. These are source
files for the existing ATLAS OS installation, not a universal installer.
Review paths, the `sami` service user and `/home/atlas` home before installing.
Never overwrite a live user's files without a focused backup.

The touch keyboard sources now live under `../misc/atlas-touch-type/`; install
its two helpers into `/usr/local/libexec/` too. `../misc/rafas/` contains the
small native hotkey listener and its build instructions. Their READMEs are the
installation maps; neither depends on a fresh disk image.

The physical surface needs Xorg, Openbox, LXTerminal, Zsh, zsh-autosuggestions,
zsh-syntax-highlighting, xdotool, wmctrl, xinput, unclutter and Python Tkinter.
The lightweight desktop additionally needs LightDM/LXDE; the virtual desktop
uses Xvfb, Google Chrome and feh. Install system dependencies from your distribution
and the official `google-chrome-stable` ARM64 package from Google. Both browser
launchers use separate `chrome-profile` directories and run as `sami`, including
when called from root. Keep the sandbox on; root should hand over the keys,
not climb into the browser itself.

## Boot splash

Your opening screen has two stages, neither of which needs Chrome. The early
kernel image replaces the Raspberry Pi logos; Plymouth then draws the approved
1024 × 600 artwork and the nearly square blue bar. It fills once in about
1.2 seconds and stays full until Plymouth exits. That is a visual introduction,
not a measurement of service readiness. A quick entrance is not a stopwatch
for the whole operating system.

`assets/boot/atlas-splash-v3.html` is the browser preview. Its background is
`atlas-splash-v2.png`; the same image is copied into the native theme as
`system/plymouth/atlas/atlas-splash.png`. The early TGA is letterboxed at
640 × 480 because this A1's firmware framebuffer starts at that resolution.
Plymouth preserves the aspect ratio when the display changes to 1024 × 600.
Keep the PNG, native theme and preview in step when changing the design.

On this Pi, install `plymouth`, `plymouth-themes` and
`rpi-splash-screen-support`. Back up `/boot` and the affected configuration
before selecting the `atlas` theme or using `configure-splash`. Use its
`--no-cmdline` option and merge the boot parameters deliberately: the early
image needs `fullscreen_logo=1 fullscreen_logo_name=logo.tga`, and Plymouth
needs `splash plymouth.ignore-serial-consoles`. Remove the display's
`console=tty1` entry; preserve the serial console, root device and HDMI mode.
Do not add `quiet`: the early logo follows the kernel's logo/loglevel path.
Hide systemd status text with `systemd.show_status=false
rd.systemd.show_status=false`, while keeping the journal and serial logs.
No global cursor override is needed; leave the native recovery cursor alone.
Set `Theme=atlas` and `ShowDelay=0` in `/etc/plymouth/plymouthd.conf`, then
rebuild all installed initramfs images and verify the copies in the firmware
partition. The systemd drop-ins in `system/systemd/` order screen-off after
Plymouth and cap its quit-wait at twenty-five seconds.

The screen is **off after boot unless explicitly enabled**. Use
`atlas-screen enable --atlas` (or another mode) for a fixed startup surface,
`enable --last` for the last selected mode, and `disable` to restore boot-off.
The on/off boot services are mutually exclusive; both wait for Plymouth.
The splash does not change the selected screen mode, volume, EEPROM or bootloader setup UI.
Plymouth exits after boot; it does not leave a browser or animation loop running.
Keep authentication prompts visible and preserve Escape-to-details recovery.
Power-off, halt and reboot use the matching `atlas-powering-off.png` artwork only when
the physical HDMI screen is already on. Their Plymouth drop-ins skip the
renderer entirely when `atlas-screen` left the display off; darkness does not
need a farewell tour. When visible, `atlas-plymouth-poweroff` holds the shutdown
or reboot unit for at least 1.5 seconds.

## ADB and network inventory

The `system/bin/adb` wrapper is installed as `/usr/local/bin/adb`, ahead of the
real `/usr/bin/adb` for both `sami` and root. It forwards every argument and exit
status unchanged. A successful network connection only adds one quiet action:
refreshing the matching private Markdown record through
`atlas-adb-inventory`. `atlas-adb-monitor.timer` catches USB devices without
requiring the agent to poll them itself.

`atlas-nmap-report.timer` refreshes `.atlas/nmap/REPORT.md` every ten
minutes. Its automatic profile discovers hosts and checks the one hundred most
common TCP ports with light version detection. The deliberate bound matters:
all-port version scans are useful forensic tools, but absurd background pets.
Use `atlas-nmap-report --deep PRIVATE_IP` when one authorised target genuinely
needs the full treatment.

See the [official Raspberry Pi splash documentation](https://www.raspberrypi.com/documentation/computers/configuration.html#customise-the-early-boot-splash-screen)
for image constraints. Check a real reboot on the physical screen before
claiming the full startup sequence has been visually verified.

## WebScreen integration

WebScreen uses Python and Node.js, the installed OpenClaw Gateway SDK and its
configured model/provider. Install the local `webscreen/openclaw-plugin`
with OpenClaw's plugin installer and enable `atlas-webscreen-runtime` for the
hot listener. Authenticate OpenClaw locally; never copy another installation's
OAuth session, Gateway pairing or API keys. The bridge needs the documented
operator scopes and device approval on first connection.

The current HTTP interface has privileged agent access and no browser login.
Use it only on a trusted network. Do not expose port 5000 publicly. The terminal
mode deliberately opens root locally without a password prompt; it is a
development surface. RAFAS is a separate native console, also with direct local
root access in this first development version. See `../misc/rafas/README.md`.
