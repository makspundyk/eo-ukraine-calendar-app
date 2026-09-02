/**
 * EO Ukraine — sheet to Google Calendar.
 * ===========================================================================
 * Paste this into the sheet: Extensions → Apps Script. Then Services → + → Google Calendar
 * API → Add. Run "Sync now" once from the EO Calendar menu and grant it access.
 *
 * WHAT IT DOES
 *   Every row marked Published that has a Start Date gets one real event on the calendar of
 *   whoever authorised this script. The event id and its link are written back into the sheet,
 *   which is how the website knows to offer "get the invitation" instead of a copy.
 *
 * WHO OWNS WHAT — the rule that keeps this from fighting the organiser
 *   the sheet owns    Title, Start Date, End Date, Start Time, End Time, Timezone
 *   the organiser owns Location/room, Description, guests, video link, colour, reminders
 *
 *   On CREATE the script fills in a starting description and location from the sheet. On every
 *   sync after that it only ever corrects the title and the times. It never touches the
 *   description, the location or the guest list again — so a room booked by hand at 9am is
 *   still there after the 10am sync. This is the whole reason the integration is safe to leave
 *   running.
 *
 * WHAT IT NEVER DOES
 *   Delete an event. If a row stops being Published the event is CANCELLED, not removed, so
 *   the guests are told rather than having it silently vanish from their calendars.
 */

var TIMEZONE_BY_CODE = {
  CET: 'Europe/Berlin', CEST: 'Europe/Berlin',
  EET: 'Europe/Kyiv',   EEST: 'Europe/Kyiv',
  GMT: 'Europe/London', UTC: 'Etc/UTC', JST: 'Asia/Tokyo'
};

var CALENDAR_ID = 'primary';   // or the id of a shared chapter calendar

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('EO Calendar')
    .addItem('Sync now', 'syncNow')
    .addItem('Install hourly sync', 'installTrigger')
    .addToUi();
}

/** An hourly trigger, so nobody has to remember. Safe to run twice; it replaces itself. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncNow').timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert('The calendar will now sync every hour.');
}

function syncNow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('EventCalendar')
           || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var head = findHeaderRow_(values);
  if (!head) { log_('No header row found — nothing done.'); return; }

  var col = head.map;
  ensureColumns_(sheet, head, ['Calendar Event ID', 'Calendar Link']);
  values = sheet.getDataRange().getValues();          // re-read: columns may have been added
  head = findHeaderRow_(values);
  col = head.map;

  var created = 0, updated = 0, cancelled = 0;

  for (var i = head.index + 1; i < values.length; i++) {
    var row = values[i];
    var title = String(get_(row, col, 'title') || '').trim();
    if (!title) continue;

    var status = String(get_(row, col, 'status') || '').trim().toLowerCase();
    var published = status === 'published';
    var eventId = String(get_(row, col, 'calendar_event_id') || '').trim();
    var startDate = String(get_(row, col, 'start_date') || '').trim();

    // Not published any more: cancel what exists, so guests are told.
    if (!published) {
      if (eventId) { cancel_(eventId); cancelled++; write_(sheet, head, col, i, '', ''); }
      continue;
    }
    if (!startDate) continue;                          // no date yet, nothing to put anywhere

    var when = times_(row, col);
    if (eventId) {
      // ONLY the title and the times. The organiser owns everything else.
      try {
        Calendar.Events.patch({ summary: title, start: when.start, end: when.end },
                              CALENDAR_ID, eventId);
        updated++;
      } catch (e) { log_('Row ' + (i + 1) + ': ' + e.message); }
    } else {
      try {
        var made = Calendar.Events.insert({
          summary: title,
          description: description_(row, col),
          location: String(get_(row, col, 'venue') || get_(row, col, 'location') || ''),
          start: when.start,
          end: when.end,
          guestsCanSeeOtherGuests: false,
          guestsCanInviteOthers: false
        }, CALENDAR_ID);
        write_(sheet, head, col, i, made.id, made.htmlLink);
        created++;
      } catch (e) { log_('Row ' + (i + 1) + ': ' + e.message); }
    }
  }
  log_('Created ' + created + ', updated ' + updated + ', cancelled ' + cancelled + '.');
}

/* ------------------------------------------------------------------ helpers */

