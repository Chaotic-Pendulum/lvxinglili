import { unpackBlob, archiveBlob } from "./core/archive.js";
import { strFromU8 } from "../vendor/fflate.js";
import {
  validatePack,
  safePath,
  LIMITS,
} from "./core/pack.js";

let database;
export async function db() {
  if (database) return database;
  database = await new Promise((resolve, reject) => {
    const req = indexedDB.open("roam-atelier-v1", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("data");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new Error("浏览器没有允许本地存储，请检查隐私模式或存储权限"));
  });
  return database;
}
export async function read(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction("data").objectStore("data").get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function write(key, value) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("data", "readwrite");
    t.objectStore("data").put(value, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
export async function remove(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("data", "readwrite");
    t.objectStore("data").delete(key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
export async function readMany(keys) {
  return Object.fromEntries(
    await Promise.all(keys.map(async (k) => [k, await read(k)])),
  );
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 60000);
}
export const downloadJson = (value, name) =>
  download(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    name,
  );

async function parseJson(data) {
  if ((data.size ?? data.length) > LIMITS.jsonBytes) throw new Error("配置 JSON 超过2MB");
  if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
  return JSON.parse(strFromU8(data), (key, value) => {
    if (["__proto__", "constructor", "prototype"].includes(key))
      throw new Error("配置包含不安全字段");
    return value;
  });
}

export async function unpack(file) { return unpackBlob(file); }

const mimeFor = (path) =>
  /\.png$/i.test(path)
    ? "image/png"
    : /\.gif$/i.test(path)
      ? "image/gif"
      : /\.webp$/i.test(path)
        ? "image/webp"
        : "image/jpeg";
export async function inspectImage(blob) {
  if (blob.size > LIMITS.fileBytes) throw new Error("单张图片不可超过30MB");
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const png = header[0] === 137 && header[1] === 80 && header[2] === 78;
  const jpg = header[0] === 255 && header[1] === 216;
  const gif = String.fromCharCode(...header.slice(0, 3)) === "GIF";
  const webp =
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!png && !jpg && !gif && !webp)
    throw new Error("请使用 PNG、JPG、WebP 或 GIF 图片");
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        image.naturalWidth > 16384 || image.naturalHeight > 16384
          ? reject(new Error("图片边长不可超过16384像素"))
          : resolve({
              width: image.naturalWidth,
              height: image.naturalHeight,
              type: png
                ? "image/png"
                : jpg
                  ? "image/jpeg"
                  : gif
                    ? "image/gif"
                    : "image/webp",
            });
      image.onerror = () => reject(new Error("无法读取图片"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function parsePackFile(file) {
  const entries = await unpack(file);
  const packPath =
    Object.keys(entries).find((p) => p === "pack.json") ||
    Object.keys(entries).find((p) => /^[^/]+\/pack\.json$/.test(p));
  if (!packPath) throw new Error("ZIP 根目录需要 pack.json");
  const pack = await parseJson(entries[packPath]);
  const errors = validatePack(pack);
  if (errors.length) throw new Error(errors.slice(0, 6).join("；"));
  const base = packPath.slice(0, -9),
    blobs = {};
  for (const asset of Object.values(pack.assets)) {
    const bytes = entries[base + asset.src];
    if (!bytes) throw new Error(`缺少素材文件：${asset.src}`);
    const blob = new Blob([bytes], { type: mimeFor(asset.src) });
    const dimensions = await inspectImage(blob);
    if (dimensions.width !== asset.width || dimensions.height !== asset.height)
      throw new Error(
        `素材 ${asset.src} 实际尺寸 ${dimensions.width}×${dimensions.height} 与配置不一致`,
      );
    blobs[asset.src] = blob;
  }
  return { pack, blobs };
}

async function* assetRecords(pack, prefix, getBlob, onProgress) {
  const assets = [...new Map(Object.values(pack.assets).map(asset => [asset.src, asset])).values()];
  let completed = 0;
  onProgress?.({ completed, total: assets.length });
  // Bound concurrent reads: downloading hundreds of images serially can take minutes.
  for (let offset = 0; offset < assets.length; offset += 6) {
    const batch = await Promise.all(assets.slice(offset, offset + 6).map(async asset => {
      const blob = await getBlob(asset.src);
      onProgress?.({ completed: ++completed, total: assets.length });
      return [`${prefix}${asset.src}`, blob];
    }));
    yield* batch;
  }
}

export async function exportPack(pack, getBlob, { onProgress } = {}) {
  pack = structuredClone(pack);
  async function* records() {
    yield ["pack.json", new Blob([JSON.stringify(pack, null, 2)])];
    yield* assetRecords(pack, "", getBlob, onProgress);
    yield ["LICENSE.txt", new Blob([pack.license || "请核对各素材的授权说明。"])] ;
  }
  return { blob: await archiveBlob(records()), filename: `${pack.id}.roampack.zip` };
}

export async function exportSave(state, pack, getBlob, { onProgress } = {}) {
  const clean = structuredClone(state);
  pack = structuredClone(pack);
  for (const key of Object.keys(clean.settings))
    if (/key|token|secret/i.test(key)) delete clean.settings[key];
  const mediaIds = [
    ...new Set(
      [
        ...clean.memories.map((m) => m.imageId),
        ...[clean.currentTrip, ...clean.trips]
          .filter(Boolean)
          .flatMap((t) => [
            t.imageId,
            t.referenceImageId,
            ...(t.itinerary?.nodes || []).map((n) => n.imageId),
          ]),
      ].filter(Boolean),
    ),
  ];
  async function* records() {
    yield ["save.json", new Blob([JSON.stringify(clean)])];
    yield ["pack/pack.json", new Blob([JSON.stringify(pack)])];
    yield* assetRecords(pack, "pack/", getBlob, onProgress);
    for (const id of mediaIds) {
      const blob = await read(`media:${id}`);
      if (!blob) throw new Error(`存档中的照片无法读取：${id}，未生成不完整备份`);
      yield [`media/${id}`, blob];
    }
  }
  return { blob: await archiveBlob(records()), filename: `漫游存档-${new Date().toISOString().slice(0, 10)}.zip` };
}

export async function parseSaveFile(file, { allowLegacy = false } = {}) {
  const entries = await unpack(file);
  if (!entries["save.json"] || !entries["pack/pack.json"])
    throw new Error("这不是完整的漫游存档");
  const state = await parseJson(entries["save.json"]),
    pack = await parseJson(entries["pack/pack.json"]);
  const legacy = allowLegacy && state.version === 1 && pack.version === 1;
  const errors = legacy ? [] : validatePack(pack);
  if (
    legacy &&
    (!pack.assets ||
      typeof pack.assets !== "object" ||
      Array.isArray(pack.assets) ||
      Object.keys(pack.assets).length > 200)
  )
    throw new Error("旧存档素材索引无效");
  if (errors.length) throw new Error(errors.slice(0, 4).join("；"));
  const blobs = {},
    media = {};
  for (const asset of Object.values(pack.assets)) {
    if (
      !asset ||
      !safePath(asset.src) ||
      !/\.(png|jpe?g|webp|gif)$/i.test(asset.src)
    )
      throw new Error("存档素材路径无效");
    const bytes = entries[`pack/${asset.src}`];
    if (!bytes) throw new Error(`存档缺少 ${asset.src}`);
    const blob = new Blob([bytes], { type: mimeFor(asset.src) });
    await inspectImage(blob);
    blobs[asset.src] = blob;
  }
  for (const [path, bytes] of Object.entries(entries))
    if (path.startsWith("media/")) {
      const raw = new Blob([bytes]);
      const meta = await inspectImage(raw);
      media[path.slice(6)] = new Blob([bytes], { type: meta.type });
    }
  return { state, pack, blobs, media, legacy };
}
