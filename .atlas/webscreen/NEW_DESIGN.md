# ATLAS face — WebScreen presentation

This is a separate presentation of the existing WebScreen, not a second voice
agent. `atlas-screen --atlas-new` selects `/new/?kiosk=1` on the physical A1.
The original `/` and `atlas-screen --atlas` remain available for debugging.
Both use the same access lease, Realtime controller, settings, tools, context,
voice output and recovery rules. Every new spoken request requires **ATLAS**.
The settings drawer links the two presentations using **Debugging Webscreen**
on `/new/` and **New Webscreen** on `/`. The same links appear on the access
waiting screen. They navigate in the same tab and host (including trusted LAN
hosts), preserving only the non-secret `kiosk`/`remote` flags. Navigation uses
the existing release/reconnect flow, not a seamless WebRTC-session transfer;
no ownership credential is stored or added to the URL.
The physical-kiosk watchdog accepts both fixed local presentation URLs. A link
change is not a crashed page; recovery follows the last healthy view. Explicit
`atlas-screen` selections retain priority, including repeated selection of the
same saved mode after a menu switch. Menu links do not change the boot policy.

## Approved visual specification

The original approved landscape reference is the minimal HUD concept, 1591 × 989.
Only the small ATLAS brand at top left, connection dot and settings control at
top right and the central face appear while ready. The first visual revision
removed “Di «Atlas» para hablar” and enlarged the `.face-character` group to
1.25×. The latest revision adds **50% relative to that 1.25× version**, giving
**1.875× the original size**, including the thinking state. The waveform,
conversation logic and measured audio response are unchanged. The separate
motion revision below updates blink cadence and adds decorative sleep.
In portrait, the canvas uses 150% width with a -25% left offset to limit clipping.
No permanent dock, transcript history, quota cards or debug labels are added.
Existing controls stay available inside the tools/settings surface.

- Background: almost-black blue, approximately `#02060d`; no decorative panels.
- Face: vivid `#00a8ff`/`#009bff`/`#008cee` with a restrained blue luminous gradient.
- No captions, thinking labels or recognized words on the face surface, in any
  conversation state. The controller still receives transcription; details and
  recovery controls stay in the drawer/debugging interface. The connection dot
  retains its accessible status rather than showing a floating error sentence.
- Base vector geometry before the current 1.875× group scale: two tall ovals,
  112 × 208 units, centered at x=639.6525/951.3475 and y=425. Positions are native
  SVG coordinates, not CSS translations, so blink scaling cannot reset spacing.
  Center spacing was reduced by 15% relative to the previous 386-unit gap,
  then by another 5% (311.695 units). The mouth was lowered another 20 screen pixels at 1024 × 600
  (total mouth translation 26.58222 SVG units). Eye sizes remain unchanged.
- The larger face occupies the center with generous negative space. Header
  touch targets remain usable even though their visible icons are small.
- Custom vector geometry and browser animation are explicitly requested:
  do not use the screenshot as a fake full-screen UI or regenerate the mascot.
- New optional controls use the same dark palette, quiet borders and blue
  accents; focus visibility and reduced-motion support are required.

## State and audio contract

`static/new/face.js` and `face.css` own geometry, layout and animation.
`static/new/audio.js` is a read-only presentation bridge. The existing
`app.js`/`realtime.js` remain the only conversation controllers.

`window.AtlasFace` exposes `update`, `transcript`, `inputLevel`, `outputLevel`,
`connection`, `speechBoundary`, `expression`, `interact` and `reset`. A visual callback must never send a prompt,
take ownership, enable a microphone, change an audio route or replay a tool.

1. Ready: the larger smiling face without an instruction label, with occasional
   soft blinks. Explicit mute/error status is not removed. Each blink
   closes/reopens in approximately 320 ms, with a fresh random 13–16 s interval.
   A sparse timer starts one CSS animation; there is no permanent idle
   animation or idle animation-frame loop. Leaving idle, hiding the page/view,
   `pagehide` and reduced-motion preference cancel the blink timers.
