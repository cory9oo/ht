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
  // HT-31 S1.6 (Cory 9/21): a planned time never decides a section. The line that read
  // `if (minutesOf(h.planned_start) != null || ...) return 'morning';` is the defect he reported -
  // it made every timed task a morning task. The app, the markdown, the copier and this sender all
  // carry the identical rule and all four moved in the same wire.
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

// ====================== HT-32 S5 · ONE PUSH A DAY, AND ONLY ONE ======================
// Cory, 9/22: "notifications ... once at the end of the day ... a summary report on how each person
// did", and S5.11: "at each member's report hour, ONE push".
//
// THIS SUPERSEDES HT-29's TWO SLOTS. `noon` and `evening` were right when a nudge was a prompt to
// act; a REPORT is a thing you read once, after the day is over, and two of them is the "1-2 a day
// max" research line being spent on the same information twice. The old slots are KEPT (R70.138) -
// `sweep()` above is untouched and still tested - and `HT32_ONE_A_DAY` decides which sender runs.
// Nothing is deleted, so reversing this is one constant.
//
// THE CAP IS STRUCTURAL, NOT A RULE ANYONE HAS TO REMEMBER. `reportDue` refuses when `last_sent`
// already holds today's date for this person, and the sweep can emit at most one entry per user
// because it iterates users, not slots. There is no arrangement of the data that produces two.
export const HT32_ONE_A_DAY = true;
export const HT32_REPORT_HOUR = 21;            // 9:00 PM in the member's OWN zone; user.report_hour
export const HT32_TARGET_PCT = 80;             // group.target_pct

// The window is the same 15 minutes the scheduler runs on, for the same reason: a member whose hour
// falls between two runs must still be caught by one of them.
export function reportDue(prefs, parts) {
  if (!prefs || !prefs.enabled) return false;
  const hour = (prefs.report_hour == null) ? HT32_REPORT_HOUR : +prefs.report_hour;
  const at = hour * 60;
  const late = parts.minutes - at;
  if (!(late >= 0 && late < WINDOW_MIN)) return false;
  // ONE PER MEMBER PER DAY. `last_sent.report` is the whole cap.
  return (prefs.last_sent || {}).report !== parts.date;
}

// Friday carries the week. Saturday is the Sabbath and is not a scoring day (HT32_WEEK = sun_fri),
// so the week ENDS on Friday and its report rides Friday's daily - which is what S4.8 asks for and
// is also the only day a week-shaped sentence is true on.
export function isWeekEnd(parts) { return parts.weekday === 5; }

// ONE line per member, numbers only. The privacy rule is not a filter applied afterwards: the only
// things this function is GIVEN are a name, a percentage and a rating number, so there is nothing
// here to leak. A journal line cannot reach this file - `sweepReport` never reads one.
export function composeReport(day, me, members, week) {
  const line = (x) => `${firstName(x.name)} ${Math.round(x.pct)}%` +
                      (x.rating == null ? '' : ` · rating ${x.rating}`);
  const parts = [line({ name: 'You', pct: me.pct, rating: me.rating })];
  for (const x of members) parts.push(line(x));
  let body = parts.join('\n');
  if (week) {
    body += `\nWEEK: ${week.outcome} · ${Math.round(week.pct)}%`;
  }
  return { title: `HT · ${day}`, body };
}

// One sweep, one entry per member at most. Pure, like everything else in this file.
export function sweepReport(now, data) {
  const out = [];
  const seen = new Set();
  for (const prefs of data.prefs) {
    if (seen.has(prefs.user_id)) continue;     // belt and braces: a duplicated prefs row is one push
    const parts = localParts(now, prefs.tz);
    if (!reportDue(prefs, parts)) continue;
    seen.add(prefs.user_id);
    const mine = data.byUser[prefs.user_id] || { habits: [], days: {} };
    const dayRow = mine.days[parts.date] || null;
    const c = counts(mine.habits, dayRow, parts.weekday);
    const me = { pct: (dayRow && dayRow.pct != null) ? +dayRow.pct : (c.due ? (c.done / c.due) * 100 : 0),
                 rating: (mine.ratings && mine.ratings[parts.date] != null) ? mine.ratings[parts.date] : null };
    const members = (data.comembers[prefs.user_id] || []).map((uid) => {
      const o = data.byUser[uid] || { habits: [], days: {}, name: 'member' };
      const d = o.days[parts.date] || null;
      const oc = counts(o.habits, d, parts.weekday);
      return { name: o.name, pct: (d && d.pct != null) ? +d.pct : (oc.due ? (oc.done / oc.due) * 100 : 0),
               rating: (o.ratings && o.ratings[parts.date] != null) ? o.ratings[parts.date] : null };
    });
    const week = isWeekEnd(parts) ? weekOf(mine, parts) : null;
    out.push({ user_id: prefs.user_id, slot: 'report', date: parts.date,
               message: composeReport(parts.date, me, members, week) });
  }
  return out;
}

// The week's own arithmetic: Sunday..Friday, an unchecked box is a zero, a day that asked nothing
// drops out of the denominator. The APP owns this rule (`__HT32WEEK`) and this is the sender's copy
// of the same three sentences - they are held together by `golden_ht32`, which computes both.
export function weekOf(mine, parts) {
  const end = new Date(parts.date + 'T12:00:00Z');
  const days = [];
  for (let back = end.getUTCDay(); back >= 0; back--) {
    const d = new Date(end); d.setUTCDate(end.getUTCDate() - back);
    if (d.getUTCDay() === 6) continue;         // Saturday is not scored
    days.push(d.toISOString().slice(0, 10));
  }
  let sum = 0, n = 0;
  for (const k of days) {
    const row = mine.days[k];
    if (row && row.pct == null && row.unknown) continue;
    sum += (row && row.pct != null) ? +row.pct : 0;
    n++;
  }
  const pct = n ? sum / n : 0;
  return { pct, outcome: pct >= HT32_TARGET_PCT ? 'MET' : 'MISSED', days: n };
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
