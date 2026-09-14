#!/usr/bin/env python3
"""List the canonical files that a knowledge manifest requires at runtime.

Paths named in ``runtimeLocalPaths`` are deliberately not emitted: they are
private, machine-local extensions that a repository deployment must preserve.
Every other explicit path must exist, while glob entries contribute all of
their current regular-file matches.  Output is one safe relative path per line.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import NoReturn


def fail(message: str) -> NoReturn:
    raise SystemExit(f"invalid ATLAS context manifest: {message}")


def safe_relative(value: object, label: str) -> str:
    if not isinstance(value, str) or not value or "\n" in value or "\r" in value:
        fail(f"{label} must be a non-empty single-line string")
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        fail(f"{label} escapes the knowledge directory")
    return path.as_posix()


def load_manifest(knowledge: Path) -> dict:
    knowledge = knowledge.resolve()
    manifest_path = knowledge / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read manifest.json ({error.__class__.__name__})")
    if not isinstance(manifest, dict):
        fail("manifest.json must contain an object")
    return manifest


def manifest_files(knowledge: Path, manifest: dict | None = None) -> list[str]:
    knowledge = knowledge.resolve()
    if manifest is None:
        manifest = load_manifest(knowledge)
    groups = manifest.get("groups")
    if not isinstance(groups, list) or not groups:
        fail("groups must be a non-empty list")

    local_values = manifest.get("runtimeLocalPaths", [])
    if not isinstance(local_values, list):
        fail("runtimeLocalPaths must be a list")
    runtime_local = {
        safe_relative(value, "runtimeLocalPaths entry") for value in local_values
    }

    selected: dict[str, None] = {"manifest.json": None}

    def add_file(relative: str, *, explicit: bool) -> None:
        if relative in runtime_local:
            return
        candidate = knowledge / relative
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(knowledge)
        except FileNotFoundError:
            if explicit:
                fail(f"required path does not exist: {relative}")
            return
        except (OSError, RuntimeError, ValueError):
            fail(f"unsafe path: {relative}")
        if candidate.is_symlink() or not resolved.is_file():
            fail(f"context source must be a regular file: {relative}")
        selected[relative] = None

    for index, group in enumerate(groups):
        if not isinstance(group, dict):
            fail(f"group {index} must be an object")
        paths = group.get("paths", [])
        globs = group.get("globs", [])
        if not isinstance(paths, list) or not isinstance(globs, list):
            fail(f"group {index} paths/globs must be lists")
        for value in paths:
            add_file(safe_relative(value, f"group {index} path"), explicit=True)
        for value in globs:
            pattern = safe_relative(value, f"group {index} glob")
            try:
                matches = sorted(knowledge.glob(pattern), key=lambda path: path.as_posix())
            except (OSError, RuntimeError, ValueError):
                fail(f"cannot expand glob: {pattern}")
            for match in matches:
                if not match.is_file():
                    continue
                try:
                    relative = match.relative_to(knowledge).as_posix()
                except ValueError:
                    fail(f"glob escaped the knowledge directory: {pattern}")
                add_file(relative, explicit=False)

    return list(selected)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("knowledge", type=Path)
    parser.add_argument(
        "--channel-instructions",
        action="store_true",
        help="print only the safe WebScreen instruction path named by the manifest",
    )
    args = parser.parse_args()
    manifest = load_manifest(args.knowledge)
    if args.channel_instructions:
        print(safe_relative(manifest.get("channelInstructions"), "channelInstructions"))
        return 0
    for relative in manifest_files(args.knowledge, manifest):
        print(relative)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
