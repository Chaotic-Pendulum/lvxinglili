import {gameNow} from "./clock.js";
import { DESTINATIONS, destinationById } from "./catalog.js";
const whole = (n, fallback, min = 0, max = 99999999) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
export function selectTravelDestination(
  requestedId = "",
  random = Math.random,
) {
  if (requestedId) {
    const destination = destinationById(requestedId);
    if (!destination) throw new Error("请选择有效的国家或中国省级地区");
    return destination;
  }
  return DESTINATIONS[
    Math.min(
      DESTINATIONS.length - 1,
      Math.max(0, Math.floor(random() * DESTINATIONS.length)),
    )
  ];
}
export function directedTripPrice(settings) {
  return whole(settings.directedTripCost, 100);
}
export function apiAvailability(settings, secrets = {}, runtime = null) {
  const usable = (type) => {
    const model = settings[`${type}Model`],
      base = settings[`${type}BaseUrl`];
    if (typeof model !== "string" || !model.trim() || typeof base !== "string")
      return false;
    try {
      if (!["https:", "http:"].includes(new URL(base).protocol)) return false;
    } catch {
      return false;
    }
    const sessionKey = Boolean(secrets[`${type}Key`]?.trim());
    return settings.connectionMode === "direct"
      ? sessionKey
      : Boolean(
          runtime?.proxy && (sessionKey || (runtime?.[`${type}Configured`] || (new URL(base).hostname === "openrouter.ai" && runtime?.openrouterConfigured))),
        );
  };
  return { text: usable("text"), image: usable("image") };
}
export function defaultPhotoFor(pack, destinationId) {
  const exact = pack.destinationPhotos?.[destinationId];
  if (exact && pack.assets[exact]) return { asset: exact, placeholder: false };
  const fallback =
    pack.defaultPhotoAsset ||
    pack.postcards?.[0]?.sprite?.asset ||
    pack.scenes[0].background;
  return {
    asset: pack.assets[fallback] ? fallback : pack.scenes[0].background,
    placeholder: true,
  };
}
export function createCoinMail(settings) {
  return {
    intervalMinutes: whole(settings.coinMailMinutes, 30, 1, 43200),
    amount: whole(settings.coinMailAmount, 50, 0, 10000),
    claimed: 0,
  };
}
export function restoreCoinLetters(value) {
  return (Array.isArray(value) ? value : [])
    .filter(
      (m) =>
        m &&
        typeof m.id === "string" &&
        typeof m.tripId === "string" &&
        Number.isFinite(m.receivedAt),
    )
    .slice(0, 100)
    .map((m) => ({
      id: m.id.slice(0, 120),
      tripId: m.tripId.slice(0, 100),
      destinationName: String(m.destinationName || "旅途中").slice(0, 80),
      receivedAt: m.receivedAt,
      coins: whole(m.coins, 0),
      count: whole(m.count, 1, 1),
      lastIndex: whole(m.lastIndex, 0),
    }));
}
export function collectTravelCoins(state, now = gameNow(state)) {
  const trip = state.currentTrip;
  if (
    !trip ||
    !state.economy ||
    !Number.isFinite(trip.startedAt) ||
    !Number.isFinite(trip.returnAt)
  )
    return null;
  const fallback = createCoinMail(state.settings),
    mail = (trip.coinMail ||= fallback);
  mail.intervalMinutes = whole(
    mail.intervalMinutes,
    fallback.intervalMinutes,
    1,
    43200,
  );
  mail.amount = whole(mail.amount, fallback.amount, 0, 10000);
  state.coinLetters ||= [];
  const recorded = state.coinLetters
    .filter((m) => m.tripId === trip.id)
    .reduce((n, m) => Math.max(n, m.lastIndex || 0), 0);
  const claimed = Math.max(whole(mail.claimed, 0), recorded);
  mail.claimed = claimed;
  const elapsed = Math.max(0, Math.min(now, trip.returnAt) - trip.startedAt);
  const due = Math.floor(elapsed / (mail.intervalMinutes * 60000));
  if (due <= claimed) return null;
  const count = due - claimed,
    coins = Math.min(
      count * mail.amount,
      Math.max(0, 99999999 - state.economy.coins),
    );
  mail.claimed = due;
  trip.coinsReceived = whole(trip.coinsReceived, 0) + coins;
  state.economy.coins += coins;
  if (!coins) return null;
  const letter = {
    id: `${trip.id}-mail-${due}`,
    tripId: trip.id,
    destinationName: trip.destinationName,
    receivedAt: trip.startedAt + due * mail.intervalMinutes * 60000,
    coins,
    count,
    lastIndex: due,
  };
  state.coinLetters.unshift(letter);
  state.coinLetters = state.coinLetters.slice(0, 100);
  return letter;
}

export function travelApiPolicy(state, secrets = {}, runtime = null) {
  const configured = apiAvailability(state.settings, secrets, runtime);
  return { image: configured.image, text: configured.image && configured.text };
}
