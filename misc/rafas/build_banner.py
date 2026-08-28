"""Generate the plain-text banner at build time; RAFAS needs no Python runtime."""
from pathlib import Path
import re
import pyfiglet

ROOT = Path(__file__).resolve().parents[2]
logo = re.sub(r'\$[0-9]', '', (ROOT / 'system/share/atlas/atlas-logo-compact.txt').read_text()).strip('\n').splitlines()
title = pyfiglet.figlet_format('R . A . F . A . S', font='standard', width=200).rstrip('\n').splitlines()
right = [''] * 3 + title + ['Recovery Access For ATLAS Systems']
width = max(map(len, logo)) + 4
lines = ['', '']
for row in range(max(len(logo), len(right))):
    lines.append(((logo[row] if row < len(logo) else '').ljust(width) +
                  (right[row] if row < len(right) else '')).rstrip())
print('\n'.join(lines) + '\n')
