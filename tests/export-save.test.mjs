import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exportSave, exportPack, parseSaveFile } from '../dist/app/storage.js';
import { unpackBlob } from '../dist/app/core/archive.js';
import { createState, restoreState } from '../dist/app/core/engine.js';

const pack = JSON.parse(readFileSync('dist/packs/reading-room/pack.json', 'utf8'));
const png = new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])], { type: 'image/png' });
const media = new Map([['media:photo-fixture', png]]);
const fakeDb = { transaction() { return { objectStore() { return { get(key) {
  const request = {}; queueMicrotask(() => { request.result = media.get(key); request.onsuccess(); }); return request;
} }; } }; } };
const indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = fakeDb; request.onsuccess(); }); return request; } };
// Image decoding belongs to the browser roundtrip; this fake isolates archive/storage behavior.
class ImageDecoder { naturalWidth = 1; naturalHeight = 1; set src(value) { queueMicrotask(() => this.onload()); } }

test('complete backup restores layout, inventory and photo bytes, excludes keys and bounds asset reads', async () => {
  const oldDb = globalThis.indexedDB, oldImage = globalThis.Image;
  globalThis.indexedDB = indexedDB; globalThis.Image = ImageDecoder;
  try {
    const state = createState(pack);
    state.economy.coins = 179;
    Object.assign(state.layouts[state.viewSceneId][0], { x: 0.22, y: 0.567, width: 0.219, flip: true });
    state.memories.push({ id: 'memory-fixture', imageId: 'photo-fixture', title: 'Test photo' });
    Object.assign(state.settings, { textKey: 'private-key', apiToken: 'private-token' });
    let active = 0, peak = 0; const calls = new Map(), progress = [];
    const result = await exportSave(state, pack, async src => {
      active++; peak = Math.max(peak, active); calls.set(src, (calls.get(src) || 0) + 1);
      await Promise.resolve(); active--; return png;
    }, { onProgress: value => progress.push(value) });
    assert.match(result.filename, /^漫游存档-.*\.zip$/);
    assert.ok(peak > 1 && peak <= 6);
    assert.equal(progress.at(-1).completed, Object.keys(pack.assets).length);
    assert.ok([...calls.values()].every(count => count === 1));
    const restored = await parseSaveFile(result.blob);
    const restoredState = restoreState(restored.state, restored.pack);
    assert.equal(restoredState.economy.coins, 179);
    const placement = restoredState.layouts[restoredState.viewSceneId][0];
    assert.equal(placement.x, 0.22); assert.equal(placement.flip, true); assert.equal(placement.width, 0.219);
    assert.equal(restored.state.settings.textKey, undefined); assert.equal(restored.state.settings.apiToken, undefined);
    assert.equal(state.settings.textKey, 'private-key');
    assert.equal(restored.state.memories[0].title, 'Test photo');
    assert.deepEqual(new Uint8Array(await restored.media['photo-fixture'].arrayBuffer()), new Uint8Array(await png.arrayBuffer()));
  } finally {
    if (oldDb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = oldDb;
    if (oldImage === undefined) delete globalThis.Image; else globalThis.Image = oldImage;
  }
});

test('resource export deduplicates shared asset paths and returns a file for an explicit download gesture', async () => {
  const smallPack = { id: 'fixture', assets: { first: { src: 'shared.png' }, second: { src: 'shared.png' } } };
  let reads = 0;
  const result = await exportPack(smallPack, async () => { reads++; return png; });
  const entries = await unpackBlob(result.blob);
  assert.equal(reads, 1); assert.equal(result.filename, 'fixture.roampack.zip');
  assert.deepEqual(Object.keys(entries).sort(), ['LICENSE.txt', 'pack.json', 'shared.png']);
});

test('missing local photo rejects export instead of silently creating an incomplete backup', async () => {
  const state = createState(pack); state.memories.push({ id: 'missing', imageId: 'missing-photo' });
  const oldDb = globalThis.indexedDB;
  globalThis.indexedDB = indexedDB;
  try { await assert.rejects(() => exportSave(state, pack, async () => png), /照片无法读取/); }
  finally { if (oldDb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = oldDb; }
});
