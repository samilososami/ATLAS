# ATLAS A1 audio

ATLAS A1 usa PipeWire a 48 kHz. Chrome captura directamente el micrófono USB,
reproduce directamente por HDMI y mantiene su WebRTC Audio Processing Module.
Como solución estable temporal, el kiosko funciona en half-duplex: durante la
voz de ATLAS se desconectan tanto el uplink Realtime como el recognizer local de
Chrome, y se recuperan doscientos milisegundos después del final del audio.

```text
Chrome output -----------------------------------------------> HDMI
USB microphone --[cerrado mientras ATLAS habla]--> OpenAI Realtime
```

- `pipewire/10-atlas-clock.conf`: fija el grafo y sus alternativas en 48 kHz.
- `pipewire/90-atlas-aec.conf`: crea el sink, la source y los dos nodos internos
  del AEC; la captura física y el HDMI se seleccionan por nombre estable.
- `/usr/local/libexec/atlas-aec-route`: espera a que aparezca el grafo, establece
  `atlas_aec_sink` y `atlas_aec_source` como predeterminados y mueve streams que
  hayan arrancado antes.
- `atlas-aec-route.service`: aplica esa ruta después de cada inicio de la sesión
  de audio de `sami`.

El módulo PipeWire AEC y sus mediciones se conservan como ruta de rollback, pero
su fragmento termina en `90-atlas-aec.conf.disabled` y
`atlas-aec-route.service` está deshabilitado. Por ello los nodos virtuales ni
siquiera se cargan durante esta prueba. El kiosko exporta directamente el sink
HDMI y la source USB, igual que un navegador convencional. Los clientes remotos
y el A1 usan así el mismo AEC de Chrome.

## Medición del 1 de septiembre de 2026

Se reprodujo durante aproximadamente veinte segundos una frase conocida y se
grabaron simultáneamente el micrófono USB original, la referencia del sink y la
source cancelada. A 80 % de volumen HDMI:

- micrófono original: -13,31 dBFS;
- referencia: -16,87 dBFS;
- source cancelada: -17,99 dBFS;
- ruido en reposo original: -33,51 dBFS;
- ruido en reposo cancelado: -43,56 dBFS.

La comparación RMS aislada arroja 4,68 dB porque la source limpia conserva
ruido de sala y artefactos que no son habla. La comprobación semántica con
Whisper.cpp es más representativa del fallo que se quería evitar: el original
reconoció casi completa la frase reproducida y el resultado cancelado solo
produjo `¿Qué es?`. A 100 % el resultado fue parecido, pero el micrófono llegó
a rozar clipping; por eso la salida HDMI física se dejó al 80 %.

Las capturas completas y `metrics.json` se conservan fuera del repositorio en:

```text
/home/atlas/.atlas/audio/aec-tests/
/home/kali/openclawbackups/pipewire-aec-20260901-153046/measurements/
```

## Interrupción

El A1 usa temporalmente `interrupt_response: false` y no admite interrupciones
mientras está hablando. Los portátiles y demás clientes mantienen
`interrupt_response: true`, micrófono continuo y barge-in natural. Este límite
es exclusivo de `?kiosk=1`; no altera el comportamiento remoto.

## Reversión

La migración inicial, la configuración anterior de PulseAudio y un script de
rollback están en:

```text
/home/atlas/.atlas/backups/pipewire-aec-20260901-153046/
/home/kali/openclawbackups/pipewire-aec-20260901-153046/
```

El despliegue A/B que activó la ruta de navegador conserva además una copia
fechada en:

```text
/home/atlas/.atlas/backups/webscreen-browser-aec-ab1-20260901-185242/
```
