import {gameNow} from "./clock.js";
import { photoStyleSnapshot, photoStyleInstructions } from "./photo-styles.js";
const integer = (n, fallback, min, max) =>
  Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
const pick = (min, max, random) =>
  min + Math.floor(Math.max(0, Math.min(0.999999, random())) * (max - min + 1));
export function randomTripMinutes(settings, random = Math.random) {
  const min = integer(settings.travelMinMinutes, 60, 1, 43200),
    max = Math.max(min, integer(settings.travelMaxMinutes, 180, 1, 43200));
  return pick(min, max, random);
}
export function nextAutoDeparture(
  settings,
  now = Date.now(),
  random = Math.random,
) {
  const min = integer(settings.restMinMinutes, 5, 1, 43200),
    max = Math.max(min, integer(settings.restMaxMinutes, 15, 1, 43200));
  return now + pick(min, max, random) * 60000;
}
export function createItinerary(
  pack,
  state,
  destination,
  durationMinutes,
  random = Math.random,
  nodeBudget = 3,
  remarks = "",
) {
  const min = integer(state.settings.journeyMinNodes, 1, 1, 3),
    max = Math.max(min, integer(state.settings.journeyMaxNodes, 3, 1, 3));
  const count = Math.min(pick(min, max, random), Math.max(1, nodeBudget));
  const photoStyle = photoStyleSnapshot(pack, state.settings);
  const outfit = pack.outfits.find((o) => o.id === state.selectedOutfitId);
  const items = state.backpack
    .map((id) => pack.items.find((i) => i.id === id))
    .filter(Boolean)
    .map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description || "",
      tags: i.tags || [],
    }));
  const stages = count === 1 ? [1] : count === 2 ? [0, 2] : [0, 1, 2];
  const messages = [
    `到${destination.name}了，先慢慢看看周围的风景。`,
    `在${destination.name}逛了一会儿，把喜欢的这一刻寄给你。`,
    `${destination.name}的这一程很舒服，歇一会儿，再慢慢回家。`,
  ];
  const activities = [
    "quietly taking in the surroundings",
    "pausing to enjoy the local scenery",
    "having a quiet rest before heading home",
  ];
  const itinerary = {
    version: 1,
    destinationId: destination.id,
    destinationName: destination.name,
    durationMinutes,
    planner: "local",
    remarks: remarks.slice(0, 1000),
    title: `${destination.name}的慢旅行`,
    reason: `去${destination.name}慢慢看看。`,
    story: `${state.companionName}带着喜欢的东西去${destination.name}，沿途停下来感受风景，再平静地回家。`,
    continuity:
      "One continuous travel diary, consistent soft daylight, weather, colors, and clothing throughout.",
    character: pack.character.description || state.companionName,
    outfit: {
      id: state.selectedOutfitId,
      name: outfit?.name || "",
      description: outfit?.description || "",
    },
    items,
    photoStyle,
    style: photoStyleInstructions(photoStyle),
    nodes: stages.map((stage, index) => ({
      index,
      offsetMs: Math.round(
        durationMinutes *
          60000 *
          ((index + 1) / (count + 1) + ((random() - 0.5) * 0.24) / (count + 1)),
      ),
      place: `${destination.name}的一处安静风景`,
      activity: activities[stage],
      scene:
        "A plausible peaceful outdoor landscape in the destination, without signs or text.",
      message: messages[stage],
      imageDirection:
        "One quiet candid moment, the companion naturally integrated in the scene.",
    })),
  };
  return completePrompts(itinerary);
}
function text(value, max, label, min = 1) {
  if (typeof value !== "string" || value.trim().length < min)
    throw new Error(`行程缺少${label}`);
  return value.trim().slice(0, max);
}
export function validateItinerary(value, skeleton) {
  if (
    !value ||
    value.destinationId !== skeleton.destinationId ||
    !Array.isArray(value.nodes) ||
    value.nodes.length !== skeleton.nodes.length
  )
    throw new Error("AI 行程的目的地或节点数量不匹配");
  const result = {
    ...structuredClone(skeleton),
    planner: "ai",
    title: text(value.title, 100, "标题"),
    reason: text(value.reason, 500, "简介"),
    story: text(value.story, 1200, "故事线"),
    continuity: text(value.continuity, 1000, "画面连续性"),
  };
  result.nodes = value.nodes.map((node, index) => ({
    ...skeleton.nodes[index],
    place: text(node.place, 120, "地点"),
    activity: text(node.activity, 180, "活动"),
    scene: text(node.scene, 1000, "场景", 10),
    message: text(node.message, 500, "来信"),
    imageDirection:
      typeof node.imageDirection === "string"
        ? node.imageDirection.slice(0, 500)
        : skeleton.nodes[index].imageDirection,
  }));
  return completePrompts(result);
}
export function completePrompts(plan) {
  const route = plan.nodes
    .map((node, index) => `${index + 1}. ${node.place}: ${node.activity}`)
    .join("; ");
  plan.nodes = plan.nodes.map((node, index) => ({
    ...node,
    prompt: [
      "Create exactly one original travel postcard image, not a grid or collage.",
      `Locked destination: ${plan.destinationName} (${plan.destinationId}).`,
      `This is stop ${index + 1} of ${plan.nodes.length} in ONE continuous trip. Full story: ${plan.story}`,
      `Shared visual continuity for ALL stops: ${plan.continuity}`,
      `Original character: ${plan.character}. Fixed outfit: ${plan.outfit.name}; ${plan.outfit.description}.`,
      `Fixed carried items: ${plan.items.map((i) => `${i.name}: ${i.description}`).join("; ") || "none"}. Do not change the outfit or add unrelated equipment.`,
      `Planned route for continuity: ${route}. Depict ONLY the current stop.`,
      `Current location: ${node.place}. Current activity: ${node.activity}. Scene: ${node.scene}.`,
      `The accompanying message is: ${node.message}. The image must depict the SAME event as this message, but never render the message as writing.`,
      `Composition: ${node.imageDirection}. Style: ${plan.style}.`,
      `Personal note, only when consistent with this fixed event, destination and outfit: ${plan.remarks || ""}.`,
      "Integrate the referenced dressed character naturally into the scene: match camera perspective, scale, light direction, cast and contact shadows, and correct occlusion. The character must not look pasted on.",
      "Keep character identity, clothing, weather and art direction consistent with the trip and supplied reference. No furniture from the character reference. No text, logo, watermark or map.",
    ]
      .join("\n")
      .slice(0, 10000),
  }));
  return plan;
}
export function bindItinerary(plan, trip) {
  return {
    ...structuredClone(plan),
    nodes: plan.nodes.map((node, index) => ({
      ...node,
      id: `${trip.id}-node-${index + 1}`,
      deliverAt: trip.startedAt + node.offsetMs,
      triggeredAt: null,
      deliveredAt: null,
      imageId: null,
      imageStatus: "scheduled",
    })),
  };
}
export function deliverJourneyNodes(state, now = gameNow(state)) {
  const trip = state.currentTrip;
  if (!trip?.itinerary?.nodes) return [];
  const triggered = [];
  for (const node of trip.itinerary.nodes) {
    if (
      node.triggeredAt != null ||
      node.deliveredAt != null ||
      now < Math.min(node.deliverAt, trip.returnAt)
    )
      continue;
    node.triggeredAt = Math.min(node.deliverAt, trip.returnAt);
    node.imageStatus = trip.photoMode === "generated" ? "queued" : "default";
    if (node.imageStatus === "default") node.deliveredAt = node.triggeredAt;
    triggered.push({ trip, node });
  }
  return triggered;
}
export function fallbackJourney(trip, reason, now = Date.now()) {
  trip.photoMode = "default";
  trip.fallbackReason = String(reason || "").slice(0, 500);
  const fallback = trip.fallbackItinerary
    ? completePrompts(structuredClone(trip.fallbackItinerary))
    : null;
  const delivered = [];
  for (const node of trip.itinerary?.nodes || []) {
    if (node.deliveredAt != null) continue;
    const local = fallback?.nodes[node.index];
    if (local)
      for (const key of [
        "place",
        "activity",
        "scene",
        "message",
        "imageDirection",
        "prompt",
      ])
        node[key] = local[key];
    else {
      node.message = `在${trip.destinationName}慢慢看看风景，把这一刻寄给你。`;
      node.place = trip.destinationName;
    }
    node.fallbackReason = trip.fallbackReason;
    delete node.imageError;
    if (node.triggeredAt != null) {
      node.imageStatus = "default";
      node.deliveredAt = now;
      delivered.push(node);
    }
  }
  return delivered;
}
export function journeyPhotos(state) {
  const trips = [
    ...(state.currentTrip ? [state.currentTrip] : []),
    ...state.trips,
  ];
  return trips.flatMap((trip) => {
    if (!trip.itinerary?.nodes) return trip === state.currentTrip ? [] : [trip];
    return trip.itinerary.nodes
      .filter((node) => node.deliveredAt != null)
      .map((node) => ({
        id: node.id,
        tripId: trip.id,
        nodeId: node.id,
        title: node.place,
        reason: node.message,
        prompt: node.prompt,
        destinationId: trip.destinationId,
        destinationName: trip.destinationName,
        completedAt: node.deliveredAt,
        imageId: node.imageId,
        imageStatus: node.imageStatus,
        sampleAsset: ["queued", "generating"].includes(node.imageStatus)
          ? null
          : node.sampleAsset,
        defaultPhotoPlaceholder: node.defaultPhotoPlaceholder,
      }));
  });
}
export function findJourneyNode(state, id) {
  for (const trip of [state.currentTrip, ...state.trips].filter(Boolean)) {
    const node = trip.itinerary?.nodes?.find((n) => n.id === id);
    if (node) return { trip, node };
  }
  return null;
}
export function normalizeItinerary(plan, trip) {
  if (
    !plan ||
    plan.version !== 1 ||
    plan.destinationId !== trip.destinationId ||
    !Array.isArray(plan.nodes) ||
    plan.nodes.length < 1 ||
    plan.nodes.length > 3
  )
    return null;
  const copy = structuredClone(plan);
  copy.nodes = copy.nodes.map((node, index) => ({
    ...node,
    id: `${trip.id}-node-${index + 1}`,
    index,
    place: String(node.place || trip.destinationName).slice(0, 120),
    message: String(node.message || "慢慢看看风景。").slice(0, 500),
    prompt: String(node.prompt || trip.prompt || "").slice(0, 10000),
    deliverAt: Number.isFinite(node.deliverAt)
      ? Math.max(trip.startedAt, Math.min(trip.returnAt, node.deliverAt))
      : trip.startedAt +
        ((trip.returnAt - trip.startedAt) * (index + 1)) /
          (copy.nodes.length + 1),
    triggeredAt: Number.isFinite(node.triggeredAt)
      ? node.triggeredAt
      : Number.isFinite(node.deliveredAt)
        ? node.deliveredAt
        : null,
    deliveredAt: Number.isFinite(node.deliveredAt) ? node.deliveredAt : null,
    imageId:
      typeof node.imageId === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(node.imageId)
        ? node.imageId
        : null,
    imageStatus: [
      "scheduled",
      "queued",
      "generating",
      "ready",
      "failed",
      "default",
    ].includes(node.imageStatus)
      ? node.imageStatus
      : "scheduled",
  }));
  return copy;
}
