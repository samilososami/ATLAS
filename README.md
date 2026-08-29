<p align="center">
  <img src="assets/atlas-banner.png" alt="ATLAS banner" width="100%">
</p>

<h1>
  <img src="assets/atlas-icon.png" alt="ATLAS" width="54" align="left">
  ATLAS
</h1>

ATLAS es un prototipo de agente de inteligencia artificial físico, personalizable y de bajo coste. Integra OpenClaw, modelos de lenguaje, memoria persistente, herramientas del sistema y distintos canales de comunicación en un dispositivo dedicado.

El objetivo no es presentar ATLAS como una inteligencia consciente ni como un modelo creado desde cero. El proyecto estudia cómo desplegar, configurar, personalizar y evaluar un agente basado en tecnologías abiertas para que pueda ejecutar tareas concretas de forma útil, natural y verificable.

## Qué es ATLAS

ATLAS busca superar el enfoque rígido de los asistentes basados únicamente en comandos predefinidos. Puede interpretar peticiones en lenguaje natural, utilizar tools, consultar memoria, interactuar con el sistema y coordinar acciones dentro de los límites definidos por el usuario.

OpenClaw funciona como núcleo de software y conecta:

- Large Language Models (LLM), principalmente mediante servicios en la nube.
- Memoria y contexto persistentes escritos en Markdown.
- Tools, skills, scripts y servicios del sistema.
- Channels como Telegram, interfaces web y futuras integraciones.
- Pipelines de Speech-to-Text (STT) y Text-to-Speech (TTS).

ATLAS es la capa de identidad, comportamiento, integración, automatización y experiencia física construida alrededor de esa base.

## Objetivos

- Mantener conversaciones por texto y, progresivamente, por voz.
- Recordar preferencias concretas del usuario de forma estructurada.
- Ejecutar tareas mediante tools y comandos del sistema.
- Mostrar información en una pantalla dedicada.
- Integrar canales de comunicación y servicios externos.
- Detectar e interpretar determinados periféricos conectados.
- Recuperar sus servicios después de un reinicio.
- Evaluar cada función mediante éxito, errores y tiempo de respuesta.

## ATLAS A1

ATLAS A1 es la primera implementación física del proyecto. Actualmente se ejecuta en una Raspberry Pi 5 con 4 GB de RAM.

La Raspberry Pi actúa como Gateway, entorno de ejecución y punto de conexión con el hardware. Los modelos más grandes se ejecutan normalmente en la nube; los modelos locales se reservan para tareas compatibles con los recursos disponibles, como determinados procesos de STT, TTS o experimentación con modelos pequeños.

La pantalla actual es una SunFounder TS7 Pro táctil de siete pulgadas y resolución 1024 × 600. El diseño físico completo, el audio, el micrófono y la carcasa se documentarán conforme avance el prototipo.

## Software

ATLAS OS 1.0 está basado en Debian 13 para arquitectura `aarch64` y personalizado para funcionar como sistema dedicado de ATLAS. Incluye la identidad visual del proyecto, OpenClaw, servicios persistentes y comandos específicos para controlar el dispositivo.

<p align="center">
  <img src="assets/fastfetch.png" alt="Fastfetch de ATLAS OS 1.0" width="760">
</p>

La versión mostrada utiliza:

- Hostname `atlas-a1`.
- Identidad `ATLAS OS 1.0 (Debian 13)`.
- Shell presentada como `atsh 1.0`, basada en Bash.
- Fastfetch y Neofetch con identidad visual propia.
- OpenClaw como Gateway del agente.

### WebScreen y conversación por voz

El código de [`ATLAS WebScreen`](.atlas/atlas-webscreen) incluye una interfaz de depuración con cuatro vistas: ATLAS, Transcripción, Texto a voz y Ajustes.

Una sola pestaña controla WebScreen a la vez. Las demás muestran **Tomar control**: al pulsarlo, el permiso pasa inmediatamente al nuevo dispositivo, sin solicitud ni confirmación. La pestaña anterior detiene micrófono, audio y trabajo activo y muestra la pantalla bloqueada. La conversación de OpenClaw se conserva; este control de uso no sustituye una futura autenticación.

