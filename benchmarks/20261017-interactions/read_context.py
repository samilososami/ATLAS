"""Read the real WebScreen primer without history, under a no-side-effects audit.

This helper runs as a separate process: the audit hook cannot be removed. Its
stdout is consumed privately by run.py, not printed or persisted in results.
"""
import json
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True
root = Path(sys.argv[1]).resolve()
os.environ['ATLAS_HOME'] = str(root)
os.environ['ATLAS_KNOWLEDGE_DIR'] = str(root / '.atlas/context/knowledge')

def no_effects(event, args):
    if event == 'open':
        mode, flags = args[1], args[2]
        if (isinstance(mode, str) and any(c in mode for c in 'wax+')) or (isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND)):
            raise PermissionError('Context reader forbids writes')
    if event.startswith(('subprocess.', 'socket.')) or event in ('os.system', 'os.mkdir', 'os.remove', 'os.rename', 'os.rmdir', 'os.chmod', 'os.chown', 'os.symlink', 'os.link', 'os.truncate'):
        raise PermissionError('Context reader forbids side effects: '+event)

sys.addaudithook(no_effects)
sys.path.insert(0, str(root / '.atlas/webscreen'))
import server
context, stats = server.build_realtime_context(persistent_context='', adb_reports=root/'no-benchmark-adb-inventory', maximum_chars=server.REALTIME_OFFER_CONTEXT_MAX_CHARS)
print(json.dumps({'instructions':server.read_realtime_instructions(), 'context':context, 'stats':stats},ensure_ascii=False))
