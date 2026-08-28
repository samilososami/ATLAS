const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const CLIENT_BUILD = "2026-08-28-followup-echo-guard-1";
const LANGUAGE = "es-ES";
const SILENCE_MS = 700;
const ADAPTIVE_FINAL_SILENCE_MS = 700;
const NO_SPEECH_MS = 8000;
const FOLLOW_UP_NO_SPEECH_MS = 10000;
const FOLLOW_UP_ECHO_SETTLE_MS = 900;
const FOLLOW_UP_ECHO_REJECT_WINDOW_MS = 1800;
const MAX_RECORDING_MS = 60000;
const SPECULATIVE_STABLE_MS = 250;
const SPECULATIVE_MIN_CHARS = 8;
const SPECULATIVE_MIN_WORDS = 2;
const WAKE_ECHO_MUTE_MS = 2000;
const WAKE_ECHO_TAIL_MS = 1200;

const menuToggle = document.querySelector("#menu-toggle");
const panelBackdrop = document.querySelector("#panel-backdrop");
const sidePanel = document.querySelector("#side-panel");
const panelClose = document.querySelector("#panel-close");
const toolTabs = [...document.querySelectorAll(".tool-tab")];
const appViews = [...document.querySelectorAll(".app-view")];

const healthDot = document.querySelector("#health-dot");
const healthLabel = document.querySelector("#health-label");
const stateMark = document.querySelector("#state-mark");
const phaseLabel = document.querySelector("#phase-label");
const mainStatus = document.querySelector("#main-status");
const statusDetail = document.querySelector("#status-detail");
const timer = document.querySelector("#timer");
const enableButton = document.querySelector("#enable-button");
const recordButton = document.querySelector("#record-button");
const cancelButton = document.querySelector("#cancel-button");
const voiceProviderSelect = document.querySelector("#voice-provider");
const transcriptElement = document.querySelector("#transcript");
const responseElement = document.querySelector("#response");
const activityLog = document.querySelector("#activity-log");
const dictationToggle = document.querySelector("#dictation-toggle");
const dictationStatus = document.querySelector("#dictation-status");
const dictationFinalElement = document.querySelector("#dictation-final");
const dictationInterimElement = document.querySelector("#dictation-interim");
const dictationEmpty = document.querySelector("#dictation-empty");
const ttsForm = document.querySelector("#tts-form");
const ttsText = document.querySelector("#tts-text");
const ttsProvider = document.querySelector("#tts-provider");
const ttsSubmit = document.querySelector("#tts-submit");
const ttsResult = document.querySelector("#tts-result");
const settingsForm = document.querySelector("#settings-form");
const voiceIdInput = document.querySelector("#elevenlabs-voice-id");
const settingsSubmit = document.querySelector("#settings-submit");
const settingsResult = document.querySelector("#settings-result");

let microphoneStream = null;
let recognition = null;
let recognitionRunning = false;
let recognitionEnabled = false;
let recognitionRestartTimer = 0;
let recordingStartedAt = 0;
let recordingStartedIso = "";
let wakeDetectedIso = "";
let lastSpeechAt = 0;
let speechDetected = false;
let nativeTranscribing = false;
let finalTranscript = "";
let interimTranscript = "";
let interactionActive = false;
let currentRequestId = null;
let requestController = null;
let monitorFrame = 0;
let timerInterval = 0;
let currentAudio = null;
let currentAudioStop = null;
let browserSpeechRun = 0;
let streamedSpeechPromise = Promise.resolve();
let streamedSpeechActive = false;
let streamedSpeechStartedAt = 0;
let streamedSpeechRequestId = "";
let streamedSpeechRun = 0;
let streamedSpeechError = null;
let recognitionMutedUntil = 0;
let followUpStartTimer = 0;
let followUpEchoReference = "";
let interruptMonitoring = false;
let interruptHandling = false;
let recordingMode = "wake";
let parentInteractionId = "";
let replyExpected = false;
let interactionToken = 0;
let speculativeTimer = 0;
let speculativeCandidate = "";
let speculativeSent = false;
let speculativeMode = "";
let speculativeHotListener = false;
let lastRecognitionWasFinal = false;
let activeView = "atlas";
let dictationRecognition = null;
let dictationRunning = false;
let dictationShouldRestart = false;
let dictationFinalText = "";
let dictationInterimText = "";
let dictationLastSpeechAt = 0;
let dictationSilenceTimer = 0;
let dictationSpeaking = false;
let dictationInsertBreak = false;
let ttsLabAudio = null;
let ttsLabToken = 0;

function selectedVoiceProvider() {
  return voiceProviderSelect.value === "elevenlabs" ? "elevenlabs" : "browser";
}

function voiceProviderLabel(provider = selectedVoiceProvider()) {
  return provider === "elevenlabs" ? "ElevenLabs" : "voz del navegador";
}

function clockTime() {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date());
}

function formatDuration(milliseconds) {
  return `${(Number(milliseconds || 0) / 1000).toFixed(2)} s`;
}

function setPanelOpen(open) {
  sidePanel.classList.toggle("open", open);
  sidePanel.setAttribute("aria-hidden", String(!open));
  menuToggle.setAttribute("aria-expanded", String(open));
  panelBackdrop.hidden = !open;
}

