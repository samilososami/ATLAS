# Seguridad

## Imágenes y configuraciones públicas

Las versiones públicas de ATLAS no deben incluir:

- API keys, access tokens o refresh tokens.
- Passwords, cookies, sesiones o credenciales guardadas.
- Configuraciones Wi-Fi o certificados privados.
- Claves privadas SSH ni host keys reutilizadas.
- Historiales de shell, logs personales o conversaciones.
- Archivos `USER.md`, `MEMORY.md` o `TDR.md` de una instalación real.

Las imágenes de ATLAS OS se generan desde una copia de trabajo y se sanea esa copia. El sistema de origen no debe modificarse durante el proceso de publicación.

La sincronización de código usa una selección explícita de archivos. Excluye
`.runtime`, `.certs`, `.models`, `.venv`, logs, backups, perfiles de Google Chrome,
sesiones de OpenClaw y proyectos personales generados. Los templates privados
no deben sustituirse por las copias reales de una Raspberry Pi.

## Superficies de desarrollo

WebScreen escucha en la red local y no incluye autenticación propia del
navegador. Puede ejecutar acciones mediante una shell directa: no lo expongas a
Internet y limita su acceso a una red de confianza. Las credenciales se leen
en el backend y no deben enviarse al cliente.

`atlas-chat` reutiliza esa shell directa desde una terminal local y puede
ejecutar acciones reales como el usuario de servicio `sami`. No abre un puerto
nuevo ni incorpora autenticación propia: su frontera es la cuenta del sistema
desde la que se invoca. Cuando se lanza como root, el wrapper baja privilegios a
`sami`. Los historiales y logs permanecen privados bajo `.atlas/chat/`; no deben
publicarse. `--verbose` registra tipos de eventos, no secretos ni payloads
completos del proveedor.

El acceso exclusivo utiliza permisos efímeros por pestaña y valida el control
en el backend. Esto evita peticiones de otros clientes sin el permiso actual,
pero no identifica a una persona: el primero que llega cuando está libre
obtiene el control. Los permisos viajan por HTTP sin cifrar en esta versión.

Los modos `atlas-screen --terminal` y `atlas-screen --rafas` abren una shell root
física sin pedir una contraseña adicional. RAFAS también se activa con Ctrl y la
secuencia W, O, W en un teclado USB. Son funciones de desarrollo para un equipo
bajo control de su propietario; el atajo no es autenticación. El servicio no
registra pulsaciones ni escucha en la red. La autenticación de RAFAS queda pendiente.

## Aplicación Android y Companion (preview)

La app utiliza un servicio independiente en HTTPS/5010. Cada código de
emparejamiento incluye una clave de administración y un certificado fijado:
**trátalo como una contraseña root del dispositivo**, no lo publiques ni lo
añadas a capturas. `atlas-app unpair` invalida el único móvil emparejado.
No hay roles de invitado en esta preview.

La clave se guarda cifrada con Android Keystore; la copia de seguridad de la
app está desactivada. La huella/credencial se verifica en Android y no se envía
a A1. Cada permiso nativo se valida en Android. La terminal y Accessibility
permiten acciones potentes; el modo visual debe mostrar notificación, borde azul
y un botón local para detenerlo. Las capturas son datos privados y no se publican.
Esto no limita lo que puede hacer el propietario que posee la clave.

La conexión predeterminada viaja por el tailnet privado y conserva, además,
sobres AES-256-GCM con protección de dirección, fecha y repetición. Tailscale y
el emparejamiento de ATLAS son dos capas distintas. No abras 5010 en el router
ni expongas HTTP/5000 como alternativa. El relay antiguo está desactivado por
defecto. El protocolo aún no tiene una auditoría independiente y la APK sigue
siendo un producto personal de desarrollo, no una administración para terceros.

## Reportar un problema

Si encuentras una credencial o dato privado publicado por error, no lo reutilices ni lo difundas. Comunícalo al propietario del repositorio para que pueda revocarlo y retirar el contenido.
