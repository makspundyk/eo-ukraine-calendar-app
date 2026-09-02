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

/**
 * WHERE THE EVENTS GO — a Script Property, not a constant in this file.
 *
 * This file lives in a public repository. A calendar id does not grant access on its own, but
 * it names a private calendar and there is no reason to publish it. Set it once:
 *
 *   Project Settings (the gear) -> Script Properties -> Add script property
 *   Property: CALENDAR_ID
 *   Value:    c_xxxxxxxx@group.calendar.google.com
 *
 * Or run setCalendarId() from the EO Calendar menu and paste it in.
 *
 * Unset, it falls back to 'primary' — the calendar of whoever authorised the script. A shared
 * calendar is better for a chapter: several people can be given "Make changes to events", and
 * it outlives whoever set it up.
 *
 * GOOGLE_CALENDAR_ID on the website must be the SAME id, or invitations look for the events on
 * a calendar they are not on.
 */
/**
 * Where the calendar is published. Used for the "Full details" and unsubscribe links inside
 * every invitation. A Script Property overrides it; the default is the live address, so the
 * links work before anybody thinks to set one.
 */
function siteUrl_() {
  return (PropertiesService.getScriptProperties().getProperty('SITE_URL')
          || 'https://events.eoukraine.com').replace(/\/+$/, '');
}

function calendarId_() {
  return PropertiesService.getScriptProperties().getProperty('CALENDAR_ID') || 'primary';
}

/**
 * People who are put on every event the moment it is created — the organisers, so the event
 * lands in their own calendars without anybody remembering to add them.
 *
 * A Script Property, comma separated, because these are real personal addresses and this file
 * is in a public repository:
 *
 *   Property: DEFAULT_GUESTS
 *   Value:    someone@example.com, another@example.com
 */
function defaultGuests_() {
  var raw = PropertiesService.getScriptProperties().getProperty('DEFAULT_GUESTS') || '';
  return raw.split(',').map(function (x) { return x.trim(); })
    .filter(function (x) { return x.indexOf('@') > 0; })
    .map(function (email) { return { email: email, responseStatus: 'needsAction' }; });
}

/**
 * How long a row must sit untouched before its changes are pushed to the calendar.
 *
 * Editing a date, then a time, then the summary, then the speaker is four edits describing ONE
 * change. Sending each one moves the event four times and emails every guest four times. So
 * the clock restarts on each edit and only a quiet row is sent — the person finishes, then the
 * calendar catches up once.
 *
 * Ten minutes: long enough to rewrite a description without the calendar interrupting, short
 * enough that nobody wonders whether it worked.
 */
var QUIET_MS = 10 * 60 * 1000;
var PENDING_KEY = 'PENDING_UPDATES';

/** The subscriber list lives on its own tab. */
var SUBS_TAB = 'EventCalendarSubscriptions';
var SUBS_COLUMNS = ['Email', 'Date Subscribed', 'Full Name', 'Unsubscribed', 'Token'];

/**
 * The same quiet period, for a different reason. Ticking "Invite subscribers?" mails the whole
 * list, and there is no unsend. The tick is recorded and acted on only if it is STILL ticked
 * when the timer fires, so an accidental click can be undone by unticking it.
 */
var INVITE_KEY = 'PENDING_INVITES';

/**
 * Every sheet field the calendar event shows — its title, its times, its location, and each
 * line of the description template. Changing any of them queues an update.
 *
 * Notes and internal columns are not here: they are not on the event, so changing one should
 * not mail every guest.
 */
var WATCHED = ['title', 'start_date', 'end_date', 'start_time', 'end_time', 'timezone',
               'location', 'venue', 'summary', 'highlights', 'who_for',
               'speaker_name', 'speaker_title', 'registration_url', 'date_note'];

/** Fingerprints of what WE last wrote, so a hand-edit can be told from a stale value. */
var WRITTEN_KEY = 'WRITTEN_FINGERPRINTS';

