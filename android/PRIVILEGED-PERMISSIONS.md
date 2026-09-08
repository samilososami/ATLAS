# Privileged phone permissions

ATLAS asks for permissions individually during onboarding. Microphone,
notifications and nearby Bluetooth are required for the intended voice,
persistent-connection and pairing experience. Every other permission is
optional; **Comprobar permisos** revisits only missing grants.

These grants are capability prerequisites, not a blanket remote-control API.
Current native operations are exposed through the closed `atlas_phone` /
`atlas-app control` allowlist, validate their inputs and report
`permission_required`, `unsupported` or `requires_user_action` instead of
pretending success. Calls use a verified `number`, SMS uses `text`, and calendar
creation requires an editable `calendarId` plus Unix-millisecond `begin`/`end`.
The private APK and single paired phone reduce exposure but do not remove the
need for those checks.

Visual control is a separate Accessibility fallback. `atlas_android` starts an
owner-visible guarded session, prefers an exact accessible-label `click` before
normalized coordinate gestures, attaches reduced private JPEG screenshots as
separate `input_image` items and redacts password nodes and their descendants
from the accessibility tree. Recoverable action or inspection errors keep the
guarded session active for correction. Completion, abandonment, cancellation,
overall timeout, client exit or terminal device/socket/Accessibility loss must
issue `androiduse.stop`.

Android may restrict SMS, call-log, phone, background sensors, Wi-Fi and all-files access depending on OS version, device policy or distribution channel. The app must treat refusal or platform restriction as a normal state.
