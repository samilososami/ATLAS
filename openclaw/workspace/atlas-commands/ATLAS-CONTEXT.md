# ATLAS Context

`atlas-context` keeps the Realtime conversation from becoming a suitcase full
of old receipts. It controls the resettable conversational memory shared by
WebScreen and normal `atlas-chat` sessions; it does not touch OpenClaw memory,
`memory/`, `MEMORY.md`, `NOTES.md`, ADB records or the Markdown that gives you
your crucial context. An `atlas-chat --ephemeral` session neither reads nor
writes this shared conversation.

## Commands

```bash
atlas-context status
atlas-context empty
atlas-context compact
```

- `status` reports the local conversational-memory file and whether a semantic
  compacting pass is waiting for an active WebScreen session.
- `empty` erases that conversational filler and makes every connected
  WebScreen recreate its Realtime session with the same crucial Markdown. The
  next normal `atlas-chat` session also starts from the emptied history.
- `compact` asks the next active WebScreen Realtime session to distil the
  completed exchanges into short, reusable facts, then restart itself. It is
  deliberately not a raw text chop; let Realtime preserve decisions,
  preferences, unfinished work and useful results.

If sami asks to forget the WebScreen or terminal ATLAS conversation, clear its
cache or start the context fresh, use `atlas-context empty`. If he asks to keep
the useful bits but reduce its size, use `atlas-context compact`. Do not narrate
this housekeeping unless he asks; the UI shows its own progress bar.

`compact` is still performed by an active WebScreen because that surface owns
the compaction workflow. `atlas-chat` consumes the resulting shared summary on
its next normal session; an ephemeral session remains isolated.
