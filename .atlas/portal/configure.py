#!/usr/bin/env python3
"""Initial private configuration. Password is read without echo, never in argv."""
import argparse
import getpass
import json
import os
import secrets
from pathlib import Path
from auth import password_hash

parser = argparse.ArgumentParser()
parser.add_argument("--directory", default=str(Path(__file__).resolve().parent / "runtime"))
args = parser.parse_args()
directory = Path(args.directory)
directory.mkdir(mode=0o700, parents=True, exist_ok=True)
target = directory / "config.json"
if target.exists():
    raise SystemExit("La configuración ya existe; no se sobrescribe automáticamente.")
password = getpass.getpass("Contraseña del portal (entrada oculta): ")
if len(password) < 5 or len(password) > 256:
    raise SystemExit("Longitud de contraseña no admitida.")
config = {"password_hash": password_hash(password), "session_key": secrets.token_hex(32),
          "origins": ["https://atlas.samilososami.com", "https://atlas-a1.emu-stonecat.ts.net"],
          "upstream": "http://127.0.0.1:5000"}
password = ""
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as handle:
    json.dump(config, handle)
print("Configuración privada creada. Solo se guarda el hash de la contraseña.")
