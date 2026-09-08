# ATLAS Android 0.2.2-preview

Actualización centrada en la eficacia del control del teléfono.

## Novedades

- `apps.launch` abre una aplicación por nombre humano mediante una única llamada
  nativa. Incluye aliases deterministas para Galería, Fotos, Cámara, Ajustes,
  Chrome, Spotify, YouTube y Maps, además de resolución por etiquetas instaladas.
- Abrir una aplicación ya no inicia Accessibility, recorre el launcher, calcula
  coordenadas ni envía capturas innecesarias al modelo.
- La orden explícita «controla mi teléfono» mantiene Android Use activo para los
  mensajes siguientes. El botón rojo, una orden de parada, el cierre del cliente
  o diez minutos sin actividad siguen terminando la sesión.
- Las coordenadas normalizadas se conservan para interacciones dentro de las
  aplicaciones, donde sí son necesarias.
- Una captura de comprobación tardía o perdida ya no convierte en fallo una
  acción que Android había completado. Las capturas usan un timeout corto y se
  pueden volver a solicitar sin repetir la acción anterior.
- Realtime evita narrar cada paso intermedio: ejecuta la cadena mínima y responde
  solo con el resultado o el bloqueo concreto.

## Validación

- Contratos unitarios de herramientas nativas, Android Use, WebScreen y
  `atlas-chat`.
- Compilación Android y lint sin errores.
- La prueba física se realizará sobre el S23U tras instalar esta preview; no se
  atribuye a la APK nueva el flujo observado con la versión anterior.
