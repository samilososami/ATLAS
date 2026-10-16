# Focused diagnostics

Read-only inspection comes before repair. Use a focused command for one fact;
`atlas-status` is useful for a broad overview, not a prerequisite for every read.

## Services and logs

The native HTTP/Realtime backend is `atlas-webscreen.service`; the physical
browser is `atlas-screen-kiosk.service`. They are different components. Confirm
the live unit and any overrides before conclusions:

```sh
systemctl show atlas-webscreen.service -p LoadState -p ActiveState -p SubState -p UnitFileState -p MainPID -p FragmentPath
systemctl is-enabled atlas-webscreen.service
journalctl -u atlas-webscreen.service -p err -n 10 --no-pager
```

`not-found`, a zero MainPID, insufficient journal permissions or limited retention
are not evidence of a healthy service or an error-free history. Do not restart
anything for a read-only question. Group actual errors without exposing tokens,
personal messages or full private payloads.

WebScreen's file logs are under `/home/atlas/.atlas/webscreen/logs`; measure
with `du -sh /home/atlas/.atlas/webscreen/logs`, which need not read conversation
contents. For **all** ATLAS logs, discover other log directories beneath
`/home/atlas/.atlas` and label the measured scope; distinguish journal storage
from application files. Do not delete logs when asked only to measure them.

The packaged backend starts `/home/atlas/.atlas/webscreen/start.sh`, which selects
its Python environment. For the running interpreter, obtain the validated nonzero
MainPID of the loaded unit and inspect `/proc/PID/exe`; query that interpreter's
version separately from `python3 --version`. `uname -r` reports the kernel.
Do not dump process environments or full command lines containing secrets.

An HTTP server header, kernel version and Git commit are not interchangeable
with the installed ATLAS release. Inspect the documented installation metadata
or the actual checkout corresponding to the running files; report its provenance
and dirty state if using Git. If no release is recorded, say so rather than
inventing one or treating `command -v` as a version query.

## Device identity and network

Resolve the user's known alias from private device records before querying a
peer. Match Tailscale hostname/address to that device, not to the Wi-Fi interface
or the first peer. `tailscale status` and a bounded `tailscale ping` to the resolved
peer can distinguish the currently observed direct and relayed path. Same LAN
does not guarantee direct connectivity; cached/offline state is not a fresh
latency measurement. Do not change routes while diagnosing read-only.

## Measurements and experiments

Use explicit timestamps and one metric per interval: final speech end → VAD
commit → first model content → TTS request → first audio available → playback
start → first audible word. A pause followed by more speech is not the final
speech end. A first token, synthesis-start event and acoustic first word are
different measurements; report unavailable boundaries instead of substituting
them silently. Compare identical inputs and settings over repeated trials,
separating warm/cold runs and network variability. Pre-generated audio measures
playback, not TTS generation latency.

For audio faults, separate acoustic echo, mechanical vibration and ambient noise.
Change one variable at a time and predict the discriminating observation before
the test. An obstructed mic can reduce/distort desired speech; do not infer that
this primarily breaks echo cancellation or its output reference without evidence.
Do not change hardware when the user asks only for the next experiment.
