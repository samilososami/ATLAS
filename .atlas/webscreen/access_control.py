"""Ephemeral, per-page control leases. This is not user authentication."""
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
        self.owner = None
        self.inflight = 0

    def _prune(self):
        now = self.clock()
        for token, client in list(self.clients.items()):
            if now - client['seen'] >= self.lease:
                del self.clients[token]
                if self.owner == token:
                    self.owner = None

    def _client(self, token):
        self._prune()
        if token not in self.clients:
            raise AccessError(401, 'La conexión ha caducado. Reconectando…')
        return self.clients[token]

    def _occupied(self):
        return self.inflight > 0 or self.busy()

    def _assign_if_free(self, token):
        if self.owner is None and not self._occupied():
            self.owner = token

    def _snapshot(self, token):
        owner = self.owner == token
        return {
            'owner': owner,
            'waitingForTurn': self.owner is None and self._occupied(),
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
            self._assign_if_free(token)
            return {'token': token, **self._snapshot(token)}

    def heartbeat(self, token, idle=False):
        with self.lock:
            client = self._client(token)
            client.update(seen=self.clock(), idle=idle is True)
            self._assign_if_free(token)
            return self._snapshot(token)

    def takeover(self, token):
        with self.lock:
            client = self._client(token)
            client['seen'] = self.clock()
            previous = self.owner
            self.owner = token
            client['idle'] = False
            return {
                'taken': previous != token,
                'replacedOwner': previous is not None and previous != token,
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
            previous = self.owner
            self.owner = target
            kiosk['idle'] = False
            return {
                'activated': True,
                'replacedOwner': previous is not None and previous != target,
                **self._snapshot(token),
            }

    def release(self, token):
        with self.lock:
            self.clients.pop(token, None)
            if self.owner == token:
                self.owner = None

    def authorize(self, token, begin=False):
        with self.lock:
            client = self._client(token)
            if self.owner != token:
                raise AccessError(423, 'ATLAS está siendo utilizado por otro usuario.')
            if begin:
                self.inflight += 1
                client['idle'] = False

    def finish(self):
        with self.lock:
            self.inflight -= 1
