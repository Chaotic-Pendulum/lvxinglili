import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { unzipSync } from '../dist/vendor/fflate.js';

test('release archives contain declared artwork, portable paths and licenses, excluding private files', async () => {
  const parent = path.resolve(tmpdir());
  const fixture = await mkdtemp(path.join(parent, 'roam-package-test-'));
  async function put(name, data) {
    const target = path.join(fixture, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
  try {
    await put('package.json', '{"type":"module"}');
    await put('dist/index.html', '<h1>Fixture</h1>');
    await put('dist/packs/reading-room/pack.json', JSON.stringify({
      assets: { portrait: { src: 'assets/portrait.webp' } },
      imageEncoding: { quality: 90 },
    }));
    await put('dist/packs/reading-room/assets/portrait.webp', 'declared image');
    await put('dist/packs/reading-room/assets/unused.webp', 'unused image');
    await put('dist/packs/reading-room/ASSET-METADATA.json', '{"assets":{}}');
    await put('dist/packs/reading-room/LICENSE.txt', 'Fixture art license');
    await put('dist/photo-styles/manifest.json', '{"styles":[]}');
    await put('dist/ui/painted/manifest.json', '{"assets":{},"id":"fixture"}');
    await put('dist/manifest.webmanifest', '{"icons":[]}');
    await put('dist/maps/china-standard-GS2023-2764.jpg', 'map reference');
    await put('.env', 'PRIVATE_TEST_VALUE=must-not-be-exported');
    for (const file of ['README.md', 'HANDOFF-先读我.md', 'LICENSE', '.env.example', '.gitignore', 'server/dev.mjs', 'docs/README.md', 'tests/example.test.mjs']) {
      await put(file, 'fixture');
    }
    await mkdir(path.join(fixture, 'scripts'), { recursive: true });
    await mkdir(path.join(fixture, 'dist/vendor'), { recursive: true });
    await copyFile(new URL('../scripts/package.mjs', import.meta.url), path.join(fixture, 'scripts/package.mjs'));
    await copyFile(new URL('../dist/vendor/fflate.js', import.meta.url), path.join(fixture, 'dist/vendor/fflate.js'));
    const run = spawnSync(process.execPath, ['scripts/package.mjs'], { cwd: fixture, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const archives = {};
    for (const name of ['roam-atelier-game-q90.zip', 'roam-atelier-source.zip', 'reading-room.roampack.zip']) {
      const files = unzipSync(await readFile(path.join(fixture, 'releases', name)));
      archives[name] = files;
      assert.ok(Object.keys(files).every(file => !file.includes('\\')), `${name} must use portable ZIP paths`);
      assert.ok(!Object.keys(files).some(file => /(^|\/)\.env$/.test(file)), `${name} must exclude .env`);
    }
    const resource = archives['reading-room.roampack.zip'];
    const pack = JSON.parse(new TextDecoder().decode(resource['pack.json']));
    for (const asset of Object.values(pack.assets)) assert.ok(resource[asset.src], `Missing declared asset: ${asset.src}`);
    assert.ok(!resource['assets/unused.webp']);
    assert.ok(archives['roam-atelier-game-q90.zip']['packs/reading-room/assets/portrait.webp']);
    assert.ok(archives['roam-atelier-game-q90.zip']['maps/china-standard-GS2023-2764.jpg']);
    assert.ok(archives['roam-atelier-game-q90.zip'].LICENSE);
    assert.ok(archives['roam-atelier-source.zip']['dist/packs/reading-room/assets/portrait.webp']);
  } finally {
    // Resolve and constrain recursive cleanup to the test's own temporary directory.
    if (path.dirname(path.resolve(fixture)) !== parent || !path.basename(fixture).startsWith('roam-package-test-')) throw new Error('Unsafe fixture cleanup');
    await rm(fixture, { recursive: true, force: true });
  }
});
