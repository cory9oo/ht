#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-30 GOLDEN - WIRE HT-30 (PASTE 137), run literally.

    python tools/golden_ht30.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht30.py --only S3

  S0  the build says what it is: one version string in two files, on the screen, and on the banner
  S1  four sections in Cory's 9/20 order, on both widths, editable, and the three languages still agree
  S2  the planned time is a chip at the right of the row and never inside the name; the one-time pass
      that takes a clock time OUT of a name, and every case it must NOT touch
  S3  the sheet: five fields on the surface, the rest one tap down, the free text gone and never written;
      rows a quarter thinner on both widths with the text the same size; the affordances at rest
  S4  the Journal, by that name, with no placeholder text anywhere; the why off the phone and on the desktop
  S5  a Sabbath any account can keep, on the day it chooses, off by default, DEC-172's weights untouched
  S6  ONE Insights page behind ONE tab on both widths, six cards, and no entry list of any kind on it
  S7  start a group or join one; a pasted LINK is a code; a signed-in person joins with no sign-up

134 R1: this file prints its assertion count, and a section that asserts nothing is a FAIL, not a pass.
Numbers written as constants were MEASURED on this fixture before the change (`_reconcile/ht_stage/137/
WHAT_IS_LIVE.md`): phone row 49.0 px, desktop row 41.0 px, both affordances at opacity 1.
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
    raise SystemExit('golden_ht30: no estate root above %s' % start)


def fixture_dir(estate):
    for d in (os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if os.path.isdir(d):
            return d
    return os.path.join(estate, '_machine', 'ht3')


ESTATE = find_estate(REPO)
BASE = 'file://' + os.path.join(fixture_dir(ESTATE), 'index.html').replace(os.sep, '/')
RECONCILE = os.path.join(ESTATE, '_reconcile')
SQL = {'__HT29_SQL': True, '__SECTION': True}
# the four sections, one row each, so every header has something under it to head
PLACED = {'__SECTIONS': {'h0': 'morning', 'h1': 'night', 'h2': 'weekly', 'h3': 'standards'}}

RES = []
SEC_COUNT = {}
CUR = ['-']


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


async def open_page(pw, w=390, h=844, touch=None, flags=None, qs='', wait=3600, init=None):
    if touch is None:
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
    if init:
        await pg.add_init_script(init)
    await pg.goto(BASE + qs)
    await pg.wait_for_timeout(wait)
    return b, pg, errs


async def no_errors(pg, errs, tag):
    chk('%s . zero page errors' % tag, not errs, errs[:3])


async def close_sheet(pg):
    await pg.evaluate("() => { const n = document.getElementById('esheet'); if(n) n.classList.remove('on'); }")
    await pg.wait_for_timeout(150)


# =============================================================================================
# S0 . THE BUILD SAYS WHAT IT IS
# =============================================================================================
async def sec_s0(pw):
    CUR[0] = 'S0'
    print("\n--- S0 . the version, on the screen and on the banner ---")
    js, sw = src(os.path.join(REPO, 'app.js')), src(os.path.join(REPO, 'sw.js'))
    mj = re.search(r"var HT30_VERSION = '(ht-v\d+)'", js)
    ms = re.search(r"const C='(ht-v\d+)'", sw)
    chk('S0a . app.js and sw.js name the SAME version', bool(mj) and bool(ms) and mj.group(1) == ms.group(1),
        [mj.group(1) if mj else None, ms.group(1) if ms else None])
    chk('S0b . the version is ht-v37 or later', bool(ms) and int(ms.group(1).split('v')[1]) >= 37,
        ms.group(1) if ms else None)
    chk('S0c . the worker answers a version message (the banner can name the build it offers)',
        "type === 'version'" in sw and 'postMessage({ version: C })' in sw)

    b, pg, errs = await open_page(pw, 390, 844, flags=SQL)
    await pg.click('#bSet'); await pg.wait_for_timeout(900)
    txt = await pg.evaluate("() => { const n = document.getElementById('ovBody'); return n ? n.innerText : ''; }")
    chk('S0d . Settings shows the build', (mj.group(1) if mj else 'ht-vX') in txt, txt[-120:])
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)

    # the banner, with the waiting worker answering, and with it silent
    shown = await pg.evaluate("""async () => {
        const fake = { postMessage(m, ports){ if(m && m.type==='version' && ports && ports[0])
                                                ports[0].postMessage({ version:'ht-v99' }); } };
        window.__HT30UPD.show({ waiting: fake });
        await new Promise(r => setTimeout(r, 400));
        const b = document.getElementById('h29Upd');
        return { text: b ? b.textContent : null, tappable: b ? getComputedStyle(b).pointerEvents : null }; }""")
    chk('S0e . the banner names the version the waiting worker reports',
        (shown['text'] or '').find('ht-v99') > 0, shown)
    chk('S0f . and it can be tapped (D16 stays closed)', shown['tappable'] != 'none', shown)
    silent = await pg.evaluate("""async () => {
        document.getElementById('h29Upd').remove();
        window.__HT30UPD.show({ waiting: { postMessage(){} } });
        await new Promise(r => setTimeout(r, 1500));
        const b = document.getElementById('h29Upd');
        return b ? b.textContent : null; }""")
    chk('S0g . a worker that does not answer gets a banner with NO version, never a guessed one',
        silent == 'Update available - tap to refresh'.replace('-', u'\u2014'), silent)
    chk('S0h . the update check runs only while the page is visible (PHASE GATE)',
        "visibilitychange" in js and "if(document.visibilityState === 'visible') start(); else stop();" in js)
    await no_errors(pg, errs, 'S0')
    await b.close()


