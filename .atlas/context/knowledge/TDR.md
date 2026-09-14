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

### Arquitectura nativa actual

WebScreen y `atlas-chat` conversan directamente con `gpt-realtime-2.1`. El
Native Broker mantiene un único `codex app-server`, permite que Codex renueve su
propio OAuth, normaliza las cuotas y crea credenciales efímeras para cada sesión
Realtime. El OAuth persistente permanece en `/home/atlas/.codex/auth.json`; las
claves de Tavily y ElevenLabs viven separadas en
`/home/atlas/.atlas/config/secrets.json`.

La identidad y el conocimiento versionado están en
`/home/atlas/.atlas/context/knowledge`, ordenados por `manifest.json`. La memoria
conversacional mutable está separada en `.atlas/context/conversation`. Esta
arquitectura no depende de OpenClaw ni delega allí la conversación. OpenClaw se
probó durante una etapa anterior: daba respuestas de buena calidad, pero su
cadena de capas solía tardar entre 7 y 15 segundos y perdía la sensación de
conversación. Realtime directo redujo ese recorrido a aproximadamente 2–3
segundos en las pruebas comparables. Esa etapa se conserva como historia del
desarrollo, no como fallback ni dependencia actual.

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

### Roles declarativos

La arquitectura versiona perfiles bajo `/home/atlas/.atlas/roles`. El perfil
`atlas-full` describe el ATLAS personal completo. El perfil `profesores` es una
demostración de consulta estrictamente de solo lectura: carga únicamente la
identidad y `PROFESORES.md`, con un horario marcado expresamente como ficticio;
recibe la fecha y hora actuales y no dispone de shell, red, escritura ni memoria
mutable. Los manifiestos y sus tests ya están versionados, pero la selección y
composición dinámica de perfiles queda para una fase posterior. Hasta entonces,
WebScreen y `atlas-chat` siguen utilizando el contexto completo equivalente a
`atlas-full`; la presencia de un archivo de contexto nunca concede capacidades
por sí sola.
