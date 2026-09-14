#!/usr/bin/env bash
# Install the ATLAS Native Broker and its pinned Codex CLI runtime.
#
# This installer deliberately never reads, writes, copies or prints Codex OAuth.
# The existing $ATLAS_HOME/.codex/auth.json remains owned by the ATLAS user.
set -Eeuo pipefail

if (( EUID != 0 )); then
  exec sudo --preserve-env=ATLAS_HOME,ATLAS_USER,ATLAS_SYSTEM_ROOT,ATLAS_NPM_BIN -- "$0" "$@"
fi

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
atlas_home=${ATLAS_HOME:-/home/atlas}
system_root=${ATLAS_SYSTEM_ROOT:-/}
codex_version=0.147.0

[[ -d $atlas_home ]] || { echo "ATLAS home not found: $atlas_home" >&2; exit 1; }
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home")}
atlas_group=$(id -gn "$atlas_user")
broker_source="$repo/.atlas/broker"
broker_target="$atlas_home/.atlas/broker"
npm_prefix="$atlas_home/.npm-global"
codex_runtime="$npm_prefix/bin/codex"
system_bin="$system_root/usr/local/bin"

runtime_files=(__init__.py __main__.py cli.py native_broker.py)
for file in "${runtime_files[@]}"; do
  [[ -f $broker_source/$file ]] || { echo "Missing Native Broker source: $file" >&2; exit 1; }
done
[[ -f $repo/atlas-commands/atlas-broker ]] || { echo "Missing atlas-broker wrapper" >&2; exit 1; }

install -d -m 755 -o "$atlas_user" -g "$atlas_group" \
  "$atlas_home/.atlas" "$atlas_home/.atlas/backups" "$npm_prefix" "$npm_prefix/bin"
backup="$atlas_home/.atlas/backups/native-broker-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$backup"

if [[ -d $broker_target ]]; then
  cp -a -- "$broker_target" "$backup/broker"
fi

run_as_atlas() {
  if [[ $atlas_user == root ]]; then
    env HOME="$atlas_home" "$@"
  elif command -v runuser >/dev/null 2>&1; then
    runuser -u "$atlas_user" -- env HOME="$atlas_home" "$@"
  else
    sudo -u "$atlas_user" -H -- env HOME="$atlas_home" "$@"
  fi
}

installed_version=""
if [[ -x $codex_runtime ]]; then
  installed_version=$("$codex_runtime" --version 2>/dev/null | awk 'NF { print $NF; exit }' || true)
fi
if [[ $installed_version != "$codex_version" ]]; then
  npm_bin=${ATLAS_NPM_BIN:-$(command -v npm || true)}
  [[ -n $npm_bin && -x $npm_bin ]] || {
    echo "npm is required to install @openai/codex@$codex_version" >&2
    exit 1
  }
  run_as_atlas env \
    NPM_CONFIG_PREFIX="$npm_prefix" \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    "$npm_bin" install --global --no-audit --no-fund "@openai/codex@$codex_version"
fi

[[ -x $codex_runtime ]] || { echo "Codex CLI was not installed at $codex_runtime" >&2; exit 1; }
installed_version=$("$codex_runtime" --version 2>/dev/null | awk 'NF { print $NF; exit }' || true)
[[ $installed_version == "$codex_version" ]] || {
  echo "Unexpected Codex CLI version: ${installed_version:-unknown} (expected $codex_version)" >&2
  exit 1
}

install -d -m 700 -o "$atlas_user" -g "$atlas_group" "$broker_target"
for file in "${runtime_files[@]}"; do
  install -m 600 -o "$atlas_user" -g "$atlas_group" \
    "$broker_source/$file" "$broker_target/$file"
done

install -d -m 755 -o root -g root "$system_bin"
for command in codex atlas-broker; do
  destination="$system_bin/$command"
  if [[ -e $destination || -L $destination ]]; then
    cp -a -- "$destination" "$backup/$command"
  fi
done
ln -sfn -- "$codex_runtime" "$system_bin/codex"
install -m 755 -o root -g root "$repo/atlas-commands/atlas-broker" "$system_bin/atlas-broker"

# Import and argument parsing are verified without starting app-server and
# without touching the OAuth store.
run_as_atlas env \
  ATLAS_HOME="$atlas_home" \
  CODEX_HOME="$atlas_home/.codex" \
  PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 "$broker_target/cli.py" --help >/dev/null

printf 'ATLAS Native Broker installed (Codex CLI %s). Backup: %s\n' "$codex_version" "$backup"
