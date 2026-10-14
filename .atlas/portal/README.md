# Portal privado de ATLAS

Servicio ligero en el A1 para `https://atlas.samilososami.com/try/` y
`https://atlas.samilososami.com/chat/`. La web pública de presentación sigue en
Vercel; únicamente estas rutas y `/portal/` se reenvían al gateway de la Pi.

## Arquitectura

Navegador → HTTPS de Vercel → Tailscale Funnel → `127.0.0.1:5020`.

- **`/try/`**: New Webscreen real mediante un proxy autenticado y una lista
  explícita de rutas. La negociación WebRTC y las herramientas usan el Webscreen
  local existente en el puerto 5000. No se expone directamente ese servidor.
- **`/chat/`**: conversación escrita con el modelo Realtime configurado en ATLAS,
  el broker de Codex existente y sus herramientas. SSE para los deltas de texto;
  no se solicita micrófono ni se genera voz. Se reutiliza `AtlasChat` con
  `persist=False`, sin modificar el cliente de terminal.
- `CHAT_INSTRUCTIONS.md` define únicamente la presentación de `/chat`: cifras,
  símbolos y unidades de texto (`48,3 °C`, `25 %`, `16 GB`, `17:26`), Markdown y
  siglas normales. Sustituye las reglas de pronunciación heredadas; no hace
  reemplazos automáticos sobre las respuestas ni altera valores o código.
  `/try` y la voz del Webscreen conservan sus instrucciones originales.
- No hay un servidor Node en la Pi. `marked` y `DOMPurify` se empaquetan durante
  el desarrollo; el servicio Python reutiliza el entorno virtual del Webscreen.

## Acceso y límites

Una única contraseña protege ambas rutas y todas sus API privadas. No está en
HTML, JavaScript, el repositorio ni los argumentos de arranque. Se guarda un hash
scrypt con sal aleatoria en `runtime/config.json` (0600; directorio 0700).
La cookie `__Host-atlas_portal` es Secure, HttpOnly, SameSite=Strict, dura 30 días
y se contrasta con SQLite en el servidor. Cerrar sesión revoca el token y cancela
los chats de esa sesión. Los tokens se almacenan mediante HMAC, no en claro.

Los POST requieren Origin permitido, JSON y un token CSRF. El inicio de sesión
limita cinco intentos por dirección y treinta globales cada quince minutos; el
límite global no depende de confiar en una cabecera de IP. Las respuestas son
`no-store`, tampoco se almacenan en CDN, y llevan `noindex`. Markdown se sanea
antes de insertarlo en el DOM; no se admiten HTML activo ni imágenes remotas
inyectadas en las respuestas del modelo.

La contraseña es la frontera de confianza: **quien la conoce puede usar las
capacidades reales del A1**, no un simulador. No debe compartirse como acceso
público de demostración. La lista de rutas no sustituye esa autorización: el
agente conserva sus herramientas de ATLAS. No se publican las API internas,
credenciales de Wi-Fi, reinicios de historial ni cambios globales de ajustes.

## Sesiones, contexto y almacenamiento

- Historial, nombres, búsqueda e imágenes: IndexedDB del navegador. No se
  sincronizan entre dispositivos. Borrar los datos del sitio elimina ese historial.
- El indicador de cada respuesta distingue conexión/pensamiento/herramientas,
  escritura y finalización. Los avisos aparecen dentro de la respuesta, nunca
  en el formulario del mensaje. Son estados de actividad, no razonamiento interno.
  No se guardan como texto del chat ni se reenvían al modelo. Cambiar de chat
  conserva el estado de la respuesta en curso; al recargar no quedan animaciones
  de tareas antiguas. Se respeta la preferencia de movimiento reducido.
- El portal no guarda mensajes ni imágenes en archivos propios del A1. Para
  inferencia se transmiten a la Pi y al proveedor del modelo. Las herramientas
  existentes de ATLAS conservan sus propios registros operativos habituales.
- Cada chat carga el conocimiento permanente y su propio historial; no carga ni
  escribe el contexto de relleno del Webscreen físico ni de WhatsApp.
