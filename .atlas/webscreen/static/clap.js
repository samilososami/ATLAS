/* Local, calibrated double-clap gesture. It observes the analyser already
 * owned by app.js; it never opens another microphone or records audio. */
(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const controls = {
    start: $("#clap-start"), capture: $("#clap-capture"), cancel: $("#clap-cancel"),
    save: $("#clap-save"), step: $("#clap-step"), progress: $("#clap-progress"),
    result: $("#clap-result"), profile: $("#clap-profile-list"),
  };
  const TRIALS_REQUIRED = 5;
  const ARM_DELAY_MS = 700;
  const TRIAL_TIMEOUT_MS = 7000;
  const MIN_PAIR_GAP_MS = 120;
  const MAX_PAIR_GAP_MS = 1150;
  const REFRACTORY_MS = 115;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const median = values => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const center = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2;
  };
  const now = () => performance.now();
  const hasControl = () => window.atlasAccess?.hasControl?.() === true;
  const state = {
    view: "atlas", microphone: false, sampleRate: 48000, profile: null,
    phase: "idle", trials: [], baseline: [], pair: [], first: null,
    lastCandidateAt: -Infinity, timer: 0, generation: 0, busy: false,
  };

  function setResult(message, kind = "") {
    if (!controls.result) return;
    controls.result.className = `tool-result${kind ? ` ${kind}` : ""}`;
    controls.result.textContent = message;
  }

  function formatDb(value) {
    if (!Number.isFinite(value)) return "—";
    return `${value.toFixed(1)} dBFS`;
  }

  function profileDescription(profile = state.profile) {
    if (!profile?.detector) return [["Estado", "Todavía no hay un mapeo guardado."]];
    const detector = profile.detector;
    return [
      ["Estado", "Activo al esperar a ATLAS"],
      ["Calibración", `${profile.trialCount || profile.trials?.length || 0}/${TRIALS_REQUIRED} pruebas`],
      ["Umbral", formatDb(detector.minRmsDb)],
      ["Separación", `${Math.round(detector.minPairGapMs)}–${Math.round(detector.maxPairGapMs)} ms`],
      ["Privacidad", "Solo medidas resumidas; no se conserva audio."],
    ];
  }

  function renderProfile() {
    if (!controls.profile) return;
    controls.profile.replaceChildren();
    for (const [name, value] of profileDescription()) {
      const row = document.createElement("div");
      const title = document.createElement("dt");
      const detail = document.createElement("dd");
      title.textContent = name; detail.textContent = value;
      row.append(title, detail); controls.profile.append(row);
    }
  }

  function render() {
    const calibrating = ["ready", "arming", "trial", "complete"].includes(state.phase);
    const waitingForPair = state.phase === "arming" || state.phase === "trial";
    if (controls.start) {
      controls.start.hidden = calibrating;
      controls.start.disabled = state.busy || !hasControl() || !state.microphone;
      controls.start.textContent = state.profile ? "Recalibrar" : "Empezar calibración";
    }
    if (controls.capture) {
      controls.capture.hidden = !calibrating || state.phase === "complete";
      controls.capture.disabled = state.busy || waitingForPair || !state.microphone || !hasControl();
    }
    if (controls.cancel) {
      controls.cancel.hidden = !calibrating;
      controls.cancel.disabled = state.busy;
    }
    if (controls.save) {
      controls.save.hidden = state.phase !== "complete";
      controls.save.disabled = state.busy || !hasControl();
    }
    if (!controls.step || !controls.progress) return;
    controls.progress.value = state.trials.length;
    if (state.phase === "ready") controls.step.textContent = `Prueba ${state.trials.length + 1} de ${TRIALS_REQUIRED}: pulsa “Registrar prueba”.`;
    else if (state.phase === "arming") controls.step.textContent = `Prepárate… prueba ${state.trials.length + 1}/${TRIALS_REQUIRED}.`;
    else if (state.phase === "trial") controls.step.textContent = `Aplaude dos veces ahora · ${state.pair.length}/2 detectados.`;
    else if (state.phase === "complete") controls.step.textContent = "Las cinco pruebas están listas. Guarda el mapeo.";
    else controls.step.textContent = state.microphone ? "Preparado para calibrar cinco pares de aplausos." : "Abre ATLAS y permite el micrófono para calibrar.";
  }

  function clearTimer() {
    window.clearTimeout(state.timer);
    state.timer = 0;
  }

  function cancel(message = "Calibración cancelada. El mapeo anterior no ha cambiado.") {
    state.generation += 1;
    clearTimer();
    state.phase = "idle";
    state.trials = [];
    state.baseline = [];
    state.pair = [];
    state.first = null;
    state.lastCandidateAt = -Infinity;
    if (message) setResult(message);
    render();
  }

  function start() {
    if (!hasControl()) { setResult("Esta pestaña no tiene el control de ATLAS.", "error"); return; }
    if (!state.microphone) { setResult("Permite el micrófono en ATLAS antes de calibrar.", "error"); render(); return; }
    state.generation += 1;
    clearTimer();
    state.phase = "ready";
    state.trials = [];
    state.baseline = [];
    state.pair = [];
    state.first = null;
    state.lastCandidateAt = -Infinity;
    setResult("Cada prueba mide un par de aplausos. Puedes cancelar sin modificar el mapeo actual.");
    render();
  }

  function defaultRules(noiseFloor = 0) {
    return {
      minPeak: clamp(Math.max(.075, noiseFloor * 7), .075, .48),
      minRms: clamp(Math.max(.014, noiseFloor * 4.5), .014, .20),
      minHighBandRatio: .16,
      minFlatness: .20,
      noiseMultiplier: 4.2,
      minPairGapMs: MIN_PAIR_GAP_MS,
      maxPairGapMs: MAX_PAIR_GAP_MS,
    };
  }

  function detectorRules() {
    const profile = state.profile?.detector;
    if (!profile) return null;
    return {
      minPeak: Number(profile.minPeak), minRms: Number(profile.minRms),
      minHighBandRatio: Number(profile.minHighBandRatio), minFlatness: Number(profile.minFlatness),
      noiseMultiplier: Number(profile.noiseMultiplier),
      minPairGapMs: Number(profile.minPairGapMs), maxPairGapMs: Number(profile.maxPairGapMs),
    };
  }

  // A clap is a short, high-peak, broad-band event. The caller owns these
  // temporary analyser arrays; this function extracts numbers synchronously and
  // never stores waveform or frequency-bin data.
  function featuresFor(frame) {
    const spectrum = frame.spectrum;
    const sampleRate = Math.max(8000, Number(frame.sampleRate) || state.sampleRate || 48000);
    if (!spectrum?.length) return null;
    const hzPerBin = sampleRate / (spectrum.length * 2);
    let total = 0, high = 0, logSum = 0, bins = 0;
    for (let index = 1; index < spectrum.length; index += 1) {
      const magnitude = spectrum[index] / 255;
      const frequency = index * hzPerBin;
      if (frequency < 100 || frequency > 8500) continue;
      total += magnitude;
      if (frequency >= 1700) high += magnitude;
      logSum += Math.log(Math.max(magnitude, 1e-5));
      bins += 1;
    }
    const mean = total / Math.max(1, bins);
    return {
      at: Number(frame.at) || now(), rms: clamp(Number(frame.rms) || 0, 0, 1),
      peak: clamp(Number(frame.peak) || 0, 0, 1),
      highBandRatio: total ? high / total : 0,
      flatness: bins && mean ? Math.exp(logSum / bins) / mean : 0,
    };
  }

  function candidate(features, rules, noiseFloor) {
    if (!rules || !features) return false;
    const dynamicRms = Math.max(rules.minRms, noiseFloor * rules.noiseMultiplier);
    return features.peak >= rules.minPeak && features.rms >= dynamicRms
      && features.highBandRatio >= rules.minHighBandRatio && features.flatness >= rules.minFlatness;
  }

  function acceptCandidate(features, rules, onPair) {
    if (features.at - state.lastCandidateAt < REFRACTORY_MS) return;
    state.lastCandidateAt = features.at;
    if (!state.first) {
      state.first = features;
      state.pair = [features];
      render();
      return;
    }
    const gap = features.at - state.first.at;
    if (gap < rules.minPairGapMs) return;
    if (gap > rules.maxPairGapMs) {
      state.first = features;
      state.pair = [features];
      render();
      return;
    }
    const first = state.first;
    state.first = null;
    state.pair = [];
    onPair(first, features, gap);
  }

  function completeTrial(first, second, gap) {
    if (state.phase !== "trial") return;
    clearTimer();
    state.trials.push({
      first: { rms: first.rms, peak: first.peak, highBandRatio: first.highBandRatio, flatness: first.flatness },
      second: { rms: second.rms, peak: second.peak, highBandRatio: second.highBandRatio, flatness: second.flatness },
      pairGapMs: gap,
      noiseFloorRms: median(state.baseline),
    });
    state.phase = state.trials.length === TRIALS_REQUIRED ? "complete" : "ready";
    setResult(`Par ${state.trials.length}/${TRIALS_REQUIRED} medido correctamente.`, "success");
    render();
  }

  function capture() {
    if (state.phase !== "ready" || !state.microphone || !hasControl()) return;
    const token = ++state.generation;
    state.phase = "arming";
    state.baseline = [];
    state.pair = [];
    state.first = null;
    state.lastCandidateAt = -Infinity;
    setResult("Escuchando el ambiente durante un instante…");
    render();
    state.timer = window.setTimeout(() => {
      if (token !== state.generation || state.phase !== "arming") return;
      state.phase = "trial";
      setResult("Ahora: aplaude dos veces de forma natural.");
      render();
      state.timer = window.setTimeout(() => {
        if (token !== state.generation || state.phase !== "trial") return;
        state.phase = "ready";
        state.pair = [];
        state.first = null;
        setResult("No he reconocido un par claro. Prueba otra vez, sin hablar entre aplausos.", "error");
        render();
      }, TRIAL_TIMEOUT_MS);
    }, ARM_DELAY_MS);
  }

  function buildProfile() {
    const events = state.trials.flatMap(trial => [trial.first, trial.second]);
    const gaps = state.trials.map(trial => trial.pairGapMs);
    const floors = state.trials.map(trial => trial.noiseFloorRms);
    const noiseFloor = median(floors);
    const minRms = clamp(Math.min(...events.map(item => item.rms)) * .55, Math.max(.012, noiseFloor * 4), .25);
    const minPeak = clamp(Math.min(...events.map(item => item.peak)) * .52, Math.max(.065, noiseFloor * 6), .58);
    const minHighBandRatio = clamp(Math.min(...events.map(item => item.highBandRatio)) * .78, .10, .55);
    const minFlatness = clamp(Math.min(...events.map(item => item.flatness)) * .72, .12, .72);
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      trialCount: state.trials.length,
      detector: {
        minPeak, minRms, minRmsDb: 20 * Math.log10(Math.max(minRms, 1e-5)),
        minHighBandRatio, minFlatness,
        noiseMultiplier: clamp(4.2 + noiseFloor * 12, 3.2, 5.5),
        minPairGapMs: clamp(Math.min(...gaps) * .64, MIN_PAIR_GAP_MS, 700),
        maxPairGapMs: clamp(Math.max(...gaps) * 1.48, 380, MAX_PAIR_GAP_MS),
      },
      trials: state.trials,
      privacy: "summary-features-only-no-audio",
    };
  }

  async function load() {
    if (!hasControl()) { render(); return; }
    try {
      const response = await window.atlasAccess.fetch("/api/clap/profile", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo cargar el mapeo");
      state.profile = payload.profile || null;
      if (state.phase === "idle") setResult(state.profile ? "Mapeo local cargado. Solo escucha al esperar a ATLAS." : "El detector se activa solo después de completar una calibración.");
    } catch (error) {
      setResult(error.message || "No se pudo cargar el mapeo.", "error");
    }
    renderProfile(); render();
  }

  async function save() {
    if (state.phase !== "complete" || state.busy || !hasControl()) return;
    state.busy = true; render();
    try {
      const profile = buildProfile();
      const response = await window.atlasAccess.fetch("/api/clap/profile", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ATLAS A1 no pudo guardar el mapeo");
      state.profile = payload.profile;
      state.phase = "idle";
      state.trials = [];
      setResult("Mapeo guardado. Dos aplausos claros activarán la cara desafiante durante tres segundos.", "success");
    } catch (error) {
      setResult(error.message || "No se pudo guardar el mapeo.", "error");
    } finally {
      state.busy = false;
      renderProfile(); render();
    }
  }

  function inputFrame(frame) {
    const features = featuresFor(frame);
    if (!features || !hasControl()) return;
    if (state.phase === "arming") {
      state.baseline.push(features.rms);
      if (state.baseline.length > 40) state.baseline.shift();
      return;
    }
    if (state.phase === "trial") {
      const floor = median(state.baseline);
      const rules = defaultRules(floor);
      if (candidate(features, rules, floor)) acceptCandidate(features, rules, completeTrial);
      return;
    }
    const rules = detectorRules();
    if (!rules || state.view !== "atlas") return;
    // Keep a slowly adapting ambient baseline only while no candidate is seen.
    state.baseline.push(features.rms);
    if (state.baseline.length > 80) state.baseline.shift();
    const floor = median(state.baseline);
    if (!candidate(features, rules, floor)) return;
    acceptCandidate(features, rules, () => {
      // The face itself rejects non-idle states, so a clap cannot disrupt
      // listening, a response, wake recognition or any Realtime turn.
      window.AtlasFace?.clap?.();
    });
  }

  function needsFrames() {
    return hasControl() && ((state.phase === "arming" || state.phase === "trial")
      || (Boolean(state.profile?.detector) && state.view === "atlas"));
  }

  function microphone(details = {}) {
    state.microphone = Boolean(details.available);
    state.sampleRate = Number(details.sampleRate) || state.sampleRate;
    if (!state.microphone && ["arming", "trial"].includes(state.phase)) cancel("El micrófono se ha detenido; la calibración no se ha guardado.");
    render();
  }

  function onViewChanged(view) {
    state.view = view || "atlas";
    if (view !== "clap" && ["ready", "arming", "trial", "complete"].includes(state.phase)) cancel("");
    render();
  }

  controls.start?.addEventListener("click", start);
  controls.capture?.addEventListener("click", capture);
  controls.cancel?.addEventListener("click", () => cancel());
  controls.save?.addEventListener("click", () => { void save(); });
  window.addEventListener("atlas-access-acquired", () => { void load(); });
  window.AtlasClap = Object.freeze({ needsFrames, inputFrame, microphone, onViewChanged, load, cancel,
    // Exposed only for deterministic browser tests; no raw PCM escapes this module.
    _featuresFor: featuresFor, _candidate: candidate, _defaultRules: defaultRules, _state: state });
  window.setTimeout(() => { void load(); }, 0);
  renderProfile(); render();
})();
