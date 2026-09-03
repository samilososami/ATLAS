# Dónde alojar el relay de ATLAS

Un dominio aporta una dirección, no un servidor. Se puede reservar un subdominio
como `relay.example.com` sin cambiar la web del dominio principal. No se debe
publicar WebScreen (5000), SSH ni el código de emparejamiento.

El relay incluido usa Python/aiohttp y mantiene en memoria las conexiones
activas de una Pi y sus móviles. Hace falta **una instancia compartida**, no
funciones independientes que reciban cada extremo en procesos distintos.
La Pi abre la conexión hacia fuera: no es necesario abrir puertos en casa.

## Opción gratuita para pruebas: Render

Revisión de documentación oficial: 3 de septiembre de 2026.

[Render Free](https://render.com/docs/free) admite dominio propio y certificados
TLS gestionados. Ofrece 750 horas de instancia al mes por workspace. El servicio
duerme tras 15 minutos sin tráfico entrante y despertarlo puede tardar alrededor
de un minuto; también puede reiniciarse. Hay límites de transferencia y builds.
Sin método de pago, agotar ciertas cuotas suspende el servicio o nuevos builds.
No es una garantía de disponibilidad permanente ni de gratuidad fuera de cuota.

[Sus WebSockets](https://render.com/docs/websocket) no tienen un tiempo máximo
fijo mientras siga viva la instancia. Los reinicios cortan las conexiones;
ATLAS debe reconectar, sin repetir comandos cuyo resultado sea incierto.

Preparación, **todavía no desplegada**:

1. Crear una cuenta y un Web Service **Free**, de una sola instancia, para el relay.
2. Adaptar su arranque a `0.0.0.0` y al `PORT` suministrado por Render. El relay
   del repositorio aún usa `127.0.0.1:8444`, apropiado para un VPS con proxy local;
   no basta con desplegarlo sin este ajuste.
3. Instalar aiohttp y suministrar `devices.json` como archivo secreto, fuera de
   Git. Se obtiene con `atlas-app relay-credentials`; no subir la clave AES ni
   el código `atlas1:`. Conservar las credenciales fuera del disco efímero.
4. Primero probar la URL `onrender.com`; después asociar el subdominio elegido
   y crear solo el registro DNS que indique Render. Esperar al TLS válido.
5. En la Pi, `atlas-app relay wss://SUBDOMINIO/connect`, `atlas-app restart` y
   volver a emparejar desde `atlas-app pair` para actualizar la URL del móvil.
6. Probar con el móvil en datos: estado, shell, cortes/reconexión y devolución
   del control a A1. No dar por verificado Internet por una prueba en Wi-Fi.

## Vercel

[Vercel Functions ya admite WebSockets](https://vercel.com/docs/functions/websockets)
en beta. Sin embargo, las conexiones terminan al llegar a la duración máxima de
la función y no hay garantía de que dos conexiones aterricen en la misma
instancia. Su documentación pide almacenamiento/pub-sub externo para coordinar
presencia y salas. Por ello **el relay actual no se puede subir sin adaptación**:
necesitaría coordinación externa y recuperación de conexiones. No se afirma que
Vercel carezca de soporte WebSocket.

## VPS propio

Es la opción más directa para una instancia persistente: servicio Python como
usuario sin privilegios, `devices.json` privado y proxy TLS en 443. Con
[Caddy](https://caddyserver.com/docs/automatic-https), el DNS público apuntando al
servidor y los puertos requeridos disponibles, los certificados se gestionan
automáticamente. Seguir la [guía de Companion](../.atlas/companion/README.md).

En todas las opciones el código/protocolo siguen siendo de ATLAS, sin Tailscale.
El alojamiento gratuito externo sí implica depender de ese proveedor; se puede
migrar después al VPS propio sin sustituir el sistema por una VPN propietaria.
