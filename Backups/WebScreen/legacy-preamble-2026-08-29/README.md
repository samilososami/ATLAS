# ATLAS WebScreen — arquitectura legacy de preámbulo

Esta es la última copia pública de ATLAS WebScreen antes de integrar GPT Live el 29 de agosto de 2026.

## Qué conserva

La versión combina reconocimiento de voz nativo de Chrome, un listener permanente para la wake word, un preámbulo rápido generado en paralelo y una sesión persistente del agente principal de OpenClaw. La respuesta final se sintetiza mediante el motor de voz del navegador o ElevenLabs. También conserva la delegación de acceso entre clientes, las interrupciones por voz, los logs por interacción y las herramientas de diagnóstico del WebScreen.

El objetivo de esta arquitectura era reducir la sensación de espera sin perder el workspace, las herramientas ni la memoria de ATLAS. Funcionó como banco de pruebas para medir la latencia real, pulir la detección de voz y definir el tono conversacional del agente.

## Por qué pasó a ser un backup

El pipeline separaba reconocimiento, preámbulo, agente y síntesis. Aunque cada pieza podía optimizarse, los cambios de fase seguían introduciendo pausas y hacían más difícil conseguir una conversación verdaderamente continua. La implementación principal comienza ahora una migración a `gpt-live-1-codex`, usando audio bidireccional nativo, barge-in y delegación al agente de OpenClaw cuando se necesitan herramientas o contexto profundo.

Esta copia permite volver al sistema anterior si la nueva ruta Realtime falla o si necesitamos comparar latencia, calidad y estabilidad entre ambas arquitecturas.

## Contenido y restauración

El código saneado está en [`source`](./source). Para restaurarlo en una instalación de desarrollo, copia ese directorio a la ubicación de ATLAS WebScreen, recrea `.venv`, descarga los modelos locales opcionales y configura las credenciales exclusivamente mediante OpenClaw o variables de entorno.

No se incluyen `.certs`, `.models`, `.runtime`, `.venv`, `logs`, cachés, grabaciones ni valores secretos. La copia privada íntegra se conserva fuera del repositorio en el equipo de desarrollo.
