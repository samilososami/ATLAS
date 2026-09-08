# ATLAS CHAT

`atlas-chat` abre ATLAS dentro de la terminal, solo por texto. Utiliza
`gpt-realtime-2.1` con el mismo OAuth, instrucciones Realtime, contexto Markdown,
memoria conversacional y contrato de herramientas que WebScreen. Incluye
`atlas_shell`, `atlas_web_search`, `atlas_routine`, la API nativa tipada
`atlas_phone` y el control visual tipado `atlas_android`. No usa el pipeline
legacy ni sintetiza o captura voz.

```bash
atlas-chat
atlas-chat -p "Comprueba la temperatura de la Pi"
atlas-chat --ephemeral -p "Prueba de latencia"
atlas-chat --verbose
atlas-chat --help
atlas-chat --version
```

- `-p` o `--prompt` envía un único turno y termina.
- `--ephemeral` no carga ni modifica la memoria conversacional compartida;
  el historial local de entrada y los logs privados sí se conservan.
- `--verbose` añade a los logs los tipos de evento del proveedor para depurar,
  sin registrar el secreto OAuth ni los payloads completos.
- `--help` muestra las opciones y `--version` imprime la versión del cliente.

En la sesión interactiva:

- `/help` muestra los comandos internos.
- `/new` renueva la conexión Realtime.
- `/context` muestra cuánto contexto privado se ha cargado.
- `/model` muestra el modelo y razonamiento configurados.
- `/logs` muestra la ruta de los registros locales.
- `/clear` limpia la pantalla y `/quit` termina.
- `/files` muestra la carpeta base para referencias `@`.
- `/expand` muestra completas las herramientas del último turno.
- `/compact` alterna el detalle visual de herramientas; no compacta memoria.
- `Ctrl+C` interrumpe la respuesta actual y `Ctrl+D` sale desde el prompt.

Escribe `/h` para sugerencias de comandos o `@` para sugerencias de archivos.
Tab y flechas permiten elegir; Enter acepta la sugerencia seleccionada o envía.
Alt+Enter o Ctrl+J añade una línea. El prefijo `sami ›` se conserva al borrar,
pegar varias líneas y redimensionar la terminal. Las sugerencias de historial
aparecen en gris y se aceptan con flecha derecha.

`@AGENTS.md` y `@atlas-commands/` parten del workspace de OpenClaw; también se
admiten rutas absolutas y `@"ruta con espacios.md"`. Se envía la ruta resuelta,
sin adjuntar contenido automáticamente ni recorrer carpetas recursivamente.

Las respuestas y comentarios de ATLAS aparecen en blanco. Las llamadas a tools,
los comandos reales y sus salidas aparecen en gris. Cada turno muestra el tiempo
hasta el primer texto, el tiempo total y el número de tools. El historial y los
diagnósticos JSONL son privados y se guardan en `/home/atlas/.atlas/chat/`.
Las respuestas renderizan Markdown progresivo. La vista compacta limita los
comandos a tres líneas y las salidas a ocho, con elipsis para líneas largas.
La ejecución y el resultado entregado al modelo conservan el contenido completo.
Las sesiones normales leen y escriben la memoria conversacional compartida con
WebScreen. `--ephemeral` permite medir o diagnosticar sin leerla ni añadir ese
turno. La capa `TERMINAL_INSTRUCTIONS.md` conserva identidad, herramientas y
criterio, pero sustituye las reglas exclusivas de voz por presentación técnica
de terminal: Markdown conciso, rutas, cifras y unidades legibles.

Para el teléfono, `atlas_phone` es siempre la primera opción. Acepta operaciones
canónicas como `phone.capabilities`, `location.get` y `phone.call`, además de los
aliases `capabilities`, `location`, `get_location`, `call` y `calls.place`.
`Amazon` abre Amazon Shopping y `Alexa` abre la app Alexa, sin intercambiarlas;
la ubicación del teléfono emparejado conserva y muestra su `formattedAddress`
completa cuando Android la devuelve.
`atlas_android` queda reservado para pantallas que haya que observar o tocar y
solo admite su allowlist cerrada: `status`, `start`, `stop`, `screenshot`,
`tree`, `click`, `tap`, `long_press`, `swipe`, `text`, `key`, `back`, `home`, `recents`,
`launch` y `wait`, todos bajo el prefijo `androiduse.`; `key` acepta `ENTER`.
`click` usa una etiqueta accesible exacta y tiene prioridad; sus gestos de
fallback usan coordenadas normalizadas de `0` a `1`.

Una captura no se devuelve como texto ni como base64: después del resultado de
la función se añade un `input_image` JPEG privado y reducido para que Realtime
pueda ver la pantalla. La jerarquía de Accesibilidad redacta campos de contraseña
y sus descendientes. Los fallos recuperables de acción o inspección mantienen la
sesión para corregirla. Todo flujo visual llama a `androiduse.stop` al completar
o abandonar la tarea, y ante cancelación, timeout, salida del cliente o pérdida
terminal del dispositivo, socket o servicio de Accesibilidad.

Puede invocarse como `sami` o como root. En ambos casos el proceso se ejecuta
como el usuario de servicio `sami`, evitando archivos root dentro del estado de
ATLAS. Las mismas prohibiciones permanentes de la shell Realtime de WebScreen se
aplican también aquí.

No necesita que el servicio HTTP de WebScreen esté abierto, pero sí su runtime,
entorno virtual, Gateway/OAuth válido y acceso de red a OpenAI. Se instala o
actualiza con `sudo bash system/install-chat.sh`, que crea una copia fechada y
preserva los documentos privados existentes al añadir referencias ausentes.
