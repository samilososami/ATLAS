# ATLAS Android 0.1.9-preview

Performance release for the persistent A1 connection.

- Freezes WebView timers, rendering and audio when the app is not visible.
- Removes the foreground UI ping loop and the 25-second encrypted service probe.
- Keeps one low-traffic WebSocket open with a 60-second protocol heartbeat.
- Receives A1 online/offline changes as relay presence events instead of polling.
- Coalesces duplicate connection-state writes and notification updates.
- Retains event-driven reconnection on Wi-Fi/mobile changes and bounded retry after relay failures.
