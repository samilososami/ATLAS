# ATLAS WebScreen

This is the local ATLAS visual/voice web surface. Use it when sami asks about the ATLAS screen, kiosk page, wake-word web UI, or the local browser page at port `5000`.

The command is:

```bash
atlas-webscreen
```

## Commands

Start and enable across reboots:

```bash
atlas-webscreen enable
```

Stop and disable across reboots:

```bash
atlas-webscreen disable
```

Show status:

```bash
atlas-webscreen status
```

Restart the service and wait for its health check:

```bash
atlas-webscreen restart
```

## What status tells you

`atlas-webscreen status` shows:

- systemd service state
- whether it is enabled
- main PID
- local URL
- network URLs
- new face URLs (`/new/`) on localhost and the LAN
- listener
- health JSON when available

Use it when sami asks:

- "is the screen running?"
- "why can't I open atlas-a1.local:5000?"
- "is the webscreen enabled?"
- "is Realtime ready, or is only the Pi's HTTP service reachable?"

Read the health fields, not just the HTTP status: the UI can be served while
its Gateway bridge is reconnecting. A healthy backend also does not prove that
this browser owns control, has microphone permission or can play sound.

## URLs

Typical local access:

```text
http://localhost:5000
http://atlas-a1.local:5000
http://<pi-ip>:5000
```

Append `/new/` for the minimal animated face. On the physical A1 use
`atlas-screen --atlas-new`; `atlas-screen --atlas` still opens the original
debugging surface. They share the backend, voice/context and exclusive control
lease: changing the presentation is not a new model or another microphone.
The new face's settings button reveals the existing controls and tools.
Choose **Debugging Webscreen** there to open the old interface in the same tab;
the old interface offers **New Webscreen** to return. Waiting screens also
offer the link. This reloads/revalidates the page using normal access rules;
it is not an automatic takeover or seamless WebRTC handoff.
Read `/home/atlas/.atlas/webscreen/NEW_DESIGN.md` for its layout/audio source map.
The shared tools drawer also has **Doble aplauso**: five local two-clap trials
save only a private metrics profile, then a calibrated pair while waiting shows
the local `defiant` face for three seconds. It never records/uploads audio,
opens a Realtime turn or replaces the wake word. Read
`/home/atlas/.atlas/webscreen/CLAP.md` before diagnosing or modifying it.
The ready face blinks for 320 ms at randomized 13–16 second intervals.
Visual drowsiness changes only on coordinated blinks: a first pose at 50–55
seconds, a second at 75–80 seconds, and sleep at 100–105 seconds, with deeper
symmetric crescent eyes, slow breathing and larger rising/shrinking blue sleep symbols.
The wake word still works; its brief surprised pose never delays microphone capture. The new
face has no transcription or thinking text. Hidden views and reduced motion
cancel animations; there is no permanent idle JavaScript drawing loop.

If HTTPS is enabled in the current version, `status` will show HTTPS URLs.

## One screen at the wheel

Only one browser page controls you at a time, whether it lives on the physical
screen or a laptop on the LAN. Another page does not steal control automatically
while the owner is idle: the user explicitly chooses **Take control**. A page
can also hand control to the connected physical A1 kiosk. An explicit takeover
can replace an active owner; unfinished actions must not be assumed cancelled
or replayed merely because the visible page changed.

The old page releases its microphone and speech when control changes. The new
one enables its own microphone. Your persistent Realtime conversation stays
put; changing chairs is not a memory wipe. Closing a page releases its lease.
The client heartbeat interval is 1.5 seconds and the server lease is 20 seconds.
An 8-second local grace window tolerates a transient missed request, then
releases the local microphone before the backend could assign a stale lease to
someone else. Successful protected API activity also confirms the local lease,
matching the renewal already performed by server authorization. This tolerates
an isolated stalled heartbeat while other authorized requests succeed, without
extending either limit. Only the same current token/generation counts, using
the request's start time, never a late response time. Public health/static/access
reads and failed requests are not ownership evidence; expired/revoked control
or aborted requests cannot be revived by a successful old reply.
Each request has a four-second total deadline, including the JSON body. Failed
UI callbacks cannot latch the scheduler. Online/visible events prompt a bounded
retry, without parallel heartbeats or automatic takeover. A failed health check
retries after five seconds while this page owns ATLAS, then stops after recovery.

