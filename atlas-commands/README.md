# Comandos de ATLAS

Estos scripts proporcionan una interfaz uniforme para administrar las funciones principales de ATLAS A1. Están diseñados para ejecutarse en el entorno de ATLAS OS y pueden depender de servicios, rutas o paquetes incluidos en esa instalación.

## `atlas-audio`

Gestiona las salidas de audio, dispositivos Bluetooth, alternancia rápida entre
Bluetooth y HDMI, volumen, mute y pruebas de reproducción.

```bash
atlas-audio status
atlas-audio outputs
atlas-audio output-device-toggle
atlas-audio volume 50
atlas-audio test
```

## `atlas-cast`

Descubre dispositivos Chromecast y transmite el ATLAS Desktop con distintos perfiles de resolución.

```bash
atlas-cast list
atlas-cast start "Nombre del dispositivo"
atlas-cast webscreen
atlas-cast profile 720p
atlas-cast status
```

## `atlas-desktop`

Controla el escritorio virtual de ATLAS: servicio, Google Chrome, ventanas, entrada simulada, capturas de pantalla, layouts y wallpaper.

```bash
atlas-desktop status
atlas-desktop open-url https://example.com
atlas-desktop screenshot latest
atlas-desktop windows
```

## `atlas-status`

Muestra ATLAS A1 STATUS y un resumen de temperatura, CPU, memoria, almacenamiento, red, ventilador, servicios y estado de la pantalla. Un indicador animado acompaña la recogida de información.

```bash
atlas-status
```

## `atlas-rafas`

Diagnóstico de red, Wi-Fi, DNS, HTTPS, reloj, almacenamiento, RAM, alimentación,
temperatura, USB y servicios. `doctor` intenta recuperar servicios habilitados
y, sin ruta de red, permite elegir un Wi-Fi y conectarse con un prompt privado.
No borra archivos ni reinicia una conexión sana ni una pantalla apagada.

```bash
atlas-rafas
atlas-rafas --json
atlas-rafas doctor --check
sudo atlas-rafas doctor
```

## `atlas-app`

Estado del servicio Android, dispositivo emparejado, conversación, terminales y
conexión privada por Tailscale. El código BLE es privado y concede administración.

```bash
atlas-app
atlas-app pair
atlas-app tailscale
atlas-app endpoint
atlas-app control location.get
atlas-app control apps.launch app=Amazon
atlas-app control apps.launch app=Alexa
atlas-app control capabilities
atlas-app logs
atlas-app restart
atlas-app unpair
```

También se aceptan los aliases breves `location`, `get_location`,
`capabilities`, `call` y `calls.place`. En operaciones con datos, usa el contrato
real: `sms.send number=... text=...`; para crear eventos consulta primero
`calendar.list`, elige un `calendarId` editable y pasa `begin`/`end` en
milisegundos Unix. `phone.call` recibe un `number`, por lo que un nombre debe
resolverse antes con `contacts.search`. `Amazon` abre Amazon Shopping y `Alexa`
abre la app Alexa; no son aliases intercambiables. `location.get` incluye
`formattedAddress` y campos estructurados cuando Android puede hacer geocoding;
si el propietario pide dónde está su móvil, se devuelve esa dirección completa
sin reducirla a una ciudad. En la misma LAN, la vía Tailscale preferida es P2P
directa al endpoint privado `100.x`; DERP cifrado sigue siendo un fallback válido.

Instalación y conexión por Internet: [ATLAS Companion](../.atlas/companion/README.md).

## `atlas-androiduse`

Fallback visual para controlar, mediante el servicio de accesibilidad de la app,
una pantalla Android ya emparejada. Las APIs nativas de `atlas-app control` se
priorizan para llamadas, SMS, calendario, ubicación, archivos y notificaciones.

```bash
atlas-androiduse start
atlas-androiduse screenshot
atlas-androiduse tree
atlas-androiduse click 'Permitir'
atlas-androiduse tap 0.50 0.52
atlas-androiduse long_press 0.50 0.52 700
atlas-androiduse swipe 0.75 0.80 0.75 0.25 300
atlas-androiduse text 'esp32'
atlas-androiduse key ENTER
atlas-androiduse back
atlas-androiduse home
atlas-androiduse recents
atlas-androiduse wait 350
atlas-androiduse wait_for 'Buscar en Amazon'
atlas-androiduse batch actions.json
atlas-androiduse launch com.android.chrome
atlas-androiduse launch https://example.com
atlas-androiduse stop
```