function switchView(view) {
  if (!appViews.some((element) => element.dataset.viewPanel === view)) return;
  if (activeView === "transcription" && view !== "transcription") stopDictation();
  if (activeView === "tts" && view !== "tts") stopTtsLab();
  activeView = view;
  for (const element of appViews) {
    const selected = element.dataset.viewPanel === view;
    element.hidden = !selected;
    element.classList.toggle("active", selected);
  }
  for (const tab of toolTabs) {
    const selected = tab.dataset.view === view;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  if (view === "atlas") {
    scheduleRecognitionRestart(100);
  } else {
    stopRecognition();
  }
  setPanelOpen(false);
}

function renderDictation() {
  dictationFinalElement.textContent = dictationFinalText;
  dictationInterimElement.textContent = dictationInterimText;
  dictationEmpty.hidden = Boolean(dictationFinalText || dictationInterimText);
}

function markDictationSpeech() {
  if (!dictationSpeaking && dictationInsertBreak && dictationFinalText.trim()) {
    dictationFinalText = dictationFinalText.replace(/[ \t]+$/g, "");
    if (!dictationFinalText.endsWith("\n\n")) dictationFinalText += "\n\n";
    dictationInsertBreak = false;
  }
  dictationSpeaking = true;
  dictationLastSpeechAt = Date.now();
  window.clearTimeout(dictationSilenceTimer);
  dictationSilenceTimer = window.setTimeout(() => {
    if (Date.now() - dictationLastSpeechAt >= SILENCE_MS) {
      dictationSpeaking = false;
      dictationInsertBreak = true;
    }
  }, SILENCE_MS);
}

function configureDictation() {
  if (dictationRecognition || !SpeechRecognitionAPI) return;
  dictationRecognition = new SpeechRecognitionAPI();
  dictationRecognition.lang = LANGUAGE;
  dictationRecognition.continuous = true;
  dictationRecognition.interimResults = true;
  dictationRecognition.maxAlternatives = 1;
  dictationRecognition.onstart = () => {
    dictationRunning = true;
    dictationToggle.dataset.recording = "true";
    dictationToggle.setAttribute("aria-label", "Detener transcripción");
    dictationStatus.textContent = "Escuchando";
  };
  dictationRecognition.onresult = (event) => {
    let nextInterim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = String(result[0]?.transcript || "");
      if (text.trim()) markDictationSpeech();
      if (result.isFinal) {
        const cleaned = text.trim();
        if (cleaned) {
          if (dictationFinalText && !dictationFinalText.endsWith(" ") && !dictationFinalText.endsWith("\n")) {
            dictationFinalText += " ";
          }
          dictationFinalText += cleaned;
        }
      } else {
        nextInterim += text;
      }
    }
    dictationInterimText = nextInterim;
    renderDictation();
  };
  dictationRecognition.onerror = (event) => {
    if (["aborted", "no-speech"].includes(event.error)) return;
    dictationStatus.textContent = event.error === "not-allowed"
      ? "Permiso de micrófono denegado"
      : `Error: ${event.error}`;
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
      dictationShouldRestart = false;
    }
  };
  dictationRecognition.onend = () => {
    dictationRunning = false;
    dictationInterimText = "";
    renderDictation();
    if (dictationShouldRestart && activeView === "transcription") {
      window.setTimeout(() => {
        try { dictationRecognition.start(); } catch {}
      }, 150);
      return;
    }
    dictationToggle.dataset.recording = "false";
    dictationToggle.setAttribute("aria-label", "Empezar transcripción");
  };
}

function startDictation() {
  if (!SpeechRecognitionAPI) {
    dictationStatus.textContent = "Chrome no soporta la transcripción nativa";
    return;
  }
  if (interactionActive) {
    dictationStatus.textContent = "ATLAS todavía está procesando una interacción";
    return;
  }
  configureDictation();
  stopRecognition();
  dictationShouldRestart = true;
  try { dictationRecognition.start(); } catch {}
}

function stopDictation() {
  dictationShouldRestart = false;
  window.clearTimeout(dictationSilenceTimer);
  dictationInterimText = "";
  if (dictationRecognition && dictationRunning) {
    try { dictationRecognition.stop(); } catch {}
  }
  dictationRunning = false;
  dictationToggle.dataset.recording = "false";
  dictationToggle.setAttribute("aria-label", "Empezar transcripción");
  dictationStatus.textContent = dictationFinalText ? "Detenido" : "Preparado";
  renderDictation();
}

function stopTtsLab() {
  ttsLabToken += 1;
  window.speechSynthesis?.cancel();
  if (ttsLabAudio) {
    ttsLabAudio.pause();
    ttsLabAudio = null;
  }
  ttsSubmit.disabled = false;
}

function playLabBrowserSpeech(text, token) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      reject(new Error("Chrome no ofrece síntesis de voz"));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANGUAGE;
    utterance.rate = 1.02;
    const voice = browserVoice();
    if (voice) utterance.voice = voice;
    utterance.addEventListener("end", () => resolve(token === ttsLabToken), { once: true });
    utterance.addEventListener("error", (event) => {
      const message = event.error === "synthesis-failed"
        ? "Chrome no pudo iniciar la voz del navegador en este dispositivo"
        : (event.error || "La voz del navegador falló");
      reject(new Error(message));
    }, { once: true });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function playLabEncodedAudio(encodedAudio, token) {
  const binary = window.atob(encodedAudio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
  const audio = new Audio(url);
  ttsLabAudio = audio;
  return new Promise((resolve, reject) => {
    audio.addEventListener("ended", () => resolve(token === ttsLabToken), { once: true });
    audio.addEventListener("error", () => reject(new Error("Chrome no pudo reproducir el audio")), { once: true });
    audio.play().catch(reject);
  }).finally(() => {
    if (ttsLabAudio === audio) ttsLabAudio = null;
    URL.revokeObjectURL(url);
  });
}

async function runTtsLab(event) {
  event.preventDefault();
  const text = ttsText.value.trim();
  if (!text) {
    ttsResult.className = "tool-result error";
    ttsResult.textContent = "Escribe un texto antes de reproducirlo.";
    return;
  }
  stopTtsLab();
  const token = ttsLabToken;
  const started = performance.now();
  ttsSubmit.disabled = true;
  ttsResult.className = "tool-result";
  ttsResult.textContent = "Generando voz…";
  try {
    let generationMs = 0;
    if (ttsProvider.value === "elevenlabs") {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ElevenLabs no pudo generar la voz");
      generationMs = Number(payload.generationMs || 0);
      ttsResult.textContent = `Voz generada en ${formatDuration(generationMs)}. Reproduciendo…`;
      await playLabEncodedAudio(payload.audio, token);
    } else {
      ttsResult.textContent = "Reproduciendo con la voz del navegador…";
      await playLabBrowserSpeech(text, token);
    }
    if (token !== ttsLabToken) return;
    const totalMs = performance.now() - started;
    ttsResult.className = "tool-result success";
    ttsResult.textContent = generationMs
      ? `Completado en ${formatDuration(totalMs)} · generación ${formatDuration(generationMs)}`
      : `Completado en ${formatDuration(totalMs)}`;
  } catch (error) {
    if (token !== ttsLabToken) return;
    ttsResult.className = "tool-result error";
    ttsResult.textContent = error.message;
  } finally {
    if (token === ttsLabToken) ttsSubmit.disabled = false;
  }
}

async function loadSettings() {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    const settings = await response.json();
    if (!response.ok) throw new Error(settings.error || "No se pudieron cargar los ajustes");
    voiceIdInput.value = settings.elevenlabsVoiceId || "";
    settingsResult.className = "tool-result";
    settingsResult.textContent = settings.voiceIdOverride
      ? "Voice ID personalizado activo."
      : "Usando el Voice ID configurado en OpenClaw.";
  } catch (error) {
    settingsResult.className = "tool-result error";
    settingsResult.textContent = error.message;
  }
}

