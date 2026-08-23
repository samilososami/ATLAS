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

## `atlas-pistatus`

Muestra un resumen del estado de la Raspberry Pi y de los servicios principales: temperatura, CPU, memoria, almacenamiento, red, ventilador y componentes de ATLAS.

```bash
atlas-pistatus
```

## `atlas-priority`

Libera temporalmente recursos de CPU y RAM deteniendo servicios secundarios, y restaura después el estado anterior.

```bash
atlas-priority 10
atlas-priority status
atlas-priority restore
```

## `atlas-say`

Convierte texto en audio mediante un backend de TTS local o ElevenLabs y lo reproduce por la salida predeterminada.

```bash
atlas-say "Hola"
atlas-say --tts local "Prueba local"
atlas-say --tts local --voice list
```

Las API keys y los Voice IDs privados no están incluidos en este repositorio. Deben configurarse localmente mediante el mecanismo de secretos correspondiente.

## `atlas-webscreen`

Instala, activa, desactiva y comprueba el servicio HTTPS de ATLAS WebScreen.

```bash
atlas-webscreen enable
atlas-webscreen status
atlas-webscreen disable
```

## Seguridad

Revisa cada script antes de utilizarlo fuera de ATLAS OS. Algunos comandos controlan servicios del sistema, audio, dispositivos de red o interfaces gráficas y pueden necesitar permisos elevados.