function fingerprint_(text) {
  var h = 5381;
  var v = String(text || '');
  for (var i = 0; i < v.length; i++) h = ((h * 33) ^ v.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function writtenMap_() {
  try { return JSON.parse(
    PropertiesService.getScriptProperties().getProperty(WRITTEN_KEY) || '{}'); }
  catch (e) { return {}; }
}

function rememberWritten_(eventId, parts) {
  var map = writtenMap_();
  var record = map[eventId] || {};
  for (var k in parts) if (parts[k] !== undefined) record[k] = fingerprint_(parts[k]);
  map[eventId] = record;
  PropertiesService.getScriptProperties().setProperty(WRITTEN_KEY, JSON.stringify(map));
}

/**
 * May we replace this field?
 *
 * Yes if what is on the event is exactly what we last wrote there — then nobody has touched
 * it and the sheet is the authority. No if it differs, because somebody edited it in Google
 * Calendar, and overwriting an organiser's own words every hour is how an automation gets
 * switched off. An event we have no record of is left alone for the same reason.
 */
function mayReplace_(eventId, field, current) {
  var record = writtenMap_()[eventId];
  if (!record) return false;
  return record[field] === fingerprint_(current);
}

/** Prompts for the organisers who go on every new event. */
function setDefaultGuests() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var answer = ui.prompt('Default guests',
    'Comma-separated addresses invited to every NEW event.\n\nCurrently: '
    + (props.getProperty('DEFAULT_GUESTS') || '(none)'), ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var v = answer.getResponseText().trim();
  if (v) props.setProperty('DEFAULT_GUESTS', v); else props.deleteProperty('DEFAULT_GUESTS');
  tell_('Default guests: ' + (v || '(none)'));
}

/** The address the "Full details" link in each invitation points at. */
function setSiteUrl() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var answer = ui.prompt('Website address',
    'Where the calendar is published, e.g. https://events.eoukraine.com'
    + '\n\nCurrently: ' + siteUrl_(), ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var v = answer.getResponseText().trim();
  if (v) props.setProperty('SITE_URL', v); else props.deleteProperty('SITE_URL');
  tell_('Website address: ' + siteUrl_());
}

/** Skips the wait, for when you know you have finished editing. */
function flushNow() {
  var map = pending_();
  var ids = Object.keys(map);
  if (!ids.length) { tell_('Nothing is waiting.'); return; }
  ids.forEach(function (id) { map[id] = 0; });        // make everything overdue
  savePending_(map);
  flushPending();
  tell_('Applied ' + ids.length + ' pending change(s).');
}

/** Prompts for the id and stores it, so it never has to be typed into the code. */
function setCalendarId() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Calendar ID',
    'Paste the id of the calendar the events should live on.\n\n'
    + 'Google Calendar -> the calendar -> Settings -> Integrate calendar -> Calendar ID.\n'
    + 'Leave empty to use the calendar of whoever authorised this script.',
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var id = answer.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  if (id) props.setProperty('CALENDAR_ID', id); else props.deleteProperty('CALENDAR_ID');
  whichCalendar();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('EO Calendar')
    .addItem('Sync now', 'syncNow')
    .addItem('Check published rows', 'checkAll')
    .addItem('Refresh attendees now', 'refreshAttendees')
    .addSeparator()
    .addItem('Set up subscriptions', 'setUpSubscriptions')
    .addItem('Install hourly sync', 'installTrigger')
    .addItem('Set calendar…', 'setCalendarId')
    .addItem('Set default guests…', 'setDefaultGuests')
    .addItem('Set website address…', 'setSiteUrl')
    .addItem('Apply pending changes now', 'flushNow')
    .addItem('Which calendar am I writing to?', 'whichCalendar')
    .addToUi();
}

/** getUi() exists only when this runs from the spreadsheet, not from the script editor. */
function tell_(message) {
  Logger.log(message);
  try { SpreadsheetApp.getUi().alert(message); } catch (e) { /* running from the editor */ }
}

/**
 * Prints the calendar the events are going to, and its id.
 *
 * Run this after the first sync: the id it prints is what GOOGLE_CALENDAR_ID must be set to
 * in Cloudflare, or /api/attend will look for the events on the wrong calendar and every
 * invitation will fail with "that invitation could not be found".
 */
function whichCalendar() {
  var cal = CalendarApp.getCalendarById(
    calendarId_() === 'primary' ? Session.getEffectiveUser().getEmail() : calendarId_());
  var id = cal ? cal.getId() : '(not found)';
  tell_('Events are being written to:\n\n' + (cal ? cal.getName() : '?') + '\n' + id
    + '\n\nSet GOOGLE_CALENDAR_ID to exactly that id in Cloudflare and in .env.'
    + '\nAuthorised as: ' + Session.getEffectiveUser().getEmail());
}

/** An hourly trigger, so nobody has to remember. Safe to run twice; it replaces itself. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['syncNow', 'onEditCheck', 'flushPending', 'flushInvites']
        .indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('syncNow').timeBased().everyHours(1).create();
  // Installable rather than simple: a simple onEdit may not write notes or call Calendar.
  ScriptApp.newTrigger('onEditCheck').forSpreadsheet(ss).onEdit().create();
  // Drains the quiet-period queue. Cheap: it reads one property and stops when empty.
  ScriptApp.newTrigger('flushPending').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('flushInvites').timeBased().everyMinutes(5).create();
  tell_('Done.\n\n'
    + '• Marking a row Published creates its calendar event and invites the organisers\n'
    + '• Changing a date or time updates the event about '
    + Math.round(QUIET_MS / 60000) + ' minutes after you stop editing\n'
    + '• An incomplete row is flagged the moment you mark it Published\n'
    + '• An hourly sync catches anything missed');
}

/**
 * What a row needs before it may go in front of the chapter at all.
 *
 * Two things, and only two. A Registration URL is NOT among them: plenty of events are
 * announced before registration opens, or never have a form at all, and the site handles that
 * — it offers "Add to Google Calendar" or the invitation instead of a dead button. Marking
 * those rows red said something was wrong when nothing was.
 */
var REQUIRED_TO_PUBLISH = [
  { field: 'title', label: 'Title' },
  { field: 'type', label: 'Type' }
];

/**
 * Everything wrong with one row, as a list of human sentences. Empty means it is fine.
 *
 * A published row with NO Start Date is deliberately not an error: "dates to be confirmed" is
 * a real state the website has a section for. It simply cannot become a calendar entry yet.
 */
function problems_(row, col) {
  var out = [];
  for (var i = 0; i < REQUIRED_TO_PUBLISH.length; i++) {
    var r = REQUIRED_TO_PUBLISH[i];
    if (!String(get_(row, col, r.field) || '').trim()) out.push(r.label + ' is empty');
  }
  var start = iso_(get_(row, col, 'start_date'));
  var rawStart = String(get_(row, col, 'start_date') || '').trim();
  if (rawStart && !start) out.push('Start Date is not YYYY-MM-DD');
  var end = iso_(get_(row, col, 'end_date'));
  var rawEnd = String(get_(row, col, 'end_date') || '').trim();
  if (rawEnd && !end) out.push('End Date is not YYYY-MM-DD');
  if (start && end && end < start) out.push('End Date is before Start Date');
  var t = String(get_(row, col, 'start_time') || '').trim();
  if (t && !/^\d{1,2}:\d{2}$/.test(t)) out.push('Start Time is not HH:MM');
  var t2 = String(get_(row, col, 'end_time') || '').trim();
  if (t2 && !/^\d{1,2}:\d{2}$/.test(t2)) out.push('End Time is not HH:MM');
  if (t2 && !t) out.push('End Time is set but Start Time is not');
  return out;
}

/**
 * Lists every published row that is not ready, without changing anything. Run it before
 * announcing a season.
 */
function checkAll() {
  var ctx = open_();
  if (!ctx) return;
  var lines = [];
  var cleared = 0;
  eachRow_(ctx, function (row, i) {
    if (clearFlagIfClean_(ctx, row, i)) cleared++;
    if (!isPublished_(row, ctx.map)) return;
    var bad = problems_(row, ctx.map);
    if (bad.length) lines.push('Row ' + (i + 1) + ': ' + bad.join('; '));
    else if (!iso_(get_(row, ctx.map, 'start_date'))) {
      lines.push('Row ' + (i + 1) + ': published with no date — shown under '
        + '"Dates to be confirmed", no calendar entry until a date is set');
    }
  });
  if (cleared) lines.push('', 'Cleared ' + cleared + ' stale flag(s) from rows that are fine now.');
  tell_(lines.length ? lines.join('\n') : 'Every published row is complete, and nothing is flagged.');
}

/**
 * Runs on every edit, so a mistake is caught at the moment it is made rather than an hour
 * later. It does NOT revert the cell: people set the status first and fill the row afterwards,
 * and a script that undoes their typing gets switched off. It notes the problem on the Status
 * cell and colours the row instead, and the note clears itself when the row is fixed.
 *
 * Install it from the EO Calendar menu — a simple onEdit cannot write notes.
 */
function onEditCheck(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var values = sheet.getDataRange().getValues();
  var head = findHeaderRow_(values);
  if (!head) return;

  // A paste can cover several rows, so every touched row is considered, not just the first.
  var first = Math.max(e.range.getRow() - 1, head.index + 1);
  var last = Math.min(e.range.getLastRow() - 1, values.length - 1);
  var touched = columnsIn_(e.range, head);

  for (var i = first; i <= last; i++) {
    handleRow_(sheet, values, head, i, touched);
  }
}

/** Which of the fields we care about the edit actually covered. */
function columnsIn_(range, head) {
  var from = range.getColumn() - 1, to = range.getLastColumn() - 1;
  var hit = {};
  for (var field in head.map) {
    if (head.map[field] >= from && head.map[field] <= to) hit[field] = true;
  }
  return hit;
}

function handleRow_(sheet, values, head, i, touched) {
  var row = values[i];
  if (!String(get_(row, head.map, 'title') || '').trim()) return;

  var statusCell = head.map.status === undefined
    ? null : sheet.getRange(i + 1, head.map.status + 1);
  var rowRange = sheet.getRange(i + 1, 1, 1, Math.max(1, sheet.getLastColumn()));

  if (!isPublished_(row, head.map)) {
    if (statusCell) statusCell.clearNote();
    rowRange.setBackground(null);

    var existingId = String(get_(row, head.map, 'calendar_event_id') || '').trim();
    if (existingId && touched.status && isCancelled_(row, head.map)) {
      var ctx0 = { sheet: sheet, values: values, head: head, map: head.map };
      deleteEvent_(ctx0, row, i, existingId);
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Calendar event deleted and the guests told. Set the row back to Published to rebuild '
        + 'it — the guest list in "Attendees Emails" is kept.', 'EO Calendar', 12);
    }
    return;
  }

  var bad = problems_(row, head.map);
  if (bad.length) {
    if (statusCell) statusCell.setNote('Not ready to publish:\n• ' + bad.join('\n• '));
    rowRange.setBackground('#FBE9E7');
    SpreadsheetApp.getActiveSpreadsheet().toast(bad.join('; '), 'Not ready to publish', 8);
    return;
  }
  if (statusCell) statusCell.clearNote();
  rowRange.setBackground(null);

  if (!iso_(get_(row, head.map, 'start_date'))) return;      // dates to be confirmed
  var eventId = String(get_(row, head.map, 'calendar_event_id') || '').trim();

  if (!eventId && isPast_(row, head.map)) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'This event has already taken place, so no calendar invitation was created.',
      'EO Calendar', 8);
    return;
  }

  // Published, complete, dated, and no event yet: make it now and invite the organisers.
  if (!eventId) {
    var ctx = { sheet: sheet, values: values, head: head, map: head.map };
    var made = createEvent_(ctx, row, i);
    if (made) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Calendar event created and the organisers invited.', 'EO Calendar', 6);
    }
    return;
  }

  // It already exists. A change to when it happens is queued rather than sent, so a person
  // editing a date, then a start time, then an end time moves the event once, not three times.
  if (touched.invite_subscribers) {
    if (checked_(get_(row, head.map, 'invite_subscribers'))) {
      if (String(get_(row, head.map, 'subscribers_invited') || '').trim()) {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          'Subscribers were already invited to this event. Nobody is invited twice.',
          'EO Calendar', 8);
      } else {
        var map = pendingInvites_();
        map[eventId] = Date.now();
        savePendingInvites_(map);
        SpreadsheetApp.getActiveSpreadsheet().toast(
          'Every subscriber will be invited in about ' + Math.round(QUIET_MS / 60000)
          + ' minutes. Untick the box before then to stop it.', 'EO Calendar', 12);
      }
    } else {
      var map2 = pendingInvites_();
      if (map2[eventId]) {
        delete map2[eventId];
        savePendingInvites_(map2);
        SpreadsheetApp.getActiveSpreadsheet().toast('Cancelled — nobody was invited.',
          'EO Calendar', 8);
      }
    }
  }

  var wantsWhen = false;
  for (var w = 0; w < WATCHED.length; w++) if (touched[WATCHED[w]]) wantsWhen = true;
  if (!wantsWhen) return;

  markPending_(eventId);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'The calendar event will be updated in about ' + Math.round(QUIET_MS / 60000)
    + ' minutes, once you have finished editing.', 'EO Calendar', 6);
}

