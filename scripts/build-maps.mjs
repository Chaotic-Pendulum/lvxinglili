import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { geoNaturalEarth1, geoMercator, geoConicConformal, geoPath, geoGraticule, geoArea } from "./vendor/d3-geo.js";
import { COUNTRIES, PROVINCES } from "../dist/app/core/catalog.js";

// Preserve every source coordinate. Only ring orientation and projection change.
export function orientGeometry(geometry) {
  const polygon = (rings) => {
    const reverse = geoArea({ type: "Polygon", coordinates: rings }) > Math.PI * 2;
    return reverse ? rings.map((ring) => [...ring].reverse()) : rings;
  };
  if (geometry.type === "Polygon") return { ...geometry, coordinates: polygon(geometry.coordinates) };
  if (geometry.type === "MultiPolygon") return { ...geometry, coordinates: geometry.coordinates.map(polygon) };
  return geometry;
}

const countryIds = new Set(COUNTRIES.map((x) => x.id));
const names = new Map([...COUNTRIES, ...PROVINCES].map((x) => [x.id, x.name]));
const labelLocations = {
  CN: [104, 36], RU: [100, 60], US: [-101, 39], CA: [-105, 58], BR: [-52, -11],
  AU: [134, -25], IN: [79, 22], FR: [2, 47], GB: [-3, 55], NZ: [173, -41],
  JP: [138, 37], ID: [116, -3], NO: [10, 62], CL: [-71, -32],
};
const provinceLabels = {
  "CN-11": [116.5, 41.3], "CN-12": [119.1, 39.5], "CN-13": [115, 38.7],
  "CN-14": [112.1, 37.5], "CN-15": [111.2, 43.8], "CN-21": [122.9, 41.5],
  "CN-22": [126, 43.7], "CN-23": [127.7, 47.4], "CN-31": [123.8, 31.1],
  "CN-32": [119.1, 33.2], "CN-33": [120.1, 28.7], "CN-34": [117, 31.7],
  "CN-35": [117.8, 26.2], "CN-36": [115.3, 27.7], "CN-37": [118.1, 36.4],
  "CN-41": [113.6, 34], "CN-42": [112.2, 30.8], "CN-43": [111.6, 27.4],
  "CN-44": [113.2, 24], "CN-45": [108.5, 23.6], "CN-46": [109.6, 19.1],
  "CN-50": [107.8, 29.9], "CN-51": [102.9, 30.5], "CN-52": [106.5, 26.6],
  "CN-53": [101.1, 24.8], "CN-54": [88.6, 31.6], "CN-61": [108.6, 35.4],
  "CN-62": [103, 37.7], "CN-63": [96, 35.4], "CN-64": [106.2, 37.7],
  "CN-65": [85.6, 41.6], "CN-71": [122.7, 23.4],
  "CN-81": [116.1, 21.9], "CN-82": [112.7, 21.2],
};

for (const mode of ["world", "china"]) {
  const bytes = await readFile(`dist/maps/geometry/${mode}.json`);
  const source = JSON.parse(bytes);
  let features = source.features.map((f) => ({ ...f, geometry: orientGeometry(f.geometry) }));
  const world = mode === "world";
  if (world) {
    // Some offshore islands share a country code with a separate mainland feature.
    // Group their existing polygons into one hit target without changing any ring.
    const grouped = new Map();
    features = features.filter((feature) => {
      const id = feature.properties.iso_a2;
      if (!countryIds.has(id)) return true;
      const coordinates = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      if (grouped.has(id)) { grouped.get(id).geometry.coordinates.push(...coordinates); return false; }
      feature.geometry = { type: "MultiPolygon", coordinates: [...coordinates] };
      grouped.set(id, feature);
      return true;
    });
  }
  const size = world ? [1080, 580] : [940, 640];
  const projection = world
    ? geoNaturalEarth1().rotate([-150, 0]).precision(0.15).fitExtent([[22, 16], [1058, 564]], { type: "Sphere" })
    : geoConicConformal().parallels([25, 47]).rotate([-105, 0]).center([0, 36]).scale(860).translate([435, 302]);
  projection.clipExtent([[0, 0], size]);
  const path = geoPath(projection).digits(2);
  const insetProjection = geoMercator().center([115, 14]).scale(365).translate([79, 109]).clipExtent([[0, 0], [158, 232]]);
  const insetPath = geoPath(insetProjection).digits(2);
  const regions = [];
  const lines = [];
  const inset = { width: 158, height: 232, regions: [], lines: [] };
  for (const [index, feature] of features.entries()) {
    if (/LineString/.test(feature.geometry.type)) {
      lines.push(path(feature));
      if (!world) inset.lines.push(insetPath(feature));
      continue;
    }
    const p = feature.properties;
    const id = world ? p.iso_a2 : `CN-${p.gb.slice(3, 5)}`;
    const selectable = world ? countryIds.has(id) : names.has(id);
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const largest = [...polygons].sort((a, b) => geoArea({ type: "Polygon", coordinates: b }) - geoArea({ type: "Polygon", coordinates: a }))[0];
    const label = (world ? labelLocations[id] : provinceLabels[id]);
    const center = label ? projection(label) : path.centroid({ type: "Polygon", coordinates: largest });
    const region = {
      id: selectable ? id : `area-${index}`, destinationId: selectable ? id : null,
      name: names.get(id) || p.name, d: path(feature),
      center: center.map((n) => Number(n.toFixed(2))),
      small: path.area({ type: "Polygon", coordinates: largest }) < 7,
    };
    regions.push(region);
    if (!world) inset.regions.push({ id, d: insetPath(feature) });
  }
  const labels = world ? [
    ["太 平 洋", [-161, 8]], ["印 度 洋", [75, -30]], ["大 西 洋", [-28, 7]],
    ["北 冰 洋", [75, 80]],
  ] : [["东海", [126, 28.7]], ["钓鱼岛", [126, 25.3]], ["南海", [112.2, 16.3]]];
  const result = {
    version: 1, mode, width: size[0], height: size[1],
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    regions, lines: lines.filter(Boolean),
    graticule: path(geoGraticule().step(world ? [30, 30] : [10, 10])()),
    labels: labels.map(([text, point]) => ({ text, point: projection(point).map((n) => Number(n.toFixed(2))) })),
    inset: world ? null : { ...inset, regions: inset.regions.filter((f) => f.d), lines: inset.lines.filter(Boolean) },
  };
  await writeFile(`dist/maps/${mode}-atlas.json`, JSON.stringify(result));
  console.log(`${mode}: ${regions.filter((r) => r.destinationId).length} selectable regions, ${result.lines.length} boundary layers`);
}
