#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 822 GOLDEN — THE DESKTOP SHOWS EVERYTHING; THE JOURNAL BOXES ARE ONE-LINE ENTRY POINTS.

Run at 390x844 (phone), 1280, 1440, 1695 and 1920 (desktop — Cory's laptop is 1695 wide, so that
exact width is proven, with 1440 either side). Cory, 2026-10-12: "fix the viewable on the desktop ...
shrink all of the journal boxes significantly ... let the other features fill in their spaces."

Proven at the seam where each guarantee could break:
  DESKTOP (>=1024):
    D1  the TODAY ring card (#h228Hero) is the FIRST child of the middle column (#h19Right).
    D2  NOTHING in the card is clipped: the card's own scrollHeight <= clientHeight (+1), and the
        bounding box of EVERY piece Cory named — the ring, the week row, the three tiles, the records
        line and the 'need' caption — sits inside the card's bounding box. (SVG strokes drawn with
        overflow:visible are not a card clip, so the test is geometric CONTAINMENT, not leaf
        scrollHeight — the card is the box, the ring is a thing inside it.)
    D3  the full card is visible after it is scrolled to (its rect fits inside the middle column's
        scroll viewport) — the middle column scrolls vertically, it never cuts.
    D4  the month and year charts are at least 220px tall (the freed space).
  BOTH:
    B1  each of the three journal rows (Journal/Completed/Prayer) is at most 56px tall unfocused.
    B2  a click ON THE ROW (the label caption, not the textarea body) opens the full canvas on that
        row's textarea — the 685 gate re-pointed at the row (reusing __HTJ.on()).
    B3  no horizontal scroll (scrollWidth <= clientWidth) — nothing drifts sideways.
  PHONE (<1024):
    P1  the month and year charts are UNCHANGED (~180-210px, i.e. not bumped to the desktop >=220).

R134 R1: prints its assertion count; a section that asserts nothing is a FAIL.
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


async def open_page(pw, w, h, prayer_on=False):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("; ".join("window.%s=true" % k for k in ('__BIGSET', '__BLOCKS', '__INPUTS3')))
    await pg.add_init_script("window.__HT876_JOURNAL=true")
    # PASTE 856: the Prayer journal is a flag (HT33, job 850). Off by default (the shipping app, the
    # Prayer row hidden); on when this override is set before load (the row returns).
    if prayer_on:
        await pg.add_init_script("window.__HT33_PRAYER=true")
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    return b, pg, errs


async def show(pg, tab):
    await pg.evaluate("(t)=>{ try{ if(window.__HT13_TAB) window.__HT13_TAB(t); }catch(e){} }", tab)
    await pg.wait_for_timeout(1000)


# the three journal rows and their .fld heights; a row is the .fld that holds the writing textarea
ROWS_JS = """()=>{
  function row(id){ var e=document.getElementById(id); if(!e) return null;
    var f=e.closest('.fld'); if(!f) return null;
    return { fld: Math.round(f.getBoundingClientRect().height), ph: e.getAttribute('placeholder') }; }
  return { iDump:row('iDump'), iTasks:row('iTasks'), iPrayer:row('iPrayer') };
}"""

# geometric containment of the hero's pieces inside the card, and the card's own clip state
HERO_JS = """()=>{
  var card=document.getElementById('h228Hero'); if(!card) return null;
  var cr=card.getBoundingClientRect();
  function inside(sel){ var e=card.querySelector(sel); if(!e) return null;
    var r=e.getBoundingClientRect();
    return (r.top>=cr.top-1 && r.bottom<=cr.bottom+1 && r.left>=cr.left-1 && r.right<=cr.right+1); }
  var r19=document.getElementById('h19Right');
  return {
    firstIsHero: !!(r19 && r19.firstElementChild && r19.firstElementChild.id==='h228Hero'),
    cardClip: card.scrollHeight > card.clientHeight + 1,
    ring: inside('.sh-ringwrap'), week: inside('.sh-week'),
    tiles: inside('.sh-tiles'), rec: inside('.sh-rec'), cap: inside('.sh-cap')
  };
}"""

SCROLLFIT_JS = """()=>{
  var r19=document.getElementById('h19Right'), card=document.getElementById('h228Hero');
  if(!r19 || !card) return null;
  card.scrollIntoView(true);
  var cr=card.getBoundingClientRect(), vr=r19.getBoundingClientRect();
  return { fits: (cr.top>=vr.top-1 && cr.bottom<=vr.bottom+1), ch: Math.round(cr.height), vh: Math.round(vr.height) };
}"""

CHART_JS = """(id)=>{ var e=document.getElementById(id);
  if(!(e && e.tagName && e.tagName.toLowerCase()==='svg')) e=document.querySelector('#'+id+' svg.chart');
  if(!e) return null; return Math.round(e.getBoundingClientRect().height); }"""