/**
 * Creates, updates and cancels calendar events for the published rows.
 *
 * Idempotent on purpose, which is also the answer to "how does a to-be-confirmed event get
 * its entry once a date is set?" — it does not need a hook. The row is skipped while it has no
 * date, and the next run picks it up. Hourly by default; "Sync now" for immediately.
 */
function syncNow() {
  var ctx = open_();
  if (!ctx) return;
  ensureColumns_(ctx.sheet, ctx.head,
    ['Calendar Event ID', 'Calendar Link', 'Meeting Link', 'Attendees Emails', 'Attendees',
     'Invite Subscribers?', 'Subscribers Invited At']);
  ctx = open_();                                     // re-read: columns may have been added

  var created = 0, updated = 0, cancelled = 0, revived = 0, unflagged = 0, deleted = 0;
  var skipped = [], failed = [];

  eachRow_(ctx, function (row, i) {
    var col = ctx.map;

    // Clear a flag the row no longer deserves. A note and a red background are written at the
    // moment somebody marks a row Published, and they stay until that row is edited again —
    // so when a rule changes, every row still wears the verdict of the OLD rule and there is
    // nothing a person can do about it except retype a cell. The sweep takes them off.
    if (clearFlagIfClean_(ctx, row, i)) unflagged++;
    var eventId = String(get_(row, col, 'calendar_event_id') || '').trim();
    var published = isPublished_(row, col);

    if (!published) {
      if (!eventId) return;
      if (isCancelled_(row, col)) {
        // Not happening. Remove it from everybody's calendar and forget the id.
        if (deleteEvent_(ctx, row, i, eventId)) deleted++;
      } else {
        // Draft: cancel it but KEEP the id, or re-publishing would build a SECOND event and
        // leave everybody already invited on the first — which they were told was cancelled.
        if (setStatus_(eventId, 'cancelled')) cancelled++;
      }
      return;
    }

    var bad = problems_(row, col);
    if (bad.length) { skipped.push('Row ' + (i + 1) + ': ' + bad.join('; ')); return; }

    // Published with no date yet. Legitimate; there is simply nothing to put in a calendar.
    if (!iso_(get_(row, col, 'start_date'))) {
      skipped.push('Row ' + (i + 1) + ': no date yet — will be created when one is set');
      return;
    }

    // Already happened and never had an event. Leave it alone: creating one now would invite
    // everybody to something that is over.
    if (!eventId && isPast_(row, col)) {
      skipped.push('Row ' + (i + 1) + ': already took place — no calendar entry created');
      return;
    }

    var title = String(get_(row, col, 'title')).trim();
    var when = times_(row, col);

    if (eventId) {
      var existing = fetch_(eventId);
      if (existing) {
        writeAttendees_(ctx, i, existing);
        if (existing.status === 'cancelled') revived++;
        // Quietly: the sweep is catching up, not announcing anything.
        else if (applyUpdate_(ctx, row, eventId, { notify: false })) updated++;
        if (existing.status === 'cancelled') applyUpdate_(ctx, row, eventId, { notify: true });
        return;
      }
      // The id points at nothing — deleted in Google, or the wrong calendar. Rebuild rather
      // than failing forever on a stale id.
      failed.push('Row ' + (i + 1) + ': the saved event was gone; a new one was created');
    }

    var made = createEvent_(ctx, row, i);
    if (made) { created++; writeAttendees_(ctx, i, made); }
    else failed.push('Row ' + (i + 1) + ': the event could not be created');
  });

  var summary = 'Created ' + created + ', updated ' + updated
    + (revived ? ', restored ' + revived : '') + ', cancelled ' + cancelled
    + (deleted ? ', deleted ' + deleted : '') + '.'
    + (unflagged ? '\nCleared ' + unflagged + ' stale "not ready" flag(s).' : '');
  if (skipped.length) summary += '\n\nNot in the calendar yet:\n' + skipped.join('\n');
  if (failed.length) summary += '\n\nProblems:\n' + failed.join('\n');
  tell_(summary);
}

