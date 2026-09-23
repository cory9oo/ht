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

# HT-32 S6.14 - the three widths the THEME shots are asked for, which are not quite the three above:
# 390x844 is the phone Cory actually holds (375x812 is the older one this file has always shot), and
# 1280x720 / 1920x1080 are his two desktop widths.
THEME_SIZES = [(390, 844), (1280, 720), (1920, 1080)]
THEMES = ['classic', 'graphite', 'midnight', 'paper']


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


async def shoot_themes(pw, base, out, also=None):
    """One screenshot per theme per width, with the theme written to localStorage BEFORE the first
    navigation - which is the only way to photograph what a COLD START looks like. Setting it after
    a load and reloading would shoot the second load, and the whole point of S6's pre-paint script is
    that the first one is already right."""
    made = []
    for t in THEMES:
        for w, h in THEME_SIZES:
            b = await pw.chromium.launch()
            ctx = await b.new_context(viewport={'width': w, 'height': h},
                                      has_touch=(w < 1024), is_mobile=(w < 1024),
                                      device_scale_factor=1)
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.add_init_script("try{localStorage.setItem('ht_theme','%s');}catch(e){}" % t)
            await pg.add_init_script("; ".join("window.%s=true" % k for k in ('__BIGSET', '__CIRCLE')))
            await pg.goto(base)
            await pg.wait_for_timeout(2600)
            name = 'ht32_%s_%d.png' % (t, w)
            for d in [out] + list(also or []):
                if not os.path.isdir(d):
                    os.makedirs(d)
                await pg.screenshot(path=os.path.join(d, name), full_page=(w >= 1024))
            got = await pg.get_attribute('html', 'data-theme')
            print('  %-24s theme=%-9s %s' % (name, got, 'console %d' % len(errs) if errs else ''))
            if got != t:
                print('     !! the page rendered %r, not %r - the shot is of the wrong theme' % (got, t))
            made.append((t, w, got))
            await b.close()
    bad = [x for x in made if x[2] != x[0]]
    print('  %d shot(s), %d theme mismatch(es)' % (len(made), len(bad)))
    return made, bad


async def main(a):
    out = os.path.abspath(a.out)
    if not os.path.isdir(out):
        os.makedirs(out)
    base = 'file://' + os.path.abspath(os.path.join(a.dir, 'index.html')).replace(os.sep, '/')
    print('%s  <-  %s' % (a.tag, base))
    async with async_playwright() as pw:
        if a.themes:
            stage = os.path.abspath(a.stage) if a.stage else None
            await shoot_themes(pw, base, out, [stage] if stage else None)
            return
        await shoot(pw, base, a.tag, out, ['__BIGSET', '__BLOCKS', '__INPUTS3'])


ap = argparse.ArgumentParser()
ap.add_argument('--tag', default='shot')
ap.add_argument('--themes', action='store_true',
                help='HT-32 S6.14: one shot per theme per width, so Cory picks by looking')
ap.add_argument('--stage', default=None, help='a second directory to write the same shots into')
def fixture_dir(estate):
    """The headless fixture. R70.345 (2026-09-10) moved it with the machinery to <BEV>/_machine/ht3;
    the old <BEV>/ht3 is the fallback, so this runs in either layout."""
    for d in (os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if os.path.isdir(d):
            return d
    return os.path.join(estate, '_machine', 'ht3')


ap.add_argument('--dir', default=fixture_dir(_ESTATE))
# R70.345: the estate's shots/ moved to _machine/shots; a bare 'shots' would now land in the container root
ap.add_argument('--out', default=(os.path.join('_machine', 'shots')
                                  if os.path.isdir(os.path.join(_ESTATE, '_machine', 'shots')) else 'shots'))
asyncio.run(main(ap.parse_args()))
