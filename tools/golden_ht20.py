#!/usr/bin/env python3
"""HT-20 GOLDEN — every acceptance block of WIRE HT-20, run literally (R70.41: data goldens gate,
screenshots are evidence).

  python3 _reconcile/ht_batch20/golden_ht20.py            (fixture at ./ht3)
  python3 _reconcile/ht_batch20/golden_ht20.py --only P1  (one section)

  P1   a name renders verbatim — `label`/`startMin` retired, the Strip button gone, and the
       string `3 jugs of water a day - 1.5 gal` identical on four surfaces
  P1a  the Sabbath standard stops multiplying — twenty loads change the habit count by 0
  P2   every check unchecks, whatever its cadence
  P3   all thirty numbers on the month axis, zero overlaps, measured per row
  P4   the life grid fills its box and the box keeps its padding
  P5   the group rules breathe and the rows stop shouting
  P9   the Doc mirror is gone from live code
  P10  DETAIL is a page of boxes — no sideways scroll, every metric labelled
  P12  time blocks

`app.js` is ONE SEALED CLOSURE: `S` and the paints are unreachable from evaluate(). Every number
below is DOM truth, an exported seam (`window.__HT16` / `__HT17` / `__HT20`), or a read of the
source file itself.
"""

# ---- HT-24 C7 · MOVED INTO THE REPO IT TESTS, AND IT RESOLVES ITS OWN PATHS ------------------
# This file used to resolve `<estate>/standard` - the MAIN checkout - so run from a worktree under
# CC_STANDING §4A it tested main while the branch it was meant to test sat untouched, and passed.
# `_REPO` is this file's own repo (`tools/..`); `_ESTATE` is found by walking up for `_reconcile`.
# Run it from a worktree and it tests that worktree; run it from main and it tests main.
import os as _os, sys as _sys
_REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
def _find_estate(_d):
    for _ in range(6):
        if _os.path.isdir(_os.path.join(_d, '_reconcile')): return _d
        _n = _os.path.dirname(_d)
        if _n == _d: break
        _d = _n
    raise SystemExit('no estate root above %s' % _REPO)
_ESTATE = _find_estate(_REPO)
_os.chdir(_ESTATE)                      # every relative path below is estate-relative, as before
_sys.path.insert(0, _os.path.join(_ESTATE, '_reconcile', 'ht_batch22'))
# ----------------------------------------------------------------------------------------------
import argparse, asyncio, io, json, os, re, sys
from playwright.async_api import async_playwright
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'file://' + os.path.join(_ESTATE, 'ht3', 'index.html').replace(os.sep, '/')
SRC_JS = os.path.join(_REPO, 'app.js')      # THIS checkout, not the estate's `standard/`
SRC_CSS = os.path.join(_REPO, 'app.css')
NUMNAME = '3 jugs of water a day - 1.5 gal'

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:260])))

def src(p):
    return io.open(p, encoding='utf-8', errors='replace').read()


async def open_page(pw, w=1280, h=720, flags=None, init=None):
    b = await pw.chromium.launch()
    pg = await b.new_page(viewport={'width': w, 'height': h})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    if flags:
        await pg.add_init_script("; ".join("window.%s=%s" % (k, json.dumps(v)) for k, v in flags.items()))
    if init:
        await pg.add_init_script(init)
    await pg.goto(BASE)
    await pg.wait_for_timeout(3300)
    return b, pg, errs


# =============================================================================================
# P1 · A NAME RENDERS VERBATIM (R70.265)
# The source greps first, because the wire's own acceptance is a grep, and then the four
# surfaces. `esc()` is HTML-escaping, so the list is read as textContent and never as innerHTML.
# =============================================================================================
CSV_HOOK = """
window.__CSV = [];
(function(){
  var o = URL.createObjectURL;
  URL.createObjectURL = function(b){
    try { b.text().then(function(t){ window.__CSV.push(t); }); } catch(e) {}
    return o.apply(URL, arguments);
  };
})();
"""

async def P1(pw):
    print("\nP1 · a name is a string")
    js = src(SRC_JS)
    # the helper, not the English word and not `<label>`: a call or a definition.
    calls = re.findall(r'(?<![\w.$])label\s*\(', js)
    chk("P1a · grep: `label(` appears 0 times in app.js", len(calls) == 0, calls[:5])
    chk("P1b · grep: `startMin` appears 0 times in app.js", 'startMin' not in js)
    chk("P1c · the Strip button id is gone from the source", 'edStrip' not in js, 'edStrip present')
    chk("P1d · nameOf() is the replacement and it parses nothing",
        re.search(r"function nameOf\(n\)\{\s*return String\(n==null\?'':n\);\s*\}", js) is not None)

    b, pg, errs = await open_page(pw, 1280, 720, flags={'__NUMNAME': True}, init=CSV_HOOK)

    # 1 · the list
    listed = await pg.evaluate("""() => [...document.querySelectorAll('#log .nm')]
        .map(e => (e.childNodes[0] && e.childNodes[0].textContent || e.textContent).trim())""")
    chk("P1e · the LIST renders the name character-identical", NUMNAME in listed,
        [x for x in listed[:4]])

    # 2 · the DETAIL drawer
    detail = await pg.evaluate("""async () => {
      const more = document.querySelector('[data-h18more]');
      if(!more) return {err:'no detail control'};
      more.click();
      await new Promise(r => setTimeout(r, 500));
      const d = document.getElementById('h18Draw');
      return { hidden: d ? d.hidden : null,
               names: [...document.querySelectorAll('#h18Draw td.n')].map(e => e.textContent) }; }""")
    chk("P1f · the DETAIL page renders it character-identical",
        NUMNAME in (detail.get('names') or []), detail)

    # 3+4 · both CSV exports
    csvs = await pg.evaluate("""async () => {
      document.getElementById('bSet').click();
      await new Promise(r => setTimeout(r, 700));
      const a = document.getElementById('xCsv'), b = document.getElementById('xCsvH');
      if(a) a.click();
      if(b) b.click();
      await new Promise(r => setTimeout(r, 500));
      return window.__CSV || []; }""")
    days = next((c for c in csvs if c.startswith('date,pct')), '')
    habs = next((c for c in csvs if c.startswith('name,group')), '')
    chk("P1g · the CSV · days header carries the name character-identical",
        ('"%s"' % NUMNAME) in days, days[:180])
    chk("P1h · the CSV · standards row carries the name character-identical",
        ('"%s"' % NUMNAME) in habs, habs[:180])

    # the button is gone from the rendered Settings, not merely from the source
    gone = await pg.evaluate("""() => ({
        byId: !!document.getElementById('edStrip'),
        byText: [...document.querySelectorAll('button')]
                  .filter(b => /strip/i.test(b.textContent||'')).map(b => b.textContent) })""")
    chk("P1i · the Strip button is gone from Settings (rendered, not just source)",
        not gone['byId'] and not gone['byText'], gone)
    chk("P1j · zero page errors", not errs, errs[:2])
    await b.close()


