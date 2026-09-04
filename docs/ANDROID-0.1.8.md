# ATLAS Android 0.1.8 preview

This preview makes the A1 link persistent independently from the visible app.

- A foreground supervisor owns the shared encrypted WebSocket after pairing.
- Relay failures reconnect after 1, 2, 4, 8, 16 and at most 30 seconds.
- Wi-Fi/mobile-data changes discard the obsolete socket and reconnect immediately.
- A protocol ping verifies A1 every 25 seconds; OkHttp ping/pong keeps the relay transport alive.
- `A1 offline` keeps the healthy Cloudflare socket instead of treating both endpoints as disconnected.
- The ongoing notification and Settings connection indicator show connecting, relay-only and A1-online states truthfully.
- The app requests Android's battery-optimization exemption once and leaves a Settings button visible until it is granted.
- Boot and package-update receivers continue restoring the foreground service; widgets now reuse its shared connection.

Automated validation covers the foreground-service, network-callback, bounded-backoff,
battery-exemption and relay/A1 state contracts. Compilation validates the Android 11+
source and manifest. Continuous behavior through Doze, Samsung battery management and
Wi-Fi/mobile-data handoff must still be accepted on the physical phone.
