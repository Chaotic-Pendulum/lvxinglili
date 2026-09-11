import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createState,
  chooseActivity,
  frameAt,
  furnitureFrame,
  resolveActivity,
  previewActivity,
  migrateLegacyState,
  beginTrip,
  settleTrip,
  planLocally,
  restoreState,
  validatePlan,
  normalizeSettings,
  movePlacement,
} from "../dist/app/core/engine.js";
import {
  validatePack,
  safePath,
  zipDeclaredSize,
} from "../dist/app/core/pack.js";
import { PROVINCES, DESTINATIONS } from "../dist/app/core/catalog.js";
import { zipSync, strToU8 } from "../dist/vendor/fflate.js";
import { isPrivateAddress } from "../server/proxy.mjs";
const pack = JSON.parse(
  fs.readFileSync("dist/packs/reading-room/pack.json", "utf8"),
);
test("sample pack validates with independent scenes and 34 Chinese regions", () => {
  assert.deepEqual(validatePack(pack), []);
  assert.equal(PROVINCES.length, 34);
  assert.ok(PROVINCES.some((p) => p.id === "CN-71"));
  assert.ok(PROVINCES.some((p) => p.id === "CN-81"));
  assert.ok(PROVINCES.some((p) => p.id === "CN-82"));
  assert.ok(!DESTINATIONS.some((d) => ["TW", "HK", "MO"].includes(d.id)));
});
test("local planner obeys an explicit destination and uses carried items", () => {
  const s = createState(pack, 1000);
  s.backpack = ["telescope"];
  const p = planLocally(pack, s, "CN-65", "去看看雪山", () => 0.1);
  assert.equal(p.destinationId, "CN-65");
  assert.match(p.prompt, /雪山/);
  assert.match(p.prompt, /望远镜/);
  assert.equal(p.planner, "local");
});
test("moving a furniture placement moves the complete composite without separate coordinates", () => {
  const s = createState(pack, 0),
    before = structuredClone(s.activity);
  const p = s.layouts.room[0];
  movePlacement(s, "room", p.id, 0.6, 0.8);
  assert.deepEqual(s.activity, before);
  assert.equal(furnitureFrame(pack, s, "room", p, 100).placement.y, 0.8);
  assert.ok(!("actor" in s));
  assert.ok(!("equipped" in s));
});
test("viewed scene is independent and exactly one furniture is occupied across scenes", () => {
  const s = createState(pack, 0),
    p = s.layouts.room[0];
  s.layouts.garden.push({ ...p, id: "garden-chair" });
  const before = structuredClone(s.activity);
  s.viewSceneId = "garden";
  assert.deepEqual(s.activity, before);
  assert.equal(
    furnitureFrame(pack, s, "garden", s.layouts.garden[0], 100).occupied,
    false,
  );
  assert.equal(furnitureFrame(pack, s, "room", p, 100).occupied, true);
  previewActivity(pack, s, "garden", "garden-chair", "tea", 100);
  assert.equal(furnitureFrame(pack, s, "room", p, 100).occupied, false);
  assert.equal(
    furnitureFrame(pack, s, "garden", s.layouts.garden[0], 100).occupied,
    true,
  );
  assert.equal(Object.hasOwn(s.activity, "moving"), false);
});
test("a missing outfit variant falls back per action without changing the selected outfit", () => {
  const p = structuredClone(pack),
    s = createState(p, 0);
  s.selectedOutfitId = "winter";
  delete p.furniture[0].actions.read.variants.winter;
  let a = resolveActivity(p, s);
  assert.equal(a.outfitId, "base");
  assert.equal(a.fallback, true);
  assert.equal(s.selectedOutfitId, "winter");
  previewActivity(p, s, "room", s.layouts.room[0].id, "tea");
  a = resolveActivity(p, s);
  assert.equal(a.outfitId, "winter");
  assert.equal(a.fallback, false);
});
test("supported activity clips contain slow frames and select the correct outfit", () => {
  const s = createState(pack, 0);
  for (const [actionId, action] of Object.entries(pack.furniture[0].actions))
    for (const outfitId of Object.keys(action.variants)) {
      s.selectedOutfitId = outfitId;
      previewActivity(pack, s, "room", s.layouts.room[0].id, actionId, 0);
      const { clip } = resolveActivity(pack, s);
      assert.equal(clip.frames.length, 2);
      assert.ok(clip.frames.every((f) => f.duration >= 1000));
      assert.equal(
        furnitureFrame(pack, s, "room", s.layouts.room[0], 0).outfitId,
        outfitId,
      );
      assert.equal(frameAt(clip, 0).index, 0);
      assert.equal(frameAt(clip, clip.frames[0].duration).index, 1);
      assert.equal(
        frameAt(
          clip,
          clip.frames.reduce((n, f) => n + f.duration, 0),
        ).index,
        0,
      );
    }
});
test("travel hides every occupied composite and returns to an empty furniture for the duration", () => {
  const s = createState(pack, 0);
  s.currentTrip = beginTrip(s, planLocally(pack, s, "NZ"), 0);
  assert.equal(
    furnitureFrame(pack, s, "room", s.layouts.room[0], 100).occupied,
    false,
  );
  assert.throws(
    () => previewActivity(pack, s, "room", s.layouts.room[0].id, "read"),
    /旅行/,
  );
  settleTrip(s, 1e9);
  assert.equal(
    furnitureFrame(pack, s, "room", s.layouts.room[0], 1e9).occupied,
    true,
  );
});
test("legacy upgrade preserves memories and journeys but resets obsolete layouts", () => {
  const old = {
    version: 1,
    packId: "woodland",
    companionName: "团团",
    settings: { autoTravel: true, autoGenerate: true },
    equipped: { neck: "scarf" },
    actor: { actionId: "read" },
    layouts: {},
    trips: [{ id: "legacy-trip", destinationId: "CN-65" }],
    memories: [{ id: "memory-one", imageId: "image-one", title: "以前的照片" }],
    backpack: ["telescope"],
  };
  const s = migrateLegacyState(old, pack, 1000);
  assert.equal(s.version, 2);
  assert.equal(s.companionName, "团团");
  assert.equal(s.memories[0].imageId, "image-one");
  assert.equal(s.visits["CN-65"], 1);
  assert.equal(s.layouts.room[0].furnitureId, "reading-chair");
  assert.equal(s.selectedOutfitId, "base");
  assert.deepEqual(s.backpack, ["telescope"]);
  assert.ok(s.economy.owned.items.includes("telescope"));
  assert.equal(s.settings.autoGenerate, false);
  assert.ok(!("equipped" in s));
  assert.ok(!("actor" in s));
});
test("a completed trip is settled exactly once across reloads", () => {
  const s = createState(pack, 1000);
  s.settings.travelMinutes = 1;
  s.currentTrip = beginTrip(s, planLocally(pack, s, "CN-33"), 1000);
  assert.equal(settleTrip(s, 60999), null);
  const trip = settleTrip(s, 61000);
  assert.ok(trip);
  assert.equal(s.visits["CN-33"], 1);
  assert.equal(settleTrip(s, 999999), null);
  assert.equal(s.trips.length, 1);
  const restored = restoreState(s, pack, 999999);
  assert.equal(restored.visits["CN-33"], 1);
  assert.equal(restored.currentTrip, null);
});
test("returning from an offline trip works without background model calls", () => {
  const s = createState(pack, 1000);
  s.currentTrip = beginTrip(s, planLocally(pack, s, "NZ"), 1000);
  const restored = restoreState(JSON.parse(JSON.stringify(s)), pack, 1e9);
  const returned = settleTrip(restored, 1e9);
  assert.equal(returned.destinationId, "NZ");
  assert.equal(restored.visits.NZ, 1);
  assert.ok(
    restored.nextTripAt >=
      returned.returnAt + restored.settings.restMinMinutes * 60000,
  );
  assert.ok(
    restored.nextTripAt <=
      returned.returnAt + restored.settings.restMaxMinutes * 60000,
  );
});
test("local selection uses available furniture and remains independent of the viewed scene", () => {
  const s = createState(pack, 0);
  s.viewSceneId = "garden";
  const next = chooseActivity(pack, s, 1000, () => 0.7);
  assert.equal(next.sceneId, "room");
  assert.equal(next.actionId, "tea");
  assert.ok(next.until > next.startedAt);
  assert.equal(s.viewSceneId, "garden");
  s.layouts.room = [];
  assert.equal(chooseActivity(pack, s), null);
  const restored = restoreState(s, pack, 1000);
  assert.ok(restored.activity);
  assert.equal(restored.layouts[restored.viewSceneId].length, 1);
});
test("AI response cannot override an explicit user destination", () => {
  const p = validatePlan(
    {
      destinationId: "NZ",
      prompt: "An original little companion in a quiet forest scene.",
    },
    "CN-51",
  );
  assert.equal(p.destinationId, "CN-51");
  assert.equal(p.countryId, "CN");
  assert.throws(() =>
    validatePlan({
      destinationId: "invalid",
      prompt: "A long enough prompt describing a landscape",
    }),
  );
});
test("pack validator rejects unsafe paths, CSS values and broken image references", () => {
  assert.equal(safePath("../secrets.png"), false);
  assert.equal(safePath('assets/a\".png'), false);
  assert.equal(safePath("https://example.test/image.png"), false);
  const p = structuredClone(pack);
  p.furniture[0].empty.registration = { x: "0);x", y: 0, width: 1, height: 1 };
  assert.ok(validatePack(p).some((s) => s.includes("registration")));
  p.scenes[0].background = "missing";
  assert.ok(validatePack(p).some((s) => s.includes("底图")));
});
test("frame rectangles and pivots stay within the real image", () => {
  const p = structuredClone(pack);
  p.furniture[0].actions.read.variants.base.frames[0].rect = [
    100000, 0, 10, 10,
  ];
  assert.ok(validatePack(p).some((s) => s.includes("裁切")));
  p.furniture[0].pivot = [0.5, 4];
  assert.ok(validatePack(p).some((s) => s.includes("pivot")));
});
test("ZIP preflight rejects oversized decompressed content before extracting", () => {
  const bytes = zipSync({ "pack.json": strToU8("{}") }, { level: 0 });
  assert.equal(zipDeclaredSize(bytes).count, 1);
  const bad = bytes.slice();
  const view = new DataView(bad.buffer);
  let pos = 0;
  while (view.getUint32(pos, true) !== 0x02014b50) pos++;
  view.setUint32(pos + 24, 0x7fffffff, true);
  assert.throws(() => zipDeclaredSize(bad), /30MB/);
});
test("settings clamp invalid values and preserve a nonempty activity range", () => {
  const s = normalizeSettings({
    travelMinutes: -1,
    frequencyMinutes: Infinity,
    activityMinMinutes: 10,
    activityMaxMinutes: 2,
    maxAiTripsPerDay: 999,
    maxImagesPerDay: 3,
  });
  assert.equal(s.travelMinutes, 1);
  assert.equal(s.frequencyMinutes, 1);
  assert.equal(s.activityMaxMinutes, 10);
  assert.equal(s.maxAiTripsPerDay, undefined);
  assert.equal(s.maxImagesPerDay, undefined);
});
test("restore rebuilds counts and ignores malformed imported records", () => {
  const s = createState(pack);
  s.trips = [
    { id: "trip-valid", destinationId: "JP", startedAt: "invalid" },
    { id: '\"onclick=x', destinationId: "NZ" },
  ];
  s.visits = { JP: 999 };
  const r = restoreState(s, pack, 1000);
  assert.equal(r.visits.JP, 1);
  assert.equal(r.trips.length, 1);
  assert.equal(r.trips[0].startedAt, 1000);
});
test("proxy blocks private IPv4 and IPv6 targets", () => {
  for (const a of [
    "127.0.0.1",
    "10.2.3.4",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.0.1",
    "::1",
    "fe90::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ])
    assert.equal(isPrivateAddress(a), true, a);
  for (const a of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(isPrivateAddress(a), false, a);
});

test("pack validation requires a base variant and rejects duplicate furniture IDs in a scene", () => {
  const p = structuredClone(pack);
  delete p.furniture[0].actions.read.variants.base;
  assert.ok(validatePack(p).some((e) => e.includes("默认装扮")));
  p.scenes[0].placements.push({ ...p.scenes[0].placements[0] });
  assert.ok(validatePack(p).some((e) => e.includes("重复")));
  for (const value of [
    null,
    [],
    { version: 1 },
    { ...pack, furniture: [null] },
    { ...pack, furniture: [{ id: "valid" }] },
  ])
    assert.ok(validatePack(value).length);
});

test("restoring a save with no activity selects a valid furniture without throwing", () => {
  const value = createState(pack, 0);
  delete value.activity;
  const restored = restoreState(value, pack, 1000);
  assert.ok(resolveActivity(pack, restored));
});

test("sample keeps wardrobe portraits, empty furniture and individual interaction frames separate", () => {
  const portraits = new Set(pack.outfits.map((o) => o.preview.asset));
  const empty = pack.furniture[0].empty.asset;
  const frames = Object.values(pack.furniture[0].actions).flatMap((a) =>
    Object.values(a.variants).flatMap((c) => c.frames),
  );
  assert.equal(portraits.size, pack.outfits.length);
  assert.ok(frames.length >= 12);
  assert.equal(new Set(frames.map((f) => f.asset)).size, frames.length);
  assert.ok(!portraits.has(empty));
  for (const frame of frames) {
    assert.ok(!portraits.has(frame.asset));
    assert.notEqual(frame.asset, empty);
    assert.equal(frame.rect, undefined);
    if (frame.registration) assert.equal(frame.registration.width, frame.registration.height);
  }
});
