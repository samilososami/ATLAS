"""Bounded, latest-only visual state; no conversation or audio side effects."""
import math
import json
import re
import threading
import time
from pathlib import Path
from uuid import uuid4

LEGACY_EXPRESSIONS = (
    'neutral', 'angry', 'defiant', 'delighted', 'surprised', 'curious',
    'skeptical', 'sad', 'worried', 'sleepy', 'wink', 'laughing', 'focused',
    'shy', 'ambitious', 'confident', 'affectionate', 'confused', 'embarrassed',
    'relieved', 'bored', 'excited', 'asleep',
)
ALIASES = {'happy': 'delighted', 'sleep': 'asleep'}
CATALOG_PATH = Path(__file__).resolve().parent / 'static/new/expressions-catalog.json'
CATALOG_MAX_BYTES = 1024 * 1024
CATALOG_MAX_EXPRESSIONS = 512


def load_expression_catalog(path=CATALOG_PATH):
    """Read only compact identity metadata; visual geometry stays in the client.

    Missing assets retain the 23 legacy faces for old deployments. A present
    corrupt catalogue must fail clearly, not silently enable a different API.
    """
    try:
        with Path(path).open('rb') as stream:
            raw = stream.read(CATALOG_MAX_BYTES + 1)
    except FileNotFoundError:
        return tuple({'id': name, 'label': name, 'category': 'legacy', 'legacy': True}
                     for name in LEGACY_EXPRESSIONS)
    except OSError as error:
        raise ValueError('Expression catalogue cannot be read') from error
    if len(raw) > CATALOG_MAX_BYTES:
        raise ValueError('Expression catalogue exceeds the 1 MiB limit')

    def unique_object(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('Expression catalogue has a duplicate JSON key')
            value[key] = item
        return value

    try:
        data = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise ValueError('Expression catalogue is not valid UTF-8 JSON') from error
    if not isinstance(data, dict) or type(data.get('schemaVersion')) is not int or data['schemaVersion'] != 1:
        raise ValueError('Unsupported expression catalogue schemaVersion')
    entries = data.get('expressions')
    if not isinstance(entries, list) or not len(LEGACY_EXPRESSIONS) <= len(entries) <= CATALOG_MAX_EXPRESSIONS:
        raise ValueError(f'Expression catalogue must contain {len(LEGACY_EXPRESSIONS)}..{CATALOG_MAX_EXPRESSIONS} entries')
    seen = set()
    metadata = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('Expression catalogue entry must be an object')
        name, label, category = (entry.get(key) for key in ('id', 'label', 'category'))
        if not isinstance(name, str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,47}', name) or name in seen or name in ALIASES:
            raise ValueError('Expression catalogue has an invalid, duplicate or reserved ID')
        if not isinstance(label, str) or not 1 <= len(label) <= 80 or any(ord(char) < 32 or 127 <= ord(char) <= 159 for char in label):
            raise ValueError('Expression catalogue has an invalid label')
        if not isinstance(category, str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,31}', category):
            raise ValueError('Expression catalogue has an invalid category')
        if type(entry.get('legacy')) is not bool or entry['legacy'] != (name in LEGACY_EXPRESSIONS):
            raise ValueError('Expression catalogue has an invalid legacy marker')
        seen.add(name)
        metadata.append({'id': name, 'label': label, 'category': category, 'legacy': entry['legacy']})
    if not set(LEGACY_EXPRESSIONS).issubset(seen):
        raise ValueError('Expression catalogue must preserve every legacy expression')
    listing = {'expressions': [entry['id'] for entry in metadata],
               'expressionDetails': metadata, 'aliases': ALIASES, 'catalogVersion': 1}
    # Include worst-case ASCII escaping and reserve room for state/cursor fields.
    if len(json.dumps(listing, ensure_ascii=True).encode('ascii')) > 60 * 1024:
        raise ValueError('Expression catalogue metadata exceeds the CLI response budget')
    return tuple(metadata)


EXPRESSION_DETAILS = load_expression_catalog()
EXPRESSIONS = tuple(entry['id'] for entry in EXPRESSION_DETAILS)


class FaceState:
    def __init__(self, clock=time.monotonic, wall=time.time):
        self.clock, self.wall = clock, wall
        self.condition = threading.Condition()
        self.epoch = uuid4().hex
        self.sequence = 0
        self.operation = 'initial'
        self.expression = 'neutral'
        self.deadline = 0
        self.waiters = threading.BoundedSemaphore(8)

    def _snapshot(self):
        remaining = max(0, self.deadline - self.clock())
        if self.deadline and not remaining:
            self.expression, self.deadline = 'neutral', 0
            self.operation = 'expired'
            self.sequence += 1
            self.condition.notify_all()
        return {'ok': True, 'expression': self.expression, 'sequence': self.sequence, 'operation': self.operation,
                'cursor': f'{self.epoch}:{self.sequence}',
                'remainingMs': math.ceil(remaining * 1000),
                'expiresAt': round((self.wall() + remaining) * 1000) if remaining else None}

    def action(self, payload):
        if not isinstance(payload, dict) or set(payload) - {'action', 'expression', 'duration'}:
            raise ValueError('Unknown face payload fields')
        action = payload.get('action')
        if action not in ('set', 'reset', 'status', 'list'):
            raise ValueError('Action must be set, reset, status or list')
        if action != 'set' and set(payload) != {'action'}:
            raise ValueError('Only set accepts expression and duration')
        if action == 'set':
            name = payload.get('expression')
            if not isinstance(name, str):
                raise ValueError('Expression must be a supported name')
            name = ALIASES.get(name, name)
            duration = payload.get('duration', 3600 if name == 'asleep' else 15)
            if name not in EXPRESSIONS:
                raise ValueError('Unknown expression')
            maximum = 3600 if name == 'asleep' else 30
            if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or not 1 <= duration <= maximum:
                raise ValueError(f'Duration must be between 1 and {maximum} seconds')
        with self.condition:
            if action in ('set', 'reset'):
                self.expression = name if action == 'set' else 'neutral'
                self.operation = action
                self.deadline = self.clock() + duration if action == 'set' and name != 'neutral' else 0
                self.sequence += 1
                self.condition.notify_all()
            result = self._snapshot()
            if action == 'list':
                result.update(expressions=list(EXPRESSIONS), aliases=dict(ALIASES),
                              expressionDetails=[dict(entry) for entry in EXPRESSION_DETAILS],
                              catalogVersion=1)
            return result

    def wait(self, cursor, authorize, timeout=12):
        if cursor and not re.fullmatch(r'[a-f0-9]{32}:[0-9]{1,16}', cursor):
            raise ValueError('Invalid face cursor')
        if not self.waiters.acquire(blocking=False):
            raise RuntimeError('Too many face listeners')
        try:
            until = self.clock() + timeout
            with self.condition:
                while True:
                    authorize()
                    snapshot = self._snapshot()
                    if snapshot['cursor'] != cursor or self.clock() >= until:
                        return snapshot
                    wait = min(1, until - self.clock())
                    if self.deadline:
                        wait = min(wait, max(.001, self.deadline - self.clock()))
                    self.condition.wait(wait)
        finally:
            self.waiters.release()
