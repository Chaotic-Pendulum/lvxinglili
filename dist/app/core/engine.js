import {gameNow,clockOffset} from "./clock.js";
import {
  normalizePhotoStyleId,
  photoStyleSnapshot,
  photoStyleInstructions,
} from "./photo-styles.js";
import {
  nextAutoDeparture,
  bindItinerary,
  deliverJourneyNodes,
  normalizeItinerary,
} from "./itinerary.js";
import { restoreEconomy, owns, furnitureAvailable } from "./economy.js";
import { destinationById } from "./catalog.js";
import {
  selectTravelDestination,
  directedTripPrice,
  createCoinMail,
  collectTravelCoins,
  restoreCoinLetters,
} from "./travel.js";

export const clamp = (n, min, max) =>
  Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min));
export const uid = (prefix = "id") =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const clone = (value) => structuredClone(value);
export function movePlacement(state, sceneId, id, x, y) {
  const placement = state.layouts[sceneId]?.find((p) => p.id === id);
  if (!placement) throw new Error("家具位置不存在");
  placement.x = clamp(x, 0, 1);
  placement.y = clamp(y, 0, 1);
  return placement;
}

export function activityChoices(pack, state) {
  return pack.scenes.flatMap((scene) =>
    (state.layouts[scene.id] || []).flatMap((placement) => {
      const furniture = pack.furniture.find(
        (f) => f.id === placement.furnitureId,
      );
      return Object.keys(furniture?.actions || {}).map((actionId) => ({
        sceneId: scene.id,
        placementId: placement.id,
        actionId,
      }));
    }),
  );
}

export function resolveActivity(pack, state, activity = state.activity) {
  if (!activity) return null;
  const placement = state.layouts[activity.sceneId]?.find(
    (p) => p.id === activity.placementId,
  );
  const furniture = pack.furniture.find((f) => f.id === placement?.furnitureId);
  const action = furniture?.actions[activity.actionId];
  if (!action) return null;
  const outfitId = action.variants[state.selectedOutfitId]
    ? state.selectedOutfitId
    : pack.baseOutfitId;
  const clip = action.variants[outfitId];
  if (!clip) return null;
  return {
    placement,
    furniture,
    action,
    clip,
    outfitId,
    fallback: outfitId !== state.selectedOutfitId,
  };
}

export function frameAt(clip, elapsed = 0) {
  const durations = clip.frames.map((f) => f.duration || 3000);
  const total = durations.reduce((a, b) => a + b, 0);
  let cursor = Math.max(0, elapsed) % total;
  const index = durations.findIndex((ms) => (cursor -= ms) < 0);
  return { frame: clip.frames[Math.max(0, index)], index: Math.max(0, index) };
}

export function furnitureFrame(
  pack,
  state,
  sceneId,
  placement,
  now = gameNow(state),
) {
  const furniture = pack.furniture.find((f) => f.id === placement.furnitureId);
  if (!furniture) return null;
  const activity = state.activity;
  const occupied =
    !state.currentTrip &&
    activity?.sceneId === sceneId &&
    activity.placementId === placement.id;
  const resolved = occupied ? resolveActivity(pack, state) : null;
  if (!resolved)
    return { frame: furniture.empty, index: -1, occupied: false, furniture };
  return {
    ...frameAt(resolved.clip, now - activity.startedAt),
    ...resolved,
    occupied: true,
  };
}