2. Wake accepted: face transforms into a horizontal blue waveform. It follows
   measured microphone RMS/dBFS; no words are drawn on the presentation.
3. Input ended / processing: face returns with a restrained thinking motion.
4. Actual playback: mouth opens in time with the output envelope or browser
   speech boundaries. Text generation alone is not audible speech.
5. Playback ended: return to wake-word waiting; no ten-second follow-up window.

RMS is a relative digital level, not a calibrated sound-pressure reading.
Silence must produce a quiet waveform/closed mouth, not invented audio.
Animation work is bounded, stops on hidden pages and honors reduced motion.
Unchanged connection indicators and drawing values do not rewrite the DOM.
The blink timing and visual geometry are independent of
the voice session and never trigger a reconnect.

## Semantic expressions and touchscreen caresses

The neutral face keeps the approved eye spacing, mouth position and luminous
blue palette. Twelve additional native SVG expressions are available:
`angry`, `delighted`, `surprised`, `curious`, `skeptical`, `sad`, `worried`,
`sleepy`, `wink`, `laughing`, `focused` and `shy`. The delighted face raises the
concave lower eye cutouts so they read as lifted cheeks, not tiny bottom notches.
Expression geometry and fixed-center vertical blink transforms are separate;
changing or blinking an expression must not move the eyes apart.

`defiant` is a separate, local-only acknowledgement for a calibrated double
applause: it reuses the restrained angry-eye geometry and flips only the mouth
into a subtle upward smile at the approved lower position. It is not included
in the Realtime `atlas_face` tool and cannot be selected from conversation.
`AtlasFace.clap()` accepts only the idle face, swaps it with a quick finite
transition, holds it for three seconds and cannot interrupt voice I/O. The
shared **Doble aplauso** drawer maps five pairs through the existing analyser;
the private summary-only profile and detector contract are in
[`CLAP.md`](CLAP.md).

On `/new/`, the existing Realtime controller advertises a presentation-only
`atlas_face` function when the visual bridge is available. The same
`gpt-realtime-2.1` decides whether an expression fits the conversation; there is
no keyword sentiment classifier, second model request or system command.
Praise, an interesting fact or an insult can produce an appropriate cartoon
reaction without changing the assistant's brevity, helpfulness or tone into
hostility. This is a visual character response, not a claim of felt emotions.
The debug presentation and terminal client do not require this visual tool.

