# ATLAS CHAT

`atlas-chat` abre ATLAS dentro de la terminal, solo por texto. Utiliza
`gpt-realtime-2.1` con el mismo OAuth, instrucciones Realtime, contexto Markdown,
memoria conversacional, shell y búsqueda web que WebScreen. No usa el pipeline
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
- `--ephemeral` no carga el historial conversacional y tampoco guarda el turno.
- `--verbose` añade a los logs los tipos de evento del proveedor para depurar,
  sin registrar el secreto OAuth ni los payloads completos.
- `--help` muestra las opciones y `--version` imprime la versión del cliente.

En la sesión interactiva:

- `/help` muestra los comandos internos.
- `/new` renueva la conexión Realtime.
- `/context` muestra cuánto contexto privado se ha cargado.
- `/model` muestra el modelo y razonamiento efectivos.
- `/logs` muestra la ruta de los registros locales.
- `/clear` limpia la pantalla y `/quit` termina.
- `Ctrl+C` interrumpe la respuesta actual y `Ctrl+D` sale desde el prompt.

Las respuestas y comentarios de ATLAS aparecen en blanco. Las llamadas a tools,
los comandos reales y sus salidas aparecen en gris. Cada turno muestra el tiempo
hasta el primer texto, el tiempo total y el número de tools. El historial y los
diagnósticos JSONL son privados y se guardan en `/home/atlas/.atlas/chat/`.
Las sesiones normales leen y escriben la memoria conversacional compartida con
WebScreen. `--ephemeral` permite medir o diagnosticar sin leerla ni añadir ese
turno. La capa `TERMINAL_INSTRUCTIONS.md` conserva identidad, herramientas y
criterio, pero sustituye las reglas exclusivas de voz por presentación técnica
de terminal: Markdown conciso, rutas, cifras y unidades legibles.

Puede invocarse como `sami` o como root. En ambos casos el proceso se ejecuta
como el usuario de servicio `sami`, evitando archivos root dentro del estado de
ATLAS. Las mismas prohibiciones permanentes de la shell Realtime de WebScreen se
aplican también aquí.

No necesita que el servicio HTTP de WebScreen esté abierto, pero sí su runtime,
entorno virtual, Gateway/OAuth válido y acceso de red a OpenAI. Se instala o
actualiza con `sudo bash system/install-chat.sh`, que crea una copia fechada y
preserva los documentos privados existentes al añadir referencias ausentes.
