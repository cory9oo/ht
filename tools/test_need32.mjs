/* HT-32 S3 - the SAME table the Python oracle runs, against the code that actually ships.
 *
 *     node --test tools/test_need32.mjs
 *
 * `ht_stage/148/draft/need_today.py` proved the formula before a line of it was written into
 * `app.js` (37 assertions, 0 FAIL) and corrected four arithmetic errors in the paste's own
 * acceptance table on the way. That file is the oracle; this one stops the oracle and the app
 * from drifting apart, which is the only thing that makes having an oracle worth anything.
 *
 * `app.js` is a browser bundle, not a module: it opens with `var sb = window.supabase...`. Rather
 * than load it, this test extracts the ONE pure IIFE under test and evaluates it - the function has
 * no DOM, no state and no clock, which is exactly why it can be lifted. If the extraction stops
 * matching, the test FAILS rather than silently testing nothing (134 R1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'app.js'), 'utf8');

/* Lift the engine: from the `var HT32_TARGET_PCT` line to the end of its IIFE. */
function engine() {
  const start = SRC.indexOf('var HT32_TARGET_PCT');
  assert.notEqual(start, -1, 'HT32_TARGET_PCT not found - the engine moved; this test tests nothing');
  const marker = 'window.__HT32WEEK =';
  const mi = SRC.indexOf(marker, start);
  assert.notEqual(mi, -1, '__HT32WEEK export not found - the engine moved');
  const end = SRC.indexOf('})();', mi);
  assert.notEqual(end, -1, 'end of the engine IIFE not found');
  const code = SRC.slice(start, end + 5);

  /* the engine calls dk()/dnum() from the bundle; give it the same two, verbatim from app.js */
  const helpers = `
    function dk(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
    function dnum(k){ return new Date(k+'T12:00:00'); }
    var window = {};
  `;
  const fn = new Function(helpers + code + '; return window.__HT32WEEK;');
  const api = fn();
  assert.ok(api && typeof api.need === 'function', 'the engine did not export need()');
  return api;
}

const W = engine();
const { SECURED, ON_TRACK, AT_RISK, OUT } = W.STATES;
const near = (a, b, t = 0.05) => Math.abs(a - b) <= t;

/* ---------------------------------------------------------------- the oracle's table, verbatim */
const CASES = [
  // name,                          done,                      ahead, pace, state, raw,   need
  ['first day of the week',         [],                            5,   0,  AT_RISK,  80,   80],
  ['first day, already at pace',    [],                            5,  85,  ON_TRACK, 80,   80],
  ['last day, 40 on Thursday',      [80, 80, 80, 80, 40],          0,  10,  OUT,     120,  100],
  ['last day, perfect week so far', [100, 100, 100, 100, 100],     0,   0,  SECURED, -20,    0],
  ['a lost week - out of reach',    [0, 0, 0, 0, 0],               0,   0,  OUT,     480,  100],
  ['mid-week, on track',            [90, 90],                      3,  75,  ON_TRACK, 75,   75],
  ['four perfect days, two left',   [100, 100, 100, 100],          1,   0,  AT_RISK,  40,   40],
];

test('the formula table matches the Python oracle row for row', () => {
  for (const [name, done, ahead, pace, state, raw, need] of CASES) {
    const r = W.need(done, ahead, pace);
    assert.equal(r.state, state, `${name}: state`);
    assert.ok(near(r.raw, raw), `${name}: raw ${r.raw} != ${raw}`);
    assert.ok(near(r.need, need), `${name}: need ${r.need} != ${need}`);
  }
});

test('the Sabbath: a full week is six scoring days, never seven', () => {
  const r = W.need([80, 80, 80, 80, 80], 0, 0);
  assert.equal(r.D, 6);
  assert.ok(near(r.raw, 80), 'five days at target still owe the target on the sixth');
  assert.equal(r.state, AT_RISK);
  assert.ok(r.D <= 6);
});

