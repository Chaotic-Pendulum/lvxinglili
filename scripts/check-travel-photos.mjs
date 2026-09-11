import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DESTINATIONS } from '../dist/app/core/catalog.js';
import { defaultPhotoFor } from '../dist/app/core/travel.js';
import { LIMITS } from '../dist/app/core/pack.js';

const root = new URL('../dist/packs/reading-room/', import.meta.url);
const pack = JSON.parse(await readFile(new URL('pack.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('TRAVEL-PHOTOS.json', root), 'utf8'));
const partial = process.argv.includes('--partial');
const ids = new Set();
const hashes = new Set();
for (const photo of manifest.photos) {
  if (ids.has(photo.destinationId) || hashes.has(photo.sourceSha256))
    throw new Error(`Repeated destination or image: ${photo.destinationId}`);
  if (!DESTINATIONS.some(destination => destination.id === photo.destinationId))
    throw new Error(`Unknown destination: ${photo.destinationId}`);
  if (!pack.outfits.some(outfit => outfit.id === photo.outfitId) || !photo.activityId || !Array.isArray(photo.itemIds))
    throw new Error(`Missing outfit or activity provenance: ${photo.destinationId}`);
  if (photo.itemIds.some(id => !pack.items.some(item => item.id === id)))
    throw new Error(`Photo uses an unknown inventory item: ${photo.destinationId}`);
  const bytes = await readFile(new URL(photo.file, root));
  if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WEBP')
    throw new Error(`Expected WebP: ${photo.file}`);
  if (createHash('sha256').update(bytes).digest('hex') !== photo.sha256)
    throw new Error(`Image hash changed: ${photo.file}`);
  const selected = defaultPhotoFor(pack, photo.destinationId);
  if (selected.placeholder || selected.asset !== photo.assetId || pack.assets[photo.assetId]?.src !== photo.file)
    throw new Error(`Default image mapping failed: ${photo.destinationId}`);
  ids.add(photo.destinationId);
  hashes.add(photo.sourceSha256);
}
if (!partial && (ids.size !== DESTINATIONS.length || !manifest.complete))
  throw new Error(`Incomplete default gallery: ${ids.size}/${DESTINATIONS.length}`);
if (!partial) {
  const outfits = new Set(manifest.photos.map(photo => photo.outfitId));
  const activities = new Set(manifest.photos.map(photo => photo.activityId));
  const itemIds = new Set(manifest.photos.flatMap(photo => photo.itemIds));
  if (outfits.size < 3 || activities.size < 20 || itemIds.size < 25)
    throw new Error('The gallery does not satisfy the varied outfit, activity and inventory brief');
}
let packBytes = 0;
for (const asset of Object.values(pack.assets)) packBytes += (await stat(new URL(asset.src, root))).size;
if (packBytes >= LIMITS.totalBytes) throw new Error(`Pack exceeds the import budget: ${packBytes}`);
console.log(`Verified ${ids.size}/${DESTINATIONS.length} distinct destination photos; all defaults resolve without an API. Pack artwork: ${(packBytes / 1024 / 1024).toFixed(1)} MiB.`);
