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

Use the official `google-chrome-stable` ARM64 package. The launcher calls that binary directly; the system policy lives at `/etc/opt/chrome/policies/managed/atlas-webscreen.json`. Keep the profile private and out of the public repository. Your browser luggage is not release material.

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
