#!/usr/bin/env bash
# Install ATLAS Spotify control/player without replacing private OAuth state.
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
atlas_uid=$(id -u "$atlas_user")
# shellcheck source=system/lib/install-focused-runtime.sh
source "$repo/system/lib/install-focused-runtime.sh"
atlas_installer_begin spotify-command

if [[ $system_root == / && ${ATLAS_SKIP_DEPENDENCY_CHECK:-0} != 1 ]]; then
  for command in curl sha512sum tar playerctl; do
    command -v "$command" >/dev/null 2>&1 || {
      printf 'Missing ATLAS Spotify dependency: %s\n' "$command" >&2
      exit 1
    }
  done
fi

spotify="$atlas_home/.atlas/spotify"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" \
  "$spotify" "$spotify/spotifyd" "$spotify/spotifyd/cache"
atlas_installer_file "$repo/atlas-commands/atlas-spotify" \
  "$system_root/usr/local/bin/atlas-spotify" 755 root root \
  system/usr/local/bin/atlas-spotify
atlas_installer_file "$repo/system/libexec/atlas-spotifyctl" \
  "$system_root/usr/local/lib/atlas/atlas-spotifyctl" 755 root root \
  system/usr/local/lib/atlas/atlas-spotifyctl
atlas_installer_file "$repo/system/libexec/atlas-spotify-history" \
  "$system_root/usr/local/libexec/atlas-spotify-history" 755 root root \
  system/usr/local/libexec/atlas-spotify-history
atlas_installer_file "$repo/.atlas/spotify/spotifyd/spotifyd.conf" \
  "$spotify/spotifyd/spotifyd.conf" 600 "$atlas_user" "$atlas_group" \
  runtime/spotify/spotifyd/spotifyd.conf

spotifyd="$system_root/usr/local/bin/spotifyd"
if [[ ! -x $spotifyd ]]; then
  [[ $system_root == / && ${ATLAS_SKIP_DEPENDENCY_CHECK:-0} != 1 ]] || {
    printf 'spotifyd missing from isolated fixture: %s\n' "$spotifyd" >&2
    exit 1
  }
  case $(uname -m) in
    aarch64|arm64)
      asset=spotifyd-linux-aarch64-default.tar.gz
      digest=23d7f48a05895b25722c467178d17c6c3f1e67efe0e2eea42a5362d61f0b46927635cc30d61ef64f7e1147523fafbaeda8bda9afe36cebccb704bdaf3d9a61e9
      ;;
    x86_64|amd64)
      asset=spotifyd-linux-x86_64-default.tar.gz
      digest=c2b73784bf904d40d9a58f6c43e215a7be448f01039ae899ca5dbe4cdb9369d77e4d43c3a1e63fef7ca5adda365eac37f1d91c1e8018391afa907660552bd8db
      ;;
    *) printf 'Unsupported spotifyd architecture: %s\n' "$(uname -m)" >&2; exit 1 ;;
  esac
  staging_binary=$(mktemp -d)
  trap 'rm -rf -- "$staging_binary"' EXIT
  curl -fsSL "https://github.com/Spotifyd/spotifyd/releases/download/v0.4.2/$asset" \
    -o "$staging_binary/$asset"
  printf '%s  %s\n' "$digest" "$staging_binary/$asset" | sha512sum -c -
  tar -xzf "$staging_binary/$asset" -C "$staging_binary" spotifyd
  atlas_installer_file "$staging_binary/spotifyd" "$spotifyd" 755 root root \
    system/usr/local/bin/spotifyd
fi

staging_units=$(mktemp -d)
trap 'rm -rf -- "$staging_units" ${staging_binary:-}' EXIT
for unit in atlas-spotifyd.service atlas-spotify-history.service; do
  sed -e "s|^User=.*|User=$atlas_user|" -e "s|^Group=.*|Group=$atlas_group|" \
    -e "s|/home/atlas|$atlas_home|g" -e "s|/run/user/1000|/run/user/$atlas_uid|g" \
    "$repo/system/systemd/$unit" >"$staging_units/$unit"
  atlas_installer_file "$staging_units/$unit" "$system_root/etc/systemd/user/$unit" \
    644 root root "system/etc/systemd/user/$unit"
done
atlas_installer_file "$repo/.atlas/context/knowledge/atlas-commands/ATLAS-SPOTIFY.md" \
  "$atlas_home/.atlas/context/knowledge/atlas-commands/ATLAS-SPOTIFY.md" 644 \
  "$atlas_user" "$atlas_group" runtime/context/knowledge/atlas-commands/ATLAS-SPOTIFY.md

if [[ $system_root == / && $ATLAS_INSTALL_CHANGED == 1 ]]; then
  atlas_installer_run_as_user systemctl --user daemon-reload
  atlas_installer_run_as_user systemctl --user enable --now \
    atlas-spotifyd.service atlas-spotify-history.service
fi
atlas_installer_finish 'ATLAS Spotify'
