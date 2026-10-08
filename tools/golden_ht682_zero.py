#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 682 GOLDEN — ON THE MONTH AND YEAR CHARTS A ZERO IS A POINT, NEVER A GAP. Run at 1280 and 390.

From the first day HT holds any record through today, every x position plots a point for BOTH series;
a day or month that held nothing plots at 0 on the baseline (the rating line's 0 in the F colour), and
the line runs through it. Only positions ahead of today, and positions before the first record, stay
blank. Two halves, each at both widths:

  DATA — the real point builders `window.__HT16.monthPoints` / `yearPoints`, driven by the fixture's
         `__GAP=40` (nothing logged in the last 40 days, so the current month and its sibling months are
         empty-but-in-span). Expectations are computed from the PAGE'S OWN `today()`, so the golden is
         deterministic on any calendar day:
    D1  every in-span day of the current month plots 0 on BOTH series (c===0, r===0);
    D2  every day after today is blank (c===null) — a future day shows no point;
    D3  the first-record boundary holds: on the YEAR chart, a month before the first record is blank
        and a month still ahead is blank, while every in-span month is a point (an empty one at 0 —
        the Sept-style gap that used to be null now reads 0);
    D4  at least one in-span month plots as exactly 0 (the zero is real, not just non-null).

  RENDER — a crafted series through `window.__HT16.h16Chart`, independent of the clock:
    R1  a 0 on the completion series and a 0 on the rating series draw a dot ON THE BASELINE (cy=py(0));
    R2  the completion line is a SINGLE path that passes THROUGH the zero (3 vertices, no gap element,
        no dashed bridge — job 656's bridge is gone and must not return);
    R3  a leading null (before the first record) and a trailing null (future) draw NO dot;
    R4  the rating line's 0 reads as the F colour — its dot's computed fill resolves to `--g0`;
    R5  zero page errors at this width.

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


def _rgb(s):
    """Any computed colour / hex -> (r,g,b), or None."""
    s = (s or '').strip()
    m = re.match(r'rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)', s)
    if m:
        return tuple(int(round(float(m.group(i)))) for i in (1, 2, 3))
    m = re.match(r'#([0-9A-Fa-f]{6})$', s)
    if m:
        h = m.group(1); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    m = re.match(r'#([0-9A-Fa-f]{3})$', s)
    if m:
        h = m.group(1); return tuple(int(h[i]*2, 16) for i in range(3))
    return None


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
  const mp = H.monthPoints().map(p => ({ x:p.x, c:p.c, r:p.r }));
  const yp = H.yearPoints().map(p => ({ x:p.x, c:p.c, r:p.r }));
  return { today, year:(new Date()).getFullYear(), month:(new Date()).getMonth(),
           dom:(new Date()).getDate(), domCount:new Date((new Date()).getFullYear(),
           (new Date()).getMonth()+1, 0).getDate(), mp, yp };
}"""

# a crafted series: before-first (null), logged, an empty-day ZERO, logged, future (null)
SERIES = """[
  {x:'1',x2:'Mon',key:'z-1',c:null,r:null, full:'before first record'},
  {x:'2',x2:'Tue',key:'z-2',c:100, r:8,    full:'logged'},
  {x:'3',x2:'Wed',key:'z-3',c:0,   r:0,    full:'empty day, drawn 0'},
  {x:'4',x2:'Thu',key:'z-4',c:80,  r:6,    full:'logged'},
  {x:'5',x2:'Fri',key:'z-5',c:null,r:null, full:'future'}
]"""

RENDER = """() => {
  const series = """ + SERIES + """;
  const H = window.__HT16;
  let host = document.getElementById('ztHost');
  if(!host){ host = document.createElement('div'); host.id='ztHost'; host.className='chart';
    host.style.width='600px'; host.innerHTML='<svg id="ztSvg"></svg>'; document.body.appendChild(host); }
  H.h16Chart('ztSvg', series, { attr:'data-vgd', height:196 });
  const svg = document.getElementById('ztSvg');
  const cy = sel => Array.prototype.slice.call(svg.querySelectorAll(sel))
                      .map(e => +(+e.getAttribute('cy')).toFixed(1));
  const paths = Array.prototype.slice.call(svg.querySelectorAll('path.ln-c'));
  const rf = svg.querySelector('circle.dot-r-f');
  return {
    dotC: cy('circle.dot-c'), dotR: cy('circle.dot-r'),
    nPathC: paths.length,
    dPathC: paths.length ? paths[0].getAttribute('d') : '',
    hasGap: !!svg.querySelector('.ln-c-gap'),
    rfCy: rf ? +(+rf.getAttribute('cy')).toFixed(1) : null,
    rfFill: rf ? getComputedStyle(rf).fill : null,
    g0: getComputedStyle(document.documentElement).getPropertyValue('--g0').trim()
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

    today = d['today']
    tdate = datetime.date(*(int(x) for x in today.split('-')))
    # D1/D2 — the current month: in-span (<= today) is 0 on both series; after today is blank
    mp = d['mp']; dom = d['dom']; dcount = d['domCount']
    m_inspan_ok = all((p['c'] == 0 and p['r'] == 0) for i, p in enumerate(mp) if (i + 1) <= dom)
    m_future_ok = all((p['c'] is None and p['r'] is None) for i, p in enumerate(mp) if (i + 1) > dom)
    chk("%s · D1 every in-span day of the month plots 0 on both series" % label, m_inspan_ok,
        [(p['x'], p['c'], p['r']) for p in mp[:dom]])
    chk("%s · D2 every day after today is blank (a future day shows no point)" % label, m_future_ok,
        [(p['x'], p['c'], p['r']) for p in mp[dom:]])
    chk("%s · D1b at least one in-span day is a drawn 0 (c===0, r===0)" % label,
        any(p['c'] == 0 and p['r'] == 0 for p in mp[:dom]), dom)

    # D3 — the year: blank iff out of span; a point (an empty one at 0) iff in span
    first_mo = (tdate - datetime.timedelta(days=73)).strftime('%Y-%m')
    tody_mo = today[:7]
    yp = d['yp']
    def in_span(m):
        mk = '%04d-%02d' % (d['year'], m + 1)
        return first_mo <= mk <= tody_mo
    y_vec_ok = all((yp[m]['c'] is None) == (not in_span(m)) for m in range(12))
    chk("%s · D3 year: a month is blank iff out of span (before first / ahead), else a point" % label,
        y_vec_ok, {'first_mo': first_mo, 'tody_mo': tody_mo,
                   'yp': [(p['x'], p['c']) for p in yp]})
    # D4 — at least one in-span month plots as exactly 0 (the gap that was null now reads 0)
    zero_months = [yp[m]['c'] for m in range(12) if in_span(m) and yp[m]['c'] == 0]
    chk("%s · D4 at least one in-span month plots as a real 0" % label, len(zero_months) >= 1,
        [(p['x'], p['c']) for p in yp])

    # ---------------------------------------------------------------- RENDER (crafted series)
    r = await pg.evaluate(RENDER)
    dotc, dotr = r['dotC'], r['dotR']
    chk("%s · R0 three completion dots and three rating dots (the 2 nulls draw none)" % label,
        len(dotc) == 3 and len(dotr) == 3, {'dotC': dotc, 'dotR': dotr})

    if dotc and dotr:
        base_c = max(dotc)                                   # the 0-day sits on the baseline (largest cy)
        base_r = max(dotr)
        logged_c = [v for v in dotc if abs(v - base_c) > 0.5]
        # R1 — the zero is on the baseline, and the two series' zeros share it
        chk("%s · R1 the completion 0 and the rating 0 sit on one baseline (py(0))" % label,
            abs(base_c - base_r) <= 0.5 and len(logged_c) == 2 and all(v < base_c for v in logged_c),
            {'dotC': dotc, 'dotR': dotr})
    else:
        chk("%s · R1 baseline measurable" % label, False, r)

    # R2 — a single completion path with 3 vertices (M + 2 L), running THROUGH the zero; no gap/bridge
    d_path = r['dPathC'] or ''
    verts = len(re.findall(r'[ML]', d_path))
    chk("%s · R2 one completion path of 3 vertices passes through the zero (no gap, no bridge)" % label,
        r['nPathC'] == 1 and verts == 3 and not r['hasGap'], r)

    # R4 — the rating 0 dot reads as the F colour (--g0)
    rf = _rgb(r['rfFill']); g0 = _rgb(r['g0'])
    chk("%s · R4 the rating line's 0 is drawn in the F colour (--g0)" % label,
        rf is not None and g0 is not None and rf == g0, {'rfFill': r['rfFill'], 'g0': r['g0']})
    # R4b — the F-coloured dot is the one on the baseline (it is the zero, not a logged rating)
    chk("%s · R4b the F-coloured dot is the baseline (0) dot" % label,
        r['rfCy'] is not None and dotr and abs(r['rfCy'] - max(dotr)) <= 0.5,
        {'rfCy': r['rfCy'], 'dotR': dotr})

    # R5 — no page errors
    chk("%s · R5 zero page errors" % label, not errs, errs)
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