async function saveSettings(event) {
  event.preventDefault();
  settingsSubmit.disabled = true;
  settingsResult.className = "tool-result";
  settingsResult.textContent = "Guardando…";
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elevenlabsVoiceId: voiceIdInput.value.trim() }),
    });
    const settings = await response.json();
    if (!response.ok) throw new Error(settings.error || "No se pudo guardar el Voice ID");
    voiceIdInput.value = settings.elevenlabsVoiceId || "";
    settingsResult.className = "tool-result success";
    settingsResult.textContent = settings.voiceIdOverride
      ? "Voice ID guardado y activo."
      : "Se vuelve a usar el Voice ID de OpenClaw.";
    void checkHealth();
  } catch (error) {
    settingsResult.className = "tool-result error";
    settingsResult.textContent = error.message;
  } finally {
    settingsSubmit.disabled = false;
  }
}

function addLog(message, duration = null, kind = "normal") {
  const item = document.createElement("li");
  if (kind === "error") item.className = "error";
  const time = document.createElement("time");
  time.textContent = clockTime();
  const text = document.createElement("span");
  text.textContent = message;
  item.append(time, text);
  if (duration !== null) {
    const elapsed = document.createElement("em");
    elapsed.textContent = formatDuration(duration);
    item.append(elapsed);
  }
  activityLog.append(item);
  while (activityLog.children.length > 80) activityLog.firstElementChild.remove();
  activityLog.scrollTop = activityLog.scrollHeight;
}

function setScreen(phase, title, detail, state = "working") {
  phaseLabel.textContent = phase;
  mainStatus.textContent = title;
  statusDetail.textContent = detail;
  stateMark.dataset.state = state;
}

function setWaiting() {
  interruptMonitoring = false;
  setScreen("EN ESPERA", "Esperando a ATLAS", "Di “ATLAS” para comenzar a grabar.", "idle");
  timer.textContent = "00:00.0";
  cancelButton.hidden = true;
  recordButton.hidden = false;
  if (activeView === "atlas") scheduleRecognitionRestart(350);
}

function formatTimer(milliseconds) {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${totalTenths % 10}`;
}

function beginTimer() {
  window.clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    timer.textContent = formatTimer(performance.now() - recordingStartedAt);
  }, 100);
}

function stopTimer() {
  window.clearInterval(timerInterval);
  timerInterval = 0;
}

function includesWakeWord(text) {
  return /(?:^|\s|[,.!?¡¿])atlas(?:$|\s|[,.!?¡¿])/i.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

function includesInterruptCommand(text) {
  return includesWakeWord(text);
}

function normalizeSpeechText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isLocalSilenceCommand(text, allowBare = false) {
  let words = normalizeSpeechText(text).split(" ").filter(Boolean);
  if (words[0] === "atlas") words = words.slice(1);
  else if (!allowBare) return false;
  return (
    words.length >= 1
    && words.length <= 16
    && words.some((word) => word === "calla" || word === "nada")
    && words.every((word) => ["calla", "nada", "no", "ya"].includes(word))
  );
}

function isImmediateConversationCandidate(text) {
  const phrase = normalizeSpeechText(text);
  return /^(?:hola|buenas|hey|ey)(?: atlas)?$/.test(phrase)
    || /^(?:que tal|como estas|como te va|todo bien)(?: atlas)?$/.test(phrase)
    || /^(?:buenos dias|buenas tardes|buenas noches)(?: atlas)?$/.test(phrase)
    || /^(?:adios|hasta luego|hasta pronto|nos vemos)(?: atlas)?$/.test(phrase);
}

function isImmediateNoStarterCandidate(text) {
  const phrase = normalizeSpeechText(text);
  return /^(?:atlas )?(?:(?:dime|me dices|puedes decirme) que hora es|que hora(?: es)?|dime la hora|me dices la hora)$/.test(phrase);
}

function containsAtlasFragment(text) {
  return normalizeSpeechText(text).split(" ").some((word) => word.includes("atlas"));
}

function beginPlaybackEchoGuard(text) {
  const firstWords = normalizeSpeechText(text).split(" ").slice(0, 3);
  if (firstWords.some((word) => word.includes("atlas"))) {
    muteRecognitionFor(WAKE_ECHO_MUTE_MS);
  }
}

function isLikelyFollowUpPlaybackEcho(text, durationMs) {
  if (recordingMode !== "followup" || durationMs > FOLLOW_UP_ECHO_REJECT_WINDOW_MS) return false;
  const candidate = normalizeSpeechText(text);
  if (candidate.length < 16 || !followUpEchoReference) return false;
  return followUpEchoReference.includes(candidate) || candidate.includes(followUpEchoReference);
}

function clearSpeculativeTimer() {
  window.clearTimeout(speculativeTimer);
  speculativeTimer = 0;
}

function scheduleSpeculativeStarter(transcript) {
  if (!interactionActive || !nativeTranscribing || speculativeSent || !currentRequestId) return;
  const candidate = transcript.replace(/\s+/g, " ").trim();
  if (isImmediateNoStarterCandidate(candidate)) {
    clearSpeculativeTimer();
    speculativeCandidate = candidate;
    return;
  }
  const immediateConversation = isImmediateConversationCandidate(candidate);
  if (!immediateConversation
      && (candidate.length < SPECULATIVE_MIN_CHARS
        || candidate.split(" ").length < SPECULATIVE_MIN_WORDS)) {
    clearSpeculativeTimer();
    speculativeCandidate = candidate;
    return;
  }
  if (candidate === speculativeCandidate && speculativeTimer) return;
  speculativeCandidate = candidate;
  clearSpeculativeTimer();
  speculativeTimer = window.setTimeout(() => {
    speculativeTimer = 0;
    if (!interactionActive || !nativeTranscribing || speculativeSent) return;
    const stableTranscript = `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, " ").trim();
    if (stableTranscript !== speculativeCandidate) {
      scheduleSpeculativeStarter(stableTranscript);
      return;
    }
    speculativeSent = true;
    addLog("Preámbulo anticipado solicitado durante la transcripción");
    void fetch("/api/starter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interactionId: currentRequestId,
        transcript: stableTranscript,
        ttsProvider: selectedVoiceProvider(),
      }),
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      speculativeMode = result.mode || "";
      speculativeHotListener = Boolean(result.hotListener);
      if (result.hotListener) {
        addLog("El oyente caliente de ATLAS ya ha recibido la frase");
      }
      if (result.mode === "read-only-main") {
        addLog("El agente principal ya adelanta la consulta de solo lectura");
      } else if (result.mode === "omitted") {
        addLog("La petición es inmediata; no necesita preámbulo");
      } else if (!result.hotListener) {
        addLog("El agente principal ya prepara el preámbulo en paralelo");
      }
    }).catch((error) => {
      addLog(`No se pudo anticipar el preámbulo: ${error.message}`, null, "error");
    });
  }, SPECULATIVE_STABLE_MS);
}