- Hasta 60 mensajes, 120000 caracteres y ocho imágenes en una petición; el
  navegador envía un tramo reciente acotado. Conserva el historial completo local.
- Se aceptan JPG, PNG y WebP. El navegador reduce a 1536 px, comprime y valida;
  el servidor verifica el formato, tamaño y límites de píxeles. Máximo cuatro
  adjuntos por mensaje. No se confía únicamente en el tipo MIME enviado.
- Máximo tres chats calientes por sesión y ocho en total. Se cierran tras tres
  minutos inactivos. El broker propio del portal se libera cuando no quedan
  chats; nunca se para el broker de otro servicio.
- El Webscreen dispone de leases separados (máximo tres por sesión y ocho
  globales). Las preferencias de voz y reloj del portal son independientes;
  empieza mostrando la cara. No cambia la configuración de la pantalla física.
- La cuota es la de la cuenta de ATLAS; el contexto se muestra por chat a partir
  del uso comunicado por el modelo, con estimación inicial identificada.
- No se reenvían acciones automáticamente al perder la conexión. Detener corta
  la generación y los siguientes pasos, pero no revierte una acción ya ejecutada.

## Instalación y mantenimiento

Copiar esta carpeta a `/home/atlas/.atlas/portal`, sin `node_modules`, cachés ni
el `runtime` de otra instalación. Requiere Python, aiohttp, Pillow y las
dependencias ya instaladas de AtlasChat/Webscreen. No instalar una segunda
cuenta OAuth ni copiar las credenciales de Codex al navegador.

Crear la configuración una sola vez como el usuario del servicio (`sami`):

```sh
/home/atlas/.atlas/webscreen/.venv/bin/python /home/atlas/.atlas/portal/configure.py
```

Lee la contraseña sin eco. No sobrescribe una configuración existente. Instalar
`system/systemd/atlas-portal.service` en `/etc/systemd/system/` y ejecutar:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now atlas-portal
sudo tailscale funnel --bg --https=443 http://127.0.0.1:5020
```

El puerto está fijado a loopback aunque se edite la configuración. Funnel tiene
HTTPS y continúa activo después de reiniciar. `vercel.json` del repositorio
ATLAS-web contiene las reescrituras y las cabeceras de esas rutas. Las rutas
aceptan ambas formas con y sin barra final para la canonicalización de Vercel.

Tanto un usuario normal como root pueden consultar:

```sh
systemctl status atlas-portal
curl http://127.0.0.1:5020/portal/health
```

Administración: `sudo systemctl restart atlas-portal`; desde root se omite sudo.
El proceso siempre ejecuta como `sami`, no como root. Una actualización de los
estáticos no necesita reiniciar. El código Python sí; realizarla sin turnos activos.
Conservar `runtime/` en las actualizaciones para mantener las sesiones.

Para cambiar la contraseña, generar un nuevo hash mediante `auth.password_hash`
desde una entrada oculta, renovar `session_key`, vaciar las sesiones y reiniciar.
No pasar la contraseña como argumento ni pegarla en documentación o comandos.

### Desactivar / volver atrás

```sh
sudo systemctl disable --now atlas-portal
sudo tailscale funnel --https=443 off
```

Eliminar únicamente las reescrituras/cabeceras del portal de ATLAS-web o promover
el despliegue anterior. Esto no elimina datos, no apaga ATLAS y no afecta a
Webscreen, WhatsApp ni al emparejamiento de la app.

## Desarrollo y verificación

```sh
npm ci --ignore-scripts
npm run build
npm run check
python3 -m unittest -v test_portal.py
```

Las pruebas locales usan un modelo falso explícito y no realizan acciones,
mensajes, grabaciones ni consumo de la cuota. La fábrica falsa no está disponible
desde parámetros HTTP ni desde el arranque del servicio de producción.
Validar además con navegador: contraseña, streaming antes de terminar, imágenes,
Markdown, historial tras recargar, gestión de chats, cancelación, móvil,
WebRTC conectado y cierre compartido. Una comprobación HTTP 200 por sí sola no
demuestra que el modelo o el micrófono estén funcionando.
