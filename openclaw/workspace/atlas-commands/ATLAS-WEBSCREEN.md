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

## Boundaries

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
