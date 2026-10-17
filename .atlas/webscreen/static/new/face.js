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
  const legacyExpressions = Object.freeze({
    neutral: { eyes: null, mouth: smile, stroke: 26, speech: "smile" },
    angry: { eyes: [angryEye, { ...angryEye, mirrored: true }], mouth: "M 740 555 Q 795.5 502 851 555", stroke: 24, speech: "frown" },
    // Same restrained eyes as angry. Only the curve is inverted, retaining the
    // approved lower mouth position: a quiet, challenging smile rather than an
    // exaggerated new character.
    defiant: { eyes: [angryEye, { ...angryEye, mirrored: true }], mouth: "M 740 555 Q 795.5 608 851 555", stroke: 24, speech: "smile" },
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
    ambitious: { eyes: [eye("M -55 -56 Q 0 -82 55 -12 L 55 8 C 55 67 29 104 0 104 C -31 104 -55 60 -55 0 Z"), eye("M -55 -56 Q 0 -82 55 -12 L 55 8 C 55 67 29 104 0 104 C -31 104 -55 60 -55 0 Z", 0, true)], mouth: "M 744 538 Q 795.5 581 847 526", stroke: 23, speech: "curious" },
    confident: { eyes: [eye("M -55 -30 Q 0 -54 55 -30 L 55 0 C 55 62 30 100 0 100 C -30 100 -55 62 -55 0 Z"), eye("M -55 -30 Q 0 -54 55 -30 L 55 0 C 55 62 30 100 0 100 C -30 100 -55 62 -55 0 Z")], mouth: "M 742 534 Q 795.5 574 849 534", stroke: 23, speech: "smile" },
    affectionate: { eyes: [eye("M -47 17 Q 0 -39 47 17", 22), eye("M -47 17 Q 0 -39 47 17", 22)], mouth: "M 755 531 Q 795.5 562 836 531", stroke: 22, speech: "small" },
    confused: { eyes: [eye(oval(50, 106)), eye("M -53 -20 Q 0 -58 53 -20 L 53 0 C 53 52 28 88 0 88 C -28 88 -53 52 -53 0 Z")], mouth: "M 765 546 Q 780 528 796 541 Q 811 553 827 536", stroke: 19, speech: "worried" },
    embarrassed: { eyes: [eye(oval(43, 68)), eye(oval(43, 68))], mouth: "M 770 538 Q 795.5 561 821 533", stroke: 18, speech: "small" },
    relieved: { eyes: [eye("M -50 18 Q 0 -35 50 18", 20), eye("M -50 18 Q 0 -35 50 18", 20)], mouth: "M 748 531 Q 795.5 579 843 531", stroke: 23, speech: "smile" },
    bored: { eyes: [eye("M -54 24 H 54 C 54 73 30 103 0 103 C -30 103 -54 73 -54 24 Z"), eye("M -54 24 H 54 C 54 73 30 103 0 103 C -30 103 -54 73 -54 24 Z")], mouth: "M 767 536 H 824 A 8 8 0 0 1 824 552 H 767 A 8 8 0 0 1 767 536 Z", stroke: 0, fill: blue, speech: "flat" },
    excited: { eyes: [eye(oval(58, 113)), eye(oval(58, 113))], mouth: "M 738 522 Q 795.5 548 853 522 Q 845 594 795.5 594 Q 746 594 738 522 Z", stroke: 0, fill: blue, speech: "happy" },
    asleep: { eyes: [eye("M -49 3 Q 0 52 49 3", 17), eye("M -49 3 Q 0 52 49 3", 17)], mouth: "M 779 540 Q 795.5 550 812 540", stroke: 14, speech: "small" },
  });
  const expressionCatalog = window.AtlasExpressionCatalog;
  const catalogEntries = new Map((expressionCatalog?.expressions || []).map(entry => [entry.id, entry]));
  const expressions = Object.freeze({ ...legacyExpressions, ...Object.fromEntries(
    [...catalogEntries.values()].filter(entry => !entry.legacy).map(entry => [entry.id, entry.pose])) });
  const expressionNames = Object.keys(expressions);
  // A stale/offline page missing the versioned catalogue retains the historical
  // renderer contract instead of breaking its existing 23 expressions.
  const expressionPolicy = expressionCatalog?.policy || { maxChangesPerResponse: 2, minHoldMs: 1000, cooldownMs: 2500, defaultDurationMs: 15000 };
  let responseExpressionCount = 0;
  let responseExpressionId = null;
  let lastAutonomousExpressionAt = -Infinity;
  let lastExpressionChangedAt = -Infinity;
  let modelExpression = null;
  let pettingExpression = null;
  let clapExpression = null;
  let activeExpression = "neutral";
  let activeExpressionSource = "neutral";
  let expressionTimer = 0;
  let expressionTransitionTimer = 0;
  let expressionGestureTimer = 0;
  let clapPulseTimer = 0;
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
  let blinkPhaseTimer = 0;
  let lastBlinkStartedAt = -Infinity;
  let pageSuspended = false;
  const BLINK_DURATION_MS = 320;
  const SLEEP_PHASE_BLINK_GUARD_MS = 8000;
  const randomBetween = (minimum, maximum) => Math.round(minimum + Math.random() * (maximum - minimum));
  let connectionHealthy = false;
  let sleepPhase = "awake";
  let sleepTimer = 0;
  let sleepDeadline = 0;
  let sleepPlan = null;
  let wakingTimer = 0;
  let idleWasEligible = false;
  let lastInteractionAt = performance.now();
  let outputAvailable = true;
  let networkOnline = typeof navigator === "undefined" || navigator.onLine !== false;
  let displayMode = "face";
  let displayCursor = "";
  let displayRequest = null;
  let displayRetryTimer = 0;
  let clockTimer = 0;
  let usbEventId = null;
  let usbTimer = 0;
  let usbActive = false;
  let whatsappMode = "idle";
  let whatsappSequence = 0;
  let whatsappTimer = 0;
  let whatsappRequest = null;
  let suspended = document.hidden;
  const levels = Array(61).fill(0);

  const header = document.createElement("header");
  header.className = "face-header";
  header.innerHTML = `<div class="face-brand" aria-label="ATLAS"><img class="face-brand-mark" src="/new/logo.png" alt="" width="25" height="27"><img class="face-brand-word" src="/new/atlas-wordmark.svg" alt="ATLAS" width="74" height="12"></div>`;
  content.prepend(header);
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
  stage.dataset.presentation = "connecting";
  stage.dataset.displayMode = displayMode;
  stage.dataset.whatsapp = whatsappMode;
  stage.dataset.network = networkOnline ? "online" : "offline";
  stage.setAttribute("aria-label", "ATLAS");
  const expressiveEyes = (side, cx) => Object.keys(legacyExpressions).filter(name => expressions[name].eyes && name !== "delighted").map(name => {
    const shape = expressions[name].eyes[side];
    return `<g class="face-eye-variant face-eye-${name}"><path d="${shape.d}" transform="translate(${cx} 425)${shape.mirrored ? " scale(-1 1)" : ""}" fill="${shape.stroke ? "none" : blue}" stroke="${shape.stroke ? blue : "none"}" stroke-width="${shape.stroke}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }).join("");
  stage.innerHTML = `<svg class="face-canvas" viewBox="0 0 1591 989" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="atlas-face-blue" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#00a8ff"/><stop offset=".52" stop-color="#009bff"/><stop offset="1" stop-color="#008cee"/></linearGradient>
      <radialGradient id="atlas-face-light"><stop stop-color="#008fff" stop-opacity=".45"/><stop offset=".42" stop-color="#008fff" stop-opacity=".14"/><stop offset="1" stop-color="#008fff" stop-opacity="0"/></radialGradient>
      <linearGradient id="atlas-motion-blue" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="#0096ff"/><stop offset="1" stop-color="#08bcf5"/></linearGradient>
      <mask id="atlas-wifi-cut" maskUnits="userSpaceOnUse" x="530" y="220" width="530" height="480"><rect x="530" y="220" width="530" height="480" fill="white"/><path d="M 602 283 L 962 623" stroke="black" stroke-width="75" stroke-linecap="round"/></mask>
      <clipPath id="atlas-usb-port-clip"><rect x="620" y="390" width="350" height="500"/></clipPath>
      <mask id="atlas-happy-left" maskUnits="userSpaceOnUse" x="569.6525" y="300" width="140" height="260"><rect x="569.6525" y="300" width="140" height="260" fill="white"/><g transform="translate(639.6525 425)"><path class="face-happy-cutout" d="M -75 56 Q 0 -45 75 56 L 75 230 H -75 Z" fill="black"/></g></mask>
      <mask id="atlas-happy-right" maskUnits="userSpaceOnUse" x="881.3475" y="300" width="140" height="260"><rect x="881.3475" y="300" width="140" height="260" fill="white"/><g transform="translate(951.3475 425)"><path class="face-happy-cutout" d="M -75 56 Q 0 -45 75 56 L 75 230 H -75 Z" fill="black"/></g></mask>
    </defs>
    <g class="face-character">
      <g class="face-breathe"><g class="face-affect-bounce">
      <g class="face-glow"><ellipse cx="639.6525" cy="425" rx="127" ry="172" fill="url(#atlas-face-light)"/><ellipse cx="951.3475" cy="425" rx="127" ry="172" fill="url(#atlas-face-light)"/><ellipse cx="795.5" cy="532" rx="125" ry="79" fill="url(#atlas-face-light)"/></g>
      <g class="face-eye-blink face-eye-left"><g class="face-eye-doze face-eye-left"><g class="face-eye-variant face-eye-neutral"><ellipse class="face-eye" cx="639.6525" cy="425" rx="56" ry="104" fill="url(#atlas-face-blue)" mask="url(#atlas-happy-left)"/></g>${expressiveEyes(0, 639.6525)}</g><path class="face-drowsy-eye face-drowsy-eye-left" d="M -56 -38 H 56 L 56 0 C 56 60 31 104 0 104 C -31 104 -56 60 -56 0 Z" transform="translate(639.6525 425)" fill="url(#atlas-face-blue)"/><path class="face-sleep-eye" d="M -49 3 Q 0 52 49 3" transform="translate(639.6525 425)" fill="none" stroke="url(#atlas-face-blue)" stroke-width="17" stroke-linecap="round"/></g>
      <g class="face-eye-blink face-eye-right"><g class="face-eye-doze face-eye-right"><g class="face-eye-variant face-eye-neutral"><ellipse class="face-eye" cx="951.3475" cy="425" rx="56" ry="104" fill="url(#atlas-face-blue)" mask="url(#atlas-happy-right)"/></g>${expressiveEyes(1, 951.3475)}</g><path class="face-drowsy-eye face-drowsy-eye-right" d="M -56 -38 H 56 L 56 0 C 56 60 31 104 0 104 C -31 104 -56 60 -56 0 Z" transform="translate(951.3475 425)" fill="url(#atlas-face-blue)"/><path class="face-sleep-eye" d="M -49 3 Q 0 52 49 3" transform="translate(951.3475 425)" fill="none" stroke="url(#atlas-face-blue)" stroke-width="17" stroke-linecap="round"/></g>
      <path class="face-mouth-previous" d="${smile}" fill="none" stroke="url(#atlas-face-blue)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="face-mouth" d="${smile}" fill="none" stroke="url(#atlas-face-blue)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="face-doze-mouth" d="${smile}" fill="none" stroke="#009dff" stroke-width="26" stroke-linecap="round"/>
      <path class="face-wake-mouth" d="M 795.5 521 A 21 30 0 1 1 795.5 581 A 21 30 0 1 1 795.5 521 Z" fill="url(#atlas-face-blue)"/>
      </g></g>
      <g class="face-sleep-z" fill="url(#atlas-face-blue)" aria-hidden="true"><path class="face-z face-z-one" d="M 0 0 H 22 V 6 L 8 26 H 22 V 33 H 0 V 27 L 14 7 H 0 Z"/><path class="face-z face-z-two" d="M 0 0 H 22 V 6 L 8 26 H 22 V 33 H 0 V 27 L 14 7 H 0 Z"/><path class="face-z face-z-three" d="M 0 0 H 22 V 6 L 8 26 H 22 V 33 H 0 V 27 L 14 7 H 0 Z"/></g>
    </g>
    <g class="face-connection-visual" aria-hidden="true">
      <ellipse cx="795.5" cy="465" rx="285" ry="280" fill="url(#atlas-face-light)" opacity=".16"/>
      <g class="face-connect-orbit">
        <circle cx="795.5" cy="465" r="185" transform="rotate(-30 795.5 465)" fill="none" stroke="url(#atlas-motion-blue)" stroke-width="39" stroke-linecap="round" stroke-dasharray="985 178"/>
        <circle class="face-connect-bead" cx="895" cy="309" r="23" fill="#39d6ff"/>
      </g>
    </g>
    <g class="face-offline-visual" aria-hidden="true">
      <ellipse cx="795.5" cy="465" rx="280" ry="250" fill="url(#atlas-face-light)" opacity=".16"/>
      <g class="face-wifi-signal" fill="none" stroke="url(#atlas-motion-blue)" stroke-width="39" stroke-linecap="round" mask="url(#atlas-wifi-cut)">
        <path d="M 588 380 Q 795.5 181 1003 380"/>
        <path d="M 650 446 Q 795.5 306 941 446"/>
        <path d="M 711 507 Q 795.5 426 880 507"/>
        <circle cx="795.5" cy="579" r="33" fill="url(#atlas-motion-blue)" stroke="none"/>
      </g>
      <path class="face-offline-slash" d="M 602 283 L 962 623" fill="none" stroke="url(#atlas-motion-blue)" stroke-width="34" stroke-linecap="round" pathLength="1"/>
    </g>
    <g class="face-clock-visual" aria-hidden="true">
      <ellipse cx="795.5" cy="465" rx="530" ry="220" fill="url(#atlas-face-light)" opacity=".12"/>
      <g transform="translate(319.5 321) scale(1.92)" fill="none" stroke="url(#atlas-motion-blue)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
        <path class="face-clock-digit-0" d="M 10 75 H 70"/>
        <path class="face-clock-digit-1" transform="translate(112 0)" d="M 10 75 H 70"/>
        <g class="face-clock-separator" fill="#03aaff" stroke="none"><circle cx="242" cy="49" r="8.5"/><circle cx="242" cy="103" r="8.5"/></g>
        <path class="face-clock-digit-2" transform="translate(292 0)" d="M 10 75 H 70"/>
        <path class="face-clock-digit-3" transform="translate(404 0)" d="M 10 75 H 70"/>
      </g>
    </g>
    <g class="face-usb-visual" aria-hidden="true">
      <g class="face-usb-art" transform="translate(795.5 465) scale(1.2) translate(-795.5 -465)">
      <ellipse class="face-usb-halo" cx="795.5" cy="440" rx="230" ry="250" fill="url(#atlas-face-light)" opacity=".16"/>
      <rect x="680" y="310" width="231" height="80" rx="32" fill="url(#atlas-motion-blue)"/>
      <rect x="701" y="331" width="189" height="38" rx="13" fill="#030910"/>
      <g clip-path="url(#atlas-usb-port-clip)"><g class="face-usb-plug">
        <path d="M 795.5 663 V 742" stroke="#009bff" stroke-width="24" stroke-linecap="round"/>
        <rect x="766" y="609" width="59" height="70" rx="17" fill="#009bff"/>
        <rect x="727" y="421" width="137" height="122" rx="8" fill="url(#atlas-motion-blue)"/>
        <rect x="751" y="453" width="22" height="25" rx="3" fill="#030910"/>
        <rect x="818" y="453" width="22" height="25" rx="3" fill="#030910"/>
        <path d="M 724 519 H 867 Q 881 519 881 536 V 604 Q 881 651 834 651 H 757 Q 710 651 710 604 V 536 Q 710 519 724 519 Z" fill="url(#atlas-motion-blue)"/>
      </g></g>
      <path class="face-usb-spark" d="M 650 333 L 629 319 M 940 333 L 961 319" fill="none" stroke="#35caff" stroke-width="9" stroke-linecap="round"/>
      </g>
    </g>
    <g class="face-wave" fill="url(#atlas-face-blue)"></g>
  </svg>
  <div class="face-whatsapp-visual" aria-live="polite">
    <div class="face-whatsapp-spinner" aria-hidden="true"><i></i><i></i><i></i></div>
    <canvas class="face-whatsapp-qr" width="512" height="512" aria-label="Código QR de WhatsApp"></canvas>
    <div class="face-whatsapp-check" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="48"/><path d="m34 61 17 17 36-39"/></svg></div>
    <div class="face-whatsapp-error" aria-hidden="true">!</div>
    <p class="face-whatsapp-title"></p><p class="face-whatsapp-detail"></p>
  </div>
  <div class="face-copy"><p class="face-transcript" aria-live="off"></p><p class="face-caption" role="status" aria-live="polite"></p></div>`;
  view.append(stage);
  const caption = stage.querySelector(".face-caption");
  const transcript = stage.querySelector(".face-transcript");
  const mouth = stage.querySelector(".face-mouth");
  const previousMouth = stage.querySelector(".face-mouth-previous");
  // Only four dynamic eye paths for the 150 new poses. The original 23 keep
  // their exact SVG geometry; the catalogue does not add hundreds of idle nodes.
  const catalogEyeNodes = ["left", "right"].map((side, index) => {
    const parent = stage.querySelector(`.face-eye-doze.face-eye-${side}`);
    const nodes = {};
    for (const layer of ["previous", "current"]) {
      const node = document.createElementNS(svgNS, "path");
      node.setAttribute("class", `face-catalog-eye face-catalog-eye-${layer}`);
      node.setAttribute("transform", `translate(${index ? 951.3475 : 639.6525} 425)`);
      node.setAttribute("stroke-linecap", "round");
      node.setAttribute("stroke-linejoin", "round");
      parent.append(node);
      nodes[layer] = node;
    }
    return nodes;
  });
  const decorations = {};
  for (const layer of ["previous", "current"]) {
    const node = document.createElementNS(svgNS, "g");
    node.setAttribute("class", `face-catalog-decoration face-catalog-decoration-${layer}`);
    stage.querySelector(".face-affect-bounce").append(node);
    decorations[layer] = node;
  }
  const accessoryPaths = Object.freeze({
    none: "",
    // Same 26-unit visual weight as the resting smile, with solid cushions.
    // The band joins the pads, rather than continuing through hollow outlines.
    headphones: '<path d="M 553 401 V 385 C 553 242 1038 242 1038 385 V 401"/><rect x="535" y="391" width="36" height="77" rx="17" fill="#009dff" stroke="none"/><rect x="1020" y="391" width="36" height="77" rx="17" fill="#009dff" stroke="none"/>',
    headphone_one: '<path d="M 553 401 V 385 C 553 242 1038 242 1038 385 Q 1038 399 1046 408"/><rect x="535" y="391" width="36" height="77" rx="17" fill="#009dff" stroke="none"/><rect x="1032" y="399" width="36" height="66" rx="17" transform="rotate(-12 1050 432)" fill="#009dff" stroke="none"/>',
    note: '<path d="M 1067 350 V 294 L 1120 283 V 339" stroke-width="18"/><ellipse cx="1055" cy="351" rx="22" ry="15" fill="#009dff" stroke="none"/><ellipse cx="1108" cy="340" rx="22" ry="15" fill="#009dff" stroke="none"/>',
    tv: '<rect x="749" y="606" width="93" height="59" rx="10"/><path d="M 776 685 H 815 M 795.5 665 V 681" stroke-width="14"/>',
    cast: '<path d="M 749 620 V 616 Q 749 606 759 606 H 832 Q 842 606 842 616 V 655 Q 842 665 832 665 H 805"/><path d="M 747 638 Q 775 638 775 666 M 747 656 Q 757 656 757 666" stroke-width="14"/><circle cx="746" cy="676" r="6" fill="#009dff" stroke="none"/>',
    speaker: '<path d="M 752 628 H 771 L 796 608 V 669 L 771 650 H 752 Z" fill="#009dff" stroke="none"/><path d="M 814 622 Q 830 638 814 654 M 833 606 Q 861 638 833 670" stroke-width="16"/>',
    bluetooth: '<path d="M 791 600 V 678 L 823 651 L 762 617 M 762 662 L 823 627 L 791 600" stroke-width="16"/>',
    phone: '<rect x="770" y="603" width="51" height="79" rx="11" stroke-width="16"/><path d="M 790 666 H 801" stroke-width="8"/>',
    link: '<path d="M 788 625 L 800 613 C 827 590 859 623 832 646 L 821 656 M 802 650 L 790 662 C 763 685 731 652 758 629 L 769 619 M 779 647 L 811 622" stroke-width="18"/>',
    link_off: '<path d="M 800 613 C 827 590 859 623 832 646 M 790 662 C 763 685 731 652 758 629 M 753 603 L 840 678" stroke-width="18"/>',
    check: '<path d="M 761 637 L 787 663 L 836 614"/>',
    search: '<circle cx="783" cy="630" r="27" stroke-width="18"/><path d="M 804 650 L 835 680" stroke-width="18"/>',
  });
  const wave = stage.querySelector(".face-wave");
  const whatsappQr = stage.querySelector(".face-whatsapp-qr");
  const whatsappTitle = stage.querySelector(".face-whatsapp-title");
  const whatsappDetail = stage.querySelector(".face-whatsapp-detail");
  const clockDigits = Array.from({ length: 4 }, (_, i) => stage.querySelector(`.face-clock-digit-${i}`));
  // Rounded native outlines keep the intended type identical on the Pi and
  // phones, without loading a font or relying on the platform's monospace face.
  const digitPaths = [
    "M 40 5 C 14 5 4 28 4 75 C 4 122 14 145 40 145 C 66 145 76 122 76 75 C 76 28 66 5 40 5 Z",
    "M 10 30 L 40 5 V 145",
    "M 4 33 C 7 -4 73 -7 76 32 C 80 61 4 110 4 145 H 78",
    "M 5 24 C 16 -1 74 -5 76 33 C 78 57 58 72 34 72 M 34 72 C 94 63 98 145 43 145 C 21 145 8 136 3 123",
    "M 61 145 V 5 L 0 100 H 81",
    "M 75 5 H 8 V 65 C 94 36 99 147 42 145 C 21 145 8 136 3 125",
    "M 69 5 C 22 13 3 45 4 99 C 5 161 82 159 79 101 C 77 59 8 56 4 99",
    "M 1 5 H 80 L 24 145",
    "M 40 71 C -4 69 -6 5 40 5 C 86 5 84 69 40 71 C -10 73 -10 145 40 145 C 90 145 90 73 40 71 Z",
    "M 11 145 C 59 137 77 104 76 51 C 75 -11 -2 -9 1 49 C 3 91 72 94 76 51",
  ];
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
  function visiblePresentation() {
    if (["connecting", "qr", "success", "error"].includes(whatsappMode)) return "whatsapp";
    // A microphone can reconnect while Realtime is rebuilding its audio source.
    // Hardware feedback must remain visible during that recovery as well.
    if (usbActive && ["idle", "connecting", "error"].includes(state)) return "usb";
    // Connection and offline feedback replace the face, not the reliable voice
    // controller. A generic Realtime retry uses the linking animation; only a
    // browser-known offline network uses the crossed Wi-Fi glyph.
    if (!networkOnline) return "offline";
    if (["connecting", "error"].includes(state) || !connectionHealthy) return "connecting";
    if (state === "listening") return "listening";
    if (displayMode === "clock" && state === "idle") return "clock";
    return "face";
  }
  function paintClock() {
    const value = new Date();
    const formatter = new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    const pieces = Object.fromEntries(formatter.formatToParts(value)
      .filter(piece => piece.type === "hour" || piece.type === "minute")
      .map(piece => [piece.type, piece.value]));
    const digits = `${pieces.hour || "00"}${pieces.minute || "00"}`;
    clockDigits.forEach((node, i) => setAttribute(node, "d", digitPaths[Number(digits[i])]));
  }
  function syncClock() {
    clearTimeout(clockTimer);
    clockTimer = 0;
    if (suspended || stage.dataset.presentation !== "clock") return;
    paintClock();
    clockTimer = setTimeout(syncClock, Math.max(50, 1005 - (Date.now() % 1000)));
  }
  function syncPresentation() {
    if (usbActive && (!["idle", "connecting", "error"].includes(state) || suspended)) clearUsb();
    const presentation = visiblePresentation();
    if (stage.dataset.presentation !== presentation) stage.dataset.presentation = presentation;
    stage.dataset.displayMode = displayMode;
    stage.dataset.whatsapp = whatsappMode;
    stage.dataset.network = networkOnline ? "online" : "offline";
    syncClock();
  }
  function renderWhatsAppQr(matrix) {
    if (!whatsappQr || !Array.isArray(matrix) || !matrix.length) return;
    const size = matrix.length;
    const unit = 9;
    whatsappQr.width = size * unit;
    whatsappQr.height = size * unit;
    const context = whatsappQr.getContext("2d", { alpha: false });
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#f3f9ff";
    context.fillRect(0, 0, whatsappQr.width, whatsappQr.height);
    context.fillStyle = "#008ff4";
    matrix.forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell === "1") context.fillRect(x * unit, y * unit, unit, unit);
    }));
  }
  function applyWhatsAppState(payload = {}) {
    const mode = ["idle", "connecting", "qr", "success", "error"].includes(payload.mode)
      ? payload.mode : "idle";
    whatsappMode = mode;
    whatsappSequence = Number(payload.sequence) || 0;
    if (mode === "qr") renderWhatsAppQr(payload.matrix);
    const copy = {
      idle: ["", ""],
      connecting: ["Preparando WhatsApp", "Un momento…"],
      qr: ["Vincula WhatsApp", "Escanea el código desde Dispositivos vinculados"],
      success: ["WhatsApp conectado", payload.phone ? `Cuenta +${payload.phone}` : "Vinculación completada"],
      error: ["No se pudo vincular", payload.message || "Vuelve a intentarlo"],
    }[mode];
    setText(whatsappTitle, copy[0]);
    setText(whatsappDetail, copy[1]);
    syncPresentation();
  }
  function stopWhatsAppPolling() {
    clearTimeout(whatsappTimer);
    whatsappTimer = 0;
    whatsappRequest?.abort();
    whatsappRequest = null;
  }
  async function pollWhatsApp() {
    if (whatsappRequest || suspended || !window.atlasAccess?.hasControl?.()) return;
    const controller = new AbortController();
    whatsappRequest = controller;
    let delay = whatsappMode === "idle" ? 1500 : 450;
    try {
      const response = await window.atlasAccess.fetch("/api/whatsapp/display", {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error(`whatsapp display ${response.status}`);
      const payload = await response.json();
      if (!controller.signal.aborted
          && (Number(payload.sequence) !== whatsappSequence || payload.mode !== whatsappMode)) {
        applyWhatsAppState(payload);
      }
    } catch { delay = controller.signal.aborted ? 1200 : 2500; }
    finally {
      if (whatsappRequest === controller) whatsappRequest = null;
      if (!suspended) whatsappTimer = setTimeout(pollWhatsApp, delay);
    }
  }
  function resumeWhatsAppPolling() {
    clearTimeout(whatsappTimer);
    whatsappTimer = 0;
    if (!suspended && window.atlasAccess?.hasControl?.()) void pollWhatsApp();
  }
  function applyDisplayMode(payload) {
    const mode = payload?.mode;
    if (!["face", "clock"].includes(mode)) return false;
    displayMode = mode;
    if (typeof payload.cursor === "string") displayCursor = payload.cursor;
    const event = payload.usb;
    if (event && typeof event.id === "string") {
      const [epoch, sequence] = event.id.split(":");
      const [previousEpoch, previousSequence] = (usbEventId || "").split(":");
      if (epoch !== previousEpoch) usbEventId = event.id;
      else if (Number(sequence) > Number(previousSequence)) {
        usbEventId = event.id;
        if (Number.isFinite(event.ageMs) && event.ageMs < 4000) showUsb(event.kind);
      }
    }
    syncPresentation();
    return true;
  }
  function clearUsb() {
    clearTimeout(usbTimer);
    usbTimer = 0;
    usbActive = false;
  }
  function showUsb(kind) {
    if (suspended || !["idle", "connecting", "error"].includes(state)) return;
    const action = kind === "detached" ? "detached" : "attached";
    if (usbActive && stage.dataset.usbAction === action) return;
    clearTimeout(usbTimer);
    stage.dataset.usbAction = action;
    usbActive = true;
    usbTimer = setTimeout(() => { clearUsb(); syncPresentation(); }, 2400);
  }
  function stopDisplayEvents() {
    clearTimeout(displayRetryTimer);
    displayRetryTimer = 0;
    displayRequest?.abort();
    displayRequest = null;
  }
  async function listenDisplayEvents() {
    if (displayRequest || suspended || !window.atlasAccess?.hasControl?.()) return;
    const controller = new AbortController();
    displayRequest = controller;
    let retry = 0;
    try {
      const response = await window.atlasAccess.fetch(`/api/display-mode/events?after=${encodeURIComponent(displayCursor)}`,
        { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`display mode ${response.status}`);
      const snapshot = await response.json();
      if (!controller.signal.aborted && applyDisplayMode(snapshot)) retry = 0;
    } catch {
      retry = controller.signal.aborted ? 0 : 700;
    } finally {
      if (displayRequest === controller) displayRequest = null;
      if (!suspended && window.atlasAccess?.hasControl?.()) {
        displayRetryTimer = setTimeout(listenDisplayEvents, retry);
      }
    }
  }
  function resumeDisplayEvents() {
    if (suspended || !window.atlasAccess?.hasControl?.()) return;
    clearTimeout(displayRetryTimer);
    displayRetryTimer = 0;
    void listenDisplayEvents();
  }
  async function setDisplayMode(mode) {
    if (!["face", "clock"].includes(mode) || suspended || !window.atlasAccess?.hasControl?.()) return false;
    try {
      const response = await window.atlasAccess.fetch("/api/display-mode", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok || !applyDisplayMode(await response.json())) return false;
      resumeDisplayEvents();
      return true;
    } catch { return false; }
  }
  function clearExpressionTransition() {
    clearTimeout(expressionTransitionTimer);
    expressionTransitionTimer = 0;
    if (stage.hasAttribute("data-expression-transition")) stage.removeAttribute("data-expression-transition");
    if (stage.hasAttribute("data-happy-bounce")) stage.removeAttribute("data-happy-bounce");
    if (stage.hasAttribute("data-clap-returning")) stage.removeAttribute("data-clap-returning");
    clearTimeout(clapPulseTimer);
    clapPulseTimer = 0;
    if (stage.hasAttribute("data-clap-activated")) stage.removeAttribute("data-clap-activated");
    stage.removeAttribute("data-catalog-previous");
    stage.removeAttribute("data-catalog-morph");
  }
  function clearExpressionGesture() {
    clearTimeout(expressionGestureTimer);
    expressionGestureTimer = 0;
    stage.removeAttribute("data-expression-gesture");
  }
  function paintCatalogExpression(name, previousName) {
    const current = catalogEntries.get(name);
    const previous = catalogEntries.get(previousName);
    const isNew = current && !current.legacy;
    const wasNew = previous && !previous.legacy;
    stage.dataset.catalogExpression = String(Boolean(isNew));
    stage.dataset.catalogPrevious = String(Boolean(wasNew));
    stage.dataset.expressionCategory = current?.category || "legacy";
    stage.dataset.expressionIntensity = current?.intensity || "original";
    const duration = name === "neutral" ? previous?.motion?.exitMs : current?.motion?.entryMs;
    stage.style.setProperty("--face-expression-duration", `${duration || 180}ms`);
    stage.dataset.expressionMotion = name === "neutral" ? previous?.motion?.exit || "settle" : current?.motion?.entry || "morph";
    const gesture = (name === "neutral" ? previous : current)?.motion?.gesture;
    stage.style.setProperty("--face-gesture-duration", `${gesture?.durationMs || 480}ms`);
    let morphCompatible = Boolean(isNew && wasNew);
    catalogEyeNodes.forEach((nodes, index) => {
      for (const [layer, entry] of [["previous", previous], ["current", current]]) {
        if (!entry || entry.legacy) continue;
        const shape = entry.pose.eyes[index];
        setAttribute(nodes[layer], "d", shape.d);
        setAttribute(nodes[layer], "fill", shape.stroke ? "none" : blue);
        setAttribute(nodes[layer], "stroke", shape.stroke ? "#009dff" : "none");
        setAttribute(nodes[layer], "stroke-width", String(shape.stroke || 0));
      }
      if (isNew && wasNew && current.pose.eyes[index].stroke !== previous.pose.eyes[index].stroke) morphCompatible = false;
    });
    stage.dataset.catalogMorph = String(morphCompatible);
    decorations.previous.innerHTML = decorations.current.innerHTML;
    const pose = isNew ? current.pose : null;
    decorations.current.innerHTML = pose ? pose.brows.map((d, index) => d
      ? `<path class="face-catalog-brow" d="${d}" transform="translate(${index ? 951.3475 : 639.6525} 401)" fill="none" stroke="#009dff" stroke-width="26" stroke-linecap="round"/>` : "").join("")
      + `<g class="face-catalog-accessory" data-accessory="${pose.accessory}" transform="translate(0 ${["none", "headphones", "headphone_one", "note"].includes(pose.accessory) ? 0 : 18})" fill="none" stroke="#009dff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">${accessoryPaths[pose.accessory] || ""}</g>` : "";
  }
  function beginResponse(id) {
    if (id != null && id === responseExpressionId) return false;
    responseExpressionId = id ?? null;
    responseExpressionCount = 0;
    return true;
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
    const profile = expressions[activeExpression];
    const style = profile.speech;
    let opening = 12 + level * 57;
    let width = 52 - level * 10;
    let d;
    // The neutral articulation is intentionally unchanged. Other expressions
    // retain their affect in the upper lip and their own resting mouth at PCM 0.
    if (catalogEntries.get(activeExpression)?.legacy === false && profile.mouthShape && style !== "round") {
      // Preserve each new pose's corner tilt and emotional upper lip while
      // articulating. Loudness opens the mouth; it never replaces the emotion
      // with an unrelated generic smile.
      const [half, y, bend, tilt] = profile.mouthShape;
      width = half * (1 - level * .12);
      const lower = y + Math.max(12, bend * .45) + level * 47;
      d = `M ${795.5-width} ${y} Q 795.5 ${y+bend*.55} ${795.5+width} ${y+tilt} Q ${795.5+width} ${lower} 795.5 ${lower} Q ${795.5-width} ${lower} ${795.5-width} ${y} Z`;
    } else if (style === "round") {
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
    const previousExpression = activeExpression;
    const changed = activeExpression !== name;
    if (changed) {
      clearExpressionTransition();
      clearExpressionGesture();
      for (const attribute of ["d", "fill", "stroke-width"]) setAttribute(previousMouth, attribute, mouth.getAttribute(attribute) || "none");
    }
    activeExpression = name;
    activeExpressionSource = source;
    if (stage.dataset.expression !== name) stage.dataset.expression = name;
    if (stage.dataset.expressionSource !== source) stage.dataset.expressionSource = source;
    if (!changed) return;
    lastExpressionChangedAt = performance.now();
    paintCatalogExpression(name, previousExpression);
    if (state === "speaking") speechMouth(mouthLevel); else restMouth();
    if (animate && !suspended && !reducedMotion.matches) {
      stage.setAttribute("data-expression-transition", "true");
      // Eye/mouth morphs finish quickly, but a small physical gesture needs
      // time to settle. Do not truncate the gesture at the crossfade deadline.
      const gesture = catalogEntries.get(name === "neutral" ? previousExpression : name)?.motion?.gesture;
      if (gesture) {
        stage.setAttribute("data-expression-gesture", "true");
        expressionGestureTimer = setTimeout(clearExpressionGesture, gesture.durationMs);
      }
      if (name === "delighted") stage.setAttribute("data-happy-bounce", "true");
      if (previousExpression === "defiant" && name === "neutral") stage.setAttribute("data-clap-returning", "true");
      expressionTransitionTimer = setTimeout(clearExpressionTransition,
        name === "neutral" ? catalogEntries.get(previousExpression)?.motion?.exitMs || 180 : catalogEntries.get(name)?.motion?.entryMs || 180);
    } else {
      stage.removeAttribute("data-catalog-previous");
      stage.removeAttribute("data-catalog-morph");
    }
  }
  function syncExpression() {
    clearTimeout(expressionTimer);
    expressionTimer = 0;
    const now = performance.now();
    if (modelExpression && modelExpression.expiresAt <= now) modelExpression = null;
    if (pettingExpression && pettingExpression.expiresAt <= now) pettingExpression = null;
    if (clapExpression && clapExpression.expiresAt <= now) clapExpression = null;
    const selected = clapExpression || pettingExpression || modelExpression;
    renderExpression(selected?.expression || "neutral", clapExpression ? "clap" : pettingExpression ? "petting" : modelExpression ? (modelExpression.source || "model") : "neutral");
    const deadlines = [modelExpression, pettingExpression, clapExpression].filter(Boolean).map(item => item.expiresAt);
    if (deadlines.length && !suspended) expressionTimer = setTimeout(syncExpression, Math.max(1, Math.min(...deadlines) - now));
    syncSleepClock();
  }
  function resetExpression() {
    clearTimeout(expressionTimer);
    expressionTimer = 0;
    modelExpression = pettingExpression = clapExpression = null;
    responseExpressionCount = 0;
    responseExpressionId = null;
    lastAutonomousExpressionAt = -Infinity;
    clearExpressionTransition();
    clearExpressionGesture();
    renderExpression("neutral", "neutral", false);
  }
  function expression(payload = {}) {
    if (!payload || typeof payload !== "object" || suspended || document.hidden || view.hidden || content.hidden || pageSuspended) return false;
    const { source = "model" } = payload;
    const name = ({ happy: "delighted", sleep: "asleep" })[payload.expression] || payload.expression;
    const durationMs = payload.durationMs ?? catalogEntries.get(name)?.recommendedDurationMs ?? (name === "asleep" ? 3600000 : expressionPolicy.defaultDurationMs);
    if (!expressionNames.includes(name) || !["model", "command", "petting", "event"].includes(source)) return false;
    const conversationCue = source === "event" && payload.conversationCue === true && payload.awaitSpeech === true && name !== "asleep";
    // Local conversation cues are fallback-only: never replace a manually
    // chosen pose, a model pose, a caress/clap or verified device feedback.
    if (conversationCue && (activeExpression !== "neutral" || modelExpression || pettingExpression || clapExpression)) return false;
    if (expressionCatalog && (source === "model" || source === "event")) {
      if (payload.responseId != null) beginResponse(payload.responseId);
      // Repeated model chunks do not restart a pose or extend its lifetime.
      // A verified device event can already show the requested pose, however:
      // transfer that same pose to the speech lease without another animation
      // or geometric change. Explicit command poses retain their own lifetime.
      if (name === activeExpression) {
        if (source === "model" && payload.awaitSpeech === true && name !== "asleep"
            && activeExpressionSource === "event" && modelExpression?.source === "event"
            && modelExpression.expression === name) {
          const duration = Number.isFinite(Number(durationMs))
            ? clamp(durationMs, expressionPolicy.minHoldMs, 30000) : expressionPolicy.defaultDurationMs;
          modelExpression = { expression: name, source, duration,
            awaitSpeech: true, playbackStarted: false, expiresAt: performance.now() + 45000 };
          syncExpression();
        }
        return true;
      }
      const now = performance.now();
      // The real model can select a more precise pose after the first audio
      // fragment. Yield immediately without a neutral flash or cooldown
      // penalty, but a different pose still consumes the second visual change.
      const replacesCue = source === "model" && modelExpression?.conversationCue === true
        && activeExpressionSource === "event";
      if (responseExpressionCount >= expressionPolicy.maxChangesPerResponse
          || (!replacesCue && (now-lastAutonomousExpressionAt < expressionPolicy.cooldownMs
          || (["model", "event"].includes(activeExpressionSource) && now-lastExpressionChangedAt < expressionPolicy.minHoldMs)))) return false;
      responseExpressionCount += 1;
      lastAutonomousExpressionAt = now;
    }
    if (source === "petting") {
      if (name !== "delighted") return false;
      interact({ source: "petting" });
      pettingExpression = { expression: name, expiresAt: performance.now() + 6000 };
    } else {
      const duration = Number.isFinite(Number(durationMs)) ? clamp(durationMs, source === "command" ? 1 : expressionPolicy.minHoldMs, name === "asleep" ? 3600000 : 30000) : expressionPolicy.defaultDurationMs;
      const awaitSpeech = (source === "model" && payload.awaitSpeech === true && name !== "asleep") || conversationCue;
      modelExpression = name === "neutral" ? null : { expression: name, source, duration,
        awaitSpeech, conversationCue, playbackStarted: false, expiresAt: performance.now() + (awaitSpeech ? 45000 : duration) };
    }
    syncExpression();
    return true;
  }
  function expressionPlayback({ active = false, final = false } = {}) {
    // Model poses and explicit local conversation cues follow actual playback.
    // CLI poses, sleep and ordinary device events keep independent lifetimes.
    if (!modelExpression?.awaitSpeech || (modelExpression.source !== "model" && !modelExpression.conversationCue)) return false;
    if (final) { modelExpression = null; syncExpression(); return true; }
    if (!active || modelExpression.playbackStarted) return false;
    modelExpression.playbackStarted = true;
    modelExpression.expiresAt = performance.now() + modelExpression.duration;
    syncExpression();
    return true;
  }
  function cancelBlink() {
    clearTimeout(blinkTimer);
    clearTimeout(blinkEndTimer);
    clearTimeout(blinkPhaseTimer);
    blinkTimer = blinkEndTimer = blinkPhaseTimer = 0;
    if (stage.hasAttribute("data-blinking")) stage.removeAttribute("data-blinking");
  }
  function syncBlink(delay) {
    if (suspended || state !== "idle" || drawerWasOpen || sleepPhase === "asleep" || reducedMotion.matches) { cancelBlink(); return; }
    if (blinkTimer || blinkEndTimer) return;
    const interval = sleepPhase === "drowsy-two" ? randomBetween(10000, 13000)
      : sleepPhase === "drowsy-one" ? randomBetween(12000, 15000)
        : randomBetween(13000, 16000);
    const transition = nextSleepTransition();
    const now = performance.now();
    let wait = delay ?? interval;
    if (transition) {
      const normalAt = now + wait;
      if (transition.at <= normalAt + SLEEP_PHASE_BLINK_GUARD_MS) {
        wait = Math.max(1, transition.at - now, lastBlinkStartedAt + SLEEP_PHASE_BLINK_GUARD_MS - now);
      }
    }
    blinkTimer = setTimeout(() => {
      blinkTimer = 0;
      if (suspended || state !== "idle" || drawerWasOpen || sleepPhase === "asleep" || reducedMotion.matches) return;
      const startedAt = performance.now();
      lastBlinkStartedAt = startedAt;
      stage.setAttribute("data-blinking", "true");
      const phaseChange = nextSleepTransition();
      if (phaseChange && startedAt + 1 >= phaseChange.at) {
        blinkPhaseTimer = setTimeout(() => {
          blinkPhaseTimer = 0;
          if (canDoze()) setSleepPhase(phaseChange.phase, true);
        }, Math.round(BLINK_DURATION_MS * .48));
      }
      blinkEndTimer = setTimeout(() => {
        blinkEndTimer = 0;
        stage.removeAttribute("data-blinking");
        const nextInterval = sleepPhase === "drowsy-two" ? randomBetween(10000, 13000)
          : sleepPhase === "drowsy-one" ? randomBetween(12000, 15000)
            : randomBetween(13000, 16000);
        syncBlink(Math.max(1000, nextInterval - (performance.now() - startedAt)));
      }, BLINK_DURATION_MS);
    }, wait);
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
  function createSleepPlan(startedAt) {
    return {
      drowsyOneAt: startedAt + randomBetween(50000, 55000),
      drowsyTwoAt: startedAt + randomBetween(75000, 80000),
      asleepAt: startedAt + randomBetween(100000, 105000),
    };
  }
  function nextSleepTransition() {
    if (!sleepPlan || !canDoze()) return null;
    if (sleepPhase === "awake") return { phase: "drowsy-one", at: sleepPlan.drowsyOneAt };
    if (sleepPhase === "drowsy-one") return { phase: "drowsy-two", at: sleepPlan.drowsyTwoAt };
    if (sleepPhase === "drowsy-two") return { phase: "asleep", at: sleepPlan.asleepAt };
    return null;
  }
  function canDoze() {
    return !suspended && !document.hidden && !view.hidden && !content.hidden
      && !pageSuspended && connectionHealthy && !drawerWasOpen && state === "idle";
  }
  function setSleepPhase(next, duringBlink = false) {
    if (sleepPhase === next) return;
    sleepPhase = next;
    stage.dataset.sleep = next;
    // A normal state change can rebuild the blink schedule immediately. A
    // sleep phase change happens at the closed midpoint of the current blink:
    // let that blink finish before scheduling another one, otherwise the new
    // phase would tear down its own transition.
    if (!duringBlink) {
      cancelBlink();
      syncBlink();
    }
  }
  // This is decorative inactivity only. It neither pauses the recognizer nor
  // changes the assistant's real state, microphone, audio or response timing.
  function syncSleepClock() {
    if (activeExpression === "asleep" && !suspended) {
      clearSleepDeadline();
      sleepPlan = null;
      idleWasEligible = false;
      setSleepPhase("asleep");
      return;
    }
    if (!canDoze()) {
      clearSleepDeadline();
      idleWasEligible = false;
      sleepPlan = null;
      setSleepPhase("awake");
      return;
    }
    const now = performance.now();
    if (!idleWasEligible) {
      idleWasEligible = true;
      lastInteractionAt = now;
      sleepPlan = createSleepPlan(now);
    }
    if (reducedMotion.matches) {
      const transition = nextSleepTransition();
      const deadline = transition?.at || 0;
      if (deadline === sleepDeadline && (sleepTimer || !deadline)) return;
      clearSleepDeadline();
      if (deadline) {
        sleepDeadline = deadline;
        sleepTimer = setTimeout(() => {
          sleepTimer = sleepDeadline = 0;
          if (canDoze()) setSleepPhase(transition.phase);
          syncSleepClock();
        }, Math.max(1, deadline - now));
      }
    } else {
      clearSleepDeadline();
      syncBlink();
    }
  }
  function interact({ source = "controls" } = {}) {
    if (!["wake", "petting", "controls", "clap"].includes(source) || suspended || document.hidden || view.hidden || content.hidden || pageSuspended) return false;
    const wasAsleep = sleepPhase === "asleep";
    if (modelExpression?.expression === "asleep") {
      modelExpression = null;
      syncExpression();
    }
    clearSleepDeadline();
    clearWake();
    lastInteractionAt = performance.now();
    sleepPlan = null;
    idleWasEligible = false;
    setSleepPhase("awake");
    if (wasAsleep && source === "wake" && !reducedMotion.matches) {
      stage.setAttribute("data-waking", "true");
      wakingTimer = setTimeout(clearWake, 180);
    }
    syncSleepClock();
    syncBlink();
    return true;
  }
  function clap() {
    // A pair is a ready-state gesture only. It cannot interrupt recognition,
    // a request or playback, and has no effect in the diagnostics surfaces.
    if (state !== "idle" || suspended || document.hidden || view.hidden || content.hidden || pageSuspended) return false;
    if (!interact({ source: "clap" })) return false;
    clapExpression = { expression: "defiant", expiresAt: performance.now() + 3000 };
    syncExpression();
    stage.setAttribute("data-clap-activated", "true");
    clearTimeout(clapPulseTimer);
    clapPulseTimer = setTimeout(() => stage.removeAttribute("data-clap-activated"), 170);
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
      if (nextState === "listening" && previousState !== "listening") beginResponse();
      if (nextState === "listening" || (nextState === "speaking" && activeExpression !== "asleep")) interact({ source: nextState === "listening" ? "wake" : "controls" });
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
    syncPresentation();
    syncSleepClock();
    syncBlink();
    scheduleDraw();
  }
  function onVisibility() {
    suspended = pageSuspended || document.hidden || view.hidden || content.hidden;
    setAttribute(document.body, "data-face-paused", String(suspended));
    if (suspended) {
      clearUsb();
      usbEventId = null; // Hidden/reloaded pages never replay an old attachment.
      cancelAnimationFrame(frame);
      frame = 0;
      clearTimeout(boundaryTimer);
      clearWake();
      resetExpression();
      resetMouth();
      stopDisplayEvents();
      stopWhatsAppPolling();
      syncClock();
    } else {
      scheduleDraw();
      syncPresentation();
      resumeDisplayEvents();
      resumeWhatsAppPolling();
    }
    syncSleepClock();
    syncBlink();
  }
  new MutationObserver(onVisibility).observe(view, { attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(onVisibility).observe(content, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("pointerdown", event => { if (event.isTrusted !== false) interact({ source: "controls" }); });
  document.addEventListener("keydown", event => { if (event.isTrusted !== false) interact({ source: "controls" }); });
  window.addEventListener("pagehide", () => { pageSuspended = true; stopDisplayEvents(); onVisibility(); });
  window.addEventListener("pageshow", () => { pageSuspended = false; onVisibility(); });
  window.addEventListener("atlas-access-acquired", () => {
    resumeDisplayEvents();
    resumeWhatsAppPolling();
  });
  window.addEventListener("online", () => { networkOnline = true; syncPresentation(); });
  window.addEventListener("offline", () => { networkOnline = false; syncPresentation(); });
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
    clap,
    expression,
    expressionPlayback,
    beginResponse,
    clearConversationCue() {
      if (!modelExpression?.conversationCue) return false;
      modelExpression = null;
      syncExpression();
      return true;
    },
    clearAutonomous() {
      // Cancellation is a lifecycle action, not another emotional tool call.
      // It cannot be rejected by a consumed budget, and must not cancel an
      // explicitly commanded nap/pose or a local petting/clap gesture.
      const cleared = ["model", "event"].includes(modelExpression?.source);
      if (cleared) { modelExpression = null; syncExpression(); }
      responseExpressionCount = 0;
      responseExpressionId = null;
      lastAutonomousExpressionAt = -Infinity;
      return cleared;
    },
    listExpressions() { return expressionNames.slice(); },
    snapshot() {
      const metadata = catalogEntries.get(activeExpression);
      return Object.freeze({ expression: activeExpression, source: activeExpressionSource,
        category: metadata?.category || "legacy", intensity: metadata?.intensity || "original",
        accessory: metadata?.pose?.accessory || "none", state, sleepPhase,
        presentation: stage.dataset.presentation, responseExpressionCount, responseId: responseExpressionId,
        awaitingSpeech: Boolean(modelExpression?.awaitSpeech && !modelExpression.playbackStarted),
        conversationCue: Boolean(modelExpression?.conversationCue),
        catalogVersion: expressionCatalog?.schemaVersion || 0 });
    },
    clearCommand() {
      if (modelExpression?.source === "command") { modelExpression = null; syncExpression(); }
    },
    reset() { resetExpression(); clearWake(); clearSleepDeadline(); sleepPlan = null; idleWasEligible = false; setSleepPhase("awake"); syncSleepClock(); },
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
    connection({ healthy = false, label = "", networkOnline: nextNetworkOnline } = {}) {
      connectionHealthy = Boolean(healthy);
      networkOnline = typeof nextNetworkOnline === "boolean" ? nextNetworkOnline
        : (typeof navigator === "undefined" || navigator.onLine !== false);
      if (!connectionHealthy) clearWake();
      setAttribute(stage, "aria-label", label || (networkOnline ? "ATLAS" : "ATLAS sin Wi-Fi"));
      syncPresentation();
      syncSleepClock();
    },
    setDisplayMode,
    displayMode() { return displayMode; },
    speechBoundary({ type, charLength = 4 } = {}) {
      if (state !== "speaking" || suspended) return;
      // SpeechSynthesis exposes no PCM: use real word events, or explicitly
      // approximate text-timing pulses, and restore the mouth after each pulse.
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
