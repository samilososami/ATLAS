# Investigación de latencia de ATLAS WebScreen

Fecha de la medición: 28 de agosto de 2026.

## Resumen ejecutivo

WebScreen no crea un proceso ni una conexión nueva para cada intervención. Ya
mantiene un bridge Node conectado al Gateway, un proceso Codex app-server
residente, una sesión exclusiva de WebScreen y un oyente caliente para el
preámbulo. Además, cada turno de WebScreen se solicita con `thinking: off` y
`fastMode: true`.

La mejora pendiente no consiste en mantener otro agente despierto: eso ya está
hecho para el preámbulo. El límite dominante de las consultas reales es el
tiempo hasta el primer delta del turno principal con herramientas. En la
muestra local, ese primer fragmento llegó a los 7,45 segundos en una pregunta
sobre ATLAS, y a los 14,63 segundos en una consulta de hora que no entró en el
atajo local por el eco de la confirmación de voz.

## Evidencia local

La inspección se hizo sin leer conversaciones completas ni credenciales.

- Gateway saludable y conectado mediante loopback; el bridge persistente de
  WebScreen era uno de sus dos clientes establecidos.
- La configuración de WebScreen solicita `fastMode: true` y `thinking: off`
  para el turno principal, el preámbulo y el oyente caliente. Por tanto, el
  `fast=off` mostrado en el arranque del Gateway es el valor global, no el
  efectivo de este canal.
- El Gateway tenía una carga apreciable en el momento de la muestra: alrededor
  de un tercio de una CPU y unos 785 MiB de RSS. El almacén del agente principal
  ocupa unos 80 MiB y contiene 1.069 artefactos de sesión. No prueba por sí
  solo una causa, pero es una fuente plausible de sobrecarga de historial en
  una Raspberry Pi de cuatro gigabytes.
- La transcripción nativa de Chrome ya llega mientras el usuario habla; no hay
  una fase posterior de Whisper que explique el silencio inicial.
- En el flujo anterior, el lector del stream HTTP esperaba a que acabara de
  reproducirse el preámbulo antes de leer los eventos siguientes. Si el modelo
  ya emitía frases finales, el navegador las acumulaba. Se ha eliminado esa
  espera: el preámbulo se reproduce en segundo plano y las frases finales
  entran inmediatamente en la cola de voz.
- El caso `calla calla calla` se registró como una petición ordinaria y pagó
  8,4 segundos de turno antes de responder. Ahora se resuelve tanto en el
  cliente como en el servidor, antes de OpenClaw.
- La respuesta hablada `Dime` se quitó. Además de resultar menos natural,
  aparecía como primera palabra de transcripciones como `dime qué hora es` y
  hacía que una utilidad local instantánea terminara en el agente completo.

## Cambios aplicados en esta revisión

1. La wake word `ATLAS` abre la grabación directamente, sin una locución ni un
   filtro de eco asociado.
2. `calla`, `nada` y repeticiones formadas únicamente por esas palabras, `no`
   y `ya` se resuelven localmente tanto después de activar la wake word como
   después de interrumpir una respuesta. Las frases que contienen esas palabras
   junto con una petición real no se filtran.
3. El parser del stream ya no bloquea la entrada de `speech_chunk` por esperar
   al TTS del preámbulo o de una actualización de progreso.
4. Las formas `dime qué hora es`, `me dices qué hora es` y `puedes decirme qué
   hora es` entran en el atajo local de hora.

## Qué dice OpenClaw

- OpenClaw expone Fast mode por turno. Para `openai/*`, Fast activa el tier
  `priority`; en el harness Codex el control compartido Fast también prevalece
  sobre el tier nativo del app-server. Esto confirma que el `fastMode: true`
  ya enviado por WebScreen es el mecanismo correcto, no una optimización que
  falte por instalar. [Proveedor OpenAI de OpenClaw](https://docs.openclaw.ai/providers/openai), [harness Codex](https://docs.openclaw.ai/plugins/codex-harness)
- Fast mode tiene coste: la documentación indica multiplicadores específicos
  de modelo y, con créditos ChatGPT/Codex, el consumo indicado para GPT cinco
  punto seis es dos coma cinco veces el estándar. No se cambia el alcance de
  Fast sin una decisión explícita del propietario. [Proveedor OpenAI de OpenClaw](https://docs.openclaw.ai/providers/openai)
- El streaming de bloques y el pacing humano de OpenClaw afectan sobre todo a
  canales como Telegram. El pacing humano está desactivado por defecto y no es
  la causa del flujo WebScreen, que consume su propio stream Gateway.
  [Streaming y chunking](https://docs.openclaw.ai/concepts/streaming)
- OpenClaw recomienda compactar sesiones para limitar el contexto activo. La
  compactación conserva la historia en disco y resume lo que ve el modelo; no
  equivale a borrar datos. [Compaction](https://docs.openclaw.ai/compaction),
  [gestión de sesiones](https://docs.openclaw.ai/reference/session-management-compaction)

## Próximas pruebas recomendadas

Estas pruebas no se aplican automáticamente porque tienen coste, afectan a
historial o cambian el comportamiento de otros canales.

1. Medir de nuevo tres consultas equivalentes tras estos cambios: conversación
   corta, consulta de sistema sin herramientas y consulta con herramientas. Se
   compararán transcripción final, preámbulo, primer delta y comienzo real de
   voz.
2. Si el primer delta sigue superando unos siete segundos de forma estable,
   compactar la sesión exclusiva de WebScreen de forma semántica, con copia de
   seguridad del estado, antes de tocar el historial global del agente.
3. Auditar los artefactos de sesión grandes y los procesos activos del Gateway.
   Solo se archivaría o compactaría contenido con aprobación explícita, ya que
   puede afectar la memoria conversacional.
4. Para Telegram, evaluar `channels.telegram.streaming.mode: "partial"` o
   `"block"`. Mejora el feedback visible durante el turno, pero no reduce el
   tiempo de primer token del modelo.
5. Si se desea priorizar también Telegram y terminal, configurar Fast a nivel
   de modelo o sesión. WebScreen ya lo solicita. Requiere confirmar que el
   aumento de consumo de créditos es aceptable.

## Límite arquitectónico

Un modelo no puede mantener una respuesta principal ya generada antes de saber
qué pedirá el usuario. El patrón válido es el que ya usa ATLAS: mantener
conexión, runtime y contexto calientes; adelantar solo lecturas seguras cuando
la transcripción parcial es suficientemente clara; y hablar por streaming en
cuanto llega la primera frase. Convertir el oyente caliente en un segundo
agente que también ejecute acciones duplicaría trabajo, competiría por CPU y
podría producir efectos no deseados.
