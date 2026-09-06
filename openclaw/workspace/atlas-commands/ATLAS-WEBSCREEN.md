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
someone else. Authenticated activity also refreshes the server lease.

An expired token is renewed; a revoked owner stops immediately. Reconnection
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

The current conversation uses direct `gpt-realtime-2.1`, the shared Markdown
context and direct shell/web-search tools. Chrome validates the local ATLAS
wake word; do not describe the recognizer as a guaranteed offline speech engine.
Partial/final recognition results must not create duplicate turns. Permission
or audio-capture errors are shown as microphone errors, not repaired by sending
unverified speech to the model or enabling the archived pipeline.

After **any completed answer**, a 10-second follow-up window lets the user
continue without repeating ATLAS. It begins after playback has settled, not
just when text generation ends, and does not depend on a question mark in the
answer. On A1, playback and its short acoustic tail are excluded from wake/input
capture to avoid the assistant triggering itself.

Recovery has separate bounds: session startup 25 seconds, response-create
acknowledgement 12 seconds, and an active response with no progress 30 seconds.
A genuinely running tool is exempt from the model no-progress timer and keeps
its own bounded backend deadline. Brief WebRTC disconnects receive an 8-second
grace period; failed/closed transports recover. Sessions are renewed after
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

Distinguish cold connection setup, end-of-user-speech to first model text, and
actual playback start. `output.first_delta`, `audio.playback_started` and
`tts.playback_started` expose different milestones; the external TTS event's
duration is measured from queuing that speech chunk, not the entire turn.
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
shell and web-search tools, and normally shares WebScreen's persistent
conversation. `atlas-chat --ephemeral` deliberately starts without that
conversation history and does not write new turns back to it.

See [`ATLAS-CHAT.md`](ATLAS-CHAT.md) for interactive commands and `atlas-chat -p`
usage, and [`../ATLAS-CONNECTIONS.md`](../ATLAS-CONNECTIONS.md) for a repeatable
cross-component verification checklist.
