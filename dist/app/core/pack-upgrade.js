// Stable legacy URLs remain available for open pages and self-contained old packs.
export const LEGACY_READING_ASSETS = [
  "base-actions",
  "winter-actions",
  "rain-actions",
  "empty-chair",
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function upgradeReadingRoom(record, bundled) {
  const original = record?.pack;
  if (
    original?.id !== "reading-room" ||
    original.version !== 2 ||
    bundled?.id !== original.id ||
    (record.base && record.base !== "./packs/reading-room/") ||
    !(bundled.revision === "single-frames-3" || bundled.revision?.startsWith("expanded-"))
  )
    return { record, changed: false };
  const pack = structuredClone(original);
  const blobs = record.blobs || {};
  let changed = false;
  // Only replace known built-in definitions; uploaded or customized assets stay local.
  for (const [id, previousDefinitions] of Object.entries(bundled.assetReplacements || {})) {
    const current = pack.assets[id], next = bundled.assets[id];
    if (!current || !next || !Array.isArray(previousDefinitions) ||
        current.width !== next.width || current.height !== next.height ||
        blobs[current.src] || blobs[next.src] || same(current, next) ||
        !previousDefinitions.some(previous => same(current, previous))) continue;
    pack.assets[id] = structuredClone(next);
    changed = true;
  }
  const legacyAsset = (id) => {
    const asset = pack.assets[id];
    return (
      asset?.src === `assets/${id}.png` &&
      asset.width === 1254 &&
      asset.height === 1254 &&
      !blobs[asset.src]
    );
  };
  const legacyFrame = (frame, id, index) =>
    frame?.asset === id &&
    legacyAsset(id) &&
    same(frame.rect, [
      (index % 2) * 627,
      Math.floor(index / 2) * 627,
      627,
      627,
    ]);
  const canAdd = (id) => {
    const asset = bundled.assets[id];
    return (
      asset &&
      !blobs[asset.src] &&
      (!pack.assets[id] || same(pack.assets[id], asset))
    );
  };
  const addFrameAsset = (frame) => {
    pack.assets[frame.asset] = structuredClone(bundled.assets[frame.asset]);
  };

  // Wardrobe previews can be updated independently of furniture or custom clips.
  for (const outfit of pack.outfits) {
    const replacement = bundled.outfits.find(
      (o) => o.id === outfit.id,
    )?.preview;
    if (
      !replacement ||
      !legacyFrame(outfit.preview, `${outfit.id}-actions`, 0) ||
      !canAdd(replacement.asset)
    )
      continue;
    outfit.preview = structuredClone(replacement);
    addFrameAsset(replacement);
    changed = true;
  }
  const replacement = bundled.furniture.find((f) => f.id === "reading-chair");
  for (const furniture of pack.furniture) {
    if (
      furniture.id !== replacement?.id ||
      !legacyFrame(furniture.empty, "empty-chair", 0) ||
      !same(furniture.canvas, { width: 627, height: 627 }) ||
      !same(furniture.pivot, [0.5, 0.94])
    )
      continue;
    const actions = Object.keys(furniture.actions);
    if (
      actions.length !== 2 ||
      !actions.includes("read") ||
      !actions.includes("tea")
    )
      continue;
    const supported = actions.every((actionId) => {
      const variants = furniture.actions[actionId].variants;
      return Object.keys(variants).every((outfitId) => {
        const frames = variants[outfitId].frames;
        return (
          replacement.actions[actionId].variants[outfitId] &&
          frames.length === 2 &&
          frames.every((frame, index) =>
            legacyFrame(
              frame,
              `${outfitId}-actions`,
              (actionId === "read" ? 0 : 2) + index,
            ),
          )
        );
      });
    });
    if (!supported) continue;
    const targetFrames = [
      replacement.empty,
      ...actions.flatMap((actionId) =>
        Object.keys(furniture.actions[actionId].variants).flatMap(
          (outfitId) => replacement.actions[actionId].variants[outfitId].frames,
        ),
      ),
    ];
    if (!targetFrames.every((frame) => canAdd(frame.asset))) continue;
    for (const key of ["empty", "canvas", "pivot", "shadow"])
      furniture[key] = structuredClone(replacement[key]);
    for (const actionId of actions)
      for (const [outfitId, clip] of Object.entries(
        furniture.actions[actionId].variants,
      )) {
        const frames = replacement.actions[actionId].variants[outfitId].frames;
        clip.frames = frames.map((frame, index) => ({
          ...structuredClone(frame),
          duration: clip.frames[index].duration ?? frame.duration,
        }));
      }
    targetFrames.forEach(addFrameAsset);
    changed = true;
  }
  // Built-in additions are merged without replacing custom definitions or uploaded art.
  if (bundled.revision?.startsWith("expanded-") && !Object.keys(blobs).length) {
    // Add built-in destination photos while preserving custom mappings and assets.
    for (const [destinationId, assetId] of Object.entries(bundled.destinationPhotos || {})) {
      if (Object.hasOwn(pack.destinationPhotos || {}, destinationId) || !canAdd(assetId)) continue;
      pack.assets[assetId] = structuredClone(bundled.assets[assetId]);
      pack.destinationPhotos ||= {};
      pack.destinationPhotos[destinationId] = assetId;
      changed = true;
    }
    const referencedBy = (value, result = new Set()) => {
      if (!value || typeof value !== "object") return result;
      if (typeof value.asset === "string") result.add(value.asset);
      if (typeof value.background === "string") result.add(value.background);
      for (const child of Object.values(value)) referencedBy(child, result);
      return result;
    };
    const addAssets = (value) => {
      const ids = [...referencedBy(value)];
      if (!ids.every(canAdd)) return false;
      for (const id of ids) pack.assets[id] = structuredClone(bundled.assets[id]);
      return true;
    };
    for (const outfit of pack.outfits) {
      const next = bundled.outfits.find(o => o.id === outfit.id)?.preview;
      const previous = original.assets[outfit.preview?.asset];
      if (next?.asset !== `${outfit.id}-outfit-local` || outfit.preview?.asset !== `${outfit.id}-outfit` || previous?.src !== `assets/${outfit.id}-outfit.png`) continue;
      if (!addAssets(next)) continue;
      outfit.preview = structuredClone(next);
      changed = true;
    }
    for (const section of ["outfits", "items", "furniture", "scenes"])
      for (const addition of bundled[section]) {
        if (pack[section].some(item => item.id === addition.id)) continue;
        const candidate = structuredClone(addition);
        if (section === "furniture") {
          for (const action of Object.values(candidate.actions))
            for (const outfitId of Object.keys(action.variants))
              if (!pack.outfits.some(o => o.id === outfitId && same(o.preview, bundled.outfits.find(b => b.id === outfitId)?.preview)))
                delete action.variants[outfitId];
          if (Object.values(candidate.actions).some(a => !a.variants[pack.baseOutfitId])) continue;
        }
        if (!addAssets(candidate)) continue;
        pack[section].push(candidate);
        changed = true;
      }
    for (const furniture of pack.furniture) {
      const source = bundled.furniture.find(f => f.id === furniture.id);
      if (!source || !same(source.empty, furniture.empty) || !same(source.canvas, furniture.canvas)) continue;
      for (const [actionId, action] of Object.entries(source.actions)) {
        if (!furniture.actions[actionId]) {
          if (!addAssets(action)) continue;
          furniture.actions[actionId] = structuredClone(action);
          changed = true;
          continue;
        }
        for (const [outfitId, variant] of Object.entries(action.variants)) {
          if (furniture.actions[actionId].variants[outfitId] || !pack.outfits.some(o => o.id === outfitId && same(o.preview, bundled.outfits.find(b => b.id === outfitId)?.preview))) continue;
          if (!addAssets(variant)) continue;
          furniture.actions[actionId].variants[outfitId] = structuredClone(variant);
          changed = true;
        }
      }
    }
  }
  if (!changed) return { record, changed: false };
  const referenced = new Set(pack.scenes.map((s) => s.background));
  if (pack.defaultPhotoAsset) referenced.add(pack.defaultPhotoAsset);
  for (const assetId of Object.values(pack.destinationPhotos || {})) referenced.add(assetId);
  const findFrames = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.asset === "string") referenced.add(value.asset);
    for (const child of Object.values(value)) findFrames(child);
  };
  for (const section of ["outfits", "furniture", "items", "postcards"])
    findFrames(pack[section]);
  for (const id of LEGACY_READING_ASSETS)
    if (legacyAsset(id) && !referenced.has(id)) delete pack.assets[id];
  if (!LEGACY_READING_ASSETS.some((id) => referenced.has(id)))
    pack.revision = bundled.revision;
  if (bundled.imageEncoding && !Object.keys(blobs).length &&
      Object.entries(pack.assets).every(([id, asset]) => same(asset, bundled.assets[id]))) {
    pack.imageEncoding = structuredClone(bundled.imageEncoding);
    pack.assetReplacements = structuredClone(bundled.assetReplacements || {});
  }
  return { record: { ...record, pack }, changed: true };
}
