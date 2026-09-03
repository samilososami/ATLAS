# Dónde alojar el relay de ATLAS

Un dominio aporta una dirección, no un servidor. Se puede reservar un subdominio
como `relay.example.com` sin cambiar la web del dominio principal. No se debe
publicar WebScreen (5000), SSH ni el código de emparejamiento.

El relay incluido usa Python/aiohttp y mantiene en memoria las conexiones
activas de una Pi y sus móviles. Hace falta **una instancia compartida**, no
funciones independientes que reciban cada extremo en procesos distintos.
La Pi abre la conexión hacia fuera: no es necesario abrir puertos en casa.

## Opción recomendada: Cloudflare Workers Free

Revisión de documentación oficial: 3 de septiembre de 2026.

[Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)
está disponible en el plan Free con almacenamiento SQLite. Su API de
[hibernación WebSocket](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
mantiene conectados el móvil y la Pi mientras el proceso duerme, evitando pagar
duración durante la inactividad. El límite gratuito actual es 100.000 peticiones
al día y 13.000 GB-s diarios; es holgado para un A1 personal, no una garantía de
servicio ni de que el plan permanezca igual.

El repositorio ya incluye el Worker en `.atlas/relay-cloudflare`. Usa un único
Durable Object para conservar la compatibilidad con el protocolo existente: la
Pi y la app siguen enviando el `room` en su primer mensaje. Cloudflare solo ve
identificadores de ruta, tamaños, tiempos y cajas cifradas; no posee la clave
AES extremo a extremo.

El dominio `samilososami.com` ya usa DNS de Cloudflare. Al desplegar,
[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
creará `relay.samilososami.com` y su certificado TLS automáticamente. Seguir la
[guía de despliegue](../.atlas/relay-cloudflare/README.md). No publicar el secreto
`ATLAS_RELAY_DEVICES`, el código `atlas1:` ni WebScreen.

## Alternativa gratuita para pruebas: Render

[Render Free](https://render.com/docs/free) admite dominio propio, TLS gestionado
y una sola instancia compatible con el relay Python. Desde febrero de 2026, los
mensajes WebSocket entrantes evitan que duerma; sin tráfico durante 15 minutos
se apaga y el arranque puede rondar un minuto. También puede reiniciarse y su
disco es efímero. Sigue siendo una alternativa, pero Cloudflare encaja mejor con
el DNS actual y la hibernación de conexiones.

## Vercel

Vercel admite WebSockets, pero las Functions conservan una duración máxima y
sus instancias no deben usar memoria local como estado compartido. Haría falta
añadir Redis u otro coordinador externo para emparejar ambos sockets. Para este
relay es más complejo y menos natural que un Durable Object con hibernación.

## VPS propio

Es la opción más directa para una instancia persistente: servicio Python como
usuario sin privilegios, `devices.json` privado y proxy TLS en 443. Con
[Caddy](https://caddyserver.com/docs/automatic-https), el DNS público apuntando al
servidor y los puertos requeridos disponibles, los certificados se gestionan
automáticamente. Seguir la [guía de Companion](../.atlas/companion/README.md).

En todas las opciones el código/protocolo siguen siendo de ATLAS, sin Tailscale.
El alojamiento gratuito externo sí implica depender de ese proveedor; se puede
migrar después al VPS propio sin sustituir el sistema por una VPN propietaria.
