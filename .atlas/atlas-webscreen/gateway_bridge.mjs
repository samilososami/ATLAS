#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import readline from "node:readline";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const HOME_DIR = process.env.HOME || "/home/atlas";
const CONFIG_PATH = process.env.OPENCLAW_CONFIG || `${HOME_DIR}/.openclaw/openclaw.json`;

async function loadGatewayClient() {
  const candidates = [
    process.env.OPENCLAW_GATEWAY_RUNTIME,
    "/usr/local/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js",
    `${HOME_DIR}/.npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js`,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const module = await import(pathToFileURL(candidate).href);
    if (module.GatewayClient) return module.GatewayClient;
  }
  throw new Error("OpenClaw Gateway runtime not found");
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function compact(value, limit = 20000) {
  const text = String(value ?? "");
  return text.length <= limit ? text : `${text.slice(0, limit)}\n[truncated ${text.length - limit} chars]`;
}

function extractText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.output === "string") return value.output;
    if (typeof value.content === "string") return value.content;
    if (Array.isArray(value.content)) return extractText(value.content);
    if (typeof value.result === "string") return value.result;
    if (typeof value.partialResult === "string") return value.partialResult;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function gatewaySettings() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const port = Number(config.gateway?.port || 18789);
  const token = config.gateway?.auth?.token;
  const password = config.gateway?.auth?.password;
  if (!token && !password && config.gateway?.auth?.mode !== "none") {
    throw new Error("gateway credentials are not configured");
  }
  return { url: `ws://127.0.0.1:${port}`, token, password };
}

const GatewayClient = await loadGatewayClient();
const gateway = gatewaySettings();
const runsById = new Map();
const runsByRequest = new Map();
const subscribedSessions = new Set();
const configuredSessions = new Map();
let subscribedGlobally = false;
let connected = false;
let helloProtocol = null;
let resolveConnected;
let rejectConnected;
let connectedPromise = new Promise((resolve, reject) => {
  resolveConnected = resolve;
  rejectConnected = reject;
});

function requestEvent(state, payload) {
  emit({ bridgeRequestId: state.bridgeRequestId, ...payload });
}

function clearRun(state) {
  if (state.timeout) clearTimeout(state.timeout);
  runsByRequest.delete(state.bridgeRequestId);
  for (const [key, value] of runsById.entries()) {
    if (value === state) runsById.delete(key);
  }
}

function failRun(state, error) {
  if (!state || state.terminal) return;
  state.terminal = true;
  requestEvent(state, { type: "error", message: error instanceof Error ? error.message : String(error) });
  clearRun(state);
}

function finishRun(state, payload) {
  if (!state || state.terminal) return;
  state.terminal = true;
  requestEvent(state, payload);
  clearRun(state);
}

