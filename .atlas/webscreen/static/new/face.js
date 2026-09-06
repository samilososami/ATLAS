/* Native SVG face for /new. This module observes presentation state; it never
 * opens a microphone, advances a turn, starts a request or synthesizes audio. */
(() => {
  "use strict";
  if (document.body.dataset.design !== "new") return;
  const $ = (selector) => document.querySelector(selector);
  const view = $("#view-atlas");
  const panel = $("#side-panel");
  const content = $("#webscreen-content");
  if (!view || !panel || !content) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const svgNS = "http://www.w3.org/2000/svg";
  const smile = "M 737.5 527 Q 795.5 575 853.5 527";
  const thinkingMouth = "M 774 539 Q 795.5 531 817 536";
  let state = "idle";
  let frame = 0;
  let lastFrame = 0;
  let mouthLevel = 0;
  let targetMouth = 0;
  let lastOutputAt = 0;
  let lastInputAt = 0;
  let boundaryTimer = 0;
  let blinkTimer = 0;
  let blinkEndTimer = 0;
  let pageSuspended = false;
  const BLINK_INTERVAL_MS = 8700;
  const BLINK_DURATION_MS = 350;
  let outputAvailable = true;
  let suspended = document.hidden;
  const levels = Array(61).fill(0);

  const header = document.createElement("header");
  header.className = "face-header";
  header.innerHTML = `<div class="face-brand" aria-label="ATLAS"><img class="face-brand-mark" src="/new/logo.png" alt="" width="25" height="27"><img class="face-brand-word" src="/new/atlas-wordmark.svg" alt="ATLAS" width="74" height="12"></div><span class="face-connection" role="status" aria-label="Comprobando conexión con ATLAS A1" title="Comprobando conexión con ATLAS A1" data-healthy="false"></span>`;
  content.prepend(header);
  const connectionDot = header.querySelector(".face-connection");
  const menu = $("#menu-toggle");
  if (menu) {
    menu.setAttribute("aria-label", "Abrir ajustes y herramientas");
    menu.setAttribute("aria-controls", "side-panel");
    menu.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.3 3 .6-1h4.2l.6 1 .4 1.7 1.3.8 1.7-.5 1.1.1 2.1 3.6-.4 1.1-1.3 1.2v1.5l1.3 1.2.4 1.1-2.1 3.6-1.1.1-1.7-.5-1.3.8-.4 1.7-.6 1H9.9l-.6-1-.4-1.7-1.3-.8-1.7.5-1.1-.1-2.1-3.6.4-1.1 1.3-1.2v-1.5L3.1 10l-.4-1.1 2.1-3.6 1.1-.1 1.7.5 1.3-.8L9.3 3Z"/><circle cx="12" cy="12" r="3.2"/></svg>`;
  }

  // Retain the existing elements/listeners/IDs. The settings drawer reveals the
  // same engine controls and diagnostics; no second functional app is created.
  const controls = document.createElement("section");
  controls.className = "face-control-block";
  controls.setAttribute("aria-label", "Voz y sesión");
  const pickers = $(".session-pickers");
  if (pickers) controls.append(pickers);
  const actions = $(".hero > .actions");
  if (actions) {
    const mute = $("#microphone-mute");
    if (mute) actions.prepend(mute);
    controls.append(actions);
  }
  panel.append(controls);
  const debug = document.createElement("details");
  debug.className = "face-debug";
  const summary = document.createElement("summary");
  summary.textContent = "Estado, conversación y actividad";
  debug.append(summary);
  const shell = view.querySelector(".shell");
  if (shell) debug.append(shell);
  panel.append(debug);
  const panelTitle = panel.querySelector(".panel-heading > span");
  if (panelTitle) panelTitle.textContent = "Ajustes y herramientas";
  panel.setAttribute("aria-label", "Ajustes y herramientas de ATLAS");

  const stage = document.createElement("section");
  stage.className = "face-stage";
  stage.dataset.state = state;
  stage.setAttribute("aria-label", "ATLAS");
  stage.innerHTML = `<svg class="face-canvas" viewBox="0 0 1591 989" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="atlas-face-blue" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#00a8ff"/><stop offset=".52" stop-color="#009bff"/><stop offset="1" stop-color="#008cee"/></linearGradient>
      <radialGradient id="atlas-face-light"><stop stop-color="#008fff" stop-opacity=".45"/><stop offset=".42" stop-color="#008fff" stop-opacity=".14"/><stop offset="1" stop-color="#008fff" stop-opacity="0"/></radialGradient>
    </defs>
    <g class="face-character">
      <g class="face-glow"><ellipse cx="591.5" cy="425" rx="127" ry="172" fill="url(#atlas-face-light)"/><ellipse cx="999.5" cy="425" rx="127" ry="172" fill="url(#atlas-face-light)"/><ellipse cx="795.5" cy="532" rx="125" ry="79" fill="url(#atlas-face-light)"/></g>
      <ellipse class="face-eye" cx="591.5" cy="425" rx="56" ry="104" fill="url(#atlas-face-blue)"/>
      <ellipse class="face-eye" cx="999.5" cy="425" rx="56" ry="104" fill="url(#atlas-face-blue)"/>
      <path class="face-mouth" d="${smile}" fill="none" stroke="url(#atlas-face-blue)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <g class="face-wave" fill="url(#atlas-face-blue)"></g>
  </svg><div class="face-copy"><p class="face-transcript" aria-live="off"></p><p class="face-caption" role="status" aria-live="polite">Di «Atlas» para hablar</p></div>`;
  view.append(stage);
  const caption = stage.querySelector(".face-caption");
  const transcript = stage.querySelector(".face-transcript");
  const mouth = stage.querySelector(".face-mouth");
  const wave = stage.querySelector(".face-wave");
  const bars = levels.map((_, i) => {
    const bar = document.createElementNS(svgNS, "rect");
    bar.setAttribute("x", String(475.5 + i * 10.6));
    bar.setAttribute("y", "423");
    bar.setAttribute("width", "5.6");
    bar.setAttribute("height", "4");
    bar.setAttribute("rx", "2.8");
    wave.append(bar);
    return bar;
  });

  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
  const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  const setAttribute = (node, name, value) => {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  };
  function cancelBlink() {
    clearTimeout(blinkTimer);
    clearTimeout(blinkEndTimer);
    blinkTimer = blinkEndTimer = 0;
    if (stage.hasAttribute("data-blinking")) stage.removeAttribute("data-blinking");
  }
  function syncBlink(delay = BLINK_INTERVAL_MS) {
    if (suspended || state !== "idle" || reducedMotion.matches) { cancelBlink(); return; }
    if (blinkTimer || blinkEndTimer) return;
    blinkTimer = setTimeout(() => {
      blinkTimer = 0;
      if (suspended || state !== "idle" || reducedMotion.matches) return;
      const startedAt = performance.now();
      stage.setAttribute("data-blinking", "true");
      blinkEndTimer = setTimeout(() => {
        blinkEndTimer = 0;
        stage.removeAttribute("data-blinking");
        syncBlink(Math.max(1000, BLINK_INTERVAL_MS - (performance.now() - startedAt)));
      }, BLINK_DURATION_MS);
    }, delay);
  }
  // A display gain, not an invented signal: -55 dBFS is visually still, -14 dBFS
  // is the top of the useful animation range. Silence always remains still.
  function amplitude(sample = {}) {
    const rms = clamp(sample.rms);
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    return clamp((db + 55) / 41);
  }
  function draw(now) {
    frame = 0;
    if (suspended) return;
    if (now - lastFrame < 33) { frame = requestAnimationFrame(draw); return; }
    lastFrame = now;
    if (state === "listening") {
      const stale = performance.now() - lastInputAt > 350;
      bars.forEach((bar, i) => {
        const distance = Math.abs(i - 30) / 30;
        const signal = stale ? 0 : levels[Math.abs(i - 30)];
        const height = 4 + signal * (1 - distance ** 1.4) * (reducedMotion.matches ? 62 : 177);
        setAttribute(bar, "height", height.toFixed(2));
        setAttribute(bar, "y", (425 - height / 2).toFixed(2));
      });
    } else if (state === "speaking") {
      if (outputAvailable && performance.now() - lastOutputAt > 260) targetMouth = 0;
      mouthLevel += (targetMouth - mouthLevel) * .68;
      if (mouthLevel < .035) {
        setAttribute(mouth, "d", smile);
        setAttribute(mouth, "fill", "none");
        setAttribute(mouth, "stroke-width", "26");
      } else {
        const opening = 12 + mouthLevel * 57;
        const width = 52 - mouthLevel * 10;
        setAttribute(mouth, "d", `M ${795.5 - width} 528 Q 795.5 ${546 - opening * .32} ${795.5 + width} 528 Q ${795.5 + width + 3} ${560 + opening} 795.5 ${560 + opening} Q ${795.5 - width - 3} ${560 + opening} ${795.5 - width} 528 Z`);
        setAttribute(mouth, "fill", "url(#atlas-face-blue)");
        setAttribute(mouth, "stroke-width", "12");
      }
    }
  }
  function scheduleDraw() {
    if (!frame && !suspended && (state === "listening" || state === "speaking")) frame = requestAnimationFrame(draw);
  }
  function resetMouth() {
    targetMouth = mouthLevel = 0;
    setAttribute(mouth, "d", state === "working" ? thinkingMouth : smile);
    setAttribute(mouth, "fill", "none");
    setAttribute(mouth, "stroke-width", state === "working" ? "17" : "26");
  }
  function update(next = {}) {
    let nextState = next.state || state;
    if (nextState === "thinking") nextState = "working";
    if (nextState === "listening" && /^(GPT LIVE|MICRÓFONO)$/i.test(next.phase || "") && /conectando|preparando|activando/i.test(`${next.title || ""} ${next.detail || ""}`)) nextState = "connecting";
    if (!["idle", "listening", "working", "speaking", "connecting", "error"].includes(nextState)) nextState = "working";
    if (nextState !== state) {
      const previousState = state;
      state = nextState;
      stage.dataset.state = state;
      clearTimeout(boundaryTimer);
      resetMouth();
      if (state === "idle" || state === "connecting" || (state === "listening" && ["idle", "connecting", "error", "speaking"].includes(previousState))) {
        setText(transcript, "");
        levels.fill(0);
      }
    }
    const muted = /silenciado/i.test(`${next.phase || ""} ${next.title || ""}`);
    const copy = {
      idle: muted ? "Micrófono silenciado" : "Di «Atlas» para hablar",
      listening: transcript.textContent ? "" : "Te escucho…",
      working: "Pensando…",
      speaking: "",
      connecting: "Conectando con ATLAS…",
      error: next.title || "No he podido conectar. Revisa los ajustes.",
    };
    setText(caption, copy[state]);
    syncBlink();
    scheduleDraw();
  }
  function onVisibility() {
    suspended = pageSuspended || document.hidden || view.hidden || content.hidden;
    setAttribute(document.body, "data-face-paused", String(suspended));
    if (suspended) {
      cancelAnimationFrame(frame);
      frame = 0;
      clearTimeout(boundaryTimer);
      resetMouth();
    } else scheduleDraw();
    syncBlink();
  }
  new MutationObserver(onVisibility).observe(view, { attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(onVisibility).observe(content, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", () => { pageSuspended = true; onVisibility(); });
  window.addEventListener("pageshow", () => { pageSuspended = false; onVisibility(); });
  reducedMotion.addEventListener?.("change", () => { syncBlink(); scheduleDraw(); });
  // The original drawer handles open/close; add keyboard focus containment to it.
  let drawerWasOpen = false;
  const panelObserver = new MutationObserver(() => {
    const open = panel.classList.contains("open");
    if (open === drawerWasOpen) return;
    drawerWasOpen = open;
    panel.inert = !open;
    if (open) $("#panel-close")?.focus({ preventScroll: true });
    else menu?.focus({ preventScroll: true });
  });
  panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
  panel.inert = true;
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !drawerWasOpen) return;
    const items = [...panel.querySelectorAll("button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, a[href]")].filter(el => el.getClientRects().length);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  window.AtlasFace = Object.freeze({
    update,
    transcript(text) {
      if (state === "idle" || state === "connecting") return;
      const cleaned = String(text || "").trim();
      setText(transcript, /^(Escuchando…|Todavía no hay ninguna transcripción\.)$/.test(cleaned) ? "" : cleaned);
      if (state === "listening") setText(caption, cleaned ? "" : "Te escucho…");
    },
    inputLevel(sample) {
      if (state !== "listening" || suspended) return;
      lastInputAt = performance.now();
      levels.unshift(amplitude(sample));
      levels.pop();
      scheduleDraw();
    },
    outputLevel(sample = {}) {
      outputAvailable = sample.available !== false;
      if (state !== "speaking" || suspended || !outputAvailable) return;
      lastOutputAt = performance.now();
      targetMouth = reducedMotion.matches ? (amplitude(sample) > .08 ? .35 : 0) : amplitude(sample);
      scheduleDraw();
    },
    connection({ healthy = false, label = "" } = {}) {
      setAttribute(connectionDot, "data-healthy", String(Boolean(healthy)));
      const description = label || (healthy ? "ATLAS A1 conectado" : "Sin conexión con ATLAS A1");
      setAttribute(connectionDot, "aria-label", description);
      setAttribute(connectionDot, "title", description);
    },
    speechBoundary({ type, charLength = 4 } = {}) {
      if (state !== "speaking" || suspended) return;
      // SpeechSynthesis exposes word boundaries, not PCM. In that fallback only,
      // mouth articulation follows actual boundary events and closes afterwards.
      if (["end", "pause"].includes(type)) { clearTimeout(boundaryTimer); resetMouth(); return; }
      if (type !== "word" || outputAvailable) return;
      targetMouth = reducedMotion.matches ? .35 : .52;
      scheduleDraw();
      clearTimeout(boundaryTimer);
      boundaryTimer = setTimeout(resetMouth, Math.min(220, Math.max(85, Number(charLength) * 24)));
    },
  });
  onVisibility();
})();
