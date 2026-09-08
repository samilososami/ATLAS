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
  c.runtimeTest = window.AtlasRealtime._test;
  return c;
}

test("browser and terminal expose the same routine tool", () => {
  const source = fs.readFileSync(`${__dirname}/static/realtime.js`, "utf8");
  assert.match(source, /name: "atlas_routine"/);
  assert.match(source, /"\/api\/realtime\/routine"/);
  assert.match(source, /"\/api\/routines\/execute"/);
});

test("the realtime routine schema requires string triggers and requires_model", () => {
  const c = controller();
  const routine = c.runtimeTest.realtimeTools.find(tool => tool.name === "atlas_routine");
  const definition = routine.parameters.properties.routine;
  assert.equal(definition.type, "object");
  assert.equal(definition.properties.triggers.items.type, "string");
  assert.equal(definition.properties.requires_model.type, "boolean");
  assert.ok(definition.required.includes("requires_model"));
});

test("an exact successful routine completes before response.create", async () => {
  const c = controller();
  const calls = [];
  c.checkDirectRoutine = async text => {
    calls.push(["check", text]);
    return { matched: true, ok: true, requiresModel: false,
      routineName: "Hora", spokenText: "Son las diez" };
  };
  c.completeDirectRoutine = async (text, result) => calls.push(["complete", text, result.routineName]);
  c.createResponse = () => calls.push(["model"]);
  await c.submitLocalWakeRequest();
  assert.deepEqual(calls, [["check", "qué hora es"], ["complete", "qué hora es", "Hora"]]);
});

test("a successful routine marked requiresModel reaches Realtime without reexecution", async () => {
  const c = controller();
  const calls = [];
  const sent = [];
  c.checkDirectRoutine = async text => ({
    matched: true, ok: true, requiresModel: true, routineName: "Informe",
    executionId: "b".repeat(32), spokenText: "",
  });
  c.completeDirectRoutine = async () => calls.push("complete");
  c.send = payload => { sent.push(payload); return true; };
  c.createResponse = () => calls.push("model");
  await c.submitLocalWakeRequest();
  assert.deepEqual(calls, ["model"]);
  const item = sent.find(value => value.type === "conversation.item.create");
  assert.match(item.item.content[0].text, /requiere interpretación del modelo/);
  assert.match(item.item.content[0].text, /No repitas los pasos/);
  assert.match(item.item.content[0].text, /execution_id=bbbbbbbb/);
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

test("routine mutations replace the complete trigger cache", async () => {
  const c = controller();
  c.routineTriggers = new Set(["frase antigua", "otra obsoleta"]);
  c.postEvent = () => {};
  c.submitToolResult = () => {};
  const requests = [];
  c.fetch = async (_url, options) => {
    const args = JSON.parse(options.body).args;
    requests.push(args.action);
    if (args.action === "upsert") {
      return { ok: true, json: async () => ({ ok: true, routine: { id: "luz" } }) };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        routines: [
          { enabled: true, triggers: ["Nueva frase", "NUEVA   FRASE"] },
          { enabled: true, triggers: ["Apaga la luz"] },
          { enabled: false, triggers: ["No debe entrar"] },
        ],
      }),
    };
  };
  await c.handleRoutineTool("call-upsert", {
    action: "upsert", replace: true, routine: { id: "luz" },
  });
  assert.deepEqual(requests, ["upsert", "list"]);
  assert.deepEqual([...c.routineTriggers].sort(), ["apaga la luz", "nueva frase"]);

  requests.length = 0;
  c.fetch = async (_url, options) => {
    const args = JSON.parse(options.body).args;
    requests.push(args.action);
    if (args.action === "delete") {
      return { ok: true, json: async () => ({ ok: true, routine: { id: "luz" } }) };
    }
    return { ok: true, json: async () => ({ ok: true, routines: [] }) };
  };
  await c.handleRoutineTool("call-delete", { action: "delete", name: "luz" });
  assert.deepEqual(requests, ["delete", "list"]);
  assert.deepEqual([...c.routineTriggers], []);
});
