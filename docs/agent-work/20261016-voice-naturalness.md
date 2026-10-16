# Voz de ATLAS: naturalidad sin cambiar de proveedor

Fecha: 16 de octubre de 2026. Alcance: WebScreen normal y laboratorio TTS; no WhatsApp ni chat escrito. No se cambia el modelo Realtime, la voz elegida ni la cuenta del proveedor.

## Lo observado en el código

- La voz nativa usa el audio generado por Realtime; navegador y ElevenLabs reciben el texto de ese mismo modelo. No son tres motores equivalentes para controlar emociones.
- El navegador ya elegía una voz española y conservaba la puntuación. `normalizeSpeechText` solo servía para comparar eco y wake word; no se ha usado como texto de síntesis.
- ElevenLabs tenía Flash v2.5, estabilidad 0,48, similitud 0,78, estilo 0, speaker boost desactivado y velocidad 1,04. Su descarga ya era streaming: no esperaba el MP3 entero.
- La segmentación de frases completa y el control de cancelación no se han modificado en este cambio. Tampoco se han añadido silencios sintéticos entre frases.

## Cambios implementados

`voiceNaturalness` es un booleano persistente de `/api/settings`, activo por defecto. Desactivarlo devuelve los parámetros anteriores de navegador y ElevenLabs. No se modifica la voz almacenada en la cuenta de ElevenLabs.

En navegador, `voice-prosody.js` aplica una entrega discreta por frase: velocidad neutra 1,00; cuidado o empatía 0,96; reflexión 0,98; alegría 1,03. El tono permanece entre 1,00 y 1,02. Se consulta la expresión visible y su categoría al crear la locución, no se infiere un estado de ánimo leyendo palabras sueltas del usuario. La configuración no cambia a mitad de una palabra ni de una locución. El volumen permanece en 1,00: oscilarlo artificialmente produciría bombeo, no interpretación.

La puntuación, preguntas, comillas y puntos suspensivos llegan intactos al sintetizador. Se prefiere `es-ES` y luego otras voces españolas. Una selección explícita por URI o nombre, si existe en `atlas-browser-voice-uri`, tiene prioridad y conserva su idioma real. La caché se invalida cuando cambia esa preferencia o el catálogo de voces.

En ElevenLabs, el perfil natural usa estabilidad 0,42 y velocidad 1,00. Se conservan similitud 0,78, estilo 0 y speaker boost desactivado. La alternativa anterior permanece disponible para comparación A/B; bajar ligeramente la estabilidad es una hipótesis de mejora, no una garantía perceptual. No se han insertado etiquetas de emoción ni SSML, ni se ha migrado a otro modelo de pago. No se han realizado peticiones de síntesis ni cambiado ajustes globales de una cuenta.

La voz nativa no pasa por estos controles. Su acento, concisión y entrega se orientan con las instrucciones conversacionales revisadas en paralelo. No se aplica procesamiento de volumen, filtros ni un cambio de voz durante la respuesta.

## Fuentes y límites

- [MDN: SpeechSynthesisUtterance](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance): expone voz, idioma, velocidad, tono y volumen. No ofrece un control estandarizado de emociones. La calidad final depende de las voces instaladas y del motor del dispositivo; pequeños cambios de parámetros no crean una voz nueva.
- [ElevenLabs: Text to Speech](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech): la elección de voz y modelo influye más que los ajustes. Una voz nativa del idioma ayuda con el acento. Menor estabilidad permite más variación, pero un valor demasiado bajo puede generar resultados erráticos. Estilo y speaker boost pueden añadir latencia. Las etiquetas de audio no se deben asumir compatibles con Flash v2.5.
- [ElevenLabs: streaming](https://elevenlabs.io/docs/api-reference/text-to-speech/stream): se mantiene el endpoint de streaming y los ajustes por petición; no se necesita modificar una voz en la cuenta.
- [OpenAI: Voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting): instrucciones breves, ejemplos variados y tono explícito pueden orientar ritmo y estilo. No sustituyen el diseño de voz. Las respuestas directas y las comprobaciones rápidas no necesitan preámbulos.

## Comprobación reproducible

Pruebas offline, sin hablar por los altavoces ni contactar con proveedores:

```sh
cd /tools/codex/workspace/ATLAS/.atlas/webscreen
node --test test_voice_prosody.cjs test_browser_voice_cache.cjs test_browser_voice_start.cjs test_tts_preparation.cjs
python3 -m unittest test_voice_settings test_realtime
```

Comprueban perfiles acotados, volumen constante, conservación de texto y puntuación, prioridad de voz explícita, compatibilidad con caché, cancelación, precarga en streaming, persistencia/validación de ajustes y payload de ElevenLabs sin red. No prueban que una persona perciba la voz como más natural.

Para evaluar esa percepción en el A1, comparar el mismo texto con el ajuste activado y desactivado, manteniendo voz y volumen: una pregunta breve, una felicitación, una respuesta empática, un resultado numérico y una explicación de dos frases. Valorar acento, claridad, entonación, continuidad y primera palabra. No se han inventado resultados de esta escucha pendiente.

## Integración de continuación conversacional

`app.js` habilita expresamente `canFollowUp` solo en la vista normal de voz visible, con control y sin mute, dictado, prueba TTS ni grabación manual. Silenciar u ocultar cierra la admisión de continuación. La ventana de tres segundos, los eventos VAD y su protección frente a eco pertenecen a `realtime.js`, no a la síntesis de voz. Los clientes que no habiliten esa capacidad quedan cerrados por defecto.
