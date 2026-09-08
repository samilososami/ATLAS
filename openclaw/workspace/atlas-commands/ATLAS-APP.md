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

Prefer native operations for app launches, calls, SMS, contacts, calendar,
notifications, location, files, media, Wi-Fi, camera and sensors. Use the generic form
`atlas-app control OP [key=value ...] [--params JSON]`. If the phone is not
online, report `Error: Android device not connected`; do not invent a result or
replay the request after reconnecting.

Canonical native operations include `phone.capabilities`, `location.get` and
`phone.call`. The CLI also accepts `capabilities`, `location`, `get_location`,
`call` and the historical `calls.place`, normalizing them before the encrypted
request. Examples:

```sh
atlas-app control phone.capabilities
atlas-app control apps.launch app=Galería
atlas-app control location.get
atlas-app control contacts.search query=Papa
atlas-app control phone.call number=600000000
atlas-app control sms.send number=600000000 text='Llego pronto'
atlas-app control calendar.list from=1788825600000 to=1789430400000
atlas-app control calendar.create --params '{"calendarId":1,"title":"Dentista","begin":1788865200000,"end":1788868800000}'
```

Resolve a contact before calling and pass `number`, not a display name. SMS uses
`text`, not `message`. Calendar times are Unix milliseconds: first inspect
`calendar.list`, choose an entry from `editableCalendars`, then use its `id` as
the required `calendarId`; creation uses `begin` and optional `end`.

The app's text/voice brain remains direct `gpt-realtime-2.1` with the same core
Markdown, memory, shell and Tavily path as WebScreen. Opening a conversation
takes the WebScreen lease; reading status does not. The persistent Companion
WebSocket is independent from that model lease.

WebScreen and `atlas-chat` expose these native methods through the typed
`atlas_phone` tool. Their typed `atlas_android` fallback attaches a fresh phone
capture as a separate Realtime `input_image`, so the model can inspect the
result without receiving PNG base64 in the function output.

The default endpoint is `wss://<A1 MagicDNS>:5010/app` inside the owner's
tailnet. TLS pinning and encrypted AES-GCM boxes remain mandatory. Tailscale
membership and ATLAS BLE pairing are separate trust layers. Never expose
WebScreen/5000 or pairing material. A direct route and a Tailscale DERP route
are both valid Tailscale transport; loss of either never enables the legacy
Cloudflare relay automatically. Only `atlas-app legacy-relay ...` may select
that compatibility mode explicitly.

Companion reads and dispatches encrypted WebSocket RPC concurrently. This lets
the socket receive `app.reply` while the originating RPC waits for a native
phone operation, avoiding a re-entrant deadlock. Writes remain serialized,
task counts bounded and replay checks unchanged.

For screen automation read `ATLAS-ANDROIDUSE.md`; for Pi failures use
`atlas-rafas`. Full protocol and installation notes live in
`.atlas/companion/README.md` in source or `/home/atlas/.atlas/companion/README.md`
on A1.
