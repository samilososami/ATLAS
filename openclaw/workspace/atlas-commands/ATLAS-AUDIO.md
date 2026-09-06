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

The default scan lasts five seconds, prioritizes useful names and hides anonymous BLE noise. It prints a table:

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

`pair` does not require a previous `scan` or a cached BlueZ device. A MAC address is passed directly to BlueZ first; if the target is not currently visible, ATLAS starts active discovery and retries. A name is resolved from the live device view or active discovery before the same direct pairing attempt.

Connect a known/paired speaker and set it as default output:

```bash
atlas-audio connect "JBL Speaker"
```

`connect` also does not require a previous `scan` or cached entry. It accepts either a device name or a MAC address and attempts the connection directly. If BlueZ reports that the target is unavailable, ATLAS performs active discovery and retries instead of rejecting the request locally:

```bash
atlas-audio connect "JBL Quantum910"
atlas-audio connect AA:BB:CC:DD:EE:FF
```

If the device is not paired yet, put it in pairing mode first and use:

```bash
atlas-audio pair "JBL Speaker"
```

Disconnect:

```bash
atlas-audio disconnect "JBL Speaker"
```

If the user gives a loose name, try it directly. The command resolves exact names and unique partial names from the live view, then performs active discovery when necessary. If the name is ambiguous, ask one short clarification question.

## Default output

Set a sink, Bluetooth device name, or MAC as the default output:

```bash
atlas-audio default "JBL Speaker"
atlas-audio default bluez_output.XX_XX_XX_XX_XX_XX.1
```

After changing default output, currently playing streams are moved when possible.

## Quick output toggle

When sami asks to switch, alternate, or move the sound between the connected
Bluetooth speaker and the ATLAS A1 display speakers, use the fast path:

```bash
atlas-audio output-device-toggle
```

If Bluetooth is the current output, it switches to the available HDMI display
sink. From HDMI or another local output, it switches to the single connected
Bluetooth audio sink. The command also moves active playback streams, so do not
disconnect or re-pair the speaker just to change where sound comes out. If more
than one Bluetooth audio device is connected, choose explicitly with
`atlas-audio default` instead of guessing which pair of ears sami meant.

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

Known names resolve from BlueZ's records immediately, without a scan. Names
must match exactly or have one unambiguous partial match. A quiet radio cannot
hang discovery indefinitely: scans are bounded to 1–30 seconds and connections
to 25 seconds per attempt (at most two). Pairing keeps its agent alive during
the request and restores the previous pairable state afterwards.

`atlas-audio connect` waits for the target's `bluez_output...` sink before
selecting it. A Bluetooth “connected” message alone is not proof of a playable
audio route. It never restarts BlueZ, PipeWire or the browser to retry a profile
error: those resets used to interrupt the live voice session and app pairing.
`atlas-audio restart` remains an explicit disruptive repair, not a routine
connection step. `disconnect` without a name affects only the current or sole
connected audio device, not every Bluetooth device.

If you see:

```text
br-connection-profile-unavailable
```

this can be a local missing A2DP endpoint, not a broken speaker pairing. Inspect:

```bash
bluetoothctl show
systemctl --user status wireplumber
pactl list short sinks
```

The local controller needs an **Audio Source** UUID to play to an A2DP speaker.
On a headless A1, WirePlumber's logind seat monitor can suppress the entire
Bluetooth monitor even when `libspa-0.2-bluetooth` is installed. The repository
provides `system/config/wireplumber/51-atlas-headless-bluetooth.conf`, installed
only for the A1 audio user, to disable `monitor.bluez.seat-monitoring` while
leaving the rest of the audio policy unchanged.

From the repository, install this configuration and bounded command fixes with
`sudo system/install-device-connections.sh`. It makes a dated backup under
`~/.atlas/backups/` and does not restart audio by default. During a maintenance
window, `--restart-audio-manager` applies the setting with one WirePlumber
restart; BlueZ, PipeWire and the browser stay running. It may briefly recreate
audio devices, so do not apply it mid-conversation.

After Audio Source is registered, retry only the requested saved speaker.
If it still fails, check its selected Bluetooth input and whether another phone
owns the speaker. Do not remove pairings or reset unrelated connections.
Official explanation: [WirePlumber Bluetooth seat monitoring](https://pipewire.pages.freedesktop.org/wireplumber/daemon/configuration/bluetooth.html).

If you see:

```text
br-connection-page-timeout
```

the device exists in Bluetooth history, but it is not answering. Put the speaker/headset in Bluetooth pairing or connectable mode, keep it close to the Pi, then run:

```bash
atlas-audio scan 10
atlas-audio connect "device name"
```

Re-pair only when authentication actually requires it. Device off/out of range
or a page timeout does not imply that its saved pairing should be replaced.

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
