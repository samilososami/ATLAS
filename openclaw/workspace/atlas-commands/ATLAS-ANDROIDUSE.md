# ATLAS Android Use

`atlas-androiduse` is the narrow Accessibility fallback for visual Android
tasks. Prefer `atlas-app control` native tools whenever Android exposes a direct
API: they are faster, deterministic and do not need screenshots or simulated
touch.

```sh
atlas-androiduse start
atlas-androiduse status
atlas-androiduse screenshot [PATH]
atlas-androiduse tap X Y
atlas-androiduse swipe X1 Y1 X2 Y2 [DURATION_MS]
atlas-androiduse text 'text'
atlas-androiduse key BACK|HOME|RECENTS|ENTER
atlas-androiduse launch PACKAGE_OR_URL
atlas-androiduse stop
```

The flow for one visual action is: start, screenshot, decide from the current
screen, perform one bounded action, capture again only if needed, then stop.
While active, Android shows the ATLAS control notification, blue border and
owner stop button, and blocks ordinary touches. The owner can stop at any time.

Screenshots are current sensitive data. The wrapper validates PNG and saves it
privately under `~/.atlas/companion/screenshots/`; never add it to Git, durable
memory or public logs. Do not capture passwords, banking, authentication codes
or private conversations unless the owner explicitly requests that exact task.

Coordinates use physical display pixels. Never infer that a tap worked: inspect
the next screenshot or a deterministic native result. Do not retry an action
after connection loss because it may already have executed. Stop immediately
on a permission screen, unexpected account switch, purchase, destructive
confirmation or the exact error `Error: Android device not connected`.
