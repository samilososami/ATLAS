#!/usr/bin/env bash
# Deploy a prepared ATLAS runtime checkout on A1 without waking its display.
set -Eeuo pipefail

if (( EUID != 0 )); then
  exec sudo -- "$0" "$@"
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
test "$mode_before" = atlas-hide

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

workspace="$atlas_home/.openclaw/workspace"
install_context_doc "$repo/.atlas/webscreen/REALTIME_INSTRUCTIONS.md" "$atlas_home/.atlas/webscreen/REALTIME_INSTRUCTIONS.md"
install_context_doc "$repo/openclaw/workspace/AGENTS.md" "$workspace/AGENTS.md"
install_context_doc "$repo/openclaw/workspace/ATLAS-CONNECTIONS.md" "$workspace/ATLAS-CONNECTIONS.md"
install_context_doc "$repo/openclaw/workspace/ENVIRONMENT.md" "$workspace/ENVIRONMENT.md"
install_context_doc "$repo/openclaw/workspace/README.md" "$workspace/README.md"
install_context_doc "$repo/openclaw/workspace/TOOLS.md" "$workspace/TOOLS.md"
install_context_doc "$repo/openclaw/workspace/atlas-commands/ATLAS-WEBSCREEN.md" "$workspace/atlas-commands/ATLAS-WEBSCREEN.md"
install_context_doc "$repo/atlas-commands/README.md" "$workspace/atlas-commands/README.md"

ATLAS_HOME="$atlas_home" bash "$repo/system/install-webscreen-resilience.sh" --restart
ATLAS_HOME="$atlas_home" bash "$repo/system/install-chat.sh"
ATLAS_HOME="$atlas_home" bash "$repo/system/install-companion.sh"

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
