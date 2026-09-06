#!/usr/bin/env bash
# Install the bounded Bluetooth/ADB reliability fixes. No global service reset.
set -euo pipefail
if (( EUID != 0 )); then exec sudo -- "$0" "$@"; fi
case "${1:-}" in
  ''|--restart-audio-manager) ;;
  *) echo "usage: $0 [--restart-audio-manager]" >&2; exit 2 ;;
esac
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home")}
atlas_group=$(id -gn "$atlas_user")
atlas_uid=$(id -u "$atlas_user")
wp_conf="$atlas_home/.config/wireplumber/wireplumber.conf.d"
backup="$atlas_home/.atlas/backups/device-connections-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$backup"
for path in /usr/local/bin/atlas-audio /usr/local/bin/adb \
  /usr/local/libexec/atlas-adb-monitor /usr/local/libexec/atlas-adb-inventory \
  /etc/systemd/system/atlas-adb-monitor.service \
  "$wp_conf/51-atlas-headless-bluetooth.conf"; do
  if [[ -f $path ]]; then cp --parents -- "$path" "$backup/"; fi
done
install -d -m 755 -o "$atlas_user" -g "$atlas_group" "$wp_conf"
install -m 644 -o "$atlas_user" -g "$atlas_group" \
  "$repo/system/config/wireplumber/51-atlas-headless-bluetooth.conf" "$wp_conf/"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$atlas_home/.android"
install -m 755 "$repo/atlas-commands/atlas-audio" /usr/local/bin/atlas-audio
install -m 755 "$repo/system/bin/adb" /usr/local/bin/adb
install -m 755 "$repo/system/libexec/atlas-adb-monitor" /usr/local/libexec/atlas-adb-monitor
install -m 755 "$repo/system/libexec/atlas-adb-inventory" /usr/local/libexec/atlas-adb-inventory
install -m 644 "$repo/system/systemd/atlas-adb-monitor.service" /etc/systemd/system/
systemctl daemon-reload
if [[ ${1:-} == --restart-audio-manager ]]; then
  # Do not restart bluetooth, pipewire, pipewire-pulse or the voice browser.
  runuser -u "$atlas_user" -- env HOME="$atlas_home" \
    XDG_RUNTIME_DIR="/run/user/$atlas_uid" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$atlas_uid/bus" \
    systemctl --user restart wireplumber.service
fi
printf 'Device connection fixes installed. Backup: %s\n' "$backup"
if [[ ${1:-} != --restart-audio-manager ]]; then
  echo 'The new WirePlumber configuration applies at its next restart/login.'
fi
