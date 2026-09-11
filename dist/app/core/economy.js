export const STARTING_COINS = 9999;
export const SHOP_CATEGORIES = ["outfits", "items", "furniture", "scenes"];
const DEFAULT_PRICES = {
  outfits: 360,
  items: 120,
  furniture: 300,
  scenes: 1200,
};
const integer = (value, fallback = 0) =>
  Number.isFinite(value)
    ? Math.min(99999999, Math.max(0, Math.floor(value)))
    : fallback;
export function priceOf(pack, category, id) {
  if (!SHOP_CATEGORIES.includes(category)) throw new Error("商品类别不存在");
  const product = pack[category].find((item) => item.id === id);
  if (!product) throw new Error("商品不存在");
  return integer(product.price, DEFAULT_PRICES[category]);
}
export function furnitureUsed(state, id) {
  return Object.values(state.layouts)
    .flat()
    .filter((p) => p.furnitureId === id).length;
}
export function furnitureAvailable(state, id) {
  return Math.max(
    0,
    (state.economy?.owned.furniture[id] || 0) - furnitureUsed(state, id),
  );
}
export function owns(state, category, id) {
  if (category === "furniture")
    return (state.economy?.owned.furniture[id] || 0) > 0;
  return state.economy?.owned[category]?.includes(id) || false;
}
export function restoreEconomy(pack, state, value) {
  const existing = value?.version === 1;
  const validIds = (category, ids) =>
    [...new Set(Array.isArray(ids) ? ids : [])].filter((id) =>
      pack[category].some((p) => p.id === id),
    );
  const outfits = validIds(
    "outfits",
    existing
      ? value.owned?.outfits
      : [pack.baseOutfitId, state.selectedOutfitId],
  );
  if (!outfits.includes(pack.baseOutfitId)) outfits.unshift(pack.baseOutfitId);
  const items = validIds(
    "items",
    existing ? value.owned?.items : state.backpack,
  );
  const furnished = pack.scenes
    .filter((s) => state.layouts[s.id]?.length)
    .map((s) => s.id);
  const scenes = validIds(
    "scenes",
    existing
      ? value.owned?.scenes
      : [pack.scenes[0].id, state.viewSceneId, ...furnished],
  );
  if (!scenes.includes(pack.scenes[0].id)) scenes.unshift(pack.scenes[0].id);
  for (const sceneId of furnished)
    if (!scenes.includes(sceneId)) scenes.push(sceneId);
  const furniture = {};
  for (const item of pack.furniture)
    furniture[item.id] = Math.max(
      furnitureUsed(state, item.id),
      Math.min(999, integer(existing ? value.owned?.furniture?.[item.id] : 0)),
    );
  const economy = {
    version: 1,
    coins: existing ? integer(value.coins, STARTING_COINS) : STARTING_COINS,
    owned: { outfits, items, furniture, scenes },
  };
  if (!outfits.includes(state.selectedOutfitId))
    state.selectedOutfitId = pack.baseOutfitId;
  state.backpack = state.backpack.filter((id) => items.includes(id));
  return economy;
}
export function purchase(pack, state, category, id) {
  const price = priceOf(pack, category, id);
  if (!state.economy) throw new Error("商店尚未准备好");
  if (category !== "furniture" && owns(state, category, id))
    throw new Error("已经拥有这件商品");
  if (
    category === "furniture" &&
    (state.economy.owned.furniture[id] || 0) >= 999
  )
    throw new Error("这件家具已经达到数量上限");
  if (state.economy.coins < price) throw new Error("金币不足");
  state.economy.coins -= price;
  if (category === "furniture")
    state.economy.owned.furniture[id] =
      (state.economy.owned.furniture[id] || 0) + 1;
  else state.economy.owned[category].push(id);
  return { category, id, price, balance: state.economy.coins };
}
export function grantImportedAsset(state, category, id) {
  if (category === "furniture")
    state.economy.owned.furniture[id] = Math.max(
      state.economy.owned.furniture[id] || 0,
      furnitureUsed(state, id),
    );
  else if (!owns(state, category, id)) state.economy.owned[category].push(id);
}
