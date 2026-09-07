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
files=(server.py access_control.py gateway_bridge.mjs static/access.js static/app.js static/index.html static/navigation.js static/realtime.js static/styles.css
  static/new/face.css static/new/face.js static/new/audio.js static/new/petting.js static/new/logo.png static/new/atlas-wordmark.svg)
system_sources=(atlas-commands/atlas-screen atlas-commands/atlas-webscreen system/libexec/atlas-screen-kiosk-session system/libexec/atlas-screen-browser-watchdog.cjs)
system_targets=(usr/local/bin/atlas-screen usr/local/bin/atlas-webscreen usr/local/libexec/atlas-screen-kiosk-session usr/local/libexec/atlas-screen-browser-watchdog.cjs)
system_root=${ATLAS_SYSTEM_ROOT:-/}
command -v node >/dev/null || { echo "Node.js is required by the private-pipe kiosk watchdog." >&2; exit 1; }
for path in "${files[@]}"; do
  [[ -f "$repo/.atlas/webscreen/$path" ]] || { echo "Missing source: $path" >&2; exit 1; }
done
for path in "${system_sources[@]}"; do
  [[ -f "$repo/$path" ]] || { echo "Missing system source: $path" >&2; exit 1; }
done
backup="$atlas_home/.atlas/backups/webscreen-resilience-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$backup"
for path in "${files[@]}"; do
  install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$(dirname "$backup/$path")"
  install -d -m 755 -o "$atlas_user" -g "$atlas_group" "$(dirname "$runtime/$path")"
  if [[ -f "$runtime/$path" ]]; then cp -p -- "$runtime/$path" "$backup/$path"; fi
  install -m 644 -o "$atlas_user" -g "$atlas_group" "$repo/.atlas/webscreen/$path" "$runtime/$path"
done
for index in "${!system_sources[@]}"; do
  path=${system_targets[$index]}
  install -d -m 700 "$backup/system/$(dirname "$path")"
  install -d -m 755 "$system_root/$(dirname "$path")"
  if [[ -f "$system_root/$path" ]]; then cp -p -- "$system_root/$path" "$backup/system/$path"; fi
  install -m 755 -o root -g root "$repo/${system_sources[$index]}" "$system_root/$path"
done
printf 'WebScreen updated. Backup: %s\n' "$backup"
if [[ ${1:-} == --restart ]]; then
  systemctl restart atlas-webscreen.service
else
  echo 'Restart atlas-webscreen.service and reload browser tabs to activate.'
fi
echo 'Restart atlas-screen-kiosk.service once to activate the private-pipe browser watchdog; later design changes reuse Chrome.'
