# ATLAS Spotify

`atlas-spotify` is the local command interface for Sami's Spotify account. It
uses Spotify OAuth with PKCE: the account password is never given to ATLAS and
the renewable authorization is private state under `/home/atlas/.atlas/spotify/`.
The separate `atlas-spotifyd.service` is the local Spotify Connect player named
**ATLAS A1**. It includes librespot internally; do not launch a second standalone
librespot daemon beside it. Its non-secret player configuration also lives under
`/home/atlas/.atlas/spotify/spotifyd/`; the old standalone `spotifyd` directory
is not used.

## Core controls

```bash
atlas-spotify login
atlas-spotify status
atlas-spotify search "artist or song"
atlas-spotify play spotify:track:...
atlas-spotify pause
atlas-spotify resume
atlas-spotify volume 50
atlas-spotify queue spotify:track:...
atlas-spotify devices
atlas-spotify device connect "ATLAS A1"
```

Use `search` first when a spoken request does not identify one exact Spotify
URI. It returns the title, artist and URI. For a simple direct request such as
pause, resume or volume, act immediately and answer briefly.

`device connect` means Spotify Connect playback transfer, not a Bluetooth audio
pairing. `atlas-spotify` may control the active Spotify device only after Sami
has completed `login` and while Spotify Premium is active.

## Login from ATLAS A1 or another computer

`atlas-spotify login --browser` opens the authorization URL in ATLAS A1's local
browser. The callback remains on the Pi's loopback address and finishes itself.

For a browser on another computer, run `atlas-spotify login` through SSH. The
command prints the exact one-line local tunnel needed before opening the URL;
the browser and that tunnel must run on the same computer. This keeps the OAuth
callback private instead of exposing a credential receiver to the LAN.

## ATLAS A1 music output

The player initially sends music to the HDMI speakers of ATLAS A1 while spoken
ATLAS output stays on its normal PulseAudio default. `atlas-spotify output`
shows this dedicated local player state. A later output selector may route only
Spotify to a Bluetooth speaker without moving ATLAS speech; until then, use
`atlas-audio` only when Sami explicitly wants to change the global system output.

## Private listening history

`atlas-spotify-history.service` observes the local `spotifyd` MPRIS player and
appends each newly selected track to `/home/atlas/.atlas/spotify/HISTORY.md`.
Each line contains only its timestamp, title, album and artist. The record is
private runtime data: it is not committed, uploaded, injected into Realtime, or
used to infer listening preferences yet.
