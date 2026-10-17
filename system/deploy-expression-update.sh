#!/usr/bin/env bash
# Scoped update: no account state, conversation history, screen mode or other service.
set -Eeuo pipefail
if (( EUID != 0 )); then exec sudo --preserve-env=ATLAS_HOME,ATLAS_USER -- "$0" "$@"; fi
catalog_only=false
if [[ $# == 1 && $1 == --catalog-only ]]; then catalog_only=true
elif [[ $# != 0 ]]; then echo 'Usage: deploy-expression-update.sh [--catalog-only]' >&2; exit 2
fi
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
[[ "$atlas_home" == /* && "$atlas_home" != / ]] || exit 2
atlas_home=${atlas_home%/}
[[ "$atlas_home" != / ]] || exit 2
[[ "$(realpath -e -- "$atlas_home")" == "$atlas_home" ]] || { echo 'ATLAS_HOME must be a canonical existing directory, without symlink ancestors' >&2; exit 2; }
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
if "$catalog_only"; then
  # Exactly nine files. In particular, preserve the server, private personality,
  # broker, browser settings/application, CLI and every other live subsystem.
  files=(
    .atlas/webscreen/face_state.py .atlas/webscreen/FACE.md
    .atlas/webscreen/static/realtime.js
    .atlas/webscreen/static/new/face.js .atlas/webscreen/static/new/face.css
    .atlas/webscreen/static/new/audio.js .atlas/webscreen/static/new/expressions-catalog.js
    .atlas/webscreen/static/new/expressions-catalog.json
    .atlas/context/knowledge/atlas-commands/ATLAS-FACE.md
  )
fi
sources=("${files[@]}")
if ! "$catalog_only"; then sources+=(atlas-commands/atlas-face); fi
for path in "${sources[@]}"; do
  [[ -f "$repo/$path" && ! -L "$repo/$path" ]] || { echo "Missing source: $path" >&2; exit 1; }
done
# Preflight the whole destination set before replacing anything. Checking only
# the final file misses symlinked parent directories and staging-file symlinks.
for path in "${files[@]}" .atlas/backups; do
  target="$atlas_home/$path"
  [[ "$(realpath -m -- "$target")" == "$target" && ! -L "$target" && ! -L "$target.personality-new" ]] \
    || { echo "Refusing noncanonical/symlink target: $path" >&2; exit 1; }
done
for path in "${files[@]}"; do
  [[ ! -e "$atlas_home/$path" || -f "$atlas_home/$path" ]] \
    || { echo "Refusing non-file target: $path" >&2; exit 1; }
done
if ! "$catalog_only"; then
  [[ ! -L /usr/local/bin/atlas-face && "$(realpath -m /usr/local/bin/atlas-face)" == /usr/local/bin/atlas-face ]] \
    || { echo 'Refusing symlinked atlas-face CLI target' >&2; exit 1; }
fi
install -d -m 700 "$atlas_home/.atlas/backups"
backup=$(mktemp -d "$atlas_home/.atlas/backups/expression-update-$(date +%Y%m%d).XXXXXX")
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
if ! "$catalog_only"; then
  if [[ -f /usr/local/bin/atlas-face ]]; then cp -p /usr/local/bin/atlas-face "$backup/atlas-face"; fi
  install -m 755 -o root -g root "$repo/atlas-commands/atlas-face" /usr/local/bin/atlas-face
fi
systemctl restart atlas-webscreen.service
systemctl is-active --quiet atlas-webscreen.service
[[ "$(systemctl is-active atlas-screen-kiosk.service || true)" == "$screen_before" ]]
printf 'Scoped expression update installed (catalog-only=%s). Backup: %s\n' "$catalog_only" "$backup"
printf 'Reload an existing WebScreen tab to activate its new browser scripts.\n'
