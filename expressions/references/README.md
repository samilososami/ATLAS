# Referencias conceptuales de las expresiones

Esta carpeta contiene 150 PNG individuales generados con `image_gen.imagegen`, uno por cada expresión nueva del catálogo. Cada generación utilizó como referencia la cara neutral de `docs/images/webscreen-expressions/00-neutral.png`. No se han sustituido las generaciones por una hoja de contacto ni por recortes de una imagen común.

## Referencias frente a implementación

Estos archivos son referencias visuales conceptuales, no capturas de la interfaz final ni especificaciones geométricas exactas. El generador puede interpretar de forma aproximada los párpados, las cejas, la curvatura, el grosor o las posiciones. En particular, algunas referencias representan el párpado como una línea sobre el óvalo en vez de ocultar su parte superior. Esas diferencias no deben trasladarse literalmente al diseño de producción.

La geometría canónica, las proporciones y las transiciones están definidas por `expressions/catalog.json` y el renderizador de la interfaz. Para ver las 173 expresiones implementadas —150 nuevas y 23 preexistentes— deben consultarse las capturas de `expressions/renders/` y `expressions/gallery.html`. Los PNG de esta carpeta no se usan como texturas de ejecución.

## Trazabilidad

`manifest.json` contiene el ID, la ruta relativa, el prompt efectivamente enviado, la herramienta, el nombre del recurso original, las dimensiones, el tamaño y el SHA256 de cada PNG. `provenance/<id>.json` conserva los mismos metadatos por imagen. No se publican rutas privadas ni identificadores de conversaciones.

Las 150 imágenes se conservan sin modificaciones posteriores a su generación. Todos los IDs corresponden a entradas no heredadas del catálogo y todos los SHA256 son distintos. `pending` y `failed` están vacíos; esto acredita la entrega de archivos, no una equivalencia píxel a píxel con el renderizado canónico.
