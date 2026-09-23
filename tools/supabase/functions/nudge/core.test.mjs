// core.test.mjs - node --test tools/supabase/functions/nudge/   (WIRE HT-29, paste 133 S9.32)
import test from 'node:test';
import assert from 'node:assert/strict';
import { localParts, dueSlot, counts, compose, sweep, sectionOf, dueIds } from './core.js';
// HT-32 S5 imports the module WHOLE as `C`, rather than adding six names to the line above: the
// report sender is a second surface on the same file, and naming it in one place makes it obvious
// in every test below which half is under test.
import * as C from './core.js';

// 2026-09-15 is a Tuesday. 21:05 CDT = 02:05Z the next day.
const TUE_2105 = new Date('2026-09-16T02:05:00Z');
const SAT_2105 = new Date('2026-09-20T02:05:00Z');
const TUE_1200 = new Date('2026-09-15T17:00:00Z');

const habits = [
  { id: 'a', name: 'Prayer', planned_start: '06:00:00', active: true },
  { id: 'b', name: 'Gym', active: true },
  { id: 'c', name: 'Lights out', time_anchor: '21:45:00', section: 'night', active: true },
  { id: 's', name: 'Sabbath - rest and worship', group_name: 'SABBATH', cadence: 'dow:6', active: true },
];

test('the person\'s own clock, not UTC', () => {
  assert.deepEqual(localParts(TUE_2105, 'America/Chicago'), { date: '2026-09-15', minutes: 21 * 60 + 5, weekday: 2 });
  assert.equal(localParts(TUE_2105, 'Not/AZone').date, '2026-09-15');
});

test('a slot is due once, inside its window, never on the Sabbath unless asked', () => {
  const prefs = { enabled: true, noon: '12:00', evening: '21:00', on_sabbath: false, last_sent: {} };
  assert.equal(dueSlot(prefs, localParts(TUE_2105, 'America/Chicago')), 'evening');
  assert.equal(dueSlot(prefs, localParts(TUE_1200, 'America/Chicago')), 'noon');
  assert.equal(dueSlot({ ...prefs, last_sent: { evening: '2026-09-15' } }, localParts(TUE_2105, 'America/Chicago')), null);
  assert.equal(dueSlot(prefs, localParts(new Date('2026-09-16T02:20:00Z'), 'America/Chicago')), null);   // 21:20
  assert.equal(dueSlot(prefs, localParts(SAT_2105, 'America/Chicago')), null);
  assert.equal(dueSlot({ ...prefs, on_sabbath: true }, localParts(SAT_2105, 'America/Chicago')), 'evening');
  assert.equal(dueSlot({ ...prefs, enabled: false }, localParts(TUE_2105, 'America/Chicago')), null);
});

test('counts use the day\'s own snapshot, and the Sabbath is not due on a Tuesday', () => {
  assert.deepEqual(dueIds(habits, null, 2), ['a', 'b', 'c']);
  assert.deepEqual(counts(habits, { checked: { a: '06:10', c: true } }, 2), { done: 2, due: 3 });
  assert.deepEqual(counts(habits, { checked: { a: '06:10' }, active_set: ['a', 'b'] }, 2), { done: 1, due: 2 });
  // AMENDED BY NAME, HT-31 (paste 143 S1.6), 2026-09-22: `a` has a 06:00 planned time and NO stored
  // section, so it is a STANDARD now - a clock does not place anything, in any of the four languages
  // that carry this rule (Cory 9/21). The claim is the same claim and is asserted on both sides of the
  // move: nothing is in `morning`, and the one counted under `standards` is the one that used to be
  // counted under `morning`. `c` keeps `night` because its section is STORED, which is the whole point.
  assert.deepEqual(counts(habits, { checked: { a: '06:10' } }, 2, 'morning'), { done: 0, due: 0 });
  assert.deepEqual(counts(habits, { checked: { a: '06:10' } }, 2, 'standards'), { done: 1, due: 2 });
  assert.deepEqual(counts(habits, { checked: { c: true } }, 2, 'night'), { done: 1, due: 1 });
  assert.equal(sectionOf(habits[3]), 'night');
  assert.equal(sectionOf(habits[0]), 'standards');
});