- La conversación principal usa `gpt-realtime-2.1` mediante OpenClaw y WebRTC. El modelo recibe audio, transcribe y genera la voz nativa `marin` dentro de una misma sesión; Chrome Speech Recognition, TTS del navegador y ElevenLabs quedan como herramientas de laboratorio o fallback, no como la cadena principal.
- Una conversación nueva debe comenzar con `ATLAS` tras cuatrocientos milisegundos de silencio. Después hay diez segundos de continuación natural sin repetir la wake word. Hablar durante la respuesta aplica barge-in y cancela también el trabajo delegado.
- OpenAI Realtime responde directamente a conversación, juegos, ideas y conocimiento estable. Para memoria, workspace, correo, estado real, información actual, herramientas o acciones llama a `openclaw_agent_consult`, que conserva como agente principal a OpenClaw con GPT-5.6 Luna.
- Las reservas WebRTC son efímeras. El OAuth persistente y las credenciales permanecen en la Raspberry Pi y no se entregan al navegador.
- Cada interacción directa o delegada se registra en JSON Lines con tiempos, transcripción, modelo, voz, tool calls y resultado, sin incluir secretos.
- Si Realtime o WebRTC fallan, WebScreen reactiva la arquitectura anterior. Su código y explicación están preservados en [`Backups/WebScreen/legacy-preamble-2026-08-29`](Backups/WebScreen/legacy-preamble-2026-08-29).

La voz Realtime y el agente de herramientas son dos capas del mismo ATLAS, no dos personalidades. La primera sostiene la conversación inmediata; Luna conserva el contexto, la memoria y la capacidad de actuar cuando la petición lo exige.

### Pantalla y terminal local

`atlas-screen` muestra el estado y cambia inmediatamente entre `--desktop`, `--terminal`, `--atlas` y `--rafas`. `on` abre el modo seleccionado y `off` apaga la salida, sin guiones. `atlas-screen enable --atlas` fija ATLAS para el arranque; también admite los otros modos. `enable --last` recupera el último modo seleccionado antes de apagar el sistema y `disable` vuelve al arranque con pantalla apagada. `atlas-screen --atlas` abre WebScreen en Google Chrome kiosko sobre localhost, conservando el acceso por red. El cursor se oculta cuando no hay un ratón USB/Bluetooth conectado.

La terminal usa Zsh con autocompletado, highlighting y **ATLAS TOUCH TYPE**, el teclado táctil oscuro. Un doble toque abre el teclado sin tapar la zona de escritura; un toque lo cierra y dos dedos permiten recorrer el historial. El zoom cambia la letra y reajusta las líneas sin cambiar la ventana. Esta terminal tiene acceso root local: úsala únicamente en un dispositivo bajo tu control. RAFAS es su alternativa de recuperación sin entorno gráfico.

## Workspace de OpenClaw

El directorio [`openclaw/workspace`](openclaw/workspace) contiene la base pública del contexto de ATLAS.

- `AGENTS.md`, `IDENTITY.md` y `SOUL.md` conservan el comportamiento e identidad definidos para ATLAS.
- `USER.md`, `MEMORY.md`, `TDR.md`, `ENVIRONMENT.md` y `HEARTBEAT.md` se distribuyen como templates sin datos personales.
- `TOOLS.md` sirve como guía local para documentar hardware, rutas y herramientas de cada instalación.
- `VARIABLES.md`, `ADB.md` y `NMAP.md` son templates; `atlas-commands/` contiene las instrucciones de los comandos para el agente.

### Dispositivos Android y red local

ATLAS puede utilizar ADB para conectarse a teléfonos, televisores y otros dispositivos Android autorizados. Un wrapper transparente conserva el comando `adb` habitual y, después de una conexión correcta, crea en segundo plano una ficha privada y reproducible con la identidad, versión de Android, codename, build, pantalla, batería y almacenamiento del dispositivo. Las reconexiones actualizan la ficha identificada por MAC en vez de duplicarla.

Un temporizador independiente mantiene cada diez minutos un informe privado de los hosts activos y de los servicios TCP más comunes de la red local. ATLAS consulta primero ese informe para responder preguntas rápidas o localizar una IP. Los escaneos completos de todos los puertos se reservan para un objetivo privado concreto y una petición que realmente los necesite.

Los tokens, API keys, sesiones, credenciales, historiales, datos personales y configuraciones privadas no forman parte del repositorio ni de las imágenes publicadas.

## Comandos de ATLAS

La carpeta [`atlas-commands`](atlas-commands) contiene los comandos `atlas-*` utilizados para gestionar audio, pantalla, casting, estado del sistema, TTS y servicios del dispositivo. Cada comando se acompaña de una descripción breve y ejemplos de uso.

## Estructura del repositorio

Las [herramientas misceláneas](misc/README.md) reúnen [ATLAS TOUCH TYPE](misc/atlas-touch-type/README.md) y [RAFAS](misc/rafas/README.md), con su código y notas de instalación.

