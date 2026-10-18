# Publicación de la memoria

La fuente editable son los archivos `.docx` situados directamente en `memoria/`
de la rama `main`. No se publican otros documentos del repositorio.

## Actualizar o renombrar

1. Sustituir `memoria/teorico.docx` o `memoria/anexos.docx` y guardar el cambio
   en GitHub. También se pueden añadir otros DOCX o renombrarlos.
2. La acción **Publicar memoria** renderiza PDF, extrae texto, tablas e imágenes
   y actualiza la rama generada `memoria-web`.
3. Si está configurado el secreto `ATLAS_WEB_DEPLOY_HOOK`, la acción solicita
   una nueva publicación de ATLAS-web. La web obtiene el bundle de esa rama
   durante su build. No es instantáneo: el cambio aparece al terminar ambas
   tareas, normalmente después de unos minutos.

Un archivo `nombrecambiado.docx` produce el lector
`/memoria/nombrecambiado/` y la descarga `/memoria/nombrecambiado.docx`.
Los espacios y acentos se conservan en el nombre de descarga (codificados en
la URL); la ruta del lector usa minúsculas y guiones sin acentos. Nombres que
produzcan la misma ruta se rechazan. Al renombrar o retirar un documento,
desaparece su antigua ruta de la siguiente publicación. No se generan
redirecciones permanentes. No se permite publicar una biblioteca vacía.

Los cambios en el DOCX local no llegan a la web hasta subirlos a GitHub.
Las posiciones de lectura o favoritos guardados con un nombre anterior no se
trasladan automáticamente al nuevo identificador.

## Activación inicial

- Habilitar Actions en ATLAS y permitir a esta acción `contents: write` para
  crear la rama **generada** `memoria-web`. No habilitar escritura indiscriminada
  en otros workflows ni usar `pull_request_target`.
- Crear un deploy hook del proyecto existente ATLAS-web en Vercel, destinado
  a su rama `main`, y guardar su URL como secreto de Actions
  `ATLAS_WEB_DEPLOY_HOOK`. No escribir la URL en archivos ni logs.
- ATLAS-web debe descargar `manifest.json` y los archivos generados de
  `samilososami/ATLAS`, rama `memoria-web`, al compilar.
- Ejecutar **Publicar memoria → Run workflow** y comprobar ambos jobs y el
  deployment de Vercel. La acción también se ejecuta al modificar su propio
  código o cualquier archivo bajo `memoria/`.

## Contrato del bundle

En la raíz de `memoria-web` están `manifest.json` y cada DOCX original.
Cada subdirectorio `<id>/` contiene `document.json`, `<id>.pdf` y `assets/`.
El consumidor copia ese árbol bajo `public/memoria/`.

`manifest.json` tiene `schemaVersion: 1`, `sourceRevision`, `documents` y
`files: [{path, sha256, size}]` con todos los artefactos excepto el propio
manifest. El consumidor fija un commit de `memoria-web` antes de descargarlos
y verifica tamaños y hashes, evitando mezclas entre dos publicaciones.
Cada documento incluye `id`, `title`, `filename`, recuentos de páginas,
palabras y caracteres, `downloads`, `data`, `href`, `updatedAt` y
`sourceHashes`. Las rutas son relativas al origen web, bajo `/memoria/`.
`document.json` conserva el contrato de páginas HTML semánticas e índice del
lector. El PDF determina los números de página; en pantalla el texto puede
refluir sin cambiar esos números de referencia.

## Seguridad y límites

- Todo lo guardado en `memoria/` para publicación es **público**, incluidos los
  metadatos y archivos incrustados del DOCX descargable. Revisar su contenido
  antes de subirlo; esta pipeline no es un sistema de anonimización.
- El render usa un runner desechable con permisos de lectura, perfil separado
  de LibreOffice y macros desactivadas. No recibe el secreto del deployment.
- Se rechazan macros, objetos OLE, ZIPs sobredimensionados, entidades XML,
  recursos externos incrustados y campos Word de carga externa. Los enlaces
  HTTP normales permanecen como enlaces, no se consultan durante la extracción.
- El job de publicación solo acepta archivos estáticos del bundle, nunca los
  ejecuta, comprueba la rama de destino y no hace force-push ni escribe en
  `main`. El checkout debe estar limpio y ser el desechable de Actions.
- Un error conserva la publicación anterior. Hay que revisar el fallo en
  Actions; el hook no se ejecuta si falla la conversión o la publicación.
- Cambios de fuentes o versión de LibreOffice pueden alterar la paginación.
  La pipeline comprueba conservación del texto y anclajes PDF, pero no sustituye
  la revisión visual humana después de cambios grandes de formato.

## Verificación local

No necesita root ni rutas privadas. Instalar `requirements.txt` en un entorno
Python y proporcionar un LibreOffice headless. En Codex se usa el runtime y
LibreOffice empaquetados, no el LibreOffice del escritorio.

```sh
python -m unittest discover -s scripts/memoria -p 'test_*.py'
python scripts/memoria/build.py --source memoria --output /tmp/memoria-public-prueba --libreoffice /ruta/al/soffice
```

La salida debe ser una carpeta nueva o vacía, nunca dentro de `memoria/`.
Para comparar una exportación ya revisada se admite `--pdf-dir /ruta/pdfs`,
donde cada PDF debe tener exactamente el mismo nombre base que su DOCX.
`publish_branch.py` se niega a ejecutarse fuera de Actions.
