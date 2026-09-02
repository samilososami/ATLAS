# ATLAS Companion · Android preview

Separate from WebScreen, the companion gives the owner's Android app access to
Realtime reservations, context, Tavily, diagnostics, confirmed commands and an
actual PTY. It runs as the Pi account, not root. That account may have sudo:
**a pairing code grants administration of this device**.

## Install on A1

```sh
sudo apt-get install python3-aiohttp python3-cryptography openssl curl network-manager
sudo bash system/install-companion.sh
atlas-app
atlas-app pair
```

Paste the private pairing code into the Android app's Settings. It includes the
LAN address, the pinned self-signed certificate fingerprint and a random
AES-256 key. The key is encrypted with Android Keystore on the phone; Android
backup is disabled. Pairing and administrative operations can require Android
biometrics or the device credential. Biometrics never leave Android.

`atlas-app status --json`, `start`, `stop`, `restart`, `logs` inspect/control the
service. `atlas-app revoke` rotates the pairing key and disconnects every phone.
Generate a new code after rotation or LAN-address changes. All paired phones are
owners in this preview; there are no limited guest roles yet.

HTTPS listens on port 5010. Both local and relayed RPC use AES-256-GCM envelopes
with direction-specific associated data, timestamps, random nonces and replay
rejection. Keep phone/Pi clocks within two minutes. The legacy unprotected
WebScreen port 5000 is **not** forwarded to the Internet.

## Independent Internet access: self-hosted relay

No Tailscale or companion VPN app is required. A publicly reachable server is
still necessary when both endpoints are behind NAT. This repository includes
that relay; it is not already a hosted service. Until a server/domain is
configured, LAN works and remote access must be reported as unconfigured.

1. On A1: `atlas-app relay wss://YOUR-DOMAIN/connect`.
2. On A1: `atlas-app relay-credentials`. Transfer the resulting JSON privately
   to `/etc/atlas-relay/devices.json` on your server (mode 600). It contains a
   room and a hashed **relay** credential, not the end-to-end encryption key.
3. Install `python3-aiohttp` on the server and run `relay.py` as a dedicated
   unprivileged user under systemd. It binds only `127.0.0.1:8444`.
4. Put your HTTPS reverse proxy in front, with WebSocket upgrade enabled,
   valid public TLS, connection/rate limits and a 2 MB request limit. Forward
   `/connect` to `http://127.0.0.1:8444/connect`. Do not log payloads.
5. Restart the companion and re-pair the phone with the updated code.

The Pi makes an outbound WSS connection and reconnects with backoff. The relay
only sees encrypted boxes, routing identifiers, timing and sizes; it cannot
decrypt shell output, context or requests. It can still disrupt availability.
Limit access to the high-entropy room and secure the server. This protocol is a
preview, not an independently audited security product.

## Behavior and limits

- Only opening a voice/chat session takes WebScreen control; status does not.
- On close or 40 seconds without app heartbeats, control returns to the A1.
- PTT records locally during a held button, then sends PCM and commits exactly
  one Realtime turn. The model remains `gpt-realtime-2.1`.
- Wake mode uses Android SpeechRecognizer (not Chrome, and not guaranteed
  offline); a complete recognized invocation is sent as text to Realtime.
  It only runs while the app is visible. PTT and chat do not need this service.
- The native UI always confirms complete commands and PTY opening. Disabling
  biometric protection does not remove command confirmation.
- Each command confirmation expires after 60 seconds and is single-use.
- Shell output is capped at 64 KiB; commands time out after 30 seconds. A PTY
  is interactive, supports terminal resize and closes after 90 idle seconds.
- Quota is read through Gateway `usage.status`. Missing values are unavailable,
  never zero. Nothing here buys credits or resets usage.
- No automatic network reset, model fallback, OAuth reset, reboot or deletion.

Run `python3 -m unittest discover -s .atlas/companion -v` for protocol/PTY tests.
