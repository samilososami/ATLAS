# Private ATLAS configuration

The live A1 stores provider credentials in `secrets.json`. The file is created
by `system/migrate-openclaw-runtime.py`, must stay mode `0600`, and is ignored by
Git. The migration only imports these legacy fields:

```json
{
  "version": 1,
  "tavily": { "apiKey": "..." },
  "elevenlabs": { "apiKey": "...", "voiceId": "..." }
}
```

OAuth remains in Codex's own `~/.codex/auth.json` store and is never copied
here. Once the allowlisted fields have been migrated and verified, neither this
file nor the ATLAS runtime needs OpenClaw to remain installed. Do not add real
values, logs, pairing material or generated `secrets.json` files to the repository.