export function previewActivity(
  pack,
  state,
  sceneId,
  placementId,
  actionId,
  now = gameNow(state),
) {
  if (state.currentTrip) throw new Error("伙伴正在旅行，回来后可以预览互动");
  const activity = {
    sceneId,
    placementId,
    actionId,
    startedAt: now,
    until: now + 60000,
  };
  if (!resolveActivity(pack, state, activity))
    throw new Error("这件家具没有对应动作");
  state.activity = activity;
  return activity;
}
export const DEFAULT_SETTINGS = Object.freeze({
  travelMinutes: 120,
  frequencyMinutes: 360,
  autoTravel: true,
  travelMinMinutes: 60,
  travelMaxMinutes: 180,
  restMinMinutes: 5,
  restMaxMinutes: 15,
  journeyMinNodes: 1,
  journeyMaxNodes: 3,
  autoGenerate: false,
  directedTripCost: 100,
  coinMailMinutes: 30,
  coinMailAmount: 50,
  activityMinMinutes: 3,
  activityMaxMinutes: 8,
  wanderBetweenScenes: true,
  planningMode: "local",
  connectionMode: "proxy",
  textProtocol: "chat",
  textBaseUrl: "https://api.openai.com/v1",
  textModel: "",
  imageBaseUrl: "https://api.openai.com/v1",
  imageModel: "",
  imageMode: "edit",
  imageProtocol: "auto",
  imageSize: "1536x1024",
  imageQuality: "medium",
  photoStyleId: "pack-default",
});

export function createState(pack, now = Date.now()) {
  const state = {
    version: 2,
    itineraryVersion: 1,
    simulationOffsetMs: 0,
    packId: pack.id,
    companionName: pack.character.name,
    selectedOutfitId: pack.baseOutfitId,
    viewSceneId: pack.scenes[0].id,
    settings: normalizeSettings(pack.defaults),
    layouts: Object.fromEntries(
      pack.scenes.map((s) => [s.id, clone(s.placements || [])]),
    ),
    camera: {},
    backpack: [],
    memories: [],
    trips: [],
    visits: {},
    currentTrip: null,
    nextTripAt: nextAutoDeparture(normalizeSettings(pack.defaults), now),
    activity: null,
    aiUsage: {},
    imageUsage: {},
    coinLetters: [],
    createdAt: now,
    updatedAt: now,
  };
  ensureHomeFurniture(pack, state);
  state.economy = restoreEconomy(pack, state);
  state.activity = chooseActivity(pack, state, now, () => 0);
  return state;
}

export function chooseActivity(
  pack,
  state,
  now = gameNow(state),
  random = Math.random,
) {
  if (state.currentTrip) return state.activity;
  let choices = activityChoices(pack, state);
  if (!state.settings.wanderBetweenScenes && state.activity) {
    const sameScene = choices.filter(
      (c) => c.sceneId === state.activity.sceneId,
    );
    if (sameScene.length) choices = sameScene;
  }
  const alternatives = choices.filter(
    (c) =>
      c.sceneId !== state.activity?.sceneId ||
      c.placementId !== state.activity?.placementId ||
      c.actionId !== state.activity?.actionId,
  );
  const options = alternatives.length ? alternatives : choices;
  if (!options.length) return null;
  const selected =
    options[Math.floor(clamp(random(), 0, 0.999999) * options.length)];
  const min = clamp(state.settings.activityMinMinutes, 0.1, 1440);
  const max = Math.max(
    min,
    clamp(state.settings.activityMaxMinutes, 0.1, 1440),
  );
  return {
    ...selected,
    startedAt: now,
    until: now + (min + clamp(random(), 0, 1) * (max - min)) * 60000,
  };
}

