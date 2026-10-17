/* Smart School Hub – Oberfläche. Server-Aufrufe laufen über RUN() aus api.js. */
var DATA = null;
var SHOW_READ = false;
var VIEW = 'home', SUBJECT = null, QUERY = '', TAG = '';
var REP = { busy: false, missing: null };
var WANT = {};
var WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
var MO = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function isoDay(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function at(datum, hhmm) { return new Date(datum + 'T' + hhmm + ':00'); }
function mins(a, b) { return Math.round((b - a) / 60000); }

function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
}

/* ---------- Daten aufbereiten ---------- */

function statusClass(s) {
  return s === 'Entfall' ? 'cancel' : s === 'Prüfung' ? 'exam' : (s === 'Änderung' || s === 'Sonderstunde') ? 'change' : '';
}

// Aufeinanderfolgende gleiche Stunden zu Blöcken (Doppelstunden) zusammenfassen
function toBlocks(lessons) {
  var out = [];
  lessons.slice().sort(function (a, b) { return (a.datum + a.start).localeCompare(b.datum + b.start); })
    .forEach(function (l) {
      var p = out[out.length - 1];
      var same = p && p.datum === l.datum && p.fach === l.fach && p.raum === l.raum && p.lehrer === l.lehrer && p.status === l.status;
      if (same && mins(at(p.datum, p.ende), at(l.datum, l.start)) <= 20) {
        p.ende = l.ende;
        p.info = p.info || l.info; p.hausaufgaben = p.hausaufgaben || l.hausaufgaben; p.pruefung = p.pruefung || l.pruefung;
      } else {
        out.push(Object.assign({}, l));
      }
    });
  return out;
}

function groupUpdates(updates) {
  var map = {}, list = [];
  updates.forEach(function (u) {
    var day = u.stunde.split(' ').slice(0, 2).join(' ');
    var key = [u.zeitpunkt, day, u.fach, u.art, u.meldung].join('|');
    if (!map[key]) { map[key] = { day: day, times: [], items: [], u: u, read: true }; list.push(map[key]); }
    map[key].times.push(u.stunde.split(' ')[2] || '');
    map[key].items.push(u);
    if (!u.gelesen) map[key].read = false;
  });
  return list;
}

function tname(s) {
  var m = (DATA && DATA.teachers) || {};
  return String(s || '').replace(/(^|[^A-Za-zÄÖÜäöüß])([A-ZÄÖÜ]{2,4})(?=$|[^A-Za-zÄÖÜäöüß])/g, function (x, pre, k) { return pre + (m[k] || k); });
}

function teacherText(l) {
  if (!l.lehrer) return '';
  var t = tname(l.lehrer);
  return t.indexOf('statt') >= 0 ? 'bei ' + t.replace(/\(statt /, 'statt ').replace(/\)$/, '') : 'bei ' + t;
}

/* ---------- Anzeigetafel ---------- */

function renderSign(blocks) {
  var now = new Date();
  var current = null, next = null;
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.status === 'Entfall') continue;
    var s = at(b.datum, b.start), e = at(b.datum, b.ende);
    if (s <= now && now < e) { current = b; break; }
    if (s > now) { next = b; break; }
  }
  var b = current || next;
  if (!b) {
    return '<section class="sign empty"><div class="sign-when"><span>Keine Stunden in den nächsten zwei Wochen</span></div>' +
           '<div class="room">Frei</div><div class="sign-teacher">Neue Stunden erscheinen hier automatisch, sobald sie in Untis stehen.</div></section>';
  }
  var s = at(b.datum, b.start), e = at(b.datum, b.ende);
  var when, count, pct = 0;
  if (current) {
    when = '<span>Jetzt im Unterricht</span><strong>bis ' + esc(b.ende) + '</strong>';
    count = 'noch ' + mins(now, e) + ' min';
    pct = Math.max(0, Math.min(100, (now - s) / (e - s) * 100));
  } else {
    var d = mins(now, s);
    var sameDay = isoDay(s) === isoDay(now);
    var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    var dayWord = sameDay ? 'Heute' : (isoDay(s) === isoDay(tomorrow) ? 'Morgen' : WD[s.getDay()] + ', ' + s.getDate() + '. ' + MO[s.getMonth()]);
    when = '<span>Als Nächstes</span><strong>' + dayWord + ', ' + esc(b.start) + ' Uhr</strong>';
    count = d < 90 ? 'in ' + d + ' min' : (sameDay ? 'in ' + Math.floor(d / 60) + ' h ' + (d % 60) + ' min' : '');
  }
  var room = (b.raum || '–').split(' (statt')[0];
  var flags = '';
  if (b.raum.indexOf('statt') >= 0) flags += '<div class="sign-flag">Raumwechsel: vorher ' + esc(b.raum.split('statt ')[1].replace(')', '')) + '</div> ';
  if (b.lehrer.indexOf('statt') >= 0) flags += '<div class="sign-flag">Vertretung: ' + esc(tname(b.lehrer).replace('(statt ', 'statt ').replace(')', '')) + '</div> ';
  if (b.status === 'Prüfung') flags += '<div class="sign-flag">Prüfung' + (b.pruefung ? ': ' + esc(b.pruefung) : '') + '</div>';

  return '<section class="sign" aria-live="polite" data-act="subject" data-fach="' + esc(b.fach) + '" role="button" tabindex="0" aria-label="Notizen zu ' + esc(b.fach) + '">' +
    '<div class="sign-when">' + when + '</div>' +
    '<div class="room"><small>Raum</small>' + esc(room) + '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">' +
      '<div><div class="sign-subject">' + esc(b.fach) + '</div><div class="sign-teacher">' + esc(teacherText(b)) + ', ' + esc(b.start) + '–' + esc(b.ende) + '</div></div>' +
      (count ? '<div class="countdown">' + count + '</div>' : '') +
    '</div>' + flags +
    (current ? '<div class="bar" aria-hidden="true"><span style="width:' + pct.toFixed(1) + '%"></span></div>' : '') +
  '</section>';
}

/* ---------- Tagesplan (Schule + Kalender) ---------- */

function eventsByDay(events) {
  var map = {};
  (events || []).forEach(function (ev, idx) {
    var d = at(ev.datum, '12:00'), end = at(ev.endDatum || ev.datum, '12:00'), guard = 0;
    while (d <= end && guard++ < 31) {
      var k = isoDay(d);
      (map[k] = map[k] || []).push({ ev: ev, idx: idx });
      d.setDate(d.getDate() + 1);
    }
  });
  return map;
}

function lessonRow(b, now) {
  var s = at(b.datum, b.start), e = at(b.datum, b.ende);
  var cls = statusClass(b.status);
  if (s <= now && now < e) cls += ' now';
  else if (e <= now) cls += ' past';
  var chips = '';
  if (b.status === 'Entfall') chips += '<span class="chip cancel">Entfällt</span>';
  if (b.lehrer.indexOf('statt') >= 0) chips += '<span class="chip change">Vertretung</span>';
  if (b.raum.indexOf('statt') >= 0) chips += '<span class="chip change">Raumwechsel</span>';
  if (b.status === 'Prüfung') chips += '<span class="chip exam">Prüfung' + (b.pruefung ? ': ' + esc(b.pruefung) : '') + '</span>';
  if (b.hausaufgaben) chips += '<span class="chip hw">Hausaufgabe</span>';
  var sub = [teacherText(b), tname(b.info)].filter(Boolean).map(esc).join('. ');
  return '<div class="lesson subj ' + cls + '" data-act="subject" data-fach="' + esc(b.fach) + '" role="button" tabindex="0" aria-label="Notizen zu ' + esc(b.fach) + '">' +
    '<div class="time">' + esc(b.start) + '<span>' + esc(b.ende) + '</span></div>' +
    '<div class="rail" aria-hidden="true"></div>' +
    '<div><div class="l-main"><span class="l-subject">' + esc(b.fach) + '</span><span class="l-room">' + esc(b.raum.split(' (statt')[0] || '–') + '</span></div>' +
    (sub ? '<div class="l-sub">' + sub + '</div>' : '') + chips + '</div></div>';
}

function eventRow(item, datum, now) {
  var ev = item.ev;
  var multi = ev.datum !== ev.endDatum;
  var startT = (multi && datum !== ev.datum) ? '00:00' : ev.start;
  var endT = (multi && datum !== ev.endDatum) ? '24:00' : ev.ende;
  var e = endT === '24:00' ? at(datum, '23:59') : at(datum, endT);
  var cls = e <= now ? ' past' : '';
  var sub = [ev.calendar, ev.ort].filter(Boolean).map(esc).join(', ');
  return '<div class="lesson event' + cls + '" data-act="ev" data-idx="' + item.idx + '" role="button" tabindex="0" style="--cal:' + esc(ev.color) + '">' +
    '<div class="time">' + esc(startT) + '<span>' + esc(endT) + '</span></div>' +
    '<div class="rail" aria-hidden="true"></div>' +
    '<div><div class="l-main"><span class="l-subject">' + esc(ev.title) + '</span></div>' +
    (sub ? '<div class="l-sub">' + sub + '</div>' : '') + '</div></div>';
}

