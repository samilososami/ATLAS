(() => {
  const scanButton = document.querySelector('#wifi-scan');
  const status = document.querySelector('#wifi-status');
  const current = document.querySelector('#wifi-current');
  const networks = document.querySelector('#wifi-networks');
  const dialog = document.querySelector('#wifi-dialog');
  const form = document.querySelector('#wifi-connect-form');
  const title = document.querySelector('#wifi-dialog-title');
  const security = document.querySelector('#wifi-security');
  const passwordField = document.querySelector('#wifi-password-field');
  const password = document.querySelector('#wifi-password');
  const passwordToggle = document.querySelector('#wifi-password-toggle');
  const connectButton = document.querySelector('#wifi-connect');
  const connectStatus = document.querySelector('#wifi-connect-status');
  const cancelButtons = [document.querySelector('#wifi-cancel'), document.querySelector('#wifi-dialog-close')];
  const keyboard = document.querySelector('#teclao-keys');

  if (!scanButton || !dialog || !form || !keyboard) return;

  let selectedNetwork = null;
  let keyboardShift = false;
  let keyboardSymbols = false;

  const letterRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
    ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
    ['symbols', '-', '_', 'space', '.', '@', 'enter'],
  ];
  const symbolRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['!', '"', '#', '$', '%', '&', '/', '(', ')', '='],
    ['?', '¿', '+', '*', '[', ']', '{', '}', ':', ';'],
    ['letters', '\\', '|', '~', '^', '<', '>', ',', 'backspace'],
    ['symbols', '-', '_', 'space', '.', '@', 'enter'],
  ];
  const labels = {
    shift: '⇧', backspace: '⌫', space: 'espacio', enter: 'Intro',
    symbols: '?123', letters: 'ABC',
  };

  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    const span = button.querySelector('span');
    if (span) span.textContent = busy ? label : 'Escanear';
    else button.textContent = busy ? label : 'Conectar';
  }

  async function responseJson(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'ATLAS A1 no respondió correctamente.');
    return payload;
  }

  function signalBars(strength) {
    const level = strength >= 75 ? 4 : strength >= 50 ? 3 : strength >= 25 ? 2 : 1;
    const icon = document.createElement('span');
    icon.className = `wifi-signal wifi-signal-${level}`;
    icon.setAttribute('aria-label', `Señal ${strength}%`);
    for (let index = 1; index <= 4; index += 1) {
      const bar = document.createElement('i');
      bar.classList.toggle('on', index <= level);
      icon.append(bar);
    }
    return icon;
  }

  function openNetwork(network) {
    selectedNetwork = network;
    title.textContent = network.ssid;
    security.textContent = network.secured ? network.security : 'Red abierta';
    passwordField.hidden = !network.secured;
    document.querySelector('#teclao').hidden = !network.secured;
    password.value = '';
    password.type = 'password';
    passwordToggle.textContent = 'Ver';
    connectStatus.textContent = '';
    keyboardShift = false;
    keyboardSymbols = false;
    renderKeyboard();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    if (network.secured) password.focus({ preventScroll: true });
  }

  function renderNetworks(snapshot) {
    networks.replaceChildren();
    current.textContent = snapshot.active
      ? `Conectado a ${snapshot.active}`
      : 'ATLAS A1 no está conectado a ninguna red WiFi.';
    const items = Array.isArray(snapshot.networks) ? snapshot.networks : [];
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'wifi-empty';
      empty.textContent = 'No se han encontrado redes. Acerca el A1 al router y vuelve a escanear.';
      networks.append(empty);
      return;
    }
    for (const network of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wifi-network';
      button.setAttribute('role', 'listitem');
      if (network.active) button.classList.add('active');

      const copy = document.createElement('span');
      copy.className = 'wifi-network-copy';
      const name = document.createElement('strong');
      name.textContent = network.ssid;
      const detail = document.createElement('span');
      detail.textContent = network.active
        ? 'Conectada'
        : (network.secured ? network.security : 'Sin contraseña');
      copy.append(name, detail);

      const indicators = document.createElement('span');
      indicators.className = 'wifi-network-indicators';
      if (network.secured) {
        const lock = document.createElement('span');
        lock.className = 'wifi-lock';
        lock.textContent = '•';
        lock.setAttribute('aria-label', 'Red protegida');
        indicators.append(lock);
      }
      indicators.append(signalBars(Number(network.signal) || 0));
      button.append(copy, indicators);
      button.addEventListener('click', () => openNetwork(network));
      networks.append(button);
    }
  }

  async function scan() {
    setBusy(scanButton, true, 'Buscando…');
    status.textContent = 'Escaneando redes cercanas…';
    status.className = 'wifi-status';
    try {
      const response = await window.atlasAccess.fetch('/api/wifi/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const snapshot = await responseJson(response);
      renderNetworks(snapshot);
      status.textContent = `${snapshot.networks.length} redes detectadas.`;
      status.classList.add('success');
    } catch (error) {
      status.textContent = error.message;
      status.className = 'wifi-status error';
    } finally {
      setBusy(scanButton, false, 'Buscando…');
    }
  }

  function insertText(value) {
    const start = password.selectionStart ?? password.value.length;
    const end = password.selectionEnd ?? password.value.length;
    password.setRangeText(value, start, end, 'end');
    password.dispatchEvent(new Event('input', { bubbles: true }));
    password.focus({ preventScroll: true });
  }

  function pressKey(key) {
    if (key === 'backspace') {
      const end = password.selectionEnd ?? password.value.length;
      const start = password.selectionStart ?? end;
      if (start !== end) password.setRangeText('', start, end, 'end');
      else if (start > 0) password.setRangeText('', start - 1, start, 'end');
    } else if (key === 'space') insertText(' ');
    else if (key === 'enter') form.requestSubmit();
    else if (key === 'shift') {
      keyboardShift = !keyboardShift;
      renderKeyboard();
    } else if (key === 'symbols' || key === 'letters') {
      keyboardSymbols = key === 'symbols';
      keyboardShift = false;
      renderKeyboard();
    } else {
      insertText(keyboardShift ? key.toUpperCase() : key);
      if (keyboardShift) {
        keyboardShift = false;
        renderKeyboard();
      }
    }
    password.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderKeyboard() {
    keyboard.replaceChildren();
    for (const rowKeys of (keyboardSymbols ? symbolRows : letterRows)) {
      const row = document.createElement('div');
      row.className = 'teclao-row';
      for (const key of rowKeys) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `teclao-key teclao-key-${key}`;
        if (key === 'shift' && keyboardShift) button.classList.add('active');
        button.textContent = labels[key] || (keyboardShift ? key.toUpperCase() : key);
        button.setAttribute('aria-label', labels[key] || key);
        button.addEventListener('pointerdown', event => event.preventDefault());
        button.addEventListener('click', () => pressKey(key));
        row.append(button);
      }
      keyboard.append(row);
    }
  }

  function closeDialog() {
    selectedNetwork = null;
    password.value = '';
    connectStatus.textContent = '';
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  async function connect(event) {
    event.preventDefault();
    if (!selectedNetwork) return;
    setBusy(connectButton, true, 'Conectando…');
    connectStatus.textContent = `Conectando con ${selectedNetwork.ssid}…`;
    connectStatus.className = 'wifi-connect-status';
    try {
      const response = await window.atlasAccess.fetch('/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: selectedNetwork.ssid,
          password: selectedNetwork.secured ? password.value : '',
        }),
      });
      const snapshot = await responseJson(response);
      if (!snapshot.connected) throw new Error('NetworkManager no confirmó la nueva conexión.');
      renderNetworks(snapshot);
      status.textContent = `Conectado a ${selectedNetwork.ssid}.`;
      status.className = 'wifi-status success';
      closeDialog();
    } catch (error) {
      connectStatus.textContent = error.message;
      connectStatus.className = 'wifi-connect-status error';
    } finally {
      setBusy(connectButton, false, 'Conectando…');
    }
  }

  scanButton.addEventListener('click', scan);
  form.addEventListener('submit', connect);
  for (const button of cancelButtons) button.addEventListener('click', closeDialog);
  passwordToggle.addEventListener('click', () => {
    password.type = password.type === 'password' ? 'text' : 'password';
    passwordToggle.textContent = password.type === 'password' ? 'Ver' : 'Ocultar';
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  renderKeyboard();

  window.AtlasWifi = {
    onViewChanged(view) {
      if (view !== 'wifi') closeDialog();
    },
  };
})();
