#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 816 GOLDEN — MOVING A TASK IS INTENTIONAL (Cory 2026-10-11). Run at 390 (touch) and 1280.

Cory: "I still accidentally touch it ... move a task up and down on accident. Make that three-lined bar
smaller and put it to the right side of the edit option." The handle shrinks and moves to the far
right, past the pencil, and a drag ARMS only after a 350 ms STILL hold - so a scroll can never move a
task, and a deliberate press-and-hold still can.

  G1  the handle's visible glyph font-size is <= 24px (smaller);
  G2  the handle's hit box is >= 36 wide x 44 tall (a fingertip target, R70.69);
  G3  the handle's x is GREATER than the pencil's x on EVERY row (to the right of the pencil);
  H1  a press that moves 20px within 300 ms (no hold) NEVER reorders, and the page SCROLLS;
  H2  a 400 ms still hold then a 60px move REORDERS, and the new order is persisted (a sort_order write);
  H3  a press on the row's WORDS (the name) never drags.

S2 DRIVES REAL TOUCH through CDP Input.dispatchTouchEvent (pointerType 'touch'), as golden_ht23 does.
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


def _pt(x, y):
    return [{'x': float(x), 'y': float(y), 'radiusX': 12, 'radiusY': 12, 'force': 1.0, 'id': 1}]

ROWS = "() => [...document.querySelectorAll('#log .li')].map(r => r.getAttribute('data-h'))"


async def open_page(pw, w, h, bigset=False):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=2)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    if bigset:
        await pg.add_init_script("window.__BIGSET=true;")
    await pg.goto(BASE)
    await pg.wait_for_timeout(3200)
    return b, pg, errs


async def geometry(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h, bigset=True)
    d = await pg.evaluate("""() => {
      const rows = [...document.querySelectorAll('#log .li')];
      const g = rows[0].querySelector('.drg');
      const cs = getComputedStyle(g), bc = getComputedStyle(g, '::before');
      let allRight = true, bad = null;
      rows.forEach(r => { const dg = r.querySelector('.drg'), ep = r.querySelector('.edp');
        if(dg && ep){ const a = dg.getBoundingClientRect(), b = ep.getBoundingClientRect();
          if(!(a.left > b.left)){ allRight = false; if(!bad) bad = [Math.round(a.left), Math.round(b.left)]; } } });
      return { font: parseFloat(cs.fontSize), ovw: parseFloat(bc.width), ovh: parseFloat(bc.height),
               allRight, bad, rows: rows.length };
    }""")
    chk("%s · G1 the handle glyph font-size is <= 24px (%.1f)" % (label, d['font']), d['font'] <= 24, d)
    chk("%s · G2 the handle hit box is >= 36 x 44 (%sx%s)" % (label, d['ovw'], d['ovh']),
        d['ovw'] >= 36 and d['ovh'] >= 44, d)
    chk("%s · G3 the handle's x is greater than the pencil's x on every row" % label, d['allRight'], d)
    await b.close()


async def holds(pw, label):
    # H1 — a quick move (no hold) scrolls and never reorders
    b, pg, errs = await open_page(pw, 390, 844, bigset=True)
    cdp = await pg.context.new_cdp_session(pg)
    await pg.evaluate("() => { const r=document.querySelector('#log .li'); const y=r.getBoundingClientRect().top; window.scrollBy(0, y-300); }")
    await pg.wait_for_timeout(150)
    before = await pg.evaluate(ROWS)
    sy0 = await pg.evaluate("() => window.scrollY")
    hb = await pg.evaluate("() => { const g=document.querySelector('#log .li .drg'); const b=g.getBoundingClientRect(); return {x:b.left+b.width/2, y:b.top+b.height/2}; }")
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': _pt(hb['x'], hb['y'])})
    for i in range(1, 11):                                   # ~250 ms, no still hold, moving up ~50px
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': _pt(hb['x'], hb['y'] - 50 * i / 10)})
        await pg.wait_for_timeout(22)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(250)
    after1 = await pg.evaluate(ROWS)
    sy1 = await pg.evaluate("() => window.scrollY")
    chk("%s · H1 a quick move (no hold) never reorders, and the page scrolled" % label,
        after1 == before and abs(sy1 - sy0) > 5, {'reordered': after1 != before, 'scroll': [sy0, sy1]})
    await b.close()

    # H2 — a 400 ms still hold then a 60px move reorders, and it persists (a sort_order write)
    b, pg, errs2 = await open_page(pw, 390, 844, bigset=True)
    cdp = await pg.context.new_cdp_session(pg)
    await pg.evaluate("() => { const r=document.querySelector('#log .li'); const y=r.getBoundingClientRect().top; window.scrollBy(0, y-300); }")
    await pg.wait_for_timeout(150)
    before = await pg.evaluate(ROWS)
    await pg.evaluate("() => { window.__UPDATES = []; }")
    hb = await pg.evaluate("() => { const g=document.querySelector('#log .li .drg'); const b=g.getBoundingClientRect(); return {x:b.left+b.width/2, y:b.top+b.height/2}; }")
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': _pt(hb['x'], hb['y'])})
    await pg.wait_for_timeout(420)                           # STILL hold -> arm
    for i in range(1, 11):
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': _pt(hb['x'], hb['y'] + 70 * i / 10)})
        await pg.wait_for_timeout(18)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(400)
    after2 = await pg.evaluate(ROWS)
    wrote = await pg.evaluate("() => (window.__UPDATES||[]).filter(u=>u[0]==='habits' && 'sort_order' in u[1]).length")
    chk("%s · H2 a 400ms hold then a move reorders, and the order is persisted" % label,
        after2 != before and sorted(after2) == sorted(before) and wrote > 0,
        {'reordered': after2 != before, 'wrote': wrote})
    await b.close()

    # H3 — a press on the row's WORDS never drags
    b, pg, errs3 = await open_page(pw, 390, 844, bigset=True)
    cdp = await pg.context.new_cdp_session(pg)
    await pg.evaluate("() => { const r=document.querySelector('#log .li'); const y=r.getBoundingClientRect().top; window.scrollBy(0, y-300); }")
    await pg.wait_for_timeout(150)
    before = await pg.evaluate(ROWS)
    nb = await pg.evaluate("() => { const n=document.querySelector('#log .li .nm'); const b=n.getBoundingClientRect(); return {x:b.left+b.width/2, y:b.top+b.height/2}; }")
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': _pt(nb['x'], nb['y'])})
    await pg.wait_for_timeout(420)
    for i in range(1, 11):
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': _pt(nb['x'], nb['y'] + 70 * i / 10)})
        await pg.wait_for_timeout(18)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(300)
    after3 = await pg.evaluate(ROWS)
    chk("%s · H3 a press on the row's words never drags (no reorder)" % label, after3 == before,
        {'reordered': after3 != before})
    chk("%s · H4 zero page errors through the holds" % label, not (errs or errs2 or errs3),
        (errs + errs2 + errs3)[:3])
    await b.close()


async def main():
    async with async_playwright() as pw:
        await geometry(pw, 390, 844, "390x844")
        await geometry(pw, 1280, 720, "1280x720")
        await holds(pw, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-816-HOLD: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
