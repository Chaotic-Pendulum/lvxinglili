import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { validatePack } from "../dist/app/core/pack.js";
import { imageDimensions } from "./image-header.mjs";

async function walk(dir) {
  const results = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) results.push(...(await walk(p)));
    else results.push(p);
  }
  return results;
}
const files = [
  ...(await walk("dist/app")),
  ...(await walk("server")),
  ...(await walk("scripts")),
  ...(await walk("tests")),
].filter((p) => /\.(m?js)$/.test(p));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
}
const pack = JSON.parse(
  await readFile("dist/packs/reading-room/pack.json", "utf8"),
);
const errors = validatePack(pack);
if (errors.length) throw new Error(errors.join("\n"));
for (const asset of Object.values(pack.assets)) {
  const data = await readFile(path.join("dist/packs/reading-room", asset.src));
  if (data.length < 30) throw new Error(`Empty asset: ${asset.src}`);
  if (/\.(png|webp)$/i.test(asset.src)) {
    const size = imageDimensions(data);
    if (size.width !== asset.width || size.height !== asset.height)
      throw new Error(`Dimension mismatch: ${asset.src}`);
  }
}
const mapManifest = JSON.parse(
  await readFile("dist/maps/map-assets-manifest.json", "utf8"),
);
for (const map of [
  ...mapManifest.assets,
  ...(mapManifest.vectorAssets || []),
]) {
  const bytes = await readFile(path.join("dist/maps", map.file));
  if (createHash("sha256").update(bytes).digest("hex") !== map.sha256)
    throw new Error(`Map source changed: ${map.file}`);
}
const required = [
  "dist/index.html",
  "dist/styles.css",
  "dist/workbench.css",
  "dist/immersive.css",
  "dist/game-ui.css",
  "dist/atlas.css",
  "dist/maps/world-atlas.json",
  "dist/maps/china-atlas.json",
  "dist/vendor/fflate.js",
  "dist/docs/ASSET-PACK-SPEC.md",
  "dist/docs/AI-ASSET-AUTHORING.md",
  "dist/docs/README.md",
  "LICENSE",
  "README.md",
];
for (const file of required) await stat(file);
console.log(
  `Checked ${files.length} source files, ${Object.keys(pack.assets).length} image assets, map hashes and documentation links.`,
);

for (const name of [
  "ASSET-PACK-SPEC.md",
  "AI-ASSET-AUTHORING.md",
  "ARCHITECTURE.md",
  "pack.schema.json",
]) {
  if (
    (await readFile("docs/" + name, "utf8")) !==
    (await readFile("dist/docs/" + name, "utf8"))
  )
    throw new Error("Browser documentation is stale: " + name);
}
for (const mode of ["world", "china"]) {
  const source = await readFile(`dist/maps/geometry/${mode}.json`);
  const rendered = JSON.parse(
    await readFile(`dist/maps/${mode}-atlas.json`, "utf8"),
  );
  if (
    rendered.sourceSha256 !== createHash("sha256").update(source).digest("hex")
  )
    throw new Error(`Rebuild ${mode} atlas after changing its source`);
}
if (
  (await readFile("README.md", "utf8")) !==
  (await readFile("dist/docs/README.md", "utf8"))
)
  throw new Error("Browser README is stale");

const assetMetadata = JSON.parse(
  await readFile("dist/packs/reading-room/ASSET-METADATA.json", "utf8"),
);
for (const meta of Object.values(assetMetadata.assets)) {
  const bytes = await readFile(path.join("dist/packs/reading-room", meta.file));
  if (createHash("sha256").update(bytes).digest("hex") !== meta.sha256)
    throw new Error("Selected artwork changed: " + meta.file);
  if (bytes[25] !== 6)
    throw new Error("Selected artwork must keep real RGBA: " + meta.file);
}

const styleManifest = JSON.parse(
  await readFile("dist/photo-styles/manifest.json", "utf8"),
);
if (styleManifest.styles.length !== 20)
  throw new Error("Expected twenty frontend style previews");
for (const style of styleManifest.styles) {
  const bytes = await readFile(path.join("dist/photo-styles", style.file));
  if (createHash("sha256").update(bytes).digest("hex") !== style.sha256)
    throw new Error("Style preview changed: " + style.file);
  const size = imageDimensions(bytes);
  if (size.width !== style.width || size.height !== style.height)
    throw new Error('Style dimensions changed: ' + style.file);
}

if (pack.imageEncoding?.quality === 90) {
  const q90 = JSON.parse(await readFile('dist/packs/reading-room/Q90-ASSETS.json', 'utf8'));
  if (Object.keys(q90.assets).length !== Object.keys(pack.assets).length) throw new Error('Incomplete Q90 manifest');
  for (const [id, record] of Object.entries(q90.assets)) {
    const bytes = await readFile(path.join('dist/packs/reading-room', record.file));
    if (record.file !== pack.assets[id].src || !record.alphaIdentical ||
        createHash('sha256').update(bytes).digest('hex') !== record.sha256)
      throw new Error('Q90 validation failed: ' + id);
  }
}

const skin = JSON.parse(await readFile('dist/ui/painted/manifest.json', 'utf8'));
for (const asset of Object.values(skin.assets)) {
  const bytes = await readFile(path.join('dist/ui/painted', asset.file));
  const size = imageDimensions(bytes);
  if (size.width !== asset.width || size.height !== asset.height ||
      createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
    throw new Error('UI skin validation failed: ' + asset.file);
}
