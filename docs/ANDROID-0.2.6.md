# ATLAS Android 0.2.6-preview

Rendimiento y continuidad de Android Use:

- Al ocultar ATLAS, la app cierra Realtime, detiene wake word y captura nativa,
  pausa los temporizadores del WebView y deja su renderer como reclamable. El
  foreground service conserva únicamente el WebSocket cifrado con A1.
- Al volver a primer plano, el renderer se reactiva antes de precargar una nueva
  sesión Realtime. La terminal persistente y Android Use siguen siendo sesiones
  independientes y no se destruyen por este ciclo.
- El heartbeat cifrado de aplicación pasa de 20 a 60 segundos; el ping WebSocket
  de transporte mantiene detección de cortes cada 30 segundos sin duplicar el
  trabajo anterior.
- El estado «conectando» muestra dos flechas circulares y conserva su animación
  de giro.
- Una apertura nativa dentro de una petición compuesta inicia automáticamente
  Android Use y entrega al modelo el árbol y una captura. Abrir Amazon ya no se
  considera éxito si el usuario también pidió buscar, escribir o pulsar algo.
