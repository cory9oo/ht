#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 695 GOLDEN — ONE JOURNAL TYPE SIZE, EVERYWHERE; A TAP NEVER ZOOMS OR PANS.

Run literally at 1280x720 and 390x844 (touch). Two laws, proven at the seam where each broke.

LAW 1 — ONE SIZE: before 695 the card's boxes read `.fld textarea` (12.5px) while the canvas rule
`textarea.htj-box` set its OWN 13/14px — two numbers for one type, free to drift. The fix is one
`--htype` / `--htype-lh` on :root read by BOTH the writing-box rule and the canvas rule. This golden
measures the SAME textarea in the card and again once it is the canvas and asserts the font-size and
line-height match to the pixel — so if a future edit gives the canvas its own number again, this goes
red. It also asserts every writing box on the Journal card AND the Rate-the-day why box (#iWhy) share
ONE size and line-height and that size is at most 15px. #iWhy renders at zero size on the desk and
`display:none` under the phone strip, so a line-height NORMALISER (unitless ratio = px line-height ÷
font-size, or the bare number where layout gives none) reads it faithfully.

LAW 2 — NO ZOOM, NO PAN: the viewport meta carries maximum-scale=1 beside initial-scale=1 and
width=device-width (the consensus stop for iOS Safari's sub-16px focus zoom; the in-the-wild zoom is
not something a desktop-Chromium harness can feel, so the receipt's FOR CORY asks Cory to tap the box
on his phone — this golden proves the GUARDS). With a box open as the canvas: visualViewport.scale is
1, visualViewport.offsetLeft is 0 and window.scrollX is 0 (before and after typing); the canvas
scrollWidth equals its clientWidth (overflow-x hidden + overflow-wrap:anywhere — a line never exceeds
the box); its computed touch-action is pan-y. A real sideways touch swipe (CDP) moves nothing
(scrollLeft 0, offsetLeft 0, scrollX 0); a vertical swipe on seeded over-long text grows the
textarea's scrollTop — sideways is dead, up and down lives. Leaving the canvas, the size and position
are unchanged.

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
    # has_touch at BOTH widths: this golden drives real touch gestures through CDP at each.
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=True, is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    return b, pg, errs

# Every textarea id inside the Journal card `.jcard` at run time, in DOM order (whyBack has moved #iWhy
# in by now, so the list carries it), or None if the card is gone.
CARD_IDS = ("()=>{ const c=document.querySelector('.jcard'); "
            "return c ? Array.prototype.map.call(c.querySelectorAll('textarea'), t=>t.id) : null; }")

# Read a box's type faithfully even where it has no layout: font-size always computes to an absolute
# length (so it reads on display:none too); line-height is normalised to a unitless ratio — px ÷
# font-size where layout gives a px value, else the bare number computed value.
MEASURE = """(id)=>{ const e=document.getElementById(id); if(!e) return null;
  const cs=getComputedStyle(e); const fs=parseFloat(cs.fontSize);
  const lhr=cs.lineHeight; let ratio;
  if(lhr==='normal') ratio=null;
  else if(lhr.indexOf('px')>=0) ratio=parseFloat(lhr)/fs;
  else ratio=parseFloat(lhr);
  return { fs:fs, fsRaw:cs.fontSize, lhRaw:cs.lineHeight, ratio:ratio, ta:cs.touchAction }; }"""

# The open canvas element (the SAME textarea, promoted) and its scroll/zoom state.
CANVAS = """()=>{ const el = window.__HTJ && window.__HTJ.el ? window.__HTJ.el() : null;
  if(!el) return null; const cs=getComputedStyle(el);
  return { sw:el.scrollWidth, cw:el.clientWidth, sl:el.scrollLeft, st:el.scrollTop,
           ta:cs.touchAction, fsRaw:cs.fontSize, lhRaw:cs.lineHeight,
           scale:(window.visualViewport?window.visualViewport.scale:1),
           offLeft:(window.visualViewport?window.visualViewport.offsetLeft:0),
           scrollX:window.scrollX }; }"""

VIEW = ("()=>({ scale:(window.visualViewport?window.visualViewport.scale:1), "
        "offLeft:(window.visualViewport?window.visualViewport.offsetLeft:0), scrollX:window.scrollX })")

async def card_ids(pg):
    return await pg.evaluate(CARD_IDS)

async def seed(pg, fid, v):
    await pg.evaluate("([id,v])=>{ const e=document.getElementById(id); e.value=v; "
                      "e.dispatchEvent(new Event('input',{bubbles:true})); }", [fid, v])

def _pt(x, y):
    return [{'x': float(x), 'y': float(y), 'radiusX': 12, 'radiusY': 12, 'force': 1.0, 'id': 1}]

async def touch_pan(pg, cdp, x0, y0, x1, y1, steps=12):
    # a real finger drag through CDP touch events (pointerType 'touch') — the browser pans exactly as
    # a thumb would, so touch-action decides what moves. A drag whose finger goes UP scrolls the text
    # DOWN (scrollTop grows); a horizontal drag is refused by touch-action:pan-y.
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': _pt(x0, y0)})
    for i in range(1, steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + (y1 - y0) * i / steps
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': _pt(x, y)})
        await pg.wait_for_timeout(10)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(140)

def near(a, b, eps=0.01):
    return a is not None and b is not None and abs(a - b) <= eps

# over-long seed: 200 lines (taller than any viewport) plus one 600-char unbroken token (only
# overflow-wrap:anywhere keeps it from exceeding the box width).
LONGTEXT = ("\n".join("line %d of the journal, long enough to need a vertical scroll" % i
                      for i in range(200))) + "\n" + ("x" * 600)

async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)
    cdp = await pg.context.new_cdp_session(pg)

    # --- LAW 2a: the viewport meta carries the three required tokens ---
    meta = await pg.evaluate("()=>{const m=document.querySelector('meta[name=viewport]');return m?m.content:null;}")
    mc = (meta or "").replace(' ', '')
    chk("%s · viewport meta carries maximum-scale=1, initial-scale=1, width=device-width" % label,
        'maximum-scale=1' in mc and 'initial-scale=1' in mc and 'width=device-width' in mc, meta)

    # --- LAW 1a: one size and one line-height across every box on the card (incl. #iWhy), at most 15px ---
    ids = await card_ids(pg)
    ok_list = isinstance(ids, list) and 'iWhy' in ids and all(x in ids for x in ('iDump', 'iTasks', 'iPrayer'))
    chk("%s · the Journal card holds the writing boxes + the why box (iDump/iTasks/iPrayer/iWhy)" % label, ok_list, ids)
    if not ok_list:
        await b.close(); return
    want = list(dict.fromkeys(list(ids) + ['iWhy']))      # every card textarea, #iWhy guaranteed in
    ms = {}
    for tid in want:
        ms[tid] = await pg.evaluate(MEASURE, tid)
    fss = [ms[t]['fs'] for t in want]
    ratios = [ms[t]['ratio'] for t in want]
    chk("%s · every box's type is at most 15px" % label, all(f is not None and f <= 15 for f in fss), ms)
    chk("%s · every box reads ONE font-size (identical across all boxes)" % label,
        all(near(f, fss[0]) for f in fss), {t: ms[t]['fsRaw'] for t in want})
    chk("%s · every box reads ONE line-height ratio (identical across all boxes)" % label,
        all(r is not None for r in ratios) and all(near(r, ratios[0]) for r in ratios),
        {t: (ms[t]['lhRaw'], ms[t]['ratio']) for t in want})

    # --- per writing box: the seam (card == canvas to the pixel) + LAW 2 guards. Fresh page per box:
    # leaving the canvas does not reset a box's grown height (a pre-683 grow() behaviour), so a clean
    # page per box keeps the geometry honest. ---
    writing = [t for t in ids if t != 'iWhy']
    cx, cy = w / 2.0, h / 2.0
    for tid in writing:
        await pg.goto(BASE); await pg.wait_for_timeout(2600)
        cdp = await pg.context.new_cdp_session(pg)
        cardm = await pg.evaluate(MEASURE, tid)
        await pg.click('#' + tid)
        await pg.wait_for_timeout(180)
        cv = await pg.evaluate(CANVAS)
        on = await pg.evaluate("()=>!!(window.__HTJ&&window.__HTJ.on())")
        chk("%s · #%s opens as the canvas" % (label, tid), on and cv is not None, {'on': on, 'cv': cv})
        if not (on and cv):
            continue
        # LAW 1b — identical to the pixel between the box and the canvas (same font-size, same line-height)
        chk("%s · #%s · card type == canvas type to the pixel (%s / %s)" % (label, tid, cardm['fsRaw'], cardm['lhRaw']),
            cv['fsRaw'] == cardm['fsRaw'] and cv['lhRaw'] == cardm['lhRaw'] and parseable(cv['fsRaw']) <= 15,
            {'card': (cardm['fsRaw'], cardm['lhRaw']), 'canvas': (cv['fsRaw'], cv['lhRaw'])})
        # LAW 2b — at rest (empty), scale 1, no sideways offset, no horizontal overflow, pan-y
        chk("%s · #%s · open: scale 1, offsetLeft 0, scrollX 0" % (label, tid),
            near(cv['scale'], 1) and cv['offLeft'] == 0 and cv['scrollX'] == 0, cv)
        chk("%s · #%s · open: canvas scrollWidth == clientWidth, touch-action pan-y" % (label, tid),
            cv['sw'] == cv['cw'] and cv['ta'] == 'pan-y', cv)
        # type over-long text, then re-check scale/offset/overflow
        await seed(pg, tid, LONGTEXT)
        await pg.wait_for_timeout(120)
        cv2 = await pg.evaluate(CANVAS)
        chk("%s · #%s · after typing: scale 1, offsetLeft 0, scrollX 0" % (label, tid),
            near(cv2['scale'], 1) and cv2['offLeft'] == 0 and cv2['scrollX'] == 0, cv2)
        chk("%s · #%s · after typing: scrollWidth == clientWidth (overflow-wrap holds the line in)" % (label, tid),
            cv2['sw'] == cv2['cw'], cv2)
        # LAW 2c — a sideways finger drag moves NOTHING (touch-action:pan-y refuses it; overflow-x
        # hidden + overflow-wrap leave no horizontal range anyway)
        await touch_pan(pg, cdp, cx - 160, cy, cx + 160, cy)
        cv3 = await pg.evaluate(CANVAS)
        chk("%s · #%s · a sideways swipe moves nothing (scrollLeft 0, offsetLeft 0, scrollX 0)" % (label, tid),
            cv3['sl'] == 0 and cv3['offLeft'] == 0 and cv3['scrollX'] == 0, cv3)
        # LAW 2d — a vertical finger drag grows scrollTop. Seeding left the scroll at the bottom, so
        # start from a known top and let the DRAG (finger up -> text scrolls down) do the scrolling.
        await pg.evaluate("()=>{ const el=window.__HTJ.el(); el.scrollTop=0; }")
        await pg.wait_for_timeout(80)
        before = (await pg.evaluate(CANVAS))['st']
        await touch_pan(pg, cdp, cx, cy + 260, cx, cy - 260)
        cv4 = await pg.evaluate(CANVAS)
        chk("%s · #%s · a vertical swipe grows the text's scrollTop (%s -> %s)" % (label, tid, before, cv4['st']),
            cv4['st'] > before and cv4['sl'] == 0, cv4)
        # leave the canvas — size and position unchanged
        await pg.evaluate("()=>history.back()")
        await pg.wait_for_timeout(200)
        off = await pg.evaluate("()=>!!(window.__HTJ&&window.__HTJ.on())")
        after = await pg.evaluate(MEASURE, tid)
        vv = await pg.evaluate(VIEW)
        chk("%s · #%s · leaving the canvas: closed, size unchanged, scale 1 / offsetLeft 0 / scrollX 0" % (label, tid),
            (not off) and after['fsRaw'] == cardm['fsRaw'] and after['lhRaw'] == cardm['lhRaw']
            and near(vv['scale'], 1) and vv['offLeft'] == 0 and vv['scrollX'] == 0,
            {'off': off, 'after': (after['fsRaw'], after['lhRaw']), 'vv': vv})

    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()

def parseable(s):
    try: return float(str(s).replace('px', ''))
    except Exception: return 999

async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-695-BOXES: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)

if __name__ == '__main__':
    asyncio.run(main())