function renderDays(blocks, events) {
  var now = new Date(), today = isoDay(now);
  var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  var evMap = eventsByDay(events);
  var byDay = {}, dates = {};
  blocks.forEach(function (b) {
    if (b.datum < today) return;
    (byDay[b.datum] = byDay[b.datum] || []).push(b);
    dates[b.datum] = true;
  });
  Object.keys(evMap).forEach(function (k) { if (k >= today) dates[k] = true; });
  var order = Object.keys(dates).sort();
  if (!order.length) {
    return '<div class="sec-head"><h2>Tagesplan</h2></div><div class="day"><div class="empty-note"><strong>Nichts geplant</strong>Termine aus deinem Google Kalender und Stunden aus Untis erscheinen hier.</div></div>';
  }

  var html = '', later = '', laterCount = 0;
  order.forEach(function (datum, idx) {
    var d = at(datum, '12:00');
    var title = datum === today ? 'Heute' : datum === isoDay(tomorrow) ? 'Morgen' : WD[d.getDay()];
    var lessons = byDay[datum] || [];
    var evs = evMap[datum] || [];
    var allDay = evs.filter(function (it) { return it.ev.allDay || (it.ev.datum !== it.ev.endDatum && it.ev.datum !== datum && it.ev.endDatum !== datum); });
    var timed = evs.filter(function (it) { return allDay.indexOf(it) < 0; });

    var rows = lessons.map(function (b) { return { t: b.start, html: lessonRow(b, now) }; })
      .concat(timed.map(function (it) { return { t: (it.ev.datum === datum ? it.ev.start : '00:00'), html: eventRow(it, datum, now) }; }))
      .sort(function (a, b) { return a.t.localeCompare(b.t); })
      .map(function (r) { return r.html; }).join('');

    var chips = allDay.length ? '<div class="allday">' + allDay.map(function (it) {
      return '<button class="ad-chip" data-act="ev" data-idx="' + it.idx + '" style="--cal:' + esc(it.ev.color) + '">' + esc(it.ev.title) + '</button>';
    }).join('') + '</div>' : '';

    var changes = lessons.filter(function (b) { return b.status !== 'Regulär'; }).length;
    var bits = [d.getDate() + '. ' + MO[d.getMonth()]];
    if (!lessons.length) bits.push('schulfrei');
    if (changes) bits.push(changes + (changes === 1 ? ' Änderung' : ' Änderungen'));
    if (evs.length) bits.push(evs.length + (evs.length === 1 ? ' Termin' : ' Termine'));
    var meta = bits.join(', ');
    var head = '<div class="day-title"><h3>' + title + '</h3><span>' + meta + '</span></div>';
    if (idx < 2) html += '<section class="day">' + head + chips + rows + '</section>';
    else { laterCount++; later += '<section class="day">' + head + chips + rows + '</section>'; }
  });
  if (laterCount) html += '<details class="later"><summary>' + laterCount + ' weitere Tage anzeigen</summary>' + later + '</details>';
  return '<div class="sec-head"><h2>Stundenplan</h2></div>' + html;
}

/* ---------- Termine: Details, Eintragen, Löschen ---------- */

function fmtDay(datum) { var d = at(datum, '12:00'); return WD[d.getDay()] + ', ' + d.getDate() + '. ' + MO[d.getMonth()]; }

function openInfo(idx) {
  var ev = DATA.events[idx];
  if (!ev) return;
  var when = ev.allDay
    ? (ev.datum === ev.endDatum ? fmtDay(ev.datum) + ', ganztägig' : fmtDay(ev.datum) + ' bis ' + fmtDay(ev.endDatum))
    : fmtDay(ev.datum) + ', ' + ev.start + ' bis ' + ev.ende + ' Uhr';
  var rows = '';
  if (ev.ort) rows += '<div class="info-row"><span>Ort</span>' + esc(ev.ort) + '</div>';
  if (ev.notiz) rows += '<div class="info-row"><span>Notiz</span>' + esc(ev.notiz).replace(/\n/g, '<br>') + '</div>';
  rows += '<div class="info-row"><span>Kalender</span>' + esc(ev.calendar) + '</div>';
  $('infoBody').innerHTML = '<h2 id="infoTitle">' + esc(ev.title) + '</h2><p class="info-when">' + esc(when) + '</p>' + rows;
  var del = $('delBtn');
  del.hidden = !ev.fromApp;
  del.disabled = false;
  del.onclick = function () {
    del.disabled = true;
    RUN()
      .withSuccessHandler(function (d) { $('infoDlg').close(); render(d); toast('Termin gelöscht'); })
      .withFailureHandler(function (err) { del.disabled = false; showError(err); })
      .deleteAppEvent(ev.id);
  };
  $('infoDlg').showModal();
}

function openForm() {
  var f = $('evForm');
  f.reset();
  f.date.value = isoDay(new Date());
  $('evErr').textContent = '';
  $('evTimes').hidden = false;
  $('evSave').disabled = false;
  $('evDlg').showModal();
  f.title.focus();
}

function submitForm(ev) {
  ev.preventDefault();
  var f = $('evForm');
  var data = {
    title: f.title.value.trim(), allDay: f.allDay.checked, date: f.date.value,
    start: f.start.value, end: f.end.value, location: f.location.value.trim(), notes: f.notes.value.trim()
  };
  var err = !data.title ? 'Bitte einen Titel eingeben.'
    : !data.date ? 'Bitte ein Datum wählen.'
    : (!data.allDay && (!data.start || !data.end)) ? 'Bitte Beginn und Ende angeben.'
    : (!data.allDay && data.end <= data.start) ? 'Das Ende muss nach dem Beginn liegen.' : '';
  if (err) { $('evErr').textContent = err; return; }
  $('evErr').textContent = '';
  $('evSave').disabled = true;
  RUN()
    .withSuccessHandler(function (d) { $('evDlg').close(); render(d); toast('Termin eingetragen'); })
    .withFailureHandler(function (e) { $('evSave').disabled = false; $('evErr').textContent = (e && e.message) || 'Eintragen fehlgeschlagen. Bitte erneut versuchen.'; })
    .createCalendarEvent(data);
}

/* ---------- Fächer & Notizen ---------- */

function subjectsList() {
  var set = {};
  (DATA.lessons || []).forEach(function (l) { if (l.fach && l.fach !== '?') set[l.fach] = true; });
  (DATA.notes || []).forEach(function (n) { if (n.fach && n.fach !== 'Allgemein') set[n.fach] = true; });
  return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'de'); });
}

function longName(f) {
  var m = DATA.subjects || {};
  if (f === 'Allgemein') return 'Alles ohne Fach';
  if (m[f]) return m[f];
  var parts = f.split('/').map(function (p) { return m[p]; }).filter(Boolean);
  return parts.join(' / ');
}

function notesOf(f) {
  return (DATA.notes || []).filter(function (n) { return n.fach === f; }).sort(sortNotes);
}

function sortNotes(a, b) { return (b.datum + b.geaendert).localeCompare(a.datum + a.geaendert); }

function nextLessonOf(f) {
  var now = new Date();
  var blocks = toBlocks(DATA.lessons || []);
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.fach === f && b.status !== 'Entfall' && at(b.datum, b.ende) > now) return b;
  }
  return null;
}

function shortDay(datum) {
  var d = at(datum, '12:00');
  return d.getDate() + '. ' + MO[d.getMonth()].slice(0, 3) + (MO[d.getMonth()].length > 4 ? '.' : '');
}

