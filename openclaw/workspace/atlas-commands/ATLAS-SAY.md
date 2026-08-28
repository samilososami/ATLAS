# ATLAS Say

This is the direct spoken-output command on the Raspberry Pi. It converts text with ElevenLabs and plays the resulting audio through the current default output.

```bash
atlas-say "hola sami"
atlas-say --tts elevenlabs "hola sami"
```

The default voice ID and API key come from the existing OpenClaw/sag configuration. Do not print secrets. Override the voice for one utterance with:

```bash
atlas-say --voiceid "<voice_id>" "texto"
```

Generate the audio without playing it:

```bash
atlas-say --no-play "mensaje de audio"
```

Generated `.mp3` files are temporary and are stored in:

```text
/home/atlas/.openclaw/workspaces/tmp
```

`atlas-say` plays through the current default audio output. Configure the speaker first with `atlas-audio` when necessary.

Spoken output should be shorter than text by default. Avoid long explanations unless sami asks for narration, a story, or a detailed spoken answer.
