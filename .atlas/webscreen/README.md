# ATLAS WebScreen

Interfaz web de voz local para ATLAS. La conversación usa directamente OpenAI
Realtime mediante WebRTC, con su contexto, shell, búsqueda web, rutinas y tools
tipadas de Android. `atlas_phone` usa APIs nativas; `atlas_android` reserva
Accessibility para tareas visuales y adjunta capturas como `input_image`. La
arquitectura anterior de preámbulo más agente OpenClaw se conserva únicamente
como backup reversible en `Backups/WebScreen/legacy-preamble-2026-08-29`: no es
un fallback ejecutable del flujo actual.

## Minimal face design

`atlas-screen --atlas-new` opens the new face presentation at `/new/?kiosk=1`.
Remote trusted-LAN browsers can open `/new/` on the same Pi address and port.
The drawer has **Debugging Webscreen** on `/new/` and **New Webscreen** on `/`
for switching in the same tab, with the ordinary access revalidation after
navigation. `atlas-webscreen status` lists both sets of LAN URLs.
The original `/` and `--atlas`
remain the debugging interface. Both render the same underlying DOM and load
the same access, Realtime, wake, clap, settings, quota and context controllers.

The new design lives in `static/new/`: blue vector face, quiet header, occasional
blinks, wake-to-waveform transition and audio-driven mouth. Transcriptions and
thinking/status captions are not drawn over the face.
Controls and diagnostics remain available in the settings/tools panel rather
than filling the idle screen. No second microphone, agent or credentials flow
is introduced. See [design and source map](NEW_DESIGN.md).

