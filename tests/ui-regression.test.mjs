import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Atelier } from '../dist/app/main.js';
import { createState, planLocally, commitDeparture } from '../dist/app/core/engine.js';
import { priceOf } from '../dist/app/core/economy.js';
import { travelApiPolicy } from '../dist/app/core/travel.js';
import { createItinerary } from '../dist/app/core/itinerary.js';
import { destinationById } from '../dist/app/core/catalog.js';
import { planWithAI, planJourneyWithAI } from '../dist/app/ai.js';
import { toast } from '../dist/app/util.js';

const pack = JSON.parse(readFileSync('dist/packs/reading-room/pack.json', 'utf8'));
const day = () => new Date().toISOString().slice(0, 10);
function appFixture() {
  return Object.assign(Object.create(Atelier.prototype), {
    pack, state: createState(pack), tab: 'studio', shopCategory: 'furniture',
    secrets: {}, runtime: null, resolve: src => src, imageBusy: new Set(),
    save() {}, async saveNow() {}, updateClockPanel() {},
  });
}
async function globals(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  try { await run(); } finally {
    clearTimeout(toast.timer);
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
function documentFixture() {
  const handlers = {}, notification = {};
  return { handlers, notification, document: {
    addEventListener: (type, callback) => { handlers[type] = callback; },
    getElementById: () => notification, querySelector: () => null,
  } };
}

test('submit routing applies precise coordinates and memory edits when a hidden id shadows form.id', async () => {
  const app = appFixture(), { document, handlers } = documentFixture();
  const placement = app.state.layouts[app.state.viewSceneId][0];
  let saves = 0, redraws = 0;
  Object.assign(app, { save: () => saves++, saveNow: async () => saves++,
    scene: { drawFurniture: () => redraws++ }, updateInspector() {}, render() {}, modal: () => ({ close() {} }),
  });
  class Form {
    constructor(id, data) { this.attributeId = id; this.data = data; this.id = { tagName: 'INPUT', value: data.id }; }
    getAttribute(name) { return name === 'id' ? this.attributeId : null; }
  }
  class FormValues extends Map { constructor(form) { super(Object.entries(form.data)); } }
  await globals({ document, HTMLFormElement: Form, FormData: FormValues }, async () => {
    app.bind();
    const form = new Form('inspector-form', { id: placement.id, furnitureId: placement.furnitureId, x: '19.2', y: '59.2', width: '20', z: '22', flip: 'on' });
    await handlers.submit({ target: form, preventDefault() {} });
    assert.ok(Math.abs(placement.x - 0.192) < 1e-10); assert.ok(Math.abs(placement.y - 0.592) < 1e-10);
    assert.equal(placement.width, 0.2); assert.equal(placement.z, 22); assert.equal(placement.flip, true);
    assert.equal(saves, 1); assert.equal(redraws, 1);
    app.state.memories = [{ id: 'memory-fixture', title: 'before' }];
    await handlers.submit({ target: new Form('memory-form', { id: 'memory-fixture', title: 'after', note: 'kept', destinationId: 'NZ' }), preventDefault() {} });
    assert.deepEqual(app.state.memories[0], { id: 'memory-fixture', title: 'after', note: 'kept', destinationId: 'NZ' });
    assert.equal(saves, 2);
  });
});

test('repeated furniture purchases retain shop scroll while category changes start at the top', async () => {
  const app = appFixture(), { document, handlers } = documentFixture();
  const content = { scrollTop: 640 };
  const root = { set innerHTML(value) { this.markup = value; content.scrollTop = 0; } };
  const nodes = { '#app': root, '#scene': { replaceWith() {} }, '.overlay-content': content, '.workspace-overlay': { focus() {} } };
  document.querySelector = selector => nodes[selector] || null;
  Object.assign(app, { tab: 'shop', renderedViewKey: 'shop:furniture', scene: {
    pack, state: app.state, scene: { id: app.state.viewSceneId }, node: {}, setEditing() {}, drawFurniture() {}, layout() {}, updateFrames() {},
  } });
  const product = pack.furniture.find(item => item.name.includes('画架'));
  const initial = app.state.economy.coins;
  await globals({ document }, async () => {
    app.bind();
    for (let i = 0; i < 2; i++) {
      const button = { dataset: { buyCategory: 'furniture', buyId: product.id } };
      await handlers.click({ target: { closest: () => button } });
      assert.equal(content.scrollTop, 640);
    }
    assert.equal(app.state.economy.coins, initial - 2 * priceOf(pack, 'furniture', product.id));
    app.shopCategory = 'items'; app.render(); assert.equal(content.scrollTop, 0);
  });
});

test('applying furniture changes keeps precise controls expanded and preserves panel scroll', async () => {
  const app = appFixture(), panel = { scrollTop: 180 };
  app.selection = { id: app.state.layouts[app.state.viewSceneId][0].id };
  let details = { open: true };
  const inspector = { querySelector: () => details, set innerHTML(value) { this.markup = value; details = { open: false }; panel.scrollTop = 0; } };
  await globals({ document: { querySelector: selector => selector === '#inspector' ? inspector : panel } }, async () => {
    app.updateInspector(); assert.equal(details.open, true); assert.equal(panel.scrollTop, 180);
  });
});

test('photo import creates a persistent file picker and supports repeated selection', async () => {
  const app = appFixture(); let input, clicks = 0, appended = 0, imported = 0;
  const document = { querySelector: () => input || null,
    createElement: tag => { assert.equal(tag, 'input'); return { click() { clicks++; } }; },
    body: { append(node) { input = node; appended++; } },
  };
  await globals({ document }, async () => {
    for (let i = 0; i < 2; i++) {
      await app.chooseFiles('image/*', files => { imported += files.length; }, true);
      assert.equal(input.type, 'file'); assert.equal(input.accept, 'image/*'); assert.equal(input.multiple, true);
      assert.equal(input.value, ''); input.files = [{ name: 'photo.png' }]; input.onchange(); await Promise.resolve();
    }
    assert.equal(appended, 1); assert.equal(clicks, 2); assert.equal(imported, 2);
  });
});

test('configured AI stays available beyond old daily caps while missing credentials still disable it', () => {
  const app = appFixture();
  Object.assign(app.state.settings, { connectionMode: 'direct', textModel: 'mock', imageModel: 'mock', maxAiTripsPerDay: 3, maxImagesPerDay: 3 });
  app.state.aiUsage[day()] = 1000; app.state.imageUsage[day()] = 1000;
  assert.deepEqual(travelApiPolicy(app.state, { textKey: 'mock', imageKey: 'mock' }), { text: true, image: true });
  assert.deepEqual(travelApiPolicy(app.state), { text: false, image: false });
});

test('precise coordinates and horizontal flip apply immediately without submitting the form', () => {
  const app = appFixture(), p = app.state.layouts[app.state.viewSceneId][0];
  app.selection = { id: p.id }; let draws = 0;
  app.scene = { drawFurniture: () => draws++ };
  assert.equal(app.updatePlacementField({ name: 'x', value: '22', validity: { valid: true } }), true);
  assert.equal(p.x, 0.22);
  app.updatePlacementField({ name: 'y', value: '56.7', validity: { valid: true } });
  assert.ok(Math.abs(p.y - 0.567) < 1e-10);
  app.updatePlacementField({ name: 'flip', checked: true }); assert.equal(p.flip, true);
  app.updatePlacementField({ name: 'flip', checked: false }); assert.equal(p.flip, false);
  assert.equal(app.updatePlacementField({ name: 'x', value: '', validity: { valid: true } }), false);
  assert.equal(app.updatePlacementField({ name: 'x', value: '101', validity: { valid: false } }), false);
  assert.equal(p.x, 0.22); assert.equal(draws, 4);
});

test('clicking the active housing tab keeps selection and never changes the ongoing trip', () => {
  const app = appFixture(), trip = { id: 'existing-trip', returnAt: 123456 };
  app.state.currentTrip = trip; app.selection = { id: 'selected-furniture' };
  app.navigate('studio', { toggle: true });
  assert.equal(app.tab, 'studio'); assert.equal(app.selection.id, 'selected-furniture');
  assert.equal(app.state.currentTrip, trip); assert.equal(trip.returnAt, 123456);
});

test('housing blocks automatic departure even after using the developer clock', async () => {
  const app = appFixture(); let departures = 0;
  app.state.nextTripAt = 0; app.state.settings.autoTravel = true; app.simulationActive = true;
  Object.assign(app, { modal: () => null, pumpJourneyPhotos() {}, async startTrip() { departures++; } });
  await globals({ document: { hidden: false, querySelector: () => null } }, async () => {
    app.tick(); assert.equal(departures, 0);
    app.tick(true, { forceAuto: true }); assert.equal(departures, 1);
  });
});

test('housing sidebar can collapse and reopen without exiting furniture editing or losing scroll', async () => {
  const app = appFixture(), restore = { hidden: true, focus() {} };
  const panel = { hidden: false, scrollTop: 210, querySelector: () => ({ focus() {} }) };
  const placement = app.state.layouts[app.state.viewSceneId][0];
  app.selection = { id: placement.id };
  await globals({ document: { querySelector: selector => selector === '.housing-panel' ? panel : restore } }, async () => {
    await app.action('toggle-housing');
    assert.equal(panel.hidden, true); assert.equal(restore.hidden, false);
    assert.equal(app.tab, 'studio'); assert.equal(app.selection.id, placement.id);
    panel.scrollTop = 0;
    await app.action('toggle-housing');
    assert.equal(panel.hidden, false); assert.equal(restore.hidden, true); assert.equal(panel.scrollTop, 210);
  });
});

test('floating furniture size controls update both sliders without changing position and obey size bounds', async () => {
  const app = appFixture(), placement = app.state.layouts[app.state.viewSceneId][0];
  app.selection = { id: placement.id }; app.housingCollapsed = true;
  const before = { x: placement.x, y: placement.y, z: placement.z };
  const inputs = [{}, {}], labels = [{}, {}]; let redraws = 0, saves = 0;
  app.scene = { drawFurniture: () => redraws++ }; app.save = () => saves++;
  await globals({ document: { querySelectorAll: selector => selector === '[data-size-label]' ? labels : inputs } }, async () => {
    app.resizeSelection(0.205);
    assert.equal(placement.width, 0.205);
    assert.deepEqual({ x: placement.x, y: placement.y, z: placement.z }, before);
    assert.ok(inputs.every(input => Math.abs(Number(input.value) - 20.5) < 1e-10));
    assert.ok(labels.every(label => label.textContent === '20.5%'));
    app.resizeSelection(0); assert.equal(placement.width, 0.02);
    app.resizeSelection(5); assert.equal(placement.width, 1);
    assert.equal(redraws, 3); assert.equal(saves, 3);
  });
});

test('both text planners make a fourth request despite limits stored in an old save', async () => {
  const app = appFixture(), itinerary = createItinerary(pack, app.state, destinationById('NZ'), 120, () => 0.5);
  Object.assign(app.state.settings, { connectionMode: 'direct', textModel: 'mock', textBaseUrl: 'https://example.test/v1', maxAiTripsPerDay: 3 });
  let calls = 0;
  await globals({ fetch: async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify(calls === 1 ? { destinationId: 'NZ', title: 'Test', reason: 'Test reason', prompt: 'An original companion beside a quiet lake.' } : itinerary) } }] }); } }, async () => {
    app.state.aiUsage[day()] = 3;
    await planWithAI(pack, app.state, { textKey: 'mock' }, null, 'NZ', '');
    assert.equal(app.state.aiUsage[day()], 4);
    app.state.aiUsage[day()] = 3;
    await planJourneyWithAI(pack, app.state, { textKey: 'mock' }, null, itinerary);
    assert.equal(app.state.aiUsage[day()], 4); assert.equal(calls, 2);
  });
});

