#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-432 - BEFORE/AFTER SHOTS OF THE TWO INSIGHTS CHARTS.

    python3 tools/shots432.py --tag before --out _reconcile/os_stage/432/before
    python3 tools/shots432.py --tag after  --out _reconcile/os_stage/432/after

Three themes (crimson, moss, graphite) x two widths (390 phone, 1280 desktop). It reaches the
charts the way Cory does - clicks into the Views tab (R70.211) - and shoots the #h16Month and
#h16Year cards, plus a full-page fallback. Resolves its own estate/repo like shots.py (HT-24 C7).
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
import argparse, asyncio, os
from playwright.async_api import async_playwright

THEMES = ['crimson', 'moss', 'graphite']
SIZES = [(390, 844), (1280, 720)]

def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'),
              os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    return os.path.join(estate, '_machine', 'ht3')

BASE = 'file://' + os.path.join(fixture_dir(_ESTATE), 'index.html').replace(os.sep, '/')


async def one(pw, theme, w, h, tag, out):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("try{localStorage.setItem('ht_theme','%s');}catch(e){}" % theme)
    await pg.add_init_script("; ".join("window.%s=true" % k for k in ('__BIGSET', '__BLOCKS', '__INPUTS3')))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2800)
    # reach the charts as Cory does - the Views tab (R70.211)
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1400)
    got = await pg.get_attribute('html', 'data-theme')
    made = 0
    for cid, lbl in (('h16Month', 'month'), ('h16Year', 'year')):
        el = await pg.query_selector('#' + cid)
        if el:
            box = await el.bounding_box()
            if box and box['width'] > 4 and box['height'] > 4:
                p = os.path.join(out, '%s_%s_%d_%s.png' % (tag, theme, w, lbl))
                await el.screenshot(path=p)
                made += 1
    # full-page fallback, always
    fp = os.path.join(out, '%s_%s_%d_full.png' % (tag, theme, w))
    await pg.screenshot(path=fp, full_page=(w >= 1024))
    print('  %-8s %4d  theme=%-9s cards=%d %s' % (theme, w, got, made,
          ('console %d' % len(errs)) if errs else ''))
    if got != theme:
        print('     !! rendered %r not %r' % (got, theme))
    await b.close()
    return made


async def main(a):
    out = os.path.abspath(a.out)
    if not os.path.isdir(out):
        os.makedirs(out)
    print('%s  <-  %s' % (a.tag, BASE))
    total = 0
    async with async_playwright() as pw:
        for theme in THEMES:
            for w, h in SIZES:
                total += await one(pw, theme, w, h, a.tag, out)
    print('  %d card shot(s) into %s' % (total, out))


ap = argparse.ArgumentParser()
ap.add_argument('--tag', default='before')
ap.add_argument('--out', default='_reconcile/os_stage/432/before')
asyncio.run(main(ap.parse_args()))
