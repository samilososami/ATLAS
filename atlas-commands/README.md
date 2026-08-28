# Comandos de ATLAS

Estos scripts proporcionan una interfaz uniforme para administrar las funciones principales de ATLAS A1. Están diseñados para ejecutarse en el entorno de ATLAS OS y pueden depender de servicios, rutas o paquetes incluidos en esa instalación.

## `atlas-audio`

Gestiona las salidas de audio, dispositivos Bluetooth, volumen, mute y pruebas de reproducción.

```bash
atlas-audio status
atlas-audio outputs
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

Controla el escritorio virtual de ATLAS: servicio, Chromium, ventanas, entrada simulada, capturas de pantalla, layouts y wallpaper.

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

Controla la pantalla física SunFounder TS7 Pro, no el escritorio virtual de `atlas-desktop`. Sin argumentos muestra encendido, modo seleccionado y superficie activa. El arranque por defecto permanece apagado.

```bash
atlas-screen
atlas-screen --terminal
atlas-screen on
atlas-screen off
atlas-screen --desktop
```

El modo terminal abre una shell root Zsh con autocompletado, highlighting, zoom y teclado táctil integrado. Doble toque abre el teclado; un toque lo cierra; dos dedos desplazan el historial. Requiere los helpers y configuraciones de [`system`](../system).

## `atlas-webscreen`

Instala, reinicia, desactiva y comprueba el servicio HTTP de ATLAS WebScreen ubicado en `/home/atlas/.atlas/atlas-webscreen`.

```bash
atlas-webscreen enable
atlas-webscreen restart
atlas-webscreen status
atlas-webscreen disable
```

## Seguridad

Revisa cada script antes de utilizarlo fuera de ATLAS OS. Algunos comandos controlan servicios del sistema, audio, dispositivos de red o interfaces gráficas y pueden necesitar permisos elevados.

Los wrappers se instalan en `/usr/local/bin`, accesible tanto al usuario normal como a root. La copia refleja ATLAS A1: el usuario de servicio es `sami` y su home es `/home/atlas`. Adapta ambos valores antes de desplegar en otra instalación. Los comandos retirados `atlas-focus`, `atlas-taskfocus` y `atlas-priority` no se distribuyen.
