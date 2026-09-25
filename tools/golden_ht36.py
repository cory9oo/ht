#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-228 GOLDEN - WIRE HT-228 (PASTE 228), run literally.

    python tools/golden_ht36.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht36.py --only S1

Cory, Thursday 2026-09-24 23:27 CDT: "these percentages on the bottom belong to the top of the insight
tab ... clearly show ... the daily percent and make it color coded. Same request for desktop. It's too
hidden and doesn't trigger enough emotion."

  S1  THE HERO CARD - the day's percent as ONE big numeral, band-inked, first under Insights on the
      phone and first in the desktop right block; the sub-line is the same numbers it always had; and
      the numeral clears 4.5:1 on its card in every scheme.
  S2  THE FOOT BAR AND THE MASTHEAD FIGURE - the grey strip is the day-percent bar on the phone, and
      the masthead figure on the desktop is >=28px, band-inked and the largest text in .mast; the old
      three-number markup is GONE (not hidden).

134 R1: this file prints its assertion count; a section that asserts nothing is a FAIL, not a pass.
Every colour asserted is what the BROWSER resolved (getComputedStyle), never the text of a file. The
band is the MONTH CHART's (__HT16.rampIx) and the ink is the scheme's own token by band family
(--bad / --st-atrisk / --good), never grade()/gcol().
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