# =============================================================================================
# P1a · THE SABBATH STANDARD STOPS MULTIPLYING
# The count is read from the mock's own DB after N loads in ONE page, because a reload of a
# file:// page rebuilds the mock from scratch and would make every run look idempotent. The mock
# is given a persistent store for the test (`__SABPERSIST`), which is what the live database is.
# =============================================================================================
LAG = 900   # ms of latency on the habits read — see the note in mock.js's `lag()`


async def loads(pw, n, flags, base=None, lag=LAG):
    """N REAL page loads in ONE browser context, against a fixture whose habits persist in
    localStorage AND whose habits read is slow. Both are required for this test to mean anything:
      · persistence, because a file:// reload otherwise rebuilds the fixture and forgets the row;
      · latency + a paint during the fetch, because that gap -- S.me set, S.habits still the empty
        array it was initialised to -- IS the defect, and without it a build carrying the defect
        passes. MEASURED: at 900ms the pre-fix build (12f1260) goes 1 -> 7 Sabbath rows over six
        loads, one per load, which is Cory's live pattern. `negcheck_p1a.py` is that control."""
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 720})
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    counts, sab = [], []
    for i in range(n):
        f = dict(flags)
        f['__PERSIST'] = True
        f['__PERSIST_RESET'] = (i == 0)      # first load seeds, the rest inherit
        f['__LAG'] = lag
        await ctx.add_init_script("; ".join("window.%s=%s" % (k, json.dumps(v))
                                            for k, v in f.items()))
        await pg.goto(BASE)
        if lag:
            await pg.wait_for_timeout(int(lag * 0.4))
            await pg.evaluate("() => window.dispatchEvent(new Event('resize'))")
            await pg.wait_for_timeout(300)
            await pg.evaluate("() => window.dispatchEvent(new Event('resize'))")
        await pg.wait_for_timeout(1500 + lag)
        r = await pg.evaluate("""() => {
            const h = (window.__MOCK_DB && window.__MOCK_DB.habits) || [];
            return { n: h.length,
                     sab: h.filter(x => x.active !== false && /sabbath/i.test(x.name||'')).length,
                     sabAll: h.filter(x => /sabbath/i.test(x.name||'')).length,
                     done: window.__h18SabDone || null }; }""")
        counts.append(r['n']); sab.append(r)
    await b.close()
    return counts, sab, errs


async def P1a(pw):
    print("\nP1a · the Sabbath standard stops multiplying")
    N = 20
    # (a) a fixture that ALREADY has one Sabbath row: twenty loads must change nothing
    counts, rows, errs = await loads(pw, N, {'__SABBATH': True})
    chk("P1a1 · twenty consecutive loads change the habit count by 0",
        len(set(counts)) == 1, {'counts': counts})
    chk("P1a2 · exactly one ACTIVE habit matching /sabbath/i after twenty loads",
        rows[-1]['sab'] == 1, rows[-1])
    chk("P1a3 · the check reports FOUND, not CREATED",
        rows[-1]['done'] == 'found', rows[-1]['done'])
    chk("P1a4 · zero page errors across twenty loads", not errs, errs[:2])

    # (b) from ZERO: exactly one is created, and the twenty-first load creates none
    counts0, rows0, errs0 = await loads(pw, N, {})
    chk("P1a5 · from zero sabbath habits, exactly one is created", rows0[-1]['sabAll'] == 1, rows0[-1])
    # the creation happens DURING load 1, so load 1 already reads base+1; the claim under test is
    # that loads 2..20 add nothing, i.e. the twenty counts are all the same number.
    chk("P1a6 · and the twenty-first load creates none — the count never moves again",
        len(set(counts0)) == 1 and rows0[-1]['sabAll'] == 1, {'counts': counts0})

    # (c) FIVE live rows -- Cory's measured live state -- are repaired to one, oldest kept,
    #     the other four ARCHIVED and not deleted
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 720})
    pg = await ctx.new_page()
    await ctx.add_init_script("window.__PERSIST=true; window.__PERSIST_RESET=true; window.__SABFIVE=true;")
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    rep = await pg.evaluate("""() => {
        const h = window.__MOCK_DB.habits.filter(x => /sabbath/i.test(x.name||''));
        return { total: h.length,
                 live: h.filter(x => x.active !== false).map(x => x.id),
                 archived: h.filter(x => x.active === false)
                            .map(x => ({id:x.id, at:!!x.archived_at})),
                 kept: window.__h18SabKept, done: window.__h18SabDone }; }""")
    chk("P1a7 · five live Sabbath rows collapse to ONE", len(rep['live']) == 1, rep)
    chk("P1a8 · the survivor is the OLDEST by created_at", rep['live'] == ['sab-oldest'], rep)
    chk("P1a9 · the other four are ARCHIVED, not deleted, each with archived_at",
        rep['total'] == 5 and len(rep['archived']) == 4
        and all(a['at'] for a in rep['archived']), rep)
    await b.close()