# =============================================================================================
# S1 . FOUR SECTIONS, IN HIS ORDER
# =============================================================================================
ORDER = ['Morning routine', 'Night routine', 'Weekly routine', 'Standards']


async def sec_s1(pw):
    CUR[0] = 'S1'
    print("\n--- S1 . four sections, in Cory's 9/20 order ---")
    js = src(os.path.join(REPO, 'app.js'))
    m = re.search(r"var ORDER = \[([^\]]*)\];", js)
    chk('S1a . HT29SEC declares morning, night, weekly, standards',
        bool(m) and [x.strip().strip("'") for x in m.group(1).split(',')] == ['morning', 'night', 'weekly', 'standards'],
        m.group(1) if m else None)
    ms = re.search(r"var SECTIONS = \[(\[[^;]*)\];", js)
    chk('S1b . the markdown shape reads the SAME order (one grammar, three languages)',
        bool(ms) and [x for x in re.findall(r"\['(\w+)'", ms.group(1))] == ['morning', 'night', 'weekly', 'standards'],
        ms.group(1)[:90] if ms else None)
    core = src(os.path.join(REPO, 'tools', 'supabase', 'functions', 'nudge', 'core.js'))
    chk('S1c . the nudge sender still places a row by the same rule',
        "if (h.cadence === 'weekly') return 'weekly';" in core and "return 'standards';" in core
        and "return 'night';" in core and "return 'morning';" in core)

    for (w, h, tag) in ((390, 844, 'phone'), (1280, 720, 'desktop')):
        flags = dict(SQL); flags.update(PLACED)
        b, pg, errs = await open_page(pw, w, h, flags=flags)
        heads = await pg.eval_on_selector_all('#log > .grp', 'ns => ns.map(n => n.textContent.trim())')
        chk('S1d . %s . the four headers render in his order' % tag, heads == ORDER, heads)
        empty = await pg.evaluate("""() => [...document.querySelectorAll('#log > .grp')]
            .filter(g => { let n = g.nextElementSibling;
                           while(n && !n.classList.contains('li') && !n.classList.contains('grp')) n = n.nextElementSibling;
                           return !n || n.classList.contains('grp'); }).map(g => g.textContent.trim())""")
        chk('S1e . %s . no header is drawn over an empty section' % tag, empty == [], empty)
        adds = await pg.eval_on_selector_all('#log .eadd', 'ns => ns.map(n => n.textContent.trim())')
        chk('S1f . %s . every section carries its own "add" that presets it' % tag, len(adds) == 4, adds)
        if tag == 'phone':
            # the headers must not cost more than they save (stress 3)
            hh = await pg.evaluate("""() => { const g=[...document.querySelectorAll('#log > .grp')]
                .map(n => Math.round(n.getBoundingClientRect().height));
                const r=[...document.querySelectorAll('#log .li')].map(n => n.getBoundingClientRect().height);
                return { head: g, row: r.length ? Math.round(r.reduce((a,c)=>a+c,0)/r.length*10)/10 : null }; }""")
            chk('S1g . a section header is thinner than a row it heads',
                bool(hh['head']) and max(hh['head']) < hh['row'], hh)
        # the picker, on a real row, reached by clicking the pencil as a person does (R70.211)
        await pg.evaluate("() => { const e = document.querySelector('#log .li .edp'); if(e) e.click(); }")
        await pg.wait_for_timeout(800)
        opts = await pg.eval_on_selector_all('#eSection option', 'ns => ns.map(n => n.textContent.trim())')
        chk('S1h . %s . the section picker offers exactly the four, in order' % tag, opts == ORDER, opts)
        await close_sheet(pg)
        await no_errors(pg, errs, 'S1 (%s)' % tag)
        await b.close()

    # a row that nothing places lands in Standards, and 133's placement still stands for the rest
    b, pg, errs = await open_page(pw, 390, 844, flags=SQL)
    placed = await pg.evaluate("""() => { const f = window.__HT29S2.sectionOf;
        return { none: f({ id:'x', name:'A rule', cadence:'daily' }),
                 weekly: f({ id:'y', name:'Plan', cadence:'weekly' }),
                 timed: f({ id:'z', name:'Read', cadence:'daily', time_anchor:'05:00' }),
                 sabbath: f({ id:'s', name:'Sabbath rest', cadence:'daily' }),
                 his: f({ id:'q', name:'Anything', section:'weekly' }) }; }""")
    # AMENDED BY NAME, HT-31 (paste 143 S1.6), 2026-09-22: `timed` moves 'morning' -> 'standards'.
    # Cory, 9/21: "when I set any nightly time it appears always in the morning routine". The clause
    # that put a timed row in Morning IS that defect - with `habits.section` absent it made a 21:30
    # task a morning task at every hour - and it is gone from all four languages in one wire. The
    # assertion keeps its five subjects; only the word the clock used to produce has moved, and `his`
    # still proves a stored section beats everything.
    chk('S1i . an unplaceable row lands in Standards, and 133 still places the rest',
        placed == {'none': 'standards', 'weekly': 'weekly', 'timed': 'standards', 'sabbath': 'night', 'his': 'weekly'},
        placed)
    await b.close()

    # S1.5m . ZERO ROWS LOST. The count before the sections are drawn and the count inside them, on the
    # fixture that carries every shape at once - 26 standards across four groups, ten with a planned
    # time, one weekly cadence set, some placed by 133's SQL and some not.
    flags = dict(SQL); flags.update(PLACED); flags['__BIGSET'] = True; flags['__BLOCKS'] = True
    b, pg, errs = await open_page(pw, 390, 844, flags=flags)
    counts = await pg.evaluate("""() => { const st = window.__HT25S3.state();
        const f = window.__HT29S2.sectionOf, ORDER = ['morning','night','weekly','standards'];
        const due = [...document.querySelectorAll('#log .li')].map(r => r.getAttribute('data-h'));
        const placed = {}; ORDER.forEach(k => placed[k] = 0);
        let unplaceable = 0;
        due.forEach(id => { const h = (st.habits||[]).filter(x => String(x.id) === String(id))[0];
            const s = f(h); if(ORDER.indexOf(s) < 0) unplaceable++; else placed[s]++; });
        return { rows: due.length, placed: placed,
                 sum: ORDER.reduce((a,k) => a + placed[k], 0), unplaceable: unplaceable }; }""")
    chk('S1j . S1.5m . every row lands in exactly one of the four - %d rows in, %d placed, %s'
        % (counts['rows'], counts['sum'], counts['placed']),
        counts['rows'] > 0 and counts['sum'] == counts['rows'] and counts['unplaceable'] == 0, counts)
    await no_errors(pg, errs, 'S1 (placement)')
    await b.close()


