#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-651 S2 GOLDEN — AMENDED BY NAME, PASTE 819 (R67.2): EVERY LINE IS NAMED, in two words. 390 and 1280.

819 (Cory 2026-10-11): the month and year cards are one line chart each; the legend reads just two words,
a green line-swatch 'Completion' and an amber line-swatch 'Rating' - no 'x10', no third item (the need
line carries its own 'need' label on the plot). This golden is not in the fixture suite (goldens.txt),
but it is amended by name so it reads the truth (DEC-037 — archived, never deleted).

  G1  the month chart's legend names exactly 'Completion' and 'Rating'.
  G2  the year chart carries the same two-word legend.
  G3  each swatch is a SOLID line chip in its line's own stroke (.bl-cln / .bl-rln, border-top solid).
  G4  at 390 px the legend overflows nowhere sideways (its scrollWidth fits, and the page does not
      scroll sideways) — it wraps to a second row instead.
  G5  the word 'x10' / '×10' appears nowhere in either legend.
  G6  zero page errors at either width.

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
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1400)
    return b, pg, errs


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)

    data = await pg.evaluate(
        "() => {"
        "  const grab=navId=>{ const nav=document.getElementById(navId);"
        "    if(!nav) return null; const leg=nav.querySelector('.bl-leg');"
        "    if(!leg) return null;"
        "    const items=Array.prototype.slice.call(leg.querySelectorAll('.bl-leg-i')).map(e=>(e.textContent||'').trim());"
        "    const cs=leg.querySelector('.bl-sw.bl-cln'), rs=leg.querySelector('.bl-sw.bl-rln');"
        "    return { items:items, text:(leg.textContent||'').trim(),"
        "             cStyle:cs?getComputedStyle(cs).borderTopStyle:'',"
        "             rStyle:rs?getComputedStyle(rs).borderTopStyle:'',"
        "             overflow: leg.scrollWidth - leg.clientWidth }; };"
        "  return { month:grab('vMonthNav'), year:grab('vYearNav'),"
        "           pageOverflow: document.documentElement.scrollWidth - window.innerWidth }; }")

    m, y = data.get('month'), data.get('year')
    chk("%s · the month chart's legend names exactly 'Completion' and 'Rating'" % label,
        bool(m) and m['items'] == ['Completion', 'Rating'], m)
    chk("%s · the year chart carries the same two-word legend" % label,
        bool(y) and y['items'] == ['Completion', 'Rating'], y)
    chk("%s · each swatch is a solid line chip in its line's own stroke" % label,
        bool(m) and m['cStyle'] == 'solid' and m['rStyle'] == 'solid', m)
    legok = bool(m) and m['overflow'] <= 1 and (not y or y['overflow'] <= 1)
    chk("%s · the legend overflows nowhere sideways (wraps instead)" % label, legok,
        {'m': m and m.get('overflow'), 'y': y and y.get('overflow')})
    chk("%s · the page does not scroll sideways" % label,
        (data.get('pageOverflow') or 0) <= 1, data.get('pageOverflow'))
    noX10 = bool(m) and 'x10' not in m['text'].lower() and '×10' not in m['text'] \
        and (not y or ('x10' not in y['text'].lower() and '×10' not in y['text']))
    chk("%s · no 'x10' text in either legend" % label, noX10, {'m': m and m.get('text'), 'y': y and y.get('text')})

    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-651-LEGEND: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