test('the words are the paste\'s, numbers only', () => {
  const me = { day: { done: 12, due: 21 }, morning: { done: 5, due: 9 }, rated: false };
  assert.equal(compose('evening', me, [{ name: 'Andrew Example', day: { done: 9, due: 18 } }]).body,
    '12 of 21 · Andrew 9 of 18 · rate the day');
  assert.equal(compose('evening', { ...me, rated: true }, []).body, '12 of 21');
  assert.equal(compose('noon', me, []).body, 'Morning done? 5 of 9');
});

test('a sweep builds each due person\'s line from real rows and nobody else\'s', () => {
  const data = {
    prefs: [{ user_id: 'u1', enabled: true, noon: '12:00', evening: '21:00', tz: 'America/Chicago', last_sent: {} },
            { user_id: 'u3', enabled: false, noon: '12:00', evening: '21:00', tz: 'America/Chicago', last_sent: {} }],
    byUser: {
      u1: { name: 'Cory', habits, days: { '2026-09-15': { checked: { a: '06:02', b: true } } }, ratings: {} },
      u2: { name: 'Andrew', habits: [{ id: 'x', active: true }, { id: 'y', active: true }],
            days: { '2026-09-15': { checked: { x: true } } } },
      u9: { name: 'Stranger', habits: [{ id: 'z', active: true }], days: {} },
    },
    comembers: { u1: ['u2'] },
  };
  const out = sweep(TUE_2105, data);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { user_id: 'u1', slot: 'evening', date: '2026-09-15',
    message: { title: 'Habit Tracker', body: '2 of 3 · Andrew 1 of 2 · rate the day' } });
  assert.ok(!JSON.stringify(out).includes('Stranger'));
});

/* ===================== HT-32 S5 · ONE PUSH A DAY, AND THE CAP ======================
   Cory, 9/22: "notifications ... once at the end of the day". S5.11: "Never more than one push per
   member per day (test asserts the cap)". So the cap is the first test, and it is written as an
   attempt to BREAK it rather than as a demonstration that it holds: the sweep is run again over the
   same minute, and again with the prefs row duplicated, and again a minute later inside the window. */
test('HT-32 S5 · exactly one push per member per day, however hard you push', () => {
  const at = (hhmm) => new Date('2026-09-23T' + hhmm + ':00-05:00');   // Wednesday, Chicago
  const prefs = { user_id: 'u1', enabled: true, tz: 'America/Chicago', report_hour: 21, last_sent: {} };
  const data = { prefs: [prefs],
                 byUser: { u1: { name: 'Cory', habits: [{ id: 'h1', active: true, cadence: 'daily' }],
                                 days: { '2026-09-23': { pct: 80, checked: { h1: 1 } } }, ratings: {} } },
                 comembers: { u1: [] } };
  const first = C.sweepReport(at('21:00'), data);
  assert.equal(first.length, 1, 'the report fires at the member\'s own hour');
  /* the sender stamps last_sent when it sends; the cap is read from it */
  prefs.last_sent = { report: '2026-09-23' };
  assert.equal(C.sweepReport(at('21:00'), data).length, 0, 'and not a second time in the same minute');
  assert.equal(C.sweepReport(at('21:10'), data).length, 0, 'nor later inside the same window');
  /* a duplicated prefs row is a database accident, not a licence to push twice */
  prefs.last_sent = {};
  const twice = { ...data, prefs: [prefs, { ...prefs }] };
  assert.equal(C.sweepReport(at('21:00'), twice).length, 1, 'nor for a duplicated prefs row');
});

