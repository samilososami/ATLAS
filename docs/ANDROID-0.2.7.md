# ATLAS Android 0.2.7-preview

Validación física y acabado del indicador:

- Sustituye el icono de preparación Realtime por el glifo grueso y redondeado de
  dos flechas circulares elegido para ATLAS, conservando el giro mientras conecta.
- Incluye la suspensión completa del renderer, WebRTC, audio, animaciones y
  temporizadores introducida en 0.2.6, manteniendo el enlace ligero con A1.
- Mantiene la continuación automática con Android Use en peticiones compuestas
  que comienzan abriendo una aplicación mediante su API nativa.
- Mantiene temporalmente activo el runtime al salir a otra aplicación durante
  una tarea compuesta y lo vuelve a aparcar al terminar.
- Evita el bucle de reconexión cuando OpenAI acepta la llamada y abre el canal
  WebRTC pero omite puntualmente el evento `session.created`.

## Validación física

- Instalada en un Samsung Galaxy S23 Ultra como `0.2.7-preview` (versionCode 21).
- La orden «abre Amazon y busca ESP32» abrió Amazon Shopping, pulsó el buscador,
  escribió `ESP32`, confirmó y dejó la lista real de resultados visible.
- Con la app en segundo plano, ocho muestras consecutivas del proceso marcaron
  `0.0 %` de CPU; el enlace ligero con A1 siguió conectado.
