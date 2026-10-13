#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 857 GOLDEN — THE JOURNAL'S DAILY PROMPT, run at 1280 and 390.

Cory, 2026-10-13: "can you make it to where there is the grey background ... that prompts the user to
type how they're feeling Spiritually, Emotionally, and Physically." The empty Journal box (#iDump) is
seeded with three quiet grey lines on the first tap; the writer types after each; a box holding only
the untouched seed is EMPTY to every path, and on blur it clears so the prompt returns. This supersedes
HT-30 S4.10 for #iDump only; #iTasks / #iPrayer are untouched.

For each width:
  A  UNFOCUSED · the empty #iDump still shows the 822 'tap to write' placeholder (S4.10/822 kept) and
     holds no value, no seed — the prompt is not there until a finger taps.
  B  TAP · a tap on the empty #iDump seeds the box with __HT857.seed() (Spiritually - / Emotionally - /
     Physically -), the caret sits after 'Spiritually - ', the box carries the grey class (.ht857-seed),
     and the SAME textarea is what opened (683/685 — the node was not moved).
  C  SEED IS EMPTY · with only the untouched seed, the stored brain_dump is empty, no save is pending,
     and __HT857.empty(box) is true — a template-only day is stored nowhere.
  D  BLUR CLEARS · blurring an untouched seed clears the box to '', drops the grey class and restores
     the 'tap to write' placeholder, so the next tap seeds again.
  E  TYPED DAY · writing after each label stores the FULL text (labels + answers) in the one brain_dump
     field, __HT857.sections() splits it into {spirit, emotion, body}, the grey class is gone, and a
     blur leaves the written box exactly as typed (never cleared).
  F  zero page errors.

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


async def box(pg):
    """The #iDump value, placeholder, grey class, caret and whether __HT857 says it is empty."""
    return await pg.evaluate("""() => {
      var e = document.getElementById('iDump');
      if(!e) return null;
      return {
        value: e.value,
        ph: e.getAttribute('placeholder'),
        grey: e.classList.contains('ht857-seed'),
        caret: e.selectionStart,
        empty: !!(window.__HT857 && window.__HT857.empty(e.value)),
        count: document.querySelectorAll('#iDump').length
      };
    }""")


async def seed_of(pg):
    return await pg.evaluate("() => window.__HT857 ? window.__HT857.seed() : null")


async def caret_of(pg):
    return await pg.evaluate("() => window.__HT857 ? window.__HT857.caret() : null")


async def saved_dump(pg):
    return await pg.evaluate(
        "() => { var S = window.__HT293 && window.__HT293.S ? window.__HT293.S() : (window.S||null); "
        "return S && S.priv ? (S.priv.brain_dump == null ? '' : S.priv.brain_dump) : ''; }")


async def pending(pg):
    return await pg.evaluate("() => !!(window.__HT32SAVE && window.__HT32SAVE.pending())")


async def sections_of(pg, text):
    return await pg.evaluate("(t) => window.__HT857 ? window.__HT857.sections(t) : null", text)


async def type_into(pg, v):
    """type as the box's OWN input path (dispatch input), exactly as a keystroke would."""
    await pg.evaluate(
        "(v) => { var e = document.getElementById('iDump'); e.value = v; "
        "e.dispatchEvent(new Event('input', {bubbles:true})); }", v)


