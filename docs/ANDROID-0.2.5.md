# ATLAS Android 0.2.5-preview

Conexión Realtime y persistencia de Android Use:

- La configuración inicial extensa, con herramientas y contexto privado, se
  adjunta a la oferta SDP mediante el POST multipart de creación de la llamada.
  El canal WebRTC queda reservado para eventos pequeños durante la sesión y ya
  no puede fallar al arrancar por `max-message-size`.
- La app acepta `session.created` como confirmación de la configuración inicial
  y conserva compatibilidad con `session.updated` para cambios posteriores.
- El ciclo de vida de voz/chat queda separado del control visual. Terminar un
  turno, renovar Realtime, pasar la Activity a segundo plano o recuperarse de un
  microcorte no ejecuta `androiduse.stop`.
- Android Use sigue deteniéndose ante una orden explícita, el botón rojo del
  usuario o una pérdida terminal del teléfono, Companion o Accesibilidad.
- El puente nativo valida el destino HTTPS y construye el cuerpo multipart con
  tipos `application/sdp` y `application/json`, dejando que OkHttp genere el
  boundary correcto.
