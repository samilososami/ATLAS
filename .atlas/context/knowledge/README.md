# Conocimiento público de ATLAS

Este directorio contiene la base versionada de identidad, conocimiento y
manuales que carga ATLAS. Es una parte nativa del runtime y no depende de la
estructura de OpenClaw. `manifest.json` define el orden y la prioridad de las
fuentes para WebScreen y `atlas-chat`.

El despliegue coordinado expande ese mismo manifiesto y sincroniza todos los
archivos canónicos que referencia, en vez de mantener una lista parcial a mano.
`runtimeLocalPaths` reserva excepciones privadas como `CUSTOM_INFO.md`: se
cargan si existen en A1, pero nunca se copian desde el repositorio ni se
sobrescriben durante un despliegue.

## Archivos incluidos

- `AGENTS.md`: reglas principales de funcionamiento y relación entre archivos.
- `IDENTITY.md`: identidad y papel de ATLAS dentro del proyecto.
- `SOUL.md`: personalidad, criterio, tono y límites.
- `TOOLS.md`: template para documentar tools, hardware y rutas locales.
- `USER.md`: template privado para que cada usuario describa sus preferencias.
- `MEMORY.md`: template de memoria persistente.
- `NOTES.md`: cuaderno operativo mínimo que ATLAS mantiene con atajos y lecciones verificadas.
- `TDR.md`: template para el contexto académico o de investigación.
- `ENVIRONMENT.md`: template para describir el dispositivo y sus servicios.
- `HEARTBEAT.md`: template para comprobaciones periódicas.
- `VARIABLES.md`: constantes no secretas de cada instalación.
- `ADB.md`: reglas de conexión, inventario automático y control de dispositivos Android autorizados.
- [`ATLAS-CONNECTIONS.md`](ATLAS-CONNECTIONS.md): mapa de diagnóstico de WebScreen, voz, permisos de página, audio Bluetooth y ADB; relaciona implementación, manuales y despliegues acotados.
- `NMAP.md`: descubrimiento acotado de red y uso del informe privado automático.
- `atlas-commands/`: documentación actual de cada comando para el agente,
  incluidos `ATLAS-CHAT.md` para el cliente Realtime de terminal con tools
  tipadas de móvil, `ATLAS-BROKER.md` para diagnosticar OAuth, cuota y reservas
  efímeras sin mostrar secretos,
  `ATLAS-APP.md` para el contrato nativo y transporte
  Tailscale directo/DERP, `ATLAS-ANDROIDUSE.md` para el fallback visual con click
  semántico y capturas privadas reducidas,
  y `ATLAS-ROUTINES.md` para las automatizaciones locales deterministas.

La memoria conversacional mutable no se mezcla con estos documentos: vive en
`../conversation/CONTEXT.md`, permanece privada y se puede compactar o vaciar
sin tocar la identidad. El runtime de voz, terminal y broker vive bajo
[`../..`](../..).

Los perfiles declarativos que describen qué subconjunto podrá cargarse viven en
[`../../roles`](../../roles/README.md). El rol docente, por ejemplo, referencia
solo `IDENTITY.md` y su propio `PROFESORES.md`; no hereda automáticamente este
manifiesto completo ni sus herramientas. El selector/compositor todavía no está
conectado al runtime, así que WebScreen y `atlas-chat` siguen cargando este
manifiesto completo. Versionar un rol no equivale a activarlo.

Los templates no contienen información de la instalación original. Cada usuario debe completarlos localmente y evitar subir datos privados a repositorios públicos.