async def run_flag_off(pw, w, h, label):
    """HT-876 flag-off case: journal row hidden by default; #iDump still in DOM."""
    b, pg, errs = await open_page(pw, w, h)
    db_display = await pg.evaluate(
        "() => { var db=document.getElementById('dumpBox'); "
        "return db ? window.getComputedStyle(db).display : 'MISSING'; }")
    chk("%s · flag-off · dumpBox is hidden (display:none) by default" % label,
        db_display == 'none', db_display)
    dump_present = await pg.evaluate("() => !!document.getElementById('iDump')")
    chk("%s · flag-off · #iDump still exists in the DOM (element kept, only hidden)" % label,
        dump_present, dump_present)
    chk("%s · flag-off · zero page errors" % label, not errs, errs[:3])
    await b.close()


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)
    # HT-876: enable the journal flag so the 857 prompt tests run against the visible box
    await pg.evaluate("() => { window.__HT876_JOURNAL = true; "
                      "var db=document.getElementById('dumpBox'); "
                      "if(db) db.style.display=''; }")

    present = await pg.evaluate("() => !!document.getElementById('iDump') && !!window.__HT857")
    chk("%s · #iDump and the __HT857 handle are present" % label, present)
    if not present:
        await b.close(); return

    # A — UNFOCUSED: the empty box shows 'tap to write' and holds no value/seed (822/S4.10 kept)
    a = await box(pg)
    chk("%s · A · empty unfocused #iDump shows 'tap to write' and holds no value" % label,
        a and a['value'] == '' and a['ph'] == 'tap to write' and not a['grey'], a)

    # B — TAP: the box seeds, caret after 'Spiritually - ', grey class on, same single node
    seed = await seed_of(pg)
    want_caret = await caret_of(pg)
    await pg.click('#iDump')
    await pg.wait_for_timeout(160)
    bx = await box(pg)
    chk("%s · B · a tap seeds the three grey lines (value == __HT857.seed())" % label,
        bx and bx['value'] == seed and seed and 'Spiritually - ' in seed
        and 'Emotionally - ' in seed and 'Physically - ' in seed, {'bx': bx, 'seed': seed})
    chk("%s · B · the caret sits after 'Spiritually - ' and the box is grey, one node" % label,
        bx and bx['caret'] == want_caret and bx['grey'] and bx['count'] == 1, bx)

    # C — SEED IS EMPTY: stored brain_dump empty, nothing pending, __HT857.empty true
    sv = await saved_dump(pg)
    pend = await pending(pg)
    chk("%s · C · a seed-only box is EMPTY (stored brain_dump '', nothing pending, __HT857.empty true)" % label,
        sv == '' and not pend and bx and bx['empty'], {'saved': sv, 'pending': pend, 'empty': bx and bx['empty']})

    # D — BLUR CLEARS the untouched seed; the 'tap to write' placeholder returns
    await pg.evaluate("() => document.getElementById('iDump').blur()")
    await pg.wait_for_timeout(140)
    d = await box(pg)
    chk("%s · D · blur clears the untouched seed ('' value, grey off, 'tap to write' back)" % label,
        d and d['value'] == '' and not d['grey'] and d['ph'] == 'tap to write' and d['empty'], d)
    # and the next tap seeds again
    await pg.click('#iDump'); await pg.wait_for_timeout(140)
    again = await box(pg)
    chk("%s · D · the next tap seeds the prompt again" % label,
        again and again['value'] == seed and again['grey'], again)

    # E — TYPED DAY: the full text is stored, split into three, grey gone, kept on blur
    typed = "Spiritually - steady and grateful\nEmotionally - a little tired\nPhysically - sore legs"
    await type_into(pg, typed)
    await pg.wait_for_timeout(120)
    e = await box(pg)
    sv2 = await saved_dump(pg)
    secs = await sections_of(pg, typed)
    chk("%s · E · a typed day stores the full text (labels + answers) in the one brain_dump field" % label,
        sv2 == typed and e and not e['empty'] and not e['grey'], {'saved': sv2, 'box': e})
    chk("%s · E · __HT857.sections() splits the day into spirit/emotion/body" % label,
        secs and secs.get('spirit') == 'steady and grateful'
        and secs.get('emotion') == 'a little tired' and secs.get('body') == 'sore legs', secs)
    await pg.evaluate("() => document.getElementById('iDump').blur()")
    await pg.wait_for_timeout(140)
    kept = await box(pg)
    chk("%s · E · a written box is NOT cleared on blur (the three answers stay)" % label,
        kept and kept['value'] == typed, kept)

    chk("%s · F · zero page errors" % label, not errs, errs[:3])
    await b.close()


async def main():
    async with async_playwright() as pw:
        # HT-876: flag-off cases first, then flag-on (prompt behaviour)
        await run_flag_off(pw, 1280, 720, "1280x720")
        await run_flag_off(pw, 390, 844, "390x844")
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-857-PROMPT: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
