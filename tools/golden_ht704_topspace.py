#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 704 GOLDEN — FREE SPACE AT THE TOP OF EVERY WRITING BOX.

Cory writes newest-first ("I type bottom up not top down"), so every multi-line writing box on the
Journal card keeps a clear top area — about three lines of its own type — to tap and begin a new entry
ABOVE the old one. The space is CSS `padding-top`, NEVER stored blank lines, so a saved box still begins
at the first typed character. Run literally at 1280x720 (desktop) and 390x844 (phone).

Proven at the seam where each guarantee could break:
  CANVAS (the one writing surface every box opens as, 685, uniform on both sizes): for each box
    (#iDump / #iTasks / #iPrayer) — the canvas is box-sizing:border-box; its padding-top is at least
    two lines of its own type (the top tap target exists, about three lines); its type is at most 15px
    (695 untouched, one quiet size); opening shows the TOP (scrollTop === 0) with the caret NOT forced
    to the end; a tap in the top free space homes the caret to position 0 (selectionStart ===
    selectionEnd === 0) with scrollTop === 0; and typing there, through the box's OWN input path, saves
    into S.priv so the stored field equals the box, begins with the typed character and has NO leading
    blank line (the space is padding, never a newline in the value).
  CARD: on the phone each of the three card boxes carries the top space; on the desktop #iDump's card
    box carries it (Completed/Prayer rest as the compact #h18Btm previews on the desktop and carry their
    top space in the canvas they open on a tap — proven above, uniform on both sizes).

To make each guarantee honest the box is put in its HOSTILE state before opening: scrolled to the
bottom with the caret at 0, then opened by a SYNTHETIC click (which moves neither scroll nor caret) —
so "opening shows the top" and "a top tap homes the caret" are red unless the wire's behaviour runs.

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
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:240])))

async def open_page(pw, w, h):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=True, is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    return b, pg, errs

# measure any element: its type, its line-height in px, its top padding, box-sizing, and the live
# caret/scroll/value state. A "line" is the computed line-height in px (px value, or ratio x font-size,
# or the 1.2 fallback where layout gives none).
_MEASURE_FN = ("function _m(e){ var cs=getComputedStyle(e); var fs=parseFloat(cs.fontSize);"
               " var lh=cs.lineHeight, lhpx; if(lh==='normal'){ lhpx=fs*1.2; }"
               " else if(lh.indexOf('px')>=0){ lhpx=parseFloat(lh); } else { lhpx=parseFloat(lh)*fs; }"
               " return { fs:fs, lhpx:lhpx, padTop:parseFloat(cs.paddingTop), box:cs.boxSizing,"
               " st:e.scrollTop, ss:e.selectionStart, se:e.selectionEnd, vlen:e.value.length }; }")

CARD_MEASURE = "(id)=>{ %s var e=document.getElementById(id); return e?_m(e):null; }" % _MEASURE_FN
CANVAS_MEASURE = ("()=>{ %s var e=window.__HTJ&&window.__HTJ.el?window.__HTJ.el():null;"
                  " return e?_m(e):null; }" % _MEASURE_FN)
ON = "()=>!!(window.__HTJ&&window.__HTJ.on())"

# over-long multi-line seed whose FIRST character is a letter (no leading blank), tall enough to scroll.
LONGTEXT = "\n".join("line %d of the journal, old words already here" % i for i in range(200))

async def seed(pg, fid, v):
    await pg.evaluate("([id,v])=>{ var e=document.getElementById(id); e.value=v;"
                      " e.dispatchEvent(new Event('input',{bubbles:true})); }", [fid, v])

# the HOSTILE state: caret at 0, box scrolled to the very bottom.
async def to_bottom(pg, fid):
    await pg.evaluate("(id)=>{ var e=document.getElementById(id); e.setSelectionRange(0,0);"
                      " e.scrollTop=e.scrollHeight; }", fid)

# open by a SYNTHETIC click: boxCanvas's delegated (bubbling) handler promotes the SAME node to the
# canvas, and it moves neither the scroll nor the caret — so the wire's own open behaviour is what must
# bring the view to the top.
async def synth_open(pg, fid):
    await pg.evaluate("(id)=>{ document.getElementById(id)"
                      ".dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); }", fid)
    await pg.wait_for_timeout(140)

# type one character at the caret through the box's OWN input path (insert at selectionStart, fire input).
async def type_at_caret(pg, fid, ch):
    await pg.evaluate("([id,ch])=>{ var e=document.getElementById(id); var s=e.selectionStart||0;"
                      " e.value=e.value.slice(0,s)+ch+e.value.slice(s);"
                      " e.setSelectionRange(s+ch.length,s+ch.length);"
                      " e.dispatchEvent(new Event('input',{bubbles:true})); }", [fid, ch])
    await pg.wait_for_timeout(120)

