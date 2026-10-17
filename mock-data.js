/*
 * Smart School Hub – Beispieldaten für den Testmodus (nur aktiv, wenn CONFIG.API_URL leer ist).
 * Damit kannst du mit Live Server am Design arbeiten, ohne Apps Script zu berühren.
 * Änderungen (Aufgabe abhaken, Notiz anlegen …) gelten nur bis zum Neuladen.
 */
(function () {
  if ((window.CONFIG || {}).API_URL) return;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function day(offset) {
    var d = new Date(); d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function now() { var d = new Date(); return day(0) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  /* nächste Schultage (Mo–Fr) ab heute */
  function schoolDays(n) {
    var out = [], i = 0;
    while (out.length < n && i < 21) { var d = new Date(); d.setDate(d.getDate() + i); if (d.getDay() > 0 && d.getDay() < 6) out.push(i); i++; }
    return out;
  }

  var PLAN = [
    ['07:45', '09:15', 'LF03', 'B204', 'Mül'], ['09:35', '11:05', 'D', 'B112', 'Sch'],
    ['11:20', '12:50', 'LF05', 'C010', 'Kra'], ['13:30', '15:00', 'E-E', 'B112', 'Wag'],
  ];
  var lessons = [], id = 1;
  schoolDays(5).forEach(function (o, di) {
    PLAN.forEach(function (p, pi) {
      var l = { id: String(id++), datum: day(o), start: p[0], ende: p[1], fach: p[2], raum: p[3], lehrer: p[4],
        status: 'Regulär', info: '', hausaufgaben: '', pruefung: '' };
      if (di === 0 && pi === 2) { l.status = 'Entfall'; l.info = 'Lehrkraft fortgebildet'; }
      if (di === 1 && pi === 1) { l.status = 'Änderung'; l.raum = 'A001 (B112)'; }
      if (di === 1 && pi === 0) l.hausaufgaben = 'Arbeitsblatt Prozessmodellierung fertigstellen';
      lessons.push(l);
    });
  });

  var S = {
    lessons: lessons,
    events: [
      { id: 'e1', title: 'Projektmeeting Ausbildung', calendar: 'Privat', color: '#E2792F', allDay: false,
        datum: day(1), endDatum: day(1), start: '16:00', ende: '17:00', ort: 'Teams', notiz: '', fromApp: true },
      { id: 'e2', title: 'VfB Stuttgart – Heimspiel', calendar: 'VfB Stuttgart', color: '#C0392B', allDay: false,
        datum: day(3), endDatum: day(3), start: '18:30', ende: '20:30', ort: 'MHPArena', notiz: '', fromApp: false },
    ],
    notes: [
      { id: 'n1', erstellt: now(), geaendert: now(), datum: day(-1), fach: 'LF03', titel: 'Geschäftsprozesse – BPMN',
        text: 'Start- und Endereignis, Aufgaben, Gateways (XOR/AND).\nBeispiel: Bestellprozess.', tags: 'bpmn,prüfung', bild: '' },
      { id: 'n2', erstellt: now(), geaendert: now(), datum: day(-3), fach: 'D', titel: 'Erörterung Aufbau',
        text: 'Einleitung, These, Argumente steigernd, Fazit.', tags: 'schreiben', bild: '' },
    ],
    reports: [],
    grades: [
      { id: 'g1', datum: day(-20), fach: 'LF03', art: 'Klassenarbeit', bez: 'Prozesse', note: 2.3, gewicht: 1 },
      { id: 'g2', datum: day(-12), fach: 'D', art: 'Mündlich', bez: 'Referat', note: 1.7, gewicht: 1 },
    ],
    absences: [],
    tasks: [
      { id: 't1', titel: 'Arbeitsblatt Prozessmodellierung', fach: 'LF03', faellig: day(1), zeit: '', quelle: 'Untis', link: '',
        erledigt: false, notiz: '', erstellt: now(), erledigtAm: '' },
      { id: 't2', titel: 'Vokabeln Unit 4 lernen', fach: 'E-E', faellig: day(4), zeit: '', quelle: 'Teams', link: '',
        erledigt: false, notiz: 'Aus Teams-Mail', erstellt: now(), erledigtAm: '' },
      { id: 't3', titel: 'Berichtsheft KW eintragen', fach: '', faellig: day(-1), zeit: '', quelle: 'App', link: '',
        erledigt: true, notiz: '', erstellt: now(), erledigtAm: now() },
    ],
    exams: [
      { titel: 'Klassenarbeit LF03', datum: day(6), start: '07:45', fach: 'LF03', quelle: 'Untis' },
      { titel: 'Englisch Test', datum: day(13), start: '', fach: 'E-E', quelle: 'Berufsschule' },
    ],
    status: [
      { key: 'untis', label: 'Untis', level: 'ok', detail: 'Zuletzt abgeglichen vor 4 Min.', hint: '', msg: '' },
      { key: 'mail', label: 'Mails', level: 'ok', detail: 'Letzte Schulmail vor 2 Std.', hint: '', msg: '' },
      { key: 'gemini', label: 'Gemini', level: 'ok', detail: 'Zuletzt erfolgreich vor 1 Std.', hint: '', msg: '' },
      { key: 'auto', label: 'Automatik', level: 'ok', detail: 'Alle 4 Abläufe aktiv', hint: '', msg: '' },
    ],
    weights: {},
    teachers: { 'Mül': 'Frau Müller', 'Sch': 'Herr Schmidt', 'Kra': 'Frau Kraus', 'Wag': 'Herr Wagner' },
    subjects: { LF03: 'Geschäftsprozesse', LF05: 'Daten und Informationen', D: 'Deutsch', 'E-E': 'Englisch' },
    updates: [
      { zeitpunkt: now(), stunde: day(0) + ' 11:20', fach: 'LF05', art: 'Entfall', meldung: 'LF05 fällt aus', gelesen: false },
    ],
    lastSync: now(),
  };

  var seq = 100;
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return i; return -1; }
  function dash() { return S; }

  window.MOCK_API = {
    getDashboard: dash,
    syncNow: function () { S.lastSync = now(); return S; },
    markRead: function (items) { S.updates.forEach(function (u) { u.gelesen = true; }); return (items || []).length; },

    saveTask: function (t) {
      if (!t || !String(t.titel || '').trim()) throw new Error('Bitte einen Titel eingeben.');
      var i = t.id ? find(S.tasks, t.id) : -1;
      var row = { id: t.id || 't' + (seq++), titel: t.titel, fach: t.fach || '', faellig: t.faellig || '', zeit: t.zeit || '',
        quelle: 'App', link: '', erledigt: false, notiz: t.notiz || '', erstellt: now(), erledigtAm: '' };
      if (i >= 0) S.tasks[i] = Object.assign(S.tasks[i], row); else S.tasks.push(row);
      return S.tasks;
    },
    setTaskDone: function (id, done) {
      var i = find(S.tasks, id); if (i >= 0) { S.tasks[i].erledigt = !!done; S.tasks[i].erledigtAm = done ? now() : ''; }
      return S.tasks;
    },
    deleteTask: function (id) { S.tasks = S.tasks.filter(function (t) { return t.id !== id; }); return S.tasks; },

    saveNote: function (n) {
      n = n || {};
      var i = n.id ? find(S.notes, n.id) : -1;
      var row = { id: n.id || 'n' + (seq++), erstellt: now(), geaendert: now(), datum: n.datum || day(0), fach: n.fach || 'Allgemein',
        titel: n.titel || '', text: n.text || '', tags: n.tags || '', bild: n.bild || '' };
      if (i >= 0) S.notes[i] = row; else S.notes.unshift(row);
      return S.notes;
    },
    deleteNote: function (id) { S.notes = S.notes.filter(function (n) { return n.id !== id; }); return S.notes; },

    saveGrade: function (g) {
      g = Object.assign({}, g); g.id = g.id || 'g' + (seq++); g.note = Number(String(g.note).replace(',', '.'));
      g.gewicht = Number(String(g.gewicht || '1').replace(',', '.')) || 1;
      var i = find(S.grades, g.id); if (i >= 0) S.grades[i] = g; else S.grades.push(g);
      return { grades: S.grades, weights: S.weights };
    },
    deleteGrade: function (id) { S.grades = S.grades.filter(function (g) { return g.id !== id; }); return { grades: S.grades, weights: S.weights }; },
    setWeights: function (fach, a, b) { S.weights[fach] = [a, b]; return { grades: S.grades, weights: S.weights }; },

    saveAbsence: function (a) { a = Object.assign({ id: 'a' + (seq++) }, a); S.absences.push(a); return S.absences; },
    setAbsenceExcused: function (id, v) { var i = find(S.absences, id); if (i >= 0) S.absences[i].entschuldigt = !!v; return S.absences; },
    deleteAbsence: function (id) { S.absences = S.absences.filter(function (a) { return a.id !== id; }); return S.absences; },
    lessonsOnDay: function (d) { return S.lessons.filter(function (l) { return l.datum === d; }).length; },

    createCalendarEvent: function (f) {
      S.events.push({ id: 'e' + (seq++), title: f.title, calendar: 'Privat', color: '#E2792F', allDay: !!f.allDay,
        datum: f.date, endDatum: f.date, start: f.allDay ? '' : f.start, ende: f.allDay ? '' : f.end,
        ort: f.location || '', notiz: f.notes || '', fromApp: true });
      return S;
    },
    deleteAppEvent: function (id) { S.events = S.events.filter(function (e) { return e.id !== id; }); return S; },

    createReportNow: function () { throw new Error('Das Berichtsheft braucht das echte Backend (Untis + Gemini).'); },
    setReportStatus: function () { return S.reports; },
    scanImage: function () { throw new Error('Tafelbild-Scan braucht das echte Backend (Gemini).'); },
    extractDates: function () { throw new Error('Termine aus Dateien braucht das echte Backend (Gemini).'); },
    createEventsFromList: function () { return Object.assign({ created: 0, skipped: 0 }, S); },
  };
})();
