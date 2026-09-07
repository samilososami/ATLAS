# Tailscale transport and legacy relay

ATLAS Companion now uses the owner's private Tailscale network by default. The
phone and ATLAS A1 join the same tailnet and communicate over WireGuard, usually
peer-to-peer. If NAT traversal cannot create a direct path, Tailscale can use an
end-to-end encrypted DERP path without changing the Companion protocol.

This replaces the old public relay architecture for normal use:

- no VPS, domain, router port or Cloudflare Worker is required;
- A1 exposes only TLS/5010 to devices allowed by the tailnet;
- WebScreen/5000 and SSH are not published by this integration;
- BLE pairing still supplies an additional pinned certificate and AES key;
- `tailscale ping <device>` reports whether a current path is direct or DERP.

## Setup

```sh
sudo bash system/install-companion.sh
sudo tailscale up --hostname=atlas-a1 --operator=sami
atlas-app tailscale
atlas-app pair
```

Install and sign in to Tailscale on Android first. MagicDNS provides a stable
hostname; the BLE payload also contains the current `100.x` address. Disable
key expiry for the always-on A1 in the admin console if appropriate. Device
membership in the tailnet does not replace ATLAS pairing: both layers are
required.

## Troubleshooting

```sh
tailscale status
tailscale ping s23u
tailscale netcheck
atlas-app status --json
curl -k https://127.0.0.1:5010/health
```

First distinguish Tailscale `Running`, reachability of the peer, Companion
service health and an actual live app socket. A DERP path is valid and secure,
but may be slower than a direct path. Never open 5010 on the public router as a
shortcut and never expose WebScreen/5000.

## Legacy compatibility

The previous `.atlas/relay-cloudflare` and Python relay remain in the source for
older APKs and rollback. They are disabled after migration. A deliberate
`atlas-app legacy-relay wss://HOST/connect` switches back; `legacy-relay off`
returns to Tailscale. Relay credentials and pairing keys remain private.