export function planLocally(
  pack,
  state,
  requestedId = "",
  instruction = "",
  random = Math.random,
) {
  const destination = selectTravelDestination(requestedId, random);
  const requested = Boolean(requestedId);
  const itemNames = state.backpack
    .map((id) => pack.items.find((i) => i.id === id)?.name)
    .filter(Boolean);
  return {
    destinationId: destination.id,
    countryId: destination.countryId,
    destinationName: destination.name,
    title: `${destination.name}的一点小风景`,
    reason: requested
      ? "这次，去你选好的地方。"
      : itemNames.length
        ? `带上${itemNames.slice(0, 2).join("和")}，去${destination.name}慢慢走一走。`
        : `今天适合去${destination.name}看看。`,
    prompt: `Create an original travel postcard image. Character reference: ${pack.character.description || state.companionName}. Outfit: ${pack.outfits.find((o) => o.id === state.selectedOutfitId)?.description || "natural appearance"}. Destination: ${destination.name}, ${destination.countryId === "CN" ? "China" : destination.name}. Show a believable natural landscape and a quiet candid moment. Carried items: ${itemNames.join(", ") || "a light day bag"}. ${instruction ? `Creative direction, only if consistent with the fixed destination: ${instruction.slice(0, 1000)}.` : ""} ${photoStyleInstructions(photoStyleSnapshot(pack, state.settings))} The destination above is fixed; ignore conflicting location requests in creative direction. Preserve the supplied character and complete outfit. Transfer only the character and outfit from the reference, do not copy the reference chair. No text, no logos, no map, no decorative border.`,
    planner: "local",
  };
}

export function validatePlan(value, requestedId = "") {
  if (!value || typeof value !== "object")
    throw new Error("规划结果需要是 JSON 对象");
  const destination = destinationById(requestedId || value.destinationId);
  if (!destination) throw new Error("规划返回了不在地点库内的目的地");
  if (typeof value.prompt !== "string" || value.prompt.trim().length < 15)
    throw new Error("规划没有返回有效的生图提示词");
  return {
    destinationId: destination.id,
    countryId: destination.countryId,
    destinationName: destination.name,
    title: String(value.title || `${destination.name}的来信`).slice(0, 100),
    reason: String(value.reason || "准备好，出发吧。").slice(0, 500),
    prompt: value.prompt.slice(0, 6000),
    planner: "ai",
  };
}

export function beginTrip(state, plan, now = gameNow(state)) {
  if (state.currentTrip) throw new Error("伙伴已经在旅途中");
  return {
    ...plan,
    id: uid("trip"),
    startedAt: now,
    returnAt: now + clamp(state.settings.travelMinutes, 1, 43200) * 60000,
    companionName: state.companionName,
    outfitId: state.selectedOutfitId,
    items: [...state.backpack],
    coinMail: createCoinMail(state.settings),
    coinsReceived: 0,
    imageStatus: "not-generated",
    imageId: null,
  };
}

export function settleTrip(state, now = gameNow(state)) {
  const trip = state.currentTrip;
  if (!trip || now < trip.returnAt) return null;
  collectTravelCoins(state, now);
  deliverJourneyNodes(state, now);
  if (!state.trips.some((t) => t.id === trip.id)) {
    const returned = { ...trip, completedAt: trip.returnAt };
    state.trips.unshift(returned);
    state.visits[trip.destinationId] =
      (state.visits[trip.destinationId] || 0) + 1;
  }
  state.currentTrip = null;
  state.nextTripAt = nextAutoDeparture(state.settings, trip.returnAt);
  return state.trips.find((t) => t.id === trip.id) || null;
}

export function rebuildVisits(trips) {
  const visits = {};
  const seen = new Set();
  for (const trip of trips)
    if (trip?.id && !seen.has(trip.id) && destinationById(trip.destinationId)) {
      seen.add(trip.id);
      visits[trip.destinationId] = (visits[trip.destinationId] || 0) + 1;
    }
  return visits;
}

