#!/usr/bin/env bash
# Install the virtual desktop/cast surface without starting it or changing a live cast.
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
atlas_installer_begin desktop-command

if [[ $system_root == / && ${ATLAS_SKIP_DEPENDENCY_CHECK:-0} != 1 ]]; then
  missing=()
  for command in Xvfb openbox feh unclutter xdpyinfo xdotool wmctrl ffmpeg \
    google-chrome-stable mkchromecast avahi-browse; do
    command -v "$command" >/dev/null 2>&1 || missing+=("$command")
  done
  python3 -c 'import pychromecast' >/dev/null 2>&1 || missing+=(python3-pychromecast)
  ((${#missing[@]} == 0)) || {
    printf 'Missing ATLAS Desktop dependencies: %s\n' "${missing[*]}" >&2
    exit 1
  }
fi

runtime="$atlas_home/.atlas/desktop"
install -d -m 755 -o "$atlas_user" -g "$atlas_group" \
  "$runtime/bin" "$runtime/config/openbox" "$runtime/wallpapers"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" \
  "$runtime/cast" "$runtime/chrome-profile" "$runtime/logs" \
  "$runtime/runtime" "$runtime/screenshots"

for command in atlas-desktop atlas-cast; do
  atlas_installer_file "$repo/atlas-commands/$command" \
    "$system_root/usr/local/bin/$command" 755 root root "system/usr/local/bin/$command"
done
for path in bin/open-chrome bin/start-desktop; do
  atlas_installer_file "$repo/.atlas/desktop/$path" "$runtime/$path" 755 \
    "$atlas_user" "$atlas_group" "runtime/desktop/$path"
done
atlas_installer_file "$repo/.atlas/desktop/config/openbox/rc.xml" \
  "$runtime/config/openbox/rc.xml" 644 "$atlas_user" "$atlas_group" \
  runtime/desktop/config/openbox/rc.xml
for name in atlas_wallpaper1.png atlas_wallpaper2.png; do
  atlas_installer_file "$repo/.atlas/desktop/wallpapers/$name" \
    "$runtime/wallpapers/$name" 644 "$atlas_user" "$atlas_group" \
    "runtime/desktop/wallpapers/$name"
done

active="$runtime/wallpapers/atlas-wallpaper.png"
if [[ ! -e $active && ! -L $active ]]; then
  ln -s atlas_wallpaper1.png "$active"
  chown -h "$atlas_user:$atlas_group" "$active"
  ATLAS_INSTALL_CHANGED=1
fi

staging=$(mktemp -d)
trap 'rm -rf -- "$staging"' EXIT
sed -e "s|^User=.*|User=$atlas_user|" -e "s|^Group=.*|Group=$atlas_group|" \
  -e "s|/home/atlas|$atlas_home|g" "$repo/system/systemd/atlas-desktop.service" \
  >"$staging/atlas-desktop.service"
atlas_installer_file "$staging/atlas-desktop.service" \
  "$system_root/etc/systemd/system/atlas-desktop.service" 644 root root \
  system/etc/systemd/system/atlas-desktop.service

for doc in ATLAS-DESKTOP.md ATLAS-CAST.md; do
  atlas_installer_file "$repo/.atlas/context/knowledge/atlas-commands/$doc" \
    "$atlas_home/.atlas/context/knowledge/atlas-commands/$doc" 644 \
    "$atlas_user" "$atlas_group" "runtime/context/knowledge/atlas-commands/$doc"
done

if [[ $system_root == / && $ATLAS_INSTALL_CHANGED == 1 ]]; then
  systemctl daemon-reload
fi
atlas_installer_finish 'ATLAS Desktop/Cast'
