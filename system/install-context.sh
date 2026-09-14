#!/usr/bin/env bash
# Install atlas-context and its private helper; safe to invoke as sami or root.
set -Eeuo pipefail

if (( EUID != 0 )); then
  exec sudo --preserve-env=ATLAS_HOME,ATLAS_USER,ATLAS_SYSTEM_ROOT -- "$0" "$@"
fi

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
system_root=${ATLAS_SYSTEM_ROOT:-/}

[[ -d $atlas_home ]] || { printf 'ATLAS home not found: %s\n' "$atlas_home" >&2; exit 1; }
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home")}
atlas_group=$(id -gn "$atlas_user")
system_bin="$system_root/usr/local/bin"
system_lib="$system_root/usr/local/lib/atlas"
conversation="$atlas_home/.atlas/context/conversation"

[[ ! -L $system_bin ]] || { printf 'Refusing linked system bin: %s\n' "$system_bin" >&2; exit 1; }
[[ ! -L $system_lib ]] || { printf 'Refusing linked ATLAS lib: %s\n' "$system_lib" >&2; exit 1; }

install -d -m 700 -o "$atlas_user" -g "$atlas_group" \
  "$atlas_home/.atlas" "$atlas_home/.atlas/backups" \
  "$atlas_home/.atlas/context" "$conversation"
install -d -m 755 -o root -g root "$system_bin" "$system_lib"

backup=""
backup_existing() {
  local target=$1 name=$2
  [[ -e $target || -L $target ]] || return 0
  if [[ -z $backup ]]; then
    backup="$atlas_home/.atlas/backups/context-command-$(date +%Y%m%d-%H%M%S)"
    install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$backup"
  fi
  cp -a -- "$target" "$backup/$name"
  chown -h "$atlas_user:$atlas_group" "$backup/$name"
}

install_component() {
  local source=$1 target=$2 name=$3
  if [[ -f $target ]] && cmp -s -- "$source" "$target"; then
    chmod 755 "$target"
    chown root:root "$target"
    return 0
  fi
  backup_existing "$target" "$name"
  install -m 755 -o root -g root "$source" "$target"
}

install_component \
  "$repo/system/libexec/atlas-contextctl" \
  "$system_lib/atlas-contextctl" \
  atlas-contextctl
install_component \
  "$repo/atlas-commands/atlas-context" \
  "$system_bin/atlas-context" \
  atlas-context

printf 'atlas-context installed for %s and root' "$atlas_user"
if [[ -n $backup ]]; then
  printf '. Backup: %s' "$backup"
fi
printf '\n'
