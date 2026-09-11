const CACHE = "roam-atelier-20260911-v21-export-live-edit";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app-icon.png",
  "./app-icon-q90.webp",
  "./styles.css",
  "./workbench.css",
  "./immersive.css",
  "./game-ui.css",
  "./ui-skin.css",
  "./ui/painted/paper-panel-q90.webp",
  "./ui/painted/button-neutral-q90.webp",
  "./ui/painted/button-primary-q90.webp",
  "./atlas.css",
  "./app/atlas.js",
  "./app/core/atlas.js",
  "./maps/world-atlas.json",
  "./maps/china-atlas.json",
  "./app/main.js",
  "./app/views.js",
  "./app/util.js",
  "./app/storage.js",
  "./app/scene.js",
  "./app/images.js",
  "./app/core/frame-buffer.js",
  "./app/core/camera.js",
  "./app/ai.js",
  "./app/webmcp.js",
  "./app/core/engine.js",
  "./app/core/clock.js",
  "./app/core/provider.js",
  "./app/core/economy.js",
  "./app/core/travel.js",
  "./app/core/itinerary.js",
  "./app/core/photo-styles.js",
  "./app/photo-style-previews.js",
  "./app/core/pack.js",
  "./app/core/archive.js",
  "./app/core/pack-upgrade.js",
  "./app/core/catalog.js",
  "./vendor/fflate.js",
  "./packs/reading-room/pack.json",
  "./maps/maps.json",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE);
      const response = await cache.match("./packs/reading-room/pack.json");
      const pack = await response.json();
      const essentials = new Set([
        pack.scenes[0].background,
        pack.outfits.find(o => o.id === pack.baseOutfitId)?.preview?.asset,
        pack.furniture[0].empty?.asset,
        ...Object.values(pack.furniture[0].actions).flatMap(a => a.variants[pack.baseOutfitId]?.frames.map(f => f.asset) || []),
      ]);
      await cache.addAll([...essentials].filter(id => pack.assets[id]).map(id => "./packs/reading-room/" + pack.assets[id].src));
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("roam-atelier-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.includes("/api/") ||
    url.pathname.includes("/__")
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        const saved = await cache.match(event.request);
        if (saved) return saved;
        if (event.request.mode === "navigate")
          return await cache.match("./index.html");
        return new Response("Offline resource not cached", { status: 503 });
      }
    })(),
  );
});