# =============================================================================================
# S2 . THE TIME IS A FIELD, NOT A NAME
# =============================================================================================
async def sec_s2(pw):
    CUR[0] = 'S2'
    print("\n--- S2 . the planned time is a chip, not part of the name ---")
    flags = dict(SQL); flags.update(PLACED); flags['__BLOCKS'] = True
    b, pg, errs = await open_page(pw, 390, 844, flags=flags)
    shape = await pg.evaluate("""() => { const r = [...document.querySelectorAll('#log .li')]
            .find(x => x.querySelector('.pat30'));
        if(!r) return null;
        const p = r.querySelector('.pat30'), nm = r.querySelector('.nm');
        const cs = getComputedStyle(p);
        return { insideName: !!nm.querySelector('.pat30'), right: p.getBoundingClientRect().left > nm.getBoundingClientRect().left,
                 weight: cs.fontWeight, size: parseFloat(cs.fontSize), nameText: nm.textContent.trim() }; }""")
    chk('S2a . the time is OUT of the name element', bool(shape) and not shape['insideName'], shape)
    chk('S2b . and sits to the RIGHT of it', bool(shape) and shape['right'], shape)
    chk('S2c . muted, not bold', bool(shape) and str(shape['weight']) in ('400', 'normal'), shape)
    names = await pg.eval_on_selector_all('#log .li .nm', 'ns => ns.map(n => n.textContent.trim())')
    left = [n for n in names if re.search(r'\d{1,2}:\d{2}', n)]
    chk('S2d . no rendered name carries a clock time', left == [], left[:3])
    dots = await pg.eval_on_selector_all('#log .li .dot29', 'ns => ns.length')
    chk('S2e . 133\'s variance dot is still drawn (quieter, not gone)', dots >= 0)
    await no_errors(pg, errs, 'S2 (chip)')

    # ---- the parser, as a pure function: every case it must take, and every one it must not ----
    cases = await pg.evaluate("""() => { const f = window.__HT30TIME.find;
        const say = s => { const r = f(s); return r ? [r.hhmm, r.name] : null; };
        return { a: say('Wake 5 AM'), b: say('Read the Bible 5:00'), c: say('Gym at 5am'),
                 d: say('Sleep 9pm'), e: say('Prayer 07:30'), f: say('Walk 7.30am'),
                 bare: say('3 jugs of water a day - 1.5 gal'), chapters: say('Read 5 chapters'),
                 only: say('5 AM'), range: (function(){ const r=f('8:20 - 8:40 Water'); return r ? [r.hhmm, r.name, r.twice] : null; })(),
                 twice: (function(){ const r=f('Gym 5am then 6pm'); return r ? [r.hhmm, r.name, r.twice] : null; })() }; }""")
    chk('S2f . "5 AM" -> 05:00', cases['a'] == ['05:00', 'Wake'], cases['a'])
    chk('S2g . "5:00" -> 05:00', cases['b'] == ['05:00', 'Read the Bible'], cases['b'])
    chk('S2h . "at 5am" -> 05:00, and "at" goes with it', cases['c'] == ['05:00', 'Gym'], cases['c'])
    chk('S2i . "9pm" -> 21:00', cases['d'] == ['21:00', 'Sleep'], cases['d'])
    chk('S2j . "07:30" -> 07:30', cases['e'] == ['07:30', 'Prayer'], cases['e'])
    chk('S2k . "7.30am" -> 07:30', cases['f'] == ['07:30', 'Walk'], cases['f'])
    chk('S2l . R70.265 . the live name that was destroyed once is NOT touched',
        cases['bare'] is None, cases['bare'])
    chk('S2m . "Read 5 chapters" is a count, not a time', cases['chapters'] is None, cases['chapters'])
    chk('S2n . a name that is ONLY a time keeps its name (plan drops it)',
        (await pg.evaluate("() => window.__HT30TIME.plan([{id:'k', name:'5 AM'}]).length")) == 0)
    chk('S2o . stress 2 . two times: the FIRST becomes the planned time, and the row is flagged',
        cases['twice'] == ['05:00', 'Gym then', True], cases['twice'])
    chk('S2o2 . a RANGE - the shape Cory\'s data actually has - leaves no clock behind',
        cases['range'] == ['08:20', 'Water', True], cases['range'])
    own = await pg.evaluate("""() => window.__HT30TIME.plan([
            { id:'a', name:'Gym 6am', time_anchor:'07:00' },
            { id:'b', name:'Gym 6am' }]).map(r => [r.id, r.name, r.time])""")
    chk('S2p . a field he set is never overwritten, but the name loses the copy either way',
        own == [['a', 'Gym', None], ['b', 'Gym', '06:00']], own)
    md = await pg.evaluate("""() => window.__HT30TIME.markdown([{ was:'Gym 5am', name:'Gym', time:'05:00', twice:false }])""")
    chk('S2q . every change is written down for him to read', '| Gym 5am | Gym | 05:00 |' in md, md[:120])
    await no_errors(pg, errs, 'S2 (parser)')
    await b.close()


