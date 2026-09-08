# TDR.md - Project Context

Utiliza este archivo para describir el trabajo de investigación asociado a tu instalación de ATLAS.

## Project

- Title:
- Research question:
- General goal:
- Current phase:

## Milestones

- Next milestone:
- Delivery date:
- Pending evaluation:

## Notes

Añade aquí decisiones, resultados y contexto que ATLAS deba recordar sobre el proyecto.

### Rutinas deterministas

ATLAS puede convertir tareas recurrentes y con variación predecible en rutinas
locales bajo `/home/atlas/.atlas/routines`. La frase exacta se comprueba antes
de abrir una respuesta de Realtime, reduciendo latencia y tokens. El registro
Markdown/JSON se valida y escribe de forma atómica; admite pasos de shell,
variables capturadas, una respuesta `[SAY]` opcional y un booleano
`requires_model`. Con `false`, el `[SAY]` resuelto evita por completo al modelo;
con `true`, Realtime interpreta el resultado ya ejecutado. WebScreen y `atlas-chat`
comparten el mismo motor. Si una ejecución falla, se detiene y entrega su
resultado a Realtime sin repetir automáticamente una acción con efectos.
