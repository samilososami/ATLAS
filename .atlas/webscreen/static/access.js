(() => {
  'use strict';
  const content = document.querySelector('#webscreen-content');
  const blocked = document.querySelector('#access-blocked');
  const title = document.querySelector('#access-title');
  const detail = document.querySelector('#access-detail');
  const takeover = document.querySelector('#access-takeover');
  const activateA1 = document.querySelector('#access-activate-a1');
  const pageLocation = window.location || {};
  const isAtlasA1 = ['localhost', '127.0.0.1', '[::1]'].includes(pageLocation.hostname)
    && /(?:^|[?&])kiosk=1(?:&|$)/.test(pageLocation.search || '');
  let token = '', owner = false, updating = false;
  let lastReply = 0, adapter = null, state = {}, released = false;
  let message = '';
  let failures = 0, nextUpdateAt = 0, generation = 0;
  let pendingRequest = null, lastRecoveryAt = -Infinity;
  const callbackFailures = new Set();
  const HEARTBEAT_MS = 1500;
  const REQUEST_TIMEOUT_MS = 4000;
  // Stop before the server's 20s lease expires, but tolerate one lost packet.
  const CONTROL_GRACE_MS = 8000;
  const hasControl = () => owner && performance.now() - lastReply < CONTROL_GRACE_MS;
  function invokeAdapter(name, fallback) {
    try { return adapter?.[name]?.() ?? fallback; }
    catch (error) {
      // UI failures must not permanently latch the connection scheduler. In
      // particular, a broken idle predicate is conservatively treated as busy.
      if (!callbackFailures.has(name)) {
        callbackFailures.add(name);
        console.warn(`[ATLAS acceso] Falló ${name}:`, error);
      }
      return fallback;
    }
  }

  function cancelPendingRequest() {
    const request = pendingRequest;
    if (!request) return;
    pendingRequest = null;
    updating = false;
    request.cancel();
  }

  function render() {
    const control = hasControl();
    content.hidden = !control;
    content.inert = !control;
    blocked.hidden = control;
    title.textContent = failures ? 'Reconectando con ATLAS…'
      : !token ? 'Conectando con ATLAS…' : 'ATLAS está siendo utilizado por otro usuario.';
    detail.textContent = message || (state.waitingForTurn
      ? 'ATLAS está terminando una operación anterior. Puedes tomar el control igualmente.'
      : 'Toma el control para utilizar ATLAS en este dispositivo.');
    takeover.disabled = !token || updating;
    activateA1.hidden = isAtlasA1;
    activateA1.disabled = !token || updating || !state.atlasA1Available;
  }

  function setOwner(value) {
    const previous = owner;
    owner = value;
    // Hide/inert controls before calling application code that could throw.
    render();
    if (previous && !owner) invokeAdapter('suspend');
    if (!previous && owner) {
      invokeAdapter('acquired');
      window.dispatchEvent(new Event('atlas-access-acquired'));
    }
  }

  async function update(action = 'heartbeat') {
    if (updating || released || !adapter) return;
    updating = true;
    const request = { controller: new AbortController(), cancel() {} };
    pendingRequest = request;
    const actual = token ? action : 'connect';
    const requestToken = token, requestGeneration = generation;
    const requestedAt = performance.now();
    let timeout;
    try {
      const wasIdle = Boolean(invokeAdapter('isIdle', false));
      render();
      const deadline = new Promise((resolve, reject) => {
        request.cancel = () => {
          request.controller.abort();
          const error = new Error('Petición de conexión cancelada.');
          error.name = 'AbortError';
          reject(error);
        };
        timeout = setTimeout(() => {
          request.controller.abort();
          const error = new Error('Sin conexión con la Pi. Reintentando…');
          error.name = 'TimeoutError';
          reject(error);
        }, REQUEST_TIMEOUT_MS);
      });
      // Bound both response headers and the JSON body independently of fetch's
      // abort handling. A late reply cannot apply state after this race expires.
      const operation = (async () => {
        const response = await fetch(`/api/access/${actual}`, {
          method: 'POST', cache: 'no-store', signal: request.controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-Atlas-Access': '1', 'X-Atlas-Client': requestToken },
          body: JSON.stringify({ idle: wasIdle, clientKind: isAtlasA1 ? 'atlas-a1' : 'browser' }),
        });
        const result = [401, 423].includes(response.status) ? null : await response.json();
        return { response, result };
      })();
      const { response, result } = await Promise.race([operation, deadline]);
      if (released || pendingRequest !== request || requestGeneration !== generation || requestToken !== token) return;
      // A status is authoritative even if its body is interrupted/malformed.
      // Invalidate before parsing so an expired token cannot loop forever.
      if (response.status === 401) {
        token = ''; generation += 1; nextUpdateAt = 0;
        message = 'Renovando la conexión con ATLAS…';
        setOwner(false);
        return;
      }
      if (response.status === 423) {
        nextUpdateAt = performance.now() + HEARTBEAT_MS;
        message = '';
        failures = 0;
        setOwner(false);
        return;
      }
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo conectar con ATLAS.');
      }
      if (typeof result.owner !== 'boolean' || (actual === 'connect' && !result.token)) {
        throw new Error('Respuesta de conexión incompleta. Reintentando…');
      }
      token = result.token || token;
      state = result;
      lastReply = requestedAt;
      failures = 0;
      nextUpdateAt = performance.now() + HEARTBEAT_MS;
      if (result.activated) message = 'Control activado en la pantalla de ATLAS A1.';
      else message = '';
      setOwner(result.owner);
    } catch (error) {
      if (released || pendingRequest !== request || requestGeneration !== generation || requestToken !== token) return;
      failures += 1;
      nextUpdateAt = performance.now() + Math.min(4000, 500 * 2 ** Math.min(failures - 1, 3));
      message = error.name === 'TimeoutError' || error.name === 'TypeError'
        ? 'Sin conexión con la Pi. Reintentando…' : error.message;
      // A transient network fault isn't a transfer of ownership. The watchdog
      // still revokes locally before the backend can lease ATLAS to somebody else.
      if (!hasControl()) setOwner(false);
    } finally {
      clearTimeout(timeout);
      request.controller.abort();
      if (pendingRequest === request) {
        pendingRequest = null;
        updating = false;
        render();
      }
    }
  }

  window.atlasAccess = {
    hasControl,
    bind(value) { adapter = value; void update(); },
    async fetch(url, options = {}) {
      if (!hasControl()) throw new Error('Esta pestaña no tiene el control de ATLAS.');
      const headers = new Headers(options.headers);
      const requestToken = token;
      headers.set('X-Atlas-Client', requestToken);
      const response = await fetch(url, { ...options, headers });
      if ([401, 423].includes(response.status) && requestToken === token) {
        generation += 1;
        if (response.status === 401) token = '';
        cancelPendingRequest();
        nextUpdateAt = 0;
        setOwner(false);
      }
      return response;
    },
  };
  takeover.addEventListener('click', () => { message = ''; void update('takeover'); });
  activateA1.addEventListener('click', () => { message = ''; void update('activate-atlas-a1'); });
  setInterval(() => {
    if (performance.now() >= nextUpdateAt) void update();
  }, 500);
  setInterval(() => {
    if (owner && !hasControl()) setOwner(false);
  }, 250);
  window.addEventListener('pagehide', () => {
    released = true;
    generation += 1;
    cancelPendingRequest();
    setOwner(false);
    if (token) void fetch('/api/access/release', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Atlas-Access': '1', 'X-Atlas-Client': token },
      body: '{}',
    }).catch(() => {});
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      released = false; token = ''; nextUpdateAt = 0;
      void update();
    }
  });
  function resumeConnection() {
    if (released || performance.now() - lastRecoveryAt < 500) return;
    lastRecoveryAt = performance.now();
    nextUpdateAt = 0;
    // A live request retains its bounded deadline; events cannot create a
    // parallel heartbeat storm or bypass ownership with automatic takeover.
    void update();
  }
  window.addEventListener('online', resumeConnection);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeConnection();
  });
})();
