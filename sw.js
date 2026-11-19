// Fran TV — service worker
const CACHE = "frantv-v3.0.0";
const PRECACHE = [
  "./",
  "index.html",
  "css/styles.css",
  "js/app.js",
  "js/m3u.js",
  "js/store.js",
  "js/player.js",
  "js/update.js",
  "libs/motion.min.js",
  "libs/hls.light.min.js",
  "data/fran.m3u",
  "data/internacional.m3u",
  "data/variado.m3u",
  "manifest.webmanifest",
  "favicon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: "no-store" });
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match("index.html")) || Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const update = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  if (cached) { event.waitUntil(update); return cached; }
  return update;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Streams, logos y listas externas van directo a la red
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith("version.json")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
  } else if (request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html")) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
