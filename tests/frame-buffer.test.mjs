import test from "node:test";
import assert from "node:assert/strict";
import { FrameBuffer } from "../dist/app/core/frame-buffer.js";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness() {
  const requests = new Map(),
    commits = [],
    errors = [];
  const buffer = new FrameBuffer({
    load: (value) =>
      new Promise((resolve, reject) =>
        requests.set(value, { resolve, reject }),
      ),
    commit: (ready) => commits.push(ready),
    onError: (error) => errors.push(error.message),
  });
  return { buffer, requests, commits, errors };
}
test("a slow next frame leaves the last ready frame visible", async () => {
  const h = harness();
  h.buffer.present("a", "a");
  await flush();
  h.requests.get("a").resolve("image-a");
  await flush();
  h.buffer.present("b", "b");
  await flush();
  assert.deepEqual(h.commits, ["image-a"]);
  assert.equal(h.buffer.visibleKey, "a");
  h.requests.get("b").resolve("image-b");
  await flush();
  assert.deepEqual(h.commits, ["image-a", "image-b"]);
});
test("a late image cannot overwrite a more recently selected outfit", async () => {
  const h = harness();
  h.buffer.present("winter", "winter");
  await flush();
  h.buffer.present("rain", "rain");
  await flush();
  h.requests.get("rain").resolve("rain-image");
  await flush();
  h.requests.get("winter").resolve("winter-image");
  await flush();
  assert.deepEqual(h.commits, ["rain-image"]);
});
test("returning to the visible frame cancels an outstanding replacement", async () => {
  const h = harness();
  h.buffer.present("a", "a");
  await flush();
  h.requests.get("a").resolve("a");
  await flush();
  h.buffer.present("b", "b");
  await flush();
  h.buffer.present("a", "a");
  h.requests.get("b").resolve("b");
  await flush();
  assert.deepEqual(h.commits, ["a"]);
});
test("failed decoding retains the previous frame without retrying on every tick", async () => {
  const h = harness();
  h.buffer.present("a", "a");
  await flush();
  h.requests.get("a").resolve("a");
  await flush();
  h.buffer.present("bad", "bad");
  await flush();
  h.requests.get("bad").reject(new Error("decode failed"));
  await flush();
  for (let i = 0; i < 20; i++) h.buffer.present("bad", "bad");
  await flush();
  assert.deepEqual(h.commits, ["a"]);
  assert.deepEqual(h.errors, ["decode failed"]);
  assert.equal(h.requests.size, 2);
});
test("destroyed scenes cannot receive images from old async work", async () => {
  const h = harness();
  h.buffer.present("a", "a");
  await flush();
  h.buffer.dispose();
  h.requests.get("a").resolve("a");
  await flush();
  assert.deepEqual(h.commits, []);
});