An authoritative `401` invalidates the token and stops local control before
registration; `423` revokes control immediately. Reconnection
uses bounded backoff, ignores late replies from previous pages/sessions, and
recovers a page restored from the browser's back-forward cache. These checks
prevent a delayed response from bringing a revoked microphone back to life.

`access_control.py` owns the server-side lease and `static/access.js` handles
the waiting screen, requests, heartbeat, and handoff. Control tokens stay in
memory, not in URLs or project docs. The health endpoint remains available to
status commands; control APIs require the current page token. Reload old pages
after deploying this version. This is coordination, not login security: keep
the unauthenticated HTTP service on a trusted LAN.

## Voice, follow-up and recovery

The physical kiosk has a private-pipe Chrome watchdog that checks the actual
document and recovers crashed/error tabs, preserving the selected `/` or `/new/`
presentation. See [Screen](ATLAS-SCREEN.md) for its bounded browser-only recovery
and `--atlas-hide` behavior. HTTP success alone does not prove renderer health.

The current conversation uses direct `gpt-realtime-2.1`, the shared Markdown
context and typed shell, web-search, routine, native-phone and Android Use
tools. Android screenshots are attached as reduced private JPEG `input_image`
items; visual control prefers exact accessible-label clicks, uses normalized
coordinates as fallback and keeps password-redacted trees. Recoverable visual
errors preserve the session; completion, abandonment and terminal loss require
`androiduse.stop`. Chrome validates the local ATLAS
wake word; do not describe the recognizer as a guaranteed offline speech engine.
Partial/final recognition results must not create duplicate turns. Permission
or audio-capture errors are shown as microphone errors, not repaired by sending
unverified speech to the model or enabling the archived pipeline.

After **any completed answer**, wait for a new local **ATLAS** wake word.
There is no automatic follow-up window, even after a question. A bare ATLAS
still grants time to finish that same request. On A1, playback and its short
acoustic tail are excluded from wake/input capture to avoid self-triggering.

`REALTIME_INSTRUCTIONS.md` sets concise replies for all current Realtime
surfaces: usually one or two sentences; routine successful music/device actions
need only a short acknowledgement, without unsolicited offers. Report real
failures briefly and expand when the user explicitly asks for detail.

Recovery has separate bounds: session startup 25 seconds, response-create
acknowledgement 12 seconds, and an active response with no progress 30 seconds.
A genuinely running tool is exempt from the model no-progress timer and keeps
its own bounded backend deadline. Brief WebRTC disconnects receive an 8-second
grace period. A subsequent ICE `connecting` state retains that original
deadline; only `connected` confirms recovery. Failed/closed transports recover.
An error from the current data channel while it remains `open` is logged as
`session.channel_warning`, without immediately interrupting playback. It does
not suppress transport, startup/response deadlines, a closing channel or an
authoritative provider authentication failure.

Duplicate startup/fallback failures share one reconnect timer and one status
update. Backoff is 1, 2, 4, then at most 8 seconds; it resets for the next failure
only after at least 20 seconds of stable readiness. A brief connection does
not erase repeated-failure history. Stale failures cannot disturb a ready
replacement, and leaving the ATLAS view or losing control prevents a queued
retry from reopening the microphone. Sessions are renewed after
50 minutes, deferred until idle. Expired/stale response events and harmless
cancellation races must not start a reconnect loop.

**Never automatically replay a prompt or tool after a lost acknowledgement.**
The action may already have executed. Reconnect the transport, inspect the
result when possible and let the user deliberately repeat an uncertain request.

## Diagnosis and honest latency measurements