# =============================================================================================
# P2 · A CHECK IS ALWAYS A TOGGLE (R70.263)
# Driven through the DOM, never through S: the claim is about the control a person clicks. The
# day is moved with the app's own back/forward controls so the test exercises the same path.
# =============================================================================================
GOTO = """(k) => {
  // the app's own date setter, reached the way the masthead reaches it
  const nav = document.querySelector('[data-vgd="'+k+'"]');
  if(nav){ nav.click(); return 'clicked'; }
  return 'no-control';
}"""

async def P2(pw):
    print("\nP2 · every check unchecks, whatever its cadence")
    js = src(SRC_JS)
    # the REFUSAL, not the word: the comment that records why it went is prose and should stay.
    chk("P2a · the 'already done this week' refusal no longer runs",
        re.search(r"toast\(\s*['\"]already done this week", js) is None
        and 'weekCheckDay' in js)

    b, pg, errs = await open_page(pw, 1280, 720, flags={'__WEEKLY_PERIOD': True})
    st = await pg.evaluate("""async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const DB = window.__MOCK_DB;
      const wk = DB.habits.find(h => h.cadence === 'weekly');
      if(!wk) return {err:'no weekly habit in fixture'};

      // Monday and Wednesday of the CURRENT period, as the app computes them
      const d = new Date();
      const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay()+6)%7));
      const kk = x => x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+
                      String(x.getDate()).padStart(2,'0');
      // "Wednesday" in the wire means A LATER DAY OF THE SAME PERIOD. Wednesday itself has not
      // happened yet in most periods this suite will run in, so the later day is TODAY.
      if(kk(mon) === kk(d)) return {err:'today is the first day of the period — no later day'};
      const kMon = kk(mon), kWed = kk(d);
      const row = k => DB.days.find(r => r.date === k);

      const box = () => document.querySelector('[data-tog="'+wk.id+'"]');
      // the day controls live in the SVG axis, and SVGElement has no .click() — a real bubbling
      // MouseEvent is what the app's delegated handler sees from a pointer anyway.
      const goto = k => { const c = document.querySelector('[data-vgd="'+k+'"]');
                          if(!c) return false;
                          c.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                          return true; };

      // 0 · NORMALISE. The fixture seeds completions on several days, so the period can start
      //     with more than one. Clicking until the box reads unpressed empties the period one
      //     completion at a time — which is itself the behaviour under test, so the loop is
      //     bounded and its count is reported.
      goto(kWed); await wait(600);
      if(!box()) return {err:'no control for the weekly'};
      let clears = 0;
      while(box().getAttribute('aria-pressed') === 'true' && clears < 9){
        box().dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
        await wait(750); clears++;
      }
      if(box().getAttribute('aria-pressed') === 'true')
        return {err:'the period would not clear in 9 clicks', clears};

      // 1 · CHECK on Monday
      goto(kMon); await wait(600);
      box().dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
      await wait(900);
      const afterCheck = { mon: !!(row(kMon)||{}).checked?.[wk.id],
                           pressedMon: box().getAttribute('aria-pressed') };

      // 2 · walk to Wednesday. The box must READ as done (a weekly is done for the period)
      goto(kWed); await wait(700);
      const wedShowsDone = box().getAttribute('aria-pressed');

      // 3 · UNCHECK from Wednesday's list
      box().dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
      await wait(900);
      const afterUncheck = {
        monRow: !!(row(kMon)||{}).checked?.[wk.id],
        wedRow: !!(row(kWed)||{}).checked?.[wk.id],
        pressed: box().getAttribute('aria-pressed'),
        monPct: (row(kMon)||{}).pct };

      // 4 · RE-CHECK from Wednesday: it lands on the CURRENT day, not back on Monday
      box().dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
      await wait(900);
      const afterRecheck = {
        monRow: !!(row(kMon)||{}).checked?.[wk.id],
        wedRow: !!(row(kWed)||{}).checked?.[wk.id],
        pressed: box().getAttribute('aria-pressed') };

      return { kMon, kWed, id: wk.id, clears, afterCheck, wedShowsDone, afterUncheck, afterRecheck };
    }""")
    if st.get('err'):
        chk("P2b · the weekly toggle round trip", False, st)
    else:
        chk("P2b · checking on Monday writes Monday's row",
            st['afterCheck']['mon'] is True, st['afterCheck'])
        chk("P2c · Wednesday's list shows the weekly as done for the period",
            st['wedShowsDone'] == 'true', st['wedShowsDone'])
        chk("P2d · unchecking from Wednesday CLEARS MONDAY'S entry in `days`",
            st['afterUncheck']['monRow'] is False, st['afterUncheck'])
        chk("P2e · and the period then reads 0 — the box is not pressed anywhere",
            st['afterUncheck']['pressed'] == 'false', st['afterUncheck'])
        chk("P2f · Monday's grade is re-derived, not left stale",
            st['afterUncheck']['monPct'] is not None, st['afterUncheck'])
        chk("P2g · re-checking returns the completion to the CURRENT day, not to Monday",
            st['afterRecheck']['wedRow'] is True and st['afterRecheck']['monRow'] is False,
            st['afterRecheck'])

    # daily standards are unchanged
    dly = await pg.evaluate("""async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const h = window.__MOCK_DB.habits.find(x => x.cadence !== 'weekly');
      const box = () => document.querySelector('[data-tog="'+h.id+'"]');
      const hit = () => box().dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
      const a = box().getAttribute('aria-pressed');
      hit(); await wait(700);
      const b = box().getAttribute('aria-pressed');
      hit(); await wait(700);
      return {a, b, c: box().getAttribute('aria-pressed')}; }""")
    chk("P2h · daily standards toggle both ways, unchanged",
        dly['a'] != dly['b'] and dly['a'] == dly['c'], dly)
    chk("P2i · zero page errors", not errs, errs[:2])
    await b.close()


