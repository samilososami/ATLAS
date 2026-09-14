# ATLAS runtime

This is the public source layout for `/home/atlas/.atlas`. The current runtime,
identity, knowledge and conversation state all live here; it has no OpenClaw
runtime dependency.

- [`broker/`](broker/README.md): native Python broker around one persistent `codex app-server`.
  Codex owns OAuth refresh and account quota reads; the broker mints short-lived
  Realtime client secrets without exposing the persistent credential.
- `config/`: schema and notes for private provider settings. The live
  `secrets.json` is mode `0600`, ignored by Git and contains only the allowlisted
  Tavily and ElevenLabs fields.
- `context/knowledge/`: versioned identity, manuals and knowledge selected by
  `manifest.json`. `context/conversation/` contains mutable private conversation
  state. WebScreen and `atlas-chat` load both layers through the same resolver.
- [`roles/`](roles/README.md): declarative context and capability profiles. The
  default `atlas-full` profile describes the complete runtime; `profesores`
  demonstrates an isolated, read-only role that loads only identity and its
  fictitious teaching timetable. Dynamic selection/composition is documented
  as future work and is not presented as an active runtime feature. The role
  schema and deployment contract are covered by `system/test_roles.py`.
- `webscreen/`: voice UI, HTTP backend, Native Broker adapter,
  instructions and regression tests. Its README explains the voice pipeline.
  `webscreen/static/new/` contains the minimal animated face presentation at
  `/new/`; [its design guide](webscreen/NEW_DESIGN.md) maps the visual/audio
  states. `webscreen/CLAP.md` maps the shared five-trial double-applause
  calibration and summary-only local detector. `atlas-screen --atlas-new`
  selects it without replacing the debug UI.
  `starter/` keeps the dedicated starter workspace and `workspace/` holds
  projects requested through the voice interface.
- `chat/`: text-only terminal client for the same `gpt-realtime-2.1`, OAuth,
  Markdown context, persistent conversation and direct tools as WebScreen.
  This includes typed `atlas_phone` and `atlas_android`; visual results arrive
  as reduced private JPEG `input_image` items. Semantic accessible-label clicks
  precede coordinate fallback; recoverable visual errors keep the session alive,
  while completion, abandonment and terminal loss guarantee `stop`.
  Its private history and diagnostic logs are created only on the live A1.
- `routines/`: validated deterministic automations shared by WebScreen and
  `atlas-chat`. Exact phrases run locally before a model response; the live
  registry, results and logs remain private on A1.
- `companion/`: authenticated Android service with a persistent encrypted
  WebSocket to the A1's private Tailscale `100.x` endpoint. Same-LAN peers prefer
  the direct P2P path and retain encrypted DERP as fallback. `atlas-app` manages BLE pairing,
  native phone tools and connection state; `atlas-androiduse` is the bounded
  Accessibility fallback. The old blind relay is explicit compatibility-only
  and is never selected after a Tailscale failure. Companion dispatches bounded
  RPC concurrently so re-entrant phone replies cannot deadlock the reader.
  Private pairing keys and certificates live only in its ignored `state/`.
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
- `wakeword/`: an isolated openWakeWord laboratory. Its runtime model and any
  enrolled voice recordings remain local to ATLAS A1 until their performance has
  been measured in the real room.
- `wallpapers/`: optional shared wallpaper drop point outside the desktop's
  own curated wallpaper set.

No Google Chrome profile, runtime state, recordings, conversation logs, certificates,
model weights or private generated projects belong in this public tree.
The starter workspace now lives under `webscreen/starter/` for compatibility
and diagnostics. WebScreen uses direct Realtime with Markdown context, shell
and Tavily; no conversation is delegated to another agent. The earlier
OpenClaw/prelude source remains in `Backups/` as historical project evidence;
any surviving description elsewhere is explicitly labelled historical.

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
- `config/` → each user's `.config/`: fetch-tool appearance and the A1 audio
  user's narrow headless WirePlumber Bluetooth policy.
- `plymouth/atlas/` → `/usr/share/plymouth/themes/atlas/`: the native boot theme.

The executable wrappers live in `atlas-commands/` and belong in
`/usr/local/bin/`, available to both the normal user and root. Focused,
idempotent installers now cover the runtime surfaces used by the coordinated
deploy; each preserves existing private state and creates a scoped backup when
it actually replaces a file. `ATLAS_HOME` and `ATLAS_USER` remain explicit
overrides for non-default installations.

