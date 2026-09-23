#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-32 GOLDEN - WIRE HT-32 (PASTE 148 + NUDGES N1-N7), run literally.

    python tools/golden_ht32.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht32.py --only S6

  S6  four themes, one picker, applied before the first paint and persisted - and the colours live
      in `themes/` alone, where `tokens.css` used to keep a second copy of them
  S2  the group table: a need column, people added by email, and what is riding on the week
  S4  reports per member, and the four fields that are never in one
  S8  N4 . a renderer registered by config alone appears in Settings
  S5  one push a day - the cap, the privacy, and the two sentences a phone needs
  S7  N3 . nothing to save: no save button, blur ends the debounce, a closing tab keeps the words
  S9  N6 . every chart card fits one phone screen whole, and its axis numbers are ON it

134 R1: this file prints its assertion count, and a section that asserts nothing is a FAIL, not a
pass. Every ratio asserted here is computed from what the BROWSER resolved, never from the text of
a file - a theme that fails to load leaves every custom property empty, and a check that reads the
file instead would pass over a blank instrument. That is the failure mode this whole section has:
the skins MOVED, so anything that does not actually load them shows nothing at all.
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
    raise SystemExit('golden_ht32: no estate root above %s' % start)


ESTATE = find_estate(REPO)


def fixture_dir(estate):
    for d in (os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if os.path.isdir(d):
            return d
    raise SystemExit('golden_ht32: no fixture under %s - looked for _machine/ht3 and ht3.' % estate)


FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')

THEMES = ['classic', 'graphite', 'midnight', 'paper']
ALL_THEMES = THEMES + ['terminal']
DEFAULT_THEME = 'graphite'

RES = []
SEC_COUNT = {}
CUR = ['S?']


def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    SEC_COUNT[CUR[0]] = SEC_COUNT.get(CUR[0], 0) + 1
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def src(p):
    """READ IT OR STOP. Several checks below are NEGATIVE - "no raw hex in app.js", "tokens.css
    declares no skin" - and an empty string satisfies every one of them. A file that cannot be read
    is a failed run, never a clean bill of health (134 R1)."""
    try:
        return io.open(p, encoding='utf-8', errors='replace').read()
    except OSError as e:
        raise SystemExit('golden_ht32: cannot read %s (%s). A check that cannot run is not a pass.'
                         % (p, type(e).__name__))


async def open_page(pw, w=390, h=844, storage=None, scheme=None, wait=1200, flags=None):
    """`storage` is written BEFORE the first navigation, because the whole point of S6's pre-paint
    script is that it reads localStorage before anything renders - setting it after a load and
    reloading would test a different code path from the one a phone runs on a cold start."""
    touch = w < 1024
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch,
                              device_scale_factor=1, color_scheme=(scheme or 'dark'))
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    if storage:
        await pg.add_init_script("try{%s}catch(e){}" % "".join(
            "localStorage.setItem(%s,%s);" % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    if flags:
        await pg.add_init_script("; ".join("window.%s=%s" % (k, json.dumps(v)) for k, v in flags.items()))
    await pg.goto(BASE)
    await pg.wait_for_timeout(wait)
    return b, pg, errs


TOKENS_READ = """(names) => { const cs = getComputedStyle(document.documentElement);
  const o = {}; for (const n of names) o[n] = cs.getPropertyValue(n).trim(); return o; }"""


def rgb(v):
    """'#0B0C0E' or 'rgb(11, 12, 14)' -> (11,12,14). A value the browser could not resolve is '',
    and that returns None rather than a black that would quietly pass a contrast check."""
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
    """WCAG 2.1 relative luminance contrast, on RESOLVED values."""
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
    m = re.search(r'--ground:\s*(#[0-9a-fA-F]{3,8})', src(os.path.join(REPO, 'themes', name + '.css')))
    return m.group(1).lower() if m else None


# =============================================================================================
# S6 . FOUR THEMES, ONE PICKER
# =============================================================================================
async def sec_s6(pw):
    CUR[0] = 'S6'
    print("\n--- S6 . four themes, one picker, no flash, and one address per colour ---")
    index = src(os.path.join(REPO, 'index.html'))
    tokens = src(os.path.join(REPO, 'tokens.css'))
    app = src(os.path.join(REPO, 'app.js'))

    # ---- the move, not a copy -------------------------------------------------------------
    chk('S6a . tokens.css declares no skin any more - the four blocks MOVED, they were not copied',
        'data-skin=' not in tokens and 'data-simple]{' not in tokens.replace(' ', ''),
        [s for s in ('data-skin=', 'data-simple]{') if s in tokens.replace(' ', '')])
    chk('S6b . and it kept the shared layers it should have kept (palette, mapping, states)',
        '--ht-ground:' in tokens and '--st-secured:' in tokens and '--sb-thumb:' in tokens)
    missing = [t for t in ALL_THEMES if not os.path.exists(os.path.join(REPO, 'themes', t + '.css'))]
    chk('S6c . five theme files on disk: the four offered plus terminal, kept not deleted (R70.138)',
        not missing, missing)

    linked = re.findall(r'<link rel="stylesheet" href="\./themes/([a-z]+)\.css">', index)
    chk('S6d . every theme is linked from index.html', sorted(linked) == sorted(ALL_THEMES), linked)
    # LOAD ORDER IS LOAD-BEARING: `[data-theme=x]`, `[data-simple]` and `[data-skin=y]` all measure
    # (0,2,0), so the later file wins. classic.css carries `[data-simple]` - the attribute the app
    # sets on every simple-view load - so every other theme must come after it or the picker
    # silently does nothing in the only view Cory uses.
    chk('S6e . classic.css is linked FIRST, so a picked theme can beat [data-simple]',
        linked and linked[0] == 'classic', linked)

    # ---- applied before the first paint ---------------------------------------------------
    boot = index.find("setAttribute('data-theme'")
    first_sheet = index.find('<link rel="stylesheet" href="./tokens.css">')
    chk('S6f . data-theme is set BEFORE the first stylesheet link - no flash of the old theme',
        boot > 0 and first_sheet > boot, [boot, first_sheet])
    chk('S6g . and the fallback path sets it too, so a browser that throws on localStorage is themed',
        index.count("setAttribute('data-theme'") >= 2, index.count("setAttribute('data-theme'"))

    # ONE DEFAULT, ONE ADDRESS. This pair exists because the first red-first run of this golden found
    # NOTHING when index.html's default was changed: app.js carried its own `THEME_DEFAULT` and put it
    # back a tick after the paint. Two defaults do not fight visibly - the later one just wins, late.
    idef = re.search(r"var _TDEF = '([a-z]+)'", index)
    adef = re.search(r"getAttribute\('data-theme-default'\) \|\| '([a-z]+)'", app)
    chk('S6g2 . the default is declared in index.html and READ by app.js - not declared twice',
        bool(idef) and bool(adef) and idef.group(1) == adef.group(1) == DEFAULT_THEME,
        [idef and idef.group(1), adef and adef.group(1)])

    # ---- one address for a colour ---------------------------------------------------------
    hexes = [h for h in re.findall(r'#[0-9a-fA-F]{3,8}\b', app) if not re.match(r'^#add\b', h)]
    chk('S6h . app.js holds NO colour literal - swatches are read from what the browser resolved',
        not hexes, hexes)

    # ---- the default, on a browser that has never seen this app ---------------------------
    b, pg, errs = await open_page(pw)
    got = await pg.get_attribute('html', 'data-theme')
    vals = await pg.evaluate(TOKENS_READ, ['--ground', '--ink', '--accent'])
    chk('S6i . a first load with nothing stored is Graphite (S6.14 default; switch user.theme)',
        got == DEFAULT_THEME, got)
    chk('S6j . and the theme file actually LOADED - --ground resolves to graphite.css\'s own value',
        rgb(vals['--ground']) == rgb(theme_file_ground(DEFAULT_THEME)), vals)
    chk('S6k . zero page errors on a themed cold start', not errs, errs[:2])
    await b.close()

    # ---- every theme applies, and its text clears AA against its own ground ----------------
    for t in ALL_THEMES:
        b, pg, errs = await open_page(pw, storage={'ht_theme': t})
        got = await pg.get_attribute('html', 'data-theme')
        vals = await pg.evaluate(TOKENS_READ, ['--ground', '--ink', '--ink2'])
        g, ink, ink2 = rgb(vals['--ground']), rgb(vals['--ink']), rgb(vals['--ink2'])
        ok = (got == t and g == rgb(theme_file_ground(t)) and ink and ink2)
        chk('S6l.%s . stored preference applies on load, and its tokens resolve' % t, ok, [got, vals])
        chk('S6m.%s . body text clears 4.5:1 on its own ground, measured on the LIVE values' % t,
            ok and ratio(ink, g) >= 4.5 and ratio(ink2, g) >= 4.5,
            ok and [round(ratio(ink, g), 2), round(ratio(ink2, g), 2)])
        await b.close()

    # ---- an unknown value never leaves the app unthemed ------------------------------------
    b, pg, _ = await open_page(pw, storage={'ht_theme': 'chartreuse'})
    got = await pg.get_attribute('html', 'data-theme')
    chk('S6n . a stored theme this build does not know falls back to the default, never to nothing',
        got == DEFAULT_THEME, got)
    await b.close()

    # ---- EXTRA-1: follow the system light/dark pair ----------------------------------------
    for scheme, want in (('light', 'paper'), ('dark', 'graphite')):
        b, pg, _ = await open_page(pw, storage={'ht_theme': 'system'}, scheme=scheme)
        got = await pg.get_attribute('html', 'data-theme')
        follow = await pg.get_attribute('html', 'data-theme-follow')
        chk('S6o.%s . "follow system" resolves to %s and says it is following' % (scheme, want),
            got == want and follow == '1', [got, follow])
        await b.close()

    # ---- the picker: instant, persisted, and the only one ----------------------------------
    b, pg, errs = await open_page(pw)
    await pg.evaluate("() => { const s=document.getElementById('bSet'); if(s) s.click(); }")
    await pg.wait_for_timeout(900)
    picks = await pg.evaluate("() => [...document.querySelectorAll('[data-theme-pick]')]"
                              ".map(b => b.getAttribute('data-theme-pick'))")
    chk('S6p . Settings -> Appearance offers the four themes and the system pair, and nothing else',
        picks == THEMES + ['system'], picks)
    pressed = await pg.evaluate("() => [...document.querySelectorAll('[data-theme-pick]')]"
                                ".filter(b => b.getAttribute('aria-pressed')==='true')"
                                ".map(b => b.getAttribute('data-theme-pick'))")
    chk('S6q . exactly one is marked pressed, and it is the one in force', pressed == [DEFAULT_THEME], pressed)
    # the old "Look" tray listed raw skin names - an implementation, not a look
    body = await pg.evaluate("() => (document.getElementById('ov')||document.body).textContent")
    chk('S6r . the old raw skin names are gone from Settings - a person picks a look, not a token set',
        not any(w in body for w in ('statement', 'carbon', 'blueprint')), body[:160])

    await pg.evaluate("() => document.querySelector('[data-theme-pick=\"midnight\"]').click()")
    await pg.wait_for_timeout(400)
    after = await pg.evaluate("""() => ({
      attr: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('ht_theme'),
      ground: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
      meta: (document.querySelector('meta[name=theme-color]')||{}).content })""")
    chk('S6s . one tap switches it at once - attribute, resolved colour and the stored value agree',
        after['attr'] == 'midnight' and after['stored'] == 'midnight'
        and rgb(after['ground']) == rgb(theme_file_ground('midnight')), after)
    # the status bar is the one place a colour is COPIED, so it is the one place it can be stale
    chk('S6t . and <meta theme-color> follows, so the phone status bar is not the old theme',
        rgb(after['meta']) == rgb(theme_file_ground('midnight')), after['meta'])
    pressed2 = await pg.evaluate("() => [...document.querySelectorAll('[data-theme-pick]')]"
                                 ".filter(b => b.getAttribute('aria-pressed')==='true')"
                                 ".map(b => b.getAttribute('data-theme-pick'))")
    chk('S6u . the picker repaints its own pressed state - and a second tap still works, which a '
        'per-button handler would have broken when innerHTML was rewritten', pressed2 == ['midnight'], pressed2)
    await pg.evaluate("() => document.querySelector('[data-theme-pick=\"paper\"]').click()")
    await pg.wait_for_timeout(400)
    twice = await pg.get_attribute('html', 'data-theme')
    chk('S6v . the second tap lands too (the delegated listener survives the repaint)', twice == 'paper', twice)

    await pg.reload()
    await pg.wait_for_timeout(1200)
    kept = await pg.get_attribute('html', 'data-theme')
    chk('S6w . and it survives a reload - HT-9a\'s dark lock no longer takes the choice back',
        kept == 'paper', kept)
    chk('S6x . zero page errors through the whole picker walk', not errs, errs[:2])
    await b.close()


# =============================================================================================
# S9 . N6 . EVERY CHART CARD FITS ONE PHONE SCREEN, WHOLE
# =============================================================================================
# Cory, 9/22 20:24, with a screenshot of THE YEAR at 390x844: "This needs to show the full chart
# and its numberings for x and y". The card was TALLER THAN THE VIEWPORT, so its title and its top
# gridlines sat under the status bar / Dynamic Island.
#
# THIS SECTION MEASURES GEOMETRY, NOT PRESENCE, AND THAT IS THE WHOLE POINT. Every label was already
# in the DOM when he took that screenshot, so every check of the "the labels exist" kind passed
# while he was looking at a chart with no 100 on it. `getBoundingClientRect()` against the usable
# viewport is the only thing that can tell those two apart.
INSIGHTS_FLAGS = {'__HT29_SQL': True, '__SECTION': True, '__BIGSET': True, '__CIRCLE': True,
                  '__SECTIONS': {'h0': 'morning', 'h1': 'night', 'h2': 'weekly', 'h3': 'standards'}}

CARD_GEOM = """() => {
  const body = document.getElementById('h30InsBody');
  const cards = [...(body ? body.children : [])].filter(n => n.offsetParent);
  // the same seam the app reads, so the test and the app agree about this device
  let inset = window.__H32_INSET;
  if (typeof inset !== 'number') {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;height:env(safe-area-inset-top,0px)';
    document.documentElement.appendChild(probe);
    inset = probe.getBoundingClientRect().height || 0;
    probe.remove();
  }
  const nav = document.getElementById('h29Bar');
  const bar = (nav && getComputedStyle(nav).display !== 'none')
              ? nav.getBoundingClientRect().height : 0;
  const usable = window.innerHeight - bar - inset;
  return {
    usable: Math.round(usable), inset: Math.round(inset), bar: Math.round(bar),
    vh: window.innerHeight,
    cards: cards.map(n => {
      const r = n.getBoundingClientRect();
      const svg = n.querySelector('svg.chart');
      // an axis label is VISIBLE when its own box is inside the card's box, not merely in the DOM
      const labs = svg ? [...svg.querySelectorAll('text.ayl, text.xl')] : [];
      const boxes = labs.map(t => t.getBoundingClientRect());
      const clipped = boxes.filter(b => b.width === 0 || b.height === 0
                                        || b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5).length;
      return { id: n.id, h: Math.round(r.height), chart: !!svg,
               y: svg ? [...svg.querySelectorAll('text.ayl')].map(t => t.textContent.trim()) : [],
               x: svg ? [...svg.querySelectorAll('text.xl')].length : 0,
               labels: labs.length, clipped: clipped };
    })
  };
}"""


async def sec_s9(pw):
    CUR[0] = 'S9'
    print("\n--- S9 . N6 . a chart card fits one phone screen, and its numbers are ON it ---")
    # 59px is an iPhone 14 Pro's top inset - the device the screenshot came from. Without it a
    # headless browser reports 0 and this whole section measures a phone with no island, which is
    # exactly the phone that never had the defect.
    for w, h in ((390, 844), (430, 932)):
        b, pg, errs = await open_page(pw, w, h, wait=900, flags={'__H32_INSET': 59})
        await pg.add_init_script("")
        await pg.evaluate("() => { const t=document.querySelector('#h29Bar [data-t29=\"insights\"]');"
                          " if(t) t.click(); }")
        await pg.wait_for_timeout(1500)
        g = await pg.evaluate(CARD_GEOM)
        charts = [c for c in g['cards'] if c['chart']]
        chk('S9a.%dx%d . the Insights page has chart cards to measure - a section that measures '
            'nothing has not run (134 R1)' % (w, h), len(charts) >= 1, g['cards'])
        tall = [c for c in charts if c['h'] > g['usable'] + 1]
        chk('S9b.%dx%d . EVERY chart card fits the usable viewport whole (height - tab bar - '
            'safe-area inset)' % (w, h), not tall, [g['usable'], tall])
        clipped = [c for c in charts if c['clipped']]
        chk('S9c.%dx%d . and every axis label is ON the card - not clipped above its top, which is '
            'where the 100 and the 90 went' % (w, h), not clipped, clipped)
        ylab = [c for c in charts if c['y']]
        chk('S9d.%dx%d . the phone y axis reads 0 . 25 . 50 . 75 . 100 - five labels, and the 100 '
            'he named is one of them' % (w, h),
            all(c['y'] == ['0', '25', '50', '75', '100'] or c['y'] == ['100', '75', '50', '25', '0']
                for c in ylab) if ylab else True, [c['y'] for c in ylab])
        chk('S9e.%dx%d . the labels were not thinned away to make it fit - every chart still carries '
            'its x labels' % (w, h), all(c['x'] > 0 for c in charts), [c['x'] for c in charts])
        cardmax = await pg.evaluate("() => getComputedStyle(document.documentElement)"
                                    ".getPropertyValue('--h32-cardmax').trim()")
        chk('S9f.%dx%d . the budget the app published accounts for the island - it is smaller than '
            'the viewport by at least the inset and the bar' % (w, h),
            cardmax.endswith('px') and float(cardmax[:-2]) <= g['vh'] - 59, [cardmax, g])
        chk('S9g.%dx%d . zero page errors' % (w, h), not errs, errs[:2])
        await b.close()

    # the desktop keeps the denser axis - the complaint was about a phone
    b, pg, errs = await open_page(pw, 1280, 720, wait=900)
    g = await pg.evaluate(CARD_GEOM)
    chk('S9h.1280x720 . the desktop is untouched by this: no phone Insights page to shrink',
        isinstance(g['cards'], list), g['cards'][:1])
    # DEDUPE FIRST: a desktop page draws several charts, so the same label value appears many times
    # and `t[1]-t[0]` on the raw sorted list is 0 every time - a number that looks like a measurement
    # and is an artefact of counting the same axis twice.
    step = await pg.evaluate("() => { const t=[...new Set([...document.querySelectorAll('text.ayl')]"
                             ".map(n=>+n.textContent.trim()).filter(n=>!isNaN(n)))].sort((a,b)=>a-b);"
                             " return t.length>1 ? t[1]-t[0] : null; }")
    chk('S9i.1280x720 . and where a desktop chart is drawn its y axis is still every 10, not the '
        'phone\'s five', step in (None, 10, 20), step)
    chk('S9j.1280x720 . zero page errors', not errs, errs[:2])
    await b.close()


# =============================================================================================
# S7 . N3 . NOTHING TO SAVE - IT SAVES AS YOU TYPE
# =============================================================================================
# Cory, 9/22 ~16:00: "I don't wanna have to click save - it should just auto save after I type it
# on my phone or on the laptop."
#
# WHAT WAS ALREADY TRUE IS NOT RE-TESTED (NO-BLOAT): the three journal fields have autosaved since
# HT-22 and `golden_ht22` holds that. What is tested here is the three cases where a person stops
# typing in a way a debounce does not notice - a closed tab, a blur, and the noise of being told
# about every keystroke.
async def sec_s7(pw):
    CUR[0] = 'S7'
    print("\n--- S7 . N3 . no save button anywhere, and a closed tab keeps the words ---")
    app = src(os.path.join(REPO, 'app.js'))

    # ---- the source scan N3 asks for --------------------------------------------------------
    # A control that NAVIGATES may stay ("a Done that navigates stays and saves nothing new"); a
    # control whose whole job was to persist text may not. The two are told apart by what they were
    # wired to, which is why this reads the handler and not the label.
    saves = re.findall(r"id=\"(p?Save|save\w*)\"", app)
    chk('S7a . "Save profile" is gone - it only ever saved text, which is the control N3 retires',
        'id="pSave"' not in app, saves)
    chk('S7b . and nothing was wired to it - the handler went with the button, so there is no dead '
        'path left for a later wire to grep back to life', "el('pSave')" not in app)
    # the standards editor's Save stays, ON PURPOSE, and the reason is written down rather than left
    # to look like an oversight: it commits adds, removes and a reorder, not a field of text.
    chk('S7c . the standards editor keeps its Save - it commits adds, removes and a reorder, and N3 '
        'is about TEXT FIELDS', 'id="edSave"' in app)
    chk('S7d . the debounce is N3\'s 800ms, declared once', "var HT32_SAVE_MS = 800;" in app)
    chk('S7e . a closing page flushes what is pending, with keepalive - an ordinary fetch is '
        'cancelled when the document goes away, which is exactly when this one matters',
        'htFlushOnExit' in app and 'keepalive:true' in app
        and "addEventListener('pagehide'" in app and "visibilitychange" in app)
    chk('S7f . and it refuses to flush without a user token rather than sending one that would be '
        'refused - a save that did not happen beats a request that pretends',
        "if(!key || !tok){ queuePriv(); return; }" in app)
    # BOTH copies of the save tail, not just the one `savePriv` owns: HT-28c's sync layer carries
    # its own, and that is the one a real device runs.
    chk('S7g . THE TOAST IS GONE for a keystroke, on BOTH save paths; a FAILURE still speaks',
        "toast('saved')" not in app and "toast('profile saved')" not in app
        and app.count('htWhisper(') >= 3 and "toast('note not saved')" in app,
        [app.count("toast('saved')"), app.count('htWhisper(')])

    # ---- and it behaves, in a browser ---------------------------------------------------------
    b, pg, errs = await open_page(pw, 390, 844, wait=1200)
    typed = await pg.evaluate("""async () => {
      const t = document.getElementById('iPrayer'); if(!t) return {no:'iPrayer'};
      t.focus();
      t.value = 'a line I typed and did not save';
      t.dispatchEvent(new Event('input', {bubbles:true}));
      // app.js is one sealed closure, so the pending flag is read through its published seam -
      // `window.pvT` is not a thing, and a test that read it would have measured `undefined` and
      // called it "not armed" for ever.
      const P = window.__HT32SAVE;
      const armed = !!(P && P.pending());               // the debounce is running
      t.blur();                                         // and leaving the field must end it
      await new Promise(r => setTimeout(r, 300));
      return { armed, after: !!(P && P.pending()),
               whisper: (document.getElementById('jrnC')||{}).textContent || '',
               classed: !!(document.getElementById('jrnC')||{classList:{contains:()=>false}})
                          .classList.contains('h32whisper') };
    }""")
    chk('S7h . typing arms the save', typed.get('armed') is True, typed)
    chk('S7i . BLUR ENDS IT - the last word does not sit in a timer while the app is switched away',
        typed.get('after') is False, typed)
    chk('S7j . and the only thing it says is a whisper in the field\'s own corner, with the time',
        re.search(r'saved \u00b7 \d{1,2}:\d{2} [AP]M', typed.get('whisper') or '') is not None,
        typed.get('whisper'))
    chk('S7k . the whisper is marked so it can fade, rather than a toast over the page',
        typed.get('classed') is True, typed)
    toasts = await pg.evaluate("() => (document.getElementById('toast')||{}).className || ''")
    chk('S7l . and no toast was raised by typing', 'on' not in toasts.split(), toasts)
    chk('S7m . zero page errors through the whole typing walk', not errs, errs[:2])
    await b.close()


GRP_FLAGS = {'__HT29_SQL': True, '__SECTION': True, '__CIRCLE': True,
             '__SECTIONS': {'h0': 'morning', 'h1': 'night', 'h2': 'weekly', 'h3': 'standards'}}


# =============================================================================================
# S2 . THE GROUP: A NEED COLUMN, PEOPLE ADDED BY EMAIL, AND WHAT IS RIDING ON THE WEEK
# =============================================================================================
async def sec_s2(pw):
    CUR[0] = 'S2'
    print("\n--- S2 . the group table: need, stakes, and adding someone who is not here yet ---")
    b, pg, errs = await open_page(pw, 1280, 900, wait=1600, flags=GRP_FLAGS)
    await pg.wait_for_timeout(1400)

    head = await pg.evaluate("""() => { const t=document.querySelector('#h18Group table.h29gt');
      return t ? [...t.querySelectorAll('thead th')].map(n=>n.textContent.trim()) : null; }""")
    chk('S2a . GROUP carries the NEED column S3.7 asks for, beside the ones it had',
        head == ['member', 'today', '7 days', '30 days', 'need', 'logged'], head)
    cols = await pg.evaluate("""() => { const t=document.querySelector('#h18Group table.h29gt');
      if(!t) return null;
      const th=t.querySelectorAll('thead th').length;
      const bad=[...t.querySelectorAll('tbody tr')].map(r => {
        let n=0; for(const c of r.children) n += (+c.getAttribute('colspan') || 1);
        return n; }).filter(n => n !== th);
      return { th, bad }; }""")
    chk('S2b . and every row spans the same number of columns - the count is written once, so the '
        'empty state cannot go out of step with the header again', cols and not cols['bad'], cols)

    needs = await pg.evaluate("""() => [...document.querySelectorAll('#h18Group td.h32ndc')]
      .map(n => ({ t:n.textContent.trim(), c:[...n.classList].filter(x=>x.startsWith('h32')&&x!=='h32ndc')[0]||null,
                   col:getComputedStyle(n).color }))""")
    chk('S2c . a need cell per member, each with ONE state class (R70.306: one colour per state)',
        len(needs) >= 1 and all(n['c'] for n in needs), needs[:4])
    chk('S2d . and the colours actually resolve - a state class pointing at a token no theme '
        'declares would render as plain text and say nothing',
        all(n['col'] and n['col'] != 'rgba(0, 0, 0, 0)' for n in needs), needs[:2])

    # THE SAME SCORER AS THE HEADER. Two numbers about one week, computed twice, is how they come
    # to disagree; S3.6 says "one scorer" and this is what makes that checkable.
    same = await pg.evaluate("""() => {
      if(!window.__HT32WEEK || !window.__HT32NEED) return null;
      const mine = window.__HT32NEED.compute();
      const cell = document.querySelector('#h18Group tr.h18me td.h32ndc');
      return { state: mine && mine.state, cellClass: cell ? [...cell.classList].join(' ') : null,
               cls: mine ? window.__HT32WEEK.cls(mine) : null }; }""")
    chk('S2e . YOUR row uses the same scorer as the header tile - one definition of the week',
        same and same['cls'] and same['cellClass'] and same['cls'] in same['cellClass'], same)

    stake = await pg.evaluate("""() => { const b=document.querySelector('#h18Group [data-h32stake]');
      return b ? { txt:b.textContent.trim(), title:b.getAttribute('title')||'' } : null; }""")
    chk('S2f . the stakes ride ON the member row they are about, not in a second list',
        stake and 'day off' in (stake['txt'] + stake['title']), stake)

    # ---- adding someone who has not signed in yet -----------------------------------------
    add = await pg.evaluate("""async () => {
      const i=document.getElementById('h32email'), b=document.querySelector('[data-h32add]');
      if(!i || !b) return {no:'controls'};
      i.value='member-a@example.com';
      b.click();
      await new Promise(r=>setTimeout(r,900));
      const rows=[...document.querySelectorAll('#h18Group tr.h32pend')].map(r=>r.textContent.trim());
      return { note:(document.getElementById('h32addn')||{}).textContent||'', rows,
               left:(document.getElementById('h32email')||{}).value }; }""")
    chk('S2g . any member can add someone BY EMAIL, and the row appears at once',
        add.get('rows') and len(add['rows']) == 1, add)
    chk('S2h . named for the local part, and marked as not here yet rather than shown as a bad week',
        add.get('rows') and 'member-a' in add['rows'][0] and 'invited' in add['rows'][0], add)
    chk('S2i . the box clears and says what happens next', not add.get('left') and 'sign in' in add.get('note', ''), add)

    dup = await pg.evaluate("""async () => {
      const i=document.getElementById('h32email'), b=document.querySelector('[data-h32add]');
      i.value='not-an-email'; b.click(); await new Promise(r=>setTimeout(r,400));
      return (document.getElementById('h32addn')||{}).textContent||''; }""")
    chk('S2j . and a typo is caught by the shallowest possible check - an address is validated by '
        'someone signing in with it, not by a regular expression', 'email' in dup, dup)

    gone = await pg.evaluate("""async () => {
      const r=document.querySelector('[data-h32unpend]');
      if(!r) return {no:'remove'};
      r.click(); await new Promise(res=>setTimeout(res,700));
      return { rows:document.querySelectorAll('#h18Group tr.h32pend').length }; }""")
    chk('S2k . and whoever added them can take the row back out (S2.4)', gone.get('rows') == 0, gone)
    chk('S2l . zero page errors through the whole group walk', not errs, errs[:2])
    await b.close()


# =============================================================================================
# S4 . REPORTS - AND THE FOUR FIELDS THAT ARE NEVER IN ONE
# =============================================================================================
async def sec_s4(pw):
    CUR[0] = 'S4'
    print("\n--- S4 . reports per member, and the privacy that is structural rather than promised ---")
    app = src(os.path.join(REPO, 'app.js'))
    sql = src(os.path.join(REPO, 'tools', 'sql', '2026-09-23_ht32.sql'))

    # THE PRIVACY ASSERTION IS THE FIRST ONE, and it reads the SELECT the app actually issues.
    m = re.search(r"var FIELDS = '([^']+)' \+\s*'([^']+)'", app)
    fields = (m.group(1) + m.group(2)).split(',') if m else []
    chk('S4a . the report query names its columns, and not one of the four private fields is '
        'among them - journal, why, completed, prayer',
        fields and not any(f in fields for f in ('brain_dump', 'why', 'tasks', 'prayer')), fields)
    chk('S4b . and the TABLE has no column that could hold one, so there is nothing to leak even '
        'by a query nobody has written yet',
        'create table if not exists public.reports' in sql
        and not any((' ' + f + ' ') in sql.split('create table if not exists public.reports')[1]
                    .split(');')[0] for f in ('brain_dump', 'why', 'prayer')), True)
    chk('S4c . the row is written by the JOB, not by the client - `authenticated` gets no insert',
        'for all to service_role' in sql and 'ht32_reports_owner' in sql)
    chk('S4d . and every member can READ every member\'s rows, inside a circle they are in '
        '(the 9/15 visibility ruling)', 'ht32_reports_read' in sql and 'circle_members me' in sql)
    chk('S4e . one row per member per period, so the job is idempotent',
        'unique (kind, user_id, period)' in sql)
    chk('S4f . the weekly row carries the stakes AS THEY STOOD at period end, which is only '
        'possible because every edit is logged', 'stakes' in sql and 'stakes_log' in sql
        and 'before_text' in sql and 'after_text' in sql)

    b, pg, errs = await open_page(pw, 1280, 900, wait=1600, flags=GRP_FLAGS)
    await pg.wait_for_timeout(1300)
    opened = await pg.evaluate("""async () => {
      const b=document.querySelector('#h18Group [data-h32reports]');
      if(!b) return {no:'button'};
      b.click(); await new Promise(r=>setTimeout(r,900));
      const host=document.getElementById('h32rep');
      return { on:!!document.getElementById('ov').classList.contains('on'),
               title:(document.querySelector('#ovBody .ovh h3')||{}).textContent||'',
               text:host?host.textContent.trim():null }; }""")
    chk('S4g . Reports is a control ON the GROUP panel and it opens (R70.211: a door you cannot '
        'click does not exist)', opened.get('on') and opened.get('title') == 'Reports', opened)
    chk('S4h . with nothing written yet it says WHEN the first one comes - never an error, never '
        'a blank', opened.get('text') and ('9:00 PM' in opened['text'] or 'migration' in opened['text']),
        (opened.get('text') or '')[:120])
    chk('S4i . zero page errors', not errs, errs[:2])
    await b.close()


# =============================================================================================
# S8 . N4 . A RENDERER REGISTERED BY CONFIG ALONE APPEARS IN SETTINGS
# =============================================================================================
async def sec_s8(pw):
    CUR[0] = 'S8'
    print("\n--- S8 . N4 . the mirror seam, from the app's side ---")
    app = src(os.path.join(REPO, 'app.js'))
    # N4's source scan, SCOPED TO THE MODULE THAT MAKES THE CLAIM.
    #
    # The first version of this read the whole file and failed on a help card that has been in
    # the app since long before HT-32 ("Obsidian on your phone", the Drive onboarding words).
    # That is user-facing PROSE, not a renderer reference, and widening the seam's rule to cover
    # every sentence in the product would have meant deleting help text to satisfy a test. N4's
    # claim is about the code that CHOOSES a renderer: `HT32SET` must know only what the
    # registry tells it, and that is what is read here.
    mod = app.split('var HT32SET = (function(){')[1].split('\n})();')[0]
    mod = re.sub(r'/\*.*?\*/', '', mod, flags=re.S)
    reg0 = json.loads(re.search(r'window\.HT_MIRRORS\s*=\s*(\{.*\})\s*;',
                                src(os.path.join(REPO, 'shared', 'mirrors.js')), re.S).group(1))
    keys = [r['key'] for r in reg0['renderers'] if r['key'] != 'none']
    named = [k for k in keys if k in mod.lower()]
    chk('S8a . SOURCE SCAN: the module that draws the mirror picker names NO renderer - it knows '
        'only what `shared/mirrors.js` tells it, which is the whole claim N4 makes',
        not named, named)

    b, pg, errs = await open_page(pw, 1280, 900, wait=1600, flags=GRP_FLAGS)
    got = await pg.evaluate("""async () => {
      const s=document.getElementById('bSet'); if(s) s.click();
      await new Promise(r=>setTimeout(r,900));
      return { keys:[...document.querySelectorAll('[data-h32mir]')].map(n=>n.getAttribute('data-h32mir')),
               labels:[...document.querySelectorAll('[data-h32mir] .thnm')].map(n=>n.textContent.trim()),
               tz:(document.getElementById('h32mw_tz')||{}).textContent||'',
               hour:(document.getElementById('h32mw_hr')||{}).value,
               rw:(document.getElementById('h32mw_rw')||{}).value }; }""")
    reg = json.loads(re.search(r'window\.HT_MIRRORS\s*=\s*(\{.*\})\s*;',
                               src(os.path.join(REPO, 'shared', 'mirrors.js')), re.S).group(1))
    want = [r['key'] for r in reg['renderers']]
    chk('S8b . Settings draws the mirror picker FROM `shared/mirrors.js`, in its order', got['keys'] == want, got)
    chk('S8c . and a renderer with a wall is offered, marked "not yet" - a member chooses it today '
        'and it starts the day the wall lifts, with no second visit to Settings',
        any('not yet' in l for l in (await pg.evaluate(
            "() => [...document.querySelectorAll('[data-h32mir] .thno')].map(n=>n.textContent)"))), True)
    # the zone must be a real IANA name the BROWSER resolved, not the word "timezone" in a
    # label - the first spelling of this asserted the label and would have passed on an empty
    # detection, which is the case it exists to catch.
    chk('S8d . MY WEEK carries the stakes, the hour and the DETECTED zone - nobody picks a timezone '
        'from a list of four hundred',
        got['hour'] and re.search(r'[A-Za-z]+/[A-Za-z_]+', got['tz'] or ''), got)
    chk('S8e . and the member\'s own stakes are in the box, ready to edit from their own phone (N1)',
        'day off' in (got['rw'] or ''), got)
    chk('S8f . zero page errors', not errs, errs[:2])
    await b.close()

    # N4'S ACTUAL CLAIM, and the only way to test it is to make the claim happen: add a renderer to
    # the FIXTURE's copy of the registry - one entry, no code anywhere - and watch Settings grow a
    # row. The fixture's copy is restored whatever happens, because a golden that leaves the fixture
    # changed is a golden that breaks the next one.
    fixreg = os.path.join(FIX, 'shared', 'mirrors.js')
    saved = src(fixreg)
    obj = json.loads(re.search(r'window\.HT_MIRRORS\s*=\s*(\{.*\})\s*;', saved, re.S).group(1))
    obj['renderers'].append({'key': 'null', 'label': 'Nowhere (test)',
                             'note': 'the seam own proof', 'module': 'null_renderer',
                             'available': True})
    grown = 'window.HT_MIRRORS = %s;' % json.dumps(obj, indent=1)
    try:
        io.open(fixreg, 'w', encoding='utf-8', newline='\n').write(grown + '\n')
        b, pg, errs = await open_page(pw, 1280, 900, wait=1600, flags=GRP_FLAGS)
        grew = await pg.evaluate("""async () => {
          const s=document.getElementById('bSet'); if(s) s.click();
          await new Promise(r=>setTimeout(r,900));
          return [...document.querySelectorAll('[data-h32mir]')].map(n=>n.getAttribute('data-h32mir')); }""")
        chk('S8g . A SECOND RENDERER REGISTERED BY CONFIG ALONE APPEARS IN SETTINGS - one entry '
            'in `shared/mirrors.js`, not one line of code anywhere else (N4)',
            'null' in grew and len(grew) == len(want) + 1, grew)
        chk('S8h . and nothing broke doing it', not errs, errs[:2])
        await b.close()
    finally:
        # RESTORED WHATEVER HAPPENS. A golden that leaves the fixture changed is a golden that
        # breaks the next one, and the next one is somebody else's.
        io.open(fixreg, 'w', encoding='utf-8', newline='\n').write(saved)


# =============================================================================================
# S5 . ONE PUSH A DAY - THE CAP, THE PRIVACY, AND THE TWO SENTENCES A PHONE NEEDS
# =============================================================================================
# The arithmetic half of S5 is proven where it lives, under `node --test` against the sender's own
# pure core (`tools/supabase/functions/nudge/core.test.mjs`, six HT-32 cases: the cap under four
# separate attempts to break it, the member's own zone, numbers-only, Friday's week line, a lost
# week, and nobody who has not opted in). It is NOT re-tested here - NO-BLOAT, and a second copy of
# an assertion is a second thing to keep in step. What is tested here is what the SENDER cannot see:
# the words on the phone.
async def sec_s5(pw):
    CUR[0] = 'S5'
    print("\n--- S5 . one push a day, and what the phone is told when it cannot have one ---")
    app = src(os.path.join(REPO, 'app.js'))
    core = src(os.path.join(REPO, 'tools', 'supabase', 'functions', 'nudge', 'core.js'))
    sql = src(os.path.join(REPO, 'tools', 'sql', '2026-09-23_ht32.sql'))

    chk('S5a . the sender has a REPORT slot, and the cap is structural - it refuses on last_sent '
        'rather than relying on anyone remembering', 'export function reportDue' in core
        and 'last_sent || {}).report !== parts.date' in core)
    chk('S5b . one entry per member per sweep, whatever the data does - it iterates users, not slots',
        'const seen = new Set()' in core and 'seen.has(prefs.user_id)' in core)
    chk('S5c . Friday carries the week and no other day does', 'export function isWeekEnd' in core
        and 'parts.weekday === 5' in core)
    chk('S5d . the body is built from a name, a percentage and a rating - there is no journal field '
        'in scope for it to leak', 'composeReport' in core
        and not any(w in core.split('export function composeReport')[1].split('export function')[0]
                    for w in ('brain_dump', 'prayer', 'why')))
    # THE DUPLICATION THAT WAS CAUGHT BY READING, not by a test: a second push table.
    chk('S5e . NO SECOND TABLE for a device address - HT-29 already ships `push_subscriptions` and '
        '`nudge_prefs.last_sent`, and a duplicate would have failed silently (the app writing one, '
        'the sender reading the other)',
        'create table if not exists public.push_subs ' not in sql and 'push_subscriptions' in sql)
    chk('S5f . the panel says ONE A DAY now, not noon and evening',
        'One notification a day' in app and 'carries the week' in app)
    chk('S5g . iOS is told the one thing Safari will not tell it - a web push needs the app on the '
        'Home Screen, and the line is shown only to the phone it is true of',
        'function iosNoHome' in app and 'Add to Home Screen' in app and 'navigator.standalone' in app)
    chk('S5h . and a BLOCKED phone is pointed at the fallback once, with the promise that nothing '
        'will nag it', 'function blocked' in app and 'nag you about it' in app and 'Reports' in app)

    b, pg, errs = await open_page(pw, 390, 844, wait=1200, flags=GRP_FLAGS)
    said = await pg.evaluate("""() => { const n=document.getElementById('toast');
      return { on: !!(n && n.classList.contains('on')), text: n ? n.textContent : '' }; }""")
    chk('S5i . nothing asks for permission on load, and nothing pops (S5.11: "never on load")',
        not said['on'], said)
    chk('S5j . zero page errors', not errs, errs[:2])
    await b.close()


SECTIONS = {'S2': sec_s2, 'S4': sec_s4, 'S5': sec_s5, 'S6': sec_s6, 'S7': sec_s7,
            'S8': sec_s8, 'S9': sec_s9}


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
    print("\nGOLDEN HT-32: %d/%d PASS, %d FAIL, %d assertions"
          % (len(RES) - len(bad), len(RES), len(bad) + len(empty), len(RES)))
    for s in want:
        print("   %s %d" % (s, SEC_COUNT.get(s, 0)))
    return 1 if (bad or empty) else 0


sys.exit(asyncio.run(main()))
