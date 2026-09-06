# ATLAS Chat

`atlas-chat` is the text-only terminal surface for ATLAS. It opens a direct
`gpt-realtime-2.1` session through the same OpenClaw OAuth reservation used by
WebScreen, then loads the same `REALTIME_INSTRUCTIONS.md`, complete Markdown
context, persistent Realtime conversation and direct tools. A final
`TERMINAL_INSTRUCTIONS.md` layer changes only presentation: terminal responses
can use concise Markdown, paths, digits and technical units instead of the
speech-oriented formatting used by WebScreen.

```bash
atlas-chat
atlas-chat -p "Comprueba la temperatura de la Pi"
atlas-chat --ephemeral -p "Prueba de latencia"
atlas-chat --verbose
atlas-chat --help
atlas-chat --version
```

Assistant text is streamed in white. Shell commands, web searches and their
real output are shown separately in grey. Each turn includes first-token and
total timing. Private history and JSONL diagnostics stay under
`/home/atlas/.atlas/chat/` with restrictive permissions.

Normal turns read and write the persistent conversation shared with WebScreen.
`--ephemeral` neither reads that history nor writes the diagnostic turn back.
`-p` sends one prompt and exits. In an interactive session, `/help` lists all
shortcuts; `/new`, `/context`, `/model`, `/logs`, `/clear` and `/quit` manage the
client without becoming model prompts. Ctrl+C cancels the active response and
Ctrl+D exits at the prompt. `--verbose` records provider event types, never the
OAuth secret or full provider payloads.

The command always runs as the ATLAS service account, even when invoked by
root, so it cannot leave root-owned files inside the user's Realtime state.

Install or update it from the repository with:

```bash
sudo bash system/install-chat.sh
```

The installer makes dated backups, installs the command for the normal user and
root, reuses WebScreen's virtual environment, installs only missing Python
dependencies, and safely adds missing cross-references to the live workspace.
