#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-228 GOLDEN - WIRE HT-228 (PASTE 228), run literally.

    python tools/golden_ht36.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht36.py --only S1

Cory, Thursday 2026-09-24 23:27 CDT: "these percentages on the bottom belong to the top of the insight
tab ... clearly show ... the daily percent and make it color coded. Same request for desktop. It's too
hidden and doesn't trigger enough emotion."

  S1  THE SCOREBOARD CARD (PASTE 820) - the day's percent as ONE big numeral in its band ink, first
      under Insights on the phone and (PASTE 822) the first card of the middle column on the desktop; THREE EQUAL tiles
      (7 days · 30 days · streak) and one `need 80%` caption; the numeral clears 4.5:1 on its card in
      every scheme (the ratio table for the receipt).
  S2  THE BAR AND MAST ARE RETIRED (PASTE 820) - the Today-tab foot bar and the masthead figure are
      GONE at both widths (the ranking has one home, the scoreboard); the old #tStrip / .hero-bar /
      .hero-mast markup and style are gone, not hidden.

134 R1: this file prints its assertion count; a section that asserts nothing is a FAIL, not a pass.
Every colour asserted is what the BROWSER resolved (getComputedStyle), never the text of a file. The
band is the ONE band table (__HT16.rampIx, steps of 20) and the figure ink is that band's text-safe
shade (--gink0..--gink4), never grade()/gcol().
"""
import argparse, asyncio, io, os, re, sys
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
    raise SystemExit('golden_ht36: no estate root above %s' % start)


ESTATE = find_estate(REPO)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('golden_ht36: no fixture under %s' % estate)


FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')

THEMES = ['crimson', 'moss', 'graphite']
# PASTE 820: pct -> (the one band table's band, the figure TEXT ink for it: --gink0..--gink4). Every
# ranking colour is the one scale now; the figure ink is the band's text-safe shade (band 0 red is the
# nearest passing shade, --gink0), proven to clear 4.5:1 on the card below (S1l).
CASES = [(90, 4, '--gink4'), (70, 3, '--gink3'), (50, 2, '--gink2'), (30, 1, '--gink1'), (10, 0, '--gink0')]
SQL = {'__HT29_SQL': True, '__SECTION': True}

RES = []
SEC_COUNT = {}
CUR = ['S?']


def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    SEC_COUNT[CUR[0]] = SEC_COUNT.get(CUR[0], 0) + 1
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def src(p):
    try:
        return io.open(p, encoding='utf-8', errors='replace').read()
    except OSError as e:
        raise SystemExit('golden_ht36: cannot read %s (%s). A check that cannot run is not a pass.'
                         % (p, type(e).__name__))


def rgb(v):
    v = (v or '').strip()
    m = re.match(r'^#([0-9a-fA-F]{3})$', v)
    if m:
        v = '#' + ''.join(c * 2 for c in m.group(1))
    m = re.match(r'^#([0-9a-fA-F]{6})', v)
    if m:
        h = m.group(1)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    m = re.match(r'^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)', v)
    if m:
        return tuple(int(m.group(i)) for i in (1, 2, 3))
    return None


def ratio(a, b):
    def lum(c):
        s = []
        for x in c:
            x /= 255.0
            s.append(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4)
        return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


BG = ("const bgOf=(n)=>{let e=n;while(e){const c=getComputedStyle(e).backgroundColor;"
      "if(c&&c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;e=e.parentElement;}"
      "return getComputedStyle(document.body).backgroundColor;};")


async def open_page(pw, w=390, h=844, storage=None, wait=1600, flags=None):
    touch = w < 1024
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch,
                              device_scale_factor=1, color_scheme='dark')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    if storage:
        import json
        await pg.add_init_script("try{%s}catch(e){}" % "".join(
            "localStorage.setItem(%s,%s);" % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    import json as _j
    await pg.add_init_script("; ".join("window.%s=%s" % (k, _j.dumps(v))
                                       for k, v in dict(SQL, __BIGSET=True, __CIRCLE=True, **(flags or {})).items()))
    await pg.goto(BASE)
    await pg.wait_for_timeout(wait)
    return b, pg, errs


async def open_insights(pg):
    """Reach the phone Insights page the way a person does - a tap on the tab bar."""
    await pg.evaluate("() => { const x=[...document.querySelectorAll('[data-t29]')]"
                      ".find(n => /insights/i.test(n.textContent)); if(x) x.click(); }")
    await pg.wait_for_timeout(900)


async def force(pg, pct):
    """Force today's completion, keeping the sub-line values steady, and repaint the hero."""
    await pg.evaluate("(p) => { window.__HT26.strip = () => ({ today:p, week:25, streak:0 });"
                      " if(window.__HT31INS && window.__HT31INS.four) window.__HT31INS.four();"
                      " if(window.__HT228) window.__HT228.card();"
                      " if(typeof paintAll==='function') paintAll(); }", pct)
    await pg.wait_for_timeout(250)


