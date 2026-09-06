#!/usr/bin/env python3
"""Apply the September 2026 reliability update to Sami's annotated TDR.

Run with the bundled document runtime and the preserved September 3 source.
The input is deliberately checked: rerunning against an already edited report
must not append the new sections twice. All unrelated package parts are copied
byte-for-byte. Text edits preserve paragraph properties and existing run styles.
This is a migration, not the source of truth for later edits to the report.
"""

import argparse
from copy import deepcopy
from difflib import SequenceMatcher
from pathlib import Path
from zipfile import ZipFile

from lxml import etree as ET


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
NS = {"w": W}


def tag(name):
    return f"{{{W}}}{name}"


def text(p):
    return "".join(p.itertext()) if p.tag == tag("t") else "".join(p.xpath(".//w:t/text()", namespaces=NS))


def replace_text(p, new):
    """Replace differing spans only, retaining original runs and hyperlinks."""
    original = text(p)
    for operation, a, b, c, d in reversed(SequenceMatcher(None, original, new, autojunk=False).get_opcodes()):
        if operation == "equal":
            continue
        nodes = p.xpath(".//w:t", namespaces=NS)
        if not nodes:
            run = ET.SubElement(p, tag("r"))
            nodes = [ET.SubElement(run, tag("t"))]
        offset = 0
        start_node = None
        for node in nodes:
            value = node.text or ""
            end = offset + len(value)
            if start_node is None and a <= end:
                start_node = node
                local_a = a - offset
            if end > a and offset < b:
                lo, hi = max(0, a - offset), min(len(value), b - offset)
                node.text = value[:lo] + value[hi:]
            offset = end
        start_node = start_node if start_node is not None else nodes[-1]
        value = start_node.text or ""
        local_a = min(local_a, len(value))
        start_node.text = value[:local_a] + new[c:d] + value[local_a:]
        start_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    assert text(p) == new


