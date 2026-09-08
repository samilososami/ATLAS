# ATLAS Android 0.2.4-preview

Actualización de fiabilidad, precisión y latencia del control del teléfono:

- `apps.launch` conserva una sola operación nativa y separa explícitamente
  Amazon Shopping (`com.amazon.mShop.android.shopping`) de Amazon Alexa
  (`com.amazon.dee.app`).
- `location.get` añade la dirección completa en `formattedAddress` y sus campos
  estructurados cuando Android puede resolver las coordenadas. Si no puede, se
  devuelve el error de geocoding sin inventar una dirección.
- Android Use añade `androiduse.click`, que busca texto o descripción accesible
  exacta y pulsa el nodo o su ancestro clicable antes de recurrir a coordenadas.
- Las capturas se reducen a un máximo de 640 px de ancho, se codifican como JPEG
  calidad 82 y se adjuntan al modelo mediante su MIME real, sin base64 en el
  resultado público. El backend conserva compatibilidad con PNG anteriores.
- Un fallo recuperable de acción o inspección mantiene la sesión visual para
  corregirlo. La sesión termina al completar o abandonar la tarea, cancelar,
  vencer el watchdog o perder el dispositivo, socket o servicio de Accesibilidad.
- Companion usa el endpoint privado Tailscale `100.x`; en la misma LAN prioriza
  la ruta P2P directa y conserva DERP cifrado como fallback válido. Nunca activa
  automáticamente el relay legacy de Cloudflare.
- «Controla mi teléfono» mantiene el contrato introducido en 0.2.3: un solo
  `androiduse.start`, respuesta `Listo` y ninguna inspección no solicitada.
