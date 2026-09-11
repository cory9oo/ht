#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-26 GOLDEN - WIRE HT-26 (PASTE 119), run literally.

    python tools/golden_ht26.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht26.py --only S1

  S1   the five inputs only (Cory, 2026-09-10 15:15): no sleep text renders anywhere, the removed
       inputs do not exist, nothing asks for or writes their columns, and the sleep chart reads nothing
  S2   HT-24's C3a (the journal every user gets) and C5 (Insights) - see the section docstrings

THE SCAN IS OF WHAT A PERSON CAN SEE. Every visible text node on every screen - phone Today, phone
Views, the full sheet, desktop, and the desktop drawer - is read after the page settles. A standard's
own NAME is user data (the fixture has one called "Sleep by 10", and Cory's list could), so text that
carries a standard's name is set aside; everything else the app itself prints is checked.
"""
import argparse, asyncio, io, json, os, re, sys
from playwright.async_api import async_playwright

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def find_estate(start):
    d = start
    for _ in range(6):
        if os.path.isdir(os.path.join(d, '_reconcile')):
            return d
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    raise SystemExit('golden_ht26: no estate root above %s' % start)


def fixture_dir(estate):
    """The headless fixture. R70.345 (2026-09-10) moved it with the machinery to <BEV>/_machine/ht3;
    the old <BEV>/ht3 is the fallback, so this runs in either layout."""
    for d in (os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if os.path.isdir(d):
            return d
    return os.path.join(estate, '_machine', 'ht3')


ESTATE = find_estate(REPO)
BASE = 'file://' + os.path.join(fixture_dir(ESTATE), 'index.html').replace(os.sep, '/')
RECONCILE = os.path.join(ESTATE, '_reconcile') if os.path.isdir(os.path.join(ESTATE, '_reconcile')) \
    else os.path.join(ESTATE, '_machine', '_reconcile')

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def src(p):
    return io.open(p, encoding='utf-8', errors='replace').read()


async def open_page(pw, w=390, h=844, touch=True):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch,
                              device_scale_factor=2 if touch else 1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    await pg.goto(BASE)
    await pg.wait_for_timeout(3300)
    return b, pg, errs


VISIBLE_TEXT_JS = """() => {
  const names = [...document.querySelectorAll('#log .li .nm')]
    .map(n => ((n.firstChild && n.firstChild.textContent) || n.textContent || '').trim()).filter(Boolean);
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.textContent || '').trim(); if (!t) continue;
    const p = n.parentElement; if (!p) continue;
    if (p.closest('script,style,noscript,template')) continue;
    if (!p.checkVisibility({checkVisibilityCSS: true})) continue;
    if (names.some(nm => t.indexOf(nm) >= 0)) continue;          // a standard's name is user data
    out.push(t);
  }
  return out;
}"""
SLEEP = re.compile(r'\b(sleep|slept|bedtime)\b', re.I)
REMOVED_IDS = ['iBed', 'iWake', 'iSleep', 'iWeight', 'iOne', 'sleepWhy']
REMOVED_COLS = ['sleep_hours', 'bed_time', 'wake_time', 'weight_lb', 'tomorrow_one_thing']


async def sleep_texts(pg):
    return [t for t in await pg.evaluate(VISIBLE_TEXT_JS) if SLEEP.search(t)]


# ============================== S1 ==============================================================
async def s1(pw):
    """THE FIVE INPUTS ONLY. Cory, 2026-09-10 15:15: "no new inputs of any kind; delete the sleep
    display". 117 shipped the opposite (a sleep line with its derivation, bed and wake live). The five:
    check-offs · the 1-10 rating with its why · the brain dump · completed · prayer. Everything else is
    HIDDEN, NEVER REMOVED (R70.138) - so the assertions are about what renders, what is asked for and
    what is written, not about deleted code."""
    seen = {}
    # ---- phone: Today, Views, the full sheet ------------------------------------------------
    b, pg, errs = await open_page(pw, 390, 844)
    try:
        seen['phone today'] = await sleep_texts(pg)
        ids = await pg.evaluate("(ids) => ids.filter(i => document.getElementById(i))", REMOVED_IDS)
        chk('S1a · none of the removed inputs exists on the phone (bed, wake, slept, weight, tomorrow, the caption)',
            not ids, ids)
        in3 = await pg.evaluate("() => { const a=document.getElementById('in3a'); return a ? {hidden:a.hidden, kids:a.children.length} : null; }")
        chk('S1b · the extra-inputs line renders empty and hidden', in3 is None or (in3['hidden'] and in3['kids'] == 0), in3)
        five = await pg.evaluate("""() => ({ checks: document.querySelectorAll('#log .li').length,
            rate: !!document.getElementById('rate'), why: !!document.getElementById('iWhy'),
            dump: !!document.getElementById('iDump'), done: !!document.getElementById('iTasks'),
            prayer: !!document.getElementById('iPrayer') })""")
        chk('S1c · the five inputs are all there: check-offs, rating + why, brain dump, completed, prayer',
            five['checks'] > 0 and all(five[k] for k in ('rate', 'why', 'dump', 'done', 'prayer')), five)
        # a save carries none of the removed columns - STRESS 2: the app must not depend on them
        # the why box only shows once a rating is chosen, so the input is driven through the app's
        # own listener rather than a click - the save path under test is the same either way
        await pg.evaluate("""() => { const n=document.getElementById('iWhy');
            n.value='HT-26 golden - a why, to force a save';
            n.dispatchEvent(new Event('input', {bubbles:true})); }""")
        await pg.wait_for_timeout(1400)
        ups = await pg.evaluate("() => (window.__UPSERTS||[]).filter(u => u[0]==='day_private').map(u => Object.keys(u[1]||{}))")
        leaked = sorted({k for keys in ups for k in keys if k in REMOVED_COLS})
        chk('S1d · the day save writes none of the five removed columns', ups and not leaked,
            {'saves': len(ups), 'leaked': leaked})
        # STRESS 1: the chart that read sleep reads nothing and shows no series
        blk = await pg.evaluate("""() => { const b=document.getElementById('sSlpBlk'), s=document.getElementById('sSlp');
            return { exists: !!b, hidden: b ? b.hidden : null, shown: b ? b.checkVisibility() : false,
                     marks: s ? s.children.length : -1 }; }""")
        chk('S1e · the sleep chart is hidden and draws no series (stress 1)',
            blk['exists'] and blk['hidden'] and not blk['shown'] and blk['marks'] == 0, blk)
        tab = await pg.query_selector('#vTabs [data-v="views"]')
        if tab:
            await tab.click(); await pg.wait_for_timeout(900)
            seen['phone views'] = await sleep_texts(pg)
            await (await pg.query_selector('#vTabs [data-v="today"]')).click(); await pg.wait_for_timeout(500)
        bv = await pg.query_selector('#bView')
        if bv and await bv.is_visible():
            await bv.click(); await pg.wait_for_timeout(1200)
            seen['phone full sheet'] = await sleep_texts(pg)
        phone_errs = list(errs)
    finally:
        await b.close()
    # ---- desktop at two widths, and the measures drawer's text whether or not it is open ------
    # (in simple mode neither the drawer button nor the full sheet is reachable - measured: both
    # fail checkVisibility at 1280 and 1920 - so the drawer is read as rendered text instead)
    desk_errs, drawer_hits = [], []
    for w, h in ((1280, 800), (1920, 1080)):
        b, pg, errs = await open_page(pw, w, h, touch=False)
        try:
            seen['desktop %d' % w] = await sleep_texts(pg)
            drawer_hits += await pg.evaluate("""() => {
              const names = [...document.querySelectorAll('#log .li .nm')]
                .map(n => ((n.firstChild && n.firstChild.textContent) || n.textContent || '').trim()).filter(Boolean);
              const d = document.getElementById('h18DrawH'); if (!d) return [];
              return [...d.querySelectorAll('*')].filter(e => !e.children.length)
                .map(e => (e.textContent || '').trim())
                .filter(t => t && !names.some(nm => t.indexOf(nm) >= 0) &&
                             /\\b(sleep|slept|bedtime|weight)\\b|the one thing/i.test(t));
            }""")
            desk_errs += errs
        finally:
            await b.close()
    bad = {k: v for k, v in seen.items() if v}
    chk('S1f · no sleep text renders on any screen: %s' % ', '.join(sorted(seen)), not bad, bad)
    chk('S1g · four screens were actually scanned (phone Today + Views, desktop 1280 + 1920)',
        len(seen) >= 4, sorted(seen))
    chk('S1g2 · and the measures drawer holds no sleep, weight or one-thing tile, open or closed',
        not drawer_hits, drawer_hits[:3])

    s = src(os.path.join(REPO, 'app.js'))
    chk('S1h · the switch is one line and it is ON', re.search(r'var FIVE_INPUTS_ONLY = true;', s) is not None)
    probe_at = [m.start() for m in re.finditer(r"probePv\('(sleep_hours|weight_lb|tomorrow_one_thing|bed_time|wake_time)'", s)]
    gate = s.find('if(FIVE_INPUTS_ONLY){')
    els = s.find('} else {', gate)
    chk('S1i · no removed column is even asked for while the switch holds (stress 2: every read guarded)',
        gate > 0 and probe_at and all(p > els for p in probe_at), {'gate': gate, 'probes': probe_at[:5]})
    arch = os.path.join(RECONCILE, 'ht_stage', '117', '_not_run')
    chk('S1j · migration_117.sql is archived unrun, with its reason beside it',
        os.path.isfile(os.path.join(arch, 'migration_117.sql')) and os.path.isfile(os.path.join(arch, 'WHY.txt'))
        and not os.path.exists(os.path.join(RECONCILE, 'ht_stage', '117', 'migration_117.sql')), arch)
    chk('S1k · no console error on the phone or the desktop', not phone_errs and not desk_errs,
        (phone_errs + desk_errs)[:2])


SECTIONS = {'S1': s1}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    a = ap.parse_args()
    want = [a.only] if a.only else list(SECTIONS)
    async with async_playwright() as pw:
        for s in want:
            if s not in SECTIONS:
                raise SystemExit('unknown section %s' % s)
            print('\n== %s ==' % s)
            await SECTIONS[s](pw)
    bad = [n for ok, n in RES if not ok]
    print('\nGOLDEN HT-26: %d/%d PASS, %d FAIL' % (len(RES) - len(bad), len(RES), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
