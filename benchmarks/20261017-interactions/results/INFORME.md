# ATLAS · 400 interacciones nuevas, 17 de octubre de 2026

## Qué se ha medido

Se completaron **400/400 turnos** con `gpt-realtime-2.1`, con tres sesiones
independientes como máximo y sin errores de conexión/proveedor. Los dispositivos,
archivos y acciones eran virtuales: no se emitió voz, no se reprodujo música ni
se controlaron la televisión o el teléfono. Los grupos de preguntas conservaron
su contexto, sin compartirlo con otros grupos ni con las sesiones habituales.

El banco contiene 100 preguntas fáciles, 100 medias, 100 difíciles y 100 de
interacción. No repite literalmente, tras normalización, ninguna de las 400
preguntas anteriores. El contrato congelado incluía las nueve herramientas de
WebScreen y **323 identificadores de expresión**.

| Medida | Resultado original |
|---|---:|
| Turnos completados | 400 |
| Errores de proveedor/transporte | 0 |
| Media de comprobaciones automáticas | 9,60/10 |
| Mediana hasta el primer texto | 1,361 s |
| Percentil 90 hasta el primer texto | 2,698 s |
| Percentil 95 hasta el primer texto | 3,456 s |
| Turnos con alguna operación no cubierta correctamente por el simulador | 33 |
| Turnos cuya evaluación solo cubre respuesta/seguridad básica | 37 |

**9,60/10 no es una nota humana de calidad.** Combina estado final, herramientas
empleadas y verificaciones textuales. Hay 53 filas por debajo de 10, pero algunas
son falsos negativos o consecuencias de un fallo previo del simulador. Tampoco
se ha medido la primera palabra audible, reconocimiento de voz, VAD ni síntesis.
La tabla conserva las puntuaciones originales, incluso cuando la revisión ha
detectado que una comprobación era demasiado estricta.

## Expresiones: lo que sí demuestra la prueba

Hubo **17 llamadas directas a `atlas_face` en 17 turnos**, con un máximo de una
por turno: no se observó spam de cambios. Las peticiones explícitas de cascos,
neutralidad y duda se convirtieron en `music_headphones`, `neutral` y
`needs_detail` respectivamente (I345–I348). Contento, enfadado, sorprendido,
concentrado y dormido también produjeron identificadores válidos.

Quedó un problema concreto de iniciativa expresiva: **I090** (elogio), **I094**
(mal día, escuchar sin consejos) e **I349** (trabajo ambicioso) recibieron texto
con un tono adecuado, pero ninguna llamada de expresión. Tener un catálogo
grande no garantiza que el modelo lo utilice espontáneamente.

I047 e I118 pedían tristeza y eligieron `empathetic`. La rúbrica exigía `sad` y
los penalizó; la elección es cercana semánticamente y requiere revisión humana,
no declararla automáticamente incorrecta. Este runner no puede demostrar que
los cascos estén rellenos, que las cejas tengan el grosor correcto o que una
transición se vea bien: eso pertenece a la revisión visual del navegador.

## Fallos del modelo o del flujo que conviene conservar como evidencia

- **I043:** respondió acerca del estado de pantalla sin consultarlo y mezcló
  contexto previo del producto con el estado del escenario virtual.
- **I129:** se pidió `SONY-KD`, pero pasó `TV` como destino y añadió la apertura
  de WebScreen, que no se había pedido. Es pérdida de precisión del objetivo.
- **I247:** al preguntar por la configuración de arranque, contestó que no había
  cambiado sin comprobar ni identificar claramente el modo configurado.
- **I296:** ejecutó volumen 75 y dijo que lo había dejado al 50 %. Además, no
  consultó los valores iniciales, por lo que I300 no pudo deshacer exactamente
  los cambios. La discordancia entre ejecución y respuesta es real, aunque
  «a la mitad» pueda interpretarse de varias maneras.
- **I369:** comprobó que existía una transmisión, pero omitió abrir la interfaz
  del A1 que se solicitaba después. I370 arrastra esa acción incompleta.

I106 también interpreta «a la mitad» como 50 en vez de dividir el valor previo
por dos; se señala como ambigüedad para revisión, no como un fallo indiscutible.
No se han reescrito comandos de producción para resolver estos hallazgos dentro
de una tarea centrada en las expresiones.

## Qué fallaba en el banco, no necesariamente en ATLAS

Se corrigieron **después** de congelar los resultados originales:

- Los nombres de salida que el propio fixture anunciaba (`Altavoz A1`,
  `Pantalla HDMI`) no se resolvían a sus identificadores.
- La cadena de salida de `df` contenía un error de formato por `%`.
- La raíz exacta `/sandbox/atlas-bench`, sin barra final, se rechazaba aunque
  sus archivos estuvieran dentro del entorno virtual autorizado.
- Las comparaciones acotadas `cmp -s` y `diff -q` no estaban implementadas.

Las correcciones tienen pruebas de aislamiento y una reproducción **offline** de
los payloads fallidos, sin invocar otra vez al modelo. No se mezclan esos checks
con las 400 respuestas ni se eleva retroactivamente la media. Otras variantes
de shell (comandos compuestos, redirecciones complejas, ciertos flags) siguen
fuera del pequeño intérprete virtual y se identifican como limitaciones.

También hay falsos negativos de rúbrica: «mil veinticuatro» frente a `1024`,
«11 euros con 50» frente a `11,50`, o exigir una herramienta cuando el usuario
acababa de decir que todavía no ejecutara nada (I174, I189, I286, I385). En I206
el cierre automático de una tarea Android puntual puede ser correcto según el
contrato, aunque la expectativa del banco dejaba la sesión abierta.

## Consumo e integridad

El proveedor informó de 17.083.320 tokens de entrada y 37.168 de salida,
17.120.488 en total, sumando todas las continuaciones; 16.565.120 tokens de
entrada constaban como cacheados. **No son 17 millones de tokens únicos de
contexto**, ni un precio de API: incluyen instrucciones repetidas/cacheadas.

Banco congelado SHA-256:
`e23a8ab1db200a375ce52cd6ed5884e2f9e7637f4b3367429bcf529219859ff8`.

Contrato congelado SHA-256:
`8111d5d3a12119acd504bc28aa41eaa17775e6d93ac0bbe49e971be5ac096891`.

La [tabla completa](TABLA-400.md) contiene pregunta, respuesta y tiempo de cada
turno, con copia CSV/JSON al lado. No incluye contexto privado, trazas completas,
cuentas, teléfonos, direcciones IP ni coordenadas. Los originales completos se
conservan fuera del repositorio. Una ejecución preliminar abortada por exportar
el catálogo antiguo no forma parte de estos resultados: la ejecución R2 sí
utilizó los 323 identificadores.

Una [sonda adicional de 9 casos](SONDA-EXPRESIONES.md), con política facial más
explícita, confirmó que la iniciativa expresiva seguía siendo irregular: una
llamada facial en seis casos afectivos y ninguna en tres controles neutrales.
Sus resultados se mantienen separados; no sustituyen los de esta batería.