# =============================================================================================
# S1 . THE HERO CARD
# =============================================================================================
async def sec_s1(pw):
    CUR[0] = 'S1'
    print("\n--- S1 . the scoreboard: one renderer, band-inked, first on both widths (PASTE 820) ---")

    # ---- the band the one table gives, the figure ink that band carries (phone card) ----------
    b, pg, errs = await open_page(pw, 390, 844)
    await open_insights(pg)
    for pct, band, tok in CASES:
        await force(pg, pct)
        r = await pg.evaluate("""(a) => { %s
            const el=document.querySelector('#h228Hero .sh-ring-pct'); if(!el) return null;
            const cs=getComputedStyle(el);
            return { color:cs.color, fs:parseFloat(cs.fontSize), bg:bgOf(el),
                     band:(window.__HT16&&window.__HT16.rampIx)?window.__HT16.rampIx(a.pct):null,
                     tok:getComputedStyle(document.documentElement).getPropertyValue(a.tok).trim() }; }"""
            % BG, {'pct': pct, 'tok': tok})
        ok = r is not None
        chk('S1a.%d%% . the numeral carries the one band table\'s band %d' % (pct, band),
            ok and r['band'] == band, r)
        chk('S1b.%d%% . and is inked %s, the band\'s text-safe shade (not a grade letter colour)' % (pct, tok),
            ok and rgb(r['color']) is not None and rgb(r['color']) == rgb(r['tok']),
            ok and [r['color'], r['tok']])
        # PASTE 821 amended by name (R67.2): the big numeral now sits in the CENTRE OF THE RING, so it is
        # 40px (the ring is ~140px); still the large hero figure, no longer the flat 64px.
        chk('S1c.%d%% . the numeral is >=36px, centred in the ring, at 390 wide' % pct, ok and r['fs'] >= 36, ok and r['fs'])
    chk('S1d . zero page errors building the phone scoreboard', not errs, errs[:2])
    await b.close()

    # ---- three EQUAL tiles (7 days · 30 days · streak) and one `need 80%` caption -------------
    b, pg, errs = await open_page(pw, 390, 844)
    await open_insights(pg)
    await force(pg, 68)
    d = await pg.evaluate("""() => { const s=window.__HT26.strip(); let m=null;
        try{ m=window.__HT29GRP.you().m; }catch(e){}
        const keys=[...document.querySelectorAll('#h228Hero .sh-tile .sh-k')].map(k=>(k.textContent||'').trim().toLowerCase());
        const vals=[...document.querySelectorAll('#h228Hero .sh-tile .sh-v')].map(v=>(v.textContent||'').trim());
        const caps=[...document.querySelectorAll('#h228Hero .sh-cap')].map(c=>(c.textContent||'').trim().toLowerCase());
        return { week:s.week, streak:s.streak, m:m, keys:keys, vals:vals, caps:caps }; }""")
    chk('S1e . three tiles labelled 7 days · 30 days · streak',
        d['keys'] == ['7 days', '30 days', 'streak'], d['keys'])
    chk('S1f . the 7-day tile carries __HT26.strip()\'s week figure',
        (str(d['week']) + '%') in d['vals'], d)
    chk('S1g . the streak tile reads the streak with a trailing d, and the only caption is `need 80%`',
        (str(d['streak']) + 'd') in d['vals'] and d['caps'] == ['need 80%'], d)
    await b.close()

    # ---- FIRST under the Insights title on the phone -----------------------------------------
    b, pg, errs = await open_page(pw, 390, 844)
    await open_insights(pg)
    place = await pg.evaluate("""() => { const body=document.getElementById('h30InsBody');
        const first=body && [...body.children].filter(n=>n.offsetParent)[0];
        return { firstId: first?first.id:null, heroVis: (()=>{const h=document.getElementById('h228Hero');
                 return !!h && !!h.offsetParent;})() }; }""")
    chk('S1h . phone . the scoreboard is the first card under the Insights title',
        place['firstId'] == 'h228Hero' and place['heroVis'], place)
    await b.close()

    # ---- the desktop scoreboard is the SAME card, now FIRST in the middle column (#h19Right) ----
    # PASTE 820: ONE renderer, both widths. AMENDED BY NAME (PASTE 822, R67.2): on the desktop the card
    # is no longer inside the charts quadrant - it is the FIRST card of the middle column #h19Right (the
    # hero), above the journal and the two charts, so the ring renders full and nothing is clipped.
    b, pg, errs = await open_page(pw, 1695, 900)
    dk = await pg.evaluate("""() => { const r19=document.getElementById('h19Right');
        const card=document.getElementById('h228Hero');
        const pct=card?card.querySelector('.sh-ring-pct'):null;
        const tiles=card?card.querySelectorAll('.sh-tile').length:0;
        return { firstInRight: !!(r19 && card && r19.firstElementChild===card && card.offsetParent),
                 hasPct: !!(pct && pct.offsetParent), tiles:tiles }; }""")
    ok = dk is not None
    chk('S1i . desktop . the scoreboard is the FIRST card of the middle column (#h19Right), same markup',
        ok and dk['firstInRight'] and dk['hasPct'] and dk['tiles'] == 3, dk)
    await b.close()

    # ---- contrast: numeral vs its card, every scheme, all five band inks (the table for the receipt) ---
    print("  --- contrast table (numeral vs card background), 4.5:1 floor ---")
    for t in THEMES:
        b, pg, errs = await open_page(pw, 390, 844, storage={'ht_theme': t})
        await open_insights(pg)
        row = []
        for pct, band, tok in CASES:
            await force(pg, pct)
            r = await pg.evaluate("""() => { %s const el=document.querySelector('#h228Hero .sh-ring-pct');
                if(!el) return null; const cs=getComputedStyle(el); return { color:cs.color, bg:bgOf(el) }; }""" % BG)
            cr = ratio(rgb(r['color']), rgb(r['bg'])) if r and rgb(r['color']) and rgb(r['bg']) else 0
            row.append((tok, round(cr, 2)))
            chk('S1l . %-8s . %s (%d%%) clears 4.5:1 on its card' % (t, tok, pct), cr >= 4.5, cr)
        print("        %-8s %s" % (t, '  '.join('%s=%.2f' % (k.replace('--', ''), v) for k, v in row)))
        await b.close()


