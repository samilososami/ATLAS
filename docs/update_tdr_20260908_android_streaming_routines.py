#!/usr/bin/env python3
"""Apply the 2026-09-08 Android, transport, TTS and routines TDR update.

This is a deterministic OOXML migration for the exact DOCX inspected on
2026-09-08. It refuses a changed source, an in-place edit, an existing output,
or unresolved verification markers. The source DOCX is never modified.

Before running, replace the three __FINAL_*__ values below with the evidence
from the final rerun/deployment. Then use the bundled document runtime:

    /home/kali/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
      docs/update_tdr_20260908_android_streaming_routines.py \
      docs/atlas-teorico-codex.docx \
      docs/atlas-teorico-codex-20260908.docx

After generation, render every page with the bundled documents renderer and
inspect the PNGs before replacing or publishing any canonical artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import tempfile
from copy import deepcopy
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree as ET


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"

SOURCE_SHA256 = "f08c1f9ea8a4e051a4fb27d61a794d3e3cd2eea312b96c97fa2160589e72932e"
SOURCE_BODY_PARAGRAPHS = 505

# Evidence from the final automated, deployed and physical verification.
FINAL_AUTOMATED_TOTAL = "598"
FINAL_SCREENSHOT_METRICS = (
    "un inicio de Android Use en 192,2 ms; una captura JPEG válida en 471,0 ms, "
    "reducida de 1080 × 2316 a 640 × 1372 y 41.299 bytes; y, tras un clic "
    "semántico sobre una etiqueta deliberadamente inexistente que devolvió el "
    "HTTP 502 esperado en 183,3 ms, la sesión aún enabled=true y controlling=true, "
    "otra captura JPEG de 640 × 1372 y 41.175 bytes en 337,6 ms y el árbol "
    "filtrado en 165,0 ms"
)
FINAL_ROUTINE_METRICS = (
    "8,4–10,9 ms en el motor, 53,9 ms mediante HTTP y, en atlas-chat, 0,01 s "
    "hasta la salida visible y 592,5 ms para el proceso completo"
)


def tag(local_name: str) -> str:
    return f"{{{W}}}{local_name}"


def paragraph_text(paragraph: ET._Element) -> str:
    return "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))


def replace_paragraph_text(paragraph: ET._Element, value: str) -> None:
    """Replace visible text while preserving paragraph and first-run styling."""
    text_nodes = paragraph.xpath(".//w:t", namespaces=NS)
    if not text_nodes:
        run = ET.SubElement(paragraph, tag("r"))
        text_nodes = [ET.SubElement(run, tag("t"))]
    text_nodes[0].text = value
    text_nodes[0].set(XML_SPACE, "preserve")
    for node in text_nodes[1:]:
        node.text = ""
    if paragraph_text(paragraph) != value:
        raise RuntimeError("OOXML text replacement did not round-trip exactly")


def clone_paragraph(template: ET._Element, value: str) -> ET._Element:
    clone = deepcopy(template)
    replace_paragraph_text(clone, value)
    return clone


def source_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


REPLACEMENTS: dict[int, tuple[str, str]] = {
    246: (
        "La aplicación Android convierte el móvil",
        "La versión Android 0.2.4-preview convierte el móvil en otro terminal de "
        "ATLAS. Su interfaz separa la conversación, las acciones configurables, la "
        "terminal, el estado del A1 y los ajustes. La ruta de voz prepara "
        "gpt-realtime-2.1 al mostrar la aplicación, antes de pulsar el micrófono. Al "
        "enviarla a segundo plano libera WebRTC para reducir el consumo y vuelve a "
        "prepararlo al regresar. El chat es de texto, muestra el mensaje del usuario "
        "de inmediato y recibe la respuesta progresivamente.",
    ),
    250: (
        "La ruta principal de conexión utiliza una red privada Tailscale",
        "La ruta principal de conexión utiliza una red privada Tailscale compartida "
        "por razer, atlas-a1 y s23u. Cuando el teléfono y A1 comparten una LAN, "
        "Tailscale prioriza una ruta UDP directa entre pares para reducir la latencia. "
        "Si la topología no permite el enlace directo, mantiene el mismo transporte "
        "cifrado mediante un relay DERP. Ambas rutas permanecen dentro de la tailnet y "
        "evitan publicar el Companion en Internet; tailscale status y tailscale ping "
        "permiten distinguir la ruta realmente utilizada.",
    ),
    251: (
        "La aplicación resuelve atlas-a1 mediante MagicDNS",
        "Los emparejamientos actuales guardan "
        "wss://<IPv4 Tailscale 100.x>:5010/app. Esa dirección es privada de la tailnet, "
        "no una dirección de la LAN. MagicDNS queda solo para la migración de "
        "emparejamientos v1 o para equipos sin IPv4 Tailscale y tampoco sale de la "
        "tailnet. Cloudflare no se activa automáticamente como recuperación. TLS "
        "fijado y AES-GCM protegen además el transporte y cada mensaje, de modo que "
        "pertenecer a Tailscale no sustituye el emparejamiento propio de ATLAS.",
    ),
    254: (
        "ATLAS prioriza las interfaces nativas de Android",
        "ATLAS prioriza las interfaces nativas de Android. atlas-app control reúne "
        "operaciones estructuradas para consultar o modificar, según los permisos "
        "concedidos, llamadas, SMS, contactos, calendario, notificaciones, ubicación y "
        "archivos. location.get devuelve formattedAddress completo y campos address "
        "estructurados cuando Android puede geocodificar; si no puede, conserva las "
        "coordenadas y el error sin inventar una dirección. Al informar al propietario, "
        "ATLAS reproduce esa dirección exacta y no la reduce a una ciudad. Algunas "
        "operaciones exigen confirmación, una aplicación predeterminada o un rol "
        "especial, y ningún permiso se concede automáticamente.",
    ),
    255: (
        "La automatización visual se reserva para tareas",
        "La automatización visual se reserva para tareas sin una API adecuada. "
        "atlas-androiduse ofrece start, status, screenshot, tree, click, tap, "
        "long-press, swipe, text, key, launch, wait y stop. androiduse.click busca "
        "primero el texto visible o la descripción accesible indicada y pulsa el nodo "
        "coincidente o su ancestro clicable; las coordenadas normalizadas quedan como "
        "fallback cuando no existe una etiqueta accesible. start no solicita una "
        "captura inicial, mientras que las acciones visuales posteriores vuelven a "
        "inspeccionar el estado.",
    ),
    257: (
        "El teléfono devuelve un error explícito",
        "Un error recuperable de click, gesto, captura o inspección conserva la sesión "
        "Android Use activa para poder corregir el siguiente paso. Solo la pérdida "
        "terminal del socket, el dispositivo o el servicio de Accesibilidad, además de "
        "la cancelación, el watchdog, la salida del cliente o el final de la tarea, "
        "obliga a detenerla. Las capturas pueden contener mensajes, nombres o datos "
        "privados, por lo que permanecen dentro del turno y no se incorporan a los logs "
        "generales.",
    ),
    302: (
        "La interfaz de depuración incluyó un selector",
        "La interfaz de depuración incluye un selector entre el TTS del navegador y "
        "ElevenLabs, además de una pestaña independiente para medir la voz. La ruta "
        "externa utiliza por defecto eleven_flash_v2_5 y el proxy reenvía cada "
        "fragmento HTTP disponible tan pronto como llega, sin esperar a completar un "
        "bloque de 8 KiB. El hito playing se registra cuando Chrome comienza la "
        "reproducción; la latencia anterior del proveedor, la red, la decodificación y "
        "el búfer sigue formando parte de la espera percibida.",
    ),
    332: (
        "Las consultas de fecha, RAM, almacenamiento",
        "Las consultas de fecha, RAM, almacenamiento, red y servicios pueden resolverse "
        "con atlas_shell. Las búsquedas utilizan atlas_web_search y atlas-routines "
        "gestiona automatizaciones. Cuando coincide una frase exacta, la rutina se "
        "ejecuta una sola vez. Si termina correctamente y devuelve requiresModel: "
        "false, WebScreen o atlas-chat entrega, si existe, únicamente el SAY resuelto "
        "sin abrir una respuesta Realtime. Con requiresModel: true, o si la ejecución "
        "falla, entrega al modelo el executionId para consultar el resultado ya "
        "registrado mediante last_result, sin repetir los pasos.",
    ),
    336: (
        "Las rutinas sirven para tareas recurrentes",
        "Las rutinas sirven para tareas recurrentes con poco margen de variación. La "
        "petición se normaliza y se compara con activaciones exactas. requires_model "
        "separa los éxitos completamente deterministas de los que necesitan una "
        "interpretación posterior: con false, una ejecución correcta evita el modelo; "
        "con true, Realtime continúa a partir de la ejecución ya completada. Los fallos "
        "se remiten igualmente al modelo con su executionId, sin repetir la rutina.",
    ),
    337: (
        "El registro está en /home/atlas/.atlas/routines/ROUTINES.md",
        "El registro está en /home/atlas/.atlas/routines/ROUTINES.md: un documento "
        "legible con un bloque JSON validado y escrito de forma atómica. Cada definición "
        "guarda nombre, descripción, triggers como cadenas canónicas, estado, "
        "requires_model y pasos ordenados; las representaciones legacy de triggers se "
        "normalizan al leerlas. Un paso shell puede capturar una variable y SAY forma la "
        "respuesta. Una variable SAY sin resolver produce un fallo y nunca se pronuncia; "
        "sin SAY, el éxito es intencionadamente silencioso.",
    ),
    338: (
        "Las rutinas se pueden crear hablando con ATLAS",
        "Las rutinas se pueden crear hablando con ATLAS o mediante atlas-routines por "
        "SSH. list muestra solo líneas como 1. hora · activa; list --expand añade ID, "
        "descripción, frases, Modelo: sí/no y pasos. Las creaciones nuevas incluyen "
        "requires_model y la CLI permite elegirlo con --requires-model o "
        "--no-requires-model. Si un paso falla, la secuencia se detiene y registra el "
        "resultado; ninguna recuperación repite automáticamente una operación que quizá "
        "ya haya producido efectos.",
    ),
    487: (
        "ElevenLabs para las pruebas de síntesis de voz externa.",
        "ElevenLabs Flash v2.5 para síntesis de voz externa en streaming de baja "
        "latencia.",
    ),
    500: (
        "Android SDK, Java, WebView y AccessibilityService",
        "ATLAS Android 0.2.4-preview, Android SDK, Java, WebView y "
        "AccessibilityService para la aplicación móvil, sus permisos y la "
        "automatización visual autorizada.",
    ),
    501: (
        "Tailscale, WireGuard, MagicDNS y DERP",
        "Tailscale IPv4 privada, WireGuard, MagicDNS de compatibilidad y DERP cifrado "
        "para la red privada entre razer, atlas-a1 y s23u.",
    ),
}


SCREENSHOT_PARAGRAPH = (
    "Las capturas se reducen a un máximo de 640 píxeles de ancho y se codifican "
    "como JPEG con calidad 82 antes de enviarse. El backend conserva internamente mime "
    "e imageBase64 para interpretar el formato real, acepta PNG antiguos y elimina el "
    "base64 del resultado visible para el modelo. La reducción no cambia las "
    "coordenadas físicas utilizadas por los gestos."
)


def verification_paragraph() -> str:
    return (
        "En la tanda de cierre iniciada el 8 y finalizada el 9 de septiembre de 2026 "
        "se registraron "
        f"{FINAL_AUTOMATED_TOTAL} comprobaciones automatizadas, además de lint y build "
        "Android. Para Android 0.2.4, la comprobación física y de capturas registró "
        f"{FINAL_SCREENSHOT_METRICS}. Para las rutinas, la comprobación registró "
        f"{FINAL_ROUTINE_METRICS}. El cierre distingue los contratos automatizados de "
        "la evidencia en dispositivo. Tailscale confirmó una ruta UDP directa. En una "
        "solicitud real corta, ElevenLabs entregó el primer byte de audio en 1,201 s y "
        "completó el flujo HTTP en 1,212 s; esta medida no se confunde con el evento "
        "posterior playing del navegador."
    )


def validate_metrics() -> None:
    values = {
        "FINAL_AUTOMATED_TOTAL": FINAL_AUTOMATED_TOTAL,
        "FINAL_SCREENSHOT_METRICS": FINAL_SCREENSHOT_METRICS,
        "FINAL_ROUTINE_METRICS": FINAL_ROUTINE_METRICS,
    }
    unresolved = [name for name, value in values.items() if value.startswith("__FINAL_")]
    if unresolved:
        joined = ", ".join(unresolved)
        raise SystemExit(
            f"Fill the final verification markers before running: {joined}; no output written."
        )


def validate_source(source: Path, output: Path) -> None:
    if not source.is_file():
        raise SystemExit(f"Source does not exist: {source}")
    if source.resolve() == output.resolve():
        raise SystemExit("Use a separate output path; the source DOCX must remain intact.")
    if output.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {output}")
    actual = source_digest(source)
    if actual != SOURCE_SHA256:
        raise SystemExit(
            f"Source SHA-256 is {actual}, expected {SOURCE_SHA256}; no output written."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    validate_metrics()
    validate_source(args.source, args.output)

    with ZipFile(args.source, "r") as archive:
        names = archive.namelist()
        infos = {name: archive.getinfo(name) for name in names}
        files = {name: archive.read(name) for name in names}
        archive_comment = archive.comment

    root = ET.fromstring(files["word/document.xml"])
    body = root.find(tag("body"))
    if body is None:
        raise SystemExit("word/document.xml has no w:body; no output written.")
    paragraphs = body.findall(tag("p"))
    if len(paragraphs) != SOURCE_BODY_PARAGRAPHS:
        raise SystemExit(
            f"Expected {SOURCE_BODY_PARAGRAPHS} body paragraphs, found "
            f"{len(paragraphs)}; no output written."
        )

    for index, (expected_prefix, replacement) in REPLACEMENTS.items():
        current = paragraph_text(paragraphs[index])
        if not current.startswith(expected_prefix):
            raise SystemExit(
                f"Paragraph {index} no longer starts with {expected_prefix!r}; "
                "no output written."
            )
        replace_paragraph_text(paragraphs[index], replacement)

    paragraphs[255].addnext(clone_paragraph(paragraphs[255], SCREENSHOT_PARAGRAPH))
    paragraphs[409].addnext(
        clone_paragraph(paragraphs[409], verification_paragraph())
    )

    files["word/document.xml"] = ET.tostring(
        root,
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=f".{args.output.name}.",
            suffix=".tmp",
            dir=args.output.parent,
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
        with ZipFile(temporary_path, "w", compression=ZIP_DEFLATED) as output_archive:
            output_archive.comment = archive_comment
            for name in names:
                output_archive.writestr(infos[name], files[name])
        with ZipFile(temporary_path, "r") as check:
            bad_member = check.testzip()
            if bad_member is not None:
                raise RuntimeError(f"Generated DOCX has a bad ZIP member: {bad_member}")
        os.replace(temporary_path, args.output)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    print(f"Wrote {args.output}")
    print(f"SHA-256 {source_digest(args.output)}")


if __name__ == "__main__":
    main()
