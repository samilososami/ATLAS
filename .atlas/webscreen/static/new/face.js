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
  const blue = "url(#atlas-face-blue)";
  const oval = (rx = 56, ry = 104) => `M 0 ${-ry} A ${rx} ${ry} 0 1 1 0 ${ry} A ${rx} ${ry} 0 1 1 0 ${-ry} Z`;
  const eye = (d, stroke = 0, mirrored = false) => ({ d, stroke, mirrored });
  const closedHappyEye = eye("M -49 31 Q 0 -49 49 31", 24);
  const angryEye = eye("M -48 -84 Q -55 -90 -56 -66 L -56 0 C -56 58 -31 104 0 104 C 31 104 56 58 56 0 L 56 -5 Z");
  // Approved 02-v2: retain the oval crown; the lower notch reaches 53% of
  // the original eye height, with endpoints at 65%, not near its foot.
  const delightedEye = eye("M 0 -104 C -30.93 -104 -56 -57.44 -56 0 C -56 11 -55 21 -52 31 Q 0 -20 52 31 C 55 21 56 11 56 0 C 56 -57.44 30.93 -104 0 -104 Z");
  const worriedEye = eye("M -55 15 C -57 -5 -55 -28 -46 -43 Q -18 -79 26 -97 Q 42 -103 48 -83 C 53 -62 56 -27 56 0 C 56 57 31 101 0 101 C -31 101 -55 60 -55 15 Z");
  // Geometry is local to fixed eye sockets. Eyelid/blink transforms are on a
  // separate parent, so changes of shape cannot move the blink's pivot.
  const expressions = Object.freeze({
    neutral: { eyes: null, mouth: smile, stroke: 26, speech: "smile" },
    angry: { eyes: [angryEye, { ...angryEye, mirrored: true }], mouth: "M 740 555 Q 795.5 502 851 555", stroke: 24, speech: "frown" },
    delighted: { eyes: [delightedEye, delightedEye], mouth: "M 727.5 521 Q 795.5 588 863.5 521", stroke: 28, speech: "happy" },
    surprised: { eyes: [eye(oval(58, 104)), eye(oval(58, 104))], mouth: "M 795.5 521 A 21 30 0 1 1 795.5 581 A 21 30 0 1 1 795.5 521 Z", stroke: 0, fill: blue, speech: "round" },
    curious: { eyes: [eye(oval(56, 112)), eye(oval(50, 84))], mouth: "M 764 540 Q 795.5 565 827 526", stroke: 21, speech: "curious" },
    skeptical: { eyes: [eye(oval()), eye("M -56 0 H 56 C 56 60 31 102 0 102 C -31 102 -56 60 -56 0 Z")], mouth: "M 766 543 L 826 547", stroke: 18, speech: "flat" },
    sad: { eyes: [eye(oval(51, 96)), eye(oval(51, 96))], mouth: "M 746 551 Q 795.5 504 845 551", stroke: 24, speech: "frown" },
    worried: { eyes: [worriedEye, { ...worriedEye, mirrored: true }], mouth: "M 756 549 Q 775 533 795.5 547 Q 815 563 835 545", stroke: 18, speech: "worried" },
    sleepy: { eyes: [eye("M -49 3 Q 0 55 49 3", 23), eye("M -49 3 Q 0 55 49 3", 23)], mouth: "M 766 536 Q 795.5 557 825 536", stroke: 17, speech: "small" },
    wink: { eyes: [eye(oval()), closedHappyEye], mouth: "M 738 526 Q 795.5 580 853 526", stroke: 26, speech: "happy" },
    laughing: { eyes: [closedHappyEye, closedHappyEye], mouth: "M 719.5 520 H 871.5 Q 869 610 795.5 610 Q 722 610 719.5 520 Z", stroke: 0, fill: blue, speech: "laugh" },
    // A filled capsule has a nonzero paint box. A gradient stroke on a strictly
    // horizontal path has zero objectBoundingBox height and vanishes in Chrome.
    focused: { eyes: [eye("M -56 -4 H 56 C 56 52 31 87 0 87 C -31 87 -56 52 -56 -4 Z"), eye("M -56 -4 H 56 C 56 52 31 87 0 87 C -31 87 -56 52 -56 -4 Z")], mouth: "M 766 535 H 825 A 9 9 0 0 1 825 553 H 766 A 9 9 0 0 1 766 535 Z", stroke: 0, fill: blue, speech: "flat" },
    shy: { eyes: [eye(oval(47, 88)), eye(oval(47, 88))], mouth: "M 768 532 Q 795.5 552 823 532", stroke: 18, speech: "small" },
  });
  const expressionNames = Object.keys(expressions);
  let modelExpression = null;
  let pettingExpression = null;
  let activeExpression = "neutral";
  let activeExpressionSource = "neutral";
  let expressionTimer = 0;
  let expressionTransitionTimer = 0;
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
  const BLINK_DURATION_MS = 320;
  const randomBetween = (minimum, maximum) => Math.round(minimum + Math.random() * (maximum - minimum));
  let connectionHealthy = false;
  let sleepPhase = "awake";
  let sleepTimer = 0;
  let sleepDeadline = 0;
  let wakingTimer = 0;
  let idleWasEligible = false;
  let lastInteractionAt = performance.now();
  let drowsyDelay = randomBetween(35000, 45000);
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
  stage.dataset.expression = activeExpression;
  stage.dataset.expressionSource = activeExpressionSource;
  stage.dataset.sleep = sleepPhase;
  stage.setAttribute("aria-label", "ATLAS");
  const expressiveEyes = (side, cx) => expressionNames.filter(name => expressions[name].eyes && name !== "delighted").map(name => {
    const shape = expressions[name].eyes[side];
    return `<g class="face-eye-variant face-eye-${name}"><path d="${shape.d}" transform="translate(${cx} 425)${shape.mirrored ? " scale(-1 1)" : ""}" fill="${shape.stroke ? "none" : blue}" stroke="${shape.stroke ? blue : "none"}" stroke-width="${shape.stroke}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }).join("");
  stage.innerHTML = `<svg class="face-canvas" viewBox="0 0 1591 989" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="atlas-face-blue" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#00a8ff"/><stop offset=".52" stop-color="#009bff"/><stop offset="1" stop-color="#008cee"/></linearGradient>
      <radialGradient id="atlas-face-light"><stop stop-color="#008fff" stop-opacity=".45"/><stop offset=".42" stop-color="#008fff" stop-opacity=".14"/><stop offset="1" stop-color="#008fff" stop-opacity="0"/></radialGradient>
      <mask id="atlas-happy-left" maskUnits="userSpaceOnUse" x="569.6525" y="300" width="140" height="260"><rect x="569.6525" y="300" width="140" height="260" fill="white"/><g transform="translate(639.6525 425)"><path class="face-happy-cutout" d="M -75 56 Q 0 -45 75 56 L 75 230 H -75 Z" fill="black"/></g></mask>
      <mask id="atlas-happy-right" maskUnits="userSpaceOnUse" x="881.3475" y="300" width="140" height="260"><rect x="881.3475" y="300" width="140" height="260" fill="white"/><g transform="translate(951.3475 425)"><path class="face-happy-cutout" d="M -75 56 Q 0 -45 75 56 L 75 230 H -75 Z" fill="black"/></g></mask>
    </defs>
    <g class="face-character">
      <g class="face-breathe"><g class="face-affect-bounce">
      <g class="face-glow"><ellipse cx="639.6525" cy="425" rx="127" ry="172" fill="url(#atlas-face-light)"/><ellipse cx="951.3475" cy="425" rx="127" ry="172" fill="url(#atlas-face-light)"/><ellipse cx="795.5" cy="532" rx="125" ry="79" fill="url(#atlas-face-light)"/></g>
      <g class="face-eye-blink face-eye-left"><g class="face-eye-doze face-eye-left"><g class="face-eye-variant face-eye-neutral"><ellipse class="face-eye" cx="639.6525" cy="425" rx="56" ry="104" fill="url(#atlas-face-blue)" mask="url(#atlas-happy-left)"/></g>${expressiveEyes(0, 639.6525)}</g><path class="face-sleep-eye" d="M -49 3 Q 0 35 49 3" transform="translate(639.6525 425)" fill="none" stroke="url(#atlas-face-blue)" stroke-width="17" stroke-linecap="round"/></g>
      <g class="face-eye-blink face-eye-right"><g class="face-eye-doze face-eye-right"><g class="face-eye-variant face-eye-neutral"><ellipse class="face-eye" cx="951.3475" cy="425" rx="56" ry="104" fill="url(#atlas-face-blue)" mask="url(#atlas-happy-right)"/></g>${expressiveEyes(1, 951.3475)}</g><path class="face-sleep-eye" d="M -49 3 Q 0 35 49 3" transform="translate(951.3475 425)" fill="none" stroke="url(#atlas-face-blue)" stroke-width="17" stroke-linecap="round"/></g>
      <path class="face-mouth-previous" d="${smile}" fill="none" stroke="url(#atlas-face-blue)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="face-mouth" d="${smile}" fill="none" stroke="url(#atlas-face-blue)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="face-doze-mouth" d="${smile}" fill="none" stroke="#009dff" stroke-width="26" stroke-linecap="round"/>
      <path class="face-wake-mouth" d="M 795.5 521 A 21 30 0 1 1 795.5 581 A 21 30 0 1 1 795.5 521 Z" fill="url(#atlas-face-blue)"/>
      </g></g>
      <g class="face-sleep-z" fill="url(#atlas-face-blue)" aria-hidden="true"><path class="face-z face-z-one" d="M 1028 404 H 1041 V 408 L 1033 418 H 1041 V 422 H 1028 V 418 L 1036 408 H 1028 Z"/><path class="face-z face-z-two" d="M 1056 363 H 1068 V 366 L 1061 375 H 1068 V 379 H 1056 V 375 L 1063 367 H 1056 Z"/><path class="face-z face-z-three" d="M 1080 327 H 1090 V 330 L 1084 337 H 1090 V 340 H 1080 V 337 L 1086 330 H 1080 Z"/></g>
    </g>
    <g class="face-wave" fill="url(#atlas-face-blue)"></g>
  </svg><div class="face-copy"><p class="face-transcript" aria-live="off"></p><p class="face-caption" role="status" aria-live="polite"></p></div>`;
  view.append(stage);
  const caption = stage.querySelector(".face-caption");
  const transcript = stage.querySelector(".face-transcript");
  const mouth = stage.querySelector(".face-mouth");
  const previousMouth = stage.querySelector(".face-mouth-previous");
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
  function clearExpressionTransition() {
    clearTimeout(expressionTransitionTimer);
    expressionTransitionTimer = 0;
    if (stage.hasAttribute("data-expression-transition")) stage.removeAttribute("data-expression-transition");
    if (stage.hasAttribute("data-happy-bounce")) stage.removeAttribute("data-happy-bounce");
  }
  function restMouth() {
    const profile = expressions[activeExpression];
    const thinking = activeExpression === "neutral" && state === "working";
    setAttribute(mouth, "d", thinking ? thinkingMouth : profile.mouth);
    setAttribute(mouth, "fill", profile.fill || "none");
    setAttribute(mouth, "stroke-width", String(thinking ? 17 : profile.stroke));
  }
  function speechMouth(level) {
    if (level < .035) { restMouth(); return; }
    const style = expressions[activeExpression].speech;
    let opening = 12 + level * 57;
    let width = 52 - level * 10;
    let d;
    // The neutral articulation is intentionally unchanged. Other expressions
    // retain their affect in the upper lip and their own resting mouth at PCM 0.
    if (style === "round") {
      const rx = 21 + level * 7, ry = 30 + level * 22;
      d = `M 795.5 ${551 - ry} A ${rx} ${ry} 0 1 1 795.5 ${551 + ry} A ${rx} ${ry} 0 1 1 795.5 ${551 - ry} Z`;
    } else if (style === "laugh") {
      width = 76 - level * 7;
      d = `M ${795.5 - width} 520 Q 795.5 ${521 - level * 10} ${795.5 + width} 520 Q ${795.5 + width} ${606 + level * 23} 795.5 ${606 + level * 23} Q ${795.5 - width} ${606 + level * 23} ${795.5 - width} 520 Z`;
    } else if (style === "smile" || style === "happy") {
      if (style === "happy") width += 10;
      d = `M ${795.5 - width} 528 Q 795.5 ${546 - opening * .32} ${795.5 + width} 528 Q ${795.5 + width + 3} ${560 + opening} 795.5 ${560 + opening} Q ${795.5 - width - 3} ${560 + opening} ${795.5 - width} 528 Z`;
    } else {
      if (style === "small") { width = 28 + level * 7; opening *= .68; }
      if (style === "flat" || style === "worried") width = 32 + level * 6;
      const top = style === "frown" ? 547 : 538;
      const bend = style === "frown" ? -32 : style === "curious" ? 15 : style === "worried" ? -8 : 0;
      d = `M ${795.5 - width} ${top} Q 795.5 ${top + bend} ${795.5 + width} ${top - (style === "curious" ? 9 : 0)} Q ${795.5 + width} ${top + opening} 795.5 ${top + opening} Q ${795.5 - width} ${top + opening} ${795.5 - width} ${top} Z`;
    }
    setAttribute(mouth, "d", d);
    setAttribute(mouth, "fill", blue);
    setAttribute(mouth, "stroke-width", style === "round" || style === "laugh" ? "0" : "12");
  }
  function renderExpression(name, source, animate = true) {
    if (activeExpression === name && activeExpressionSource === source) return;
    const changed = activeExpression !== name;
    if (changed) {
      clearExpressionTransition();
      for (const attribute of ["d", "fill", "stroke-width"]) setAttribute(previousMouth, attribute, mouth.getAttribute(attribute) || "none");
    }
    activeExpression = name;
    activeExpressionSource = source;
    if (stage.dataset.expression !== name) stage.dataset.expression = name;
    if (stage.dataset.expressionSource !== source) stage.dataset.expressionSource = source;
    if (!changed) return;
    if (state === "speaking") speechMouth(mouthLevel); else restMouth();
    if (animate && !suspended && !reducedMotion.matches) {
      stage.setAttribute("data-expression-transition", "true");
      if (name === "delighted") stage.setAttribute("data-happy-bounce", "true");
      expressionTransitionTimer = setTimeout(clearExpressionTransition, 280);
    }
  }
  function syncExpression() {
    clearTimeout(expressionTimer);
    expressionTimer = 0;
    const now = performance.now();
    if (modelExpression && modelExpression.expiresAt <= now) modelExpression = null;
    if (pettingExpression && pettingExpression.expiresAt <= now) pettingExpression = null;
    const selected = pettingExpression || modelExpression;
    renderExpression(selected?.expression || "neutral", pettingExpression ? "petting" : modelExpression ? "model" : "neutral");
    const deadlines = [modelExpression, pettingExpression].filter(Boolean).map(item => item.expiresAt);
    if (deadlines.length && !suspended) expressionTimer = setTimeout(syncExpression, Math.max(1, Math.min(...deadlines) - now));
  }
  function resetExpression() {
    clearTimeout(expressionTimer);
    expressionTimer = 0;
    modelExpression = pettingExpression = null;
    clearExpressionTransition();
    renderExpression("neutral", "neutral", false);
  }
  function expression(payload = {}) {
    if (!payload || typeof payload !== "object" || suspended || document.hidden || view.hidden || content.hidden || pageSuspended) return false;
    const { expression: name, source = "model", durationMs = 15000 } = payload;
    if (!expressionNames.includes(name) || !["model", "petting"].includes(source)) return false;
    if (source === "petting") {
      if (name !== "delighted") return false;
      interact({ source: "petting" });
      pettingExpression = { expression: name, expiresAt: performance.now() + 6000 };
    } else {
      const duration = Number.isFinite(Number(durationMs)) ? clamp(durationMs, 1000, 30000) : 15000;
      modelExpression = name === "neutral" ? null : { expression: name, expiresAt: performance.now() + duration };
    }
    syncExpression();
    return true;
  }
  function cancelBlink() {
    clearTimeout(blinkTimer);
    clearTimeout(blinkEndTimer);
    blinkTimer = blinkEndTimer = 0;
    if (stage.hasAttribute("data-blinking")) stage.removeAttribute("data-blinking");
  }
  function syncBlink(delay) {
    if (suspended || state !== "idle" || drawerWasOpen || sleepPhase === "asleep" || reducedMotion.matches) { cancelBlink(); return; }
    if (blinkTimer || blinkEndTimer) return;
    const interval = sleepPhase === "drowsy" ? randomBetween(6000, 8000) : randomBetween(13000, 16000);
    blinkTimer = setTimeout(() => {
      blinkTimer = 0;
      if (suspended || state !== "idle" || drawerWasOpen || sleepPhase === "asleep" || reducedMotion.matches) return;
      const startedAt = performance.now();
      stage.setAttribute("data-blinking", "true");
      blinkEndTimer = setTimeout(() => {
        blinkEndTimer = 0;
        stage.removeAttribute("data-blinking");
        const nextInterval = sleepPhase === "drowsy" ? randomBetween(6000, 8000) : randomBetween(13000, 16000);
        syncBlink(Math.max(1000, nextInterval - (performance.now() - startedAt)));
      }, BLINK_DURATION_MS);
    }, delay ?? interval);
  }
  function clearWake() {
    clearTimeout(wakingTimer);
    wakingTimer = 0;
    if (stage.hasAttribute("data-waking")) stage.removeAttribute("data-waking");
  }
  function clearSleepDeadline() {
    clearTimeout(sleepTimer);
    sleepTimer = sleepDeadline = 0;
  }
  function canDoze() {
    return !suspended && !document.hidden && !view.hidden && !content.hidden
      && !pageSuspended && connectionHealthy && !drawerWasOpen && state === "idle";
  }
  function setSleepPhase(next, remaining = 0) {
    if (sleepPhase === next) return;
    sleepPhase = next;
    if (next === "drowsy") stage.style?.setProperty("--face-doze-duration", `${Math.max(1, remaining)}ms`);
    stage.dataset.sleep = next;
    cancelBlink();
    syncBlink();
  }
  // This is decorative inactivity only. It neither pauses the recognizer nor
  // changes the assistant's real state, microphone, audio or response timing.
  function syncSleepClock() {
    if (!canDoze()) {
      clearSleepDeadline();
      idleWasEligible = false;
      setSleepPhase("awake");
      return;
    }
    const now = performance.now();
    if (!idleWasEligible) {
      idleWasEligible = true;
      lastInteractionAt = now;
      drowsyDelay = randomBetween(35000, 45000);
    }
    const elapsed = now - lastInteractionAt;
    const next = elapsed >= 60001 ? "asleep" : elapsed >= drowsyDelay ? "drowsy" : "awake";
    setSleepPhase(next, 60001 - elapsed);
    const deadline = next === "awake" ? lastInteractionAt + drowsyDelay : next === "drowsy" ? lastInteractionAt + 60001 : 0;
    // Repeated healthy heartbeats/render messages must not move or recreate the
    // deadline. Only an actual interaction or eligibility change starts it anew.
    if (deadline === sleepDeadline && (sleepTimer || !deadline)) return;
    clearSleepDeadline();
    if (deadline) {
      sleepDeadline = deadline;
      sleepTimer = setTimeout(() => { sleepTimer = sleepDeadline = 0; syncSleepClock(); }, Math.max(1, deadline - now));
    }
  }
  function interact({ source = "controls" } = {}) {
    if (!["wake", "petting", "controls"].includes(source) || suspended || document.hidden || view.hidden || content.hidden || pageSuspended) return false;
    const wasAsleep = sleepPhase === "asleep";
    clearSleepDeadline();
    clearWake();
    lastInteractionAt = performance.now();
    drowsyDelay = randomBetween(35000, 45000);
    idleWasEligible = canDoze();
    setSleepPhase("awake");
    if (wasAsleep && source === "wake" && !reducedMotion.matches) {
      stage.setAttribute("data-waking", "true");
      wakingTimer = setTimeout(clearWake, 180);
    }
    syncSleepClock();
    syncBlink();
    return true;
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
      speechMouth(mouthLevel);
    }
  }
  function scheduleDraw() {
    if (!frame && !suspended && (state === "listening" || state === "speaking")) frame = requestAnimationFrame(draw);
  }
  function resetMouth() {
    targetMouth = mouthLevel = 0;
    restMouth();
  }
  function update(next = {}) {
    let nextState = next.state || state;
    if (nextState === "thinking") nextState = "working";
    if (nextState === "listening" && /^(GPT LIVE|MICRÓFONO)$/i.test(next.phase || "") && /conectando|preparando|activando/i.test(`${next.title || ""} ${next.detail || ""}`)) nextState = "connecting";
    if (!["idle", "listening", "working", "speaking", "connecting", "error"].includes(nextState)) nextState = "working";
    if (nextState !== state) {
      const previousState = state;
      if (nextState === "listening" || nextState === "speaking") interact({ source: nextState === "listening" ? "wake" : "controls" });
      state = nextState;
      stage.dataset.state = state;
      clearTimeout(boundaryTimer);
      resetMouth();
      if (state === "idle" || state === "connecting" || (state === "listening" && ["idle", "connecting", "error", "speaking"].includes(previousState))) {
        setText(transcript, "");
        levels.fill(0);
      }
      if (["connecting", "error"].includes(state)) clearWake();
    }
    // The primary surface is deliberately silent visually. Shared transcript,
    // status and actionable errors remain in the original debug drawer and dot.
    setText(caption, "");
    setText(transcript, "");
    syncSleepClock();
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
      clearWake();
      resetExpression();
      resetMouth();
    } else scheduleDraw();
    syncSleepClock();
    syncBlink();
  }
  new MutationObserver(onVisibility).observe(view, { attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(onVisibility).observe(content, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", () => { pageSuspended = true; onVisibility(); });
  window.addEventListener("pageshow", () => { pageSuspended = false; onVisibility(); });
  reducedMotion.addEventListener?.("change", () => { clearExpressionTransition(); if (reducedMotion.matches) clearWake(); syncBlink(); scheduleDraw(); });
  // The original drawer handles open/close; add keyboard focus containment to it.
  let drawerWasOpen = false;
  const panelObserver = new MutationObserver(() => {
    const open = panel.classList.contains("open");
    if (open === drawerWasOpen) return;
    drawerWasOpen = open;
    interact({ source: "controls" });
    syncSleepClock();
    panel.inert = !open;
    if (open) $("#panel-close")?.focus({ preventScroll: true });
    else menu?.focus({ preventScroll: true });
  });
  panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
  panel.inert = true;
  panel.addEventListener("pointerdown", event => { if (event.isTrusted !== false) interact({ source: "controls" }); });
  panel.addEventListener("keydown", event => { if (event.isTrusted !== false) interact({ source: "controls" }); });
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
    interact,
    expression,
    reset() { resetExpression(); clearWake(); clearSleepDeadline(); idleWasEligible = false; setSleepPhase("awake"); syncSleepClock(); },
    transcript() { setText(transcript, ""); },
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
      connectionHealthy = Boolean(healthy);
      if (!connectionHealthy) clearWake();
      setAttribute(connectionDot, "data-healthy", String(Boolean(healthy)));
      const description = label || (healthy ? "ATLAS A1 conectado" : "Sin conexión con ATLAS A1");
      setAttribute(connectionDot, "aria-label", description);
      setAttribute(connectionDot, "title", description);
      syncSleepClock();
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
