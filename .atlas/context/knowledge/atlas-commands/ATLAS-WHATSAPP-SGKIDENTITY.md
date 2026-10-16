# ATLAS WhatsApp SGK Identity

`atlas-whatsapp-sgkidentity` consulta el perfil escrito privado de Sami
utilizado por el entorno de WhatsApp. Funciona como usuario normal y como root;
root reejecuta la operación con el propietario de `/home/atlas` para no dejar
índices inaccesibles.

```bash
atlas-whatsapp-sgkidentity status
atlas-whatsapp-sgkidentity reindex
atlas-whatsapp-sgkidentity search "que?"
atlas-whatsapp-sgkidentity search "que?" --limit 3 --json
atlas-whatsapp-sgkidentity search "que?" --scope "Los mantitos"
```

Los pares limpiados se guardan como JSONL en
`/home/atlas/.atlas/whatsapp/sami/chats-clean/`. Los corpus canónicos son
`lagangbang.jsonl`, `mantitos.jsonl` y `xavi.jsonl`; cada resultado indica su
origen. `reindex` crea un SQLite privado bajo `sami/index/`. `search` normaliza
mayúsculas, acentos y puntuación y combina coincidencia exacta, contención,
similitud de secuencia y tokens. Devuelve como máximo ocho resultados y nunca
acepta una ruta proporcionada por el modelo.

Sami absent no recibe este CLI ni una shell. Su única tool Realtime llama
directamente al mismo buscador con solo `query` y `limit`, devuelve pocos
ejemplos y rechaza cualquier otra herramienta. El chat actual aporta una
preferencia pequeña de origen, pero la relevancia textual sigue siendo el
criterio principal. La salida legible muestra siempre `[xavi]`, `[mantitos]` o
`[lagangbang]` delante del ejemplo. Los ejemplos enseñan estilo, no hechos
actuales, y no deben trasladar datos personales entre conversaciones.
