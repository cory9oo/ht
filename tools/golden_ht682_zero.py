#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 682 GOLDEN — AMENDED BY NAME, PASTE 819 (R67.2): the month/year charts are ONE LINE CHART now,
and the zero rule is a GAP or a hollow point, not a stub. Run at 1280 and 390.

819 (Cory 2026-10-11): back to a line chart, both series on one 0-100 axis, and "remove the points for
zero days". The zero rule becomes:
  - an unlogged PAST day is a GAP — NO completion point (it still counts as 0 in the average, so the
    header figure still sees it, but no dot is drawn and the line breaks across it);
  - a LOGGED 0% is a small HOLLOW point at 0 (the truth stays visible, quietly);
  - a FUTURE day (out of span) is NOTHING;
  - a rating a day never had is a GAP on the rating line — a rating is never 0.

  DATA — the real point builders `window.__HT16.monthPoints` / `yearPoints`, driven by the fixture's
         `__GAP=40` (nothing logged in the last 40 days, so the current month and its sibling months are
         empty-but-in-span). Expectations are computed from the PAGE'S OWN `today()` (UNCHANGED by 819 —
         the data is the same; only the DRAWING changed from stubs to gaps/points):
    D1  every in-span day of the current month has completion c===0 (unlogged counts as 0) AND the
        rating rv===null (an unrated day is a GAP, never a 0);
    D2  every day after today is blank (c===null) — a future day shows no point;
    D3  the year: a month is blank (c===null) iff out of span (before first / ahead), else a point;
    D4  at least one in-span month has c===0 (the empty-but-in-span month).

  RENDER — a crafted series through `window.__HT16.barLineChart`, independent of the clock:
    R1  the logged days draw completion POINTS and a line, and there are NO bars (.bl-bar count 0);
    R2  an unlogged in-span day is a GAP (no completion point) and a logged 0% is a HOLLOW point at 0
        (one .bl-cdot.bl-hollow; three .bl-cdot total for the three logged days, none for the unlogged);
    R3  a rating dot only on rated days, and NO line across the gap between two non-adjacent rated days;
    R4  there is NO right axis (.ax2);
    R5  the dashed need line (.bl-need) is drawn;
    R6  zero page errors.

