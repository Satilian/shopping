/* global settings, self, caches, fetch, URL, Response */
const { cacheName, assets } = settings;
const pages = ['/', '/shopping'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...pages, ...assets])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('shopping-list-') && key !== cacheName).map((key) => caches.delete(key))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && pages.includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match(url.pathname, { cacheName })) ?? Response.error()));
  } else if (assets.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname, { cacheName }).then((cached) => cached ?? fetch(event.request)));
  }
});