function recordingSilenceThresholdMs() {
  const liveTranscript = `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, " ").trim();
  const wordCount = liveTranscript ? liveTranscript.split(" ").length : 0;
  if (
    speculativeSent
    && (speculativeMode === "read-only-main" || speculativeHotListener)
    && lastRecognitionWasFinal
    && wordCount >= 3
  ) {
    return ADAPTIVE_FINAL_SILENCE_MS;
  }
  return SILENCE_MS;
}

function monitorRecording() {
  if (!interactionActive || !nativeTranscribing) return;
  const now = performance.now();
  const silenceThresholdMs = recordingSilenceThresholdMs();
  if (speechDetected && now - lastSpeechAt >= silenceThresholdMs) {
    const silenceSeconds = (silenceThresholdMs / 1000).toFixed(1).replace(".", ",");
    const reason = `silencio de ${silenceSeconds} segundos`;
    void stopRecordingAndSend(reason, silenceThresholdMs);
    return;
  }
  const noSpeechLimit = recordingMode === "followup" ? FOLLOW_UP_NO_SPEECH_MS : NO_SPEECH_MS;
  if (!speechDetected && now - recordingStartedAt >= noSpeechLimit) {
    if (recordingMode === "followup") {
      void endSilentFollowUp();
      return;
    }
    void stopRecordingAndSend("sin voz detectada");
    return;
  }
  if (now - recordingStartedAt >= MAX_RECORDING_MS) {
    void stopRecordingAndSend("límite de 60 segundos");
    return;
  }
  monitorFrame = window.requestAnimationFrame(monitorRecording);
}

function stopRecognition() {
  window.clearTimeout(recognitionRestartTimer);
  if (recognition && recognitionRunning) {
    try { recognition.abort(); } catch {}
  }
}

function muteRecognitionFor(duration = WAKE_ECHO_MUTE_MS) {
  recognitionMutedUntil = Math.max(recognitionMutedUntil, performance.now() + duration);
  stopRecognition();
  scheduleRecognitionRestart(Math.ceil(recognitionMutedUntil - performance.now()));
}

function scheduleRecognitionRestart(delay = 400) {
  window.clearTimeout(recognitionRestartTimer);
  const shouldListen = nativeTranscribing || !interactionActive || interruptMonitoring;
  if (activeView !== "atlas" || !recognition || !recognitionEnabled || !shouldListen || !microphoneStream) return;
  const restartDelay = Math.max(delay, Math.ceil(recognitionMutedUntil - performance.now()));
  recognitionRestartTimer = window.setTimeout(() => {
    const stillShouldListen = nativeTranscribing || !interactionActive || interruptMonitoring;
    if (activeView !== "atlas" || recognitionRunning || !stillShouldListen) return;
    if (performance.now() < recognitionMutedUntil) {
      scheduleRecognitionRestart(Math.ceil(recognitionMutedUntil - performance.now()));
      return;
    }
    try { recognition.start(); } catch { scheduleRecognitionRestart(800); }
  }, restartDelay);
}

function startInterruptMonitoring() {
  if (!interactionActive || nativeTranscribing) return;
  interruptMonitoring = true;
  scheduleRecognitionRestart(100);
}

function configureRecognition() {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = LANGUAGE;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    recognitionRunning = true;
    if (!interactionActive) setWaiting();
  };
  recognition.onend = () => {
    recognitionRunning = false;
    scheduleRecognitionRestart();
  };
  recognition.onerror = (event) => {
    recognitionRunning = false;
    if (["aborted", "no-speech"].includes(event.error)) return;
    addLog(`Reconocimiento de Chrome: ${event.error}`, null, "error");
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
      recognitionEnabled = false;
      setScreen("ERROR", "No puedo escuchar", "Revisa el permiso del micrófono en Chrome.", "error");
    } else if (nativeTranscribing) {
      failInteraction("La transcripción nativa de Chrome se ha interrumpido.");
    }
  };
  recognition.onresult = (event) => {
    if (performance.now() < recognitionMutedUntil) return;
    if (nativeTranscribing) {
      let newInterim = "";
      let receivedText = false;
      let receivedFinal = false;
      let receivedInterim = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = String(result[0]?.transcript || "").trim();
        if (!text) continue;
        const candidate = `${finalTranscript} ${text}`.replace(/\s+/g, " ").trim();
        if (
          (recordingMode === "wake" || recordingMode === "interrupt")
          && isLocalSilenceCommand(candidate, true)
        ) {
          addLog("Orden local de silencio detectada durante la escucha");
          void silenceAndReturnToWake();
          return;
        }
        receivedText = true;
        if (result.isFinal) {
          receivedFinal = true;
          finalTranscript = `${finalTranscript} ${text}`.trim();
        } else {
          receivedInterim = true;
          newInterim = `${newInterim} ${text}`.trim();
        }
      }
      interimTranscript = newInterim;
      if (receivedText) {
        speechDetected = true;
        lastSpeechAt = performance.now();
        lastRecognitionWasFinal = receivedFinal && !receivedInterim && !newInterim;
      }
      const liveTranscript = `${finalTranscript} ${interimTranscript}`.trim();
      transcriptElement.textContent = liveTranscript || "Escuchando…";
      transcriptElement.classList.toggle?.("placeholder", !liveTranscript);
      scheduleSpeculativeStarter(liveTranscript);
      return;
    }
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index][0];
      const recognizedText = String(result?.transcript || "").trim();
      if (!recognizedText) continue;
      if (isLocalSilenceCommand(recognizedText)) {
        addLog("Orden local de silencio detectada");
        if (interactionActive) void silenceAndReturnToWake();
        else setWaiting();
        return;
      }
      if (interactionActive && interruptMonitoring && includesInterruptCommand(recognizedText)) {
        addLog("Interrupción por voz “ATLAS” detectada");
        void interruptAndListen();
        return;
      }
      if (includesWakeWord(recognizedText)) {
        if (interactionActive) continue;
        wakeDetectedIso = new Date().toISOString();
        addLog("Wake word “ATLAS” detectada");
        void beginWakeRecording();
        return;
      }
    }
  };
}

async function beginWakeRecording() {
  if (interactionActive) return;
  stopRecognition();
  setScreen("ACTIVADO", "Te escucho", "ATLAS ha detectado la wake word. Puedes hablar.", "listening");
  await startRecording("wake");
}

async function startRecording(mode = "wake", parentId = "") {
  if (interactionActive || !microphoneStream) return;
  window.clearTimeout(followUpStartTimer);
  followUpStartTimer = 0;
  interactionActive = true;
  interactionToken += 1;
  interruptMonitoring = false;
  stopRecognition();
  transcriptElement.textContent = "Escuchando…";
  if (!(["followup", "interrupt"].includes(mode))) {
    responseElement.textContent = "Esperando la respuesta de ATLAS…";
  }
  finalTranscript = "";
  interimTranscript = "";
  speechDetected = false;
  nativeTranscribing = true;
  recordingMode = mode;
  parentInteractionId = parentId || "";
  replyExpected = false;
  currentRequestId = crypto.randomUUID();
  speculativeSent = false;
  speculativeCandidate = "";
  speculativeMode = "";
  speculativeHotListener = false;
  lastRecognitionWasFinal = false;
  clearSpeculativeTimer();
  recordingStartedAt = performance.now();
  recordingStartedIso = new Date().toISOString();
  lastSpeechAt = recordingStartedAt;
  const followUp = mode === "followup";
  setScreen(
    followUp ? "CONTINUACIÓN" : "GRABANDO",
    "Te escucho",
    followUp
      ? "Puedes empezar a hablar durante los próximos 10 segundos."
      : "La transcripción finalizará cuando Chrome confirme el final de la frase.",
    "listening",
  );
  cancelButton.hidden = false;
  recordButton.hidden = true;
  addLog(followUp ? "Escucha de continuación iniciada" : "Transcripción nativa iniciada");
  beginTimer();
  scheduleRecognitionRestart(20);
  monitorFrame = window.requestAnimationFrame(monitorRecording);
}

async function stopRecordingAndSend(reason, silenceThresholdMs = 0) {
  if (!interactionActive || !nativeTranscribing) return;
  window.cancelAnimationFrame(monitorFrame);
  stopTimer();
  const durationMs = performance.now() - recordingStartedAt;
  const stoppedAt = new Date().toISOString();
  const transcript = `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, " ").trim();
  clearSpeculativeTimer();
  nativeTranscribing = false;
  stopRecognition();
  addLog(`Transcripción detenida: ${reason}`, durationMs);
  if (!transcript || !speechDetected) {
    void requestServerCancellation(currentRequestId);
    failInteraction("No se ha detectado una frase.");
    return;
  }
  if (isLikelyFollowUpPlaybackEcho(transcript, durationMs)) {
    const followUpParentId = parentInteractionId;
    const echoReference = followUpEchoReference;
    interactionToken += 1;
    addLog("Eco residual de la voz de ATLAS descartado; sigo esperando tu respuesta");
    void reportBrowserEventFor(
      followUpParentId,
      "conversation.followup.echo.discarded",
      "La escucha automática descartó el eco residual de la voz de ATLAS",
      durationMs,
    );
    resetInteractionState();
    scheduleFollowUpRecording(followUpParentId, echoReference);
    return;
  }
  transcriptElement.textContent = transcript;
  transcriptElement.classList.remove("placeholder");
  setScreen("PROCESANDO", "ATLAS lo está procesando", "Enviando la transcripción nativa a OpenClaw.", "working");
  startInterruptMonitoring();
  const token = interactionToken;
  const controller = new AbortController();
  requestController = controller;
  try {
    const response = await fetch("/api/text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Atlas-Request-Id": currentRequestId,
        "X-Atlas-Interaction-Id": currentRequestId,
        "X-Atlas-Wake-At": wakeDetectedIso || recordingStartedIso,
        "X-Atlas-Recording-Started-At": recordingStartedIso,
        "X-Atlas-Recording-Stopped-At": stoppedAt,
        "X-Atlas-Recording-Duration-Ms": String(Math.round(durationMs)),
        "X-Atlas-Silence-Threshold-Ms": String(Math.round(silenceThresholdMs)),
        "X-Atlas-Stop-Reason": reason,
        "X-Atlas-TTS-Provider": selectedVoiceProvider(),
        "X-Atlas-Input-Mode": recordingMode,
        "X-Atlas-Parent-Interaction-Id": parentInteractionId,
      },
      body: JSON.stringify({ transcript, transcriptionDurationMs: Math.round(durationMs) }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    await readEventStream(response.body, token);
  } catch (error) {
    if (error.name !== "AbortError") failInteraction(error.message || "No se pudo completar la interacción.");
  } finally {
    if (requestController === controller) requestController = null;
  }
}

