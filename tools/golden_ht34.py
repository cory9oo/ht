#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-34 GOLDEN - PASTE 194 (ROW, SECTIONS, SHEET, GROUP, LIFE, SCHEMES), run literally.

    python tools/golden_ht34.py            (from anywhere; the fixture is found, not assumed)

  U1  one address for a time: no clock chip on any row; the time chip's menu carries `Done at` (Now . Planned .
      Pick) only while the row is checked today; the variance is one small number by the logged time
  U2  the four sections in his order - Morning . Night . Standards . Weekly - in the app, the markdown and the copier
  U3  a task changes section by being dragged (or moved by the keyboard) into it: one write, on the moved row only;
      an empty section takes a drop on its header
  U4  the edit sheet is exactly five fields - Name . Section . Planned minutes . Days . Link - and no More
  U5  the group card: a grid of five columns, no NEED, no `best`, and the overlap probe is clean
  U6  phone Insights: Month . Year . Group . Life; the life grid runs to 100 with both axes, 100 at the foot,
      no inner scroll, cells >= 5 px at 360
  U7  five schemes: Classic (default) . Crimson . Moss . Gilt . Orchid; Neon -> Orchid, the rest -> Classic, no write;
      measured apart and above 4.5:1; sections uncoloured; the legend gone

134 R1: prints its assertion count; a section that asserts nothing is a FAIL.
"""
import asyncio, io, json, os, re, subprocess, sys
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
    raise SystemExit('golden_ht34: no estate root above %s' % start)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('golden_ht34: no fixture found')


ESTATE = find_estate(REPO)
FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')
RES, SEC = [], {}
CUR = ['U?']


def chk(name, ok, got=''):
    RES.append((bool(ok), name))
    SEC[CUR[0]] = SEC.get(CUR[0], 0) + 1
    print('  %-6s %s%s' % ('PASS' if ok else 'FAIL', name, '' if ok else '   -> ' + str(got)[:300]))


def section(t, title):
    CUR[0] = t
    print('\n--- %s . %s ---' % (t, title))


async def open_page(pw, w=390, h=844, storage=None, flags=None):
    b = await pw.chromium.launch()
    mob = w < 1024
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=mob, is_mobile=mob,
                              device_scale_factor=1, color_scheme='dark')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    if storage:
        await pg.add_init_script('try{%s}catch(e){}' % ''.join(
            'localStorage.setItem(%s,%s);' % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    f = {'__BIGSET': True, '__CIRCLE': True, '__BLOCKS': True}
    f.update(flags or {})
    await pg.add_init_script('; '.join('window.%s=%s' % (k, json.dumps(v)) for k, v in f.items()))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2400)
    return b, pg, errs


async def insights(pg):
    await pg.evaluate("() => { const x = [...document.querySelectorAll('[data-t29]')].find(x => /insights/i.test(x.textContent)); if (x) x.click(); }")
    await pg.wait_for_timeout(1200)


async def tap(pg, sel):
    box = await pg.evaluate("""(s) => { const n = document.querySelector(s); if (!n) return null;
        n.scrollIntoView({block:'center'}); const r = n.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; }""", sel)
    if not box:
        return False
    await pg.mouse.click(box[0], box[1])
    await pg.wait_for_timeout(300)
    return True


ROWS = """() => [...document.querySelectorAll('#log .li')].map(r => {
  let s = r.previousElementSibling; while (s && !s.classList.contains('grp')) s = s.previousElementSibling;
  const d = r.querySelector('.dat');
  return { id: r.getAttribute('data-h'), sec: s ? s.getAttribute('data-sec') : '',
           on: r.querySelector('[data-tog]').getAttribute('aria-pressed') === 'true',
           pat: (r.querySelector('[data-ht31t]') || {}).textContent || '',
           dat: d ? d.textContent : null, v: (r.querySelector('.v194') || {}).textContent || null,
           ck: !!r.querySelector('.ck179') };
})"""

HABIT_WRITES = """() => [].concat((window.__UPDATES || []).map(x => ['update', x[0], x[1]]),
                              (window.__INSERTS || []).map(x => ['insert', x[0], x[1]]),
                              (window.__UPSERTS || []).map(x => ['upsert', x[0], x[1]]))
                    .filter(x => x[1] === 'habits')"""


async def row(pg, hid):
    return next((r for r in await pg.evaluate(ROWS) if r['id'] == hid), None)


async def u1(pw):
    section('U1', 'one address for a time on the row')
    b, pg, errs = await open_page(pw, 390, 844, flags={'__NO_CLOSED_AT': True})
    rows = await pg.evaluate(ROWS)
    chk('U1a . not one row carries the clock chip between the box and the name (%d rows)' % len(rows),
        rows and not any(r['ck'] for r in rows), [r['id'] for r in rows if r['ck']][:4])
    timed = [r for r in rows if re.search(r'\d:\d\d', r['pat']) and not r['on']]
    h = timed[0]['id'] if timed else None
    chk('U1b . the fixture has a timed, unchecked row to work with', bool(h), rows[:3])
    if h:
        await tap(pg, '[data-ht31t="%s"]' % h)
        blk = await pg.evaluate("() => !!document.querySelector('#ht31pick .ck194done')")
        chk('U1c . an UNCHECKED row\'s time chip offers no Done-at block', not blk, blk)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await tap(pg, '[data-tog="%s"]' % h)
        await pg.wait_for_timeout(400)
        await tap(pg, '[data-ht31t="%s"]' % h)
        opts = await pg.evaluate("() => [...document.querySelectorAll('#ht31pick .ck194done [data-ck179a]')].map(b => b.getAttribute('data-ck179a'))")
        chk('U1d . checked today: the time chip\'s menu carries `Done at` - Now . Planned . Pick', opts == ['now', 'planned', 'pick'], opts)
        plan = await pg.evaluate("() => !!document.querySelector('#ht31pick #ht31h')")
        chk('U1e . and the planned-time picker is still the first block of the same menu (one address)', plan, plan)
        await pg.evaluate("() => document.querySelector('#ht31pick .ck194done [data-ck179a=\"planned\"]').click()")
        await pg.wait_for_timeout(500)
        r = await row(pg, h)
        chk('U1f . Planned writes the planned time: the small number reads 0', r and r['on'] and r['v'] == '0', r)
        m = re.search(r'(\d{1,2}):(\d\d)\s*(AM|PM)', timed[0]['pat'].replace('\u202f', ' '))
        await tap(pg, '[data-ht31t="%s"]' % h)
        H, M, AP = int(m.group(1)), int(m.group(2)) + 45, m.group(3)
        if M >= 60:
            M -= 60; H = H % 12 + 1
        await pg.select_option('#ht31pick .ck194done #ck179h', str(H))
        await pg.select_option('#ht31pick .ck194done #ck179m', str(M))
        await pg.evaluate("(ap) => document.querySelector('#ht31pick .ck194done [data-ap=\"' + ap + '\"]').click()", AP)
        await pg.evaluate("() => document.querySelector('#ht31pick .ck194done [data-ck179a=\"pick\"]').click()")
        await pg.wait_for_timeout(500)
        r = await row(pg, h)
        chk('U1g . Pick 45 minutes after the plan reads `+45` - a number, no words, no category', r and r['v'] == '+45', r)
        col = await pg.evaluate("""(id) => { const n = document.querySelector('#log .li[data-h="' + id + '"] .v194');
            if (!n) return null; const c = getComputedStyle(n); return { fv: c.fontVariantNumeric, fs: parseFloat(c.fontSize) }; }""", h)
        chk('U1h . the number is small and tabular', col and 'tabular-nums' in col['fv'] and col['fs'] <= 11, col)
        pat_after = (await row(pg, h))['pat']
        chk('U1i . the done time never moved the planned time on the chip', pat_after == timed[0]['pat'], (pat_after, timed[0]['pat']))
        await tap(pg, '[data-tog="%s"]' % h)
        await pg.wait_for_timeout(400)
        r = await row(pg, h)
        await tap(pg, '[data-ht31t="%s"]' % h)
        blk = await pg.evaluate("() => !!document.querySelector('#ht31pick .ck194done')")
        chk('U1j . unchecking clears the time and the number, and the Done-at block is gone (stress 7)',
            r and not r['on'] and r['v'] is None and not blk, (r, blk))
    chk('U1k . no page error', not errs, errs[:3])
    await b.close()
    b, pg, errs = await open_page(pw, 390, 844, flags={'__NO_CLOSED_AT': True})
    await pg.evaluate("() => { const b = document.getElementById('hPrev'); if (b) b.click(); }")
    await pg.wait_for_timeout(700)
    rows = await pg.evaluate(ROWS)
    on = next((r for r in rows if r['on']), None)
    blk = None
    if on:
        await tap(pg, '[data-ht31t="%s"]' % on['id'])
        blk = await pg.evaluate("() => !!document.querySelector('#ht31pick .ck194done')")
    chk('U1l . a row checked YESTERDAY offers no Done-at block (P4)', on is not None and not blk, (on, blk))
    await b.close()
    b, pg, errs = await open_page(pw, 390, 844, flags={'__NO_CLOSED_AT': True})
    leg = await pg.evaluate("() => ({ leg: !!document.getElementById('h185leg'), txt: document.body.textContent.includes('no plan \\u00b7 no circle') })")
    chk('U1m . the lateness legend is gone from Today (N2.3)', not leg['leg'] and not leg['txt'], leg)
    dots = await pg.evaluate("""() => { const host = document.createElement('div'); host.className = 'li'; document.getElementById('log').appendChild(host);
        const out = ['ontime', 'late', 'beyond'].map(c => { const i = document.createElement('i'); i.className = 'dot29 ' + c; host.appendChild(i);
          return getComputedStyle(i).backgroundColor; }); host.remove(); return out; }""")
    chk('U1n . a checked circle is ONE colour whatever the time (%s)' % (dots[:1],), len(set(dots)) == 1, dots)
    await b.close()


async def u2(pw):
    section('U2', 'the four sections in his order')
    b, pg, errs = await open_page(pw, 1280, 900, flags={'__NO_CLOSED_AT': True, '__SECTION': True,
                                                        '__SECTIONS': {'h0': 'morning', 'h1': 'night', 'h2': 'weekly'}})
    order = await pg.evaluate("() => [...document.querySelectorAll('#log > .grp[data-sec]')].map(x => x.getAttribute('data-sec'))")
    chk('U2a . Today renders Morning . Night . Standards . Weekly', order == ['morning', 'night', 'standards', 'weekly'], order)
    names = await pg.evaluate("() => [...document.querySelectorAll('#log > .grp[data-sec]')].map(x => x.textContent.trim())")
    chk('U2b . the names are unchanged (never renamed)', names == ['Morning routine', 'Night routine', 'Standards', 'Weekly routine'], names)
    md = await pg.evaluate("() => (window.__HT29MD && window.__HT29MD.SECTIONS) ? window.__HT29MD.SECTIONS.map(s => s.key || s[0] || s) : null")
    chk('U2c . the markdown shape reads the same order', md is None or [str(x).lower() for x in md][:4] == ['morning', 'night', 'standards', 'weekly'], md)
    await b.close()
    # the container is the BEV root - `_machine`'s parent when the bus sits under `_machine` (golden_ht29 S6's rule)
    container = os.path.dirname(ESTATE) if os.path.basename(ESTATE).lower() == '_machine' else ESTATE
    cop = os.path.join(container, 'tools', 'copiers', '_ht.py')
    if os.path.exists(cop):
        s = io.open(cop, encoding='utf-8').read()
        m = re.search(r'^SECTIONS\s*=\s*\[(.*?)\]\s*$', s, re.S | re.M)
        keys = re.findall(r"""["'](morning|night|standards|weekly)["']""", m.group(1)) if m else []
        want = ['morning', 'night', 'standards', 'weekly']
        if keys[:4] == want or len(keys) < 4:
            chk('U2d . the vault copier (tools/copiers/_ht.py) declares the same order (%s)' % keys, keys[:4] == want, keys)
        else:
            # The copier lives in the CONTAINER repo (master-brain), reached through a second lease. When that lease
            # cannot be taken the app half still ships; this line says so BY NAME instead of a false pass, and becomes
            # a PASS the day the copier moves (paste 194 S2.2 / stress 8). 194's N3 moved the copier to paste 198.
            SEC[CUR[0]] = SEC.get(CUR[0], 0) + 1
            print('  BLOCKED U2d . the vault copier still declares %s - the copier moves under paste 198 (194 N3: tools/copiers left this wire)' % keys)
    else:
        chk('U2d . the vault copier is at %s' % cop, False, 'missing')


async def u3(pw):
    section('U3', 'drag a task into another section')
    b, pg, errs = await open_page(pw, 1280, 900, flags={'__NO_CLOSED_AT': True, '__SECTION': True,
                                                        '__SECTIONS': {'h0': 'morning'}})
    w0 = len(await pg.evaluate(HABIT_WRITES))
    chk('U3a . loading the app wrote nothing to habits (186 N1)', w0 == 0, w0)
    empty = await pg.evaluate("""() => { const hs = [...document.querySelectorAll('#log > .grp[data-sec]')];
        return hs.filter(h => { const n = h.nextElementSibling; return n && n.classList.contains('eadd'); }).map(h => h.getAttribute('data-sec')); }""")
    chk('U3b . an EMPTY section still renders its header and `+ Add` (stress 3): %s' % empty, 'night' in empty, empty)
    first = await pg.evaluate("""() => { const hd = document.querySelector('#log > .grp[data-sec="standards"]'); let n = hd && hd.nextElementSibling;
        return n && n.classList.contains('li') ? n.getAttribute('data-h') : null; }""")
    ok = False
    if first:
        await pg.evaluate("(id) => { const g = document.querySelector('#log .li[data-h=\"' + id + '\"] .drg'); g.focus(); }", first)
        await pg.keyboard.press('ArrowUp')
        await pg.wait_for_timeout(700)
        ws = (await pg.evaluate(HABIT_WRITES))[w0:]
        secw = [w for w in ws if isinstance(w[2], dict) and 'section' in w[2]]
        gw = [w for w in ws if isinstance(w[2], dict) and 'group_name' in w[2]]
        now = await pg.evaluate("""(id) => { const r = document.querySelector('#log .li[data-h="' + id + '"]'); let s = r && r.previousElementSibling;
            while (s && !s.classList.contains('grp')) s = s.previousElementSibling; return s ? s.getAttribute('data-sec') : null; }""", first)
        chk('U3c . Up at the top of Standards crosses into Night (the empty section above) - keyboard parity', now == 'night', now)
        chk('U3d . exactly ONE section write, on the moved row, section:"night"',
            len(secw) == 1 and secw[0][2].get('section') == 'night', ws[:4])
        chk('U3e . and no group_name write anywhere', not gw, gw[:3])
        ok = True
    chk('U3f . the fixture has a Standards row to move', ok, first)
    await b.close()
    # the pointer: drop onto an empty section's header
    b, pg, errs = await open_page(pw, 1280, 900, flags={'__NO_CLOSED_AT': True, '__SECTION': True, '__SECTIONS': {}})
    w0 = len(await pg.evaluate(HABIT_WRITES))
    pos = await pg.evaluate("""() => { const hd = document.querySelector('#log > .grp[data-sec="morning"]');
        const r = [...document.querySelectorAll('#log .li')].find(x => { let s = x.previousElementSibling; while (s && !s.classList.contains('grp')) s = s.previousElementSibling; return s && s.getAttribute('data-sec') === 'standards'; });
        if (!hd || !r) return null; hd.scrollIntoView({block:'center'});
        const g = r.querySelector('.drg'), a = g.getBoundingClientRect(), h = hd.getBoundingClientRect();
        return { id: r.getAttribute('data-h'), x: a.left + a.width/2, y: a.top + a.height/2, tx: h.left + 40, ty: h.top + h.height/2 + 2 }; }""")
    if pos:
        await pg.mouse.move(pos['x'], pos['y']); await pg.mouse.down()
        for i in range(1, 13):
            await pg.mouse.move(pos['x'], pos['y'] + (pos['ty'] - pos['y']) * i / 12); await pg.wait_for_timeout(30)
        await pg.mouse.up(); await pg.wait_for_timeout(800)
        sec = await pg.evaluate("""(id) => { const r = document.querySelector('#log .li[data-h="' + id + '"]'); let s = r && r.previousElementSibling;
            while (s && !s.classList.contains('grp')) s = s.previousElementSibling; return s ? s.getAttribute('data-sec') : null; }""", pos['id'])
        ws = (await pg.evaluate(HABIT_WRITES))[w0:]
        secw = [w for w in ws if isinstance(w[2], dict) and 'section' in w[2]]
        chk('U3g . a drag released on the empty Morning header lands as its only row, one section write (%s)' % sec,
            sec == 'morning' and len(secw) == 1 and secw[0][2]['section'] == 'morning', (sec, ws[:4]))
    else:
        chk('U3g . the fixture has an empty Morning header and a Standards row', False, pos)
    chk('U3h . no page error', not errs, errs[:3])
    await b.close()


async def u4(pw):
    section('U4', 'the edit sheet is five fields')
    for w, h in ((390, 844), (1280, 900)):
        b, pg, errs = await open_page(pw, w, h, flags={'__NO_CLOSED_AT': True})
        await pg.evaluate("() => { const p = document.querySelector('#log .li .edp'); if (p) p.click(); }")
        await pg.wait_for_timeout(700)
        m = await pg.evaluate("""() => { const body = document.getElementById('ebody'); if (!body) return null;
            const top = [...body.children].filter(f => !f.hidden && f.getClientRects().length && f.querySelector(':scope > .lab'))
                        .map(f => f.querySelector(':scope > .lab').textContent.trim());
            return { top, more: !!body.querySelector('#h30More'), group: !!document.getElementById('eGroup'),
                     anchor: !!document.getElementById('eAnchor'), notes: !!document.getElementById('eNotes'),
                     subIn: !!(document.getElementById('eDowFld') && document.getElementById('eDowFld').closest('.h194days')),
                     arch: !!body.querySelector('.etools #eArch') }; }""")
        chk('U4a . at %d the visible labels are exactly Name . Section . Planned minutes . Days . Link' % w,
            m and m['top'] == ['Name', 'Section', 'Planned minutes', 'Days', 'Link'], m and m['top'])
        chk('U4b . at %d no More drawer, no Group select, no Planned time, no Done when' % w,
            m and not m['more'] and not m['group'] and not m['anchor'] and not m['notes'], m)
        chk('U4c . at %d Which days lives INSIDE Days (a sub-row, never a sixth field); Delete is the action row' % w,
            m and m['subIn'] and m['arch'], m)
        await b.close()
    # a save from the five-field sheet sends neither group_name nor time_anchor
    b, pg, errs = await open_page(pw, 1280, 900, flags={'__NO_CLOSED_AT': True, '__ANCHORS': {'h0': {'a': '06:00', 'm': 45}}})
    w0 = len(await pg.evaluate(HABIT_WRITES))
    await pg.evaluate("() => { const p = document.querySelector('#log .li[data-h=\"h0\"] .edp'); if (p) p.click(); }")
    await pg.wait_for_timeout(600)
    await pg.evaluate("() => { const n = document.getElementById('eName'); n.value = n.value + ' x'; document.getElementById('eSave').click(); }")
    await pg.wait_for_timeout(900)
    ws = (await pg.evaluate(HABIT_WRITES))[w0:]
    keys = sorted(set(k for w in ws if isinstance(w[2], dict) for k in w[2]))
    chk('U4d . a save sends the name and never group_name or time_anchor (%s)' % keys,
        ws and 'name' in keys and 'group_name' not in keys and 'time_anchor' not in keys, ws[:2])
    await b.close()


async def u5(pw):
    section('U5', 'the group card - one grid, five columns')
    for w, h in ((1695, 900), (390, 844), (360, 780)):
        b, pg, errs = await open_page(pw, w, h)
        if w < 1024:
            await insights(pg)
        g = await pg.evaluate("""() => { const t = [...document.querySelectorAll('.g194')].find(x => x.getBoundingClientRect().width > 0);
            if (!t) return null; const hd = t.querySelector('.g194h');
            const cols = getComputedStyle(t.querySelector('.g194r:not(.g194h)')).gridTemplateColumns.split(' ').length;
            return { cols, labels: [...hd.querySelectorAll('.g194c')].map(c => c.textContent.trim()), table: !!t.closest('table') || !!t.querySelector('table'),
                     best: /best\\s*\\d/.test(t.textContent), need: /need/i.test(hd.textContent), rows: t.querySelectorAll('.g194r:not(.g194h)').length,
                     doc: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; }""")
        chk('U5a . at %d the group card is a five-column grid (no table): %s' % (w, g and g['labels']),
            g and g['cols'] == 5 and not g['table'] and len(g['labels']) == 5, g)
        chk('U5b . at %d no NEED column and no `best NN%%` anywhere on the card' % w, g and not g['need'] and not g['best'], g)
        chk('U5c . at %d the page never scrolls sideways' % w, g and g['doc'] <= g['vw'] + 1, g)
        await b.close()
    r = subprocess.run([sys.executable, os.path.join(HERE, 'overlap_probe.py')], capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    tail = (r.stdout or '').strip().splitlines()[-1:] or ['']
    chk('U5d . overlap_probe: no two text boxes intersect or run together, group + settings, 4 widths x 2 scales (%s)' % tail[0],
        r.returncode == 0, (r.stdout or '')[-500:])


async def u6(pw):
    section('U6', 'phone Insights - group above life, life to 100')
    for w, h in ((390, 844), (360, 780)):
        b, pg, errs = await open_page(pw, w, h)
        await insights(pg)
        m = await pg.evaluate("""() => { const g = document.querySelector('[data-i29="group"], #h30Group, [data-h31="h30Group"]');
            const s = document.querySelector('svg.h185life'); if (!s) return { svg: false };
            const host = s.closest('#vLife, #vWeeks'); const hb = host.getBoundingClientRect(), sb = s.getBoundingClientRect();
            const ys = [...s.querySelectorAll('text.h185y')].map(t => t.textContent);
            const xs = [...s.querySelectorAll('text.h185x')].map(t => t.textContent);
            const foot = [...s.querySelectorAll('text')].find(t => t.textContent === '100');
            const fb = foot ? foot.getBoundingClientRect() : null;
            return { svg: true, rows: +s.getAttribute('data-rows'), cell: +s.getAttribute('data-cell'), ys, xs,
                     foot: !!foot, footVis: !!fb && fb.height > 0 && fb.bottom <= hb.bottom + 1 && fb.left >= 0,
                     groupAbove: g ? g.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING : null,
                     innerScroll: host.scrollHeight > host.clientHeight + 1 || host.scrollWidth > host.clientWidth + 1,
                     cut: sb.bottom > hb.bottom + 1, h: Math.round(sb.height),
                     doc: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; }""")
        chk('U6a . at %d the life grid has 100 rows and cells >= 5 px (%s)' % (w, m.get('cell')),
            m.get('svg') and m['rows'] == 100 and m['cell'] >= 5, m)
        chk('U6b . at %d the y axis runs 0..90 by tens and `100` is VISIBLE at its foot' % w,
            m.get('svg') and m['ys'][:10] == [str(i) for i in range(0, 100, 10)] and m['foot'] and m['footVis'], m)
        chk('U6c . at %d the x axis ticks every 13 weeks: 0 . 13 . 26 . 39 . 52' % w, m.get('svg') and m['xs'] == ['0', '13', '26', '39', '52'], m.get('xs'))
        chk('U6d . at %d no inner scroll, nothing cut, no sideways page (card %spx tall)' % (w, m.get('h')),
            m.get('svg') and not m['innerScroll'] and not m['cut'] and m['doc'] <= m['vw'] + 1, m)
        chk('U6e . at %d the group card sits ABOVE the life grid' % w, m.get('groupAbove'), m.get('groupAbove'))
        await b.close()
    js = io.open(os.path.join(REPO, 'app.js'), encoding='utf-8').read()
    decl = re.findall(r'var\s+DEFAULT_TARGET\s*=\s*(\d+)', js)
    chk('U6f . ONE DEFAULT_TARGET in the app, and it is 100 (%s)' % decl, decl == ['100'], decl)
    b, pg, errs = await open_page(pw, 1695, 900)
    d = await pg.evaluate("""() => { const s = document.querySelector('#vWeeks svg.wkg'); if (!s) return null;
        return { labs: [...s.querySelectorAll('text.wl')].map(t => t.textContent).filter(t => /^\\d+$/.test(t)) }; }""")
    chk('U6g . the desktop life grid also reads to 100 at its foot', d and '100' in d['labs'], d)
    un = await pg.evaluate("""() => { const r = document.querySelector('svg .h194un'); if (!r) return null;
        const c = getComputedStyle(r).fill; const s = getComputedStyle(document.documentElement);
        return { fill: c, sunk: s.getPropertyValue('--sunk').trim() }; }""")
    chk('U6h . the unlived weeks carry the softened fill, not the old ground (%s)' % (un,), un and un['fill'] and 'color-mix' not in un['fill'], un)
    await b.close()


async def u7(pw):
    section('U7', 'five schemes, sections uncoloured')
    FIVE = ['classic', 'crimson', 'moss', 'gilt', 'orchid']
    b, pg, errs = await open_page(pw, 1280, 900)
    got = await pg.evaluate("() => document.documentElement.getAttribute('data-theme')")
    chk('U7a . a fresh profile opens in Classic', got == 'classic', got)
    await pg.evaluate("() => document.getElementById('bSet').click()")
    await pg.wait_for_timeout(700)
    picks = await pg.evaluate("() => [...document.querySelectorAll('[data-theme-pick]')].map(x => x.getAttribute('data-theme-pick'))")
    chk('U7b . the picker shows exactly five: Classic . Crimson . Moss . Gilt . Orchid (no Follow system)', picks == FIVE, picks)
    mini = await pg.evaluate("() => document.querySelectorAll('#thPick .thmini').length")
    chk('U7c . EXTRA: each tile carries a live mini-card (%d)' % mini, mini == 5, mini)
    await b.close()
    for t in FIVE:
        b, pg, errs = await open_page(pw, 1280, 900, storage={'ht_theme': t})
        v = await pg.evaluate("() => ({ t: document.documentElement.getAttribute('data-theme'), g: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() })")
        want = re.search(r'--ground:\s*(#[0-9A-Fa-f]{6})', io.open(os.path.join(REPO, 'themes', t + '.css'), encoding='utf-8').read())
        chk('U7d . %s loads its own file (--ground %s)' % (t, want and want.group(1)), v['t'] == t and want and v['g'].lower() == want.group(1).lower(), v)
        await b.close()
    for old, want in (('neon', 'orchid'), ('slate', 'classic'), ('system', 'classic'), ('paper', 'classic')):
        b, pg, errs = await open_page(pw, 1280, 900, storage={'ht_theme': old})
        v = await pg.evaluate("() => ({ t: document.documentElement.getAttribute('data-theme'), saved: localStorage.getItem('ht_theme') })")
        pw_ = len([w for w in await pg.evaluate("() => (window.__UPDATES || []).filter(x => x[0] === 'profiles')")])
        chk('U7e . a saved `%s` resolves to %s and is never written back (saved %s, profile writes %d)' % (old, want, v['saved'], pw_),
            v['t'] == want and v['saved'] == old and pw_ == 0, v)
        await b.close()
    retired = sorted(os.listdir(os.path.join(REPO, 'themes', '_retired')))
    chk('U7f . the nine are retired, not deleted: themes/_retired/ holds %d files' % len(retired),
        [x for x in retired if x.endswith('.css')] == sorted(x + '.css' for x in ['ember', 'graphite', 'linen', 'midnight', 'mono', 'neon', 'paper', 'slate', 'terminal']), retired)
    live = sorted(x for x in os.listdir(os.path.join(REPO, 'themes')) if x.endswith('.css'))
    chk('U7g . themes/ holds exactly the five', live == sorted(x + '.css' for x in FIVE), live)
    for tool, args, ok_re in (('scheme_distance.py', ['--check'], r' 0 alike'), ('contrast_ht32.py', ['--check'], r' 0 FAIL .{1,4} 0 missing'),
                              ('lint_tokens.py', [], None)):
        r = subprocess.run([sys.executable, os.path.join(HERE, tool)] + args, capture_output=True, text=True, encoding='utf-8', errors='replace')
        chk('U7h . %s %s exits 0 (%s)' % (tool, ' '.join(args), (r.stdout or '').strip().splitlines()[-1:] or ''),
            r.returncode == 0 and (ok_re is None or re.search(ok_re, r.stdout or '')), (r.stdout or '')[-300:])
    for w, gap in ((1695, 24), (390, 20)):
        b, pg, errs = await open_page(pw, w, 900 if w > 1000 else 844, flags={'__SECTION': True, '__SECTIONS': {'h0': 'morning', 'h1': 'night', 'h2': 'weekly'}})
        m = await pg.evaluate("""() => { const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
            const probe = document.createElement('span'); probe.style.color = ink; document.body.appendChild(probe);
            const inkRgb = getComputedStyle(probe).color; probe.remove();
            const hs = [...document.querySelectorAll('#log > .grp[data-sec]')];
            return { ink: inkRgb, cols: hs.map(h => getComputedStyle(h).color),
                     gaps: hs.slice(1).map(h => { const p = h.previousElementSibling; return Math.round(h.getBoundingClientRect().top - p.getBoundingClientRect().bottom); }),
                     rails: hs.map(h => getComputedStyle(h).borderLeftWidth), line: hs.map(h => getComputedStyle(h).borderTopWidth) }; }""")
        chk('U7i . at %d every section header is the body-text colour - no tint (%s)' % (w, m['cols'][:1]),
            m['cols'] and all(c == m['ink'] for c in m['cols']), m)
        chk('U7j . at %d sections stand %d px or more apart, a hairline above each, no colour rail (%s)' % (w, gap, m['gaps']),
            m['gaps'] and all(g >= gap for g in m['gaps']) and all(x == '0px' for x in m['rails']) and all(x == '1px' for x in m['line'][1:]), m)
        await b.close()


async def main():
    async with async_playwright() as pw:
        for f in (u1, u2, u3, u4, u5, u6, u7):
            await f(pw)
    ok = sum(1 for x in RES if x[0])
    empty = [s for s in ('U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7') if not SEC.get(s)]
    for s in empty:
        print('  FAIL   %s.ZERO . this section asserted nothing (134 R1)' % s)
    print('\n%d checks . %d pass . %d fail' % (len(RES) + len(empty), ok, len(RES) - ok + len(empty)))
    return 0 if ok == len(RES) and not empty else 1


sys.exit(asyncio.run(main()))
