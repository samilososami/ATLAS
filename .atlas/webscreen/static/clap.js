/* Local, calibrated double-clap gesture. It observes app.js's analyser and
 * never records audio. During calibration, app.js can temporarily reopen the
 * already-authorized microphone after Realtime has released its own stream. */
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
  const MIN_PAIR_GAP_MS = 280;
  const MAX_PAIR_GAP_MS = 950;
  const EVENT_RELEASE_MS = 75;
  const MAX_EVENT_MS = 220;
  const PAIR_COOLDOWN_MS = 1600;
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
    event: null, releaseStartedAt: 0, recentRms: [], cooldownUntil: 0,
    timer: 0, generation: 0, busy: false,
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
      // Starting calibration is also the explicit user gesture that asks
      // app.js to attach the already-authorized local capture if Realtime was
      // stopped when this drawer was opened.
      controls.start.disabled = state.busy || !hasControl();
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
    else controls.step.textContent = state.microphone
      ? "Preparado para calibrar cinco pares de aplausos."
      : "Pulsa “Empezar calibración” para preparar el micrófono ya autorizado.";
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
    resetTransientTracking();
    if (message) setResult(message);
    render();
  }

  async function start() {
    if (!hasControl()) { setResult("Esta pestaña no tiene el control de ATLAS.", "error"); return; }
    if (state.busy) return;
    if (!state.microphone) {
      state.busy = true;
      setResult("Preparando el micrófono ya autorizado…");
      render();
      try {
        const ready = await window.AtlasClapBridge?.ensureMicrophone?.();
        if (!ready || !state.microphone) throw new Error("El micrófono no quedó disponible para calibrar.");
      } catch (error) {
        setResult(error?.message || "No se pudo preparar el micrófono para calibrar.", "error");
        return;
      } finally {
        state.busy = false;
        render();
      }
    }
    state.generation += 1;
    clearTimer();
    state.phase = "ready";
    state.trials = [];
    state.baseline = [];
    state.pair = [];
    state.first = null;
    resetTransientTracking();
    setResult("Cada prueba mide un par de aplausos. Puedes cancelar sin modificar el mapeo actual.");
    render();
  }

  function defaultRules(noiseFloor = 0) {
    return {
      minPeak: clamp(Math.max(.085, noiseFloor * 8), .085, .52),
      minRms: clamp(Math.max(.015, noiseFloor * 5), .015, .22),
      minHighBandRatio: .24,
      minFlatness: .26,
      minCrestFactor: 2.15,
      minSpectralCentroidHz: 2100,
      minOnsetRatio: 2.1,
      maxEventMs: MAX_EVENT_MS,
      releaseMs: EVENT_RELEASE_MS,
      maxPairLevelRatio: 2.35,
      maxPairCentroidRatio: 1.75,
      maxPairHighBandDelta: .24,
      maxPairDurationRatio: 2.8,
      maxPairCrestRatio: 2.6,
      noiseMultiplier: 4.8,
      minPairGapMs: MIN_PAIR_GAP_MS,
      maxPairGapMs: MAX_PAIR_GAP_MS,
    };
  }

  function detectorRules() {
    const profile = state.profile?.detector;
    if (!profile || Number(state.profile?.version) !== 2) return null;
    return {
      minPeak: Number(profile.minPeak), minRms: Number(profile.minRms),
      minHighBandRatio: Number(profile.minHighBandRatio), minFlatness: Number(profile.minFlatness),
      minCrestFactor: Number(profile.minCrestFactor),
      minSpectralCentroidHz: Number(profile.minSpectralCentroidHz),
      minOnsetRatio: Number(profile.minOnsetRatio),
      maxEventMs: Number(profile.maxEventMs), releaseMs: Number(profile.releaseMs),
      maxPairLevelRatio: Number(profile.maxPairLevelRatio),
      maxPairCentroidRatio: Number(profile.maxPairCentroidRatio),
      maxPairHighBandDelta: Number(profile.maxPairHighBandDelta),
      maxPairDurationRatio: Number(profile.maxPairDurationRatio),
      maxPairCrestRatio: Number(profile.maxPairCrestRatio),
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
    let total = 0, high = 0, low = 0, weighted = 0, logSum = 0, bins = 0;
    for (let index = 1; index < spectrum.length; index += 1) {
      const magnitude = spectrum[index] / 255;
      const frequency = index * hzPerBin;
      if (frequency < 100 || frequency > 8500) continue;
      total += magnitude;
      weighted += magnitude * frequency;
      if (frequency < 1400) low += magnitude;
      if (frequency >= 2500) high += magnitude;
      logSum += Math.log(Math.max(magnitude, 1e-5));
      bins += 1;
    }
    const mean = total / Math.max(1, bins);
    return {
      at: Number(frame.at) || now(), rms: clamp(Number(frame.rms) || 0, 0, 1),
      peak: clamp(Number(frame.peak) || 0, 0, 1),
      highBandRatio: total ? high / total : 0,
      lowBandRatio: total ? low / total : 1,
      flatness: bins && mean ? Math.exp(logSum / bins) / mean : 0,
      crestFactor: clamp((Number(frame.peak) || 0) / Math.max(Number(frame.rms) || 0, 1e-4), 0, 20),
      spectralCentroidHz: total ? weighted / total : 0,
    };
  }

  function candidate(features, rules, noiseFloor, preEventFloor = noiseFloor) {
    if (!rules || !features) return false;
    const dynamicRms = Math.max(rules.minRms, noiseFloor * rules.noiseMultiplier);
    const onsetRatio = features.rms / Math.max(.001, noiseFloor, preEventFloor);
    return features.peak >= rules.minPeak && features.rms >= dynamicRms
      && features.highBandRatio >= rules.minHighBandRatio && features.flatness >= rules.minFlatness
      && features.crestFactor >= rules.minCrestFactor
      && features.spectralCentroidHz >= rules.minSpectralCentroidHz
      && onsetRatio >= rules.minOnsetRatio;
  }

  function acceptCandidate(features, rules, onPair) {
    if (features.at < state.cooldownUntil) return;
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
    const ratio = (left, right, floor = .001) => Math.max(left, right) / Math.max(floor, Math.min(left, right));
    const pairLevelRatio = ratio(state.first.rms, features.rms);
    const pairCentroidRatio = ratio(state.first.spectralCentroidHz, features.spectralCentroidHz, 1);
    const pairDurationRatio = ratio(state.first.eventDurationMs + 12, features.eventDurationMs + 12, 1);
    const pairCrestRatio = ratio(state.first.crestFactor, features.crestFactor, .1);
    const highBandDelta = Math.abs(state.first.highBandRatio - features.highBandRatio);
    // A room echo is usually a much weaker/duller copy of the first impact;
    // two cough bursts vary far more in duration and spectral balance. A valid
    // pair must therefore be two independently released *similar* impulses.
    if (pairLevelRatio > rules.maxPairLevelRatio
      || pairCentroidRatio > rules.maxPairCentroidRatio
      || pairDurationRatio > rules.maxPairDurationRatio
      || pairCrestRatio > rules.maxPairCrestRatio
      || highBandDelta > rules.maxPairHighBandDelta) {
      state.first = features;
      state.pair = [features];
      render();
      return;
    }
    const first = state.first;
    state.first = null;
    state.pair = [];
    state.cooldownUntil = features.at + PAIR_COOLDOWN_MS;
    onPair(first, features, gap);
  }

  function resetTransientTracking() {
    state.event = null;
    state.releaseStartedAt = 0;
    state.recentRms = [];
    state.cooldownUntil = 0;
  }

  function pushRecentRms(value) {
    state.recentRms.push(clamp(value, 0, 1));
    if (state.recentRms.length > 12) state.recentRms.shift();
  }

  // A physical clap spans several analyser frames. We emit exactly one event
  // only after its envelope has genuinely returned to quiet. This prevents a
  // single clap plus room echo from masquerading as a double clap, while the
  // maximum hot duration rejects coughs and other sustained broad-band sound.
  function processTransient(features, rules, noiseFloor, onPair) {
    if (!features || !rules) return false;
    if (state.first && features.at - state.first.at > rules.maxPairGapMs) {
      state.first = null;
      state.pair = [];
      render();
    }
    const preEventFloor = median(state.recentRms) || noiseFloor;
    if (!state.event) {
      if (!candidate(features, rules, noiseFloor, preEventFloor)) {
        const quietCeiling = Math.max(noiseFloor * 2.4, rules.minRms * .62);
        if (features.rms <= quietCeiling) pushRecentRms(features.rms);
        return false;
      }
      state.event = {
        startedAt: features.at,
        lastHotAt: features.at,
        best: { ...features, onsetRatio: features.rms / Math.max(.001, noiseFloor, preEventFloor) },
        tooLong: false,
      };
      state.releaseStartedAt = 0;
      return false;
    }

    const event = state.event;
    const releaseRms = Math.max(noiseFloor * 2.3, rules.minRms * .58);
    const stillHot = features.rms > releaseRms || features.peak > rules.minPeak * .34;
    if (stillHot) {
      event.lastHotAt = features.at;
      event.tooLong ||= features.at - event.startedAt > rules.maxEventMs;
      if (features.peak > event.best.peak) event.best = { ...features, onsetRatio: event.best.onsetRatio };
      state.releaseStartedAt = 0;
      return false;
    }
    if (!state.releaseStartedAt) state.releaseStartedAt = features.at;
    if (features.at - state.releaseStartedAt < rules.releaseMs) return false;

    const completed = state.event;
    state.event = null;
    state.releaseStartedAt = 0;
    state.recentRms = [features.rms];
    const eventDurationMs = Math.max(0, completed.lastHotAt - completed.startedAt);
    if (completed.tooLong || eventDurationMs > rules.maxEventMs) return false;
    const accepted = { ...completed.best, eventDurationMs };
    acceptCandidate(accepted, rules, onPair);
    return true;
  }

  function completeTrial(first, second, gap) {
    if (state.phase !== "trial") return;
    clearTimer();
    state.trials.push({
      first: { rms: first.rms, peak: first.peak, highBandRatio: first.highBandRatio, flatness: first.flatness,
        crestFactor: first.crestFactor, spectralCentroidHz: first.spectralCentroidHz,
        onsetRatio: first.onsetRatio, eventDurationMs: first.eventDurationMs },
      second: { rms: second.rms, peak: second.peak, highBandRatio: second.highBandRatio, flatness: second.flatness,
        crestFactor: second.crestFactor, spectralCentroidHz: second.spectralCentroidHz,
        onsetRatio: second.onsetRatio, eventDurationMs: second.eventDurationMs },
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
    resetTransientTracking();
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
    const minCrestFactor = clamp(Math.min(...events.map(item => item.crestFactor)) * .78, 1.8, 8);
    const minSpectralCentroidHz = clamp(Math.min(...events.map(item => item.spectralCentroidHz)) * .82, 1500, 6500);
    const minOnsetRatio = clamp(Math.min(...events.map(item => item.onsetRatio)) * .72, 1.7, 10);
    const maxEventMs = clamp(Math.max(...events.map(item => item.eventDurationMs)) * 1.55 + 25, 110, MAX_EVENT_MS);
    const pairRatios = (field, floor = .001, offset = 0) => state.trials.map(trial => Math.max(trial.first[field] + offset, trial.second[field] + offset)
      / Math.max(floor, Math.min(trial.first[field] + offset, trial.second[field] + offset)));
    const pairDeltas = state.trials.map(trial => Math.abs(trial.first.highBandRatio - trial.second.highBandRatio));
    return {
      version: 2,
      createdAt: new Date().toISOString(),
      trialCount: state.trials.length,
      detector: {
        minPeak, minRms, minRmsDb: 20 * Math.log10(Math.max(minRms, 1e-5)),
        minHighBandRatio, minFlatness, minCrestFactor, minSpectralCentroidHz,
        minOnsetRatio, maxEventMs, releaseMs: EVENT_RELEASE_MS,
        maxPairLevelRatio: clamp(Math.max(...pairRatios("rms")) * 1.22, 1.55, 2.6),
        maxPairCentroidRatio: clamp(Math.max(...pairRatios("spectralCentroidHz", 1)) * 1.18, 1.25, 1.9),
        maxPairHighBandDelta: clamp(Math.max(...pairDeltas) * 1.3 + .025, .09, .28),
        maxPairDurationRatio: clamp(Math.max(...pairRatios("eventDurationMs", 1, 12)) * 1.25, 1.6, 3),
        maxPairCrestRatio: clamp(Math.max(...pairRatios("crestFactor", .1)) * 1.2, 1.45, 2.8),
        noiseMultiplier: clamp(4.8 + noiseFloor * 12, 4, 6.2),
        minPairGapMs: clamp(Math.min(...gaps) * .72, MIN_PAIR_GAP_MS, 720),
        maxPairGapMs: clamp(Math.max(...gaps) * 1.35, 420, MAX_PAIR_GAP_MS),
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
      processTransient(features, rules, floor, completeTrial);
      return;
    }
    const rules = detectorRules();
    if (!rules || state.view !== "atlas") return;
    const floor = median(state.baseline);
    const wasEvent = Boolean(state.event);
    const completed = processTransient(features, rules, floor, () => {
      // The face itself rejects non-idle states, so a clap cannot disrupt
      // listening, a response, wake recognition or any Realtime turn.
      window.AtlasFace?.clap?.();
    });
    if (!wasEvent && !state.event && !completed && features.rms < Math.max(.025, floor * 2.2)) {
      state.baseline.push(features.rms);
      if (state.baseline.length > 80) state.baseline.shift();
    }
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

  controls.start?.addEventListener("click", () => { void start(); });
  controls.capture?.addEventListener("click", capture);
  controls.cancel?.addEventListener("click", () => cancel());
  controls.save?.addEventListener("click", () => { void save(); });
  window.addEventListener("atlas-access-acquired", () => { void load(); });
  window.AtlasClap = Object.freeze({ needsFrames, inputFrame, microphone, onViewChanged, load, cancel,
    // Exposed only for deterministic browser tests; no raw PCM escapes this module.
    _featuresFor: featuresFor, _candidate: candidate, _processTransient: processTransient,
    _defaultRules: defaultRules, _state: state });
  window.setTimeout(() => { void load(); }, 0);
  renderProfile(); render();
})();
