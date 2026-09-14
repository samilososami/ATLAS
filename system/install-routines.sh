#!/usr/bin/env bash
# Install the routine engine without replacing the live registry.
set -euo pipefail
if (( EUID != 0 )); then exec sudo --preserve-env=ATLAS_HOME,ATLAS_USER -- "$0" "$@"; fi

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home")}
atlas_group=$(id -gn "$atlas_user")
target="$atlas_home/.atlas/routines"
backup="$atlas_home/.atlas/backups/routines-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$backup" "$target"

for path in /usr/local/bin/atlas-routines "$target/routine_engine.py" \
  "$target/atlas_routines.py" "$target/README.md" "$target/EXAMPLES.md" \
  "$atlas_home/.atlas/webscreen/server.py" "$atlas_home/.atlas/webscreen/static/realtime.js" \
  "$atlas_home/.atlas/webscreen/static/index.html" \
  "$atlas_home/.atlas/webscreen/REALTIME_INSTRUCTIONS.md" \
  "$atlas_home/.atlas/webscreen/README.md" \
  "$atlas_home/.atlas/chat/atlas_chat.py" "$atlas_home/.atlas/chat/README.md" \
  "$atlas_home/.atlas/chat/TERMINAL_INSTRUCTIONS.md" \
  "$atlas_home/.atlas/context/knowledge/AGENTS.md" \
  "$atlas_home/.atlas/context/knowledge/TOOLS.md" \
  "$atlas_home/.atlas/context/knowledge/TDR.md" \
  "$atlas_home/.atlas/context/knowledge/README.md" \
  "$atlas_home/.atlas/context/knowledge/atlas-commands/ATLAS-ROUTINES.md"; do
  [[ ! -f $path ]] || cp --parents -- "$path" "$backup/"
done
[[ ! -f $target/ROUTINES.md ]] || cp --parents -- "$target/ROUTINES.md" "$backup/"

install -m 600 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/routines/routine_engine.py" "$target/routine_engine.py"
install -m 600 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/routines/atlas_routines.py" "$target/atlas_routines.py"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/routines/README.md" "$target/README.md"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/routines/EXAMPLES.md" "$target/EXAMPLES.md"
if [[ ! -f $target/ROUTINES.md ]]; then
  install -m 600 -o "$atlas_user" -g "$atlas_group" \
    "$repo/.atlas/routines/ROUTINES.md" "$target/ROUTINES.md"
fi
install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$target/logs" "$target/results"
install -m 755 "$repo/atlas-commands/atlas-routines" /usr/local/bin/atlas-routines

install -m 600 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/webscreen/server.py" "$atlas_home/.atlas/webscreen/server.py"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/webscreen/static/realtime.js" "$atlas_home/.atlas/webscreen/static/realtime.js"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/webscreen/static/index.html" "$atlas_home/.atlas/webscreen/static/index.html"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/webscreen/REALTIME_INSTRUCTIONS.md" "$atlas_home/.atlas/webscreen/REALTIME_INSTRUCTIONS.md"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/webscreen/README.md" "$atlas_home/.atlas/webscreen/README.md"
install -m 600 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/chat/atlas_chat.py" "$atlas_home/.atlas/chat/atlas_chat.py"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/chat/README.md" "$atlas_home/.atlas/chat/README.md"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/chat/TERMINAL_INSTRUCTIONS.md" "$atlas_home/.atlas/chat/TERMINAL_INSTRUCTIONS.md"

doc_dir="$atlas_home/.atlas/context/knowledge/atlas-commands"
install -d -m 755 -o "$atlas_user" -g "$atlas_group" "$doc_dir"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/.atlas/context/knowledge/atlas-commands/ATLAS-ROUTINES.md" "$doc_dir/ATLAS-ROUTINES.md"
for file in AGENTS.md TOOLS.md TDR.md README.md; do
  install -m 644 -o "$atlas_user" -g "$atlas_group" \
    "$repo/.atlas/context/knowledge/$file" "$atlas_home/.atlas/context/knowledge/$file"
done

printf 'atlas-routines installed. Live registry preserved. Backup: %s\n' "$backup"