async def run(pw, w, h, label, prayer_on=False):
    desktop = w >= 1024
    b, pg, errs = await open_page(pw, w, h, prayer_on=prayer_on)
    if not desktop:
        await show(pg, 'today')

    # B1 — each VISIBLE journal row is a one-line row, at most 56px, with the 'tap to write' placeholder.
    # PASTE 856: the Prayer row (#iPrayer) ships hidden behind HT33 (job 850), so by default the journal
    # rows are Journal + Completed; with the flag on the Prayer row returns and is asserted like the others.
    want = ('iDump', 'iTasks', 'iPrayer') if prayer_on else ('iDump', 'iTasks')
    rows = await pg.evaluate(ROWS_JS)
    present = rows and all(rows[k] for k in want)
    chk("%s · the journal rows are present (%s)" % (label, ', '.join(want)), present, rows)
    if present:
        heights = [rows[k]['fld'] for k in want]
        chk("%s · each journal row is at most 56px tall unfocused (%s)" % (label, heights),
            all(0 < x <= 56 for x in heights), rows)
        chk("%s · each empty journal row shows the 'tap to write' placeholder" % label,
            all(rows[k]['ph'] == 'tap to write' for k in want), rows)
    # the flag's two sides: by default the Prayer row is hidden (fld 0); with the flag on it is a sized row.
    pr = rows.get('iPrayer') if rows else None
    if prayer_on:
        chk("%s · with HT33_PRAYER on, the Prayer row is present and sized" % label,
            bool(pr) and 0 < pr['fld'] <= 56, pr)
    else:
        chk("%s · by default (HT33_PRAYER off) the Prayer row is hidden (fld 0)" % label,
            (pr is None) or pr['fld'] == 0, pr)

    # B3 — no horizontal scroll at any width
    hs = await pg.evaluate("()=>({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth})")
    chk("%s · no horizontal scroll (scrollWidth %s <= clientWidth %s)" % (label, hs['sw'], hs['cw']),
        hs['sw'] <= hs['cw'] + 1, hs)

    # B2 — a click ON THE ROW (the label caption) opens the canvas on that row's textarea
    off0 = await pg.evaluate("()=>!!(window.__HTJ&&window.__HTJ.on())")
    chk("%s · the canvas is closed before the row is tapped" % label, not off0, off0)
    lab = pg.locator('.jcard .fld:has(#iDump) > .lab')
    opened = None
    try:
        await lab.click(timeout=2500)
        await pg.wait_for_timeout(200)
        opened = await pg.evaluate("()=>({on:!!(window.__HTJ&&window.__HTJ.on()), id:(window.__HTJ&&window.__HTJ.el&&window.__HTJ.el())?window.__HTJ.el().id:null})")
    except Exception as e:
        opened = {'on': False, 'id': 'click-failed:' + str(e)[:60]}
    chk("%s · a tap on the ROW (the label, not the textarea) opens the canvas on #iDump" % label,
        opened and opened['on'] and opened['id'] == 'iDump', opened)
    if opened and opened['on']:
        await pg.evaluate("()=>history.back()")
        await pg.wait_for_timeout(180)

    if desktop:
        hero = await pg.evaluate(HERO_JS)
        chk("%s · D1 the TODAY ring card is the FIRST child of the middle column #h19Right" % label,
            hero and hero['firstIsHero'], hero)
        chk("%s · D2 the TODAY card is not clipped (scrollHeight <= clientHeight)" % label,
            hero and not hero['cardClip'], hero)
        chk("%s · D2 ring/week/tiles/records/caption all sit inside the TODAY card" % label,
            hero and all(hero[k] for k in ('ring', 'week', 'tiles', 'rec', 'cap')), hero)
        sf = await pg.evaluate(SCROLLFIT_JS)
        chk("%s · D3 the full card is visible after it is scrolled to (card %s in column %s)"
            % (label, sf and sf['ch'], sf and sf['vh']), sf and sf['fits'], sf)
        mh = await pg.evaluate(CHART_JS, 'h16Month')
        yh = await pg.evaluate(CHART_JS, 'h16Year')
        chk("%s · D4 the month and year charts are at least 220px tall (month %s · year %s)" % (label, mh, yh),
            mh is not None and yh is not None and mh >= 220 and yh >= 220, [mh, yh])
    else:
        # P1 — the phone charts are UNCHANGED (not bumped to the desktop >=220): read them on Insights
        await show(pg, 'views')
        mh = await pg.evaluate(CHART_JS, 'vMonth')
        yh = await pg.evaluate(CHART_JS, 'vYear')
        chk("%s · P1 the phone month/year charts are unchanged (<220: month %s · year %s)" % (label, mh, yh),
            mh is not None and yh is not None and mh < 220 and yh < 220, [mh, yh])

    chk("%s · zero page errors" % label, not errs, errs[:3])
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 390, 844, "390x844")
        await run(pw, 1280, 720, "1280")
        await run(pw, 1440, 900, "1440")
        await run(pw, 1695, 900, "1695")
        await run(pw, 1920, 1080, "1920")
        # PASTE 856: the flag-on side — the Prayer row returns at phone and desktop widths.
        await run(pw, 390, 844, "390x844 · prayer on", prayer_on=True)
        await run(pw, 1695, 900, "1695 · prayer on", prayer_on=True)
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-822-LAYOUT: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
