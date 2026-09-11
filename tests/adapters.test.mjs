import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createState } from "../dist/app/core/engine.js";
import { endpoint, planWithAI, createPostcard } from "../dist/app/ai.js";
import { registerAgentTools } from "../dist/app/webmcp.js";
const pack = JSON.parse(
  fs.readFileSync("dist/packs/reading-room/pack.json", "utf8"),
);

test("API URL composition keeps a supplied version prefix and rejects credentials", () => {
  assert.equal(
    endpoint("https://example.test/v1/", "responses"),
    "https://example.test/v1/responses",
  );
  assert.equal(
    endpoint("https://example.test/v1/images/edits", "images/edits"),
    "https://example.test/v1/images/edits",
  );
  assert.throws(() => endpoint("https://secret@example.test/v1", "responses"));
});
test("trip planning makes one text request and validates its returned destination", async () => {
  const original = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              destinationId: "NZ",
              title: "湖边",
              reason: "去散步",
              prompt: "An original otter by a calm lake in afternoon light.",
            }),
          },
        },
      ],
    });
  };
  try {
    const state = createState(pack);
    state.selectedOutfitId = "winter";
    state.backpack = ["telescope"];
    state.settings = {
      ...state.settings,
      textModel: "test-model",
      textBaseUrl: "https://example.test/v1",
      connectionMode: "direct",
    };
    const p = await planWithAI(
      pack,
      state,
      { textKey: "test-key" },
      null,
      "CN-65",
      "看看远山",
    );
    assert.equal(p.destinationId, "CN-65");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /chat\/completions$/);
    assert.equal(calls[0].body.model, "test-model");
    const context = JSON.parse(calls[0].body.messages[1].content);
    assert.equal(context.selectedDestination, "CN-65");
    assert.equal(context.allowedDestinations, "CN-65:新疆");
    assert.match(context.outfit, /围巾/);
    assert.equal(context.items[0].name, "黄铜望远镜");
    assert.equal(state.aiUsage[new Date().toISOString().slice(0, 10)], 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("malformed model output fails without retrying or starting a trip", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      output: [{ content: [{ type: "output_text", text: "not JSON" }] }],
    });
  };
  try {
    const state = createState(pack);
    state.settings = {
      ...state.settings,
      textProtocol: "responses",
      textModel: "test",
      connectionMode: "direct",
    };
    await assert.rejects(
      () => planWithAI(pack, state, { textKey: "test" }, null, "", ""),
      /JSON/,
    );
    assert.equal(calls, 1);
    assert.equal(state.currentTrip, null);
  } finally {
    globalThis.fetch = original;
  }
});
test("image adapter decodes a mock base64 response with one request", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      data: [{ b64_json: Buffer.from("mock-image-bytes").toString("base64") }],
    });
  };
  try {
    const blob = await createPostcard(
      {
        connectionMode: "direct",
        imageBaseUrl: "https://example.test/v1",
        imageModel: "test",
        imageMode: "generate",
      },
      { imageKey: "test" },
      null,
      "A picture",
    );
    assert.equal(await blob.text(), "mock-image-bytes");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("agent tools share state and reject invalid batches atomically in a mock registry", async () => {
  const oldDocument = globalThis.document,
    oldWindow = globalThis.window,
    tools = [];
  globalThis.document = {
    modelContext: { registerTool: (tool) => tools.push(tool) },
  };
  globalThis.window = { addEventListener() {} };
  try {
    const app = { state: createState(pack), async saveNow() {}, render() {} };
    registerAgentTools(app);
    assert.equal(tools.length, 3);
    const read = tools.find((t) => t.name === "read_roam_state"),
      move = tools.find((t) => t.name === "set_roam_furniture_positions"),
      configure = tools.find((t) => t.name === "configure_roam_travel");
    const id = app.state.layouts[app.state.viewSceneId][0].id;
    await move.execute({ placements: [{ id, x: 0.4, y: 0.6 }] });
    assert.equal(read.execute().placements[0].x, 0.4);
    const before = JSON.stringify(app.state);
    await assert.rejects(() =>
      move.execute({
        placements: [
          { id, x: 0.2, y: 0.3 },
          { id: "unknown", x: 0.2, y: 0.3 },
        ],
      }),
    );
    assert.equal(JSON.stringify(app.state), before);
    await configure.execute({ travelMinutes: 10, frequencyMinutes: 20 });
    assert.equal(app.state.settings.frequencyMinutes, 20);
    assert.equal(app.state.currentTrip, null);
    await assert.rejects(() =>
      configure.execute({ travelMinutes: -1, frequencyMinutes: 20 }),
    );
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  }
});
