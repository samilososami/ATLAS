#!/usr/bin/env bash
# Install the optional local wake-word laboratory; never enables it in production.
set -Eeuo pipefail
if (( EUID != 0 )); then
  exec sudo --preserve-env=ATLAS_HOME,ATLAS_USER,ATLAS_SYSTEM_ROOT,ATLAS_SKIP_DEPENDENCY_CHECK -- "$0" "$@"
fi

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
system_root=${ATLAS_SYSTEM_ROOT:-/}
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home" 2>/dev/null || true)}
[[ -n $atlas_user ]] || { echo "Cannot resolve ATLAS_USER" >&2; exit 1; }
atlas_group=$(id -gn "$atlas_user")
# shellcheck source=system/lib/install-focused-runtime.sh
source "$repo/system/lib/install-focused-runtime.sh"
atlas_installer_begin wake-command

runtime="$atlas_home/.atlas/wakeword"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" \
  "$runtime" "$runtime/models" "$runtime/profiles" "$runtime/logs" "$runtime/tmp"
atlas_installer_file "$repo/atlas-commands/atlas-wake" \
  "$system_root/usr/local/bin/atlas-wake" 755 root root system/usr/local/bin/atlas-wake
atlas_installer_file "$repo/.atlas/wakeword/atlas_wake.py" \
  "$runtime/atlas_wake.py" 600 "$atlas_user" "$atlas_group" runtime/wakeword/atlas_wake.py
for name in README.md requirements.txt; do
  atlas_installer_file "$repo/.atlas/wakeword/$name" "$runtime/$name" 600 \
    "$atlas_user" "$atlas_group" "runtime/wakeword/$name"
done

if [[ ! -x $runtime/.venv/bin/python ]]; then
  [[ ${ATLAS_SKIP_DEPENDENCY_CHECK:-0} != 1 ]] || {
    echo "Wake venv missing from isolated fixture" >&2; exit 1;
  }
  python3 -m venv "$runtime/.venv"
  chown -R "$atlas_user:$atlas_group" "$runtime/.venv"
  atlas_installer_run_as_user "$runtime/.venv/bin/python" -m pip install \
    --disable-pip-version-check -r "$runtime/requirements.txt"
  ATLAS_INSTALL_CHANGED=1
fi

model="$runtime/models/hey_atlas.tflite"
model_sha=3f3a6c25e53bf8d45b597191fca59a2bc948b4f500b76daf1fd98c36088317a7
if [[ ! -f $model ]] || ! printf '%s  %s\n' "$model_sha" "$model" | sha256sum -c - >/dev/null 2>&1; then
  [[ ${ATLAS_SKIP_DEPENDENCY_CHECK:-0} != 1 ]] || {
    echo "Pinned wake model missing from isolated fixture" >&2; exit 1;
  }
  download=$(mktemp)
  trap 'rm -f -- "$download"' EXIT
  curl -fsSL https://github.com/briankelley/atlas-voice-training/releases/download/hey_atlas-v1/hey_atlas.tflite \
    -o "$download"
  printf '%s  %s\n' "$model_sha" "$download" | sha256sum -c -
  atlas_installer_file "$download" "$model" 600 "$atlas_user" "$atlas_group" \
    runtime/wakeword/models/hey_atlas.tflite
fi

atlas_installer_run_as_user env ATLAS_WAKE_ROOT="$runtime" \
  "$runtime/.venv/bin/python" "$runtime/atlas_wake.py" status >/dev/null
atlas_installer_finish 'ATLAS Wake laboratory'
