#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export ANDROID_HOME=${ANDROID_HOME:-/tools/codex/android-sdk}
# Both root and kali intentionally share the same development signing identity.
# This keeps sideloaded upgrades installable instead of producing a second APK
# signer when the build is launched from a root shell.
if [[ -f /home/kali/.config/.android/debug.keystore ]]; then
  export ANDROID_USER_HOME=/home/kali/.config/.android
fi
if [[ -x /tools/codex/gradle-9.1.0/bin/gradle ]]; then
  exec /tools/codex/gradle-9.1.0/bin/gradle "$@" assembleDebug --console=plain
fi
exec ./gradlew "$@" assembleDebug --console=plain