/* ------------------------------------------------------- the quiet-period queue */

function pending_() {
  try { return JSON.parse(
    PropertiesService.getScriptProperties().getProperty(PENDING_KEY) || '{}'); }
  catch (e) { return {}; }
}

function savePending_(map) {
  PropertiesService.getScriptProperties().setProperty(PENDING_KEY, JSON.stringify(map));
}

/**
 * Restarts the clock for one event. Keyed by the calendar event id rather than the row number,
 * because sorting the sheet moves rows and would otherwise update the wrong event.
 */
function markPending_(eventId) {
  var map = pending_();
  map[eventId] = Date.now();
  savePending_(map);
}

/**
 * Runs every few minutes and pushes only the rows that have been quiet for QUIET_MS. Anything
 * touched more recently is left for the next pass.
 */
function flushPending() {
  var map = pending_();
  var ids = Object.keys(map);
  if (!ids.length) return;                            // the common case: cost almost nothing

  var due = ids.filter(function (id) { return Date.now() - map[id] >= QUIET_MS; });
  if (!due.length) return;

  var ctx = open_();
  if (!ctx) return;

  var applied = 0;
  due.forEach(function (id) {
    delete map[id];
    var found = null;
    eachRow_(ctx, function (row, i) {
      if (String(get_(row, ctx.map, 'calendar_event_id') || '').trim() === id) found = row;
    });
    if (!found || !isPublished_(found, ctx.map)) return;
    if (problems_(found, ctx.map).length) return;
    if (!iso_(get_(found, ctx.map, 'start_date'))) return;
    // Correcting a past event would notify every guest about something that is over.
    if (isPast_(found, ctx.map)) return;

    if (applyUpdate_(ctx, found, foundIndex, id, { notify: true })) applied++;
  });
  savePending_(map);
  if (applied) Logger.log('Applied ' + applied + ' deferred update(s).');
}

/* -------------------------------------------------------------- subscriptions */

/** Creates the subscriptions tab, with the Unsubscribed column as a real checkbox. */
function setUpSubscriptions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName(SUBS_TAB);
  if (!tab) {
    tab = ss.insertSheet(SUBS_TAB);
    tab.getRange(1, 1, 1, SUBS_COLUMNS.length).setValues([SUBS_COLUMNS]).setFontWeight('bold');
    tab.setFrozenRows(1);
    tab.getRange('D2:D').insertCheckboxes();
    tab.getRange('E:E').setNote('Written by the site. Do not edit — it is what makes an '
      + 'unsubscribe link work.');
    tab.setColumnWidth(1, 240); tab.setColumnWidth(3, 200);
  }
  tell_('"' + SUBS_TAB + '" is ready.\n\nAnyone whose Unsubscribed box is NOT ticked will be '
    + 'invited when you tick "Invite subscribers?" on an event.');
}

/** Everyone still subscribed. Reading the tab directly, so it works with no site involved. */
function subscribers_() {
  var tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBS_TAB);
  if (!tab) return [];
  var values = tab.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  var iEmail = head.indexOf('email');
  var iName = head.indexOf('full name');
  var iOff = head.indexOf('unsubscribed');
  if (iEmail < 0) return [];

  var out = [];
  for (var i = 1; i < values.length; i++) {
    var email = String(values[i][iEmail] || '').trim();
    if (email.indexOf('@') < 1) continue;
    var off = iOff < 0 ? false : values[i][iOff];
    if (off === true || String(off).trim().toLowerCase() === 'true') continue;
    out.push({ email: email, name: iName < 0 ? '' : String(values[i][iName] || '').trim() });
  }
  return out;
}

/**
 * Adds every current subscriber to one event, five minutes after the box was ticked.
 *
 * Appends. Anyone already on the event — the default guests, anybody who asked through the
 * site — stays exactly as they are, with the reply they already gave.
 */
function inviteSubscribers_(ctx, row, i, eventId) {
  var event = fetch_(eventId);
  if (!event) return 0;

  var already = {};
  (event.attendees || []).forEach(function (a) {
    if (a.email) already[String(a.email).toLowerCase()] = true;
  });

  var adding = subscribers_().filter(function (s) { return !already[s.email.toLowerCase()]; });
  if (!adding.length) return 0;

  var attendees = (event.attendees || []).slice();
  adding.forEach(function (s) {
    // The name is passed so Google shows a person rather than an address on the guest list.
    var entry = { email: s.email, responseStatus: 'needsAction' };
    if (s.name) entry.displayName = s.name;
    attendees.push(entry);
  });

  var updated;
  try {
    updated = Calendar.Events.patch({ attendees: attendees, guestsCanSeeOtherGuests: false,
                                      guestsCanInviteOthers: false },
                                    calendarId_(), eventId, { sendUpdates: 'all' });
  } catch (e) {
    Logger.log('Inviting subscribers failed for ' + eventId + ': ' + e.message);
    return 0;
  }

  // Refresh the two guest-list columns straight away. They were only written by the hourly
  // sweep, so the sheet showed a stale list for up to an hour after somebody watched the
  // invitations go out — which reads as the invite having failed.
  writeAttendees_(ctx, i, updated || fetch_(eventId));

  var head = findHeaderRow_(ctx.sheet.getDataRange().getValues());
  if (head && head.map.subscribers_invited !== undefined) {
    ctx.sheet.getRange(i + 1, head.map.subscribers_invited + 1)
      .setValue(new Date().toISOString());
  }
  return adding.length;
}