test('HT-32 S5 · it fires at THEIR hour, in THEIR zone - not at nine o\'clock somewhere else', () => {
  const prefs = { user_id: 'u1', enabled: true, tz: 'America/New_York', report_hour: 21, last_sent: {} };
  const data = { prefs: [prefs], byUser: { u1: { name: 'Cory', habits: [], days: {}, ratings: {} } },
                 comembers: { u1: [] } };
  /* 21:00 in New York is 20:00 in Chicago; a sender that used one clock for everyone would miss it */
  assert.equal(C.sweepReport(new Date('2026-09-23T21:00:00-04:00'), data).length, 1);
  assert.equal(C.sweepReport(new Date('2026-09-23T21:00:00-05:00'), data).length, 0);
});

/* THE NAMES HERE ARE INVENTED ON PURPOSE. This repo is PUBLIC BY DESIGN and 131 R3 says it
   carries no identifiers - no emails, no account numbers, and no names of real people. A
   real name was in this test until `public_id_scan.py` caught it before the push. What the
   assertion proves is that a two-word name prints as its first word, and any two words do
   that. */
test('HT-32 S5 · the body is numbers only - one line per member, and no word of a journal', () => {
  const m = C.composeReport('2026-09-23',
    { pct: 80, rating: 8 },
    [{ name: 'Member Alpha', pct: 61.4, rating: 6 }, { name: 'Bee', pct: 100, rating: null }],
    null);
  assert.equal(m.title, 'HT · 2026-09-23');
  assert.equal(m.body, 'You 80% · rating 8\nMember 61% · rating 6\nBee 100%');
  /* the four private fields are not filtered out here - they were never passed in, which is the
     only version of this that stays true when someone adds a field to the caller */
  for (const w of ['journal', 'prayer', 'why', 'dump', 'completed']) {
    assert.ok(!m.body.toLowerCase().includes(w), w + ' must never reach a notification');
  }
});

test('HT-32 S5 · Friday carries the week, and no other day does', () => {
  const mine = { name: 'Cory', habits: [], ratings: {}, days: {} };
  /* Sunday 20th .. Friday 25th, all at 90 - Saturday is the Sabbath and is not scored */
  for (const d of ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']) {
    mine.days[d] = { pct: 90 };
  }
  const prefs = { user_id: 'u1', enabled: true, tz: 'America/Chicago', report_hour: 21, last_sent: {} };
  const data = { prefs: [prefs], byUser: { u1: mine }, comembers: { u1: [] } };
  const fri = C.sweepReport(new Date('2026-09-25T21:00:00-05:00'), data);
  assert.equal(fri.length, 1);
  assert.ok(fri[0].message.body.includes('WEEK: MET · 90%'), fri[0].message.body);
  prefs.last_sent = {};
  const wed = C.sweepReport(new Date('2026-09-23T21:00:00-05:00'), data);
  assert.ok(!wed[0].message.body.includes('WEEK'), wed[0].message.body);
});

test('HT-32 S5 · a lost week says MISSED rather than rounding itself up', () => {
  const mine = { name: 'Cory', habits: [], ratings: {}, days: { '2026-09-25': { pct: 100 } } };
  const prefs = { user_id: 'u1', enabled: true, tz: 'America/Chicago', report_hour: 21, last_sent: {} };
  const out = C.sweepReport(new Date('2026-09-25T21:00:00-05:00'),
    { prefs: [prefs], byUser: { u1: mine }, comembers: { u1: [] } });
  /* five days with no row at all are five zeros (the standing 9/15 rule), so one perfect day is 16% */
  assert.ok(out[0].message.body.includes('WEEK: MISSED'), out[0].message.body);
});

test('HT-32 S5 · nobody who has not turned it on is ever sent anything', () => {
  const prefs = { user_id: 'u1', enabled: false, tz: 'America/Chicago', report_hour: 21, last_sent: {} };
  assert.equal(C.sweepReport(new Date('2026-09-23T21:00:00-05:00'),
    { prefs: [prefs], byUser: { u1: { habits: [], days: {} } }, comembers: { u1: [] } }).length, 0);
});
