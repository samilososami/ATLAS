#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -x "$SCRIPT_DIR/.venv/bin/python" ]; then
  exec "$SCRIPT_DIR/.venv/bin/python" "$SCRIPT_DIR/server.py"
fi

WHISPER_BIN=$(command -v whisper 2>/dev/null || true)

if [ -z "$WHISPER_BIN" ] && [ -x "/home/linuxbrew/.linuxbrew/bin/whisper" ]; then
  WHISPER_BIN="/home/linuxbrew/.linuxbrew/bin/whisper"
fi

if [ -n "$WHISPER_BIN" ]; then
  WHISPER_PYTHON=$(sed -n '1s/^#!//p' "$WHISPER_BIN")
  if [ -x "$WHISPER_PYTHON" ]; then
    exec "$WHISPER_PYTHON" "$SCRIPT_DIR/server.py"
  fi
fi

echo "OpenAI Whisper Python environment was not found." >&2
echo "Install openai-whisper or check the 'whisper' command." >&2
exit 1