/** Ticked boxes waiting out their five minutes. */
function pendingInvites_() {
  try { return JSON.parse(
    PropertiesService.getScriptProperties().getProperty(INVITE_KEY) || '{}'); }
  catch (e) { return {}; }
}
function savePendingInvites_(map) {
  PropertiesService.getScriptProperties().setProperty(INVITE_KEY, JSON.stringify(map));
}

/**
 * Acts on ticks that have survived five minutes, and forgets ones that were unticked.
 * Called from the same five-minute trigger that drains date changes.
 */
function flushInvites() {
  var map = pendingInvites_();
  var ids = Object.keys(map);
  if (!ids.length) return;

  var ctx = open_();
  if (!ctx) return;
  var invited = 0, sentFor = [];

  ids.forEach(function (id) {
    if (Date.now() - map[id] < QUIET_MS) return;      // still inside the grace period
    delete map[id];

    var found = null, foundIndex = -1;
    eachRow_(ctx, function (row, i) {
      if (String(get_(row, ctx.map, 'calendar_event_id') || '').trim() === id) {
        found = row; foundIndex = i;
      }
    });
    if (!found) return;

    // Unticked during the five minutes, or already done: do nothing. This is the guard.
    if (!checked_(get_(found, ctx.map, 'invite_subscribers'))) return;
    if (String(get_(found, ctx.map, 'subscribers_invited') || '').trim()) return;
    if (isPast_(found, ctx.map)) return;             // nobody is invited to a finished event

    var n = inviteSubscribers_(ctx, found, foundIndex, id);
    if (n) { invited += n; sentFor.push(String(get_(found, ctx.map, 'title')).trim()); }
  });

  savePendingInvites_(map);
  if (invited) {
    Logger.log('Invited ' + invited + ' subscriber(s) to: ' + sentFor.join(', '));
    try { SpreadsheetApp.getActiveSpreadsheet().toast(
      'Invited ' + invited + ' subscriber(s) to ' + sentFor.join(', '), 'EO Calendar', 10);
    } catch (e) {}
  }
}

/**
 * Has this already happened?
 *
 * Nothing is CREATED for a past event, and no change to one is pushed. Creating it would mail
 * every organiser and every subscriber an invitation to something that is over, and there is
 * no unsend. A row with no date has not happened — "to be confirmed" is a future state.
 */
function isPast_(row, col) {
  var start = iso_(get_(row, col, 'start_date'));
  if (!start) return false;
  var end = iso_(get_(row, col, 'end_date')) || start;
  return end < today_();
}

function today_() {
  return Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
}

function checked_(v) {
  return v === true || ['true', 'yes', 'y', '1', '✓'].indexOf(
    String(v || '').trim().toLowerCase()) >= 0;
}

/* ------------------------------------------------------------------ attendees */

/**
 * Who is coming, written back into the sheet so the chapter can see it without opening
 * Calendar — and so it can be counted, filtered and exported like anything else in a sheet.
 *
 * On the NAMES. Google gives an attendee's `displayName` only when somebody typed one or when
 * the person is in the same Workspace directory. A personal gmail address usually arrives with
 * no name at all, and there is no API that turns an address into a real name. So the name is
 * shown when Google supplies it and the address stands alone when it does not. Inventing one
 * from the address — "maxpundyk" — would look like data and be a guess.
 *
 * This column holds personal addresses. It is internal: lib/normalize.mjs never publishes it.
 */
function attendeeLines_(event) {
  var list = (event && event.attendees) || [];
  var STATUS = { accepted: 'yes', declined: 'no', tentative: 'maybe', needsAction: 'invited' };
  return list
    .filter(function (a) { return a.email && !a.resource && !a.self; })
    .map(function (a) {
      var name = String(a.displayName || '').trim();
      var who = name ? name + ' <' + a.email + '>' : a.email;
      return who + ' · ' + (STATUS[a.responseStatus] || 'invited');
    })
    .sort()
    .join('\n');
}

/**
 * Just the addresses, comma separated.
 *
 * This one is the recovery copy. If an event is deleted in Google and the script rebuilds it,
 * the guest list is gone with it — Google keeps no record on our side. This column is that
 * record, and createEvent_() reads it back, so nobody has to be asked to re-register. It is
 * also the format that pastes straight into Google Calendar's "Add guests" field by hand.
 */
function attendeeEmails_(event) {
  return ((event && event.attendees) || [])
    .filter(function (a) { return a.email && !a.resource && !a.self; })
    .map(function (a) { return String(a.email).toLowerCase(); })
    .sort()
    .join(', ');
}

/** Writes only when a value has actually changed, so a quiet hour costs no writes at all. */
function writeAttendees_(ctx, rowIndex, event) {
  var head = findHeaderRow_(ctx.sheet.getDataRange().getValues());
  if (!head) return;

  if (head.map.attendees !== undefined) {
    var rich = ctx.sheet.getRange(rowIndex + 1, head.map.attendees + 1);
    var lines = attendeeLines_(event);
    if (String(rich.getValue() || '').trim() !== lines.trim()) {
      rich.setValue(lines);
      rich.setNote(lines ? lines.split('\n').length + ' guest(s), as of '
                           + new Date().toUTCString() : '');
    }
  }

  if (head.map.attendees_emails !== undefined) {
    var flat = ctx.sheet.getRange(rowIndex + 1, head.map.attendees_emails + 1);
    var emails = attendeeEmails_(event);
    // Never blank a list that has content. An event that momentarily reads back with no
    // attendees would otherwise wipe the only copy of who was coming.
    if (emails && String(flat.getValue() || '').trim() !== emails) flat.setValue(emails);
  }
}

/** Addresses previously recorded for this row, for rebuilding a lost event. */
function recordedEmails_(row, col) {
  return String(get_(row, col, 'attendees_emails') || '')
    .split(/[,;\n]/)
    .map(function (x) { return x.trim().toLowerCase(); })
    .filter(function (x) { return x.indexOf('@') > 0; });
}

