#!/usr/bin/env python3
"""Add the verified deterministic routine architecture to the current TDR."""

from __future__ import annotations

import argparse
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile

from lxml import etree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}


def tag(name: str) -> str:
    return f"{{{W}}}{name}"


def text(paragraph: ET._Element) -> str:
    return "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))


def replace_text(paragraph: ET._Element, value: str) -> None:
    runs = paragraph.xpath("./w:r|./w:hyperlink/w:r", namespaces=NS)
    if not runs:
        runs = [ET.SubElement(paragraph, tag("r"))]
    first = runs[0]
    first_text = first.find(tag("t"))
    if first_text is None:
        first_text = ET.SubElement(first, tag("t"))
    first_text.text = value
    first_text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    for run in runs[1:]:
        for node in run.findall(tag("t")):
            node.text = ""


def clone_with_text(template: ET._Element, value: str) -> ET._Element:
    paragraph = deepcopy(template)
    replace_text(paragraph, value)
    return paragraph


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        raise SystemExit("Use a separate output path so the source remains recoverable.")

    with ZipFile(args.source) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
        info = {name: archive.getinfo(name) for name in archive.namelist()}
    root = ET.fromstring(files["word/document.xml"])
    body = root.find(tag("body"))
    paragraphs = list(body.findall(tag("p")))
    if len(paragraphs) != 472:
        raise SystemExit(f"Expected the current 472-paragraph TDR, found {len(paragraphs)}; no output written.")
    if any("Rutinas deterministas y automatización" in text(p) for p in paragraphs):
        raise SystemExit("The routines section is already present; no duplicate was written.")
    expected = {
        59: "Herramientas actuales y arquitectura futura",
        60: "Recuperación de conexiones y control de turnos",
        308: "La herramienta atlas_shell ejecuta comandos",
        318: "Las consultas de fecha, RAM, almacenamiento",
        321: "6.5 Recuperación de conexiones y control de turnos",
        322: "El rework distingue conexión con la Pi",
    }
    for index, prefix in expected.items():
        if not text(paragraphs[index]).startswith(prefix):
            raise SystemExit(f"Paragraph {index} no longer matches {prefix!r}; no output written.")

    paragraphs[60].addprevious(clone_with_text(
        paragraphs[59], "Rutinas deterministas y automatización",
    ))
    replace_text(
        paragraphs[308],
        "La herramienta atlas_shell ejecuta comandos en A1 y devuelve la salida real; "
        "atlas_web_search ofrece búsqueda web; y atlas_routine administra automatizaciones "
        "deterministas. Realtime decide cuándo usar estas herramientas y continúa a partir "
        "del resultado. OpenClaw interviene en la reserva autenticada de la sesión, pero "
        "ninguno de sus agentes procesa por ello la conversación.",
    )
    replace_text(
        paragraphs[318],
        "Las consultas de fecha, RAM, almacenamiento, red y servicios pueden resolverse con "
        "atlas_shell. Las búsquedas utilizan atlas_web_search. Los comandos atlas-* reúnen "
        "tareas habituales y atlas-routines permite gestionarlas por SSH. Cuando una frase "
        "exacta ya tiene una rutina, WebScreen y atlas-chat la resuelven localmente antes de "
        "crear una respuesta de Realtime.",
    )

    new_section = [
        clone_with_text(paragraphs[321], "6.5 Rutinas deterministas y automatización"),
        clone_with_text(
            paragraphs[322],
            "Las rutinas sirven para tareas recurrentes con poco margen de variación, como "
            "consultar la hora o controlar un dispositivo ya identificado. La petición se "
            "normaliza y se compara con una frase de activación exacta antes de solicitar una "
            "respuesta al modelo. Si coincide, los pasos se ejecutan en la Raspberry Pi. Así "
            "se reducen latencia y consumo de tokens y se conserva una respuesta conocida.",
        ),
        clone_with_text(
            paragraphs[322],
            "El registro está en /home/atlas/.atlas/routines/ROUTINES.md: un documento legible "
            "con un bloque JSON validado y escrito de forma atómica. Cada definición guarda "
            "nombre, descripción, razonamiento de diseño, frases exactas, estado y pasos "
            "ordenados. Un paso shell puede capturar una salida en una variable; un paso SAY "
            "forma la respuesta oral. Si no existe SAY, el éxito es intencionadamente silencioso.",
        ),
        clone_with_text(
            paragraphs[322],
            "Las rutinas se pueden crear hablando con ATLAS o mediante atlas-routines por SSH. "
            "Durante la conversación, el sistema pregunta qué debe hacer, cuál será la frase "
            "exacta y qué nombre tendrá. Una acción dependiente del entorno puede probarse "
            "antes de guardarse para conservar el comando directo más corto que se haya "
            "verificado. Si un paso falla, la secuencia se detiene y registra el resultado. "
            "Realtime puede explicarlo o corregir una definición sencilla, pero no repite "
            "automáticamente una operación que quizá ya haya producido efectos.",
        ),
    ]
    for paragraph in new_section:
        paragraphs[321].addprevious(paragraph)
    replace_text(paragraphs[321], "6.6 Recuperación de conexiones y control de turnos")

    files["word/document.xml"] = ET.tostring(
        root, xml_declaration=True, encoding="UTF-8", standalone=True,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.output, "w") as output:
        for name, data in files.items():
            output.writestr(info[name], data)


if __name__ == "__main__":
    main()
