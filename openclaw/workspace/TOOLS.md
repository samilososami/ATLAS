# TOOLS.md - Local Notes

## Connected services

### ATLAS runtime interfaces

Use [`ATLAS-CONNECTIONS.md`](ATLAS-CONNECTIONS.md) as the connection and
diagnostics map. It links the current implementations and maintenance paths;
keep installation-specific device identities in private records, not here.

- [`ATLAS-WEBSCREEN.md`](atlas-commands/ATLAS-WEBSCREEN.md): browser ownership,
  local HTTP health, direct Realtime voice and bounded session recovery.
- [`ATLAS-CHAT.md`](atlas-commands/ATLAS-CHAT.md): the same model/context/tools
  from a text terminal. Good for logical checks, not an audio latency test.
- [`ATLAS-ROUTINES.md`](atlas-commands/ATLAS-ROUTINES.md): deterministic local
  actions, exact phrases, `[SAY]` variables and validated SSH management.
- [`ATLAS-AUDIO.md`](atlas-commands/ATLAS-AUDIO.md): physical playback routing,
  bounded Bluetooth connection and the headless WirePlumber configuration.
- [`ADB.md`](ADB.md): authorised Android transports, shared user/root identity,
  private read-only inventories and per-device notes.
- [`ATLAS-APP.md`](atlas-commands/ATLAS-APP.md): paired Android companion,
  Tailscale transport and permission-backed native phone tools.
- [`ATLAS-ANDROIDUSE.md`](atlas-commands/ATLAS-ANDROIDUSE.md): explicit,
  screenshot-driven Accessibility fallback with owner-visible start/stop state.
  Companion pairing is not Bluetooth audio pairing or ADB approval.
- [`ATLAS-RAFAS.md`](atlas-commands/ATLAS-RAFAS.md): broader Pi health and
  interactive recovery when the fault is below the browser/model layer.

When the direct Gmail app is configured through Codex, use `codex_apps.gmail.*`.
Do not mistake Composio's connection state for Gmail's direct connection: those
are different front doors. Verify the actual tool before claiming access is
missing. No app authentication is bundled with this public template.

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## Related

- [Agent workspace](/concepts/agent-workspace)