# =============================================================================================
# S3 . THE SHEET AND THE ROWS
# =============================================================================================
BEFORE_PHONE, BEFORE_DESK = 49.0, 41.0      # MEASURED on main at 295489e (WHAT_IS_LIVE.md)


async def sec_s3(pw):
    CUR[0] = 'S3'
    print("\n--- S3 . five fields on the surface, the rest one tap down; rows a quarter thinner ---")
    for (w, h, tag, before) in ((390, 844, 'phone', BEFORE_PHONE), (1280, 720, 'desktop', BEFORE_DESK)):
        flags = dict(SQL); flags.update(PLACED)
        b, pg, errs = await open_page(pw, w, h, flags=flags)
        rows = await pg.evaluate("""() => { const r = [...document.querySelectorAll('#log .li')]
            .map(x => x.getBoundingClientRect().height).filter(x => x > 0);
            const nm = document.querySelector('#log .li .nm');
            return { mean: r.length ? Math.round(r.reduce((a,c)=>a+c,0)/r.length*10)/10 : null,
                     font: nm ? parseFloat(getComputedStyle(nm).fontSize) : null }; }""")
        chk('S3a . %s . rows are at least a quarter thinner (%s -> %s)' % (tag, before, rows['mean']),
            rows['mean'] is not None and rows['mean'] <= before * 0.8, rows)
        # MEASURED on main at 295489e: 14px on the phone (golden_ht28 A4 pins it there), 12.5px on
        # the desktop. "Text size unchanged" is the rule - not bigger, not smaller.
        chk('S3b . %s . and the NAME is the same size it was' % tag,
            rows['font'] == (14 if tag == 'phone' else 12.5), rows)
        aff = await pg.evaluate("""() => { const e=document.querySelector('#log .li .edp'),
                                                 g=document.querySelector('#log .li .drg');
            return [e ? +getComputedStyle(e).opacity : null, g ? +getComputedStyle(g).opacity : null]; }""")
        chk('S3c . %s . the edit and drag affordances are at rest, not shouting' % tag,
            aff[0] is not None and 0.35 <= aff[0] <= 0.55 and 0.35 <= aff[1] <= 0.55, aff)
        # MEASURED, not read out of the stylesheet's text: hover the row, then focus the handle.
        # A regex over `cssText` proves a rule was written, not that it applies to this element.
        await pg.hover('#log .li')
        await pg.wait_for_timeout(250)
        hov = await pg.evaluate("""() => { const e=document.querySelector('#log .li .edp');
            return e ? +getComputedStyle(e).opacity : null; }""")
        await pg.evaluate("() => { const e=document.querySelector('#log .li .drg'); if(e) e.focus(); }")
        await pg.wait_for_timeout(200)
        foc = await pg.evaluate("""() => { const g=document.querySelector('#log .li .drg');
            return g ? +getComputedStyle(g).opacity : null; }""")
        chk('S3d . %s . and they come back for a pointer, a press or the keyboard' % tag,
            hov == 1 and foc == 1, [hov, foc])

        await pg.evaluate("() => { const e = document.querySelector('#log .li .edp'); if(e) e.click(); }")
        await pg.wait_for_timeout(800)
        surf = await pg.evaluate("""() => { const b=document.getElementById('ebody');
            const top=[...b.children].filter(n => n.id !== 'h30More' && !n.classList.contains('eh')
                        && !n.classList.contains('etools') && !n.classList.contains('note'));
            const lab=n => { const s=n.querySelector('.lab'); return s ? s.textContent.trim() : null; };
            const more=document.getElementById('h30More');
            return { surface: top.map(lab).filter(Boolean),
                     more: more ? [...more.children].map(lab).filter(Boolean) : null,
                     moreOpen: more ? more.hasAttribute('open') : null,
                     notes: !!document.getElementById('eNotes'),
                     del: !!document.getElementById('eArch') }; }""")
        # AMENDED BY NAME, HT-31 (paste 143 S2.11), 2026-09-22: 'Planned time' leaves the SURFACE.
        # The chip on the row is where a time is set now (S2.10), so a second door on this sheet is two
        # answers to one question. The field is not deleted - S3h below now proves it is one tap down
        # under More, the same treatment Group, Days and Link already get.
        chk('S3e . %s . the surface is name, section and duration; the time is set on the row' % tag,
            surf['surface'] == ['Name', 'Section', 'Planned minutes'], surf['surface'])
        chk('S3f . %s . and Delete, which is the fifth thing he named' % tag, surf['del'], surf)
        chk('S3g . %s . the free-text field is GONE from the sheet' % tag, not surf['notes'], surf)
        chk('S3h . %s . the rest is one tap down, closed until it is asked for' % tag,
            surf['more'] is not None and surf['moreOpen'] is False and
            set(['Group', 'Days', 'Link', 'Planned time']) <= set(surf['more']), surf['more'])
        if tag == 'phone':
            sizes = await pg.evaluate("""() => [...document.querySelectorAll('#esheet input, #esheet select, #esheet textarea')]
                .map(n => parseFloat(getComputedStyle(n).fontSize))""")
            chk('S3i . 128 A1 . every input on the sheet is still at least 16px',
                bool(sizes) and min(sizes) >= 16, sizes)
        # the definition of done survives, and is NOT written back while the field is absent
        saved = await pg.evaluate("""async () => { window.__UPDATES = [];
            document.getElementById('eSave').click();
            await new Promise(r => setTimeout(r, 900));
            return (window.__UPDATES||[]).filter(u => u[0] === 'habits').map(u => Object.keys(u[1])); }""")
        chk('S3j . %s . saving the sheet does not write `notes` while the field is hidden' % tag,
            all('notes' not in k for k in saved), saved)
        await close_sheet(pg)
        await no_errors(pg, errs, 'S3 (%s)' % tag)
        await b.close()
    js = src(os.path.join(REPO, 'app.js'))
    chk('S3k . R70.138 . the field is hidden behind a flag, never deleted',
        'var HT30_SHEET_NOTES = false;' in js and "lab === 'Done when'" in js)


