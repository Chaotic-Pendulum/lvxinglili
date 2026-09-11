import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createState,
  restoreState,
  placeFurniture,
  storeFurniture,
  selectHomeScene,
} from "../dist/app/core/engine.js";
import {
  STARTING_COINS,
  purchase,
  owns,
  furnitureAvailable,
  priceOf,
} from "../dist/app/core/economy.js";
import { validatePack } from "../dist/app/core/pack.js";
const pack = JSON.parse(
  fs.readFileSync("dist/packs/reading-room/pack.json", "utf8"),
);
test("a new home starts with 9999 coins, a base outfit, one chair and one location", () => {
  const s = createState(pack);
  assert.equal(s.economy.coins, 9999);
  assert.equal(STARTING_COINS, 9999);
  assert.deepEqual(s.economy.owned.outfits, ["base"]);
  assert.deepEqual(s.economy.owned.items, []);
  assert.deepEqual(s.economy.owned.scenes, ["room"]);
  assert.equal(s.economy.owned.furniture["reading-chair"], 1);
  assert.equal(furnitureAvailable(s, "reading-chair"), 0);
});
test("unique purchases deduct the configured price once and stay owned", () => {
  const s = createState(pack);
  purchase(pack, s, "outfits", "winter");
  purchase(pack, s, "items", "telescope");
  assert.equal(s.economy.coins, 9999 - 360 - 160);
  assert.ok(owns(s, "outfits", "winter"));
  assert.ok(owns(s, "items", "telescope"));
  const before = JSON.stringify(s);
  assert.throws(() => purchase(pack, s, "outfits", "winter"), /已经拥有/);
  assert.equal(JSON.stringify(s), before);
});
test("unaffordable and unknown purchases leave both money and inventory unchanged", () => {
  const s = createState(pack);
  s.economy.coins = 1;
  const before = JSON.stringify(s);
  for (const args of [
    ["furniture", "reading-chair"],
    ["outfits", "missing"],
    ["unknown", "base"],
  ])
    assert.throws(() => purchase(pack, s, ...args));
  assert.equal(JSON.stringify(s), before);
});
test("each purchased furniture unit can be placed, stored and placed again", () => {
  const s = createState(pack);
  assert.throws(() => placeFurniture(pack, s, "reading-chair"), /仓库/);
  purchase(pack, s, "furniture", "reading-chair");
  assert.equal(furnitureAvailable(s, "reading-chair"), 1);
  const p = placeFurniture(pack, s, "reading-chair");
  assert.equal(s.layouts.room.length, 2);
  assert.equal(furnitureAvailable(s, "reading-chair"), 0);
  assert.notEqual(p.id, s.layouts.room[0].id);
  storeFurniture(pack, s, p.id);
  assert.equal(furnitureAvailable(s, "reading-chair"), 1);
  assert.equal(s.economy.coins, 9699);
  placeFurniture(pack, s, "reading-chair");
  assert.equal(s.layouts.room.length, 2);
  assert.equal(furnitureAvailable(s, "reading-chair"), 0);
});
test("the last furniture on the active stage cannot be stored", () => {
  const s = createState(pack),
    id = s.layouts.room[0].id,
    before = JSON.stringify(s);
  assert.throws(() => storeFurniture(pack, s, id), /至少/);
  assert.equal(JSON.stringify(s), before);
});
test("buying a location unlocks its backdrop and preserves all furniture and the current action", () => {
  const s = createState(pack, 1000);
  purchase(pack, s, "furniture", "reading-chair");
  placeFurniture(pack, s, "reading-chair");
  const furniture = structuredClone(s.layouts.room),
    action = structuredClone(s.activity);
  assert.throws(() => selectHomeScene(pack, s, "garden"), /购买/);
  purchase(pack, s, "scenes", "garden");
  selectHomeScene(pack, s, "garden");
  assert.equal(s.viewSceneId, "garden");
  assert.deepEqual(s.layouts.garden, furniture);
  assert.deepEqual(s.layouts.room, []);
  assert.deepEqual(s.activity, { ...action, sceneId: "garden" });
  assert.equal(s.economy.coins, 9999 - 300 - 1200);
  selectHomeScene(pack, s, "room");
  assert.deepEqual(s.layouts.room, furniture);
  assert.equal(s.economy.owned.furniture["reading-chair"], 2);
});
test("old saves retain already worn and carried things when the shop is introduced", () => {
  const old = createState(pack);
  delete old.economy;
  old.selectedOutfitId = "rain";
  old.backpack = ["telescope"];
  old.layouts.room[0].width = 0.38;
  old.memories = [{ id: "m-1", imageId: "photo-1", title: "过去" }];
  const s = restoreState(old, pack);
  assert.equal(s.economy.coins, 9999);
  assert.ok(owns(s, "outfits", "rain"));
  assert.ok(owns(s, "items", "telescope"));
  assert.ok(!owns(s, "outfits", "winter"));
  assert.equal(s.layouts.room[0].width, 0.38);
  assert.equal(s.memories[0].imageId, "photo-1");
});
test("spent coins including zero and warehouse inventory survive reloads", () => {
  const s = createState(pack);
  purchase(pack, s, "outfits", "winter");
  s.selectedOutfitId = "winter";
  purchase(pack, s, "furniture", "reading-chair");
  s.economy.coins = 0;
  const restored = restoreState(JSON.parse(JSON.stringify(s)), pack);
  assert.equal(restored.economy.coins, 0);
  assert.equal(restored.selectedOutfitId, "winter");
  assert.equal(furnitureAvailable(restored, "reading-chair"), 1);
  assert.deepEqual(restoreState(restored, pack).economy, restored.economy);
});
test("restoring an empty or unowned stage repairs one starter placement without charging", () => {
  const s = createState(pack);
  s.layouts.room = [];
  s.viewSceneId = "garden";
  const r = restoreState(s, pack);
  assert.equal(r.viewSceneId, "room");
  assert.equal(r.layouts.room.length, 1);
  assert.equal(r.economy.coins, 9999);
  assert.ok(!owns(r, "scenes", "garden"));
});
test("free prices work and invalid prices or furniture-free packs fail validation", () => {
  const p = structuredClone(pack);
  p.items[0].price = 0;
  const s = createState(p);
  purchase(p, s, "items", p.items[0].id);
  assert.equal(s.economy.coins, 9999);
  assert.equal(priceOf(p, "items", p.items[0].id), 0);
  p.items[0].price = -50;
  assert.ok(validatePack(p).some((e) => e.includes("price")));
  p.furniture = [];
  assert.ok(validatePack(p).length);
});
