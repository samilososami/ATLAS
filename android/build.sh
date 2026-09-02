#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export ANDROID_HOME=${ANDROID_HOME:-/tools/codex/android-sdk}
if [[ -x /tools/codex/gradle-9.1.0/bin/gradle ]]; then
  exec /tools/codex/gradle-9.1.0/bin/gradle "$@" assembleDebug --console=plain
fi
exec ./gradlew "$@" assembleDebug --console=plain