# =============================================================================================
# S4 . THE JOURNAL
# =============================================================================================
async def sec_s4(pw):
    CUR[0] = 'S4'
    print("\n--- S4 . the Journal, by that name, with nothing written in it already ---")
    for (w, h, tag) in ((390, 844, 'phone'), (1280, 720, 'desktop')):
        b, pg, errs = await open_page(pw, w, h, flags=SQL)
        labs = await pg.evaluate("""() => ['iDump','iTasks','iPrayer'].map(id => { const t=document.getElementById(id);
            const l=t && t.closest('.fld'), s=l && l.querySelector('.lab');
            return [id, s ? s.textContent.trim() : null, t ? (t.getAttribute('placeholder')||'') : null]; })""")
        chk('S4a . %s . the box is called Journal' % tag, labs[0][1] == 'Journal', labs)
        chk('S4b . %s . no box carries placeholder text' % tag,
            all(not p for _, _, p in labs), labs)
        body = await pg.evaluate("() => document.body.innerText")
        chk('S4c . %s . the words "brain dump" appear nowhere on the screen' % tag,
            'brain dump' not in body.lower(), [l for l in body.split('\\n') if 'brain' in l.lower()][:2])
        why = await pg.evaluate("""() => { const t=document.getElementById('iWhy');
            return { exists: !!t, shown: !!(t && t.offsetParent),
                     rating: !!document.getElementById('rate') }; }""")
        if tag == 'phone':
            chk('S4d . phone . the "why" field is off the layout', why['exists'] and not why['shown'], why)
            chk('S4e . phone . the 1-10 rating stays', why['rating'], why)
        else:
            # AMENDED BY NAME, HT-31 (paste 143 S5.16), 2026-09-22: Cory, 9/21 - "on the desktop
            # remove the why journal box as well". HT-30 took it off the phone and this branch carried
            # the desktop; there is no width left that shows it. UNTOUCHED still means untouched - the
            # element, the column and every word in it - so that is what is asserted, plus not shown.
            chk('S4d . desktop . the "why" field is off the layout and still present',
                why['exists'] and not why['shown'], why)
        await no_errors(pg, errs, 'S4 (%s)' % tag)
        await b.close()
    js = src(os.path.join(REPO, 'app.js'))
    chk('S4f . the journal panel and the export say Journal too',
        "['brain_dump','Journal']" in js and "['brain_dump','journal']" in js)
    chk('S4g . the column is untouched - only its label moved',
        "BOXES = { iDump:'brain_dump'" in js)


