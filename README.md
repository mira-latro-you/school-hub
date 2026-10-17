# Smart School Hub – lokale Version

Das ist die Oberfläche deines School Hubs als eigenständige Web-App.
Das Backend (Untis, Kalender, Gemini, Teams-Mails, Sheets) bleibt in Google Apps Script.

```
school-hub/
├── index.html        Aufbau der Seite
├── style.css         Design (Soft Dark + Glas)
├── app.js            Logik der Oberfläche
├── api.js            Verbindung: Apps Script, eigene Seite oder Testmodus
├── config.js         API_URL eintragen (leer = Testmodus)
├── mock-data.js      Beispieldaten für Live Server
├── manifest.json     macht die App installierbar („Zum Home-Bildschirm“)
├── sw.js             Service Worker (App-Hülle offline, Installierbarkeit)
├──             App-Icons
└── backend/Api.gs    JSON-Schnittstelle, kommt zusätzlich in dein Apps-Script-Projekt
```

## 1. Lokal am Design arbeiten (Testmodus)

1. VS Code installieren: https://code.visualstudio.com
2. In VS Code links auf Erweiterungen → **Live Server** (von Ritwick Dey) installieren.
3. **Datei → Ordner öffnen…** → `school-hub` wählen.
4. Unten rechts auf **Go Live** klicken. Die App öffnet sich unter `http://127.0.0.1:5500`.

Solange `API_URL` in `config.js` leer ist, läuft alles mit Beispieldaten
(oben steht „Testmodus · Beispieldaten“). Jede Änderung an `style.css` oder `app.js`
siehst du nach dem Speichern sofort im Browser. Tafelbild-Scan, Berichtsheft und
„Termine aus Datei“ brauchen Gemini und gehen deshalb nur mit echtem Backend.

Tipp: Im Browser mit `Cmd + Alt + I` die Entwicklertools öffnen und oben auf das
Handy-Symbol klicken, dann siehst du die mobile Ansicht.

## 2. Mit echten Daten verbinden

1. In Apps Script eine neue Datei **Api** anlegen und den Inhalt von `backend/Api.gs` einfügen. Speichern.
2. **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Version: Neue Version → Bereitstellen.**
   Die URL ändert sich dadurch nicht.
3. Die Web-App-URL (endet auf `/exec`, **ohne** `?k=…`) in `config.js` bei `API_URL` eintragen.
4. App mit deinem Schlüssel öffnen: `http://127.0.0.1:5500/?k=DEIN_SCHLÜSSEL`
   Der Schlüssel wird auf dem Gerät gespeichert. Schreib ihn nie in eine Datei, die online landet.

Die alte Apps-Script-Seite funktioniert weiter wie bisher.

## 3. Als App aufs Handy (ohne Adressleiste)

Eine Apps-Script-Seite kann das nicht, weil Google sie in einen Rahmen packt und
`manifest.json` dort ignoriert wird. Deshalb muss die Oberfläche auf einer eigenen,
kostenlosen Seite liegen, zum Beispiel **GitHub Pages**:

1. Kostenloses Konto auf https://github.com, neues Repository `school-hub` (Public reicht,
   im Code stehen keine Geheimnisse – nur die `/exec`-URL, die ohne Schlüssel nichts herausgibt).
2. Alle Dateien aus diesem Ordner hochladen (**Add file → Upload files**).
3. **Settings → Pages → Branch: main → Save.** Nach etwa einer Minute ist die App unter
   `https://DEINNAME.github.io/school-hub/` erreichbar.
4. Auf dem Handy `https://DEINNAME.github.io/school-hub/?k=DEIN_SCHLÜSSEL` öffnen
   - **iPhone (Safari):** Teilen → „Zum Home-Bildschirm“
   - **Android (Chrome):** ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“

Nach Änderungen in `sw.js` die Zeile `VERSION = 'hub-v1'` hochzählen (`hub-v2` …),
sonst zeigen installierte Apps noch die alte Version.

## 4. Backend auch lokal bearbeiten (optional, mit clasp)

`clasp` ist Googles Werkzeug, um Apps-Script-Code in VS Code zu bearbeiten.

```bash
# einmalig (Node.js von https://nodejs.org vorher installieren)
npm install -g @google/clasp
clasp login
# Apps Script → Projekteinstellungen → Skript-ID kopieren
mkdir backend-clasp && cd backend-clasp
clasp clone DEINE_SKRIPT_ID      # holt alle .gs-Dateien
clasp push                       # lädt deine Änderungen hoch
```

Vorher einmal https://script.google.com/home/usersettings öffnen und die
**Google Apps Script API** einschalten. Bereitstellen (neue Version) weiter im Browser.
