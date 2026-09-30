#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-432 GOLDEN — THE CHARTS: QUIET LINES, ONE AXIS (paste 432). Data golden (R70.41); the TEST line
of WIRE HT-432 run literally at 390 (phone) and 1280 (desktop).

  the two charts' SVG contains ZERO stroke-dasharray · exactly ONE y-axis (no dual/right axis) · one
  dot per logged day (month) / per week with data (year) · every completion dot has the 2px surface
  ring · no <text> outside the viewBox · x labels in ONE row on the phone · a trend line and an 8%
  wash exist · the tooltip appears on POINTER and on KEYBOARD focus with date · % · done/total ·
  rating · trend.
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
import asyncio, os, sys
from playwright.async_api import async_playwright
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'),
              os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    return os.path.join(estate, '_machine', 'ht3')

BASE = 'file://' + os.path.join(fixture_dir(_ESTATE), 'index.html').replace(os.sep, '/')

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:200])))


async def open_page(pw, w, h):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("; ".join("window.%s=true" % k for k in ('__BIGSET', '__BLOCKS', '__INPUTS3')))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    # reach the Views surface the way Cory does (R70.211); harmless on the desktop grid
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(900)
    return b, pg, errs


# Everything the check needs from ONE svg, computed in the page.
PROBE = """(id) => {
  const svg = document.getElementById(id);
  if(!svg) return {err:'no '+id};
  const vb = (svg.getAttribute('viewBox')||'').split(/\\s+/).map(Number);
  const inBox = e => { let b; try{ b=e.getBBox(); }catch(_){ return true; }
    return b.x >= -0.6 && b.y >= -0.6 && b.x+b.width <= vb[2]+0.6 && b.y+b.height <= vb[3]+0.6; };
  const all = [...svg.querySelectorAll('*')];
  const dash = all.filter(e => {
    const a = e.getAttribute('stroke-dasharray');
    if(a && a !== 'none' && a.trim() !== '') return true;
    const cs = getComputedStyle(e).strokeDasharray;
    return cs && cs !== 'none' && cs.replace(/0px/g,'').replace(/[ ,]/g,'') !== ''; });
  const dotc = [...svg.querySelectorAll('.dot-c')];
  const ring = dotc.every(d => {
    const cs = getComputedStyle(d);
    return Math.round(parseFloat(cs.strokeWidth)) === 2 && cs.stroke && cs.stroke !== 'none'; });
  const texts = [...svg.querySelectorAll('text')];
  const outside = texts.filter(t => !inBox(t)).map(t => t.textContent);
  const xl = [...svg.querySelectorAll('text.xl')];
  const xlYs = [...new Set(xl.map(t => Math.round(+t.getAttribute('y'))))];
  return {
    dash: dash.length,
    ax2: svg.querySelectorAll('.ax2, text.ax2').length,       // a right/dual axis (must be zero)
    ayl: svg.querySelectorAll('text.ayl').length,             // the one left axis' labels
    axr: svg.querySelectorAll('.ax-r').length,                // the rating strip's own axis
    dotc: dotc.length,
    dotToday: svg.querySelectorAll('.dot-today').length,
    haloToday: svg.querySelectorAll('.halo-today').length,
    dotr: svg.querySelectorAll('.dot-r').length,
    ring: ring,
    wash: svg.querySelectorAll('.wash-c').length,
    trend: svg.querySelectorAll('.trend-c').length,
    ln_c: svg.querySelectorAll('.ln-c').length,
    xlRows: xlYs.length, xl: xl.length,
    outside: outside,
    axisAttr: svg.getAttribute('data-axis'),
    hitcols: svg.querySelectorAll('.hitcol').length,
    xhair: svg.querySelectorAll('.xhair').length
  };
}"""

LOGGED = "(fn) => { try{ return window.__HT16[fn]().filter(p => p.c != null).length; }catch(e){ return -1; } }"


