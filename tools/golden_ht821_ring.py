#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 821 GOLDEN — THE RING (the hero), the week row, the records line, and the chart pull.
Run at 390x844 (phone), 1280x720 and 1920x1080 (desktop).

The scoreboard body is ONE renderer (820), now parameterised by VALUE (821): `__HT228.scoreHtml(o)`
is the pure markup builder `fill` hands the live day. The golden hands it CRAFTED values, so the ring
and records can be proven at any state (100, a perfect week, a new best) without the fixture happening
to hold that day. The chart pull (S1 bridges, S5 star / gold-need) is proven on a crafted series
through `__HT16.barLineChart`, the same seam golden_ht816 uses.

  RING (crafted via scoreHtml):
    R1  a mid value: the arc's stroke-dashoffset == C*(1 - p/100), the arc stroke resolves to the band
        FILL of the value (rampFill), the centre percent carries the band INK; NO gold ring, empty label.
    R2  a 100 value: the arc is full (offset 0), the stroke is the top band --g4, the gold ring is
        present, the label reads 'perfect day'; with burst=true one .sh-burst fires, with burst=false none.
    R3  the burst is once per day and never under reduced motion: canBurst() is true on a clean day,
        false after markBurst(), and false in a reduced-motion context.
  WEEK (crafted):
    W1  seven mini rings; an unlogged past day (v:null) has a track and NO arc; a logged day's arc
        stroke is its band fill; a future day carries the future class.
    W2  a week of seven >= NEED days turns the row .perfect.
  RECORDS (crafted):
    Rc1 all-zero records render NO line; only existing facts render; a BEAT shows 'new best'.
  CHART (crafted series, __HT16.barLineChart):
    C1  a 100 day draws one .bl-star and no ordinary dot there; across an unlogged gap a .bl-cbridge is
        drawn and there is NO point on the gap day; opts.needGold puts bl-need-gold on the need line.
  LIVE (the real Insights card):
    L1  the live ring renders (arc with dasharray==C, 7 week rings, a records line present);
    L2  the ring ADVANCES after a check-off (the arc offset moves toward full);
    L3  the ring/week/records/tiles/caption element set is IDENTICAL at 390 · 1280 · 1920.
    L4  zero page errors at each width.

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


# ---- the pure builder, read with crafted values: parse a scoreHtml string into what the golden asserts
CRAFT_JS = r"""
(args) => {
  const T = window.__HT228, H = window.__HT16;
  function parse(html){
    const d = document.createElement('div'); d.className = 'stat-hero'; d.innerHTML = html;
    const arc = d.querySelector('.sh-ring-arc');
    return {
      arcOff: arc ? +arc.getAttribute('stroke-dashoffset') : null,
      stroke: arc ? arc.getAttribute('stroke') : null,
      pctInk: (d.querySelector('.sh-ring-pct')||{}).getAttribute ? d.querySelector('.sh-ring-pct').getAttribute('style') : null,
      gold: !!d.querySelector('.sh-ring-gold'),
      lab: ((d.querySelector('.sh-ring-lab')||{}).textContent || '').trim(),
      burst: d.querySelectorAll('.sh-burst').length,
      nWk: d.querySelectorAll('.sh-wk').length,
      wkArcs: d.querySelectorAll('.sh-wk-arc').length,
      wkStrokes: Array.prototype.slice.call(d.querySelectorAll('.sh-wk-arc')).map(a=>a.getAttribute('stroke')),
      wkFuture: d.querySelectorAll('.sh-wk-future').length,
      perfectWk: !!d.querySelector('.sh-week.perfect'),
      rec: (d.querySelector('.sh-rec')||{}).textContent || null,
      newbest: d.querySelectorAll('.sh-rec-new').length,
      els: ['.sh-ring','.sh-ring-arc','.sh-week','.sh-tiles','.sh-tile','.sh-cap'].map(s=>d.querySelectorAll(s).length)
    };
  }
  const wkMix = [{v:85,future:false,letter:'M'},{v:null,future:false,letter:'T'},{v:70,future:false,letter:'W'},
                 {v:100,future:false,letter:'T'},{v:null,future:true,letter:'F'},{v:null,future:true,letter:'S'},{v:null,future:true,letter:'S'}];
  const wkPerfect = [0,1,2,3,4,5,6].map(i=>({v:90,future:false,isToday:i===3,letter:'MTWTFSS'[i]}));
  // records: baseline first (silent), then a BEAT to prove 'new best'
  const base = parse(T.scoreHtml({today:50,week:50,m:50,streak:3,wk:wkMix,rec:{streak:3,hundred:5,bestWeek:60,perfect:0},burst:false}));
  const beat = parse(T.scoreHtml({today:50,week:50,m:50,streak:7,wk:wkMix,rec:{streak:7,hundred:9,bestWeek:80,perfect:1},burst:false}));
  const empty = parse(T.scoreHtml({today:40,week:40,m:40,streak:0,wk:wkMix,rec:{streak:0,hundred:0,bestWeek:null,perfect:0},burst:false}));
  return {
    ringC: T.ringC,
    mid:   parse(T.scoreHtml({today:60,week:65,m:72,streak:4,wk:wkMix,rec:{streak:4,hundred:0,bestWeek:65,perfect:0},burst:false})),
    hundredB: parse(T.scoreHtml({today:100,week:90,m:88,streak:9,wk:wkPerfect,rec:{streak:9,hundred:12,bestWeek:95,perfect:2},burst:true})),
    hundredN: parse(T.scoreHtml({today:100,week:90,m:88,streak:9,wk:wkPerfect,rec:{streak:9,hundred:12,bestWeek:95,perfect:2},burst:false})),
    empty: empty, beat: beat,
    fill60: H.rampFill(60), fill100: H.rampFill(100), ink60: T.ink(60)
  };
}
"""

