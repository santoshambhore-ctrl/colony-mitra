/* ============================================================
   Service Worker  —  speed ke liye
   • app.js / css / images  → CACHE FIRST (turant khule)
   • index.html             → NETWORK FIRST (fresh rahe)
   • firebase-config.js     → STALE + revalidate
   ============================================================ */
const VERSION = "v46";
const CACHE_STATIC = "cm-static-" + VERSION;
const CACHE_PAGES  = "cm-pages-"  + VERSION;

const STATIC = [
  "./index.html",
  "./style.css?v45",
  "./app.js?v45",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => Promise.allSettled(STATIC.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_STATIC && k !== CACHE_PAGES)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* Firebase aur CDN ko haath mat lagao — hamesha network */
  if (url.origin !== location.origin) return;

  /* 1) HTML — network first (fresh content) */
  if (req.mode === "navigate" || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_PAGES).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  /* 2) firebase-config.js — turant de, background me update kar */
  if (url.pathname.endsWith("firebase-config.js")) {
    e.respondWith(
      caches.open(CACHE_PAGES).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  /* 3) baaki sab static — CACHE FIRST (bahut fast) */
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        /* background me quietly naya version laa do */
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE_STATIC).then(c => c.put(req, res));
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then(res => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});