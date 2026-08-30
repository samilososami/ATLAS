# ATLAS Desktop

This is your controllable visual workspace on the Raspberry Pi. It exists so you can open windows, show content on a TV through Chromecast, look at the desktop with vision, and act on what you see.

The desktop is a lightweight virtual X11 display on `:1` at `1920x1080`. It does not run all the time. `atlas-cast start ...` starts it when needed.

Web pages and files open in official Google Chrome through `/home/atlas/.atlas/desktop/bin/open-chrome`. Its private `chrome-profile` is separate from the physical WebScreen kiosk. `atlas-desktop nuke` only closes this virtual desktop's browser, not the physical screen. Different desks, different piles of paper.

## The mental model

`atlas-desktop` controls the desktop. `atlas-cast` only sends that desktop to a receiver.

Use this loop when visual interaction matters:

1. Open the page/file/app.
2. Capture the desktop.
3. Inspect the screenshot with vision.
4. Decide the next action.
5. Click, type, press keys, scroll, or drag.
6. Capture again if the result matters.

If sami explicitly says not to verify, or says something like "just open it" / "don't check", do the direct action and stop. Do not spend extra time screenshotting unless the page fails, the action is risky, or the user asks you to continue.

## Opening content

Open a web page fullscreen:

```bash
atlas-desktop open-url https://google.com
```

Open a local file fullscreen, such as a PDF:

```bash
atlas-desktop open-file /path/to/file.pdf
```

List windows:

```bash
atlas-desktop windows
```

Show the currently focused window:

```bash
atlas-desktop active-window
```

Fullscreen active/all windows:

```bash
atlas-desktop fullscreen
atlas-desktop fullscreen all
```

Close the active window:

```bash
atlas-desktop close-window active
```

Clean everything visual to free RAM/CPU:

```bash
atlas-desktop nuke
```

## Window placement

The desktop is `1920x1080`. Prefer these commands over manual mouse dragging. They are faster, easier to repeat, and easier to recover from.

Move the active window into common layouts:

```bash
atlas-desktop tile left
atlas-desktop tile right
atlas-desktop tile top
atlas-desktop tile bottom
atlas-desktop tile top-left
atlas-desktop tile top-right
atlas-desktop tile bottom-left
atlas-desktop tile bottom-right
atlas-desktop tile center
atlas-desktop tile center-large
atlas-desktop tile full
atlas-desktop tile fullscreen
```

Quarter shortcuts:

```bash
atlas-desktop tile q1   # top-left
atlas-desktop tile q2   # top-right
atlas-desktop tile q3   # bottom-left
atlas-desktop tile q4   # bottom-right
```

Thirds and wide layouts:

```bash
atlas-desktop tile left-third
atlas-desktop tile middle-third
atlas-desktop tile right-third
atlas-desktop tile left-two-thirds
atlas-desktop tile right-two-thirds
```

Use exact geometry when the user asks for a specific position or when vision gives useful coordinates:

```bash
atlas-desktop place-window 100 80 900 600
atlas-desktop move-window 120 90
atlas-desktop resize-window 960 540
```

Use a grid for precise screen composition. Columns and rows are 1-based:

```bash
atlas-desktop grid 2 1 1 1       # left half
atlas-desktop grid 2 1 2 1       # right half
atlas-desktop grid 4 2 2 1       # column 2, row 1
atlas-desktop grid 4 2 1 1 2 1   # columns 1-2, row 1
```

If there are several windows, pass the window id from `atlas-desktop windows` as the last argument:

```bash
atlas-desktop tile right 0x00400003
atlas-desktop place-window 960 0 960 1080 0x00400003
atlas-desktop grid 4 2 3 1 1 2 0x00400003
```

Other window controls:

```bash
atlas-desktop focus-window 0x00400003
atlas-desktop raise-window
atlas-desktop minimize-window
atlas-desktop maximize-window
atlas-desktop unmaximize-window
atlas-desktop restore-window
atlas-desktop close-window active
```

## Seeing the desktop

Capture the latest screenshot:

```bash
atlas-desktop observe
```

This writes:

```text
/home/atlas/.atlas/desktop/screenshots/latest.png
```

Coordinate system:

```text
0,0 is top-left
1920,1080 is bottom-right
```

Use the screenshot with vision. If you can see the target, act on coordinates.

Example: Google opens and shows a cookie button. Capture, inspect, then click the button coordinates:

```bash
atlas-desktop observe
atlas-desktop click 1010 742
```

If you need a named screenshot:

```bash
atlas-desktop screenshot /home/atlas/.atlas/desktop/screenshots/google-cookie.png
```

## Mouse and keyboard control

Left click:

```bash
atlas-desktop click 1000 740
```

Right click:

```bash
atlas-desktop rclick 1000 740
```

Double click:

```bash
atlas-desktop dblclick 600 500
```

Move pointer:

```bash
atlas-desktop move 600 500
```

Drag:

```bash
atlas-desktop drag 400 400 900 700
```

Scroll:

```bash
atlas-desktop scroll down 5
atlas-desktop scroll up 3
```

Type text:

```bash
atlas-desktop type "OpenAtlas TDR"
```

Press keys:

```bash
atlas-desktop key ctrl+l
atlas-desktop key Return
atlas-desktop key Escape
```

Fast browser flow:

```bash
atlas-desktop address https://google.com
atlas-desktop search "OpenAtlas TDR"
atlas-desktop new-tab https://google.com
atlas-desktop close-tab
atlas-desktop next-tab
atlas-desktop prev-tab
atlas-desktop reload
atlas-desktop back
atlas-desktop forward
atlas-desktop zoom-in
atlas-desktop zoom-out
atlas-desktop zoom-reset
```

Use `address` or `search` instead of manually pressing `ctrl+l`, typing, and pressing `Return` unless you need unusual keyboard timing.

## Speed vs verification

Default behavior: verify when it matters.

Fast behavior: skip verification when the user clearly asks for it.

Examples:

- "Open Google ready to search" -> open Google; if the user expects interaction, observe and clear blockers like cookie prompts.
- "Open Google and don't verify" -> run `atlas-desktop open-url https://google.com` and stop.
- "Click accept" -> observe first if you do not know the button coordinates.
- "Search this now" -> use keyboard shortcuts directly if the active page is obvious; otherwise observe.

For destructive actions, payment screens, account changes, deletes, or permission prompts: inspect and ask before clicking unless sami explicitly gave that exact action.

## Wallpapers

Wallpapers live here:

```text
/home/atlas/.atlas/desktop/wallpapers
```

Current wallpapers:

```text
atlas_wallpaper1.png
atlas_wallpaper2.png
```

Show current wallpaper:

```bash
atlas-desktop wallpaper
```

List wallpapers:

```bash
atlas-desktop wallpaper list
```

Set one directly:

```bash
atlas-desktop wallpaper set atlas_wallpaper1
atlas-desktop wallpaper set atlas_wallpaper2
```

If sami says "change the wallpaper" and there are only these two, do not ask which one. Toggle to the other:

```bash
atlas-desktop wallpaper toggle
```

## Practical casting flow

If sami says: "ATLAS, connect to my Sony TV."

Use:

```bash
atlas-cast list
atlas-cast start "SONY KD-43X81K"
```

If sami then says: "Open Google ready to search."

Use:

```bash
atlas-desktop open-url https://google.com
atlas-desktop observe
```

If the screenshot shows a cookie prompt, click the accept button. If the page is already ready, tell sami briefly that it is ready.

Keep responses short while acting. The screen is there to show progress; do not narrate every internal step unless sami asks.
