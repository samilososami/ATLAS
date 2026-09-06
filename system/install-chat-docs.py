#!/usr/bin/env python3
"""Add atlas-chat cross-references without replacing private workspace prose."""

from __future__ import annotations

import os
import shutil
import stat
import sys
from pathlib import Path


REPO, HOME, BACKUP = map(Path, sys.argv[1:])
WORKSPACE = HOME / ".openclaw" / "workspace"
OWNER = HOME.stat()


def preserve(path: Path) -> None:
    if not path.exists():
        return
    try:
        relative = path.relative_to(HOME)
    except ValueError:
        relative = Path("external") / path.as_posix().lstrip("/")
    target = BACKUP / "chat-docs" / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)


def add_if_missing(path: Path, needle: str, body: str) -> bool:
    try:
        previous = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        previous = ""
    if needle.casefold() in previous.casefold():
        return False
    preserve(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = previous.rstrip() + ("\n\n" if previous.strip() else "") + body.strip() + "\n"
    temporary = path.with_name(f".{path.name}.atlas-chat.tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.chmod(stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644)
    os.chown(temporary, OWNER.st_uid, OWNER.st_gid)
    temporary.replace(path)
    return True


def main() -> int:
    references = (
        (
            WORKSPACE / "atlas-commands" / "README.md",
            "atlas-chat terminal interface 1.1",
            """## atlas-chat terminal interface 1.1

`atlas-chat` provides slash-command suggestions, @file references, multiline
input and streaming Markdown. `/files`, `/expand` and `/compact` are local
display commands; full instructions live in `ATLAS-CHAT.md`. Truncation is
visual only and never changes executed commands or model tool results.
""",
        ),
        (
            WORKSPACE / "AGENTS.md",
            "ATLAS-CHAT.md",
            """## ATLAS terminal chat

- `atlas-commands/ATLAS-CHAT.md` documents `atlas-chat`, the direct text-only
  Realtime terminal with visible tools and timings.
- Use `atlas-chat -p \"...\"` for one turn and `--ephemeral` when a diagnostic
  must neither read nor alter the persistent conversation.
""",
        ),
        (
            WORKSPACE / "NOTES.md",
            "atlas-chat",
            """## Realtime terminal

- Text-only diagnosis -> `atlas-chat --ephemeral`; omit `--ephemeral` to share
  WebScreen's persistent conversation.
""",
        ),
        (
            WORKSPACE / "README.md",
            "ATLAS-CHAT.md",
            """## Realtime terminal

`atlas-commands/ATLAS-CHAT.md` documents the text-only Realtime terminal client.
""",
        ),
        (
            WORKSPACE / "atlas-commands" / "ATLAS-CONTEXT.md",
            "atlas-chat",
            """## atlas-chat relationship

Normal `atlas-chat` sessions share this persistent conversation with WebScreen.
`atlas-chat --ephemeral` neither reads nor writes it.
""",
        ),
        (
            WORKSPACE / "atlas-commands" / "ATLAS-WEBSCREEN.md",
            "atlas-chat",
            """## Text-only terminal companion

`atlas-chat` uses the same Realtime model, crucial Markdown, shell, web search
and, unless ephemeral, persistent conversation without browser audio or UI.
""",
        ),
        (
            HOME / ".atlas" / "webscreen" / "README.md",
            "atlas-chat",
            """## Terminal companion

`atlas-chat` is the text-only terminal surface for the same Realtime model,
context and direct tools. Its own README documents persistent and ephemeral use.
""",
        ),
    )
    changed = [str(path) for path, needle, body in references if add_if_missing(path, needle, body)]
    print(f"atlas-chat documentation references added: {len(changed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