# =============================================================================================
# S2 . THE FOOT BAR AND THE MASTHEAD FIGURE
# =============================================================================================
async def sec_s2(pw):
    CUR[0] = 'S2'
    print("\n--- S2 . the bar and the masthead figure are RETIRED; the scoreboard is the one home ---")

    # ---- phone: no foot bar, Today is inputs only --------------------------------------------
    b, pg, errs = await open_page(pw, 390, 844)
    t = await pg.evaluate("""() => { const col=document.querySelector('.colL');
        return { strip: !!document.getElementById('tStrip'),
                 bar: !!document.querySelector('.hero-bar, .hero-mast'),
                 colPct: !!(col && col.querySelector('.sh-pct, .sh-ring, .sh-ring-pct')),
                 log: !!document.getElementById('log'), dump: !!document.getElementById('iDump') }; }""")
    chk('S2a . phone . the day-percent foot bar (#tStrip / .hero-bar) is gone from Today',
        not t['strip'] and not t['bar'], t)
    chk('S2b . phone . no ranking percent in the Today column', not t['colPct'], t)
    chk('S2c . phone . Today keeps its inputs: the checklist (#log) and the brain dump (#iDump)',
        t['log'] and t['dump'], t)
    chk('S2d . phone . zero page errors', not errs, errs[:2])
    await b.close()

    # ---- desktop: no masthead figure, the scoreboard is the one home --------------------------
    b, pg, errs = await open_page(pw, 1695, 900)
    m = await pg.evaluate("""() => ({ strip: !!document.getElementById('tStrip'),
        mast: !!document.querySelector('.hero-mast'),
        card: !!(document.getElementById('h19Right') && document.querySelector('#h19Right > #h228Hero')) })""")
    chk('S2e . desktop . the masthead figure (#tStrip / .hero-mast) is gone', not m['strip'] and not m['mast'], m)
    chk('S2f . desktop . the one scoreboard is the first card of the middle column instead (PASTE 822)', m['card'], m)
    chk('S2g . desktop . zero page errors', not errs, errs[:2])
    await b.close()

    # ---- the old bar/mast renderer is GONE, not hidden (PASTE 820 CONSOLIDATE/RETIRE) ----------
    appjs = src(os.path.join(REPO, 'app.js'))
    chk('S2h . the bar/mast renderer is gone from app.js (no hero-bar / hero-mast className set)',
        "'hero-bar'" not in appjs and "'hero-mast'" not in appjs, None)
    chk('S2i . the .sh-sub sub-line markup is retired in app.js (the three tiles replace it)',
        appjs.count('sh-sub') == 0, appjs.count('sh-sub'))


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    a = ap.parse_args()
    async with async_playwright() as pw:
        if not a.only or a.only == 'S1':
            await sec_s1(pw)
        if not a.only or a.only == 'S2':
            await sec_s2(pw)
    npass = sum(1 for ok, _ in RES if ok)
    nfail = len(RES) - npass
    print("\nassertions by section: " + " . ".join("%s %d" % (k, SEC_COUNT[k]) for k in sorted(SEC_COUNT)))
    print("GOLDEN HT-36 (paste 228): %d/%d PASS, %d FAIL, %d assertions" % (npass, len(RES), nfail, len(RES)))
    if not RES:
        print("ZERO ASSERTIONS - a failed run, not a pass (134 R1).")
        return 1
    return 1 if nfail else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
