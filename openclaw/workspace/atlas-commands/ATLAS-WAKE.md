# ATLAS Wake

`atlas-wake` is ATLAS A1's isolated local laboratory for wake-word detection.
It is intentionally separate from WebScreen while the trigger is being measured
in the real room. The current validation runtime model listens for `Hey Atlas`,
but all new voice profiles record the production word `Atlas`. Neither model
may be silently enabled as the production listener.

## Commands

- `atlas-wake status` shows the staged model and how many local profiles exist.
- `atlas-wake profiles` lists the locally recorded profiles without exposing
  their raw recordings.
- `atlas-wake enroll sami` records a profile after Sami explicitly asks. Use the
  same microphone and usual speaking distance as ATLAS A1.
- `atlas-wake enroll padre` can collect a second local profile in the same way.
- `atlas-wake listen --seconds 30` is a deliberate microphone test. Do not run
  it while WebScreen owns the microphone unless Sami asks to test it.

## Voice profiles

Profiles are private local recordings in `/home/atlas/.atlas/wakeword/profiles`.
They are not sent to a cloud provider, committed to Git, or used for access
control until their false activations and missed activations have been tested.
They can later filter the wake word to Sami only, or identify Sami versus his
father after a longer utterance. A voice profile is a convenience filter, not a
security boundary: ATLAS still needs conventional access control before any
network-exposed use.
