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
  randomTripMinutes,
  nextAutoDeparture,
  createItinerary,
  validateItinerary,
  deliverJourneyNodes,
  journeyPhotos,
  fallbackJourney,
} from "../dist/app/core/itinerary.js";
import { planJourneyWithAI } from "../dist/app/ai.js";
import {
  departureFormView,
  homeView,
  settingsView,
} from "../dist/app/views.js";
import { destinationById } from "../dist/app/core/catalog.js";
const pack = JSON.parse(
  fs.readFileSync("dist/packs/reading-room/pack.json", "utf8"),
);
function setup(mode = "default") {
  const s = createState(pack, 0);
  s.settings.journeyMinNodes = 3;
  s.settings.journeyMaxNodes = 3;
  const itinerary = createItinerary(
    pack,
    s,
    destinationById("NZ"),
    120,
    () => 0.5,
  );
  const trip = commitDeparture(
    s,
    planLocally(pack, s, "NZ"),
    { photoMode: mode, itinerary },
    0,
  );
  trip.fallbackItinerary = structuredClone(itinerary);
  return { s, trip, itinerary };
}
test("travel and rest timing are random within developer ranges; new games are automatic", () => {
  const s = createState(pack, 0);
  assert.equal(s.settings.autoTravel, true);
  assert.equal(
    randomTripMinutes(s.settings, () => 0),
    60,
  );
  assert.equal(
    randomTripMinutes(s.settings, () => 0.9999),
    180,
  );
  assert.equal(
    nextAutoDeparture(s.settings, 1000, () => 0),
    301000,
  );
  assert.equal(
    nextAutoDeparture(s.settings, 1000, () => 0.9999),
    901000,
  );
  const legacy = structuredClone(s);
  delete legacy.itineraryVersion;
  legacy.settings.autoTravel = false;
  assert.equal(restoreState(legacy, pack, 1000).settings.autoTravel, true);
});
test("one complete plan fixes ordered 1-3 stops and a shared outfit before departure", () => {
  const s = createState(pack);
  s.selectedOutfitId = "winter";
  s.backpack = ["telescope"];
  for (const r of [0, 0.5, 0.999]) {
    const plan = createItinerary(
      pack,
      s,
      destinationById("CN-65"),
      100,
      () => r,
    );
    assert.ok(plan.nodes.length >= 1 && plan.nodes.length <= 3);
    for (const [i, node] of plan.nodes.entries()) {
      assert.ok(node.offsetMs > 0 && node.offsetMs < 6000000);
      if (i) assert.ok(node.offsetMs > plan.nodes[i - 1].offsetMs);
      assert.match(node.prompt, /暖冬围巾/);
      assert.match(node.prompt, /黄铜望远镜/);
      assert.ok(node.prompt.includes(node.message));
      assert.ok(node.prompt.includes(plan.story));
    }
  }
});
test("default messages and images become available at nodes while still traveling, once only", () => {
  const { s, trip } = setup();
  assert.equal(journeyPhotos(s).length, 0);
  const first = trip.itinerary.nodes[0];
  assert.equal(deliverJourneyNodes(s, first.deliverAt - 1).length, 0);
  assert.equal(deliverJourneyNodes(s, first.deliverAt).length, 1);
  assert.equal(journeyPhotos(s).length, 1);
  assert.ok(s.currentTrip);
  assert.equal(deliverJourneyNodes(s, first.deliverAt).length, 0);
  const r = restoreState(s, pack, trip.returnAt + 1);
  settleTrip(r, trip.returnAt + 1);
  assert.equal(journeyPhotos(r).length, 3);
  assert.equal(r.visits.NZ, 1);
});
test("AI letters wait for their paired image; failure silently publishes the local fallback", () => {
  const { s, trip } = setup("generated");
  const original = trip.itinerary.nodes[0].message;
  trip.itinerary.nodes[0].message = "AI scene-specific message";
  deliverJourneyNodes(s, trip.itinerary.nodes[0].deliverAt);
  assert.equal(journeyPhotos(s).length, 0);
  assert.equal(trip.itinerary.nodes[0].imageStatus, "queued");
  fallbackJourney(trip, "simulated provider failure", 2000000);
  assert.equal(trip.photoMode, "default");
  assert.equal(journeyPhotos(s).length, 1);
  assert.equal(trip.itinerary.nodes[0].message, original);
  assert.equal(trip.itinerary.nodes[0].imageStatus, "default");
  assert.equal(trip.itinerary.nodes[0].imageError, undefined);
});
test("already delivered chapters are preserved when later chapters fall back", () => {
  const { s, trip } = setup("generated");
  const first = trip.itinerary.nodes[0];
  first.triggeredAt = 10;
  first.deliveredAt = 20;
  first.imageId = "image-1";
  first.message = "已经收到的那句话";
  first.imageStatus = "ready";
  deliverJourneyNodes(s, trip.itinerary.nodes[1].deliverAt);
  fallbackJourney(trip, "network", 4000000);
  assert.equal(first.message, "已经收到的那句话");
  assert.equal(first.imageId, "image-1");
  assert.equal(journeyPhotos(s).length, 2);
});
test("AI cannot change the destination or the schedule and must return every planned chapter", () => {
  const { itinerary } = setup();
  const raw = {
    ...itinerary,
    nodes: itinerary.nodes.map((n) => ({ ...n, offsetMs: 1 })),
  };
  const result = validateItinerary(raw, itinerary);
  assert.deepEqual(
    result.nodes.map((n) => n.offsetMs),
    itinerary.nodes.map((n) => n.offsetMs),
  );
  assert.throws(() =>
    validateItinerary({ ...raw, destinationId: "JP" }, itinerary),
  );
  assert.throws(() =>
    validateItinerary({ ...raw, nodes: raw.nodes.slice(1) }, itinerary),
  );
});
test("the entire itinerary is requested in one AI call, with outfit and node count in the same context", async () => {
  const { s, itinerary } = setup();
  s.settings.connectionMode = "direct";
  s.settings.textModel = "mock";
  let calls = 0,
    context;
  const old = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls++;
    context = JSON.parse(JSON.parse(options.body).messages[1].content);
    return Response.json({
      choices: [{ message: { content: JSON.stringify(itinerary) } }],
    });
  };
  try {
    const p = await planJourneyWithAI(
      pack,
      s,
      { textKey: "mock" },
      null,
      itinerary,
      "慢慢玩",
    );
    assert.equal(calls, 1);
    assert.equal(context.nodeCount, 3);
    assert.equal(p.nodes.length, 3);
    assert.equal(context.outfit.id, "base");
  } finally {
    globalThis.fetch = old;
  }
});
test("normal controls hide timing; only developer settings expose the actual return time", () => {
  const { s, trip } = setup();
  const app = {
    state: s,
    pack,
    secrets: {},
    runtime: null,
    selectedDestination: "NZ",
    departureChoice: "random",
    instruction: "",
    character: () => pack.character,
    photos: () => [],
  };
  assert.doesNotMatch(
    departureFormView(app),
    /name="(?:travelMinutes|frequencyMinutes|autoTravel)"/,
  );
  assert.doesNotMatch(homeView(app), /data-countdown|预计归来/);
  assert.match(settingsView(app), /data-dev-return/);
  assert.match(settingsView(app), /developer-settings/);
});
