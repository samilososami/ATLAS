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
atlas-screen --rafas
atlas-screen enable --atlas
atlas-screen enable --last
atlas-screen disable
```

El modo terminal abre una shell root Zsh con autocompletado, highlighting, zoom y ATLAS TOUCH TYPE. Doble toque abre el teclado; un toque lo cierra; dos dedos desplazan el historial. El zoom cambia los caracteres y reajusta las líneas sin redimensionar la ventana. Requiere las configuraciones de [`system`](../system) y los helpers de [`misc/atlas-touch-type`](../misc/atlas-touch-type).

El modo `--rafas` abre la consola nativa de recuperación, blanca y sin entorno gráfico, como root en `/home/atlas`. También se activa manteniendo Ctrl y pulsando W, O, W en un teclado USB. Está disponible incluso con la pantalla apagada, pero sigue necesitando un kernel y hardware funcionales. Esta versión no pide contraseña local. [Funcionamiento y límites](../misc/rafas/README.md).

El modo `--atlas` abre WebScreen en Google Chrome kiosko sobre `localhost:5000`, como usuario normal y con sandbox. El cursor solo aparece cuando hay un ratón USB/Bluetooth conectado. Cada modo cambia la pantalla inmediatamente; `on` abre el último seleccionado y `off` apaga la salida. Se pueden combinar, por ejemplo `--atlas on`; ya no se usan `--on` ni `--off`. El kiosko no sustituye la autenticación ni protege contra acceso físico al equipo.

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

Gestiona únicamente la memoria conversacional persistente de WebScreen Realtime.
No modifica los Markdown cruciales del workspace ni la memoria de OpenClaw.

```bash
atlas-context status
atlas-context empty
atlas-context compact
```

`empty` inicia una conversación nueva conservando el contexto crucial. `compact`
reduce el historial conversacional para mantener los hechos y decisiones más
útiles; una pestaña WebScreen activa puede realizar una compactación semántica
con Realtime antes de reiniciar su sesión.

## Seguridad

Revisa cada script antes de utilizarlo fuera de ATLAS OS. Algunos comandos controlan servicios del sistema, audio, dispositivos de red o interfaces gráficas y pueden necesitar permisos elevados.

Los wrappers se instalan en `/usr/local/bin`, accesible tanto al usuario normal como a root. La copia refleja ATLAS A1: el usuario de servicio es `sami` y su home es `/home/atlas`. Adapta ambos valores antes de desplegar en otra instalación. Los comandos retirados `atlas-focus`, `atlas-taskfocus` y `atlas-priority` no se distribuyen.
