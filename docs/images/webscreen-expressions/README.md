# ATLAS · implemented facial expressions

These PNGs are **screenshots of the actual WebScreen SVG/CSS renderer** in
Chromium at **1591 × 989**, not the image-generated concept art. Each expression
was selected internally with `AtlasFace.expression(...)` after loading the real
presentation assets. The approved neutral sizing, spacing, palette and HUD are
shared by every expression. The delighted eyes use the revised, higher cutouts.

The capture fixture sets idle state and a green connection indicator locally;
these gallery shots demonstrate appearance, not a live Internet connection,
model response, microphone or physical speaker test. No voice session is opened
and no user conversation is included in the published images.

| Expression | Expression |
| --- | --- |
| Neutral ![Neutral](00-neutral.png) | Angry ![Angry](01-angry.png) |
| Delighted ![Delighted](02-delighted.png) | Surprised ![Surprised](03-surprised.png) |
| Curious ![Curious](04-curious.png) | Skeptical ![Skeptical](05-skeptical.png) |
| Sad ![Sad](06-sad.png) | Worried ![Worried](07-worried.png) |
| Sleepy ![Sleepy](08-sleepy.png) | Wink ![Wink](09-wink.png) |
| Laughing ![Laughing](10-laughing.png) | Focused ![Focused](11-focused.png) |
| Shy ![Shy](12-shy.png) | |

## Reproduce the screenshots

With Node.js and Playwright available, run from the repository root:

```sh
node .atlas/webscreen/capture_face_expressions.cjs
```

Set `ATLAS_CHROME` to a local Chrome executable if not using Playwright's
bundled Chromium; `NODE_PATH` may point to an already-installed Playwright.
The fixture binds an ephemeral **loopback-only** port, serves the production
presentation files, captures all thirteen expressions and closes the browser.
`--serve` leaves the isolated presentation preview on `127.0.0.1:5059` for visual
inspection. Neither mode changes the real A1 kiosk or bypasses its access lease.

See the [design, interaction and verification contract](../../../.atlas/webscreen/NEW_DESIGN.md#semantic-expressions-and-touchscreen-caresses)
for semantic model selection, bounded expression lifetimes and local petting.
