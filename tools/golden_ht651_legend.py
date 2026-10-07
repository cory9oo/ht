#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-651 S2 GOLDEN — EVERY LINE IS NAMED (paste 651 S2 / 656 S3), at 390 and 1280.

Under the month and the year line charts a small legend names each line drawn, in the line's own
stroke, from ONE place (LINE_LABELS):

  G1  the month chart carries a legend naming Completion % and Day rating ×10.
  G2  the year chart carries the same-worded legend.
  G3  the completion swatch is a SOLID stroke and the rating swatch is a DASHED stroke (the line's own).
  G4  at 390 px the legend overflows nowhere sideways (its scrollWidth fits, and the page does not
      scroll sideways) — it wraps to a second row instead.
  G5  zero page errors at either width.

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
        "  const grab=id=>{ const l=document.getElementById(id);"
        "    if(!l) return null; const sw=l.querySelector('.chleg');"
        "    const cs=l.querySelector('.chsw-c'), rs=l.querySelector('.chsw-r');"
        "    return { text:(l.textContent||'').trim(),"
        "             cStyle:cs?getComputedStyle(cs).borderTopStyle:'',"
        "             rStyle:rs?getComputedStyle(rs).borderTopStyle:'',"
        "             overflow: sw ? (sw.scrollWidth - sw.clientWidth) : -999 }; };"
        "  return { month:grab('vMonthLeg'), year:grab('vYearLeg'),"
        "           pageOverflow: document.documentElement.scrollWidth - window.innerWidth }; }")

    m, y = data.get('month'), data.get('year')
    chk("%s · the month chart has a legend naming Completion %% and Day rating" % label,
        bool(m) and 'Completion %' in m['text'] and 'Day rating' in m['text'], m)
    chk("%s · the year chart has the same-worded legend" % label,
        bool(y) and 'Completion %' in y['text'] and 'Day rating' in y['text'], y)
    chk("%s · the completion swatch is solid, the rating swatch is dashed (the line's own stroke)" % label,
        bool(m) and m['cStyle'] == 'solid' and m['rStyle'] == 'dashed', m)
    # no sideways scroll: the legend does not overflow its box, and the page does not scroll sideways
    legok = bool(m) and m['overflow'] <= 1 and (not y or y['overflow'] <= 1)
    chk("%s · the legend overflows nowhere sideways (wraps instead)" % label, legok,
        {'m': m and m.get('overflow'), 'y': y and y.get('overflow')})
    chk("%s · the page does not scroll sideways" % label,
        (data.get('pageOverflow') or 0) <= 1, data.get('pageOverflow'))

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
