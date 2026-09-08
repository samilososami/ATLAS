#!/usr/bin/env python3
"""Validated, atomic and deterministic routine storage for ATLAS."""

from __future__ import annotations

import ast
import fcntl
import json
import os
import re
import subprocess
import tempfile
import time
import unicodedata
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

BEGIN = "<!-- ATLAS_ROUTINES_JSON_BEGIN -->"
END = "<!-- ATLAS_ROUTINES_JSON_END -->"
MAX_ROUTINES = 128
MAX_STEPS = 16
MAX_COMMAND_CHARS = 4096
MAX_OUTPUT_CHARS = 12000
MAX_TIMEOUT_SECONDS = 30
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
SAFE_CAPTURE = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")
VARIABLE = re.compile(r"\$\{([A-Z][A-Z0-9_]*)\}|\$([A-Z][A-Z0-9_]*)")


class RoutineError(RuntimeError):
    """Safe routine validation or execution failure."""


def routines_dir() -> Path:
    return Path(os.environ.get("ATLAS_ROUTINES_DIR", Path.home() / ".atlas" / "routines"))


def registry_path() -> Path:
    return routines_dir() / "ROUTINES.md"


def _empty_registry() -> dict[str, Any]:
    return {"version": 1, "routines": []}


def _document(registry: dict[str, Any]) -> str:
    payload = json.dumps(registry, ensure_ascii=False, indent=2)
    return (
        "# Rutinas de ATLAS\n\n"
        "Registro activo. Modifícalo con `atlas-routines` o mediante ATLAS.\n\n"
        f"{BEGIN}\n```json\n{payload}\n```\n{END}\n"
    )


def _ensure_storage() -> None:
    root = routines_dir()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    for child in (root / "logs", root / "results"):
        child.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(child, 0o700)
    path = registry_path()
    if not path.exists():
        _atomic_write(path, _document(_empty_registry()))


@contextmanager
def _locked(exclusive: bool) -> Iterator[None]:
    _ensure_storage()
    lock_path = routines_dir() / ".lock"
    with lock_path.open("a+", encoding="utf-8") as handle:
        os.chmod(lock_path, 0o600)
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _extract(text: str) -> dict[str, Any]:
    if BEGIN not in text or END not in text:
        raise RoutineError("ROUTINES.md no contiene los marcadores del registro")
    block = text.split(BEGIN, 1)[1].split(END, 1)[0].strip()
    match = re.fullmatch(r"```json\s*(.*?)\s*```", block, flags=re.DOTALL)
    if not match:
        raise RoutineError("El bloque de ROUTINES.md debe ser JSON")
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError as error:
        raise RoutineError(f"JSON inválido en ROUTINES.md: {error}") from error
    return validate_registry(value)


def normalize_phrase(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or "").lower())
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    value = re.sub(r"[^a-z0-9ñ]+", " ", value).strip()
    value = re.sub(r"^(?:oye\s+)?atlas(?:\s+|$)", "", value).strip()
    return re.sub(r"\s+", " ", value)


def slugify(value: str) -> str:
    slug = normalize_phrase(value).replace(" ", "-")
    slug = re.sub(r"[^a-z0-9_-]", "", slug)[:64].strip("-_")
    return slug or "rutina"


def _validate_command(command: str) -> None:
    if not command or "\x00" in command or len(command) > MAX_COMMAND_CHARS:
        raise RoutineError("Comando de rutina vacío o demasiado largo")
    normalized = command.replace("\\\n", " ")
    if "--no-preserve-root" in normalized or "--force-root" in normalized:
        raise RoutineError("Comando bloqueado por la política permanente de ATLAS")
    for match in re.finditer(r"(?<![\w./-])(?:(?:/usr)?/bin/)?rm(?=\s|$)", normalized):
        clause = re.split(r"(?:&&|\|\||[;|&\n])", normalized[match.end():], maxsplit=1)[0]
        recursive = bool(re.search(r"(?:^|\s)--recursive(?=\s|$)", clause))
        forced = bool(re.search(r"(?:^|\s)--force(?=\s|$)", clause))
        for options in re.findall(r"(?:^|\s)-([^\s-]+)(?=\s|$)", clause):
            recursive = recursive or "r" in options or "R" in options
            forced = forced or "f" in options
        if recursive and forced:
            raise RoutineError("ATLAS no guarda rm recursivo y forzado")


