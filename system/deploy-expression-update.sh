#!/usr/bin/env bash
# Scoped update: no account state, conversation history, screen mode or other service.
set -Eeuo pipefail
if (( EUID != 0 )); then exec sudo --preserve-env=ATLAS_HOME,ATLAS_USER -- "$0" "$@"; fi
[[ $# == 0 ]] || { echo 'Usage: deploy-expression-update.sh' >&2; exit 2; }
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
[[ "$atlas_home" == /* && "$atlas_home" != / ]] || exit 2
[[ -f "$atlas_home/.atlas/webscreen/start.sh" ]] || { echo 'Existing ATLAS runtime required' >&2; exit 1; }
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home")}
atlas_group=$(id -gn "$atlas_user")
files=(
  .atlas/webscreen/server.py .atlas/webscreen/face_state.py
  .atlas/webscreen/REALTIME_INSTRUCTIONS.md .atlas/webscreen/FACE.md
  .atlas/webscreen/static/app.js .atlas/webscreen/static/realtime.js
  .atlas/webscreen/static/index.html .atlas/webscreen/static/styles.css
  .atlas/webscreen/static/voice-prosody.js .atlas/webscreen/static/expression-events.js
  .atlas/webscreen/static/new/face.js .atlas/webscreen/static/new/face.css
  .atlas/webscreen/static/new/audio.js .atlas/webscreen/static/new/expressions-catalog.js
  .atlas/webscreen/static/new/expressions-catalog.json
  .atlas/context/knowledge/IDENTITY.md .atlas/context/knowledge/SOUL.md
  .atlas/context/knowledge/atlas-commands/ATLAS-FACE.md
)
for path in "${files[@]}" atlas-commands/atlas-face; do
  [[ -f "$repo/$path" && ! -L "$repo/$path" ]] || { echo "Missing source: $path" >&2; exit 1; }
done
backup=$(mktemp -d "$atlas_home/.atlas/backups/personality-20261016.XXXXXX")
chmod 700 "$backup"
screen_before=$(systemctl is-active atlas-screen-kiosk.service || true)
for path in "${files[@]}"; do
  target="$atlas_home/$path"
  [[ ! -L "$target" ]] || { echo "Refusing symlink: $path" >&2; exit 1; }
  install -d -m 700 "$backup/$(dirname -- "$path")"
  if [[ -f "$target" ]]; then cp -p -- "$target" "$backup/$path"; fi
  install -d -m 755 -o "$atlas_user" -g "$atlas_group" "$(dirname -- "$target")"
  install -m 644 -o "$atlas_user" -g "$atlas_group" "$repo/$path" "$target.personality-new"
  mv -f -- "$target.personality-new" "$target"
done
if [[ -f /usr/local/bin/atlas-face ]]; then cp -p /usr/local/bin/atlas-face "$backup/atlas-face"; fi
install -m 755 -o root -g root "$repo/atlas-commands/atlas-face" /usr/local/bin/atlas-face
systemctl restart atlas-webscreen.service
systemctl is-active --quiet atlas-webscreen.service
[[ "$(systemctl is-active atlas-screen-kiosk.service || true)" == "$screen_before" ]]
printf 'Scoped personality update installed. Backup: %s\n' "$backup"
printf 'Reload an existing WebScreen tab to activate its new browser scripts.\n'
