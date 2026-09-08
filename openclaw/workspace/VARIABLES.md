# Variables - The labels on your drawers

Keep non-secret installation constants here: model choices, local paths and
device labels. Fill them in with your human after setup. Empty is better than
borrowing somebody else's settings.

- Runtime home: `/home/atlas/.atlas` on the reference ATLAS OS installation.
- WebScreen projects: `/home/atlas/.atlas/webscreen/workspace`.
- Model: use the model configured locally in OpenClaw.
- Voice: choose locally in WebScreen settings.
- WebScreen ElevenLabs model: `eleven_flash_v2_5` by default for interactive
  latency; override it with `ATLAS_WEBSCREEN_ELEVENLABS_MODEL` only when a
  different quality/latency trade-off is intentional.

Never put API keys, OAuth tokens, passwords or Wi-Fi credentials in this file.
