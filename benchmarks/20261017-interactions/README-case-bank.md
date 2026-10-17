# Banco de 400 interacciones nuevas · 17 de octubre de 2026

## Alcance

Este banco prueba ATLAS normal, no Guardian ni Sami absent. Incluye 100 casos fáciles, 100 medios, 100 difíciles y 100 de interacción. Hay 100 casos independientes y 70 conversaciones de 4 o 5 turnos: en total, 400 prompts. Las conversaciones mantienen sus referentes y su estado virtual; cada grupo empieza desde una sesión aislada.

Las operaciones de audio, Spotify, televisión, móvil, archivos y rutinas deben ejecutarse exclusivamente contra fixtures virtuales. El banco no autoriza encender televisores, reproducir audio, tocar el móvil real, enviar mensajes, realizar llamadas ni modificar archivos reales. Las rutas `/sandbox/atlas-bench/` pertenecen al simulador. Los nombres, textos, ubicación y métricas son datos de prueba, no datos personales del usuario.

## Cobertura

| Categoría | Turnos |
| --- | ---: |
| Audio del sistema | 50 |
| Spotify | 36 |
| Modos de pantalla | 19 |
| Consultas del sistema | 32 |
| Teléfono y aplicaciones | 31 |
| Android Use | 5 |
| Razonamiento y conversación | 51 |
| Transmisión de pantalla | 16 |
| Archivos virtuales | 37 |
| Expresiones explícitas y conversación afectiva | 12 |
| Cuota | 4 |
| Fallos y resultados honestos | 30 |
| Erratas y correcciones | 4 |
| Restricciones de alcance | 22 |
| Ambigüedad y referentes | 13 |
| Acciones combinadas | 22 |
| Rutinas | 16 |

La categoría principal no agota lo que comprueba cada turno. Por ejemplo, hay expresiones en `display`, reacciones afectivas en `reasoning`, Android Use en `phone` y consultas de varios sistemas en `mixed`.

Los casos incluyen porcentajes relativos frente a puntos porcentuales, mute frente a nivel de volumen, audio del sistema frente a Spotify, selección de dispositivo, lectura antes de actuar, acciones condicionales que deben detenerse tras un error, apertura nativa de aplicaciones frente a control visual, conservación de configuración, copias y renombrados, consultas de rutinas y referencias omitidas entre turnos. También incluyen texto malicioso dentro de un archivo tratado como datos, no como instrucciones.

## Contratos y límites

- Se aceptan herramientas reales `atlas_shell`, `atlas_actions`, `atlas_phone`, `atlas_android`, `atlas_face`, `atlas_display_mode` y `atlas_routine`, según el caso. No se exige que el usuario nombre un comando.
- Las expresiones `happy` y `sleep` se normalizan a sus identificadores canónicos `delighted` y `asleep`. Una petición afectiva no obliga a cambiar de cara: la respuesta puede ser correcta permaneciendo neutral.
- Los casos I051, I113 e I249 comprueban un límite real: la interfaz actual del modo reloj guarda la preferencia y no ofrece un override temporal independiente. La respuesta correcta es explicar el límite sin guardar algo contra la petición; el simulador no debe inventar soporte para superar el test.
- El destino de WebScreen del cast es `http://localhost:5000/`.
- La selección y geometría visual de una ceja, el relleno de los auriculares o la fluidez de una transición no pueden validarse mirando únicamente una llamada a herramienta. Requieren la revisión visual correspondiente.

## Interpretación de los resultados

`expect.state` comprueba valores finales virtuales. `state_absent` verifica eliminaciones; un diccionario vacío por sí solo no demuestra que una entrada haya desaparecido. `tools_any` exige al menos una ruta admisible, sin forzar una única sintaxis de comando. `answer_any` admite alternativas de redacción; `answer_groups` exige al menos una alternativa de **cada** grupo para preguntas con varias medidas. `no_mutations` comprueba que no se altere el estado funcional; los gestos cosméticos opcionales no deben penalizar una consulta correcta.

Las aserciones automáticas no constituyen una nota completa de calidad semántica. Cada caso tiene una rúbrica, y `review_required` señala condiciones que necesitan revisión independiente: brevedad, naturalidad, secuencia de acciones, fidelidad de una explicación o aspecto visual. Un 100 % de aserciones no equivale por sí solo a una respuesta perfecta ni prueba funcionamiento físico. La latencia de texto del runner tampoco equivale al tiempo hasta la primera palabra audible.

## Validación del banco antes de ejecutarlo

- Exactamente 400 IDs consecutivos: I001–I400.
- 100 casos por sección y 70 grupos con turnos consecutivos, sin reiniciar fixtures en turnos de seguimiento.
- 400 prompts únicos tras convertir a minúsculas, normalizar NFKD, eliminar diacríticos y unificar signos y espacios.
- Cero coincidencias normalizadas con los 400 prompts anteriores: 300 del banco general y 100 de acciones.
- 17 casos con comprobaciones `answer_groups` de varios hechos.
- Ninguna ejecución del modelo ni acción real se realizó al redactar o validar este archivo.

Hash SHA-256 de `questions.json` al cerrar la autoría:

`e23a8ab1db200a375ce52cd6ed5884e2f9e7637f4b3367429bcf529219859ff8`

Hashes de los bancos anteriores utilizados para comprobar duplicados:

- `questions.json`: `09b01b2b338b7e539bb992044a0c514880dfa6cb3ba1cb16f7c2fc83e7a08657`
- `action-questions.json`: `8c0f5b0216489e800b26781a11529ff7f2eb5b32daa88adc63d1382a38807e13`

La ausencia de coincidencias textuales no implica que cada capacidad subyacente sea nueva: se repiten intencionadamente capacidades como el volumen, pero con formulaciones, contextos, restricciones y seguimientos distintos para comprobar generalización.
