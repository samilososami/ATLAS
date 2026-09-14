# Roles de ATLAS

Esta carpeta contiene perfiles declarativos de contexto y capacidades. Cada
rol tiene un `role.json`; las rutas de contexto se resuelven desde la carpeta
del propio rol. [`role.schema.json`](role.schema.json) define el contrato común
y `system/test_roles.py` comprueba los límites esenciales.

Por ahora estos manifiestos son el contrato versionado de la futura selección
de roles: el runtime actual sigue arrancando con el perfil completo y todavía
no expone un selector dinámico. No se simula una conmutación que aún no existe.

## Perfiles incluidos

- [`atlas-full`](atlas-full/role.json): perfil completo y predeterminado de
  ATLAS, con el manifiesto general, conversación persistente y todas las
  capacidades actuales.
- [`profesores`](profesores/role.json): consulta docente estrictamente de solo
  lectura. Carga exclusivamente `IDENTITY.md` y `PROFESORES.md`, recibe la fecha
  y hora actuales como dato de runtime y no dispone de shell, red, escritura,
  memoria mutable ni herramientas del dispositivo.

## Composición futura

La composición múltiple se implementará más adelante. Al hacerlo, el contexto
podrá componerse sin conceder permisos de forma implícita: usar
`profesores` solo mantendrá su política cerrada; activar explícitamente
`atlas-full` como perfil de ejecución podrá añadir el conocimiento docente al
ATLAS completo. La mera presencia de un Markdown nunca debe ampliar
capacidades.
