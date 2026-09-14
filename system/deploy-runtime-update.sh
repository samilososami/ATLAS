#!/usr/bin/env bash
# Deploy a prepared ATLAS runtime checkout on A1 without waking its display.
set -Eeuo pipefail

if (( EUID != 0 )); then
  exec sudo --preserve-env=ATLAS_HOME,ATLAS_USER,ATLAS_DEPLOY_LOG,ATLAS_DEPLOY_RESULT -- "$0" "$@"
fi

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
log_file=${ATLAS_DEPLOY_LOG:-/run/atlas-runtime-deploy.log}
result_file=${ATLAS_DEPLOY_RESULT:-/run/atlas-runtime-deploy.rc}

: >"$log_file"
exec > >(tee -a "$log_file") 2>&1
trap 'rc=$?; printf "%s\n" "$rc" >"$result_file"; exit "$rc"' EXIT

test -d "$atlas_home/.atlas"
mode_before=$(tr -d '[:space:]' <"$atlas_home/.atlas/screen/mode")
kiosk_before=$(systemctl is-active atlas-screen-kiosk.service || true)
overlay_before=$(systemctl is-active atlas-screen-black-overlay.service || true)
case "$mode_before" in
  desktop|terminal|atlas|atlas-new|atlas-hide|rafas) ;;
  *) printf 'Unknown ATLAS screen mode: %s\n' "$mode_before" >&2; exit 1 ;;
esac

owner=$(stat -c %U "$atlas_home")
group=$(id -gn "$owner")
backup="$atlas_home/.atlas/backups/runtime-docs-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o "$owner" -g "$group" "$backup"

install_context_doc() {
  local source=$1 target=$2 saved
  test -f "$source"
  if [[ -f $target ]] && cmp -s -- "$source" "$target"; then
    return
  fi
  if [[ -f $target ]]; then
    saved="$backup/${target#/}"
    install -d -m 700 -o "$owner" -g "$group" "$(dirname -- "$saved")"
    cp -p -- "$target" "$saved"
  fi
  install -d -m 755 -o "$owner" -g "$group" "$(dirname -- "$target")"
  install -m 644 -o "$owner" -g "$group" "$source" "$target"
}

knowledge="$atlas_home/.atlas/context/knowledge"
roles="$atlas_home/.atlas/roles"
install -d -m 700 -o "$owner" -g "$group" \
  "$atlas_home/.atlas/context/conversation" \
  "$atlas_home/.atlas/runtime/tmp" \
  "$atlas_home/.atlas/config"
channel_instructions=$(
  python3 "$repo/system/list-context-manifest-files.py" \
    --channel-instructions "$repo/.atlas/context/knowledge"
)
install_context_doc \
  "$repo/.atlas/webscreen/$channel_instructions" \
  "$atlas_home/.atlas/webscreen/$channel_instructions"
canonical_context=$(
  python3 "$repo/system/list-context-manifest-files.py" \
    "$repo/.atlas/context/knowledge"
)
while IFS= read -r relative; do
  [[ -n $relative ]] || continue
  install_context_doc \
    "$repo/.atlas/context/knowledge/$relative" \
    "$knowledge/$relative"
done <<<"$canonical_context"
install_context_doc "$repo/atlas-commands/README.md" "$knowledge/atlas-commands/README.md"
install_context_doc "$repo/.atlas/roles/README.md" "$roles/README.md"
install_context_doc "$repo/.atlas/roles/role.schema.json" "$roles/role.schema.json"
install_context_doc "$repo/.atlas/roles/atlas-full/role.json" "$roles/atlas-full/role.json"
install_context_doc "$repo/.atlas/roles/profesores/role.json" "$roles/profesores/role.json"
install_context_doc "$repo/.atlas/roles/profesores/PROFESORES.md" "$roles/profesores/PROFESORES.md"

ATLAS_HOME="$atlas_home" bash "$repo/system/install-routines.sh"
ATLAS_HOME="$atlas_home" ATLAS_USER="$owner" bash "$repo/system/install-context.sh"
ATLAS_HOME="$atlas_home" ATLAS_USER="$owner" bash "$repo/system/install-native-broker.sh"
ATLAS_HOME="$atlas_home" bash "$repo/system/install-webscreen-resilience.sh" --restart
ATLAS_HOME="$atlas_home" bash "$repo/system/install-chat.sh"
ATLAS_HOME="$atlas_home" bash "$repo/system/install-companion.sh"
ATLAS_HOME="$atlas_home" bash "$repo/system/install-device-connections.sh"
ATLAS_HOME="$atlas_home" ATLAS_USER="$owner" bash "$repo/system/install-desktop.sh"
ATLAS_HOME="$atlas_home" ATLAS_USER="$owner" bash "$repo/system/install-spotify.sh"
ATLAS_HOME="$atlas_home" ATLAS_USER="$owner" bash "$repo/system/install-wake.sh"

test "$(tr -d '[:space:]' <"$atlas_home/.atlas/screen/mode")" = "$mode_before"
test "$(systemctl is-active atlas-screen-kiosk.service || true)" = "$kiosk_before"
test "$(systemctl is-active atlas-screen-black-overlay.service || true)" = "$overlay_before"
systemctl is-active --quiet atlas-webscreen.service atlas-companion.service
python3 - <<'PY'
import json
import ssl
import time
import urllib.request

context = ssl._create_unverified_context()
last_error = None
for _ in range(30):
    try:
        with urllib.request.urlopen(
            "https://127.0.0.1:5010/health", context=context, timeout=2
        ) as response:
            payload = json.load(response)
        if payload.get("service") == "atlas-companion" and payload.get("version") == "0.2.1":
            break
        last_error = RuntimeError(f"unexpected companion health: {payload!r}")
    except Exception as error:  # Service startup may briefly refuse the socket.
        last_error = error
    time.sleep(0.5)
else:
    raise SystemExit(f"companion health did not recover: {last_error}")
PY

printf 'ATLAS runtime deployed. Context backup: %s\n' "$backup"
