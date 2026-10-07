#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-651 S1 GOLDEN — ZERO IS A POINT, A GAP IS A GAP (paste 651 S1 / 656 S2), at 390 and 1280.

A crafted completion/rating series is rendered through window.__HT16.h16Chart into a test SVG - a
checked day, two due-but-unchecked days (drawn 0), a nothing-due day (a gap), and unrated days:

  Z1  a due-but-unchecked day is DRAWN as a 0 point - the two 0-days share one completion dot height,
      distinct from the 100-days, so a 0 is a point on the line, not a hole (Cory's item 4).
  Z2  a nothing-due gap is BRIDGED by a dashed segment (rect.ln-c-gap) so the line reads unbroken
      first->today; the bridge's stroke-dasharray is not 'none'.
  Z3  an unrated day draws NO rating point - only the two rated days carry a rating dot (never a 0:
      a 0 is not a rating - Stephen Few; Datawrapper, missing data is never drawn as zero).
  Z4  the reference mean ('30d N%') is the mean of LOGGED days only (100), never 50 - the drawn 0s
      move no average (the section changes what is drawn, nothing that is computed).
  Z5  zero page errors at either width.

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
import asyncio, sys
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

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:220])))

# A fixed series: a dot per day. c = the logged pct (null = never saved); cd = the DRAWN value
# (0 for a due-but-unchecked day, null for a nothing-due gap); r = the rating (null = unrated).
SERIES = """[
  {x:'1',x2:'Mon',key:'z-1',c:100, cd:100, r:8,    done:null,total:null,full:'day 1'},
  {x:'2',x2:'Tue',key:'z-2',c:null,cd:0,   r:null, done:null,total:null,full:'day 2 (due, unchecked)'},
  {x:'3',x2:'Wed',key:'z-3',c:null,cd:null, r:null, done:null,total:null,full:'day 3 (nothing due)'},
  {x:'4',x2:'Thu',key:'z-4',c:null,cd:0,   r:null, done:null,total:null,full:'day 4 (due, unchecked)'},
  {x:'5',x2:'Fri',key:'z-5',c:100, cd:100, r:6,    done:null,total:null,full:'day 5'}
]"""

async def open_page(pw, w, h):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2200)
    return b, pg, errs


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)

    data = await pg.evaluate(
        "() => {"
        "  const series=" + SERIES + ";"
        "  const H=window.__HT16; if(!H||!H.h16Chart) return {err:'no h16Chart'};"
        "  let host=document.getElementById('ztHost');"
        "  if(!host){ host=document.createElement('div'); host.id='ztHost'; host.className='chart';"
        "    host.innerHTML='<svg id=\\'ztSvg\\'></svg>'; document.body.appendChild(host); }"
        "  H.h16Chart('ztSvg', series, {attr:'data-vgd', height:196});"
        "  const svg=document.getElementById('ztSvg');"
        "  const cy=n=>Array.from(svg.querySelectorAll(n)).map(e=>+(+e.getAttribute('cy')).toFixed(1));"
        "  const gap=svg.querySelector('.ln-c-gap');"
        "  const dash=gap?getComputedStyle(gap).strokeDasharray:'';"
        "  const reflab=(svg.querySelector('.reflab')||{}).textContent||'';"
        "  return { dotC:cy('circle.dot-c'), dotR:svg.querySelectorAll('circle.dot-r').length,"
        "           hasGap:!!gap, dash:dash, hasSolid:!!svg.querySelector('path.ln-c'), reflab:reflab };"
        "}")

    if data.get('err'):
        chk("%s · __HT16.h16Chart is exposed" % label, False, data)
        await b.close(); return
    chk("%s · __HT16.h16Chart is exposed" % label, True)

    dotc = sorted(data.get('dotC') or [])
    distinct = sorted(set(dotc))
    # two 0-days share the bottom (largest cy) and the two 100-days share the top (smallest cy)
    zero_point = len(dotc) == 4 and len(distinct) == 2 and dotc.count(distinct[-1]) == 2 and dotc.count(distinct[0]) == 2
    chk("%s · a due-but-unchecked day is drawn as a 0 point (two 0-dots at one height)" % label,
        zero_point, dotc)

    chk("%s · a nothing-due gap is bridged by a dashed segment (ln-c-gap, dasharray != none)" % label,
        data.get('hasGap') and data.get('dash') not in ('', 'none', None), data.get('dash'))

    chk("%s · the completion line still draws its solid runs on top of the bridge" % label,
        data.get('hasSolid'), data)

    chk("%s · an unrated day draws no rating point (only the 2 rated days carry a dot)" % label,
        data.get('dotR') == 2, data.get('dotR'))

    chk("%s · the reference mean is the logged-days mean (100%%), the drawn 0s move no average" % label,
        '100%' in (data.get('reflab') or ''), data.get('reflab'))

    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-651-ZERO: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