# =============================================================================================
# P3 · EVERY DAY GETS ITS NUMBER (R70.253)
# Overlaps are counted PER ROW from getBBox(), because two labels on different rows may share an
# x and that is the whole point of the remedy. Counting them together would fail a correct axis.
# =============================================================================================
AXIS_Q = """() => {
  const svg = document.getElementById('vMonth');
  if(!svg) return {err:'no month svg'};
  const labs = [...svg.querySelectorAll('text.xl')].map(t => {
    let b; try { b = t.getBBox(); } catch(e) { b = {x:0,y:0,width:0,height:0}; }
    return {s:t.textContent.trim(), x:b.x, y:+b.y.toFixed(1), w:b.width}; });
  const rows = {};
  labs.forEach(l => { (rows[l.y] = rows[l.y] || []).push(l); });
  let overlaps = 0, worst = null;
  Object.values(rows).forEach(r => { r.sort((a,b) => a.x - b.x);
    for(let i=1;i<r.length;i++){ const g = r[i].x - (r[i-1].x + r[i-1].w);
      if(g < 0){ overlaps++; if(!worst || g < worst.g) worst = {g:+g.toFixed(2), a:r[i-1].s, b:r[i].s}; } } });
  const d = new Date(), inMonth = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  let sats = 0;
  for(let i=1;i<=inMonth;i++) if(new Date(d.getFullYear(), d.getMonth(), i).getDay() === 6) sats++;
  return { axis: svg.getAttribute('data-axis'),
           n: labs.length, want: inMonth, rows: Object.keys(rows).length,
           texts: labs.map(l => +l.s).sort((a,b) => a-b),
           overlaps, worst,
           today: svg.querySelectorAll('text.xl-today').length,
           sat: svg.querySelectorAll('text.xl-sat').length, wantSat: sats,
           dow: svg.querySelectorAll('text.xl2').length };
}"""

async def P3(pw):
    print("\nP3 · all thirty numbers, on two rows")
    for (w, h) in [(1280, 720), (1920, 1080), (2133, 1012), (390, 844)]:
        b, pg, errs = await open_page(pw, w, h)
        a = await pg.evaluate(AXIS_Q)
        tag = "%dx%d" % (w, h)
        if a.get('err'):
            chk("P3 · %s · the month axis renders" % tag, False, a)
            await b.close(); continue
        want = list(range(1, a['want'] + 1))
        chk("P3 · %s · label count == days in month (%d), every number present"
            % (tag, a['want']), a['texts'] == want, {'got': a['n'], 'axis': a['axis']})
        chk("P3 · %s · ZERO pairwise overlaps, measured per row" % tag,
            a['overlaps'] == 0, a['worst'])
        chk("P3 · %s · today is outlined exactly once" % tag, a['today'] == 1, a['today'])
        chk("P3 · %s · Saturday tint count == Saturdays in the month (%d)" % (tag, a['wantSat']),
            a['sat'] == a['wantSat'], {'got': a['sat']})
        chk("P3 · %s · data-axis records the remedy it chose" % tag,
            'remedy=' in (a['axis'] or '') and 'effstep=' in (a['axis'] or ''), a['axis'])
        chk("P3 · %s · zero page errors" % tag, not errs, errs[:2])
        await b.close()


# =============================================================================================
# P4 · THE LIFE GRID FILLS ITS BOX (R70.254)
# The reference is the panel's CONTENT box -- inside its border AND its padding. Leaving the
# border out put a 1px error on three of the four numbers this section is graded on.
# =============================================================================================
LIFE_Q = """() => {
  const panel = document.getElementById('h16Ins'), host = document.getElementById('vWeeks');
  if(!panel || !host) return {err:'no life panel'};
  const svg = host.querySelector('svg');
  if(!svg) return {err:'no life svg'};
  const R = e => { const b = e.getBoundingClientRect();
    return {l:+b.left.toFixed(2), t:+b.top.toFixed(2), r:+b.right.toFixed(2),
            b:+b.bottom.toFixed(2), w:+b.width.toFixed(2), h:+b.height.toFixed(2)}; };
  const cs = getComputedStyle(panel), f = k => parseFloat(cs[k]) || 0;
  const pb = R(panel), sb = R(svg);
  const content = {l: pb.l + f('paddingLeft') + f('borderLeftWidth'),
                   r: pb.r - f('paddingRight') - f('borderRightWidth'),
                   b: pb.b - f('paddingBottom') - f('borderBottomWidth')};
  const vb = (svg.getAttribute('viewBox')||'').split(/\\s+/).map(Number);
  return { padL:+(sb.l-content.l).toFixed(2), padR:+(content.r-sb.r).toFixed(2),
           padB:+(content.b-sb.b).toFixed(2),
           edgeL:+(sb.l-pb.l).toFixed(2), edgeR:+(pb.r-sb.r).toFixed(2),
           edgeB:+(pb.b-sb.b).toFixed(2),
           token:{l:f('paddingLeft')+f('borderLeftWidth'), r:f('paddingRight')+f('borderRightWidth'),
                  b:f('paddingBottom')+f('borderBottomWidth')},
           cell: host.getAttribute('data-cell'),
           cellW:+host.getAttribute('data-cellw'), cellH:+host.getAttribute('data-cellh'),
           // 1:1 means preserveAspectRatio has nothing to scale away, which is what stopped the
           // attribute from describing something other than the picture.
           scale: +Math.min(sb.w/(vb[2]||1), sb.h/(vb[3]||1)).toFixed(4),
           ages: [...svg.querySelectorAll('text.wl')].filter(t => !t.classList.contains('wlx')).length,
           agesInside: [...svg.querySelectorAll('text.wl')].filter(t => {
             if(t.classList.contains('wlx')) return false;
             const r = t.getBoundingClientRect();
             return r.left >= sb.l - 0.5 && r.right <= sb.r + 0.5; }).length };
}"""

