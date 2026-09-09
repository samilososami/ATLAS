# ATLAS Android 0.2.8-preview

Esta preview estrena el flujo de acciones agrupadas inspirado en los agentes de
computer use:

- `atlas_actions` combina en una sola decisión del modelo operaciones nativas
  del teléfono, un lote Android Use y comandos relacionados del A1.
- `androiduse.batch` ejecuta hasta 16 pasos durante un máximo de 18 segundos,
  espera localmente etiquetas accesibles y se detiene en el primer fallo.
- Una petición compuesta como «abre Amazon y busca ESP32» ya no intercala una
  captura y una inferencia entre cada toque: abre la app, completa el flujo
  previsible y entrega una sola captura final.
- Las coordenadas continúan siendo normalizadas y solo se usan como fallback;
  `click` y `wait_for` aceptan varias etiquetas candidatas.
- El aura, la notificación y el botón rojo siguen delimitando el control. Si la
  persona lo detiene, el teléfono no inicia los pasos restantes.
- El mismo plan ordenado permite encadenar tareas del A1 como iniciar un cast y
  abrir contenido, deteniéndose ante el primer error.

## WebScreen y A1

- `atlas-cast webscreen` abre el New WebScreen a pantalla completa en el
  escritorio virtual de un cast ya activo, sin tocar el kiosk físico.
- WebScreen, la app y `atlas-chat` comparten el mismo contrato de lotes y una
  única verificación final.
- Se incorporó al contexto del TDR la entrega teórica del 21 de octubre, la
  presentación entre el 9 y el 11 de noviembre y el contexto del tutor Rafa.

## Validación de esta entrega

La preview se valida con contratos Java/JavaScript, pruebas del backend,
compilación Android y análisis estático sin usar ADB, tal como se pidió. La
prueba física del nuevo flujo queda para el usuario en el S23 Ultra.