/**
 * Re-reads the guest list for every row that has an event, without touching the events.
 *
 * Also the way to catch up after somebody joins through the website: /api/attend adds them to
 * the calendar directly and cannot write to this sheet, so those arrive on the next sweep.
 */
function refreshAttendees() {
  var ctx = open_();
  if (!ctx) return;
  ensureColumns_(ctx.sheet, ctx.head, ['Attendees Emails', 'Attendees']);
  ctx = open_();
  var seen = 0, total = 0;
  eachRow_(ctx, function (row, i) {
    var id = String(get_(row, ctx.map, 'calendar_event_id') || '').trim();
    if (!id) return;
    var event = fetch_(id);
    if (!event) return;
    writeAttendees_(ctx, i, event);
    seen++;
    total += ((event.attendees || []).filter(function (a) {
      return a.email && !a.resource && !a.self; })).length;
  });
  tell_('Read the guest list for ' + seen + ' event(s) — ' + total + ' guest(s) in total.');
}

/**
 * Reconciles one row with its event, in BOTH directions.
 *
 * The rule, applied per field: the script remembers a fingerprint of exactly what it last
 * wrote. If the event still holds that, nobody has touched it in Google Calendar and the sheet
 * is the authority. If it holds something else, somebody edited it there — and that edit is
 * written back INTO the sheet rather than being overwritten.
 *
 * So whoever changed a thing last owns it, and neither side silently undoes the other.
 *
 * `notify` sends the change to the guests. True for a real edit; false for the hourly sweep,
 * which is catching up rather than announcing.
 */
function applyUpdate_(ctx, row, i, id, options) {
  var existing = fetch_(id);
  if (!existing) return false;

  var patch = {};
  var pulled = [], kept = [];
  if (existing.status === 'cancelled') patch.status = 'confirmed';

  // --- title -------------------------------------------------------------
  var sheetTitle = String(get_(row, ctx.map, 'title') || '').trim();
  var eventTitle = String(existing.summary || '').trim();
  if (mayReplace_(id, 't', eventTitle)) {
    if (eventTitle !== sheetTitle) patch.summary = sheetTitle;
  } else if (eventTitle && eventTitle !== sheetTitle) {
    writeCell_(ctx, i, 'title', eventTitle);
    pulled.push('title');
  }

  // --- when --------------------------------------------------------------
  var when = times_(row, ctx.map);
  if (mayReplace_(id, 'w', whenKey_(existing))) {
    if (!sameWhen_(existing, when)) { patch.start = when.start; patch.end = when.end; }
  } else if (!sameWhen_(existing, when)) {
    writeWhenBack_(ctx, i, existing);
    pulled.push('dates');
  }

  // --- description and location ------------------------------------------
  var description = description_(row, ctx.map);
  var location = String(get_(row, ctx.map, 'venue') || get_(row, ctx.map, 'location') || '');

  if (mayReplace_(id, 'd', existing.description)) {
    if (fingerprint_(existing.description) !== fingerprint_(description)) {
      patch.description = description;
    }
  } else if (fingerprint_(existing.description) !== fingerprint_(description)) {
    kept.push('description');
  }

  if (mayReplace_(id, 'l', existing.location)) {
    if (String(existing.location || '') !== location) patch.location = location;
  } else if (String(existing.location || '') !== location) {
    kept.push('location');
  }

  // The joining link is only ever the calendar's: Google Meet is added there, never here.
  writeMeetingLink_(ctx, i, existing);

  if (pulled.length) {
    Logger.log('Took the ' + pulled.join(' and ') + ' back from the calendar for "'
      + (patch.summary || eventTitle) + '".');
  }
  if (kept.length) {
    Logger.log('Kept the hand-edited ' + kept.join(' and ') + ' on "' + eventTitle + '".');
  }

  var hasChange = false;
  for (var k in patch) { hasChange = true; break; }
  if (!hasChange) {
    // Nothing to send, but record what the event holds now, or the next pass reads the same
    // difference as a fresh hand-edit for ever.
    rememberWritten_(id, { t: eventTitle, w: whenKey_(existing),
                           d: existing.description, l: existing.location });
    return false;
  }

  try {
    Calendar.Events.patch(patch, calendarId_(), id,
      { sendUpdates: options && options.notify ? 'all' : 'none' });
    var after = fetch_(id) || existing;
    rememberWritten_(id, { t: after.summary, w: whenKey_(after),
                           d: after.description, l: after.location });
    return true;
  } catch (e) {
    Logger.log('Update failed for ' + id + ': ' + e.message);
    return false;
  }
}

/** One string standing for when the event happens, for comparison and fingerprinting. */
function whenKey_(event) {
  var a = (event.start || {}), b = (event.end || {});
  return String(a.date || a.dateTime || '').slice(0, 16) + '/'
       + String(b.date || b.dateTime || '').slice(0, 16);
}

function writeCell_(ctx, i, field, value) {
  var head = findHeaderRow_(ctx.sheet.getDataRange().getValues());
  if (!head || head.map[field] === undefined) return;
  ctx.sheet.getRange(i + 1, head.map[field] + 1).setValue(value);
}

/**
 * Writes an event's dates and times back into the sheet's own columns.
 *
 * An all-day DTEND is exclusive, so the sheet's End Date is the day BEFORE it — the same
 * conversion as on the way out, in reverse.
 */
function writeWhenBack_(ctx, i, event) {
  var start = event.start || {}, end = event.end || {};
  if (start.date) {
    writeCell_(ctx, i, 'start_date', start.date);
    var last = end.date ? previousDay_(end.date) : start.date;
    writeCell_(ctx, i, 'end_date', last === start.date ? '' : last);
    writeCell_(ctx, i, 'start_time', '');
    writeCell_(ctx, i, 'end_time', '');
    return;
  }
  var zone = start.timeZone || Session.getScriptTimeZone();
  var from = new Date(start.dateTime), to = new Date(end.dateTime || start.dateTime);
  writeCell_(ctx, i, 'start_date', Utilities.formatDate(from, zone, 'yyyy-MM-dd'));
  var endDay = Utilities.formatDate(to, zone, 'yyyy-MM-dd');
  writeCell_(ctx, i, 'end_date',
    endDay === Utilities.formatDate(from, zone, 'yyyy-MM-dd') ? '' : endDay);
  writeCell_(ctx, i, 'start_time', Utilities.formatDate(from, zone, 'HH:mm'));
  writeCell_(ctx, i, 'end_time', Utilities.formatDate(to, zone, 'HH:mm'));
}

function previousDay_(iso) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] - 1));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