async function readEventStream(stream, token) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (token !== interactionToken) {
      await reader.cancel().catch(() => {});
      return;
    }
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) await handleServerEvent(JSON.parse(line), token);
    }
    if (done) break;
  }
  if (buffer.trim() && token === interactionToken) {
    await handleServerEvent(JSON.parse(buffer), token);
  }
}

async function handleServerEvent(event, token) {
  if (token !== interactionToken) return;
  if (event.type === "request") {
    addLog(event.sessionRenewed ? "Nueva sesión de agente creada" : "Sesión de agente reutilizada");
  } else if (event.type === "state" && event.state === "transcribing") {
    const native = event.provider === "chrome-native";
    setScreen(
      native ? "TRANSCRIPCIÓN LISTA" : "TRANSCRIBIENDO",
      native ? "Texto recibido" : "Transcribiendo",
      native ? "Chrome ha completado la transcripción en el navegador." : "Whisper está procesando el audio localmente.",
      "working",
    );
  } else if (event.type === "state" && event.state === "processing") {
    setScreen("PROCESANDO", "ATLAS lo está procesando", "OpenClaw está ejecutando el turno del agente.", "working");
    addLog("Procesamiento de OpenClaw iniciado");
  } else if (event.type === "state" && event.state === "synthesizing") {
    const provider = voiceProviderLabel(event.provider);
    if (!streamedSpeechActive) {
      setScreen("GENERANDO VOZ", "Preparando la voz", `${provider} está preparando la respuesta.`, "working");
    }
    addLog("Síntesis de voz iniciada");
  } else if (event.type === "stage" && event.name === "transcription") {
    addLog("Transcripción completada", event.durationMs);
  } else if (event.type === "stage" && event.name === "processing") {
    addLog("Respuesta de OpenClaw completada", event.durationMs);
  } else if (event.type === "stage" && event.name === "tts") {
    addLog(`Voz preparada con ${voiceProviderLabel(event.provider)}`, event.durationMs);
  } else if (event.type === "transcript") {
    transcriptElement.textContent = event.text;
    transcriptElement.classList.remove("placeholder");
    addLog(`Transcripción: ${event.text}`);
  } else if (event.type === "dismissed") {
    addLog(event.reason === "deferred"
      ? "Aplazamiento detectado localmente; OpenClaw no se ha llamado"
      : event.reason === "silent"
        ? "Orden de silencio resuelta localmente; OpenClaw no se ha llamado"
        : "Cancelación local detectada; OpenClaw no se ha llamado");
  } else if (event.type === "tool" && event.phase === "start") {
    addLog(`OpenClaw usa: ${event.title}`);
  } else if (event.type === "metric") {
    const label = event.name === "gatewayAccepted"
      ? "Gateway aceptó el turno"
      : event.name === "firstOpenClawDelta"
        ? "Primer fragmento de OpenClaw"
        : event.name === "firstOpenClawPreamble"
          ? "Primer preámbulo interno de OpenClaw"
        : event.name;
    addLog(label, event.durationMs);
  } else if (event.type === "starter") {
    responseElement.textContent = event.text;
    responseElement.classList.remove("placeholder");
    setScreen("EN PROCESO", "ATLAS se pone a ello", event.text, "working");
    addLog(`Respuesta inicial: ${event.text}`);
    // No bloqueamos el lector de eventos mientras habla el preámbulo. Así los
    // fragmentos finales que OpenClaw ya esté enviando entran enseguida en la
    // cola de voz del navegador, en lugar de acumularse hasta acabar la frase.
    void playSpeech(event.text, event.audio, event.provider, "starter", token)
      .then((played) => {
        if (!played || token !== interactionToken || streamedSpeechActive) return;
        setScreen("PROCESANDO", "ATLAS sigue trabajando", "OpenClaw está completando la petición.", "working");
      })
      .catch((error) => {
        if (token === interactionToken) addLog(`El preámbulo no se pudo reproducir: ${error.message}`, null, "error");
      });
  } else if (event.type === "response_delta") {
    responseElement.textContent = event.text;
    responseElement.classList.remove("placeholder");
    if (!streamedSpeechActive) {
      setScreen("RESPONDIENDO", "ATLAS está respondiendo", "La respuesta escrita está llegando en directo.", "working");
    }
  } else if (event.type === "speech_chunk") {
    queueStreamedSpeech(event.text, token);
  } else if (event.type === "speech_stream_abort") {
    stopCurrentPlayback();
    addLog("OpenClaw corrigió el texto en streaming; reproduciré la respuesta final completa");
  } else if (event.type === "progress") {
    responseElement.textContent = event.text;
    responseElement.classList.remove("placeholder");
    setScreen("AVANCE", "ATLAS sigue trabajando", event.text, "working");
    addLog(`Actualización: ${event.text}`);
    void playSpeech(event.text, event.audio, event.provider, "progress", token)
      .then((played) => {
        if (!played || token !== interactionToken || streamedSpeechActive) return;
        setScreen("PROCESANDO", "ATLAS sigue trabajando", "OpenClaw está completando la petición.", "working");
      })
      .catch((error) => {
        if (token === interactionToken) addLog(`La actualización no se pudo reproducir: ${error.message}`, null, "error");
      });
  } else if (event.type === "response") {
    replyExpected = replyExpected || Boolean(event.expectsReply);
    responseElement.textContent = event.text;
    responseElement.classList.remove("placeholder");
    if (!streamedSpeechActive) {
      setScreen("RESPUESTA", "ATLAS ha respondido", "La respuesta ya está escrita; ahora se generará la voz.", "working");
    }
  } else if (event.type === "speech") {
    replyExpected = replyExpected || Boolean(event.expectsReply);
    if (event.provider === "browser" && Number(event.streamedChunks || 0) > 0) {
      await finishStreamedSpeech(event.remainingText || "", token);
    } else {
      await playSpeech(event.text, event.audio, event.provider, "final", token);
    }
  } else if (event.type === "done") {
    replyExpected = replyExpected || Boolean(event.expectsReply);
    addLog("Interacción completada", event.durationMs);
    addLog(`Log guardado: ${event.log}`);
    const completedId = currentRequestId;
    const shouldFollowUp = replyExpected;
    if (shouldFollowUp) {
      addLog("ATLAS espera respuesta; abriré el micrófono tras apagar el eco de los altavoces");
    }
    finishInteraction({ waitForReply: shouldFollowUp, completedId });
  } else if (event.type === "cancelled") {
    addLog("Interacción cancelada");
    finishInteraction();
  } else if (event.type === "error") {
    failInteraction(event.message || "Error desconocido");
  }
}

