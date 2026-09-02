# ATLAS App

`atlas-app` reports the Android companion service, connected clients, voice
ownership, terminal count and relay connectivity. `atlas-app status --json`
returns the same information without pairing secrets.

- `atlas-app pair`: print a **private administration code** for the phone. Only
  do this when the owner asks to pair; never put the code in memory, logs or Git.
- `atlas-app revoke`: interactively revoke all phones by rotating the key.
- `atlas-app start|stop|restart|logs`: manage `atlas-companion.service`.
- `atlas-app relay wss://HOST/connect`: configure the owner's independent relay.
- `atlas-app relay-credentials`: private relay provisioning data, not model auth.

The app's voice/text brain is direct `gpt-realtime-2.1`, with the same core
Markdown context, shell and Tavily as WebScreen. Never route it to the legacy
OpenClaw preamble agent. Opening a conversation takes the WebScreen lease;
closing it returns the A1. Merely opening Status does not take the lease.

The companion is separate from WebScreen. Do not expose port 5000 publicly.
Port 5010 uses a pinned certificate and encrypted authenticated requests;
Internet mode uses a self-hosted blind relay, **not Tailscale**. A public server
must actually be configured before claiming access from outside the LAN.

For system failures use `atlas-rafas` and its bounded `doctor`. Technical
installation and security limits: `.atlas/companion/README.md` in the source
repository or `/home/atlas/.atlas/companion/README.md` on A1.
