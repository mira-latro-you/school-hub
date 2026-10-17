/*
 * Smart School Hub – Verbindung zum Backend
 *
 * RUN().withSuccessHandler(ok).withFailureHandler(fail).getDashboard()
 * funktioniert in drei Umgebungen gleich:
 *   1. Innerhalb von Apps Script      → google.script.run
 *   2. Eigene Seite (GitHub Pages)     → fetch an CONFIG.API_URL (doPost in Api.gs)
 *   3. Lokal ohne API_URL (Live Server) → Beispieldaten aus mock-data.js
 */
(function () {
  var cfg = window.CONFIG || {};

  /* Schlüssel aus dem Link (?k=…) holen und auf dem Gerät merken.
     Der Link bleibt bewusst unverändert, damit „Zum Home-Bildschirm“ ihn mitnimmt. */
  function readKey() {
    var k = '';
    try { k = new URLSearchParams(location.search).get('k') || ''; } catch (e) { /* alter Browser */ }
    try {
      if (k) localStorage.setItem('hubKey', k);
      else k = localStorage.getItem('hubKey') || '';
    } catch (e) { /* privater Modus */ }
    return k;
  }

  var inAppsScript = !!(window.google && google.script && google.script.run);
  var KEY = typeof window.APP_KEY === 'string' ? window.APP_KEY : readKey();
  var MODE = inAppsScript ? 'appsscript' : (cfg.API_URL ? 'remote' : 'mock');
  window.HUB_MODE = MODE;

  function callRemote(name, args, ok, fail) {
    fetch(cfg.API_URL, {
      method: 'POST',
      // text/plain verhindert die CORS-Vorabfrage, die Apps Script nicht beantwortet
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ k: KEY, fn: name, args: args }),
      redirect: 'follow',
    })
      .then(function (r) { if (!r.ok) throw new Error('Server antwortet mit ' + r.status); return r.json(); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || 'Unbekannter Fehler');
        if (ok) ok(res.data);
      })
      .catch(function (err) {
        if (fail) fail(err instanceof Error ? err : new Error(String(err)));
        else console.error(err);
      });
  }

  function callMock(name, args, ok, fail) {
    setTimeout(function () {
      try {
        var f = window.MOCK_API && window.MOCK_API[name];
        if (!f) throw new Error('Im Testmodus nicht verfügbar: ' + name);
        var res = f.apply(null, args);
        if (ok) ok(JSON.parse(JSON.stringify(res === undefined ? null : res)));
      } catch (err) {
        if (fail) fail(err); else console.error(err);
      }
    }, 250);
  }

  window.RUN = function () {
    var ok = null, fail = null, base = {};
    base.withSuccessHandler = function (f) { ok = f; return proxy; };
    base.withFailureHandler = function (f) { fail = f; return proxy; };
    var proxy = new Proxy(base, {
      get: function (t, name) {
        if (name in t) return t[name];
        return function () {
          var args = Array.prototype.slice.call(arguments);
          if (MODE === 'appsscript') {
            var r = google.script.run;
            if (ok) r = r.withSuccessHandler(ok);
            if (fail) r = r.withFailureHandler(fail);
            r.api(KEY, name, args);
          } else if (MODE === 'remote') {
            if (!KEY) { showLock(); return; }
            callRemote(name, args, ok, fail);
          } else {
            callMock(name, args, ok, fail);
          }
        };
      },
    });
    return proxy;
  };

  /* Ohne Schlüssel: kurzer Hinweis mit Feld zum Einfügen des persönlichen Links. */
  function showLock() {
    if (document.getElementById('lock')) return;
    var d = document.createElement('div');
    d.id = 'lock';
    d.innerHTML = '<div class="lock-card"><h1>School Hub</h1>' +
      '<p>Füg hier deinen persönlichen App-Link ein, um deine Daten zu laden.</p>' +
      '<input id="lockInput" type="url" placeholder="https://…?k=…" autocomplete="off">' +
      '<button id="lockBtn" type="button">Verbinden</button></div>';
    document.body.appendChild(d);
    document.getElementById('lockBtn').addEventListener('click', function () {
      var v = document.getElementById('lockInput').value.trim();
      var m = v.match(/[?&]k=([^&#]+)/);
      var k = m ? decodeURIComponent(m[1]) : v;
      if (!k) return;
      try { localStorage.setItem('hubKey', k); } catch (e) { /* egal */ }
      location.href = location.pathname + '?k=' + encodeURIComponent(k);
    });
  }

  /* Testmodus sichtbar machen, damit niemand Beispieldaten für echte hält. */
  if (MODE === 'mock') {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.className = 'mock-badge';
      b.textContent = 'Testmodus · Beispieldaten';
      document.body.appendChild(b);
    });
  }

  /* Offline-Hülle und Installierbarkeit (nur auf eigener Seite, nicht in Apps Script). */
  if (!inAppsScript && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Service Worker:', e); });
    });
  }
})();