async def P4(pw):
    print("\nP4 · the life grid fills its box, and the box keeps its padding")
    for (w, h) in [(1280, 720), (1920, 1080), (2133, 1012)]:
        b, pg, errs = await open_page(pw, w, h)
        m = await pg.evaluate(LIFE_Q)
        t = "%dx%d" % (w, h)
        if m.get('err'):
            chk("P4 · %s · the life grid renders" % t, False, m); await b.close(); continue
        chk("P4 · %s · grid box == content box within 1px on left, right and bottom" % t,
            abs(m['padL']) <= 1 and abs(m['padR']) <= 1 and abs(m['padB']) <= 1,
            {'L': m['padL'], 'R': m['padR'], 'B': m['padB']})
        chk("P4 · %s · the gap to the panel edge is the SAME on all three sides it touches" % t,
            m['edgeL'] == m['edgeR'] == m['edgeB'],
            {'L': m['edgeL'], 'R': m['edgeR'], 'B': m['edgeB']})
        chk("P4 · %s · and that gap IS the panel's padding token" % t,
            abs(m['edgeL'] - m['token']['l']) <= 1 and abs(m['edgeB'] - m['token']['b']) <= 1,
            {'edge': m['edgeL'], 'token': m['token']})
        # 1:1 to within a rounding of the drawn size against a fractional box (673.91px, not 674).
        # The pre-P4 build measured 0.9124 here at 1280, which is the 110px of dead width.
        chk("P4 · %s · the svg draws 1:1 — nothing is letterboxed away (scale %s)" % (t, m['scale']),
            m['scale'] >= 0.999, m['scale'])
        chk("P4 · %s · data-cell records BOTH dimensions (%s)" % (t, m['cell']),
            'x' in str(m['cell']) and m['cellW'] > 0 and m['cellH'] > 0, m['cell'])
        chk("P4 · %s · age labels every 10 years are present and inside their gutter" % t,
            m['ages'] >= 10 and m['agesInside'] == m['ages'], m)
        chk("P4 · %s · zero page errors" % t, not errs, errs[:2])
        await b.close()


# =============================================================================================
# P5 · THE RULES BREATHE AND THE ROWS STOP SHOUTING (R70.255 + R70.262)
# Clipping is asked of the GLYPHS, not of the box: a line-height that cuts a descender leaves the
# element's own rectangle intact, which is why the defect survived every box measurement so far.
# The test compares each name's rendered text height against its font's own line box.
# =============================================================================================
ROWS_Q = """() => {
  const log = document.getElementById('log');
  if(!log) return {err:'no #log'};
  const px = v => parseFloat(v) || 0;
  const grp = [...log.querySelectorAll('.grp')].map(e => { const c = getComputedStyle(e);
    return {txt:(e.textContent||'').trim(), pt:px(c.paddingTop), pb:px(c.paddingBottom),
            color:c.color, bb:c.borderBottomWidth+' '+c.borderBottomColor,
            lh:px(c.lineHeight)/px(c.fontSize)}; });
  const names = [...log.querySelectorAll('.li .nm')].map(e => { const c = getComputedStyle(e);
    // the glyph box the browser actually laid out, against the line box it was given
    const r = document.createRange(); r.selectNodeContents(e);
    const tr = r.getBoundingClientRect(); const br = e.getBoundingClientRect();
    return {txt:(e.textContent||'').trim().slice(0,20),
            ratio:+(px(c.lineHeight)/px(c.fontSize)).toFixed(3),
            fs:px(c.fontSize), color:c.color,
            clipped: tr.height > 0 && (tr.top < br.top - 0.5 || tr.bottom > br.bottom + 0.5)}; });
  const rows = [...log.querySelectorAll('.li')].map(e => { const c = getComputedStyle(e);
    return {bg:c.backgroundColor,
            borders:[c.borderTopWidth,c.borderRightWidth,c.borderLeftWidth].map(px),
            sep:px(c.borderBottomWidth), sepColor:c.borderBottomColor}; });
  const pencils = [...log.querySelectorAll('.li .edp')].map(e => { const c = getComputedStyle(e);
    return {b:[c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth].map(px),
            w:+e.getBoundingClientRect().width.toFixed(0),
            h:+e.getBoundingClientRect().height.toFixed(0)}; });
  const add = [...log.querySelectorAll('.eadd,[data-add]')].map(e => { const c = getComputedStyle(e);
    return {txt:(e.textContent||'').trim().slice(0,24), pt:px(c.paddingTop), pl:px(c.paddingLeft),
            h:+e.getBoundingClientRect().height.toFixed(2), color:c.color}; });
  const liPad = log.querySelector('.li') ? px(getComputedStyle(log.querySelector('.li')).paddingLeft) : null;
  return {grp, names, rows, pencils, add, liPad,
          rowsTotal: log.querySelectorAll('.li').length};
}"""

