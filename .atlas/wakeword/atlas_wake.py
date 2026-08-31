#!/usr/bin/env python3
"""Small local laboratory for ATLAS wake-word models and voice profiles.

The runtime is deliberately separate from WebScreen while its model is being
validated. Nothing starts listening automatically: `listen` and `enroll` are
explicit local actions.
"""

from __future__ import annotations

import argparse
import json
import queue
import re
import sys
import time
import wave
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path("/home/atlas/.atlas/wakeword")
MODELS = ROOT / "models"
PROFILES = ROOT / "profiles"
DEFAULT_MODEL = MODELS / "hey_atlas.tflite"
SAMPLE_RATE = 16_000
CHUNK_SAMPLES = 1_280  # 80 ms, the native openWakeWord streaming chunk.


def profile_path(name: str) -> Path:
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", name.strip().lower()).strip("-_")
    if not cleaned:
        raise ValueError("El nombre de perfil solo puede usar letras, números, - y _.")
    return PROFILES / cleaned


def require_runtime():
    try:
        import sounddevice as sd
        from pyopen_wakeword import OpenWakeWord, OpenWakeWordFeatures
    except ImportError as error:
        raise RuntimeError(
            "El runtime de wake word no está instalado. Ejecuta la instalación de ATLAS Wake."
        ) from error
    return sd, OpenWakeWord, OpenWakeWordFeatures


def write_wav(path: Path, frames: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


def print_status(_: argparse.Namespace) -> int:
    model_state = "ready" if DEFAULT_MODEL.is_file() else "missing"
    profiles = sorted(path for path in PROFILES.iterdir() if path.is_dir()) if PROFILES.exists() else []
    print("ATLAS Wake")
    print(f"Runtime model: {DEFAULT_MODEL.name} ({model_state})")
    print("Runtime phrase: Hey Atlas (temporary validation model only)")
    print("Custom-model recording target: Atlas")
    print("Production detector: Chrome wake detection remains active")
    print(f"Voice profiles: {len(profiles)}")
    for profile in profiles:
        manifest = profile / "profile.json"
        details = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {}
        print(f"  - {profile.name}: {details.get('state', 'samples present')}")
    return 0


def print_profiles(_: argparse.Namespace) -> int:
    if not PROFILES.exists() or not any(PROFILES.iterdir()):
        print("No voice profiles enrolled yet.")
        return 0
    for profile in sorted(path for path in PROFILES.iterdir() if path.is_dir()):
        positives = len(list((profile / "wake-positives").glob("*.wav")))
        negatives = len(list((profile / "normal-speech").glob("*.wav")))
        print(f"{profile.name}: {positives} wake samples, {negatives} normal-speech sample(s)")
    return 0


def enroll(args: argparse.Namespace) -> int:
    sd, _, _ = require_runtime()
    destination = profile_path(args.profile)
    positives = destination / "wake-positives"
    normal_speech = destination / "normal-speech"
    destination.mkdir(parents=True, exist_ok=True)

    print(f"Enrolling voice profile: {destination.name}")
    print(f'Say "{args.phrase}" naturally when each recording starts.')
    print("Use the same microphone and approximate distance as ATLAS A1.")
    try:
        for take in range(1, args.takes + 1):
            input(f"\nTake {take}/{args.takes}. Press Enter, then say the phrase once... ")
            audio = sd.rec(
                int(args.take_seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE,
                channels=1, dtype="int16", blocking=True,
            )
            write_wav(positives / f"take-{take:02d}.wav", audio.tobytes())
            print("Saved.")

        input(
            f"\nPress Enter and speak normally for {args.negative_seconds:.0f} seconds "
            "without saying the wake phrase... "
        )
        audio = sd.rec(
            int(args.negative_seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE,
            channels=1, dtype="int16", blocking=True,
        )
        write_wav(normal_speech / "reference-01.wav", audio.tobytes())
    except KeyboardInterrupt:
        print("\nEnrollment cancelled. The recordings already saved are preserved.")
        return 130

    manifest = {
        "profile": destination.name,
        "phrase": args.phrase,
        "sample_rate": SAMPLE_RATE,
        "wake_samples": args.takes,
        "normal_speech_seconds": args.negative_seconds,
        "created_at": datetime.now(UTC).isoformat(),
        "state": "samples collected; verifier not trained yet",
    }
    (destination / "profile.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("\nProfile recorded locally. It is not sent anywhere and is not yet enabled for access control.")
    return 0


def listen(args: argparse.Namespace) -> int:
    if not DEFAULT_MODEL.is_file():
        raise RuntimeError(f"Missing model: {DEFAULT_MODEL}")
    sd, OpenWakeWord, OpenWakeWordFeatures = require_runtime()
    detector = OpenWakeWord.from_model(DEFAULT_MODEL)
    features = OpenWakeWordFeatures.from_builtin()
    audio_queue: queue.Queue[bytes] = queue.Queue(maxsize=30)
    cooldown_until = 0.0
    latest_score = 0.0

    def callback(indata, _frames, _time_info, status) -> None:
        if status:
            print(f"audio warning: {status}", file=sys.stderr)
        try:
            audio_queue.put_nowait(indata[:, 0].tobytes())
        except queue.Full:
            pass

    print(f'Listening with {DEFAULT_MODEL.name}; say "Hey Atlas". Threshold {args.threshold:.2f}.')
    started = time.monotonic()
    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE, channels=1, dtype="int16", blocksize=CHUNK_SAMPLES,
            callback=callback,
        ):
            while args.seconds <= 0 or time.monotonic() - started < args.seconds:
                try:
                    chunk = audio_queue.get(timeout=1.0)
                except queue.Empty:
                    continue
                for embedding in features.process_streaming(chunk):
                    for score in detector.process_streaming(embedding):
                        latest_score = float(score)
                        now = time.monotonic()
                        if latest_score >= args.threshold and now >= cooldown_until:
                            print(f"WAKE score={latest_score:.3f}")
                            cooldown_until = now + args.refractory_seconds
    except KeyboardInterrupt:
        pass
    finally:
        detector.close()
        features.close()
    print(f"Stopped. Last score={latest_score:.3f}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="atlas-wake", description="ATLAS local wake-word laboratory")
    subparsers = parser.add_subparsers(dest="command", required=True)

    status = subparsers.add_parser("status", help="show model and profile state")
    status.set_defaults(handler=print_status)
    profiles = subparsers.add_parser("profiles", help="list locally enrolled voice profiles")
    profiles.set_defaults(handler=print_profiles)

    enroll_parser = subparsers.add_parser("enroll", help="record a local voice profile")
    enroll_parser.add_argument("profile", help="profile name, e.g. sami or padre")
    enroll_parser.add_argument("--phrase", default="Atlas")
    enroll_parser.add_argument("--takes", type=int, default=5)
    enroll_parser.add_argument("--take-seconds", type=float, default=2.5)
    enroll_parser.add_argument("--negative-seconds", type=float, default=12.0)
    enroll_parser.set_defaults(handler=enroll)

    listen_parser = subparsers.add_parser("listen", help="test the staged model through the default microphone")
    listen_parser.add_argument("--threshold", type=float, default=0.55)
    listen_parser.add_argument("--seconds", type=float, default=0.0, help="0 keeps listening until Ctrl+C")
    listen_parser.add_argument("--refractory-seconds", type=float, default=2.0)
    listen_parser.set_defaults(handler=listen)

    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError) as error:
        print(f"atlas-wake: {error}", file=sys.stderr)
        raise SystemExit(2) from error
