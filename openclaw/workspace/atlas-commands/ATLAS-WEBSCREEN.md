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
- "does whisper/openclaw/tts look ready from the webscreen?"

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
screen or a laptop on the LAN. Other pages can request access every ten seconds.
The current page may delegate only from your idle ATLAS view, never halfway
through listening, speaking, a follow-up window, or backend work.

The old page releases its microphone and speech when control changes. The new
one enables its own microphone. Your OpenClaw conversation stays put; changing
chairs is not a memory wipe. Closing a page releases its lease. A missing page
expires after twenty seconds, but unfinished work is allowed to settle before
the next page gets the wheel.

`access_control.py` owns the server-side lease and `static/access.js` handles
the waiting screen, requests, heartbeat, and handoff. Control tokens stay in
memory, not in URLs or project docs. The health endpoint remains available to
status commands; control APIs require the current page token. Reload old pages
after deploying this version. This is coordination, not login security: keep
the unauthenticated HTTP service on a trusted LAN.

## Service boundaries

`atlas-webscreen` controls the browser-facing ATLAS web UI only.

Its project and generated WebScreen projects live in:

```text
/home/atlas/.atlas/atlas-webscreen
/home/atlas/.atlas/atlas-webscreen-workspace
```

It should not stop the OpenClaw Gateway unless a command explicitly says so. `disable` is for the webscreen service, not the full ATLAS brain.

For full Pi health, use:

```bash
atlas-status
```
