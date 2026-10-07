#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-652 S3 GOLDEN — PLANNED MINUTES MEAN SOMETHING, run literally at 1280 and 390.

  A fixture of three tasks: 5:00 AM for 30, 9:00 PM for 15, and one with neither time nor length.
    M1  the row chips read the WINDOW — 5:00–5:30 AM and 9:00–9:15 PM (end from winEndMin, via fmtTime).
    M2  the time-less, length-less task shows no window chip.
    M3  the Time committed card: today planned 45m, given 30m after one check; the Morning/Night/
        Standards split; the week's planned total; and today's share of 24 h.
    M4  committed() equals the card's today figure — both read planMins(), the one source.
    M5  the card is VISIBLE and placed under the daily-percent hero (phone) / masthead (laptop).
  M6  zero page errors.

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

SETUP = """() => { var S = window.__HT293.S();
  S.habits = [
   {id:'h0',user_id:'u',name:'Morning run',cadence:'daily',minutes:30,minutes_planned:30,time_anchor:'05:00',section:null,sort_order:0,active:true,notes:null,link:null},
   {id:'h1',user_id:'u',name:'Evening read',cadence:'daily',minutes:15,minutes_planned:15,time_anchor:'21:00',section:null,sort_order:1,active:true,notes:null,link:null},
   {id:'h2',user_id:'u',name:'Anytime',cadence:'daily',minutes:0,minutes_planned:null,time_anchor:null,section:null,sort_order:2,active:true,notes:null,link:null}];
  S.byDate[S.date] = {checked:{h0:'05:10'}};
  window.__HT652.repaint(); }"""

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:220])))

def norm(s):
    return (s or '').replace(' ', ' ').replace(' ', ' ').strip()

async def open_page(pw, w, h):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    await pg.evaluate(SETUP)
    await pg.wait_for_timeout(700)
    return b, pg, errs

async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)
    # --- the row chips (read on the day view, where #log lives) ---
    chips = await pg.evaluate(
        "() => { function c(id){ var r=document.querySelector('#log .li[data-h=\"'+id+'\"] .pat'); return r?r.textContent:null; }"
        " return { h0:c('h0'), h1:c('h1'), h2:c('h2') }; }")
    chk("%s · the 5:00 AM / 30 min row shows the window 5:00–5:30 AM" % label,
        norm(chips['h0']) == '5:00–5:30 AM', chips['h0'])
    chk("%s · the 9:00 PM / 15 min row shows the window 9:00–9:15 PM" % label,
        norm(chips['h1']) == '9:00–9:15 PM', chips['h1'])
    chk("%s · the task with neither time nor length shows no window chip" % label,
        not chips['h2'] or norm(chips['h2']) in ('', '+ time'), chips['h2'])
    # --- committed() == the card's today figure, both from planMins ---
    nums = await pg.evaluate(
        "() => { var H=window.__HT652, S=window.__HT293.S(); var t=H.planGiven(S.date);"
        " return { committed:H.committed(), planned:t.planned, given:t.given, bk:t.bk }; }")
    chk("%s · committed() == today planned, both 45m" % label,
        nums['committed'] == 45 and nums['planned'] == 45, nums)
    chk("%s · given after one check is 30m; split Morning 30 · Night 15 · Standards 0" % label,
        nums['given'] == 30 and nums['bk']['morning'] == 30 and nums['bk']['night'] == 15
        and nums['bk']['standards'] == 0, nums)
    # --- the card: visible, placed under the hero (phone) / masthead (laptop), right text ---
    if w < 1024:
        await pg.evaluate("() => { if(window.__HT13_TAB) window.__HT13_TAB('views'); if(window.__HT652CARD) window.__HT652CARD.place(); }")
        await pg.wait_for_timeout(500)
    card = await pg.evaluate(
        "() => { var c=document.getElementById('h652time'); if(!c) return {found:false};"
        " var r=c.getBoundingClientRect(); var hero=document.getElementById('h228Hero'); var mast=document.querySelector('.mast');"
        " return { found:true, visible:r.width>2&&r.height>2, "
        "   anchored: (window.innerWidth<1024) ? (!!hero && c.previousElementSibling===hero) : (!!mast && c.previousElementSibling===mast), "
        "   text:c.textContent }; }")
    chk("%s · the Time committed card is present and visible" % label,
        card.get('found') and card.get('visible'), card)
    chk("%s · it sits directly under the daily-percent (hero on phone, masthead on laptop)" % label,
        card.get('anchored'), card)
    txt = norm(card.get('text'))
    chk("%s · today 45m planned · 30m given" % label,
        '45m planned' in txt and '30m given' in txt, txt)
    chk("%s · the Morning/Night/Standards split and the 24 h share render" % label,
        'Morning 30m' in txt and 'Night 15m' in txt and 'Standards' in txt and 'of the 24 h' in txt, txt)
    chk("%s · this week · 5h 15m planned (seven days of the daily load)" % label,
        '5h 15m planned' in txt, txt)
    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()

async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 900, "1280x900")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-652-TIME: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)

if __name__ == '__main__':
    asyncio.run(main())