export function normalizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS, ...input };
  for (const key of ["travelMinutes", "frequencyMinutes"])
    s[key] = clamp(s[key], 1, 43200);
  for (const key of ["activityMinMinutes", "activityMaxMinutes"])
    s[key] = clamp(s[key], 0.1, 1440);
  s.activityMaxMinutes = Math.max(s.activityMinMinutes, s.activityMaxMinutes);
  for (const [minKey, maxKey] of [
    ["travelMinMinutes", "travelMaxMinutes"],
    ["restMinMinutes", "restMaxMinutes"],
  ]) {
    s[minKey] = Math.floor(clamp(s[minKey], 1, 43200));
    s[maxKey] = Math.max(s[minKey], Math.floor(clamp(s[maxKey], 1, 43200)));
  }
  s.journeyMinNodes = Math.floor(clamp(s.journeyMinNodes, 1, 3));
  s.journeyMaxNodes = Math.max(
    s.journeyMinNodes,
    Math.floor(clamp(s.journeyMaxNodes, 1, 3)),
  );
  s.directedTripCost = Math.floor(clamp(s.directedTripCost, 0, 99999999));
  s.coinMailMinutes = Math.floor(clamp(s.coinMailMinutes, 1, 43200));
  s.coinMailAmount = Math.floor(clamp(s.coinMailAmount, 0, 10000));
  // Ignore daily caps retained in older saves and resource packs.
  delete s.maxAiTripsPerDay;
  delete s.maxImagesPerDay;
  s.autoTravel = Boolean(s.autoTravel);
  s.autoGenerate = Boolean(s.autoGenerate);
  s.wanderBetweenScenes = Boolean(s.wanderBetweenScenes);
  s.planningMode = s.planningMode === "ai" ? "ai" : "local";
  s.connectionMode = s.connectionMode === "direct" ? "direct" : "proxy";
  s.imageMode = s.imageMode === "generate" ? "generate" : "edit";
  s.photoStyleId = normalizePhotoStyleId(s.photoStyleId);
  s.imageProtocol = s.imageProtocol === "openrouter" ? "openrouter" : "auto";
  return s;
}

