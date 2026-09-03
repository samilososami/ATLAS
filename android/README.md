# ATLAS Android · 0.1.2 preview

Android 11+ companion for an owner-controlled ATLAS A1. Install the APK from
[GitHub Releases](https://github.com/samilososami/ATLAS/releases). This is a
development-signed preview, not the ATLAS OS disk image.

## First connection

1. Install [Companion on A1](../.atlas/companion/README.md).
2. On A1, run `atlas-app pair` in a private terminal.
3. In ATLAS → Ajustes, paste the code and tap **Conectar con A1**. Android
   asks for biometrics or your screen-lock credential by default. Configure
   a device lock first; no biometric data leaves your phone.
4. Tap **Preparar voz**, grant microphone access, then hold the voice button
   and release to send. Changing voice/reasoning applies to a new session.

Local access works on the same network. Internet access needs your own public
WSS relay; no Tailscale, managed VPN or external companion app is required.
See the companion instructions. A pairing code is an administration secret.

## Five tabs

- **Atlas:** hold-to-talk PCM → Realtime, Android wake recognition while visible,
  or streaming chat with optional native OpenAI audio. The backend supplies
  ATLAS context and Tavily. Shell tool calls ask for native confirmation.
  Conversation history and the text composer appear only in **Chat**. The
  chat's text-only preference never disables audio in Pulsar or wake mode.
- **Acciones:** named command tiles, 23 icons and seven accent colors. Long-press
  a tile to edit/delete. Every command shows its exact text before execution.
- **Terminal:** real PTY, resize, Ctrl-C, arrows, keyboard and xterm scrollback.
- **Estado:** actual A1 diagnostics, services and 5-hour/weekly quota when Gateway
  reports them. Unavailable data is never presented as zero.
- **Ajustes:** encrypted pairing, LAN/relay/auto transport, app lock, action/pairing
  biometrics, native voices and reasoning levels. **Claro** is the default;
  **Oscuro** restores the original navy palette. The choice persists without
  recreating the activity or dropping an active session; blue accents stay fixed.

The visual shell is bundled HTML/CSS/JS inside Android WebView, with native Java
for networking, pinned TLS, Keystore, biometrics, permissions and recognition.
No remote website is loaded as the app UI. Icons use the supplied ATLAS artwork.
The filled ATLAS silhouette and rounded gear are vector UI glyphs. The decorative
white ATLAS wordmark sits on navy for contrast in both themes. The full-color
header and central logos are unchanged; only the launcher inset grew from 22%
to 25%. The interactive terminal intentionally retains its dark console surface.

## Build

Requires JDK 17+, Android SDK platform 36 and build-tools 36.0.0. Gradle 9.1.0 is
pinned by the wrapper (AGP 9.0.1). On the development machine these dependencies
are shared under `/tools/codex` and available to both kali and root.

```sh
cd android
ANDROID_HOME=/path/to/android-sdk ./gradlew assembleDebug
```

Or run `./build.sh` using the shared SDK/Gradle when installed. Output:
`app/build/outputs/apk/debug/app-debug.apk`. Private signing keys and local SDK
settings must remain outside Git. This preview uses development signing;
production distribution needs a stable release key managed by the owner.

The shared emulator can be launched with `atlas-emulator` on the development
machine, as kali or root. Do not run both against the same virtual device at once.
Run `node --test android/test_*.cjs` from the repository root for appearance,
voice/chat output-mode and ordered terminal-input regression tests.

## Validation boundaries

The initial APK is published before emulator testing, as requested. Compilation
and automated protocol/PTY tests do not prove physical microphone quality,
provider compatibility, biometric enrollment, or Internet traversal. Those are
acceptance tests to run on a real phone and A1. Current validation results are
recorded in release notes rather than silently assumed.

Wake mode needs an Android recognition service and may use its network API.
It stops in the background; this app does not promise always-on wake detection.
Native Realtime voices are included; the WebScreen's external browser/ElevenLabs
voice adapters are not yet ported into the mobile client. Quota and A1 control
remain separate from microphone ownership.

Third-party terminal: xterm.js 5.5.0 and addon-fit 0.10.0, MIT, license bundled
in `app/src/main/assets/web/XTERM-LICENSE`.