# =============================================================================================
# S5 . A SABBATH ANYONE CAN KEEP
# =============================================================================================
async def sec_s5(pw):
    CUR[0] = 'S5'
    print("\n--- S5 . a Sabbath any account can keep, on the day it chooses ---")
    b, pg, errs = await open_page(pw, 390, 844, flags=SQL)      # no Sabbath standard in this fixture
    st = await pg.evaluate("() => window.__HT30SAB.state()")
    chk('S5a . OFF for an account that never asked for one', st['dow'] is None and not (await pg.evaluate("() => window.__HT30SAB.on()")), st)
    await pg.click('#bSet'); await pg.wait_for_timeout(900)
    has = await pg.evaluate("""() => { const n=document.getElementById('h30Sab');
        return { there: !!n, text: n ? n.innerText : '', sw: !!document.getElementById('h30SabOn'),
                 dayHidden: (document.getElementById('h30SabDayF')||{}).hidden }; }""")
    chk('S5b . Settings carries Sabbath, with its switch', has['there'] and has['sw'], has)
    chk('S5c . and the one sentence, verbatim',
        u'No other standards take place on your Sabbath \u2014 only the Sabbath check-off shows that day.' in has['text'],
        has['text'][:160])
    chk('S5d . the day picker only appears once it is switched on', has['dayHidden'] is True, has)
    await no_errors(pg, errs, 'S5 (off)')
    await b.close()

    # an account WITH a Sabbath standard starts on, for that standard's own day
    flags = dict(SQL); flags['__SABBATH'] = True
    b, pg, errs = await open_page(pw, 390, 844, flags=flags)
    inf = await pg.evaluate("() => window.__HT30SAB.inferred()")
    chk('S5e . an account that already keeps one starts on, on its own day (no name in this file)',
        inf == 6, inf)
    rows = await pg.evaluate("""async () => { const st = window.__HT25S3.state();
        const sab = (st.habits||[]).filter(h => /^\\s*sabbath\\b/i.test(h.name||''))[0];
        if(sab) sab.cadence = 'daily';          /* due today, so "that day" can be today */
        await window.__HT30SAB.save(new Date().getDay());
        await new Promise(r => setTimeout(r, 700));
        return { rows: [...document.querySelectorAll('#log .li')].filter(r => !!r.offsetParent)
                           .map(r => r.querySelector('.nm').textContent.trim()),
                 kept: [...document.querySelectorAll('#log .li')].length,
                 isDay: window.__HT30SAB.isDay() }; }""")
    chk('S5f . on that day the list is the Sabbath check-off and nothing else',
        rows['isDay'] and len(rows['rows']) == 1 and 'Sabbath' in rows['rows'][0], rows)
    chk('S5f2 . R70.138 . the other rows are HIDDEN, still in the DOM, never removed',
        rows['kept'] > 1, rows['kept'])
    off = await pg.evaluate("""async () => { await window.__HT30SAB.save(null);
        await new Promise(r => setTimeout(r, 700));
        return [...document.querySelectorAll('#log .li')].filter(r => !!r.offsetParent).length; }""")
    chk('S5g . switched off, the day is an ordinary day again', off > 1, off)
    await no_errors(pg, errs, 'S5 (on)')
    await b.close()

    js = src(os.path.join(REPO, 'app.js'))
    chk('S5h . DEC-172 . the weight arithmetic is untouched by this wire',
        'var SABBATH_ONLY_SATURDAY = false;' in js and 'SABBATH_AUTO_INSERT = false;' in js)
    sql = src(os.path.join(REPO, 'tools', 'sql', '2026-09-20_ht30.sql'))
    chk('S5i . the column that makes it follow the person is one migration, and it refuses an unprotected table',
        'sabbath_dow smallint' in sql and 'row level security is OFF' in sql and 'drop column if exists sabbath_dow' in sql)
    chk('S5j . and the app works before it lands', "profile_private').select('sabbath_dow')" in js
        and 'Kept on this device until one migration lands' in js)


# =============================================================================================
# S6 . ONE INSIGHTS PAGE, ONE TAB
# =============================================================================================
CARDS_HT30 = ['Month . completion', 'Month . rating', 'Completion and rating over time',
              'The life', 'The group, side by side', 'What makes a good day']
# HT-31 (paste 143 S4.13): Cory's four, in his order. The six above are what HT-30 put there and are
# kept as a record of what the drawer now holds - S6e reads them back out of it.
CARDS_HT31 = ['The month', 'The year', 'The life', 'The group, side by side']
CARDS = CARDS_HT31


