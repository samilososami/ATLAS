#!/usr/bin/env bash
# Rebuild whisper.cpp below .atlas without retaining build paths from OpenClaw.
set -Eeuo pipefail

atlas_home=${ATLAS_HOME:-/home/atlas}
atlas_user=${ATLAS_USER:-$(stat -c %U "$atlas_home")}
whisper_root=${ATLAS_WHISPER_ROOT:-$atlas_home/.atlas/tools/whisper.cpp}
expected_root="$(realpath -m "$atlas_home")/.atlas/tools/whisper.cpp"
[[ $(realpath -m "$whisper_root") == "$expected_root" && ! -L "$whisper_root" ]] || {
  echo "Refusing a Whisper root outside the canonical .atlas/tools path." >&2
  exit 1
}

if (( EUID == 0 )); then
  exec runuser -u "$atlas_user" -- env \
    ATLAS_HOME="$atlas_home" ATLAS_USER="$atlas_user" \
    ATLAS_WHISPER_ROOT="$whisper_root" PATH="$PATH" \
    bash "$0" "$@"
fi

[[ $(id -un) == "$atlas_user" ]] || {
  echo "Run as $atlas_user or root (ATLAS_USER selects the runtime owner)." >&2
  exit 1
}
[[ -f "$whisper_root/CMakeLists.txt" ]] || {
  echo "Whisper source is missing: $whisper_root/CMakeLists.txt" >&2
  exit 1
}
model="$whisper_root/models/ggml-tiny.bin"
[[ -f "$model" && ! -L "$model" ]] || {
  echo "Whisper model is missing or linked: $model" >&2
  exit 1
}
for command in cmake readelf ldd; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

stage=$(mktemp -d "$whisper_root/.atlas-build.XXXXXX")
backup_root="$atlas_home/.atlas/backups/whisper-runtime-$(date +%Y%m%d-%H%M%S-%N)"
old_build="$backup_root/build"
swapped=0
cleanup() {
  rc=$?
  if [[ $swapped == 1 && $rc != 0 ]]; then
    if [[ -e "$whisper_root/build" || -L "$whisper_root/build" ]]; then
      mv -- "$whisper_root/build" "$backup_root/build.failed"
    fi
    if [[ -d $old_build ]]; then
      mv -- "$old_build" "$whisper_root/build"
    fi
  elif [[ $swapped == 0 && -d $stage ]]; then
    rm -rf -- "$stage"
  fi
  exit "$rc"
}
trap cleanup EXIT

generator=()
command -v ninja >/dev/null && generator=(-G Ninja)
jobs=${ATLAS_WHISPER_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)}
cmake -S "$whisper_root" -B "$stage" "${generator[@]}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DWHISPER_BUILD_SERVER=OFF \
  -DWHISPER_SDL2=OFF \
  -DCMAKE_BUILD_RPATH_USE_ORIGIN=ON \
  -DCMAKE_BUILD_RPATH=\$ORIGIN \
  -DCMAKE_INSTALL_RPATH=\$ORIGIN
cmake --build "$stage" --target whisper-cli --parallel "$jobs"

candidate="$stage/bin/whisper-cli"
[[ -x $candidate && ! -L $candidate ]] || {
  echo "The standalone build did not create bin/whisper-cli" >&2
  exit 1
}
dynamic=$(readelf -d "$candidate")
[[ ${dynamic,,} != *openclaw* ]] || { echo "New binary retains an OpenClaw path" >&2; exit 1; }
if grep -E '\((RPATH|RUNPATH)\).*\[/[^]]*\]' <<<"$dynamic" >/dev/null; then
  echo "New binary contains an absolute runtime library path" >&2
  exit 1
fi
resolved=$(ldd "$candidate")
[[ ${resolved,,} != *openclaw* && ${resolved,,} != *"not found"* ]] || {
  echo "New binary does not resolve independently" >&2
  exit 1
}

install -d -m 700 "$backup_root"
if [[ -e "$whisper_root/build" || -L "$whisper_root/build" ]]; then
  mv -- "$whisper_root/build" "$old_build"
fi
if ! mv -- "$stage" "$whisper_root/build"; then
  [[ ! -d $old_build ]] || mv -- "$old_build" "$whisper_root/build"
  exit 1
fi
swapped=1

dynamic=$(readelf -d "$whisper_root/build/bin/whisper-cli")
resolved=$(ldd "$whisper_root/build/bin/whisper-cli")
[[ ${dynamic,,} != *openclaw* && ${resolved,,} != *openclaw* ]] || {
  echo "Installed Whisper runtime still refers to OpenClaw" >&2
  exit 1
}
[[ ${resolved,,} != *"not found"* ]] || {
  echo "Installed Whisper runtime has unresolved libraries" >&2
  exit 1
}
swapped=2
echo "Standalone Whisper runtime rebuilt: $whisper_root/build/bin/whisper-cli"
if [[ -d $old_build ]]; then
  echo "Previous build preserved at: $old_build"
fi
