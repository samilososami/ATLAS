# ATLAS Chat

`atlas-chat` is the text-only terminal surface for ATLAS. It opens a direct
`gpt-realtime-2.1` session through the same OpenClaw OAuth reservation used by
WebScreen, then loads the same `REALTIME_INSTRUCTIONS.md`, complete Markdown
context, persistent Realtime conversation and direct tools. A final
`TERMINAL_INSTRUCTIONS.md` layer changes only presentation: terminal responses
can use concise Markdown, paths, digits and technical units instead of the
speech-oriented formatting used by WebScreen.

Before opening a model response, the client checks the same exact local routine
registry as WebScreen. A match appears as a grey `RUTINA` panel. Its `[SAY]`
text is printed in white; a successful routine without `[SAY]` stays silent.
Failures are passed to Realtime with their execution id and are never replayed
automatically. The model also receives `atlas_routine` for list/show/create,
modify and delete flows.

For cross-surface faults, use the [connection map](../../openclaw/workspace/ATLAS-CONNECTIONS.md). A successful terminal turn checks the model/context/tools, not Chrome wake detection or physical audio; see the [reliability verification](../../docs/WEBSCREEN-RELIABILITY-2026-09-06.md).

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
Local input history and private diagnostic logs are still retained.
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

## Terminal interface · 1.2

The input editor owns the `sami ›` prefix, deletion, wrapping and terminal
resizing. Type `/h` for command suggestions, or `@` to browse workspace files.
Tab/arrows navigate; Enter accepts a selected completion or sends the message.
Alt+Enter or Ctrl+J inserts a newline, including after a pasted paragraph.
History suggestions appear in grey; the right arrow accepts them.

`@AGENTS.md`, `@atlas-commands/` and `@"path with spaces.md"` resolve against
the OpenClaw workspace. Absolute paths also work. References send the resolved
path, not the contents; ATLAS can read it with its ordinary tools when needed.
`/files` shows the reference root. No recursive background indexing is used.

Responses render streaming Markdown; tool previews show three command lines
and eight output lines, with long lines ellipsized to terminal width. This is
display-only: execution, results returned to the model and private logs retain
the original values. `/expand` displays all tool details from the last turn;
`/compact` toggles full tool output for future turns (it does not compact memory).
Ctrl+C clears input or cancels the active response; Ctrl+D exits with empty
input. Non-interactive pipes and `-p` retain plain streaming output.
