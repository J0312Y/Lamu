'use strict';

// Google Calendar integration — read & write operations
// Requires OAuth2 access token with calendar scope (not calendar.readonly)

async function gcal(token, path, opts = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) { const e = await r.text(); throw new Error(`Google Calendar ${r.status}: ${e}`); }
  if (r.status === 204) return {};
  return r.json();
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'gcal_list_events',
      description: 'List upcoming Google Calendar events.',
      parameters: { type: 'object', properties: {
        calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
        max_results: { type: 'integer', description: 'Max events (default 10)' },
        time_min:    { type: 'string', description: 'Start time ISO 8601 (default: now)' },
        time_max:    { type: 'string', description: 'End time ISO 8601' },
        query:       { type: 'string', description: 'Free text search' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'gcal_create_event',
      description: 'Create a new Google Calendar event. Can schedule meetings, reminders, deadlines.',
      parameters: { type: 'object', properties: {
        summary:     { type: 'string', description: 'Event title' },
        description: { type: 'string', description: 'Event description' },
        start:       { type: 'string', description: 'Start time ISO 8601 (e.g. 2026-06-10T14:00:00+02:00)' },
        end:         { type: 'string', description: 'End time ISO 8601. If omitted, defaults to start + 1 hour.' },
        location:    { type: 'string', description: 'Event location or meeting link' },
        attendees:   { type: 'array', items: { type: 'string' }, description: 'List of attendee emails' },
        all_day:     { type: 'boolean', description: 'True for all-day event (use date instead of dateTime)' },
        reminder_minutes: { type: 'integer', description: 'Popup reminder N minutes before (default 15)' },
        recurrence:  { type: 'string', description: 'RRULE string for recurring events (e.g. RRULE:FREQ=WEEKLY;COUNT=10)' },
        conference:  { type: 'boolean', description: 'Auto-create Google Meet link' },
      }, required: ['summary', 'start'] }
    }
  },
  {
    type: 'function', function: {
      name: 'gcal_update_event',
      description: 'Update an existing Google Calendar event.',
      parameters: { type: 'object', properties: {
        event_id:    { type: 'string', description: 'Event ID to update' },
        summary:     { type: 'string' },
        description: { type: 'string' },
        start:       { type: 'string' },
        end:         { type: 'string' },
        location:    { type: 'string' },
        attendees:   { type: 'array', items: { type: 'string' } },
      }, required: ['event_id'] }
    }
  },
  {
    type: 'function', function: {
      name: 'gcal_delete_event',
      description: 'Delete a Google Calendar event.',
      parameters: { type: 'object', properties: {
        event_id: { type: 'string', description: 'Event ID to delete' },
      }, required: ['event_id'] }
    }
  },
  {
    type: 'function', function: {
      name: 'gcal_find_free_slots',
      description: 'Find free time slots in the calendar for scheduling. Returns available windows between existing events.',
      parameters: { type: 'object', properties: {
        date:     { type: 'string', description: 'Date to check (YYYY-MM-DD). Defaults to today.' },
        duration: { type: 'integer', description: 'Desired slot duration in minutes (default 60)' },
        work_start: { type: 'string', description: 'Work day start time HH:MM (default 09:00)' },
        work_end:   { type: 'string', description: 'Work day end time HH:MM (default 18:00)' },
      }, required: [] }
    }
  },
];