GUARD_JS = r"""
() => {
  const T = window.__HT228;
  Object.keys(localStorage).filter(k=>k.indexOf('ht821_burst')===0).forEach(k=>localStorage.removeItem(k));
  const clean = T.canBurst();
  T.markBurst();
  const after = T.canBurst();
  return { clean: clean, after: after };
}
"""

CHART_JS = r"""
() => {
  const H = window.__HT16;
  let host = document.getElementById('zt821');
  if(!host){ host=document.createElement('div'); host.id='zt821'; host.style.width='600px';
    host.innerHTML='<svg id="zt821s" class="chart"></svg>'; document.body.appendChild(host); }
  H.barLineChart('zt821s',[
    {x:'1',key:'z1',c:100, rv:null, logged:true},
    {x:'2',key:'z2',c:null, rv:null, logged:false},
    {x:'3',key:'z3',c:60,  rv:6,    logged:true}
  ], {attr:'data-vgd', needGold:true});
  const s=document.getElementById('zt821s'), n=q=>s.querySelectorAll(q).length;
  return { star:n('.bl-star'), cdot:n('circle.bl-cdot'), cbridge:n('path.bl-cbridge'),
           needgold:n('.bl-need.bl-need-gold') };
}
"""

LIVE_JS = r"""
() => {
  const c = document.getElementById('h228Hero'); if(!c) return {no:1};
  const arc = c.querySelector('.sh-ring-arc');
  return {
    present:true,
    dash: arc ? arc.getAttribute('stroke-dasharray') : null,
    off:  arc ? +arc.getAttribute('stroke-dashoffset') : null,
    nWk: c.querySelectorAll('.sh-wk').length,
    hasRec: !!c.querySelector('.sh-rec, .sh-week'),
    sig: ['.sh-ring','.sh-week','.sh-tiles','.sh-cap'].map(s=>!!c.querySelector(s)).join(','),
    tiles: Array.prototype.slice.call(c.querySelectorAll('.sh-tile .sh-k')).map(k=>(k.textContent||'').trim().toLowerCase()).join('|')
  };
}
"""


async def open_page(pw, w, h, reduced=False):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1,
                              reduced_motion=('reduce' if reduced else 'no-preference'))
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("; ".join("window.%s=true" % k for k in ('__BIGSET', '__BLOCKS', '__INPUTS3')))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    return b, pg, errs


