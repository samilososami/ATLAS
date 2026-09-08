# ATLAS Android · 0.2.3 preview

Aplicación Android 11+ para hablar con ATLAS y controlar un ATLAS A1 propio. La
APK se publica en [GitHub Releases](https://github.com/samilososami/ATLAS/releases).
Es una preview firmada para desarrollo; no es la imagen de ATLAS OS.

La versión 0.2.3 hace más eficiente el control del teléfono: abre aplicaciones
por su nombre con una única operación nativa, reserva Android Use para acciones
dentro de las interfaces y permite mantener una sesión visual explícita entre
varios mensajes. Mantiene voz, chat, acciones, terminal, estado, widgets y
actualizaciones dentro de una sola aplicación.

## Primera conexión

1. Instala [Companion en A1](../.atlas/companion/README.md) y conecta `atlas-a1`,
   el teléfono y, si quieres administrarlo, el portátil a la misma red Tailscale.
2. En A1 ejecuta `atlas-app pair`. El modo Bluetooth dura 120 segundos y muestra
   un código `XXX-XXX`.
3. En ATLAS → Ajustes pulsa **Emparejar**, selecciona el A1 detectado e introduce
   las seis cifras. La clave de aplicación y la huella TLS se guardan cifradas en
   Android Keystore.
4. La sesión Realtime se prepara al abrir la app. En **Pulsar**, mantén el botón,
   habla y suéltalo para enviar.

**Comprobar permisos**, en Ajustes, abre solo las páginas de permisos que todavía
faltan. Sirve también para activar Accesibilidad después de una actualización sin
borrar datos ni repetir la introducción. Los permisos especiales vuelven a
comprobarse al regresar desde Ajustes de Android.

## Conexión persistente

Companion escucha en el canal privado `wss://atlas-a1:5010/app`. Tailscale intenta
una ruta directa entre el teléfono y A1; si la red no permite UDP directo puede
usar un relay DERP cifrado de Tailscale sin cambiar de protocolo. El antiguo
relay de Cloudflare solo existe como modo de compatibilidad seleccionado de forma
explícita; un fallo de Tailscale nunca provoca fallback automático. Una
instalación 0.1.x puede migrar a MagicDNS con la clave y el pin ya guardados, sin
obligar a emparejar de nuevo.

Un foreground service conserva el WebSocket cifrado cuando la Activity queda en
segundo plano, reacciona a cambios entre Wi-Fi y datos y aplica backoff acotado.
Android muestra una notificación persistente y puede pedir excluir ATLAS de la
optimización de batería. **Forzar detención** desde Android sí mata el proceso y
la conexión, deliberadamente.

El servidor procesa RPC cifrado de forma concurrente y serializa las escrituras.
Así puede recibir `app.reply` por el mismo WebSocket mientras la petición original
espera una operación nativa del teléfono, sin bloquear el lector ni duplicar la
acción tras una reconexión.

La sesión Realtime se precarga al abrir la app, antes de pulsar el micrófono. Al
mandar la Activity a segundo plano se libera WebRTC para evitar consumo continuo
de CPU, batería y audio; al volver se prepara de inmediato otra sesión. Esto no
cierra el enlace con A1: el WebSocket Tailscale permanece a cargo del foreground
service y conserva widgets, estado, terminales y herramientas del teléfono.

## Cinco tabs

- **ATLAS.** Pulsar para hablar, wake word visible y Chat de texto. El chat añade
  el mensaje local inmediatamente, muestra que ATLAS está pensando y recibe la
  respuesta progresiva. Sus sugerencias rotan entre 50 frases breves.
- **ACCIONES.** Botones sin ripple y selección estable por pulsación larga. El
  editor ofrece nombre, acción predefinida, iconos y colores; el comando real se
  guarda internamente y nunca se crea un botón inerte. Tocar ejecuta directamente,
  respetando la protección biométrica opcional.
- **TERMINAL.** PTY real de borde a borde, pantalla completa inmersiva, teclas
  auxiliares sobre el teclado y zoom tipográfico con pellizco. La shell sobrevive
  al segundo plano y expira tras cinco minutos sin actividad. Solo consulta salida
  mientras el tab está visible.
- **ESTADO.** Conserva la última lectura válida, refresca al entrar y permite
  pull-to-refresh. Pro muestra la cuota semanal; Plus, 5 h y semanal. Datos no
  disponibles nunca se presentan como cero.
- **AJUSTES.** Emparejamiento, permisos pendientes, bloqueo al abrir, protección
  de acciones, voz, razonamiento, actualización verificada y desemparejado real.

## Control del teléfono

ATLAS prioriza APIs nativas para abrir aplicaciones, llamadas, SMS, contactos, calendario, ubicación,
notificaciones, archivos, galería, cámara, sensores y panel Wi-Fi. Las operaciones
devuelven `permission_required`, `unsupported` o `requires_user_action` cuando
Android exige permiso, confirmación o no ofrece la capacidad; nunca simulan éxito.

WebScreen y `atlas-chat` comparten `atlas_phone` para esas APIs y
`atlas_android` para el fallback visual. Los nombres `location`/`get_location`,
`capabilities`, `call` y `calls.place` son aliases de `location.get`,
`phone.capabilities` y `phone.call`. SMS usa `text`; las llamadas usan `number`;
y `apps.launch {app}` abre por nombre sin capturas ni coordenadas. La creación de calendario requiere descubrir antes un `calendarId` editable
con `calendar.list` y enviar `begin`/`end` en milisegundos Unix.

`atlas-androiduse` es el fallback visual. El AccessibilityService puede observar
la jerarquía, capturar la pantalla, tocar, mantener pulsado, deslizar, escribir,
abrir paquetes o URI, esperar y usar Atrás/Inicio/Recientes/ENTER. Los gestos usan
coordenadas normalizadas de `0` a `1`; la jerarquía redacta campos de contraseña
y todos sus descendientes. Durante el control aparece una notificación, un aura
azul, un bloqueo de entrada y un botón rojo para detenerlo. Cada acción importante
se sigue con una nueva inspección. Realtime recibe el PNG como un `input_image`
separado, nunca como base64 dentro del resultado. Las tareas puntuales se cierran
al terminar, cancelar, fallar o por watchdog; la orden explícita «controla mi
teléfono» mantiene una sesión para instrucciones sucesivas hasta que se detenga.
Accesibilidad se activa manualmente en Ajustes de Android.

En A1 están disponibles `atlas-app control …` y `atlas-androiduse …`. Si el móvil
no está enlazado, responden exactamente `Error: Android device not connected`.

## Widgets y actualizaciones

Los widgets se eligen desde el selector del launcher: resumen de A1, cuotas, CPU,
RAM, un botón guardado y accesos a Chat o Voz. Empiezan en 2×2 y muestran más o
menos información según el tamaño. Las restricciones de Android impiden mantener
un campo de chat o una grabación continua dentro de un RemoteViews; esos widgets
abren directamente el modo correspondiente.

**Buscar actualizaciones** consulta únicamente releases Android de este repo,
muestra versión y notas y descarga con progreso. Antes de abrir el instalador se
verifican origen, tamaño, SHA-256, package name, versionCode superior y la misma
firma APK. Android conserva su propia confirmación de instalación.

## Build

Requiere JDK 17+, plataforma Android 36 y build-tools 36.0.0. En la máquina de
desarrollo están compartidos bajo `/tools/codex`, disponibles para kali y root.

```sh
cd android
./build.sh
```

Salida: `app/build/outputs/apk/debug/app-debug.apk`. `build.sh` reutiliza la
identidad de desarrollo local de ATLAS para que una compilación lanzada como root
o kali pueda actualizar la APK anterior. La keystore permanece fuera del repo.
Para otra máquina puede definirse su propio `ANDROID_USER_HOME` y debe conservarse
la misma clave en todas sus releases.

Pruebas principales:

```sh
node --test android/test_*.cjs
./gradlew testDebugUnitTest lintDebug assembleDebug --console=plain
```

La UI se entrega como HTML/CSS/JS local dentro de WebView; Java implementa enlace,
audio fallback, Keystore, biometría, permisos, BLE y APIs Android. Las 26 imágenes
del tutorial son PNG individuales y se precargan de una en una. xterm.js 5.5.0 y
addon-fit 0.10.0 se distribuyen bajo MIT; su licencia está en
`app/src/main/assets/web/XTERM-LICENSE`.

## Límites de validación

El emulador permite verificar instalación, actualización, navegación y contratos,
pero no sustituye las pruebas de hardware. En un S23 Ultra real se verificaron
Tailscale y Companion, Realtime y voz por pulsación, herramientas nativas no
intrusivas, AccessibilityService sobre One UI, control de Chrome y liberación de
WebRTC en segundo plano sin perder el enlace con A1. BLE, biometría, telefonía,
SMS y las acciones que exigen modificar datos o completar una confirmación del
sistema siguen fuera de esa tanda. Algunas APIs abren una pantalla o confirmación
porque Android no permite autorizarlas silenciosamente.