async def P5(pw):
    print("\nP5 · the rules breathe and the rows stop shouting")
    css = src(SRC_CSS)
    # the completion styles are everything that selects a row, a rule or the add control.
    comp = [ln for ln in css.split('\n')
            if re.search(r'\.li\b|\.grp\b|\.eadd\b|#log\b|#h18Comp\b', ln)]
    white = [ln.strip() for ln in comp if re.search(r'#fff\b|#ffffff\b', ln, re.I)]
    chk("P5a · grep: zero #fff / #FFFFFF anywhere in the completion styles",
        not white, white[:3])

    for (w, h) in [(1280, 720), (2133, 1012), (390, 844)]:
        b, pg, errs = await open_page(pw, w, h, flags={'__BIGSET': True})
        m = await pg.evaluate(ROWS_Q)
        t = "%dx%d" % (w, h)
        if m.get('err'):
            chk("P5 · %s · the list renders" % t, False, m); await b.close(); continue
        chk("P5 · %s · every group rule has 6px above and 6px below" % t,
            m['grp'] and all(g['pt'] == 6 and g['pb'] == 6 for g in m['grp']),
            [(g['txt'], g['pt'], g['pb']) for g in m['grp']][:4])
        chk("P5 · %s · row text line-height >= 1.35" % t,
            m['names'] and all(n['ratio'] >= 1.35 for n in m['names']),
            [(n['txt'], n['ratio']) for n in m['names']][:3])
        chk("P5 · %s · no name is clipped by its own line box" % t,
            not any(n['clipped'] for n in m['names']),
            [n for n in m['names'] if n['clipped']][:3])
        chk("P5 · %s · rows carry NO fill and NO box border — one separator only" % t,
            all(r['bg'] in ('rgba(0, 0, 0, 0)', 'transparent') and sum(r['borders']) == 0
                and r['sep'] <= 1 for r in m['rows']),
            [r for r in m['rows'] if sum(r['borders']) or r['sep'] > 1][:2])
        chk("P5 · %s · the separator token is the same on the rules and the rows" % t,
            len({g['bb'] for g in m['grp']} |
                {'%dpx %s' % (r['sep'], r['sepColor']) for r in m['rows']}) == 1,
            {'grp': [g['bb'] for g in m['grp']][:1],
             'row': ['%dpx %s' % (r['sep'], r['sepColor']) for r in m['rows']][:1]})
        chk("P5 · %s · the pencil keeps its hit target and loses its box" % t,
            m['pencils'] and all(sum(p['b']) == 0 and p['w'] >= 28 and p['h'] >= 28
                                 for p in m['pencils']),
            m['pencils'][:2])
        chk("P5 · %s · '+ ADD STANDARD TO x' is a row with a row's padding, not a caption" % t,
            m['add'] and all(a['pt'] >= 2 for a in m['add']),
            [(a['txt'], a['pt'], a['h']) for a in m['add']][:3])
        chk("P5 · %s · zero page errors" % t, not errs, errs[:2])
        await b.close()


# =============================================================================================
# P9 · THE DOC MIRROR RETIRES UNBUILT (R70.260)
# =============================================================================================
async def P9(pw):
    print("\nP9 · the Doc mirror retires unbuilt")
    js, css = src(SRC_JS), src(SRC_CSS)
    html = src(os.path.join('standard', 'index.html'))
    pat = re.compile(r'jdoc|h18jset|h18jhint|h18JUrl|h18JTest|script\.google|Send today now', re.I)
    for name, body in (('app.js', js), ('app.css', css), ('index.html', html)):
        hits = pat.findall(body)
        chk("P9 · grep count 0 for the doc code paths in %s" % name, not hits, hits[:4])
    chk("P9 · the setup document is archived, not deleted (DEC-037)",
        os.path.exists(os.path.join('_archive', '2026-09-08_ht20_doc-mirror-retired',
                                    'JOURNAL_DOC_SETUP.md')))
    chk("P9 · and it is gone from ht_batch18",
        not os.path.exists(os.path.join('_reconcile', 'ht_batch18', 'JOURNAL_DOC_SETUP.md')))


# =============================================================================================
# P10 · DETAIL IS A PAGE OF BOXES (R70.261)
# The labels are asserted VERBATIM against the wire's own list, because "every metric labelled
# exactly as written above" is the acceptance and a paraphrase would pass a looser check.
# =============================================================================================
# HT-21 S4 AMENDMENT (named in the HT-21 receipt): S4 re-levelled this page — four tiles and
# four measures on the surface, the rest one tap down in MORE — and added `Sleep vs rating`.
# The set below is therefore what P10 built PLUS S4's addition, and the order is no longer
# asserted because the two levels interleave. R70.138 is the check that matters: every measure
# P10 shipped is still on the page, which is asserted as a SUPERSET, not as a sequence.
P10_LABELS = ['Today %', '7 days %', '30 days %', '90 days %', 'Days in a row at 100%',
              'Planned vs done', 'Average rating 7d / 30d',
              'Strongest 3', 'Weakest 3', 'By group 30-day %', 'Completion → rating',
              'Usual time per standard', 'On time %']