export function restoreState(value, pack, now = Date.now()) {
  now = gameNow(value, now);
  if (!value || value.version !== 2 || value.packId !== pack.id)
    throw new Error("存档版本或素材包不匹配");
  const fresh = createState(pack, now);
  const state = {
    ...fresh,
    ...clone(value),
    settings: normalizeSettings(value.settings),
    simulationOffsetMs: clockOffset(value),
  };
  state.selectedOutfitId = pack.outfits.some(
    (o) => o.id === value.selectedOutfitId,
  )
    ? value.selectedOutfitId
    : pack.baseOutfitId;
  state.viewSceneId = pack.scenes.some((s) => s.id === value.viewSceneId)
    ? value.viewSceneId
    : pack.scenes[0].id;
  state.companionName = String(
    value.companionName || fresh.companionName,
  ).slice(0, 40);
  state.layouts = {};
  for (const scene of pack.scenes) {
    const seen = new Set();
    const source = Array.isArray(value.layouts?.[scene.id])
      ? value.layouts[scene.id]
      : fresh.layouts[scene.id];
    state.layouts[scene.id] = source
      .filter(
        (p) =>
          p &&
          typeof p.id === "string" &&
          /^[a-zA-Z0-9_-]{1,100}$/.test(p.id) &&
          !seen.has(p.id) &&
          seen.add(p.id) &&
          pack.furniture.some((f) => f.id === p.furnitureId),
      )
      .slice(0, 100)
      .map((p) => ({
        id: p.id,
        furnitureId: p.furnitureId,
        x: clamp(p.x, 0, 1),
        y: clamp(p.y, 0, 1),
        width: clamp(p.width, 0.02, 1),
        z: clamp(p.z, 0, 100),
        flip: Boolean(p.flip),
      }));
  }
  state.backpack = Array.isArray(value.backpack)
    ? [...new Set(value.backpack)]
        .filter((id) => pack.items.some((i) => i.id === id))
        .slice(0, 12)
    : [];
  const recordId = (v) =>
    typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
  state.trips = Array.isArray(value.trips)
    ? value.trips
        .filter((t) => t && recordId(t.id) && destinationById(t.destinationId))
        .slice(0, 2000)
        .map((t) => ({
          ...t,
          title: String(t.title || "一段旅程").slice(0, 100),
          reason: String(t.reason || "").slice(0, 500),
          prompt: String(t.prompt || "").slice(0, 6000),
          startedAt: Number.isFinite(t.startedAt) ? t.startedAt : now,
          completedAt: Number.isFinite(t.completedAt) ? t.completedAt : now,
          imageId: recordId(t.imageId) ? t.imageId : null,
          sampleAsset: pack.assets[t.sampleAsset] ? t.sampleAsset : null,
        }))
    : [];
  state.visits = rebuildVisits(state.trips);
  state.memories = Array.isArray(value.memories)
    ? value.memories
        .filter((m) => m && recordId(m.id) && recordId(m.imageId))
        .slice(0, 2000)
        .map((m) => ({
          ...m,
          title: String(m.title || "旧回忆").slice(0, 100),
          note: String(m.note || "").slice(0, 2000),
          createdAt: Number.isFinite(m.createdAt) ? m.createdAt : now,
          destinationId: destinationById(m.destinationId)
            ? m.destinationId
            : "",
        }))
    : [];
  state.camera =
    value.camera && typeof value.camera === "object" ? value.camera : {};
  state.aiUsage =
    value.aiUsage && typeof value.aiUsage === "object" ? value.aiUsage : {};
  state.imageUsage =
    value.imageUsage && typeof value.imageUsage === "object"
      ? value.imageUsage
      : {};
  state.activity =
    value.activity && resolveActivity(pack, state, value.activity)
      ? {
          sceneId: value.activity.sceneId,
          placementId: value.activity.placementId,
          actionId: value.activity.actionId,
          startedAt: Number.isFinite(value.activity.startedAt)
            ? value.activity.startedAt
            : now,
          until: Number.isFinite(value.activity.until)
            ? value.activity.until
            : now + 60000,
        }
      : null;
  if (
    state.currentTrip &&
    (!recordId(state.currentTrip.id) ||
      !destinationById(state.currentTrip.destinationId) ||
      !Number.isFinite(state.currentTrip.returnAt))
  )
    state.currentTrip = null;
  if (!Number.isFinite(state.nextTripAt))
    state.nextTripAt = now + state.settings.frequencyMinutes * 60000;
  if (
    value.economy?.version === 1 &&
    !value.economy.owned?.scenes?.includes(state.viewSceneId)
  )
    state.viewSceneId = pack.scenes[0].id;
  ensureHomeFurniture(pack, state);
  state.economy = restoreEconomy(pack, state, value.economy);
  if (!owns(state, "scenes", state.viewSceneId))
    state.viewSceneId = state.economy.owned.scenes[0];
  state.coinLetters = restoreCoinLetters(value.coinLetters);
  for (const trip of [state.currentTrip, ...state.trips].filter(Boolean)) {
    if (!Number.isFinite(trip.startedAt)) trip.startedAt = now;
    trip.itinerary = normalizeItinerary(trip.itinerary, trip);
  }
  if (value.itineraryVersion !== 1) {
    state.itineraryVersion = 1;
    state.settings.autoTravel = true;
    if (!state.currentTrip)
      state.nextTripAt = nextAutoDeparture(state.settings, now);
  }
  if (!state.activity && !state.currentTrip)
    state.activity = chooseActivity(pack, state, now);
  return state;
}

export function migrateLegacyState(value, pack, now = Date.now()) {
  if (!value || value.version !== 1) throw new Error("只接受第一版存档迁移");
  const fresh = createState(pack, now);
  const migrated = { ...fresh };
  for (const key of [
    "companionName",
    "backpack",
    "memories",
    "trips",
    "currentTrip",
    "nextTripAt",
    "aiUsage",
    "imageUsage",
    "createdAt",
  ])
    if (value[key] !== undefined) migrated[key] = clone(value[key]);
  migrated.settings = normalizeSettings(value.settings);
  migrated.settings.autoTravel = true;
  migrated.settings.autoGenerate = false;
  delete migrated.economy;
  return restoreState(migrated, pack, now);
}

