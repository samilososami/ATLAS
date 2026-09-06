# ATLAS Chat

`atlas-chat` is the text-only terminal surface for ATLAS. It opens a direct
`gpt-realtime-2.1` session through the same OpenClaw OAuth reservation used by
WebScreen, then loads the same `REALTIME_INSTRUCTIONS.md`, complete Markdown
context, persistent WebScreen conversation and direct tools.

```bash
atlas-chat
atlas-chat -p "Comprueba la temperatura de la Pi"
atlas-chat --ephemeral -p "Prueba de latencia"
```

Assistant text is streamed in white. Shell commands, web searches and their
real output are shown separately in grey. Each turn includes first-token and
total timing. Private history and JSONL diagnostics stay under
`/home/atlas/.atlas/chat/` with restrictive permissions.

Normal turns share WebScreen's persistent conversation. `--ephemeral` keeps a
benchmark or diagnostic prompt out of that shared conversational memory.

The command always runs as the ATLAS service account, even when invoked by
root, so it cannot leave root-owned files inside the user's Realtime state.