function handleGatewayEvent(event) {
  const payload = event?.payload;
  const state = payload?.runId ? runsById.get(payload.runId) : null;
  if (!state) return;

  if (event.event === "chat") {
    if (payload.state === "delta") {
      requestEvent(state, {
        type: "delta",
        text: String(payload.deltaText || ""),
        replace: payload.replace === true,
        seq: payload.seq,
      });
    } else if (payload.state === "final") {
      finishRun(state, { type: "final", stopReason: payload.stopReason || null });
    } else if (payload.state === "error" || payload.state === "aborted") {
      failRun(state, new Error(payload.errorMessage || `agent run ${payload.state}`));
    }
    return;
  }

  if (event.event !== "agent" && event.event !== "session.tool") return;
  const data = payload.data;
  if (payload.stream === "item" && data?.kind === "preamble" && data?.progressText?.trim()) {
    requestEvent(state, { type: "preamble", text: data.progressText.trim(), itemId: data.itemId || null });
    return;
  }
  if (payload.stream === "item" && (data?.kind === "tool" || data?.kind === "command")) {
    requestEvent(state, {
      type: "tool", phase: data.phase || null, kind: data.kind || null,
      title: data.title || null, name: data.name || null, status: data.status || null,
      itemId: data.itemId || null, toolCallId: data.toolCallId || null,
      meta: data.meta || null, progressText: data.progressText ? compact(data.progressText) : null,
    });
    return;
  }
  if (payload.stream === "command_output") {
    requestEvent(state, {
      type: "tool_output", source: event.event, phase: data?.phase || null,
      title: data?.title || null, name: data?.name || null, status: data?.status || null,
      itemId: data?.itemId || null, toolCallId: data?.toolCallId || null,
      output: compact(data?.output || ""), exitCode: data?.exitCode ?? null,
      durationMs: data?.durationMs ?? null, cwd: data?.cwd || null,
    });
    return;
  }
  if (payload.stream === "tool") {
    requestEvent(state, {
      type: "tool_output", source: event.event, phase: data?.phase || null,
      title: data?.title || data?.name || data?.kind || "tool", name: data?.name || null,
      status: data?.status || null, itemId: data?.itemId || null,
      toolCallId: data?.toolCallId || null,
      output: compact(extractText(data?.result ?? data?.partialResult ?? data?.output ?? data?.content ?? data?.text ?? "")),
      exitCode: data?.exitCode ?? null, durationMs: data?.durationMs ?? null, cwd: data?.cwd || null,
    });
    return;
  }
  requestEvent(state, {
    type: "activity", event: event.event,
    stream: payload.stream || payload.state || payload.phase || null,
    kind: data?.kind || null, phase: data?.phase || null,
  });
}

const client = new GatewayClient({
  url: gateway.url,
  token: gateway.token,
  password: gateway.password,
  clientName: "gateway-client",
  clientDisplayName: "ATLAS WebScreen Persistent Bridge",
  clientVersion: "3.3.0",
  platform: "linux",
  mode: "backend",
  role: "operator",
  scopes: ["operator.read", "operator.write", "operator.admin"],
  onEvent: handleGatewayEvent,
  onHelloOk: async (hello) => {
    connected = true;
    helloProtocol = hello.protocol;
    resolveConnected(hello);
    emit({ type: "bridge_ready", protocol: hello.protocol });
  },
  onConnectError: (error) => {
    if (!connected) rejectConnected(error);
    emit({ type: "bridge_status", state: "connect_error", message: String(error?.message || error) });
  },
  onReconnectPaused: (info) => {
    connected = false;
    emit({ type: "bridge_status", state: "reconnect_paused", message: info?.detailCode || "gateway reconnect paused" });
    for (const state of new Set(runsById.values())) failRun(state, new Error("Gateway desconectado"));
    connectedPromise = new Promise((resolve, reject) => {
      resolveConnected = resolve;
      rejectConnected = reject;
    });
  },
});

async function ensureSession(request) {
  const sessionKey = request.sessionKey;
  const agentId = request.agentId || "main";
  const label = request.label || `ATLAS WebScreen ${createHash("sha1").update(sessionKey).digest("hex").slice(0, 8)}`;
  const sessionIdentity = `${agentId}\u0000${sessionKey}`;
  const setupFingerprint = JSON.stringify({
    model: request.model || null,
    denyAllTools: request.denyAllTools === true,
  });
  const needsInitialSetup = configuredSessions.get(sessionIdentity) !== setupFingerprint;
  if (needsInitialSetup) {
    try {
      const createRequest = { key: sessionKey, agentId, label };
      if (request.model) createRequest.model = request.model;
      await client.request("sessions.create", createRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already in use|already exists|exists already/i.test(message)) throw error;
    }
  }
  if (request.resetBefore) {
    await client.request("sessions.reset", { key: sessionKey, agentId, reason: "reset" });
  }
  if (needsInitialSetup || request.resetBefore) {
    const patch = { key: sessionKey, agentId, verboseLevel: "full" };
    if (request.denyAllTools === true) patch.inheritedToolDeny = ["*"];
    try {
      await client.request("sessions.patch", patch);
    } catch (error) {
      if (request.denyAllTools === true) throw error;
      // Verbose mode is best effort on gateways without that preference.
    }
    configuredSessions.set(sessionIdentity, setupFingerprint);
  }
  if (!subscribedGlobally) {
    try {
      await client.request("sessions.subscribe", {});
      subscribedGlobally = true;
    } catch {
      // Agent events still provide the normal response stream.
    }
  }
  const subscriptionKey = sessionIdentity;
  if (!subscribedSessions.has(subscriptionKey)) {
    try {
      await client.request("sessions.messages.subscribe", { key: sessionKey, agentId });
      subscribedSessions.add(subscriptionKey);
    } catch {
      // Best effort only.
    }
  }
}