function reportBrowserEventFor(interactionId, stage, message, durationMs = null, error = null) {
  if (!interactionId) return Promise.resolve();
  return fetch("/api/client-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      interactionId,
      stage,
      message,
      durationMs,
      error,
      clientBuild: CLIENT_BUILD,
    }),
    cache: "no-store",
  }).catch(() => {});
}

function reportBrowserEvent(stage, message, durationMs = null, error = null) {
  return reportBrowserEventFor(currentRequestId, stage, message, durationMs, error);
}

function browserVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find((voice) => voice.lang.toLowerCase() === "es-es")
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("es"))
    || null;
}

function browserSpeechSegments(text) {
  const source = String(text || "");
  const segments = [];
  const protectedWord = /\S*atlas\S*/gi;
  let cursor = 0;
  for (const match of source.matchAll(protectedWord)) {
    if (match.index > cursor) {
      segments.push({ text: source.slice(cursor, match.index), protected: false });
    }
    segments.push({ text: match[0], protected: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), protected: false });
  return segments.filter((segment) => segment.text);
}

async function speakBrowserSegment(text, voice) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANGUAGE;
  utterance.rate = 1.02;
  utterance.pitch = 1;
  if (voice) utterance.voice = voice;
  await new Promise((resolve, reject) => {
    utterance.addEventListener("end", resolve, { once: true });
    utterance.addEventListener("error", (event) => {
      if (["interrupted", "canceled"].includes(event.error)) {
        resolve();
        return;
      }
      reject(new Error(`La voz del navegador falló: ${event.error || "error desconocido"}`));
    }, { once: true });
    window.speechSynthesis.speak(utterance);
  });
}

async function playBrowserSpeech(text) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    throw new Error("Chrome no ofrece síntesis de voz en este equipo");
  }
  const run = ++browserSpeechRun;
  window.speechSynthesis.cancel();
  const voice = browserVoice();
  for (const segment of browserSpeechSegments(text)) {
    if (run !== browserSpeechRun) return;
    if (segment.protected) muteRecognitionFor(WAKE_ECHO_MUTE_MS);
    await speakBrowserSegment(segment.text, voice);
    if (run !== browserSpeechRun) return;
  }
}

function resetStreamedSpeechState() {
  streamedSpeechPromise = Promise.resolve();
  streamedSpeechActive = false;
  streamedSpeechStartedAt = 0;
  streamedSpeechRequestId = "";
  streamedSpeechRun = 0;
  streamedSpeechError = null;
}

