# ATLAS: expresiones, conversación y continuidad

Fecha: 16 de octubre de 2026. Alcance: ATLAS normal, especialmente el nuevo
WebScreen. WhatsApp Guardian y Sami absent conservan sus identidades y sesiones.
No se cambia el modelo Realtime, la cuenta, las credenciales ni la voz elegida.

## Implementación

- 150 expresiones nuevas y 23 anteriores conservadas: 173 poses con identificador,
  intención, familia, intensidad, entrada y salida. El catálogo canónico y las
  capturas reales están en `expressions/`.
- La cara neutral mantiene su geometría. Las nuevas bocas mantienen el trazo de
  26 unidades y los ojos permanecen dentro de los alojamientos originales.
  Párpados, cejas y accesorios aportan variedad sin escalar toda la cara.
- Transiciones de 180–240 ms, retorno a neutral y gestos discretos de una sola
  ejecución. Las 173 bocas conservan articulación mientras hablan.
- Selección autónoma opcional: máximo 2 cambios por respuesta, separación mínima
  de 2,5 s y permanencia mínima de 1,8 s. Repetir la misma selección no reinicia
  indefinidamente su duración. Neutral sigue siendo lo habitual.
- Los motivos de Spotify, TV y audio se disparan desde resultados de comandos
  exitosos, no desde palabras en una respuesta. Un error, cancelación o comando
  compuesto no se interpreta como éxito. Las órdenes manuales de `atlas-face`
  no están limitadas por el presupuesto cosmético de una conversación.
- Voz del navegador: preferencia por español de España, selección explícita
  respetada, puntuación íntegra y variaciones pequeñas de ritmo y tono por frase.
  El volumen no oscila artificialmente. ElevenLabs conserva Flash v2.5 y su
  streaming, con parámetros naturales moderados. El ajuste es reversible.
- Instrucciones más directas: resultados antes que preámbulos, respuestas breves
  por defecto, humor contextual y aclaraciones sin discursos. No se truncan
  respuestas a un máximo fijo: seguridad, precisión y explicaciones solicitadas
  siguen teniendo espacio.
- Continuación durante 3 s después del **fin real de la reproducción**. Si la voz
  del usuario empieza dentro de ese plazo, puede terminar su frase sin wake word.
  No son 3 s desde `response.done`, ni un límite de 3 s para hablar. Silencio,
  cancelación, ocultación, desconexión y clientes de texto cierran la admisión.

## Evidencia de comprobación

Las comprobaciones automatizadas también se ejecutaron en una exportación limpia
del árbol preparado para Git, no solo sobre el directorio de trabajo con archivos
locales adicionales.

| Comprobación | Resultado observado | Qué no demuestra |
| --- | --- | --- |
| Pruebas JavaScript de WebScreen | 415 correctas | Calidad perceptual del diálogo o del audio |
| Pruebas Python de WebScreen | 167 correctas | Funcionamiento de todos los periféricos físicos |
| Pruebas de compatibilidad de atlas-chat | 28 correctas | Evaluación del estilo de WhatsApp |
| Fixture del instalador WebScreen | 1 correcta | Instalación desde cero en cualquier distribución |
| Chromium: articulación de las 173 expresiones | 173 comprobadas, sin errores JS | Que cada selección del modelo sea siempre oportuna |
| Interpolación y vuelta a neutral | Observadas en navegador real | Preferencia estética de cada usuario |
| Vistas de A1 y móvil | Revisadas a 1024 × 600 y 390 × 844 | Todos los tamaños o navegadores posibles |
| Galería de 173 imágenes | Filtro, búsqueda, vista previa, retorno y móvil correctos | Una prueba de micrófono o conversación |
| Integridad de imágenes publicadas | 173 capturas y 150 referencias, hashes verificados, sin duplicados | Equivalencia exacta entre referencias IA y vectores |
| Pruebas reales aisladas de texto en A1 | Respuestas y temperatura observadas | Latencia hasta la primera palabra audible |

Las capturas y manifiestos permiten verificar qué geometría se publicó.
`expressions/qa/gallery-results.json` conserva los resultados de la galería.
`20261016-personality-live-probes.json` contiene cuatro preguntas, respuestas,
tiempos de primer texto y observaciones cualitativas; no son un benchmark
representativo. La consulta de temperatura ejecutó una lectura real y respondió
con el valor observado. Las otras pruebas no solicitaron acciones externas.

Una prueba adicional de frustración cotidiana siguió siendo demasiado extensa
al principio. Tras aclarar la instrucción, pasó de unas 47 palabras a 24 en una
segunda ejecución. Es una observación aislada, **no** una garantía estadística.
Los casos reales todavía muestran alguna coletilla o consejo genérico: mejorar
el prompt no convierte automáticamente todas las respuestas en conversación
natural.

## Despliegue y reversibilidad

`system/deploy-expression-update.sh` actualiza únicamente los archivos de esta
integración sobre un runtime existente. Funciona desde un usuario normal mediante
sudo, o directamente como root. Copia los originales antes de sustituirlos y
reinicia `atlas-webscreen.service`; no activa la pantalla del A1 ni reinicia otras
sesiones. No toca credenciales, historial conversacional o configuración privada.
La copia por archivo es atómica; el conjunto del despliegue no es una transacción
ni incluye rollback automático.

En el A1 se comprobó el estado listo del servicio y Realtime, el modelo existente,
la disponibilidad de los proveedores configurados, los hashes de los archivos
copiados y `atlas-face list` tanto con el usuario habitual como con root. La
pantalla permaneció inactiva. Una pestaña que ya estaba abierta debe recargarse
para cargar el nuevo JavaScript.

La publicación incluye también módulos y manuales operativos de los que ya
dependía el runtime local y que aún no estaban en Git. No incluye historiales de
WhatsApp, secretos, copias de seguridad, archivos privados ni trabajo de carcasa.

## Límites pendientes de escucha real

La naturalidad de una voz requiere escucharla en el dispositivo. No se han
realizado llamadas de síntesis pagadas ni se ha puesto a hablar el altavoz durante
estas pruebas. Los ajustes de navegador y ElevenLabs son acotados y reversibles;
no se afirma que creen emociones que el motor no ofrece.

La ventana de continuación tiene pruebas de eventos, temporizadores, eco,
cancelación y reproducción interrumpida, pero queda pendiente verificarla con el
micrófono y los altavoces físicos del A1, incluyendo una frase que comience cerca
del límite. No se han inventado medidas de primera palabra ni mejoras de latencia.

La explicación de los parámetros y fuentes oficiales de voz está en
[`20261016-voice-naturalness.md`](20261016-voice-naturalness.md). Las imágenes IA
son referencias conceptuales; las capturas y vectores determinan la apariencia
real y conservan las proporciones.
