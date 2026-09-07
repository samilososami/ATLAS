const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function controller() {
  const window = { setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, "utf8"), {
    window, AbortController, performance, crypto: { randomUUID: () => "test-id" },
  });
  const c = window.AtlasRealtime.create({ fetch: async () => ({ ok: true, json: async () => ({ matched: false }) }) });
  c.closed = false;
  c.state = "ready";
  c.localWakeFallbackText = "qué hora es";
  c.routineTriggers = new Set(["que hora es"]);
  c.localWakeRequestPending = true;
  c.clearLocalWakeFallback = () => { c.localWakeRequestPending = false; };
  c.clearLocalWakeAuthorization = () => {};
  c.beginFaceTurn = () => {};
  c.postEvent = () => {};
  c.send = () => true;
  return c;
}

test("browser and terminal expose the same routine tool", () => {
  const source = fs.readFileSync(`${__dirname}/static/realtime.js`, "utf8");
  assert.match(source, /name: "atlas_routine"/);
  assert.match(source, /"\/api\/realtime\/routine"/);
  assert.match(source, /"\/api\/routines\/execute"/);
});

test("an exact successful routine completes before response.create", async () => {
  const c = controller();
  const calls = [];
  c.checkDirectRoutine = async text => {
    calls.push(["check", text]);
    return { matched: true, ok: true, routineName: "Hora", spokenText: "Son las diez" };
  };
  c.completeDirectRoutine = async (text, result) => calls.push(["complete", text, result.routineName]);
  c.createResponse = () => calls.push(["model"]);
  await c.submitLocalWakeRequest();
  assert.deepEqual(calls, [["check", "qué hora es"], ["complete", "qué hora es", "Hora"]]);
});

test("a failed routine tells Realtime not to replay it", async () => {
  const c = controller();
  const sent = [];
  c.checkDirectRoutine = async () => ({
    matched: true, ok: false, routineName: "Tele", executionId: "a".repeat(32),
  });
  c.send = payload => { sent.push(payload); return true; };
  c.createResponse = () => sent.push({ type: "response.create" });
  await c.submitLocalWakeRequest();
  const item = sent.find(value => value.type === "conversation.item.create");
  assert.match(item.item.content[0].text, /No repitas la acción/);
  assert.match(item.item.content[0].text, /execution_id=aaaaaaaa/);
  assert.equal(sent.filter(value => value.type === "response.create").length, 1);
});
