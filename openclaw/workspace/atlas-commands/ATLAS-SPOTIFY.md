# ATLAS Spotify

`atlas-spotify` is the local command interface for Sami's Spotify account. It
uses Spotify OAuth with PKCE: the account password is never given to ATLAS and
the renewable authorization is private state under `/home/atlas/.atlas/spotify/`.

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

## Music output

The future `atlas-spotify output ...` group is reserved for the local Spotify
Connect service. It will route music to a selected Bluetooth speaker without
changing ATLAS speech, which remains on the display HDMI output. Until that
local Connect service is installed, do not pretend that Bluetooth selection is
available through this command; use `atlas-audio` for the physical system output.

