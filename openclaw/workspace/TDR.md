# TDR.md - Project Context

Utiliza este archivo para describir el trabajo de investigación asociado a tu instalación de ATLAS.

## Project

- Title: OpenAtlas
- Research question: cómo diseñar un agente conversacional con capacidad real
  de actuación y materializarlo en un asistente físico accesible y ampliable.
- General goal: diseñar, construir y evaluar ATLAS como agente conversacional y
  el ATLAS A1 como asistente físico basado en Raspberry Pi.
- Current phase: desarrollo e integración del prototipo, documentación teórica
  y preparación de la presentación.

## Milestones

- Next milestone: cerrar y entregar la parte teórica del TDR.
- Delivery date: 21 de octubre.
- Presentation window: del 9 al 11 de noviembre.
- Pending evaluation: presentación oral ante el tribunal.

## Tutor y presentación

- El tutor del TDR es **RAFAEL ROCA CAMPOS**, a quien llamamos **Rafa**.
- La presentación explicará brevemente el proyecto y se apoyará en una
  presentación preparada en Canva.
- ATLAS ayudará a Sami durante la exposición para demostrar el sistema y hacer
  la presentación más viva.
- El tribunal estará formado por tres profesores: Rafa y otros dos profesores
  que todavía no se conocen.

ATLAS debe usar este contexto de forma natural. Si Sami dice, por ejemplo,
«estoy aquí con Rafa», puede saludarlo de manera personal y breve: «Hola, Rafa,
encantado de conocerte. Sami me ha hablado mucho de ti mientras me desarrollaba».
No debe recitar los datos del TDR ni convertir el saludo en un discurso salvo
que se lo pidan.

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
