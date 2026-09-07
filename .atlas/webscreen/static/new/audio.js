/* Read-only visual telemetry. Never owns a microphone, speaker or wake decision. */
(() => {
  "use strict";
  if (document.body?.dataset.design !== "new") return;

  const ZERO = Object.freeze({ rms: 0, peak: 0, db: -100, available: true });
  const OUTPUT_SAMPLE_MS = 1000 / 30;
  const EXPRESSIONS = new Set(["neutral", "angry", "delighted", "surprised", "curious", "skeptical",
    "sad", "worried", "sleepy", "wink", "laughing", "focused", "shy"]);
  let screen = { state: "connecting", phase: "", title: "", detail: "" };
  let lastVisualState = "";
  let microphoneMuted = false;
  let suspended = false;
  let outputContext = null;
  let outputContextPolicy = null;
  let sampleTimer = 0;
  let nativeEnabled = false;
  let nativeActive = false;
  let nativeTap = null;
  let nativeWaiting = false;
  let connectionState = { healthy: false, label: "Conectando con ATLAS A1" };
  let epoch = 0;
  let lastInputSpeechAt = 0;
  let inputQuiet = false;
  let currentTranscript = "";
  const external = new Map();
  const utterances = new Map();

  // Fail closed visually: a rendering exception must never stop a voice turn.
  function face(method, value) {
    try { window.AtlasFace?.[method]?.(value); } catch {}
  }

  function levels(samples) {
    let energy = 0;
    let peak = 0;
    for (const sample of samples) {
      energy += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(energy / Math.max(1, samples.length));
    return { rms, peak, db: Math.max(-100, 20 * Math.log10(Math.max(0.00001, rms))), available: true };
  }

  function outputIsPlaying() {
    if (suspended) return false;
    if (nativeActive && nativeEnabled && !nativeWaiting && nativeTap?.audio?.muted !== true
        && nativeTap?.audio?.paused !== true && nativeTap?.audio?.volume !== 0) return true;
    return [...external.values()].some(item => item.playing && !item.audio.muted && !item.audio.paused && item.audio.volume !== 0)
      || [...utterances.values()].some(item => item.playing);
  }

  function render() {
    let state = screen.state;
    if (suspended) state = "connecting";
    else if (outputIsPlaying()) state = "speaking";
    // Existing debug screens label queued synthesis as speaking; the face must
    // wait for a real playout event, not for a generated text delta.
    else if (state === "speaking") state = "working";
    else if (state === "listening" && microphoneMuted) state = "idle";
    else if (state === "listening" && inputQuiet) state = "working";
    if (state !== lastVisualState) {
      lastVisualState = state;
      face("update", { ...screen, state,
        ...(microphoneMuted && state === "idle" ? { phase: "MICRÓFONO SILENCIADO", title: "Micrófono silenciado" } : {}) });
      if (state === "listening" && currentTranscript) face("transcript", currentTranscript);
    }
  }

  function update(value) {
    const previous = screen.state;
    const next = { ...screen, ...value };
    const phase = String(next.phase || "");
    // The legacy UI also uses 'listening' while negotiating or asking for mic
    // permission. Only the authorized wake/capture phases become a waveform.
    if (next.state === "listening" && !/^(ESCUCHANDO|ACTIVADO|GRABANDO|INTERRUMPIDO)$/u.test(phase)) {
      next.state = "connecting";
    }
    screen = next;
    if (screen.state === "listening" && previous !== "listening") {
      lastInputSpeechAt = performance.now();
      inputQuiet = false;
      currentTranscript = "";
      face("transcript", "");
    }
    if (["idle", "connecting", "error"].includes(screen.state)) {
      inputQuiet = false;
      face("inputLevel", ZERO);
    }
    // Preserve new error/connection details even when the state is unchanged.
    lastVisualState = "";
    render();
    connection(connectionState);
  }

  function inputLevel(value) {
    if (suspended || microphoneMuted || screen.state !== "listening") return;
    const rms = Math.max(0, Math.min(1, Number(value?.rms) || 0));
    const peak = Math.max(0, Math.min(1, Number(value?.peak) || 0));
    const db = Math.max(-100, 20 * Math.log10(Math.max(0.00001, rms)));
    if (rms > 0.014 && peak > 0.025) {
      lastInputSpeechAt = performance.now();
      inputQuiet = false;
    } else if (performance.now() - lastInputSpeechAt > 500) inputQuiet = true;
    face("inputLevel", { rms, peak, db, available: true });
    render();
  }

  function disconnectTap(tap) {
    if (!tap) return;
    try { tap.source?.disconnect(); } catch {}
    try { tap.analyser?.disconnect(); } catch {}
    tap.cleanup?.();
    // Deliberately do not stop stream tracks: the real player owns them.
  }

  // Only the analyser's private context is suspended. Never pause the real
  // HTMLAudio player or its stream. Supersede opposite pending transitions:
  // resume() can wait for autoplay permission, so a later suspend must not be
  // queued behind it. A late completion/statechange reconciles the latest aim.
  function reconcileContext(policy) {
    if (!policy || outputContextPolicy !== policy || outputContext !== policy.context
        || policy.context.state === "closed") return;
    const wanted = policy.wanted;
    const state = wanted ? "running" : "suspended";
    if (policy.pendingTarget === wanted) return;
    if (policy.context.state === state && policy.pendingTarget === null) return;
    const operation = policy.context[wanted ? "resume" : "suspend"];
    if (typeof operation !== "function") return;
    const revision = ++policy.revision;
    policy.pendingTarget = wanted;
    try {
      Promise.resolve(operation.call(policy.context)).then(() => {
        if (outputContextPolicy !== policy) return;
        if (policy.revision === revision) policy.pendingTarget = null;
        if (policy.context.state !== (policy.wanted ? "running" : "suspended")) reconcileContext(policy);
      }).catch(() => {
        // No retry storm for a denied/suspended browser audio policy. A new
        // playback, visibility or context-state event can retry the visual tap.
        if (outputContextPolicy === policy && policy.revision === revision) policy.pendingTarget = null;
      });
    } catch {
      if (policy.revision === revision) policy.pendingTarget = null;
    }
  }

  function syncContext(shouldRun) {
    if (!outputContext) return;
    if (outputContextPolicy?.context !== outputContext) {
      const policy = { context: outputContext, wanted: Boolean(shouldRun), pendingTarget: null, revision: 0 };
      policy.onStateChange = () => reconcileContext(policy);
      outputContextPolicy = policy;
      outputContext.addEventListener?.("statechange", policy.onStateChange);
    }
    outputContextPolicy.wanted = Boolean(shouldRun);
    reconcileContext(outputContextPolicy);
  }

  function createTap(stream, audio) {
    const tap = { stream, audio, source: null, analyser: null, samples: null };
    if (!stream) return tap;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return tap;
      if (!outputContext || outputContext.state === "closed") outputContext = new Context();
      tap.source = outputContext.createMediaStreamSource(stream);
      tap.analyser = outputContext.createAnalyser();
      tap.analyser.fftSize = 512;
      tap.analyser.smoothingTimeConstant = 0;
      tap.samples = new Float32Array(tap.analyser.fftSize);
      tap.source.connect(tap.analyser);
      // No destination connection: HTMLAudio remains the only audible sink,
      // preserving Chrome AEC and preventing doubled or rerouted playback.
    } catch {
      disconnectTap(tap);
      tap.source = null;
      tap.analyser = null;
    }
    return tap;
  }

  function readTap(tap) {
    if (!tap?.analyser || outputContext?.state === "suspended") return null;
    try {
      tap.analyser.getFloatTimeDomainData(tap.samples);
      return levels(tap.samples);
    } catch { return null; }
  }

  function sampleOutput() {
    if (suspended || document.hidden || !outputIsPlaying()) {
      face("outputLevel", ZERO);
      render();
      return;
    }
    const taps = [];
    if (nativeActive && nativeEnabled && !nativeWaiting && !nativeTap?.audio?.muted
        && !nativeTap?.audio?.paused && nativeTap?.audio?.volume !== 0) taps.push(nativeTap);
    for (const item of external.values()) {
      if (item.playing && !item.audio.muted && !item.audio.paused && item.audio.volume !== 0) taps.push(item.tap);
    }
    let measured = null;
    for (const tap of taps) {
      const value = readTap(tap);
      if (value && (!measured || value.rms > measured.rms)) measured = value;
    }
    // No made-up amplitude if the platform only supplies word boundaries.
    face("outputLevel", measured || { ...ZERO, available: false });
    render();
  }

  function syncSampling() {
    window.clearInterval(sampleTimer);
    sampleTimer = 0;
    const sampling = !suspended && !document.hidden && outputIsPlaying();
    syncContext(sampling);
    if (sampling) {
      sampleOutput();
      sampleTimer = window.setInterval(sampleOutput, OUTPUT_SAMPLE_MS);
    } else face("outputLevel", ZERO);
    render();
  }

  function outputStream(stream, audio) {
    disconnectTap(nativeTap);
    nativeTap = stream ? createTap(stream, audio) : null;
    nativeEnabled = Boolean(audio && !audio.muted);
    nativeActive = false;
    nativeWaiting = false;
    if (nativeTap && audio?.addEventListener) {
      const tap = nativeTap;
      const playing = () => {
        if (nativeTap !== tap) return;
        nativeWaiting = false;
        syncSampling();
      };
      const quiet = () => { if (nativeTap === tap) { nativeWaiting = true; syncSampling(); } };
      const changed = () => { if (nativeTap === tap) syncSampling(); };
      const listeners = { playing, pause: quiet, waiting: quiet, ended: quiet, error: quiet, volumechange: changed };
      for (const [name, callback] of Object.entries(listeners)) audio.addEventListener(name, callback);
      tap.cleanup = () => {
        for (const [name, callback] of Object.entries(listeners)) audio.removeEventListener(name, callback);
      };
    }
    syncSampling();
    releaseUnusedContext();
  }

  function outputPlayback(active) {
    nativeActive = Boolean(active);
    syncSampling();
  }

  function outputEnabled(enabled) {
    nativeEnabled = Boolean(enabled);
    syncSampling();
  }

  function releaseUnusedContext() {
    if (nativeTap || external.size || !outputContext) return;
    const context = outputContext;
    if (outputContextPolicy?.context === context) {
      context.removeEventListener?.("statechange", outputContextPolicy.onStateChange);
    }
    outputContextPolicy = null;
    outputContext = null;
    try { void context.close()?.catch(() => {}); } catch {}
  }

  function watchAudio(audio) {
    if (!audio?.addEventListener || suspended) return () => {};
    const item = { audio, playing: false, tap: null };
    const currentEpoch = epoch;
    external.set(audio, item);
    const isCurrent = () => currentEpoch === epoch && external.get(audio) === item;
    const attach = () => {
      if (item.tap?.analyser) return;
      disconnectTap(item.tap);
      try {
        // captureStream is read-only; createMediaElementSource would reroute
        // the original audio and is intentionally never used here.
        const stream = audio.captureStream?.() || audio.mozCaptureStream?.();
        item.tap = stream ? createTap(stream, audio) : null;
      } catch { item.tap = null; }
    };
    const playing = () => {
      if (!isCurrent()) return;
      item.playing = true;
      attach();
      syncSampling();
    };
    const quiet = () => {
      if (!isCurrent()) return;
      item.playing = false;
      syncSampling();
    };
    const change = () => { if (isCurrent()) syncSampling(); };
    const listeners = { playing, pause: quiet, ended: quiet, waiting: quiet, error: quiet, volumechange: change };
    for (const [name, callback] of Object.entries(listeners)) audio.addEventListener(name, callback);
    const cleanup = () => {
      for (const [name, callback] of Object.entries(listeners)) audio.removeEventListener(name, callback);
      disconnectTap(item.tap);
      if (external.get(audio) === item) external.delete(audio);
      syncSampling();
      releaseUnusedContext();
    };
    item.cleanup = cleanup;
    return cleanup;
  }

  function watchUtterance(utterance) {
    if (!utterance?.addEventListener || suspended) return () => {};
    const item = { playing: false };
    const currentEpoch = epoch;
    utterances.set(utterance, item);
    const emit = (type, event = {}) => {
      if (currentEpoch !== epoch || utterances.get(utterance) !== item) return;
      if (["start", "resume"].includes(type)) item.playing = true;
      if (["pause", "end"].includes(type)) item.playing = false;
      syncSampling();
      face("speechBoundary", { type, charIndex: Number(event.charIndex) || 0,
        charLength: Number(event.charLength) || 0, source: "speechSynthesis.boundary" });
    };
    const listeners = {
      start: event => emit("start", event), boundary: event => {
        if (!event.name || event.name === "word") emit("word", event);
      }, pause: event => emit("pause", event), resume: event => emit("resume", event),
      end: event => emit("end", event), error: event => emit("end", event),
    };
    for (const [name, callback] of Object.entries(listeners)) utterance.addEventListener(name, callback);
    const cleanup = () => {
      for (const [name, callback] of Object.entries(listeners)) utterance.removeEventListener(name, callback);
      if (utterances.get(utterance) === item) {
        emit("end");
        utterances.delete(utterance);
      }
      syncSampling();
    };
    item.cleanup = cleanup;
    return cleanup;
  }

  function stopExternal() {
    for (const item of [...external.values(), ...utterances.values()]) item.cleanup();
    face("speechBoundary", { type: "end", charIndex: 0, charLength: 0 });
    syncSampling();
  }

  function reset() {
    epoch += 1;
    stopExternal();
    outputStream(null, null);
    face("inputLevel", ZERO);
    face("outputLevel", ZERO);
    face("expression", { expression: "neutral", source: "model", durationMs: 1000 });
  }

  function expressionsAvailable() {
    return !suspended && typeof window.AtlasFace?.expression === "function";
  }

  function expression(value) {
    if (!expressionsAvailable() || value?.source !== "model" || !EXPRESSIONS.has(value?.expression)
        || !Number.isInteger(value?.durationMs) || value.durationMs < 1000 || value.durationMs > 30000) return false;
    try { return window.AtlasFace.expression({ expression: value.expression,
      source: "model", durationMs: value.durationMs }) === true; } catch { return false; }
  }

  function connection(value) {
    connectionState = value;
    face("connection", { ...value, healthy: Boolean(value?.healthy) && !suspended
      && !["connecting", "error"].includes(screen.state),
      ...(["connecting", "error"].includes(screen.state) ? { label: screen.title || "Conectando con ATLAS" } : {}) });
  }

  window.AtlasFaceBridge = {
    update, inputLevel, outputStream, outputPlayback, outputEnabled, watchAudio, watchUtterance, stopExternal,
    transcript(text) {
      if (suspended) return;
      currentTranscript = String(text || "");
      face("transcript", currentTranscript);
    },
    connection,
    expression, expressionsAvailable,
    microphoneMuted(value) {
      microphoneMuted = Boolean(value);
      if (microphoneMuted) face("inputLevel", ZERO);
      lastVisualState = "";
      render();
    },
    reset,
    suspend() {
      suspended = true;
      reset();
      currentTranscript = "";
      face("transcript", "");
      face("connection", { healthy: false, label: "Sin control de ATLAS A1" });
    },
    resume() { suspended = false; lastVisualState = ""; render(); },
  };
  document.addEventListener("visibilitychange", syncSampling);
  window.addEventListener("pagehide", () => window.AtlasFaceBridge.suspend());
  window.addEventListener("pageshow", event => { if (event.persisted) window.AtlasFaceBridge.resume(); });
})();
