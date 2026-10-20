/*
 * Smart School Hub – Service Worker
 * Speichert nur die App-Hülle (HTML, CSS, JS, Icons), damit die App schnell startet
 * und installierbar ist. Deine Daten werden NICHT zwischengespeichert.
 * Nach Änderungen an Dateien: VERSION hochzählen, sonst sehen Handys die alte Version.
 */
var VERSION = 'hub-v3';
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

/* App-Hülle: sofort aus dem Speicher (auch ohne Netz), im Hintergrund still aktualisieren.
   Neue Versionen erscheinen dadurch beim übernächsten Öffnen. API-Aufrufe laufen unberührt durch. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var update = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit || cache.match('index.html'); });
      if (hit) { e.waitUntil(update.then(function () {}, function () {})); return hit; }
      return update;
    });
  }));
});
