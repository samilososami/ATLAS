#!/usr/bin/env bash
# Targeted WebScreen update; never replace settings, OAuth or private context.
set -euo pipefail
if (( EUID != 0 )); then exec sudo -- "$0" "$@"; fi
case "${1:-}" in
  ''|--restart) ;;
  *) echo "usage: $0 [--restart]" >&2; exit 2 ;;
esac
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
runtime="$atlas_home/.atlas/webscreen"
[[ -f "$runtime/start.sh" ]] || { echo "Existing WebScreen installation not found" >&2; exit 1; }
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home")}
atlas_group=$(id -gn "$atlas_user")
files=(server.py access_control.py gateway_bridge.mjs static/access.js static/app.js static/index.html static/realtime.js static/styles.css)
for path in "${files[@]}"; do
  [[ -f "$repo/.atlas/webscreen/$path" ]] || { echo "Missing source: $path" >&2; exit 1; }
done
backup="$atlas_home/.atlas/backups/webscreen-resilience-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$backup/static"
for path in "${files[@]}"; do
  if [[ -f "$runtime/$path" ]]; then cp -p -- "$runtime/$path" "$backup/$path"; fi
  install -m 644 -o "$atlas_user" -g "$atlas_group" "$repo/.atlas/webscreen/$path" "$runtime/$path"
done
printf 'WebScreen updated. Backup: %s\n' "$backup"
if [[ ${1:-} == --restart ]]; then
  systemctl restart atlas-webscreen.service
else
  echo 'Restart atlas-webscreen.service and reload browser tabs to activate.'
fi
