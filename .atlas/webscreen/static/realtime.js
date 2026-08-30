(() => {
  "use strict";

  const WAKE_PRE_SILENCE_MS = 400;
  const FOLLOW_UP_IDLE_MS = 10000;
  const MODEL = "gpt-realtime-2.1";
  const DEFAULT_VOICE = "marin";
  const VAD_THRESHOLD = 0.45;
  const SILENCE_DURATION_MS = 500;
  const PREFIX_PADDING_MS = 300;
  const ATLAS_REALTIME_FALLBACK_INSTRUCTIONS =
    "Eres ATLAS. Habla principalmente en español y usa tus herramientas para resolver la petición del usuario.";

  const REALTIME_TOOLS = [{
    type: "function",
    name: "atlas_shell",
    description: "Ejecuta un comando no interactivo en la Raspberry Pi como sami. Úsala para consultar el sistema o realizar la acción solicitada. La salida se devuelve a ATLAS.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        command: { type: "string", description: "Comando Bash completo que se debe ejecutar." },
        timeout_seconds: { type: "integer", minimum: 1, maximum: 30, description: "Tiempo máximo de espera, en segundos." },
      },
      required: ["command"],
    },
  }];

  const normalized = (value) => String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();

  function wakeInvocation(text) {
    return /^(?:oye\s+)?atlas(?:\s|$)/u.test(normalized(text));
  }

  function silenceInvocation(text) {
    const phrase = normalized(text).replace(/^(?:oye\s+)?atlas\s*/u, "").trim();
    if (!phrase) return false;
    const words = phrase.split(/\s+/u);
    return words.every((word) => ["calla", "nada", "no", "para", "parate", "silencio"].includes(word))
      && words.some((word) => ["calla", "nada", "para", "parate", "silencio"].includes(word));
  }

  function withTurnSeparator(value) {
    const text = String(value || "");
    return text && !/\s$/u.test(text) ? `${text} ` : text;
  }

  function requestId() {
    return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  }

  function parseToolArguments(value) {
    if (value && typeof value === "object") return value;
    try { return JSON.parse(String(value || "{}")); }
    catch { return {}; }
  }

  async function readEventStream(stream, onEvent) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        onEvent(JSON.parse(line));
      }
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer));
  }

  class RealtimeController {
    constructor(options) {
      this.fetch = options.fetch;
      this.callbacks = options.callbacks || {};
      this.peer = null;
      this.channel = null;
      this.media = null;
      this.remoteAudio = null;
      this.session = null;
      this.state = "idle";
      this.closed = true;
      this.conversationActive = false;
      this.responseActive = false;
      this.externalPlaybackActive = false;
      this.nativePlaybackActive = false;
      this.nativePlaybackEventsSeen = false;
      this.turnInputPending = false;
      this.speechOverActiveOutput = false;
      this.responseFinalized = false;
      this.externalPlaybackText = "";
      this.toolActive = false;
      this.currentInteractionId = "";
      this.currentRequestId = "";
      this.currentInputItemId = "";
      this.currentAssistantText = "";
      this.toolBuffers = new Map();
      this.consultController = null;
      this.followUpTimer = 0;
      this.inputPendingTimer = 0;
      this.pendingToolResponse = false;
      this.lastSpeechEndedAt = 0;
      this.preSpeechSilenceMs = Number.POSITIVE_INFINITY;
      this.turnStartedAt = 0;
      this.responseStartedAt = 0;
      this.firstOutputSeen = false;
      this.startPromise = null;
      this.configurationTimer = 0;
      this.connectionStartedAt = 0;
    }

    isIdle() {
      return this.state === "ready" && !this.conversationActive
        && !this.responseActive && !this.externalPlaybackActive && !this.toolActive
        && !this.nativePlaybackActive && !this.turnInputPending && !this.pendingToolResponse;
    }

    async start() {
      if (this.startPromise) return this.startPromise;
      if (!this.closed && ["connecting", "configuring", "ready"].includes(this.state)) return true;
      this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
      return this.startPromise;
    }

    async startInternal() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia
          || typeof RTCPeerConnection === "undefined") {
        throw new Error("OpenAI Realtime necesita WebRTC y permiso de micrófono");
      }
      this.stop(false);
      this.closed = false;
      this.state = "connecting";
      this.callbacks.setScreen?.("GPT LIVE", "Conectando con ATLAS", "Preparando audio bidireccional…", "listening");
      this.callbacks.addLog?.("Abriendo sesión OpenAI Realtime mediante OpenClaw");
      const started = performance.now();
      this.connectionStartedAt = started;
      try {
        const reservationResponse = await this.fetch("/api/realtime/session", {
          method: "POST", cache: "no-store",
          headers: { "Content-Type": "application/json" },
          // The backend owns the persisted voice selection. A Realtime voice
          // cannot be changed after audio has been generated, so app.js creates
          // a fresh session whenever the selector changes.
          body: JSON.stringify({}),
        });
        const reservation = await reservationResponse.json();
        if (!reservationResponse.ok) throw new Error(reservation.error || "OpenAI Realtime no está disponible");
        const session = reservation.session;
        if (!session?.clientSecret || session.transport !== "webrtc") {
          throw new Error("OpenClaw no devolvió una sesión WebRTC válida");
        }
        this.session = session;
        this.peer = new RTCPeerConnection();
        this.peer.addEventListener("track", (event) => this.attachRemoteAudio(event));
        this.peer.addEventListener("connectionstatechange", () => {
          if (this.closed) return;
          if (["failed", "closed", "disconnected"].includes(this.peer?.connectionState)) {
            this.fail(new Error(`Conexión Realtime ${this.peer?.connectionState || "cerrada"}`));
          }
        });
        this.media = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        for (const track of this.media.getAudioTracks()) this.peer.addTrack(track, this.media);
        this.channel = this.peer.createDataChannel("oai-events");
        this.channel.addEventListener("open", () => {
          if (this.closed) return;
          this.state = "configuring";
          const channelInstructions = String(session.atlasInstructions || "").trim();
          const workspaceContext = String(session.atlasContext || "").trim();
          const instructions = [
            channelInstructions || ATLAS_REALTIME_FALLBACK_INSTRUCTIONS,
            workspaceContext,
          ].filter(Boolean).join("\n\n");
          this.send({
            type: "session.update",
            session: {
              type: "realtime",
              output_modalities: [this.usesExternalTts() ? "text" : "audio"],
              instructions,
              tools: REALTIME_TOOLS,
              tool_choice: "auto",
              audio: {
                input: {
                  turn_detection: {
                    type: "server_vad",
                    threshold: Number(session.vadThreshold || VAD_THRESHOLD),
                    silence_duration_ms: Number(session.silenceDurationMs || SILENCE_DURATION_MS),
                    prefix_padding_ms: Number(session.prefixPaddingMs || PREFIX_PADDING_MS),
                    create_response: false,
                    // The physical A1 uses an HDMI speaker and a separate USB
                    // microphone. Let the transcript prove that sami actually
                    // said ATLAS before cutting audio; raw VAD alone can hear
                    // the loudspeaker and would otherwise interrupt itself.
                    interrupt_response: false,
                  },
                },
              },
            },
          });
          // Keep stats for diagnostics, but do not retain a second browser-side
          // copy of the private Markdown after the session has accepted it.
          delete this.session.atlasInstructions;
          delete this.session.atlasContext;
          this.configurationTimer = window.setTimeout(() => {
            this.fail(new Error("OpenAI Realtime no confirmó el control manual de turnos"));
          }, 4000);
        });
        this.channel.addEventListener("message", (event) => this.handleEvent(event.data));
        const offer = await this.peer.createOffer();
        await this.peer.setLocalDescription(offer);
        const answerResponse = await fetch(session.offerUrl || "https://api.openai.com/v1/realtime/calls", {
          method: "POST", body: offer.sdp,
          headers: {
            ...(session.offerHeaders || {}),
            Authorization: `Bearer ${session.clientSecret}`,
            "Content-Type": "application/sdp",
          },
        });
        const answerSdp = await answerResponse.text();
        if (!answerResponse.ok) {
          const detail = answerSdp.replace(/\s+/gu, " ").trim().slice(0, 400);
          throw new Error(`OpenAI rechazó WebRTC con HTTP ${answerResponse.status}${detail ? `: ${detail}` : ""}`);
        }
        await this.peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
        // The reservation is one-use. Do not retain it any longer than negotiation needs.
        this.session.clientSecret = "";
        return true;
      } catch (error) {
        this.stop(false);
        throw error;
      }
    }

    attachRemoteAudio(event) {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      const audio = document.querySelector("#realtime-audio") || document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = 1;
      // Start the WebRTC sink muted. Muted autoplay is reliable on every Chrome
      // surface; wake validation unmutes it before response.create is sent.
      audio.muted = this.usesExternalTts() || !this.conversationActive;
      audio.srcObject = stream;
      if (!audio.isConnected) {
        audio.hidden = true;
        document.body.append(audio);
      }
      this.remoteAudio = audio;
      void audio.play().then(() => {
        this.callbacks.addLog?.("Salida de audio WebRTC conectada");
        this.postEvent("audio.ready", "El navegador conectó la salida de audio Realtime");
      }).catch((error) => {
        this.callbacks.addLog?.(`Chrome bloqueó el audio Realtime: ${error.message}`, null, "error");
        this.postEvent("audio.blocked", "Chrome bloqueó la salida de audio Realtime",
          { status: error.message || String(error) });
      });
    }

    setOutputEnabled(enabled) {
      if (this.usesExternalTts()) return;
      if (!this.remoteAudio) return;
      this.remoteAudio.muted = !enabled;
      if (enabled && this.remoteAudio.paused) {
        void this.remoteAudio.play().catch((error) => {
          this.callbacks.addLog?.(`No se pudo reanudar el audio Realtime: ${error.message}`, null, "error");
        });
      }
    }

    markReady() {
      if (this.closed || this.state !== "configuring") return;
      window.clearTimeout(this.configurationTimer);
      this.configurationTimer = 0;
      this.state = "ready";
      const model = this.session?.model || MODEL;
      const voice = this.session?.atlasSelection || this.session?.voice || DEFAULT_VOICE;
      const durationMs = performance.now() - this.connectionStartedAt;
      this.callbacks.addLog?.(`OpenAI Realtime preparado con voz ${voice}`, durationMs);
      const contextTokens = Number(this.session?.atlasContextStats?.estimatedTokens || 0);
      if (contextTokens) {
        this.callbacks.addLog?.(`Contexto privado cargado: aproximadamente ${contextTokens} tokens`);
      }
      this.callbacks.onReady?.({ model, voice, output: this.outputMode() });
      this.showWaiting();
      this.postEvent("session.ready", "Sesión OpenAI Realtime preparada", { model, voice, durationMs });
    }

    send(payload) {
      if (this.channel?.readyState === "open") this.channel.send(JSON.stringify(payload));
    }

    handleEvent(raw) {
      if (this.closed) return;
      let event;
      try { event = JSON.parse(String(raw)); } catch { return; }
      switch (event.type) {
        case "session.updated":
          this.markReady();
          return;
        case "input_audio_buffer.speech_started":
          this.beginSpeech();
          return;
        case "input_audio_buffer.speech_stopped":
          this.endSpeech();
          return;
        case "output_audio_buffer.started":
          this.nativePlaybackEventsSeen = true;
          this.nativePlaybackActive = true;
          this.postEvent("audio.playback_started", "Comenzó la reproducción del búfer WebRTC");
          return;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          this.nativePlaybackEventsSeen = true;
          this.nativePlaybackActive = false;
          this.postEvent("audio.playback_stopped", "Terminó la reproducción del búfer WebRTC");
          this.flushPendingToolResponse();
          if (this.responseFinalized) this.scheduleFollowUp();
          return;
        case "conversation.item.input_audio_transcription.completed":
          this.handleUserTranscript(event);
          return;
        case "conversation.output_transcript.delta":
        case "response.output_text.delta":
        case "response.audio_transcript.delta":
        case "response.output_audio_transcript.delta":
          this.handleAssistantText(event.delta || "", false);
          return;
        case "response.output_text.done":
        case "response.audio_transcript.done":
        case "response.output_audio_transcript.done":
          this.handleAssistantText(event.transcript || event.text || "", true);
          return;
        case "response.function_call_arguments.delta":
          this.bufferTool(event);
          return;
        case "response.function_call_arguments.done":
          void this.handleTool(event);
          return;
        case "response.created":
          this.responseActive = true;
          this.responseFinalized = false;
          this.externalPlaybackText = "";
          this.responseStartedAt = performance.now();
          this.firstOutputSeen = false;
          // A preamble and its post-tool result are separate responses. Reset
          // this buffer so external TTS never speaks the preamble a second time.
          this.currentAssistantText = "";
          this.callbacks.setScreen?.("RESPONDIENDO", "ATLAS está respondiendo",
            this.usesExternalTts() ? "Realtime genera texto para la voz seleccionada." : "Audio Realtime en curso.",
            "working");
          this.postEvent("response.created", "OpenAI Realtime comenzó a responder");
          return;
        case "response.cancelled":
        case "response.done":
          this.finishResponse(event);
          return;
        case "error":
          this.fail(new Error(event.error?.message || event.error?.code || "Error del proveedor Realtime"));
          return;
        default:
      }
    }

    beginSpeech() {
      const now = performance.now();
      const outputWasActive = this.conversationActive && (
        this.responseActive || this.nativePlaybackActive
        || this.externalPlaybackActive || this.toolActive
      );
      this.speechOverActiveOutput = outputWasActive;
      this.preSpeechSilenceMs = this.lastSpeechEndedAt
        ? Math.max(0, now - this.lastSpeechEndedAt) : Number.POSITIVE_INFINITY;
      this.turnStartedAt = now;
      // Preserve the active response until the transcript confirms an explicit
      // barge-in. This also keeps its text and logs intact when the mic hears
      // the A1's own loudspeaker.
      if (!outputWasActive) {
        this.currentInteractionId = requestId();
        this.currentRequestId = requestId();
        this.currentAssistantText = "";
        this.firstOutputSeen = false;
      }
      this.turnInputPending = true;
      window.clearTimeout(this.inputPendingTimer);
      window.clearTimeout(this.followUpTimer);
      if (!outputWasActive) {
        this.clearPendingToolResponse();
      } else {
        this.callbacks.addLog?.("Voz detectada durante la respuesta; espero la transcripción antes de interrumpir");
      }
      // Raw VAD only means that the microphone heard speech-like audio. It is
      // not proof that somebody called ATLAS, so an idle screen must not flash
      // "Te escucho" before the completed transcript validates the wake word.
      if (this.conversationActive && !outputWasActive) {
        this.callbacks.setScreen?.("ESCUCHANDO", "Te escucho", "OpenAI Realtime está recibiendo tu voz.", "listening");
      }
      this.postEvent("input.speech_started", "OpenAI Realtime detectó voz", {
        durationMs: Number.isFinite(this.preSpeechSilenceMs) ? this.preSpeechSilenceMs : undefined,
      });
    }

    endSpeech() {
      this.lastSpeechEndedAt = performance.now();
      window.clearTimeout(this.inputPendingTimer);
      this.inputPendingTimer = window.setTimeout(() => {
        this.turnInputPending = false;
        this.scheduleFollowUp();
      }, 4000);
      if (this.conversationActive || this.speechOverActiveOutput) {
        this.callbacks.setScreen?.("PROCESANDO", "ATLAS te ha escuchado", "Interpretando la frase en directo…", "working");
      }
      this.postEvent("input.speech_stopped", "El usuario terminó de hablar",
        { durationMs: this.lastSpeechEndedAt - this.turnStartedAt });
    }

    handleUserTranscript(event) {
      const text = String(event.transcript || "").trim();
      if (!text) return;
      window.clearTimeout(this.inputPendingTimer);
      this.inputPendingTimer = 0;
      this.turnInputPending = false;
      window.clearTimeout(this.followUpTimer);
      this.currentInputItemId = event.item_id || "";
      this.callbacks.setTranscript?.(text);
      this.postEvent("input.transcript", "OpenAI Realtime completó la transcripción", { role: "user", text });
      if (silenceInvocation(text)) {
        this.callbacks.addLog?.("Orden de silencio detectada localmente");
        this.interruptWork();
        this.conversationActive = false;
        this.setOutputEnabled(false);
        this.deleteInputItem();
        this.speechOverActiveOutput = false;
        this.showWaiting();
        return;
      }
      if (this.speechOverActiveOutput) {
        this.speechOverActiveOutput = false;
        const directBargeIn = wakeInvocation(text);
        const inputWords = normalized(text).split(/\s+/u).filter(Boolean);
        const likelySpokenByAtlas = inputWords.length >= 3
          && normalized(this.currentAssistantText).includes(normalized(text));
        if (!directBargeIn || likelySpokenByAtlas) {
          this.deleteInputItem();
          this.callbacks.addLog?.(likelySpokenByAtlas
            ? "Eco del propio ATLAS descartado sin cortar la respuesta"
            : "Voz de fondo ignorada durante la respuesta; di ATLAS para interrumpir");
          this.postEvent("echo.ignored", "La entrada durante la reproducción no era una interrupción válida",
            { text });
          this.restoreActiveOutputScreen();
          this.flushPendingToolResponse();
          return;
        }
        this.callbacks.addLog?.("Interrupción confirmada por la palabra ATLAS");
        this.interruptWork();
        this.currentInteractionId = requestId();
        this.currentRequestId = requestId();
        this.currentAssistantText = "";
        this.firstOutputSeen = false;
        this.postEvent("barge_in.accepted", "El usuario interrumpió explícitamente diciendo ATLAS", { text });
      }
      if (!this.conversationActive) {
        const validWake = wakeInvocation(text) && this.preSpeechSilenceMs >= WAKE_PRE_SILENCE_MS;
        if (!validWake) {
          this.cancelProviderResponse();
          this.deleteInputItem();
          this.setOutputEnabled(false);
          this.callbacks.addLog?.(wakeInvocation(text)
            ? "Wake word ignorada: faltó silencio previo"
            : "Frase de fondo ignorada: no era una llamada directa a ATLAS");
          this.postEvent("wake.ignored", "La frase no superó el filtro local de wake word", { text });
          this.showWaiting();
          return;
        }
        this.conversationActive = true;
        this.setOutputEnabled(true);
        this.callbacks.addLog?.("Wake word validada por la transcripción de OpenAI Realtime");
        this.postEvent("wake.accepted", "Wake word ATLAS validada", { text });
      }
      this.callbacks.setScreen?.("PROCESANDO", "ATLAS lo está procesando", "La conversación sigue en la misma sesión.", "working");
      this.send({ type: "response.create" });
    }

    restoreActiveOutputScreen() {
      if (this.externalPlaybackActive || this.nativePlaybackActive) {
        this.callbacks.setScreen?.("HABLANDO", "ATLAS está hablando",
          "La entrada del altavoz se ha descartado y la respuesta continúa.", "speaking");
      } else if (this.toolActive) {
        this.callbacks.setScreen?.("SHELL", "ATLAS está actuando",
          "La acción en curso continúa sin interrupciones.", "working");
      } else if (this.responseActive) {
        this.callbacks.setScreen?.("RESPONDIENDO", "ATLAS está respondiendo",
          "La respuesta Realtime continúa.", "working");
      }
    }

    handleAssistantText(value, final) {
      const text = String(value || "");
      if (!text) return;
      if (!this.firstOutputSeen) {
        this.firstOutputSeen = true;
        const latency = this.lastSpeechEndedAt ? performance.now() - this.lastSpeechEndedAt : 0;
        this.callbacks.addLog?.("Primer fragmento de OpenAI Realtime", latency);
        this.postEvent("output.first_delta", "Llegó el primer fragmento hablado", { durationMs: latency });
      }
      if (final) {
        if (!this.currentAssistantText.trim() || text.length >= this.currentAssistantText.length) {
          this.currentAssistantText = text;
        }
      } else {
        this.currentAssistantText += text;
      }
      this.callbacks.setResponse?.(this.currentAssistantText.trim());
      if (final) {
        this.postEvent("output.transcript", "OpenAI Realtime completó la respuesta hablada",
          { role: "assistant", text: this.currentAssistantText.trim() });
        this.playExternalTextIfNeeded();
      }
    }

    outputMode() {
      return this.session?.atlasOutput || "native";
    }

    usesExternalTts() {
      return ["browser", "elevenlabs"].includes(this.outputMode());
    }

    playExternalTextIfNeeded() {
      const text = this.currentAssistantText.trim();
      if (!this.usesExternalTts() || !text || this.externalPlaybackText === text) return;
      this.externalPlaybackText = text;
      this.externalPlaybackActive = true;
      this.callbacks.setScreen?.("HABLANDO", "ATLAS está hablando",
        this.outputMode() === "elevenlabs"
          ? "ElevenLabs está reproduciendo la respuesta."
          : "La voz del navegador está reproduciendo la respuesta.",
        "speaking");
      Promise.resolve(this.callbacks.playExternalText?.(text, this.outputMode()))
        .catch((error) => {
          this.callbacks.addLog?.(`La voz externa falló: ${error?.message || error}`, null, "error");
        })
        .finally(() => {
          this.externalPlaybackActive = false;
          this.flushPendingToolResponse();
          if (this.responseFinalized) this.scheduleFollowUp();
        });
    }

    bufferTool(event) {
      const key = event.item_id || "unknown";
      const existing = this.toolBuffers.get(key) || {
        name: event.name || "", callId: event.call_id || "", args: "",
      };
      existing.args += event.delta || "";
      this.toolBuffers.set(key, existing);
    }

    async handleTool(event) {
      const key = event.item_id || "unknown";
      const buffered = this.toolBuffers.get(key) || {};
      this.toolBuffers.delete(key);
      const name = buffered.name || event.name || "";
      const callId = buffered.callId || event.call_id || "";
      const args = parseToolArguments(buffered.args || event.arguments || "{}");
      if (!callId) return;
      if (name === "openclaw_agent_control") {
        const mode = String(args.mode || "status");
        if (mode === "cancel") this.interruptWork();
        this.submitToolResult(callId, { ok: true, mode, message: "Control aplicado por ATLAS WebScreen." });
        return;
      }
      if (name !== "atlas_shell") {
        this.submitToolResult(callId, { error: `Herramienta Realtime no disponible: ${name}` });
        return;
      }
      this.toolActive = true;
      this.callbacks.setScreen?.("SHELL", "ATLAS está actuando", "Consultando el sistema directamente.", "working");
      this.callbacks.addLog?.("OpenAI Realtime ejecuta una acción directa en la shell");
      this.postEvent("shell.started", "OpenAI Realtime ejecuta una orden en la shell",
        { text: String(args.command || "") });
      this.consultController = new AbortController();
      const started = performance.now();
      try {
        const response = await this.fetch("/api/realtime/shell", {
          method: "POST", cache: "no-store", signal: this.consultController.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            args, requestId: this.currentRequestId || requestId(),
            interactionId: this.currentInteractionId || requestId(),
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `La shell respondió con HTTP ${response.status}`);
        }
        const result = await response.json();
        this.postEvent("shell.completed", "La shell devolvió su resultado",
          { durationMs: performance.now() - started, text: String(result.output || "") });
        this.submitToolResult(callId, result);
      } catch (error) {
        const aborted = error?.name === "AbortError";
        this.submitToolResult(callId, aborted
          ? { status: "cancelled", message: "La persona interrumpió el trabajo." }
          : { error: error.message || String(error) });
        if (!aborted) this.callbacks.addLog?.(`Shell fallida: ${error.message}`, null, "error");
      } finally {
        this.toolActive = false;
        this.consultController = null;
      }
    }

    submitToolResult(callId, result) {
      this.send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) },
      });
      this.requestToolContinuation();
    }

    requestToolContinuation() {
      if (this.closed || this.turnInputPending) return;
      if (this.externalPlaybackActive || this.nativePlaybackActive) {
        this.pendingToolResponse = true;
        this.callbacks.addLog?.("La respuesta final espera al final real del audio");
        this.postEvent("tool.continuation_wait", "La respuesta final espera al final real del búfer de audio");
        return;
      }
      this.send({ type: "response.create" });
    }

    flushPendingToolResponse() {
      if (!this.pendingToolResponse || this.closed || this.turnInputPending
          || this.externalPlaybackActive || this.nativePlaybackActive) return;
      this.pendingToolResponse = false;
      this.send({ type: "response.create" });
    }

    clearPendingToolResponse() {
      this.pendingToolResponse = false;
    }

    finishResponse(event) {
      this.responseActive = false;
      this.responseFinalized = true;
      const status = event.response?.status || (event.type === "response.cancelled" ? "cancelled" : "completed");
      this.postEvent("response.done", "OpenAI Realtime cerró el turno", { status,
        durationMs: this.responseStartedAt ? performance.now() - this.responseStartedAt : undefined });
      if (!this.conversationActive || this.toolActive || this.externalPlaybackActive
          || this.nativePlaybackActive || this.turnInputPending) return;
      this.scheduleFollowUp();
    }

    scheduleFollowUp() {
      if (!this.conversationActive || this.toolActive || this.responseActive
          || this.externalPlaybackActive || this.nativePlaybackActive
          || this.turnInputPending || this.pendingToolResponse) return;
      this.callbacks.setScreen?.("CONVERSACIÓN", "Puedes seguir hablando", "No necesitas volver a decir ATLAS durante diez segundos.", "listening");
      window.clearTimeout(this.followUpTimer);
      this.followUpTimer = window.setTimeout(() => {
        if (this.responseActive || this.toolActive) return;
        this.conversationActive = false;
        this.setOutputEnabled(false);
        this.showWaiting();
      }, FOLLOW_UP_IDLE_MS);
    }

    interruptWork() {
      this.cancelProviderResponse();
      this.interruptLocalWork();
      this.clearPendingToolResponse();
      this.responseActive = false;
      this.toolActive = false;
      this.callbacks.addLog?.("Respuesta anterior interrumpida; ATLAS sigue escuchando");
    }

    interruptLocalWork() {
      this.callbacks.stopExternalSpeech?.();
      if (this.consultController) this.consultController.abort();
      if (this.currentRequestId) {
        void this.fetch("/api/cancel", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: this.currentRequestId }),
        }).catch(() => {});
      }
      this.externalPlaybackActive = false;
    }

    cancelProviderResponse() {
      const responseWasActive = this.responseActive;
      const playbackWasActive = this.nativePlaybackActive;
      // A response.done event can arrive before Chrome has finished playing
      // the already-buffered WebRTC audio. Cancelling the model is only valid
      // while it is generating, but clearing the speaker buffer is still
      // required while playback remains active.
      if (responseWasActive) this.send({ type: "response.cancel" });
      if (responseWasActive || playbackWasActive) {
        this.send({ type: "output_audio_buffer.clear" });
      }
      this.responseActive = false;
      this.nativePlaybackActive = false;
    }

    deleteInputItem() {
      if (this.currentInputItemId) {
        this.send({ type: "conversation.item.delete", item_id: this.currentInputItemId });
      }
    }

    cancel() {
      this.interruptWork();
      this.conversationActive = false;
      this.setOutputEnabled(false);
      this.showWaiting();
    }

    showWaiting() {
      if (this.closed || this.state !== "ready") return;
      this.callbacks.setScreen?.("EN ESPERA", "Esperando a ATLAS", "Di “ATLAS” para iniciar una conversación Realtime.", "idle");
      this.callbacks.onWaiting?.();
    }

    postEvent(stage, message, extra = {}) {
      if (!this.currentInteractionId && stage !== "session.ready") return;
      const interactionId = this.currentInteractionId || requestId();
      void this.fetch("/api/realtime/event", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId, stage, message, model: MODEL,
          voice: this.session?.voice || DEFAULT_VOICE, ...extra }),
      }).catch(() => {});
    }

    fail(error) {
      if (this.closed) return;
      this.callbacks.addLog?.(error.message || String(error), null, "error");
      this.callbacks.setScreen?.("ERROR REALTIME", "OpenAI Realtime se ha desconectado",
        "La ruta legacy sigue disponible como respaldo.", "error");
      this.postEvent("session.error", "Falló la sesión OpenAI Realtime", { status: error.message || String(error) });
      this.stop(false);
      this.callbacks.onFallback?.(error);
    }

    stop(notify = true) {
      window.clearTimeout(this.followUpTimer);
      window.clearTimeout(this.inputPendingTimer);
      this.clearPendingToolResponse();
      window.clearTimeout(this.configurationTimer);
      this.configurationTimer = 0;
      this.consultController?.abort();
      this.consultController = null;
      this.callbacks.stopExternalSpeech?.();
      this.closed = true;
      this.state = "idle";
      this.conversationActive = false;
      this.responseActive = false;
      this.externalPlaybackActive = false;
      this.nativePlaybackActive = false;
      this.turnInputPending = false;
      this.speechOverActiveOutput = false;
      this.toolActive = false;
      this.channel?.close();
      this.channel = null;
      this.peer?.close();
      this.peer = null;
      this.media?.getTracks().forEach((track) => track.stop());
      this.media = null;
      if (this.remoteAudio) {
        this.remoteAudio.pause();
        this.remoteAudio.srcObject = null;
        this.remoteAudio.muted = true;
      }
      this.remoteAudio = null;
      this.toolBuffers.clear();
      if (notify) this.callbacks.onStopped?.();
    }
  }

  window.AtlasRealtime = {
    create(options) { return new RealtimeController(options); },
    model: MODEL,
    voice: DEFAULT_VOICE,
    _test: { normalized, wakeInvocation, silenceInvocation, withTurnSeparator },
  };
})();