/**
 * The Meet or conferencing link, from the calendar into the sheet.
 *
 * One direction only. Conferencing is attached in Google Calendar and cannot be created by
 * writing a URL, so the sheet is a mirror of it and never a source.
 */
function writeMeetingLink_(ctx, i, event) {
  var link = event.hangoutLink || '';
  if (!link && event.conferenceData && event.conferenceData.entryPoints) {
    event.conferenceData.entryPoints.forEach(function (p) {
      if (!link && p.entryPointType === 'video' && p.uri) link = p.uri;
    });
  }
  if (!link) return;                                 // never blank one that is already there
  var head = findHeaderRow_(ctx.sheet.getDataRange().getValues());
  if (!head || head.map.meeting_link === undefined) return;
  var cell = ctx.sheet.getRange(i + 1, head.map.meeting_link + 1);
  if (String(cell.getValue() || '').trim() !== link) cell.setValue(link);
}

/** Google returns dates and dateTimes in its own shapes; compare what we would send. */
function sameWhen_(existing, when) {
  var a = existing.start || {}, b = existing.end || {};
  return String(a.date || a.dateTime || '').slice(0, 16)
           === String(when.start.date || when.start.dateTime || '').slice(0, 16)
      && String(b.date || b.dateTime || '').slice(0, 16)
           === String(when.end.date || when.end.dateTime || '').slice(0, 16);
}

/* --------------------------------------------------------------- calendar io */

/**
 * Creates the event and puts the organisers on it. Returns the created event, or null.
 * Used by both the on-edit path and the hourly sync, so a row cannot get two different
 * treatments depending on which noticed it first.
 */
function createEvent_(ctx, row, i) {
  var when = times_(row, ctx.map);
  var body = {
    summary: String(get_(row, ctx.map, 'title')).trim(),
    description: description_(row, ctx.map),
    location: String(get_(row, ctx.map, 'venue') || get_(row, ctx.map, 'location') || ''),
    start: when.start,
    end: when.end,
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false
  };
  // The organisers, plus anybody this row remembers from an event that no longer exists.
  var guests = defaultGuests_();
  var seen = {};
  guests.forEach(function (g) { seen[g.email.toLowerCase()] = true; });
  recordedEmails_(row, ctx.map).forEach(function (email) {
    if (seen[email]) return;
    seen[email] = true;
    guests.push({ email: email, responseStatus: 'needsAction' });
  });
  if (guests.length) body.attendees = guests;

  try {
    var made = Calendar.Events.insert(body, calendarId_(),
      guests.length ? { sendUpdates: 'all' } : {});
    write_(ctx.sheet, ctx.head, ctx.map, i, made.id, made.htmlLink);
    rememberWritten_(made.id, { d: body.description, l: body.location,
      t: body.summary, w: whenKey_(made) });
    writeMeetingLink_(ctx, i, made);
    return made;
  } catch (e) {
    Logger.log('Row ' + (i + 1) + ': ' + e.message);
    return null;
  }
}

function fetch_(eventId) {
  try { return Calendar.Events.get(calendarId_(), eventId); }
  catch (e) { return null; }                          // 404, or a different calendar
}

/**
 * Removes the event and clears the two columns that pointed at it.
 *
 * Guests are notified, because it was in their calendars and they are entitled to know it is
 * off. `Attendees Emails` is deliberately left alone: it is the only record of who was coming,
 * and it is what lets the row be rebuilt if the cancellation was a mistake.
 */
function deleteEvent_(ctx, row, i, eventId) {
  try {
    Calendar.Events.remove(calendarId_(), eventId, { sendUpdates: 'all' });
  } catch (e) {
    // Already gone in Google. Clearing the columns is still the right end state.
    Logger.log('Delete failed for ' + eventId + ' (clearing anyway): ' + e.message);
  }
  var head = findHeaderRow_(ctx.sheet.getDataRange().getValues());
  if (head) {
    if (head.map.calendar_event_id !== undefined) {
      ctx.sheet.getRange(i + 1, head.map.calendar_event_id + 1).setValue('');
    }
    if (head.map.calendar_link !== undefined) {
      ctx.sheet.getRange(i + 1, head.map.calendar_link + 1).setValue('');
    }
    // The tick would otherwise fire again the moment a new event is created for this row.
    if (head.map.subscribers_invited !== undefined) {
      ctx.sheet.getRange(i + 1, head.map.subscribers_invited + 1).setValue('');
    }
  }
  return true;
}

function setStatus_(eventId, status) {
  var existing = fetch_(eventId);
  if (!existing || existing.status === status) return false;
  try { Calendar.Events.patch({ status: status }, calendarId_(), eventId); return true; }
  catch (e) { Logger.log('Status change failed: ' + e.message); return false; }
}

/**
 * Removes the "not ready" note and the red background from a row that is fine now.
 * Returns whether anything was actually cleared, so a clean sheet costs no writes.
 */
function clearFlagIfClean_(ctx, row, i) {
  if (ctx.map.status === undefined) return false;
  if (isPublished_(row, ctx.map) && problems_(row, ctx.map).length) return false;

  var cell = ctx.sheet.getRange(i + 1, ctx.map.status + 1);
  var hadNote = !!cell.getNote();
  var range = ctx.sheet.getRange(i + 1, 1, 1, Math.max(1, ctx.sheet.getLastColumn()));
  var hadColour = range.getBackground() !== '#ffffff';

  if (!hadNote && !hadColour) return false;
  if (hadNote) cell.clearNote();
  if (hadColour) range.setBackground(null);
  return true;
}

/* ------------------------------------------------------------------ sheet io */

function open_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('EventCalendar') || ss.getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var head = findHeaderRow_(values);
  if (!head) { tell_('No header row found — nothing was done.'); return null; }
  return { sheet: sheet, values: values, head: head, map: head.map };
}

function eachRow_(ctx, fn) {
  for (var i = ctx.head.index + 1; i < ctx.values.length; i++) {
    if (String(get_(ctx.values[i], ctx.map, 'title') || '').trim()) fn(ctx.values[i], i);
  }
}

/**
 * Cancelled means it is not happening. Draft means it is not ready YET — a difference the
 * calendar has to respect, because the two need opposite treatment:
 *
 *   Draft      the event is cancelled in Google but the id is KEPT, so re-publishing brings
 *              the same event back with everybody still on it
 *   Cancelled  the event is DELETED and the id and link are cleared
 *
 * Deleting is not as final as it sounds: `Attendees Emails` still holds the guest list, so
 * setting the row back to Published rebuilds the event and re-invites the same people.
 */