async def saved_field(pg, key):
    return await pg.evaluate("(k)=>{ return S && S.priv ? S.priv[k] : null; }", key)

async def box_value(pg, fid):
    return await pg.evaluate("(id)=>{ var e=document.getElementById(id); return e?e.value:null; }", fid)

FIELD = {'iDump': 'brain_dump', 'iTasks': 'tasks', 'iPrayer': 'prayer'}
WRITING = ('iDump', 'iTasks', 'iPrayer')

async def run(pw, w, h, label, desktop):
    b, pg, errs = await open_page(pw, w, h)

    # ---- CARD: the card boxes that carry the top space on this size ----
    card_ids = ('iDump',) if desktop else WRITING
    for tid in card_ids:
        m = await pg.evaluate(CARD_MEASURE, tid)
        ok = m is not None and m['padTop'] >= 2 * m['lhpx'] - 0.5
        chk("%s · card #%s keeps a top space >= two lines (%s px >= 2 x %s)"
            % (label, tid, None if not m else round(m['padTop'], 1), None if not m else round(m['lhpx'], 1)),
            ok, m)

    # ---- CANVAS: the uniform writing surface, for every box, on both sizes ----
    for tid in WRITING:
        key = FIELD[tid]
        await pg.goto(BASE); await pg.wait_for_timeout(2600)
        await seed(pg, tid, LONGTEXT)
        await pg.wait_for_timeout(120)
        await to_bottom(pg, tid)                      # hostile: scrolled to the bottom, caret at 0
        await synth_open(pg, tid)                     # open without moving scroll or caret

        on = await pg.evaluate(ON)
        cv = await pg.evaluate(CANVAS_MEASURE)
        chk("%s · #%s opens as the canvas" % (label, tid), on and cv is not None, {'on': on, 'cv': cv})
        if not (on and cv):
            await b.close(); return

        chk("%s · #%s canvas is box-sizing:border-box" % (label, tid), cv['box'] == 'border-box', cv)
        chk("%s · #%s canvas top space >= two lines (%s px >= 2 x %s)"
            % (label, tid, round(cv['padTop'], 1), round(cv['lhpx'], 1)),
            cv['padTop'] >= 2 * cv['lhpx'] - 0.5, cv)
        chk("%s · #%s canvas type is at most 15px (695 untouched): %s" % (label, tid, cv['fs']),
            cv['fs'] <= 15, cv)
        chk("%s · #%s opening shows the TOP (scrollTop === 0)" % (label, tid), cv['st'] == 0, cv)
        chk("%s · #%s caret is NOT forced to the end (%s of %s)" % (label, tid, cv['ss'], cv['vlen']),
            cv['ss'] != cv['vlen'], cv)

        # tap the top free space (inside the padding, above the first line) -> caret homes to 0, at top
        pt = cv['padTop']
        await pg.mouse.click(w / 2.0, max(4.0, pt * 0.4))
        await pg.wait_for_timeout(140)
        cv2 = await pg.evaluate(CANVAS_MEASURE)
        chk("%s · #%s a top-area tap homes the caret to position 0, scrollTop 0 (ss=%s se=%s st=%s)"
            % (label, tid, cv2['ss'], cv2['se'], cv2['st']),
            cv2['ss'] == 0 and cv2['se'] == 0 and cv2['st'] == 0, cv2)

        # type at the caret through the OWN input path; the save begins at the first typed character
        await type_at_caret(pg, tid, 'Z')
        saved = await saved_field(pg, key)
        boxval = await box_value(pg, tid)
        no_blank = isinstance(boxval, str) and len(boxval) > 0 and boxval[0] != '\n' \
            and not boxval.startswith('\n') and boxval.split('\n')[0].strip() != ''
        chk("%s · #%s typing at the top saves through S.priv.%s, equal to the box" % (label, tid, key),
            saved is not None and saved == boxval, {'saved_head': (saved or '')[:24], 'box_head': (boxval or '')[:24]})
        chk("%s · #%s the save begins with the typed character, NO leading blank line" % (label, tid),
            isinstance(boxval, str) and boxval[:1] == 'Z' and no_blank, (boxval or '')[:24])

        # leave by the back gesture; the canvas closes
        await pg.evaluate("()=>history.back()")
        await pg.wait_for_timeout(200)
        off = await pg.evaluate(ON)
        chk("%s · #%s leaves the canvas on the back gesture" % (label, tid), not off, {'on': off})

    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()

async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720", True)
        await run(pw, 390, 844, "390x844", False)
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-704-TOPSPACE: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)

if __name__ == '__main__':
    asyncio.run(main())
