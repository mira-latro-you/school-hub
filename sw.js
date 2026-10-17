/*
 * Smart School Hub – Service Worker
 * Speichert nur die App-Hülle (HTML, CSS, JS, Icons), damit die App schnell startet
 * und installierbar ist. Deine Daten werden NICHT zwischengespeichert.
 * Nach Änderungen an Dateien: VERSION hochzählen, sonst sehen Handys die alte Version.
 */
var VERSION = 'hub-v2';
var SHELL = ['./', 'index.html', 'style.css', 'app.js', 'api.js', 'config.js', 'mock-data.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Nur eigene Dateien per GET: erst Netz, bei Offline aus dem Speicher. API-Aufrufe laufen unberührt durch. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
    })
  );
});
