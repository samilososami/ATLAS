#!/usr/bin/env bash
# Install from this checkout, with dated backups. Does not alter voice processing.
set -euo pipefail
if (( EUID != 0 )); then exec sudo -- "$0" "$@"; fi
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
test -d "$atlas_home" || { echo 'ATLAS_HOME must be the existing Pi account home'; exit 1; }
owner=$(stat -c %U "$atlas_home")
backup="$atlas_home/.atlas/backups/companion-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup"
preserve() { if [[ -f $1 ]]; then cp --parents -- "$1" "$backup/"; fi; }
for name in atlas-rafas atlas-app; do
  preserve "/usr/local/bin/$name"
  install -m 755 "$repo/atlas-commands/$name" "/usr/local/bin/$name"
done
install -d -m 755 -o "$owner" -g "$owner" "$atlas_home/.atlas/companion"
for name in server.py crypto.py relay.py README.md; do
  preserve "$atlas_home/.atlas/companion/$name"
  install -m 644 "$repo/.atlas/companion/$name" "$atlas_home/.atlas/companion/$name"
done
preserve /etc/systemd/system/atlas-companion.service
# The source unit uses the reference Pi account; the installer resolves yours.
sed -e "s|^User=.*|User=$owner|" -e "s|^Group=.*|Group=$owner|" \
    -e "s|/home/atlas|$atlas_home|g" "$repo/system/systemd/atlas-companion.service" \
    | install -m 644 /dev/stdin /etc/systemd/system/atlas-companion.service
ATLAS_HOME="$atlas_home" /usr/local/bin/atlas-app init
python3 "$repo/system/install-companion-docs.py" "$repo" "$atlas_home" "$backup"
systemctl daemon-reload
systemctl enable --now atlas-companion.service
systemctl restart atlas-companion.service
printf 'Installed. Backup: %s\n' "$backup"
echo 'Pair from a private local terminal: atlas-app pair'