function parseDateTime(dtStr, allDay) {
  if (allDay) return { date: dtStr.split('T')[0] };
  return { dateTime: dtStr, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

function addHours(dtStr, hours) {
  const d = new Date(dtStr);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

async function execute(name, args, { accessToken }) {
  if (!accessToken) return { error: 'Google Calendar not configured. Connect your Google account in admin settings → Intégrations.' };
  const calId = args.calendar_id || 'primary';

  switch (name) {
    case 'gcal_list_events': {
      const params = new URLSearchParams({
        maxResults: String(Math.min(args.max_results || 10, 25)),
        singleEvents: 'true',
        orderBy: 'startTime',
        timeMin: args.time_min || new Date().toISOString(),
      });
      if (args.time_max) params.set('timeMax', args.time_max);
      if (args.query) params.set('q', args.query);
      const data = await gcal(accessToken, `/calendars/${encodeURIComponent(calId)}/events?${params}`);
      return {
        events: (data.items || []).map(e => ({
          id: e.id, summary: e.summary, description: e.description?.slice(0, 200),
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          location: e.location, attendees: e.attendees?.map(a => a.email),
          meet_link: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri,
          status: e.status, url: e.htmlLink,
        }))
      };
    }
    case 'gcal_create_event': {
      const event = {
        summary: args.summary,
        start: parseDateTime(args.start, args.all_day),
        end: parseDateTime(args.end || addHours(args.start, 1), args.all_day),
      };
      if (args.description) event.description = args.description;
      if (args.location) event.location = args.location;
      if (args.attendees?.length) event.attendees = args.attendees.map(e => ({ email: e }));
      if (args.reminder_minutes !== undefined) {
        event.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: args.reminder_minutes }] };
      }
      if (args.recurrence) event.recurrence = [args.recurrence];
      const conferenceParam = args.conference ? '&conferenceDataVersion=1' : '';
      if (args.conference) {
        event.conferenceData = {
          createRequest: { requestId: `lamu-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } }
        };
      }
      const created = await gcal(accessToken, `/calendars/${encodeURIComponent(calId)}/events?sendUpdates=all${conferenceParam}`, {
        method: 'POST', body: JSON.stringify(event),
      });
      return {
        success: true, event_id: created.id, summary: created.summary,
        start: created.start?.dateTime || created.start?.date,
        end: created.end?.dateTime || created.end?.date,
        meet_link: created.hangoutLink || created.conferenceData?.entryPoints?.[0]?.uri,
        url: created.htmlLink,
      };
    }
    case 'gcal_update_event': {
      const existing = await gcal(accessToken, `/calendars/${encodeURIComponent(calId)}/events/${args.event_id}`);
      const patch = { ...existing };
      if (args.summary) patch.summary = args.summary;
      if (args.description) patch.description = args.description;
      if (args.start) patch.start = parseDateTime(args.start, false);
      if (args.end) patch.end = parseDateTime(args.end, false);
      if (args.location) patch.location = args.location;
      if (args.attendees) patch.attendees = args.attendees.map(e => ({ email: e }));
      const updated = await gcal(accessToken, `/calendars/${encodeURIComponent(calId)}/events/${args.event_id}?sendUpdates=all`, {
        method: 'PUT', body: JSON.stringify(patch),
      });
      return { success: true, event_id: updated.id, summary: updated.summary, url: updated.htmlLink };
    }
    case 'gcal_delete_event': {
      await gcal(accessToken, `/calendars/${encodeURIComponent(calId)}/events/${args.event_id}?sendUpdates=all`, { method: 'DELETE' });
      return { success: true, event_id: args.event_id, deleted: true };
    }
    case 'gcal_find_free_slots': {
      const date = args.date || new Date().toISOString().split('T')[0];
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const workStart = args.work_start || '09:00';
      const workEnd = args.work_end || '18:00';
      const duration = (args.duration || 60) * 60 * 1000;

      const timeMin = `${date}T${workStart}:00`;
      const timeMax = `${date}T${workEnd}:00`;

      const data = await gcal(accessToken, `/calendars/${encodeURIComponent(calId)}/events?` + new URLSearchParams({
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        singleEvents: 'true', orderBy: 'startTime', maxResults: '50',
      }));

      const events = (data.items || []).filter(e => e.status !== 'cancelled').map(e => ({
        start: new Date(e.start?.dateTime || `${e.start?.date}T${workStart}:00`).getTime(),
        end: new Date(e.end?.dateTime || `${e.end?.date}T${workEnd}:00`).getTime(),
        summary: e.summary,
      })).sort((a, b) => a.start - b.start);

      const dayStart = new Date(`${date}T${workStart}:00`).getTime();
      const dayEnd = new Date(`${date}T${workEnd}:00`).getTime();
      const slots = [];
      let cursor = dayStart;

      for (const ev of events) {
        if (ev.start > cursor && ev.start - cursor >= duration) {
          slots.push({ start: new Date(cursor).toISOString(), end: new Date(ev.start).toISOString(), minutes: Math.round((ev.start - cursor) / 60000) });
        }
        cursor = Math.max(cursor, ev.end);
      }
      if (dayEnd > cursor && dayEnd - cursor >= duration) {
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(dayEnd).toISOString(), minutes: Math.round((dayEnd - cursor) / 60000) });
      }

      return { date, work_hours: `${workStart}-${workEnd}`, busy_count: events.length, free_slots: slots };
    }
    default: return { error: `Unknown Google Calendar tool: ${name}` };
  }
}

async function testConnection(accessToken) {
  try {
    const data = await gcal(accessToken, '/calendars/primary');
    return { ok: true, calendar: data.summary, timeZone: data.timeZone };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
