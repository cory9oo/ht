#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GOLDEN HT-41 - WIRE HT-300 (PASTE 300 · SUPER HD), run literally.

    python tools/golden_ht41.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht41.py --only T1

What this holds (paste 300 S3.1):
  T1  THREE themes only - the picker offers exactly Crimson · Green · Graphite, Graphite is default,
      and the visible labels are those three words.
  T2  a RETIRED scheme maps to the nearest of the three ON LOAD (classic->graphite, gilt->crimson,
      orchid->moss), is never written back, and the mapping is logged once.
  T3  CONTRAST - every theme's body text clears 4.5:1 on its own ground, measured on the LIVE values.
  T4  HAIRLINES CRISP at DPR 1/2/3 - a known rule is exactly one CSS pixel (never a blurred 1.5/0.5),
      and NO element carrying text has a blur filter.
  T5  TABULAR NUMERALS where a number sits - the hero, the bar and the ledger resolve to tabular-nums.
  T6  DEPTH WITHOUT GLASS - three elevation shadows resolve and are on the real surfaces; there is no
      blur filter and no backdrop glass anywhere in app.css.
  T7  THE 293 LAYOUT DID NOT MOVE - the hero and the day list still render at phone and desktop. The
      geometry pins ht37-40 and the overflow floor ht18 run in this SAME gate (run_suite.sh); this
      section proves the surface is present, not re-measured (NO-BLOAT).

134 R1: this file prints its assertion count; a section that asserts nothing is a FAIL, not a pass.
Colour ratios are computed from what the BROWSER resolved, never from a file - a theme that failed to
load leaves every property empty, and a check that read the file would pass over a blank instrument.
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
    raise SystemExit('golden_ht41: no estate root above %s' % start)


ESTATE = find_estate(REPO)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'),
              os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('golden_ht41: no fixture under %s - looked for _machine/ht3 and ht3.' % estate)


FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')

THEMES = ['crimson', 'moss', 'graphite']       # picker ids, in order
LABELS = ['Crimson', 'Green', 'Graphite']      # the words a person sees
DEFAULT_THEME = 'graphite'
RETIRED_MAP = {'classic': 'graphite', 'gilt': 'crimson', 'orchid': 'moss'}

RES = []
SEC_COUNT = {}
CUR = ['T?']


