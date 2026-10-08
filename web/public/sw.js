/* Installing Cards Collect adds the website to a device. It is not a native app.
   This worker must not store /api responses. A collection is private and is
   loaded from the network with the session cookie. There is no offline copy. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request, { cache: "no-store" }));
});
