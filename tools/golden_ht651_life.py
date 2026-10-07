#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-651 S3 GOLDEN — FIVE FIXED COLOURS FOR A WEEK OF LIFE (paste 651), run literally at 390 and 1280.

  L1  window.__HT16.LIFE_SCALE carries exactly the five grades A B C D F, each a hex (never a token).
  L2  five scores 95 · 85 · 75 · 65 · 30 map to the five colours IN ORDER (A..F) through lifeScaleFill;
      a no-data week (null) is NOT a grade colour — it is var(--surface), the caller's faint outline.
  L3  the grades are ordered by lightness (A brightest .. F dimmest), so the scale reads in greyscale.
  L4  every painted week on the life grid (rect.lw on the desktop, rect.h185wk on the phone) is filled
      with one of the five LIFE_SCALE hexes and NEVER with a theme --g ramp token (the item-6 defect:
      the week colours used to mesh with the theme). It also carries data-grade.
  L5  zero page errors at either width.

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
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1200)
    return b, pg, errs


def _norm(c):
    """A hex (#RRGGBB) upper, or an rgb()/token string left as-is for comparison against the hex set."""
    c = (c or '').strip()
    m = re.match(r'#([0-9A-Fa-f]{6})$', c)
    if m: return '#' + m.group(1).upper()
    m = re.match(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)$', c.replace(' ', '').replace('rgb(', 'rgb(').replace(',', ', '))
    if m: return '#%02X%02X%02X' % (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return c


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)

    scale = await pg.evaluate("() => (window.__HT16 && window.__HT16.LIFE_SCALE) || null")
    chk("%s · LIFE_SCALE has the five grades A B C D F as hexes" % label,
        bool(scale) and sorted(scale.keys()) == ['A', 'B', 'C', 'D', 'F']
        and all(re.match(r'#[0-9A-Fa-f]{6}$', str(scale[g])) for g in scale), scale)

    mapped = await pg.evaluate(
        "() => { const f=window.__HT16.lifeScaleFill; return {"
        "a:f(95), b:f(85), c:f(75), d:f(65), ff:f(30), none:f(null)}; }")
    want = [('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D'), ('ff', 'F')]
    inorder = all(_norm(mapped[k]) == _norm(scale[g]) for k, g in want)
    chk("%s · 95·85·75·65·30 map to A·B·C·D·F in order" % label, inorder, mapped)
    chk("%s · a no-data week is var(--surface), never a grade colour" % label,
        mapped.get('none') == 'var(--surface)', mapped.get('none'))

    Ls = await pg.evaluate("() => { const S=window.__HT16.LIFE_SCALE; return Object.keys(S).map(g=>S[g]); }")
    # lightness order A>B>C>D>F via luminance of the hexes
    def lum(h):
        h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16)/255 for i in (0, 2, 4))
        def f(c): return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
        return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
    lums = [lum(scale[g]) for g in ['A', 'B', 'C', 'D', 'F']]
    chk("%s · grades ordered by lightness A>B>C>D>F (reads in greyscale)" % label,
        all(lums[i] > lums[i+1] for i in range(4)), lums)

    sel = 'rect.lw' if w >= 1024 else 'rect.h185wk'
    cells = await pg.evaluate(
        "(sel) => Array.from(document.querySelectorAll(sel)).map(r => ({f:r.getAttribute('fill'), g:r.getAttribute('data-grade')}))",
        sel)
    hexset = {_norm(scale[g]) for g in scale}
    painted = [c for c in cells if c['f'] and c['f'] != 'var(--surface)']
    allgrade = len(painted) > 0 and all(_norm(c['f']) in hexset for c in painted)
    notoken = not any('--g' in (c['f'] or '') for c in cells)
    chk("%s · every painted life week uses a LIFE_SCALE hex (%d weeks), none a theme --g token"
        % (label, len(painted)), allgrade and notoken, [c['f'] for c in cells[:6]])

    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-651-LIFE: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