La captura actual se reduce a un ancho máximo de 640 px, se codifica como JPEG
calidad 82 y se guarda como fichero privado; el wrapper conserva compatibilidad
con PNG antiguos y nunca imprime base64. `click` busca primero una etiqueta
exacta accesible; los gestos de coordenadas son el fallback y usan valores
normalizados de `0` a `1` sobre la pantalla física. `launch` distingue
internamente `package` y `uri`. `tree` redacta los campos de contraseña y sus
descendientes. Un error recuperable de acción o inspección conserva la sesión;
`stop` sigue siendo obligatorio al terminar o abandonar la tarea y ante
cancelación, timeout, salida o pérdida terminal de transporte/Accesibilidad. No
se repiten acciones tras perder la conexión. [Manual operativo](../openclaw/workspace/atlas-commands/ATLAS-ANDROIDUSE.md).

## `atlas-chat`

Abre un chat de terminal, solo por texto, con el mismo `gpt-realtime-2.1`,
OAuth, contexto Markdown, memoria y tools directas que WebScreen. Las respuestas
se muestran en blanco; los comandos, búsquedas y resultados, en gris. También
mide el tiempo hasta el primer texto y el tiempo total de cada turno.

Además de shell, búsqueda y rutinas, registra `atlas_phone` para APIs nativas y
`atlas_android` para Accessibility. Las capturas JPEG reducidas de este último se
adjuntan al turno como `input_image` privado, sin incrustar base64 en la salida.
`androiduse.click` prioriza etiquetas accesibles sobre coordenadas. Los aliases
`location`/`get_location`, `capabilities`, `call` y `calls.place` se normalizan a
`location.get`, `phone.capabilities` y `phone.call`; la ubicación conserva
`formattedAddress`, y Amazon Shopping y Alexa se resuelven por separado.

```bash
atlas-chat
atlas-chat -p "Comprueba la temperatura de la Pi"
atlas-chat --ephemeral -p "Prueba de latencia sin historial"
atlas-chat --verbose
atlas-chat --help
```

El wrapper funciona como `sami` y como root; root delega la ejecución al usuario
de servicio para no crear estado privado con propietario incorrecto.
Las sesiones normales leen y escriben la conversación persistente compartida
con WebScreen; `--ephemeral` no la lee ni la modifica. Dentro del chat están
disponibles `/help`, `/new`, `/context`, `/model`, `/logs`, `/clear` y `/quit`.
El editor ofrece sugerencias `/` y referencias locales `@`, historial y entrada
multilínea. `/files` muestra su carpeta base, `/expand` despliega herramientas
truncadas y `/compact` alterna su detalle visual sin alterar la memoria.

## `atlas-routines`

Gestiona automatizaciones deterministas compartidas por WebScreen y
`atlas-chat`. Las frases se comparan de forma exacta y normalizada antes de
abrir una respuesta del modelo. El registro activo es
`/home/atlas/.atlas/routines/ROUTINES.md`; un éxito puede pronunciar su propio
paso `[SAY]` o terminar en silencio.

```bash
atlas-routines list
atlas-routines list --expand
atlas-routines show hora
atlas-routines create
atlas-routines run hora
atlas-routines validate
atlas-routines edit
atlas-routines disable hora
atlas-routines enable hora
atlas-routines delete hora
```

`list` muestra únicamente líneas como `1. hora · activa`; `list --expand`
incluye la definición completa de cada entrada. `requires_model: false` marca
las rutinas autocontenidas: ejecutan su comando y entregan únicamente el `[SAY]`
resuelto, sin abrir una respuesta del modelo. Los fallos se detienen y registran
para que Realtime los explique sin repetir la acción. El wrapper funciona como
`sami` y como root; root delega en el usuario de servicio.

## `atlas-say`

Convierte texto en audio mediante ElevenLabs y lo reproduce por la salida predeterminada.

```bash
atlas-say "Hola"
atlas-say --tts elevenlabs "Prueba"
```

Las API keys y los Voice IDs privados no están incluidos en este repositorio. Deben configurarse localmente mediante el mecanismo de secretos correspondiente.

## `atlas-screen`

Controla la pantalla física SunFounder TS7 Pro, no el escritorio virtual de `atlas-desktop`. Sin argumentos muestra encendido, modo seleccionado, superficie activa y configuración del arranque.

```bash
atlas-screen
atlas-screen --terminal
atlas-screen on
atlas-screen off
atlas-screen --desktop
atlas-screen --atlas
atlas-screen --atlas-new
atlas-screen --atlas-hide
atlas-screen --rafas
atlas-screen enable --atlas
atlas-screen enable --atlas-new
atlas-screen enable --last
atlas-screen disable
```

