(() => {
  'use strict';
  const content = document.querySelector('#webscreen-content');
  const blocked = document.querySelector('#access-blocked');
  const title = document.querySelector('#access-title');
  const detail = document.querySelector('#access-detail');
  const claim = document.querySelector('#access-claim');
  const notice = document.querySelector('#access-notice');
  const delegate = document.querySelector('#access-delegate');
  const noticeDetail = document.querySelector('#access-notice-detail');
  let token = '', owner = false, transferring = false, updating = false;
  let lastReply = 0, retryAt = 0, adapter = null, state = {}, released = false;
  let message = '';
  const hasControl = () => owner && !transferring && performance.now() - lastReply < 8000;
  const idle = () => Boolean(adapter?.isIdle());

  function render() {
    const control = hasControl();
    content.hidden = !control;
    content.inert = !control;
    blocked.hidden = control;
    const seconds = Math.max(0, Math.ceil((retryAt - performance.now()) / 1000));
    title.textContent = !token ? 'Conectando con ATLAS…' : 'ATLAS está siendo utilizado por otro usuario.';
    detail.textContent = message || (state.waitingForTurn
      ? 'Esperando a que termine el trabajo en curso.'
      : state.requestPending ? 'Solicitud enviada. Esperando a que el usuario actual delegue el acceso.'
        : 'Puedes solicitar el control de esta pantalla.');
    claim.textContent = seconds ? `Reclamar acceso (${seconds} s)` : 'Reclamar acceso';
    claim.disabled = !token || updating || seconds > 0;
    notice.hidden = !control || !state.pendingRequest;
    delegate.disabled = updating || !idle() || !state.canDelegate;
    noticeDetail.textContent = delegate.disabled
      ? 'Podrás delegar cuando ATLAS esté en espera en la pestaña ATLAS.'
      : 'Al delegar, esta pantalla dejará de tener el control.';
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
    if (action === 'delegate' && (!hasControl() || !idle() || !state.canDelegate)) return;
    updating = true;
    const actual = token ? action : 'connect';
    const wasIdle = idle();
    if (actual === 'delegate') {
      // Stop wake-word recognition before awaiting the handoff: no new turn can race it.
      transferring = true;
      adapter.suspend();
    }
    render();
    try {
      const response = await fetch(`/api/access/${actual}`, {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(4000),
        headers: { 'Content-Type': 'application/json', 'X-Atlas-Access': '1', 'X-Atlas-Client': token },
        body: JSON.stringify({ idle: wasIdle, requestId: state.pendingRequest }),
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
      retryAt = performance.now() + result.retryAfter * 1000;
      message = result.delegated ? 'Acceso delegado.' : '';
      transferring = false;
      setOwner(result.owner);
    } catch (error) {
      message = error.name === 'TimeoutError' || error.name === 'TypeError'
        ? 'Sin conexión con la Pi. Reintentando…' : error.message;
      if (['heartbeat', 'connect', 'delegate'].includes(actual)) setOwner(false);
    } finally {
      transferring = false;
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
  claim.addEventListener('click', () => { message = ''; void update('claim'); });
  delegate.addEventListener('click', () => void update('delegate'));
  setInterval(() => void update(), 2000);
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
