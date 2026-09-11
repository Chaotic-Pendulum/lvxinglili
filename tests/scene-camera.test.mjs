import test from "node:test";
import assert from "node:assert/strict";
import { sceneCameraLayout } from "../dist/app/core/camera.js";
import { SceneView } from "../dist/app/scene.js";

function assertCovered(layout, scene, viewport) {
  const epsilon = 1e-7;
  assert.ok(layout.x <= epsilon, "left edge must not expose the viewport");
  assert.ok(layout.y <= epsilon, "top edge must not expose the viewport");
  assert.ok(layout.x + scene.width * layout.scale >= viewport.width - epsilon, "right edge must cover the viewport");
  assert.ok(layout.y + scene.height * layout.scale >= viewport.height - epsilon, "bottom edge must cover the viewport");
  assert.ok(layout.camera.zoom >= 1 && layout.camera.zoom <= 5);
}

test("wallpaper cover holds at every drag limit across landscape, portrait and ultrawide windows", () => {
  for (const [sw, sh] of [[1600, 900], [900, 1600], [1000, 1000]]) {
    const scene = { width: sw, height: sh };
    for (const [vw, vh] of [[1280, 720], [390, 844], [844, 390], [2560, 720]]) {
      const viewport = { width: vw, height: vh };
      for (const zoom of [0.01, 0.5, 1, 1.4, 5, 8]) {
        for (const x of [-1e5, 0, 1e5]) for (const y of [-1e5, 0, 1e5]) {
          assertCovered(sceneCameraLayout(scene, viewport, { zoom, x, y }), scene, viewport);
        }
      }
    }
  }
});

function fixture(viewport = { width: 1280, height: 720 }, camera = {}) {
  const node = new EventTarget(), controller = new AbortController();
  const controls = new Map(["[data-zoom-label]", '[data-action="zoom-out"]', '[data-action="zoom-in"]'].map((selector) => [selector, {}]));
  Object.assign(node, {
    getBoundingClientRect: () => viewport,
    setPointerCapture() {},
    classList: { add() {}, remove() {} },
    parentElement: { querySelector: (selector) => controls.get(selector) },
    dataset: {},
  });
  const view = Object.assign(Object.create(SceneView.prototype), {
    node, scene: { width: 1600, height: 900 }, camera: { zoom: 1, x: 0, y: 0, ...camera },
    plane: { style: {} }, pointers: new Map(), signal: controller.signal, edit: false, onCamera() {},
  });
  view.layout();
  view.bind();
  const pointer = (type, pointerId, clientX, clientY) => {
    const event = new Event(type);
    Object.assign(event, { button: 0, pointerId, clientX, clientY });
    node.dispatchEvent(event);
  };
  const check = () => {
    const [, x, y, scale] = view.plane.style.transform.match(/translate\(([^,]+)px,([^,]+)px\) scale\(([^)]+)\)/).map(Number);
    assertCovered({ x, y, scale, camera: view.camera }, view.scene, viewport);
  };
  return { view, viewport, controls, pointer, check, close: () => controller.abort() };
}

test("zoom controls and reset cannot shrink below fill, including old offscreen camera settings", () => {
  const f = fixture({ width: 390, height: 844 }, { zoom: 0.1, x: 5000, y: -5000 });
  try {
    f.check();
    assert.equal(f.view.camera.zoom, 1);
    assert.equal(f.controls.get('[data-action="zoom-out"]').disabled, true);
    f.view.zoom(0.0001);
    f.check();
    assert.equal(f.view.node.dataset.zoom, "100%");
    f.view.zoom(100);
    f.check();
    assert.equal(f.controls.get('[data-action="zoom-in"]').disabled, true);
    f.view.fitView();
    f.check();
    assert.deepEqual(f.view.camera, { zoom: 1, x: 0, y: 0 });
  } finally { f.close(); }
});

test("mouse dragging and two-pointer pinch both obey the same cover bounds", () => {
  const f = fixture();
  try {
    f.pointer("pointerdown", 1, 100, 100);
    f.pointer("pointermove", 1, 10000, -10000);
    f.check();
    assert.equal(f.view.camera.x, 0);
    assert.equal(f.view.camera.y, 0);
    f.pointer("pointerup", 1, 10000, -10000);
    f.view.zoom(2);
    f.pointer("pointerdown", 1, 300, 300);
    f.pointer("pointermove", 1, -10000, 10000);
    f.check();
    f.pointer("pointerup", 1, -10000, 10000);
    f.pointer("pointerdown", 1, 200, 200);
    f.pointer("pointerdown", 2, 400, 200);
    f.pointer("pointermove", 2, 201, 200);
    f.check();
    assert.equal(f.view.camera.zoom, 1);
    f.pointer("pointermove", 2, 50000, 200);
    f.check();
    assert.equal(f.view.camera.zoom, 5);
    f.pointer("pointerup", 2, 50000, 200);
    f.pointer("pointerup", 1, 200, 200);
  } finally { f.close(); }
});

test("resizing rechecks all edges and hidden viewports preserve the last valid transform", () => {
  const f = fixture({ width: 390, height: 844 }, { zoom: 1.5, x: 1000, y: -1000 });
  try {
    for (const [width, height] of [[2560, 720], [844, 390], [390, 844]]) {
      Object.assign(f.viewport, { width, height });
      f.view.layout();
      f.check();
    }
    const transform = f.view.plane.style.transform;
    f.viewport.width = 0;
    f.view.layout();
    assert.equal(f.view.plane.style.transform, transform);
    const normalized = sceneCameraLayout(f.view.scene, { width: 1280, height: 720 }, { zoom: NaN, x: Infinity, y: NaN });
    assertCovered(normalized, f.view.scene, { width: 1280, height: 720 });
    assert.deepEqual(normalized.camera, { zoom: 1, x: 0, y: 0 });
  } finally { f.close(); }
});