OPEN_DETAIL = """async () => {
  const m = document.querySelector('[data-h18more]');
  if(!m) return {err:'no DETAIL door'};
  m.click();
  await new Promise(r => setTimeout(r, 800));
  const det = document.querySelector('.h20det'), d = document.getElementById('h18Draw');
  if(!det) return {err:'DETAIL did not build'};
  const g = document.querySelector('.h20grid');
  return { labels: [...document.querySelectorAll('.h20k')].map(e => e.textContent),
           boxes: document.querySelectorAll('.h20box').length,
           unknowns: [...document.querySelectorAll('.h20unk')].map(e => e.textContent),
           blanks: [...document.querySelectorAll('.h20v')].filter(e => !e.textContent.trim()).length,
           fits: det.scrollWidth === det.clientWidth,
           sw: det.scrollWidth, cw: det.clientWidth,
           cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
           width: Math.round(d.getBoundingClientRect().width),
           frame: Math.round((document.querySelector('.grid')||document.body).getBoundingClientRect().width),
           overflowX: getComputedStyle(det).overflowX,
           closes: !!det.querySelector('.h20x'),
           groupCols: document.querySelectorAll('.h20det table thead th').length };
}"""

async def P10(pw):
    print("\nP10 · detail is a page of boxes, in words he uses")
    css = src(SRC_CSS)
    # from the START of the comment block, so the opening `/*` is inside the slice and the
    # stripper below can actually match it -- otherwise the prose survives and fails its own claim.
    i = css.find('P10 · DETAIL IS A PAGE OF BOXES')
    block = css[css.rfind('/*', 0, i):]
    # a DECLARATION, not the prose that explains why there isn't one: comments are stripped first.
    decls = re.sub(r'/\*.*?\*/', '', block, flags=re.S)
    chk("P10a · `overflow-x` is declared nowhere in the DETAIL styles",
        'overflow-x' not in decls, [l for l in decls.split('\n') if 'overflow-x' in l][:2])

    for (w, h) in [(1280, 720), (2133, 1012)]:
        b, pg, errs = await open_page(pw, w, h, flags={'__BIGSET': True})
        m = await pg.evaluate(OPEN_DETAIL)
        t = "%dx%d" % (w, h)
        if m.get('err'):
            chk("P10 · %s · DETAIL opens from the GROUP door" % t, False, m)
            await b.close(); continue
        chk("P10 · %s · scrollWidth == clientWidth — no sideways scroll" % t,
            m['fits'], {'sw': m['sw'], 'cw': m['cw']})
        chk("P10 · %s · every metric P10 shipped is still on the page (R70.138)" % t,
            all(x in m['labels'] for x in P10_LABELS),
            {'missing': [x for x in P10_LABELS if x not in m['labels']]})
        chk("P10 · %s · the page fits the viewport width, not the LIFE column" % t,
            m['width'] >= m['frame'] - 4, {'page': m['width'], 'frame': m['frame']})
        chk("P10 · %s · the boxes lay out in a wrapping grid, more than one across" % t,
            m['cols'] >= 4, m['cols'])
        chk("P10 · %s · no metric renders blank" % t, m['blanks'] == 0, m['blanks'])
        chk("P10 · %s · the page carries its own way out" % t, m['closes'], m)
        chk("P10 · %s · the GROUP row carries member/today/30 days/days logged/rank" % t,
            m['groupCols'] >= 5, m['groupCols'])
        chk("P10 · %s · zero page errors" % t, not errs, errs[:2])
        await b.close()

    # the phone stacks. The door is desktop-only, so it is opened at 1280 and the viewport is
    # then narrowed -- which is also the resize path a person on a tablet actually takes.
    b = await pw.chromium.launch()
    pg = await b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(3300)
    await pg.evaluate(OPEN_DETAIL)
    await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(1200)
    # HT-21 S4 amendment: the DETAIL door is desktop-only, so at 390 the drawer's panel is
    # display:none and a measurement taken on it returns SPECIFIED values, not used ones — the
    # old form of this check was reading a hidden element. The VIEWS tab is opened so the numbers
    # are real, and S4 puts the four tiles two-up on a phone rather than one.
    await pg.evaluate("() => document.documentElement.setAttribute('data-vtab','views')")
    await pg.wait_for_timeout(700)
    ph = await pg.evaluate("""() => {
        const det=document.querySelector('.h20det'), g=document.querySelector('.h20grid');
        if(!det||!g||!det.getClientRects().length) return {err:'DETAIL not visible at 390'};
        return { cols:getComputedStyle(g).gridTemplateColumns.split(' ').length,
                 fits: det.scrollWidth===det.clientWidth,
                 pageNoHScroll: document.documentElement.scrollWidth <= window.innerWidth+1 }; }""")
    chk("P10 · 390 · the phone stacks (at most two across) and does not scroll sideways",
        ph.get('cols', 9) <= 2 and ph.get('fits') and ph.get('pageNoHScroll'), ph)
    await b.close()

    # UNKNOWN, never a blank, on a fixture with under a week of history
    b, pg, errs = await open_page(pw, 1280, 720, flags={'__FEWDAYS': True})
    m = await pg.evaluate(OPEN_DETAIL)
    chk("P10 · a fixture with under 7 days renders UNKNOWN, not blank",
        not m.get('err') and m['blanks'] == 0 and len(m['unknowns']) >= 4,
        {'blanks': m.get('blanks'), 'unknowns': len(m.get('unknowns') or [])})
    chk("P10 · and the UNKNOWNs say the word", all(u == 'UNKNOWN' for u in (m.get('unknowns') or [])),
        (m.get('unknowns') or [])[:3])
    await b.close()


