// core.test.mjs - node --test tools/supabase/functions/nudge/   (WIRE HT-29, paste 133 S9.32)
import test from 'node:test';
import assert from 'node:assert/strict';
import { localParts, dueSlot, counts, compose, sweep, sectionOf, dueIds } from './core.js';

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
  assert.deepEqual(counts(habits, { checked: { a: '06:10' } }, 2, 'morning'), { done: 1, due: 1 });
  assert.equal(sectionOf(habits[3]), 'night');
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