function queueStreamedSpeech(text, token = interactionToken) {
  const chunk = String(text || "").trim();
  if (!chunk || token !== interactionToken) return;
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    streamedSpeechError ||= new Error("Chrome no ofrece síntesis de voz en este equipo");
    return;
  }
  if (!streamedSpeechActive) {
    streamedSpeechActive = true;
    streamedSpeechStartedAt = performance.now();
    streamedSpeechRequestId = currentRequestId;
    streamedSpeechRun = browserSpeechRun;
    setScreen("HABLANDO", "ATLAS está hablando", "La respuesta llega y se reproduce frase a frase.", "speaking");
    addLog("Reproducción final en streaming con voz del navegador iniciada");
    void reportBrowserEventFor(
      streamedSpeechRequestId,
      "final.playback.started",
      "Reproducción en streaming con voz del navegador iniciada",
    );
  }
  const expectedRun = streamedSpeechRun;
  streamedSpeechPromise = streamedSpeechPromise.then(async () => {
    if (token !== interactionToken || expectedRun !== browserSpeechRun || streamedSpeechError) return;
    const voice = browserVoice();
    for (const segment of browserSpeechSegments(chunk)) {
      if (token !== interactionToken || expectedRun !== browserSpeechRun) return;
      if (segment.protected) muteRecognitionFor(WAKE_ECHO_MUTE_MS);
      await speakBrowserSegment(segment.text, voice);
    }
  }).catch((error) => {
    streamedSpeechError ||= error;
  });
}

async function finishStreamedSpeech(remainingText, token = interactionToken) {
  queueStreamedSpeech(remainingText, token);
  await streamedSpeechPromise;
  if (token !== interactionToken) return false;
  const error = streamedSpeechError;
  const duration = performance.now() - streamedSpeechStartedAt;
  const playbackRequestId = streamedSpeechRequestId;
  if (error) {
    await reportBrowserEventFor(
      playbackRequestId,
      "final.playback.error",
      "La reproducción en streaming con voz del navegador falló",
      duration,
      error.message,
    );
    resetStreamedSpeechState();
    throw error;
  }
  addLog("Reproducción de voz en streaming completada", duration);
  await reportBrowserEventFor(
    playbackRequestId,
    "final.playback.completed",
    "Reproducción en streaming con voz del navegador completada",
    duration,
  );
  resetStreamedSpeechState();
  return true;
}

async function playElevenLabsSpeech(encodedAudio, text = "") {
  if (!encodedAudio) throw new Error("ElevenLabs no devolvió audio");
  const binary = window.atob(encodedAudio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const audioUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
  const audio = new Audio(audioUrl);
  currentAudio = audio;
  const wakePositions = [];
  const normalizedText = normalizeSpeechText(text);
  for (const match of normalizedText.matchAll(/\S*atlas\S*/g)) {
    wakePositions.push(match.index / Math.max(1, normalizedText.length));
  }
  audio.addEventListener("timeupdate", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    if (wakePositions.some((position) => Math.abs(audio.currentTime - position * audio.duration) < 0.7)) {
      muteRecognitionFor(WAKE_ECHO_MUTE_MS);
    }
  });
  let stopPlayback = null;
  try {
    const finished = new Promise((resolve, reject) => {
      stopPlayback = resolve;
      currentAudioStop = resolve;
      audio.addEventListener("ended", resolve, { once: true });
      audio.addEventListener("error", () => reject(new Error("Chrome no pudo reproducir el audio")), { once: true });
    });
    await audio.play();
    await finished;
  } finally {
    if (currentAudioStop === stopPlayback) currentAudioStop = null;
    currentAudio = null;
    URL.revokeObjectURL(audioUrl);
  }
}

async function playSpeech(text, encodedAudio, provider = "browser", role = "final", token = interactionToken) {
  setScreen("HABLANDO", "ATLAS está hablando", "La respuesta escrita se está reproduciendo por voz.", "speaking");
  const started = performance.now();
  const label = voiceProviderLabel(provider);
  const playbackRequestId = currentRequestId;
  addLog(`Reproducción ${role === "starter" ? "inicial" : "final"} con ${label} iniciada`);
  await reportBrowserEventFor(playbackRequestId, `${role}.playback.started`, `Reproducción con ${label} iniciada`);
  if (provider === "elevenlabs") beginPlaybackEchoGuard(text);
  try {
    if (provider === "elevenlabs") await playElevenLabsSpeech(encodedAudio, text);
    else await playBrowserSpeech(text);
    if (token !== interactionToken) return false;
    const duration = performance.now() - started;
    addLog("Reproducción de voz completada", duration);
    await reportBrowserEventFor(playbackRequestId, `${role}.playback.completed`, `Reproducción con ${label} completada`, duration);
    return true;
  } catch (error) {
    if (token !== interactionToken) return false;
    await reportBrowserEventFor(playbackRequestId, `${role}.playback.error`, `La reproducción con ${label} falló`, performance.now() - started, error.message);
    throw error;
  } finally {
    if (containsAtlasFragment(text)) muteRecognitionFor(WAKE_ECHO_TAIL_MS);
  }
}

function stopCurrentPlayback() {
  browserSpeechRun += 1;
  if (currentAudio) currentAudio.pause();
  currentAudioStop?.();
  currentAudioStop = null;
  currentAudio = null;
  window.speechSynthesis?.cancel();
  resetStreamedSpeechState();
}

function resetInteractionState() {
  clearSpeculativeTimer();
  interactionActive = false;
  interruptMonitoring = false;
  nativeTranscribing = false;
  finalTranscript = "";
  interimTranscript = "";
  currentRequestId = null;
  recordingMode = "wake";
  parentInteractionId = "";
  replyExpected = false;
  speculativeCandidate = "";
  speculativeSent = false;
  speculativeMode = "";
  speculativeHotListener = false;
  lastRecognitionWasFinal = false;
  resetStreamedSpeechState();
  stopTimer();
}

function scheduleFollowUpRecording(completedId, spokenText = "") {
  window.clearTimeout(followUpStartTimer);
  followUpEchoReference = normalizeSpeechText(spokenText || responseElement.textContent || "");
  const expectedToken = interactionToken;
  recognitionMutedUntil = Math.max(
    recognitionMutedUntil,
    performance.now() + FOLLOW_UP_ECHO_SETTLE_MS,
  );
  stopRecognition();
  setScreen(
    "CONTINUACIÓN",
    "Un instante",
    "Apagando el eco de los altavoces antes de volver a escucharte.",
    "listening",
  );
  followUpStartTimer = window.setTimeout(() => {
    followUpStartTimer = 0;
    if (expectedToken !== interactionToken || interactionActive || activeView !== "atlas") return;
    void startRecording("followup", completedId).then(() => reportBrowserEventFor(
      completedId,
      "conversation.followup.listen.started",
      "Escucha automática de continuación iniciada tras la guarda antieco",
      FOLLOW_UP_ECHO_SETTLE_MS,
    ));
  }, FOLLOW_UP_ECHO_SETTLE_MS);
}

function finishInteraction({ waitForReply = false, completedId = "" } = {}) {
  const spokenText = responseElement.textContent || "";
  resetInteractionState();
  if (waitForReply) {
    scheduleFollowUpRecording(completedId, spokenText);
  } else {
    followUpEchoReference = "";
    setWaiting();
  }
}