Install or update Codex CLI, the Native Broker and the `atlas-broker` wrapper
without replacing an existing OAuth store with
`sudo bash system/install-native-broker.sh`. Validate `atlas-broker health`,
`usage` and `session` before removing any previous authentication source.

`system/deploy-runtime-update.sh` also installs the declarative role manifests
under `/home/atlas/.atlas/roles`; copying them does not activate a role switch.
Until a selector is implemented, WebScreen and `atlas-chat` continue to load
the complete knowledge manifest and private conversation layer described above.

Install or update the shared conversation controller with
`sudo bash system/install-context.sh`. It places the private helper under
`/usr/local/lib/atlas` and the `atlas-context` wrapper under `/usr/local/bin`;
the wrapper works for the normal runtime account and root while keeping writes
owned by the runtime account. The coordinated deploy invokes this installer.

Install or update the text-only Realtime client with
`sudo bash system/install-chat.sh`. The focused installer copies `atlas-chat`
to `/usr/local/bin`, installs its runtime and terminal instruction layer under
`/home/atlas/.atlas/chat`, reuses WebScreen's Python environment and safely
adds any missing command-map references without replacing private workspace
content.

Install or update the routine engine with `sudo bash system/install-routines.sh`.
It installs `atlas-routines` for the normal user and root, copies the engine and
manuals, and deliberately preserves an existing live `ROUTINES.md`.

The optional desktop/cast, Spotify and local wake-word laboratory are installed
with `system/install-desktop.sh`, `system/install-spotify.sh` and
`system/install-wake.sh`. The wake installer never starts a listener, and all
three retain runtime profiles, browser state, pairing/authentication data and
other machine-local content.

Install the focused Bluetooth/ADB reliability fixes with
`sudo bash system/install-device-connections.sh`. It backs up the affected
wrappers, inventory helpers, unit and per-user WirePlumber fragment before
installation. It preserves device pairings/records and does not restart BlueZ,
PipeWire, the browser or ADB. `--restart-audio-manager` optionally applies the
new Bluetooth policy with one WirePlumber restart during maintenance; it can
briefly recreate audio devices, so do not run it mid-conversation.

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
real `/usr/bin/adb` for both `sami` and root. Root hands off to the same normal
user and authorised keys; arguments and exit status are forwarded. A network
connection verified as `device` only adds one quiet action:
refreshing the matching private Markdown record through
`atlas-adb-inventory`. `atlas-adb-monitor.timer` catches USB devices without
requiring the agent to poll them itself. A shared lock avoids duplicate passes,
server errors preserve previous state, and failed inventories are retried rather
than marked complete. The sandbox permits the private inventory and `.android`
key directories, not arbitrary home-directory writes.

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

WebScreen uses Python and browser JavaScript. Its `NativeBroker` adapter keeps
one `codex app-server` process alive, lets Codex refresh the local ChatGPT OAuth,
normalises the account quota and requests a short-lived client secret for every
Realtime WebRTC session. The browser receives only that ephemeral secret. It
never receives `~/.codex/auth.json`, provider API keys or account identifiers.

The HTTP service starts independently of provider readiness and exposes a
nonblocking health snapshot while the Native Broker recovers in the background.
HTTP reachable does not mean Realtime is ready. Each browser and Companion
session has its own ephemeral API lease, so the A1 kiosk and Android may use
Realtime at the same time; opening one never disconnects the other. A transient
lost heartbeat only expires its own lease. Transport recovery uses bounded waits
and never replays a possibly executed action.

The live context is `/home/atlas/.atlas/context/knowledge` plus private mutable
state in `/home/atlas/.atlas/context/conversation`. Tavily and ElevenLabs are
read only from `/home/atlas/.atlas/config/secrets.json`; the file must be a
regular, non-symlinked `0600` file. OAuth stays in Codex's own private store.

See [`webscreen/README.md`](webscreen/README.md) for implementation details and
[`ATLAS-CONNECTIONS.md`](context/knowledge/ATLAS-CONNECTIONS.md) for the
cross-component map, exact recovery timers, diagnosis and validation boundaries.

The current HTTP interface has privileged agent access and no browser login.
Use it only on a trusted network. Do not expose port 5000 publicly. The terminal
mode deliberately opens root locally without a password prompt; it is a
development surface. RAFAS is a separate native console, also with direct local
root access in this first development version. See `../misc/rafas/README.md`.