# paragraph index, source prefix, replacement text
EDITS = [
    (56, "Reparto de tareas", "Realtime con contexto y herramientas directas"),
    (58, "Herramientas actuales", "Herramientas actuales y arquitectura futura"),
    (217, "En la configuración actual", "En la configuración actual, WebScreen y atlas-chat utilizan gpt-realtime-2.1 tanto para conversar como para decidir y ejecutar llamadas a herramientas. En una etapa anterior utilicé GPT-5.6 Luna como agente delegado de OpenClaw; esa separación forma parte de la evolución, pero ya no describe la ruta conversacional actual. La identidad de ATLAS sigue estando en sus instrucciones y archivos Markdown, no dentro de un modelo concreto."),
    (219, "Por esta razón considero", "La arquitectura sigue combinando servicios locales y modelos en la nube. La Raspberry Pi mantiene el contexto, las conexiones y la ejecución de comandos; Realtime interpreta la petición y recibe los resultados para continuar el turno. El modelo puede cambiar sin sustituir los archivos de identidad, la memoria ni las herramientas del dispositivo."),
    (222, "ATLAS se puede utilizar", "ATLAS se puede utilizar desde la terminal, Telegram, WebScreen y la aplicación Android. atlas-chat permite probar la misma ruta Realtime de WebScreen sin micrófono ni síntesis de voz. Telegram conserva su propio canal de OpenClaw. La aplicación permite conversar y administrar A1 desde el móvil. Compartir el ecosistema no implica que todos los canales utilicen el mismo transporte ni la misma presentación."),
    (227, "No todos estos archivos", "WebScreen y atlas-chat preparan actualmente el mismo contexto Markdown y la misma memoria conversacional compartida. AGENTS.md enlaza los manuales y anexos para que el modelo entienda los comandos y el entorno. Esta información se reúne al preparar la sesión; no se vuelve a cargar en cada fragmento de voz. Cargar un contexto amplio favorece la coherencia, pero también tiene un coste de preparación. Un índice selectivo queda como posible optimización futura y no como una función ya implementada."),
    (231, "Un modelo de lenguaje", "Un modelo de lenguaje puede explicar cómo se comprueba el almacenamiento de Linux, pero para decir cuánto espacio queda realmente necesita observar el sistema. En la ruta actual, Realtime solicita atlas_shell para ejecutar comandos y atlas_web_search para buscar información. El backend realiza la operación y devuelve su resultado. OpenClaw conserva además sus herramientas, plugins y conectores para los canales que los utilizan."),
    (233, "Para las tareas habituales", "Para las tareas habituales de ATLAS OS creé comandos con el prefijo atlas-. La intención era que una persona y el propio agente pudiesen utilizar una interfaz corta y recordable en vez de memorizar varios comandos de systemd, rutas y parámetros. atlas-status resume el dispositivo; atlas-screen controla la pantalla; atlas-app muestra el servicio y el dispositivo emparejado; atlas-rafas diagnostica problemas; y atlas-chat abre el chat de pruebas. Sus manuales se enlazan desde AGENTS.md y el catálogo de comandos."),
    (246, "La carpeta .openclaw", "La carpeta .openclaw contiene la configuración del Gateway, credenciales, sesiones, plugins y el workspace. La carpeta .atlas reúne las piezas específicas del dispositivo, entre ellas WebScreen, atlas-chat, la aplicación y su conexión, los modos gráficos, RAFAS y sus backups. Los proyectos creados desde WebScreen se almacenan en un workspace separado para no llenar de pruebas la carpeta principal del agente."),
    (249, "El comando atlas-screen", "El comando atlas-screen centraliza la gestión de la pantalla. Puede encenderla o apagarla con on y off, seleccionar --desktop, --terminal, --atlas o --rafas, y decidir qué modo se inicia automáticamente. --atlas-hide mantiene ATLAS en funcionamiento con una imagen negra y brillo mínimo. No equivale a apagar físicamente la pantalla: conserva el enlace HDMI que necesitan sus altavoces."),
    (252, "El modo atlas inicia", "El modo atlas inicia Google Chrome en modo kiosco y abre WebScreen en localhost. El cursor se oculta mientras no haya un ratón conectado y el usuario no puede salir accidentalmente a un escritorio convencional. --atlas-hide conserva esa misma sesión, el micrófono y la salida de voz bajo una capa negra. ATLAS conoce el modo y puede volver a --atlas cuando el usuario pide encender la pantalla."),
    (272, "La wake word se procesa", "En esta etapa también probé exigir un pequeño periodo sin voz antes de aceptar la wake word. El umbral llegó a situarse alrededor de cuatro décimas. Esa condición resultó demasiado restrictiva en el uso cotidiano y se retiró: el WebScreen actual valida la palabra exacta ATLAS sin exigir una pausa previa. El reconocimiento se inicia en el navegador, aunque el servicio de voz de Chrome no tiene por qué funcionar offline."),
    (283, "Una conversación natural", "Una conversación natural no está formada por turnos perfectamente aislados. El usuario puede interrumpir, corregirse o responder sin repetir la wake word. WebScreen añadió una ventana de seguimiento de diez segundos. En la implementación actual se abre después de una respuesta normal, aunque ATLAS no haya terminado con una pregunta; si el usuario comienza dentro de la ventana, su frase conserva el contexto del turno anterior."),
    (285, "La solución fue combinar", "La solución fue evolucionando con ventanas de supresión y comparación de estados. En el A1 que reproduce su voz por altavoces, la implementación actual bloquea la captura conversacional durante la salida y conserva una cola de protección de doscientas milésimas de segundo. Evita que ATLAS se responda a sí mismo, a cambio de limitar la interrupción por voz mientras suena. Ese compromiso no equivale a una cancelación acústica profesional."),
    (293, "El cambio más importante", "El cambio más importante es que la conversación deja de depender de una cadena rígida de transcripción, agente delegado y sintetizador externo. Realtime procesa el turno y produce la respuesta, con herramientas directas cuando necesita observar o modificar el entorno. La captura puede llegar como audio WebRTC o como texto reconocido por Chrome; en ambos casos se mantiene el mismo modelo conversacional."),
    (297, "WebRTC es", "WebRTC transporta audio y vídeo interactivo con baja latencia. Cuando se selecciona una voz nativa de Realtime, WebScreen recibe el audio como un stream remoto, sin esperar a descargar un archivo completo. La entrada puede proceder del micrófono o del texto reconocido por Chrome. La documentación de Realtime recomienda WebRTC para aplicaciones en navegador y WebSocket para integraciones de servidor. [guía de conversaciones Realtime]"),
    (299, "Realtime integra", "Realtime mantiene el razonamiento y las herramientas tanto si Chrome aporta texto como si llega audio. La salida depende de la voz elegida: voces nativas por WebRTC, browser mediante SpeechSynthesis, o ElevenLabs externa. Un transcriptor auxiliar en otras rutas de audio no es un segundo agente. Esta separación obliga a medir cada combinación: los tiempos de la voz marin no describen automáticamente la salida browser. Una herramienta lenta o una conexión inestable también afectan al total."),
    (300, "6.2 Reparto de tareas", "6.2 Realtime con contexto y herramientas directas"),
    (301, "En la arquitectura actual", "Realtime recibe el contexto privado de ATLAS, los archivos Markdown y la memoria compartida. Puede responder sobre el proyecto y utilizar herramientas dentro de su propio turno. Ya no necesita consultar a Luna para leer el sistema, buscar información o ejecutar un comando. El backend de WebScreen y el cliente atlas-chat reutilizan esta misma preparación para que una prueba en terminal no se realice con un asistente distinto."),
    (302, "Cuando Realtime detecta", "La herramienta atlas_shell ejecuta comandos en A1 y devuelve la salida real; atlas_web_search ofrece búsqueda web. Realtime decide cuándo usarlas y continúa a partir del resultado. OpenClaw interviene en la reserva autenticada de la sesión, pero ninguno de sus agentes procesa por ello la conversación. La antigua herramienta openclaw_agent_consult y la delegación a Luna describen una etapa anterior del proyecto."),
    (303, "Esta separación también", "Dar herramientas directas a la conversación aumenta su capacidad y también sus riesgos. Las instrucciones de ATLAS explican el alcance de los comandos, las comprobaciones previas y cuándo debe confirmar una acción. Los mensajes, los archivos encontrados y la salida de una herramienta se tratan como datos, no como nuevas autorizaciones. El registro de ejecución permite distinguir una intención del modelo de una acción realmente completada."),
    (304, "A largo plazo", "Un coordinador que delegue trabajos largos a agentes especializados sigue siendo una posibilidad futura. No se necesita para la ruta actual: Realtime conversa y llama a herramientas directamente. Si se añadiese esa coordinación, habría que medir su utilidad y permitir cancelar cada trabajo, sin presentar como disponible una función que todavía no se ha implementado."),
    (306, "La wake word continúa", "La wake word continúa siendo ATLAS. El detector del navegador valida la palabra exacta sin exigir silencio previo y reutiliza el texto que Chrome reconoce para formar la petición. La misma captura sirve para el seguimiento de diez segundos. Esto evita depender de que una segunda transcripción vuelva a reconocer correctamente una frase que Chrome ya había entendido. Los navegadores sin esa capacidad necesitan su ruta alternativa y deben verificarse por separado."),
    (307, "Al detectar la wake word", "Al detectar la wake word ya no reproduce “dime”. El sistema conserva la continuación de expresiones como “ATLAS, qué hora es”, une los fragmentos de la misma frase y evita enviar dos turnos por recibir resultados parciales y finales equivalentes. La detección, el cierre de la frase y el envío al modelo son estados distintos; aceptar la palabra no significa que la petición ya haya terminado."),
    (308, "Si ATLAS está hablando", "En los clientes que permiten interrupción por voz, la cancelación detiene la salida y el turno activo sin abrir otra sesión innecesariamente. Si el proveedor indica que ya no existe una respuesta activa, se trata como una cancelación ya resuelta, no como un fallo que obliga a reconectar. En el A1 con altavoces se prioriza la protección contra el eco descrita antes. Al terminar, la ventana de seguimiento permite continuar sin repetir ATLAS."),
    (309, "Para las pruebas en red", "Para las pruebas en red añadí control exclusivo: solo un cliente utiliza la conversación de WebScreen a la vez. Las comprobaciones periódicas distinguen una interrupción breve, la pérdida real del control y una sesión que ya no está autorizada. Un heartbeat perdido no debe mostrar inmediatamente “Sin conexión con la Pi” ni destruir una conversación que continúa funcionando. La recuperación tampoco vuelve a ejecutar por sí sola la última petición del usuario."),
    (312, "La siguiente ampliación lógica", "Las consultas de fecha, RAM, almacenamiento, red y servicios ya pueden resolverse con atlas_shell. Las búsquedas utilizan atlas_web_search. Los comandos atlas-* reúnen tareas habituales y documentan sus condiciones. Ante una operación destructiva o ambigua, ATLAS debe verificar la intención y pedir confirmación cuando corresponda; una reconexión nunca debe convertirse en permiso para repetir una acción."),
    (313, "Otra ampliación será", "Un índice de contexto sigue siendo una posible mejora. La implementación actual carga el conjunto Markdown compartido para mantener la misma identidad en WebScreen y atlas-chat. Antes de sustituirlo por recuperación selectiva, habrá que comprobar que no se pierden instrucciones, relaciones entre manuales ni información necesaria para ejecutar una tarea con seguridad."),
    (314, "Finalmente, el coordinador", "Las siguientes mejoras se centran en medir el flujo completo y separar sus fallos. Un error del proveedor no se corrige necesariamente renovando OAuth; un altavoz sin perfil de audio no se repara cambiando el modelo; y una Pi sin red no está disponible por el hecho de que la página siga abierta. Los diagnósticos deben identificar qué capa falla antes de actuar."),
    (326, "Durante la primera conexión", "Durante la primera conexión la Raspberry Pi mostraba el arranque por HDMI y después aparecía “No signal”. El hardware funcionaba; faltaba mantener una sesión gráfica activa. Los modos de atlas-screen permiten iniciar solo lo necesario. Más adelante comprobé que apagar físicamente esta pantalla también impedía utilizar sus altavoces: por eso --atlas-hide usa negro y brillo mínimo, manteniendo el dispositivo de audio disponible."),
    (330, "La salida utiliza", "La salida principal utiliza HDMI y los altavoces integrados de la pantalla, aunque también se puede seleccionar una barra de sonido Bluetooth. Estar emparejado no demuestra que exista una salida de audio. Para reproducir la voz, BlueZ debe conectar el perfil adecuado y PipeWire con WirePlumber deben presentar un sink, es decir, un destino de reproducción. La escucha física confirma después si el sonido llega realmente al altavoz."),
    (337, "ATLAS A1 puede", "ATLAS A1 ofrece cuatro modos visibles: Desktop, Terminal, Atlas y RAFAS. A ellos se añade Atlas Hide, que conserva el modo conversacional bajo una pantalla negra con brillo mínimo. El usuario puede cambiar entre ellos con atlas-screen y decidir cuál se inicia al encender el sistema. Apagar la pantalla con off y ocultar ATLAS con --atlas-hide son operaciones diferentes."),
    (344, "RAFAS registra", "RAFAS registra sus activaciones junto con los eventos de apagado. El comando atlas-rafas también ofrece diagnóstico de red y servicios, y atlas-rafas doctor intenta reparaciones conocidas; por ejemplo, puede guiar la elección de una red Wi-Fi cuando no hay conexión. No garantiza arreglar cualquier fallo. Su función sigue siendo permitir una recuperación local y comprensible cuando el modelo o Internet no están disponibles."),
    (350, "La evaluación de WebScreen", "La evaluación de WebScreen se centra en la conversación. No basta con que la respuesta final sea correcta: hay que medir cuánto silencio percibe el usuario, cuándo empieza la voz, cuánto tardan las herramientas y si el turno termina sin errores. Los registros permiten separar captura, envío al modelo, primera salida, herramientas y finalización. atlas-chat añade una prueba textual de la misma lógica, pero no demuestra por sí solo el funcionamiento del micrófono ni de los altavoces."),
    (351, "Los datos disponibles", "Las tablas de los apartados 8.2 y 8.3 conservan mediciones históricas del desarrollo, incluidas pruebas de la etapa que delegaba a Luna. No representan un benchmark del rework de septiembre de 2026. Son útiles para explicar los cuellos de botella que motivaron los cambios. La red, el estado de la sesión y los prompts no fueron idénticos en todos los casos, por lo que se presentan como observaciones y no como una promesa de rendimiento."),
    (353, "El instante de referencia", "En las tablas históricas, el instante de referencia es el final de la transcripción del usuario. Para las nuevas pruebas distingo además el final acústico de la frase, el envío del turno, el primer fragmento de texto o audio recibido y el comienzo de la reproducción. No son medidas intercambiables: ver una inferencia en un log no demuestra que ya haya sonado por el altavoz."),
    (356, "Tiempo de herramienta", "Tiempo de herramienta: duración de un comando o conector; en las series históricas incluye la consulta delegada a Luna."),
    (358, "Ruta utilizada", "Ruta utilizada: respuesta directa o herramienta Realtime; se identifica por separado la delegación que aparece en las series históricas."),
    (360, "8.2 Comparación", "8.2 Comparación histórica de los flujos"),
    (361, "Tabla 3.", "Tabla 3. Mediciones históricas de interacciones comparables, desde el final de la transcripción. La columna Realtime corresponde a la etapa con delegación a Luna."),
    (363, "El saludo es", "En esas pruebas el saludo mostraba un cambio evidente. El flujo anterior podía tardar casi seis segundos en producir un “hola”, frente a unas cuatro décimas en aquella sesión Realtime. La pregunta sobre un conejo pasó de más de seis segundos a poco más de uno y no necesitó una herramienta. Esos valores describen las sesiones observadas, no un límite garantizado de la versión actual."),
    (364, "El almacenamiento muestra", "El almacenamiento mostraba una lectura diferente. El primer preámbulo pasó de unos cinco segundos a unas tres décimas, pero el resultado final continuó alrededor de dieciséis segundos. En aquella arquitectura la mayor parte del tiempo correspondía al agente delegado. Esa observación motivó las herramientas directas de la ruta actual; no permite calcular su latencia sin una nueva medida."),
    (365, "La fecha y la hora", "La fecha y la hora revelaron el coste de delegar demasiado. El flujo anterior tenía una utilidad local que respondía en milisegundos después de la transcripción. En una prueba Realtime decidió consultar a Luna y el dato tardó más de diecisiete segundos. Hoy puede obtenerlo mediante una herramienta directa, pero el tiempo de esa ruta debe medirse por separado."),
    (366, "8.3 Resultados repetidos", "8.3 Series históricas de almacenamiento y herramientas"),
    (367, "Tabla 4.", "Tabla 4. Serie histórica de diez pruebas de almacenamiento con Realtime y delegación a Luna."),
    (369, "La serie confirma", "En esta serie histórica el primer audio quedó por debajo de medio segundo incluso en el peor valor. El resultado final varió varios segundos porque dominaba la consulta a Luna. La serie ayudó a decidir el cambio de arquitectura, pero no valida las reconexiones, el seguimiento ni la latencia del WebScreen actualizado."),
    (370, "Tabla 5.", "Tabla 5. Ejemplos históricos de consultas con herramientas en la etapa de delegación a Luna."),
    (373, "La conclusión principal", "Las mediciones históricas mostraron que Realtime podía reducir el silencio inicial en determinadas sesiones. También mostraron que un preámbulo rápido podía ocultar una espera larga hasta el resultado útil. El diseño actual conserva la conversación Realtime y elimina esa delegación intermedia; la evaluación debe comprobar tanto la rapidez como la fiabilidad, sin dar por resuelto un problema solo porque exista un primer fragmento."),
    (374, "Esto sugiere tres niveles", "La separación útil ahora es entre conversación, ejecución y transporte. Realtime interpreta y responde; las herramientas observan o modifican el entorno; WebScreen coordina captura, reproducción y conexión. Una prueba de lógica en atlas-chat sirve para aislar el modelo y las herramientas. La prueba de voz debe añadir el navegador y los dispositivos físicos para evaluar la experiencia completa."),
    (382, "La fiabilidad se apoya", "La fiabilidad se apoya en varios niveles: systemd supervisa servicios, atlas-status resume el dispositivo, atlas-rafas ofrece diagnóstico y recuperación local, y atlas-chat permite comprobar el modelo y sus herramientas sin depender del audio. Los logs y backups completan el diagnóstico. Un Gateway caído, una ruta de audio ausente o una respuesta 500 del proveedor deben registrarse por separado; renovar OAuth sin comprobar la causa puede no resolver ninguno de ellos."),
    (390, "Tabla 6.", "Tabla 7. Posición de ATLAS frente a alternativas habituales."),
    (395, "La evolución de WebScreen", "La evolución de WebScreen es probablemente el ejemplo más claro. El primer pipeline consiguió funcionar, pero acumulaba espera y complejidad. Las pruebas históricas con Realtime redujeron el primer audio de varios segundos a unas décimas en ciertas sesiones. Después incorporé contexto compartido y herramientas directas para retirar la delegación intermedia. Los fallos recientes de conexión y captura muestran que esa mejora debe acompañarse de pruebas repetidas de fiabilidad."),
    (400, "Añadir herramientas", "Ampliar la cobertura de pruebas de las herramientas directas de Realtime, con límites y resultados verificables."),
    (401, "Implementar delegación", "Evaluar, si aporta una mejora medible, una delegación asíncrona para trabajos largos sin bloquear la conversación."),
    (436, "OpenAI GPT-5.6 Luna", "OpenAI GPT-5.6 Luna en las etapas anteriores de delegación y pruebas de razonamiento."),
    (437, "OpenAI gpt-realtime-2.1", "OpenAI gpt-realtime-2.1 para la conversación actual, el razonamiento y las llamadas a herramientas de WebScreen y atlas-chat."),
    (439, "Web Speech API", "Web Speech API para la detección de ATLAS y la captura de texto en Chrome, además de las pruebas históricas de voz."),
]


