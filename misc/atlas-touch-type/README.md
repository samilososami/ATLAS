# ATLAS TOUCH TYPE

Your small touchscreen keyboard for the ATLAS root terminal. Dark keys, function
keys and sticky modifiers, with Enter under Backspace. No pointer sits on top
of the letters while you tap.

- Double-tap the terminal to open it; a single tap closes it.
- Opening reserves the bottom of the screen instead of covering the prompt.
- Closing restores the full terminal height.
- Ctrl plus/minus changes font size, not window size. Ctrl zero resets the font.
  An EWMH dock reserves the keyboard's exact height while the terminal remains maximized.
- Two-finger scrolling walks through terminal history without selecting text.

This is the existing keyboard with its new name, not a second implementation.
It is tailored to the reference 1024 by 600 X11 terminal. The native RAFAS console
uses a physical keyboard and deliberately does not load Tk, X11 or this keyboard.

## Files and installation

- `atlas-touch-type.py` -> `/usr/local/libexec/atlas-touch-type.py`
- `atlas-touch-type-session` -> `/usr/local/libexec/atlas-touch-type-session`
- `../../system/libexec/atlas-screen-terminal` launches the gesture controller.

Install all three helpers with mode `0755`, owned by root. Dependencies: Python 3,
Tkinter, python3-evdev, Xorg/XInput, xprop, xdotool and wmctrl. The controller is started
automatically by `atlas-screen --terminal --on`, from either the normal user or
root through the existing screen command. This root terminal is a local
development tool, not an authenticated recovery screen.
