# ATLAS Wake

This is the isolated local laboratory for ATLAS A1 wake-word detection. It is
not yet the production listener: WebScreen keeps its current Chrome-based
detector until the replacement passes real recordings and false-activation
tests.

## Current validation model

`hey_atlas.tflite` is an openWakeWord-compatible community model for **"Hey
Atlas"**. It validates the exact runtime used by ATLAS A1: a 16 kHz stream,
80 ms chunks and local TensorFlow Lite inference. It is not committed here;
the installation retrieves the pinned public release.

The production phrase is still under evaluation. A single **"Atlas"** is much
more prone to accidental activation than a two-word phrase, so it must earn its
place with measured recordings rather than confidence alone.

## Voice profiles

Run `atlas-wake enroll sami` to collect five local wake-phrase samples and a
short normal-speech reference. A second profile, such as `atlas-wake enroll
padre`, can be collected independently. Voice recordings live only under
`/home/atlas/.atlas/wakeword/profiles/` and are never committed or uploaded.

Profiles are preparation for the next verification stage. The initial
openWakeWord custom verifier can restrict activation to enrolled voices; a
separate speaker-identification layer is needed before ATLAS can confidently
name which enrolled person spoke.

## Commands

```sh
atlas-wake status
atlas-wake profiles
atlas-wake enroll sami
atlas-wake listen --threshold 0.55
```

`listen` is a manual diagnostic command. It is the only command here that opens
the microphone, and it must be stopped before another program takes exclusive
control of that device.