def inserted_paragraph(template, content):
    p = ET.Element(tag("p"), nsmap=template.nsmap)
    props = template.find(tag("pPr"))
    if props is not None:
        p.append(deepcopy(props))
    run = ET.SubElement(p, tag("r"))
    original_run = template.find(tag("r"))
    if original_run is not None and original_run.find(tag("rPr")) is not None:
        run.append(deepcopy(original_run.find(tag("rPr"))))
    t = ET.SubElement(run, tag("t"))
    t.text = content
    return p


def add_comments(files, root, comments):
    name = "word/comments.xml"
    comment_root = ET.fromstring(files[name]) if name in files else ET.Element(tag("comments"), nsmap={"w": W})
    ids = [int(c.get(tag("id"))) for c in comment_root.findall(tag("comment"))]
    next_id = max(ids, default=-1) + 1
    for p, value in comments:
        cid = str(next_id)
        next_id += 1
        start = ET.Element(tag("commentRangeStart"), {tag("id"): cid})
        p.insert(1 if p.find(tag("pPr")) is not None else 0, start)
        ET.SubElement(p, tag("commentRangeEnd"), {tag("id"): cid})
        run = ET.SubElement(p, tag("r"))
        ET.SubElement(run, tag("commentReference"), {tag("id"): cid})
        c = ET.SubElement(comment_root, tag("comment"), {tag("id"): cid, tag("author"): "Codex", tag("initials"): "CX", tag("date"): "2026-09-06T16:00:00Z"})
        t = ET.SubElement(ET.SubElement(ET.SubElement(c, tag("p")), tag("r")), tag("t"))
        t.text = value
    files[name] = ET.tostring(comment_root, xml_declaration=True, encoding="UTF-8", standalone=True)
    rel_name = "word/_rels/document.xml.rels"
    rels = ET.fromstring(files[rel_name])
    type_url = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
    if not any(r.get("Type") == type_url for r in rels):
        used = {r.get("Id") for r in rels}
        index = 1
        while f"rId{index}" in used:
            index += 1
        ET.SubElement(rels, f"{{{R}}}Relationship", Id=f"rId{index}", Type=type_url, Target="comments.xml")
    files[rel_name] = ET.tostring(rels, xml_declaration=True, encoding="UTF-8", standalone=True)
    types = ET.fromstring(files["[Content_Types].xml"])
    if not any(n.get("PartName") == "/word/comments.xml" for n in types):
        ET.SubElement(types, f"{{{CT}}}Override", PartName="/word/comments.xml", ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml")
    files["[Content_Types].xml"] = ET.tostring(types, xml_declaration=True, encoding="UTF-8", standalone=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--measurement", help="Verified new measurement paragraph, otherwise target and limits only")
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        raise SystemExit("Use a separate output and preserve the original annotated source.")
    with ZipFile(args.source) as archive:
        files = {n: archive.read(n) for n in archive.namelist()}
        info = {n: archive.getinfo(n) for n in archive.namelist()}
    root = ET.fromstring(files["word/document.xml"])
    body = root.find(tag("body"))
    paragraphs = list(body.findall(tag("p")))
    if len(paragraphs) != 453:
        raise SystemExit("Expected the annotated September 3 document with 453 paragraphs; no output written.")
    original_notes = [ET.tostring(paragraphs[i]) for i in (239, 259, 295)]
    for index, prefix, replacement in EDITS:
        p = paragraphs[index]
        if not text(p).startswith(prefix):
            raise SystemExit(f"Source paragraph {index} differs from expected prefix {prefix!r}; no output written.")
        replace_text(p, replacement)

    # Small pagination repairs found in the all-page render review. The user's
    # annotation itself stays byte-for-byte identical; it need not occupy a
    # separate mostly blank page before chapter 5.
    for index in (188, 189):  # include the source's blank paragraph after the title
        paragraphs[index].find(tag("pPr")).insert(0, ET.Element(tag("keepNext"), {tag("val"): "1"}))
    paragraphs[260].find(tag("pPr")).find(tag("pageBreakBefore")).set(tag("val"), "0")

    # Current architecture table only. Historical numerical tables remain intact.
    tables = body.findall(tag("tbl"))
    table_updates = {
        (1, 2): "Audio WebRTC o texto reconocido por Chrome",
        (2, 2): "Texto reconocido por Chrome o transcripción auxiliar según la ruta de entrada",
        (4, 2): "Realtime con el contexto de ATLAS y herramientas directas",
        (5, 2): "Voz nativa por WebRTC, browser con SpeechSynthesis o ElevenLabs, según selección",
        (6, 2): "Estados de turno y cancelación controlados; protección contra eco en el A1",
        (7, 2): "Sesión Realtime, herramientas directas y recuperación de conexión diferenciada",
    }
    for (row, col), value in table_updates.items():
        cell = tables[0].findall(tag("tr"))[row].findall(tag("tc"))[col]
        replace_text(cell.find(tag("p")), value)
    replace_text(tables[5].findall(tag("tr"))[4].findall(tag("tc"))[3].find(tag("p")), "Contexto, canales y reserva autenticada de la sesión Realtime.")

    def insert_after(index, blocks):
        previous = paragraphs[index]
        created = []
        for kind, content in blocks:
            template_index = {"heading": 300, "body": 301, "list": 443}[kind]
            p = inserted_paragraph(paragraphs[template_index], content)
            previous.addnext(p)
            previous = p
            created.append(p)
        return created

    chat = insert_after(234, [
        ("heading", "3.5 Chat de terminal para pruebas"),
        ("body", "atlas-chat abre una conversación de texto con gpt-realtime-2.1. La opción -p permite enviar un prompt directamente y facilita repetir pruebas. Utiliza la misma reserva autenticada, contexto, memoria y herramientas que WebScreen; cambian el transporte y las instrucciones de presentación, porque una terminal no necesita pronunciar siglas ni reproducir voz."),
        ("body", "La versión 1.1.0 incorpora entrada multilínea, historial y sugerencias al escribir / o @. /help muestra los comandos disponibles y @ ayuda a referenciar archivos. Las respuestas se muestran en blanco, mientras que las herramientas y su salida aparecen en gris. Los comandos largos se acortan solo en la vista: /expand permite leerlos completos y /compact cambia ese comportamiento sin alterar lo que se ejecuta. El modo --ephemeral evita incorporar los turnos a la memoria conversacional compartida; no implica borrar por sí solo los registros locales."),
    ])
    reliability = insert_after(314, [
        ("heading", "6.5 Recuperación de conexiones y control de turnos"),
        ("body", "El rework distingue conexión con la Pi, transporte Realtime y Gateway. WebScreen comprueba el control cada 1,5 segundos y tolera ocho de interrupción; el servidor conserva la reserva veinte segundos. Los errores de autorización siguen una recuperación distinta. La tolerancia no mantiene disponible una Pi sin red."),
        ("body", "Las sesiones antiguas no alteran la nueva. El cliente espera doce segundos la confirmación de respuesta y tolera ocho de pérdida de transporte. Renueva sesiones a los cincuenta minutos, en reposo. No reenvía peticiones anteriores ni repite operaciones tras reconectar."),
        ("body", "El puente comprueba y recupera el Gateway en segundo plano: un ECONNREFUSED no termina el proceso. Lee el cuerpo HTTP antes de reutilizar conexiones. Un fallo 500 o de transcripción no demuestra por sí solo que OAuth esté dañado."),
    ])
    insert_after(331, [
        ("body", "En la revisión de septiembre, la barra de sonido estaba emparejada pero no tenía disponible su perfil A2DP. WirePlumber dependía de una sesión de escritorio activa que no existía para ese usuario. Un ajuste limitado al usuario de audio de A1 permitió recuperar la conexión y presentar el sink de la barra. Ver ese destino confirma el enlace y la ruta de software, pero la audibilidad debe comprobarse físicamente."),
        ("body", "Para dispositivos Android, el diagnóstico ADB distingue un equipo desconectado, uno offline y uno sin autorización. Los reintentos tienen un límite y una consulta que agota su tiempo no borra el inventario de dispositivos conocidos. Una clave no autorizada sigue requiriendo aceptación en el teléfono; un intento de recuperación no debe saltarse ese consentimiento."),
    ])
    measurement = args.measurement or "El objetivo sigue siendo comenzar una respuesta hablada sencilla entre uno y tres segundos, con la sesión preparada; no es una garantía. El 6 de septiembre se probaron dos tandas en Chrome sin interfaz, con contexto completo, WebRTC real y voz marin temporal. Se inyectó el resultado textual del reconocimiento, por lo que la prueba no mide la escucha de la wake word. El evento output_audio_buffer.started señala el inicio del audio remoto, no acredita que se haya oído por los altavoces físicos."
    verification = insert_after(376, [
        ("heading", "8.5 Verificación del rework de septiembre"),
        ("body", "La revisión superó 277 pruebas de regresión: 70 del backend Python, 125 de JavaScript y 82 del sistema. Las tandas no registraron errores de JavaScript. Un heartbeat perdido mantuvo la conexión y un error 401 simulado renovó el acceso y Realtime. Con el proveedor real, cancelar antes de recibir la confirmación produjo una única petición, cancelada por su identificador, sin reactivar la respuesta. También se verificaron la ruta de audio Bluetooth y el enlace ADB a una televisión autorizada. Son comprobaciones concretas, no una validación de cualquier dispositivo o red."),
        ("body", measurement),
    ])
    verification_props = verification[0].find(tag("pPr"))
    page_break = verification_props.find(tag("pageBreakBefore"))
    if page_break is None:
        page_break = ET.SubElement(verification_props, tag("pageBreakBefore"))
    page_break.set(tag("val"), "1")
    caption = inserted_paragraph(paragraphs[367], "Tabla 6. Pruebas acotadas del 6 de septiembre de 2026. Los tiempos de WebRTC parten del envío del texto reconocido.")
    caption_props = caption.find(tag("pPr"))
    ET.SubElement(caption_props, tag("keepNext"), {tag("val"): "1"})
    verification[-1].addnext(caption)
    table = ET.Element(tag("tbl"), nsmap=tables[1].nsmap)
    table.append(deepcopy(tables[1].find(tag("tblPr"))))
    grid = ET.SubElement(table, tag("tblGrid"))
    widths = (2200, 2500, 4329)
    for width in widths:
        ET.SubElement(grid, tag("gridCol"), {tag("w"): str(width)})
    rows = [
        ("Prueba", "Resultado", "Alcance de la medida"),
        ("WebRTC, seis turnos", "1,214–3,075 s", "Desde texto reconocido sintético hasta inicio del audio remoto; gpt-realtime-2.1, contexto completo y voz marin."),
        ("Seguimiento, un turno", "1,085 s", "Continuación sin repetir ATLAS: suma conversacional correcta. Mismo método, sin prueba acústica."),
        ("atlas-chat, un turno", "2,68 s primer texto; 3,01 s total", "Consulta real con uname, uptime y systemctl mediante una herramienta; modo --ephemeral. No mide voz."),
    ]
    original_rows = tables[1].findall(tag("tr"))
    for row_index, values in enumerate(rows):
        tr = ET.SubElement(table, tag("tr"))
        tr_props = ET.SubElement(tr, tag("trPr"))
        ET.SubElement(tr_props, tag("cantSplit"))
        if row_index == 0:
            ET.SubElement(tr_props, tag("tblHeader"))
        for width, source_cell, value in zip(widths, original_rows[0 if row_index == 0 else 1].findall(tag("tc")), values):
            tc = ET.SubElement(tr, tag("tc"))
            tc_props = deepcopy(source_cell.find(tag("tcPr")))
            cell_width = tc_props.find(tag("tcW"))
            if cell_width is None:
                cell_width = ET.SubElement(tc_props, tag("tcW"), {tag("type"): "dxa"})
            cell_width.set(tag("w"), str(width))
            tc.append(tc_props)
            tc.append(inserted_paragraph(source_cell.find(tag("p")), value))
    caption.addnext(table)
    table.addnext(inserted_paragraph(paragraphs[301], "Una prueba adicional con un archivo WAV en Chrome sin interfaz agotó el tiempo sin reconocer la frase. Por tanto, estas medidas no validan todavía la detección acústica de ATLAS ni la escucha por los altavoces reales. La voz guardada en A1 siguió siendo browser; marin solo se utilizó para estas pruebas."))
    insert_after(443, [("list", "Rich y prompt-toolkit para el renderizado, la edición de entrada y el autocompletado de atlas-chat."), ("list", "BlueZ, PipeWire y WirePlumber para las conexiones y la salida de audio Bluetooth; ADB para las funciones autorizadas en dispositivos Android.")])
    # Matching entries in the manually authored outline.
    for index, content in [(38, "Chat de terminal para pruebas"), (58, "Recuperación de conexiones y control de turnos"), (74, "Verificación del rework de septiembre")]:
        paragraphs[index].addnext(inserted_paragraph(paragraphs[index], content))

    add_comments(files, root, [
        (chat[0], "Actualización del 6 de septiembre de 2026: atlas-chat 1.1.0 comparte la ruta Realtime y el contexto de WebScreen. Las diferencias son de entrada, transporte y presentación."),
        (paragraphs[300], "Se sustituye la arquitectura que presentaba Luna como delegado actual. Su explicación y las mediciones anteriores se conservan como historia del proyecto."),
        (reliability[0], "Se documentan los cambios de recuperación y sus límites. La tolerancia a fallos transitorios no garantiza conexión cuando la Pi o Internet dejan de estar disponibles."),
        (paragraphs[351], "Las cifras anteriores se conservan sin cambiarlas y se identifican como históricas. El objetivo de uno a tres segundos requiere nuevas medidas de voz del flujo actualizado."),
    ])
    assert [ET.tostring(paragraphs[i]) for i in (239, 259, 295)] == original_notes
    files["word/document.xml"] = ET.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.output, "w") as archive:
        for name, value in files.items():
            archive.writestr(info[name] if name in info else name, value)
    with ZipFile(args.source) as source, ZipFile(args.output) as output:
        changed = {n for n in source.namelist() if source.read(n) != output.read(n)}
    assert changed <= {"word/document.xml", "word/_rels/document.xml.rels", "[Content_Types].xml"}
    print(f"Updated {len(EDITS)} existing paragraphs; preserved all three inline notes and historical numerical tables.")
    print(args.output)


if __name__ == "__main__":
    main()
