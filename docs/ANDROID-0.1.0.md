# Android 0.1.0 preview · 2026-09-03

First installable ATLAS APK. Five tabs: conversation, command tiles, interactive
terminal, status and settings. Native Android security/networking surrounds a
bundled WebView interface. Direct Realtime, PTT PCM, foreground Android wake
recognition and streaming chat; native OpenAI voices.

The source includes `atlas-rafas` / `doctor`, `atlas-app`, Companion, encrypted
pairing, a blind self-hosted relay and reversible Pi installation. No Tailscale.
The relay still needs an owner's public server, TLS and deployment.

Also synchronizes the previously developed WebScreen improvements: exact Chrome
wake detection, direct shell/Tavily/context, reasoning choices, latency handling,
A1-only microphone suppression through playback + 200 ms, and no legacy fallback.
The selected mascot and its design variants are included as artwork, not a new
production screen.

Validation before publication:

- APK compiled; Android package/minimum version/signature verified.
- 89 WebScreen JS tests and 57 WebScreen Python tests passed.
- 5 RAFAS recovery tests passed; doctor never resets a healthy network.
- 12 companion/crypto/relay/PTY tests passed, including replay rejection,
  single-use command authorization, client ownership and cross-room isolation.
- Build tools located and runnable by kali and root.

Not verified at publication: emulator UI, physical mobile microphone/biometrics,
actual Realtime turn from Android, and outside-LAN access. APK publication was
deliberately done before emulator testing. The Pi became unreachable before
the companion deployment, so deployment and hardware validation remain pending.
Only its Python package dependencies had been installed successfully.

This preview is development-signed, requires Android 11+, and grants device
administration to paired owners. Read [security limits](../SECURITY.md),
[Android instructions](../android/README.md) and
[Companion setup](../.atlas/companion/README.md). Do not expose WebScreen HTTP/5000.
