#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-652 S1 GOLDEN — DAWN AND DUSK, run literally at 1280 and 390.

  T1  a Scheduled row planned in the morning (06:00) carries .tint-dawn and not .tint-dusk.
  T2  a Scheduled row planned at night (21:00) carries .tint-dusk and not .tint-dawn.
  T3  a Standards row carries neither tint.
  T4  the dawn and dusk rows resolve to DIFFERENT, non-transparent backgrounds; the Standards row's
      is transparent (the row ground shows through, no wash).
  T5  zero page errors.
  T6  tools/tint_contrast_check.py exits 0 (the wash never costs a row its legibility).

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
import asyncio, json, subprocess, sys
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

FLAGS = dict(__SECTION=True,
             __SECTIONS={'h2': 'standards'},
             __ANCHORS={'h0': {'a': '06:00', 'm': 30}, 'h1': {'a': '21:00', 'm': 15}})

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
    init = "; ".join("window.%s=%s" % (k, json.dumps(v)) for k, v in FLAGS.items())
    await pg.add_init_script(init)
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    return b, pg, errs

async def row(pg, hid):
    return await pg.evaluate(
        "(id) => { const r = document.querySelector('#log .li[data-h=\"'+id+'\"]'); if(!r) return null; "
        "const cs = getComputedStyle(r); "
        "return { dawn: r.classList.contains('tint-dawn'), dusk: r.classList.contains('tint-dusk'), "
        "bg: cs.backgroundColor }; }", hid)

def transparent(bg):
    bg = (bg or '').replace(' ', '')
    return bg in ('rgba(0,0,0,0)', 'transparent') or bg.endswith(',0)')

async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)
    morn = await row(pg, 'h0')
    night = await row(pg, 'h1')
    std = await row(pg, 'h2')
    chk("%s · morning row (06:00) wears dawn, not dusk" % label,
        morn and morn['dawn'] and not morn['dusk'], morn)
    chk("%s · night row (21:00) wears dusk, not dawn" % label,
        night and night['dusk'] and not night['dawn'], night)
    chk("%s · standards row wears neither tint" % label,
        std and not std['dawn'] and not std['dusk'], std)
    chk("%s · dawn and dusk rows resolve to different, opaque washes" % label,
        morn and night and not transparent(morn['bg']) and not transparent(night['bg'])
        and morn['bg'] != night['bg'], [morn and morn['bg'], night and night['bg']])
    chk("%s · the standards row ground shows through (no wash)" % label,
        std and transparent(std['bg']), std and std['bg'])
    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()

async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    cc = subprocess.run([sys.executable, _os.path.join(_REPO, 'tools', 'tint_contrast_check.py')],
                        capture_output=True, text=True)
    chk("tint_contrast_check.py exits 0", cc.returncode == 0, cc.stdout[-300:] + cc.stderr[-300:])
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-652-TINT: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)

if __name__ == '__main__':
    asyncio.run(main())
