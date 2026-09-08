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
assert.ok(window.AtlasRealtime._test.phoneTool.parameters.properties.operation.enum.includes("get_location"));
assert.ok(window.AtlasRealtime._test.androidTool.parameters.properties.operation.enum.includes("androiduse.screenshot"));
assert.ok(window.AtlasRealtime._test.androidTool.parameters.properties.operation.enum.includes("androiduse.key"));
assert.match(window.AtlasRealtime._test.androidInstructions, /Prioriza siempre atlas_phone/u);
assert.match(window.AtlasRealtime._test.androidInstructions, /androiduse\.stop/u);
assert.match(window.AtlasRealtime._test.androidInstructions, /coordenadas normalizadas/u);

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

console.log("android Realtime tool tests passed");
