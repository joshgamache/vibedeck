const CACHE_NAME = "vibedeck-v1";
const STATIC_ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg"];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()),
  );
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Fetch Event
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Only intercept requests to our own site or fonts providers
  if (
    url.origin === location.origin ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("fonts.googleapis.com")
  ) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Fetch update in background for stale-while-revalidate
          fetch(e.request)
            .then((networkResponse) => {
              if (networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
              }
            })
            .catch(() => {
              // Silence network errors when offline
            });
          return cachedResponse;
        }

        return fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
          }
          return networkResponse;
        });
      }),
    );
  }
});
