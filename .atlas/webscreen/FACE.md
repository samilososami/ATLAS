# ATLAS expressions

`atlas-face` changes the visible face on connected, authorized `/new/` pages.
It is visual only: sleep keeps voice input, wake recognition and audio alive.
The executable is installed globally in `/usr/local/bin` for the runtime user
and root by `system/install-webscreen-resilience.sh`. It uses Python's standard
library, needs no user-specific configuration or sudo, and always contacts
`127.0.0.1` on port 5000 (`ATLAS_WEBSCREEN_PORT` can select a local port).

```sh
atlas-face list
atlas-face list --details
atlas-face list --json
atlas-face ambitious --duration 12
atlas-face needs_detail --duration 6
atlas-face music_headphones --duration 10
atlas-face happy
atlas-face sleep --duration 300
atlas-face clock
atlas-face clock off
atlas-face mode --json
atlas-face usb
atlas-face usb detach
atlas-face status --json
atlas-face reset
```

## Catalogue and restraint

The catalogue contains **323 expressions: 23 preserved and two authored collections of 150**. Its
canonical repository source is `expressions/catalog.json`, with generated
browser/deployment assets in `static/new/expressions-catalog.json` and
`static/new/expressions-catalog.js`. Do not hand-edit a generated copy: regenerate
from the expressions builder and deploy the matching catalogue with the engine.

`atlas-face list` prints the complete installed IDs; `list --details` adds the
human label and category. `list --json` retains `expressions` and `aliases` and
adds compact `expressionDetails` (`id`, `label`, `category`, `legacy`) and
`catalogVersion`. Geometry is deliberately absent from this response and from
normal conversation context. The CLI reads at most 64 KiB and rejects an
oversized response explicitly instead of silently truncating it.

The backend reads its local JSON once at startup, with a 1 MiB file limit, a
23–512 entry limit, unique bounded IDs, bounded labels/categories and preservation
of every legacy name. If that asset is missing, an older deployment can still
use the 23 legacy expressions. A present malformed, oversized or incompatible
catalogue fails clearly; it never silently switches to a different vocabulary.
Restart the backend after replacing the generated catalogue.

The 23 preserved IDs are neutral, angry, defiant, delighted, surprised, curious,
skeptical, sad, worried, sleepy, wink, laughing, focused, shy, ambitious,
confident, affectionate, confused, embarrassed, relieved, bored, excited and
asleep. The first 150 additions cover welcome, warmth, humour, confidence, focus,
curiosity, uncertainty, care, disappointment, boundaries, energy, celebration,
music, devices and assistance. Examples: `needs_detail`, `curious_smile`,
`challenge_accepted`, `music_headphones`, `tv_connected`, `speaker_connected`
and `back_to_you`. The next 150 cover acknowledgment, listening, clarification,
reasoning, troubleshooting, discovery, storytelling, playful company, emotional
grounding, creative work, research, pacing, repair/trust, audiovisual moments and
everyday help. Consult the installed list instead of inventing a name.

Most brief factual answers need **no expression change**: neutral is the
baseline, not a failure to express personality. Keep a suitable face rather
than changing it every sentence. A longer reply may have at most two meaningful
changes when its meaning or mood genuinely changes. Avoid random selection,
face cycling, forced reactions, and a classifier/model round trip for cosmetics.
Do not compete with automatic connection, USB or other interface feedback.
Expressions never establish that an action succeeded: `tv_connected` is not
evidence of a television connection, and headphones do not start Spotify.
The tool may change appearance only; perform and verify real device operations
through their existing tools first. Explicit user requests for a particular
face remain distinct from automatic conversational selection.

Aliases: `happy` → `delighted`, `sleep` → `asleep`. Ordinary CLI expressions last
15 seconds by default and accept 1–30 seconds. Sleep defaults to one hour and
accepts 1–3600 seconds; user input wakes the visible face immediately.
`reset` restores neutral. A server restart clears the ephemeral command state.
The latest expression replaces the previous command; there is no replay queue.
`status` reports the server's last live command, not each screen's current pose.
A screen awakened locally can already be neutral while that command remains
available to other screens; reconnecting the same screen does not replay it.