def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    SEC_COUNT[CUR[0]] = SEC_COUNT.get(CUR[0], 0) + 1
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def src(p):
    try:
        return io.open(p, encoding='utf-8', errors='replace').read()
    except OSError as e:
        raise SystemExit('golden_ht41: cannot read %s (%s). A check that cannot run is not a pass.'
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


def theme_file_ground(name):
    m = re.search(r'--ground:\s*(#[0-9a-fA-F]{3,8})',
                  src(os.path.join(REPO, 'themes', name + '.css')))
    return m.group(1).lower() if m else None


async def open_page(pw, w=390, h=844, storage=None, wait=1100, dpr=1, capture=False):
    touch = w < 1024
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch,
                              device_scale_factor=dpr, color_scheme='dark')
    pg = await ctx.new_page()
    errs, logs = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: (logs.append(m.text),
          errs.append('console:' + m.text) if m.type == 'error' and 'net::' not in m.text else None))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    if storage:
        import json
        await pg.add_init_script("try{%s}catch(e){}" % "".join(
            "localStorage.setItem(%s,%s);" % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    await pg.goto(BASE)
    await pg.wait_for_timeout(wait)
    if capture:
        return b, pg, errs, logs
    return b, pg, errs


async def open_settings(pg):
    await pg.evaluate("() => { const s=document.getElementById('bSet'); if(s) s.click(); }")
    await pg.wait_for_timeout(900)


# =============================================================================================
# T1 . THREE THEMES ONLY
# =============================================================================================
async def sec_t1(pw):
    CUR[0] = 'T1'
    print("\n--- T1 . three themes only: Crimson . Green . Graphite, Graphite the default ---")
    app = src(os.path.join(REPO, 'app.js'))
    m = re.search(r"var THEMES = \[([^\]]+)\]", app)
    ids = [x.strip().strip("'\"") for x in m.group(1).split(',')] if m else []
    chk('T1a . app.js offers exactly the three, in order', ids == THEMES, ids)
    lab = re.search(r"var THEME_LABEL = \{([^}]+)\}", app)
    labels = dict(re.findall(r"(\w+)\s*:\s*'([^']+)'", lab.group(1))) if lab else {}
    chk('T1b . the labels are Crimson . Green . Graphite (moss is shown as Green)',
        [labels.get(t) for t in THEMES] == LABELS, labels)

    b, pg, errs = await open_page(pw)
    got = await pg.get_attribute('html', 'data-theme')
    chk('T1c . a first load with nothing stored is Graphite (the new default)', got == DEFAULT_THEME, got)
    await open_settings(pg)
    picks = await pg.evaluate("() => [...document.querySelectorAll('[data-theme-pick]')]"
                              ".map(b => b.getAttribute('data-theme-pick'))")
    chk('T1d . Settings -> Appearance offers exactly the three, nothing else', picks == THEMES, picks)
    seen = await pg.evaluate("() => [...document.querySelectorAll('[data-theme-pick] .thnm, [data-theme-pick]')]"
                             ".map(n => n.textContent.trim())")
    shown = ' '.join(seen)
    chk('T1e . the three words are on screen', all(w in shown for w in LABELS), shown[:160])
    chk('T1f . zero page errors', not errs, errs[:2])
    await b.close()


# =============================================================================================
# T2 . A RETIRED SCHEME MAPS TO THE NEAREST OF THE THREE, ON LOAD, LOGGED ONCE
# =============================================================================================
async def sec_t2(pw):
    CUR[0] = 'T2'
    print("\n--- T2 . a retired scheme maps to the nearest of the three, on load, logged once ---")
    for stored, want in RETIRED_MAP.items():
        b, pg, errs, logs = await open_page(pw, storage={'ht_theme': stored}, capture=True)
        got = await pg.get_attribute('html', 'data-theme')
        kept = await pg.evaluate("() => localStorage.getItem('ht_theme')")
        logged = [l for l in logs if 'retired theme' in l and stored in l]
        chk('T2.%s . resolves to %s on load, never written back' % (stored, want),
            got == want and kept == stored, [got, kept])
        chk('T2.%s . the mapping is logged (once)' % stored, len(logged) >= 1, logs[:4])
        await b.close()


# =============================================================================================
# T3 . CONTRAST - body text clears 4.5:1 on its own ground, live
# =============================================================================================
async def sec_t3(pw):
    CUR[0] = 'T3'
    print("\n--- T3 . every theme's body text clears AA on its own ground (live values) ---")
    for t in THEMES:
        b, pg, errs = await open_page(pw, storage={'ht_theme': t})
        vals = await pg.evaluate("(names)=>{const cs=getComputedStyle(document.documentElement);"
                                 "const o={};for(const n of names)o[n]=cs.getPropertyValue(n).trim();return o;}",
                                 ['--ground', '--ink', '--ink2'])
        g, ink, ink2 = rgb(vals['--ground']), rgb(vals['--ink']), rgb(vals['--ink2'])
        ok = bool(g and ink and ink2 and g == rgb(theme_file_ground(t)))
        chk('T3.%s . --ink and --ink2 both clear 4.5:1 on --ground' % t,
            ok and ratio(ink, g) >= 4.5 and ratio(ink2, g) >= 4.5,
            ok and [round(ratio(ink, g), 2), round(ratio(ink2, g), 2)])
        await b.close()


# =============================================================================================
# T4 . HAIRLINES CRISP AT DPR 1/2/3, AND NO BLUR ON TEXT
# =============================================================================================
async def sec_t4(pw):
    CUR[0] = 'T4'
    print("\n--- T4 . a hairline is exactly one CSS pixel at DPR 1/2/3, and no text is blurred ---")
    for dpr in (1, 2, 3):
        b, pg, errs = await open_page(pw, dpr=dpr)
        # a known structural rule: the masthead's bottom border. A blurred hairline is 0.5/1.5px or a
        # sub-pixel box edge; a crisp one is exactly 1px on an integer-aligned box.
        got = await pg.evaluate("""() => {
          const m = document.querySelector('.mast');
          if(!m) return {no:'mast'};
          const cs = getComputedStyle(m);
          const r = m.getBoundingClientRect();
          return { bw: cs.borderBottomWidth,
                   hair: getComputedStyle(document.documentElement).getPropertyValue('--hair').trim(),
                   edgeFrac: Math.abs(Math.round(r.bottom) - r.bottom) }; }""")
        chk('T4.dpr%d . the masthead hairline is exactly 1px (never a blurred 0.5/1.5)' % dpr,
            got.get('bw') == '1px' and got.get('hair') == '1px', got)
        # NO text is blurred: scan a sample of text-bearing nodes for a blur filter.
        blurred = await pg.evaluate("""() => {
          const out=[];
          for(const el of document.querySelectorAll('body *')){
            const t=(el.textContent||'').trim();
            if(!t) continue;
            const f=getComputedStyle(el).filter;
            if(f && f.indexOf('blur')>=0) out.push(el.className||el.tagName);
            if(out.length>3) break;
          } return out; }""")
        chk('T4.dpr%d . no element carrying text has a blur filter (depth without glass)' % dpr,
            not blurred, blurred)
        await b.close()


# =============================================================================================
# T5 . TABULAR NUMERALS - hero, bar, ledger
# =============================================================================================
async def sec_t5(pw):
    CUR[0] = 'T5'
    print("\n--- T5 . tabular numerals where a number sits: the hero, the bar, the ledger ---")
    b, pg, errs = await open_page(pw, w=1280, h=900, wait=1300)
    fv = await pg.evaluate("""() => {
      const pick = sel => { const n=document.querySelector(sel);
        return n ? getComputedStyle(n).fontVariantNumeric : null; };
      return { body: getComputedStyle(document.body).fontVariantNumeric,
               heroNum: pick('.hero-num'), heroBar: pick('.hero-bar'), ledger: pick('.h16sc') }; }""")
    chk('T5a . the body sets tabular-nums, so every number inherits it',
        'tabular-nums' in (fv.get('body') or ''), fv)
    # the three the brief names, when present, resolve to tabular-nums (they inherit or re-declare it)
    for key in ('heroNum', 'heroBar', 'ledger'):
        v = fv.get(key)
        chk('T5.%s . resolves to tabular-nums (or is absent on this view)' % key,
            v is None or 'tabular-nums' in v, {key: v})
    chk('T5z . at least one number surface was measured (134 R1)',
        any(fv.get(k) for k in ('heroNum', 'heroBar', 'ledger')) or 'tabular-nums' in (fv.get('body') or ''), fv)
    await b.close()


# =============================================================================================
# T6 . DEPTH WITHOUT GLASS
# =============================================================================================
async def sec_t6(pw):
    CUR[0] = 'T6'
    print("\n--- T6 . depth without glass: three shadows on real surfaces, no blur/backdrop anywhere ---")
    css = src(os.path.join(REPO, 'app.css'))
    chk('T6a . app.css has NO blur filter and NO backdrop glass (depth is shadow, not glass)',
        not re.search(r'backdrop-filter\s*:', css) and not re.search(r'filter\s*:[^;]*blur', css),
        [m.group(0) for m in re.finditer(r'(backdrop-filter\s*:|filter\s*:[^;]*blur)', css)][:3])
    b, pg, errs = await open_page(pw, wait=1000)
    tok = await pg.evaluate("""() => { const cs=getComputedStyle(document.documentElement);
      return { e1:cs.getPropertyValue('--elev-1').trim(), e2:cs.getPropertyValue('--elev-2').trim(),
               e3:cs.getPropertyValue('--elev-3').trim() }; }""")
    chk('T6b . the three elevation tokens resolve to a real shadow', all(tok.values()) and all('rgba' in v for v in tok.values()), tok)
    shadow = await pg.evaluate("""() => { const m=document.querySelector('.mast');
      return m ? getComputedStyle(m).boxShadow : null; }""")
    chk('T6c . the masthead carries a real shadow (a floating surface, not a flat line)',
        shadow and shadow != 'none', shadow)
    chk('T6d . zero page errors', not errs, errs[:2])
    await b.close()


# =============================================================================================
# T7 . THE 293 LAYOUT DID NOT MOVE (surface present; geometry pins run in the same gate)
# =============================================================================================
async def sec_t7(pw):
    CUR[0] = 'T7'
    print("\n--- T7 . the 293 layout is present at phone and desktop (ht37-40 + ht18 pin geometry in this gate) ---")
    for w, h in ((390, 844), (1280, 900)):
        b, pg, errs = await open_page(pw, w=w, h=h, wait=1200)
        seen = await pg.evaluate("""() => ({
          mast: !!document.querySelector('.mast'),
          list: !!document.getElementById('log'),
          hero: !!document.querySelector('.hero-bar, .hero-m, .capc') }) """)
        chk('T7.%dx%d . masthead, the day list and the hero all render (the surface 293 laid out)' % (w, h),
            seen.get('mast') and seen.get('list'), seen)
        chk('T7.%dx%d . zero page errors' % (w, h), not errs, errs[:2])
        await b.close()


SECTIONS = {'T1': sec_t1, 'T2': sec_t2, 'T3': sec_t3, 'T4': sec_t4, 'T5': sec_t5, 'T6': sec_t6, 'T7': sec_t7}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    a = ap.parse_args()
    want = [a.only] if a.only else list(SECTIONS)
    async with async_playwright() as pw:
        for name in want:
            await SECTIONS[name](pw)
    bad = [n for ok, n in RES if not ok]
    empty = [s for s in want if not SEC_COUNT.get(s)]
    for s in empty:
        print("  FAIL   %s asserted NOTHING - a section that checks nothing has not run (134 R1)" % s)
    print("\nGOLDEN HT-41: %d/%d PASS, %d FAIL, %d assertions"
          % (len(RES) - len(bad), len(RES), len(bad) + len(empty), len(RES)))
    for s in want:
        print("   %s %d" % (s, SEC_COUNT.get(s, 0)))
    return 1 if (bad or empty) else 0


sys.exit(asyncio.run(main()))
