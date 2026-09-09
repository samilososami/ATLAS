#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname,
  "app/src/main/assets/web/realtime.js"), "utf8");
const activitySource = fs.readFileSync(path.join(__dirname,
  "app/src/main/java/dev/atlas/a1/MainActivity.java"), "utf8");

assert.match(source, /coordenadas son normalizadas entre 0 y 1/,
  "the Android tool description must require normalized coordinates");
assert.match(source, /No uses coordenadas en píxeles/,
  "the session policy must explicitly reject pixel coordinates");
assert.match(source, /\['click','tap','long_press'[\s\S]*'wait_for'\]/,
  "semantic clicks must receive the same post-action inspection as gestures");
assert.match(source, /name:'atlas_actions'/,
  "Realtime must expose the cross-surface action-plan tool");
assert.match(source, /'wait_for','batch'/,
  "Realtime must expose local wait and batch Android operations");
assert.match(source, /delete params\.autoStart;delete params\.autoStop/,
  "the model must not be able to override batch lifecycle ownership");
assert.match(source, /androidControlActive=false/,
  "Realtime must track whether Android Use is active");
assert.doesNotMatch(source, /const androidStop=this\.stopAndroidControlSilently\(true\)/,
  "closing or renewing Realtime must preserve explicit Android Use");
assert.doesNotMatch(source,
  /\['failed','closed'\][^}]*this\.stopAndroidControlSilently\(\)/,
  "peer failures must not stop Android Use");
assert.doesNotMatch(source,
  /dc\.onclose=[^;]*this\.stopAndroidControlSilently\(\)/,
  "data-channel renewal must not stop Android Use");
assert.match(source, /sdp:offer\.sdp,session:initialSession/,
  "the large initial configuration must travel with the HTTP offer");
assert.match(source, /case'session\.created':case'session\.updated'/,
  "the app must accept the initial configured session event");
assert.match(source, /session\.created absent; using open data channel/,
  "an accepted open data channel must prevent reconnect loops when session.created is omitted");
assert.match(source, /dc\.readyState==='open'&&!\['failed','closed'\]\.includes\(pc\.connectionState\)/,
  "the Realtime readiness fallback must only accept a healthy open channel");
assert.doesNotMatch(source, /this\.send\(\{type:'session\.update',session:s\}\)/,
  "the private context must never be sent as one data-channel frame");
assert.match(activitySource, /new MultipartBody\.Builder\(\)\.setType\(MultipartBody\.FORM\)/,
  "the native offer bridge must upload SDP and initial session as multipart");
assert.match(source,
  /action==='start'&&this\.androidStopPromise\)await this\.androidStopPromise/,
  "a new Android Use start must wait for an earlier stop to settle");