Start with `atlas-status`, `atlas-webscreen status`, then the affected
interaction's private logs under `/home/atlas/.atlas/webscreen/logs/` and
`journalctl -u atlas-webscreen.service`. Match timestamps and request/response
IDs. Check network, page ownership, Gateway/authentication, microphone and
playback separately using [`../ATLAS-CONNECTIONS.md`](../ATLAS-CONNECTIONS.md).
A provider 500 error alone does not prove OAuth corruption.

The combined JavaScript verification passed
217 tests (204 WebScreen, 13 kiosk watchdog), including protected-traffic lease
evidence, stale/revoked replies, bounded ICE/channel recovery, duplicate retries
and idle rendering. From the
repository root: `node --test .atlas/webscreen/test_*.cjs system/test_kiosk_watchdog.cjs`.

A controlled A/B on Pi Chrome reproduced shared-memory growth from unconsumed
JSON response bodies: 40 POSTs with ignored bodies increased the renderer from
16.05 to 96.05 MiB, exactly 2 MiB per request. Forty equivalent POSTs that read
their bodies with `response.text()` kept usage flat at 96.05 MiB. The runtime
used that pattern in fire-and-forget log/event requests. The installed build
`2026-09-07-connection-4` drains acknowledgement bodies for every HTTP status,
with a four-second headers/body deadline and late-response cancellation.
Telemetry has a 64-request in-flight ceiling, no offline queue and no replay;
backend cancellation is independent of that ceiling. Eight production samples
over 5 min 15 s kept the same renderer, whose shared memory decreased from
10.058 to 0.026 MiB with zero retained 2 MiB blocks. There were 74 new-build
events since deployment (63 during sampling), 209 HTTP 200 replies and no
unexpected reconnection or Realtime error. No process was restarted during
sampling. Do not report
all physical audio microcuts resolved or indefinite connectivity from this
short observation. The isolated
no-audio fixture did not reproduce this growth with the previous blink.
Correlate physical logs and `/dev/shm` usage after the patch; see
`/home/atlas/.atlas/webscreen/NEW_DESIGN.md` for the evidence boundary.

Distinguish cold connection setup, end-of-user-speech to first model text, and
actual playback start. `output.first_delta`, `audio.playback_started` and
`tts.playback_started` expose different milestones; the external TTS event's
duration is measured from queuing that speech chunk, not the entire turn.
ElevenLabs defaults to `eleven_flash_v2_5`; its proxy forwards each available
HTTP fragment instead of waiting for a full 8 KiB read, but provider, network
and Chrome buffering still count until the `playing` event.
Text-only `atlas-chat` measures neither wake detection nor physical audibility.
The desired 1–3 seconds is a warm-turn target to measure, not a guarantee or a
reason to label a generated token as audible speech.

For Bluetooth silence/profile errors use [`ATLAS-AUDIO.md`](ATLAS-AUDIO.md).
For authorised Android control failures use [`../ADB.md`](../ADB.md). Do not
restart the whole audio stack, reset network/pairings or kill every ADB transport
as a blanket response to a WebScreen warning.

## Service boundaries

`atlas-webscreen` controls the browser-facing ATLAS web UI only.

Its project and generated WebScreen projects live in:

```text
/home/atlas/.atlas/webscreen
/home/atlas/.atlas/webscreen/workspace
```

It should not stop the OpenClaw Gateway unless a command explicitly says so. `disable` is for the webscreen service, not the full ATLAS brain.

For full Pi health, use:

```bash
atlas-status
```

## Text-only terminal companion

Use `atlas-chat` when the same ATLAS Realtime brain must be tested or used from
a terminal without microphone, audio output or browser UI. It reserves the same
`gpt-realtime-2.1` route, loads the same crucial Markdown, exposes the same
typed shell, web-search, routine, `atlas_phone` and `atlas_android` tools, and
normally shares WebScreen's persistent
conversation. `atlas-chat --ephemeral` deliberately starts without that
conversation history and does not write new turns back to it.

See [`ATLAS-CHAT.md`](ATLAS-CHAT.md) for interactive commands and `atlas-chat -p`
usage, and [`../ATLAS-CONNECTIONS.md`](../ATLAS-CONNECTIONS.md) for a repeatable
cross-component verification checklist.
