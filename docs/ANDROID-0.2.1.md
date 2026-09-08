# ATLAS Android 0.2.1-preview

Actualización de robustez para la conexión con A1, las herramientas nativas del
teléfono y el control visual de Android.

## Novedades

- Mantiene Tailscale como transporte principal y prioriza siempre la ruta privada
  directa. El relay heredado queda reservado para configuraciones que lo hayan
  seleccionado explícitamente, sin degradación automática ante un corte breve.
- Companion procesa las peticiones cifradas de forma concurrente y serializa sus
  respuestas. Una orden puede esperar una herramienta del teléfono mientras el
  mismo WebSocket recibe su `app.reply`, sin bloquear el lector ni duplicar la
  acción después de reconectar.
- `atlas-chat` y WebScreen usan las herramientas tipadas `atlas_phone` y
  `atlas_android`. Las capturas se entregan al modelo como imágenes separadas y
  nunca como cadenas base64 dentro del resultado de herramienta.
- Los aliases de `atlas-app control` normalizan ubicación, capacidades y llamadas;
  `atlas-androiduse` incorpora árbol de accesibilidad, pulsación larga, espera,
  Atrás, Inicio, Recientes y ENTER, además de apertura por paquete o URI.
- Android Use adopta coordenadas normalizadas de `0` a `1`, redacta los campos de
  contraseña y sus descendientes, reintenta una captura cuando Android impone su
  intervalo mínimo y restaura el bloqueo táctil tras cada gesto inyectado.
- En One UI, la guarda táctil se vuelve invisible durante 80 ms antes de inyectar
  un gesto y se restaura al terminar. Así no intercepta el mismo toque o `swipe`
  que debe ejecutar el servicio de accesibilidad.
- Android 13 o superior abre aplicaciones mediante
  `getLaunchIntentSenderForPackage`, sin confundir las restricciones de
  visibilidad de paquetes con una aplicación ausente.
- La sesión visual termina de forma determinista al completar, cancelar, fallar o
  agotar el watchdog, evitando dejar el aura o el control activos.
- Las herramientas nativas aceptan rutas relativas dentro del almacenamiento
  compartido, describen capacidades con mayor granularidad y exponen los IDs y el
  estado editable de los calendarios necesarios para crear eventos correctamente.
- Realtime se prepara al mostrar la aplicación y su indicador refleja el estado
  real de WebRTC. Al pasar a segundo plano se libera la sesión de voz, mientras el
  foreground service conserva el WebSocket privado con A1 para widgets, estado y
  terminal.

## Estado de validación

- Los contratos automatizados de Companion, CLI, `atlas-chat`, WebScreen,
  herramientas nativas y Android Use cubren los cambios anteriores. La tanda final
  superó 492 comprobaciones automatizadas, además de lint y build Android.
- En el S23 Ultra se verificaron el enlace directo con A1 por Tailscale, la RPC
  reentrante, ubicación, sensores, notificaciones, contactos, calendarios,
  archivos y galería. También se comprobó Android Use real con Chrome: apertura,
  captura, árbol, toque, pulsación larga, `swipe`, texto, ENTER, navegación y
  parada, incluida la retirada de la notificación y el aura.
- La sesión Realtime quedó preparada al abrir la aplicación; voz por pulsación y
  chat completaron turnos reales sin el error de fuente de audio. Tras enviar la
  aplicación a segundo plano, el servicio y el enlace con A1 siguieron activos y
  el consumo del proceso cayó al 0,0 % durante la muestra de 35 segundos.
- Por seguridad no se realizaron llamadas ni se enviaron SMS. La cámara se abrió,
  pero no se tomó ninguna foto; el panel Wi-Fi se abrió sin cambiar de red. BLE,
  biometría y esos flujos destructivos o intrusivos quedan fuera de esta tanda.