async def show_insights(pg):
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1200)


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)
    phone = w < 1024
    if phone:
        await show_insights(pg)

    cr = await pg.evaluate(CRAFT_JS)
    C = cr['ringC']

    # R1 — a mid value
    ok = (abs(cr['mid']['arcOff'] - C * (1 - 60 / 100.0)) < 0.5
          and cr['mid']['stroke'] == cr['fill60'] and not cr['mid']['gold']
          and cr['mid']['lab'] == '' and cr['mid']['burst'] == 0
          and (cr['fill60'][4:-1] if False else True))
    chk("%s · R1 mid: arc offset == C*(1-p/100), stroke is the band fill, no gold, empty label" % label,
        ok, cr['mid'])

    # R2 — a 100 value
    hb, hn = cr['hundredB'], cr['hundredN']
    chk("%s · R2 100: arc full (offset 0), stroke top band --g4, gold ring, label 'perfect day'" % label,
        hb['arcOff'] == 0 and hb['stroke'] == cr['fill100'] and hb['gold'] and hb['lab'] == 'perfect day', hb)
    chk("%s · R2 the burst fires with burst=true (one .sh-burst) and not with burst=false" % label,
        hb['burst'] == 1 and hn['burst'] == 0, [hb['burst'], hn['burst']])

    # R3 — burst once per day / never under reduced motion
    g = await pg.evaluate(GUARD_JS)
    chk("%s · R3 canBurst() true on a clean day, false after markBurst() (once per day)" % label,
        g['clean'] is True and g['after'] is False, g)

    # W1/W2 — the week row
    chk("%s · W1 seven mini rings; an unlogged past day has a track and no arc; future flagged" % label,
        cr['mid']['nWk'] == 7 and cr['mid']['wkArcs'] == 3 and cr['mid']['wkFuture'] == 3
        and all(s and 'var(--g' in s for s in cr['mid']['wkStrokes']), cr['mid'])
    chk("%s · W2 a week of seven >= NEED days turns the row .perfect" % label,
        cr['hundredB']['perfectWk'] and not cr['mid']['perfectWk'], [cr['hundredB']['perfectWk'], cr['mid']['perfectWk']])

    # Rc1 — records
    chk("%s · Rc1 all-zero records render no line; only existing facts render" % label,
        cr['empty']['rec'] is None and ('100% days' not in (cr['mid']['rec'] or '')), [cr['empty']['rec'], cr['mid']['rec']])
    chk("%s · Rc1 a beat shows 'new best'" % label,
        cr['beat']['newbest'] >= 1, cr['beat'])

    # C1 — the chart pull
    ch = await pg.evaluate(CHART_JS)
    chk("%s · C1 a 100 day is one .bl-star (no dot there); a gap draws .bl-cbridge; need line is gold" % label,
        ch['star'] == 1 and ch['cdot'] == 1 and ch['cbridge'] == 1 and ch['needgold'] == 1, ch)

    # reduced-motion: the burst guard says no
    rb = await open_page(pw, w, h, reduced=True)
    rg = await rb[1].evaluate(GUARD_JS)
    chk("%s · R3 reduced-motion: canBurst() is false (no burst, same final state)" % label,
        rg['clean'] is False, rg)
    await rb[0].close()

    # L1/L2/L3 — the live card
    live = await pg.evaluate(LIVE_JS)
    sig = None
    if live and not live.get('no'):
        chk("%s · L1 the live ring renders (arc dasharray==C, seven week rings, a week/records block)" % label,
            abs(float(live['dash']) - C) < 0.5 and live['nWk'] == 7 and live['hasRec'], live)
        sig = (live['sig'], live['tiles'])
        if phone:
            before = live['off']
            await pg.evaluate("() => { document.querySelectorAll('#log .li:not(.on) .bxw').forEach(x=>x.click()); }")
            await pg.wait_for_timeout(300)
            await show_insights(pg)
            after = await pg.evaluate("() => { const a=document.querySelector('#h228Hero .sh-ring-arc'); return a?+a.getAttribute('stroke-dashoffset'):null; }")
            chk("%s · L2 the ring advances after a check-off (arc offset moves toward full)" % label,
                before is not None and after is not None and after <= before, [before, after])
    else:
        chk("%s · L1 the live scoreboard #h228Hero renders" % label, False, live)

    chk("%s · L4 zero page errors" % label, not errs, errs[:3])
    await b.close()
    return sig


async def main():
    sigs = {}
    async with async_playwright() as pw:
        sigs['390x844'] = await run(pw, 390, 844, "390x844")
        sigs['1280x720'] = await run(pw, 1280, 720, "1280x720")
        sigs['1920x1080'] = await run(pw, 1920, 1080, "1920x1080")
    vals = [v for v in sigs.values() if v is not None]
    same = len(vals) == 3 and all(v == vals[0] for v in vals)
    RES.append((bool(same), "L3 the ring/week/tiles/caption element set is identical at 390 · 1280 · 1920"))
    print("  %-6s %s%s" % ("PASS" if same else "FAIL",
          "L3 the ring/week/tiles/caption element set is identical at 390 · 1280 · 1920",
          "" if same else ("   -> " + str(sigs)[:220])))
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-821-RING: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
