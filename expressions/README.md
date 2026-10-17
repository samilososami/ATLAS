# Expresiones de ATLAS

Biblioteca de **323 expresiones: 23 existentes conservadas y dos colecciones de 150**. Cada
entrada combina una pose, una intención concreta, una transición de entrada y
otra de salida. No son 150 colores distintos ni nombres nuevos para el mismo
dibujo.

## Identidad visual

La cara neutral se conserva exactamente: ojos azules en sus posiciones y
dimensiones originales, sonrisa con trazo de 26 unidades, misma escala y mismo
degradado. Las expresiones nuevas recortan los párpados dentro de los alojamientos
originales de 112 × 208; no ensanchan ni engordan los ojos. Todas las bocas nuevas
en reposo mantienen el trazo de 26. Las 23 expresiones anteriores retienen su
geometría propia, incluidas las que históricamente tenían un trazo distinto.

Las cejas y la diadema tienen el mismo trazo de 26 unidades que la boca; las
almohadillas de los cascos son sólidas y no se superponen a los ojos. Las cejas
mantienen separación incluso con los ojos abiertos. En las poses con cascos se
omiten las cejas para que no atraviesen la diadema. Cascos, televisión, altavoz y otros motivos aparecen
solo en expresiones cuyo contexto los justifica. No se dibujan sobre la pantalla
de escucha, las presentaciones de conexión o el reloj.

## Organización

- `gallery.html`: índice visual con búsqueda y filtros; puede abrirse sin conexión.
- `build_gallery.cjs`: reconstruye el índice a partir del catálogo y los PNG disponibles.
- `test_gallery.cjs`: comprueba búsqueda, filtros, vista móvil y transición real de ida/vuelta.
- `verify_assets.cjs`: comprueba cobertura, formato PNG, ausencia de duplicados y hashes de todas las imágenes.
- `build_catalog.cjs`: definiciones editables, escritas por expresión, y generador.
- `catalog_additions.cjs`: las 150 nuevas definiciones de la segunda colección.
- `catalog.json`: catálogo completo para herramientas, documentación y pruebas.
- `references/`: referencias conceptuales generadas, separadas del resultado real.
- `concepts/headphones-solid-v2.png`: referencia de corrección de los cascos;
  no sustituye a la captura del SVG.
- `renders/`: capturas del WebScreen; la publicación y su manifiesto de capturas
  se realizan con la herramienta de captura de este repositorio.
- `../.atlas/webscreen/static/new/expressions-catalog.js`: copia de navegador,
  generada sin peticiones por expresión y con geometría de ojos deduplicada.
- `../.atlas/webscreen/static/new/expressions-catalog.json`: copia de despliegue
  para los consumidores del backend, idéntica al JSON principal.

Los conceptos no son pruebas de funcionamiento ni sustituyen a las capturas del
WebScreen. La geometría publicada en el catálogo es la que dibuja la interfaz.

## Familias

Cada familia añade 10 expresiones. Los IDs y sus desencadenantes exactos están en
`catalog.json`; ninguna familia se selecciona al azar.

| Familia | Uso |
| --- | --- |
| `welcome` | Saludos, reencuentros y despedidas |
| `warmth` | Agradecimiento, ánimo y cercanía |
| `humor` | Ironía, complicidad y bromas suaves |
| `confidence` | Determinación y retos |
| `focus` | Leer, comprobar, calcular y depurar |
| `curiosity` | Interés, descubrimiento y preguntas |
| `uncertainty` | Dudas y aclaraciones breves |
| `care` | Tacto, preocupación y apoyo |
| `disappointment` | Fallos, decepción y recuperación |
| `boundaries` | Réplicas y límites sin agresividad |
| `energy` | Serenidad, descanso y cansancio expresivo |
| `celebration` | Resultados realmente completados |
| `music` | Cascos y reacciones a música activa |
| `devices` | TV, transmisión, altavoces y teléfono |
| `assistance` | Búsqueda, explicación y entrega de tareas |

La segunda colección añade otras 15 familias: confirmación, escucha atenta,
aclaraciones, razonamiento, diagnóstico, aprendizaje, narración, complicidad,
apoyo emocional, creación, investigación, ritmo pausado, reparación de errores,
momentos audiovisuales y ayuda cotidiana. Las 300 poses añadidas son distintas
geométricamente; comparten siete gestos base coherentes, no 300 coreografías
completamente diferentes. Cada entrada especifica su intención y su ida/vuelta.

## Movimiento y conversación

Las entradas duran entre 180 y 240 ms; las salidas vuelven suavemente a neutral.
Los ojos de las nuevas poses interpolan su geometría cuando sus trazos son
compatibles; los cambios incompatibles y las caras anteriores se funden. La
sonrisa mantiene continuidad por fundido y cada boca conserva su afecto al
articular. Hay gestos breves de inclinación, asentimiento o elevación de unos
pocos píxeles, de 400–560 ms e independientes del fundido, siempre de una sola
ejecución. No hay un bucle de expresiones
automáticas en reposo.

La política autónoma admite **como máximo 2 cambios por respuesta**, con 2,5 s
entre selecciones y una permanencia mínima de 1,8 s. Una selección repetida no
reinicia ni prolonga su vida indefinidamente. Neutral es el estado habitual; un
catálogo grande no obliga a usar una expresión por frase. La caducidad devuelve
la cara a neutral sin consumir una llamada del modelo.

