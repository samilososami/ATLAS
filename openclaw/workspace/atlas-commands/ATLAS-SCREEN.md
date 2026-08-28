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
- the fixed boot default, which is always off

The screen stays off after every reboot. Waking it is an explicit decision, not a sunrise it invents for itself.

## Power

Wake the screen in the selected mode:

```bash
atlas-screen on
```

Put it back to sleep and release the RAM used by its visible surface:

```bash
atlas-screen off
```

`off` stops both possible physical surfaces, blanks the framebuffer, and forces HDMI-A-1 into DRM Off. It does not stop OpenClaw Gateway, WebScreen's server, or the separate virtual desktop.

## Desktop mode

Select the lightweight LXDE desktop:

```bash
atlas-screen --desktop
atlas-screen on
```

This starts LightDM and LXDE on the physical X11 display `:0` at `1024x600`. The ATLAS wallpaper comes from the shared desktop wallpaper directory.

## Terminal mode

Select the local recovery terminal:

```bash
atlas-screen --terminal
atlas-screen on
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
