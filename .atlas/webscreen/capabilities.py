"""Bounded, read-only discovery of operator-installed ATLAS manuals.

No shell, network, credentials, user memories, conversations or arbitrary paths.
Finding documentation is NOT proof that a service is connected or authorized.
"""
from __future__ import annotations

import re
import shutil
import unicodedata
from pathlib import Path
from typing import Any

PAGE_CHARS = 6000
MAX_DOCUMENT_CHARS = 128000
ROOT_MANUALS = ("CAPABILITIES.md", "ATLAS-CONNECTIONS.md", "ADB.md", "NMAP.md")
STOP_WORDS = set("a al con de del el en es la las lo los me mi para por que se si tu un una y the to of and".split())


def words(value: str) -> set[str]:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(c for c in value if not unicodedata.combining(c))
    return set(re.findall(r"[a-z0-9]+", value)) - STOP_WORDS


def documents(root: Path) -> dict[str, str]:
    """Only a fixed public manual namespace, never caller-selected file reads."""
    root = root.resolve()
    candidates = [root / name for name in ROOT_MANUALS]
    candidates += sorted((root / "atlas-commands").glob("ATLAS-*.md"))
    result = {}
    for path in candidates:
        try:
            resolved = path.resolve()
            # Reject symlink aliases, including aliases *within* the root.
            if resolved != path or not path.is_file():
                continue
            resolved.relative_to(root)
            if path.stat().st_size > MAX_DOCUMENT_CHARS * 4:
                continue
            with path.open(encoding="utf-8") as stream:
                content = stream.read(MAX_DOCUMENT_CHARS + 1)
            if len(content) <= MAX_DOCUMENT_CHARS:
                result[path.relative_to(root).as_posix()] = content
        except (OSError, UnicodeError, ValueError):
            continue
    return result


def _index(docs: dict[str, str]) -> list[dict[str, Any]]:
    result = []
    for name, content in docs.items():
        command = Path(name).stem.lower() if name.startswith("atlas-commands/") else None
        result.append({"manual": name, "title": content.splitlines()[0].lstrip("# ") if content else name,
                       "command": command,
                       "installed": bool(shutil.which(command)) if command else None})
    return result


def discover(root: Path, args: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(args, dict) or set(args) - {"query", "manual", "offset"}:
        raise ValueError("Solo se admiten query, manual y offset")
    query, manual, offset = args.get("query", ""), args.get("manual", ""), args.get("offset", 0)
    if not isinstance(query, str) or len(query) > 400 or not isinstance(manual, str):
        raise ValueError("Consulta o manual inválido")
    if type(offset) is not int or not 0 <= offset <= MAX_DOCUMENT_CHARS:
        raise ValueError("offset inválido")
    docs = documents(root)
    common = {"ok": True, "readOnly": True, "liveStateChecked": False,
              "notice": "Documentación, no estado actual ni permiso. Comprueba el estado con la herramienta indicada. No contiene secretos ni historial."}
    if manual:
        if manual not in docs:
            raise ValueError("Manual no disponible en el catálogo; consulta primero el índice")
        content = docs[manual]
        end = min(len(content), offset + PAGE_CHARS)
        return {**common, "manual": manual, "text": content[offset:end],
                "offset": offset, "nextOffset": end if end < len(content) else None,
                "totalChars": len(content)}
    index = _index(docs)
    if not query.strip():
        return {**common, "catalog": docs.get("CAPABILITIES.md", "Catálogo principal no instalado"), "manuals": index}
    terms = words(query)
    # Natural-language routing uses the bilingual compact capability map as
    # metadata; a matching section boosts its linked manuals, not user files.
    boosts: dict[str, int] = {}
    for section in re.split(r"(?m)^## ", docs.get("CAPABILITIES.md", "")):
        score = len(terms & words(section))
        for target in re.findall(r"\]\(([^)]+\.md)\)", section):
            boosts[target] = max(boosts.get(target, 0), score * 3)
    ranked = []
    for item in index:
        name, content = item["manual"], docs[item["manual"]]
        score = (len(terms & words(name)) * 5 + len(terms & words(content)) + boosts.get(name, 0))
        if score:
            # Return relevant paragraphs plus the canonical name for a full,
            # paginated read. Excerpts explicitly do not replace full contracts.
            paragraphs = re.split(r"\n\s*\n", content)
            selected = sorted(range(len(paragraphs)), key=lambda i: -len(terms & words(paragraphs[i])))[:4]
            excerpt = "\n\n".join(paragraphs[i] for i in sorted(selected))[:2400]
            ranked.append((score, {**item, "excerpt": excerpt, "excerptOnly": True}))
    ranked.sort(key=lambda pair: (-pair[0], pair[1]["manual"]))
    return {**common, "query": query, "matches": [item for _, item in ranked[:4]],
            "manuals": index, "noMatchDoesNotProveUnsupported": True}
