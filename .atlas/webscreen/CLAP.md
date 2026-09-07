# Doble aplauso local

El gesto de doble aplauso es una capa de interfaz de WebScreen: no abre un turno
de Realtime, no ejecuta un comando y no sustituye la wake word. Tras una
calibración guardada, dos aplausos claros mientras ATLAS está **en espera**
muestran la cara `defiant` durante exactamente tres segundos y después vuelve a
la cara neutra. El gesto no puede interrumpir una escucha, una respuesta, la
reproducción de voz ni la interfaz de diagnóstico.

## Calibración

El tab **Doble aplauso** existe tanto en `/` (Debugging Webscreen) como en
`/new/` (New Webscreen), ya que ambos comparten el mismo documento y motor. El
usuario realiza cinco pruebas: pulsa **Registrar prueba** y aplaude dos veces.
Cada prueba tiene una breve medida inicial del ambiente y una ventana limitada
para el par; puede cancelarse o repetirse sin alterar el perfil guardado.

No se abre un segundo `getUserMedia`, `MediaRecorder` ni una conexión Realtime.
`app.js` comparte, solo cuando hace falta, un frame temporal del `AnalyserNode`
que ya usa para el nivel de voz. `clap.js` calcula y descarta inmediatamente:

- RMS, pico y un suelo de ruido ambiente adaptativo;
- proporción de energía de banda alta y planitud espectral, propias de un
  transitorio de aplauso frente a voz sostenida;
- intervalo entre ambos transitorios, con ventana calibrada y período refractario.

El perfil persiste como resumen numérico privado en
`/home/atlas/.atlas/webscreen/clap-profile.json`, con permisos `0600`. Incluye
solo cinco pares de métricas y umbrales derivados; **nunca** PCM, grabaciones,
espectros completos ni texto. Si el archivo está corrupto, el backend lo ignora
de forma segura y el detector permanece desactivado hasta recalibrar.

El detector sigue siendo una heurística calibrada a la sala y al micrófono, no
un clasificador universal. Por eso requiere cinco pares reales, exige dos
transitorios breves con separación válida y combina energía, contenido de alta
frecuencia y ruido de fondo. Si cambia mucho la barra de sonido, el micrófono o
la habitación, se debe usar **Recalibrar**.

## Responsabilidades y límites

- `static/clap.js`: calibración, análisis síncrono de frames y UI; no gestiona
  pistas de audio ni conserva arrays de muestras.
- `static/app.js`: entrega un FFT únicamente durante calibración o cuando el
  perfil ya está activo en el tab ATLAS.
- `server.py`: valida límites estrictos, lee/escribe el resumen de forma
  atómica y protege `GET/POST /api/clap/profile` con la misma lease de control.
- `static/new/face.js`: expone `AtlasFace.clap()` para la transición local y
  limita la expresión desafiante al estado `idle`.

`defiant` comparte los ojos de la cara enfadada aprobada y solo invierte la
curva de la boca hacia una sonrisa sutil, conservando el espaciado de ojos y la
altura de boca actuales. No se ofrece a la tool `atlas_face` de Realtime: por
ahora es una confirmación exclusiva del gesto local.

La señal visual no demuestra aún que un aplauso físico concreto sea reconocido:
después de desplegar hay que calibrar cinco pares desde el A1 y comprobar un
par real, además de probar ruido ambiente y voz para descartar activaciones
accidentales.
