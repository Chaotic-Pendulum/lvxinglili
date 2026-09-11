import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { upgradeReadingRoom } from '../dist/app/core/pack-upgrade.js';
import { defaultPhotoFor, refreshDefaultPhotos } from '../dist/app/core/travel.js';
import { validatePack, LIMITS } from '../dist/app/core/pack.js';
import { archiveBlob, unpackBlob } from '../dist/app/core/archive.js';
import { DESTINATIONS } from '../dist/app/core/catalog.js';

const bundled = JSON.parse(readFileSync('dist/packs/reading-room/pack.json', 'utf8'));
function previousPack() {
  const pack = structuredClone(bundled);
  for (const assetId of Object.values(pack.destinationPhotos)) delete pack.assets[assetId];
  delete pack.destinationPhotos;
  pack.revision = 'expanded-q90-20260911-v1';
  return { pack, blobs: {}, base: './packs/reading-room/' };
}

test('an existing Q90 save receives all destination photos while keeping its wardrobe and furniture', () => {
  const previous = previousPack();
  previous.pack.furniture[0].actions.read.variants.base.frames[0].duration = 7300;
  const snapshot = structuredClone(previous);
  const result = upgradeReadingRoom(previous, bundled);
  assert.equal(result.changed, true);
  assert.deepEqual(previous, snapshot);
  for (const section of ['outfits', 'furniture', 'items', 'scenes'])
    assert.deepEqual(result.record.pack[section], previous.pack[section]);
  assert.deepEqual(validatePack(result.record.pack), []);
  assert.equal(DESTINATIONS.length, 228);
  for (const destination of DESTINATIONS) {
    const photo = defaultPhotoFor(result.record.pack, destination.id);
    assert.equal(photo.placeholder, false, destination.id);
    assert.equal(photo.asset, bundled.destinationPhotos[destination.id]);
  }
  assert.equal(upgradeReadingRoom(result.record, bundled).changed, false);
});

test('photo migration preserves custom destination mappings, asset collisions and imported packs', () => {
  const previous = previousPack();
  previous.pack.destinationPhotos = { JP: 'postcard-coast' };
  const collision = bundled.destinationPhotos.FR;
  previous.pack.assets[collision] = { ...bundled.assets[collision], src: 'assets/my-france.webp' };
  const result = upgradeReadingRoom(previous, bundled).record.pack;
  assert.equal(result.destinationPhotos.JP, 'postcard-coast');
  assert.equal(result.destinationPhotos.FR, undefined);
  assert.equal(result.assets[collision].src, 'assets/my-france.webp');
  const imported = previousPack();
  imported.blobs['assets/custom.png'] = new Blob(['private art']);
  assert.equal(upgradeReadingRoom(imported, bundled).record.pack.destinationPhotos, undefined);
  const external = previousPack();
  external.base = 'https://example.test/custom-pack/';
  assert.equal(upgradeReadingRoom(external, bundled).changed, false);
});

test('old generic album photos refresh without replacing private photos or pending image requests', () => {
  const generic = () => ({ defaultPhotoPlaceholder:true, sampleAsset:'postcard-lake', imageStatus:'default' });
  const trip = { ...generic(), destinationId:'JP', itinerary:{nodes:[
    generic(), { ...generic(), imageId:'private-generated-image' },
    { ...generic(), imageStatus:'queued' }, { ...generic(), imageStatus:'generating' },
    { sampleAsset:'my-custom-picture', defaultPhotoPlaceholder:false },
  ]}};
  const preserved = structuredClone(trip.itinerary.nodes.slice(1));
  assert.equal(refreshDefaultPhotos(bundled, [null, trip]), true);
  assert.equal(trip.sampleAsset, bundled.destinationPhotos.JP);
  assert.equal(trip.itinerary.nodes[0].sampleAsset, bundled.destinationPhotos.JP);
  assert.equal(trip.defaultPhotoPlaceholder, false);
  assert.deepEqual(trip.itinerary.nodes.slice(1), preserved);
  assert.equal(refreshDefaultPhotos(bundled, [trip]), false);
});

test('a save can round-trip the complete gallery plus 100 private photos', async () => {
  const records = Object.values(bundled.assets).map(asset => [asset.src, new Blob(['asset'])]);
  records.push(['state.json', new Blob(['{"version":2}'])]);
  for (let index = 0; index < 100; index++) records.push([`photos/private-${index}.png`, new Blob([`private-${index}`])]);
  assert.ok(records.length > 750);
  const restored = await unpackBlob(await archiveBlob(records));
  assert.equal(Object.keys(restored).length, records.length);
  assert.equal(await restored['photos/private-99.png'].text(), 'private-99');
  assert.equal(LIMITS.totalBytes, 512 * 1024 * 1024);
  const excessive = structuredClone(bundled);
  for (let index = Object.keys(excessive.assets).length; index <= LIMITS.assets; index++)
    excessive.assets[`extra-${index}`] = {src:`assets/extra-${index}.webp`,width:1,height:1};
  assert.ok(validatePack(excessive).some(message => message.includes('素材数量')));
});
