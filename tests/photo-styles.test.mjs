import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { imageDimensions } from "../scripts/image-header.mjs";
import {
  PHOTO_STYLES,
  photoStyleSnapshot,
  normalizePhotoStyleId,
} from "../dist/app/core/photo-styles.js";
import { PHOTO_STYLE_PREVIEWS } from "../dist/app/photo-style-previews.js";
import { createState, restoreState } from "../dist/app/core/engine.js";
import {
  createItinerary,
  validateItinerary,
} from "../dist/app/core/itinerary.js";
import { destinationById } from "../dist/app/core/catalog.js";
import { createPostcard, planJourneyWithAI } from "../dist/app/ai.js";
const pack = JSON.parse(fs.readFileSync("dist/packs/reading-room/pack.json"));
test("all twenty Q90 style previews retain dimensions, original provenance and current hashes", () => {
  const manifest = JSON.parse(
    fs.readFileSync("dist/photo-styles/manifest.json"),
  );
  assert.equal(PHOTO_STYLES.length, 20);
  assert.equal(new Set(PHOTO_STYLES.map((s) => s.id)).size, 20);
  for (const style of manifest.styles) {
    const bytes = fs.readFileSync("dist/photo-styles/" + style.file);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      style.sha256,
    );
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(style.width, 1536);
    assert.equal(style.height, 1024);
    assert.equal(style.quality, 90);
    assert.deepEqual(imageDimensions(bytes), {width: 1536, height: 1024});
    assert.match(style.originalSha256, /^[a-f0-9]{64}$/);
    assert.ok(PHOTO_STYLE_PREVIEWS[style.id]);
  }
});
test("style snapshots contain text only and do not retain preview-composition instructions", () => {
  for (const style of PHOTO_STYLES) {
    const value = photoStyleSnapshot(pack, { photoStyleId: style.id });
    assert.deepEqual(Object.keys(value).sort(), ["id", "name", "prompt"]);
    assert.doesNotMatch(
      JSON.stringify(value),
      /\.png|photo-styles\/|唯一构图|不添加人物|雪山轮廓|保持原图/,
    );
  }
  assert.equal(normalizePhotoStyleId("unknown"), "pack-default");
  assert.equal(photoStyleSnapshot(pack, {}).prompt, pack.stylePrompt);
});
test("new trips freeze the selected text style for every node and do not change when settings change", () => {
  const state = createState(pack);
  state.settings.photoStyleId = "ink-wash";
  const plan = createItinerary(
    pack,
    state,
    destinationById("NZ"),
    120,
    () => 0.7,
  );
  const before = JSON.stringify(plan);
  state.settings.photoStyleId = "pixel-art";
  assert.equal(JSON.stringify(plan), before);
  assert.equal(plan.photoStyle.id, "ink-wash");
  for (const node of plan.nodes) {
    assert.match(node.prompt, /水墨/);
    assert.doesNotMatch(node.prompt, /\.png|photo-styles\//);
  }
  const next = createItinerary(
    pack,
    state,
    destinationById("NZ"),
    120,
    () => 0.7,
  );
  assert.equal(next.photoStyle.id, "pixel-art");
  assert.equal(restoreState(state, pack).settings.photoStyleId, "pixel-art");
  const generated = validateItinerary(
    { ...plan, style: "a conflicting oil painting" },
    plan,
  );
  assert.equal(generated.style, plan.style);
});
test("image requests receive the character reference only, without style-preview URLs or images", async () => {
  const original = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return Response.json({ data: [{ b64_json: btoa("mock-image") }] });
  };
  try {
    const state = createState(pack);
    state.settings.imageModel = "mock-image";
    state.settings.photoStyleId = "watercolor";
    const plan = createItinerary(
      pack,
      state,
      destinationById("NZ"),
      120,
      () => 0.3,
    );
    const reference = "data:image/png;base64,Y2hhcmFjdGVy";
    await createPostcard(
      state.settings,
      {},
      { proxy: true, imageConfigured: true, csrfToken: "mock" },
      plan.nodes[0].prompt,
      reference,
    );
    assert.equal(body.reference, reference);
    assert.match(body.payload.prompt, /水彩/);
    assert.doesNotMatch(
      JSON.stringify(body),
      /photo-styles\/|06-watercolor\.png|00-base\.png/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("the text planner receives the selected style text but no preview assets", async () => {
  const original = globalThis.fetch;
  let context;
  const state = createState(pack);
  state.settings.connectionMode = "direct";
  state.settings.textModel = "mock";
  state.settings.photoStyleId = "photorealism";
  const plan = createItinerary(
    pack,
    state,
    destinationById("NZ"),
    100,
    () => 0.5,
  );
  globalThis.fetch = async (_url, options) => {
    context = JSON.parse(JSON.parse(options.body).messages[1].content);
    return Response.json({
      choices: [{ message: { content: JSON.stringify(plan) } }],
    });
  };
  try {
    const result = await planJourneyWithAI(
      pack,
      state,
      { textKey: "mock" },
      null,
      plan,
    );
    assert.match(context.style, /拟真/);
    assert.doesNotMatch(JSON.stringify(context), /photo-styles\/|\.png|\.jpg/);
    assert.equal(result.photoStyle.id, "photorealism");
  } finally {
    globalThis.fetch = original;
  }
});
