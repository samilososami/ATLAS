"""Ephemeral, per-page control leases. This is not user authentication."""
import math
import secrets
import threading
import time


class AccessError(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


class AccessControl:
    def __init__(self, clock=time.monotonic, busy=lambda: False, lease=20, cooldown=10):
        self.clock, self.busy = clock, busy
        self.lease, self.cooldown = lease, cooldown
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
            self.clients[token]['request'] = None

    def _snapshot(self, token):
        client = self.clients[token]
        owner = self.owner == token
        pending = next((c['request'] for t, c in self.clients.items()
                        if t != token and c['request']), None) if owner else None
        return {
            'owner': owner,
            'pendingRequest': pending,
            'canDelegate': bool(owner and client['idle'] and not self._occupied() and pending),
            'requestPending': bool(client['request']),
            'retryAfter': max(0, math.ceil(client['next_claim'] - self.clock())),
            'waitingForTurn': self.owner is None and self._occupied(),
        }

    def connect(self):
        with self.lock:
            self._prune()
            if len(self.clients) >= 128:
                raise AccessError(503, 'Demasiadas conexiones. Inténtalo más tarde.')
            token = secrets.token_urlsafe(32)
            self.clients[token] = {'seen': self.clock(), 'idle': False,
                                   'next_claim': 0, 'request': None}
            self._assign_if_free(token)
            return {'token': token, **self._snapshot(token)}

    def heartbeat(self, token, idle=False):
        with self.lock:
            client = self._client(token)
            client.update(seen=self.clock(), idle=idle is True)
            self._assign_if_free(token)
            return self._snapshot(token)

    def claim(self, token):
        with self.lock:
            client = self._client(token)
            client['seen'] = self.clock()
            if self.owner == token:
                return self._snapshot(token)
            remaining = client['next_claim'] - self.clock()
            if remaining > 0:
                raise AccessError(429, f'Espera {math.ceil(remaining)} segundos para solicitarlo de nuevo.')
            client['next_claim'] = self.clock() + self.cooldown
            self._assign_if_free(token)
            if self.owner != token:
                client['request'] = client['request'] or secrets.token_urlsafe(16)
            return self._snapshot(token)

    def delegate(self, token, request_id, idle=False):
        with self.lock:
            client = self._client(token)
            if self.owner != token:
                raise AccessError(423, 'Esta pestaña no tiene el control de ATLAS.')
            if idle is not True or not client['idle'] or self._occupied():
                raise AccessError(409, 'Solo puedes delegar cuando ATLAS está en espera.')
            target = next((t for t, c in self.clients.items()
                           if t != token and c['request'] and c['request'] == request_id), None)
            if target is None:
                raise AccessError(409, 'La solicitud ya no está disponible.')
            self.owner = target
            self.clients[target]['request'] = None
            self.clients[target]['idle'] = False
            client['idle'] = False
            return {'delegated': True, **self._snapshot(token)}

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
