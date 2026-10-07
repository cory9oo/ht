#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-652 S2 GOLDEN — THE BLANK PAGE, run literally at 1280 and 390.

  For each journal field present on the day (why, brain dump where it exists, completed, prayer):
    P1  a tap on the day-view box opens the full-screen page carrying THAT field's text.
    P2  the page shows NO element other than the writing area and the one close control.
    P3  typing on the page writes through the box's OWN save path: the day record (S.priv) holds the
        text, and after closing the day-view box shows it.
    P4  Esc (laptop) / the close control returns to the day, page hidden.
  P5  zero page errors at either width.

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

# day-view box id -> the S.priv key it saves into
FIELD_KEY = [('iWhy', 'why'), ('iDump', 'brain_dump'), ('iTasks', 'tasks'), ('iPrayer', 'prayer')]

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

async def present(pg, fid):
    """Visible on the day view: HT-31 hid the rating's why (#iWhy, .h31gone), so the page covers the
    three boxes a person can actually tap — brain dump, completed, prayer."""
    return await pg.evaluate(
        "(id)=>{const e=document.getElementById(id);if(!e)return false;"
        "const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}", fid)

async def run(pw, w, h, label, use_esc):
    b, pg, errs = await open_page(pw, w, h)
    tested = 0
    for fid, key in FIELD_KEY:
        if not await present(pg, fid):
            continue
        tested += 1
        seed = 'seed ' + fid
        # put a known value in the box, then tap it
        await pg.evaluate("([id,v])=>{ const e=document.getElementById(id); e.value=v; }", [fid, seed])
        await pg.click('#' + fid)
        await pg.wait_for_timeout(120)
        st = await pg.evaluate(
            "() => { const p=document.getElementById('ht652page'); const ta=document.getElementById('h652ta'); "
            "return { open: p && !p.hasAttribute('hidden'), taVal: ta && ta.value, "
            "kids: p ? Array.from(p.children).map(c=>c.tagName.toLowerCase()+'.'+(c.className||'')) : null, "
            "src: window.__HT652PAGE && window.__HT652PAGE.src() }; }")
        chk("%s · %s opens the page with its text" % (label, fid),
            st['open'] and st['taVal'] == seed and st['src'] == fid, st)
        chk("%s · %s page shows only the writing area and the close control" % (label, fid),
            st['kids'] and len(st['kids']) == 2
            and any('textarea' in k for k in st['kids']) and any('button' in k for k in st['kids']),
            st['kids'])
        # type on the page
        typed = seed + ' — written on the blank page'
        await pg.evaluate(
            "([v])=>{ const ta=document.getElementById('h652ta'); ta.value=v; "
            "ta.dispatchEvent(new Event('input',{bubbles:true})); }", [typed])
        await pg.wait_for_timeout(60)
        # close
        if use_esc:
            await pg.keyboard.press('Escape')
        else:
            await pg.click('#h652x')
        await pg.wait_for_timeout(120)
        after = await pg.evaluate(
            "([id,key])=>{ const p=document.getElementById('ht652page'); const e=document.getElementById(id); "
            "const S=window.S||(window.__HT293&&window.__HT293.S&&window.__HT293.S()); "
            "return { hidden: !p || p.hasAttribute('hidden'), box: e && e.value, "
            "saved: S && S.priv ? S.priv[key] : null }; }", [fid, key])
        chk("%s · %s saved through its own path and the box shows it after close" % (label, fid),
            after['hidden'] and after['box'] == typed and after['saved'] == typed, after)
    chk("%s · at least the three index fields were present and tested" % label, tested >= 3, tested)
    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()

async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720", use_esc=True)   # laptop: Esc closes
        await run(pw, 390, 844, "390x844", use_esc=False)    # phone: the close control
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-652-PAGE: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)

if __name__ == '__main__':
    asyncio.run(main())
