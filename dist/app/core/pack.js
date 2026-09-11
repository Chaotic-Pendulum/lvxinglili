import { PHOTO_STYLES, PACK_STYLE_ID } from "./photo-styles.js";
import { destinationById } from "./catalog.js";
export const LIMITS = {
  fileBytes: 30 * 1024 * 1024,
  totalBytes: 512 * 1024 * 1024,
  entries: 750,
  jsonBytes: 2 * 1024 * 1024,
};
export const safePath = (path) =>
  typeof path === "string" &&
  path.length < 240 &&
  /^[\p{L}\p{N}_\-. /]+$/u.test(path) &&
  !path.startsWith("/") &&
  !path.split("/").some((p) => p === ".." || p === "." || p === "");
const idOk = (v) =>
  typeof v === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
const finite = (v, min, max) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export function validatePack(pack) {
  const errors = [];
  const object = (v) => v && typeof v === "object" && !Array.isArray(v);
  const fail = (ok, message) => {
    if (!ok) errors.push(message);
  };
  if (!object(pack)) return ["素材包需要是 JSON 对象"];
  if (pack.version !== 2)
    return [
      "需要 version: 2 的家具互动素材包；旧版分层素材需先转换为完整互动图",
    ];
  fail(idOk(pack.id), "素材包 id 无效");
  fail(
    typeof pack.name === "string" &&
      pack.name.length > 0 &&
      pack.name.length <= 80,
    "素材包名称需要 1–80 字",
  );
  fail(
    object(pack.character) &&
      idOk(pack.character.id) &&
      typeof pack.character.name === "string",
    "需要一个角色定义 character",
  );
  if (pack.defaults)
    fail(
      object(pack.defaults) &&
        Object.keys(pack.defaults).every((k) =>
          [
            "travelMinutes",
            "frequencyMinutes",
            "activityMinMinutes",
            "activityMaxMinutes",
            "wanderBetweenScenes",
            "directedTripCost",
            "coinMailMinutes",
            "coinMailAmount",
            "travelMinMinutes",
            "travelMaxMinutes",
            "restMinMinutes",
            "restMaxMinutes",
            "journeyMinNodes",
            "journeyMaxNodes",
            "photoStyleId",
          ].includes(k),
        ),
      "资源包默认配置只能包含旅行与日常活动节奏",
    );
  if (pack.defaults?.photoStyleId !== undefined)
    fail(
      pack.defaults.photoStyleId === PACK_STYLE_ID ||
        PHOTO_STYLES.some((style) => style.id === pack.defaults.photoStyleId),
      "未知的旅行照片风格",
    );
  fail(object(pack.assets), "缺少 assets");
  const assets = object(pack.assets) ? pack.assets : {};
  fail(
    Object.keys(assets).length > 0 && Object.keys(assets).length <= 512,
    "素材数量须为 1–512",
  );
  for (const [id, asset] of Object.entries(assets)) {
    fail(idOk(id), `非法素材 id：${id}`);
    if (!object(asset)) {
      errors.push(`素材 ${id} 无效`);
      continue;
    }
    fail(
      safePath(asset.src) && /\.(png|jpe?g|webp|gif)$/i.test(asset.src),
      `素材 ${id} 路径须为包内 PNG/JPG/WebP/GIF`,
    );
    fail(
      finite(asset.width, 1, 16384) && finite(asset.height, 1, 16384),
      `素材 ${id} 尺寸无效`,
    );
  }
  const frameOk = (frame, label) => {
    if (
      !object(frame) ||
      !Object.hasOwn(assets, frame.asset) ||
      !object(assets[frame.asset])
    ) {
      errors.push(`${label} 引用不存在的素材`);
      return;
    }
    const asset = assets[frame.asset];
    if (frame.rect !== undefined)
      fail(
        Array.isArray(frame.rect) &&
          frame.rect.length === 4 &&
          frame.rect.every((n) => finite(n, 0, 16384)) &&
          frame.rect[2] > 0 &&
          frame.rect[3] > 0 &&
          frame.rect[0] + frame.rect[2] <= asset.width &&
          frame.rect[1] + frame.rect[3] <= asset.height,
        `${label} 裁切区域超出素材尺寸`,
      );
    if (frame.duration !== undefined)
      fail(
        finite(frame.duration, 100, 60000),
        `${label} duration 须为 100–60000 毫秒`,
      );
    if (frame.registration !== undefined) {
      const r = frame.registration;
      fail(
        object(r) &&
          finite(r.x, -1, 2) &&
          finite(r.y, -1, 2) &&
          finite(r.width, 0.01, 3) &&
          finite(r.height, 0.01, 3),
        `${label} registration 无效`,
      );
    }
  };
  for (const key of ["outfits", "furniture", "items", "scenes"]) {
    if (!Array.isArray(pack[key]) || pack[key].length > 100) {
      errors.push(`${key} 必须为数组（最多100项）`);
      continue;
    }
    const ids = new Set();
    for (const entry of pack[key]) {
      fail(
        object(entry) && idOk(entry.id) && !ids.has(entry.id),
        `${key} 包含非法或重复 id`,
      );
      if (entry) {
        ids.add(entry.id);
        if (entry.price !== undefined)
          fail(
            Number.isInteger(entry.price) && finite(entry.price, 0, 99999999),
            `${key} 的 price 必须是非负整数`,
          );
      }
    }
  }
  if (errors.length) return errors;
  fail(
    pack.scenes.length > 0 &&
      pack.outfits.length > 0 &&
      pack.furniture.length > 0,
    "至少需要一个场景、一套装扮和一种家具",
  );
  fail(
    pack.outfits.some((o) => o.id === pack.baseOutfitId),
    "baseOutfitId 必须指向默认装扮",
  );
  for (const outfit of pack.outfits) {
    fail(
      typeof outfit.name === "string" && outfit.name.length <= 80,
      `装扮 ${outfit.id} 缺少名称`,
    );
    frameOk(outfit.preview, `装扮 ${outfit.id} 预览`);
  }
  for (const furniture of pack.furniture) {
    const label = `家具 ${furniture.id}`;
    frameOk(furniture.empty, label);
    fail(
      object(furniture.canvas) &&
        finite(furniture.canvas.width, 1, 16384) &&
        finite(furniture.canvas.height, 1, 16384),
      `${label} 需要统一逻辑画布 canvas`,
    );
    fail(
      Array.isArray(furniture.pivot) &&
        furniture.pivot.length === 2 &&
        furniture.pivot.every((n) => finite(n, 0, 1)),
      `${label} pivot 须为两个 0–1 的数字`,
    );
    fail(
      finite(furniture.defaultWidth, 0.02, 1),
      `${label} defaultWidth 须为 0.02–1`,
    );
    if (furniture.shadow !== undefined) {
      const v = furniture.shadow;
      fail(
        object(v) &&
          ["x", "y", "width", "height", "opacity"].every((k) =>
            finite(v[k], 0, 1),
          ),
        `${label} shadow 无效`,
      );
    }
    if (!object(furniture.actions)) {
      errors.push(`${label} actions 必须为对象`);
      continue;
    }
    fail(Object.keys(furniture.actions).length <= 50, `${label} 最多50种动作`);
    for (const [id, action] of Object.entries(furniture.actions)) {
      if (!idOk(id) || !object(action) || !object(action.variants)) {
        errors.push(`${label} 动作定义无效`);
        continue;
      }
      fail(
        Object.hasOwn(action.variants, pack.baseOutfitId),
        `${label} 动作 ${id} 必须有默认装扮版本`,
      );
      for (const [outfitId, clip] of Object.entries(action.variants)) {
        fail(
          pack.outfits.some((o) => o.id === outfitId),
          `${label} 动作引用不存在的装扮 ${outfitId}`,
        );
        if (
          !object(clip) ||
          !Array.isArray(clip.frames) ||
          !clip.frames.length ||
          clip.frames.length > 100
        ) {
          errors.push(`${label} 动作 ${id} 需要 1–100 帧`);
          continue;
        }
        for (const frame of clip.frames)
          frameOk(frame, `${label}/${id}/${outfitId}`);
      }
    }
  }
  for (const item of pack.items) {
    frameOk(item.sprite, `物品 ${item.id}`);
    fail(
      item.slot === undefined,
      `物品 ${item.id} 只能作为随身物品，外观请使用整套装扮`,
    );
  }
  for (const scene of pack.scenes) {
    fail(
      Object.hasOwn(assets, scene.background),
      `场景 ${scene.id} 底图不存在`,
    );
    fail(
      finite(scene.width, 1, 16384) && finite(scene.height, 1, 16384),
      `场景 ${scene.id} 逻辑尺寸无效`,
    );
    if (!Array.isArray(scene.placements) || scene.placements.length > 100) {
      errors.push(`场景 ${scene.id} placements 需要数组（最多100件）`);
      continue;
    }
    const ids = new Set();
    for (const p of scene.placements) {
      fail(
        object(p) &&
          idOk(p.id) &&
          !ids.has(p.id) &&
          pack.furniture.some((f) => f.id === p.furnitureId) &&
          finite(p.x, 0, 1) &&
          finite(p.y, 0, 1) &&
          finite(p.width, 0.02, 1) &&
          (p.z === undefined || finite(p.z, 0, 100)) &&
          (p.flip === undefined || typeof p.flip === "boolean"),
        `场景 ${scene.id} 家具配置无效或 id 重复`,
      );
      if (p) ids.add(p.id);
    }
  }
  if (pack.postcards !== undefined && !Array.isArray(pack.postcards))
    errors.push("postcards 必须为数组");
  for (const photo of Array.isArray(pack.postcards) ? pack.postcards : [])
    frameOk(photo?.sprite, "示例明信片");
  if (pack.defaultPhotoAsset !== undefined)
    fail(Object.hasOwn(assets, pack.defaultPhotoAsset), "默认照片素材不存在");
  if (pack.destinationPhotos !== undefined) {
    fail(
      object(pack.destinationPhotos),
      "destinationPhotos 必须为目的地与图片素材的映射",
    );
    for (const [id, asset] of Object.entries(
      object(pack.destinationPhotos) ? pack.destinationPhotos : {},
    ))
      fail(
        Boolean(destinationById(id)) && Object.hasOwn(assets, asset),
        `目的地默认照片引用无效：${id}`,
      );
  }
  return errors;
}

export function frameInfo(pack, frame) {
  const asset = pack.assets[frame.asset];
  const [x, y, w, h] = frame.rect || [0, 0, asset.width, asset.height];
  return {
    asset,
    x,
    y,
    w,
    h,
    width: asset.width,
    height: asset.height,
    ratio: w / h,
  };
}

export function zipDeclaredSize(bytes) {
  let total = 0,
    count = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("无法识别 ZIP 文件");
  const entries = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true);
  if (entries > LIMITS.entries) throw new Error("ZIP 文件数量过多");
  let pos = offset;
  while (pos + 46 <= bytes.length && view.getUint32(pos, true) === 0x02014b50) {
    const size = view.getUint32(pos + 24, true),
      nameLength = view.getUint16(pos + 28, true),
      extra = view.getUint16(pos + 30, true),
      comment = view.getUint16(pos + 32, true);
    if (size > LIMITS.fileBytes) throw new Error("单个文件超过30MB");
    total += size;
    count++;
    if (total > LIMITS.totalBytes || count > LIMITS.entries)
      throw new Error("素材包解压后过大");
    pos += 46 + nameLength + extra + comment;
  }
  if (count !== entries) throw new Error("ZIP 索引不完整，或不支持 ZIP64");
  return { total, count };
}
