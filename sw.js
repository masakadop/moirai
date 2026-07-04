// Service Worker: オフライン起動対応
// - 同一オリジン: ネットワーク優先(更新を即反映)、失敗時はキャッシュ
// - CDN(MediaPipe): キャッシュ優先(URL がバージョン固定のため)

const CACHE_NAME = "pngtuber-v2";

const APP_SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/camera.js",
  "js/face.js",
  "js/avatar.js",
  "js/storage.js",
  "js/mic.js",
  "assets/sample/closed.png",
  "assets/sample/open.png",
  "assets/sample/blink.png",
  "assets/sample/hair_front.png",
  "assets/sample/hair_back.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "manifest.webmanifest",
];

const CDN_HOSTS = ["cdn.jsdelivr.net", "storage.googleapis.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error("offline and not cached: " + request.url);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === location.origin) {
    e.respondWith(networkFirst(request));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(request));
  }
});
