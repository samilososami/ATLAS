# ATLAS Android 0.1.1 preview · 2026-09-03

Install the APK as an update to 0.1.0 (same development signature, version code 2).
Android 11 or newer is required. The initial APK was published before any emulator
testing, as requested. This follow-up contains fixes found in those tests.

## Changes

- Android system bars, cutouts and keyboard correctly inset the WebView viewport.
- The voice-output checkbox stays on one line.
- Interactive terminal writes are ordered and short bursts batched. Previously,
  concurrent HTTP workers could reorder keystrokes. Queued input is discarded
  when the terminal closes; Unicode paste chunks stay within the server limit.
- A failed Realtime session request immediately releases A1 microphone ownership.
- RAFAS handles missing Wi-Fi tools and invalid adapter selections safely.

## Verified

- Installation and update on a Pixel 7 emulator, Android 15, x86_64.
- Five-tab navigation, command-button creation, icon/color editor and persistence
  of buttons/pairing after restarting the app.
- Pairing with Android device-PIN confirmation, certificate pinning and actual
  AES-GCM requests to a temporary loopback-only companion fixture.
- Optional app lock requests Android authentication when returning from the
  background; no conversation or shell UI is shown while locked.
- Command cancellation, then confirmed/PIN-authorized execution of the harmless
  `printf ATLAS_EMULATOR_OK` command, with its actual output and exit code shown.
- Real interactive PTY through Android: typed `printf PTY_ANDROID_OK` and observed
  its output. Status display tested with clearly labelled synthetic diagnostics;
  missing quota is displayed as unavailable rather than zero.
- No app crashes or uncaught JavaScript errors observed in emulator logcat.
- 3 ordered terminal-input tests, 13 companion/crypto/relay/PTY tests and 7 RAFAS
  tests passed. The unchanged WebScreen suites previously passed 89 JS / 57 Python tests.

## Still pending — do not confuse fixture results with A1 validation

The Raspberry Pi became unreachable before deployment. Companion, `atlas-app`
and `atlas-rafas` are implemented and documented but not yet installed there.
Only the Python package prerequisites were installed before the connection loss.

Real phone microphone quality, fingerprint/face enrollment, an actual Android
Realtime conversation, physical A1 control and outside-LAN connectivity are not
verified. The independent relay needs the owner's public server/domain and TLS;
it is source code, not a service already hosted for the user. No Tailscale.

Native OpenAI voices are included. The existing WebScreen ElevenLabs adapter is
not yet ported to Android. Wake recognition is foreground-only and uses Android's
recognition service. This remains a development-signed preview, not a production
security-audited release. Never publish pairing codes or expose WebScreen port 5000.