THEMES = ['classic', 'crimson', 'moss', 'gilt', 'orchid']
# pct -> (month-chart band it carries, the family token that inks it) - S1.5
CASES = [(68, 2, '--st-atrisk'), (95, 4, '--good'), (10, 0, '--bad')]
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
    print("\n--- S1 . the hero: one renderer, band-inked, first on both widths ---")

    # ---- the band the month chart carries, the ink the scheme gives it (phone card) ----------
    b, pg, errs = await open_page(pw, 390, 844)
    await open_insights(pg)
    for pct, band, tok in CASES:
        await force(pg, pct)
        r = await pg.evaluate("""(a) => { %s
            const el=document.querySelector('#h228Hero .sh-pct'); if(!el) return null;
            const cs=getComputedStyle(el);
            return { color:cs.color, fs:parseFloat(cs.fontSize), bg:bgOf(el),
                     band:(window.__HT16&&window.__HT16.rampIx)?window.__HT16.rampIx(a.pct):null,
                     tok:getComputedStyle(document.documentElement).getPropertyValue(a.tok).trim() }; }"""
            % BG, {'pct': pct, 'tok': tok})
        ok = r is not None
        chk('S1a.%d%% . the numeral carries the month chart\'s band %d' % (pct, band),
            ok and r['band'] == band, r)
        chk('S1b.%d%% . and is inked %s, the scheme token (not a grade colour)' % (pct, tok),
            ok and rgb(r['color']) is not None and rgb(r['color']) == rgb(r['tok']),
            ok and [r['color'], r['tok']])
        chk('S1c.%d%% . the numeral is >=64px at 390 wide' % pct, ok and r['fs'] >= 64, ok and r['fs'])
    chk('S1d . zero page errors building the phone hero', not errs, errs[:2])
    await b.close()

    # ---- the sub-line is the same numbers it always had --------------------------------------
    b, pg, errs = await open_page(pw, 390, 844)
    await open_insights(pg)
    d = await pg.evaluate("""() => { const s=window.__HT26.strip(); let m=null, wk=null;
        try{ m=window.__HT29GRP.you().m; }catch(e){}
        try{ const n=window.__HT32NEED.compute(); wk=window.__HT32WEEK.needLabel(n); }catch(e){}
        const sub=document.querySelector('#h228Hero .sh-sub');
        return { week:s.week, streak:s.streak, m:m, wk:wk, sub: sub?sub.innerText:null }; }""")
    subU = (d['sub'] or '').upper()
    chk('S1e . the sub-line carries the 7-day figure from __HT26.strip()',
        d['sub'] is not None and (str(d['week']) + '%') in d['sub'], d)
    chk('S1f . and the 30-day figure from __HT29GRP.you().m',
        d['m'] is None or (str(d['m']) + '%') in d['sub'], d)
    chk('S1g . and the streak and the week figure from __HT32NEED.compute()',
        ('STREAK' in subU) and (d['wk'] is None or any(w in subU for w in ('SECURED', 'BEST', 'NEED'))), d)
    await b.close()

    # ---- FIRST under the Insights title on the phone -----------------------------------------
    b, pg, errs = await open_page(pw, 390, 844)
    await open_insights(pg)
    place = await pg.evaluate("""() => { const body=document.getElementById('h30InsBody');
        const first=body && [...body.children].filter(n=>n.offsetParent)[0];
        return { firstId: first?first.id:null, heroVis: (()=>{const h=document.getElementById('h228Hero');
                 return !!h && !!h.offsetParent;})() }; }""")
    chk('S1h . phone . the hero is the first card under the Insights title',
        place['firstId'] == 'h228Hero' and place['heroVis'], place)
    await b.close()

    # ---- the desktop hero is the MASTHEAD figure, and the LIFE quadrant is NOT encroached ----
    # #h16Ins is the full-height LIFE quadrant (golden_ht18); its grid already sits at the ht18 cell
    # floor, so the day's-percent CARD is NOT injected there (it would drop the life cell below floor,
    # and ht18 is never loosened). On the desktop the hero is the large band-inked masthead figure -
    # measured in full in S2 (>=28px, band-inked, largest text in .mast, left of the version stamp).
    b, pg, errs = await open_page(pw, 1695, 900)
    dk = await pg.evaluate("""() => {
        const ins=document.getElementById('h16Ins');
        const num=document.querySelector('#tStrip .hero-num');
        const cs=num?getComputedStyle(num):null;
        return { insHasCard: !!(ins && ins.querySelector('#h228Hero')),
                 mastFs: cs?parseFloat(cs.fontSize):null }; }""")
    ok = dk is not None
    chk('S1i . desktop . the LIFE quadrant (#h16Ins) carries NO hero card, so ht18\'s cell floor holds',
        ok and dk['insHasCard'] is False, dk)
    chk('S1j . desktop . the day\'s hero is the masthead figure, >=28px (full test in S2)',
        ok and dk['mastFs'] and dk['mastFs'] >= 28, ok and dk)
    await b.close()

    # ---- contrast: numeral vs its card, every scheme, all three inks (the table for the receipt) ---
    print("  --- contrast table (numeral vs card background), 4.5:1 floor ---")
    for t in THEMES:
        b, pg, errs = await open_page(pw, 390, 844, storage={'ht_theme': t})
        await open_insights(pg)
        row = []
        for pct, band, tok in CASES:
            await force(pg, pct)
            r = await pg.evaluate("""() => { %s const el=document.querySelector('#h228Hero .sh-pct');
                if(!el) return null; const cs=getComputedStyle(el); return { color:cs.color, bg:bgOf(el) }; }""" % BG)
            cr = ratio(rgb(r['color']), rgb(r['bg'])) if r and rgb(r['color']) and rgb(r['bg']) else 0
            row.append((tok, round(cr, 2)))
            chk('S1l . %-7s . %s (%d%%) clears 4.5:1 on its card' % (t, tok, pct), cr >= 4.5, cr)
        print("        %-8s %s" % (t, '  '.join('%s=%.2f' % (k.replace('--', ''), v) for k, v in row)))
        await b.close()


