"""Command-line diagnostics for ATLAS Native Broker."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

try:
    from .native_broker import BrokerError, NativeBroker, public_session_summary, redact_sensitive
except ImportError:  # Allows ``python3 .atlas/broker/cli.py``.
    from native_broker import BrokerError, NativeBroker, public_session_summary, redact_sensitive


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(prog="atlas-broker", description="Diagnóstico del broker nativo de ATLAS")
    commands = value.add_subparsers(dest="command", required=True)
    commands.add_parser("health", help="Comprueba OAuth y Codex app-server")
    commands.add_parser("usage", help="Lee los límites Codex sin mostrar la cuenta")
    session = commands.add_parser("session", help="Reserva y valida un client secret sin mostrarlo")
    session.add_argument("--model", default="gpt-realtime-2.1")
    session.add_argument("--voice", default="marin")
    session.add_argument("--reasoning", default="default", choices=("default", "minimal", "low", "medium", "high", "xhigh"))
    return value


def main(argv: Sequence[str] | None = None, *, broker: NativeBroker | None = None) -> int:
    args = parser().parse_args(argv)
    owned = broker is None
    active = broker or NativeBroker()
    try:
        if args.command == "health":
            result = active.health(probe=True)
        elif args.command == "usage":
            result = active.usage()
        else:
            params = {
                "provider": "openai",
                "transport": "webrtc",
                "model": args.model,
                "voice": args.voice,
            }
            if args.reasoning != "default":
                params["reasoningEffort"] = args.reasoning
            result = public_session_summary(active.create_talk_session(params))
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except (BrokerError, OSError) as error:
        print(json.dumps({"ok": False, "error": redact_sensitive(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    finally:
        if owned:
            active.close()


if __name__ == "__main__":
    raise SystemExit(main())
