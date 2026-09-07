#!/usr/bin/env python3
"""SSH interface for ATLAS routines."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

import routine_engine as engine


def print_routine(routine: dict) -> None:
    state = "activa" if routine["enabled"] else "desactivada"
    print(f"{routine['name']} ({routine['id']}) · {state}")
    print(f"  {routine['description'] or 'Sin descripción'}")
    print(f"  Frases: {', '.join(routine['triggers'])}")
    for index, step in enumerate(routine["steps"], 1):
        if step["type"] == "shell":
            capture = f" → {step['capture']}" if step.get("capture") else ""
            print(f"  {index}. $ {step['command']}{capture}")
        else:
            print(f"  {index}. [SAY] {step['text']}")


def interactive_create() -> dict:
    print("Nueva rutina de ATLAS")
    description = input("¿Qué debe hacer? ").strip()
    trigger = input("Frase exacta de activación: ").strip()
    name = input("Nombre: ").strip() or engine.slugify(description).replace("-", " ").title()
    command = input("Comando directo (vacío si solo habla): ").strip()
    steps = []
    if command:
        capture = input("Variable para capturar la salida (opcional): ").strip().upper()
        step = {"type": "shell", "command": command, "timeout_seconds": 20}
        if capture:
            step["capture"] = capture
        steps.append(step)
    say = input("Texto [SAY] (opcional; admite $VARIABLE): ").strip()
    if say:
        steps.append({"type": "say", "text": say})
    if not steps:
        raise engine.RoutineError("La rutina necesita al menos un comando o un texto SAY")
    return {"id": engine.slugify(name), "name": name, "description": description,
            "thoughts": "Creada mediante la guía SSH.", "triggers": [trigger],
            "enabled": True, "steps": steps}


def edit_registry() -> None:
    current = engine.registry_path().read_text(encoding="utf-8")
    editor = os.environ.get("EDITOR", "nano")
    fd, temporary = tempfile.mkstemp(prefix="atlas-routines-", suffix=".md")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(current)
        completed = subprocess.run([editor, temporary], check=False)
        if completed.returncode:
            raise engine.RoutineError("El editor terminó con error; no se cambió el registro")
        candidate = Path(temporary).read_text(encoding="utf-8")
        registry = engine._extract(candidate)
        engine.save_registry(registry)
        print("Registro validado y actualizado.")
    finally:
        Path(temporary).unlink(missing_ok=True)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="atlas-routines", description="Rutinas deterministas de ATLAS")
    sub = root.add_subparsers(dest="action")
    sub.add_parser("list", help="listar rutinas")
    show = sub.add_parser("show", help="ver una rutina"); show.add_argument("name")
    run = sub.add_parser("run", help="ejecutar por nombre"); run.add_argument("name")
    match = sub.add_parser("match", help="probar una frase exacta"); match.add_argument("phrase")
    create = sub.add_parser("create", help="crear una rutina")
    create.add_argument("--name"); create.add_argument("--description", default="")
    create.add_argument("--trigger"); create.add_argument("--command"); create.add_argument("--capture")
    create.add_argument("--say"); create.add_argument("--thoughts", default="")
    create.add_argument("--replace", action="store_true")
    for action in ("delete", "enable", "disable"):
        command = sub.add_parser(action); command.add_argument("name")
    sub.add_parser("validate", help="validar ROUTINES.md")
    sub.add_parser("edit", help="editar y validar ROUTINES.md")
    sub.add_parser("path", help="mostrar la ruta del registro")
    return root


def main() -> int:
    args = parser().parse_args()
    action = args.action or "list"
    try:
        if action == "list":
            routines = engine.list_routines()
            if not routines:
                print("No hay rutinas guardadas.")
            for routine in routines:
                print_routine(routine)
        elif action == "show":
            print_routine(engine.get_routine(args.name))
        elif action == "run":
            result = engine.execute_routine(engine.get_routine(args.name))
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if result["ok"] else 1
        elif action == "match":
            result = engine.execute_phrase(args.phrase)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if result.get("matched") and result.get("ok") else 1
        elif action == "create":
            if args.name and args.trigger and (args.command or args.say):
                steps = []
                if args.command:
                    shell = {"type": "shell", "command": args.command, "timeout_seconds": 20}
                    if args.capture:
                        shell["capture"] = args.capture.upper()
                    steps.append(shell)
                if args.say:
                    steps.append({"type": "say", "text": args.say})
                routine = {"id": engine.slugify(args.name), "name": args.name,
                           "description": args.description, "thoughts": args.thoughts,
                           "triggers": [args.trigger], "enabled": True, "steps": steps}
            else:
                routine = interactive_create()
            print_routine(engine.upsert_routine(routine, replace=args.replace))
            print("Rutina guardada.")
        elif action == "delete":
            print(f"Rutina eliminada: {engine.delete_routine(args.name)['name']}")
        elif action in {"enable", "disable"}:
            routine = engine.set_enabled(args.name, action == "enable")
            print_routine(routine)
        elif action == "validate":
            routines = engine.load_registry()["routines"]
            print(f"Registro válido: {len(routines)} rutina(s).")
        elif action == "edit":
            edit_registry()
        elif action == "path":
            print(engine.registry_path())
        return 0
    except engine.RoutineError as error:
        print(f"atlas-routines: {error}", file=__import__("sys").stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
