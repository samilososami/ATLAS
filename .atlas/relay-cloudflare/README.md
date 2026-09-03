# ATLAS Relay on Cloudflare

The production-shaped ATLAS relay can run on Cloudflare Workers Free using one
SQLite-backed Durable Object and the WebSocket Hibernation API. The Worker is a
blind router: Companion and the Android app still encrypt every RPC end to end.

The configured custom domain is `relay.samilososami.com`. The parent zone must
already be active in the same Cloudflare account. Cloudflare creates the DNS
record and public TLS certificate during deployment.

## Deploy

From this directory:

```sh
npm ci
npx wrangler login
ssh sami@atlas-a1.local 'atlas-app relay-credentials --json' |
  npx wrangler secret put ATLAS_RELAY_DEVICES
npx wrangler deploy
curl --fail https://relay.samilososami.com/health
```

Never save the real secret in `.dev.vars`, GitHub, build logs or screenshots.
The piped JSON contains the high-entropy room and a SHA-256 hash of the Pi-only
relay password. It does not contain the end-to-end AES key, but it is still
private relay configuration.

Then, on A1:

```sh
atlas-app relay wss://relay.samilososami.com/connect
atlas-app restart
atlas-app pair
```

Paste the newly generated pairing code into the Android app because older codes
do not include the relay URL. Test with Wi-Fi disabled on the phone.

## Local verification

Copy `.dev.vars.example` to `.dev.vars` with disposable values and run:

```sh
npm test
```

The test covers Pi authentication, app registration, opaque round trips, room
isolation and the explicit offline response. The committed configuration never
contains real A1 credentials.
