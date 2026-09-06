#!/usr/bin/env bash
# Install atlas-chat with dated backups; safe to invoke as sami or root.
set -euo pipefail
if (( EUID != 0 )); then exec sudo -- "$0" "$@"; fi

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home")}
atlas_group=$(id -gn "$atlas_user")
venv="$atlas_home/.atlas/webscreen/.venv"
test -x "$venv/bin/python" || { echo "WebScreen venv not found: $venv" >&2; exit 1; }

backup="$atlas_home/.atlas/backups/chat-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$backup"
for path in /usr/local/bin/atlas-chat "$atlas_home/.atlas/chat/atlas_chat.py"; do
  if [[ -f $path ]]; then
    cp --parents -- "$path" "$backup/"
  fi
done

install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$atlas_home/.atlas/chat"
install -m 600 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/chat/atlas_chat.py" "$atlas_home/.atlas/chat/atlas_chat.py"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/chat/README.md" "$atlas_home/.atlas/chat/README.md"
install -m 755 "$repo/atlas-commands/atlas-chat" /usr/local/bin/atlas-chat

if ! "$venv/bin/python" -c 'import rich, websockets' >/dev/null 2>&1; then
  "$venv/bin/pip" install --disable-pip-version-check -r "$repo/.atlas/chat/requirements.txt"
fi

doc_dir="$atlas_home/.openclaw/workspace/atlas-commands"
install -d -m 755 -o "$atlas_user" -g "$atlas_group" "$doc_dir"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/openclaw/workspace/atlas-commands/ATLAS-CHAT.md" "$doc_dir/ATLAS-CHAT.md"

printf 'atlas-chat installed. Backup: %s\n' "$backup"
