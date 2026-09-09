#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
global.window = {
  location: { search: "" },
  clearTimeout() {},
  setTimeout() { return 1; },
};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "static", "realtime.js"), "utf8"), {
  filename: "realtime.js",
});

const tools = window.AtlasRealtime._test.realtimeTools;
assert.equal(tools.filter((tool) => tool.name === "atlas_phone").length, 1);
assert.equal(tools.filter((tool) => tool.name === "atlas_android").length, 1);
assert.equal(tools.filter((tool) => tool.name === "atlas_actions").length, 1);
assert.ok(window.AtlasRealtime._test.phoneTool.parameters.properties.operation.enum.includes("get_location"));
assert.ok(window.AtlasRealtime._test.androidTool.parameters.properties.operation.enum.includes("androiduse.screenshot"));
assert.ok(window.AtlasRealtime._test.androidTool.parameters.properties.operation.enum.includes("androiduse.key"));
assert.ok(window.AtlasRealtime._test.androidTool.parameters.properties.operation.enum.includes("androiduse.click"));
assert.ok(window.AtlasRealtime._test.androidTool.parameters.properties.operation.enum.includes("androiduse.batch"));
assert.ok(window.AtlasRealtime._test.androidTool.parameters.properties.operation.enum.includes("androiduse.wait_for"));
assert.equal(window.AtlasRealtime._test.actionsTool.parameters.properties.actions.maxItems, 8);
assert.match(window.AtlasRealtime._test.androidInstructions, /Prioriza siempre atlas_phone/u);
assert.match(window.AtlasRealtime._test.androidInstructions, /androiduse\.stop/u);
assert.match(window.AtlasRealtime._test.androidInstructions, /coordenadas normalizadas/u);
assert.match(window.AtlasRealtime._test.androidInstructions, /formattedAddress/u);
assert.match(window.AtlasRealtime._test.androidInstructions, /Amazon Shopping/u);
assert.match(window.AtlasRealtime._test.androidInstructions, /fallo recuperable/u);
const persistentInvocation = window.AtlasRealtime._test.persistentAndroidControlInvocation;
assert.equal(persistentInvocation("controla mi teléfono"), true);
assert.equal(persistentInvocation("Atlas, controla mi móvil."), true);
assert.equal(persistentInvocation("oye ATLAS controla mi telefono"), true);
assert.equal(persistentInvocation("controla mi teléfono y abre Ajustes"), false);
assert.equal(persistentInvocation("puedes controlar mi móvil"), false);

const controller = window.AtlasRealtime.create({});
const sent = [];
controller.channel = { readyState: "open", send: (value) => sent.push(JSON.parse(value)) };
controller.closed = false;
let continued = 0;
controller.requestToolContinuation = () => { continued += 1; };
const encoded = Buffer.from("fake-png").toString("base64");
controller.submitToolResultWithImage("call-1", {
  operation: "androiduse.tap",
  result: { ok: true },
  screenshot: { attached: true, width: 1080, height: 2400, mime: "image/png" },
}, { pngBase64: encoded, width: 1080, height: 2400 });

assert.equal(sent[0].item.type, "function_call_output");
assert.doesNotMatch(sent[0].item.output, new RegExp(encoded));
assert.equal(sent[1].item.type, "message");
assert.equal(sent[1].item.content[1].type, "input_image");
assert.equal(sent[1].item.content[1].image_url, `data:image/png;base64,${encoded}`);
assert.equal(continued, 1);

const jpeg = Buffer.from("\xff\xd8\xfffake-jpeg", "binary").toString("base64");
controller.submitToolResultWithImage("call-2", {
  operation: "androiduse.click", result: { ok: true },
}, { imageBase64: jpeg, width: 640, height: 1372, mime: "image/jpeg" });
assert.equal(sent[3].item.content[1].image_url, `data:image/jpeg;base64,${jpeg}`);
assert.equal(continued, 2);

const stopRequests = [];
controller.fetch = (url, options) => {
  stopRequests.push({ url, body: JSON.parse(options.body) });
  return Promise.resolve({ text: async () => "" });
};
controller.androidControlActive = true;
controller.stopAndroidControlSilently();
controller.stopAndroidControlSilently();
assert.equal(stopRequests.length, 1);
assert.equal(stopRequests[0].url, "/api/realtime/android");
assert.equal(stopRequests[0].body.args.operation, "androiduse.stop");
assert.equal(controller.androidControlActive, false);