function isCancelled_(row, col) {
  if (col.status === undefined) return false;
  return String(get_(row, col, 'status') || '').trim().toLowerCase() === 'cancelled';
}

function isPublished_(row, col) {
  if (col.status === undefined) return true;          // no Status column: everything publishes
  return String(get_(row, col, 'status') || '').trim().toLowerCase() === 'published';
}

/* ------------------------------------------------------------------ helpers */

var HEADERS = {
  status: ['status'], type: ['type'], title: ['title', 'name'],
  start_date: ['start date'], end_date: ['end date'],
  start_time: ['start time'], end_time: ['end time'], timezone: ['timezone'],
  location: ['location', 'place'], venue: ['venue'],
  date_note: ['date note'], summary: ['summary'], description: ['description'],
  highlights: ['highlights'], who_for: ['who for'],
  speaker_name: ['speaker name'], speaker_title: ['speaker title'],
  registration_url: ['registration url'],
  calendar_event_id: ['calendar event id'], calendar_link: ['calendar link'],
  attendees: ['attendees', 'participants', 'guest list'],
  attendees_emails: ['attendees emails', 'attendee emails', 'attendees email'],
  meeting_link: ['meeting link', 'video link', 'join link'],
  invite_subscribers: ['invite subscribers?', 'invite subscribers'],
  subscribers_invited: ['subscribers invited at', 'subscribers invited']
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

/**
 * The invitation body.
 *
 * Written to be read in a Google Calendar notification email, where there is no styling worth
 * relying on and the reader is deciding in about four seconds. So: the reason first, then the
 * facts, then the action.
 *
 * The date, time and place are repeated here even though the event carries them in its own
 * fields. That is deliberate — a forwarded invitation, a notification on a watch, a text-only
 * mail client: all of them can show the description with none of the chrome around it.
 *
 * Plain text, not HTML. Calendar clients render description HTML inconsistently and the
 * organiser edits this by hand afterwards; markup she did not write would be in her way.
 */
function description_(row, col) {
  var out = [];
  var site = siteUrl_();

  var summary = String(get_(row, col, 'summary') || '').trim();
  if (summary) out.push(summary, '');

  out.push('WHEN');
  out.push(whenLines_(row, col).join('\n'), '');

  var where = whereLine_(row, col);
  if (where) out.push('WHERE', where, '');

  var speaker = String(get_(row, col, 'speaker_name') || '').trim();
  if (speaker) {
    var title = String(get_(row, col, 'speaker_title') || '').trim();
    out.push('SPEAKER', speaker + (title ? ' — ' + title : ''), '');
  }

  var highlights = String(get_(row, col, 'highlights') || '').trim();
  if (highlights) {
    var lines = highlights.split(/\r?\n/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l; })
      .map(function (l) { return '• ' + l; });
    if (lines.length) out.push('WHAT YOU GET OUT OF IT', lines.join('\n'), '');
  }

  var whoFor = String(get_(row, col, 'who_for') || '').trim();
  if (whoFor) out.push('WHO IT IS FOR', whoFor, '');

  var reg = String(get_(row, col, 'registration_url') || '').trim();
  if (reg) out.push('REGISTER', reg, '');

  if (site) {
    var slug = slugify_(String(get_(row, col, 'title') || ''));
    var start = iso_(get_(row, col, 'start_date'));
    out.push('Full details: ' + site + '/#/event/' + slug + (start ? '-' + start : ''), '');
  }

  if (site) {
    out.push('—');
    out.push('Invited because you subscribed to EO Ukraine events? Stop receiving them: '
      + site + '/#/unsubscribe');
  }
  out.push('—', 'Created from the EO events sheet. Edit this freely: the sync only ever '
    + 'corrects the title and the times, and will not overwrite what you write here.');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** "Wednesday, 16 September 2026" / "15:30 – 17:00 CET (1 hour 30 minutes)" */
function whenLines_(row, col) {
  var start = iso_(get_(row, col, 'start_date'));
  if (!start) {
    var note = String(get_(row, col, 'date_note') || '').trim();
    return [note || 'To be confirmed'];
  }
  var end = iso_(get_(row, col, 'end_date')) || start;
  var lines = [];

  if (end !== start) {
    lines.push(longDate_(start) + '  to  ' + longDate_(end));
    lines.push(daysBetween_(start, end) + ' days');
  } else {
    lines.push(longDate_(start));
  }

  var t1 = String(get_(row, col, 'start_time') || '').trim();
  if (t1) {
    var zone = String(get_(row, col, 'timezone') || 'CET').trim();
    var t2 = String(get_(row, col, 'end_time') || '').trim();
    var line = t2 ? pad_(t1) + ' – ' + pad_(t2) + ' ' + zone : pad_(t1) + ' ' + zone;
    var mins = t2 ? minutesBetween_(t1, t2) : 0;
    if (mins > 0) line += ' (' + durationLabel_(mins) + ')';
    lines.push(line);
  }
  return lines;
}

function whereLine_(row, col) {
  var location = String(get_(row, col, 'location') || '').trim();
  var venue = String(get_(row, col, 'venue') || '').trim();
  if (location.toLowerCase() === 'online') {
    return 'Online' + (venue && venue.toLowerCase() !== 'online' ? ' — ' + venue : '');
  }
  if (venue && location) return venue + ', ' + location;
  return venue || location || '';
}

function longDate_(iso) {
  var p = iso.split('-');
  return Utilities.formatDate(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])), 'UTC',
    'EEEE, d MMMM yyyy');
}

function daysBetween_(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2])
    - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000) + 1;
}

function minutesBetween_(t1, t2) {
  var a = t1.split(':'), b = t2.split(':');
  var m = ((+b[0]) * 60 + (+b[1] || 0)) - ((+a[0]) * 60 + (+a[1] || 0));
  return m < 0 ? m + 1440 : m;                      // an evening event running past midnight
}

function durationLabel_(mins) {
  var h = Math.floor(mins / 60), m = mins % 60;
  var parts = [];
  if (h) parts.push(h + (h === 1 ? ' hour' : ' hours'));
  if (m) parts.push(m + ' minutes');
  return parts.join(' ');
}

function slugify_(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Cancelled rather than deleted: guests are told instead of the event vanishing. */
function cancel_(eventId) {
  try { Calendar.Events.patch({ status: 'cancelled' }, calendarId_(), eventId); }
  catch (e) { log_('Cancel failed: ' + e.message); }
}

function log_(message) {
  Logger.log(message);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(message, 'EO Calendar', 8); } catch (e) {}
}
