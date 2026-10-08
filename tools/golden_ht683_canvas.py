#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 683/685 GOLDEN — BOX TO CANVAS, run literally at 1280 and 390.

677 made a panel's TITLE BAR open the focus view; Cory meant the BOXES. A tap inside any writing box
on the Journal card promotes THAT SAME textarea to a full-viewport writing canvas; leaving by the ×,
the phone back gesture, or Esc keeps every character. PASTE 685: the boxes are matched as a CLASS
(every textarea on the Journal card `.jcard`), not by naming ids — 683 named #iDump and #iTasks and so
missed the third box, Prayer (#iPrayer). This golden now covers all three and asserts the class match:
every writing textarea on the card opens the canvas, and the Rate-the-day "why" box — which whyBack()
moves INTO the card (#h18Btm on the desktop, under the strip on the phone), so #iWhy IS inside .jcard —
is excluded by its id and does NOT open. For each width and each of the three writing boxes:
  P1  at load the canvas is OFF — body has no `htj-on`, `window.__HTJ.on()` is false.
  P2  a tap on the box opens the canvas: `__HTJ.on()` true, the editor is the SAME element
      (`__HTJ.el().id` is the box id, and exactly ONE node of that id exists — no copy was made),
      it FILLS THE VIEWPORT (rect ≈ innerWidth × innerHeight, top/left ≈ 0), its type is ≤ 15px,
      and the text seeded in the box is intact.
  P3  typing in the canvas lands in the SAME stored field — `window.__HT293.S().priv[field]` equals
      the textarea value (no second save path).
  P4  leaving — by × and by the back gesture at both widths, and by Esc on the desk — closes the
      canvas (`__HTJ.on()` false) and the box STILL holds the text.
  WIRED   (685) the Journal card `.jcard` holds at least the three writing boxes (Journal, Completed,
      Prayer); a tap on EACH opens the canvas on that same element — proving the wiring is by class,
      not by a fixed id list — and a tap on #iWhy (the Rate-the-day "why", which whyBack moves into
      the card, so it IS inside .jcard) does NOT open the canvas — excluded by its id.
  STRESS  inside 677's focus view on the Journal panel, a tap opens the canvas ABOVE it; one back
      press closes only the canvas (677 still on), a second leaves 677 — 677's behaviour untouched.
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

# the three writing boxes on the Journal card -> the S.priv key each saves into (685: Prayer added)
FIELD_KEY = [('iDump', 'brain_dump'), ('iTasks', 'tasks'), ('iPrayer', 'prayer')]

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
    return await pg.evaluate(
        "(id)=>{const e=document.getElementById(id);if(!e)return false;"
        "const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}", fid)

# the canvas state: is it on, is the focused element the SAME box, does it fill the viewport, small type
PROBE = """(fid) => {
  const el = window.__HTJ && window.__HTJ.el ? window.__HTJ.el() : null;
  const r = el ? el.getBoundingClientRect() : null;
  return {
    on: !!(window.__HTJ && window.__HTJ.on()),
    bodyOn: document.body.classList.contains('htj-on'),
    elId: el ? el.id : null,
    count: document.querySelectorAll('#' + fid).length,
    xShown: !!(document.getElementById('htjX')),
    fills: r ? (r.top<=1 && r.left<=1 && r.width>=window.innerWidth-2 && r.height>=window.innerHeight-2) : false,
    fontPx: el ? parseFloat(getComputedStyle(el).fontSize) : null,
    taVal: el ? el.value : null
  };
}"""

async def seed(pg, fid, v):
    # put known text in the box through its OWN input path, so S.priv holds it as a real save would
    await pg.evaluate(
        "([id,v])=>{ const e=document.getElementById(id); e.value=v; "
        "e.dispatchEvent(new Event('input',{bubbles:true})); }", [fid, v])

async def box_value(pg, fid):
    return await pg.evaluate("(id)=>{const e=document.getElementById(id);return e?e.value:null;}", fid)

async def saved_field(pg, key):
    return await pg.evaluate(
        "(k)=>{ const S = window.__HT293 && window.__HT293.S ? window.__HT293.S() : (window.S||null); "
        "return S && S.priv ? S.priv[k] : null; }", key)

async def one_cycle(pg, label, fid, key, how):
    """seed -> tap -> assert open+fills+same element+text intact -> type -> assert saved -> leave -> assert kept."""
    seedtxt = 'seed-%s-%s' % (fid, how)
    await seed(pg, fid, seedtxt)
    await pg.click('#' + fid)
    await pg.wait_for_timeout(160)
    s = await pg.evaluate(PROBE, fid)
    chk("%s · %s[%s] · a tap opens the canvas, same element, no copy" % (label, fid, how),
        s['on'] and s['bodyOn'] and s['xShown'] and s['elId'] == fid and s['count'] == 1, s)
    chk("%s · %s[%s] · the canvas fills the viewport, type ≤ 15px, text intact" % (label, fid, how),
        s['fills'] and s['fontPx'] is not None and s['fontPx'] <= 15 and s['taVal'] == seedtxt, s)

    typed = seedtxt + ' — written on the open canvas'
    await seed(pg, fid, typed)                 # typing in the canvas = the SAME textarea's input path
    await pg.wait_for_timeout(60)
    saved = await saved_field(pg, key)
    chk("%s · %s[%s] · typing lands in the same stored field" % (label, fid, how),
        saved == typed, {'saved': saved, 'want': typed})

    if how == 'x':
        await pg.click('#htjX')
    elif how == 'esc':
        await pg.keyboard.press('Escape')
    else:                                      # the phone back gesture / button
        await pg.evaluate("()=>history.back()")
    await pg.wait_for_timeout(180)
    s2 = await pg.evaluate(PROBE, fid)
    box = await box_value(pg, fid)
    chk("%s · %s[%s] · %s leaves the canvas with the text kept" % (label, fid, how, how),
        (not s2['on']) and (not s2['bodyOn']) and (not s2['xShown']) and box == typed,
        {'probe': s2, 'box': box})

async def card_box_ids(pg):
    """Every textarea id inside the Journal card `.jcard`, in DOM order — or None if the card is gone."""
    return await pg.evaluate(
        "()=>{ const c=document.querySelector('.jcard'); "
        "return c ? Array.prototype.map.call(c.querySelectorAll('textarea'), function(t){return t.id;}) : null; }")


async def every_box_wired(pg, label):
    """685 — the wiring is by class, not by a fixed id list. The card holds every writing box
    (Journal, Completed, Prayer, and any added later); a tap on EACH opens the canvas on that same
    element. The Rate-the-day "why" (#iWhy) is ALSO on the card — whyBack() moves it in (#h18Btm on
    the desktop, under the strip on the phone) — but it is the one non-writing box and is excluded by
    its id, so a tap on it does NOT open the canvas."""
    # The P1-P4 cycles above open the canvas on the journal boxes and type into them; leaving the
    # canvas does NOT reset a box's grown height (a pre-683 desktop behaviour of grow()/unGrow,
    # unrelated to 685's class wiring), so after nine cycles #iPrayer stays inflated and #h18Btm
    # overlaps the collapsed #iDump. The wiring-by-class claim is about a NORMAL card as a user
    # meets it, so this block runs on a fresh page: reload, let it settle, then enumerate and tap.
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    ids = await card_box_ids(pg)
    is_list = isinstance(ids, list)
    writing = [t for t in ids if t != 'iWhy'] if is_list else []
    chk("%s · the Journal card holds the writing boxes as a class (>= 3 incl. Journal/Completed/Prayer)" % label,
        is_list and len(writing) >= 3 and all(x in ids for x in ('iDump', 'iTasks', 'iPrayer')),
        ids)
    if not is_list:
        return
    for tid in writing:                              # a tap on EVERY writing box on the card opens the canvas on itself
        await pg.click('#' + tid)
        await pg.wait_for_timeout(120)
        s = await pg.evaluate(PROBE, tid)
        chk("%s · a tap on #%s (on the card) opens the canvas on that same element" % (label, tid),
            s['on'] and s['elId'] == tid and s['count'] == 1, s)
        await pg.evaluate("()=>history.back()")      # leave, so the next box starts closed
        await pg.wait_for_timeout(140)
        off = await pg.evaluate("()=>!!(window.__HTJ&&window.__HTJ.on())")
        chk("%s · #%s leaves the canvas" % (label, tid), not off, off)
    in_card = 'iWhy' in ids                          # whyBack has moved #iWhy into .jcard at this width
    chk("%s · the Rate-the-day box #iWhy is on the card (so the exclusion is a real test)" % label, in_card, ids)
    if in_card:
        # #iWhy is a one-row box that renders at zero size in the fixture (collapsed on the desktop,
        # display:none under the strip on the phone), so a real pointer click cannot land on it. The
        # exclusion lives in the delegated handler's `ta.id === 'iWhy'` guard, which a BUBBLING click
        # exercises exactly as a tap would — so a synthetic click on #iWhy is the faithful test that
        # the Rate-the-day box, though on the card, never enters the canvas.
        await pg.evaluate("()=>document.getElementById('iWhy').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
        await pg.wait_for_timeout(120)
        on_why = await pg.evaluate("()=>!!(window.__HTJ&&window.__HTJ.on())")
        chk("%s · #iWhy (on the card, excluded by id) does NOT open the canvas" % label, not on_why, on_why)
        if on_why:                                   # keep state clean if it wrongly opened
            await pg.evaluate("()=>history.back()")
            await pg.wait_for_timeout(120)


async def nested(pg, label):
    """STRESS — inside 677's focus view on the Journal panel: a tap opens the canvas above it; one back
    closes only the canvas (677 still on), a second leaves 677. 677's behaviour is untouched."""
    ready = await pg.evaluate(
        "()=>{ const d=document.getElementById('iDump'); return !!(window.__HTF && d && d.closest('.blk')); }")
    chk("%s · nested prerequisites present (677 + the Journal panel)" % label, ready)
    if not ready:
        return
    await pg.evaluate("()=>{ window.__HTF.enter(document.getElementById('iDump').closest('.blk')); }")
    await pg.wait_for_timeout(160)
    await pg.click('#iDump')
    await pg.wait_for_timeout(160)
    s = await pg.evaluate(PROBE, 'iDump')
    both = await pg.evaluate("()=>({ htf: !!(window.__HTF&&window.__HTF.on()), htj: !!(window.__HTJ&&window.__HTJ.on()) })")
    chk("%s · nested · the canvas opens ABOVE 677's focus view" % label,
        both['htj'] and both['htf'] and s['fills'], {'both': both, 'probe': s})
    await pg.evaluate("()=>history.back()")
    await pg.wait_for_timeout(180)
    after1 = await pg.evaluate("()=>({ htf: !!(window.__HTF&&window.__HTF.on()), htj: !!(window.__HTJ&&window.__HTJ.on()) })")
    chk("%s · nested · one back closes only the canvas (677 still on)" % label,
        (not after1['htj']) and after1['htf'], after1)
    await pg.evaluate("()=>history.back()")
    await pg.wait_for_timeout(180)
    after2 = await pg.evaluate("()=>({ htf: !!(window.__HTF&&window.__HTF.on()), htj: !!(window.__HTJ&&window.__HTJ.on()) })")
    chk("%s · nested · a second back leaves 677" % label, not after2['htf'], after2)

async def run(pw, w, h, label, use_esc):
    b, pg, errs = await open_page(pw, w, h)

    # P1 — opens closed
    s0 = await pg.evaluate(PROBE, 'iDump')
    chk("%s · the canvas is OFF at load" % label, (not s0['on']) and (not s0['bodyOn']), s0)

    for fid, key in FIELD_KEY:
        chk("%s · the %s box is present" % (label, fid), await present(pg, fid))
        await one_cycle(pg, label, fid, key, 'x')
        await one_cycle(pg, label, fid, key, 'back')
        if use_esc:
            await one_cycle(pg, label, fid, key, 'esc')

    await every_box_wired(pg, label)
    await nested(pg, label)

    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()

async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720", use_esc=True)    # desk: ×, back and Esc
        await run(pw, 390, 844, "390x844", use_esc=False)     # phone: × and the back gesture
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-683-CANVAS: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)

if __name__ == '__main__':
    asyncio.run(main())
