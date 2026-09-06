# ATLAS connections — follow the fault to its layer

A visible page, a ready model and audible speakers are not the same state.
Read this map before repairing WebScreen, voice, Bluetooth or authorised Android
control. Start with evidence; keep private addresses, device notes, pairings and
credentials out of public documentation and diagnostic summaries.

## Source and manual map

Source paths below are relative to the repository. Live voice files are under
`/home/atlas/.atlas/webscreen`; workspace manuals are under
`/home/atlas/.openclaw/workspace`.

| Layer | Public implementation | Operational manual |
| --- | --- | --- |
| HTTP service and provider readiness | `.atlas/webscreen/server.py`, `.atlas/webscreen/gateway_bridge.mjs`, `system/systemd/atlas-webscreen.service` | [WebScreen](atlas-commands/ATLAS-WEBSCREEN.md), [runtime source guide](../../.atlas/webscreen/README.md) |
| One active browser | `.atlas/webscreen/access_control.py`, `.atlas/webscreen/static/access.js` | [WebScreen ownership](atlas-commands/ATLAS-WEBSCREEN.md#one-screen-at-the-wheel) |
| Wake, turns, playback and recovery | `.atlas/webscreen/static/app.js`, `.atlas/webscreen/static/realtime.js`, `.atlas/webscreen/REALTIME_INSTRUCTIONS.md` | [WebScreen voice](atlas-commands/ATLAS-WEBSCREEN.md#voice-follow-up-and-recovery) |
| Same model without voice | `.atlas/chat/atlas_chat.py`, `.atlas/chat/TERMINAL_INSTRUCTIONS.md` | [atlas-chat](atlas-commands/ATLAS-CHAT.md), [chat runtime](../../.atlas/chat/README.md) |
| Shared conversational memory | `.atlas/webscreen/server.py`, `system/libexec/atlas-contextctl`, `atlas-commands/atlas-context` | [Context](atlas-commands/ATLAS-CONTEXT.md) |
| Physical output and Bluetooth | `atlas-commands/atlas-audio`, `system/config/wireplumber/51-atlas-headless-bluetooth.conf` | [Audio](atlas-commands/ATLAS-AUDIO.md) |
| Authorised Android transport | `system/bin/adb`, `system/libexec/atlas-adb-inventory`, `system/libexec/atlas-adb-monitor` | [ADB](ADB.md) |
| Android app and relay | `.atlas/companion/`, `atlas-commands/atlas-app` | [Companion](atlas-commands/ATLAS-APP.md) |
| Physical display and broader Pi health | `atlas-commands/atlas-screen`, `atlas-commands/atlas-status`, `atlas-commands/atlas-rafas` | [Screen](atlas-commands/ATLAS-SCREEN.md), [Status](atlas-commands/ATLAS-STATUS.md), [RAFAS](atlas-commands/ATLAS-RAFAS.md) |

The Gateway bridge supplies the configured authentication/reservation path;
Realtime handles the conversation directly with shared Markdown and explicit
tools. The archived starter/Whisper pipeline is not an automatic fallback.
`atlas-chat` shares that model/context/tool path but not browser ownership or
microphone/playback. Companion pairing, Bluetooth speaker pairing and Android
ADB authorisation are three independent relationships.

## Connection and turn contract

- Browser ownership changes by explicit takeover or transfer to the live A1
  kiosk, not idle-page stealing. Heartbeats run every **1.5 s**, server leases
  expire after **20 s**, and the local owner tolerates up to **8 s** without a
  successful reply before suspending. A 401 renews the expired token; revoked
  ownership stops local interaction. Late replies cannot revive old ownership.
  Each heartbeat has a **4 s total deadline**, including its JSON body; a stuck
  transport or UI callback cannot permanently stop the scheduler. Returning
  online/visible retries promptly without overlapping requests or taking control.
- The HTTP server remains available while Gateway recovery runs in the
  background. `/api/health` is a snapshot, not a blocking reconnect operation;
  inspect its readiness fields separately from an HTTP 200 response.
- Realtime has **25 s startup**, **12 s response acknowledgement**, and **30 s
  no-progress** bounds. Running tools use their own deadline and are exempt from
  the model no-progress timer. Brief WebRTC disconnections have **8 s** grace.
- Renew the Realtime session after **50 min**, deferred until idle. A completed
  answer opens **10 s** of follow-up without another wake word once playback
  settles; both statements and questions qualify.
- Reconnection restores transport, **not permission to replay an action**.
  A timeout or missing response does not prove the command failed to execute.
  Check the requested result, report uncertainty and require a deliberate new
  request when replay could duplicate an action.

The control lease is coordination, not user authentication. Keep the HTTP
service on the trusted local network; do not expose its privileged port directly
to the Internet or put lease tokens in URLs, logs or public files.

## Diagnostic order

1. Run `atlas-status`, `atlas-webscreen status` and, for the app, `atlas-app`.
   Record which layer is unavailable; avoid labelling every failure “Pi offline”.
2. Match the incident's timestamp in WebScreen's private interaction/client logs
   and `journalctl -u atlas-webscreen.service`. Journal retention may cover only
   the current boot: missing older logs are not evidence that nothing failed.
3. For local connectivity, distinguish HTTP access, browser ownership and Gateway
   readiness. For provider errors, retain the error category/request ID without
   printing credentials. A server 500 alone is not evidence of corrupt OAuth.
   If HTTP replies are fast but the physical kiosk times out, inspect
   `journalctl -u atlas-screen-kiosk.service`, Chrome CPU and `df -h /dev/shm`.
   Repeated GPU allocation failures can stall the browser without losing Wi-Fi.
4. For wake failures, check browser microphone permission, detector state and
   duplicate partial/final events. For silence, distinguish first model text,
   browser playback start, default sink/mute and actual physical output.
5. For speaker failures, read [Audio](atlas-commands/ATLAS-AUDIO.md). Resolve the
   user's saved alias first. Known names need no scan; ambiguous names need an
   exact target. The A1 controller needs an Audio Source UUID for A2DP playback.
   Headless WirePlumber seat policy can prevent that endpoint from existing.
6. For Android, follow [ADB](ADB.md): `adb devices -l`, then explicit
   `adb -s SERIAL get-state` and a harmless read on the authorised target.
   `unauthorized` requires Android approval; never bypass it or kill the shared
   server as an automatic fix. Cached private records are context, not liveness.

Do not reset Wi-Fi, remove Bluetooth pairings, disconnect unrelated devices or
restart BlueZ/PipeWire/the browser together to “see if it helps”. Prefer the
smallest repair supported by the observed fault and verify its result.

## Focused installation and rollback

- `sudo bash system/install-chat.sh`: terminal client and its instruction/docs
  layer, sharing WebScreen's Python environment.
- `sudo bash system/install-device-connections.sh`: audio/ADB wrappers, inventory
  helpers, monitor sandbox and per-user headless WirePlumber fragment. It backs
  up affected files, preserves keys/records, and performs **no** BlueZ, PipeWire,
  browser or ADB restart. Its optional `--restart-audio-manager` applies the
  fragment with one WirePlumber restart during maintenance, not mid-turn.
- `sudo bash system/install-companion.sh`: companion service; read its
  [manual](atlas-commands/ATLAS-APP.md) before changing pairing/relay state.
- `sudo bash system/install-webscreen-resilience.sh`: the eight WebScreen files
  `server.py`, `access_control.py`, `gateway_bridge.mjs`, `static/access.js`,
  `static/app.js`, `static/index.html`, `static/realtime.js` and
  `static/styles.css`. It backs up those exact files, preserves private
  configuration/OAuth/context and does not restart anything by default.
  `--restart` restarts only `atlas-webscreen.service`; reload browser tabs after
  deployment. See the [runtime guide](../../.atlas/webscreen/README.md).

Review dated backups under `/home/atlas/.atlas/backups/` before rollback. Restore
only files changed by the relevant deployment, preserving newer private edits;
reapply/restart only the component whose configuration actually changed.

## Verification and latency

Use a warm session for end-of-speech → first model output and end-of-speech →
playback measurements; record cold startup separately. `output.first_delta` is
text, `audio.playback_started` is a WebRTC output-buffer event, and
`tts.playback_started` is the external speech playback callback. The external
TTS duration measures queue-to-play for that chunk, so do not compare it directly
with whole-turn latency. Neither callback alone proves a person heard sound.

The **1–3 s** first-spoken-response goal is a measured target, not a guarantee.
Keep sample count, selected output mode, cold/warm status and limitations with
results. Use `atlas-chat --ephemeral -p "..."` for isolated logical/read-only
tests; it does not validate wake detection, speech synthesis or room acoustics.

Check a warm wake request, a follow-up without ATLAS, cancellation, lost control,
transient reconnect and the requested read-only device operation. Test physical
audio only at a conservative volume without increasing the user's setting;
restore any temporary default-route changes afterwards. Do not claim untested
hardware outcomes from unit tests or text-only model replies.