function codeHtml(f) { return esc(f).replace(/\//g, '/<wbr>'); }
function codeCls(f) { return f.length > 5 ? ' long' : ''; }

function tagsOf(n) { return (n.tags || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean); }

function noteCard(n, showFach) {
  var tags = tagsOf(n).map(function (t) { return '<span class="tag">#' + esc(t) + '</span>'; }).join('');
  return '<div class="note" data-act="note-edit" data-id="' + esc(n.id) + '" role="button" tabindex="0">' +
    '<div class="note-meta">' + (showFach ? '<strong>' + esc(n.fach) + '</strong>' : '') + '<span>' + esc(fmtDay(n.datum)) + '</span></div>' +
    (n.titel ? '<div class="note-title">' + esc(n.titel) + '</div>' : '') +
    (n.text ? '<div class="note-text">' + esc(n.text) + '</div>' : '') + tags +
    (n.bild ? '<a class="tag photo" href="' + esc(n.bild) + '" target="_blank" rel="noopener">Foto ansehen</a>' : '') + '</div>';
}

var ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
var ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function renderNotes() {
  return '<div class="sec-head"><h2>Notizen</h2><button type="button" class="add-btn" data-act="note-new" data-fach="Allgemein">' + ICON_PLUS + 'Notiz</button></div>' +
    '<div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input id="noteSearch" class="search" type="search" placeholder="Alle Notizen durchsuchen" aria-label="Alle Notizen durchsuchen" value="' + esc(QUERY) + '"></div>' +
    '<div id="noteResults">' + notesBody() + '</div>';
}

function notesBody() {
  var all = (DATA.notes || []).slice().sort(sortNotes);
  if (QUERY) {
    var q = QUERY.toLowerCase();
    var hits = all.filter(function (n) { return (n.titel + ' ' + n.text + ' ' + n.tags + ' ' + n.fach).toLowerCase().indexOf(q) >= 0; });
    if (!hits.length) return '<div class="day"><div class="empty-note"><strong>Keine Treffer</strong>Keine Notiz enthält „' + esc(QUERY) + '“.</div></div>';
    return '<div class="sec-head"><h2>' + hits.length + (hits.length === 1 ? ' Treffer' : ' Treffer') + '</h2></div><div class="notes cols">' + hits.map(function (n) { return noteCard(n, true); }).join('') + '</div>';
  }
  var subs = ['Allgemein'].concat(subjectsList());
  var tiles = subs.map(function (f) {
    var list = notesOf(f);
    var count = list.length ? list.length + (list.length === 1 ? ' Notiz' : ' Notizen') + ', zuletzt ' + shortDay(list[0].datum) : 'Noch keine Notizen';
    return '<button type="button" class="tile' + (f === 'Allgemein' ? ' general' : '') + '" data-act="subject" data-fach="' + esc(f) + '">' +
      '<span class="t-code' + codeCls(f) + '">' + codeHtml(f) + '</span>' + (longName(f) ? '<span class="t-name">' + esc(longName(f)) + '</span>' : '') +
      '<span class="t-count">' + count + '</span></button>';
  }).join('');
  var recent = all.slice(0, 6);
  return '<div class="tiles">' + tiles + '</div>' +
    (recent.length ? '<div class="sec-head"><h2>Zuletzt</h2></div><div class="notes cols">' + recent.map(function (n) { return noteCard(n, true); }).join('') + '</div>' : '');
}

function renderSubject(f) {
  var list = notesOf(f);
  var allTags = {};
  list.forEach(function (n) { tagsOf(n).forEach(function (t) { allTags[t] = true; }); });
  var tagNames = Object.keys(allTags).sort();
  if (TAG && !allTags[TAG]) TAG = '';
  var shown = TAG ? list.filter(function (n) { return tagsOf(n).indexOf(TAG) >= 0; }) : list;
  var next = f === 'Allgemein' ? null : nextLessonOf(f);
  var nextTxt = next ? 'Nächste Stunde: ' + fmtDay(next.datum) + ', ' + next.start + ' Uhr, Raum ' + next.raum.split(' (statt')[0] : '';

  var html = '<button type="button" class="back" data-act="view" data-view="notes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Alle Notizen</button>' +
    '<div class="hub-head"><div><div class="hub-code' + codeCls(f) + '">' + codeHtml(f) + '</div>' +
    (longName(f) ? '<div class="hub-name">' + esc(longName(f)) + '</div>' : '') +
    (nextTxt ? '<div class="hub-next">' + esc(nextTxt) + '</div>' : '') + '</div>' +
    '<div class="hub-actions"><button type="button" class="ghost-btn" data-act="scan" data-fach="' + esc(f) + '">' + ICON_CAM + 'Tafelbild</button>' +
    '<button type="button" class="add-btn" data-act="note-new" data-fach="' + esc(f) + '">' + ICON_PLUS + 'Notiz</button></div></div>';

  if (tagNames.length) {
    html += '<div class="tagbar"><button type="button" class="tag" data-act="tag" data-tag="" aria-pressed="' + (!TAG) + '">Alle</button>' +
      tagNames.map(function (t) { return '<button type="button" class="tag" data-act="tag" data-tag="' + esc(t) + '" aria-pressed="' + (TAG === t) + '">#' + esc(t) + '</button>'; }).join('') + '</div>';
  }
  if (!list.length) {
    html += '<div class="day"><div class="empty-note"><strong>Noch keine Notizen' + (f === 'Allgemein' ? '' : ' zu ' + esc(f)) + '</strong>Mit „Notiz“ legst du die erste an. Sie erscheint dann hier und in der Suche.</div></div>';
  } else {
    html += '<div class="notes cols">' + shown.map(function (n) { return noteCard(n, false); }).join('') + '</div>';
  }
  return html;
}

/* ---------- Notiz-Editor ---------- */

var NOTE_DEL_ARMED = false;

function openNote(opts) {
  var f = $('noteForm');
  f.reset();
  var note = opts.id ? (DATA.notes || []).filter(function (n) { return n.id === opts.id; })[0] : null;
  var fach = note ? note.fach : (opts.fach || 'Allgemein');
  var subs = ['Allgemein'].concat(subjectsList());
  if (subs.indexOf(fach) < 0) subs.push(fach);
  $('noteFach').innerHTML = subs.map(function (s) { return '<option value="' + esc(s) + '"' + (s === fach ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  f.datum.value = note ? note.datum : (opts.datum && opts.datum >= isoDay(new Date()) ? isoDay(new Date()) : (opts.datum || isoDay(new Date())));
  f.titel.value = note ? note.titel : '';
  f.text.value = note ? note.text : '';
  f.tags.value = note ? tagsOf(note).join(', ') : '';
  f.setAttribute('data-id', note ? note.id : '');
  f.setAttribute('data-bild', note && note.bild ? note.bild : '');
  setScanStatus(note && note.bild ? 'Foto gespeichert. <a href="' + esc(note.bild) + '" target="_blank" rel="noopener">Ansehen</a>' : '', '');
  $('scanBtn').disabled = false;
  $('noteDlgTitle').textContent = note ? 'Notiz bearbeiten' : 'Neue Notiz';
  $('noteErr').textContent = '';
  $('noteSave').disabled = false;
  var del = $('noteDel');
  del.hidden = !note; del.disabled = false; del.textContent = 'Löschen'; NOTE_DEL_ARMED = false;
  $('noteDlg').showModal();
  if (opts.scan) $('scanInput').click();
  else f.text.focus();
}

/* ---------- Tafelbild-Scanner ---------- */

function setScanStatus(html, cls) {
  var el = $('scanStatus');
  el.innerHTML = html;
  el.className = 'scan-status' + (cls ? ' ' + cls : '');
}

function shrinkImage(file, done) {
  var url = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    var max = 1800, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    done(c.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = function () { URL.revokeObjectURL(url); done(null); };
  img.src = url;
}

function scanChosen() {
  var input = $('scanInput');
  var file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  var f = $('noteForm');
  setScanStatus('Foto wird gelesen …', 'busy');
  $('scanBtn').disabled = true; $('noteSave').disabled = true;
  shrinkImage(file, function (dataUrl) {
    if (!dataUrl) { setScanStatus('Dieses Bild lässt sich nicht öffnen. Bitte ein JPG oder PNG wählen.', 'err'); $('scanBtn').disabled = false; $('noteSave').disabled = false; return; }
    RUN()
      .withSuccessHandler(function (r) {
        if (!f.titel.value.trim() && r.titel) f.titel.value = r.titel;
        if (r.text) f.text.value = f.text.value.trim() ? f.text.value.replace(/\s*$/, '') + '\n\n' + r.text : r.text;
        f.setAttribute('data-bild', r.bild || '');
        setScanStatus('Text erkannt, Foto gespeichert. <a href="' + esc(r.bild) + '" target="_blank" rel="noopener">Ansehen</a>', '');
        $('scanBtn').disabled = false; $('noteSave').disabled = false;
      })
      .withFailureHandler(function (e) {
        setScanStatus(esc((e && e.message) || 'Scannen fehlgeschlagen. Bitte erneut versuchen.'), 'err');
        $('scanBtn').disabled = false; $('noteSave').disabled = false;
      })
      .scanImage({ data: dataUrl.split(',')[1], mime: 'image/jpeg', fach: f.fach.value, datum: f.datum.value });
  });
}

function submitNote(ev) {
  ev.preventDefault();
  var f = $('noteForm');
  var data = { id: f.getAttribute('data-id') || '', fach: f.fach.value, datum: f.datum.value, titel: f.titel.value.trim(), text: f.text.value, tags: f.tags.value, bild: f.getAttribute('data-bild') || '' };
  if (!data.titel && !data.text.trim()) { $('noteErr').textContent = 'Die Notiz ist leer. Bitte Titel oder Text eingeben.'; return; }
  $('noteErr').textContent = '';
  $('noteSave').disabled = true;
  RUN()
    .withSuccessHandler(function (notes) { DATA.notes = notes; $('noteDlg').close(); render(DATA); toast(data.id ? 'Notiz gespeichert' : 'Notiz angelegt'); })
    .withFailureHandler(function (e) { $('noteSave').disabled = false; $('noteErr').textContent = (e && e.message) || 'Speichern fehlgeschlagen. Bitte erneut versuchen.'; })
    .saveNote(data);
}

function deleteNoteClick() {
  var del = $('noteDel');
  if (!NOTE_DEL_ARMED) { NOTE_DEL_ARMED = true; del.textContent = 'Wirklich löschen?'; return; }
  del.disabled = true;
  RUN()
    .withSuccessHandler(function (notes) { DATA.notes = notes; $('noteDlg').close(); render(DATA); toast('Notiz gelöscht'); })
    .withFailureHandler(function (e) { del.disabled = false; $('noteErr').textContent = (e && e.message) || 'Löschen fehlgeschlagen.'; })
    .deleteNote($('noteForm').getAttribute('data-id'));
}

/* ---------- Überschneidungen privat / Schule ---------- */

function conflicts(blocks, events) {
  var now = new Date(), byEv = {}, list = [];
  (events || []).forEach(function (ev, idx) {
    if (ev.allDay || ev.datum !== ev.endDatum || ev.calendar !== 'Privat') return;
    var es = at(ev.datum, ev.start), ee = at(ev.datum, ev.ende);
    if (ee <= now) return;
    blocks.forEach(function (b) {
      if (b.datum !== ev.datum || b.status === 'Entfall') return;
      if (es < at(b.datum, b.ende) && at(b.datum, b.start) < ee) {
        if (!byEv[idx]) { byEv[idx] = { ev: ev, idx: idx, faecher: [] }; list.push(byEv[idx]); }
        if (byEv[idx].faecher.indexOf(b.fach) < 0) byEv[idx].faecher.push(b.fach);
      }
    });
  });
  return list;
}

function conflictItems(blocks, events) {
  return conflicts(blocks, events).map(function (c) {
    return '<div class="item conflict" data-act="ev" data-idx="' + c.idx + '" role="button" tabindex="0">' +
      '<div><div class="it-head">Überschneidung <em>mit ' + esc(c.faecher.join(' und ')) + '</em></div>' +
      '<div class="it-when">' + esc(fmtDay(c.ev.datum)) + ', ' + esc(c.ev.start) + '–' + esc(c.ev.ende) + ' Uhr</div>' +
      '<div class="it-text"><div>' + esc(c.ev.title) + '</div></div></div></div>';
  }).join('');
}

/* ---------- Berichtsheft ---------- */

function renderReports() {
  var reps = DATA.reports || [];
  var html = '<div class="sec-head"><h2>Berichtsheft</h2><button type="button" class="add-btn" data-act="report-create"' + (REP.busy ? ' disabled' : '') + '>' +
    (REP.busy ? 'Wird erstellt …' : ICON_PLUS + 'Diese Woche erstellen') + '</button></div>' +
    '<p class="rep-intro">Nach deinem letzten Schultag der Woche entsteht um 17 Uhr automatisch ein Entwurf aus deinen Notizen, wenn genug da ist. Gemini formuliert dabei nur, was in deinen Notizen steht.</p>';
  if (REP.missing) {
    html += '<div class="rep-missing"><strong>Noch zu wenig Notizen.</strong> Es fehlen: ' + esc(REP.missing.join('; ')) + '. ' +
      'Ergänze Notizen in diesen Fächern oder erstelle den Entwurf trotzdem. Lücken werden dann mit „[Inhalte ergänzen]“ markiert.' +
      '<div class="rep-actions"><button type="button" class="btn primary" data-act="report-force">Trotzdem erstellen</button></div></div>';
  }
  if (!reps.length) {
    return html + '<div class="day"><div class="empty-note"><strong>Noch kein Bericht</strong>Sobald eine Schulwoche mit Notizen vorbei ist, erscheint der Entwurf hier und als Google Doc im Ordner Berichtshefte.</div></div>';
  }
  return html + reps.map(function (r) {
    var done = r.status === 'Übertragen';
    var range = r.von.slice(8, 10) + '.' + r.von.slice(5, 7) + '.' + (r.bis !== r.von ? '–' + r.bis.slice(8, 10) + '.' + r.bis.slice(5, 7) + '.' : '') + r.bis.slice(0, 4);
    return '<article class="rep"><div class="rep-head"><div><h3>KW ' + esc(String(Number(r.key.split('-')[1]))) + '</h3><span class="range">' + esc(range) + '</span></div>' +
      '<span class="chip ' + (done ? 'done' : 'draft') + '">' + (done ? 'Übertragen' : 'Entwurf') + '</span></div>' +
      '<div class="rep-text">' + esc(r.text) + '</div>' +
      '<div class="rep-actions"><button type="button" class="btn primary" data-act="report-copy" data-key="' + esc(r.key) + '">Text kopieren</button>' +
      (r.doc ? '<a class="btn ghost" href="' + esc(r.doc) + '" target="_blank" rel="noopener">Google Doc öffnen</a>' : '') +
      '<button type="button" class="btn ghost" data-act="report-status" data-key="' + esc(r.key) + '" data-status="' + (done ? 'Entwurf' : 'Übertragen') + '">' +
      (done ? 'Zurück auf Entwurf' : 'Als übertragen markieren') + '</button></div></article>';
  }).join('');
}

function createReport(force) {
  REP.busy = true; REP.missing = null; render(DATA);
  RUN()
    .withSuccessHandler(function (r) {
      REP.busy = false; DATA.reports = r.reports;
      if (r.ok) toast('Entwurf für KW ' + r.kw + ' erstellt'); else REP.missing = r.missing;
      render(DATA);
    })
    .withFailureHandler(function (e) { REP.busy = false; render(DATA); toast((e && e.message) || 'Erstellen fehlgeschlagen. Bitte erneut versuchen.'); })
    .createReportNow(!!force, '');
}

function copyText(t) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    toast(ok ? 'Text kopiert' : 'Kopieren nicht möglich. Bitte den Text markieren und kopieren.');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Text kopiert'); }, fallback);
  else fallback();
}

/* ---------- Leistung: Noten ---------- */

function fmtNote(n) {
  if (n == null || isNaN(n)) return '–';
  var r = Math.round(n * 100) / 100;
  return (Math.abs(r * 10 - Math.round(r * 10)) < 1e-9 ? r.toFixed(1) : r.toFixed(2)).replace('.', ',');
}
function fmt1(n) { return n == null || isNaN(n) ? '–' : n.toFixed(1).replace('.', ','); }
function gradeCls(n) { return n == null ? '' : n <= 2.5 ? ' good' : n > 3.5 ? ' warn' : ''; }

function parseNote(v) {
  v = String(v || '').trim().replace(',', '.');
  var m = v.match(/^([1-6])\s*([+-])$/);
  if (m) return Number(m[1]) + (m[2] === '+' ? -0.3 : 0.3);
  m = v.match(/^([1-6])\s*-\s*([1-6])$/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  var n = Number(v);
  return n >= 1 && n <= 6 ? n : NaN;
}

function wavg(list) {
  var s = 0, w = 0;
  list.forEach(function (g) { s += g.note * g.gewicht; w += g.gewicht; });
  return w ? s / w : null;
}

function weightsOf(f) { var w = (DATA.weights || {})[f]; return w ? w : { s: 50, m: 50 }; }

function subjectAvg(list, f) {
  var w = weightsOf(f);
  var as = wavg(list.filter(function (g) { return g.art === 'Schriftlich'; }));
  var am = wavg(list.filter(function (g) { return g.art !== 'Schriftlich'; }));
  if (as != null && am != null && w.s + w.m > 0) return (as * w.s + am * w.m) / (w.s + w.m);
  return as != null ? as : am;
}

function neededText(f, target) {
  var list = (DATA.grades || []).filter(function (g) { return g.fach === f; });
  function withX(x) { return subjectAvg(list.concat([{ note: x, gewicht: 1, art: 'Schriftlich' }]), f); }
  var t1 = withX(1), t6 = withX(6);
  if (t6 <= target + 1e-9) return 'Selbst mit einer 6,0 in der nächsten Klassenarbeit bleibst du bei ' + fmt1(target) + ' oder besser.';
  if (t1 > target + 1e-9) return 'Mit einer einzelnen Klassenarbeit ist eine ' + fmt1(target) + ' nicht mehr erreichbar. Mündliche Noten können noch helfen.';
  var x = 1 + (target - t1) * 5 / (t6 - t1);
  x = Math.floor(x * 10 + 1e-9) / 10;
  return 'Für eine ' + fmt1(target) + ' brauchst du in der nächsten Klassenarbeit mindestens eine ' + fmt1(x) + '.';
}

function renderPerf() {
  var grades = DATA.grades || [];
  var subs = subjectsList();
  grades.forEach(function (g) { if (subs.indexOf(g.fach) < 0) subs.push(g.fach); });
  var withGrades = subs.filter(function (f) { return grades.some(function (g) { return g.fach === f; }); });
  var without = subs.filter(function (f) { return withGrades.indexOf(f) < 0; });
  var avgs = withGrades.map(function (f) { return subjectAvg(grades.filter(function (g) { return g.fach === f; }), f); });
  var total = avgs.length ? avgs.reduce(function (a, b) { return a + b; }, 0) / avgs.length : null;

  var html = '<div class="sec-head"><h2>Noten</h2><button type="button" class="add-btn" data-act="grade-new">' + ICON_PLUS + 'Note</button></div>';
  if (!grades.length) {
    html += '<div class="day"><div class="empty-note"><strong>Noch keine Noten</strong>Trag deine erste Note ein. Der Schnitt pro Fach und der Wunschnoten-Rechner erscheinen dann hier.</div></div>';
  } else {
    html += '<div class="perf-top"><div class="perf-avg"><small>Schnitt aller Fächer</small>' + fmt1(total) + '</div>' +
      '<div class="perf-meta">' + grades.length + (grades.length === 1 ? ' Note' : ' Noten') + ' in ' + withGrades.length + (withGrades.length === 1 ? ' Fach' : ' Fächern') + '</div></div>';
    html += withGrades.map(function (f, i) {
      var list = grades.filter(function (g) { return g.fach === f; }).sort(function (a, b) { return b.datum.localeCompare(a.datum); });
      var a = avgs[i], w = weightsOf(f);
      var S = list.filter(function (g) { return g.art === 'Schriftlich'; }), M = list.filter(function (g) { return g.art !== 'Schriftlich'; });
      var want = WANT[f] || '2.0';
      var rows = list.map(function (g) {
        return '<div class="grow" data-act="grade-edit" data-id="' + esc(g.id) + '" role="button" tabindex="0"><div><div class="g-title">' + esc(g.bez || g.art) + '</div>' +
          '<div class="g-meta">' + esc(fmtDay(g.datum)) + ', ' + esc(g.art) + (g.gewicht !== 1 ? ', Gewicht ' + String(g.gewicht).replace('.', ',') : '') + '</div></div>' +
          '<div class="g-note">' + fmtNote(g.note) + '</div></div>';
      }).join('');
      return '<details class="subj"' + (WANT[f] ? ' open' : '') + '><summary><div><div class="subj-code">' + codeHtml(f) + '</div>' +
        (longName(f) ? '<div class="subj-name">' + esc(longName(f)) + '</div>' : '') + '</div>' +
        '<div class="grade' + gradeCls(a) + '">' + fmt1(a) + '</div></summary>' +
        '<div class="subj-body">' +
          '<div class="subj-line">Schriftlich ' + fmt1(wavg(S)) + ' aus ' + S.length + (S.length === 1 ? ' Note' : ' Noten') + ', mündlich ' + fmt1(wavg(M)) + ' aus ' + M.length + (M.length === 1 ? ' Note' : ' Noten') + '.</div>' +
          '<div class="inline-form">Gewichtung schriftlich <input type="number" min="0" max="100" step="5" value="' + w.s + '" data-weight="' + esc(f) + '" aria-label="Gewichtung schriftlich in Prozent"> %, mündlich ' + w.m + ' %</div>' +
          '<div class="inline-form">Wunschnote <select data-want="' + esc(f) + '" aria-label="Wunschnote">' +
            ['1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0'].map(function (v) { return '<option value="' + v + '"' + (v === want ? ' selected' : '') + '>' + v.replace('.', ',') + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="want-result">' + esc(neededText(f, Number(want))) + '</div>' +
          '<div class="glist">' + rows + '</div>' +
        '</div></details>';
    }).join('');
  }
  if (without.length) html += '<p class="muted-line">Noch ohne Noten: ' + esc(without.join(', ')) + '</p>';
  return html + renderAbsences();
}

/* ---------- Leistung: Fehlzeiten ---------- */

var GRUND_TEXT = { 'Krankheit': 'Krankheit', 'Arzttermin': 'eines Arzttermins', 'Betrieblich': 'betrieblicher Gründe', 'Sonstiges': '[Grund ergänzen]' };

function excuseText(a) {
  return 'Sehr geehrte Damen und Herren,\n\nhiermit entschuldige ich mein Fehlen am ' + fmtDay(a.datum) + ' ' + a.datum.slice(0, 4) +
    ' (' + a.stunden + (a.stunden === 1 ? ' Unterrichtsstunde' : ' Unterrichtsstunden') + ') aufgrund ' + (a.grund === 'Krankheit' ? 'von ' : '') + GRUND_TEXT[a.grund] + '.\n\n' +
    'Mit freundlichen Grüßen\nJustus Böttcher';
}

function renderAbsences() {
  var list = DATA.absences || [];
  var days = {}, hours = 0, open = 0;
  list.forEach(function (a) { days[a.datum] = true; hours += a.stunden; if (!a.entschuldigt) open++; });
  var nDays = Object.keys(days).length;
  var html = '<div class="sec-head" style="margin-top:28px"><h2>Fehlzeiten</h2><button type="button" class="ghost-btn" data-act="abs-new">' + ICON_PLUS + 'Fehlzeit</button></div>';
  if (!list.length) return html + '<div class="day"><div class="empty-note"><strong>Keine Fehlzeiten</strong>Fehlst du mal, trag es hier ein. Die App erinnert dich an offene Entschuldigungen und schreibt dir die Entschuldigung vor.</div></div>';
  html += '<p class="muted-line" style="margin-top:0">' + nDays + (nDays === 1 ? ' Tag, ' : ' Tage, ') + hours + (hours === 1 ? ' Stunde' : ' Stunden') +
    (open ? '. <strong style="color:var(--stop)">' + open + (open === 1 ? ' Entschuldigung offen' : ' Entschuldigungen offen') + '</strong>' : '. Alles entschuldigt') + '.</p>';
  return html + list.map(function (a) {
    return '<div class="abs" data-act="abs-edit" data-id="' + esc(a.id) + '" role="button" tabindex="0"><div>' +
      '<div class="a-title">' + esc(fmtDay(a.datum)) + '</div>' +
      '<div class="a-meta">' + a.stunden + (a.stunden === 1 ? ' Stunde' : ' Stunden') + ', ' + esc(a.grund) + (a.notiz ? '. ' + esc(a.notiz) : '') + '</div>' +
      (a.entschuldigt ? '' : '<div class="rep-actions"><button type="button" class="btn ghost" data-act="abs-copy" data-id="' + esc(a.id) + '">Entschuldigung kopieren</button>' +
        '<button type="button" class="btn ghost" data-act="abs-done" data-id="' + esc(a.id) + '">Als abgegeben markieren</button></div>') +
      '</div><span class="chip ' + (a.entschuldigt ? 'done' : 'cancel') + '">' + (a.entschuldigt ? 'Entschuldigt' : 'Offen') + '</span></div>';
  }).join('');
}

/* ---------- Dialoge: Note & Fehlzeit ---------- */

var DEL_ARMED = {};

function armDelete(btn, key, run) {
  if (!DEL_ARMED[key]) { DEL_ARMED[key] = true; btn.textContent = 'Wirklich löschen?'; return; }
  btn.disabled = true; run();
}

function openGrade(id) {
  var f = $('gradeForm'); f.reset();
  var g = id ? (DATA.grades || []).filter(function (x) { return x.id === id; })[0] : null;
  var subs = subjectsList();
  if (g && subs.indexOf(g.fach) < 0) subs.push(g.fach);
  $('gradeFach').innerHTML = subs.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
  if (g) { f.fach.value = g.fach; f.art.value = g.art; f.bez.value = g.bez; f.note.value = fmtNote(g.note); f.gewicht.value = String(g.gewicht); f.datum.value = g.datum; }
  else f.datum.value = isoDay(new Date());
  f.setAttribute('data-id', g ? g.id : '');
  $('gradeTitle').textContent = g ? 'Note bearbeiten' : 'Neue Note';
  $('gradeErr').textContent = ''; $('gradeSave').disabled = false;
  var del = $('gradeDel'); del.hidden = !g; del.disabled = false; del.textContent = 'Löschen'; DEL_ARMED.grade = false;
  $('gradeDlg').showModal();
}

function submitGrade(ev) {
  ev.preventDefault();
  var f = $('gradeForm');
  var note = parseNote(f.note.value);
  if (isNaN(note)) { $('gradeErr').textContent = 'Bitte eine Note zwischen 1,0 und 6,0 eingeben, z. B. 2,3 oder 2-.'; return; }
  $('gradeSave').disabled = true;
  RUN()
    .withSuccessHandler(function (r) { DATA.grades = r.grades; DATA.weights = r.weights; $('gradeDlg').close(); render(DATA); toast('Note gespeichert'); })
    .withFailureHandler(function (e) { $('gradeSave').disabled = false; $('gradeErr').textContent = (e && e.message) || 'Speichern fehlgeschlagen.'; })
    .saveGrade({ id: f.getAttribute('data-id'), fach: f.fach.value, art: f.art.value, bez: f.bez.value, note: note, gewicht: f.gewicht.value, datum: f.datum.value });
}

function openAbsence(id) {
  var f = $('absForm'); f.reset();
  var a = id ? (DATA.absences || []).filter(function (x) { return x.id === id; })[0] : null;
  if (a) { f.datum.value = a.datum; f.stunden.value = a.stunden; f.grund.value = a.grund; f.entschuldigt.checked = a.entschuldigt; f.notiz.value = a.notiz; }
  else { f.datum.value = isoDay(new Date()); prefillHours(); }
  f.setAttribute('data-id', a ? a.id : '');
  $('absTitle').textContent = a ? 'Fehlzeit bearbeiten' : 'Fehlzeit eintragen';
  $('absErr').textContent = ''; $('absSave').disabled = false;
  var del = $('absDel'); del.hidden = !a; del.disabled = false; del.textContent = 'Löschen'; DEL_ARMED.abs = false;
  $('absDlg').showModal();
}

function prefillHours() {
  var d = $('absDate').value;
  var known = (DATA.lessons || []).filter(function (l) { return l.datum === d && l.status !== 'Entfall'; }).length;
  if (known) { $('absHours').value = known; return; }
  $('absHours').value = '';
  RUN().withSuccessHandler(function (n) { if (n && !$('absHours').value) $('absHours').value = n; }).lessonsOnDay(d);
}

function submitAbsence(ev) {
  ev.preventDefault();
  var f = $('absForm');
  var h = Number(f.stunden.value);
  if (!f.datum.value) { $('absErr').textContent = 'Bitte ein Datum wählen.'; return; }
  if (!(h >= 1 && h <= 12)) { $('absErr').textContent = 'Bitte die Anzahl der verpassten Stunden angeben (1 bis 12).'; return; }
  $('absSave').disabled = true;
  RUN()
    .withSuccessHandler(function (list) { DATA.absences = list; $('absDlg').close(); render(DATA); toast('Fehlzeit gespeichert'); })
    .withFailureHandler(function (e) { $('absSave').disabled = false; $('absErr').textContent = (e && e.message) || 'Speichern fehlgeschlagen.'; })
    .saveAbsence({ id: f.getAttribute('data-id'), datum: f.datum.value, stunden: h, grund: f.grund.value, entschuldigt: f.entschuldigt.checked, notiz: f.notiz.value });
}

/* ---------- Termine aus Dateien ---------- */

var FOUND = { list: [], datei: '' };

function readFileData(file, done) {
  if (/^image\//.test(file.type)) { shrinkImage(file, function (u) { done(u ? { data: u.split(',')[1], mime: 'image/jpeg' } : null); }); return; }
  if (file.type !== 'application/pdf') { done(null); return; }
  if (file.size > 10 * 1024 * 1024) { done({ error: 'Die PDF ist größer als 10 MB. Bitte eine kleinere Datei wählen.' }); return; }
  var r = new FileReader();
  r.onload = function () { done({ data: String(r.result).split(',')[1], mime: 'application/pdf' }); };
  r.onerror = function () { done(null); };
  r.readAsDataURL(file);
}

function fileChosen() {
  var input = $('fileInput'), file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  $('evDlg').close();
  FOUND = { list: [], datei: '' };
  $('foundList').innerHTML = '';
  $('foundSave').disabled = true;
  var st = $('foundStatus'); st.className = 'scan-status busy'; st.textContent = '„' + file.name + '“ wird gelesen …';
  $('foundDlg').showModal();
  readFileData(file, function (d) {
    if (!d || d.error) { st.className = 'scan-status err'; st.textContent = (d && d.error) || 'Diese Datei lässt sich nicht lesen. Bitte eine PDF oder ein Foto wählen.'; return; }
    RUN()
      .withSuccessHandler(function (r) {
        FOUND = { list: r.termine || [], datei: r.datei };
        if (!FOUND.list.length) { st.className = 'scan-status'; st.textContent = 'In diesem Dokument wurden keine Termine gefunden.'; return; }
        st.className = 'scan-status';
        st.textContent = FOUND.list.length + (FOUND.list.length === 1 ? ' Termin gefunden.' : ' Termine gefunden.') + ' Wähle aus, was in deinen Kalender soll.';
        $('foundList').innerHTML = FOUND.list.map(function (t, i) {
          var when = fmtDay(t.datum) + (t.start ? ', ' + t.start + (t.ende ? '–' + t.ende : '') + ' Uhr' : ', ganztägig');
          return '<label><input type="checkbox" data-found="' + i + '" checked><span>' + esc(t.titel) +
            '<small>' + esc(t.typ) + (t.fach ? ' in ' + esc(t.fach) : '') + ', ' + esc(when) + '</small>' +
            (t.beleg ? '<small>„' + esc(t.beleg) + '“</small>' : '') + '</span></label>';
        }).join('');
        $('foundSave').disabled = false;
      })
      .withFailureHandler(function (e) { st.className = 'scan-status err'; st.textContent = (e && e.message) || 'Erkennen fehlgeschlagen. Bitte erneut versuchen.'; })
      .extractDates({ data: d.data, mime: d.mime, name: file.name });
  });
}

function saveFound() {
  var picked = Array.prototype.filter.call(document.querySelectorAll('[data-found]'), function (c) { return c.checked; })
    .map(function (c) { return FOUND.list[Number(c.getAttribute('data-found'))]; });
  if (!picked.length) { $('foundStatus').textContent = 'Bitte mindestens einen Termin auswählen.'; return; }
  $('foundSave').disabled = true;
  var st = $('foundStatus'); st.className = 'scan-status busy'; st.textContent = 'Wird eingetragen …';
  RUN()
    .withSuccessHandler(function (r) {
      $('foundDlg').close(); render(r);
      toast(r.created + (r.created === 1 ? ' Termin eingetragen' : ' Termine eingetragen') + (r.skipped ? ', ' + r.skipped + ' schon vorhanden' : ''));
    })
    .withFailureHandler(function (e) { $('foundSave').disabled = false; st.className = 'scan-status err'; st.textContent = (e && e.message) || 'Eintragen fehlgeschlagen.'; })
    .createEventsFromList(picked, FOUND.datei);
}

/* ---------- Meldungen ---------- */

function renderFeed(updates, extra) {
  var groups = groupUpdates(updates);
  var unread = groups.filter(function (g) { return !g.read; });
  var read = groups.filter(function (g) { return g.read; }).slice(0, 20);
  var shown = SHOW_READ ? unread.concat(read) : unread;

  extra = extra || '';
  var head = '<div class="sec-head"><h2>Meldungen</h2>' +
    (unread.length ? '<button class="link-btn" data-act="all-read">Alle als gelesen markieren</button>' : '<span class="meta">Alles gelesen</span>') + '</div>';

  var body;
  if (!shown.length && extra) {
    body = '<div class="feed">' + extra + '</div>';
  } else if (!shown.length) {
    body = '<div class="feed"><div class="empty-note"><strong>Keine neuen Meldungen</strong>Raumwechsel, Vertretungen, Entfall, Prüfungen sowie Aufgaben und Infos aus Teams erscheinen hier.</div></div>';
  } else {
    body = '<div class="feed">' + extra + shown.map(function (g) {
      var u = g.u;
      var cls = u.art === 'Entfall' || u.art === 'Entfernt' ? 'cancel' : (u.art === 'Prüfung' || u.art === 'Berichtsheft' || u.art === 'Aufgabe' || u.art === 'Termin') ? 'exam' : (u.art === 'Änderung' || u.art === 'Sonderstunde') ? 'change' : '';
      var parts = u.meldung.split(' · ').filter(function (p) { return p && p !== u.art; });
      var times = g.times.filter(Boolean).join(' und ');
      return '<div class="item ' + cls + (g.read ? ' read' : '') + '">' +
        '<div><div class="it-head">' + esc(u.art) + ' <em>in ' + esc(u.fach) + '</em></div>' +
        '<div class="it-when">' + esc(g.day) + (times ? ', ' + esc(times) + ' Uhr' : '') + '</div>' +
        (parts.length ? '<div class="it-text">' + parts.map(function (p) { return '<div>' + esc(tname(p)) + '</div>'; }).join('') + '</div>' : '') +
        '</div>' +
        (g.read ? '' : '<button class="check" data-act="read" data-key="' + groups.indexOf(g) + '" aria-label="Als gelesen markieren" title="Gelesen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>') +
      '</div>';
    }).join('') + '</div>';
  }
  var toggle = read.length ? '<div style="text-align:center;margin-top:8px"><button class="link-btn" data-act="toggle-read">' + (SHOW_READ ? 'Gelesene ausblenden' : 'Gelesene anzeigen') + '</button></div>' : '';
  renderFeed.groups = groups;
  return head + body + toggle;
}

/* ---------- Aufgaben ---------- */

var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var SRC = { Untis: 'aus Untis', Mail: 'aus Mail', Datei: 'aus Datei', Eigene: '' };
var TGROUPS = ['Überfällig', 'Heute', 'Morgen', 'Diese Woche', 'Später', 'Ohne Datum'];

function daysUntil(datum) { return Math.round((at(datum, '12:00') - at(isoDay(new Date()), '12:00')) / 86400000); }
function openTasks() { return (DATA.tasks || []).filter(function (t) { return !t.erledigt; }).sort(sortTasks); }
function sortTasks(a, b) {
  return ((a.faellig || '9999') + (a.zeit || '99')).localeCompare((b.faellig || '9999') + (b.zeit || '99')) || String(a.erstellt).localeCompare(String(b.erstellt));
}

function dueInfo(t) {
  if (!t.faellig) return { text: 'ohne Datum', cls: '' };
  var d = daysUntil(t.faellig), z = t.zeit ? ', ' + t.zeit + ' Uhr' : '';
  if (d < -1) return { text: 'seit ' + (-d) + ' Tagen überfällig', cls: 'late' };
  if (d === -1) return { text: 'seit gestern überfällig', cls: 'late' };
  if (d === 0) return { text: 'heute fällig' + z, cls: 'soon' };
  if (d === 1) return { text: 'morgen fällig' + z, cls: 'soon' };
  if (d < 7) return { text: 'fällig am ' + WD[at(t.faellig, '12:00').getDay()] + z, cls: '' };
  return { text: 'fällig am ' + fmtDay(t.faellig) + z, cls: '' };
}

function groupOf(t) {
  if (!t.faellig) return 'Ohne Datum';
  var d = daysUntil(t.faellig);
  return d < 0 ? 'Überfällig' : d === 0 ? 'Heute' : d === 1 ? 'Morgen' : d < 7 ? 'Diese Woche' : 'Später';
}

function taskRow(t) {
  var due = dueInfo(t), meta = [];
  if (t.fach) meta.push('<span class="tk-fach">' + esc(t.fach) + '</span>');
  meta.push(t.erledigt ? '<span>erledigt</span>' : '<span class="' + due.cls + '">' + esc(due.text) + '</span>');
  if (SRC[t.quelle]) meta.push('<span>' + (t.link ? '<a href="' + esc(t.link) + '" target="_blank" rel="noopener">' + esc(SRC[t.quelle]) + '</a>' : esc(SRC[t.quelle])) + '</span>');
  return '<div class="task' + (t.erledigt ? ' done' : '') + '">' +
    '<button type="button" class="check' + (t.erledigt ? ' on' : '') + '" data-act="task-toggle" data-id="' + esc(t.id) + '" aria-pressed="' + t.erledigt + '" aria-label="' + (t.erledigt ? 'Wieder öffnen: ' : 'Erledigt: ') + esc(t.titel) + '">' + ICON_CHECK + '</button>' +
    '<div class="tk-body" data-act="task-edit" data-id="' + esc(t.id) + '" role="button" tabindex="0">' +
    '<div class="tk-title">' + esc(t.titel) + '</div><div class="tk-meta">' + meta.join('') + '</div></div></div>';
}

function renderTasks() {
  var open = openTasks();
  var done = (DATA.tasks || []).filter(function (t) { return t.erledigt; })
    .sort(function (a, b) { return String(b.erledigtAm).localeCompare(String(a.erledigtAm)); });
  var html = renderExams(true) + '<div class="sec-head" style="margin-top:8px"><h2>Aufgaben</h2><button type="button" class="add-btn" data-act="task-new">' + ICON_PLUS + 'Aufgabe</button></div>' +
    '';
  if (!open.length) {
    html += '<div class="tasks"><div class="empty-note"><strong>Nichts offen</strong>Neue Aufgaben erscheinen hier, sobald Untis oder eine Mail sie meldet.</div></div>';
  } else {
    html += '<div class="tasks">' + TGROUPS.map(function (g) {
      var list = open.filter(function (t) { return groupOf(t) === g; });
      if (!list.length) return '';
      return '<div class="tgroup' + (g === 'Überfällig' ? ' late' : '') + '">' + g + ' (' + list.length + ')</div>' + list.map(taskRow).join('');
    }).join('') + '</div>';
  }
  if (done.length) {
    html += '<details class="subj"><summary><div><div class="subj-code">Erledigt</div><div class="subj-name">Die letzten 14 Tage</div></div>' +
      '<span class="grade" style="font-size:22px">' + done.length + '</span></summary>' +
      '<div class="tasks" style="margin:0;border-top:1px solid var(--line);border-radius:0 0 18px 18px">' + done.map(taskRow).join('') + '</div></details>';
  }
  return html;
}

function renderTaskCard() {
  var open = openTasks();
  var head = '<div class="sec-head"><h2>Aufgaben</h2>' + (open.length > 4
    ? '<button class="link-btn" data-act="view" data-view="tasks">Alle ' + open.length + ' anzeigen</button>'
    : '<button class="link-btn" data-act="task-new">Aufgabe anlegen</button>') + '</div>';
  if (!open.length) return head + '<div class="tasks"><div class="empty-note"><strong>Nichts offen</strong>Hausaufgaben und Aufgaben aus Teams erscheinen hier automatisch.</div></div>';
  return head + '<div class="tasks">' + open.slice(0, 4).map(taskRow).join('') + '</div>';
}

function updateTaskCount() {
  var open = openTasks();
  var late = open.filter(function (t) { return t.faellig && daysUntil(t.faellig) < 0; }).length;
  var soon = open.filter(function (t) { return t.faellig && daysUntil(t.faellig) <= 1; }).length;
  var el = $('taskCount');
  el.hidden = !soon;
  el.textContent = soon;
  el.className = 'count' + (late ? ' late' : '');
  el.setAttribute('aria-label', soon + (late ? ' fällig, davon ' + late + ' überfällig' : ' bald fällig'));
}

function openTask(id) {
  var f = $('taskForm'); f.reset();
  var t = id ? (DATA.tasks || []).filter(function (x) { return x.id === id; })[0] : null;
  var subs = subjectsList();
  if (t && t.fach && subs.indexOf(t.fach) < 0) subs.push(t.fach);
  $('taskFach').innerHTML = '<option value="">Kein Fach</option>' + subs.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
  if (t) { f.titel.value = t.titel; f.fach.value = t.fach; f.faellig.value = t.faellig; f.zeit.value = t.zeit; f.notiz.value = t.notiz; }
  else if (VIEW === 'subject' && SUBJECT && SUBJECT !== 'Allgemein') f.fach.value = SUBJECT;
  f.setAttribute('data-id', t ? t.id : '');
  $('taskTitle').textContent = t ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  var src = $('taskSrc');
  src.hidden = !(t && SRC[t.quelle]);
  if (t && SRC[t.quelle]) src.innerHTML = 'Automatisch ' + esc(SRC[t.quelle]) + (t.link ? ' · <a href="' + esc(t.link) + '" target="_blank" rel="noopener">Quelle öffnen</a>' : '');
  $('taskErr').textContent = ''; $('taskSave').disabled = false;
  var del = $('taskDel'); del.hidden = !t; del.disabled = false; del.textContent = 'Löschen'; DEL_ARMED.task = false;
  $('taskDlg').showModal();
  if (!t) f.titel.focus();
}

function submitTask(ev) {
  ev.preventDefault();
  var f = $('taskForm');
  if (!f.titel.value.trim()) { $('taskErr').textContent = 'Bitte beschreib die Aufgabe kurz.'; return; }
  if (f.zeit.value && !f.faellig.value) { $('taskErr').textContent = 'Für eine Uhrzeit brauchst du auch ein Datum.'; return; }
  $('taskSave').disabled = true;
  RUN()
    .withSuccessHandler(function (list) { DATA.tasks = list; $('taskDlg').close(); render(DATA); toast('Aufgabe gespeichert'); })
    .withFailureHandler(function (e) { $('taskSave').disabled = false; $('taskErr').textContent = (e && e.message) || 'Speichern fehlgeschlagen.'; })
    .saveTask({ id: f.getAttribute('data-id'), titel: f.titel.value, fach: f.fach.value, faellig: f.faellig.value, zeit: f.zeit.value, notiz: f.notiz.value });
}

function toggleTask(id) {
  var t = (DATA.tasks || []).filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  var done = !t.erledigt, now = new Date();
  t.erledigt = done;
  t.erledigtAm = done ? isoDay(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) : '';
  render(DATA);
  toast(done ? 'Erledigt' : 'Wieder offen');
  RUN()
    .withSuccessHandler(function (list) { DATA.tasks = list; if (!document.querySelector('dialog[open]')) render(DATA); })
    .withFailureHandler(function (e) { t.erledigt = !done; render(DATA); showError(e); })
    .setTaskDone(id, done);
}

/* ---------- Systemstatus ---------- */

var LV = { ok: 0, warn: 1, error: 2 };

function worstStatus() {
  var w = 'ok';
  (DATA.status || []).forEach(function (s) { if (LV[s.level] > LV[w]) w = s.level; });
  return w;
}

function renderStatusAlert() {
  var bad = (DATA.status || []).filter(function (s) { return s.level === 'error'; });
  if (!bad.length) return '';
  return '<div class="alert" role="alert"><div><strong>' + esc(bad.map(function (s) { return s.label; }).join(' und ')) +
    (bad.length === 1 ? ' funktioniert gerade nicht' : ' funktionieren gerade nicht') + '</strong>' + esc(bad[0].detail) + '</div>' +
    '<button type="button" class="btn ghost" data-act="status">Lösung</button></div>';
}

function updateStatusBtn() {
  var w = worstStatus();
  $('statusDot').className = 'dot ' + w;
  $('statusBtn').setAttribute('aria-label', 'Systemstatus: ' + (w === 'ok' ? 'alles in Ordnung' : w === 'warn' ? 'Hinweis' : 'Störung') + '. Details anzeigen');
}

function openStatus() {
  var rows = (DATA.status || []).map(function (s) {
    return '<div class="st-row"><span class="dot ' + esc(s.level) + '"></span><div><div class="st-label">' + esc(s.label) + '</div>' +
      '<div class="st-detail">' + esc(s.detail) + '</div>' +
      (s.hint ? '<div class="st-hint">' + esc(s.hint) + '</div>' : '') +
      (s.msg && s.level !== 'ok' ? '<div class="st-err">Fehlermeldung: ' + esc(s.msg) + '</div>' : '') + '</div></div>';
  }).join('');
  var w = worstStatus();
  $('infoBody').innerHTML = '<h2 id="infoTitle">Systemstatus</h2><p class="info-when">' +
    (w === 'ok' ? 'Alles läuft.' : w === 'warn' ? 'Läuft, mit Hinweisen.' : 'Es gibt eine Störung.') + '</p>' + rows;
  $('delBtn').hidden = true;
  $('infoDlg').showModal();
}

/* ---------- Übersicht: Schnellaktionen & Kennzahlen ---------- */

var IC = {
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13.5 6.5l4 4"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4M12 13v4M10 15h4"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4.5h11l-2 4 2 4H6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><path d="M7 16v-4M12 16V7M17 16v-6.5"/></svg>'
};

function focusLesson(blocks) {
  var now = new Date();
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.status !== 'Entfall' && at(b.datum, b.ende) > now) return b;
  }
  return null;
}

function renderQuick(blocks) {
  var b = focusLesson(blocks);
  var fach = b ? b.fach : 'Allgemein', datum = b ? b.datum : '';
  return '<nav class="qa" aria-label="Schnellaktionen">' +
    '<button type="button" data-act="note-new" data-fach="' + esc(fach) + '" data-datum="' + esc(datum) + '">' + IC.note + 'Notiz</button>' +
    '<button type="button" data-act="scan" data-fach="' + esc(fach) + '" data-datum="' + esc(datum) + '">' + IC.cam + 'Tafelbild</button>' +
    '<button type="button" data-act="task-new">' + IC.task + 'Aufgabe</button>' +
    '<button type="button" data-act="ev-new">' + IC.cal + 'Termin</button>' +
    '<button type="button" data-act="file-scan">' + IC.file + 'Datei</button>' +
  '</nav>';
}

function renderStats(blocks) {
  var now = new Date(), today = isoDay(now);
  // Schule heute
  var todays = blocks.filter(function (b) { return b.datum === today && b.status !== 'Entfall'; });
  var left = todays.filter(function (b) { return at(b.datum, b.ende) > now; });
  var s1;
  if (todays.length) {
    s1 = { val: left.length ? left.length + ' / ' + todays.length : 'Fertig', sub: left.length ? 'Blöcke offen, Schluss ' + todays[todays.length - 1].ende : 'Schultag geschafft', cls: '' };
  } else {
    var nx = blocks.filter(function (b) { return b.datum > today && b.status !== 'Entfall'; })[0];
    s1 = { val: 'Frei', sub: nx ? 'Nächste Schule ' + WD[at(nx.datum, '12:00').getDay()].slice(0, 2) + ', ' + nx.start : 'keine Stunden geplant', cls: '' };
  }
  // Aufgaben
  var open = openTasks();
  var late = open.filter(function (t) { return t.faellig && daysUntil(t.faellig) < 0; }).length;
  var soon = open.filter(function (t) { return t.faellig && daysUntil(t.faellig) >= 0 && daysUntil(t.faellig) <= 1; }).length;
  var s2 = { val: String(open.length), sub: late ? late + ' überfällig' : soon ? soon + ' bis morgen fällig' : open.length ? 'nichts dringend' : 'alles erledigt', cls: late ? 'warn' : soon ? 'hot' : '' };
  // Nächste Prüfung (Untis)
  var ex = (DATA.exams || [])[0];
  var exam = ex ? { datum: ex.datum, name: ex.fach || ex.titel } : null;
  if (!exam) { var lb = blocks.filter(function (b) { return b.status === 'Prüfung' && at(b.datum, b.ende) > now; })[0]; if (lb) exam = { datum: lb.datum, name: lb.fach }; }
  var s3 = exam
    ? { val: daysUntil(exam.datum) <= 0 ? 'Heute' : daysUntil(exam.datum) === 1 ? 'Morgen' : daysUntil(exam.datum) + ' Tage', sub: exam.name + ', ' + fmtDay(exam.datum), cls: daysUntil(exam.datum) <= 7 ? 'hot' : '' }
    : { val: 'Keine', sub: 'nichts eingetragen', cls: '' };
  // Schnitt
  var grades = DATA.grades || [], subs = {};
  grades.forEach(function (g) { subs[g.fach] = true; });
  var avgs = Object.keys(subs).map(function (f) { return subjectAvg(grades.filter(function (g) { return g.fach === f; }), f); }).filter(function (x) { return x != null; });
  var avg = avgs.length ? avgs.reduce(function (a, b) { return a + b; }, 0) / avgs.length : null;
  var s4 = avg != null ? { val: fmtNote(avg), sub: grades.length + (grades.length === 1 ? ' Note' : ' Noten') + ' in ' + avgs.length + (avgs.length === 1 ? ' Fach' : ' Fächern'), cls: '' } : { val: '–', sub: 'noch keine Noten', cls: '' };

  function tile(icon, label, s, view) {
    var inner = '<span class="stat-top">' + icon + esc(label) + '</span><span class="stat-val">' + esc(s.val) + '</span><span class="stat-sub ' + s.cls + '">' + esc(s.sub) + '</span>';
    if (view === 'exams') return '<button type="button" class="stat" data-act="jump-exams">' + inner + '</button>';
    return view ? '<button type="button" class="stat" data-act="view" data-view="' + view + '">' + inner + '</button>' : '<div class="stat">' + inner + '</div>';
  }
  return '<div class="stats">' +
    tile(IC.clock, 'Schule heute', s1, '') +
    tile(IC.task, 'Offene Aufgaben', s2, 'tasks') +
    tile(IC.flag, 'Nächste Prüfung', s3, 'exams') +
    tile(IC.chart, 'Notenschnitt', s4, 'perf') +
  '</div>';
}

/* ---------- Prüfungs-Countdown ---------- */

var EXAMS_ALL = false;

function renderExams(full) {
  var list = DATA.exams || [];
  if (full) EXAMS_ALL = true;
  var head = '<div class="sec-head" id="examsCard"><h2>Prüfungen</h2><button class="link-btn" data-act="exam-new">Eintragen</button></div>';
  if (!list.length) {
    return head + '<div class="exams"><div class="empty-note"><strong>Keine Prüfungen eingetragen</strong>Prüfungen aus Untis erscheinen hier automatisch. Klassenarbeiten trägst du über „Eintragen“ ein, der Countdown läuft dann von selbst.</div></div>';
  }
  var shown = EXAMS_ALL ? list : list.slice(0, 4);
  var rows = shown.map(function (x) {
    var d = daysUntil(x.datum);
    var cd = d <= 0 ? '<div class="cd word"><b>Heute</b><span>' + esc(x.start || 'ganztags') + '</span></div>'
      : d === 1 ? '<div class="cd word"><b>Morgen</b><span>' + esc(x.start || 'ganztags') + '</span></div>'
      : '<div class="cd"><b>' + d + '</b><span>Tage</span></div>';
    var cls = d <= 1 ? ' now' : d <= 7 ? ' soon' : '';
    var meta = [x.fach, fmtDay(x.datum) + (x.start ? ', ' + x.start + ' Uhr' : ''), x.quelle === 'Untis' ? 'aus Untis' : ''].filter(Boolean).join(', ');
    return '<div class="exam-row' + cls + '">' + cd + '<div><div class="ex-title">' + esc(x.titel) + '</div><div class="ex-meta">' + esc(meta) + '</div></div></div>';
  }).join('');
  var more = list.length > 4 ? '<button type="button" class="ex-more" data-act="exams-toggle">' + (EXAMS_ALL ? 'Weniger anzeigen' : 'Alle ' + list.length + ' anzeigen') + '</button>' : '';
  return head + '<div class="exams">' + rows + more + '</div>';
}

function openExamForm() {
  openForm();
  var f = $('evForm');
  f.title.value = 'Klassenarbeit ';
  f.allDay.checked = false;
  $('evTimes').hidden = false;
  f.start.value = '08:00'; f.end.value = '09:30';
  f.title.focus();
}

/* ---------- Übersicht: Demnächst ---------- */

function examRow(x) {
  var d = daysUntil(x.datum);
  var cd = d <= 0 ? '<div class="cd word"><b>Heute</b><span>' + esc(x.start || 'ganztags') + '</span></div>'
    : d === 1 ? '<div class="cd word"><b>Morgen</b><span>' + esc(x.start || 'ganztags') + '</span></div>'
    : '<div class="cd"><b>' + d + '</b><span>Tage</span></div>';
  var cls = d <= 1 ? ' now' : d <= 7 ? ' soon' : '';
  var meta = [x.fach, fmtDay(x.datum) + (x.start ? ', ' + x.start + ' Uhr' : '')].filter(Boolean).join(', ');
  return '<div class="exam-row' + cls + '">' + cd + '<div><div class="ex-title">' + esc(x.titel) + '</div><div class="ex-meta">' + esc(meta) + '</div></div></div>';
}

function renderAgenda() {
  var items = (DATA.exams || []).slice(0, 3).map(function (x) { return { k: x.datum + (x.start || '99'), html: examRow(x) }; })
    .concat(openTasks().slice(0, 4).map(function (t) { return { k: t.faellig ? t.faellig + (t.zeit || '99') : '9999', html: taskRow(t) }; }))
    .sort(function (a, b) { return a.k.localeCompare(b.k); }).slice(0, 5);
  var head = '<div class="sec-head"><h2>Demnächst</h2><button class="link-btn" data-act="view" data-view="tasks">Alle ansehen</button></div>';
  var body = items.length ? items.map(function (i) { return i.html; }).join('')
    : '<div class="empty-note"><strong>Nichts Dringendes</strong>Aufgaben und Prüfungen erscheinen hier automatisch.</div>';
  return '<div class="agenda-wrap">' + head + '<div class="agenda">' + body + '</div></div>';
}

function renderFeedHome(data, blocks) {
  var extra = conflictItems(blocks, data.events || []);
  var unread = groupUpdates(data.updates || []).filter(function (g) { return !g.read; }).length;
  if (!unread && !extra && !SHOW_READ) {
    return '<div class="sec-head"><h2>Meldungen</h2></div><p class="quiet">Keine neuen Meldungen. <button class="link-btn" data-act="toggle-read">Ältere anzeigen</button></p>';
  }
  return renderFeed(data.updates || [], extra);
}

function openAdd() {
  var b = focusLesson(toBlocks(DATA.lessons || []));
  Array.prototype.forEach.call(document.querySelectorAll('#addDlg [data-fach]'), function (x) {
    x.setAttribute('data-fach', b ? b.fach : 'Allgemein');
    x.setAttribute('data-datum', b ? b.datum : '');
  });
  $('addDlg').showModal();
}

/* ---------- Rendern ---------- */

function render(data) {
  DATA = data;
  var blocks = toBlocks(data.lessons || []);
  if (VIEW === 'notes') $('app').innerHTML = renderNotes();
  else if (VIEW === 'subject' && SUBJECT) $('app').innerHTML = renderSubject(SUBJECT);
  else if (VIEW === 'report') $('app').innerHTML = renderReports();
  else if (VIEW === 'perf') $('app').innerHTML = renderPerf();
  else if (VIEW === 'tasks') $('app').innerHTML = renderTasks();
  else {
    VIEW = 'home';
    $('app').innerHTML = renderStatusAlert() +
      '<div class="hero">' + renderSign(blocks) + renderAgenda() + '</div>' +
      '<div class="grid"><div>' + renderDays(blocks, data.events || []) + '</div><aside class="side">' +
      renderFeedHome(data, blocks) + '</aside></div>';
  }
  Array.prototype.forEach.call(document.querySelectorAll('.nav button'), function (b) {
    var on = b.getAttribute('data-view') === (VIEW === 'subject' ? 'notes' : VIEW);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('syncInfo').textContent = data.lastSync ? 'Stand ' + data.lastSync.slice(11) + ' Uhr' : '';
  updateTaskCount();
  updateStatusBtn();
}

function go(view, subject) {
  VIEW = view; SUBJECT = subject || null; TAG = '';
  if (view !== 'notes') QUERY = '';
  if (DATA) render(DATA);
  window.scrollTo(0, 0);
}

function apply(d) {
  DATA = d;
  var a = document.activeElement;
  if (a && a.id === 'noteSearch') return;
  if (document.querySelector('dialog[open]')) return;
  render(d);
}

function header() {
  var d = new Date();
  $('today').textContent = WD[d.getDay()] + ', ' + d.getDate() + '. ' + MO[d.getMonth()];
}

function showError(err) {
  $('refreshBtn').classList.remove('spin');
  toast('Laden fehlgeschlagen: ' + (err && err.message ? err.message : 'unbekannter Fehler') + '. Bitte erneut versuchen.');
}

function load() {
  RUN().withSuccessHandler(apply).withFailureHandler(showError).getDashboard();
}

function markGroups(groups) {
  var items = [];
  groups.forEach(function (g) { g.read = true; g.items.forEach(function (u) { u.gelesen = true; items.push(u); }); });
  render(DATA);
  RUN().withFailureHandler(showError).markRead(items.map(function (u) {
    return { zeitpunkt: u.zeitpunkt, stunde: u.stunde, fach: u.fach, art: u.art, meldung: u.meldung };
  }));
}

document.addEventListener('click', function (ev) {
  if (ev.target.closest('a')) return;
  var el = ev.target.closest('[data-act]');
  if (!el) return;
  var act = el.getAttribute('data-act');
  if (el.closest('#addDlg') && act !== 'close-dlg') $('addDlg').close();
  if (act === 'add') openAdd();
  if (act === 'read') markGroups([renderFeed.groups[Number(el.getAttribute('data-key'))]]);
  if (act === 'all-read') { markGroups(renderFeed.groups.filter(function (g) { return !g.read; })); toast('Alle Meldungen als gelesen markiert'); }
  if (act === 'toggle-read') { SHOW_READ = !SHOW_READ; render(DATA); }
  if (act === 'ev') openInfo(Number(el.getAttribute('data-idx')));
  if (act === 'view') go(el.getAttribute('data-view'));
  if (act === 'subject') go('subject', el.getAttribute('data-fach'));
  if (act === 'note-new') openNote({ fach: el.getAttribute('data-fach'), datum: el.getAttribute('data-datum') });
  if (act === 'note-edit') openNote({ id: el.getAttribute('data-id') });
  if (act === 'scan') openNote({ fach: el.getAttribute('data-fach'), datum: el.getAttribute('data-datum'), scan: true });
  if (act === 'tag') { TAG = el.getAttribute('data-tag'); render(DATA); }
  if (act === 'report-create') createReport(false);
  if (act === 'grade-new') openGrade('');
  if (act === 'grade-edit') openGrade(el.getAttribute('data-id'));
  if (act === 'abs-new') openAbsence('');
  if (act === 'abs-edit') openAbsence(el.getAttribute('data-id'));
  if (act === 'abs-copy') { var ab = (DATA.absences || []).filter(function (x) { return x.id === el.getAttribute('data-id'); })[0]; if (ab) copyText(excuseText(ab)); return; }
  if (act === 'abs-done') {
    RUN().withSuccessHandler(function (list) { DATA.absences = list; render(DATA); toast('Als abgegeben markiert'); }).withFailureHandler(showError)
      .setAbsenceExcused(el.getAttribute('data-id'), true);
  }
  if (act === 'report-force') createReport(true);
  if (act === 'report-copy') { var rp = (DATA.reports || []).filter(function (x) { return x.key === el.getAttribute('data-key'); })[0]; if (rp) copyText(rp.text); }
  if (act === 'report-status') {
    RUN().withSuccessHandler(function (reps) { DATA.reports = reps; render(DATA); }).withFailureHandler(showError)
      .setReportStatus(el.getAttribute('data-key'), el.getAttribute('data-status'));
  }
  if (act === 'ev-new') openForm();
  if (act === 'exam-new') openExamForm();
  if (act === 'jump-exams') { var ec = $('examsCard'); if (ec) ec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (act === 'exams-toggle') { EXAMS_ALL = !EXAMS_ALL; render(DATA); }
  if (act === 'file-scan') { openForm(); $('fileInput').click(); }
  if (act === 'task-new') openTask('');
  if (act === 'task-edit') openTask(el.getAttribute('data-id'));
  if (act === 'task-toggle') toggleTask(el.getAttribute('data-id'));
  if (act === 'status') openStatus();
  if (act === 'close-dlg') { var dlg = el.closest('dialog'); if (dlg) dlg.close(); }
});

document.addEventListener('keydown', function (ev) {
  var t = ev.target;
  if ((ev.key === 'Enter' || ev.key === ' ') && t.getAttribute && t.getAttribute('role') === 'button' && t.hasAttribute('data-act')) {
    ev.preventDefault(); t.click();
  }
});

document.addEventListener('input', function (ev) {
  if (ev.target.id === 'noteSearch') { QUERY = ev.target.value.trim(); $('noteResults').innerHTML = notesBody(); }
});

$('noteForm').addEventListener('submit', submitNote);
$('noteDel').addEventListener('click', deleteNoteClick);
$('gradeForm').addEventListener('submit', submitGrade);
$('taskForm').addEventListener('submit', submitTask);
$('statusBtn').addEventListener('click', function () { if (DATA) openStatus(); });
$('taskDel').addEventListener('click', function () {
  var b = this;
  armDelete(b, 'task', function () {
    RUN().withSuccessHandler(function (list) { DATA.tasks = list; $('taskDlg').close(); render(DATA); toast('Aufgabe gelöscht'); })
      .withFailureHandler(function (e) { b.disabled = false; $('taskErr').textContent = (e && e.message) || 'Löschen fehlgeschlagen.'; })
      .deleteTask($('taskForm').getAttribute('data-id'));
  });
});
$('absForm').addEventListener('submit', submitAbsence);
$('absDate').addEventListener('change', prefillHours);
$('fileBtn').addEventListener('click', function () { $('fileInput').click(); });
$('fileInput').addEventListener('change', fileChosen);
$('foundSave').addEventListener('click', saveFound);
$('gradeDel').addEventListener('click', function () {
  var b = this;
  armDelete(b, 'grade', function () {
    RUN().withSuccessHandler(function (r) { DATA.grades = r.grades; DATA.weights = r.weights; $('gradeDlg').close(); render(DATA); toast('Note gelöscht'); })
      .withFailureHandler(function (e) { b.disabled = false; $('gradeErr').textContent = (e && e.message) || 'Löschen fehlgeschlagen.'; })
      .deleteGrade($('gradeForm').getAttribute('data-id'));
  });
});
$('absDel').addEventListener('click', function () {
  var b = this;
  armDelete(b, 'abs', function () {
    RUN().withSuccessHandler(function (list) { DATA.absences = list; $('absDlg').close(); render(DATA); toast('Fehlzeit gelöscht'); })
      .withFailureHandler(function (e) { b.disabled = false; $('absErr').textContent = (e && e.message) || 'Löschen fehlgeschlagen.'; })
      .deleteAbsence($('absForm').getAttribute('data-id'));
  });
});
document.addEventListener('change', function (ev) {
  var t = ev.target;
  if (t.hasAttribute && t.hasAttribute('data-want')) { WANT[t.getAttribute('data-want')] = t.value; render(DATA); }
  if (t.hasAttribute && t.hasAttribute('data-weight')) {
    var sv = Math.max(0, Math.min(100, Math.round(Number(t.value) || 0)));
    var fach = t.getAttribute('data-weight');
    WANT[fach] = WANT[fach] || '2.0';
    RUN().withSuccessHandler(function (r) { DATA.weights = r.weights; render(DATA); toast('Gewichtung gespeichert'); }).withFailureHandler(showError)
      .setWeights(fach, sv, 100 - sv);
  }
});
$('scanBtn').addEventListener('click', function () { $('scanInput').click(); });
$('scanInput').addEventListener('change', scanChosen);

$('addBtn').addEventListener('click', openForm);
$('evForm').addEventListener('submit', submitForm);
$('evAllDay').addEventListener('change', function () { $('evTimes').hidden = this.checked; });

$('refreshBtn').addEventListener('click', function () {
  var btn = $('refreshBtn');
  if (btn.classList.contains('spin')) return;
  btn.classList.add('spin');
  RUN()
    .withSuccessHandler(function (d) { btn.classList.remove('spin'); apply(d); toast(d.syncError ? 'Untis-Abgleich fehlgeschlagen. Details unter Systemstatus.' : 'Stundenplan aktualisiert'); })
    .withFailureHandler(showError)
    .syncNow();
});

header();
load();
setInterval(function () { header(); if (DATA && VIEW === 'home' && !document.querySelector('dialog[open]')) render(DATA); }, 30000);     // Countdown aktuell halten
setInterval(load, 5 * 60000);                                              // neue Daten alle 5 Minuten
document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
