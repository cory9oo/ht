#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-820 GOLDEN — ONE SCALE, ONE SCOREBOARD, AT EVERY WIDTH (paste 820).

Run at 390x844 (phone), 1280x720 and 1920x1080 (desktop). Proves Cory's three asks:

  S1  THE ONE BAND TABLE. `__HT16.rampIx` steps by 20 with the top band at `>= NEED` (80): 79 is the
      second-from-top band (3), 80 is the top band (4); `rampFill(80)` resolves to --g4 (teal-green,
      best) and `rampFill(0)` to --g0 (red, worst). The big figure, a tile and a Life week AGREE ON
      BAND for the same number — rampIx, rampFill's --g index and the figure ink's --gink index all
      report the same band, and every painted Life week is one of the five --g hexes (or --surface).
  S2  NO LETTERS. The Life legend carries the percent labels 80+ and <20 and NOT one standalone
      A/B/C/D/F grade letter (code, legend, tooltips).
  S3  ONE HOME. The Today tab is inputs only: no #tStrip, no .hero-bar, no .sh-pct percent in the
      Today column; the checklist (#log) and the brain-dump journal (#iDump) are present. The day's
      ranking lives once, on the Insights scoreboard (#h228Hero).
  S4  THE SCOREBOARD, ONE RENDERER. #h228Hero carries the big percent (.sh-pct), three EQUAL tiles
      (7 days · 30 days · Streak) and one caption `need 80%` — present exactly once — and renders with
      the SAME element set and the SAME labels/caption at all three widths (not two markups).
  S5  zero page errors at each width.

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
import asyncio, re, sys
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
    return b, pg, errs


# ---- the markup builder, read at every width: label, big %, tile labels, caption, element presence
HERO_JS = """
() => {
  const c = document.getElementById('h228Hero');
  if(!c) return null;
  const lab = c.querySelector('.lab');
  // PASTE 821 amended by name (R67.2): the big percent is now the RING (.sh-ring, with .sh-ring-pct in
  // its centre), not a flat .sh-pct; the card also carries the week row (.sh-week). The three tiles and
  // the one caption are unchanged.
  const ring = c.querySelector('.sh-ring');
  const pct = c.querySelector('.sh-ring-pct');
  const week = c.querySelector('.sh-week');
  const tiles = Array.prototype.slice.call(c.querySelectorAll('.sh-tile'));
  const caps = Array.prototype.slice.call(c.querySelectorAll('.sh-cap'));
  return {
    present: true,
    lab: lab ? (lab.textContent||'').trim() : null,
    hasRing: !!ring,
    hasPct: !!pct,
    hasWeek: !!week,
    nTiles: tiles.length,
    tileKeys: tiles.map(t => { const k=t.querySelector('.sh-k'); return k ? (k.textContent||'').trim().toLowerCase() : ''; }),
    caps: caps.map(x => (x.textContent||'').trim().toLowerCase())
  };
}
"""

SCALE_JS = """
() => {
  const H = window.__HT16, T = window.__HT228;
  function idx(tok){ const m = /--g(?:ink)?(\\d)/.exec(tok||''); return m ? +m[1] : null; }
  const ps = [0, 19, 20, 59, 60, 79, 80, 100];
  const agree = ps.map(p => {
    const bi = H.rampIx(p);
    const rf = idx(H.rampFill(p));
    const fk = T && T.ink ? idx(T.ink(p)) : null;     // figure ink (--ginkN)
    return { p, bi, rf, fk, ok: (bi===rf && bi===fk) };
  });
  return {
    r79: H.rampIx(79), r80: H.rampIx(80),
    fill80: H.rampFill(80), fill0: H.rampFill(0),
    agree: agree
  };
}
"""

LIFE_JS = """
(sel) => {
  const rects = Array.prototype.slice.call(document.querySelectorAll(sel));
  const fills = rects.map(r => (r.getAttribute('fill')||''));
  const ok = fills.every(f => /var\\(--g[0-4]\\)/.test(f) || /var\\(--surface\\)/.test(f));
  const leg = document.querySelector('.lifeleg');
  return {
    n: rects.length, allOnePalette: ok,
    legText: leg ? (leg.textContent||'').replace(/\\s+/g,'').trim() : null
  };
}
"""

TODAY_JS = """
() => {
  const col = document.querySelector('.colL');
  return {
    strip: !!document.getElementById('tStrip'),
    heroBar: !!document.querySelector('.hero-bar, .hero-mast'),
    colHasPct: !!(col && col.querySelector('.sh-pct, .sh-ring, .sh-ring-pct')),
    log: !!document.getElementById('log'),
    dump: !!document.getElementById('iDump'),
    rate: !!(document.getElementById('rateWrap') || document.getElementById('rate') || document.querySelector('[data-r]'))
  };
}
"""


async def show_insights(pg):
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1200)


async def show_today(pg):
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('today'); }catch(e){} }")
    await pg.wait_for_timeout(1000)


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)
    phone = w < 1024
    if phone:
        await show_insights(pg)

    # S1 — the one band table
    s = await pg.evaluate(SCALE_JS)
    chk("%s · rampIx(79)=3 second band, rampIx(80)=4 top band (steps of 20, top = NEED)" % label,
        s['r79'] == 3 and s['r80'] == 4, s)
    chk("%s · rampFill(80)=--g4 (best), rampFill(0)=--g0 (worst)" % label,
        s['fill80'] == 'var(--g4)' and s['fill0'] == 'var(--g0)', s)
    bad = [a for a in s['agree'] if not a['ok']]
    chk("%s · big figure, tiles and Life weeks agree on band for every sample percent" % label,
        not bad, bad or s['agree'])

    # S1/S2 — the Life weeks are one palette, the legend is percent, no letters
    lsel = 'rect.lw' if not phone else 'rect.h185wk'
    lf = await pg.evaluate(LIFE_JS, lsel)
    chk("%s · every painted Life week is one of the five --g hexes (or --surface), %d weeks" % (label, lf['n']),
        lf['n'] > 0 and lf['allOnePalette'], lf)
    chk("%s · the Life legend carries 80+ and <20, and NO A/B/C/D/F letter" % label,
        bool(lf['legText']) and '80+' in lf['legText'] and '<20' in lf['legText']
        and not any(c in lf['legText'] for c in 'ABCDF'), lf['legText'])

    # S4 — the scoreboard, one renderer, at this width
    hero = await pg.evaluate(HERO_JS)
    sig = None
    if hero:
        okcard = (hero['hasRing'] and hero['hasPct'] and hero['hasWeek'] and hero['nTiles'] == 3
                  and 'need 80%' in hero['caps'] and hero['caps'].count('need 80%') == 1
                  and (hero['lab'] or '').lower() == 'today'
                  and hero['tileKeys'] == ['7 days', '30 days', 'streak'])
        chk("%s · the scoreboard: TODAY + the RING + the week row + three tiles (7d·30d·streak) + one 'need 80%%' caption"
            % label, okcard, hero)
        sig = (hero['hasRing'], hero['hasWeek'], hero['nTiles'], tuple(hero['tileKeys']),
               'need 80%' in hero['caps'], (hero['lab'] or '').lower())
    else:
        chk("%s · the scoreboard #h228Hero renders" % label, False, hero)

    # S3 — the Today tab is inputs only (phone: switch to the Today tab and look)
    if phone:
        await show_today(pg)
        t = await pg.evaluate(TODAY_JS)
        chk("%s · Today tab has no #tStrip, no hero bar, no percent in the column" % label,
            not t['strip'] and not t['heroBar'] and not t['colHasPct'], t)
        chk("%s · Today tab keeps its inputs: checklist (#log), brain dump (#iDump), the rate picker" % label,
            t['log'] and t['dump'] and t['rate'], t)
    else:
        t = await pg.evaluate("() => ({ strip: !!document.getElementById('tStrip'), "
                              "heroBar: !!document.querySelector('.hero-bar') })")
        chk("%s · the retired #tStrip bar is gone on the desktop too" % label,
            not t['strip'] and not t['heroBar'], t)

    chk("%s · zero page errors" % label, not errs, errs[:3])
    await b.close()
    return sig


async def main():
    sigs = {}
    async with async_playwright() as pw:
        sigs['390x844'] = await run(pw, 390, 844, "390x844")
        sigs['1280x720'] = await run(pw, 1280, 720, "1280x720")
        sigs['1920x1080'] = await run(pw, 1920, 1080, "1920x1080")
    # S4 — SAME element set and text at all three widths
    vals = [v for v in sigs.values() if v is not None]
    same = len(vals) == 3 and all(v == vals[0] for v in vals)
    RES.append((bool(same), "the scoreboard markup is identical at 390 · 1280 · 1920 (one renderer)"))
    print("  %-6s %s%s" % ("PASS" if same else "FAIL",
          "the scoreboard markup is identical at 390 · 1280 · 1920 (one renderer)",
          "" if same else ("   -> " + str(sigs)[:220])))
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-820-SCALE: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
