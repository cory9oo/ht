#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-22 - SHOOT THE APP AT THE THREE WIDTHS THE WIRE NAMES.

    python3 _reconcile/ht_batch22/shots.py --tag after
    python3 _reconcile/ht_batch22/shots.py --tag before --dir <a fixture built from an older commit>

1280 / 1920 / 375, full page, into `shots/`.  It also walks the DETAIL door by CLICKING it
(R70.211: a page reached only by URL does not exist), so the shot of DETAIL is a shot of the
page as Cory reaches it and not of a route only the harness knows.
"""

# ---- HT-24 C7 · MOVED INTO THE REPO IT TESTS, AND IT RESOLVES ITS OWN PATHS ------------------
# This file used to resolve `<estate>/standard` - the MAIN checkout - so run from a worktree under
# CC_STANDING §4A it tested main while the branch it was meant to test sat untouched, and passed.
# `_REPO` is this file's own repo (`tools/..`); `_ESTATE` is found by walking up for `_reconcile`.
# Run it from a worktree and it tests that worktree; run it from main and it tests main.
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
_os.chdir(_ESTATE)                      # every relative path below is estate-relative, as before
_sys.path.insert(0, _os.path.join(_ESTATE, '_reconcile', 'ht_batch22'))
# ----------------------------------------------------------------------------------------------
import argparse, asyncio, os, sys
from playwright.async_api import async_playwright

SIZES = [(1280, 900), (1920, 1080), (375, 812)]


async def shoot(pw, base, tag, out, flags):
    for w, h in SIZES:
        b = await pw.chromium.launch()
        pg = await b.new_page(viewport={'width': w, 'height': h})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:' + m.text)
              if m.type == 'error' and 'net::' not in m.text else None)
        if flags:
            await pg.add_init_script("; ".join("window.%s=true" % k for k in flags))
        await pg.goto(base)
        await pg.wait_for_timeout(3300)
        p = os.path.join(out, 'ht22_%s_%d.png' % (tag, w))
        await pg.screenshot(path=p, full_page=True)
        print('  %-28s %s' % (os.path.basename(p), 'console %d' % len(errs)))
        # DETAIL, reached by clicking its own door
        opened = await pg.evaluate("""async () => {
          const m=document.querySelector('[data-h18more]'); if(!m) return false;
          m.click(); await new Promise(r=>setTimeout(r,900));
          return !!document.querySelector('.h20det'); }""")
        if opened:
            p2 = os.path.join(out, 'ht22_%s_%d_detail.png' % (tag, w))
            await pg.screenshot(path=p2, full_page=True)
            print('  %-28s (reached by clicking DETAIL)' % os.path.basename(p2))
        await b.close()


async def main(a):
    out = os.path.abspath(a.out)
    if not os.path.isdir(out):
        os.makedirs(out)
    base = 'file://' + os.path.abspath(os.path.join(a.dir, 'index.html')).replace(os.sep, '/')
    print('%s  <-  %s' % (a.tag, base))
    async with async_playwright() as pw:
        await shoot(pw, base, a.tag, out, ['__BIGSET', '__BLOCKS', '__INPUTS3'])


ap = argparse.ArgumentParser()
ap.add_argument('--tag', required=True)
ap.add_argument('--dir', default=os.path.join(_ESTATE, 'ht3'))
ap.add_argument('--out', default='shots')
asyncio.run(main(ap.parse_args()))
