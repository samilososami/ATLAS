(() => {
  'use strict';
  // Presentation guard, not an authorization boundary. LAN clients are unchanged.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      || new URLSearchParams(location.search).get('kiosk') !== '1') return;
  document.documentElement.classList.add('atlas-kiosk');
  document.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['f11', 'f12'].includes(key)
        || (event.altKey && ['f4', 'home', 'arrowleft', 'arrowright'].includes(key))
        || ((event.ctrlKey || event.metaKey) && ['l', 't', 'n', 'w', 'o', 's', 'p', 'j', 'u', 'h'].includes(key))
        || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