The same Realtime model can now choose twelve additional native expressions
through the `/new/`-only `atlas_face` presentation tool. Deliberate repeated
back-and-forth caresses on the face trigger a six-second delighted expression
locally, without opening a voice turn. See the [expression contract](NEW_DESIGN.md#semantic-expressions-and-touchscreen-caresses)
and [implemented-face screenshot gallery](../../docs/images/webscreen-expressions/README.md).

Both tool drawers also include **Doble aplauso**. Five local two-clap trials
create a private summary-only calibration, then two complete, independently
released and acoustically similar calibrated transients while
ATLAS is waiting temporarily show the local `defiant` face. It neither uploads
audio nor opens a Realtime turn, and it is disabled outside the ready ATLAS
surface. See [`CLAP.md`](CLAP.md) for the detector, privacy model and required
physical verification after calibration.

The awake face uses a single 320 ms blink with a random 13–16 second interval.
At a coordinated blink after 50–55 seconds it becomes slightly drowsy; another
blink after 75–80 seconds lowers the eyelids and turns the mouth down. A final
blink after 100–105 seconds puts it to sleep with deeper symmetric crescent eyes, slow
breathing and larger blue sleep symbols that rise diagonally while shrinking.
The wake detector stays active. The short surprised wake animation is visual
only and does not defer audio capture or a model request. Caresses cover a
circle around the whole face, and the delighted reaction has a short lift and
soft settling motion. Hidden views and reduced motion suppress animation;
heartbeats and ambient sound do not reset the visual inactivity clock.

`atlas-chat` es la superficie hermana de terminal: usa el mismo modelo
`gpt-realtime-2.1`, las mismas instrucciones y Markdown, las mismas herramientas
y —incluidas `atlas_phone`, `atlas_android` e inspección `input_image`—, salvo
con `--ephemeral`, la misma conversación persistente. No abre WebRTC,
micrófono, TTS ni interfaz web. Su manual operativo está en
`openclaw/workspace/atlas-commands/ATLAS-CHAT.md`.

## Flujo Realtime actual

1. El backend solicita una reserva WebRTC efímera para `gpt-realtime-2.1` usando el OAuth ya configurado en la Pi. OpenClaw actúa aquí solo como broker de autenticación: ninguno de sus agentes procesa la conversación. El parámetro protocolario `brain: agent-consult` es el único perfil admitido por `talk.client.create`; no activa el agente legacy. El navegador configura después `atlas_shell`, `atlas_web_search`, `atlas_routine`, `atlas_phone` y `atlas_android` como herramientas del modelo. Nunca recibe el token persistente ni una API key.
2. OpenAI Realtime recibe y transcribe el audio, decide el turno y puede generar directamente una de las voces nativas `ash`, `cedar`, `marin` o `verse`. El selector también admite ElevenLabs y la voz del navegador; en esos modos Realtime devuelve texto y WebScreen lo entrega al TTS elegido. ElevenLabs usa por defecto `eleven_flash_v2_5`, el modelo multilingüe de baja latencia para conversación, y transmite `MP3 44,1 kHz / 128 kbps`, la máxima calidad de salida del plan Free, directamente hacia el elemento de audio de Chrome: no espera un MP3 completo codificado en Base64. `ATLAS_WEBSCREEN_ELEVENLABS_MODEL` permite escoger deliberadamente otro modelo. Cambiar la salida guarda el ajuste y crea una sesión WebRTC nueva.
3. Solo Chrome activa la conversación al reconocer la palabra exacta `ATLAS`, en cualquier posición y también en resultados provisionales. No se exige silencio previo, posición inicial, puntuación acústica ni confirmación de Realtime. En el A1 y en navegadores remotos la petición recogida por Chrome se envía como texto a Realtime; su transcripción de audio alternativa se descarta por identificador de turno para que no la sustituya ni duplique. Se mantiene el bloqueo del micrófono del A1 durante reproducción y los 200 ms posteriores. Una transcripción auxiliar fallida no debe perder una petición que Chrome ya ha reconocido.
4. Al finalizar la reproducción se vuelve a esperar ATLAS. Cada nueva petición hablada exige una wake word local nueva; no existe la continuación automática de diez segundos. Decir solo ATLAS todavía deja tiempo para terminar esa misma petición. Los navegadores remotos conservan sus interrupciones naturales. En el A1 las interrupciones están temporalmente desactivadas durante la voz: se cierran el micrófono y el detector local y se reabren 200 ms después de finalizar la reproducción.
5. Antes de crear una respuesta del modelo, WebScreen compara la petición completa con `/home/atlas/.atlas/routines/ROUTINES.md`. La coincidencia es exacta tras normalizar mayúsculas, acentos, puntuación y el ATLAS inicial. Un match se ejecuta una sola vez. Con `requires_model: false`, su `[SAY]` resuelto es la única respuesta y, sin él, el éxito es silencioso. Con `requires_model: true`, Realtime interpreta el resultado ya registrado sin repetir los pasos. Un fallo también llega al modelo con un identificador y nunca provoca una repetición automática.
6. OpenAI Realtime responde directamente. Usa `atlas_shell` para consultar archivos, red y estado real o ejecutar acciones, `atlas_web_search` para información externa o reciente, `atlas_routine` para gestionar definiciones validadas, `atlas_phone` para APIs nativas del móvil y `atlas_android` solo cuando debe inspeccionar o tocar la pantalla. Los lanzamientos nativos distinguen Amazon Shopping de Alexa y `location.get` conserva la dirección completa en `formattedAddress`. Android Use prioriza `click` con etiqueta accesible exacta, usa coordenadas normalizadas como fallback, adjunta un JPEG reducido como `input_image` separado y redacta contraseñas en `tree`. Un fallo visual recuperable conserva la sesión; `stop` se garantiza al completar o abandonar la tarea y ante cancelación, timeout o pérdida terminal. La búsqueda lee en tiempo de ejecución la clave privada del plugin Tavily de OpenClaw y la usa solo en el backend; no la copia al repositorio, al navegador, al contexto ni a los logs. Las búsquedas normales usan profundidad `basic` y hasta cinco fuentes para priorizar latencia y consumo. El backend rechaza de forma permanente cualquier `rm` que combine borrado recursivo y forzado, además de `--no-preserve-root`, con independencia de lo que solicite o genere el modelo. En esta etapa no deriva el turno a Luna.
   Si la sesión WebRTC falla, WebScreen reintenta Realtime con espera progresiva; nunca cambia automáticamente al pipeline legacy de OpenClaw ni reactiva sus preámbulos.
7. La sesión recibe `REALTIME_INSTRUCTIONS.md`, todos los Markdown del workspace salvo los episodios de `memory/`, los reportes actuales de dispositivos en `.atlas/adb/devices` y el contexto conversacional Realtime compartido con las sesiones normales de `atlas-chat`. `AGENTS.md` sigue siendo el mapa para localizar contexto adicional y `NOTES.md` funciona como cuaderno operativo compacto.
8. Los turnos producen logs JSON Lines. Si falla la reserva, WebRTC o el proveedor, WebScreen reconecta Realtime con espera progresiva; no deriva el texto a OpenClaw.

`REALTIME_INSTRUCTIONS.md` fija respuestas breves por defecto: una o dos frases;
tras una acción ordinaria confirmada, una confirmación de una a cinco palabras
(«Listo», «Música en pausa»), sin ofertas ni problemas hipotéticos añadidos. Las
rutinas deterministas usan su propio `[SAY]` o terminan en silencio.
Los errores reales se explican brevemente y las explicaciones largas siguen
disponibles cuando se solicitan. Esta regla también llega a `atlas-chat`.

La voz nativa Realtime utiliza la sesión OAuth aceptada por OpenClaw. La cuota
concreta se debe medir en la cuenta y no se presenta como ilimitada. Cuando se
selecciona ElevenLabs o la voz del navegador, Realtime mantiene el razonamiento
y devuelve solo texto; WebScreen realiza la síntesis externa. Los tabs de
laboratorio conservan ambos motores también para comparación y depuración.

## Latencia y medición del flujo actual

- Chrome conserva una hipótesis por índice de resultado: las correcciones sustituyen al borrador y los índices distintos conservan los fragmentos sucesivos. Los resultados idénticos no reinician la espera.
- En el A1, el cierre aprovecha el silencio ya confirmado por VAD, sin cambiar su umbral ni sus 500 ms. Espera al menos 80 ms desde ese evento y comprueba que el texto lleve estable 100 ms si es final o 180 ms si es provisional. Sin confirmación de VAD, usa 400/700 ms respectivamente; nunca envía mientras VAD sigue indicando voz activa.
- El margen de agrupación tras VAD es de 180 ms (antes 400 ms); no se modifica el silencio de 500 ms del detector. Se conservan al menos 80 ms desde la entrega del texto y se cancela el envío si llega más voz o quedan transcripciones pendientes.
- Las voces externas reciben frases completas o cláusulas largas conforme llega el texto. La cola es secuencial, no vuelve a leer el mensaje al llegar el texto final y espera a terminar el audio antes de continuar tras una herramienta. En el A1 el micrófono permanece cerrado entre fragmentos y vuelve a abrirse 200 ms después del último.
- El proxy de ElevenLabs entrega cada fragmento disponible de la respuesta HTTP a Chrome sin esperar a llenar un bloque de 8 KiB. Esto evita que el propio backend acumule aproximadamente medio segundo de MP3 a 128 kbps antes del primer envío; la red, la inferencia de ElevenLabs y el búfer de Chrome siguen formando parte del tiempo real hasta `playing`.
- `tts.playback_started` se registra desde `SpeechSynthesisUtterance.start` o el evento `playing` del audio de ElevenLabs, no desde la petición de síntesis. `duration_ms` mide la espera desde que se encoló la frase; `sinceSpeechStoppedMs` mide desde el último fin de voz detectado por Realtime. No es una medición acústica del altavoz ni del final físico del habla. Los eventos incluyen reloj monotónico del cliente, salida seleccionada, voz efectiva, versión de cliente y el identificador de respuesta, además de la identificación A1/remoto del servidor.
- Para voz nativa, `audio.playback_started` se registra desde `output_audio_buffer.started`; el primer texto sigue teniendo su evento independiente. Ninguno demuestra por sí solo que el altavoz físico sea audible. El objetivo de 1–3 s requiere comparar la misma voz, red, contexto y petición; las operaciones con herramientas se miden aparte.

Verificación local sin consumir cuota: `node --test test_*.cjs` y
`python3 -m unittest discover -p 'test_*.py'`. Las cifras de mejora real se
obtienen repitiendo la misma prueba hablada y usando la misma salida de voz.

Referencias: [resultados de Chrome](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionEvent/results),
[VAD de Realtime](https://developers.openai.com/api/docs/guides/realtime-vad) y
[inicio de síntesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/start_event).

## Flujo legacy archivado

Esta sección documenta el diseño anterior para el TDR y para poder estudiarlo o
recuperarlo manualmente. El runtime actual no entra automáticamente en este
flujo bajo ninguna condición.

1. Cuando una pestaña obtiene el control de ATLAS, WebScreen solicita el micrófono automáticamente, también tras reiniciar. Chrome reutiliza un permiso ya concedido sin mostrar nada; en una primera visita aparece su diálogo nativo. Al perder el control se detiene el micrófono de la pantalla anterior.
2. Chrome detecta la palabra `ATLAS` sin filtrar su posición dentro de la frase. Los resultados anteriores del reconocedor no bloquean una llamada nueva.
3. Al detectarla, conserva cualquier palabra reconocida a continuación y mantiene abierta la misma sesión de escucha. El usuario puede decir `ATLAS, qué hora es` de corrido, sin locución de confirmación ni pausa artificial.
4. Chrome transcribe la petición de forma nativa y muestra también el texto provisional en tiempo real.
5. WebScreen cierra la intervención setecientos milisegundos después del último fragmento y envía texto, no audio, a la Raspberry Pi.
6. Las frases completas de cancelación, como `nada`, `ay no, no, nada nada`, `falsa alarma` o `déjalo`, se resuelven localmente sin llamar a OpenClaw. Hay más de cien variantes exactas y no se filtra una petición por contener solamente la palabra `nada`.
7. El resto del texto se resuelve mediante el agente real de OpenClaw: en la vía rápida cuando basta y en el turno principal cuando necesita herramientas o contexto privado.
8. Cuando la transcripción provisional permanece estable, Chrome la envía anticipadamente; así el cálculo puede empezar antes de que termine el turno de voz.
9. Si el fragmento es inequívocamente una consulta de solo lectura sobre fuentes o el sistema, el agente principal `main` puede adelantar herramientas. La conversación general no inicia este trabajo en paralelo: primero decide Luna. Cualquier indicio de escritura, envío, cambio o borrado obliga a esperar la frase completa.
10. Una sesión caliente y limpia del mismo agente principal queda dormida dentro de `atlas_webscreen_wait` antes de que el usuario hable. La llamada usa el máximo de diez minutos admitido por el runtime de Codex y se rearma silenciosamente antes de alcanzarlo. La ejecución de la herramienta está bloqueada fuera de esa sesión interna, incluidas Telegram, la terminal y la conversación normal de WebScreen. La transcripción provisional la despierta y Luna genera un preámbulo natural o resuelve directamente un saludo inequívoco; el coste de arranque ocurre en segundo plano y no después de la petición. No existe un segundo agente configurado y los preámbulos no son frases prefabricadas.
11. Al terminar el preámbulo o una respuesta conversacional inmediata, el oyente empieza a calentarse otra vez. Los intercambios rápidos se registran en la sesión principal mediante `chat.inject` para conservar la continuidad. Si el oyente todavía no está listo, WebScreen conserva el flujo anterior como fallback sin interrumpir la interacción.
12. Un único proceso Node mantiene la conexión WebSocket con el Gateway para las sesiones del mismo agente, sin relanzar procesos en cada interacción.
13. En trabajos largos, el agente principal puede narrar hasta cuatro cambios de fase reales, separados al menos ocho segundos, mientras continúa usando herramientas.
14. La respuesta escrita aparece en pantalla conforme llega. El preámbulo no bloquea el lector de eventos: con la voz del navegador, las frases completas entran en la cola y empiezan a pronunciarse sin esperar a que termine el párrafo entero.
15. El usuario escoge entre la voz gratuita del navegador, seleccionada por defecto, y ElevenLabs.
16. Si ATLAS termina con una pregunta que espera respuesta, el micrófono escucha durante cuatro segundos sin exigir de nuevo la wake word.
17. La misma wake word `ATLAS` interrumpe el procesamiento o la reproducción cuando ATLAS está trabajando o hablando, conserva la sesión y abre inmediatamente una nueva intervención. Si va seguida únicamente de repeticiones de `calla` o `nada`, detiene el turno en silencio y vuelve a esperar la wake word. WebScreen descarta coincidencias que pertenecen a la propia voz reproducida para evitar interrupciones por eco.
18. Las respuestas de aplazamiento durante una continuación se resuelven localmente sin llamar a OpenClaw.
19. Toda la interacción queda registrada en un archivo `.log` propio, incluidos el umbral de silencio, el oyente caliente, los hitos y los eventos de herramientas.

Antes de mostrar y pronunciar una respuesta, WebScreen normaliza siglas,
unidades y direcciones de red para TTS en español. Por ejemplo, `IP` se expresa
como `i pe`, `HDMI` como `h d m i` y los bloques de una dirección se separan
con `punto`, sin comas. Las peticiones simples de la hora se resuelven de forma
local e inmediata y se incorporan después al contexto de la sesión.

## Respuesta directa de Luna

El oyente devuelve una decisión estructurada: `direct` o `delegate`. Puede
resolver saludos, conversación breve, juegos, cálculos simples e información
general estable. Para correo, archivos, memoria privada, estado del equipo o
acciones reales se conserva el turno principal con sus herramientas.

Una respuesta directa solo se acepta si coincide la transcripción normalizada
completa. Una frase parcial que luego cambia no puede cerrar la petición. Si
el oyente no está listo, falla, excede el plazo o devuelve un formato inválido,
se utiliza el principal. Las decisiones se toman dentro de OpenClaw con el
modelo configurado; no se añade otro provider ni un modelo local.

El oyente recibe los últimos doce intercambios y un estado compacto de juego.
Se renuevan con la sesión y se guardan solo en memoria del proceso. Las
respuestas rápidas también se incorporan a la sesión principal; el prompt
incluye el contexto reciente para conservarlo incluso si la inyección asíncrona
aún no ha terminado. El estado interno de juego nunca se reproduce por TTS.

Hora y fecha simples usan el reloj de la Pi en `Europe/Madrid`, no una fecha
inventada por el modelo. Las respuestas directas usan el mismo TTS y la misma
continuación de cuatro segundos que una respuesta principal.

Pruebas de regresión sin llamadas a modelos:

```bash
python3 -m unittest -v test_fast_lane.py
```

El reconocimiento nativo depende del navegador y puede usar servicios remotos.
Esta implementación no garantiza STT offline ni compatibilidad de Speech
Recognition en cualquier compilación de Google Chrome.

El canal conserva una sesión exclusiva de WebScreen para mantener el contexto de la conversación. Si pasan 30 minutos sin una nueva interacción, se crea una sesión nueva. El modelo se hereda de la configuración actual de OpenClaw; las credenciales nunca se envían al navegador.

El bridge local está emparejado con los scopes `operator.read`,
`operator.write` y `operator.admin`. El scope administrativo se conserva para
la gestión de sesiones y el fallback de preámbulos; no se expone al navegador
ni amplía los endpoints HTTP disponibles. La herramienta del oyente solo acepta
su conexión HTTP desde loopback y una política dinámica de OpenClaw bloquea
cualquier llamada que no proceda de
`agent:main:subagent:atlas-webscreen-hot-listener`.

## Herramientas de depuración

### Acceso exclusivo y toma de control

Solo una pestaña tiene el control, tanto desde localhost como desde la red.
Las demás ven una pantalla negra y el botón **Tomar control**. Al pulsarlo, el
servidor transfiere inmediatamente el permiso a esa pestaña; no hay solicitud,
notificación ni confirmación en el dispositivo anterior.

En cualquier navegador que no sea el kiosko físico aparece además **Activar en
ATLAS A1**. Mientras `localhost/?kiosk=1` siga conectado, ese botón le entrega
el control directamente a la pantalla de la Pi. No hace falta levantarse para
pulsar **Tomar control** en el panel táctil durante las pruebas.

La pestaña anterior detecta el cambio normalmente en el siguiente heartbeat (aproximadamente 1,5–2 s con una red sana),
detiene micrófono, reconocimiento, audio y cualquier trabajo activo, y pasa a
mostrar la misma pantalla negra. La nueva pestaña puede activar su micrófono;
se mantiene la sesión de OpenClaw. No se crean cuentas ni se reinicia la memoria.

`access_control.py` mantiene un permiso aleatorio por página, solo en memoria.
`static/access.js` renueva la conexión cada 1,5 segundos, con reintentos acotados. Cerrar la pestaña
libera el control; si desaparece sin avisar, su permiso caduca a los veinte
segundos. El cliente se detiene si pasa ocho segundos sin confirmar el acceso.
Una toma de control o una activación remota del A1 cancela el trabajo activo del propietario anterior. Una
recarga crea un permiso nuevo y puede recuperar el control con el mismo botón.
Tras actualizar WebScreen hay que recargar las pestañas antiguas.

Una pérdida breve de heartbeat conserva el audio y la sesión dentro de esos ocho segundos. Un `401` invalida el token incluso si falla la lectura del cuerpo HTTP y vuelve a registrar la página; un `423` retira el control inmediatamente. Las respuestas antiguas y la vuelta desde la caché de navegación no pueden resucitar permisos caducados.

Las respuestas correctas de APIs protegidas también confirman el acceso local:
el servidor ya renueva el permiso al autorizarlas. Esto evita que un heartbeat
aislado bloqueado corte una sesión que sigue recibiendo tráfico autorizado.
Solo cuenta la misma generación/credencial mientras conserva control, tomando
la hora de inicio de la petición, no su respuesta tardía. No revive permisos
caducados/revocados ni peticiones abortadas. Consultar salud, archivos públicos
o rutas de acceso no prueba propiedad; tampoco una petición fallida. Los
límites de ocho segundos locales y veinte del servidor no se amplían.

Cada petición de acceso tiene un límite total de cuatro segundos, incluida la
lectura del JSON. Un transporte bloqueado o una excepción de la interfaz no
detienen los siguientes intentos. Volver a primer plano o recuperar Internet
adelanta el reintento, sin peticiones paralelas ni toma automática de control.
La comprobación de salud fallida se reintenta a los cinco segundos mientras
la página conserva el control; al recuperarse deja de sondear. Su plazo total
es de ocho segundos y las respuestas antiguas no modifican una sesión nueva.

Si la Pi responde pero el kiosco sigue «Sin conexión», revisar también Chrome:
`journalctl -u atlas-screen-kiosk.service`, su CPU y `df -h /dev/shm`. El launcher
físico usa composición por software para contener el agotamiento de buffers
gráficos observado. No se borra memoria compartida ni se desactiva el audio.

The physical kiosk also runs `atlas-screen-browser-watchdog.cjs`. Its private
Chrome pipe checks JavaScript/DOM readiness, not just HTTP or a running process.
Two failed probes trigger a reload of the selected `/` or `/new/` target;
unresponsive recovery escalates only to Chrome with bounded backoff. It keeps
X11 and the black hide overlay alive and exposes no debugging TCP port.
Restart `atlas-screen-kiosk.service` once after installing this helper.

### Recuperación de conexiones

- Una interrupción ICE transitoria dispone de ocho segundos para recuperar el mismo peer y conservar el turno admitido. Pasar de `disconnected` a `connecting` mantiene el plazo original: solo `connected` confirma la recuperación. Un transporte `failed` o `closed` se recupera sin esperar indefinidamente.
- Un aviso del canal de datos que sigue `open` se registra como `session.channel_warning`, sin cortar inmediatamente la reproducción o recrear la sesión. No desactiva los plazos ICE, de apertura o de respuesta, ni oculta errores de autenticación del proveedor o el cierre del canal.
- Los avisos duplicados del fallo al abrir se agrupan en un solo reintento y una sola actualización de pantalla. La espera progresa por 1, 2, 4 y como máximo 8 segundos; su historial solo se reinicia tras al menos 20 segundos estables en `ready`, no por una recuperación fugaz. Un fallo antiguo no perturba una sesión nueva ya preparada, y perder control o cambiar de vista impide iniciar el reintento pendiente.
- La apertura completa tiene un límite de 25 s; un permiso de micrófono concedido tarde no reactiva una sesión antigua.
- Se detecta una petición sin confirmación en 12 s o una respuesta sin progreso en 30 s. Una herramienta activa conserva su propio plazo. La recuperación nunca reenvía automáticamente una acción cuyo resultado sea incierto.
- Las sesiones libres se renuevan a los 50 minutos, antes de alcanzar el máximo de duración del proveedor.
- El backend HTTP sigue accesible mientras vuelve el Gateway; las peticiones pendientes reciben un error explícito. El bridge recupera sus suscripciones sin dejar promesas rechazadas sin manejar.
- Los cierres normales de pestañas y sockets HTTP ociosos no se presentan como fallos del sistema. Los errores reales sí siguen en logs.

Regresión JavaScript conjunta verificada, incluido el consumo de
respuestas HTTP: **217 pruebas (204 WebScreen y 13 del watchdog)**, sin consumir
llamadas a modelos. Desde la raíz del repo:

```bash
node --test .atlas/webscreen/test_*.cjs system/test_kiosk_watchdog.cjs
```

Son refuerzos comprobados frente a fallos simulados y pruebas de navegador,
no una garantía de eliminar todos los microcortes físicos.

Una prueba A/B posterior en Chrome de la Pi sí reprodujo crecimiento de memoria
al ignorar el cuerpo de respuestas JSON: 40 POST pasaron de **16,05 a 96,05 MiB**
de memoria compartida del renderer, **2 MiB por petición**. Otros 40 POST
equivalentes consumiendo cada cuerpo con `response.text()` dejaron el uso plano
en **96,05 MiB**. Se identificó ese patrón en los POST de logs/eventos lanzados
sin esperar ni consumir la respuesta. El build `2026-09-07-connection-4` ya
libera esas respuestas, también en errores y cancelaciones, con un plazo total
de cuatro segundos y un máximo de 64 peticiones de telemetría pendientes, sin
cola ni reenvío. Cancelar una operación no depende de ese máximo. En ocho
muestras durante **5 min 15 s**, el mismo renderer pasa de **10,058 a 0,026 MiB**,
sin bloques de 2 MiB retenidos, con 74 eventos del nuevo build acumulados
(63 durante la ventana), 209 HTTP 200 y ninguna reconexión inesperada. Esto identifica
una causa reproducible de crecimiento en esta configuración, no demuestra que
todos los cortes audibles tengan ese origen. La prueba aislada sin audio no
reprodujo la fuga con el parpadeo anterior. Véase
[evidencia y límites de verificación](NEW_DESIGN.md).

Despliegue acotado sobre una instalación existente: `sudo bash system/install-webscreen-resilience.sh --restart` desde el repositorio. Guarda respaldo de los archivos actualizados, incluidos los assets públicos de `static/new/`; no sustituye ajustes, OAuth ni Markdown privados. Después hay que recargar las pestañas. Para audio y ADB existe un instalador independiente: [guía de conexiones](../../openclaw/workspace/ATLAS-CONNECTIONS.md), [audio](../../openclaw/workspace/atlas-commands/ATLAS-AUDIO.md) y [ADB](../../openclaw/workspace/ADB.md). No reiniciar toda la red o todos los servicios de audio como primer intento.

Para una actualización coordinada de WebScreen, `atlas-chat`, Companion y el
contexto canónico existe `system/deploy-runtime-update.sh`. Debe ejecutarse desde
un checkout preparado mientras A1 está en `atlas-hide`; crea respaldos fechados,
conserva el estado de kiosco/overlay, espera a Companion 0.2.1 y deja el resultado
en `/run/atlas-runtime-deploy.rc`. No es un actualizador remoto ni sustituye la
verificación del archivo recibido antes de ejecutarlo.

El backend exige `X-Atlas-Client` para las operaciones de voz, texto, preámbulos,
cancelación, ajustes, eventos y consulta de cuota. No basta con ocultar botones.
`/api/health` sigue público para los comandos de estado y el oyente interno
conserva su ruta de loopback, rechazada desde navegadores.

Esto arbitra el uso, no autentica personas: quien accede primero cuando está
libre obtiene el control. HTTP en una LAN tampoco cifra el permiso. No expongas
el puerto a Internet; contraseña y HTTPS siguen siendo trabajo futuro.

Pruebas sin llamadas a modelos: `python3 -m unittest -v test_access_control.py`.

El tab ATLAS muestra arriba a la derecha las ventanas de cuota que comunica
Codex, con la fecha de renovación en Europe/Madrid. En Pro aparece únicamente
la semanal; en Plus aparecen cinco horas y semanal. El perfil se deriva de la
respuesta autenticada de Gateway y cambia automáticamente al renovar OAuth.
`codex_usage.py` consulta `usage.status` a través del bridge persistente y guarda
una lectura compartida durante sesenta segundos. No crea turnos del agente ni
devuelve tokens, datos de cuenta o facturación. Si la lectura falla, se indica
que el dato está desactualizado; una cuota desconocida nunca se presenta como
cero. `static/quota.js` actualiza el indicador sin bloquear la conversación.

### Contexto persistente de WebScreen

El contexto se separa deliberadamente en dos capas. El **contexto crucial** es
el conjunto de Markdown de workspace y los informes ADB que se carga al crear
cualquier sesión. El **contexto de relleno** es la memoria de conversaciones
completadas de WebScreen y se guarda de forma privada en
`/home/atlas/.atlas/context/CONTEXT.md`, por lo que sobrevive a reinicios de
WebScreen, Gateway, Raspberry Pi y cambios de navegador.

Guardar un turno no invalida la sesión que ya lo conoce. `REVISION` cambia solo
al vaciar o reemplazar el contexto. Las actualizaciones externas se recargan
cuando el asistente vuelve a estar en reposo, nunca durante la escucha, una
herramienta o la reproducción. Los sondeos antiguos no sobrescriben el estado
recién confirmado por la sesión.

La tarjeta superior muestra una estimación de tokens del relleno frente al
presupuesto libre después del contexto crucial. El botón **Reiniciar contexto**
vacía exclusivamente ese archivo y crea una sesión Realtime nueva. Cuando se
aproxima al noventa por ciento de su presupuesto, la pestaña activa pide a
Realtime una compactación semántica silenciosa y reinicia la sesión con el
resumen. Realtime conserva además una ventana reciente mediante
`retention_ratio`, como red de seguridad del turno activo; la persistencia no
depende de ese truncado del proveedor.

`atlas-context empty` y `atlas-context compact` ofrecen el mismo mantenimiento
desde la terminal. Estos comandos no afectan a OpenClaw ni alteran los archivos
Markdown cruciales.

La semántica de porcentaje usado y renovación procede de la
[documentación oficial de Codex](https://developers.openai.com/codex/app-server#6-rate-limits-chatgpt).
Pruebas del adaptador: `python3 -m unittest -v test_codex_usage.py`.

El menú lateral separa cinco vistas: `ATLAS` conserva la conversación normal;
`Transcripción` reutiliza el reconocimiento continuo de Chrome y separa bloques
tras setecientos milisegundos de silencio; `Texto a voz` permite comparar la voz
del navegador con ElevenLabs y mide generación y reproducción; `Wake word`
graba, desde cualquier navegador que tenga el control, cinco muestras de
**Atlas** y una breve muestra de voz natural en el perfil privado de A1;
`Ajustes` permite cambiar el Voice ID de ElevenLabs sin exponer la API key al navegador.
El Voice ID personalizado se guarda con permisos restringidos en
`.runtime/webscreen-settings.json`.

Junto a la salida de voz está el selector de razonamiento de Realtime:
`Default`, `Minimal`, `Low`, `Medium`, `High` y `Xhigh`. Default omite la
sobrescritura y conserva la decisión del proveedor/configuración del broker;
no es un nivel superior a Low. La selección se guarda en ese mismo archivo
privado, funciona con todas las salidas de voz y se aplica entre interacciones
abriendo una nueva sesión, sin vaciar el contexto persistente ni cambiar el
modelo o las herramientas. Volver a Default también crea una reserva nueva,
sin enviar `reasoningEffort`. No modifica el thinking de agentes de OpenClaw.
Cada evento de conversación registra `reasoningEffort` y, cuando la sesión
lo comunica, `effectiveReasoningEffort` para poder comparar tandas. Un valor
`unreported` significa que el proveedor no ha comunicado el nivel efectivo,
no que esté usando un nivel determinado.
Valores admitidos: [referencia de Realtime](https://developers.openai.com/api/reference/resources/realtime).

El tab `Wake word` no cambia el detector activo. Envía el audio directamente a
la Pi, donde el backend lo convierte a WAV mono de 16 kHz y lo conserva bajo
`/home/atlas/.atlas/wakeword/profiles/`. Los ficheros no se devuelven al
navegador, no entran en Git y no se suben a un proveedor. El modelo comunitario
`Hey Atlas` solo demostró la compatibilidad del runtime: la frase de producción
continúa siendo **Atlas** y solo se sustituirá el detector Chrome tras entrenar
y medir un modelo personalizado con esas muestras.

## Uso

En la pantalla física, `atlas-screen --atlas --on` abre esta misma interfaz en
Google Chrome kiosko sobre `http://localhost:5000/?kiosk=1`. No añade otra sesión de
OpenClaw ni cambia la dirección HTTP de la red. El micrófono se activa con el
botón habitual; necesita un dispositivo de entrada real. El modo kiosko utiliza
el audio predeterminado de `sami`, mantiene el sandbox del navegador y esconde
el cursor cuando no hay ratón conectado. `atlas-screen off` cierra únicamente
la superficie física, no este servidor. La compilación de Google Chrome debe tener
acceso funcional al servicio de Speech Recognition; esto se verifica hablando
desde el dispositivo, no solo al cargar la página.

En ATLAS A1, la voz gratuita de Google Chrome usa Speech Dispatcher y eSpeak NG,
instalados a nivel del sistema. El lanzador activa `--enable-speech-dispatcher`.
Su sonido puede diferir de las voces del navegador del portátil; ElevenLabs
sigue siendo la otra opción. El navegador utiliza un perfil dedicado sin
contraseñas personales; `--password-store=basic` evita la espera de un keyring
de escritorio que no existe en esta sesión mínima.

El kiosko usa el paquete oficial `google-chrome-stable` ARM64 y un perfil nuevo
en `/home/atlas/.atlas/screen/chrome-profile`, independiente del escritorio
virtual. No importa claves de otro navegador ni requiere una API key personal
para intentar el reconocimiento nativo; necesita acceso al servicio de Google.

El permiso de captura se limita a `http://localhost:5000` mediante
[`AudioCaptureAllowedUrls`](https://chromeenterprise.google/policies/#AudioCaptureAllowedUrls).
La política se instala en `/etc/opt/chrome/policies/managed/atlas-webscreen.json`.
El kiosko evita salidas accidentales, pero no es una frontera de seguridad ni
un sustituto del futuro control de acceso.

### Audio del ATLAS A1

El kiosko `?kiosk=1` conserva el micrófono USB crudo, la salida HDMI directa y
el procesamiento de Chrome, pero funciona temporalmente en half-duplex. Cuando
comienza cualquier voz nativa, del navegador o de ElevenLabs, WebScreen
desconecta el track WebRTC y detiene el recognizer independiente de Chrome. Los
dos vuelven a abrirse doscientos milisegundos después de terminar el audio.
OpenAI Realtime también recibe `interrupt_response: false` únicamente en el A1.
Esto evita procesar las capturas durante la reproducción y su breve cola de eco.
La configuración de los nodos PipeWire `atlas_aec_sink` y `atlas_aec_source`
continúa instalada como rollback medido con extensión `.disabled`; su servicio
está deshabilitado y WebScreen no los carga ni selecciona en esta ruta.

Los portátiles y demás navegadores no reciben este bloqueo: conservan el
full-duplex y las interrupciones naturales de Chrome y OpenAI Realtime. La
arquitectura, las mediciones anteriores y el rollback están documentados en
`../audio/README.md`.

En el A1, el detector de Chrome también conserva durante unos instantes el
texto pronunciado después de la wake word. Normalmente OpenAI recibe el audio y
responde por su ruta WebRTC habitual. Si su VAD no entrega ninguna transcripción,
WebScreen inyecta el texto final que Chrome ya había reconocido y evita que la
interfaz quede indefinidamente en «Te escucho». Una transcripción tardía del
mismo texto se identifica y elimina para no duplicar el turno.

```bash
atlas-webscreen enable
atlas-webscreen restart
atlas-webscreen status
atlas-webscreen disable
```

El servicio escucha mediante HTTP en:

```text
http://<pi-ip>:5000
http://atlas-a1.local:5000
```

Para permitir el micrófono desde otro equipo en esta red controlada, abre `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, activa **Insecure origins treated as secure**, añade `http://atlas-a1.local:5000` y reinicia Chrome.

## Logs

Cada interacción genera un archivo JSON Lines legible en:

```text
/home/atlas/.atlas/webscreen/logs/YYYY-MM-DD/*.log
```

Incluye timestamps, duración y resultado de la transcripción nativa, sesión usada, tiempo y respuesta de OpenClaw, reproducción de voz, errores y duración total. WebScreen no sube el audio a la Raspberry Pi.

## Componentes

- `server.py`: HTTP, reserva Realtime, shell acotada, búsqueda, rutinas, allowlists nativas/visuales Android, normalización de capturas, logging, entrada de texto legacy, fallback de Whisper, banco TTS y ajustes de voz.
- `REALTIME_INSTRUCTIONS.md`: comportamiento, seguridad, latencia y pronunciación del agente Realtime.
- `WEBSCREEN_INSTRUCTIONS.md`: prompt e instrucciones del pipeline legacy conservado como respaldo.
- `openclaw-plugin/`: herramienta local `atlas_webscreen_wait`, limitada a loopback y a la sesión interna del oyente, que mantiene preparado el turno del preámbulo.
- `gateway_bridge.mjs`: conexión persistente al Gateway, reserva segura de sesiones OpenAI Realtime y multiplexación del agente principal/legacy.
- `static/realtime.js`: WebRTC, audio full-duplex, wake gate, AEC nativo del navegador y tool calls de shell, Tavily, rutinas, `atlas_phone` y `atlas_android`; los resultados visuales añaden `input_image` sin exponer base64.
- `static/`: interfaz mínima y herramientas de diagnóstico; `app.js` reconecta Realtime sin activar el pipeline legacy.
- `start.sh`: arranque con el entorno Python local.
- `atlas-webscreen`: wrapper disponible para usuario normal y root.
