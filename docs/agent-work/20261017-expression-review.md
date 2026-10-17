# Revisión de expresiones y batería aislada · 17 de octubre de 2026

## Entrega visual

El catálogo contiene **323 expresiones**: 23 anteriores conservadas, 150 de la
primera colección revisadas y 150 nuevas. Las 300 poses añadidas tienen geometría
distinta. Sus entradas y salidas comparten siete gestos base; no se presentan
como 300 coreografías independientes.

- Cascos con almohadillas sólidas y diadema de 26 unidades, igual que la sonrisa.
- Cejas de 26 unidades, separadas de los ojos. Las poses con cascos no llevan
  cejas que puedan cruzarse con la diadema.
- Accesorios de dispositivos redibujados con una escala coherente y separados
  de la boca. La cara neutral, sus alojamientos y las 23 poses originales no se
  rediseñaron.
- El gesto breve ya no se corta al terminar el fundido: el cambio de pose dura
  220 ms y el gesto puede terminar después, en su propio temporizador.
- No se eligen expresiones aleatorias en reposo. Se mantiene el límite de dos
  cambios por respuesta, con separación temporal y retorno suave.

Se inspeccionaron las 323 capturas reales mediante 17 hojas de contacto. Esa
revisión detectó, entre otras cosas, cejas fundidas con la diadema en
`music_one_ear` y `music_attention_split`; se corrigieron y se recapturó todo el
catálogo. Una imagen conceptual generada ayudó a corregir los cascos, pero los
PNG definitivos proceden del SVG real, no de un generador de imágenes.

Galería: [323 expresiones](../../expressions/gallery.html).
Capturas y huellas: [manifiesto](../../expressions/renders/manifest.json).
Revisión conjunta: [hojas de contacto](../../expressions/qa/contact-sheets/manifest.json).

## Conversación y reproducción

Antes, la duración de una cara podía agotarse mientras se preparaba la voz.
Ahora una selección del modelo espera el inicio real de reproducción para
contar su duración; esa espera tiene un límite de 45 s. Los silencios entre
fragmentos no borran la pose ni reinician su duración. Al terminar el turno
completo, incluida su cola de audio y continuaciones de herramientas, vuelve
suavemente a neutral.

Una misma pose procedente de un evento confirmado puede transferirse a la
respuesta hablada sin repintarse. Una orden manual, dormir o un evento temporal
mantienen su duración independiente. Una continuación exclusivamente cosmética
no permite encadenar llamadas de cara sin fin; una continuación con una tarea
real puede elegir una segunda expresión.

Las pruebas también detectaron que el modelo a veces omitía un gesto pese a
entender el tono. Una sonda de instrucciones más explícitas no lo resolvió y no
se desplegó esa política candidata. Se añadió un respaldo local conservador para
cuatro casos claros: elogio, logro propio, mal día y reto compartido. Solo lee la
entrada confirmada del turno al comenzar audio real; rechaza citas, texto
reportado, negaciones, correcciones y órdenes visuales. No analiza las respuestas
ni las herramientas, no utiliza otro modelo y no retrasa la voz. El modelo y
las órdenes/eventos existentes tienen prioridad. El respaldo y cualquier cambio
posterior del modelo comparten el máximo de dos cambios visibles.

La auditoría offline encontró tres señales en el banco de 400, y las seis
afectivas de la sonda sin activar sus tres controles factuales. Esto comprueba
las reglas sobre esos textos, **no** una mejora retroactiva del benchmark ni
comprensión emocional general. Evidencia:
[auditoría local](../../expressions/qa/conversation-cue-audit.json).

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Suite JavaScript de WebScreen | 527/527 correctas |
| Suite Python de WebScreen | 168/168 correctas |
| Despliegue aislado, root y usuario normal vía sudo | 6/6 correctas |
| Capturas reales, sin duplicados y con SHA-256 | 323/323 |
| Poses y articulación en Chromium, 1591×989 | 323 poses y 323 bocas |
| Poses y articulación en Chromium, 1024×600 | 323 poses y 323 bocas |
| Galería: filtros, selección, retorno y móvil | Correcto |
| Consola del navegador en las pruebas visuales | Sin errores |

La prueba de navegador bloquea micrófono, reproducción de audio y peticiones a
proveedores. Comprueba geometría, rellenos, trazos, límites de pantalla, distancia
entre accesorios y boca, gesto activo después del fundido y un ciclo sintético
de inicio/final de voz. No sustituye una conversación audible en el hardware.

Evidencia: [contrato visual](../../expressions/qa/visual-contract-results.json)
y [galería](../../expressions/qa/gallery-results.json).

## Batería de 400 preguntas

Se ejecutaron **400 preguntas nuevas**, sin duplicados normalizados respecto a
las 400 anteriores, con grupos encadenados y pruebas de sistema, audio, Spotify,
pantalla, móvil, Android, rutinas, archivos, razonamiento y errores. Se utilizó
el modelo real y el contexto permanente, pero ninguna herramienta del modelo
ejecutó comandos reales: todas modificaron únicamente un estado virtual.

La primera ejecución completa terminó con 400 respuestas y sin errores del
proveedor. Su mediana hasta el primer fragmento de texto fue **1,361 s**, p90
**2,698 s** y p95 **3,456 s**. Esto **no mide tiempo hasta la primera palabra
audible**, reconocimiento, síntesis ni altavoces, ni permite atribuir una mejora
frente a una batería de preguntas distinta.

La media original de comprobaciones automáticas fue **9,60/10**. No es una nota
humana de calidad: 37 casos solo tenían comprobaciones de respuesta/seguridad y
33 encontraron alguna limitación del simulador, a veces recuperable. Las
respuestas originales se conservan; los defectos del banco y los fallos de
ATLAS se clasifican por separado, sin convertir un resultado de simulación en
prueba de que los aparatos físicos funcionan.

Banco y metodología: [interacciones 20261017](../../benchmarks/20261017-interactions/README.md).
Resultados y límites: [informe](../../benchmarks/20261017-interactions/results/INFORME.md).
Preguntas, respuestas y tiempos: [tabla de 400](../../benchmarks/20261017-interactions/results/TABLA-400.md).

## Despliegue y límites

Se instaló en el A1 mediante `system/deploy-expression-update.sh --catalog-only`:
solo nueve archivos, sin modificar broker, credenciales, conversaciones,
personalidad privada ni otros servicios. Se reinició únicamente WebScreen.
Las nueve huellas locales/remotas coincidieron; `atlas-face list --json` anunció
323 expresiones tanto como `sami` como root, `/new/` devolvió HTTP 200 y el
servicio quedó activo. La pantalla física siguió apagada, en modo seleccionado
`atlas-hide`, sin superficie activa; no se encendió televisión ni se reprodujo
música o voz.

Respaldo previo de runtime:
`/home/atlas/.atlas/backups/expression-update-20261017.gUjxBD` (antes de la
primera instalación) y
`/home/atlas/.atlas/backups/expression-update-20261017.bDDbof` (antes de la
versión final con respaldo expresivo local). Tras esta última se repitieron las
nueve comparaciones SHA-256, el listado de 323 como usuario y root, HTTP 200 y
la comprobación de pantalla apagada.
Las pestañas abiertas necesitan recargarse para incorporar los nuevos scripts.

La selección espontánea sigue teniendo límites: el respaldo cubre cuatro
familias claras, no cualquier emoción o formulación. La corrección del dibujo,
del ciclo de audio y de esos casos concretos no prueba que todas las elecciones
semánticas sean perfectas. La naturalidad durante una conversación real queda
pendiente de la valoración del usuario; esta entrega no emitió voz física.
