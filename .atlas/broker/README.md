# ATLAS Native Broker

El Native Broker sustituye la capa de autenticación y reserva del prototipo
anterior. Mantiene un proceso `codex app-server` durante la vida del servicio,
deja que Codex renueve el OAuth de ChatGPT y ofrece tres contratos internos:

- estado de cuenta/OAuth sin identificadores ni tokens;
- cuotas normalizadas para WebScreen y Companion;
- secretos efímeros para sesiones WebRTC de `gpt-realtime-2.1`.

El OAuth persistente sigue siendo propiedad de Codex en
`/home/atlas/.codex/auth.json`. Debe ser un archivo regular `0600`, propiedad del
usuario del runtime. El broker no lo copia a `.atlas`, no lo devuelve por HTTP y
no lo incluye en excepciones o logs. Tavily y ElevenLabs son independientes y
se leen desde `/home/atlas/.atlas/config/secrets.json`.

## Diagnóstico

```bash
atlas-broker health
atlas-broker usage
atlas-broker session
```

`health` comprueba Codex y el login; `usage` devuelve solo ventanas y
porcentajes normalizados; `session` valida que se puede crear una reserva sin
imprimir el secreto. El wrapper baja a `sami` incluso cuando se invoca como
root, para no crear estado OAuth con otro propietario.

Instalación o actualización acotada:

```bash
sudo bash system/install-native-broker.sh
```

El instalador conserva el almacén OAuth existente.

## Importación histórica manual (una sola vez)

Solo una instalación antigua que aún conserve datos bajo `.openclaw` necesita
el importador. Ningún instalador lo ejecuta automáticamente. Desde la raíz de
un checkout revisado, ejecuta primero la inspección sin escritura, luego la
copia y finalmente la verificación mientras la fuente antigua todavía existe:

```bash
sudo env ATLAS_HOME=/home/atlas \
  python3 system/migrate-openclaw-runtime.py --dry-run
sudo env ATLAS_HOME=/home/atlas \
  python3 system/migrate-openclaw-runtime.py
sudo env ATLAS_HOME=/home/atlas \
  python3 system/migrate-openclaw-runtime.py --verify
```

El comando crea una copia de seguridad antes de sustituir destinos y conserva
la fuente. `--verify` compara el contexto y la fuente/modelo de Whisper byte a
byte, y también rechaza enlaces, RPATH o bibliotecas que sigan apuntando al
runtime antiguo. No borres la fuente hasta que esa verificación, `atlas-broker
health` y una reserva real con `atlas-broker session` hayan terminado
correctamente.

El importador migra contexto, Whisper y únicamente las claves allowlisted de
Tavily y ElevenLabs. Deliberadamente no copia OAuth: la sesión debe terminar en
el almacén propio de Codex y permanecer allí. Nunca publiques ni pegues el JSON
de autenticación.

Los fallos se informan con texto acotado y saneado. Un HTTP 500 del proveedor no
demuestra por sí solo que el OAuth esté roto; separa proceso, login, cuota,
creación de reserva y conexión WebRTC antes de volver a autenticar.