R134 R1: prints its assertion count; a section that asserts nothing is a FAIL.
"""
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
_os.chdir(_ESTATE)
import asyncio, re, sys, datetime
from playwright.async_api import async_playwright
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

def fixture_dir(estate):
    for d in (_os.environ.get('HT_FIXTURE_DIR'), _os.path.join(estate, '_machine', 'ht3'),
              _os.path.join(estate, 'ht3')):
        if d and _os.path.isdir(d):
            return d
    return _os.path.join(estate, '_machine', 'ht3')

BASE = 'file://' + _os.path.join(fixture_dir(_ESTATE), 'index.html').replace(_os.sep, '/')

GAP = 40   # the fixture seam: nothing logged in the last 40 days (NDAYS=34, so the span is ~73 days)

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:220])))


async def open_page(pw, w, h):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("window.__GAP=%d;" % GAP)
    await pg.goto(BASE)
    await pg.wait_for_timeout(2400)
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1200)
    return b, pg, errs


DATA = """() => {
  const H = window.__HT16;
  if(!H || !H.monthPoints || !H.yearPoints) return { err:'no __HT16 point builders' };
  const today = H.state().today;
  const mp = H.monthPoints().map(p => ({ x:p.x, c:p.c, rv:p.rv, logged:p.logged }));
  const yp = H.yearPoints().map(p => ({ x:p.x, c:p.c, rv:p.rv, logged:p.logged }));
  return { today, year:(new Date()).getFullYear(), month:(new Date()).getMonth(),
           dom:(new Date()).getDate(), mp, yp };
}"""

# a crafted series for barLineChart: leading null, logged positive, unlogged in-span (dim stub),
# logged 0 (red stub), logged positive, trailing null (future). rv is the real rating, null = a gap.
SERIES = """[
  {x:'1',x2:'Mon',key:'z-1',c:null, rv:null, logged:false, full:'before first record'},
  {x:'2',x2:'Tue',key:'z-2',c:100,  rv:8,    logged:true,  full:'logged'},
  {x:'3',x2:'Wed',key:'z-3',c:0,    rv:null, logged:false, full:'unlogged in-span, dim stub'},
  {x:'4',x2:'Thu',key:'z-4',c:0,    rv:null, logged:true,  full:'logged 0 percent, red stub'},
  {x:'5',x2:'Fri',key:'z-5',c:80,   rv:6,    logged:true,  full:'logged'},
  {x:'6',x2:'Sat',key:'z-6',c:null, rv:null, logged:false, full:'future'}
]"""

RENDER = """() => {
  const series = """ + SERIES + """;
  const H = window.__HT16;
  let host = document.getElementById('ztHost');
  if(!host){ host = document.createElement('div'); host.id='ztHost'; host.className='chart';
    host.style.width='600px'; host.innerHTML='<svg id="ztSvg" class="chart"></svg>'; document.body.appendChild(host); }
  H.barLineChart('ztSvg', series, { attr:'data-vgd' });
  const svg = document.getElementById('ztSvg');
  const n = s => svg.querySelectorAll(s).length;
  return {
    bars: n('.bl-bar'),
    cdots: n('circle.bl-cdot'), hollow: n('circle.bl-cdot.bl-hollow'),
    stars: n('.bl-star'),                 /* PASTE 821: a 100% day is a gold star, not an ordinary dot */
    cline: n('path.bl-cline'),
    rdots: n('circle.bl-rdot'), rlines: n('path.bl-rline'),
    rightAxis: n('.ax2'), needLine: n('.bl-need')
  };
}"""


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)

    # ---------------------------------------------------------------- DATA (the real point builders)
    d = await pg.evaluate(DATA)
    if d.get('err'):
        chk("%s · __HT16 point builders present" % label, False, d)
        await b.close(); return
    chk("%s · __HT16 point builders present" % label, True)

    mp = d['mp']; dom = d['dom']
    # D1 — in-span days of the current month: completion 0, rating a GAP (rv null)
    m_c0 = all(p['c'] == 0 for i, p in enumerate(mp) if (i + 1) <= dom)
    m_rvnull = all(p['rv'] is None for i, p in enumerate(mp) if (i + 1) <= dom)
    chk("%s · D1 every in-span day has completion 0 (unlogged counts as 0)" % label, m_c0,
        [(p['x'], p['c']) for p in mp[:dom]])
    chk("%s · D1b and the rating is a GAP on those days (rv===null), never a 0" % label, m_rvnull,
        [(p['x'], p['rv']) for p in mp[:dom]])
    # D2 — future days blank
    m_future = all(p['c'] is None for i, p in enumerate(mp) if (i + 1) > dom)
    chk("%s · D2 every day after today is blank (c===null)" % label, m_future,
        [(p['x'], p['c']) for p in mp[dom:]])

    # D3/D4 — the year: blank iff out of span; at least one in-span month is a 0
    tdate = datetime.date(*(int(x) for x in d['today'].split('-')))
    first_mo = (tdate - datetime.timedelta(days=73)).strftime('%Y-%m')
    tody_mo = d['today'][:7]
    yp = d['yp']
    def in_span(m):
        return first_mo <= ('%04d-%02d' % (d['year'], m + 1)) <= tody_mo
    y_ok = all((yp[m]['c'] is None) == (not in_span(m)) for m in range(12))
    chk("%s · D3 year: a month is blank iff out of span, else a point" % label, y_ok,
        {'first_mo': first_mo, 'tody_mo': tody_mo, 'yp': [(p['x'], p['c']) for p in yp]})
    zero_months = [m for m in range(12) if in_span(m) and yp[m]['c'] == 0]
    chk("%s · D4 at least one in-span month plots as a real 0 (a dim stub, not a gap)" % label,
        len(zero_months) >= 1, [(p['x'], p['c']) for p in yp])

    # ---------------------------------------------------------------- RENDER (crafted series)
    r = await pg.evaluate(RENDER)
    # PASTE 821 amended by name (R67.2): three logged days still get exactly three completion marks, but
    # the 100% day (z-2) is now a GOLD STAR, not an ordinary dot - so two ordinary .bl-cdot + one .bl-star.
    chk("%s · R1 the logged days draw completion marks and a line, and NO bars" % label,
        r['bars'] == 0 and (r['cdots'] + r['stars']) == 3 and r['stars'] == 1 and r['cline'] >= 1, r)
    chk("%s · R2 an unlogged in-span day is a GAP (no point), a logged 0 is one HOLLOW point at 0" % label,
        r['hollow'] == 1 and (r['cdots'] + r['stars']) == 3, r)
    chk("%s · R3 a rating dot only on rated days, no line across the gap between them" % label,
        r['rdots'] == 2 and r['rlines'] == 0, r)
    chk("%s · R4 there is NO right axis" % label, r['rightAxis'] == 0, r)
    chk("%s · R5 the dashed need line is drawn" % label, r['needLine'] == 1, r)
    chk("%s · R6 zero page errors" % label, not errs, errs)
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-682-ZERO: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
