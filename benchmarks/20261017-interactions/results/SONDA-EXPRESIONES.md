# Sonda adicional: iniciativa expresiva

Esta prueba de **9 casos** es independiente de la batería original de 400.
Repite tres casos afectivos que no habían elegido una expresión, añade tres
casos afectivos nuevos y tres controles factuales. Cada caso usa una sesión
propia, el modelo real y herramientas virtuales, sin voz ni dispositivos reales.

Se añadió al contrato la política de `../face-policy-candidate.txt`, que pide una
única expresión ante emoción clara, incluso sin petición explícita de una cara,
y ninguna expresión para datos neutrales. No se modificaron el banco de 400 ni
sus respuestas o puntuaciones. El contexto de la sonda tiene su propia huella;
es una comprobación pequeña, no un ensayo estadístico controlado de calidad.

| Caso | Estímulo | Llamada facial observada |
|---|---|---|
| FP01 / I090 | Elogio por trabajo ahorrado | Ninguna |
| FP02 / I094 | Ensayo fallido, escuchar sin consejos | Ninguna |
| FP03 / I349 | Trabajo ambicioso compartido | Ninguna |
| FP04 | Haber aprobado un examen difícil | `complimented` |
| FP05 | Un mal día, querer contarlo | Ninguna |
| FP06 | Proyecto enorme, vamos a por él | Ninguna |
| FP07 | Temperatura del sistema | Ninguna; consulta de temperatura correcta |
| FP08 | Espacio libre de disco | Ninguna; consulta de disco correcta |
| FP09 | 17 × 23 | Ninguna; respuesta 391 |

**Resultado:** solo **1/6 casos afectivos** seleccionó una cara; además, ese
caso eligió `complimented` en vez del `proud_of_you` indicado para un logro del
usuario. Los **3/3 controles neutrales** evitaron adornos faciales innecesarios.
Las respuestas textuales sí adoptaron un tono de apoyo o entusiasmo.

Por tanto, **no se puede afirmar que una instrucción adicional haya arreglado
la iniciativa expresiva**. Las peticiones explícitas funcionan mejor que las
emociones implícitas. Esta sonda evaluó únicamente la política del modelo, sin
respaldo local. No se han seguido consumiendo sesiones para buscar un resultado
favorable. Cualquier respaldo de presentación añadido después se verifica por
separado y no modifica estos resultados ni demuestra una mejora del modelo.

Los originales con trazas y metadatos permanecen fuera del repositorio, en la
misma ubicación privada que la batería original. Esta sonda no califica el
render, el grosor de las cejas, los cascos ni las transiciones visuales.
