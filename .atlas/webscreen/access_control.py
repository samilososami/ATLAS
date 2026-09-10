"""Ephemeral, per-page API leases. This is not user authentication.

Every live page receives its own lease.  A WebScreen kiosk and the Android
companion deliberately coexist: Realtime sessions are independent and one
page must never revoke another merely because it opened a microphone.
"""
import secrets
import threading
import time


class AccessError(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


class AccessControl:
    def __init__(self, clock=time.monotonic, busy=lambda: False, lease=20):
        self.clock, self.busy = clock, busy
        self.lease = lease
        self.lock = threading.RLock()
        self.clients = {}
        self.inflight = 0

    def _prune(self):
        now = self.clock()
        for token, client in list(self.clients.items()):
            if now - client['seen'] >= self.lease:
                del self.clients[token]

    def _client(self, token):
        self._prune()
        if token not in self.clients:
            raise AccessError(401, 'La conexión ha caducado. Reconectando…')
        return self.clients[token]

    def _snapshot(self, token):
        return {
            # Keep the established browser contract while making ownership
            # per-page rather than global.  A valid lease is authorised.
            'owner': token in self.clients,
            'waitingForTurn': False,
            'atlasA1Available': any(
                client.get('kind') == 'atlas-a1' for client in self.clients.values()
            ),
        }

    def connect(self, kind='browser'):
        with self.lock:
            self._prune()
            if len(self.clients) >= 128:
                raise AccessError(503, 'Demasiadas conexiones. Inténtalo más tarde.')
            token = secrets.token_urlsafe(32)
            normalized_kind = 'atlas-a1' if kind == 'atlas-a1' else 'browser'
            self.clients[token] = {
                'seen': self.clock(), 'idle': False, 'kind': normalized_kind,
            }
            return {'token': token, **self._snapshot(token)}

    def heartbeat(self, token, idle=False):
        with self.lock:
            client = self._client(token)
            client.update(seen=self.clock(), idle=idle is True)
            return self._snapshot(token)

    def takeover(self, token):
        with self.lock:
            client = self._client(token)
            client['seen'] = self.clock()
            client['idle'] = False
            return {
                # Compatibility endpoint for old pages.  It only refreshes
                # their own lease and never interrupts another page.
                'taken': False,
                'replacedOwner': False,
                **self._snapshot(token),
            }

    def activate_atlas_a1(self, token):
        """Transfer the lease to the live physical kiosk from another page."""
        with self.lock:
            requester = self._client(token)
            requester['seen'] = self.clock()
            kiosks = [
                (candidate, client) for candidate, client in self.clients.items()
                if client.get('kind') == 'atlas-a1'
            ]
            if not kiosks:
                raise AccessError(409, 'ATLAS A1 no está conectado a WebScreen.')
            target, kiosk = max(kiosks, key=lambda item: item[1]['seen'])
            kiosk['idle'] = False
            return {
                'activated': True,
                'replacedOwner': False,
                **self._snapshot(token),
            }

    def release(self, token):
        with self.lock:
            self.clients.pop(token, None)

    def authorize(self, token, begin=False):
        with self.lock:
            client = self._client(token)
            # Useful traffic is also proof of a live page. Do not expire an
            # actively used lease just because its separate heartbeat was late.
            # _client still rejects genuinely expired/released credentials.
            client['seen'] = self.clock()
            if begin:
                self.inflight += 1
                client['idle'] = False
            # Return only non-secret metadata.  The HTTP layer uses this to
            # label diagnostics without ever writing the bearer token to disk.
            return {'kind': client.get('kind', 'browser')}

    def finish(self):
        with self.lock:
            self.inflight = max(0, self.inflight - 1)
