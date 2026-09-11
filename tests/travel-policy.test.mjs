import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createState,
  planLocally,
  commitDeparture,
  settleTrip,
  restoreState,
} from "../dist/app/core/engine.js";
import {
  selectTravelDestination,
  collectTravelCoins,
  defaultPhotoFor,
  apiAvailability,
} from "../dist/app/core/travel.js";
import { DESTINATIONS } from "../dist/app/core/catalog.js";
import { validatePack } from "../dist/app/core/pack.js";
const pack = JSON.parse(
  fs.readFileSync("dist/packs/reading-room/pack.json", "utf8"),
);
const plan = (s, id = "NZ") => planLocally(pack, s, id);
test("free travel samples every valid country and province uniformly", () => {
  const seen = DESTINATIONS.map(
    (_, i) =>
      selectTravelDestination("", () => i / DESTINATIONS.length + 0.000001).id,
  );
  assert.deepEqual(
    seen,
    DESTINATIONS.map((d) => d.id),
  );
  assert.equal(selectTravelDestination("CN-65").id, "CN-65");
  assert.throws(() => selectTravelDestination("CN"));
  assert.throws(() => selectTravelDestination("TW"));
});
test("random is free, directed trips charge once on successful departure", () => {
  const s = createState(pack, 0);
  commitDeparture(s, plan(s), {}, 0);
  assert.equal(s.economy.coins, 9999);
  assert.equal(s.currentTrip.destinationMode, "random");
  assert.throws(() => commitDeparture(s, plan(s), { directed: true }, 1));
  assert.equal(s.economy.coins, 9999);
  s.currentTrip = null;
  commitDeparture(s, plan(s, "CN-33"), { directed: true }, 0);
  assert.equal(s.economy.coins, 9899);
  assert.equal(s.currentTrip.destinationFee, 100);
});
test("insufficient coins or invalid destinations do not start or debit a trip", () => {
  const s = createState(pack);
  s.economy.coins = 99;
  assert.throws(
    () => commitDeparture(s, plan(s), { directed: true }),
    /金币不足/,
  );
  assert.equal(s.currentTrip, null);
  assert.equal(s.economy.coins, 99);
  assert.throws(() =>
    commitDeparture(s, { destinationId: "wrong" }, { directed: true }),
  );
  assert.equal(s.economy.coins, 99);
  commitDeparture(s, plan(s), {});
  assert.equal(s.economy.coins, 99);
});
test("coin mail arrives at exact intervals without duplicate claims or rewards after return", () => {
  const s = createState(pack, 0);
  s.settings.travelMinutes = 120;
  commitDeparture(s, plan(s), {}, 0);
  assert.equal(collectTravelCoins(s, 1799999), null);
  assert.equal(collectTravelCoins(s, 1800000).coins, 50);
  assert.equal(collectTravelCoins(s, 1800000), null);
  const r = collectTravelCoins(s, 7200000);
  assert.equal(r.coins, 150);
  assert.equal(r.count, 3);
  assert.equal(s.economy.coins, 10199);
  assert.equal(collectTravelCoins(s, 99999999), null);
  settleTrip(s, 99999999);
  assert.equal(s.economy.coins, 10199);
  assert.equal(s.trips[0].coinsReceived, 200);
});
test("offline settlement catches up only the active trip and survives save restore", () => {
  const s = createState(pack, 0);
  commitDeparture(s, plan(s), {}, 0);
  collectTravelCoins(s, 1800000);
  const r = restoreState(JSON.parse(JSON.stringify(s)), pack, 99999999);
  settleTrip(r, 99999999);
  assert.equal(r.economy.coins, 10199);
  assert.equal(r.coinLetters.length, 2);
  assert.equal(collectTravelCoins(r, 1e12), null);
  const again = restoreState(r, pack, 1e12);
  settleTrip(again, 1e12);
  assert.equal(again.economy.coins, 10199);
});
test("changing settings later does not alter a departed trip or its mail schedule", () => {
  const s = createState(pack, 0),
    snapshot = {
      ...s,
      settings: { ...s.settings },
      selectedOutfitId: "winter",
      backpack: ["telescope"],
    };
  s.settings.coinMailAmount = 1000;
  s.settings.directedTripCost = 999;
  const trip = commitDeparture(s, plan(s), { directed: true, snapshot }, 0);
  assert.equal(trip.destinationFee, 100);
  assert.equal(trip.coinMail.amount, 50);
  assert.equal(trip.outfitId, "winter");
  assert.deepEqual(trip.items, ["telescope"]);
});
test("default photos use the exact destination mapping and an honest shared fallback", () => {
  const p = structuredClone(pack);
  p.destinationPhotos = { NZ: "postcard-coast", "CN-11": "postcard-forest" };
  assert.deepEqual(defaultPhotoFor(p, "NZ"), {
    asset: "postcard-coast",
    placeholder: false,
  });
  assert.deepEqual(defaultPhotoFor(p, "CN-11"), {
    asset: "postcard-forest",
    placeholder: false,
  });
  assert.deepEqual(defaultPhotoFor(p, "CN-65"), {
    asset: "postcard-lake",
    placeholder: true,
  });
  assert.deepEqual(validatePack(p), []);
  p.destinationPhotos.CN = "postcard-lake";
  assert.ok(validatePack(p).some((e) => e.includes("默认照片")));
});
test("API mode requires a model, endpoint and usable credentials for the selected connection", () => {
  const s = createState(pack);
  assert.deepEqual(apiAvailability(s.settings), { text: false, image: false });
  s.settings.imageModel = "image-test";
  s.settings.textModel = "text-test";
  s.settings.connectionMode = "direct";
  assert.deepEqual(
    apiAvailability(s.settings, { textKey: "t", imageKey: "i" }),
    { text: true, image: true },
  );
  assert.deepEqual(
    apiAvailability(
      s.settings,
      {},
      { proxy: true, textConfigured: true, imageConfigured: true },
    ),
    { text: false, image: false },
  );
  s.settings.connectionMode = "proxy";
  assert.deepEqual(
    apiAvailability(
      s.settings,
      {},
      { proxy: true, textConfigured: true, imageConfigured: true },
    ),
    { text: true, image: true },
  );
});
