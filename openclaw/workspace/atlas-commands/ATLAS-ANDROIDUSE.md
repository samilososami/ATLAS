# ATLAS Android Use

`atlas-androiduse` is the narrow Accessibility fallback for visual Android
tasks. Prefer `atlas-app control` native tools whenever Android exposes a direct
API: they are faster, deterministic and do not need screenshots or simulated
touch.

```sh
atlas-androiduse start
atlas-androiduse status
atlas-androiduse screenshot [PATH]
atlas-androiduse tree
atlas-androiduse click LABEL
atlas-androiduse tap X Y
atlas-androiduse long_press X Y [DURATION_MS]
atlas-androiduse swipe X1 Y1 X2 Y2 [DURATION_MS]
atlas-androiduse text 'text'
atlas-androiduse key BACK|HOME|RECENTS|ENTER
atlas-androiduse back
atlas-androiduse home
atlas-androiduse recents
atlas-androiduse wait [MILLISECONDS]
atlas-androiduse launch PACKAGE|URL
atlas-androiduse stop
```

The flow for one visual action is: start, screenshot, decide from the current
screen, perform one bounded action, capture again only if needed, then stop.
While active, Android shows the ATLAS control notification, blue border and
owner stop button, and blocks ordinary touches. The owner can stop at any time.
If sami's complete request is only "controla mi teléfono", run `start` once,
ignore the automatic screenshot returned by `start`, do not inspect or touch
anything else, answer only `Listo` and wait for his next instruction. This opens
a multi-turn control session: keep it active for his next instructions and stop
only when he asks, presses the red button, closes the client or the ten-minute
idle timeout expires. Do not issue another `start` while it is already active.

Opening a known app is not a visual task. Use the native operation
`atlas-app control apps.launch --params '{"app":"Galería"}' --json`; it resolves
common Spanish names and installed launcher labels without screenshots or
coordinate guessing. Coordinates remain appropriate for actions inside an app.

Screenshots and accessibility trees are current sensitive data. Current Android
builds downscale captures to at most 640 pixels wide and encode JPEG at quality
82; the wrapper also accepts legacy PNG replies, validates the declared MIME
type and saves the private file under `~/.atlas/companion/screenshots/` with the
matching extension. It prints a path and dimensions, never base64. Do not add
captures or trees to Git, durable memory or public logs. Do not capture
passwords, banking, authentication codes or private conversations unless the
owner explicitly requests that exact task.
`tree` replaces the text and description of password nodes and all descendants
with `[REDACTED]`; this is a safety boundary, not permission to inspect secret
screens.

Prefer `click LABEL` when `tree` exposes an exact visible text or content
description. It normalizes case, accents and whitespace, then clicks that node
or its clickable ancestor. Use coordinates only when no accessible label exists.
Coordinates are normalized from `0` to `1`: `(0,0)` is the top-left and `(1,1)`
the bottom-right of the physical display, independently of the smaller JPEG
dimensions. Use the current screenshot or tree to derive them; do not reuse
coordinates from another resolution. `long_press`
accepts an optional duration, `wait` is bounded, and `launch` maps a package name
to `package` or an allowed URL to `uri`. `key ENTER` invokes the focused editable
field's IME action; `back`, `home` and `recents` are shorthand global actions.

In Realtime, use typed `atlas_android` rather than invoking this wrapper through
`atlas_shell`. Successful screenshots and post-action inspections are attached
as separate `input_image` items using their declared JPEG or PNG MIME type;
base64 is stripped from the function result. The typed semantic operation is
`androiduse.click` with `{"text":"exact label"}`; the typed `androiduse.key`
operation accepts `{"key":"ENTER"}` and triggers the same safe IME action as
the CLI. The model must inspect the new image before claiming success.

Never infer that a click or tap worked: inspect the next screenshot or a
deterministic native result. A recoverable click, gesture or inspection error
does not end an otherwise healthy control session; correct it from the current
screen, or call `stop` if abandoning the task. Do not retry an action after
connection loss because it may already have executed. Call `stop` after a
bounded task and from cancellation, overall timeout, client exit, device/socket
loss, lost Accessibility control or another terminal session error; preserve
only the explicit multi-turn mode above. Stop immediately on a permission
screen, unexpected account switch, purchase, destructive confirmation or the
exact error `Error: Android device not connected`.