test('an UNKNOWN day leaves the denominator, not just the numerator', () => {
  const unknown = W.need([80, 80, 80], 1, 0);      // Wednesday asked nothing
  const zeroed = W.need([80, 80, 80, 0], 1, 0);    // the same day scored 0 instead
  assert.equal(unknown.D, 5);
  assert.equal(zeroed.D, 6);
  assert.ok(near(unknown.raw, 80));
  assert.ok(near(zeroed.raw - unknown.raw, 40), 'scoring it 0 would have cost exactly 40 a day');
});

test('OUT OF REACH reports the best week still possible, and it is under target', () => {
  const r = W.need([0, 0, 0, 0, 0], 0, 0);
  assert.ok(near(r.best, 100 / 6));
  assert.ok(r.best < 80);
});

test('the clamp is for the screen; the state came off the raw number', () => {
  const lost = W.need([0, 0, 0, 0, 0], 0, 0);
  assert.equal(lost.need, 100);
  assert.equal(lost.state, OUT, 'clamping before classifying would make OUT OF REACH unreachable');
  const won = W.need([100, 100, 100, 100, 100], 0, 0);
  assert.equal(won.need, 0);
  assert.equal(won.state, SECURED, 'clamping before classifying would make SECURED unreachable');
});

test('a week with nothing due asks nothing', () => {
  const r = W.need([], -1, 0);
  assert.equal(r.state, SECURED);
  assert.equal(r.need, null);
});

/* ------------------------------------------------------------------ the week, and the gatherer */
test('weekDays is Sunday to Friday and drops the person’s own Sabbath too', () => {
  const d = W.weekDays('2026-09-22');                 // a Tuesday
  assert.equal(d.length, 6, 'Sun-Fri');
  assert.equal(d[0], '2026-09-20', 'starts on Sunday');
  assert.equal(d[5], '2026-09-25', 'ends on Friday');
  assert.ok(!d.some(k => new Date(k + 'T12:00:00').getDay() === 6), 'no Saturday');
  const w = W.weekDays('2026-09-22', 3);              // this person rests on Wednesday
  assert.equal(w.length, 5);
  assert.ok(!w.includes('2026-09-23'));
});

test('gather: unchecked is a zero, nothing-due is UNKNOWN, today is the pace', () => {
  const rows = {
    '2026-09-20': { pct: 90, logged: true, due: 10 },
    '2026-09-21': { pct: 0, logged: true, due: 0 },    // nothing was due -> UNKNOWN
    '2026-09-22': { pct: 25, logged: true, due: 10 },  // today
  };
  const g = W.gather('2026-09-22', k => rows[k] || null, null);
  assert.deepEqual(g.done, [90], 'the UNKNOWN day is not in the list');
  assert.equal(g.pace, 25);
  assert.equal(g.ahead, 3, 'Wed Thu Fri');
});

test('gather: a past day that was never opened is a zero, not an UNKNOWN', () => {
  const g = W.gather('2026-09-22', k => (k === '2026-09-20' ? { pct: 80, logged: true, due: 5 } : null), null);
  assert.deepEqual(g.done, [80, 0], 'Monday was never opened -> 0');
});

test('label and colour: one line, one class per state', () => {
  assert.match(W.label(W.need([], 5, 0)), /^NEED ≥ 80% TODAY$/);
  assert.equal(W.label(W.need([100, 100, 100, 100, 100], 0, 0)), 'SECURED FOR THE WEEK');
  assert.match(W.label(W.need([0, 0, 0, 0, 0], 0, 0)), /^BEST POSSIBLE 17%$/);
  assert.equal(W.label(W.need([], -1, 0)), null);
  const seen = new Set([
    W.cls(W.need([100, 100, 100, 100, 100], 0, 0)),
    W.cls(W.need([], 5, 85)),
    W.cls(W.need([], 5, 0)),
    W.cls(W.need([0, 0, 0, 0, 0], 0, 0)),
  ]);
  assert.equal(seen.size, 4, 'four states, four distinct classes (R70.306)');
});