var HEADERS = {
  status: ['status'], title: ['title', 'name'],
  start_date: ['start date'], end_date: ['end date'],
  start_time: ['start time'], end_time: ['end time'], timezone: ['timezone'],
  location: ['location', 'place'], venue: ['venue'],
  summary: ['summary'], registration_url: ['registration url'],
  calendar_event_id: ['calendar event id'], calendar_link: ['calendar link']
};

function findHeaderRow_(values) {
  for (var i = 0; i < Math.min(values.length, 15); i++) {
    var map = {}, hits = 0;
    for (var c = 0; c < values[i].length; c++) {
      var name = String(values[i][c] || '').trim().toLowerCase();
      for (var field in HEADERS) {
        if (HEADERS[field].indexOf(name) >= 0 && map[field] === undefined) {
          map[field] = c; hits++;
        }
      }
    }
    if (hits >= 3 && (map.title !== undefined || map.start_date !== undefined)) {
      return { index: i, map: map };
    }
  }
  return null;
}

function get_(row, col, field) { return col[field] === undefined ? '' : row[col[field]]; }

/** Adds the two write-back columns if the sheet does not have them yet. */
function ensureColumns_(sheet, head, names) {
  var existing = sheet.getRange(head.index + 1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (v) { return String(v || '').trim().toLowerCase(); });
  names.forEach(function (name) {
    if (existing.indexOf(name.toLowerCase()) < 0) {
      var c = sheet.getLastColumn() + 1;
      sheet.getRange(head.index + 1, c).setValue(name);
      existing.push(name.toLowerCase());
    }
  });
}

function write_(sheet, head, col, rowIndex, id, link) {
  var fresh = findHeaderRow_(sheet.getDataRange().getValues());
  if (fresh.map.calendar_event_id !== undefined) {
    sheet.getRange(rowIndex + 1, fresh.map.calendar_event_id + 1).setValue(id);
  }
  if (fresh.map.calendar_link !== undefined) {
    sheet.getRange(rowIndex + 1, fresh.map.calendar_link + 1).setValue(link);
  }
}

/** All-day events use date; timed ones use dateTime with a real IANA zone. */
function times_(row, col) {
  var start = iso_(get_(row, col, 'start_date'));
  var end = iso_(get_(row, col, 'end_date')) || start;
  var t1 = String(get_(row, col, 'start_time') || '').trim();
  var t2 = String(get_(row, col, 'end_time') || '').trim();
  var zone = TIMEZONE_BY_CODE[String(get_(row, col, 'timezone') || 'CET').toUpperCase()]
          || 'Europe/Kyiv';

  if (!t1) {
    return { start: { date: start }, end: { date: nextDay_(end) } };   // DTEND is exclusive
  }
  if (!t2) t2 = addMinutes_(t1, 90);
  return {
    start: { dateTime: start + 'T' + pad_(t1) + ':00', timeZone: zone },
    end:   { dateTime: (t2 < t1 ? nextDay_(start) : start) + 'T' + pad_(t2) + ':00', timeZone: zone }
  };
}

function iso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd');
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function nextDay_(iso) {
  if (!iso) return iso;
  var p = iso.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}
function pad_(t) { var p = t.split(':'); return ('0' + p[0]).slice(-2) + ':' + ('0' + (p[1] || '0')).slice(-2); }
function addMinutes_(t, mins) {
  var p = t.split(':'), total = (+p[0]) * 60 + (+p[1] || 0) + mins;
  return ('0' + Math.floor(total / 60) % 24).slice(-2) + ':' + ('0' + total % 60).slice(-2);
}

function description_(row, col) {
  var parts = [];
  var s = String(get_(row, col, 'summary') || '').trim();
  var r = String(get_(row, col, 'registration_url') || '').trim();
  if (s) parts.push(s);
  if (r) parts.push('Register: ' + r);
  parts.push('', 'Created from the events sheet. Edit this description freely — the sync only '
    + 'corrects the title and the times, and will not overwrite what you write here.');
  return parts.join('\n');
}

/** Cancelled rather than deleted: guests are told instead of the event vanishing. */
function cancel_(eventId) {
  try { Calendar.Events.patch({ status: 'cancelled' }, CALENDAR_ID, eventId); }
  catch (e) { log_('Cancel failed: ' + e.message); }
}

function log_(message) {
  Logger.log(message);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(message, 'EO Calendar', 8); } catch (e) {}
}