function failInteraction(message) {
  interactionToken += 1;
  interruptMonitoring = false;
  stopRecognition();
  stopCurrentPlayback();
  addLog(message, null, "error");
  setScreen("ERROR", "La interacción ha fallado", message, "error");
  resetInteractionState();
  cancelButton.hidden = true;
  recordButton.hidden = !microphoneStream;
  window.setTimeout(setWaiting, 2500);
}

function requestServerCancellation(requestId) {
  if (!requestId) return Promise.resolve();
  return fetch("/api/cancel", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId }), keepalive: true,
  }).catch(() => {});
}

async function endSilentFollowUp() {
  if (!interactionActive || recordingMode !== "followup") return;
  const followUpParentId = parentInteractionId;
  interactionToken += 1;
  window.cancelAnimationFrame(monitorFrame);
  stopTimer();
  nativeTranscribing = false;
  stopRecognition();
  addLog("Nadie ha hablado durante 10 segundos; vuelvo a esperar la wake word");
  await reportBrowserEventFor(
    followUpParentId,
    "conversation.followup.listen.timeout",
    "La escucha automática terminó sin detectar voz",
    FOLLOW_UP_NO_SPEECH_MS,
  );
  resetInteractionState();
  setWaiting();
}

async function silenceAndReturnToWake() {
  const silencedRequestId = currentRequestId;
  interactionToken += 1;
  interruptMonitoring = false;
  nativeTranscribing = false;
  stopRecognition();
  window.cancelAnimationFrame(monitorFrame);
  stopTimer();
  requestController?.abort();
  requestController = null;
  stopCurrentPlayback();
  recognitionMutedUntil = Math.max(recognitionMutedUntil, performance.now() + 500);
  void Promise.all([
    requestServerCancellation(silencedRequestId),
    reportBrowserEventFor(
      silencedRequestId,
      "conversation.silenced",
      "El usuario pidió silencio diciendo ATLAS seguido de calla o nada",
    ),
  ]);
  addLog("ATLAS se ha callado y vuelve a esperar la wake word");
  resetInteractionState();
  setWaiting();
}

async function interruptAndListen() {
  if (!interactionActive || !interruptMonitoring || interruptHandling) return;
  interruptHandling = true;
  const interruptedRequestId = currentRequestId;
  interactionToken += 1;
  interruptMonitoring = false;
  stopRecognition();
  requestController?.abort();
  requestController = null;
  stopCurrentPlayback();
  void Promise.all([
    requestServerCancellation(interruptedRequestId),
    reportBrowserEventFor(
      interruptedRequestId,
      "conversation.interrupted",
      "El usuario interrumpió por voz diciendo ATLAS",
    ),
  ]);
  addLog("Trabajo y voz interrumpidos; la sesión de ATLAS se conserva");
  resetInteractionState();
  setScreen("INTERRUMPIDO", "Te escucho", "ATLAS ha detenido el turno y mantiene el contexto.", "listening");
  await startRecording("interrupt", interruptedRequestId);
  interruptHandling = false;
}

async function cancelInteraction() {
  const cancelledRequestId = currentRequestId;
  interactionToken += 1;
  interruptMonitoring = false;
  nativeTranscribing = false;
  stopRecognition();
  window.cancelAnimationFrame(monitorFrame);
  stopTimer();
  requestController?.abort();
  stopCurrentPlayback();
  void requestServerCancellation(cancelledRequestId);
  addLog("Interacción cancelada por el usuario");
  resetInteractionState();
  setWaiting();
}

async function initializeMicrophone() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setScreen("MICRÓFONO BLOQUEADO", "Chrome no permite el micrófono", "Marca esta URL HTTP como origen seguro en Chrome.", "error");
    addLog("El origen HTTP no está autorizado como contexto seguro", null, "error");
    return;
  }
  if (!SpeechRecognitionAPI) {
    failInteraction("Este navegador no soporta la transcripción nativa. Usa Chrome o Chromium.");
    return;
  }
  enableButton.disabled = true;
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    recognitionEnabled = true;
    configureRecognition();
    enableButton.hidden = true;
    recordButton.hidden = false;
    addLog("Micrófono activado");
    setWaiting();
  } catch (error) {
    enableButton.disabled = false;
    failInteraction(error.name === "NotAllowedError" ? "Permiso de micrófono denegado." : "No se pudo abrir el micrófono.");
  }
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = await response.json();
    healthDot.className = health.ready ? "ready" : "error";
    healthLabel.textContent = health.ready
      ? `${health.openclaw.model} · Chrome STT · ${voiceProviderLabel()}`
      : "Backend incompleto";
    addLog(health.ready ? "Backend preparado" : "Backend degradado", null, health.ready ? "normal" : "error");
  } catch {
    healthDot.className = "error";
    healthLabel.textContent = "Sin conexión con la Pi";
    addLog("No se pudo consultar el backend", null, "error");
  }
}

menuToggle.addEventListener("click", () => setPanelOpen(!sidePanel.classList.contains("open")));
panelClose.addEventListener("click", () => setPanelOpen(false));
panelBackdrop.addEventListener("click", () => setPanelOpen(false));
for (const tab of toolTabs) {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setPanelOpen(false);
});
dictationToggle.addEventListener("click", () => {
  if (dictationRunning || dictationShouldRestart) stopDictation();
  else startDictation();
});
ttsForm.addEventListener("submit", runTtsLab);
settingsForm.addEventListener("submit", saveSettings);

enableButton.addEventListener("click", initializeMicrophone);
recordButton.addEventListener("click", () => {
  wakeDetectedIso = new Date().toISOString();
  addLog("Transcripción manual iniciada");
  void startRecording("manual");
});
cancelButton.addEventListener("click", cancelInteraction);
voiceProviderSelect.value = localStorage.getItem("atlas-webscreen-voice") === "elevenlabs"
  ? "elevenlabs" : "browser";
voiceProviderSelect.addEventListener("change", () => {
  localStorage.setItem("atlas-webscreen-voice", selectedVoiceProvider());
  healthLabel.textContent = healthLabel.textContent.replace(/voz del navegador|ElevenLabs$/, voiceProviderLabel());
  addLog(`Motor de voz: ${voiceProviderLabel()}`);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleRecognitionRestart(100);
});
window.addEventListener("beforeunload", () => {
  recognitionEnabled = false;
  stopRecognition();
  microphoneStream?.getTracks().forEach((track) => track.stop());
  requestController?.abort();
  stopCurrentPlayback();
  stopDictation();
  stopTtsLab();
});

transcriptElement.classList.add("placeholder");
responseElement.classList.add("placeholder");
void checkHealth();
void loadSettings();
