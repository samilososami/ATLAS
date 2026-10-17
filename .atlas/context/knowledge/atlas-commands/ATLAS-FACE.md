# atlas-face

Change the connected `/new/` WebScreen face from a local shell or `atlas-chat`.
Prefer the browser-local `atlas_face` tool when it is already available.

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
atlas-face status --json
atlas-face reset
```

`happy` aliases `delighted`; `sleep` aliases `asleep`. Ordinary faces last
15 seconds and accept 1–30 seconds; commanded sleep defaults to an hour and
accepts 1–3600 seconds. New user input wakes the face; wake recognition and
audio never stop, and every expression can talk. Face choice is optional and
must not delay a useful spoken answer.

The installed catalogue has 323 names: the 23 original expressions plus two
collections of 150 additions. `list --details` provides names, labels and categories; `list --json`
provides compact metadata without geometry. Discover the installed names when
needed rather than loading all their paths or images into conversational
context. A legacy deployment without the generated catalogue lists only its
23 original faces; use its actual supported vocabulary.

Neutral is the normal baseline. Most brief answers need no new expression.
Use one only when it contributes to the meaning, and at most two meaningful
changes in a longer answer whose tone genuinely shifts. Avoid random faces,
repeated cosmetic calls, exaggerated acting or an extra model to select them.
The renderer supplies entry/exit transitions and independent talking-mouth
animation; changing a face must not reset or delay the voice. Do not narrate
the face change. Respect the interface's automatic connection/USB feedback.
An explicit request to make a face should actually select it, not merely say
that you did. Clear emotional cues can justify a small matching expression even
in a short reply; simple factual questions normally stay neutral. Useful newer
choices include the installed clarification, repair/trust and attentive-listening
families. Use the list for exact supported IDs, never invented variants.

Conversational expressions remain ready during TTS preparation and start their
duration with actual playback. They return smoothly at whole-turn completion;
short gaps between audio chunks do not reset them. No extra face call is needed
to perform that return. Explicit sleep and CLI commands keep their own duration.

The browser may supply a restrained local fallback for a clear personal praise,
achievement, bad day or shared challenge when no face was selected. It runs at
actual playback, uses only the current confirmed user text, and records a local
cue rather than a model action. You need not repeat it or narrate it. Your later
choice has priority; the combined total remains at most two visible changes.

`music_headphones`, `tv_connected` and `speaker_connected` are visual states,
not commands to start music or connect hardware. Use the real command/tool and
verify the outcome before a corresponding success expression. Cartoon tiredness
or anger never means real suffering, refusing help or blaming Sami.

`clock` stores a persistent 24-hour idle display for `/new/`; `clock off`
returns to the normal face. Wake, listening and speaking override it only while
they are active. The session-local `atlas_display_mode` tool is preferred when
Sami explicitly asks for modo reloj; it never changes audio or the controller.

Normal WebScreen can accept a follow-up begun within three seconds after
actual playback ends, without a new wake word. The voice controller owns that
window and allows the accepted utterance to finish; expression duration does
not control it. It does not apply to text or WhatsApp sessions.

The single `/usr/local/bin/atlas-face` executable works for the runtime user
and root. It uses fixed loopback HTTP on port 5000; `ATLAS_WEBSCREEN_PORT`
can choose another local port. An unavailable backend produces a nonzero
exit status instead of pretending that the face changed.

Complete expression vocabulary, access boundary, approximate browser TTS
fallback and offline tests: `/home/atlas/.atlas/webscreen/FACE.md`.
Installer: `system/install-webscreen-resilience.sh` in the repository.