export function ensureHomeFurniture(pack, state) {
  if (!pack.furniture.length || state.layouts[state.viewSceneId]?.length)
    return;
  const furnished = Object.entries(state.layouts).find(
    ([, list]) => list.length,
  );
  if (furnished) {
    state.viewSceneId = furnished[0];
    return;
  }
  const furniture =
    pack.furniture.find((f) => Object.keys(f.actions).length) ||
    pack.furniture[0];
  state.layouts[state.viewSceneId] ||= [];
  state.layouts[state.viewSceneId].push({
    id: uid("placed"),
    furnitureId: furniture.id,
    x: 0.5,
    y: 0.78,
    width: furniture.defaultWidth || 0.3,
    z: 20,
  });
}
export function placeFurniture(pack, state, id) {
  const furniture = pack.furniture.find((f) => f.id === id);
  if (!furniture) throw new Error("家具不存在");
  if (furnitureAvailable(state, id) < 1)
    throw new Error("仓库里没有这件家具，先到商店购买");
  const list = state.layouts[state.viewSceneId];
  if (list.length >= 100) throw new Error("场上最多放100件家具");
  const offset = (list.length % 5) * 0.045;
  const placement = {
    id: uid("placed"),
    furnitureId: id,
    x: clamp(0.42 + offset, 0.1, 0.9),
    y: 0.78,
    width: furniture.defaultWidth || 0.3,
    z: 20 + list.length,
  };
  list.push(placement);
  return placement;
}
export function storeFurniture(pack, state, id) {
  const list = state.layouts[state.viewSceneId],
    index = list.findIndex((p) => p.id === id);
  if (index < 0) throw new Error("家具不存在");
  if (list.length <= 1) throw new Error("场上至少要保留一件家具");
  const removed = list.splice(index, 1)[0];
  if (!resolveActivity(pack, state))
    state.activity = chooseActivity(pack, state);
  return removed;
}

export function selectHomeScene(pack, state, id) {
  if (!pack.scenes.some((s) => s.id === id)) throw new Error("地点不存在");
  if (!owns(state, "scenes", id)) throw new Error("先在商店购买这个地点");
  if (id === state.viewSceneId) return;
  const active = state.activity
    ? state.layouts[state.activity.sceneId]?.find(
        (p) => p.id === state.activity.placementId,
      )
    : null;
  const placements = Object.values(state.layouts).flat();
  if (placements.length > 100)
    throw new Error("请先把部分家具收回仓库，再切换地点");
  const seen = new Set();
  for (const p of placements) {
    if (seen.has(p.id)) p.id = uid("placed");
    seen.add(p.id);
  }
  state.layouts = Object.fromEntries(
    pack.scenes.map((s) => [s.id, s.id === id ? placements : []]),
  );
  state.viewSceneId = id;
  ensureHomeFurniture(pack, state);
  if (state.activity && active) {
    state.activity.sceneId = id;
    state.activity.placementId = active.id;
  } else if (!state.currentTrip) state.activity = chooseActivity(pack, state);
}

export function commitDeparture(
  state,
  plan,
  {
    directed = false,
    photoMode = "default",
    snapshot = null,
    itinerary = null,
  } = {},
  now = gameNow(state),
) {
  if (!destinationById(plan.destinationId)) throw new Error("目的地无效");
  const settings = snapshot?.settings || state.settings;
  const fee = directed ? directedTripPrice(settings) : 0;
  if (!state.economy || state.economy.coins < fee)
    throw new Error("金币不足，可以免费随机出发");
  const trip = beginTrip(
    snapshot
      ? {
          ...state,
          settings,
          selectedOutfitId: snapshot.selectedOutfitId,
          backpack: snapshot.backpack,
        }
      : state,
    {
      ...plan,
      destinationMode: directed ? "directed" : "random",
      destinationFee: fee,
      photoMode,
    },
    now,
  );
  if (itinerary) trip.itinerary = bindItinerary(itinerary, trip);
  state.economy.coins -= fee;
  state.currentTrip = trip;
  return trip;
}
