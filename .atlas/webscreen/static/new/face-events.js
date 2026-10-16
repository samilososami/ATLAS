/* Local CLI visual events reuse the current page lease. No audio/model calls. */
(() => {
  'use strict';
  if (document.body?.dataset.design !== 'new') return;
  let cursor = '', applied = '', controller = null, retry = 0, stopped = false, failures = 0;
  const content = document.querySelector('#webscreen-content');
  const ready = () => !stopped && !document.hidden && !content?.hidden
    && window.atlasAccess?.hasControl() && window.AtlasFace;
  function halt() {
    clearTimeout(retry); retry = 0;
    controller?.abort();
    cursor = '';
  }
  async function listen() {
    if (controller || !ready()) return;
    const request = new AbortController();
    controller = request;
    const deadline = setTimeout(() => request.abort(), 16000);
    let delay = 0;
    try {
      const response = await window.atlasAccess.fetch(`/api/face/events?after=${encodeURIComponent(cursor)}`,
        { signal: request.signal });
      if (!response.ok) throw new Error(`face events ${response.status}`);
      const state = await response.json();
      if (request.signal.aborted || !ready()) return;
      if (typeof state.cursor !== 'string' || !Number.isFinite(state.remainingMs)) throw new Error('Invalid face event');
      if (applied !== state.cursor) {
        // Sequence zero is a fresh backend with no command, not a request to
        // erase a model expression. Reconnect only replays a still-live face.
        if (state.expression === 'neutral') {
          if (state.operation === 'reset' || (state.operation === 'set' && state.sequence > 0)) window.AtlasFace.reset();
          else if (state.operation === 'expired') window.AtlasFace.clearCommand();
        } else if (state.remainingMs > 0) {
          window.AtlasFace.expression({ expression: state.expression, source: 'command', durationMs: state.remainingMs });
        }
        applied = state.cursor;
      }
      cursor = state.cursor;
      failures = 0;
    } catch {
      delay = Math.min(10000, 500 * 2 ** Math.min(5, failures++));
    } finally {
      clearTimeout(deadline);
      if (controller === request) controller = null;
      if (ready()) retry = setTimeout(listen, delay);
    }
  }
  function resume() {
    if (!ready()) halt();
    else { clearTimeout(retry); retry = 0; void listen(); }
  }
  if (content) new MutationObserver(resume).observe(content, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pagehide', () => { stopped = true; halt(); });
  window.addEventListener('pageshow', () => { stopped = false; resume(); });
  window.addEventListener('online', resume);
  resume();
})();
