# Rutinas deterministas de ATLAS

Las rutinas convierten peticiones repetitivas y previsibles en pasos locales.
Una frase exacta se comprueba antes de abrir una respuesta de Realtime: si hay
coincidencia, ATLAS ejecuta los pasos guardados sin gastar tokens del modelo.

El registro activo está en `/home/atlas/.atlas/routines/ROUTINES.md`. Es un
Markdown con un bloque JSON validado. Los logs privados y el último resultado de
cada ejecución se guardan en `logs/` y `results/`; nunca se publican.

## Formato

Cada rutina contiene:

- `id`, `name`, `description` y `thoughts`.
- Una o varias `triggers`. La comparación ignora mayúsculas, acentos,
  puntuación y un `ATLAS` inicial, pero no hace coincidencias difusas.
- `enabled`, para desactivarla sin eliminarla.
- `steps`, ejecutados en orden. `shell` ejecuta un comando acotado y puede
  capturar su salida; `say` prepara el texto que ATLAS debe pronunciar.

Una captura llamada `HORA` puede utilizarse después como `${HORA}` o `$HORA`.
También existen `OUTPUT`, `OUTPUT_1`, `EXIT_CODE` y `TIMESTAMP`. Si todo sale
bien y no hay un paso `say`, la rutina termina en silencio. Si algo falla, se
detiene, registra el resultado y Realtime recibe el error para explicarlo o
proponer una corrección; nunca repite por su cuenta una acción con efectos.

## SSH

```bash
atlas-routines list
atlas-routines show hora
atlas-routines create
atlas-routines run hora
atlas-routines validate
atlas-routines edit
atlas-routines disable hora
atlas-routines enable hora
atlas-routines delete hora
```

`atlas-routines create` guía una creación sencilla. `edit` abre una copia
temporal en `$EDITOR`, la valida y solo entonces sustituye el registro. El mismo
comando funciona como `sami` y como root; root delega al usuario de ATLAS para
no dejar archivos con propietario incorrecto.

## Conversación

ATLAS entiende peticiones como «quiero crear una rutina», «qué rutinas hay»,
«qué hace hora», «modifica hora» o «elimina hora». Para crearla pregunta, de
forma breve y una cosa cada vez: qué debe hacer, cuál será la frase exacta y qué
nombre tendrá (o lo decide si se le pide). Solo guarda la rutina cuando esos
datos están claros.

Si la acción depende del entorno, ATLAS puede inspeccionar o probar una vía
antes de guardar, siempre dentro de las reglas normales de autorización. Debe
conservar después el comando directo más corto que haya sido realmente
verificado. Probar una televisión, por ejemplo, no autoriza a inventar su IP ni
a saltarse una confirmación ADB.

Consulta `EXAMPLES.md` para ver una rutina de hora sin añadirla al registro
activo.
