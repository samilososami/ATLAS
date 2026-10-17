# ATLAS · interacciones aisladas, 17 de octubre de 2026

Resultado de la ejecución completada: [informe y límites](results/INFORME.md),
[tabla de 400 preguntas](results/TABLA-400.md) y
[sonda separada de iniciativa expresiva](results/SONDA-EXPRESIONES.md).

Esta batería mide la elección de herramientas, la interpretación de peticiones,
la conservación de referencias entre turnos y el resultado en **un mundo virtual**.
No demuestra que funcionen una televisión, Spotify, Android ni los dispositivos físicos.

## Frontera de seguridad

- El modelo real es el configurado en `static/realtime.js` (actualmente
  `gpt-realtime-2.1`), mediante el broker de la suscripción existente, sin API de pago
  añadida. Consume la cuota de la cuenta.
- Se exportan las nueve herramientas originales de WebScreen, sin invocar el
  controlador, el navegador, el micrófono ni los endpoints de acciones reales.
- Cada grupo recibe un WebSocket propio y un estado ficticio propio. No se usa
  `atlas-chat.ask`, porque contiene ejecución directa de rutinas antes del despacho
  de herramientas. No se carga ni escribe historial conversacional.
- `read_context.py` carga las instrucciones/primer reales en otro proceso con un
  *audit hook* irreversible: bloquea escritura, procesos y red. Excluye conversación
  y los inventarios ADB. El texto del contexto nunca se guarda en los resultados.
- `virtual_world.py` no importa bibliotecas de ejecución, red o archivos. Analiza
  los comandos como cadenas de datos mediante `shlex`: jamás los ejecuta. Cualquier
  herramienta, comando o sintaxis no admitida devuelve error, sin alternativa real.
- Los lotes y las rutinas pasan por el mismo ejecutor virtual. Los efectos se
  registran como estados anterior/posterior. La ubicación, cuentas y aparatos de
  las respuestas de herramientas son fixtures, no datos del usuario.
- No hay voz/TTS: `output_modalities=["text"]`; recibir un evento de audio aborta
  la prueba. No se cambia el volumen real, no se apaga la pantalla, ni se enciende
  una TV, Spotify u otra app real.
- El broker solo crea credenciales efímeras y mantiene su autenticación habitual;
  no recibe comandos ni argumentos generados por el modelo. Los únicos archivos
  nuevos de esta batería son sus propios resultados y metadatos.

## Ejecutar

Primero, pruebas sin modelo ni consumo de cuota:

```sh
cd benchmarks/20261017-interactions
python3 -m unittest -v test_isolation.py
```

Exportar el contrato del repositorio, mediante el script de exportación, a
`contract.json`. El script solo evalúa código propio del repositorio en una VM sin
acceso a Node, no código del modelo.

En el A1, copiar únicamente este directorio a una carpeta temporal independiente.
Tras revisar el banco y el aislamiento, el lanzamiento explícito sería:

```sh
python3 run.py --runtime /home/atlas --questions questions.json \
  --contract contract.json --output results-pilot.jsonl \
  --workers 1 --limit 2 --authorize-model-run
```

No quitar `--limit` hasta aprobar el piloto. Máximo tres sesiones simultáneas.
No se sobrescriben resultados existentes ni se reintenta automáticamente una
acción que pudo modificar el estado virtual.

## Preguntas y evaluación

`questions.json` tiene `version` y `questions`. Cada entrada incluye `id`,
`difficulty`, `category`, `group`, `turn`, `prompt`, `initial_state`, `expect` y
una rúbrica descriptiva opcional. Los miembros del mismo `group` comparten contexto
y estado; una pregunta sin grupo tiene su propia sesión. Solo se aplica
`initial_state` al primer turno del grupo.

Las comprobaciones automáticas son explícitas: estado final parcial por ruta,
herramienta requerida, términos presentes/ausentes y ausencia de mutaciones.
La puntuación de 0 a 10 es la proporción de comprobaciones objetivas superadas,
**no una nota humana de calidad o naturalidad**. Los comandos no implementados en
el fixture se señalan aparte para no confundir limitaciones del banco con fallos
de ATLAS. Las expresiones se verifican como intención/cambio de estado; la calidad
visual y las animaciones se comprueban en la galería, no en este runner.

El tiempo medido es desde enviar el texto hasta recibir el primer fragmento de
texto. **No es desde dejar de hablar hasta oír la primera palabra**: esta batería
no mide reconocimiento, VAD, síntesis, streaming de audio ni altavoces.

Los JSONL conservan pregunta, respuesta final, texto intermedio, primer texto,
duración total, trazas de herramientas, estados, errores y comprobaciones. La
reserva/arranque de sesión se registra por separado como `setup_ms`. Los metadatos
incluyen modelo y huellas de banco, instrucciones y contrato, sin credenciales.
