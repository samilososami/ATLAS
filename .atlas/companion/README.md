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
six-digit `XXX-XXX` code. After the app submits the code, BLE returns a compact
version-2 `atlas1:` payload containing:

- `endpoint`: persistent `wss://HOST:5010/app` transport;
- `direct`: encrypted HTTP fallback at `https://HOST:5010/rpc`;
- `tailscale` and `tailscaleIp`: current private identity;
- `pin`: SHA-256 pin for A1's self-signed TLS certificate;
- `key`: random AES-256-GCM pairing key.

The Android app stores its secret in Android Keystore and disables app backup.
Re-pair after changing tailnets or rotating the key. `atlas-app unpair` rotates
the key and removes the single paired device. The app can request the same
operation with encrypted RPC `pairing.unpair`; it receives the final response
before the old key and sockets are destroyed.

## Transport and wire protocol

Port 5010 listens on A1 and is reached through Tailscale. WebScreen/5000 stays
private to the trusted LAN and is never forwarded. The app keeps one WebSocket
open while its foreground service lives. Every WebSocket frame remains an
object shaped as `{"box":"<encrypted envelope>"}`; HTTP fallback uses the same
box. AES-256-GCM uses direction-specific associated data, timestamps, random
nonces and replay rejection. Keep phone and Pi clocks within two minutes.

App requests decrypt to:

```json
{"id":"unique","client":"stable-id","device":"s23u","method":"status","params":{}}
```

Pi-initiated phone tools decrypt to:

```json
{"id":"unique","method":"control.get_location","params":{},"serverRequest":true}
```

The app completes a Pi request with its own encrypted RPC:

```json
{"id":"reply","client":"stable-id","device":"s23u","method":"app.reply","params":{"requestId":"unique","result":{},"error":null}}
```

If no live app socket exists, the deterministic CLI error is exactly
`Error: Android device not connected`. Connection loss never replays a phone
action automatically because it may already have executed.

## Phone tools

Native Android APIs are preferred over screen automation:

```sh
atlas-app control get_location
atlas-app control contacts.search query=Papa
atlas-app control calls.place target=Papa
atlas-app control sms.send number=600000000 message='Llego pronto'
atlas-app control calendar.create --params '{"title":"Dentista","start":1234}'
atlas-app control notifications.list
```

The generic form is `atlas-app control OP [key=value ...] [--params JSON]`.
Supported families are location, notifications, contacts, calendar, calls,
SMS, Wi-Fi, media/gallery, files, camera and sensors. The phone validates its
runtime permission for every operation and returns an explicit permission error
instead of silently falling back to taps.

Accessibility-based screen control has a narrower wrapper:

```sh
atlas-androiduse start
atlas-androiduse status
atlas-androiduse screenshot
atlas-androiduse tap 540 1200
atlas-androiduse swipe 800 1600 800 500 300
atlas-androiduse text 'esp32'
atlas-androiduse key ENTER
atlas-androiduse launch https://amazon.es
atlas-androiduse stop
```

`screenshot` saves a validated PNG to
`~/.atlas/companion/screenshots/latest.png` by default and prints its path and
dimensions; it does not dump base64 into model context. `start` must activate
the Android control notification, touch-blocking stop surface and blue border.
`stop` is mandatory after the requested visual action. Read
`ATLAS-ANDROIDUSE.md` before using this fallback.

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

The previous blind relay remains source-compatible only as a recovery bridge:
`atlas-app legacy-relay wss://HOST/connect` enables it explicitly and
`atlas-app legacy-relay off` restores Tailscale. New installations and migrated
configs always default to Tailscale. The relay source can be removed in a later
breaking release after old APKs are retired.

This is a single-owner development system, not an independently audited remote
administration product. Keep Tailscale device approval and Android's explicit
permissions enabled, and stop the control session whenever the task is done.
