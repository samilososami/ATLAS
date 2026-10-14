/* Namespace only this copy of Webscreen. The physical A1 assets stay unchanged. */
(() => {
  const nativeFetch = window.fetch.bind(window);
  const prefix = '/try/screen';
  const mediaSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {...mediaSrc, set(value) {
    const url = new URL(value, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/tts/stream/')) url.pathname = prefix + url.pathname;
    mediaSrc.set.call(this, url.href);
  }});
  const OriginalAudio = window.Audio;
  window.Audio = function(src) { const audio = new OriginalAudio(); if (src) audio.src = src; return audio; };
  window.Audio.prototype = OriginalAudio.prototype;
  let csrf;
  const ready = nativeFetch('/portal/api/session').then(r => r.json()).then(s => {
    if (!s.authenticated) { window.top.location.replace('/try/'); throw new Error('Inicia sesión'); }
    csrf = s.csrf;
  });
  window.fetch = async (input, options = {}) => {
    await ready;
    const original = input instanceof Request ? input.url : String(input);
    const url = new URL(original, location.href);
    if (url.origin !== location.origin) return nativeFetch(input, options);
    if (url.pathname.startsWith('/api/')) url.pathname = prefix + url.pathname;
    const headers = new Headers(input instanceof Request ? input.headers : options.headers);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    headers.set('X-Atlas-CSRF', csrf);
    const response = await nativeFetch(input instanceof Request ? new Request(url, input) : url, {...options, headers});
    if (response.status === 401 && url.pathname.startsWith(prefix)) {
      const s = await nativeFetch('/portal/api/session').then(r => r.json());
      if (!s.authenticated) window.top.location.replace('/try/');
    }
    return response;
  };
  const rewrite = node => {
    for (const el of node.querySelectorAll?.('[src],[href]') || []) {
      for (const key of ['src', 'href']) {
        const value = el.getAttribute(key);
        if (value && /^\/(?:new\/|favicon\.)/.test(value)) el.setAttribute(key, prefix + value);
      }
    }
  };
  addEventListener('DOMContentLoaded', () => {
    rewrite(document);
    new MutationObserver(() => rewrite(document)).observe(document.body, {childList:true, subtree:true});
    // Global A1 management remains on the trusted local interface.
    document.querySelectorAll('[data-view="wifi"],#context-reset,[data-webscreen-design-switch],#settings-form').forEach(el => el.hidden = true);
    const detail = document.querySelector('#context-detail');
    if (detail) new MutationObserver(() => {
      if (detail.textContent.includes('compartido')) detail.textContent = 'Conversación independiente de la pantalla física del A1.';
    }).observe(detail, {childList:true});
  });
})();