assert.doesNotMatch(source,
  /case'error':[^{]*\{this\.stopAndroidControlSilently\(\)/,
  "generic Realtime provider errors must not stop Android Use");
assert.doesNotMatch(source,
  /\['failed','incomplete'\][^}]*this\.stopAndroidControlSilently\(\)/,
  "failed or incomplete model responses must not stop Android Use");
assert.doesNotMatch(activitySource, /case "realtimeWarmup":\s*event\("realtimeState"/,
  "native warmup must not overwrite the WebRTC-owned connection indicator");
assert.match(source, /async background\(\)\{this\.holding=false;await this\.close\(true\);\}/,
  "backgrounding must release costly WebRTC while preserving Android Use and the A1 link");
assert.match(source, /launchNeedsVisualContinuation/,
  "compound app launches must be recognized for visual continuation");
assert.match(activitySource, /web\.pauseTimers\(\)/,
  "the hidden Activity must suspend WebView timers");
assert.match(activitySource, /RENDERER_PRIORITY_WAIVED/,
  "the hidden Activity must make the WebView renderer reclaimable");
assert.match(activitySource, /agentRuntimeHeld/,
  "compound Android Use must be able to keep the model runtime alive in background");
assert.match(activitySource, /case "runtime\.hold"/,
  "JavaScript must expose a bounded native runtime lease");

function node() {
  return {
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    dataset: {},
    replaceChildren() {},
    setAttribute() {},
    append() {},
    remove() {},
    scrollTo() {},
    setPointerCapture() {},
    textContent: "",
    style: {},
    value: "default",
    scrollHeight: 0,
    scrollTop: 0,
  };
}

const nodes = new Map();
const nativeCalls = [];
let nativeHandler = () => Promise.resolve({});
const context = vm.createContext({
  window: {},
  document: { hidden: false, addEventListener() {} },
  Audio: class Audio { constructor() { this.srcObject = null; } play() { return Promise.resolve(); } },
  native(method, params) {
    nativeCalls.push({ method, params });
    return nativeHandler(method, params);
  },
  $(selector) {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  },
  $$(selector) { return selector === ".sound i" ? [] : []; },
  icon() { return node(); },
  bubble() { return node(); },
  thinkingBubble() { return node(); },
  rotateChatPlaceholder() {},
  safe(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(() => {}); },
  toast() {},
  queueMicrotask() {},
  setTimeout(callback) { callback(); return 1; },
  clearTimeout() {},
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  btoa() { return ""; },
  console,
});
vm.runInContext(source, context, { filename: "realtime.js" });
const voice = context.window.voice;

(async () => {
  nativeCalls.length = 0;
  let captures = 0;
  nativeHandler = (method) => {
    if (method !== "android.control") return Promise.resolve({});
    captures += 1;
    if (captures === 1) return Promise.reject(new Error("No se pudo capturar la pantalla (3)"));
    return Promise.resolve({ mime: "image/png", pngBase64: "YWJj", width: 10, height: 20 });
  };
  const screenshot = await voice.captureAndroidScreenshot();
  assert.equal(screenshot.mime, "image/png");
  assert.equal(captures, 2, "code 3 must cause exactly one retry");

  nativeCalls.length = 0;
  captures = 0;
  nativeHandler = () => {
    captures += 1;
    return Promise.reject(new Error("permission_required: ACCESSIBILITY_SERVICE"));
  };
  await assert.rejects(() => voice.captureAndroidScreenshot(), /permission_required/);
  assert.equal(captures, 1, "unrelated screenshot errors must not retry");

  nativeCalls.length = 0;
  const sent = [];
  voice.ready = true;
  voice.send = (event) => sent.push(event);
  nativeHandler = (_method, params) => {
    if (params.method === "androiduse.start") return Promise.resolve({ ok: true });
    if (params.method === "androiduse.stop") return Promise.resolve({ ok: true });
    return Promise.resolve({});
  };
  await voice.tool({
    name: "atlas_android",
    arguments: JSON.stringify({ action: "start" }),
    call_id: "call-test",
  });
  await Promise.resolve();
  assert.equal(voice.androidControlActive, true,
    "a successful explicit start must retain tracked Android control state");
  assert.equal(nativeCalls.some(({ params }) => params.method === "androiduse.tree"), false,
    "start must not trigger an unsolicited accessibility inspection");
  assert.equal(nativeCalls.filter(({ params }) =>
    params.method === "androiduse.stop").length, 0,
  "start must not immediately stop the explicit Android Use session");
  assert.deepEqual(sent.map((event) => event.type),
    ["conversation.item.create", "response.create"],
  "cleanup must preserve the function output and response chaining");
  assert.equal(sent[0].item.type, "function_call_output");
  assert.equal(sent[0].item.call_id, "call-test");

  nativeCalls.length = 0;
  sent.length = 0;
  nativeHandler = (_method, params) => {
    if (params.method === "androiduse.click") {
      return Promise.reject(new Error("El teléfono no respondió a tiempo"));
    }
    if (params.method === "androiduse.stop") return Promise.resolve({ ok: true });
    return Promise.resolve({});
  };
  await voice.tool({
    name: "atlas_android",
    arguments: JSON.stringify({ action: "click", params: { text: "Buscar" } }),
    call_id: "call-recoverable",
  });
  assert.equal(voice.androidControlActive, true,
    "a recoverable semantic-click miss must preserve the explicit session");
  assert.equal(nativeCalls.some(({ params }) => params.method === "androiduse.stop"), false,
    "a recoverable action error must not issue androiduse.stop");
  assert.match(sent[0].item.output, /no respondió a tiempo/);

  nativeCalls.length = 0;
  sent.length = 0;
  nativeHandler = (_method, params) => {
    if (params.method === "androiduse.home") return Promise.resolve({ ok: true });
    if (params.method === "androiduse.tree") {
      return Promise.reject(new Error("No hay una ventana activa"));
    }
    if (params.method === "androiduse.stop") return Promise.resolve({ ok: true });
    return Promise.resolve({});
  };
  await voice.tool({
    name: "atlas_android",
    arguments: JSON.stringify({ action: "home" }),
    call_id: "call-inspection",
  });
  assert.equal(voice.androidControlActive, true,
    "a failed inspection after a completed action must preserve the session");
  assert.match(sent[0].item.output, /inspectionError/,
    "the completed action must be returned with its inspection error");
  assert.equal(nativeCalls.some(({ params }) => params.method === "androiduse.stop"), false);

  nativeCalls.length = 0;
  voice.androidControlActive = true;
  voice.turn = "";
  voice.response = "";
  voice.event({
    type: "error",
    error: { code: "provider_error", message: "OpenAI Realtime falló" },
  });
  voice.event({
    type: "response.done",
    response: { status: "failed", status_details: { error: { message: "Respuesta fallida" } } },
  });
  voice.event({
    type: "response.done",
    response: { status: "incomplete", status_details: {} },
  });
  assert.equal(voice.androidControlActive, true,
    "provider and response failures must preserve explicit Android control");
  assert.equal(nativeCalls.some(({ params }) => params?.method === "androiduse.stop"), false,
    "provider and response failures must not issue androiduse.stop");

  nativeCalls.length = 0;
  sent.length = 0;
  nativeHandler = (_method, params) => {
    if (params.method === "androiduse.click") {
      return Promise.reject(new Error("Android device not connected"));
    }
    if (params.method === "androiduse.stop") return Promise.resolve({ ok: true });
    return Promise.resolve({});
  };
  await voice.tool({
    name: "atlas_android",
    arguments: JSON.stringify({ action: "click", params: { text: "Buscar" } }),
    call_id: "call-terminal",
  });
  await Promise.resolve();
  assert.equal(voice.androidControlActive, false,
    "a terminal Android transport failure must still clear the session");
  assert.equal(nativeCalls.filter(({ params }) =>
    params?.method === "androiduse.stop").length, 1,
  "terminal Android failures must still issue one stop");

  let releaseStop;
  const pendingStop = new Promise((resolve) => { releaseStop = resolve; });
  voice.androidStopPromise = pendingStop;
  nativeCalls.length = 0;
  sent.length = 0;
  nativeHandler = (_method, params) => Promise.resolve(
    params.method === "androiduse.start" ? { ok: true } : {},
  );
  const starting = voice.tool({
    name: "atlas_android",
    arguments: JSON.stringify({ action: "start" }),
    call_id: "call-after-stop",
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(nativeCalls.some(({ params }) => params?.method === "androiduse.start"), false,
    "start must not overtake a pending stop");
  releaseStop();
  await starting;
  assert.equal(nativeCalls.filter(({ params }) =>
    params?.method === "androiduse.start").length, 1,
  "start must run once after the pending stop settles");
  voice.androidStopPromise = null;
  assert.equal(voice.androidControlActive, true);

  nativeCalls.length = 0;
  sent.length = 0;
  voice.turn = "Abre Amazon y busca ESP32";
  nativeHandler = (_method, params) => Promise.resolve(
    params.method === "apps.launch" ? { ok: true, launched: true } : {},
  );
  await voice.tool({
    name: "atlas_phone",
    arguments: JSON.stringify({ method: "apps.launch", params: { app: "Amazon" } }),
    call_id: "call-compound-launch",
  });
  assert.deepEqual(nativeCalls.map(({ method, params }) =>
    method === "runtime.hold" ? "runtime.hold" : params.method),
    ["apps.launch"],
    "a legacy compound launch must not start the old inspect-after-every-step loop");
  assert.match(sent[0].item.output, /"taskComplete":false/,
    "the fallback must still say that merely opening the app did not complete the request");
  assert.equal(sent.filter((item) => item.item?.type === "message").length, 0,
    "the fallback must not waste a screenshot before the model provides a batch");

  nativeCalls.length = 0;
  sent.length = 0;
  nativeHandler = (_method, params) => {
    if (params.method === "apps.launch") return Promise.resolve({ ok: true, launched: true });
    if (params.method === "androiduse.batch") {
      assert.equal(params.params.autoStart, undefined);
      assert.equal(params.params.autoStop, undefined);
      return Promise.resolve({
        ok: true, controlling: false, mime: "image/jpeg", imageBase64: "YWJj",
        width: 640, height: 1200,
      });
    }
    return Promise.resolve({ ok: true });
  };
  await voice.tool({
    name: "atlas_actions",
    arguments: JSON.stringify({ actions: [
      { tool: "phone", operation: "apps.launch", params: { app: "Amazon" } },
      { tool: "android", operation: "androiduse.batch", params: {
        autoStart: false, autoStop: false,
        actions: [
          { action: "click", params: { candidates: ["Buscar", "Search"] } },
          { action: "text", params: { text: "ESP32" } },
          { action: "key", params: { key: "enter" } },
        ],
      } },
    ] }),
    call_id: "call-action-plan",
  });
  assert.deepEqual(nativeCalls.map(({ method, params }) =>
    method === "runtime.hold" ? "runtime.hold" : params.method),
    ["apps.launch", "runtime.hold", "androiduse.batch"],
    "the complete app task must execute as one ordered plan without intermediate inspection");
  assert.equal(sent[0].item.type, "function_call_output");
  assert.match(sent[0].item.output, /"completed":2/);
  assert.equal(sent[1].item.content[1].type, "input_image",
    "the action plan must attach exactly one final verification image");

  console.log("Realtime Android bridge contracts passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
