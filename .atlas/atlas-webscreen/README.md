# ATLAS WebScreen

Interfaz web de voz local para ATLAS. La versión 3 prioriza el flujo funcional y muestra cada etapa de una interacción con su duración.

## Flujo

1. El usuario activa el micrófono una vez.
2. Chrome mantiene la detección de la wake word `ATLAS`.
3. Al detectarla, abre el micrófono directamente, sin locución de confirmación ni espera adicional.
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
16. Si ATLAS termina con una pregunta que espera respuesta, el micrófono escucha durante diez segundos sin exigir de nuevo la wake word.
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
continuación de diez segundos que una respuesta principal.

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

### Acceso exclusivo y delegación

Solo una pestaña tiene el control, tanto desde localhost como desde la red.
Las demás ven una pantalla azul oscuro y el botón **Reclamar acceso**. Cada
pestaña puede solicitarlo una vez cada diez segundos, también comprobado por
el servidor. El propietario recibe una notificación y puede pulsar
**Delegar acceso** únicamente en la vista ATLAS y en estado de espera: sin
grabación, respuesta, reproducción, continuación pendiente ni trabajo del backend.

Al delegar se detienen micrófono, reconocimiento y audio de la pestaña anterior.
La nueva pestaña puede activar su micrófono; se mantiene la sesión de OpenClaw.
No se crean cuentas ni se reinicia la memoria al cambiar de pantalla.

`access_control.py` mantiene un permiso aleatorio por página, solo en memoria.
`static/access.js` renueva la conexión cada dos segundos. Cerrar la pestaña
libera el control; si desaparece sin avisar, su permiso caduca a los veinte
segundos. El cliente se detiene si pasa ocho segundos sin confirmar el acceso.
Otro cliente no entra mientras quede una petición o trabajo especulativo en
curso. Una recarga crea un permiso nuevo; si el cierre no llegó al servidor,
puede esperar hasta que caduque el anterior. Tras actualizar WebScreen hay que
recargar las pestañas antiguas.

El backend exige `X-Atlas-Client` para las operaciones de voz, texto, preámbulos,
cancelación, ajustes, eventos y consulta de cuota. No basta con ocultar botones.
`/api/health` sigue público para los comandos de estado y el oyente interno
conserva su ruta de loopback, rechazada desde navegadores.

Esto arbitra el uso, no autentica personas: quien accede primero cuando está
libre obtiene el control. HTTP en una LAN tampoco cifra el permiso. No expongas
el puerto a Internet; contraseña y HTTPS siguen siendo trabajo futuro.

Pruebas sin llamadas a modelos: `python3 -m unittest -v test_access_control.py`.

El tab ATLAS muestra arriba a la derecha la cuota disponible de Codex para las
ventanas de cinco horas y semanal, con la fecha de renovación en Europe/Madrid.
`codex_usage.py` consulta `usage.status` a través del bridge persistente y guarda
una lectura compartida durante sesenta segundos. No crea turnos del agente ni
devuelve tokens, datos de cuenta o facturación. Si la lectura falla, se indica
que el dato está desactualizado; una cuota desconocida nunca se presenta como
cero. `static/quota.js` actualiza el indicador sin bloquear la conversación.

La semántica de porcentaje usado y renovación procede de la
[documentación oficial de Codex](https://developers.openai.com/codex/app-server#6-rate-limits-chatgpt).
Pruebas del adaptador: `python3 -m unittest -v test_codex_usage.py`.

El menú lateral separa cuatro vistas: `ATLAS` conserva la conversación normal;
`Transcripción` reutiliza el reconocimiento continuo de Chrome y separa bloques
tras setecientos milisegundos de silencio; `Texto a voz` permite comparar la voz
del navegador con ElevenLabs y mide generación y reproducción; `Ajustes`
permite cambiar el Voice ID de ElevenLabs sin exponer la API key al navegador.
El Voice ID personalizado se guarda con permisos restringidos en
`.runtime/webscreen-settings.json`.

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
en `/home/atlas/.atlas/atlas-screen/chrome-profile`, independiente del escritorio
virtual. No importa claves de otro navegador ni requiere una API key personal
para intentar el reconocimiento nativo; necesita acceso al servicio de Google.

El permiso de captura se limita a `http://localhost:5000` mediante
[`AudioCaptureAllowedUrls`](https://chromeenterprise.google/policies/#AudioCaptureAllowedUrls).
La política se instala en `/etc/opt/chrome/policies/managed/atlas-webscreen.json`.
El kiosko evita salidas accidentales, pero no es una frontera de seguridad ni
un sustituto del futuro control de acceso.

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
/home/atlas/.atlas/atlas-webscreen/logs/YYYY-MM-DD/*.log
```

Incluye timestamps, duración y resultado de la transcripción nativa, sesión usada, tiempo y respuesta de OpenClaw, reproducción de voz, errores y duración total. WebScreen no sube el audio a la Raspberry Pi.

## Componentes

- `server.py`: HTTP, entrada de texto nativa, fallback de Whisper, oyente caliente, sesión conversacional, logging, banco TTS y ajustes de voz.
- `WEBSCREEN_INSTRUCTIONS.md`: prompt principal, instrucciones del oyente, prompt de fallback y variaciones de estilo editables sin modificar Python.
- `openclaw-plugin/`: herramienta local `atlas_webscreen_wait`, limitada a loopback y a la sesión interna del oyente, que mantiene preparado el turno del preámbulo.
- `gateway_bridge.mjs`: proceso persistente que multiplexa la sesión principal y el oyente caliente del mismo agente sobre una conexión con el Gateway.
- `static/`: interfaz mínima, wake word, transcripción nativa, interrupción y detección de silencio.
- `start.sh`: arranque con el entorno Python local.
- `atlas-webscreen`: wrapper disponible para usuario normal y root.
