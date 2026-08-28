# ATLAS Audio

This is your local audio output control on the Raspberry Pi. Use it when sami asks you to connect a speaker, choose where sound comes out, change volume, test audio, or prepare the Pi so your voice can be heard.

The command is:

```bash
atlas-audio
```

## The mental model

`atlas-audio` controls the physical/default audio output.

`atlas-say` creates spoken audio from text and plays it through that default output.

Use this split:

- Speaker, Bluetooth, volume, mute, default output -> `atlas-audio`
- Speaking a sentence through the current speaker -> `atlas-say`

## Status and outputs

Check the current audio state:

```bash
atlas-audio status
```

This shows:

- default output sink
- output description
- volume
- mute state
- Bluetooth controller state
- connected Bluetooth devices

List available audio outputs:

```bash
atlas-audio outputs
```

If only `auto_null` / `Dummy Output` appears, no real speaker is currently available to PulseAudio.

## Bluetooth speakers

Scan nearby Bluetooth devices:

```bash
atlas-audio scan
atlas-audio scan 12
```

Normal scan prioritizes useful names and hides anonymous BLE noise. It prints a table:

```text
NAME                             TYPE      MAC                RSSI PAIR CONN
--------------------------------------------------------------------------------
[LG] webOS TV UH668V             tv/media  A0:6F:AA:4E:C1:B3     -   no   no
JBL Speaker                      audio     XX:XX:XX:XX:XX:XX   -48  yes   no
```

Types:

- `audio` -> likely speaker/headphones/audio target.
- `tv/media` -> TV/media device, probably not the speaker you want unless sami asks for it.
- `iot` -> lights or smart-home devices.
- `named` -> has a useful name, but not clearly audio.
- `unknown` -> usually anonymous BLE noise.

Show everything, including anonymous BLE devices:

```bash
atlas-audio scan 10 --all
```

If a speaker does not appear, scan longer and make sure the speaker is in pairing mode:

```bash
atlas-audio scan 20
```

List known Bluetooth devices:

```bash
atlas-audio devices
atlas-audio devices --all
```

Pair a speaker:

```bash
atlas-audio pair "JBL Speaker"
```

`pair` does not require a previous `scan`. If the device is not in Bluetooth cache, it automatically scans for a matching name for a short time.

Connect a known/paired speaker and set it as default output:

```bash
atlas-audio connect "JBL Speaker"
```

`connect` also does not require a previous `scan`. It accepts either a device name or a MAC address:

```bash
atlas-audio connect "JBL Quantum910"
atlas-audio connect 34:DF:2A:6E:01:D2
```

If the device is not paired yet, put it in pairing mode first and use:

```bash
atlas-audio pair "JBL Speaker"
```

Disconnect:

```bash
atlas-audio disconnect "JBL Speaker"
```

If the user gives a loose name, try it directly. The command resolves exact names and unique partial names. If the name is not cached, it performs a short scan automatically. If the name is ambiguous, ask one short clarification question.

## Default output

Set a sink, Bluetooth device name, or MAC as the default output:

```bash
atlas-audio default "JBL Speaker"
atlas-audio default bluez_output.XX_XX_XX_XX_XX_XX.1
```

After changing default output, currently playing streams are moved when possible.

## Volume and mute

Set volume:

```bash
atlas-audio volume 70
```

Mute/unmute:

```bash
atlas-audio mute
atlas-audio unmute
atlas-audio toggle-mute
```

Volume accepts `0-150`, but prefer sane values like `50-85` unless sami asks for louder.

## Test audio

Play a short test tone:

```bash
atlas-audio test
```

If no sound is heard:

1. Run `atlas-audio status`.
2. Check whether the default output is `Dummy Output`.
3. If using Bluetooth, reconnect the speaker.
4. If PulseAudio looks stuck, run:

```bash
atlas-audio restart
```

## Bluetooth troubleshooting

`atlas-audio connect` repairs the common PulseAudio Bluetooth profile issue automatically:

- installs/uses `pulseaudio-module-bluetooth` when available
- loads `module-bluetooth-discover`
- restarts the local audio stack when needed
- waits for the `bluez_output...` sink before setting it as default

If you see:

```text
br-connection-profile-unavailable
```

the Pi can see the device, but the audio profile was not available. Run:

```bash
atlas-audio restart
atlas-audio connect "device name"
```

If you see:

```text
br-connection-page-timeout
```

the device exists in Bluetooth history, but it is not answering. Put the speaker/headset in Bluetooth pairing or connectable mode, keep it close to the Pi, then run:

```bash
atlas-audio scan 10
atlas-audio pair "device name"
atlas-audio connect "device name"
```

For the JBL Quantum headset seen on the local network, the device name is:

```text
JBL Quantum910
```

## Common flows

Connect to a JBL speaker:

```bash
atlas-audio scan 10
atlas-audio connect "JBL"
atlas-audio volume 70
atlas-audio test
```

Make sure ATLAS can speak:

```bash
atlas-audio status
atlas-say --tts elevenlabs "audio output is ready"
```

## Boundaries

`atlas-audio` does not generate speech. Use `atlas-say`.

`atlas-audio` does not control Chromecast. Use `atlas-cast`.

If the desktop is cast to a TV and the audio belongs to the cast stream, keep that in `atlas-cast`. Do not create a separate speaker route unless sami explicitly asks for split audio and accepts possible delay.
