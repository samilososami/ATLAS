# ATLAS Native Broker

`atlas-broker` comprueba la capa que conecta el runtime independiente de ATLAS
con Codex OAuth y OpenAI Realtime. Úsalo cuando WebScreen o `atlas-chat` puedan
servir su interfaz pero no consigan abrir una sesión del modelo, cuando falten
cuotas o después de migrar una autenticación antigua.

```bash
atlas-broker health
atlas-broker usage
atlas-broker session
```

- `health` valida `codex app-server` y el estado de la cuenta sin mostrar datos
  identificativos.
- `usage` devuelve las ventanas de cuota normalizadas. Una ventana desconocida
  no se presenta como cero.
- `session` crea y valida una reserva efímera de `gpt-realtime-2.1`, pero nunca
  imprime el secreto.

El wrapper siempre ejecuta el proceso como `sami`, incluso al llamarlo desde
root. El OAuth vive en `/home/atlas/.codex/auth.json`, debe pertenecer al usuario
del runtime y tener permisos `0600`. No lo leas para contestar al usuario, no lo
copies a Markdown y no incluyas sus valores en logs o diagnósticos.

Separa siempre las capas: un HTTP 200 de WebScreen no demuestra que el broker
esté listo; un `health` correcto no demuestra que WebRTC o el altavoz funcionen;
y un error 500 aislado del proveedor no demuestra OAuth corrupto. Comprueba la
categoría exacta antes de volver a autenticar.

Tavily y ElevenLabs no forman parte del almacén OAuth. Sus campos allowlisted
están en `/home/atlas/.atlas/config/secrets.json`, como archivo privado `0600`.
No muestres ni copies ese archivo; basta con informar si la configuración está
disponible y si la llamada concreta funciona.
