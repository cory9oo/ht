#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-31 GOLDEN - WIRE HT-31 (PASTE 143), run literally.

    python tools/golden_ht31.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht31.py --only S2

  S0  the build says what it is and brings itself forward: version.json, and a reload that waits for
      a blur and keeps what was typed
  S1  THE LAW: nothing but the section field decides the section. A time never moves a task, no
      renderer re-groups the list behind the sections' back, and the person's own placement sticks
      even where the column does not exist yet
  S2  one fmtTime, and not one 24-hour clock left on any screen; the chip on the row IS the editor,
      with hit areas that do not overlap
  S3  one row token per width, the measured numbers, and taps that land on the right row
  S4  four blocks on the phone and no More; nothing of Insights on the desktop, and the four panels
      it used to hold are back on the main view
  S5  the why is off the desktop and still present; the rate row fills its panel at BOTH widths
  S6  one paste applies every pending migration; no owner-only gate in the client
  S7  Invite is one tap in two places, the code is 128 bits, Reset link kills the old one
  S8  one format, two renderers, and the copier's half of it agrees with this repo's declaration

134 R1: this file prints its assertion count, and a section that asserts nothing is a FAIL, not a
pass. Every number written as a constant here was MEASURED on this fixture
(`_reconcile/ht_stage/143/measure_before.json` for the before, `measure_after*.json` for the after).
"""
import argparse, asyncio, http.server, io, json, os, re, socketserver, sys, threading
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
    raise SystemExit('golden_ht31: no estate root above %s' % start)


ESTATE = find_estate(REPO)
RECONCILE = os.path.join(ESTATE, '_reconcile')
CONTAINER = os.path.dirname(ESTATE) if os.path.basename(ESTATE).lower() == '_machine' else ESTATE


def fixture_dir(estate):
    for d in (os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if os.path.isdir(d):
            return d
    return os.path.join(estate, 'ht3')


FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')
SQL = {'__HT29_SQL': True, '__SECTION': True}
PLACED = {'__SECTIONS': {'h0': 'morning', 'h1': 'night', 'h2': 'weekly', 'h3': 'standards'}}
TIMES = {'__ANCHORS': {'h0': {'a': '05:00', 'm': 20}, 'h1': {'a': '21:30', 'm': 20}}}

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
        return u'NOT READABLE: %s (%s)' % (p, type(e).__name__)


def init_js(flags):
    return "; ".join("window.%s=%s" % (k, json.dumps(v)) for k, v in (flags or {}).items())


async def open_page(pw, w=390, h=844, flags=None, wait=3600, base=None):
    touch = w < 1024
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch,
                              device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    if flags:
        await pg.add_init_script(init_js(flags))
    await pg.goto(base or BASE)
    await pg.wait_for_timeout(wait)
    return b, pg, errs


# =============================================================================================
# S0 . THE BUILD KEEPS ITSELF CURRENT
# =============================================================================================
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        http.server.SimpleHTTPRequestHandler.end_headers(self)


def serve(directory):
    handler = lambda *a, **k: Quiet(*a, directory=directory, **k)          # noqa: E731
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]


async def sec_s0(pw):
    CUR[0] = 'S0'
    print("\n--- S0 . the build says what it is, and brings itself forward ---")
    v_app = re.search(r"var HT30_VERSION = '([^']+)'", src(os.path.join(REPO, 'app.js')))
    v_sw = re.search(r"const C='([^']+)'", src(os.path.join(REPO, 'sw.js')))
    v_js = json.loads(src(os.path.join(REPO, 'version.json')) or '{}')
    chk('S0a . one version string in three files now, and they agree',
        v_app and v_sw and v_app.group(1) == v_sw.group(1) == v_js.get('version'),
        [v_app and v_app.group(1), v_sw and v_sw.group(1), v_js.get('version')])
    chk('S0b . the service worker never lets a cache answer for version.json',
        "version.json" in src(os.path.join(REPO, 'sw.js')) and "no-store" in src(os.path.join(REPO, 'sw.js')))

    # THE REAL THING, over http, because a page opened from disk has no deploy behind it
    httpd, url = serve(FIX)
    try:
        b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, **PLACED), base=url)
        running = await pg.evaluate("() => window.__HT31UPD && window.__HT31UPD.running()")
        chk('S0c . the page knows which build it is', bool(running), running)
        # deploy vN+1 under it
        vfile = os.path.join(FIX, 'version.json')
        before = src(vfile)
        io.open(vfile, 'w', encoding='utf-8', newline='\n').write('{ "version": "ht-vTEST" }\n')
        try:
            # 1 . while a box is focused and dirty, it waits and does not reload
            await pg.evaluate("""() => { const t=document.getElementById('iDump');
              if(t){ t.focus(); t.value='half a sentence'; t.dispatchEvent(new Event('input',{bubbles:true})); } }""")
            await pg.evaluate("() => window.__HT31UPD.check()")
            await pg.wait_for_timeout(1200)
            typing = await pg.evaluate("() => ({ typing: window.__HT31UPD.typing(), unsent: window.__HT31UPD.unsent(), "
                                       "pending: window.__HT31UPD.pendingVersion(), text: (document.getElementById('iDump')||{}).value })")
            chk('S0d . it does not reload under his hands - a focused box with unsent text holds it back',
                typing['typing'] and typing['pending'] == 'ht-vTEST' and typing['text'] == 'half a sentence', typing)
            # 2 . on the blur it takes the update, and what was typed survives the reload
            await pg.evaluate("() => document.getElementById('iDump').blur()")
            await pg.wait_for_timeout(2500)
            after = await pg.evaluate("() => ({ v: window.__HT31UPD.running(), text: (document.getElementById('iDump')||{}).value })")
            chk('S0e . on the blur it reloads ONCE, and the half sentence is still in the box',
                after['text'] == 'half a sentence', after)
            chk('S0f . and it does not loop: the same version is not taken twice',
                await pg.evaluate("() => localStorage.getItem('ht31_reloaded')") == 'ht-vTEST')
        finally:
            io.open(vfile, 'w', encoding='utf-8', newline='\n').write(before)
        chk('S0g . zero page errors', not errs, errs[:2])
        await b.close()
    finally:
        httpd.shutdown()


# =============================================================================================
# S1 . NOTHING BUT THE SECTION FIELD DECIDES THE SECTION
# =============================================================================================
HEADS = "() => [...document.querySelectorAll('#log .grp')].map(g => g.textContent.trim())"
UNDER = """(id) => { const log=document.getElementById('log'); let head='(none)';
  for (const n of log.children){ if(n.classList.contains('grp')) head=n.textContent.trim();
    else if(n.classList.contains('li') && n.getAttribute('data-h')===id) return head; } return '(missing)'; }"""


async def sec_s1(pw):
    CUR[0] = 'S1'
    print("\n--- S1 . the law: a clock places nothing ---")
    # the rule itself, in all four languages
    app = src(os.path.join(REPO, 'app.js'))
    core = src(os.path.join(REPO, 'tools', 'supabase', 'functions', 'nudge', 'core.js'))
    copier = src(os.path.join(CONTAINER, 'tools', 'copiers', '_ht.py'))
    chk('S1a . the app has no clock term in either sectionOf',
        "winStartMin(h) != null) return 'morning'" not in app
        and "hhmm(h.planned_start) || hhmm(h.time_anchor)) return 'morning'" not in app, 'app.js')
    core_code = re.sub(r'(?m)^\s*//.*$', '', core)
    chk('S1b . the sender has none (its comments still quote the line, which is the point)',
        "return 'morning'" not in core_code, [l for l in core_code.splitlines() if "'morning'" in l][:2])
    chk('S1c . the vault copier has none',
        'return "morning"' not in copier and 'NEVER reads a clock' in copier, '_ht.py')

    # with NO section column - Cory's live shape - a time never moves a task
    for t in ('05:00', '12:30', '21:30', '23:59', '00:00'):
        b, pg, errs = await open_page(pw, 390, 844, flags={'__ANCHORS': {'h0': {'a': t, 'm': 20}}})
        where = await pg.evaluate(UNDER, 'h0')
        chk('S1d . no column, planned %s . the row stays in Standards' % t, where == 'Standards', where)
        await b.close()
    # with the column, the stored section wins at every hour
    for t in ('05:00', '21:30'):
        b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __SECTIONS={'h0': 'night'},
                                                               __ANCHORS={'h0': {'a': t, 'm': 20}}))
        where = await pg.evaluate(UNDER, 'h0')
        chk('S1e . placed night, planned %s . it is in Night routine' % t, where == 'Night routine', where)
        await b.close()

    # the other half: no renderer re-groups the list behind the sections' back
    b, pg, errs = await open_page(pw, 1280, 800, flags=dict(SQL, __SECTIONS={'h0': 'night', 'h1': 'morning'},
                                                            __ANCHORS={'h0': {'a': '21:30', 'm': 20},
                                                                       'h1': {'a': '06:00', 'm': 20}}))
    first = await pg.evaluate(HEADS)
    for fn in ('repaintCharts', 'repaint'):
        await pg.evaluate("(f) => window.__HT16 && window.__HT16[f] && window.__HT16[f]()", fn)
        await pg.wait_for_timeout(400)
        now = await pg.evaluate(HEADS)
        chk('S1f . after %s() the four section headers are still the headers' % fn, now == first, [fn, now])
        chk('S1g . and no ANYTIME header is written over them (%s)' % fn,
            await pg.evaluate("() => document.querySelectorAll('#log .h16any').length") == 0)
    chk('S1h . zero page errors', not errs, errs[:2])
    await b.close()

    # the placement he makes STICKS even with no column, and Undo lists what the bug may have moved
    b, pg, errs = await open_page(pw, 390, 844, flags={'__ANCHORS': {'h0': {'a': '21:30', 'm': 20}}})
    has = await pg.evaluate("() => { const s=document.getElementById('esheet'); return !!window.__HT31SEC; }")
    chk('S1i . the device keeps a placement when the column cannot', has)
    await pg.evaluate("() => window.__HT31SEC.place('h0','night')")
    await pg.evaluate("() => window.__HT29S2 && window.__HT29S2.regroup()")
    await pg.wait_for_timeout(600)
    chk('S1j . and the row moves there, with no column and no migration',
        await pg.evaluate(UNDER, 'h0') == 'Night routine', await pg.evaluate(UNDER, 'h0'))
    moved = await pg.evaluate("""() => { const st=window.__HT25S3.state();
      st.habits[2].section='morning'; st.habits[2].time_anchor='21:45';
      return window.__HT31MOVED.list().map(r => r.id + ':' + r.suggest); }""")
    chk('S1k . a task stored `morning` with an evening time is listed for one tap, never moved silently',
        any(x.endswith(':night') for x in moved), moved)
    await b.close()


# =============================================================================================
# S2 . TIME
# =============================================================================================
async def sec_s2(pw):
    CUR[0] = 'S2'
    print("\n--- S2 . regular time, and the chip is the editor ---")
    app = src(os.path.join(REPO, 'app.js'))
    chk('S2a . fmtTime is declared once', app.count('\nfunction fmtTime(') == 1)
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, **dict(PLACED, **TIMES)))
    txt = await pg.evaluate("() => document.body.innerText")
    chk('S2b . an AM/PM clock is on the screen', bool(re.search(r'\d{1,2}:\d{2}[\s ](AM|PM)', txt)), txt[:80])
    bare = re.findall(r'(?:^|[^\d:])([01]\d|2[0-3]):[0-5]\d(?![\s ]*[AP]M)', txt)
    chk('S2c . and NOT ONE 24-hour clock is left on it', not bare, bare[:5])
    # MIDNIGHT AND NOON are the two a 12-hour clock trips on, and they are read off the picker's own
    # arithmetic - the same `to24`/`parts` pair that turns what Cory picks into what is stored.
    edges = await pg.evaluate("""() => { const T=window.__HT31TIME;
      return { m: T.parts('00:00'), n: T.parts('12:00'),
               back: [T.to24(12,0,'AM'), T.to24(12,0,'PM'), T.to24(9,30,'PM')] }; }""")
    chk('S2d . midnight is 12 AM, noon is 12 PM, and they survive the trip back',
        edges['m']['h'] == 12 and edges['m']['ap'] == 'AM'
        and edges['n']['h'] == 12 and edges['n']['ap'] == 'PM'
        and edges['back'] == ['00:00', '12:00', '21:30'], edges)
    # the chip opens the picker, saves 24-hour, and never moves the row
    await pg.click('.li[data-h="h1"] [data-ht31t]')
    await pg.wait_for_timeout(400)
    chk('S2e . the chip opens a picker anchored to the row',
        await pg.evaluate("() => !!document.getElementById('ht31pick')"))
    chk('S2f . every control in it is >= 16px, so iOS does not zoom (128 A1)',
        await pg.evaluate("() => [...document.querySelectorAll('#ht31pick select,#ht31pick input')]"
                          ".every(n => parseFloat(getComputedStyle(n).fontSize) >= 16)"))
    before = await pg.evaluate(UNDER, 'h1')
    await pg.select_option('#ht31h', '9')
    await pg.select_option('#ht31m', '45')
    await pg.click('#ht31pick [data-ap="PM"]')
    await pg.click('#ht31pick [data-ht31="done"]')
    await pg.wait_for_timeout(900)
    got = await pg.evaluate("""() => { const st=window.__HT25S3.state(); const h=st.habits.filter(x=>x.id==='h1')[0];
      const r=document.querySelector('.li[data-h="h1"] [data-ht31t]');
      return { stored:h.time_anchor, chip:(r||{}).textContent }; }""")
    chk('S2g . it stores 24-hour and shows 12-hour', got['stored'] == '21:45' and '9:45' in (got['chip'] or ''), got)
    chk('S2h . AND THE ROW DID NOT MOVE - setting a time never changes a section',
        await pg.evaluate(UNDER, 'h1') == before, [before, await pg.evaluate(UNDER, 'h1')])
    # the two hit areas do not overlap
    boxes = await pg.evaluate("""() => { const r=document.querySelector('.li[data-h="h1"]');
      const b=r.querySelector('.bxw').getBoundingClientRect(), c=r.querySelector('[data-ht31t]').getBoundingClientRect();
      return { bw:Math.round(b.width), overlap: b.right > c.left }; }""")
    chk('S2i . the check-off is 44 wide and does not overlap the chip', boxes['bw'] == 44 and not boxes['overlap'], boxes)
    on = await pg.evaluate("() => document.querySelector('.li[data-h=\\'h1\\']').classList.contains('on')")
    await pg.click('.li[data-h="h1"] [data-ht31t]')
    await pg.wait_for_timeout(300)
    chk('S2j . a tap on the chip never toggles the day',
        await pg.evaluate("() => document.querySelector('.li[data-h=\\'h1\\']').classList.contains('on')") == on)
    await pg.keyboard.press('Escape')
    await pg.wait_for_timeout(200)
    chk('S2k . Esc closes it without saving', await pg.evaluate("() => !document.getElementById('ht31pick')"))
    chk('S2l . a ghost + time is offered in Morning and Night only', await pg.evaluate(
        """() => { const g=[...document.querySelectorAll('#log .ht31ghost')];
          const secs=g.map(n => { let p=n.closest('.li'); let h='';
            while(p){ if(p.classList && p.classList.contains('grp')){ h=p.textContent.trim(); break; } p=p.previousElementSibling; }
            return h; });
          return secs.every(s => s === 'Morning routine' || s === 'Night routine'); }"""))
    chk('S2m . zero page errors', not errs, errs[:2])
    await b.close()


# =============================================================================================
# S3 . ROWS
# =============================================================================================
TAPS = """() => { const rows=[...document.querySelectorAll('#log .li')];
          const bar=document.getElementById('h29Bar');
          /* `offsetParent` is ALWAYS null for a fixed element - the bar is fixed, so asking that way
             said "no bar" and the rows under it were counted as misses. Measured by its own box. */
          const bb=(bar && bar.getBoundingClientRect().height > 0) ? bar.getBoundingClientRect() : null;
          let ok=0, tried=0, miss=[];
          for (const r of rows){ const b=r.getBoundingClientRect();
            if (b.top < 0 || b.bottom > innerHeight) continue;
            if (bb && b.bottom > bb.top) continue;
            for (const dy of [-8, 0, 8]){ const y=b.top + b.height/2 + dy;
              if (y <= b.top || y >= b.bottom) continue;
              if (y < 0 || y > innerHeight) continue;
              const el=document.elementFromPoint(b.left + 10, y);
              /* NOTHING THERE means the point is off the visible page - a clipped row, not a bad hit
                 target - so it is not counted either way. Something there that belongs to ANOTHER row
                 is the defect this line exists to catch, and it is counted as a miss by name. */
              if (!el) continue;
              tried++;
              if (el.closest('.li') === r) ok++;
              else miss.push([r.getAttribute('data-h'), dy, (el.closest('.li')||{getAttribute:()=>'(not a row)'}).getAttribute('data-h')]); } }
          return { ok:ok, tried:tried, miss:miss.slice(0,4) }; }"""


BEFORE_ROW = {390: 37.0, 1280: 30.0}          # measured on this fixture before HT-31 (measure_before.json)
FLOOR = {390: 32, 1280: 26}


async def sec_s3(pw):
    CUR[0] = 'S3'
    print("\n--- S3 . rows a tad thinner, and taps that land ---")
    tok = src(os.path.join(REPO, 'tokens.css'))
    chk('S3a . the height is ONE token per width, in tokens.css',
        '--row-h:' in tok and '--row-h-desk:' in tok and '--row-pad:' in tok)
    for w in (390, 1280):
        b, pg, errs = await open_page(pw, w, 900, flags=dict(SQL, **dict(PLACED, **TIMES)))
        m = await pg.evaluate("""() => { const r=[...document.querySelectorAll('#log .li')];
          const h=Math.round(r[0].getBoundingClientRect().height*10)/10;
          const font=getComputedStyle(r[0].querySelector('.nm')).fontSize;
          const clipped=r.some(x => { const n=x.querySelector('.nm'); return n && n.scrollHeight > n.clientHeight + 1; });
          return { h:h, font:font, clipped:clipped, n:r.length }; }""")
        was, floor = BEFORE_ROW[w], FLOOR[w]
        cut = round((1 - m['h'] / was) * 1000) / 10
        chk('S3b . %d . the row is %.1fpx, was %.1f (-%.1f%%), floor %d' % (w, m['h'], was, cut, floor),
            m['h'] >= floor and 9.0 <= cut <= 15.0, m)
        # the two sizes are HT-28's and HT-30's, measured before this wire and unchanged by it: the
        # height came out of padding and out of the control boxes, never out of the type.
        want = {390: '14px', 1280: '12.5px'}[w]
        chk('S3c . %d . the TEXT is still %s and no name is clipped' % (w, want),
            m['font'] == want and not m['clipped'], m)
        # synthetic taps at +-8px of each row's centre land on that row
        # ONLY WHAT IS ON SCREEN CAN BE TAPPED. `elementFromPoint` answers for the viewport, so a row
        # below the fold returns null and would read as a miss - which is a defect in the probe, not in
        # the rows. The rows that ARE on screen must all answer, and there must be enough of them for
        # the number to mean something.
        # THE PHONE'S BOTTOM BAR IS FIXED, so whatever is under it at this scroll position is under it -
        # that is what a fixed bar is, and the list scrolls out from beneath it. The protection that
        # matters is that the END of the list can be reached at all, which is the body's bottom padding,
        # and that is asserted separately below rather than confused with "did this tap land right".
        land = await pg.evaluate(TAPS)
        # AND AGAIN FURTHER DOWN THE LIST. A 390x844 phone shows three rows clear of the bottom bar at
        # the top of the page, which is too few for the number to mean much - so the page is scrolled
        # and the same points are taken again, twice. Every row a finger can reach gets asked.
        for top in (300, 700):
            await pg.evaluate("(t) => window.scrollTo(0, t)", top)
            await pg.wait_for_timeout(250)
            more = await pg.evaluate(TAPS)
            land['ok'] += more['ok']; land['tried'] += more['tried']; land['miss'] += more['miss']
        await pg.evaluate("() => window.scrollTo(0, 0)")
        chk('S3d . %d . synthetic taps at the row centre +-8px land on the right row (%d/%d)'
            % (w, land['ok'], land['tried']), land['tried'] >= 18 and land['ok'] == land['tried'],
            {k: land[k] for k in ('ok', 'tried', 'miss')})
        clear = await pg.evaluate("""() => { const bar=document.getElementById('h29Bar');
          if (!bar || bar.getBoundingClientRect().height === 0) return { bar:0, pad:null };
          const h=Math.round(bar.getBoundingClientRect().height);
          return { bar:h, pad: Math.round(parseFloat(getComputedStyle(document.body).paddingBottom)) }; }""")
        chk('S3e . %d . and the list can scroll clear of the fixed bar (%s)' % (w, clear),
            clear['bar'] == 0 or clear['pad'] >= clear['bar'], clear)
        chk('S3f . %d . zero page errors' % w, not errs, errs[:2])
        await b.close()


# =============================================================================================
# S4 . INSIGHTS
# =============================================================================================
FOUR = ['The month', 'The year', 'The life', 'The group, side by side']


async def sec_s4(pw):
    CUR[0] = 'S4'
    print("\n--- S4 . four on the phone, none on the desktop ---")
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __CIRCLE=True, **PLACED))
    await pg.click('#h29Bar [data-t29="insights"]')
    await pg.wait_for_timeout(1200)
    page = await pg.evaluate("""() => { const body=document.getElementById('h30InsBody');
      const cards=[...(body?body.children:[])].filter(n => n.offsetParent)
        .map(n => { const l=n.querySelector(':scope > .lab'); return l ? l.textContent.trim() : n.id; });
      const more=document.getElementById('h30InsMore');
      const w=[...new Set([...(body?body.children:[])].filter(n=>n.offsetParent)
        .map(n=>Math.round(n.getBoundingClientRect().width)))];
      return { cards:cards, more: !!(more && more.offsetParent), widths:w,
               sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth }; }""")
    chk('S4a . phone . exactly his four, in his order', page['cards'] == FOUR, page['cards'])
    chk('S4b . phone . and no More drawer under them', not page['more'], page)
    chk('S4c . phone . the four are one width - no ragged edges (R70.306)', len(page['widths']) == 1, page['widths'])
    chk('S4d . phone . no horizontal scroll at 390', page['sw'] <= page['cw'] + 1, page)
    chk('S4e . phone . the extras are HIDDEN, not deleted - every one is still in the DOM',
        await pg.evaluate("() => ['h30MonthC','h30MonthR','h30Trend','h30Rate']"
                          ".every(i => !!document.getElementById(i))"))
    chk('S4f . phone . zero page errors', not errs, errs[:2])
    await b.close()

    for w in (1280, 1920):
        b, pg, errs = await open_page(pw, w, 1000, flags=dict(SQL, __BIGSET=True, __CIRCLE=True, **PLACED))
        d = await pg.evaluate("""() => { const t=document.getElementById('vTabs');
          const vis=n => !!(n && n.offsetParent);
          const on = id => vis(document.getElementById(id));
          return { tabBar: vis(t), tabs:[...document.querySelectorAll('#vTabs [data-v]')].filter(vis).length,
                   strip: vis(document.querySelector('#tStrip .go')),
                   page: vis(document.getElementById('h30Ins')),
                   /* THE LIFE ON THE DESKTOP IS `#h16Ins` - HT-16's own panel, in the right-hand
                      column under GROUP. `#vLife` is HT-13's separate grid and is hidden here by
                      HT-15's allow-list, which is not the same thing as LIFE being missing. Reading
                      one for the other cost this wire a duplicate panel that only the screenshot
                      caught, so the element is named here with the reason beside it. */
                   month:on('h16Month'), year:on('h16Year'), life:on('h16Ins'), group:on('h18Group'),
                   lifePanels: [...document.querySelectorAll('h2')]
                     .filter(h => /^(the )?life$/i.test((h.textContent||'').trim()) && h.offsetParent).length }; }""")
        chk('S4g . %d . the Insights tab and its bar are gone' % w, not d['tabBar'] and d['tabs'] == 0, d)
        chk('S4h . %d . the "Insights >" header link is gone' % w, not d['strip'], d)
        chk('S4i . %d . and there is no Insights page to reach' % w, not d['page'], d)
        chk('S4j . %d . THE MONTH, THE YEAR, LIFE and GROUP are on the main view' % w,
            d['month'] and d['year'] and d['life'] and d['group'], d)
        chk('S4j . %d . and there is exactly ONE life panel, not two' % w, d['lifePanels'] == 1, d)
        await pg.evaluate("() => { location.hash = '#insights'; if(window.__HT30INS) window.__HT30INS.go('insights'); }")
        await pg.wait_for_timeout(700)
        chk('S4k . %d . a #insights link lands on Today, not on an empty page' % w,
            (await pg.evaluate("() => document.documentElement.getAttribute('data-vtab') || 'today'")) == 'today')
        chk('S4l . %d . zero page errors' % w, not errs, errs[:2])
        await b.close()


# =============================================================================================
# S5 . THE WHY, AND THE RATE ROW
# =============================================================================================
async def sec_s5(pw):
    CUR[0] = 'S5'
    print("\n--- S5 . the why is off the desktop, and the rate row fills its panel ---")
    for w in (1280, 1920):
        b, pg, errs = await open_page(pw, w, 1000, flags=dict(SQL, __BIGSET=True, **PLACED))
        m = await pg.evaluate("""() => { const vis=n => !!(n && n.offsetParent);
          const why=document.getElementById('iWhy'), rate=document.getElementById('rate');
          const btns=rate?[...rate.querySelectorAll('button[data-r]')]:[];
          const ten=btns.filter(x=>x.getAttribute('data-r')==='10')[0];
          const jr=document.getElementById('iDump');
          const btm=document.getElementById('h18Btm');
          const kids=btm?[...btm.children].filter(vis):[];
          const R=n=>Math.round(n.getBoundingClientRect().right*10)/10;
          const L=n=>Math.round(n.getBoundingClientRect().left*10)/10;
          return { whyVis:vis(why), whyEl:!!why, rating:vis(rate),
                   tenRight: ten?R(ten):null, jrRight: jr?R(jr):null, jrLeft: jr?L(jr):null,
                   btm: kids.map(n=>[L(n), R(n), Math.round(n.getBoundingClientRect().width)]) }; }""")
        chk('S5a . %d . the why box is off the layout' % w, not m['whyVis'], m)
        chk('S5b . %d . and the element is still there, with its column (R70.138)' % w, m['whyEl'], m)
        chk('S5c . %d . the 1-10 rating stays' % w, m['rating'], m)
        chk('S5d . %d . the right edge of `10` is the journal box\'s right edge (+-1px)' % w,
            m['tenRight'] is not None and m['jrRight'] is not None and abs(m['tenRight'] - m['jrRight']) <= 1,
            [m['tenRight'], m['jrRight']])
        chk('S5e . %d . COMPLETED and PRAYER are two EQUAL boxes on those same edges' % w,
            len(m['btm']) == 2 and abs(m['btm'][0][2] - m['btm'][1][2]) <= 1
            and abs(m['btm'][0][0] - m['jrLeft']) <= 1 and abs(m['btm'][1][1] - m['jrRight']) <= 1, m['btm'])
        chk('S5f . %d . zero page errors' % w, not errs, errs[:2])
        await b.close()


# =============================================================================================
# S6 . EVERY USER, AND ONE SQL ACT
# =============================================================================================
async def sec_s6(pw):
    CUR[0] = 'S6'
    print("\n--- S6 . every user gets the whole tracker ---")
    app = src(os.path.join(REPO, 'app.js'))
    chk('S6a . no hard-coded owner id or email gates anything in the client',
        not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", app)
        and not re.search(r"@[A-Za-z0-9.-]+\.(com|net|org)", app.replace('cory9oo.github.io', '')))
    pend = src(os.path.join(REPO, 'tools', 'sql', 'ht_pending.sql'))
    chk('S6b . one paste carries every pending migration, in order',
        '2026-09-15_ht29.sql' in pend and '2026-09-20_ht30.sql' in pend and '2026-09-22_ht31.sql' in pend)
    chk('S6c . and it refuses rather than half-applying when RLS is off',
        'row level security is OFF' in pend and 'raise exception' in pend)
    chk('S6d . a rollback sits beside it',
        'drop function if exists public.ht31_circle_peek' in src(os.path.join(REPO, 'tools', 'sql', 'ht_pending_rollback.sql')))
    import subprocess, time
    r = subprocess.run([sys.executable, os.path.join(REPO, 'tools', 'sql', 'build_pending.py'), '--check'],
                       capture_output=True, text=True)
    chk('S6e . and it is GENERATED, and committed in step with its parts (131 R1)', r.returncode == 0, r.stdout[-200:])

    # S6.20 . A BRAND-NEW ACCOUNT, TIMED. Not "is there an onboarding" but "how long until the first
    # check-off", measured on a phone profile with the clock running - which is the only form of that
    # question a person would recognise. Everything before the first tick is a cost they did not choose.
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __NO_HABITS=True))
    t0 = time.time()
    card = await pg.evaluate("""() => { const c=document.getElementById('h28First');
      return c ? { on:c.classList.contains('on'), lines:[...c.querySelectorAll('li,p,.fl')].length,
                   text:(c.innerText||'').slice(0, 400) } : null; }""")
    chk('S6f . a new account opens on the card, and it names the four sections',
        card and card['on'] and 'Morning routine' in card['text'] and 'Standards' in card['text'],
        card and card['text'][:140])
    chk('S6g . the starter list is EXAMPLES - not blank, and not anyone else\'s standards',
        card and 'Move for 20 minutes' in card['text'] and 'Read 10 pages' in card['text'], card and card['text'][:120])
    await pg.click('#h28Seed')
    await pg.wait_for_timeout(1500)
    await pg.click('#log .li .bxw')
    await pg.wait_for_timeout(800)
    secs = round(time.time() - t0, 1)
    ticked = await pg.evaluate("""() => [...document.querySelectorAll('#log .li')].filter(r => r.classList.contains('on')).length""")
    chk('S6h . and the first check-off is done in %ss - under sixty, on a phone, from a standing start' % secs,
        ticked >= 1 and secs < 60, {'ticked': ticked, 'seconds': secs})
    chk('S6i . zero page errors', not errs, errs[:2])
    await b.close()


# =============================================================================================
# S7 . INVITE
# =============================================================================================
async def sec_s7(pw):
    CUR[0] = 'S7'
    print("\n--- S7 . invite is one tap ---")
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __CIRCLE=True, **PLACED))
    code = await pg.evaluate("() => window.__HT31GRP.newCode()")
    chk('S7a . a join code is 26 characters of a 31-letter alphabet - 128.8 bits',
        len(code) == 26 and all(c in 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' for c in code), code)
    spread = await pg.evaluate("() => { const s=new Set(); for(let i=0;i<40;i++) s.add(window.__HT31GRP.newCode()); return s.size; }")
    chk('S7b . and forty of them are forty different codes', spread == 40, spread)
    link = await pg.evaluate("(c) => window.__HT31GRP.link(c)", code)
    chk('S7c . the link is the join deep link', '?join=' in link and code in link, link)
    routes = await pg.evaluate("""async () => {
      const out={}; const url=window.__HT31GRP.link('ABC');
      navigator.share = undefined;
      navigator.clipboard = { writeText: async () => { throw new Error('blocked'); } };
      out.r = await window.__HT31GRP.share('ABC', document.body);
      const f=document.getElementById('ht31link');
      out.field = !!f && f.value === url;
      return out; }""")
    chk('S7d . with no share sheet and a blocked clipboard the link appears in a field, selected',
        routes['r'] == 'field' and routes['field'], routes)
    chk('S7e . Invite is offered in the group block on the phone',
        await pg.evaluate("() => !!document.querySelector('[data-h29invite]') || !!window.__HT31GRP"))
    chk('S7f . zero page errors', not errs, errs[:2])
    await b.close()


# =============================================================================================
# S8 . THE VAULT
# =============================================================================================
async def sec_s8(pw):
    CUR[0] = 'S8'
    print("\n--- S8 . one format, two renderers ---")
    fmt = json.loads(src(os.path.join(REPO, 'shared', 'day_format.json')))
    app = src(os.path.join(REPO, 'app.js'))
    copier = src(os.path.join(CONTAINER, 'tools', 'copiers', '_ht.py'))
    chk('S8a . the format is declared once, with four sections and three fields',
        len(fmt['sections']) == 4 and len(fmt['fields']) == 3)
    labels = [x['label'] for x in fmt['sections']]
    chk('S8b . the app\'s section list is the declared one',
        all(("'%s'" % lab) in app or ('"%s"' % lab) in app for lab in labels), labels)
    chk('S8c . the copier\'s is too',
        all(('"%s"' % lab) in copier for lab in labels), labels)
    chk('S8d . both write the declared markers', fmt['markers']['start'] in app and fmt['markers']['start'] in copier)
    chk('S8e . the reader accepts the other spelling too, so 143 S8.26 is not a trap',
        fmt['markers']['also_read'][0] in copier)
    # the separator is a CHARACTER, so it is looked for as one - `\u202f` in a source file is an escape
    # in one language and six letters in the other, and grepping for the escape found neither.
    nb = fmt['time']['separator']
    chk('S8f . the copier renders the declared time form, with the same narrow no-break space',
        'def fmt_time' in copier and (nb in copier or 'u202f' in copier) and ('u202f' in app or nb in app),
        [nb in copier, 'u202f' in copier, 'u202f' in app])
    chk('S8g . Cory\'s own zone is created once and never written to again',
        'DUMP = "## Dump"' in copier and 'ADOPT, NEVER CLOBBER' in copier)
    chk('S8h . the write-back keeps both when both changed', 'def merge_both' in copier and 'CONFLICT' in copier)
    chk('S8i . and a doubled marker zone refuses that date', 'doubled markers' in copier)
    chk('S8j . check-offs stay one way, app -> vault, behind a named flag',
        fmt['writeback']['flag'].startswith('HT31_VAULT_CHECKOFF_WRITEBACK'))
    chk('S8k . the 15-minute run is BUILT and nothing is registered (R70.344: no "arm")',
        'EVERY_15' in src(os.path.join(CONTAINER, 'tools', 'copiers', 'ht_journal.py')))


SECTIONS = {'S0': sec_s0, 'S1': sec_s1, 'S2': sec_s2, 'S3': sec_s3, 'S4': sec_s4,
            'S5': sec_s5, 'S6': sec_s6, 'S7': sec_s7, 'S8': sec_s8}


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
    print("\nGOLDEN HT-31: %d/%d PASS, %d FAIL, %d assertions"
          % (len(RES) - len(bad), len(RES), len(bad) + len(empty), len(RES)))
    for s in want:
        print("   %s %d" % (s, SEC_COUNT.get(s, 0)))
    return 1 if (bad or empty) else 0


sys.exit(asyncio.run(main()))