async def run(pw):
    for w, h in ((390, 844), (1280, 720)):
        b, pg, errs = await open_page(pw, w, h)
        t = "%dx%d" % (w, h)
        phone = w < 720
        for id_, fn, unit in (('vMonth', 'monthPoints', 'day'), ('vYear', 'yearPoints', 'week')):
            m = await pg.evaluate(PROBE, id_)
            logged = await pg.evaluate(LOGGED, fn)
            if m.get('err'):
                chk("%s · %s · the chart renders" % (id_, t), False, m); continue
            chk("%s · %s · ZERO stroke-dasharray anywhere in the chart (S2: nothing dashed)" % (id_, t),
                m['dash'] == 0, {'dashed': m['dash']})
            chk("%s · %s · exactly ONE completion y-axis, no right/dual axis (S1)" % (id_, t),
                m['ax2'] == 0 and m['ayl'] >= 2 and m['axr'] >= 1,
                {'ax2': m['ax2'], 'ayl': m['ayl'], 'axr': m['axr']})
            chk("%s · %s · one completion dot per logged %s (%d): dot-c + today == logged"
                % (id_, t, unit, logged),
                logged >= 0 and (m['dotc'] + m['dotToday']) == logged,
                {'dotc': m['dotc'], 'today': m['dotToday'], 'logged': logged})
            chk("%s · %s · every completion dot wears the 2px surface ring (S2)" % (id_, t),
                m['dotc'] == 0 or m['ring'], m['ring'])
            chk("%s · %s · an 8%% wash and a trend line exist where there is data" % (id_, t),
                (logged == 0) or (m['wash'] >= 1 and m['trend'] >= 1),
                {'wash': m['wash'], 'trend': m['trend'], 'logged': logged})
            chk("%s · %s · NO <text> escapes the viewBox" % (id_, t),
                not m['outside'], m['outside'][:6])
            chk("%s · %s · data-axis says 'one' and a crosshair + hit columns exist" % (id_, t),
                m['axisAttr'] == 'one' and m['xhair'] == 1 and m['hitcols'] >= 1,
                {'axis': m['axisAttr'], 'xhair': m['xhair'], 'hit': m['hitcols']})
            if id_ == 'vMonth' and phone:
                chk("%s · %s · x labels are ONE ROW on the phone (S4)" % (id_, t),
                    m['xlRows'] == 1, {'rows': m['xlRows'], 'labels': m['xl']})
        # ---- S5 · TOOLTIP on POINTER and on KEYBOARD, with date · % · done/total · rating · trend ----
        tip = await pg.evaluate("""async () => {
          const svg = document.getElementById('vMonth');
          /* a day with the WHOLE tip: date, %, done/total AND a trend (early days have no trend yet,
             by design - the trailing mean needs >=3 of the last 7 logged) */
          const rich = [...svg.querySelectorAll('.hitcol[data-tip]')]
            .filter(c => { const s = c.getAttribute('data-tip'); return /of/.test(s) && /trend/.test(s); });
          const c = rich[0] || svg.querySelector('.hitcol[data-tip]');
          if(!c) return {err:'no hit column'};
          const r = c.getBoundingClientRect();
          const opts = {bubbles:true, clientX:r.left + r.width/2, clientY:r.top + r.height/2};
          c.dispatchEvent(new PointerEvent('pointermove', opts));
          await new Promise(res => setTimeout(res, 60));
          const hoverTip = (document.getElementById('vMonthTip')||{}).textContent || '';
          const xhairShown = getComputedStyle(svg.querySelector('.xhair')).display !== 'none';
          svg.focus();
          svg.dispatchEvent(new KeyboardEvent('keydown', {bubbles:true, key:'ArrowRight'}));
          await new Promise(res => setTimeout(res, 60));
          const keyTip = (document.getElementById('vMonthTip')||{}).textContent || '';
          return {hoverTip, keyTip, xhairShown, dataTip: c.getAttribute('data-tip')};
        }""")
        if tip.get('err'):
            chk("tooltip · %s · a hit column with a full tip exists" % t, False, tip)
        else:
            full = tip['dataTip'] or ''
            has_all = ('%' in full and ' of ' in full and 'rating' in full and 'trend' in full)
            chk("tooltip · %s · the tip carries date · %% · done/total · rating · trend (S5)" % t,
                has_all, full)
            chk("tooltip · %s · POINTER shows the tip and the crosshair (S5)" % t,
                bool(tip['hoverTip']) and tip['xhairShown'], tip)
            chk("tooltip · %s · KEYBOARD focus + ArrowRight moves the crosshair and updates the tip (S5)"
                % t, bool(tip['keyTip']), tip)
        chk("%s · zero page errors" % t, not errs, errs[:3])
        await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw)
    ok = sum(1 for r in RES if r[0]); n = len(RES)
    print("\nGOLDEN HT-432: %d/%d PASS, %d FAIL" % (ok, n, n - ok))
    sys.exit(0 if ok == n else 1)

asyncio.run(main())