(async () => {
  const retained = window.AtlasRealtime.create({});
  retained.closed = false;
  retained.conversationActive = true;
  retained.androidControlActive = true;
  let retainedStops = 0;
  let returnedToWake = 0;
  retained.stopAndroidControlSilently = () => { retainedStops += 1; };
  retained.returnToWake = () => { returnedToWake += 1; };
  assert.equal(retained.rememberPersistentAndroidControlIntent("Atlas, controla mi móvil"), true);
  retained.settleAfterResponse();
  assert.equal(retainedStops, 0,
    "the exact explicit-control turn must not auto-stop Android Use when its response settles");
  assert.equal(returnedToWake, 1);
  assert.equal(retained.androidControlPersistent, true);
  retained.conversationActive = true;
  retained.androidControlPersistent = false;
  retained.settleAfterResponse();
  assert.equal(retainedStops, 1, "ordinary visual tasks must retain end-of-turn cleanup");

  const serialized = window.AtlasRealtime.create({});
  serialized.closed = false;
  serialized.channel = { readyState: "open", send() {} };
  serialized.postEvent = () => {};
  serialized.requestToolContinuation = () => {};
  serialized.androidControlActive = true;
  serialized.androidControlPersistent = true;
  const serializedCalls = [];
  let releaseStop;
  serialized.fetch = (url, options) => {
    const operation = JSON.parse(options.body).args.operation;
    serializedCalls.push(operation);
    if (operation === "androiduse.stop") {
      return new Promise((resolve) => { releaseStop = resolve; });
    }
    return Promise.resolve({ ok: true, json: async () => ({ result: { ok: true } }) });
  };
  const firstStop = serialized.stopAndroidControlSilently();
  const duplicateStop = serialized.stopAndroidControlSilently(true);
  assert.equal(firstStop, duplicateStop, "concurrent stops must share one acknowledgement promise");
  assert.equal(serialized.androidControlPersistent, false,
    "an explicit stop/cancel/close path must clear persistent control mode");
  const start = serialized.handleDeviceTool("atlas_android", "call-serialized-start", {
    operation: "androiduse.start", params: {}, inspectAfter: false,
  });
  await Promise.resolve();
  assert.deepEqual(serializedCalls, ["androiduse.stop"],
    "a new start must wait until the previous stop acknowledgement settles");
  releaseStop({ text: async () => "" });
  await firstStop;
  await start;
  assert.deepEqual(serializedCalls, ["androiduse.stop", "androiduse.start"]);
  assert.equal(serialized.androidControlActive, true);

  const recoverable = window.AtlasRealtime.create({});
  recoverable.closed = false;
  recoverable.androidControlActive = true;
  recoverable.channel = { readyState: "open", send() {} };
  recoverable.requestToolContinuation = () => {};
  let stops = 0;
  recoverable.stopAndroidControlSilently = () => { stops += 1; };
  recoverable.fetch = () => {
    const error = new Error("La captura agotó su plazo");
    error.name = "AbortError";
    return Promise.reject(error);
  };
  await recoverable.handleDeviceTool("atlas_android", "call-timeout", {
    operation: "androiduse.screenshot", params: {},
  });
  assert.equal(stops, 0,
    "a timed-out capture must not tear down an otherwise healthy Android Use session");
  assert.equal(recoverable.androidControlActive, true);

  const batched = window.AtlasRealtime.create({});
  batched.closed = false;
  batched.channel = { readyState: "open", send: (value) => batchSent.push(JSON.parse(value)) };
  batched.postEvent = () => {};
  batched.requestToolContinuation = () => { batchContinued += 1; };
  const batchSent = [];
  const batchRequests = [];
  let batchContinued = 0;
  batched.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    batchRequests.push({ url, body });
    if (url.endsWith("/phone")) {
      return { ok: true, json: async () => ({ operation: "apps.launch", result: { ok: true } }) };
    }
    return { ok: true, json: async () => ({
      operation: "androiduse.batch", result: { ok: true, controlling: false },
      screenshot: { imageBase64: jpeg, width: 640, height: 1372, mime: "image/jpeg" },
    }) };
  };
  await batched.handleActionsTool("call-batch", { actions: [
    { tool: "phone", operation: "apps.launch", params: { app: "Amazon" } },
    { tool: "android", operation: "androiduse.batch", params: { actions: [
      { action: "click", params: { text: "Buscar", timeoutMs: 3500 } },
      { action: "text", params: { text: "ESP32" } },
    ] } },
  ] });
  assert.deepEqual(batchRequests.map((item) => item.url), [
    "/api/realtime/phone", "/api/realtime/android",
  ]);
  assert.equal(batchRequests[1].body.args.inspectAfter, true);
  assert.equal(batchSent[0].item.type, "function_call_output");
  assert.equal(JSON.parse(batchSent[0].item.output).completed, 2);
  assert.equal(batchSent[1].item.content[1].type, "input_image");
  assert.equal(batchContinued, 1);
  console.log("android Realtime tool tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
