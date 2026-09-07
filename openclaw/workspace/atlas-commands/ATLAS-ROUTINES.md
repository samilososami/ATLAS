# ATLAS ROUTINES

`atlas-routines` gestiona las rutinas deterministas de A1. El registro activo
está en `/home/atlas/.atlas/routines/ROUTINES.md`; el manual completo está en
`/home/atlas/.atlas/routines/README.md`.

Una rutina se compara localmente, por frase exacta normalizada, antes de abrir
una respuesta de Realtime. Por eso ahorra tokens y tiempo. No es un reemplazo
de la interpretación del modelo para peticiones nuevas o variables.

```bash
atlas-routines list
atlas-routines show NOMBRE
atlas-routines create
atlas-routines run NOMBRE
atlas-routines validate
atlas-routines edit
atlas-routines disable NOMBRE
atlas-routines enable NOMBRE
atlas-routines delete NOMBRE
```

Las rutinas tienen pasos `shell` y `say`. Los comandos se ejecutan en orden y
pueden capturar una salida para insertarla después en `[SAY]`. Un éxito sin
`say` es silencioso. Un fallo detiene la secuencia y queda registrado con un
`executionId`; Realtime puede consultar ese resultado y explicar o corregir la
definición, pero no debe repetir automáticamente la acción.

Root puede usar el mismo comando: el wrapper delega en `sami` para conservar la
propiedad correcta de los archivos privados.
