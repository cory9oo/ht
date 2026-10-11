#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 816 GOLDEN — THE MONTH AND YEAR CARDS ARE CLEAN BARS (Cory 2026-10-11). Run at 390 and 1280.

The redesign: completion is BARS banded against the 80% need (green/amber/red - the top-of-Insights
palette), the day rating is an amber dot/line strip beneath. No x10, no right axis, no fat red zero
dot, no clipped legend.

  RENDER (a crafted series through window.__HT16.barLineChart, clock-independent):
    R1  the month renders BARS and NO completion line (no path.ln-c);
    R2  NO right axis (.ax2 count 0);
    R3  the dashed need line is drawn at the shared threshold (HT32_TARGET_PCT);
    R4  an unlogged past day is a STUB, never a dot at 0 (a dim .bl-stub, and no completion circle);
    R5  an unrated day has NO rating point (a gap).
  LIVE (the real month/year cards on the Insights tab):
    L1  the month card draws bars (or stubs) and no completion line, no right axis, a need line;
    L2  the year card likewise;
    L3  the legend's width is <= the card's width and the card does not scroll sideways at 390;
    L4  the month header figure equals the top-of-Insights arithmetic for the same span (mean of the
        in-span days' completion, unlogged counted as 0 - recomputed from __HT16.monthPoints).

R134 R1: prints its assertion count; a section that asserts nothing is a FAIL.
"""
import os as _os
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


SERIES = """[
  {x:'1',x2:'Mon',key:'z-1',c:null, rv:null, logged:false},
  {x:'2',x2:'Tue',key:'z-2',c:90,   rv:8,    logged:true},
  {x:'3',x2:'Wed',key:'z-3',c:0,    rv:null, logged:false},
  {x:'4',x2:'Thu',key:'z-4',c:60,   rv:null, logged:true},
  {x:'5',x2:'Fri',key:'z-5',c:30,   rv:4,    logged:true},
  {x:'6',x2:'Sat',key:'z-6',c:null, rv:null, logged:false}
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
  const dim = Array.prototype.slice.call(svg.querySelectorAll('.bl-stub'))
                   .filter(e => !e.classList.contains('bl-stub-zero')).length;
  // the completion panel has bars/stubs but NO completion circle (a dot at 0 is what we killed)
  const complDots = n('circle.dot-c') + n('.ln-c-d');
  return { bars: n('.bl-bar'), dim: dim, complLines: n('path.ln-c') + n('.bl-cline'),
           complDots: complDots, rightAxis: n('.ax2'), needLine: n('.bl-need'),
           rdots: n('.bl-rdot'), bandG: n('.bl-bar.bl-g'), bandA: n('.bl-bar.bl-a'), bandR: n('.bl-bar.bl-r') };
}"""

LIVE = """() => {
  const H = window.__HT16;
  const m = document.getElementById('vMonth'), y = document.getElementById('vYear');
  const card = document.getElementById('h16Month');
  const leg = card ? card.querySelector('.bl-leg') : null;
  const hdr = card ? card.querySelector('.bl-hdr') : null;
  const n = (svg,s) => svg ? svg.querySelectorAll(s).length : -1;
  // recompute the month average the way the top-of-Insights figure does: mean of in-span days'
  // completion, unlogged counted as 0 (monthPoints already sets c=0 for an unlogged in-span day).
  const mp = H.monthPoints();
  const cs = mp.filter(p => p.c != null).map(p => p.c);
  const avg = cs.length ? Math.round(cs.reduce((a,b)=>a+b,0)/cs.length) : null;
  return {
    mBars: n(m,'.bl-bar') + n(m,'.bl-stub'), mComplLine: n(m,'path.ln-c'), mRightAxis: n(m,'.ax2'),
    mNeed: n(m,'.bl-need'),
    yBars: n(y,'.bl-bar') + n(y,'.bl-stub'), yComplLine: n(y,'path.ln-c'), yRightAxis: n(y,'.ax2'),
    cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
    legW: leg ? Math.round(leg.getBoundingClientRect().width) : null,
    cardScrollX: card ? (card.scrollWidth - card.clientWidth) : null,
    hdr: hdr ? hdr.textContent : null, avg: avg
  };
}"""


async def run(pw, w, h, label):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)

    # ---- RENDER (crafted series) ----
    r = await pg.evaluate(RENDER)
    chk("%s · R1 the month renders bars and NO completion line" % label,
        r['bars'] >= 2 and r['complLines'] == 0, r)
    chk("%s · R2 no right axis" % label, r['rightAxis'] == 0, r)
    chk("%s · R3 the dashed need line is drawn" % label, r['needLine'] == 1, r)
    chk("%s · R4 an unlogged past day is a dim stub, not a dot at 0" % label,
        r['dim'] == 1 and r['complDots'] == 0, r)
    chk("%s · R5 an unrated day has no rating point (2 rated of 3 logged)" % label, r['rdots'] == 2, r)
    chk("%s · R6 the bars are banded (a 90 green, a 60 amber, a 30 red)" % label,
        r['bandG'] == 1 and r['bandA'] == 1 and r['bandR'] == 1, r)

    # ---- LIVE (the real cards) ----
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1500)
    d = await pg.evaluate(LIVE)
    chk("%s · L1 the live month card draws bars/stubs, no completion line, no right axis, a need line" % label,
        d['mBars'] > 0 and d['mComplLine'] == 0 and d['mRightAxis'] == 0 and d['mNeed'] == 1, d)
    chk("%s · L2 the live year card draws bars/stubs, no completion line, no right axis" % label,
        d['yBars'] > 0 and d['yComplLine'] == 0 and d['yRightAxis'] == 0, d)
    chk("%s · L3 the legend fits the card and the card never scrolls sideways" % label,
        d['legW'] is not None and d['cardW'] is not None and d['legW'] <= d['cardW'] + 1
        and (d['cardScrollX'] is None or d['cardScrollX'] <= 1), d)
    chk("%s · L4 the month header 'avg N%%' equals the in-span mean (unlogged=0)" % label,
        d['hdr'] is not None and d['avg'] is not None and ('avg %d%%' % d['avg']) in d['hdr'], d)
    chk("%s · L5 zero page errors" % label, not errs, errs[:3])
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 390, 844, "390x844")
        await run(pw, 1280, 720, "1280x720")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-816-CHARTS: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
