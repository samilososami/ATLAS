"""Replay selected failed tool payloads against a fresh, memory-only simulator.

This is NOT a model rerun or a rescore. Original answers and scores stay intact.
Only identifiers, command strings from known synthetic cases, and outcomes leave
the private evidence file; state, account context and full traces are excluded.
"""
import argparse
import json
from pathlib import Path
from virtual_world import VirtualWorld

TARGETS = {'I015', 'I057', 'I062', 'I135', 'I137', 'I276', 'I278'}

def audit(source):
    rows = [json.loads(line) for line in source.read_text().splitlines() if line.strip()]
    results = []
    for row in sorted(rows, key=lambda item: item['id']):
        if row['id'] not in TARGETS:
            continue
        for tool in row['tools']:
            if tool['name'] != 'atlas_shell' or not tool['result'].get('unsupported_in_fixture'):
                continue
            command = tool['args'].get('command', '')
            if not command.startswith(('df ', 'atlas-audio default ', 'mkdir ', 'cmp ', 'diff ')):
                continue
            world = VirtualWorld(tool['before'])
            outcome = world.call(tool['name'], tool['args'])
            results.append({'case': row['id'], 'command': command,
                            'original_fixture_ok': False,
                            'corrected_fixture_ok': outcome['ok']})
    return {'kind': 'offline_tool_payload_replay_not_model_rerun',
            'original_scores_unchanged': True, 'checks': results}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.source)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'checked': len(result['checks']),
                      'passed': sum(x['corrected_fixture_ok'] for x in result['checks'])}))