# =============================================================================================
# P6 · ONE VAULT — the shelf as STAGED (CC HT does not write master-brain; CC_STANDING §2)
# =============================================================================================
async def P6(pw):
    print("\nP6 · the journal shelf, staged for the Brain")
    import glob
    dirs = sorted(glob.glob(os.path.join('_reconcile', 'brain_inbox', 'HT', '*_journal-shelf')))
    chk("P6a · the shelf is staged in brain_inbox/HT", bool(dirs), dirs)
    if not dirs:
        return
    root = dirs[-1]
    j = os.path.join(root, 'journal')
    notes = glob.glob(os.path.join(j, '2026', '*.md'))
    chk("P6b · one note per logged day (13)", len(notes) == 13, len(notes))
    chk("P6c · INDEX.md is generated", os.path.exists(os.path.join(j, 'INDEX.md')))
    chk("P6d · the pre-log archive is carried across",
        os.path.exists(os.path.join(j, '_archive', 'pre-2026-08-11.md')))
    tsv = os.path.join(root, 'CATALOG_ROWS.tsv')
    rows = [l for l in src(tsv).strip().split('\n')[1:] if l.strip()]
    chk("P6e · ONE catalog row for the shelf, never one per day", len(rows) == 1, len(rows))
    chk("P6f · the row is domain 01, PRIVATE, and resolves to a FILE (catalog_check C1)",
        len(rows) == 1 and rows[0].split('\t')[3] == '01'
        and rows[0].split('\t')[5] == 'PRIVATE'
        and rows[0].split('\t')[2].endswith('.md'),
        rows[0].split('\t')[:6] if rows else None)
    # CC BEV created `master-brain/journal/` as an EMPTY layer on 2026-09-09 (commit b3ee686,
    # R70.283's predecessor id) with nothing in it but a .gitkeep. Its existence is therefore not
    # evidence that CC HT wrote there -- the question is whether any journal CONTENT is in it.
    mb = os.path.join('master-brain', 'journal')
    content = []
    for dp, _, fn in os.walk(mb):
        content += [f for f in fn if f.endswith('.md')]
    chk("P6g · CC HT wrote no journal content into master-brain (CC_STANDING §2)",
        not content, content[:4])
    chk("P6h · the vault is not dismantled before the shelf lands (DEC-037)",
        os.path.isdir(os.path.join('journal', 'days')))


# =============================================================================================
# P8 · A WEEK OPENS ITS DAYS (closes HT-19 B4)
# =============================================================================================
async def P8(pw):
    print("\nP8 · every logged day is a note, and a week opens its days")
    import glob
    notes = sorted(glob.glob(os.path.join(
        '_reconcile', 'brain_inbox', 'HT', '*_journal-shelf', 'journal', '2026', '*.md')))
    chk("P8a · the backfill covers every logged day since 2026-08-11", len(notes) == 13, len(notes))
    chk("P8b · and it starts at 2026-08-11",
        bool(notes) and os.path.basename(notes[0]) == '2026-08-11.md',
        os.path.basename(notes[0]) if notes else None)

    b, pg, errs = await open_page(pw, 1280, 720)
    r = await pg.evaluate("""async () => {
      const cells=[...document.querySelectorAll('#vWeeks [data-wk]')];
      if(!cells.length) return {err:'no week cells carry data-wk'};
      cells[cells.length-1].dispatchEvent(new MouseEvent('click',{bubbles:true}));
      await new Promise(r=>setTimeout(r,450));
      const days=[...document.querySelectorAll('.h20wkd')];
      const clickable=days.filter(d=>!d.disabled);
      const before=document.getElementById('mDate').textContent;
      if(clickable.length) clickable[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));
      await new Promise(r=>setTimeout(r,700));
      return { opened:true, days:days.length, clickable:clickable.length,
               labels:days.slice(0,2).map(d=>d.textContent.trim()),
               closed: !document.getElementById('h20wk'),
               before, after: document.getElementById('mDate').textContent }; }""")
    if r.get('err'):
        chk("P8c · clicking a week on the life grid opens a picker", False, r)
    else:
        chk("P8c · clicking a week opens a picker of that week's SEVEN days", r['days'] == 7, r)
        chk("P8d · future days are listed but not clickable",
            0 < r['clickable'] <= 7, r['clickable'])
        chk("P8e · the weekday is printed once, not twice",
            all(not re.match(r'^(\w{3})\1', l) for l in r['labels']), r['labels'])
        chk("P8f · picking a day calls goDay — the masthead moves to it",
            r['after'] != r['before'] and 'logging back' in r['after'], r)
        chk("P8g · and the picker closes behind the pick", r['closed'], r)
    chk("P8h · zero page errors", not errs, errs[:2])
    await b.close()


SECTIONS = {'P1': P1, 'P1a': P1a, 'P2': P2, 'P3': P3, 'P4': P4, 'P5': P5,
            'P6': P6, 'P8': P8, 'P9': P9, 'P10': P10}


async def main(only):
    async with async_playwright() as pw:
        for k, fn in SECTIONS.items():
            if only and k != only:
                continue
            await fn(pw)
    ok = sum(1 for r, _ in RES if r)
    print("\nGOLDEN HT-20: %d/%d PASS, %d FAIL" % (ok, len(RES), len(RES) - ok))
    sys.exit(0 if ok == len(RES) else 1)

ap = argparse.ArgumentParser()
ap.add_argument('--only', default=None)
asyncio.run(main(ap.parse_args().only))
