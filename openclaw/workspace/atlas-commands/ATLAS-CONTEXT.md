# ATLAS Context

`atlas-context` keeps the voice conversation from becoming a suitcase full of
old receipts. It controls only WebScreen Realtime's resettable conversational
memory; it does not touch OpenClaw memory, `memory/`, `MEMORY.md`, `NOTES.md`,
ADB records or the Markdown that gives you your crucial context.

## Commands

```bash
atlas-context status
atlas-context empty
atlas-context compact
```

- `status` reports the local conversational-memory file and whether a semantic
  compacting pass is waiting for an active WebScreen session.
- `empty` erases that conversational filler and makes every connected
  WebScreen recreate its Realtime session with the same crucial Markdown.
- `compact` asks the next active WebScreen Realtime session to distil the
  completed exchanges into short, reusable facts, then restart itself. It is
  deliberately not a raw text chop; let Realtime preserve decisions,
  preferences, unfinished work and useful results.

If sami asks to forget the WebScreen conversation, clear its cache or start the
voice context fresh, use `atlas-context empty`. If he asks to keep the useful
bits but reduce its size, use `atlas-context compact`. Do not narrate this
housekeeping unless he asks; the UI shows its own progress bar.