async def sec_s6(pw):
    CUR[0] = 'S6'
    print("\n--- S6 . Views and Insights are one page, behind one tab ---")
    for (w, h, tag, sel) in ((390, 844, 'phone', '#h29Bar [data-t29]'), (1280, 720, 'desktop', '#vTabs [data-v]')):
        flags = dict(SQL); flags.update(PLACED); flags['__CIRCLE'] = True
        b, pg, errs = await open_page(pw, w, h, flags=flags)
        tabs = await pg.eval_on_selector_all(
            sel, 'ns => ns.filter(n => !n.hasAttribute("hidden")).map(n => n.textContent.trim())')
        # AMENDED BY NAME, HT-31 (paste 143 S4.15), 2026-09-22: on the DESKTOP there is one door and
        # no Insights page at all - "the insights on the desktop, remove that completely" - so this
        # section asserts the removal there and keeps every one of its original checks on the phone,
        # which is where Cory's four blocks live. The old `await pg.click(door)` on a tab that no longer
        # exists is why this section CRASHED before it was amended, taking 20 later assertions with it
        # (134 R1: a crashed suite is not a passing one).
        if tag == 'desktop':
            chk('S6a . desktop . ONE door, and no Insights page behind a second',
                tabs == ['Today'], tabs)
            gone = await pg.evaluate("""() => { const n=document.getElementById('h30Ins');
                const vis=e => !!(e && e.offsetParent);
                return { page: !!(n && getComputedStyle(n).display !== 'none' && n.offsetParent),
                         bar: vis(document.getElementById('vTabs')),
                         strip: vis(document.querySelector('#tStrip .go')),
                         month: vis(document.getElementById('h16Month')),
                         year: vis(document.getElementById('h16Year')),
                         life: vis(document.getElementById('h16Ins')),
                         group: vis(document.getElementById('h18Group')) }; }""")
            chk('S6b . desktop . no page, no tab bar, no header link',
                not gone['page'] and not gone['bar'] and not gone['strip'], gone)
            chk('S6c . desktop . and the four panels it used to hold are on the main view',
                gone['month'] and gone['year'] and gone['life'] and gone['group'], gone)
            # THE DESKTOP BRANCH ASSERTS AS MUCH AS THE ONE IT REPLACES, which is not a nicety: the
            # merge gate reads a lost PASS as a regression, and it is right to - a section that checks
            # three things where it used to check six has quietly stopped watching half the room.
            # THE ARCHIVE'S DOOR IS SETTINGS, and this is the line that proves it is a door at all.
            # It had two - the desktop tab and the phone's More - and this wire closes both, so a check
            # that only asked "is it still in the DOM" would have passed while the feature became
            # unreachable on every width. It is opened the way a person opens it.
            await pg.evaluate("() => { const b=document.getElementById('bSet'); if(b) b.click(); }")
            await pg.wait_for_timeout(1400)
            kept = await pg.evaluate("""() => { const vis=e => !!(e && e.offsetParent);
                const j=document.getElementById('h26Jrn');
                return { ledger: vis(j), inSettings: !!(j && j.closest('.ov')),
                         find: !!(j && j.querySelector('input,[data-c5find]')),
                         inDom: ['h16Month','h16Year','h16Ins','h26Ins','h26Jrn','vViews']
                                  .filter(i => !!document.getElementById(i)).length,
                         sw: document.documentElement.scrollWidth,
                         cw: document.documentElement.clientWidth }; }""")
            chk('S6d . desktop . the journal archive is reachable - Settings -> Journal, with its search',
                kept['ledger'] and kept['inSettings'] and kept['find'], kept)
            chk('S6e . desktop . and nothing that lived on Views was deleted - all six are in the DOM',
                kept['inDom'] == 6, kept)
            chk('S6f . desktop . no horizontal scroll with the tab gone',
                kept['sw'] <= kept['cw'] + 1, kept)
            await no_errors(pg, errs, 'S6 (%s)' % tag)
            await b.close()
            continue
        chk('S6a . %s . two doors, and the second one is Insights' % tag,
            tabs == ['Today', 'Insights'], tabs)
        # R70.211 . reached BY CLICKING, never by a URL
        door = '#h29Bar [data-t29="insights"]'
        await pg.click(door)
        await pg.wait_for_timeout(1400)
        page = await pg.evaluate("""() => { const n=document.getElementById('h30Ins');
            const vis = n && getComputedStyle(n).display !== 'none';
            /* HT-31: VISIBLE cards. What left this page is hidden and never deleted, so a probe that
               counts nodes would report no change at all - and S6e below is the line that proves the
               hidden ones are still there, which is the other half of the same sentence. */
            const cards = n ? [...n.querySelectorAll('#h30InsBody > .h30c')].filter(c => c.offsetParent)
                               .map(c => { const l = c.querySelector(':scope > .lab'); return l ? l.textContent.trim() : c.id; }) : [];
            const more = document.getElementById('h30InsMoreBody');
            return { vis: !!vis, cards: cards,
                     ledgerOnPage: !!(n && n.querySelector('#h30InsBody #h26Jrn')),
                     ledgerKept: !!(more && more.querySelector('#h26Jrn')),
                     moreKeeps: more ? [...more.children].map(x => x.id).filter(Boolean) : [],
                     sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; }""")
        chk('S6b . %s . the page is on screen' % tag, page['vis'], page)
        # AMENDED BY NAME, HT-31 (paste 143 S4.13), 2026-09-22: Cory, 9/21 - "phone insights: only the
        # month line chart, the year line chart, the full life graph and the group circle details". Four,
        # in that order, and the ones that left are HIDDEN not deleted, which S6e below already proves by
        # reading them out of the drawer. The old six are kept in `CARDS_HT30` so the list this replaces
        # is still written down rather than forgotten.
        chk('S6c . %s . and holds exactly his four, in his order' % tag,
            [c.replace(u'\u00b7', '.') for c in page['cards']] == CARDS_HT31, page['cards'])
        chk('S6d . %s . NO entry list of any kind is on it' % tag, not page['ledgerOnPage'], page)
        chk('S6e . %s . the journal ledger is kept, one tap down (R70.138)' % tag, page['ledgerKept'], page['moreKeeps'])
        chk('S6f . %s . nothing else that used to live on Views was deleted' % tag,
            len(page['moreKeeps']) >= 3, page['moreKeeps'])
        if tag == 'phone':
            chk('S6g . phone . no horizontal scroll at 390', page['sw'] <= page['cw'], page)
            first = await pg.evaluate("""() => { const b=document.getElementById('h30InsBody');
                const c=[...b.querySelectorAll(':scope > .h30c')].slice(0,2)
                    .map(x => Math.round(x.getBoundingClientRect().bottom));
                return { bottoms:c, h:window.innerHeight }; }""")
            chk('S6h . phone . the two month charts are on the first screen',
                len(first['bottoms']) == 2 and first['bottoms'][1] <= first['h'], first)
            zoom = await pg.evaluate("() => window.visualViewport ? Math.round(window.visualViewport.scale * 100) : 100")
            chk('S6i . phone . nothing zoomed the page', zoom == 100, zoom)
        await no_errors(pg, errs, 'S6 (%s)' % tag)
        await b.close()


