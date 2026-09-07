# ATLAS App

`atlas-app` reports the Android Companion service, single paired device, live
socket, resumable terminals and private Tailscale transport. Use
`atlas-app status --json` for structured diagnostics without secrets.

- `atlas-app pair`: open the 120-second BLE flow and show the private six-digit
  code. Never place the code or returned `atlas1:` payload in memory or logs.
- `atlas-app unpair`: rotate the administration key and remove the paired phone.
- `atlas-app tailscale|endpoint`: inspect the private transport.
- `atlas-app start|stop|restart|logs`: operate `atlas-companion.service`.
- `atlas-app control OP ...`: call a permission-backed native phone operation.
- `atlas-app legacy-relay ...`: compatibility only, not the default path.

Prefer native operations for calls, SMS, contacts, calendar, notifications,
location, files, media, Wi-Fi, camera and sensors. Use the generic form
`atlas-app control OP [key=value ...] [--params JSON]`. If the phone is not
online, report `Error: Android device not connected`; do not invent a result or
replay the request after reconnecting.

The app's text/voice brain remains direct `gpt-realtime-2.1` with the same core
Markdown, memory, shell and Tavily path as WebScreen. Opening a conversation
takes the WebScreen lease; reading status does not. The persistent Companion
WebSocket is independent from that model lease.

The default endpoint is `wss://<A1 MagicDNS>:5010/app` inside the owner's
tailnet. TLS pinning and encrypted AES-GCM boxes remain mandatory. Tailscale
membership and ATLAS BLE pairing are separate trust layers. Never expose
WebScreen/5000 or pairing material.

For screen automation read `ATLAS-ANDROIDUSE.md`; for Pi failures use
`atlas-rafas`. Full protocol and installation notes live in
`.atlas/companion/README.md` in source or `/home/atlas/.atlas/companion/README.md`
on A1.
