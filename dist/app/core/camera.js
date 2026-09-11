export const MIN_CAMERA_ZOOM = 1;
export const MAX_CAMERA_ZOOM = 5;

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const limit = (value, min, max) => Math.min(max, Math.max(min, value));

// Camera offsets are in scene coordinates, measured from the centered view.
// Cover is the minimum scale: every allowed offset must still cover all four edges.
export function sceneCameraLayout(scene, viewport, camera = {}) {
  const { width, height } = viewport;
  if (![width, height, scene.width, scene.height].every((size) => Number.isFinite(size) && size > 0)) return null;
  const fit = Math.max(width / scene.width, height / scene.height);
  const zoom = limit(finite(camera.zoom, MIN_CAMERA_ZOOM), MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const scale = fit * zoom;
  const maxX = Math.max(0, (scene.width - width / scale) / 2);
  const maxY = Math.max(0, (scene.height - height / scale) / 2);
  const x = maxX > 0 ? limit(finite(camera.x, 0), -maxX, maxX) : 0;
  const y = maxY > 0 ? limit(finite(camera.y, 0), -maxY, maxY) : 0;
  return {
    fit,
    scale,
    camera: { zoom, x, y },
    x: (width - scene.width * scale) / 2 + x * scale,
    y: (height - scene.height * scale) / 2 + y * scale,
  };
}
