# ATLAS Android 0.1.3 Preview

This preview adds a secure in-app updater and resizable Android home-screen widgets.

## What's new

- **Check for updates** in Settings reads Android releases from `samilososami/ATLAS`, shows the version and release notes, and downloads the selected APK.
- Before Android's installer opens, ATLAS verifies the expected GitHub release URL, download size, SHA-256 digest, application ID, a higher version code, and the same signing identity as the installed app.
- The first installation from inside ATLAS asks Android for the standard “install unknown apps” permission. Every update still requires Android's own confirmation.
- The default appearance on a new installation is Dark; Light remains available and existing preferences are preserved.
- One resizable home-screen widget, starting at 2×2, can be configured as:
  - one of the custom command buttons created in ATLAS;
  - A1 service and connectivity status;
  - Codex 5-hour and weekly limits;
  - a direct shortcut to Chat;
  - a direct shortcut to Push-to-talk.
- Larger status widgets reveal more detail. Reads include a timestamp and retain the last observation if A1 is temporarily offline.

## Android interaction boundaries

Standard Android widgets support clicks, not continuous press-and-hold audio or a reliable editable chat field. Chat and voice widgets therefore open the correct mode directly inside ATLAS. Command widgets open ATLAS and preserve the exact command confirmation and biometric policy; they never execute in the background.

## Verification before publication

- JavaScript and policy tests pass.
- Java compilation and debug APK assembly pass.
- APK package metadata and development signature are checked before upload.
- Emulator verification continues after publication so the APK can be tested on a physical phone in parallel.