```text
ATLAS/
├── .atlas/                 Runtime público: WebScreen, desktop, pantalla y proyectos
├── assets/                 Recursos visuales y capturas
├── atlas-commands/         Comandos de administración de ATLAS A1
├── docs/                   Notas de versiones y documentación técnica
├── misc/                   ATLAS TOUCH TYPE, RAFAS y herramientas misceláneas
├── openclaw/workspace/     Identidad pública y templates de OpenClaw
├── system/                 Helpers, servicios, ADB, Nmap, terminal, HDMI y personalización
├── README.md               Presentación del proyecto
└── SECURITY.md             Política de publicación segura
```

## Estado actual

ATLAS se encuentra en desarrollo activo. La versión 1.0 establece la identidad del agente, su sistema operativo base, el Gateway de OpenClaw, el contexto persistente y las primeras herramientas de control.

La voz, la pantalla táctil y las herramientas de recuperación están en desarrollo activo. El código de este repositorio avanza por delante de la imagen de la release 1.0: esta actualización no genera ni sustituye ninguna imagen del sistema. Consulta el [mapa de instalación y límites actuales](.atlas/README.md).

## RAFAS

RAFAS significa ***Recovery Access For ATLAS Systems***. Su primera implementación ya permite abrir una consola de recuperación local independiente del entorno gráfico, de OpenClaw y de la red.

Durante el desarrollo de ATLAS A1 fueron apareciendo errores e incidencias. Habitualmente, ATLAS podía resolverlos por sí mismo o recuperarse mediante sus herramientas de auto-reparación. Sin embargo, algunos fallos afectaban al propio Gateway de OpenClaw, al provider del modelo —por ejemplo, OpenAI— o a NetworkManager. En esas situaciones, ATLAS entraba en un estado de hibernación operativa y no podía reparar el problema desde dentro.

Hasta entonces, la alternativa era conectarse por SSH a la terminal de ATLAS OS y resolverlo manualmente. Esto se volvía especialmente complicado si el fallo estaba relacionado con la conectividad: si la Raspberry Pi no conseguía conectarse a Internet, tampoco era posible acceder a ella por red.

Con la incorporación de la pantalla al ATLAS A1 surgió RAFAS. Con un teclado USB, mantén Ctrl y pulsa W, O, W. La pantalla se enciende y muestra el logo de ATLAS y el título R.A.F.A.S. en blanco, junto a una shell root en `/home/atlas`. También se abre con `atlas-screen --rafas`. Funciona desde los modos apagado, desktop, terminal o Atlas; no necesita Chrome ni Xorg.

Un pequeño servicio espera eventos del teclado, sin sondeo periódico ni registro de pulsaciones. Se inicia con el sistema y se reinicia si falla. No es un sistema operativo alternativo: necesita que Linux, systemd, el teclado y la pantalla sigan funcionando.

**Esta versión de desarrollo ofrece acceso root local sin contraseña adicional.** Está pensada exclusivamente para dispositivos bajo control de su propietario. La autenticación y las herramientas visuales de recuperación se incorporarán más adelante. [Código, funcionamiento y límites](misc/rafas/README.md).

### Roadmap

- Desarrollar **ATLAS Imager** para Windows y Linux.
- Descargar, verificar, descomprimir y grabar automáticamente la imagen oficial de ATLAS OS.
- Permitir el provisioning previo de Wi-Fi, hostname, usuario, contraseña y claves SSH sin incluir estos datos en la imagen pública.
- Definir un formato de configuración versionado para que ATLAS Imager y ATLAS OS sean compatibles entre versiones.

## Releases

Las imágenes saneadas de ATLAS OS y sus notas de versión se publican en [GitHub Releases](../../releases). Se distribuyen comprimidas como `.img.xz`; ATLAS Imager podrá descargarlas y preparar cada instalación con la configuración elegida por su propietario. Una imagen pública nunca debe contener redes Wi-Fi, tokens, API keys, cookies, sesiones, claves SSH ni datos personales de la instalación original.

Consulta las [notas de ATLAS OS 1.0](docs/ATLAS-OS-1.0.md) para conocer el contenido, los requisitos, el proceso de primer arranque y las comprobaciones de seguridad.

## Donaciones

Cualquier donación me motiva muchísimo y me ayuda a continuar creando, investigando y explorando nuevos proyectos.

- PayPal: [paypal.me/samilososami](https://paypal.me/samilososami)
- Bitcoin: `bc1qa8r8ll0m0e58f3ngrauh08nnzdn0alm825nc3r`