The existing model tool uses `AtlasFaceBridge.expression()` locally in the
browser. It does not need a shell, network classifier or cosmetic model turn.
The CLI is useful from ordinary shell tools, including `atlas-chat`.

Conversational poses wait for actual playback before their duration starts;
inter-chunk silence does not retire them, and final turn completion returns to
neutral. A bounded local fallback can supply a small gesture for clear personal
praise, an achievement, a bad day or a shared challenge if the model has not
selected one. It reads only the confirmed current user input at playback start,
rejects quoted/reported/ambiguous text, and never analyzes tool or web output.
Its provenance is `face.conversation_cue`, not a model tool call. Manual poses
and device events take precedence. A later model choice may replace the cue
immediately but still counts toward the two-visible-change limit. There is no
extra inference or network call; this conservative rule is not a general
emotion recognizer. Sleep and CLI durations remain independent.

## Persistent display mode

`atlas-face clock` activates the new WebScreen's 24-hour clock;
`atlas-face clock off` returns to the face, and `atlas-face mode` reports the
saved choice. This preference is distinct from an expression and is stored
atomically in `.runtime/webscreen-display-mode.json`, so it survives browser and
WebScreen restarts. While the clock is visible, the shared controller still
waits for ATLAS. Wake, listening, processing and actual playback temporarily
replace it; the clock returns when the controller is idle again.

On `/new/`, Realtime may use `atlas_display_mode` only when Sami explicitly
asks to activate or deactivate modo reloj. It changes no audio, microphone,
Wi-Fi, device or Realtime state. The face layer has a linking animation while
the session connects and a crossed Wi-Fi glyph only when the browser reports an
offline network; those are feedback, not recovery paths.

## Motion and physical USB feedback

The 2026-10-01 revision follows the generated design reference in
`assets/face-concepts/20261001-motion/reference.png`: a single azure loading
ring, a rounded crossed Wi-Fi glyph, large rounded clock outlines without a
card, and a USB plug seating in or withdrawing from its socket. USB artwork is
20% larger, with the connector clipped at the socket's lower lip so it cannot
pass through the opening. Symbol transitions use a short
crossfade, small displacement and focus transition. The clock uses native SVG
digit outlines so font availability cannot change its appearance on the Pi.

`usb_monitor.py` passively listens to kernel USB-device attach/remove events
on the A1. Devices already attached at startup are the baseline, but their later
unplug/replug is announced. Root buses, composite interfaces, fixed internal
devices and A1's `1a86:e5e3` touch-screen controller are excluded. External
microphones (including `4c4a:4155`), storage, keyboards and external hubs count.
Exclusion is by device identity, not physical port. Duplicate additions and
enumeration bursts are coalesced. A sysfs reconciliation every 2 seconds catches
late attributes/missed events; `devnum` detects a replug at the same port.
A 1-second sysfs fallback is used if kernel events are unavailable. No device is opened,
mounted or executed, and no product name/serial is sent to browsers.

The existing authenticated display feed carries an ephemeral `usb.id`,
`usb.kind` (`attached` or `detached`) and `usb.ageMs`. A fresh attachment or
removal in idle **face or clock** mode plays one 2.4-second insertion or reverse
withdrawal animation and returns to the previous display, without
changing the persistent mode. The USB visual also takes precedence over a
connecting/offline screen, because attaching a microphone can rebuild the audio
source. Active voice or a hidden page take priority; missed events are not queued
for later. Page load and process restart prime the cursor without replaying an
old event. Opposite-direction events interrupt the current animation; repeated
events in the same direction are coalesced. USB history is not persisted in the
clock preference file. `atlas-face usb` previews insertion and
`atlas-face usb detach` previews removal through the same event feed;
it does not reconnect, reset or access a USB device and works for user/root.

## Transport and trust

`POST /api/internal/face` accepts JSON `{action: "set", expression, duration}`
or `{action: "list" | "status" | "reset"}`. Duration is in seconds. It trusts
local OS users and requires a loopback peer, an exact loopback Host with the
server port, JSON content type, no browser Origin/fetch metadata, no transfer
encoding, one content length, at most 1024 bytes and known fields/values.
The CLI disables proxies and redirects; it cannot select an arbitrary URL.

