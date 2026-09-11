import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { COUNTRIES, PROVINCES } from "../dist/app/core/catalog.js";
import { visitCount, atlasSelectionForMode, photosForRegion } from "../dist/app/core/atlas.js";

const read = async (file) => JSON.parse(await readFile(new URL(`../dist/maps/${file}`, import.meta.url), "utf8"));
const [worldSource, chinaSource, world, china] = await Promise.all([
  read("geometry/world.json"), read("geometry/china.json"), read("world-atlas.json"), read("china-atlas.json"),
]);

// Independent planar checks guard against substitution of differently drawn borders.
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function contains(feature, point) {
  const geometry = feature.geometry;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some((rings) => inRing(point, rings[0]) && !rings.slice(1).some((ring) => inRing(point, ring)));
}

test("atlas covers each destination once and keeps 34 province-level regions under China", () => {
  const ids = world.regions.filter((region) => region.destinationId).map((region) => region.destinationId);
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual([...ids].sort(), COUNTRIES.map((country) => country.id).sort());
  assert.deepEqual(china.regions.map((region) => region.destinationId).sort(), PROVINCES.map((province) => province.id).sort());
  for (const id of ["TW", "HK", "MO"]) assert.ok(!ids.includes(id));
  for (const id of ["CN-71", "CN-81", "CN-82"]) assert.ok(china.regions.some((region) => region.destinationId === id && region.d));
});

test("world and province data agree on key locations in the requested China boundary convention", () => {
  const cn = worldSource.features.find((feature) => feature.properties.iso_a2 === "CN");
  const india = worldSource.features.find((feature) => feature.properties.iso_a2 === "IN");
  const checkpoints = [
    { name: "藏南", point: [94.7, 28.1], province: "西藏" },
    { name: "阿克赛钦", point: [79.5, 35.2], province: "新疆" },
    { name: "台湾", point: [121, 23.8], province: "台湾" },
    { name: "钓鱼岛", point: [123.47, 25.75], province: "台湾" },
  ];
  for (const check of checkpoints) {
    assert.ok(contains(cn, check.point), `${check.name} belongs to the China world feature`);
    assert.ok(contains(chinaSource.features.find((feature) => feature.properties.name === check.province), check.point), `${check.name} belongs to its province`);
    assert.ok(!contains(india, check.point), `${check.name} is not overlapped by the India feature`);
  }
});

test("South China Sea boundary segments and the independent inset survive projection", () => {
  const sea = chinaSource.features.find((feature) => feature.geometry.type === "MultiLineString" && feature.geometry.coordinates.length === 10);
  assert.ok(sea);
  const points = sea.geometry.coordinates.flat();
  assert.ok(Math.min(...points.map((point) => point[1])) < 4);
  assert.ok(Math.max(...points.map((point) => point[0])) > 122.6);
  assert.equal(china.lines.length, 8);
  assert.ok(china.inset.lines.length >= 3);
  for (const id of ["CN-46", "CN-71"]) assert.ok(china.inset.regions.some((region) => region.id === id));
  for (const map of [world, china]) for (const region of map.regions) {
    assert.ok(region.d && !/NaN|Infinity/.test(region.d), region.name);
    assert.ok(region.center.every(Number.isFinite), region.name);
  }
});

test("China visit counts aggregate provinces and photo filters preserve their destinations", () => {
  const visits = { "CN-51": 2, "CN-71": 1, "CN-81": 1, JP: 3 };
  assert.equal(visitCount(visits, "CN"), 4);
  assert.equal(visitCount(visits, "CN-51"), 2);
  assert.equal(visitCount(visits, "CN-82"), 0);
  const photos = [{ destinationId: "CN-51" }, { destinationId: "CN-71" }, { destinationId: "JP" }, { id: "unlocated" }];
  assert.deepEqual(photosForRegion(photos, "CN"), photos.slice(0, 2));
  assert.deepEqual(photosForRegion(photos, "CN-71"), [photos[1]]);
  assert.equal(photosForRegion(photos, "").length, 3);
});

test("switching map scope clears unrelated filters and preserves China's hierarchy", () => {
  assert.equal(atlasSelectionForMode("CN-71", "world"), "CN");
  assert.equal(atlasSelectionForMode("CN", "china"), "CN");
  assert.equal(atlasSelectionForMode("JP", "china"), "");
  assert.equal(atlasSelectionForMode("CN-51", "china"), "CN-51");
});
