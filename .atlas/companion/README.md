# ATLAS Companion · Android preview

Companion is the private bridge between ATLAS A1 and the owner's Android app.
It is independent from WebScreen, keeps Realtime credentials on the Pi and
provides encrypted RPC, an actual resumable PTY, health/usage data and phone
tools. It runs as the A1 account; that account may have sudo. A pairing key is
therefore an administration credential, not a shareable invitation.

## Install and join the tailnet

```sh
sudo bash system/install-companion.sh
sudo tailscale up --hostname=atlas-a1 --operator=sami
atlas-app tailscale
atlas-app pair
```

Install Tailscale on the phone and sign it into the same private tailnet before
pairing. No router port, public domain, VPS or Cloudflare Worker is required.
For an always-on A1, disable key expiry for this machine in the Tailscale admin
console or use a suitable tagged auth key. Do not publish the tailnet name,
pairing payload, certificate pin or AES key.

`atlas-app pair` advertises **ATLAS A1** over BLE for 120 seconds and displays a
six-digit `XXX-XXX` code. After the app submits the code, BLE returns a compact,
single-GATT-value version-2 `atlas2:` payload containing:

- `endpoint`: persistent `wss://100.x.y.z:5010/app` tailnet transport;
- `pin`: SHA-256 pin for A1's self-signed TLS certificate;
- `key`: random AES-256-GCM pairing key.

Duplicate endpoint, relay and room fields are intentionally excluded. This
keeps the encoded bootstrap below the BLE MTU so Android cannot receive a
truncated Base64 credential.

The Android app stores its secret in Android Keystore and disables app backup.
Re-pair after changing tailnets or rotating the key. `atlas-app unpair` rotates
the key and removes the single paired device. The app can request the same
operation with encrypted RPC `pairing.unpair`; it receives the final response
before the old key and sockets are destroyed.

## Transport and wire protocol

