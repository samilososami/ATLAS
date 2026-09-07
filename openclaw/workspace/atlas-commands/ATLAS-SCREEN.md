# ATLAS Screen

This is your physical display switch for the SunFounder TS7 Pro attached to ATLAS A1. Use it when sami asks you to wake the local screen, put it back to sleep, or choose what should appear when it wakes.

## Status

Run the command without arguments:

```bash
atlas-screen
```

It reports:

- whether the physical display is on or off
- the selected mode for the next `on`
- the surface currently using the display
- the boot policy: off, a fixed mode, or the last selected mode

Automatic startup is an explicit decision, not a sunrise you invent for yourself.
Use `enable` or `disable` to change it; ordinary power and mode changes leave it alone.

## Automatic startup

```bash
atlas-screen enable --atlas
atlas-screen enable --atlas-new
atlas-screen enable --desktop
atlas-screen enable --terminal
atlas-screen enable --rafas
atlas-screen enable --last
atlas-screen disable
```

A named mode fixes the next boots to that mode. `--last` instead follows
whichever mode was most recently selected before shutdown; `off` does not erase
that selection. `enable` without a mode reuses the saved boot choice, or `last`
if none exists. These commands only configure startup, without interrupting the
current screen. To change the screen now, use a mode flag directly.

The separate files `/home/atlas/.atlas/screen/mode` and `boot-mode` hold
the runtime selection and startup choice. `atlas-screen-boot-on.service` opens
the configured surface after Plymouth; `disable` enables the existing
`atlas-screen-boot-off.service` instead. Do not enable the four surface services
independently. There is one steering wheel, not four drivers.

## Power

Wake the screen in the selected mode:

```bash
atlas-screen on
```

Put it back to sleep and release the RAM used by its visible surface:

```bash
atlas-screen off
```

`off` stops all four physical surfaces, blanks the framebuffer, and forces HDMI-A-1 into DRM Off. It does not stop OpenClaw Gateway, WebScreen's server, or the separate virtual desktop.

## ATLAS mode

```bash
atlas-screen --atlas
```

This opens `http://localhost:5000/?kiosk=1` in fullscreen Google Chrome on the physical screen. No desktop is hiding underneath. Google Chrome runs as `sami`, with its sandbox enabled and its own private profile under `/home/atlas/.atlas/screen/chrome-profile`.

For the minimal final-style face instead of the debug interface:

```bash
atlas-screen --atlas-new
```

This selects `http://localhost:5000/new/?kiosk=1`. `--atlas` keeps the existing
debug design. Both share the same backend, Realtime controller, microphone,
tools, context, ownership and wake behaviour; this is not a second brain.
The visible choice is saved in `/home/atlas/.atlas/screen/web-design`. Switching
between the two navigates the same kiosk tab within the next five-second check;
it does not restart X11 or the audio services. Navigation starts a fresh browser
voice session, so do not switch designs midway through a requested action.
`--atlas-hide` preserves the current design behind its black cover, including
after browser recovery or a hidden-mode boot. Returning with `--atlas-new`
shows the new design; returning with `--atlas` deliberately selects debug.

The drawers also offer **Debugging Webscreen** / **New Webscreen** links.
They switch the same tab immediately, including on LAN clients, and use normal
lease release/reconnect. In the physical kiosk, the watchdog accepts both fixed
local presentation URLs and remembers the last healthy view for recovery.
Menu navigation does not change the persisted boot/mode preference. An explicit
`atlas-screen --atlas` or `--atlas-new` selection still takes priority, even when
the same command is repeated after switching with a link. Re-selecting the
already healthy view does not reload its microphone/session.

The kiosk uses software compositing (`--disable-gpu --disable-gpu-compositing`)
instead of forcing GLES. This contains the observed renderer shared-buffer
exhaustion/`TransferBuffer::Initialize` loop; it does not disable WebRTC or audio.
If a healthy HTTP backend appears offline on the physical page, check the kiosk
journal, Chrome CPU and `/dev/shm` usage too. Deleted-but-open Chrome buffers
are released by stopping that kiosk, not by deleting unrelated shared files.

The Node.js helper `/usr/local/libexec/atlas-screen-browser-watchdog.cjs` checks
the actual page's JavaScript and DOM every five seconds via Chrome's private
inherited DevTools pipes. No debug TCP port is opened. A surviving window,
HTTP 200 or Chrome process is not enough: a crashed renderer can display
`Aw, Snap!` while all three remain alive. Two failed probes trigger a bounded
navigation of only the dedicated kiosk tab, with a 30-second startup/reload
grace period. If that cannot recover it, the helper restarts only that Chrome
instance; repeated browser deaths back off, with a minute cooldown after three
within five minutes. It never repeats a user request or tool command.

The `ready` marker is written only after a successful renderer probe and is
removed when the document fails. The watchdog runs as `sami`, keeps Chrome's
sandbox and private profile, and leaves X11, Gateway, Bluetooth, audio and the
independent black overlay in place during browser-only recovery. Look for
`[atlas-kiosk-watchdog]` in `journalctl -u atlas-screen-kiosk.service`.
Install Node.js on a fresh image (`apt install nodejs`); the scoped installer
`system/install-webscreen-resilience.sh` installs this helper and both launch
commands alongside the public static assets, with backups. A one-time kiosk
restart is needed when upgrading the running launcher/watchdog.

To keep ATLAS listening and speaking while hiding the physical image, use:

