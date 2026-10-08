#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 677 GOLDEN — THE FOCUS VIEW, run literally at 1280 and 390.

A tap on a panel's title bar turns that one panel into a full-screen canvas; leaving returns to the
grid. For each width (desk → leave by Escape, phone → leave by the close mark):
  P1  at load focus is OFF — no `#htfX`, body has no `htf-on`, `window.__HTF.on()` is false.
  P2  a tap on the Completion panel's `.sh` turns focus ON — body `htf-on`, that `.blk` carries
      `htf-focus`, `#htfX` is visible, `window.__HTF.on()` is true.
  P3  the focused panel FILLS THE VIEWPORT (rect ≈ innerWidth × innerHeight, top/left ≈ 0) and it is
      the ONLY visible panel (exactly one `.blk` has a non-zero rect).
  P4  the type stays small — the focused panel's computed font-size is ≤ 15 px (never enlarged).
  P5  leaving (Escape on desk / the close mark on phone) returns to the grid: focus OFF, `#htfX`
      gone, more than one `.blk` visible again.
  P6  zero page errors at this width.

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
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    return b, pg, errs

# how many panels are visible, and whether the focused one fills the viewport
PROBE = """() => {
  const vis = Array.from(document.querySelectorAll('.grid .blk')).filter(b=>{
    const r=b.getBoundingClientRect(); return r.width>0 && r.height>0; });
  const f = document.querySelector('.htf-focus');
  const r = f ? f.getBoundingClientRect() : null;
  const x = document.getElementById('htfX');
  return {
    on: !!(window.__HTF && window.__HTF.on()),
    bodyOn: document.body.classList.contains('htf-on'),
    xShown: !!(x && x.getBoundingClientRect().width>0),
    visCount: vis.length,
    fills: r ? (r.top<=1 && r.left<=1 && r.width>=window.innerWidth-2 && r.height>=window.innerHeight-2) : false,
    fontPx: f ? parseFloat(getComputedStyle(f).fontSize) : null
  };
}"""

async def run(pw, w, h, label, use_esc):
    b, pg, errs = await open_page(pw, w, h)

    # P1 — opens closed
    s0 = await pg.evaluate(PROBE)
    chk("%s · focus is OFF at load (opens closed)" % label,
        (not s0['on']) and (not s0['bodyOn']) and (not s0['xShown']) and s0['visCount'] >= 2, s0)

    # find and tap the Completion panel's title bar
    target = None
    for hsh in await pg.query_selector_all('.grid .blk > .sh'):
        t = (await hsh.text_content()) or ''
        if 'Completion' in t:
            target = hsh
            break
    chk("%s · the Completion panel's title bar is present" % label, target is not None)
    if target is None:
        chk("%s · zero page errors" % label, not errs, errs)
        await b.close(); return
    await target.click()
    await pg.wait_for_timeout(260)

    # P2/P3/P4 — focus on, fills the viewport alone, type small
    s1 = await pg.evaluate(PROBE)
    chk("%s · a tap turns focus ON (body htf-on, close mark shown)" % label,
        s1['on'] and s1['bodyOn'] and s1['xShown'], s1)
    chk("%s · the panel fills the viewport, alone" % label,
        s1['fills'] and s1['visCount'] == 1, s1)
    chk("%s · the type stays small (≤ 15px)" % label,
        s1['fontPx'] is not None and s1['fontPx'] <= 15, s1)

    # P5 — leave
    if use_esc:
        await pg.keyboard.press('Escape')
    else:
        await pg.click('#htfX')
    await pg.wait_for_timeout(260)
    s2 = await pg.evaluate(PROBE)
    chk("%s · leaving returns to the grid (focus OFF, close mark gone)" % label,
        (not s2['on']) and (not s2['bodyOn']) and (not s2['xShown']) and s2['visCount'] >= 2, s2)

    # P6
    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()

async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720", use_esc=True)   # desk: Esc leaves
        await run(pw, 390, 844, "390x844", use_esc=False)    # phone: the close mark leaves
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-677-FOCUS: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)

if __name__ == '__main__':
    asyncio.run(main())