`GET /api/face/events?after=<cursor>` reuses the page's `X-Atlas-Client` lease.
This is the existing WebScreen access boundary, not a new account login.
It waits on a condition for at most 12 seconds, with at most eight concurrent
listeners. State changes wake listeners immediately, expiry yields neutral,
and the opaque cursor includes a process epoch for reconnect after restart.
Clients abort on hidden/released pages and back off after errors. Responses
contain the current state, sequence, remaining milliseconds and UTC expiry.

`POST /api/internal/display-mode` accepts either `{action: "status"}` or
`{action: "set", mode: "clock"|"face"}`, or
`{action: "preview_usb"|"preview_usb_remove"}` under the same loopback non-browser
boundary, with a 256-byte JSON limit. Browser pages use authenticated
`GET/POST /api/display-mode` and `GET /api/display-mode/events?after=<cursor>`.
The mode feed is latest-only, bounded and stops on a hidden/released page.

## Rendering and articulation

The new expressions are SVG paths in the existing fixed eye sockets. They keep
the blue gradient/glow, mouth position, dark background and minimal HUD. The
concept sheet under `assets/face-concepts/20260926/` is design reference only.
Expression transitions take 180 ms (clap arrival 120–160 ms); rendering begins
on the next browser frame. This is not an imperceptible 1 ms transition.
Reduced-motion preferences disable decorative transitions and movement.

Every expression can articulate, including commanded sleep. Actual PCM levels
drive native and captured external audio. Browser SpeechSynthesis word events
drive the mouth when available. Engines without those events use deterministic
approximate word timing based on text and speech rate, starting only after
the real utterance start, stopping on pause/end/error/cancel, and immediately
yielding to genuine boundaries. This fallback is not audio amplitude or a
claim of phoneme synchronization. The resting mouth returns when speech ends.

Each catalogue entry includes its own entry and exit motion specification.
Eyebrows and headphone bands use the original smile's 26-unit weight. Ear pads
are filled, separated from the eyes, and joined to the band. Geometry crossfades
take 180–240 ms; the restrained gesture independently settles over 400–560 ms.
The 300 authored poses are geometrically unique, but intentionally share seven
coherent gesture primitives instead of hundreds of unrelated motion styles.
The neutral baseline's eye sockets, blue colour and mouth stroke are not
globally enlarged to make expressions more noticeable. Subtle asymmetry,
eyelids and brows are valid expressions; accessories such as headphones remain
visual additions rather than a different character. Returning to the resting
face is an animated transition too, not an abrupt replacement. Reduced motion
still takes precedence over decorative motion.

Mouth articulation is independent of expression selection and the voice
provider. Do not issue new face calls for every audio chunk or switch to a
generic mouth-only expression just because speech begins. Visual tiredness,
sleep and sadness are cartoon cues, not actual suffering or reasons to withhold
help.

Conversational model expressions use an `awaitSpeech` lease. Their requested
duration starts at the first actual audio playback, not during tool execution or
TTS preparation; chunk boundaries cannot restart it. A no-playback timeout of
45 seconds prevents a stuck expression. `expressionPlayback({active:false,
final:true})` releases only that lease at whole-turn completion. Commands, sleep,
petting and verified action feedback keep their independent lifetimes. Reset or
cancellation retires the lease so late playback cannot resurrect it. At most two
semantic changes remain allowed; a real-tool continuation can use the second,
whereas a face-only continuation cannot recursively call the cosmetic tool.

## Conversation continuation is not a face action

Normal WebScreen's voice controller may open a three-second follow-up window
after actual audible playback finishes. A user can begin another utterance
inside it without repeating ATLAS and finish that utterance normally. Silence
returns to wake-word listening. This timing belongs to the voice controller,
not `atlas-face`, the catalogue or an expression timeout. Face sleep never
disables the wake word. Text-only clients and WhatsApp personas do not acquire
a microphone or this follow-up behaviour from a face command.

Offline checks: `python3 -m unittest discover -s .atlas/webscreen`,
`node --test .atlas/webscreen/test_face_*.cjs` and the focused system installer
tests. Browser captures use a local fixture without microphone or paid APIs.