```bash
atlas-screen --atlas-hide
```

This keeps the HDMI link, the existing Chrome and Realtime session, microphone
and TS7 Pro speakers active. The panel remains powered because its built-in
amplifier turns off with it; ATLAS instead covers Chrome with an opaque
fullscreen black surface while leaving the monitor's own brightness unchanged.
`atlas-screen --atlas` removes the cover without restarting Chrome. Use
`atlas-screen off` only when both the kiosk and its HDMI audio may stop.

The black surface uses `python3-tk` and `xdotool`; install them on a fresh image
with `apt install python3-tk xdotool`. `ddcutil` is optional and is used only to
wake a panel left in DDC standby by an older ATLAS installation.

Use the official `google-chrome-stable` ARM64 package. The launcher invokes that binary through the private-pipe watchdog; the system policy lives at `/etc/opt/chrome/policies/managed/atlas-webscreen.json`. Keep the profile private and out of the public repository. Your browser luggage is not release material.

A mode on its own switches immediately and wakes the display if needed.
Mode and power can still be combined in either order: `--desktop on`,
`on --terminal`, or `--atlas off` to select ATLAS and leave the screen off.
Use plain `on` and `off`; `--on` and `--off` are no longer accepted.
Conflicting options are rejected before anything changes.

The cursor is hidden for touch-only use. Connecting a USB or Bluetooth mouse makes it visible; unplugging the mouse hides it again. A wireless receiver that advertises a mouse counts as a connected mouse, even if its companion is asleep.

Audio uses the user's PulseAudio default output and input. If the only output is a dummy sink, the launcher retries HDMI-A-1; it does not override an existing real output such as Bluetooth. Attach a USB microphone before enabling listening. Microphone permission is granted only to the local WebScreen origin. Native Speech Recognition still depends on the installed Google Chrome build and its service access; localhost alone does not guarantee that part works.

`/usr/local/libexec/atlas-screen-audio-ready` performs that bounded startup repair.
It can recreate a missing HDMI card after a screen-off boot, without restarting
PulseAudio or the USB microphone. It leaves your chosen real output, volume and
mute settings alone. The helper works as your normal user or through root.

Browser TTS uses Speech Dispatcher with the installed eSpeak NG voices on this Linux build. It is free and local, but does not sound like Chrome's voices on every other operating system. ElevenLabs remains available in the existing voice selector. The required system packages are `speech-dispatcher` and `speech-dispatcher-espeak-ng`; Google Chrome is launched with `--enable-speech-dispatcher`.

`atlas-screen-kiosk.service` manages the physical session. `off` releases its browser, window manager and X server. The backend and LAN URL remain available. The kiosk has no desktop shortcuts, blocks common page escape shortcuts, and disables X virtual-terminal switching only in this mode. It is a presentation guard, not an authentication system or a physical-security boundary. SSH remains the recovery route.

## RAFAS recovery mode

`atlas-screen --rafas` opens the native monochrome recovery console on `tty8`.
It does not need a graphical session. Hold Ctrl and tap W, O, W on a USB keyboard
to open it from any display mode, including off. See `ATLAS-RAFAS.md` for the
service model and the deliberate local-root access without a password.

The graphical terminal's touch keyboard is now ATLAS TOUCH TYPE; its helpers
are `/usr/local/libexec/atlas-touch-type.py` and `atlas-touch-type-session`.

## Desktop mode

Select the lightweight LXDE desktop:

```bash
atlas-screen --desktop
```

This starts LightDM and LXDE on the physical X11 display `:0` at `1024x600`. The ATLAS wallpaper comes from the shared desktop wallpaper directory.

## Terminal mode

Select the local recovery terminal:

```bash
atlas-screen --terminal
```

This opens a single fullscreen LXTerminal on the physical X11 display `:0`. There is no panel, wallpaper, or desktop underneath it: just the recovery shell and its sharp little teeth.

The terminal provides:

- root privileges
- `/home/atlas` as the working directory
- an interactive Zsh environment with root's normal command paths
- the familiar `root@atlas-a1:/home/atlas#` prompt in color
- completion, syntax highlighting, autosuggestions, history, and aliases
- `clear` and `Ctrl + L`
- a large sixteen-point font by default
- `Ctrl +`, `Ctrl -`, and `Ctrl 0` to increase, decrease, or reset text size
- a dark ATLAS on-screen keyboard after a short stationary double tap or double left click
- function keys, `Ctrl`, `Alt`, `Shift`, `Caps`, arrows, and the usual terminal essentials

Dragging across the terminal never summons the keyboard, and one isolated tap is just a normal click. When the keyboard opens, the terminal shrinks to its upper edge so output and the prompt stay visible instead of hiding behind it. A single tap in the terminal area or the close button dismisses the keyboard and restores the terminal to the full display. The keyboard listener watches from the side instead of stealing events like a tiny digital pickpocket.

Use a two-finger vertical gesture over the terminal to scroll its history. Drag both fingers down to reveal older output and up to return toward the latest lines. Two-finger gestures are never interpreted as keyboard taps, and any transient text selection is cleared when both fingers are lifted.

This is intentionally powerful. It is a physical recovery surface, not a remote chat toy. Do not expose it over the network or start it casually in a shared room.

## Boundaries

`atlas-screen` controls the real SunFounder display.

`atlas-desktop` controls the separate virtual desktop on X11 display `:1` for screenshots, browser automation, and casting. The two names are close because they are family, not because they are interchangeable.
