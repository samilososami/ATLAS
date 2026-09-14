#!/usr/bin/env bash
# Shared primitives for focused ATLAS runtime installers.
#
# Callers define atlas_home, atlas_user, atlas_group and system_root before
# sourcing this file, then call atlas_installer_begin with a short component
# name. Backups are created lazily: an identical second install does not create
# another empty backup directory or rewrite an unchanged file.

set -Eeuo pipefail

atlas_installer_begin() {
  local component=$1
  [[ -n $component ]] || { echo "ATLAS installer component is empty" >&2; return 2; }
  [[ -d ${atlas_home:-} ]] || {
    printf 'ATLAS home not found: %s\n' "${atlas_home:-unset}" >&2
    return 1
  }
  [[ -n ${atlas_user:-} && -n ${atlas_group:-} && -n ${system_root:-} ]] || {
    echo "ATLAS installer identity is incomplete" >&2
    return 1
  }
  ATLAS_INSTALL_COMPONENT=$component
  ATLAS_INSTALL_BACKUP=""
  ATLAS_INSTALL_CHANGED=0
  install -d -m 700 -o "$atlas_user" -g "$atlas_group" \
    "$atlas_home/.atlas" "$atlas_home/.atlas/backups"
}

atlas_installer_backup_dir() {
  if [[ -z ${ATLAS_INSTALL_BACKUP:-} ]]; then
    ATLAS_INSTALL_BACKUP="$atlas_home/.atlas/backups/${ATLAS_INSTALL_COMPONENT}-$(date +%Y%m%d-%H%M%S-%N)"
    install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$ATLAS_INSTALL_BACKUP"
  fi
}

atlas_installer_preserve() {
  local target=$1 relative=$2 backup
  [[ -e $target || -L $target ]] || return 0
  atlas_installer_backup_dir
  backup=$ATLAS_INSTALL_BACKUP
  install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$(dirname -- "$backup/$relative")"
  cp -a -- "$target" "$backup/$relative"
  chown -h "$atlas_user:$atlas_group" "$backup/$relative"
}

atlas_installer_same_file() {
  local source=$1 target=$2 mode=$3 owner=$4 group=$5
  [[ -f $target && ! -L $target ]] || return 1
  cmp -s -- "$source" "$target" || return 1
  [[ $(stat -c %a "$target") == "$mode" ]] || return 1
  [[ $(stat -c %U "$target") == "$owner" ]] || return 1
  [[ $(stat -c %G "$target") == "$group" ]] || return 1
}

atlas_installer_file() {
  local source=$1 target=$2 mode=$3 owner=$4 group=$5 relative=$6
  [[ -f $source && ! -L $source ]] || {
    printf 'Missing regular installer source: %s\n' "$source" >&2
    return 1
  }
  if atlas_installer_same_file "$source" "$target" "$mode" "$owner" "$group"; then
    return 0
  fi
  atlas_installer_preserve "$target" "$relative"
  install -d -m 755 -o "$owner" -g "$group" "$(dirname -- "$target")"
  install -m "$mode" -o "$owner" -g "$group" "$source" "$target"
  ATLAS_INSTALL_CHANGED=1
}

atlas_installer_run_as_user() {
  local uid
  uid=$(id -u "$atlas_user")
  if [[ $atlas_user == root ]]; then
    env HOME="$atlas_home" XDG_RUNTIME_DIR="/run/user/$uid" "$@"
  else
    runuser -u "$atlas_user" -- env \
      HOME="$atlas_home" USER="$atlas_user" LOGNAME="$atlas_user" \
      XDG_RUNTIME_DIR="/run/user/$uid" \
      DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" \
      "$@"
  fi
}

atlas_installer_finish() {
  local label=$1
  if (( ATLAS_INSTALL_CHANGED )); then
    printf '%s installed for %s and root' "$label" "$atlas_user"
    if [[ -n ${ATLAS_INSTALL_BACKUP:-} ]]; then
      printf '. Backup: %s' "$ATLAS_INSTALL_BACKUP"
    fi
    printf '\n'
  else
    printf '%s already up to date for %s and root\n' "$label" "$atlas_user"
  fi
}
