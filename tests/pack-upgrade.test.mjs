import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  upgradeReadingRoom,
  LEGACY_READING_ASSETS,
} from "../dist/app/core/pack-upgrade.js";
import { validatePack } from "../dist/app/core/pack.js";
import {
  createState,
  restoreState,
  resolveActivity,
} from "../dist/app/core/engine.js";
const bundled = JSON.parse(
  fs.readFileSync("dist/packs/reading-room/pack.json", "utf8"),
);
const old = JSON.parse(
  fs.readFileSync("tests/fixtures/reading-room-grid-v2.json", "utf8"),
);
const record = () => ({
  pack: structuredClone(old),
  base: "./packs/reading-room/",
  blobs: {},
});

test("actual old rain atlas references upgrade automatically to individual frames", () => {
  const before = record(),
    original = structuredClone(before);
  const result = upgradeReadingRoom(before, bundled);
  assert.equal(result.changed, true);
  assert.deepEqual(before, original);
  assert.deepEqual(validatePack(result.record.pack), []);
  assert.equal(
    result.record.pack.outfits.find((o) => o.id === "rain").preview.asset,
    "rain-outfit",
  );
  assert.deepEqual(
    result.record.pack.furniture[0].actions.tea.variants.rain.frames.map(
      (f) => f.asset,
    ),
    ["rain-tea-a", "rain-tea-b"],
  );
  for (const id of LEGACY_READING_ASSETS)
    assert.ok(!result.record.pack.assets[id]);
  assert.equal(upgradeReadingRoom(result.record, bundled).changed, false);
});
test("upgrade preserves selected outfit, placements, camera, memories, active trip and timing", () => {
  const before = record(),
    state = createState(old, 1000);
  delete state.economy; // Fixture represents a save from before the shop existed.
  state.selectedOutfitId = "rain";
  state.companionName = "小团";
  state.layouts.room[0].x = 0.73;
  state.layouts.room[0].width = 0.41;
  state.camera.room = { x: 20, y: 30, zoom: 1.3 };
  state.memories = [
    { id: "memory-1", imageId: "image-1", title: "旧照片", createdAt: 1000 },
  ];
  state.trips = [
    {
      id: "trip-1",
      destinationId: "CN-65",
      startedAt: 1000,
      completedAt: 2000,
    },
  ];
  state.visits = { "CN-65": 1 };
  state.currentTrip = {
    id: "trip-2",
    destinationId: "NZ",
    startedAt: 1000,
    returnAt: 100000,
  };
  before.pack.furniture[0].actions.tea.variants.rain.frames[0].duration = 7500;
  const expected = restoreState(state, old, 3000);
  const result = upgradeReadingRoom(before, bundled),
    restored = restoreState(state, result.record.pack, 3000);
  for (const key of [
    "selectedOutfitId",
    "companionName",
    "camera",
    "memories",
    "currentTrip",
    "activity",
    "settings",
  ])
    assert.deepEqual(restored[key], expected[key], key);
  for (const [sceneId, layout] of Object.entries(expected.layouts))
    assert.deepEqual(restored.layouts[sceneId], layout, sceneId);
  for (const scene of result.record.pack.scenes.filter(s => !old.scenes.some(o => o.id === s.id))) {
    assert.deepEqual(restored.layouts[scene.id], [], scene.id);
    assert.ok(!restored.economy.owned.scenes.includes(scene.id), 'new locations remain purchasable');
  }
  assert.equal(restored.visits["CN-65"], 1);
  assert.equal(
    result.record.pack.furniture[0].actions.tea.variants.rain.frames[0]
      .duration,
    7500,
  );
  assert.equal(resolveActivity(result.record.pack, restored).outfitId, "rain");
});
test("custom interactions and unrelated imported art are not replaced", () => {
  const before = record();
  before.pack.assets.custom = {
    src: "assets/my-frame.png",
    width: 627,
    height: 627,
  };
  before.pack.furniture[0].actions.read.variants.rain.frames = [
    { asset: "custom", duration: 5000 },
  ];
  before.blobs["assets/my-frame.png"] = new Blob(["my-image"]);
  const originalFurniture = structuredClone(before.pack.furniture);
  const result = upgradeReadingRoom(before, bundled);
  assert.equal(result.changed, true);
  assert.deepEqual(result.record.pack.furniture, originalFurniture);
  assert.equal(
    result.record.blobs["assets/my-frame.png"],
    before.blobs["assets/my-frame.png"],
  );
  assert.ok(result.record.pack.assets["rain-actions"]);
  assert.deepEqual(validatePack(result.record.pack), []);
});
test("self-contained imported atlas artwork and other packs remain untouched", () => {
  const before = record();
  for (const asset of Object.values(before.pack.assets))
    before.blobs[asset.src] = new Blob(["user-owned-image"]);
  assert.equal(upgradeReadingRoom(before, bundled).changed, false);
  const other = record();
  other.pack.id = "my-own-pack";
  assert.equal(upgradeReadingRoom(other, bundled).changed, false);
  assert.equal(
    upgradeReadingRoom({ pack: bundled, blobs: {} }, bundled).changed,
    false,
  );
});
test("new asset id collisions do not overwrite user files", () => {
  const before = record();
  before.pack.assets["rain-tea-a"] = {
    src: "assets/my-tea.png",
    width: 1254,
    height: 1254,
  };
  const originalFurniture = structuredClone(before.pack.furniture);
  const result = upgradeReadingRoom(before, bundled);
  assert.deepEqual(result.record.pack.furniture.filter(f => originalFurniture.some(old => old.id === f.id)), originalFurniture);
  assert.equal(
    result.record.pack.assets["rain-tea-a"].src,
    "assets/my-tea.png",
  );
});
test("old public image URLs remain available for pages already open during deployment", () => {
  for (const id of LEGACY_READING_ASSETS) {
    const bytes = fs.readFileSync(`dist/packs/reading-room/assets/${id}.png`);
    assert.equal(bytes.readUInt32BE(16), 1254);
    assert.equal(bytes.readUInt32BE(20), 1254);
    assert.equal(bytes[25], 6);
  }
});

