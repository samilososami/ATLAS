# ENVIRONMENT.md - Where ATLAS Lives

Documenta aquí el entorno físico y de software de la instalación.

## Hardware

- Device:
- RAM:
- Display:
- Audio:
- Microphone:

## Operating System

- Distribution:
- Architecture:
- Hostname:

## Services

- OpenClaw Gateway:
- ATLAS WebScreen:
- ATLAS Desktop:
- Tailscale / ATLAS Companion:
- STT:
- TTS:

No incluyas credenciales, direcciones privadas innecesarias ni secretos.

## Runtime relationships

This is a public template, not a live hardware inventory. Fill the fields above
only in the private installation and verify current state before reporting it.

The current ATLAS interfaces are documented in
[`ATLAS-CONNECTIONS.md`](ATLAS-CONNECTIONS.md). WebScreen's Python HTTP service,
Gateway bridge, browser control lease, Realtime session and physical audio
route have separate readiness states. `atlas-chat` shares the model, Markdown
context and tools without using the microphone or speaker pipeline.

On the A1 headless/kiosk setup, the normal audio user must retain WirePlumber
Bluetooth endpoints even without an active graphical logind seat. The focused
configuration and installer are covered by
[`ATLAS-AUDIO.md`](atlas-commands/ATLAS-AUDIO.md). Do not substitute a global
Bluetooth/PipeWire restart for that configuration. Screen-hidden mode must keep
the voice session and audio path alive; see
[`ATLAS-SCREEN.md`](atlas-commands/ATLAS-SCREEN.md).

ADB uses the same authorised identity for normal and root entry points; the
inventory timer is not a second agent and never automatically connects stale
records. See [`ADB.md`](ADB.md) before testing a device.

The Android app uses a persistent encrypted Companion WebSocket through the
owner's tailnet. Tailscale `Running`, Companion active and a live app socket are
separate states. Native phone tools live behind `atlas-app control`; only use
`atlas-androiduse` when a task truly requires visual Accessibility control.
WebScreen and `atlas-chat` expose those paths as typed `atlas_phone` and
`atlas_android` tools; screenshots are reduced private JPEG `input_image` items.
The app endpoint is the A1's tailnet-only `100.x` address. Same-LAN peers prefer
Tailscale's direct P2P route; encrypted DERP remains a valid fallback, and
neither state ever selects the legacy relay automatically.
Companion must keep reading concurrent RPC while a native request waits for the
phone's `app.reply`.
