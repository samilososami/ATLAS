#!/usr/bin/env python3
"""Merge managed command references without replacing a private workspace."""
from pathlib import Path
import os, shutil, sys

repo,home,backup=map(Path,sys.argv[1:])
workspace=home/'.openclaw/workspace';owner=home.stat()
def merge(path,body):
    start='<!-- atlas-companion:begin -->';end='<!-- atlas-companion:end -->'
    previous=path.read_text() if path.exists() else ''
    if path.exists():
        saved=backup/'workspace-docs'/path.relative_to(workspace)
        saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,saved)
    block=f'{start}\n{body.strip()}\n{end}'
    if start in previous and end in previous:
        before,rest=previous.split(start,1);_,after=rest.split(end,1);text=before+block+after
    else:text=previous.rstrip()+'\n\n'+block+'\n'
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
    os.chown(path,owner.st_uid,owner.st_gid)

rafas='''## Diagnostics and repair

`atlas-rafas` shows network/Wi-Fi, DNS/HTTPS, clock, disks/inodes, RAM, thermal/power, USB and services.
`atlas-rafas --json` is read-only structured output. `atlas-rafas doctor --check` never repairs.
`atlas-rafas doctor` recovers enabled failed services and offers interactive Wi-Fi selection when no route exists; nmcli asks for the password without adding it to arguments or history.
It does not reset OAuth, delete files, restart a healthy network, reboot, or reopen a deliberately disabled screen. Physical/power/provider faults may need the owner.
It reports tailscaled service/backend/IP; doctor can restart a crashed enabled daemon but never authenticates the owner's account.
For mobile connections, BLE pairing and Tailscale status, read ATLAS-APP.md and use `atlas-app`.
For visual phone control, read ATLAS-ANDROIDUSE.md and use the bounded `atlas-androiduse` wrapper.
'''
merge(workspace/'atlas-commands/ATLAS-RAFAS.md',rafas)
merge(workspace/'atlas-commands/ATLAS-APP.md',(repo/'openclaw/workspace/atlas-commands/ATLAS-APP.md').read_text())
merge(workspace/'atlas-commands/ATLAS-ANDROIDUSE.md',(repo/'openclaw/workspace/atlas-commands/ATLAS-ANDROIDUSE.md').read_text())
merge(workspace/'AGENTS.md','''## Diagnostic and mobile command map

- `atlas-commands/ATLAS-RAFAS.md`: `atlas-rafas`, structured health and conservative interactive doctor.
- `atlas-commands/ATLAS-APP.md`: `atlas-app`, Android Companion, BLE pairing, native phone tools and private Tailscale transport.
- `atlas-commands/ATLAS-ANDROIDUSE.md`: bounded Accessibility fallback with explicit start/stop and private screenshots.
- Run status checks first. Never publish pairing codes, certificate pins, keys or phone screenshots; they grant or reveal device access.
''')
