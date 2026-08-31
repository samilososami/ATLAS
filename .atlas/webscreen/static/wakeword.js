(() => {
  "use strict";

  const profileInput = document.querySelector("#wake-profile");
  const startButton = document.querySelector("#wake-start");
  const recordButton = document.querySelector("#wake-record");
  const cancelButton = document.querySelector("#wake-cancel");
  const stepElement = document.querySelector("#wake-step");
  const progress = document.querySelector("#wake-progress");
  const result = document.querySelector("#wake-result");
  const profilesList = document.querySelector("#wake-profiles-list");
  const state = { phase: "idle", wakeIndex: 1, busy: false, stream: null, recorder: null, token: 0 };

  const hasControl = () => window.atlasAccess?.hasControl?.() === true;
  const sleep = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

  function setResult(message, kind = "") {
    result.className = `tool-result${kind ? ` ${kind}` : ""}`;
    result.textContent = message;
  }

  function render() {
    const wake = state.phase === "wake";
    const normal = state.phase === "normal";
    const recording = state.phase === "recording";
    profileInput.disabled = wake || normal || recording || state.busy;
    startButton.hidden = wake || normal || recording;
    startButton.disabled = state.busy || !hasControl();
    recordButton.hidden = !(wake || normal || recording);
    recordButton.disabled = state.busy || recording || !hasControl();
    cancelButton.hidden = !(wake || normal || recording);
    cancelButton.disabled = state.busy;
    if (state.phase === "idle") {
      stepElement.textContent = "Preparado para empezar.";
      progress.value = 0;
    } else if (wake) {
      stepElement.textContent = `Muestra ${state.wakeIndex} de 5: pulsa grabar y di “Atlas” una sola vez.`;
      progress.value = state.wakeIndex - 1;
    } else if (normal) {
      stepElement.textContent = "Muestra final: habla normalmente durante unos doce segundos sin decir “Atlas”.";
      progress.value = 5;
    } else if (recording) {
      stepElement.textContent = "Grabando localmente…";
    } else if (state.phase === "complete") {
      stepElement.textContent = "Perfil completado. Está listo para la fase de verificación.";
      progress.value = 6;
    }
  }

  function profileName() {
    const value = profileInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!value) throw new Error("Escribe un nombre de perfil, por ejemplo sami.");
    profileInput.value = value;
    return value;
  }

  function closeStream() {
    state.recorder = null;
    state.stream?.getTracks().forEach(track => track.stop());
    state.stream = null;
  }

  async function loadProfiles() {
    if (!hasControl()) return;
    try {
      const response = await window.atlasAccess.fetch("/api/wake/profiles", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar los perfiles");
      profilesList.replaceChildren();
      if (!payload.profiles?.length) {
        const item = document.createElement("li");
        item.textContent = "Todavía no hay perfiles grabados.";
        profilesList.append(item);
        return;
      }
      for (const profile of payload.profiles) {
        const item = document.createElement("li");
        item.textContent = `${profile.profile}: ${profile.wakeSamples}/5 wake · ${profile.normalSpeechSamples}/1 voz natural${profile.readyForVerifier ? " · listo para verificar" : ""}`;
        profilesList.append(item);
      }
    } catch (error) {
      profilesList.replaceChildren();
      const item = document.createElement("li");
      item.textContent = error.message;
      profilesList.append(item);
    }
  }

  async function uploadSample(blob, profile, kind, index) {
    const response = await window.atlasAccess.fetch("/api/wake/sample", {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "audio/webm",
        "X-Atlas-Wake-Profile": profile,
        "X-Atlas-Wake-Sample-Kind": kind,
        "X-Atlas-Wake-Sample-Index": String(index),
      },
      body: blob,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "ATLAS A1 no pudo guardar la muestra");
    return payload;
  }

  async function recordSample() {
    if (state.busy || !hasControl()) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setResult("Este navegador no ofrece grabación de micrófono.", "error");
      return;
    }
    let profile;
    try { profile = profileName(); } catch (error) { setResult(error.message, "error"); return; }
    const kind = state.phase === "normal" ? "normal" : "wake";
    const index = kind === "normal" ? 1 : state.wakeIndex;
    const duration = kind === "normal" ? 12000 : 2500;
    const token = ++state.token;
    state.busy = true;
    state.phase = "recording";
    render();
    setResult(kind === "normal" ? "Prepárate para hablar con naturalidad…" : "Prepárate para decir “Atlas”…");
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (token !== state.token) return;
      await sleep(700);
      if (token !== state.token) return;
      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const recorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
      state.recorder = recorder;
      const blob = await new Promise((resolve, reject) => {
        recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
        recorder.addEventListener("error", () => reject(new Error("La grabación de audio falló")), { once: true });
        recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" })), { once: true });
        recorder.start();
        setResult(kind === "normal" ? "Grabando voz natural…" : `Grabando “Atlas”… ${index}/5`);
        window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, duration);
      });
      if (token !== state.token) return;
      closeStream();
      setResult("Guardando muestra privada en ATLAS A1…");
      const saved = await uploadSample(blob, profile, kind, index);
      if (token !== state.token) return;
      if (kind === "wake" && index < 5) {
        state.wakeIndex += 1;
        state.phase = "wake";
        setResult(`Muestra ${index}/5 guardada en ${saved.durationSeconds} s.`, "success");
      } else if (kind === "wake") {
        state.phase = "normal";
        setResult("Las cinco muestras de “Atlas” están guardadas. Falta la voz natural.", "success");
      } else {
        state.phase = "complete";
        setResult("Perfil guardado localmente. Aún no está activado como filtro de voz.", "success");
      }
      await loadProfiles();
    } catch (error) {
      setResult(error.message || "No se pudo grabar la muestra.", "error");
      state.phase = kind === "normal" ? "normal" : "wake";
    } finally {
      closeStream();
      state.busy = false;
      render();
    }
  }

  function begin() {
    if (!hasControl()) return;
    try { profileName(); } catch (error) { setResult(error.message, "error"); return; }
    state.wakeIndex = 1;
    state.phase = "wake";
    setResult("Se sustituirán una a una las muestras de este perfil tras validar cada grabación.");
    render();
  }

  function stop() {
    state.token += 1;
    if (state.recorder?.state === "recording") { try { state.recorder.stop(); } catch {} }
    closeStream();
    state.busy = false;
    if (state.phase === "recording" || state.phase === "wake" || state.phase === "normal") state.phase = "idle";
    render();
  }

  startButton.addEventListener("click", begin);
  recordButton.addEventListener("click", () => void recordSample());
  cancelButton.addEventListener("click", stop);
  window.addEventListener("atlas-access-acquired", () => { render(); void loadProfiles(); });

  window.AtlasWakeEnrollment = {
    onViewChanged(view) { if (view === "wakeword") { render(); void loadProfiles(); } else stop(); },
    stop,
  };
  render();
})();