The bridge calls `AtlasFace.expression({expression, source: 'model',
durationMs})`. Expressions expire (15 seconds by default, 30 seconds maximum).
Tool outputs use the normal [Realtime function-calling protocol](https://developers.openai.com/api/docs/guides/realtime-conversations).
An expression accompanying an audio/text answer must not start a second
answer. A visual-only response can continue once; repeated cosmetic calls,
invalid expression names and stale/cancelled response events cannot create a
response loop or affect a replacement turn.

`static/new/petting.js` recognizes deliberate back-and-forth strokes inside a
generous circle covering the whole face, including the top of the eyes and
cheeks. Its geometry is derived from the neutral sockets, not an animated
mouth or blink; the surrounding rectangular corners are not touch targets.
A tap, one or two swipes, small jitter, multitouch and cancelled
gestures do not qualify. A completed caress temporarily selects `delighted`
for six seconds; a still-valid model expression returns afterward. This is
entirely local: no prompt, recording, network request or speech is started.
Listening, hidden/blocked views and the settings panel are excluded. Touch
handling is limited to the face hit region, so the header/settings remain
usable. The listening waveform and actual audio playback remain authoritative.

## Motion and decorative sleep

The sleep reference was generated first with the built-in image tool, then
recreated in native SVG/CSS. It is a design reference, not a full-screen bitmap.
Deep, symmetric crescent eyelids, a small gently downturned mouth and
large blue sleep symbols on the right preserve the existing face palette and
sparse HUD.

- **Happy reaction:** brief upward movement of the eyes and smile, then a soft
  settle. The lower eye cutouts rise progressively and reverse on returning to
  neutral; blink, emotion, bounce and breathing transforms have separate owners.
- **Drowsiness:** the face does not continuously squeeze its eyes shut. A blink
  at a randomized 50–55 seconds reveals a slightly lower lid and softer smile;
  a coordinated blink at 75–80 seconds reveals a lower lid and small frown.
  Those poses remain stable between sparse 12–15 s / 10–13 s blinks.
- **Asleep:** a final coordinated blink at a randomized 100–105 seconds closes
  the eyes and begins slow breathing. Each `z` starts lower and about 170%
  larger, then travels diagonally upward while shrinking and fading. There is
  no snoring sound, microphone suspension, OS sleep or network change.
- **Wake:** an accepted wake word resets the visual idle clock. Only a fully
  asleep face shows a brief surprised pose before the waveform; an awake or
  merely drowsy face goes straight to listening. Recording, recognition and model
  processing continue immediately; the visual animation does not delay them.
  A caress can also wake the face locally without sending speech or a prompt.
- **Timing:** phase changes occur near the closed midpoint of the 320 ms blink,
  with an eight-second guard against adjacent blinks. Fast reactions use
  perceptible short transitions (roughly
  180–300 ms), not a literal 1–2 ms which is shorter than one display frame.
  Repeated idle updates, heartbeat and ambient input levels are not interaction.
- **Efficiency:** sparse deadlines handle idle progression; CSS handles slow
  breathing and sleep-symbol motion. Hidden/blocked views and reduced-motion
  preferences suppress animation. No continuous idle JavaScript drawing loop.

Research: the [Sleepy animation by Sawyer](https://lottiefiles.com/free-animation/sleepy-twV5XMs4zd)
is a reference for the conventional sleeping-emoji visual language, not a
downloaded/reused asset. The timing and geometry here are original. Motion uses
the [MDN performance guidance](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS)
to favor transforms/opacity and avoid layout work, and honors
[reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion).

All expression previews in the [browser screenshot gallery](../../docs/images/webscreen-expressions/README.md)
are captures of the implemented WebScreen renderer, not generated concept
images. The gallery describes the deterministic capture method and its limits.

### Motion revision verification · 2026-09-07

- Generated the sleep concept first with the built-in image tool, using the
  previous neutral **native WebScreen capture** as the reference. The concept
  and generation prompt remain local under `output/imagegen/sleep-2026-09-07/`;
  they are not runtime assets or the public screenshot gallery.
- Compared the concept and the native `13-asleep.png` in five respects: the
  sparse HUD/layout, near-black navy and electric-blue palette, closed curved
  eyelids, small downturned mouth, and three rising/fading sleep symbols. The
  implementation keeps the approved mouth anchor and the exact additional 5%
  reduction in eye separation, rather than copying the concept's larger change
  in eye spacing. It uses real SVG geometry/CSS, not a full-screen bitmap.
- Regenerated and inspected all thirteen model expressions, both drowsy phases
  and decorative sleep at 1591 × 989. No browser console errors in the capture
  harness.
- The complete JavaScript suite passes 309 tests, including 28 renderer tests;
  the Python WebScreen suite passes 83. Another 24 screen/installer/status tests
  verify runtime file coverage and both local/LAN presentation URLs.
  The separate kiosk watchdog passes 22 tests, including repeated CLI choices,
  both menu directions and a fast menu switch before the next watchdog poll.
- Chromium desktop (1024 × 600) and mobile/touch (390 × 844) accept repeated
  upper-face caresses and reject points outside the circular zone. Touching the
  upper face wakes a sleeping idle face; four valid passes select `delighted`.
- Browser-clock integration with the real face/audio/petting assets confirms
  that repeated healthy/idle telemetry and ambient RMS do not postpone sleep.
  Five virtual minutes asleep add no JavaScript timer callbacks or animation
  frames; only the CSS breathing and symbols continue animating.
- A real bridge wake event switches the logical state to `listening`
  synchronously. Nonzero input changes waveform geometry by the 34 ms test
  frame, before the 180 ms visual surprise ends. Silence-to-thinking and
  playback-driven mouth updates remain intact. These are deterministic bridge
  tests, **not** a physical microphone/model latency measurement.
- Same-tab classic → new → classic navigation passes on desktop and mobile,
  including the blocked-access page and preservation of `kiosk`/`remote`
  flags. The fixture recorded ten releases and ten connects, no automatic
  takeover, no credential storage, and no external requests. Live LAN HTTP
  delivery is verified separately from this mocked access-lifecycle test.
- **Installed A1:** both LAN pages return HTTP 200. Initial visual deployment
  reused Chrome after a reload. Actual X11 captures at 0.7 / 50.3 / 63.5 /
  65.9 / 72.4 seconds show neutral → drowsy → asleep → upper-face petting delight
  → neutral. The [unedited physical-display screenshots](../../docs/images/webscreen-motion/)
  describe the X11 mouse test and its limits. Realtime source and saved settings
  retained their pre-deployment SHA-256 hashes; public docs and the private
  source-map paragraph were updated with backups.
- The accompanying kiosk-watchdog update requires restarting the kiosk service
  to load the new supervisor. Live menu navigation subsequently remained on
  each selected presentation for more than two watchdog polls, without page
  recovery or an automatic return to the previous design. No launcher, saved
  audio settings or Realtime source changes were needed.
  A repeated `atlas-screen --atlas-new` after switching to debugging also
  selected the new view successfully; the watchdog did not replay user actions.

### Initial expression verification · 2026-09-07 (before motion revision)

- All thirteen real renderer states were captured at 1591 × 989 and visually
  reviewed: unchanged HUD, approved neutral proportions/spacing, blue palette,
  lifted delighted eye cutouts, expression geometry and unclipped mouths. The
  focused mouth is a filled capsule, avoiding a zero-height SVG gradient box.
- Browser tests retain real PCM/MediaStream-driven mouth opening, silence,
  playback completion, input waveform and suspended idle analyser behavior.
  The test oscillator is muted and does not claim physical speaker validation.
- The neutral 1024 × 600 screenshot is pixel-identical to the pre-expression
  baseline. All thirteen expressions were also checked at 412-pixel mobile
  width; real blink samples keep both eye pivots fixed. Idle has zero active
  animations between sparse blinks and a hidden view requests zero frames.
- Mouse and Chrome touch-event tests reject one/two swipes and accept four
  back-and-forth strokes, without a request or voice-state change. A transparent
  HTML hit region inside an SVG `foreignObject` applies `touch-action: none`
  only to the face; applying it to a bare SVG rectangle allowed Chrome to cancel
  touch input in favor of scrolling. The region is measured after the initially
  hidden access-lease view becomes available, and refreshed lazily before input;
  measuring it while hidden prevented caresses on the first kiosk load.
- Deployed to the A1 with a reversible backup, retaining its settings and the
  same Chrome process. After reload, four X11 pointer strokes over 1.927 seconds
  selected `delighted` on the actual 1024 × 600 display; screenshots confirmed
  the raised cutouts and the automatic return to neutral after expiry. This is
  real kiosk pointer verification, not a claim of testing a physical finger.
- Final automated suites pass: 277 JavaScript tests and 77 Python tests.
- Three separate ephemeral OAuth sessions used the actual `gpt-realtime-2.1`,
  the same visual tool instructions and only the harmless `atlas_face` tool.
  Praise selected `delighted` in 2.231 s; an insult selected `angry` in 3.058 s;
  unexpected happy news selected `delighted` in 1.018 s. Selection is semantic,
  not a rigid keyword-to-emotion table. These are **tool-selection latencies**,
  not time-to-first-spoken-audio measurements.
- Two provider responses combined text and a visual call; the third contained
  only the call. Unit tests cover both continuation paths. The isolated live
  probe acknowledged calls but did not request a continuation, execute shell or
  web tools, take the kiosk access lease, or persist its conversation.

Model selection, browser rendering, PCM analysis and touch recognition are
separately verified layers; they should not be described as a single physical
microphone-to-speaker end-to-end test.

## Bounded transport recovery

These safeguards apply to both the original and new presentation:

- **Authorization evidence (`static/access.js`):** a successful protected API
  request already renews the server's 20-second lease. The client now also
  counts that evidence inside its existing eight-second grace window, so an
  isolated stalled heartbeat does not discard otherwise authorized activity.
  Evidence is tied to the same token/generation and the request's start time,
  not its delayed completion. It cannot revive an expired/revoked owner or an
  aborted request. Public health/static/access reads and failed requests are
  not proof of ownership; authoritative `401`/`423` still revoke immediately.
  Access requests retain their four-second total deadline.
- **One reconnect scheduler (`static/app.js`):** duplicate fallback/startup
  errors share one timer and one reconnect-screen update. Retries back off
  through 1, 2, 4 and at most 8 seconds. A briefly ready connection does not
  reset that history; the next failure resets it only after at least 20
  seconds of stable readiness. Stale startup failures cannot disrupt a ready
  replacement, and losing control or leaving ATLAS prevents the queued retry.
- **WebRTC recovery (`static/realtime.js`):** an established peer gets eight
  seconds to recover a transient ICE disconnect without losing its admitted
  turn. Moving from `disconnected` to `connecting` keeps the original deadline;
  it does not extend it indefinitely. Only `connected` confirms recovery;
  failed/closed transport still initiates recovery.
- **Open-channel warnings:** an RTC data-channel error while that same channel
  remains open is logged as `session.channel_warning`, without immediately
  discarding playback or restarting the session. ICE, startup and response
  deadlines remain authoritative, as do provider authentication errors and
  closing/closed channels. No prompt or tool is automatically replayed.

These are tested resilience and rendering-efficiency improvements, not proof
that every physical audio microcut is resolved. The connection safeguards and
blink optimization must not be presented as the cause of the shared-memory
growth; the controlled transport comparison below identifies a different path.

### Shared-memory investigation: controlled Pi comparison

A controlled reproduction in Chrome on the Raspberry Pi isolated unconsumed
JSON response bodies from fire-and-forget POST requests. With the response body
ignored, 40 requests increased the renderer's shared-memory allocation from
**16.05 MiB to 96.05 MiB**, exactly **2 MiB per request**. Repeating 40 equivalent
requests while consuming each response with `response.text()` kept allocation
flat at **96.05 MiB**. Another 40 responses cancelled with `response.body.cancel()`
also added zero shared-memory allocation relative to that phase's baseline.

This A/B result identifies unconsumed response bodies as a reproducible cause
of the allocation growth on this Chrome setup. The corresponding runtime path
is fire-and-forget log/event POSTs that did not drain their responses. Build
`2026-09-07-connection-4` explicitly releases those bodies, including error
responses and backend cancellation acknowledgements. A four-second deadline
bounds headers and body; late replies are cancelled. At most 64 telemetry
requests may be in flight, with no offline queue and no automatic replay.
Cancellation is independent of that telemetry ceiling. Access-release and
authoritative access-rejection bodies are also explicitly discarded.

The patch is installed. Eight measurements at 45-second intervals, from
00:36:08 to 00:41:23 CEST on 2026-09-07, kept the same browser and renderer.
Renderer shared memory went from **10.058 MiB to 0.026 MiB**, with **zero
retained 2 MiB blocks in every sample**. There were 74 new-build events since
deployment (63 within the 5 min 15 s sampling window), 209 HTTP 200 responses,
no HTTP 4xx/5xx, Realtime errors, unexpected reconnects or watchdog recovery.
The two planned browser restarts before this final window were maintenance,
not spontaneous failures; no process was restarted during sampling. This does not
establish that all audible microcuts have the same cause or prove indefinite
network/session availability.

For comparison, an isolated no-audio presentation fixture did not reproduce
the growth with the earlier continuous blink. The sparse blink remains a
rendering-efficiency improvement, not the demonstrated leak fix.

## Source map

- [WebScreen runtime](README.md) and [Realtime instructions](REALTIME_INSTRUCTIONS.md).
- [Screen command](../../openclaw/workspace/atlas-commands/ATLAS-SCREEN.md).
- [Connection map](../../openclaw/workspace/ATLAS-CONNECTIONS.md).
- `server.py::render_new_design_shell`: serves the existing DOM at `/new/`
  with presentation assets. No second HTML copy or duplicate credential flow.
- `static/navigation.js`: exact drawer/waiting-screen labels and same-host
  links; preserves only the non-secret `kiosk`/`remote` flags.
- `static/new/face.js`, `face.css`, `petting.js`: native geometry, decorative
  inactivity clock, bounded motion and whole-face circular gesture handling.
- `system/libexec/atlas-screen-browser-watchdog.cjs`: private-pipe kiosk
  health/recovery; accepts either local presentation and honors explicit CLI
  selections without interpreting a deliberate menu change as a crash.

## Earlier browser verification

The browser checks and screenshots in this section predate the 1.25× face /
caption-free idle revision and its subsequent enlargement to 1.875×. They are
retained as historical evidence, not
claimed visual verification of the latest size. `test_face_idle.cjs` now checks
the new scale in normal/thinking styles, empty normal idle caption, cleared
transcript on return to idle and preserved explicit mute status. Audio-bridge
tests do not depend on the face scale or the removed instruction.

The real `AtlasScreenHandler` route at `http://127.0.0.1:5057/new/` was checked
in the Codex in-app browser with the shared controllers unmodified. The checks
covered the minimal header, settings drawer opening/closing and focus return,
unique real voice/reasoning selector elements, no horizontal overflow and no
browser error/warning logs. This local backend was intentionally incomplete;
these checks do not establish a live voice conversation.

Separate isolated checks used Chromium/Google Chrome through Playwright in
the subagent environment, where the Browser skill was unavailable. The native
reference viewport was **1591 × 989**; the same layout was also checked at
**1024 × 600** and **390 × 844** without horizontal overflow or clipped primary
controls.

Two isolated checks cover different layers:

- **DOM/presentation harness:** renders the shared document and `face.js`,
  with controlled states and equivalent drawer handlers. It verifies the
  exact idle caption, unique DOM IDs, settings open/close and Escape,
  voice/reasoning selectors, microphone control, expandable diagnostics,
  white transcription text, thinking/speaking states, return to idle and
  reduced-motion styling. This is not proof of a live backend session.
- **Audio bridge in a real browser:** a generated oscillator is routed into
  a real `MediaStream` and measured as PCM by the presentation bridge.
  Nonzero PCM opens the mouth; zero PCM closes it. Actual buffer-playback
  events, rather than response text completion, control the speaking state.
  Measured input PCM drives the waveform, silence changes it to thinking,
  and returning input restores listening without discarding the transcript.
  The test uses no microphone permission, model request or hardware speaker
  output; Chrome output is muted for the isolated test.

Both checks completed without JavaScript page errors. They establish browser
rendering and audio-envelope integration, **not physical wake detection,
spoken-word recognition, acoustic echo cancellation or speaker audibility**.
The 1024 × 600 image is a browser viewport matching the A1 screen, not a
photograph or capture of the physical Raspberry Pi display.

The one-shot blink was additionally checked in real Chromium: zero active
animations at rest, two 350 ms single-iteration eye animations during a blink,
then zero again. One hundred identical idle/status updates produced zero DOM
mutations and zero requested animation frames; hidden content produced no
frames. Screenshots were visually reviewed with unchanged face geometry and
layout. The dependency-free regressions are in `test_face_idle.cjs`; the
protected-traffic, reconnect-scheduler and ICE/channel cases are covered by
`test_access_client.cjs`, `test_reconnect_scheduler.cjs` and
`test_voice_reliability.cjs` respectively.

### Installed A1 verification — 2026-09-06

The new route and assets were installed on A1 with dated backups. Both
`atlas-webscreen.service` and `atlas-screen-kiosk.service` are active;
`atlas-screen` reports `atlas-new` as selected and visible for both the normal
user and root. The private-pipe watchdog reports a responding ATLAS document,
and the local kiosk loaded every `/new/` asset and opened its Realtime session.
The settings file hash is unchanged, including the saved Ash voice. Startup
policy remains unchanged (`atlas`); this preview does not silently become the
boot default.

[Live A1 capture](../../docs/images/webscreen-new/pi-live.png) is an unedited
1024 × 600 capture of the actual X11 display after deployment and the slightly
faster blink adjustment, before the enlargement and idle-label removal. It
shows that earlier ready face and green status indicator.
This proves the installed display state, not room-microphone recognition or
speaker audibility. Those physical voice behaviors still need a spoken test.

The integrated JavaScript verification passed **217 tests: 204 WebScreen and
13 system watchdog tests**, including response cleanup, with no model calls:

```bash
node --test .atlas/webscreen/test_*.cjs system/test_kiosk_watchdog.cjs
```

Run that command from the repository root. The preceding installed-build
verification also passed 77 WebScreen Python and 85 system Python tests:
**379 automated tests in total**.
Isolated real-Chrome watchdog checks also recovered
a deliberately crashed renderer and a failed page load without changing the
selected design or opening a debugging network port. This is not a long-term
stability guarantee.

### Earlier visual fidelity review

The approved image and browser screenshots were inspected directly. The
checks covered the eye proportions and positions, rounded smile, dark-blue
background and luminous blue palette, minimal header, caption typography,
negative space, and responsive geometry. At that point the idle copy matched
the original reference's “Di «Atlas» para hablar”; the latest revision removes
that label and enlarges only the face group. Debug content remains absent
until settings is opened.
The official ATLAS PNG/SVG assets replace the generated reference's tiny
brand lettering intentionally. The listening, thinking and speaking states
extend the approved idle design with the requested native animation.

## Rendered screenshots — previous size and idle label

These PNGs are unedited browser captures of controlled verification states,
not generated mockups or evidence of a completed live voice conversation.
The idle capture comes from the presentation harness; the other captures
come from the PCM/MediaStream browser check described above.
They retain the earlier scale and idle instruction for comparison; they do not
illustrate the latest 1.875×, caption-free ready face.

| State | Browser capture |
| --- | --- |
| Ready, 1591 × 989 | [Idle face](../../docs/images/webscreen-new/idle.png) |
| Measured input and recognized-text fixture | [Listening](../../docs/images/webscreen-new/listening.png) |
| Input silence | [Thinking](../../docs/images/webscreen-new/thinking.png) |
| Nonzero playback PCM | [Speaking](../../docs/images/webscreen-new/speaking.png) |
| A1-sized viewport, 1024 × 600 | [Small landscape screen](../../docs/images/webscreen-new/pi-1024x600.png) |

![ATLAS idle face in the browser](../../docs/images/webscreen-new/idle.png)

![ATLAS input waveform in the browser](../../docs/images/webscreen-new/listening.png)

![ATLAS thinking face in the browser](../../docs/images/webscreen-new/thinking.png)

![ATLAS speaking face in the browser](../../docs/images/webscreen-new/speaking.png)

![ATLAS at a 1024 by 600 browser viewport](../../docs/images/webscreen-new/pi-1024x600.png)