async function startRun(request) {
  if (!request.bridgeRequestId || !request.sessionKey || !request.message?.trim()) {
    throw new Error("invalid run request");
  }
  await connectedPromise;
  await ensureSession(request);
  const localRunId = randomUUID();
  const state = {
    bridgeRequestId: request.bridgeRequestId,
    sessionKey: request.sessionKey,
    agentId: request.agentId || "main",
    runId: localRunId,
    terminal: false,
    timeout: null,
  };
  runsByRequest.set(request.bridgeRequestId, state);
  runsById.set(localRunId, state);
  const timeoutMs = Number(request.timeoutMs || 180000);
  state.timeout = setTimeout(() => failRun(state, new Error("agent run timed out")), timeoutMs + 10000);
  try {
    const accepted = await client.request("chat.send", {
      sessionKey: state.sessionKey,
      agentId: state.agentId,
      message: request.message,
      thinking: request.thinking || "off",
      fastMode: request.fastMode ?? true,
      deliver: false,
      timeoutMs,
      idempotencyKey: localRunId,
    });
    const acceptedRunId = accepted?.runId || localRunId;
    state.runId = acceptedRunId;
    runsById.set(acceptedRunId, state);
    requestEvent(state, {
      type: "accepted", runId: acceptedRunId, protocol: helloProtocol,
      model: request.model || "OpenClaw default", agentId: state.agentId,
      toolsDenied: request.denyAllTools === true,
    });
  } catch (error) {
    failRun(state, error);
  }
}

async function cancelRun(request) {
  const state = runsByRequest.get(request.bridgeRequestId);
  if (!state || state.terminal) return;
  try {
    await client.request("sessions.abort", {
      key: state.sessionKey, runId: state.runId, agentId: state.agentId,
    });
  } catch (error) {
    failRun(state, error);
  }
}

async function injectMessage(request) {
  if (!request.bridgeRequestId || !request.sessionKey || !request.message?.trim()) {
    throw new Error("invalid inject request");
  }
  await connectedPromise;
  await ensureSession(request);
  const result = await client.request("chat.inject", {
    sessionKey: request.sessionKey,
    agentId: request.agentId || "main",
    message: request.message,
    label: request.label || "ATLAS WebScreen",
  });
  emit({
    bridgeRequestId: request.bridgeRequestId,
    type: "injected",
    messageId: result?.messageId || null,
  });
}

async function handleCommand(request) {
  try {
    if (request.command === "run") await startRun(request);
    else if (request.command === "cancel") await cancelRun(request);
    else if (request.command === "inject") await injectMessage(request);
    else if (request.command === "ping") emit({ type: "pong", nonce: request.nonce || null, connected });
    else throw new Error("unknown bridge command");
  } catch (error) {
    if (request.bridgeRequestId) {
      emit({ bridgeRequestId: request.bridgeRequestId, type: "error", message: error instanceof Error ? error.message : String(error) });
    } else {
      emit({ type: "bridge_error", message: error instanceof Error ? error.message : String(error) });
    }
  }
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  try { void handleCommand(JSON.parse(line)); }
  catch (error) { emit({ type: "bridge_error", message: error instanceof Error ? error.message : String(error) }); }
});

async function shutdown() {
  input.close();
  for (const state of new Set(runsById.values())) failRun(state, new Error("Bridge detenido"));
  try { await client.stopAndWait({ timeoutMs: 2000 }); } catch {}
  process.exit(0);
}

process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });
client.start();
