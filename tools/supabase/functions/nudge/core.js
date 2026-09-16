// core.js - the evening nudge's arithmetic and words (WIRE HT-29, paste 133 S9). No imports, no I/O:
// index.ts (Deno, on Supabase) does the reading and sending; this file decides WHO is due, WHAT the
// numbers are and HOW the line reads. Tested under Node: `node --test tools/supabase/functions/nudge/`.
//
// The line is Cory's: "12 of 21 · Andrew 9 of 18 · rate the day". Numbers only - a nudge never carries a
// journal word, a task name or a rating. Members see each other's counts because paste 133 Ruling 4 makes
// check-offs group-visible; the sender reads with the service role, so it applies that ruling itself:
// only people who share a circle appear in each other's line.

export const WINDOW_MIN = 15;                 // the scheduler fires every 15 minutes
export const SLOTS = ['noon', 'evening'];

// The person's own clock. Intl is in Deno and Node alike; a bad zone falls back to Chicago, not UTC.
export function localParts(now, tz) {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Chicago', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  } catch (e) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  }
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+hour) * 60 + (+p.minute),
           weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

export function minutesOf(t) {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

// Which slot, if any, is due for this person right now. Never twice a day per slot; never on the Sabbath
// unless they turned it on (paste 133 S9.32).
export function dueSlot(prefs, parts) {
  if (!prefs || !prefs.enabled) return null;
  if (parts.weekday === 6 && !prefs.on_sabbath) return null;
  const sent = prefs.last_sent || {};
  for (const slot of SLOTS) {
    const at = minutesOf(slot === 'noon' ? prefs.noon : prefs.evening);
    if (at == null) continue;
    const late = parts.minutes - at;
    if (late >= 0 && late < WINDOW_MIN && sent[slot] !== parts.date) return slot;
  }
  return null;
}

export function parseCadence(c) {
  if (c === 'weekly') return { kind: 'weekly', days: null };
  if (typeof c === 'string' && c.slice(0, 4) === 'dow:') {
    const d = c.slice(4).split(',').map((x) => parseInt(String(x).trim(), 10)).filter((n) => n >= 0 && n <= 6);
    if (d.length) return { kind: 'dow', days: d };
  }
  return { kind: 'daily', days: null };
}

export function sectionOf(h) {
  const s = String(h.section || '').toLowerCase();
  if (['morning', 'night', 'standards', 'weekly'].includes(s)) return s;
  if (/^\s*sabbath\b/i.test(String(h.name || '')) || /^sabbath$/i.test(String(h.group_name || ''))) return 'night';
  if (h.cadence === 'weekly') return 'weekly';
  if (minutesOf(h.planned_start) != null || minutesOf(h.time_anchor) != null) return 'morning';
  return 'standards';
}

// What is due today: the day's own snapshot when it has one, else the active standards due on this weekday.
export function dueIds(habits, dayRow, weekday) {
  const snap = dayRow && Array.isArray(dayRow.active_set) ? dayRow.active_set.map(String) : [];
  if (snap.length) return snap;
  return habits.filter((h) => h.active !== false).filter((h) => {
    const p = parseCadence(h.cadence);
    return p.kind !== 'dow' || p.days.includes(weekday);
  }).map((h) => String(h.id));
}

export function counts(habits, dayRow, weekday, section) {
  const byId = new Map(habits.map((h) => [String(h.id), h]));
  const checked = (dayRow && dayRow.checked) || {};
  let due = dueIds(habits, dayRow, weekday).filter((id) => byId.has(id));
  if (section) due = due.filter((id) => sectionOf(byId.get(id)) === section);
  const done = due.filter((id) => !!checked[id]).length;
  return { done, due: due.length };
}

export function firstName(name) {
  const w = String(name || '').trim().split(/\s+/)[0] || 'member';
  return w.length > 16 ? w.slice(0, 16) : w;
}

// The words. Noon: "Morning done? 5 of 9". Evening: "12 of 21 · Andrew 9 of 18 · rate the day".
export function compose(slot, me, members) {
  if (slot === 'noon') {
    const m = me.morning || { done: 0, due: 0 };
    return { title: 'Habit Tracker', body: m.due ? `Morning done? ${m.done} of ${m.due}` : `${me.day.done} of ${me.day.due} so far` };
  }
  const parts = [`${me.day.done} of ${me.day.due}`];
  for (const x of members) parts.push(`${firstName(x.name)} ${x.day.done} of ${x.day.due}`);
  if (!me.rated) parts.push('rate the day');
  return { title: 'Habit Tracker', body: parts.join(' · ') };
}

// One whole sweep, pure: people + their data in, messages out. index.ts sends them and stamps last_sent.
export function sweep(now, data) {
  const out = [];
  for (const prefs of data.prefs) {
    const parts = localParts(now, prefs.tz);
    const slot = dueSlot(prefs, parts);
    if (!slot) continue;
    const mine = data.byUser[prefs.user_id] || { habits: [], days: {} };
    const dayRow = mine.days[parts.date] || null;
    const me = { day: counts(mine.habits, dayRow, parts.weekday),
                 morning: counts(mine.habits, dayRow, parts.weekday, 'morning'),
                 rated: !!(mine.ratings && mine.ratings[parts.date] != null) };
    const members = (data.comembers[prefs.user_id] || []).map((uid) => {
      const o = data.byUser[uid] || { habits: [], days: {}, name: 'member' };
      return { name: o.name, day: counts(o.habits, o.days[parts.date] || null, parts.weekday) };
    });
    out.push({ user_id: prefs.user_id, slot, date: parts.date, message: compose(slot, me, members) });
  }
  return out;
}
