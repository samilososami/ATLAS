#!/usr/bin/env python3
"""Copy legacy OpenClaw-owned ATLAS data into the standalone ATLAS layout.

The source tree is deliberately preserved.  The migration is idempotent and
backs up any destination it is about to replace.  Secret values are never
written to stdout/stderr.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import stat
import subprocess
import tempfile
from typing import NoReturn


STATE_FILES = ("CONTEXT.md", "REVISION", "COMPACT_REQUEST")
MARKER_NAME = ".openclaw-workspace-migrated-v1"


def fail(message: str) -> NoReturn:
    raise SystemExit(f"migration refused: {message}")


def load_object(path: Path, label: str) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError) as error:
        fail(f"{label} is not valid JSON ({error.__class__.__name__})")
    if not isinstance(value, dict):
        fail(f"{label} must contain a JSON object")
    return value


def nested(value: dict, *parts: str):
    current = value
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def legacy_values(config: dict) -> dict:
    tavily = nested(config, "plugins", "entries", "tavily") or {}
    tavily_config = tavily.get("config") if isinstance(tavily, dict) else {}
    if not isinstance(tavily_config, dict):
        tavily_config = {}
    tavily_web_search = tavily_config.get("webSearch")
    if not isinstance(tavily_web_search, dict):
        tavily_web_search = {}
    sag = nested(config, "skills", "entries", "sag") or {}
    sag_env = sag.get("env") if isinstance(sag, dict) else {}
    if not isinstance(sag_env, dict):
        sag_env = {}
    eleven = nested(config, "plugins", "entries", "elevenlabs") or {}
    eleven_config = eleven.get("config") if isinstance(eleven, dict) else {}
    if not isinstance(eleven_config, dict):
        eleven_config = {}

    api_key = None
    if isinstance(sag, dict):
        api_key = sag.get("apiKey")
    if not isinstance(api_key, str) or not api_key:
        api_key = eleven_config.get("apiKey")
    if (not isinstance(api_key, str) or not api_key) and isinstance(eleven, dict):
        api_key = eleven.get("apiKey")

    voice_id = sag_env.get("ELEVENLABS_VOICE_ID") or sag_env.get("SAG_VOICE_ID")
    if not isinstance(voice_id, str) or not voice_id:
        voice_id = eleven_config.get("voiceId")
    if (not isinstance(voice_id, str) or not voice_id) and isinstance(eleven, dict):
        voice_id = eleven.get("voiceId")

    result: dict[str, dict] = {}
    tavily_out = {}
    tavily_key = tavily_config.get("apiKey") or tavily_web_search.get("apiKey")
    if isinstance(tavily_key, str) and tavily_key:
        tavily_out["apiKey"] = tavily_key
    if tavily_out:
        result["tavily"] = tavily_out
    eleven_out = {}
    if isinstance(api_key, str) and api_key:
        eleven_out["apiKey"] = api_key
    if isinstance(voice_id, str) and voice_id:
        eleven_out["voiceId"] = voice_id
    if eleven_out:
        result["elevenlabs"] = eleven_out
    return result


def merge_missing(destination: dict, source: dict, overwrite: bool) -> bool:
    changed = False
    for key, value in source.items():
        if isinstance(value, dict):
            current = destination.get(key)
            if not isinstance(current, dict):
                if key not in destination or overwrite:
                    destination[key] = {}
                    current = destination[key]
                    changed = True
                else:
                    continue
            changed = merge_missing(current, value, overwrite) or changed
        elif key not in destination or overwrite:
            if destination.get(key) != value:
                destination[key] = value
                changed = True
    return changed


def assert_safe_target(home: Path, target: Path) -> None:
    try:
        relative = target.relative_to(home)
    except ValueError:
        fail("a destination is outside ATLAS_HOME")
    current = home
    for part in relative.parts:
        current /= part
        if current.is_symlink():
            fail(f"destination path contains a symlink: {current}")


def validate_destination_symlinks(source: Path, destination: Path) -> None:
    """Allow only links that already exactly mirror a link in the legacy tree."""
    if not destination.exists():
        return
    for root, directories, files in os.walk(destination, followlinks=False):
        for name in directories + files:
            copied = Path(root, name)
            if not copied.is_symlink():
                continue
            relative = copied.relative_to(destination)
            legacy = source / relative
            if not legacy.is_symlink() or os.readlink(legacy) != os.readlink(copied):
                fail("standalone destination contains an unexpected symbolic link")


def remove_entry(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def copy_workspace(source: Path, destination: Path,
                   ignored_top_level: frozenset[str] = frozenset()) -> None:
    """Overlay source without ever following a destination symbolic link."""
    destination.mkdir(parents=True, exist_ok=True)
    for root, directories, files in os.walk(source, followlinks=False):
        source_root = Path(root)
        relative_root = source_root.relative_to(source)
        if relative_root == Path("."):
            directories[:] = [name for name in directories if name not in ignored_top_level]
            files = [name for name in files if name not in ignored_top_level]
        destination_root = destination / relative_root
        if destination_root.is_symlink() or (destination_root.exists() and not destination_root.is_dir()):
            fail("standalone destination has an unsafe directory conflict")
        destination_root.mkdir(parents=True, exist_ok=True)
        for name in directories + files:
            legacy = source_root / name
            copied = destination_root / name
            legacy_stat = legacy.lstat()
            if stat.S_ISLNK(legacy_stat.st_mode):
                link_target = os.readlink(legacy)
                if copied.is_symlink() and os.readlink(copied) == link_target:
                    continue
                remove_entry(copied)
                copied.symlink_to(link_target, target_is_directory=name in directories)
            elif stat.S_ISDIR(legacy_stat.st_mode):
                if copied.is_symlink() or (copied.exists() and not copied.is_dir()):
                    remove_entry(copied)
                copied.mkdir(parents=True, exist_ok=True)
            elif stat.S_ISREG(legacy_stat.st_mode):
                if copied.is_symlink() or (copied.exists() and not copied.is_file()):
                    remove_entry(copied)
                shutil.copy2(legacy, copied)
            else:
                fail("legacy knowledge contains an unsupported special entry")


def file_sha256(path: Path) -> bytes:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.digest()


def verify_workspace(source: Path, destination: Path,
                     ignored_top_level: frozenset[str] = frozenset(),
                     label: str = "knowledge") -> tuple[int, int]:
    """Fail closed unless every legacy regular file/symlink has an exact copy."""
    regular_files = 0
    symlinks = 0
    mismatches = 0
    try:
        for root, directories, files in os.walk(source, followlinks=False):
            root_path = Path(root)
            relative_root = root_path.relative_to(source)
            if relative_root == Path("."):
                directories[:] = [name for name in directories if name not in ignored_top_level]
                files = [name for name in files if name not in ignored_top_level]
            destination_root = destination / relative_root
            if not destination_root.is_dir() or destination_root.is_symlink():
                mismatches += 1
            for name in directories + files:
                legacy = root_path / name
                copied = destination_root / name
                try:
                    legacy_stat = legacy.lstat()
                    if stat.S_ISLNK(legacy_stat.st_mode):
                        symlinks += 1
                        if not copied.is_symlink() or os.readlink(legacy) != os.readlink(copied):
                            mismatches += 1
                    elif stat.S_ISREG(legacy_stat.st_mode):
                        regular_files += 1
                        if copied.is_symlink():
                            mismatches += 1
                            continue
                        copied_stat = copied.stat()
                        if (not stat.S_ISREG(copied_stat.st_mode)
                                or copied_stat.st_size != legacy_stat.st_size
                                or file_sha256(legacy) != file_sha256(copied)):
                            mismatches += 1
                    elif stat.S_ISDIR(legacy_stat.st_mode):
                        if not copied.is_dir() or copied.is_symlink():
                            mismatches += 1
                    else:
                        # A runtime socket/FIFO/device cannot be safely represented as knowledge.
                        mismatches += 1
                except OSError:
                    mismatches += 1
    except OSError:
        mismatches += 1
    if mismatches:
        fail(f"{label} verification failed ({mismatches} mismatched or unsupported entries)")
    return regular_files, symlinks


WHISPER_IGNORED_LEGACY_PATHS = frozenset({"build"})


def whisper_runtime_issues(root: Path) -> list[str]:
    """Return reasons why a copied whisper.cpp runtime is not standalone.

    Source and model files may be migrated from the old tree. Build products may
    not: CMake embeds build-time paths, so copied ELF files can silently keep
    loading OpenClaw libraries while appearing to live below ``.atlas``.
    """
    issues: list[str] = []
    model = root / "models" / "ggml-tiny.bin"
    cli = root / "build" / "bin" / "whisper-cli"
    if not model.is_file() or model.is_symlink():
        issues.append("models/ggml-tiny.bin is missing or is a symbolic link")
    if not cli.is_file() or cli.is_symlink() or not os.access(cli, os.X_OK):
        issues.append("build/bin/whisper-cli is missing, linked, or not executable")

    for subtree in (root / "build", root / "models"):
        if not subtree.exists():
            continue
        for path in subtree.rglob("*"):
            if not path.is_symlink():
                continue
            target = os.readlink(path)
            if os.path.isabs(target) or ".openclaw" in target.casefold():
                issues.append(f"unsafe symbolic link below whisper.cpp: {path.relative_to(root)}")
                continue
            try:
                path.resolve(strict=True).relative_to(root.resolve())
            except (OSError, RuntimeError, ValueError):
                issues.append(f"escaping symbolic link below whisper.cpp: {path.relative_to(root)}")

    bin_dir = root / "build" / "bin"
    elf_files: list[Path] = []
    if bin_dir.is_dir():
        for path in bin_dir.iterdir():
            if not path.is_file() or path.is_symlink():
                continue
            try:
                with path.open("rb") as stream:
                    magic = stream.read(4)
                if magic == b"\x7fELF":
                    elf_files.append(path)
            except OSError:
                issues.append(f"unreadable runtime file: {path.relative_to(root)}")
    if cli.is_file() and not cli.is_symlink() and cli not in elf_files:
        issues.append("build/bin/whisper-cli is not an ELF executable")

    readelf = shutil.which("readelf")
    if elf_files and not readelf:
        issues.append("readelf is required to audit the Whisper runtime")
    for path in elf_files:
        metadata = subprocess.run(
            [readelf, "-d", str(path)], capture_output=True, text=True, check=False
        ) if readelf else None
        if metadata is None or metadata.returncode != 0:
            issues.append(f"cannot inspect dynamic metadata: {path.relative_to(root)}")
            continue
        dynamic = metadata.stdout + metadata.stderr
        if ".openclaw" in dynamic.casefold():
            issues.append(f"legacy OpenClaw RUNPATH in {path.relative_to(root)}")
        for line in dynamic.splitlines():
            if "(RPATH)" not in line and "(RUNPATH)" not in line:
                continue
            value = line.partition("[")[2].partition("]")[0]
            if any(entry.startswith("/") for entry in value.split(":")):
                issues.append(f"absolute runtime library path in {path.relative_to(root)}")

    if cli.is_file() and not cli.is_symlink() and cli in elf_files:
        ldd = shutil.which("ldd")
        if not ldd:
            issues.append("ldd is required to audit Whisper library resolution")
        else:
            resolved = subprocess.run(
                [ldd, str(cli)], capture_output=True, text=True, check=False
            )
            libraries = resolved.stdout + resolved.stderr
            if resolved.returncode != 0:
                issues.append("ldd could not resolve build/bin/whisper-cli")
            if ".openclaw" in libraries.casefold():
                issues.append("whisper-cli still resolves libraries from OpenClaw")
            if "not found" in libraries.casefold():
                issues.append("whisper-cli has unresolved shared libraries")
    return sorted(set(issues))


def rebuild_whisper_runtime(home: Path, root: Path, owner_uid: int) -> None:
    script = Path(__file__).with_name("rebuild-whisper-runtime.sh")
    if not script.is_file():
        fail("Whisper needs rebuilding but rebuild-whisper-runtime.sh is missing")
    try:
        owner_name = pwd.getpwuid(owner_uid).pw_name
    except KeyError:
        fail("ATLAS_HOME owner has no local account")
    result = subprocess.run(
        ["bash", str(script)],
        env={**os.environ, "ATLAS_HOME": str(home), "ATLAS_USER": owner_name,
             "ATLAS_WHISPER_ROOT": str(root)},
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        # Build output does not contain credentials; retain only a short tail so
        # migration logs remain useful and bounded.
        detail = (result.stderr or result.stdout).strip().splitlines()[-5:]
        fail("standalone Whisper rebuild failed: " + " | ".join(detail))


def copy_backup(path: Path, backup_root: Path, home: Path) -> None:
    if not path.exists() and not path.is_symlink():
        return
    relative = path.relative_to(home)
    target = backup_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if path.is_dir() and not path.is_symlink():
        shutil.copytree(path, target, symlinks=True)
    else:
        shutil.copy2(path, target, follow_symlinks=False)


def chown_tree(path: Path, uid: int, gid: int) -> None:
    if not path.exists():
        return
    for root, directories, files in os.walk(path, followlinks=False):
        os.chown(root, uid, gid, follow_symlinks=False)
        for name in directories + files:
            child = Path(root, name)
            try:
                os.chown(child, uid, gid, follow_symlinks=False)
            except FileNotFoundError:
                pass


def atomic_json(path: Path, value: dict, uid: int, gid: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.chown(temporary, uid, gid)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="inspect sources without writing")
    parser.add_argument("--force", action="store_true",
                        help="repeat the context copy and refresh migrated config fields")
    parser.add_argument("--verify", action="store_true",
                        help="verify the current legacy-to-standalone copy without writing")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    home = Path(os.environ.get("ATLAS_HOME", "/home/atlas")).resolve()
    if not home.is_dir():
        fail("ATLAS_HOME is not an existing directory")
    owner = home.stat()

    legacy_workspace = home / ".openclaw" / "workspace"
    legacy_config = home / ".openclaw" / "openclaw.json"
    legacy_whisper = home / ".openclaw" / "tools" / "whisper.cpp"
    context_root = home / ".atlas" / "context"
    knowledge = context_root / "knowledge"
    conversation = context_root / "conversation"
    runtime_tmp = home / ".atlas" / "runtime" / "tmp"
    config_dir = home / ".atlas" / "config"
    secrets = config_dir / "secrets.json"
    tools_root = home / ".atlas" / "tools"
    whisper = tools_root / "whisper.cpp"
    marker = context_root / MARKER_NAME
    backups = home / ".atlas" / "backups"
    for target in (knowledge, conversation, runtime_tmp, config_dir, secrets,
                   tools_root, whisper, backups):
        assert_safe_target(home, target)

    if args.verify:
        if not legacy_workspace.is_dir() or not knowledge.is_dir():
            fail("legacy knowledge or standalone knowledge directory is missing")
        regular_files, symlinks = verify_workspace(legacy_workspace, knowledge)
        print(f"Legacy knowledge verification: ok ({regular_files} files, {symlinks} symlinks).")
        if legacy_whisper.is_dir():
            if not whisper.is_dir():
                fail("legacy whisper.cpp exists but its standalone copy is missing")
            tool_files, tool_symlinks = verify_workspace(
                legacy_whisper, whisper, WHISPER_IGNORED_LEGACY_PATHS,
                label="Whisper source/model",
            )
            print(
                "Legacy whisper.cpp source/model verification: ok "
                f"({tool_files} files, {tool_symlinks} symlinks)."
            )
            runtime_issues = whisper_runtime_issues(whisper)
            if runtime_issues:
                fail("standalone Whisper verification failed: " + "; ".join(runtime_issues))
            print("Standalone Whisper ELF/link verification: ok.")
        print("No files changed.")
        return 0

    legacy = load_object(legacy_config, "legacy OpenClaw config") if legacy_config.exists() else {}
    migrated = legacy_values(legacy)
    existing = load_object(secrets, "ATLAS secrets") if secrets.exists() else {"version": 1}
    config_changed = merge_missing(existing, migrated, args.force)
    if existing.get("version") != 1 and ("version" not in existing or args.force):
        existing["version"] = 1
        config_changed = True

    copy_context = legacy_workspace.is_dir() and (args.force or not marker.exists())
    copy_whisper = legacy_whisper.is_dir() and (args.force or not whisper.is_dir())
    state_sources = [context_root / name for name in STATE_FILES]
    copy_state = any(path.exists() for path in state_sources) and (args.force or not marker.exists())
    if copy_context:
        validate_destination_symlinks(legacy_workspace, knowledge)
    if copy_whisper:
        validate_destination_symlinks(legacy_whisper, whisper)
    if copy_state:
        for name in STATE_FILES:
            if (conversation / name).is_symlink():
                fail(f"conversation destination contains a symlink: {conversation / name}")
    if args.dry_run:
        print("ATLAS migration dry run")
        print(f"Legacy knowledge: {'ready' if legacy_workspace.is_dir() else 'not found'}")
        print(f"Legacy whisper.cpp: {'ready' if legacy_whisper.is_dir() else 'not found'}")
        if whisper.is_dir():
            issues = whisper_runtime_issues(whisper)
            print(f"Standalone Whisper runtime: {'needs rebuild' if issues else 'verified'}")
        print(f"Conversation state: {'ready' if any(p.exists() for p in state_sources) else 'not found'}")
        print(f"Legacy config fields: {sum(len(v) for v in migrated.values())}")
        print("No files changed.")
        return 0

    timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = home / ".atlas" / "backups" / f"openclaw-migration-{timestamp}"
    secrets_need_mode = secrets.exists() and stat.S_IMODE(secrets.stat().st_mode) != 0o600
    current_whisper_issues = whisper_runtime_issues(whisper) if whisper.is_dir() else []
    rebuild_whisper = (
        (copy_whisper or bool(current_whisper_issues))
        and ((whisper / "CMakeLists.txt").is_file()
             or (legacy_whisper / "CMakeLists.txt").is_file())
    )
    changed = (copy_context or copy_whisper or rebuild_whisper or copy_state or config_changed
               or not secrets.exists() or secrets_need_mode)
    if changed:
        backup.mkdir(parents=True, mode=0o700)
        for path in (knowledge, conversation, whisper, secrets, marker):
            copy_backup(path, backup, home)

    for directory in (context_root, knowledge, conversation, runtime_tmp, config_dir, tools_root):
        directory.mkdir(parents=True, exist_ok=True)
    os.chmod(runtime_tmp, 0o700)
    os.chmod(config_dir, 0o700)

    verified: tuple[int, int] | None = None
    if copy_context:
        copy_workspace(legacy_workspace, knowledge)
        verified = verify_workspace(legacy_workspace, knowledge)
    whisper_verified: tuple[int, int] | None = None
    if copy_whisper:
        copy_workspace(legacy_whisper, whisper, WHISPER_IGNORED_LEGACY_PATHS)
        whisper_verified = verify_workspace(
            legacy_whisper, whisper, WHISPER_IGNORED_LEGACY_PATHS,
            label="Whisper source/model",
        )
    if rebuild_whisper:
        # Installers invoke this migrator as root, while compilation deliberately
        # runs as the ATLAS account. Hand over only its tool tree and backup
        # directory before dropping privileges; other migration outputs remain
        # protected until their normal final ownership pass.
        chown_tree(whisper, owner.st_uid, owner.st_gid)
        backups.mkdir(parents=True, exist_ok=True)
        os.chown(backups, owner.st_uid, owner.st_gid)
        rebuild_whisper_runtime(home, whisper, owner.st_uid)
    if whisper.is_dir():
        runtime_issues = whisper_runtime_issues(whisper)
        if runtime_issues:
            fail("standalone Whisper verification failed: " + "; ".join(runtime_issues))
    if copy_state:
        for source in state_sources:
            if source.is_file():
                shutil.copy2(source, conversation / source.name)

    if config_changed or not secrets.exists():
        atomic_json(secrets, existing, owner.st_uid, owner.st_gid)
    else:
        os.chmod(secrets, 0o600)

    if (copy_context or copy_state) and not marker.exists():
        marker.write_text("version=1\n", encoding="utf-8")
        marker.chmod(0o600)

    for directory in (context_root, runtime_tmp.parent, config_dir, tools_root):
        chown_tree(directory, owner.st_uid, owner.st_gid)
    if changed:
        chown_tree(backup, owner.st_uid, owner.st_gid)

    print("ATLAS standalone layout is ready.")
    print(f"Legacy knowledge: {'copied' if copy_context else 'unchanged'}")
    if verified is not None:
        print(f"Legacy knowledge verification: ok ({verified[0]} files, {verified[1]} symlinks).")
    print(f"Legacy whisper.cpp: {'copied' if copy_whisper else 'unchanged'}")
    if whisper_verified is not None:
        print(
            "Legacy whisper.cpp source/model verification: ok "
            f"({whisper_verified[0]} files, {whisper_verified[1]} symlinks)."
        )
    if whisper.is_dir():
        print(
            "Standalone Whisper ELF/link verification: ok"
            + (" (rebuilt)." if rebuild_whisper else ".")
        )
    print(f"Conversation state: {'copied' if copy_state else 'unchanged'}")
    print(f"Private config fields discovered: {sum(len(v) for v in migrated.values())}")
    print("Legacy OpenClaw files were preserved.")
    if changed:
        print(f"Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
