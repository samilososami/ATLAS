# WebScreen reliability — verification, 6 September 2026

## Scope and findings

Reviewed 7,373 historical Realtime events plus current HTTP, system, audio and
device logs. Historical provider/transcription failures, session expiration,
browser lease failures and Bluetooth profile availability are separate faults.
A provider 500 is not sufficient evidence to reset OAuth.

The deployment adds bounded lease/ICE recovery, fresh-token registration after
401 (including interrupted bodies), lifecycle/response guards, startup and
progress deadlines, and idle session renewal. It preserves a single owner and
does not replay uncertain actions. Chrome request and follow-up text bypasses
the auxiliary transcriber; fresh result indices prevent old speech being sent
again. Statements and questions both allow ten seconds of follow-up.

Cancel-before-ACK and cancelled tools returning late have dedicated guards.
The backend bridge recovers without an unhandled idle promise or blocking HTTP
startup. HTTP request bodies and normal keep-alive closure are handled correctly.

On A1, WirePlumber seat monitoring prevented A2DP endpoint registration in the
headless session. A per-user configuration restored Audio Source/Sink endpoints.
The paired soundbar then connected. Audio helpers now resolve aliases/sinks
correctly and bound scans without restarting the whole audio stack. ADB shares
the authorised user identity and preserves inventory on transient failures.

## Checks

| Check | Observed result |
| --- | --- |
| WebScreen Python tests | 70 passed |
| WebScreen JavaScript tests | 125 passed |
| System/helper Python tests | 82 passed |
| Live Realtime voice output | Actual OAuth/WebRTC sessions, native Marin output, no JavaScript exceptions |
| Follow-up without ATLAS | Answered correctly within the conversation window |
| One dropped heartbeat | Same peer/session and control retained |
| Simulated expired token | Fresh access and a ready replacement Realtime session |
| Cancel immediately before provider ACK delivery | Exact response ID cancelled; one creation, no revived response/action |
| atlas-chat ephemeral diagnostic | Real uname/uptime/service query, correct answer, one shell call |
| Bluetooth soundbar | Connected, sink registered; quiet playback command completed |
| Authorised Android TV | ADB connection and harmless model query succeeded |
| Normal/root entry points | Audio and ADB commands checked under both identities |
| Responsive UI | 320/390/600 px without card overlap; 1024/1280 desktop/kiosk preserved |

The 277 automated tests are not 277 physical-device interactions. Deliberate
network failures in browser QA produce expected console network/401 notices.
No temporary speaker-volume/default-route changes remain. Private device notes,
keys and pairings are preserved; neither full Wi-Fi resets nor re-pairing were
used. The eight deployed WebScreen source hashes matched the tested checkout.

## Timing, method and limits

Three runs used a real Realtime session and full configured context, with three
short repeated prompts: greeting, arithmetic and a brief welcome. Recognition
results were injected at Chrome's callback boundary, **not spoken through the
physical microphone**. Native audio timing ends at the provider's
`output_audio_buffer.started` event, not a microphone recording of the speaker.

| Measurement | Result |
| --- | --- |
| First request in each session, recognition callback to native buffer start | 3.075 / 2.662 / 2.946 s |
| Subsequent short prompts, six samples | 1.214–1.350 s |
| Follow-up without another wake word, two samples | 1.085 / 1.278 s |
| Terminal diagnostic, first text / complete result | 2.68 / 3.01 s |

The 1–3 s goal is close for these controlled short turns, but is **not a general
guarantee**. These repeated prompts do not represent long answers, slow tools,
uncached context or a poor network. Native Marin was selected only for the test
requests; A1's saved browser voice was preserved. SpeechSynthesis and ElevenLabs
have different latency paths and cannot inherit these numbers.

A separate prerecorded-WAV test using headless Chrome's real speech recognizer
timed out without recognition. It does not validate or diagnose room acoustics.
A quiet physical playback command also does not prove a person heard sound or
that the microphone correctly recognised the wake. Those end-to-end acoustic
checks still require a physical spoken trial. A brief SSH interruption recovered
without a network reset; no unobserved Wi-Fi root cause is claimed fixed.

## Reproduction and maintenance

```sh
python3 -m unittest discover -s .atlas/webscreen -p 'test_*.py'
node --test .atlas/webscreen/test_*.cjs
python3 -m unittest discover -s system -p 'test_*.py'
```

See [the operational map](../openclaw/workspace/ATLAS-CONNECTIONS.md),
[WebScreen](../.atlas/webscreen/README.md) and
[audio](../openclaw/workspace/atlas-commands/ATLAS-AUDIO.md). Focused installers
create dated backups. Apply private documentation changes as narrow patches,
never overwrite a live private workspace with public templates. Reload the
actual kiosk after a deployment and verify session-ready logs separately from
the service's active status. If Chrome itself stalls on reload, restart only
the kiosk after confirming there is no live action to interrupt.