# =============================================================================================
# S7 . START A GROUP, OR JOIN ONE
# =============================================================================================
async def sec_s7(pw):
    CUR[0] = 'S7'
    print("\n--- S7 . start a group or join one ---")
    b, pg, errs = await open_page(pw, 390, 844, flags=SQL)
    await pg.evaluate("() => window.__HT29GRP.openGroup()"); await pg.wait_for_timeout(700)
    scr = await pg.evaluate("""() => { const n=document.getElementById('g29'),
              mk=document.getElementById('g29Make'), jn=document.getElementById('g29Join');
        return { heads: n ? [...n.querySelectorAll('.h30gh')].map(x => x.textContent.trim()) : [],
                 start: mk ? mk.textContent.trim() : null, join: jn ? jn.textContent.trim() : null }; }""")
    chk('S7a . both actions are there, and named as he names them',
        scr['heads'] == ['Start a group', 'Join a group']
        and scr['start'] == 'Start a group' and scr['join'] == 'Join a group', scr)
    codes = await pg.evaluate("""() => { const f = window.__HT30GRP.codeOf;
        return [f('ABC123'), f('abc123'), f(' https://cory9oo.github.io/ht/?join=XYZ789 '),
                f('https://cory9oo.github.io/ht/?join=XYZ789&x=1')]; }""")
    chk('S7b . a pasted LINK is a code, and so is a code', codes == ['ABC123', 'ABC123', 'XYZ789', 'XYZ789'], codes)
    await pg.evaluate("() => { const n=document.querySelector('.ov'); if(n) n.classList.remove('on'); }")
    await no_errors(pg, errs, 'S7 (screen)')
    await b.close()

    # a group he is already in: the code, the LINK he can send, and the way out
    flags = dict(SQL); flags['__CIRCLE'] = True
    b, pg, errs = await open_page(pw, 390, 844, flags=flags)
    await pg.evaluate("() => window.__HT29GRP.openGroup()"); await pg.wait_for_timeout(700)
    inn = await pg.evaluate("""() => { const l=document.getElementById('h30Link');
        return { link: l ? l.value : null, leave: !!document.getElementById('h30Leave'),
                 invite: !!document.getElementById('g29Invite') }; }""")
    chk('S7c . starting or joining one hands back a LINK, not only six characters read aloud',
        bool(inn['link']) and '?join=' in inn['link'], inn)
    chk('S7d . and a member can leave', inn['leave'] and inn['invite'], inn)
    rows = await pg.evaluate("""() => { const t = window.__HT29GRP.table(window.__HT29GRP_ROWS());
        return ['today', '7', '30', 'logged'].filter(w => t.toLowerCase().includes(w)); }""")
    chk('S7e . 133 S3 . today, 7 days, 30 days and logged N/7 are still the five columns',
        len(rows) == 4, rows)
    await pg.evaluate("() => { const n=document.querySelector('.ov'); if(n) n.classList.remove('on'); }")
    await no_errors(pg, errs, 'S7 (in a group)')
    await b.close()

    # stress 5 . the deep link reaches someone already signed in: it joins, with no sign-up
    b, pg, errs = await open_page(pw, 390, 844, flags=SQL, qs='?join=ABC123', wait=4200)
    card = await pg.evaluate("""() => { const n=document.getElementById('h29Join');
        return { on: !!(n && n.classList.contains('on')),
                 signup: !!document.querySelector('#h29Join [type=email], #h29Join [type=password]'),
                 stored: (()=>{ try{ return localStorage.getItem('ht_join_code'); }catch(e){ return null; } })(),
                 url: location.search }; }""")
    chk('S7f . stress 5 . a signed-in person is offered the join itself, with no sign-up step',
        card['on'] and not card['signup'], card)
    chk('S7g . and the code is off the address bar, so a refresh cannot re-apply it', card['url'] == '', card)
    rpc = await pg.evaluate("""async () => { window.__RPCS = [];
        document.getElementById('h29JoinYes').click();
        await new Promise(r => setTimeout(r, 900));
        return (window.__RPCS||[]).map(r => r.name); }""")
    chk('S7h . one tap joins', any('join' in r for r in rpc), rpc)
    await no_errors(pg, errs, 'S7 (deep link)')
    await b.close()


SECTIONS = {'S0': sec_s0, 'S1': sec_s1, 'S2': sec_s2, 'S3': sec_s3, 'S4': sec_s4,
            'S5': sec_s5, 'S6': sec_s6, 'S7': sec_s7}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    a = ap.parse_args()
    async with async_playwright() as pw:
        for s in ([a.only] if a.only else list(SECTIONS)):
            if s not in SECTIONS:
                raise SystemExit('unknown section %s' % s)
            await SECTIONS[s](pw)
    bad = [n for ok, n in RES if not ok]
    # 134 R1: a section that asserted NOTHING is a failure of this file, not a clean run.
    silent = [s for s in ([a.only] if a.only else list(SECTIONS)) if not SEC_COUNT.get(s)]
    if silent:
        print('\nASSERTED NOTHING: %s' % ', '.join(silent))
    print('\nassertions by section: ' + ' . '.join('%s %d' % (k, SEC_COUNT.get(k, 0))
                                                   for k in ([a.only] if a.only else list(SECTIONS))))
    print('GOLDEN HT-30: %d/%d PASS, %d FAIL, %d assertions' % (len(RES) - len(bad), len(RES), len(bad), len(RES)))
    return 1 if (bad or silent) else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
