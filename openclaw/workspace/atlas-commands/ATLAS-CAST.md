# ATLAS Cast

This is your local casting bridge. Use it when sami asks you to put the ATLAS desktop on a TV, Chromecast, Android TV, or another Google Cast receiver.

You are not guessing from memory. Check the real network first, match the user's words to the available devices, and then act.

## The mental model

`atlas-cast` controls the transmission. It does not control windows, tabs, typing, or clicks. That belongs to `atlas-desktop`.

The normal flow is:

1. Say a short progress line if the user is waiting through voice: "I'll check the available TVs."
2. Run `atlas-cast list`.
3. Compare the discovered device names with the user's request.
4. If the match is obvious, start it. If it is ambiguous, ask one short confirmation question.
5. Once connected, use `atlas-desktop` for windows, pages, screenshots, and clicks.

Example:

```bash
atlas-cast list
```

Possible output:

```text
AudioPro C10 MkII — audio — Google Cast ADDON C10 MkII Speaker
SHIELD — cast — Google Cast SHIELD Android TV
SONY KD-43X81K — cast — Google Cast BRAVIA 4K VH21
```

If sami says "connect to my Sony TV", the intended match is probably `SONY KD-43X81K`. If there is only one Sony, you can say: "I found SONY KD-43X81K. Connecting now." If there are multiple plausible devices, ask.

Start casting:

```bash
atlas-cast start "SONY KD-43X81K"
```

Stop casting:

```bash
atlas-cast stop
```

Restart the last device:

```bash
atlas-cast restart
```

Restart a specific device:

```bash
atlas-cast restart "SONY KD-43X81K"
```

Check state:

```bash
atlas-cast status
```

## Fast discovery

`atlas-cast list` is optimized for speed. It uses mDNS/Avahi first and stores a short cache.

Use normal list for most requests:

```bash
atlas-cast list
```

Force a fresh network scan:

```bash
atlas-cast list --fresh
```

Use only the cache when speed matters more than freshness:

```bash
atlas-cast list --cached
```

When the user says something like "connect to the Sony" and you just scanned moments ago, cached results are valid. If the device does not connect, run a fresh list and try again.

## Quality profiles

The stream defaults to automatic quality:

```bash
atlas-cast profile auto
```

Auto mode starts from the best quality/speed balance and lowers quality when CPU, RAM, or Wi-Fi signal look weak.

Manual profiles:

```bash
atlas-cast profile 1080p
atlas-cast profile 720p
atlas-cast profile 540p
atlas-cast profile 480p
atlas-cast profile 360p
atlas-cast restart
```

Changing the profile affects the next stream start/restart. It does not magically change an already-running stream until you restart it.

## Boundaries

Chromecast is one-way screen/audio streaming. Touch events on the TV do not come back to the Raspberry Pi. If the TV is tactile, that touch is local to the TV; it will not drag ATLAS desktop windows unless a separate bidirectional control path exists.

Do not use `atlas-cast` to close browser tabs or clean RAM. Use:

```bash
atlas-desktop nuke
```

Do not stop OpenClaw Gateway just because casting stops. Cast is a display path, not the brain.
