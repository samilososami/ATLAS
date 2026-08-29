(() => {
  'use strict';
  const content = document.querySelector('#webscreen-content');
  const blocked = document.querySelector('#access-blocked');
  const title = document.querySelector('#access-title');
  const detail = document.querySelector('#access-detail');
  const takeover = document.querySelector('#access-takeover');
  let token = '', owner = false, updating = false;
  let lastReply = 0, adapter = null, state = {}, released = false;
  let message = '';
  const hasControl = () => owner && performance.now() - lastReply < 8000;
  const idle = () => Boolean(adapter?.isIdle());

  function render() {
    const control = hasControl();
    content.hidden = !control;
    content.inert = !control;
    blocked.hidden = control;
    title.textContent = !token ? 'Conectando con ATLAS…' : 'ATLAS está siendo utilizado por otro usuario.';
    detail.textContent = message || (state.waitingForTurn
      ? 'ATLAS está terminando una operación anterior. Puedes tomar el control igualmente.'
      : 'Toma el control para utilizar ATLAS en este dispositivo.');
    takeover.disabled = !token || updating;
  }

  function setOwner(value) {
    const previous = owner;
    owner = value;
    if (previous && !owner) adapter?.suspend();
    render();
    if (!previous && owner) {
      adapter?.acquired();
      window.dispatchEvent(new Event('atlas-access-acquired'));
    }
  }

  async function update(action = 'heartbeat') {
    if (updating || released || !adapter) return;
    updating = true;
    const actual = token ? action : 'connect';
    const wasIdle = idle();
    render();
    try {
      const response = await fetch(`/api/access/${actual}`, {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(4000),
        headers: { 'Content-Type': 'application/json', 'X-Atlas-Access': '1', 'X-Atlas-Client': token },
        body: JSON.stringify({ idle: wasIdle }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) { token = ''; setOwner(false); }
        throw new Error(result.error || 'No se pudo conectar con ATLAS.');
      }
      if (released) return;
      token = result.token || token;
      state = result;
      lastReply = performance.now();
      message = '';
      setOwner(result.owner);
    } catch (error) {
      message = error.name === 'TimeoutError' || error.name === 'TypeError'
        ? 'Sin conexión con la Pi. Reintentando…' : error.message;
      if (['heartbeat', 'connect', 'takeover'].includes(actual)) setOwner(false);
    } finally {
      updating = false;
      render();
    }
  }

  window.atlasAccess = {
    hasControl,
    bind(value) { adapter = value; void update(); },
    async fetch(url, options = {}) {
      if (!hasControl()) throw new Error('Esta pestaña no tiene el control de ATLAS.');
      const headers = new Headers(options.headers);
      headers.set('X-Atlas-Client', token);
      const response = await fetch(url, { ...options, headers });
      if ([401, 423].includes(response.status)) {
        if (response.status === 401) token = '';
        setOwner(false);
      }
      return response;
    },
  };
  takeover.addEventListener('click', () => { message = ''; void update('takeover'); });
  setInterval(() => void update(), 500);
  setInterval(() => {
    if (owner && performance.now() - lastReply >= 8000) setOwner(false);
    render();
  }, 250);
  window.addEventListener('pagehide', () => {
    released = true;
    setOwner(false);
    if (token) void fetch('/api/access/release', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Atlas-Access': '1', 'X-Atlas-Client': token },
      body: '{}',
    }).catch(() => {});
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { released = false; token = ''; void update(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void update();
  });
})();
