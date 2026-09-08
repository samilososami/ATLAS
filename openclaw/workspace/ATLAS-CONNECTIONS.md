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
| Calibrated double applause | `.atlas/webscreen/static/clap.js`, shared `app.js` analyser hook, `.atlas/webscreen/server.py` profile endpoint | [Double applause](../../.atlas/webscreen/CLAP.md) |
| Minimal face, waveform and mouth | `.atlas/webscreen/static/new/`, shared `app.js` / `realtime.js` hooks | [New design](../../.atlas/webscreen/NEW_DESIGN.md), `atlas-screen --atlas-new` |
| Same model without voice | `.atlas/chat/atlas_chat.py`, `.atlas/chat/TERMINAL_INSTRUCTIONS.md` | [atlas-chat](atlas-commands/ATLAS-CHAT.md), [chat runtime](../../.atlas/chat/README.md) |
| Shared conversational memory | `.atlas/webscreen/server.py`, `system/libexec/atlas-contextctl`, `atlas-commands/atlas-context` | [Context](atlas-commands/ATLAS-CONTEXT.md) |
| Physical output and Bluetooth | `atlas-commands/atlas-audio`, `system/config/wireplumber/51-atlas-headless-bluetooth.conf` | [Audio](atlas-commands/ATLAS-AUDIO.md) |
| Authorised Android transport | `system/bin/adb`, `system/libexec/atlas-adb-inventory`, `system/libexec/atlas-adb-monitor` | [ADB](ADB.md) |
| Android app and Tailscale | `.atlas/companion/`, `atlas-commands/atlas-app` | [Companion](atlas-commands/ATLAS-APP.md) |
| Android visual control | `atlas-commands/atlas-androiduse`, Companion server requests | [Android Use](atlas-commands/ATLAS-ANDROIDUSE.md) |
| Physical display and broader Pi health | `atlas-commands/atlas-screen`, `atlas-commands/atlas-status`, `atlas-commands/atlas-rafas` | [Screen](atlas-commands/ATLAS-SCREEN.md), [Status](atlas-commands/ATLAS-STATUS.md), [RAFAS](atlas-commands/ATLAS-RAFAS.md) |

The Gateway bridge supplies the configured authentication/reservation path;
Realtime handles the conversation directly with shared Markdown and explicit
tools. The archived starter/Whisper pipeline is not an automatic fallback.
`atlas-chat` shares that model/context/tool path, including typed `atlas_phone`
and `atlas_android`, but not browser ownership or microphone/playback. Visual
captures are attached to Realtime as private `input_image` items rather than
filesystem paths or base64 tool output. Companion BLE pairing, Tailscale membership, Bluetooth
speaker pairing, Accessibility and Android ADB authorisation are independent
relationships. A green VPN icon is not proof of a live Companion socket.

Double applause is also independent from the wake word: it is a local visual
gesture, not an authentication or turn trigger. The detector only receives
temporary analyser frames from the microphone already controlled by WebScreen;
its five-trial profile stores summary metrics privately and is ignored if absent
or corrupt. It runs only while the ATLAS view is waiting, so it cannot add a
second audio capture path or interfere with Realtime recovery.

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
- Renew the Realtime session after **50 min**, deferred until idle. After a
  completed answer, require a fresh local **ATLAS**. There is no automatic
  follow-up window; a bare wake word still allows completing that same request.
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
   The private-pipe kiosk watchdog probes the actual rendered DOM, recovers a
   sad-tab at the selected `/` or `/new/` URL and escalates only to Chrome with
   bounded backoff. A live browser process or an HTTP 200 alone is not readiness.
4. For wake failures, check browser microphone permission, detector state and
   duplicate partial/final events. For silence, distinguish first model text,
   browser playback start, default sink/mute and actual physical output.
5. For speaker failures, read [Audio](atlas-commands/ATLAS-AUDIO.md). Resolve the
   user's saved alias first. Known names need no scan; ambiguous names need an
   exact target. The A1 controller needs an Audio Source UUID for A2DP playback.
   Headless WirePlumber seat policy can prevent that endpoint from existing.
6. For the ATLAS app, run `atlas-app status --json`, then `tailscale ping s23u`
   only when the saved device alias resolves. Distinguish Tailscale `Running`, a
   direct/DERP path, Companion/5010 and the app's persistent encrypted socket.
   Never open 5010 publicly as a repair and never enable the legacy relay as an
   automatic fallback. Companion dispatches socket RPC concurrently so a
   waiting native tool cannot block the `app.reply` that completes it; keep
   task bounds, serialized writes and replay checks intact when debugging it.
7. For Android ADB, follow [ADB](ADB.md): `adb devices -l`, then explicit
   `adb -s SERIAL get-state` and a harmless read on the authorised target.
   `unauthorized` requires Android approval; never bypass it or kill the shared
   server as an automatic fix. Cached private records are context, not liveness.
8. For an agent-driven phone action, check `atlas_phone` first. Canonical
   methods include `location.get`, `phone.capabilities` and `phone.call`; aliases
   are only input conveniences. If visual control is necessary, use normalized
   coordinates, inspect each important result and guarantee `androiduse.stop`
   from success, error, cancellation and timeout paths. A password-redacted tree
   is not a signal to inspect the corresponding screen by another route.

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
- `sudo bash system/install-companion.sh`: Companion, Tailscale prerequisite,
  `atlas-app` and `atlas-androiduse`; read both mobile manuals before changing
  pairing, native-phone or Accessibility state.
- `sudo bash system/install-webscreen-resilience.sh`: the shared WebScreen files
  `server.py`, `access_control.py`, `gateway_bridge.mjs`, `static/access.js`,
  `static/app.js`, `static/index.html`, `static/realtime.js` and
  `static/styles.css`, `static/clap.js`, `CLAP.md`, plus the new presentation
  assets in `static/new/`.
  It also installs `atlas-screen`, the kiosk session launcher and its private-pipe
  browser watchdog. Restart `atlas-screen-kiosk.service` once to activate the
  helper; later visible-design changes can reuse the running browser.
  It backs up changed files, preserves private
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

Check a warm wake request, rejection of speech without a new ATLAS, cancellation, lost control,
transient reconnect and the requested read-only device operation. Test physical
audio only at a conservative volume without increasing the user's setting;
restore any temporary default-route changes afterwards. Do not claim untested
hardware outcomes from unit tests or text-only model replies.