El modo terminal abre una shell root Zsh con autocompletado, highlighting, zoom y ATLAS TOUCH TYPE. Doble toque abre el teclado; un toque lo cierra; dos dedos desplazan el historial. El zoom cambia los caracteres y reajusta las líneas sin redimensionar la ventana. Requiere las configuraciones de [`system`](../system) y los helpers de [`misc/atlas-touch-type`](../misc/atlas-touch-type).

El modo `--rafas` abre la consola nativa de recuperación, blanca y sin entorno gráfico, como root en `/home/atlas`. También se activa manteniendo Ctrl y pulsando W, O, W en un teclado USB. Está disponible incluso con la pantalla apagada, pero sigue necesitando un kernel y hardware funcionales. Esta versión no pide contraseña local. [Funcionamiento y límites](../misc/rafas/README.md).

El modo `--atlas` abre WebScreen en Google Chrome kiosko sobre `localhost:5000`, como usuario normal y con sandbox. El cursor solo aparece cuando hay un ratón USB/Bluetooth conectado. Cada modo cambia la pantalla inmediatamente; `on` abre el último seleccionado y `off` apaga la salida. Se pueden combinar, por ejemplo `--atlas on`; ya no se usan `--on` ni `--off`. El kiosko no sustituye la autenticación ni protege contra acceso físico al equipo.

`--atlas-new` selects the minimal face at `/new/?kiosk=1`, using the same voice
engine and settings; `--atlas` keeps the debugging view at `/`. Both can be
selected as the boot mode. `--atlas-hide` covers the current design in black
at minimum brightness without stopping its microphone, audio or HDMI link.
The saved `screen/web-design` selects which visible presentation to restore.
The private-pipe browser watchdog checks the rendered document, reloads a
failed tab and restarts only Chrome if necessary, with bounded backoff.
See the [new presentation guide](../.atlas/webscreen/NEW_DESIGN.md).

`enable --atlas`, `--desktop`, `--terminal` o `--rafas` configura un modo fijo de arranque. `enable --last` usa el último modo seleccionado antes de apagar el sistema. `enable` sin modo recupera la elección guardada y `disable` vuelve al arranque con pantalla apagada. Activar o desactivar esta política no interrumpe la pantalla actual.

## `atlas-webscreen`

Instala, reinicia, desactiva y comprueba el servicio HTTP de ATLAS WebScreen ubicado en `/home/atlas/.atlas/webscreen`.

```bash
atlas-webscreen enable
atlas-webscreen restart
atlas-webscreen status
atlas-webscreen disable
```

## `atlas-context`

Gestiona la memoria conversacional persistente compartida por WebScreen y las
sesiones normales de `atlas-chat`. No modifica los Markdown cruciales del
workspace ni la memoria de OpenClaw.

```bash
atlas-context status
atlas-context empty
atlas-context compact
```

`empty` inicia una conversación nueva conservando el contexto crucial. No
afecta a una sesión `atlas-chat --ephemeral`. `compact`
reduce el historial conversacional para mantener los hechos y decisiones más
útiles; una pestaña WebScreen activa puede realizar una compactación semántica
con Realtime antes de reiniciar su sesión.

## `atlas-spotify`

Controla una cuenta Spotify privada mediante OAuth PKCE. La contraseña nunca se
guarda en ATLAS; los tokens renovables permanecen fuera del repositorio, dentro
de `.atlas/spotify/` y con permisos restrictivos.

```bash
atlas-spotify login
atlas-spotify status
atlas-spotify search "Midnight City"
atlas-spotify play spotify:track:...
atlas-spotify pause
atlas-spotify queue spotify:track:...
```

El control de reproducción exige Spotify Premium. `device connect` transfiere la
reproducción entre dispositivos Spotify Connect. El servicio local `spotifyd`
aparece como **ATLAS A1**, incluye librespot internamente y empieza enviando solo
la música al HDMI de la pantalla; no sustituye la salida de voz de ATLAS. Un
servicio local añade a `.atlas/spotify/HISTORY.md` cada canción reproducida con
timestamp, título, álbum y artista; ese historial es privado y todavía no
activa recomendaciones ni automatismos.

## Seguridad

Revisa cada script antes de utilizarlo fuera de ATLAS OS. Algunos comandos controlan servicios del sistema, audio, dispositivos de red o interfaces gráficas y pueden necesitar permisos elevados.

Los wrappers se instalan en `/usr/local/bin`, accesible tanto al usuario normal como a root. La copia refleja ATLAS A1: el usuario de servicio es `sami` y su home es `/home/atlas`. Adapta ambos valores antes de desplegar en otra instalación. Los comandos retirados `atlas-focus`, `atlas-taskfocus` y `atlas-priority` no se distribuyen.