Port 5010 listens on A1 and is reached only through its private Tailscale
`100.x` address. On the same LAN, Tailscale should upgrade the connection to a
direct peer-to-peer UDP path; encrypted DERP remains a valid fallback if direct
connectivity is unavailable. Check the actual path with `tailscale ping` or
`tailscale status` instead of inferring it from a green VPN icon; see Tailscale's
[connection-type reference](https://tailscale.com/docs/reference/connection-types).
WebScreen/5000
stays private to the trusted LAN and is never forwarded. The app keeps one WebSocket
open while its foreground service lives. Every WebSocket frame remains an
object shaped as `{"box":"<encrypted envelope>"}`; HTTP fallback uses the same
box. AES-256-GCM uses direction-specific associated data, timestamps, random
nonces and replay rejection. Keep phone and Pi clocks within two minutes.

Current version-2 pairings store the `100.x` endpoint directly. The MagicDNS
`atlas-a1` probe retained for old version-1 migrations is also tailnet-only; it
is not a raw-LAN or public fallback.

App requests decrypt to:

```json
{"id":"unique","client":"stable-id","device":"s23u","method":"status","params":{}}
```

Pi-initiated phone tools decrypt to:

```json
{"id":"unique","method":"control.location.get","params":{},"serverRequest":true}
```

The app completes a Pi request with its own encrypted RPC:

```json
{"id":"reply","client":"stable-id","device":"s23u","method":"app.reply","params":{"requestId":"unique","result":{},"error":null}}
```

If no live app socket exists, the deterministic CLI error is exactly
`Error: Android device not connected`. Connection loss never replays a phone
action automatically because it may already have executed.

The WebSocket reader dispatches decrypted RPC requests concurrently, with a
bounded task set and serialized writes. This is required for re-entrant phone
tools: a request such as `atlas_phone` may wait for a Pi-initiated
`serverRequest`, while the same socket must continue reading the matching
`app.reply`. Processing one frame to completion before reading the next would
deadlock that round trip. Concurrency does not weaken replay protection or
allowlists, and duplicate actions are still never retried automatically.

## Phone tools

Native Android APIs are preferred over screen automation:

```sh
atlas-app control location.get
atlas-app control capabilities
atlas-app control contacts.search query=Papa
atlas-app control apps.launch app=Galería
atlas-app control apps.launch app=Amazon
atlas-app control apps.launch app=Alexa
atlas-app control phone.call number=600000000
atlas-app control sms.send number=600000000 text='Llego pronto'
atlas-app control calendar.list from=1788825600000 to=1789430400000
atlas-app control calendar.create --params '{"calendarId":1,"title":"Dentista","begin":1788865200000,"end":1788868800000}'
atlas-app control notifications.list
```

The generic form is `atlas-app control OP [key=value ...] [--params JSON]`.
`location`, `get_location`, `capabilities`, `call` and the historical
`calls.place` remain friendly aliases for `location.get`,
`phone.capabilities` and `phone.call`. Contact names are not accepted by
`phone.call`: first resolve the contact with `contacts.search`, then pass its
verified `number`. SMS content uses `text`, never `message`. Calendar timestamps
are Unix milliseconds; call `calendar.list` first and select an entry from
`editableCalendars` to obtain the required `calendarId` before creating an
event with `begin` and optional `end`.

`Amazon` is the friendly alias for Amazon Shopping
(`com.amazon.mShop.android.shopping`); `Alexa` is the separate Amazon Alexa app
(`com.amazon.dee.app`). The launcher never substitutes one for the other.
`location.get` returns coordinates and, when Android reverse geocoding succeeds,
the exact `formattedAddress` plus structured `address` fields. Owner-facing
answers should use that complete formatted address directly. If it is absent,
report coordinates and the geocoding error rather than inventing an address.

Supported families are application launch, location, notifications, contacts, calendar, calls,
SMS, Wi-Fi, media/gallery, files, camera and sensors. The phone validates its
runtime permission for every operation and returns an explicit permission error
instead of silently falling back to taps.

Accessibility-based screen control has a narrower wrapper:

```sh
atlas-androiduse start
atlas-androiduse status
atlas-androiduse screenshot
atlas-androiduse tree
atlas-androiduse click 'Permitir'
atlas-androiduse tap 0.50 0.52
atlas-androiduse long_press 0.50 0.52 700
atlas-androiduse swipe 0.75 0.80 0.75 0.25 300
atlas-androiduse text 'esp32'
atlas-androiduse key ENTER
atlas-androiduse back
atlas-androiduse home
atlas-androiduse recents
atlas-androiduse wait 350
atlas-androiduse wait_for 'Buscar en Amazon'
atlas-androiduse batch actions.json
atlas-androiduse launch com.android.chrome
atlas-androiduse launch https://example.com
atlas-androiduse stop
```

`screenshot` normally saves a validated JPEG to
`~/.atlas/companion/screenshots/latest.jpg`; the phone scales it to at most 640
pixels wide at JPEG quality 82. The wrapper accepts older PNG replies, preserves
their matching extension and never dumps base64 into model context. `start`
must activate the Android control notification, touch-blocking stop surface and
blue border. Prefer semantic `click` with an exact label from `tree`; it clicks
the matching node or its clickable ancestor. Use normalized coordinates from
`0` to `1` only as a fallback; they refer to the physical screen even when the
attached image is smaller. `launch` sends either `package` for an Android package
name or `uri` for an allowed URL. `tree` redacts password nodes and all their
descendants. `key ENTER` uses the focused field's safe IME action; `back`, `home`
and `recents` are direct aliases for the corresponding global actions.

`batch` accepts a JSON object or array with up to sixteen `actions`. It executes
them on the phone without a network/model round-trip between steps, supports
bounded semantic `click` and `wait_for` candidates, stops at the first failure
and returns one final tree and screenshot. It starts and stops the visual guard
automatically unless a persistent Android Use session was already active. The
owner's red stop control prevents every remaining step. Realtime can
combine native `apps.launch` plus one visual batch through `atlas_actions`.

A recoverable label, gesture or screenshot failure leaves the active session in
place so the caller can inspect or correct it with a shorter batch. `stop` is mandatory after the
requested visual task or when abandoning it, and on cancellation, overall
timeout, client exit, lost socket/device or lost Accessibility control. Read
[`ATLAS-ANDROIDUSE.md`](../../openclaw/workspace/atlas-commands/ATLAS-ANDROIDUSE.md)
before using this fallback.

## Resumable terminal

The PTY is owned by Companion, not by an Activity or WebSocket. `terminal.open`
accepts optional `resume`, while `terminal.resume` and `terminal.list` recover
an existing token after reconnection. Empty background reads do not count as
activity. Input, resize or actual output renews the deadline; Companion closes
the PTY after five minutes without real activity.

## Operations and diagnostics

```sh
atlas-app
atlas-app status --json
atlas-app tailscale
atlas-app endpoint
atlas-app logs
atlas-app restart
atlas-app unpair
tailscale ping s23u
tailscale netcheck
```

`atlas-app status --json` contains service, pairing, live client, terminal and
Tailscale state without returning secrets. A `Running` tailnet and an active
service are not proof that the phone app is connected; check live clients too.

The previous blind relay remains source-compatible only as a deliberately
selected recovery bridge:
`atlas-app legacy-relay wss://HOST/connect` enables it explicitly and
`atlas-app legacy-relay off` restores Tailscale. New installations and migrated
configs always force Tailscale; transport failure never falls back to the legacy
relay automatically. Tailscale may itself choose a secure DERP path without
changing the configured transport. The relay source can be removed in a later
breaking release after old APKs are retired.

This is a personal development system, not an independently audited remote
administration product. WebScreen and the paired Android app may keep independent
Realtime sessions at once; one never takes over or closes the other. Keep
Tailscale device approval and Android's explicit permissions enabled, and stop
each control session whenever its task is done.
