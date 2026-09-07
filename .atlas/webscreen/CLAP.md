# Doble aplauso local

El gesto de doble aplauso es una capa de interfaz de WebScreen: no abre un turno
de Realtime, no ejecuta un comando y no sustituye la wake word. Tras una
calibración guardada, dos aplausos claros mientras ATLAS está **en espera**
muestran la cara `defiant` durante exactamente tres segundos y después vuelve
con una transición corta a la cara neutra. El gesto no puede interrumpir una escucha, una respuesta, la
reproducción de voz ni la interfaz de diagnóstico.

## Calibración

El tab **Doble aplauso** existe tanto en `/` (Debugging Webscreen) como en
`/new/` (New Webscreen), ya que ambos comparten el mismo documento y motor. El
usuario realiza cinco pruebas: pulsa **Registrar prueba** y aplaude dos veces.
Cada prueba tiene una breve medida inicial del ambiente y una ventana limitada
para el par; puede cancelarse o repetirse sin alterar el perfil guardado.

Mientras ATLAS está esperando, `app.js` comparte, solo cuando hace falta, un
frame temporal del `AnalyserNode` que ya usa para el nivel de voz. Al abrir el
tab de calibración la sesión Realtime se detiene deliberadamente; al pulsar
**Empezar calibración**, WebScreen abre entonces un único stream local temporal
con el permiso de Chrome ya concedido. No muestra un segundo diálogo ni hay dos
capturas simultáneas. Ese stream se cierra al salir del tab y no existe
`MediaRecorder` ni grabación. `clap.js` calcula y descarta inmediatamente:

- RMS, pico, ataque y un suelo de ruido ambiente adaptativo;
- proporción de energía de banda alta, centroide, planitud espectral y factor de
  cresta, propios de un impacto breve frente a voz o tos;
- envolvente completa de cada impacto: ataque, caída y al menos 75 ms de vuelta
  al silencio; un mismo aplauso y su cola solo cuentan como un evento;
- intervalo y similitud de nivel, duración y espectro entre dos eventos
  independientes, además de un período refractario tras el par.

El perfil persiste como resumen numérico privado en
`/home/atlas/.atlas/webscreen/clap-profile.json`, con permisos `0600`. Incluye
solo cinco pares de métricas y umbrales derivados; **nunca** PCM, grabaciones,
espectros completos ni texto. Si el archivo está corrupto, el backend lo ignora
de forma segura y el detector permanece desactivado hasta recalibrar.

El perfil actual es la versión 2. Los perfiles anteriores se ignoran de forma
segura porque no contienen las medidas necesarias: tras instalar esta revisión
hay que usar **Recalibrar** y completar cinco pares nuevos. El detector sigue
siendo una heurística calibrada a la sala y al micrófono, no un clasificador
universal. Por eso exige exactamente dos impactos completos, breves, parecidos y
separados entre 280 y 950 ms. Una tos sostenida se descarta por duración y
envolvente; un eco aislado, por no formar un segundo impacto comparable. Si
cambia mucho el micrófono o la habitación, se debe recalibrar.

## Responsabilidades y límites

- `static/clap.js`: calibración, análisis síncrono de frames y UI; no gestiona
  pistas de audio ni conserva arrays de muestras.
- `static/app.js`: entrega un FFT únicamente durante calibración o cuando el
  perfil ya está activo en el tab ATLAS; abre y libera la captura local efímera
  de calibración con el permiso previamente otorgado.
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