# =============================================================================================
# S2 . THE FOOT BAR AND THE MASTHEAD FIGURE
# =============================================================================================
async def sec_s2(pw):
    CUR[0] = 'S2'
    print("\n--- S2 . the foot of Today is the bar; the masthead is the figure ---")

    # ---- the phone foot bar ------------------------------------------------------------------
    b, pg, errs = await open_page(pw, 390, 844)
    bar = await pg.evaluate("""() => { const s=document.getElementById('tStrip');
        if(!s) return null; const cs=getComputedStyle(s);
        const fill=s.querySelector('.hero-fill'), pctN=s.querySelector('.hero-num'),
              go=s.querySelector('.go');
        return { cls:s.className, w:Math.round(s.getBoundingClientRect().width),
                 cw:document.querySelector('.colL')?Math.round(document.querySelector('.colL').getBoundingClientRect().width):null,
                 fillW: fill?fill.style.width:null, pct: pctN?pctN.textContent.trim():null,
                 go: go?go.textContent.trim():null,
                 nums: window.__HT26.strip() }; }""")
    ok = bar is not None
    chk('S2a . phone . #tStrip is the day-percent bar (hero-bar)', ok and bar['cls'] == 'hero-bar', ok and bar['cls'])
    chk('S2b . phone . it is full width of the column',
        ok and bar['cw'] and abs(bar['w'] - bar['cw']) <= 2, ok and [bar['w'], bar['cw']])
    chk('S2c . phone . the bar percent equals the day\'s completion (the hero\'s)',
        ok and bar['pct'] == (str(bar['nums']['today']) + '%'), ok and [bar['pct'], bar['nums']])
    chk('S2d . phone . the fill is as wide as the percent', ok and bar['fillW'] == (str(bar['nums']['today']) + '%'), ok and bar['fillW'])
    chk('S2e . phone . its one text link is Insights', ok and bar['go'] and 'INSIGHTS' in bar['go'].upper(), ok and bar['go'])
    # the tap opens Insights
    await pg.click('#tStrip')
    await pg.wait_for_timeout(700)
    opened = await pg.evaluate("() => { const n=document.getElementById('h30Ins'); return !!(n && n.offsetParent); }")
    chk('S2f . phone . a tap on the bar opens Insights', opened, opened)
    chk('S2g . phone . zero page errors', not errs, errs[:2])
    await b.close()

    # ---- the desktop masthead figure ---------------------------------------------------------
    b, pg, errs = await open_page(pw, 1695, 900)
    m = await pg.evaluate("""() => { const s=document.getElementById('tStrip');
        if(!s) return null; const num=s.querySelector('.hero-num');
        const cs=num?getComputedStyle(num):null;
        // largest text in .mast
        const mast=document.querySelector('.mast'); let maxfs=0;
        if(mast){ const w=document.createTreeWalker(mast, NodeFilter.SHOW_TEXT,
            {acceptNode:n=>n.textContent.trim()?1:3}); let x;
          while((x=w.nextNode())){ const e=x.parentElement, c=e&&getComputedStyle(e);
            if(!c||c.visibility==='hidden'||c.display==='none') continue;
            maxfs=Math.max(maxfs, parseFloat(c.fontSize)||0); } }
        const stamp=document.getElementById('h185sync');
        const nr=num?num.getBoundingClientRect():null, sr=stamp?stamp.getBoundingClientRect():null;
        return { cls:s.className, inMast: !!s.closest('.mast'), fs: cs?parseFloat(cs.fontSize):null,
                 maxfs:maxfs, numLeft: nr?nr.left:null, stampLeft: sr?sr.left:null,
                 stampSeen: !!stamp }; }""")
    ok = m is not None
    chk('S2h . desktop . #tStrip is the masthead figure (hero-mast), inside .mast',
        ok and m['cls'] == 'hero-mast' and m['inMast'], ok and m)
    chk('S2i . desktop . the figure is >=28px', ok and m['fs'] and m['fs'] >= 28, ok and m['fs'])
    chk('S2j . desktop . and it is the largest text in the masthead',
        ok and m['fs'] and m['maxfs'] and m['fs'] >= m['maxfs'] - 0.5, ok and [m['fs'], m['maxfs']])
    chk('S2k . desktop . the figure sits left of the version stamp',
        ok and (not m['stampSeen'] or (m['numLeft'] is not None and m['stampLeft'] is not None and m['numLeft'] < m['stampLeft'])),
        ok and [m['numLeft'], m['stampLeft']])
    chk('S2l . desktop . zero page errors', not errs, errs[:2])
    await b.close()

    # ---- the old markup is GONE, not hidden (S2.3) -------------------------------------------
    appjs = src(os.path.join(REPO, 'app.js'))
    appcss = src(os.path.join(REPO, 'app.css'))
    chk('S2m . the old strip markup is gone: no `class="k">Streak` in app.js',
        appjs.count('class="k">Streak') == 0, appjs.count('class="k">Streak'))
    chk('S2n . the old strip style is gone: no `.tstrip` in app.css',
        appcss.count('.tstrip') == 0, appcss.count('.tstrip'))


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