test('journey-node and legacy photo generation attempt request four and beyond with a valid configuration', async () => {
  const app = appFixture();
  Object.assign(app.state.settings, { connectionMode: 'direct', imageMode: 'generate', imageModel: 'mock', imageBaseUrl: 'https://example.test/v1', maxImagesPerDay: 3 });
  app.secrets.imageKey = 'mock';
  app.modal = () => null;
  app.fallbackJourneyPhotos = () => {};
  const itinerary = createItinerary(pack, app.state, destinationById('NZ'), 120, () => 0.5);
  const trip = commitDeparture(app.state, planLocally(pack, app.state, 'NZ'), { photoMode: 'generated', itinerary }, Date.now());
  const node = trip.itinerary.nodes[0]; node.triggeredAt = Date.now();
  let calls = 0;
  // Stop at the mocked provider boundary: no paid request, DOM image decoder or storage is required.
  await globals({ fetch: async () => { calls++; throw new Error('Mock provider failure'); } }, async () => {
    app.state.imageUsage[day()] = 3;
    await app.generateJourneyPhoto(node.id);
    assert.equal(calls, 1); assert.equal(app.state.imageUsage[day()], 4);
    app.state.currentTrip = null;
    app.state.trips.push({ id: 'legacy-photo', destinationId: 'NZ', imageStatus: 'default', prompt: 'Test' });
    app.state.imageUsage[day()] = 100;
    await app.generateTripImage('legacy-photo', true);
    assert.equal(calls, 2); assert.equal(app.state.imageUsage[day()], 101);
  });
});