def _trigger_text(trigger: Any, routine_name: str) -> str:
    """Accept the canonical string plus the legacy phrase object without stringifying it."""
    candidate = trigger
    if isinstance(candidate, str):
        stripped = candidate.strip()
        # An early model-created registry stored Python's representation of a
        # phrase object as text. Read that narrow legacy shape so installing a
        # fixed engine immediately restores matching; the next save writes the
        # canonical string form.
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                decoded = ast.literal_eval(stripped)
            except (SyntaxError, ValueError):
                decoded = None
            if isinstance(decoded, dict):
                candidate = decoded
    if isinstance(candidate, dict):
        if str(candidate.get("type") or "").strip().lower() != "phrase":
            raise RoutineError(f"{routine_name}: tipo de activación no disponible")
        candidate = candidate.get("value")
    if not isinstance(candidate, str):
        raise RoutineError(f"{routine_name}: cada frase de activación debe ser texto")
    return " ".join(candidate.split())[:240]


def validate_routine(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RoutineError("Cada rutina debe ser un objeto")
    name = " ".join(str(value.get("name") or "").split())[:120]
    routine_id = str(value.get("id") or slugify(name)).strip().lower()
    if not name or not SAFE_ID.fullmatch(routine_id):
        raise RoutineError("La rutina necesita un nombre y un id válido")
    triggers = value.get("triggers")
    if not isinstance(triggers, list) or not triggers:
        raise RoutineError(f"{name}: falta al menos una frase de activación")
    clean_triggers: list[str] = []
    seen: set[str] = set()
    for trigger in triggers:
        display = _trigger_text(trigger, name)
        normalized = normalize_phrase(display)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        clean_triggers.append(display)
    if not clean_triggers:
        raise RoutineError(f"{name}: todas las frases están vacías")
    requires_model = value.get("requires_model", False)
    if not isinstance(requires_model, bool):
        raise RoutineError(f"{name}: requires_model debe ser true o false")
    steps = value.get("steps")
    if not isinstance(steps, list) or not steps or len(steps) > MAX_STEPS:
        raise RoutineError(f"{name}: necesita entre 1 y {MAX_STEPS} pasos")
    clean_steps: list[dict[str, Any]] = []
    for index, step in enumerate(steps, 1):
        if not isinstance(step, dict):
            raise RoutineError(f"{name}: paso {index} inválido")
        kind = str(step.get("type") or "").strip().lower()
        if kind == "shell":
            command = str(step.get("command") or "").strip()
            _validate_command(command)
            capture = str(step.get("capture") or "").strip().upper()
            if capture and not SAFE_CAPTURE.fullmatch(capture):
                raise RoutineError(f"{name}: variable de captura inválida")
            try:
                timeout = int(step.get("timeout_seconds", 20))
            except (TypeError, ValueError) as error:
                raise RoutineError(f"{name}: timeout inválido") from error
            clean = {"type": "shell", "command": command,
                     "timeout_seconds": max(1, min(timeout, MAX_TIMEOUT_SECONDS))}
            if capture:
                clean["capture"] = capture
            clean_steps.append(clean)
        elif kind == "say":
            message = " ".join(str(step.get("text") or "").split())[:2000]
            if not message:
                raise RoutineError(f"{name}: texto SAY vacío")
            clean_steps.append({"type": "say", "text": message})
        else:
            raise RoutineError(f"{name}: tipo de paso no disponible: {kind or '(vacío)'}")
    return {
        "id": routine_id,
        "name": name,
        "description": " ".join(str(value.get("description") or "").split())[:500],
        "thoughts": " ".join(str(value.get("thoughts") or "").split())[:1200],
        "triggers": clean_triggers,
        "enabled": bool(value.get("enabled", True)),
        "requires_model": requires_model,
        "steps": clean_steps,
    }


def validate_registry(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("version") != 1:
        raise RoutineError("El registro necesita version 1")
    routines = value.get("routines")
    if not isinstance(routines, list) or len(routines) > MAX_ROUTINES:
        raise RoutineError(f"El registro admite como máximo {MAX_ROUTINES} rutinas")
    clean = [validate_routine(item) for item in routines]
    ids: set[str] = set()
    triggers: dict[str, str] = {}
    for routine in clean:
        if routine["id"] in ids:
            raise RoutineError(f"Id duplicado: {routine['id']}")
        ids.add(routine["id"])
        for phrase in routine["triggers"]:
            key = normalize_phrase(phrase)
            if key in triggers:
                raise RoutineError(f"Frase duplicada entre {triggers[key]} y {routine['name']}: {phrase}")
            triggers[key] = routine["name"]
    return {"version": 1, "routines": clean}


def load_registry() -> dict[str, Any]:
    with _locked(False):
        return _extract(registry_path().read_text(encoding="utf-8"))


def save_registry(value: dict[str, Any]) -> dict[str, Any]:
    clean = validate_registry(value)
    with _locked(True):
        _atomic_write(registry_path(), _document(clean))
    return clean


def list_routines() -> list[dict[str, Any]]:
    return load_registry()["routines"]


def get_routine(identifier: str) -> dict[str, Any]:
    key = normalize_phrase(identifier)
    for routine in list_routines():
        if key in {normalize_phrase(routine["id"]), normalize_phrase(routine["name"])}:
            return routine
    raise RoutineError(f"No existe la rutina {identifier!r}")


def upsert_routine(value: dict[str, Any], replace: bool = False) -> dict[str, Any]:
    clean = validate_routine(value)
    with _locked(True):
        registry = _extract(registry_path().read_text(encoding="utf-8"))
        positions = {routine["id"]: index for index, routine in enumerate(registry["routines"])}
        if clean["id"] in positions:
            if not replace:
                raise RoutineError(f"La rutina {clean['name']} ya existe")
            registry["routines"][positions[clean["id"]]] = clean
        else:
            registry["routines"].append(clean)
        registry = validate_registry(registry)
        _atomic_write(registry_path(), _document(registry))
    return clean


def delete_routine(identifier: str) -> dict[str, Any]:
    target = get_routine(identifier)
    with _locked(True):
        registry = _extract(registry_path().read_text(encoding="utf-8"))
        registry["routines"] = [item for item in registry["routines"] if item["id"] != target["id"]]
        _atomic_write(registry_path(), _document(validate_registry(registry)))
    return target


def set_enabled(identifier: str, enabled: bool) -> dict[str, Any]:
    target = get_routine(identifier)
    target["enabled"] = enabled
    return upsert_routine(target, replace=True)


def match_phrase(phrase: str) -> dict[str, Any] | None:
    key = normalize_phrase(phrase)
    if not key:
        return None
    for routine in list_routines():
        if routine["enabled"] and key in {normalize_phrase(item) for item in routine["triggers"]}:
            return routine
    return None


def _expand(value: str, variables: dict[str, str]) -> str:
    return VARIABLE.sub(lambda match: variables.get(match.group(1) or match.group(2), match.group(0)), value)


def _append_log(record: dict[str, Any]) -> None:
    day = datetime.now().astimezone().strftime("%Y-%m-%d")
    path = routines_dir() / "logs" / f"{day}.jsonl"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.chmod(path, 0o600)


def _save_result(record: dict[str, Any]) -> None:
    path = routines_dir() / "results" / f"{record['executionId']}.json"
    _atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    files = sorted((routines_dir() / "results").glob("*.json"), key=lambda item: item.stat().st_mtime)
    for old in files[:-128]:
        old.unlink(missing_ok=True)


def get_result(execution_id: str) -> dict[str, Any]:
    if not re.fullmatch(r"[a-f0-9]{32}", str(execution_id or "")):
        raise RoutineError("Identificador de ejecución inválido")
    path = routines_dir() / "results" / f"{execution_id}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RoutineError("No se encuentra ese resultado de rutina") from error


def execute_routine(routine: dict[str, Any], invoked_phrase: str = "") -> dict[str, Any]:
    routine = validate_routine(routine)
    execution_id = uuid4().hex
    started = time.perf_counter()
    variables = {"TIMESTAMP": datetime.now().astimezone().isoformat(timespec="seconds")}
    steps: list[dict[str, Any]] = []
    spoken: list[str] = []
    ok = True
    error = ""
    for index, step in enumerate(routine["steps"], 1):
        if step["type"] == "say":
            text = _expand(step["text"], variables)
            unresolved = sorted({match.group(1) or match.group(2)
                                 for match in VARIABLE.finditer(text)})
            if unresolved:
                ok = False
                names = ", ".join(unresolved)
                error = f"El paso {index} SAY usa variables sin resolver: {names}"
                steps.append({"index": index, "type": "say", "ok": False,
                              "text": text, "output": error})
                break
            spoken.append(text)
            steps.append({"index": index, "type": "say", "ok": True, "text": text})
            continue
        command = _expand(step["command"], variables)
        timeout = step["timeout_seconds"]
        environment = os.environ.copy()
        environment.update({f"ATLAS_ROUTINE_{key}": value for key, value in variables.items()})
        try:
            completed = subprocess.run(
                ["/bin/bash", "-lc", command], cwd=Path.home(), env=environment,
                text=True, capture_output=True, timeout=timeout, check=False,
            )
            stdout = completed.stdout.strip()
            stderr = completed.stderr.strip()
            output = "\n".join(part for part in (stdout, f"stderr:\n{stderr}" if stderr else "") if part)
            output = (output or "El comando terminó sin salida.")[:MAX_OUTPUT_CHARS]
            variables["OUTPUT"] = stdout
            variables[f"OUTPUT_{index}"] = stdout
            variables["EXIT_CODE"] = str(completed.returncode)
            if step.get("capture"):
                variables[step["capture"]] = stdout
            step_result = {"index": index, "type": "shell", "ok": completed.returncode == 0,
                           "command": command, "exitCode": completed.returncode, "output": output}
            steps.append(step_result)
            if completed.returncode != 0:
                ok = False
                error = f"El paso {index} terminó con código {completed.returncode}"
                break
        except subprocess.TimeoutExpired:
            ok = False
            error = f"El paso {index} agotó {timeout} segundos"
            steps.append({"index": index, "type": "shell", "ok": False,
                          "command": command, "timedOut": True, "output": error})
            break
        except OSError as failure:
            ok = False
            error = f"No se pudo iniciar el paso {index}: {failure}"
            steps.append({"index": index, "type": "shell", "ok": False,
                          "command": command, "output": error})
            break
    record = {
        "executionId": execution_id,
        "timestamp": datetime.now().astimezone().isoformat(timespec="milliseconds"),
        "routineId": routine["id"], "routineName": routine["name"],
        "invokedPhrase": invoked_phrase, "matched": True, "ok": ok,
        "requiresModel": routine["requires_model"],
        "spokenText": " ".join(spoken) if ok else "", "error": error,
        "steps": steps, "durationMs": round((time.perf_counter() - started) * 1000, 1),
    }
    _append_log(record)
    _save_result(record)
    return record


def execute_phrase(phrase: str) -> dict[str, Any]:
    routine = match_phrase(phrase)
    if routine is None:
        return {"matched": False, "ok": False}
    return execute_routine(routine, invoked_phrase=phrase)