Las poses conversacionales esperan el inicio **real** de la reproducción para
contar su duración. La espera está limitada a 45 s si la voz nunca llega. Los
huecos entre fragmentos no reinician el contador ni borran la expresión; al
terminar la respuesta completa se vuelve suavemente a neutral. El segundo cambio
puede llegar tras una herramienta real, pero una continuación que solo cambió
la cara no vuelve a habilitar la herramienta visual: así se evitan bucles.

Existe además un respaldo local pequeño para frases personales inequívocas de
elogio, logro propio, mal día o reto compartido. Se evalúa una sola vez al empezar
la reproducción real, sobre el texto confirmado del usuario: no sobre respuestas,
páginas, herramientas, citas, títulos o palabras sueltas. Si el modelo ya eligió
una cara, o hay una orden/evento activo, no interviene. Queda registrado como
`face.conversation_cue`, no como una llamada inventada del modelo. No usa otro
modelo ni retrasa la voz; tampoco pretende reconocer todas las emociones del
lenguaje abierto. Una elección posterior del modelo tiene prioridad, sin pasar
por neutral, y sigue contando dentro del máximo de dos cambios visibles.

Las órdenes explícitas y las capturas usan `source: "command"`, sin ese límite
cosmético. Acariciar y el doble aplauso conservan su prioridad local. Las
expresiones no abren micrófonos, no envían herramientas y no prueban que se haya
completado una acción: los motivos de dispositivo requieren confirmación del
controlador correspondiente.

La preferencia de movimiento reducido elimina los gestos, manteniendo la pose y
su duración. Una pestaña oculta cancela animación, fotogramas y temporizadores de
presentación. La voz, el reconocimiento y los permisos siguen perteneciendo a
sus controladores originales.

## API de presentación

```js
AtlasFace.beginResponse("id-del-turno");
AtlasFace.expression({ expression: "intrigued", source: "model", durationMs: 6000, awaitSpeech: true });
AtlasFace.expressionPlayback({ active: true }); // inicio real, una sola vez
AtlasFace.expressionPlayback({ active: false, final: true }); // fin del turno completo
AtlasFace.expression({ expression: "music_headphones", source: "event", durationMs: 9000 });
AtlasFace.listExpressions(); // 323 IDs
AtlasFace.snapshot(); // expresión, origen, familia, intensidad, accesorio y estado
AtlasFace.clearAutonomous(); // cancela el turno sin anular una orden manual
```

`source: "event"` tiene los mismos límites que el modelo. Un evento musical debe
proceder de una reproducción confirmada, no de que la respuesta contenga la
palabra «Spotify». `clearAutonomous()` evita que el límite de cambios bloquee la
cancelación de una respuesta. `reset()` es el reinicio completo de presentación.

## Regenerar y comprobar

Desde la raíz del repositorio, como `kali` o cualquier usuario con Node.js:

```sh
node expressions/build_catalog.cjs
node --test .atlas/webscreen/test_expression_catalog.cjs
node --test .atlas/webscreen/test_face_idle.cjs .atlas/webscreen/test_face_audio.cjs .atlas/webscreen/test_face_events.cjs .atlas/webscreen/test_face_petting.cjs
node --test .atlas/webscreen/test_conversation_expression_cues.cjs .atlas/webscreen/test_expression_playback.cjs
node expressions/audit_conversation_cues.cjs
```

Para regenerar las **323 capturas del motor real** se necesita Playwright y
Chromium. `ATLAS_CHROME` permite indicar el ejecutable de Chromium:

```sh
node .atlas/webscreen/capture_face_expressions.cjs --catalog
node expressions/build_gallery.cjs
node expressions/test_visual_contract.cjs
node expressions/capture_review_sheets.cjs
node .atlas/webscreen/capture_face_expressions.cjs --serve --catalog
```

La última orden sirve `http://127.0.0.1:5059/expressions/`: permite pulsar una
tarjeta para ver su entrada, articulación disponible y vuelta a neutral. No
conecta con el modelo ni abre el micrófono. El servidor escucha únicamente en
loopback; se detiene con Ctrl+C. Con él abierto, `node expressions/test_gallery.cjs`
ejecuta las comprobaciones de navegador. Abrir `gallery.html` directamente también
funciona, pero solo presenta las imágenes estáticas.

`renders/manifest.json` identifica cada captura con su SHA-256. Las referencias
IA llevan su propio manifiesto y no se cargan en el WebScreen: la interfaz usa
vectores, sin descargar cientos de PNG ni cambiar las proporciones de la cara.
`node expressions/verify_assets.cjs` verifica las 323 capturas y las 150
referencias históricas sin abrir navegador ni llamar a un proveedor. No afirma
que haya una referencia IA individual para cada pose de la segunda colección.

El informe de esta revisión y sus límites está en
[`20261017-expression-review.md`](../docs/agent-work/20261017-expression-review.md).
La primera entrega se conserva en
[`20261016-personality-release.md`](../docs/agent-work/20261016-personality-release.md).

Las pruebas verifican recuento, unicidad geométrica, copia de despliegue, igualdad
de las 23 poses existentes, dimensiones, articulación de las 323 bocas,
transiciones de retorno, límites de selección y limpieza de recursos. El
análisis de imágenes y la percepción humana del ritmo son comprobaciones
distintas: ver una pose en una captura no demuestra que su selección durante una
conversación sea adecuada.