test("expanded built-in catalogs add new purchases without changing owned item definitions", () => {
  const previous = JSON.parse(fs.readFileSync("tests/fixtures/reading-room-single-v3.json", "utf8"));
  const result = upgradeReadingRoom({pack: previous, blobs: {}, base: "./packs/reading-room/"}, bundled);
  assert.equal(result.changed, true);
  assert.equal(result.record.pack.items.length, 100);
  for (const item of previous.items) assert.deepEqual(result.record.pack.items.find(i => i.id === item.id), item);
  assert.deepEqual(validatePack(result.record.pack), []);
  assert.equal(upgradeReadingRoom(result.record, bundled).changed, false);
});

function beforeCompression() {
  const pack = structuredClone(bundled);
  for (const [id, definitions] of Object.entries(bundled.assetReplacements || {}))
    pack.assets[id] = structuredClone(definitions[0]);
  delete pack.assetReplacements;
  delete pack.imageEncoding;
  pack.revision = 'expanded-before-q90';
  return {pack, blobs: {}, base: './packs/reading-room/'};
}
test('Q90 upgrade changes known asset URLs while preserving frames and user adjustments', () => {
  const before = beforeCompression();
  before.pack.furniture[0].actions.read.variants.base.frames[0].duration = 7300;
  before.pack.furniture[0].actions.read.variants.base.frames[0].registration = {x: .02, y: -.01, width: 1, height: 1};
  const snapshot = structuredClone(before), result = upgradeReadingRoom(before, bundled);
  assert.equal(result.changed, true);
  assert.deepEqual(before, snapshot);
  for (const section of ['scenes', 'outfits', 'items', 'furniture'])
    assert.deepEqual(result.record.pack[section], before.pack[section]);
  for (const id of Object.keys(bundled.assetReplacements))
    assert.deepEqual(result.record.pack.assets[id], bundled.assets[id]);
  assert.deepEqual(validatePack(result.record.pack), []);
  assert.equal(upgradeReadingRoom(result.record, bundled).changed, false);
});
test('Q90 upgrade preserves uploaded source/target blobs and custom asset definitions', () => {
  const ids = Object.keys(bundled.assetReplacements).slice(0, 4), before = beforeCompression();
  before.blobs[before.pack.assets[ids[0]].src] = new Blob(['custom source']);
  before.blobs[bundled.assets[ids[1]].src] = new Blob(['custom target']);
  before.pack.assets[ids[2]].src = 'assets/custom-image.webp';
  before.blobs['assets/unrelated.png'] = new Blob(['other art']);
  const result = upgradeReadingRoom(before, bundled);
  for (const id of ids.slice(0, 3)) assert.deepEqual(result.record.pack.assets[id], before.pack.assets[id]);
  assert.deepEqual(result.record.pack.assets[ids[3]], bundled.assets[ids[3]]);
  assert.equal(result.record.blobs, before.blobs);
});
test('Q90 migration requires the built-in base and checks definitions even when revision matches', () => {
  const external = beforeCompression(); external.base = 'https://example.test/my-art/';
  assert.equal(upgradeReadingRoom(external, bundled).changed, false);
  const before = beforeCompression(); before.pack.revision = bundled.revision;
  assert.equal(upgradeReadingRoom(before, bundled).changed, true);
});
