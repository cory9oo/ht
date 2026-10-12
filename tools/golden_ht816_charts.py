#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 816 GOLDEN — AMENDED BY NAME, PASTE 819 (R67.2): THE MONTH AND YEAR CARDS ARE ONE LINE CHART
EACH. Run at 390 and 1280.

819 (Cory 2026-10-11, from his phone): "put both back to a line chart and map both on the same Y axis
... less wording the better ... for the Y axis I like seeing more like points. Like by 10." So 817's
bars become ONE line renderer: one panel, two lines on a single 0-100 axis ruled every 10 - Completion
a solid green line with a point on each logged day, the day Rating a solid amber line (rating x10 on
the same axis, never written "x10"). An unlogged past day is a GAP (no point); a logged 0% keeps a
HOLLOW point at 0; a future day is nothing. No bars, no right axis, a two-word legend.

  RENDER (a crafted series through window.__HT16.barLineChart, clock-independent):
    R1  the month renders a completion LINE and points, and NO bars (.bl-bar count 0);
    R2  NO right axis (.ax2 count 0);
    R3  the dashed need line is drawn (.bl-need count 1);
    R4  an unlogged past day has NO completion point (3 logged days -> 3 .bl-cdot, not 4);
    R5  a logged 0% day keeps ONE hollow point at 0 (.bl-cdot.bl-hollow count 1);
    R6  an unrated day has NO rating point (2 rated of 3 logged -> 2 .bl-rdot);
    R7  eleven axis labels, one at every 10 (0,10,...,100 -> 11 text.ayl);
    R8  the word "x10" / "×10" appears nowhere in the rendered svg.
  LIVE (the real month/year cards on the Insights tab):
    L1  the month card draws a completion line/points and no bars, no right axis, a need line,
        eleven axis labels;
    L2  the year card likewise (line/points, no bars, no right axis);
    L3  the two-word legend reads exactly 'Completion' and 'Rating', fits (no sideways scroll at 390),
        and carries no "x10";
    L4  the month header figure 'avg N%' equals the in-span mean (unlogged counted as 0);
    L5  the description sentence under each title is GONE (#vMonthSub / #vYearSub absent) and the
        weekday-initials row is GONE (no .bl-xl2 in the month svg);
    L6  zero page errors.

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
  {x:'4',x2:'Thu',key:'z-4',c:0,    rv:null, logged:true},
  {x:'5',x2:'Fri',key:'z-5',c:60,   rv:5,    logged:true},
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
  const txt = (svg.textContent||'');
  return { bars: n('.bl-bar'),
           cdots: n('circle.bl-cdot'), hollow: n('circle.bl-cdot.bl-hollow'),
           cline: n('path.bl-cline'), rdots: n('circle.bl-rdot'),
           cbridge: n('path.bl-cbridge'), rbridge: n('path.bl-rbridge'),
           rightAxis: n('.ax2'), needLine: n('.bl-need'),
           axLabels: n('text.ayl'), hasX10: /x10|\\u00d710/i.test(txt) };
}"""

LIVE = """() => {
  const H = window.__HT16;
  const m = document.getElementById('vMonth'), y = document.getElementById('vYear');
  const mnav = document.getElementById('vMonthNav');
  const leg = mnav ? mnav.querySelector('.bl-leg') : null;
  const legItems = leg ? Array.prototype.slice.call(leg.querySelectorAll('.bl-leg-i')).map(e => (e.textContent||'').trim()) : null;
  const card = document.getElementById('h16Month');
  const hdr = mnav ? mnav.querySelector('.bl-hdr') : null;
  const n = (svg,s) => svg ? svg.querySelectorAll(s).length : -1;
  const mp = H.monthPoints();
  const cs = mp.filter(p => p.c != null).map(p => p.c);
  const avg = cs.length ? Math.round(cs.reduce((a,b)=>a+b,0)/cs.length) : null;
  return {
    mLine: n(m,'path.bl-cline') + n(m,'circle.bl-cdot'), mBars: n(m,'.bl-bar'),
    mRightAxis: n(m,'.ax2'), mNeed: n(m,'.bl-need'), mAxLabels: n(m,'text.ayl'),
    mX2: n(m,'.bl-xl2'),
    yLine: n(y,'path.bl-cline') + n(y,'circle.bl-cdot'), yBars: n(y,'.bl-bar'),
    yRightAxis: n(y,'.ax2'),
    legItems: legItems, legHasX10: leg ? /x10|\\u00d710/i.test(leg.textContent||'') : null,
    cardHasX10: card ? /x10|\\u00d710/i.test(card.textContent||'') : null,
    legW: leg ? Math.round(leg.getBoundingClientRect().width) : null,
    cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
    legOverflow: leg ? (leg.scrollWidth - leg.clientWidth) : null,
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    mSub: !!document.getElementById('vMonthSub'), ySub: !!document.getElementById('vYearSub'),
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
    chk("%s · R1 the month renders a completion line/points and NO bars" % label,
        (r['cline'] >= 1 or r['cdots'] >= 1) and r['bars'] == 0, r)
    chk("%s · R2 no right axis" % label, r['rightAxis'] == 0, r)
    chk("%s · R3 the dashed need line is drawn" % label, r['needLine'] == 1, r)
    chk("%s · R4 an unlogged past day has no completion point (3 logged -> 3 dots, not 4)" % label,
        r['cdots'] == 3, r)
    chk("%s · R5 a logged 0%% day keeps one hollow point at 0" % label, r['hollow'] == 1, r)
    chk("%s · R6 an unrated day has no rating point (2 rated of 3 logged)" % label, r['rdots'] == 2, r)
    chk("%s · R7 eleven axis labels, one at every 10 (0..100)" % label, r['axLabels'] == 11, r)
    chk("%s · R8 no 'x10' text anywhere in the rendered svg" % label, not r['hasX10'], r)
    # PASTE 821 amended by name (R67.2): across one or more unlogged days the line continues as a DOTTED
    # bridge, point to point - a path, never a point, so R4/R5/R6's dot counts are unchanged above. In
    # this series the logged days are i1,i3,i4: i1->i3 spans an unlogged day (one completion bridge) and
    # the rated days i1,i4 span two (one rating bridge).
    chk("%s · R9 a dotted completion bridge crosses the unlogged gap (and a rating bridge too)" % label,
        r['cbridge'] == 1 and r['rbridge'] == 1, r)

    # ---- LIVE (the real cards) ----
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1500)
    d = await pg.evaluate(LIVE)
    chk("%s · L1 the live month card draws a line/points, no bars, no right axis, a need line, 11 labels" % label,
        d['mLine'] > 0 and d['mBars'] == 0 and d['mRightAxis'] == 0 and d['mNeed'] == 1 and d['mAxLabels'] == 11, d)
    chk("%s · L2 the live year card draws a line/points, no bars, no right axis" % label,
        d['yLine'] > 0 and d['yBars'] == 0 and d['yRightAxis'] == 0, d)
    chk("%s · L3 the legend reads exactly 'Completion' and 'Rating', fits, no 'x10'" % label,
        d['legItems'] == ['Completion', 'Rating'] and not d['legHasX10'] and not d['cardHasX10']
        and (d['legOverflow'] is None or d['legOverflow'] <= 1)
        and (d['pageOverflow'] or 0) <= 1
        and (d['legW'] is None or d['cardW'] is None or d['legW'] <= d['cardW'] + 1), d)
    chk("%s · L4 the month header 'avg N%%' equals the in-span mean (unlogged=0)" % label,
        d['hdr'] is not None and d['avg'] is not None and ('avg %d%%' % d['avg']) in d['hdr'], d)
    chk("%s · L5 the description sentence and the weekday row are absent" % label,
        (not d['mSub']) and (not d['ySub']) and d['mX2'] == 0, d)
    chk("%s · L6 zero page errors" % label, not errs, errs[:3])
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
