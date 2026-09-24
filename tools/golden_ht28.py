#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-28 GOLDEN - WIRE HT-28 (PASTE 128), run literally.

    python tools/golden_ht28.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht28.py --only C

  A   the phone (<=640px): no tap-zoom, no stray X, group details rebuilt, Today compact, journal untouched,
      Views in one order with equal cards and one header, Advanced explained
  B   the desktop completion panel one step quieter, scoped to that panel
  C   sync: merge on save, offline replay, two devices converge, last write wins and the loser is kept,
      a 30 s pull while visible and none while hidden, the Synced stamp, never under a field being typed in
  D   "close the day" gone from the phone, and all five inputs still write
  E   the cadence grammar, a dow:6 Sabbath on a Saturday and absent on a Tuesday, the migration, the sections,
      the Days control
  F   Saturday scoring, the Sabbaths-kept line and rings, rests-on-Sabbath, the rest-standard seed
  G   a stranger signs up alone: the card, the examples, editing, delete; the privacy statement and guards

Numbers written as constants were MEASURED on this fixture before the change (ht_stage/128/measure_*.txt,
shots_b/B_before.json) - a floor that is only ever tested below its own target is not a floor.
"""
import argparse, asyncio, io, json, os, re, subprocess, sys
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
    raise SystemExit('golden_ht28: no estate root above %s' % start)


def fixture_dir(estate):
    for d in (os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if os.path.isdir(d):
            return d
    return os.path.join(estate, '_machine', 'ht3')


ESTATE = find_estate(REPO)
BASE = 'file://' + os.path.join(fixture_dir(ESTATE), 'index.html').replace(os.sep, '/')
RECONCILE = os.path.join(ESTATE, '_reconcile')
PRIV_LINE = 'Your journal is yours. The app never shows it to anyone else \u2014 including Cory.'

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def src(p):
    return io.open(p, encoding='utf-8', errors='replace').read()


def js_round(x):
    """Math.round, not Python's round-half-to-even: the app's 62.5 is 63"""
    import math
    return int(math.floor(x + 0.5))


def add_link(items):
    """#add=<base64url(JSON)> - the add-link the app reads (HT-28b); a fragment never reaches a server"""
    import base64
    raw = json.dumps(items, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return '#add=' + base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def init_js(flags):
    return "; ".join("window.%s=%s" % (k, json.dumps(v)) for k, v in (flags or {}).items())


async def show_why(pg):
    """HT-31 (paste 143 S5.16), 2026-09-22: Cory took the "why" box off the desktop as well, so there is
    no width that shows it - but it is still an INPUT, still a column, and the sync checks below are
    about the SYNC PATH, not about where the box is painted. They un-hide it to type in it, which is
    the same amendment shape as the Insights drawer above: the subject of the check does not move, only
    the fact that the thing it drives is now off the surface. A check that stopped typing into `why`
    would stop proving that one device's why cannot blank another's - which is the defect HT-28c exists
    for and the one thing nobody wants to find out about later."""
    await pg.evaluate("() => { const f = document.getElementById('whyFld') "
                      "|| (document.getElementById('iWhy') && document.getElementById('iWhy').closest('.fld')); "
                      "if(f){ f.removeAttribute('hidden'); f.classList.remove('h31gone'); } }")
    await pg.wait_for_timeout(120)


async def open_page(pw, w=390, h=844, touch=None, flags=None, qs='', wait=3500):
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
    await pg.goto(BASE + qs)
    await pg.wait_for_timeout(wait)
    return b, pg, errs


VIS = "const vis=e=>!!e && e.checkVisibility({checkVisibilityCSS:true});"
WRITES_DAYS = "(k) => (window.__WRITES||[]).filter(x=>x.table==='days' && x.payload && x.payload.date===k).map(x=>x.payload)"
WRITES_PRIV = "() => (window.__WRITES||[]).filter(x=>x.table==='day_private').map(x=>x.payload)"


async def dates(pg):
    """today, the most recent Saturday and the most recent Tuesday on or before it - device-local"""
    return await pg.evaluate("""() => { const t=window.__HT24.today();
      const back=(d)=>{ const x=new Date(t+'T12:00:00'); while(x.getDay()!==d) x.setDate(x.getDate()-1);
        return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
      return { today:t, sat:back(6), tue:back(2) }; }""")


# =============================================================================================
# A · THE PHONE
# =============================================================================================
async def sec_a(pw):
    print("\n--- A · the phone (<=640px) ---")
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True, '__BLOCKS': True})
    m = await pg.evaluate("() => { " + VIS + """
      const ins=[...document.querySelectorAll('input,textarea,select')].filter(vis)
        .filter(e=>!/^(checkbox|radio|range|button|submit|color)$/i.test(e.type||''));
      const meta=(document.querySelector('meta[name=viewport]')||{}).content||'';
      const rows=[...document.querySelectorAll('#log .li')].filter(vis);
      const r=rows[0], nm=r&&r.querySelector('.nm'), bxw=r&&r.querySelector('.bxw');
      const jb=document.getElementById('iDump').closest('.blk');
      return { small: ins.filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.id||e.className),
        n: ins.length, meta, clr: vis(document.querySelector('.rate .clr')),
        close: ['bClose','tClose'].map(i=>vis(document.getElementById(i))),
        why: vis(document.getElementById('iWhy')),
        scrollH: document.documentElement.scrollHeight,
        rowMin: Math.min(...rows.map(e=>Math.round(e.getBoundingClientRect().height))),
        /* HT-31: `rowMin` is the SHORTEST row; the control below fills the row it is IN, which a
           wrapped name makes taller. Both are reported so neither check has to guess. */
        row0: r && Math.round(r.getBoundingClientRect().height),
        nmFont: nm && getComputedStyle(nm).fontSize,
        bxw: bxw && [Math.round(bxw.getBoundingClientRect().width), Math.round(bxw.getBoundingClientRect().height)],
        tpfx: [...document.querySelectorAll('#log .li .tpfx')].filter(vis).length,
        journalH: Math.round(jb.getBoundingClientRect().height),
        dumpMin: getComputedStyle(document.getElementById('iDump')).minHeight }; }""")
    # AMENDED BY NAME, HT-30 (paste 137 S4.11): four visible fields -> three. The rating's why left
    # the phone on Cory's 9/20 word; the three that remain - Journal, Completed, Prayer - are still
    # asserted to be at or above 16px, which is the whole point of the line (128 A1).
    chk("A1 · every visible text field on phone Today is >= 16px (%d fields)" % m['n'], m['n'] >= 3 and not m['small'], m['small'])
    chk("A1 · the viewport keeps pinch-zoom (no maximum-scale, no user-scalable=no)",
        'maximum-scale' not in m['meta'] and 'user-scalable=no' not in m['meta'].replace(' ', ''), m['meta'])
    chk("A2 · no X beside the rating on the phone", not m['clr'], m['clr'])
    chk("D  · no Close-the-day control on the phone (#bClose, #tClose)", m['close'] == [False, False], m['close'])
    # AMENDED BY NAME, HT-30 (paste 137 S4.11), 2026-09-20. 128 D7 brought the why back to the
    # phone; Cory's 9/20 review takes it off again - "the 'why that number' field is removed from the
    # phone layout (desktop unchanged)". The element and the column are untouched (R70.138), which is
    # why this asserts NOT VISIBLE rather than NOT PRESENT, and the desktop's own D7 below is
    # unchanged and now carries the whole weight of "the why is still an input".
    chk("D7 · the rating's why is OFF the phone (128 D7 superseded by Cory 2026-09-20)", not m['why'], m['why'])
    # A2 · tap the chosen number again clears it
    await pg.click('#rate button[data-r="6"]'); await pg.wait_for_timeout(300)
    on1 = await pg.evaluate("() => [...document.querySelectorAll('#rate button.on')].map(b=>b.getAttribute('data-r'))")
    await pg.click('#rate button[data-r="6"]'); await pg.wait_for_timeout(300)
    on2 = await pg.evaluate("() => [...document.querySelectorAll('#rate button.on')].map(b=>b.getAttribute('data-r'))")
    chk("A2 · tapping the chosen number again clears the rating (the X's job, without the X)", on1 == ['6'] and on2 == [], [on1, on2])
    # A4 · compact, measured against 2,891px / 56px / 15px before (ht_stage/128/measure_phone_before.txt)
    chk("A4 · Today is shorter: scrollHeight %d < 2,891 before, by at least 10%%" % m['scrollH'], m['scrollH'] <= 2601, m['scrollH'])
    # AMENDED BY NAME, HT-30 (paste 137 S3.9): 44 -> 36. Same assertion, same two subjects, one number.
    # AMENDED BY NAME, HT-31 (paste 143 S3.12), 2026-09-22: the row floor is 32 and the checkbox is
    # 44 WIDE by the row's height. Cory asked for thinner rows again; the target got wider on the axis
    # a finger actually needs while the row lost height, so this is not a loosening - the tap area is
    # 44x32.5 where it was 36x36, which is larger.
    chk("A4 · every row is still a >= 32px tap target and the checkbox target is 44 wide by the row",
        m['rowMin'] >= 32 and m['bxw'][0] == 44 and abs(m['bxw'][1] - m['row0']) <= 2,
        [m['rowMin'], m['row0'], m['bxw']])
    chk("A4 · standard names are 14px (15px before) and the duplicate time prefix is gone", m['nmFont'] == '14px' and m['tpfx'] == 0, [m['nmFont'], m['tpfx']])
    # AMENDED BY NAME, HT-30 (paste 137 S3.9 + S4.11): 584 -> 523 px. A measurement replaced by a
    # measurement: the rows above it are a quarter thinner, and the why's field AND its label are off
    # the phone (the first cut hid the field and left the word "Why" standing over nothing - the shot
    # showed it, 545 px was that half-fix measured). The part that matters - the JOURNAL box keeps its
    # 150px floor - is untouched.
    chk("A5 · the journal keeps its size and spacing (block 523px after HT-30's thinner rows and the why leaving the phone, brain dump min-height 150px)",
        m['journalH'] == 523 and m['dumpMin'] == '150px', [m['journalH'], m['dumpMin']])
    chk("A  · zero page errors on phone Today", not errs, errs[:2])
    # the edit sheet's fields are 16px too
    await pg.click('#log .li .edp'); await pg.wait_for_timeout(600)
    sh = await pg.evaluate("() => { " + VIS + " return [...document.querySelectorAll('#esheet input, #esheet textarea, #esheet select')].filter(vis).filter(e=>!/^(checkbox|radio)$/i.test(e.type||'')).map(e=>(e.id||e.className)+':'+getComputedStyle(e).fontSize); }")
    chk("A1 · the edit sheet's fields are >= 16px on the phone", sh and all(float(x.split(':')[-1][:-2]) >= 16 for x in sh), sh)
    await pg.click('#eCancel'); await pg.wait_for_timeout(300)
    # A7 · Advanced, explained
    await pg.click('#bSet'); await pg.wait_for_timeout(700)
    adv = await pg.evaluate("() => document.getElementById('ov').textContent")
    chk("A7 · Settings says what Advanced does, in one line",
        'Shows the older full layout \u2014 every chart, stat, theme and control the simple view hides.' in adv, adv[:200])
    fs = await pg.evaluate("() => { " + VIS + " return [...document.querySelectorAll('#ov input, #ov select, #ov textarea')].filter(vis).filter(e=>!/^(checkbox|radio|button)$/i.test(e.type||'')).map(e=>getComputedStyle(e).fontSize); }")
    chk("A1 · Settings' text fields are >= 16px on the phone", fs and all(float(x[:-2]) >= 16 for x in fs), fs[:6])
    await b.close()

    # A6 + A3 · Views
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True, '__CIRCLE': True})
    await pg.evaluate("() => window.__HT13_TAB('views')"); await pg.wait_for_timeout(1000)
    # HT-30 (paste 137 S6.14): this tab is Cory's ONE Insights page now - his five outputs and the
    # card that explains a rating. Everything A6 and A3 read is one tap down, IN THE SAME ORDER, so
    # the "More" is opened and both checks assert exactly what they asserted before.
    # AMENDED BY NAME, HT-31 (paste 143 S4.14), 2026-09-22: the drawer is HIDDEN by default now - Cory,
    # 9/21, wants four blocks on the phone and nothing under them - so the check UN-HIDES it as well as
    # opening it. Hidden, never deleted (R70.138): every panel below is still there, in the same order,
    # and this line is what proves that sentence rather than taking it on trust.
    await pg.evaluate("() => { const d=document.getElementById('h30InsMore'); "
                      "if(d){ d.removeAttribute('hidden'); d.open = true; } }")
    await pg.wait_for_timeout(600)
    v = await pg.evaluate("() => { " + VIS + """
      const ids=['h16Month','h16Year','h16Score','h16Ins','vWeeksSec','h26Ins','h26Jrn'];
      const els=ids.map(i=>document.getElementById(i)||document.querySelector('.'+i)).filter(vis);
      const cs=e=>{ const c=getComputedStyle(e); return [c.borderTopWidth,c.borderTopStyle,c.backgroundColor,c.paddingLeft,c.paddingRight].join(' '); };
      /* HT-30 (paste 137 S6.14): the panels sit one level down now, inside the Insights page's
         "More", so they are found by WHAT THEY ARE (`.h16p`) rather than by being a direct child of
         the grid. What A6 asserts - every card header reads the same - is unchanged. */
      const heads=[...document.querySelectorAll('.h16p > .sh h2, #h18Group .h18gh')].filter(vis)
        .map(h=>{ const c=getComputedStyle(h); return [c.fontFamily,c.fontSize,c.letterSpacing,c.textTransform,c.color].join('|'); });
      return { order: els.slice().sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(e=>e.id||'vWeeksSec'),
        widths: [...new Set(els.map(e=>Math.round(e.getBoundingClientRect().width)))],
        chrome: [...new Set(els.map(cs))], heads: [...new Set(heads)],
        scTh: [...document.querySelectorAll('#vGroups thead th')].filter(vis).map(t=>t.textContent),
        scG: [...document.querySelectorAll('#vGroups tbody td.g')].map(t=>t.textContent) }; }""")
    # ---- AMENDED BY HT-29 S0 (CC HT 2026-09-15) · R67.2 · paste 133 S0.2, AUDIT rows A26 + A28 ----------
    # TWO CARDS LEFT THE VIEWS TAB, both hidden and neither deleted: GROUP ADHERENCE (`#h16Score`) is not one
    # of Cory's five outputs and is one tap away inside Insights → More → "Every standard, in detail"; and the
    # GROUP card is Insights' third card now, so the phone shows those lines once, not twice. The order of
    # what REMAINS is what this check protects, and it is unchanged.
    # HT-31 (paste 143 S4.13) leaves this line EXACTLY as HT-29 left it. THE MONTH and THE YEAR are two
    # of Cory's four blocks now, so they are cards above the drawer rather than rows inside it - and the
    # six panels still read top to bottom in this order, which is the only thing this line ever claimed.
    chk("A6 · Views has one order: month, year, group + life, life in weeks, insights, journal",
        v['order'] == ['h16Month', 'h16Year', 'h16Ins', 'vWeeksSec', 'h26Ins', 'h26Jrn'], v['order'])
    # AMENDED BY NAME, HT-31 (paste 143 S4.13), 2026-09-22: TWO GROUPS, EACH EQUAL WITHIN ITSELF.
    # THE MONTH and THE YEAR are two of Cory's four blocks now, so they sit in cards on the page while
    # the rest sit in the drawer below it - two containers, each with its own padding, so one number
    # across all six stopped being the right question. What this line is FOR is unchanged and is still
    # enforced: no ragged edges (R70.306). The four cards' own equality is asserted in golden_ht31 S4.
    chk("A6 · equal cards: at most one width per container, one box for all seven",
        len(v['widths']) <= 2 and len(v['chrome']) == 1, [v['widths'], v['chrome']])
    chk("A6 · one header style: every card header and GROUP read the same", len(v['heads']) == 1, v['heads'])
    await pg.wait_for_timeout(2500)
    v2 = await pg.evaluate("() => { " + VIS + " return ['h16Month','h16Year','h16Score','h16Ins','h26Ins','h26Jrn']"
                           ".map(i=>document.getElementById(i)).filter(vis)"
                           ".sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(e=>e.id); }")
    chk("A6 · ...and the same order 2.5 s later, after every layer's timer has fired", v2 == [x for x in v['order'] if x != 'vWeeksSec'], v2)
    # ---- AMENDED BY HT-29 S0 · R67.2 · A28: the scorecard moved behind DETAIL, so its labels are read there ----
    sc = await pg.evaluate("() => { window.__HT29_DETAIL(); return new Promise(r=>setTimeout(r,400)); }")
    sc = await pg.evaluate("() => { " + VIS + """
      return { th:[...document.querySelectorAll('#vGroups thead th')].filter(vis).map(t=>t.textContent),
               g:[...document.querySelectorAll('#vGroups tbody td.g')].map(t=>t.textContent) }; }""")
    bad = [t for t in sc['th'] + sc['g'] if re.search(r'_|[a-z][A-Z]', t) or (t.isupper() and len(t) > 3)]
    # AMENDED BY NAME, HT-31: the labels are the subject of this line, not where they are painted, and
    # a list that came back EMPTY because the panel moved reads as a pass in the old shape (134 R1's
    # exact failure mode). `sc['th']` must be non-empty AND clean, which it already said - the fix is
    # only that it is now read at the width where the scorecard is on screen.
    chk("A3 · the scorecard's labels are words in Title Case, where it lives now (%s)" % ', '.join(sc['th']),
        bool(sc['th']) and not bad, [bad, len(sc['th'])])
    hz = await pg.evaluate("() => ['HT','ht','morning_routine','timeAnchor','STANDARDS','Sabbath','30d','bev inbox'].map(window.__HT28d.humanize)")
    chk("A3 · the humanizer keeps acronyms and turns codes into words",
        hz == ['HT', 'HT', 'Morning Routine', 'Time Anchor', 'Standards', 'Sabbath', '30d', 'BEV Inbox'], hz)
    await pg.evaluate("() => { const t=document.querySelector('#vGroups [data-grp=\"Morning\"]'); t.scrollIntoView(); t.click(); }")
    await pg.wait_for_timeout(700)
    d = await pg.evaluate("() => { " + VIS + """
      const b=document.getElementById('h17DrBody');
      const th=[...b.querySelectorAll('.h28gt th')];
      return { on: document.getElementById('h17Drawer').classList.contains('on'), title:(b.querySelector('h3')||{}).textContent,
        th: th.map(t=>t.textContent), w: th.map(t=>Math.round(t.getBoundingClientRect().width)),
        def: (b.querySelector('.h28gdef')||{}).textContent, labels: [...b.querySelectorAll('.h28gst span')].map(s=>s.textContent),
        rows: b.querySelectorAll('.h28gt tbody tr').length, old: !!b.querySelector('.h17dt'),
        scroll: b.scrollWidth <= b.clientWidth + 1 }; }""")
    defn = await pg.evaluate("() => window.__HT16.ADHERENCE_DEF")
    chk("A3 · Group details is one clean table: Standard · Completion · Rating · Streak",
        d['on'] and d['th'] == ['Standard', 'Completion', 'Rating', 'Streak'] and d['rows'] == 7 and not d['old'], d)
    chk("A3 · equal columns for the three figures", len(set(d['w'][1:])) == 1, d['w'])
    chk("A3 · the group's definition line sits above the table, in Cory's words (HT-16 ADHERENCE_DEF)", d['def'] == defn, d['def'])
    chk("A3 · the heading and every label are humanized (no _ / camelCase / codes), no sideways scroll",
        d['title'] == 'Morning' and not [x for x in d['labels'] + d['th'] if re.search(r'_|[a-z][A-Z]', x)] and d['scroll'],
        [d['title'], d['labels']])
    one = await pg.evaluate("""() => { const h=window.__MOCK_DB.habits.find(x=>x.id==='h3'); h.group_name='Solo';
      window.__HT28d.groupDetails('Solo'); const b=document.getElementById('h17DrBody');
      return { rows: b.querySelectorAll('.h28gt tbody tr').length, note:(b.querySelector('.h28gnote')||{}).textContent }; }""")
    chk("A3 · a one-member group says so", one['rows'] == 1 and 'One standard in this group so far' in (one['note'] or ''), one)
    tg = await pg.evaluate("""async () => { const t=window.__HT24.today(), y=new Date(t+'T12:00:00'); y.setDate(y.getDate()-1);
      const k=y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
      document.getElementById('h17Drawer').classList.remove('on');
      window.__HT24.goDay(k); await new Promise(r=>setTimeout(r,700)); window.__HT24.goDay(t); await new Promise(r=>setTimeout(r,700));
      const rows=document.querySelectorAll('#vGroups tbody tr'), tagged=document.querySelectorAll('#vGroups tbody tr[data-grp]');
      if(tagged[0]) tagged[0].click(); await new Promise(r=>setTimeout(r,500));
      return { rows: rows.length, tagged: tagged.length, open: document.getElementById('h17Drawer').classList.contains('on'),
               table: !!document.querySelector('#h17DrBody .h28gt') }; }""")
    chk("A3 · after moving a day back and forth, a group row still opens Group details (HT-17's tags were lost)",
        tg['rows'] > 0 and tg['tagged'] == tg['rows'] and tg['open'] and tg['table'], tg)
    chk("A  · zero page errors on phone Views", not errs, errs[:2])
    await b.close()

    # A is phone-only: at 1280 the text fields keep their desktop sizes and the drawer keeps HT-17's table
    b, pg, errs = await open_page(pw, 1280, 800, flags={'__BIGSET': True})
    dk = await pg.evaluate("() => { " + VIS + " return { dump:getComputedStyle(document.getElementById('iDump')).fontSize, why:vis(document.getElementById('iWhy')), whyEl: !!document.getElementById('iWhy'), clrHidden: !vis(document.querySelector('.rate .clr')) }; }")
    chk("A1 · desktop text fields are not forced to 16px (the phone rule does not leak)", dk['dump'] != '16px', dk)
    # AMENDED BY NAME, HT-31 (paste 143 S5.16), 2026-09-22: Cory, 9/21 - "on the desktop remove the why
    # journal box as well". HT-30 took it off the phone and this line carried "it is still an input"
    # for the desktop; there is no width left that shows it. The element, the column and every word in
    # it are untouched (R70.138) - which is why this asserts NOT VISIBLE and still asserts PRESENT.
    chk("D7 · the rating's why is off the desktop too, and still present (Cory 2026-09-21)",
        (not dk['why']) and dk.get('whyEl') is not False, dk)
    await pg.evaluate("() => { const t=document.querySelector('#vGroups [data-grp]'); if(t) t.click(); }")
    await pg.wait_for_timeout(600)
    old = await pg.evaluate("() => { const b=document.getElementById('h17DrBody'); return b ? { old: !!b.querySelector('.h17dt'), neu: !!b.querySelector('.h28gt') } : null; }")
    chk("A3 · the desktop drawer is HT-17's, untouched", old and old['old'] and not old['neu'], old)
    await b.close()


# =============================================================================================
# B · THE DESKTOP COMPLETION PANEL
# =============================================================================================
B_BEFORE = {1280: {'logScrollH': 2447, 'single': 47}, 1920: {'logScrollH': 1419, 'single': 47}}

async def sec_b(pw):
    print("\n--- B · the desktop completion panel, one step quieter ---")
    for (w, h) in ((1280, 720), (1920, 1080)):
        b, pg, errs = await open_page(pw, w, h, flags={'__BIGSET': True, '__BLOCKS': True, '__CIRCLE': True}, wait=4000)
        m = await pg.evaluate("""() => { const rows=[...document.querySelectorAll('#h18Comp #log .li')];
          const r=rows[0], B=e=>e?[Math.round(e.getBoundingClientRect().width),Math.round(e.getBoundingClientRect().height)]:null;
          return { scrollH: document.getElementById('log').scrollHeight, single: Math.min(...rows.map(e=>Math.round(e.getBoundingClientRect().height))),
            nm: getComputedStyle(r.querySelector('.nm')).fontSize, lh: parseFloat(getComputedStyle(r.querySelector('.nm')).lineHeight)/parseFloat(getComputedStyle(r.querySelector('.nm')).fontSize),
            bx: B(r.querySelector('.bx')), bxw: B(r.querySelector('.bxw')), edp: B(r.querySelector('.edp')),
            /* HT-31: the controls fill THEIR OWN row, so that row is measured beside them - `single`
               is the shortest row in the list and a wrapped name makes a taller one. */
            row0: Math.round(r.getBoundingClientRect().height) }; }""")
        be = B_BEFORE[w]
        shrink = 1 - m['scrollH'] / be['logScrollH']
        rowd = 1 - m['single'] / be['single']
        chk("B · %d · the list is shorter by >= 10%% (%d -> %d, %.0f%%)" % (w, be['logScrollH'], m['scrollH'], shrink * 100), shrink >= 0.10, m)
        # AMENDED BY NAME, HT-30 (paste 137 S3.9): HT-28 took a 47px row to 40; HT-30 takes it to 30
        # on Cory's "rows thinner". The band is replaced by the exact measurement, which is a stronger
        # check than the band it replaces - and HT-28's own floor is kept beside it.
        # AMENDED BY NAME, HT-31 (paste 143 S3.12), 2026-09-22: 30 -> 26 on the desktop, Cory's "a tad
        # thinner one more time". The exact measurement is still what is asserted, which is the strength
        # of this line; only the number it names has moved, and 26 is this wire's printed floor.
        chk("B · %d · a one-line row is 27px - a 26.5px token rounded (47, then 40, then 30, %d now)" % (w, m['single']),
            m['single'] == 27 and rowd >= 0.10, m['single'])
        chk("B · %d · text 14 -> 12.5px (-11%%), drawn box 22 -> 19px (-14%%), line-height still >= 1.35" % w,
            m['nm'] == '12.5px' and m['bx'] == [19, 19] and m['lh'] >= 1.35, m)
        # AMENDED BY NAME, HT-31 (paste 143 S3.12): 28 WIDE is unchanged and is still asserted; the
        # height follows the row now, because a fixed-height control is a floor under every row holding
        # it and the row had to get thinner. Asserted against the row it sits in, never against nothing.
        chk("B · %d · the hit targets stay 28 wide and fill their row (golden_ht18 S3g)" % w,
            m['bxw'][0] == 28 and m['edp'][0] == 28
            and abs(m['bxw'][1] - m['row0']) <= 2 and abs(m['edp'][1] - m['row0']) <= 2, m)
        chk("B · %d · zero page errors" % w, not errs, errs[:2])
        await b.close()
    css = src(os.path.join(REPO, 'app.css'))
    blk = css.split('HT-28 B \u00b7 THE DESKTOP COMPLETION PANEL', 1)[1].split('\n}', 1)[0]
    sels = [ln.split('{')[0].strip() for ln in blk.split('\n') if '{' in ln and 'html[data-simple]' in ln]
    chk("B · every rule in the block selects inside #h18Comp - no other panel can move (%d rules)" % len(sels),
        sels and all('#h18Comp' in s for s in sels), [s for s in sels if '#h18Comp' not in s][:3])


# =============================================================================================
# C · SYNC
# =============================================================================================
CK = "(h) => { const r=document.querySelector('#log .li[data-h=\"'+h+'\"]'); return r ? r.classList.contains('on') : null; }"
SRV_DAY = "(k) => { const s=JSON.parse(localStorage.getItem('mock.shared.v1')); const r=s.days.find(d=>d.date===k && d.user_id==='u-mock'); return r ? r.checked : null; }"
SRV_PRIV = "(k) => { const s=JSON.parse(localStorage.getItem('mock.shared.v1')); const r=s.day_private.find(d=>d.date===k); return r ? {rating:r.rating, dump:r.brain_dump, why:r.why} : null; }"

async def sec_c(pw):
    print("\n--- C · sync ---")
    b, pg, errs = await open_page(pw, 390, 844)
    k = (await dates(pg))['today']
    cfg = await pg.evaluate("() => window.__HT28c.config()")
    st = await pg.evaluate("() => window.__HT28c.state()")
    chk("C · the pull runs every <= 30 s while the page is visible", cfg['POLL_MS'] <= 30000 and st['nextMs'] == cfg['POLL_MS'], [cfg, st])
    await pg.evaluate("() => { Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); }")
    hid = await pg.evaluate("() => window.__HT28c.state().nextMs")
    await pg.evaluate("() => { Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'}); document.dispatchEvent(new Event('visibilitychange')); }")
    await pg.wait_for_timeout(800)
    vis2 = await pg.evaluate("() => window.__HT28c.state()")
    chk("C · hidden: no pull is scheduled at all; visible again: it pulls at once and resumes",
        hid is None and vis2['nextMs'] == cfg['POLL_MS'] and vis2['pulls'] >= 1, [hid, vis2])
    ids = await pg.evaluate("() => [...document.querySelectorAll('#log .li')].slice(0,3).map(r=>r.getAttribute('data-h'))")
    before = await pg.evaluate("(k) => Object.keys((window.__MOCK_DB.days.find(d=>d.date===k)||{checked:{}}).checked).sort()", k)
    await pg.evaluate("() => { window.__WRITES=[]; }")
    for h in ids:
        await pg.click('#log .li[data-h="%s"]' % h); await pg.wait_for_timeout(100)
    await pg.wait_for_timeout(1400)
    w = await pg.evaluate(WRITES_DAYS, k)
    want = sorted((set(before) ^ set(ids)))
    chk("C · three quick check-offs -> one write that carries all three (the debounce coalesces; the merge keeps every key)", len(w) == 1 and sorted(w[0]['checked'].keys()) == want, [len(w), w and sorted(w[0]['checked'].keys()), want])
    await pg.evaluate("() => { window.__WRITES=[]; }")
    await pg.evaluate("() => document.getElementById('iWhy').blur()")
    await pg.wait_for_timeout(900)
    np = await pg.evaluate(WRITES_PRIV)
    chk("C · a save with nothing changed writes nothing (a stale row can never be written over a newer one)", np == [], np)
    # stress 12: never under a field being typed in
    await pg.click('#iDump'); await pg.keyboard.type('typing'); await pg.wait_for_timeout(100)
    await pg.evaluate("() => window.__HT28c.pull()"); await pg.wait_for_timeout(400)
    ty = await pg.evaluate("() => ({ st: window.__HT28c.state(), v: document.getElementById('iDump').value })")
    chk("C · a pull while someone is typing waits for them (deferred), and the text is untouched", ty['st']['deferred'] and ty['v'].endswith('typing'), ty)
    await pg.click('#bSet'); await pg.wait_for_timeout(600)
    stamp = await pg.evaluate("() => (document.getElementById('h28Synced')||{}).textContent")
    # AMENDED BY NAME, HT-31 (paste 143 S2.8), 2026-09-22: "regular time, not military time"
    # (Cory 9/21) reaches every clock a human reads, and the Session line is one of them. Same
    # subject, same shape - a stamp saying when it last synced - in the form the app now uses.
    chk("C · Settings says 'Synced \u00b7 h:mm AM/PM' on the Session line",
        bool(re.match(r'^Synced \u00b7 \d{1,2}:\d\d[\s\u202f](AM|PM)$', stamp or '')), stamp)
    chk("C · zero page errors", not errs, errs[:2])
    await b.close()

    # offline: saved on the device, replayed on reconnect
    b, pg, errs = await open_page(pw, 390, 844)
    k = (await dates(pg))['today']
    h = await pg.evaluate("() => [...document.querySelectorAll('#log .li')].find(r=>!r.classList.contains('on')).getAttribute('data-h')")
    await pg.evaluate("() => { window.__WRITES=[]; }")
    await pg.context.set_offline(True); await pg.wait_for_timeout(200)
    await pg.click('#log .li[data-h="%s"]' % h); await pg.wait_for_timeout(1200)
    off = await pg.evaluate("(k) => ({ w: (window.__WRITES||[]).filter(x=>x.table==='days').length, q: !!localStorage.getItem('ht28_sync_q_u-mock'), stamp: window.__HT28c.state().stamp, on: document.querySelector('#log .li.on[data-h]') !== null })", k)
    chk("C · offline: the check-off shows, nothing is sent, and it is queued on the device", off['w'] == 0 and off['q'] and off['stamp'].startswith('Offline'), off)
    await pg.context.set_offline(False); await pg.wait_for_timeout(2500)
    on = await pg.evaluate("(a) => ({ w: (window.__WRITES||[]).filter(x=>x.table==='days' && x.payload.date===a.k).map(x=>!!x.payload.checked[a.h]), q: !!localStorage.getItem('ht28_sync_q_u-mock'), st: window.__HT28c.state().state })", {'k': k, 'h': h})
    chk("C · back online: the queued check-off is written and the queue is empty", on['w'] == [True] and not on['q'] and on['st'] == 'ok', on)
    await b.close()

    # offline is not signed out: getUser() fails on the network, the device's session is still there
    b, pg, errs = await open_page(pw, 390, 844, flags={'__GETUSER_OFFLINE': True})
    ol = await pg.evaluate("() => ({ auth: !!document.getElementById('aEmail'), rows: document.querySelectorAll('#log .li').length })")
    chk("C · opening with no network does not show the sign-in screen to someone who never signed out",
        not ol['auth'] and ol['rows'] > 0, ol)
    await b.close()
    b, pg, errs = await open_page(pw, 390, 844, flags={'__GETUSER_OFFLINE': True, '__SIGNED_OUT': True}, wait=1500)
    await pg.evaluate("() => localStorage.removeItem('mock.session')"); await pg.reload(); await pg.wait_for_timeout(1500)
    so = await pg.evaluate("() => !!document.getElementById('aEmail')")
    chk("C · ...and with no session on the device it still asks you to sign in", so, so)
    await b.close()

    # two devices on one server
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    A = await ctx.new_page(); Bp = await ctx.new_page(); errs = []
    for p in (A, Bp):
        p.on('pageerror', lambda e: errs.append(str(e)))
        await p.add_init_script(init_js({'__SHARED_DB': True, '__SYNC_MS': 600000}))
    await A.goto(BASE); await A.wait_for_timeout(500); await A.evaluate("() => localStorage.clear()")
    await A.goto(BASE); await A.wait_for_timeout(3500); await Bp.goto(BASE); await Bp.wait_for_timeout(3500)
    k = (await dates(A))['today']
    h = await A.evaluate("() => [...document.querySelectorAll('#log .li')].find(r=>!r.classList.contains('on')).getAttribute('data-h')")
    await A.click('#log .li[data-h="%s"]' % h); await A.wait_for_timeout(1300)
    await Bp.evaluate("() => window.__HT28c.pull()"); await Bp.wait_for_timeout(700)
    chk("C · two sessions: A's check-off reaches B on B's next pull", await Bp.evaluate(CK, h) is True, await Bp.evaluate("() => window.__HT28c.state()"))
    # HT-30 (paste 137 S1.4): "the second row that is on" is now a WEEKLY standard, because Weekly
    # routine sits above Standards - and a weekly's `on` is period-based (`doneOn` -> `weekDone`), so
    # unchecking it TODAY correctly leaves it on. This walk is about sync, not about weekly semantics,
    # so it picks a daily row and asserts exactly what it always asserted.
    h2 = await Bp.evaluate("""(h) => { const ids = window.__HT25S3.state().habits
          .filter(x => x.cadence !== 'weekly').map(x => String(x.id));
        return [...document.querySelectorAll('#log .li.on')]
          .find(r => r.getAttribute('data-h') !== h && ids.indexOf(r.getAttribute('data-h')) >= 0)
          .getAttribute('data-h'); }""", h)
    h3 = await A.evaluate("(h) => [...document.querySelectorAll('#log .li')].find(r=>!r.classList.contains('on') && r.getAttribute('data-h')!==h).getAttribute('data-h')", h)
    await Bp.click('#log .li[data-h="%s"]' % h2); await Bp.wait_for_timeout(1300)
    await A.click('#log .li[data-h="%s"]' % h3); await A.wait_for_timeout(1300)
    srv = await A.evaluate(SRV_DAY, k)
    chk("C · B unchecks one row while a stale A checks another: both edits are on the server",
        srv and h in srv and h2 not in srv and h3 in srv, [h, h2, h3, sorted((srv or {}).keys())])
    await Bp.evaluate("() => window.__HT28c.pull()"); await A.evaluate("() => window.__HT28c.pull()"); await A.wait_for_timeout(700)
    ca = [await A.evaluate(CK, x) for x in (h, h2, h3)]; cb = [await Bp.evaluate(CK, x) for x in (h, h2, h3)]
    chk("C · ...and both screens converge on it", ca == cb == [True, False, True], [ca, cb])
    await A.fill('#iDump', 'from A'); await A.wait_for_timeout(1100)
    await A.evaluate("() => document.activeElement && document.activeElement.blur()"); await A.wait_for_timeout(800)
    await Bp.click('#rate button[data-r="7"]'); await Bp.wait_for_timeout(1400)
    sp = await A.evaluate(SRV_PRIV, k)
    chk("C · a stale device's rating cannot blank the other device's brain dump", sp and sp['rating'] == 7 and sp['dump'] == 'from A', sp)
    await show_why(A); await show_why(Bp)
    await A.fill('#iWhy', 'why from A'); await A.wait_for_timeout(1100)
    await Bp.fill('#iWhy', 'why from B'); await Bp.wait_for_timeout(1100)
    await Bp.evaluate("() => document.activeElement && document.activeElement.blur()"); await Bp.wait_for_timeout(300)
    await A.evaluate("() => document.activeElement && document.activeElement.blur()"); await A.wait_for_timeout(300)
    await A.evaluate("() => window.__HT28c.pull()"); await A.wait_for_timeout(700)
    await Bp.evaluate("() => window.__HT28c.pull()"); await Bp.wait_for_timeout(700)
    wa = await A.evaluate("() => document.getElementById('iWhy').value"); wb = await Bp.evaluate("() => document.getElementById('iWhy').value")
    ring = await Bp.evaluate("() => window.__HT28c.lost()")
    chk("C · the same field edited on both: the later write wins on both screens", wa == wb == 'why from B', [wa, wb])
    chk("C · ...and the losing edit is kept, not dropped (ring entry: lost 'why from A', kept 'why from B')",
        any(r.get('key') == 'why' and r.get('lost') == 'why from A' and r.get('kept') == 'why from B' for r in ring), ring)
    chk("C · zero page errors on either device", not errs, errs[:2])
    await b.close()
    await sec_c_review(pw)


async def sec_c_review(pw):
    """the failure paths the fresh-context review of 1688104 found - each one reproduced, then held"""
    # R1 · BLOCK: queued edits + a failed load must never reprice a day
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(3500)
    y = await pg.evaluate("() => { const t=window.__HT24.today(), d=new Date(t+'T12:00:00'); d.setDate(d.getDate()-1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }")
    await pg.evaluate("(k) => window.__HT24.goDay(k)", y); await pg.wait_for_timeout(700)
    h = await pg.evaluate("() => [...document.querySelectorAll('#log .li')].find(r=>!r.classList.contains('on')).getAttribute('data-h')")
    await ctx.set_offline(True); await pg.wait_for_timeout(150)
    await pg.click('#log .li[data-h="%s"]' % h); await pg.wait_for_timeout(1200)
    q1 = await pg.evaluate("() => !!localStorage.getItem('ht28_sync_q_u-mock')")
    await pg.close(); await ctx.set_offline(False)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(init_js({'__FAIL_READ': ['habits', 'days', 'day_private']}))
    await pg.goto(BASE); await pg.wait_for_timeout(4500)
    held = await pg.evaluate("() => ({ w:(window.__WRITES||[]).filter(x=>x.table==='days').length, st: window.__HT28c.state() })")
    chk("C · R1 · a queued edit meets a failed load: nothing is written while the load has failed",
        q1 and held['w'] == 0 and held['st']['ops'] >= 1 and held['st']['stamp'].startswith('Not synced'), held)
    await pg.evaluate("() => { window.__FAIL_READ=null; }")
    await pg.evaluate("() => window.__HT28c.pull()"); await pg.wait_for_timeout(1800)
    wr = await pg.evaluate("(a) => { const row=window.__MOCK_DB.days.find(d=>d.date===a.y && d.user_id==='u-mock');"
                           " const w=(window.__WRITES||[]).filter(x=>x.table==='days' && x.payload.date===a.y).map(x=>x.payload);"
                           " return { w: w.map(p=>({ set:p.active_set, pct:p.pct, has:!!p.checked[a.h] })), set: row && row.active_set, ops: window.__HT28c.state().ops }; }",
                           {'y': y, 'h': h})
    last = wr['w'][-1] if wr['w'] else None
    chk("C · R1 · ...then the reload comes first, and the replay reprices the day from ITS OWN snapshot (never [] / 0 %)",
        last and last['has'] and last['set'] == wr['set'] and len(last['set'] or []) > 0 and wr['ops'] == 0, wr)
    await b.close()

    # R2 · BLOCK: a focused, idle field never writes stale text over the other device's newer text
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    A = await ctx.new_page(); Bp = await ctx.new_page(); errs = []
    for p in (A, Bp):
        p.on('pageerror', lambda e: errs.append(str(e)))
        await p.add_init_script(init_js({'__SHARED_DB': True, '__SYNC_MS': 600000, '__SYNC_TYPING_MS': 300}))
    await A.goto(BASE); await A.wait_for_timeout(500); await A.evaluate("() => localStorage.clear()")
    await A.goto(BASE); await A.wait_for_timeout(3500); await Bp.goto(BASE); await Bp.wait_for_timeout(3500)
    k = (await dates(A))['today']
    await A.fill('#iDump', 'desk text'); await A.wait_for_timeout(1200)          # the desk has text of its own first
    await A.evaluate("() => document.activeElement && document.activeElement.blur()"); await A.wait_for_timeout(400)
    await Bp.evaluate("() => window.__HT28c.pull()"); await Bp.wait_for_timeout(600)
    await A.focus('#iDump'); await A.wait_for_timeout(450)                      # focused, idle past the typing hold
    await Bp.fill('#iDump', 'phone text'); await Bp.wait_for_timeout(1200)
    await Bp.evaluate("() => document.activeElement && document.activeElement.blur()"); await Bp.wait_for_timeout(300)
    await A.evaluate("() => window.__HT28c.pull()"); await A.wait_for_timeout(700)
    await A.evaluate("() => document.activeElement && document.activeElement.blur()"); await A.wait_for_timeout(1200)
    sp = await A.evaluate(SRV_PRIV, k)
    ring = await A.evaluate("() => window.__HT28c.lost()")
    chk("C · R2 · leaving a field that sat focused while the other device wrote it writes nothing stale",
        sp and sp['dump'] == 'phone text' and not ring, [sp, ring])
    await A.evaluate("() => window.__HT28c.pull()"); await A.wait_for_timeout(700)
    shown = await A.evaluate("() => document.getElementById('iDump').value")
    chk("C · R2 · ...and once it is not focused, the newer text is what that screen shows", shown == 'phone text', shown)
    await Bp.fill('#iDump', 'phone two'); await Bp.wait_for_timeout(1200)
    await Bp.evaluate("() => document.activeElement && document.activeElement.blur()"); await Bp.wait_for_timeout(300)
    await A.focus('#iDump'); await A.keyboard.press('End'); await A.keyboard.type(' desk'); await A.wait_for_timeout(1300)
    sp2 = await A.evaluate(SRV_PRIV, k)
    ring2 = await A.evaluate("() => window.__HT28c.lost()")
    chk("C · R2 · typing into it anyway is a real conflict: the later write wins and the replaced text is kept",
        sp2 and sp2['dump'] == 'phone text desk' and any(r.get('key') == 'brain_dump' and r.get('lost') == 'phone two' for r in ring2), [sp2, ring2])
    chk("C · R2 · zero page errors", not errs, errs[:2])
    await b.close()

    # R2b · second review: a save of ANOTHER field between the other device's write and this device's typing
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    A = await ctx.new_page(); Bp = await ctx.new_page(); errs = []
    for p in (A, Bp):
        p.on('pageerror', lambda e: errs.append(str(e)))
        await p.add_init_script(init_js({'__SHARED_DB': True, '__SYNC_MS': 600000}))
    await A.goto(BASE); await A.wait_for_timeout(500); await A.evaluate("() => localStorage.clear()")
    await A.goto(BASE); await A.wait_for_timeout(3500); await Bp.goto(BASE); await Bp.wait_for_timeout(3500)
    k = (await dates(A))['today']
    await A.fill('#iDump', 'desk text'); await A.wait_for_timeout(1200)
    await A.evaluate("() => document.activeElement && document.activeElement.blur()"); await A.wait_for_timeout(400)
    await Bp.evaluate("() => window.__HT28c.pull()"); await Bp.wait_for_timeout(600)
    await Bp.fill('#iDump', 'phone two'); await Bp.wait_for_timeout(1200)
    await Bp.evaluate("() => document.activeElement && document.activeElement.blur()"); await Bp.wait_for_timeout(300)
    await A.click('#rate button[data-r="7"]'); await A.wait_for_timeout(1300)      # A saves a DIFFERENT field
    await A.focus('#iDump'); await A.keyboard.press('End'); await A.keyboard.type(' desk'); await A.wait_for_timeout(1300)
    sp3 = await A.evaluate(SRV_PRIV, k)
    ring3 = await A.evaluate("() => window.__HT28c.lost()")
    chk("C · R2b · a save of another field in between never takes in text the box is not showing: typing on is a logged conflict",
        sp3 and any(r.get('key') == 'brain_dump' and r.get('lost') == 'phone two' for r in ring3), [sp3, ring3])
    await b.close()

    # R8 · second review: unsynced journal edits survive the reload a failed load needs (laid back on at once)
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(init_js({'__SHARED_DB': True, '__SYNC_MS': 600000}))
    await pg.goto(BASE); await pg.wait_for_timeout(500); await pg.evaluate("() => localStorage.clear()")
    await pg.close()
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(init_js({'__SHARED_DB': True, '__SYNC_MS': 600000, '__FAIL_READ': ['day_private']}))
    await pg.goto(BASE); await pg.wait_for_timeout(3800)
    k = (await dates(pg))['today']
    await show_why(pg)
    await pg.fill('#iWhy', 'offline why'); await pg.wait_for_timeout(1000)          # held: the load failed
    held8 = await pg.evaluate("() => window.__HT28c.state().ops")
    await pg.evaluate("() => { window.__FAIL_READ=null; window.__LAG=1500; window.__LAG_TABLE='habits'; }")
    await pg.evaluate("() => { window.__HT28c.pull(); }")
    await pg.wait_for_timeout(1250)                                                   # load() is still reading habits
    await pg.focus('#iWhy'); await pg.keyboard.press('End'); await pg.keyboard.type('!')
    await pg.wait_for_timeout(9000)                                                   # debounce lands during the probe; reload ends
    r8 = await pg.evaluate("(k) => ({ srv: (JSON.parse(localStorage.getItem('mock.shared.v1')).day_private.find(d=>d.date===k)||{}).why, ops: window.__HT28c.state().ops, box: document.getElementById('iWhy').value })", k)
    chk("C · R8 · an edit made while the load had failed is still the text after the reload - on the server and on screen",
        held8 >= 1 and r8['srv'] == 'offline why!' and r8['box'] == 'offline why!' and r8['ops'] == 0, [held8, r8])
    await b.close()

    # R9 · second review: one network blip on a column probe is a failed load, not a missing column
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(init_js({'__SHARED_DB': True, '__SYNC_MS': 600000}))
    await pg.goto(BASE); await pg.wait_for_timeout(500); await pg.evaluate("() => localStorage.clear()")
    await pg.close()
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("window.__SHARED_DB=true; window.__SYNC_MS=600000; if(!sessionStorage.getItem('r9')){ sessionStorage.setItem('r9','1'); window.__FAIL_ONCE={day_private:1}; }")
    await pg.goto(BASE); await pg.wait_for_timeout(1200)
    first = await pg.evaluate("() => window.__HT28c.state()")
    await pg.wait_for_timeout(3500)                                                   # the reload the failed load schedules
    k = (await dates(pg))['today']
    await pg.fill('#iDump', 'dump after a blip'); await pg.wait_for_timeout(1400)
    await pg.evaluate("() => document.activeElement && document.activeElement.blur()"); await pg.wait_for_timeout(900)
    r9 = await pg.evaluate("(k) => ({ srv: (JSON.parse(localStorage.getItem('mock.shared.v1')).day_private.find(d=>d.date===k)||{}).brain_dump, st: window.__HT28c.state().state })", k)
    chk("C · R9 · a blip on the brain-dump probe is reported as a failed load, and the brain dump still saves after the reload",
        not str(first.get('stamp', '')).startswith('Synced') and r9['srv'] == 'dump after a blip' and r9['st'] == 'ok', [first, r9])
    chk("C · R8/R9 · zero page errors", not errs, errs[:2])
    await b.close()

    # R3 · an uncheck on a day older than any window is written. On __SHARED_DB, because the plain mock hands
    # the app the server's own row object and so can never hold a server copy that still has the check.
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(init_js({'__SHARED_DB': True, '__SYNC_MS': 600000}))
    await pg.goto(BASE); await pg.wait_for_timeout(500); await pg.evaluate("() => localStorage.clear()")
    await pg.goto(BASE); await pg.wait_for_timeout(3500)
    old = await pg.evaluate("() => { const t=window.__HT24.today(), d=new Date(t+'T12:00:00'); d.setDate(d.getDate()-25); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }")
    await pg.evaluate("(k) => window.__HT24.goDay(k)", old); await pg.wait_for_timeout(700)
    oh = await pg.evaluate("() => { const r=[...document.querySelectorAll('#log .li.on')][0]; return r && r.getAttribute('data-h'); }")
    await pg.evaluate("() => { window.__WRITES=[]; }")
    await pg.click('#log .li[data-h="%s"]' % oh); await pg.wait_for_timeout(1300)
    ow = await pg.evaluate("(a) => ({ w:(window.__WRITES||[]).filter(x=>x.table==='days' && x.payload.date===a.k).map(x=>!!x.payload.checked[a.h]), ops: window.__HT28c.state().ops, srv: (JSON.parse(localStorage.getItem('mock.shared.v1')).days.find(d=>d.date===a.k && d.user_id==='u-mock')||{checked:{}}).checked[a.h] || null })", {'k': old, 'h': oh})
    chk("C · R3 · unticking on a day 25 days back is written and stays unticked on the server",
        ow['w'][-1:] == [False] and ow['ops'] == 0 and ow['srv'] is None, ow)
    await b.close()

    # R4 · a read refused for a reason that is not the network writes nothing and keeps the edit
    b, pg, errs = await open_page(pw, 390, 844)
    k = (await dates(pg))['today']
    await pg.evaluate("() => { window.__WRITES=[]; window.__FAIL_READ=['days']; window.__FAIL_READ_MSG='HTTP 500 upstream error'; }")
    h = await pg.evaluate("() => [...document.querySelectorAll('#log .li')].find(r=>!r.classList.contains('on')).getAttribute('data-h')")
    await pg.click('#log .li[data-h="%s"]' % h); await pg.wait_for_timeout(1300)
    r4 = await pg.evaluate("() => ({ w:(window.__WRITES||[]).filter(x=>x.table==='days').length, st: window.__HT28c.state() })")
    chk("C · R4 · a 500 on the read: no write, the edit stays queued, the state says not synced",
        r4['w'] == 0 and r4['st']['ops'] >= 1 and r4['st']['state'] == 'error', r4)
    await pg.evaluate("() => { window.__FAIL_READ=null; }")
    await pg.evaluate("() => window.__HT28c.pull()"); await pg.wait_for_timeout(1500)
    r4b = await pg.evaluate("(a) => ({ w:(window.__WRITES||[]).filter(x=>x.table==='days' && x.payload.date===a.k).map(x=>!!x.payload.checked[a.h]), ops: window.__HT28c.state().ops })", {'k': k, 'h': h})
    chk("C · R4 · ...and it is written when the read works again", r4b['w'][-1:] == [True] and r4b['ops'] == 0, r4b)
    await b.close()

    # R5 · typing on through a save does not fill the ring with false conflicts
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(init_js({'__SHARED_DB': True, '__SYNC_MS': 600000, '__LAG_WRITE': 900}))
    await pg.goto(BASE); await pg.wait_for_timeout(500); await pg.evaluate("() => localStorage.clear()")
    await pg.goto(BASE); await pg.wait_for_timeout(3500)
    k = (await dates(pg))['today']
    await show_why(pg)
    await pg.fill('#iWhy', 'hel'); await pg.wait_for_timeout(1100)              # the save is now IN FLIGHT (900 ms write)
    await pg.focus('#iWhy'); await pg.keyboard.press('End'); await pg.keyboard.type('lo'); await pg.wait_for_timeout(4000)
    r5 = await pg.evaluate("(k) => ({ ring: window.__HT28c.lost(), ops: window.__HT28c.state().ops, srv: (JSON.parse(localStorage.getItem('mock.shared.v1')).day_private.find(d=>d.date===k)||{}).why })", k)
    chk("C · R5 · typing on through a save: the text lands whole and the ring stays empty",
        r5['srv'] == 'hello' and not r5['ring'] and r5['ops'] == 0, r5)
    await b.close()

    # R6 · the ring and the queue belong to the account, and signing out clears them from the device
    b, pg, errs = await open_page(pw, 390, 844)
    await pg.evaluate("() => { localStorage.setItem('ht28_sync_lost_u-mock', JSON.stringify([{table:'day_private', key:'why', lost:'x'}])); }")
    await pg.click('#bSet'); await pg.wait_for_timeout(600)
    await pg.click('#bOut'); await pg.wait_for_timeout(3500)
    r6 = await pg.evaluate("() => Object.keys(localStorage).filter(k=>k.indexOf('ht28_sync')===0)")
    chk("C · R6 · after Sign out no sync key of the account is left on the device", r6 == [], r6)
    await b.close()

    # R7 · a failed load is never stamped "Synced"
    b, pg, errs = await open_page(pw, 390, 844, flags={'__FAIL_READ': ['habits', 'days', 'day_private']})
    await pg.click('#bSet'); await pg.wait_for_timeout(600)
    s7 = await pg.evaluate("() => (document.getElementById('h28Synced')||{}).textContent")
    chk("C · R7 · Settings does not say Synced when nothing loaded", s7 and not s7.startswith('Synced'), s7)
    await b.close()


# =============================================================================================
# D · FIVE INPUTS STILL WRITE
# =============================================================================================
async def sec_d(pw):
    print("\n--- D · close-the-day gone; all five inputs still write ---")
    # HT-30 (paste 137 S4.11): 390 -> 1280. What this walk asserts is that all FIVE inputs still
    # write - the check-offs, the rating, its why, the journal, completed and prayer. Cory's 9/20
    # ruling takes the WHY off the phone's layout (the column and the desktop are untouched), so the
    # phone is the one width where a person cannot type into it any more. The walk moves to where
    # all five are on screen; not one of its assertions changed.
    b, pg, errs = await open_page(pw, 1280, 900, touch=False)
    k = (await dates(pg))['today']
    await pg.evaluate("() => { window.__WRITES=[]; }")
    h = await pg.evaluate("() => [...document.querySelectorAll('#log .li')].find(r=>!r.classList.contains('on')).getAttribute('data-h')")
    await pg.click('#log .li[data-h="%s"]' % h); await pg.wait_for_timeout(900)
    await pg.click('#rate button[data-r="8"]'); await pg.wait_for_timeout(900)
    await show_why(pg)
    await pg.fill('#iWhy', 'a good day'); await pg.wait_for_timeout(900)
    await pg.fill('#iDump', 'dump line'); await pg.wait_for_timeout(900)
    await pg.fill('#iTasks', '- one'); await pg.wait_for_timeout(900)
    await pg.fill('#iPrayer', 'thanks'); await pg.wait_for_timeout(1200)
    dw = await pg.evaluate(WRITES_DAYS, k); pw_ = await pg.evaluate(WRITES_PRIV)
    last = {}
    for p in pw_:
        last.update({kk: vv for kk, vv in p.items() if kk in ('rating', 'why', 'brain_dump', 'tasks', 'prayer')})
    chk("D · check-off writes (days.checked)", dw and dw[-1]['checked'].get(h), dw[-1:] if dw else dw)
    chk("D · rating + why, brain dump, completed, prayer write (day_private)",
        last.get('rating') == 8 and last.get('why') == 'a good day' and last.get('brain_dump') == 'dump line'
        and last.get('tasks') == '- one' and last.get('prayer') == 'thanks', last)
    chk("D · zero page errors", not errs, errs[:2])
    await b.close()


# =============================================================================================
# E · SABBATH, THE GRAMMAR, THE SECTIONS, THE DAYS CONTROL
# =============================================================================================
async def sec_e(pw):
    print("\n--- E · Saturday only, one check mark ---")
    b, pg, errs = await open_page(pw, 390, 844, flags={'__DOW': True, '__BLOCKS': True})
    rt = await pg.evaluate("""() => { const P=window.__HT24.parseCadence, Z=window.__HT24.serializeCadence;
      return ['daily','weekly','dow:6','dow:1,3','dow:3,1,1','dow:0,1,2,3,4,5,6','dow:','dow:9','nonsense'].map(c=>[c, Z(P(c)), Z(P(Z(P(c))))]); }""")
    exp = {'daily': 'daily', 'weekly': 'weekly', 'dow:6': 'dow:6', 'dow:1,3': 'dow:1,3', 'dow:3,1,1': 'dow:1,3',
           'dow:0,1,2,3,4,5,6': 'daily', 'dow:': 'daily', 'dow:9': 'daily', 'nonsense': 'daily'}
    chk("E11 · one parser, one serializer; every string round-trips to a form the renderer reads",
        all(exp[c] == s1 == s2 for c, s1, s2 in rt), rt)
    dd = await dates(pg)
    lo = await pg.evaluate("(d) => [window.__HT24.dueOn({cadence:'dow:6'}, d.sat), window.__HT24.dueOn({cadence:'dow:6'}, d.tue)]", dd)
    chk("E12 · weekday is device-local: dow:6 is due on %s and not on %s" % (dd['sat'], dd['tue']), lo == [True, False], lo)
    # Tuesday
    await pg.evaluate("(k) => window.__HT24.goDay(k)", dd['tue']); await pg.wait_for_timeout(700)
    tue = await pg.evaluate("() => { " + VIS + " return { rows:[...document.querySelectorAll('#log .li')].filter(vis).map(r=>r.getAttribute('data-h')), daily: window.__HT24.daily().map(h=>h.id) }; }")
    chk("E12 · Tuesday: the Saturday standard is not rendered and not in the day's denominator",
        'h1' not in tue['rows'] and 'h1' not in tue['daily'] and len(tue['rows']) > 0, tue)
    await pg.evaluate("() => { window.__WRITES=[]; }")
    t0 = [x for x in tue['rows'] if x not in ('h1',)][0]
    await pg.click('#log .li[data-h="%s"]' % t0); await pg.wait_for_timeout(1300)
    tw = await pg.evaluate(WRITES_DAYS, dd['tue'])
    chk("E12 · Tuesday's saved active_set leaves it out, and pct is over the day's own due items",
        tw and 'h1' not in tw[-1]['active_set'] and tw[-1]['pct'] == js_round(100 * len([x for x in tw[-1]['active_set'] if tw[-1]['checked'].get(x)]) / len(tw[-1]['active_set'])),
        tw[-1:] if tw else tw)
    # Saturday
    await pg.evaluate("(k) => window.__HT24.goDay(k)", dd['sat']); await pg.wait_for_timeout(900)
    sat = await pg.evaluate("() => { " + VIS + """
      const kids=[...document.querySelectorAll('#log > *')].filter(vis);
      const heads=kids.filter(e=>e.classList.contains('grp')).map(e=>e.textContent.trim());
      /* HT-29 S2.10 (R67.2): the Sabbath is placed in NIGHT ROUTINE now - it was the head of ANYTIME when
         the three buckets were computed. The section it leads is what moved; leading it is what is tested. */
      const SEC29='Night routine';
      const ai=kids.findIndex(e=>e.classList.contains('grp') && [SEC29,'ANYTIME'].indexOf(e.textContent.trim())>=0);
      const first=kids.slice(ai+1).find(e=>e.classList.contains('li'));
      const row=document.querySelector('#log .li[data-h="h1"]');
      const shown=row?[...row.querySelectorAll('.pat,.dat,.tpfx,.wk,.cue,.mn,.ad,.back')].filter(vis).length:null;
      return { heads, firstAnytime: first && first.getAttribute('data-h'), sab: row && row.classList.contains('h28sab'), shown,
        daily: window.__HT24.daily().map(h=>h.id) }; }""")
    chk("E14 · Saturday: the Sabbath leads its section as one check mark (no time, chip, minutes or percent)",
        sat['firstAnytime'] == 'h1' and sat['sab'] and sat['shown'] == 0, sat)
    # AMENDED BY HT-29 S2 · R67.2 · paste 133 Ruling 3: four placed sections, in this order.
    # AMENDED BY NAME, HT-30 (paste 137 S1.4), 2026-09-20: Cory's review swaps the last two and
    # renames the fourth. E14 asserts the same property about the same four names.
    # AMENDED BY HT-194 S2 (R67.2, Cory 2026-09-24): Standards before Weekly routine; names unchanged.
    SECS29 = ['Morning routine', 'Night routine', 'Standards', 'Weekly routine']
    chk("E14 · the sections are Morning routine, Night routine, Standards, Weekly routine",
        sat['heads'] == [s for s in SECS29 if s in sat['heads']] and sat['heads'], sat['heads'])
    chk("F16 · Saturday: the Sabbath is one ordinary due item (in the denominator, weight 1)", 'h1' in sat['daily'], sat['daily'])
    await pg.evaluate("() => { window.__WRITES=[]; }")
    await pg.click('#log .li[data-h="h1"]'); await pg.wait_for_timeout(1300)
    sw = await pg.evaluate(WRITES_DAYS, dd['sat'])
    ok16 = sw and 'h1' in sw[-1]['active_set'] and sw[-1]['pct'] == js_round(
        100 * len([x for x in sw[-1]['active_set'] if sw[-1]['checked'].get(x)]) / len(sw[-1]['active_set']))
    chk("F16 · ticking it moves Saturday's % by exactly one item's share - no boost, no cap", ok16, sw[-1:] if sw else sw)
    chk("E · zero page errors", not errs, errs[:2])
    await b.close()

    # E13 · a legacy daily Sabbath migrates to dow:6 once, under the signed-in session
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SABBATH': True})
    await pg.wait_for_timeout(600)
    mg = await pg.evaluate("() => ({ st: window.__h28SabMig, ups: (window.__UPDATES||[]).filter(u=>u[0]==='habits' && u[1] && u[1].cadence).map(u=>u[1].cadence) })")
    await pg.evaluate("() => window.__HT28.repaint()"); await pg.wait_for_timeout(400)
    mg2 = await pg.evaluate("() => (window.__UPDATES||[]).filter(u=>u[0]==='habits' && u[1] && u[1].cadence).length")
    chk("E13 · a Sabbath still stored as daily becomes dow:6 on load - once", mg['st'] == 'migrated' and mg['ups'] == ['dow:6'] and mg2 == 1, [mg, mg2])
    await b.close()

    # E13 · only the row HT-19 created: a person's own daily "Sabbath walk" is left exactly as saved
    b, pg, errs = await open_page(pw, 390, 844, flags={'__OWN_SABBATH': True})
    await pg.wait_for_timeout(600)
    own = await pg.evaluate("() => { " + VIS + " return { st: window.__h28SabMig, ups: (window.__UPDATES||[]).filter(u=>u[0]==='habits' && u[1] && u[1].cadence).length, shown: vis(document.querySelector('#log .li[data-h=\"h3\"]')), due: window.__HT24.dowOf({ name:'Sabbath walk', group_name:'Morning', cadence:'daily' }) }; }")
    chk("E13 · a person's own daily 'Sabbath walk' is not migrated, not read as Saturday-only, and shows today",
        own['ups'] == 0 and own['shown'] and own['due'] is None and own['st'] in ('none', 'done-before'), own)
    await b.close()

    # E15 + F18 · the editor's Days control and the rests-on-Sabbath switch
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True})
    await pg.click('#log .li[data-h="h0"] .edp'); await pg.wait_for_timeout(700)
    await pg.evaluate("() => { const d=document.getElementById('h30More'); if(d) d.open = true; }")  # HT-30 S3.8: the depth is one tap down
    ed = await pg.evaluate("() => ({ opts:[...document.querySelectorAll('#eCad option')].map(o=>o.value), q:[...document.querySelectorAll('#eDowQ .dowqb')].map(b=>b.textContent.trim()), rest: !!document.getElementById('eRest') })")
    chk("E15 · Days: Every day · Certain days · Once a week, with Weekdays and Weekends presets",
        ed['opts'] == ['daily', 'dow', 'weekly'] and [x.lower() for x in ed['q']] == ['weekdays', 'weekends'] and ed['rest'], ed)
    await pg.select_option('#eCad', 'dow'); await pg.wait_for_timeout(150)
    await pg.click('#eDowQ .dowqb[data-q="1,2,3,4,5"]'); await pg.wait_for_timeout(150)
    await pg.evaluate("() => { window.__UPDATES=[]; }")
    await pg.click('#eSave'); await pg.wait_for_timeout(900)
    u1 = await pg.evaluate("() => (window.__UPDATES||[]).filter(u=>u[0]==='habits').map(u=>u[1].cadence)")
    chk("E15 · Weekdays saves as dow:1,2,3,4,5", u1[-1:] == ['dow:1,2,3,4,5'], u1)
    await pg.click('#log .li[data-h="h2"] .edp'); await pg.wait_for_timeout(700)
    await pg.evaluate("() => { const d=document.getElementById('h30More'); if(d) d.open = true; }")  # HT-30 S3.8: the depth is one tap down
    await pg.check('#eRest'); await pg.evaluate("() => { window.__UPDATES=[]; }")
    await pg.click('#eSave'); await pg.wait_for_timeout(900)
    u2 = await pg.evaluate("() => (window.__UPDATES||[]).filter(u=>u[0]==='habits').map(u=>u[1].cadence)")
    chk("F18 · Rests on Sabbath (default off) saves as every day but Saturday", u2[-1:] == ['dow:0,1,2,3,4,5'], u2)
    await pg.click('#log .li[data-h="h11"] .edp'); await pg.wait_for_timeout(700)
    await pg.evaluate("() => { const d=document.getElementById('h30More'); if(d) d.open = true; }")  # HT-30 S3.8: the depth is one tap down
    # the depth is OPEN for this read on purpose: inside a closed <details> `vis()` is false for the
    # wrong reason, and this line would pass while proving nothing.
    wk = await pg.evaluate("() => { " + VIS + " return { cad: document.getElementById('eCad').value, restShown: vis(document.getElementById('eRestFld')), restOff: !document.getElementById('eRest').checked }; }")
    chk("F18 · a weekly standard shows no rests switch", wk['cad'] == 'weekly' and not wk['restShown'], wk)
    await b.close()


# =============================================================================================
# F · THE SABBATH'S OWN HONOUR, AND THE REST SEED
# =============================================================================================
async def sec_f(pw):
    print("\n--- F · Sabbaths kept, rings, the rest seed ---")
    b, pg, errs = await open_page(pw, 1280, 900, flags={'__DOW': True}, wait=4000)
    ln = await pg.evaluate("() => (document.getElementById('h28Sab')||{}).textContent")
    chk("F17 · the Insights line reads 'Sabbaths kept \u00b7 N in a row \u00b7 M of the last K'",
        bool(re.match(r'^Sabbaths kept \u00b7 \d+ in a row \u00b7 \d+ of the last \d+$', ln or '')), ln)
    await pg.wait_for_timeout(600)
    rg = await pg.evaluate("""() => { const sh=window.__HT28.sabHistory(); const t=window.__HT24.today();
      const rings=[...document.querySelectorAll('#vMonth .h28ring')];
      const sats=[...document.querySelectorAll('#vMonth circle.hit[data-vgd]')].map(c=>c.getAttribute('data-vgd'))
        .filter(k=>new Date(k+'T12:00:00').getDay()===6 && k>=sh.first && k<=t && !(k===t && !sh.kept(k)));
      return { first: sh.first, rings: rings.length, sats: sats.length, kept: rings.filter(r=>r.classList.contains('kept')).length,
        before: [...document.querySelectorAll('#vMonth circle.hit[data-vgd]')].map(c=>c.getAttribute('data-vgd')).filter(k=>k<sh.first && new Date(k+'T12:00:00').getDay()===6).length }; }""")
    chk("F17 · a ring on every Saturday of the month since the first (filled kept, hollow missed), none before it",
        rg['first'] and rg['rings'] == rg['sats'] and rg['rings'] > 0, rg)
    chk("F · zero page errors", not errs, errs[:2])
    await b.close()

    # F19 · the add-link. The payload here is a neutral test list: no person's standards live in this public repo.
    items = [{'n': 'Test evening one', 't': '18:30', 'd': 'first definition'},
             {'n': 'Test evening two', 't': None, 'd': 'second definition'},
             {'n': 'Test evening three', 't': '21:45', 'd': None}]
    link = add_link(items)
    names = [x['n'] for x in items]
    b, pg, errs = await open_page(pw, 1280, 900, flags={'__BIGSET': True, '__BLOCKS': True, '__PERSIST': True}, wait=800)
    await pg.evaluate("() => localStorage.removeItem('mock.habits.v1')")   # a clean persisted list, once
    await pg.goto(BASE + link); await pg.reload(); await pg.wait_for_timeout(4000)   # a hash-only goto is not a load
    card = await pg.evaluate("() => { const c=document.getElementById('h28First'); return c && c.classList.contains('on') ? c.getAttribute('data-kind') : null; }")
    chk("F19 · an add-link proposes its standards on a card (nothing is added before the tap)",
        card == 'add' and await pg.evaluate("() => (window.__INSERTS||[]).length") == 0, card)
    before = await pg.evaluate("() => JSON.stringify(window.__MOCK_DB.habits.map(h=>[h.id,h.name,h.cadence,h.sort_order,h.time_anchor||null]))")
    await pg.evaluate("() => { window.__INSERTS=[]; window.__UPDATES=[]; }")
    await pg.click('#h28Seed'); await pg.wait_for_timeout(2500)
    ins = await pg.evaluate("() => (window.__INSERTS||[]).filter(i=>i[0]==='habits').map(i=>[].concat(i[1]).map(r=>[r.name,r.cadence,r.time_anchor||null,r.notes||null]))")
    flat = [r for group in ins for r in group]
    chk("F19 · one tap inserts the three, daily, with their times and definitions",
        flat == [['Test evening one', 'daily', '18:30', 'first definition'],
                 ['Test evening two', 'daily', None, 'second definition'],
                 ['Test evening three', 'daily', '21:45', None]], flat)
    order = await pg.evaluate("() => [...document.querySelectorAll('#log > *')].map(e=>e.classList.contains('grp')?'#'+e.textContent.trim():e.getAttribute('data-h')&&(window.__MOCK_DB.habits.find(h=>h.id===e.getAttribute('data-h'))||{}).name).filter(Boolean)")
    # AMENDED by WIRE HT-29 (paste 133 Ruling 3, Cory 2026-09-15): "Morning routine · Night routine ·
    # Standards · Weekly ... a standard sits where HE put it, never where the clock would put it."
    # TIMED and ANYTIME are gone, so this reads the two sections a NEW standard lands in: one with a
    # planned time starts in Morning routine, one without starts in Standards. Same claim, current shape.
    # AMENDED BY NAME, HT-31 (paste 143 S1.6), 2026-09-22: all three land in STANDARDS, times and all.
    # Cory, 9/21: "when I set any nightly time it appears always in the morning routine" - the clause
    # that sent a timed row to Morning is the defect, so an added standard now lands in Standards and he
    # moves it where he wants it, which is Ruling 3's own sentence ("a standard sits where HE put it").
    # THE LINE GOT STRONGER, not weaker: it used to read `index()` on a header that might not exist and
    # would have CRASHED the section rather than failing it (134 R1), and now it asserts the header is
    # present before it asserts what is under it.
    # AMENDED BY HT-194 S3 (R67.2): an EMPTY section now renders its header (stress 3 - a drop target), so
    # '#Morning routine' is present with nothing under it. The claim is unchanged and asserted directly: the
    # header each new row sits under is Standards.
    def under(n):
        i = order.index(n)
        return next((x for x in reversed(order[:i]) if x.startswith('#')), None)
    chk("F19 · they render on a weekday: all three in Standards, because a clock places nothing",
        '#Standards' in order and all(n in order and under(n) == '#Standards' for n in names), order)
    after = await pg.evaluate("(n) => JSON.stringify(window.__MOCK_DB.habits.filter(h=>n.indexOf(h.name)<0).map(h=>[h.id,h.name,h.cadence,h.sort_order,h.time_anchor||null]))", names)
    ups = await pg.evaluate("() => (window.__UPDATES||[]).filter(u=>u[0]==='habits').length")
    chk("F19 · every existing standard is untouched", before == after and ups == 0, [ups])
    chk("F19 · the link leaves the address bar", await pg.evaluate("() => location.hash") == '', await pg.evaluate("() => location.hash"))
    await pg.goto(BASE + link); await pg.reload(); await pg.wait_for_timeout(4000)
    again = await pg.evaluate("(n) => ({ btn: !!document.getElementById('h28Seed'), n: window.__MOCK_DB.habits.filter(h=>n.indexOf(h.name)>=0).length })", names)
    chk("F19 · the same link again adds nothing (idempotent by name)", not again['btn'] and again['n'] == 3, again)
    await pg.goto(BASE + '#add=not-a-real-payload'); await pg.reload(); await pg.wait_for_timeout(4000)
    bad = await pg.evaluate("() => ({ card: !!(document.getElementById('h28First') && document.getElementById('h28First').classList.contains('on')), hash: location.hash })")
    chk("F19 · an unreadable link offers nothing and leaves the address bar", not bad['card'] and bad['hash'] == '', bad)
    chk("F19 · zero page errors", not errs, errs[:2])
    await b.close()
    # the guard names nothing itself: candidate ALL-CAPS phrases are hashed and compared with the hashes of the
    # three names the paste gave, so this public file never carries the list it keeps out
    import hashlib
    js = src(os.path.join(REPO, 'app.js'))
    banned = {'256ef5daad9b45e3', 'f7320ad2a8110e70', 'ab56dbbad0d3a134'}
    cands = set(re.findall(r"[A-Z]{3,}(?: [A-Z]{2,}){0,2}", js))
    hits = [c for c in cands if hashlib.sha256(c.encode('utf-8')).hexdigest()[:16] in banned]
    chk("F19 · no rest-standard list is written into the public code (the link carries it)", not hits, len(hits))


# =============================================================================================
# G · ANDREW
# =============================================================================================
async def sec_g(pw):
    print("\n--- G · a stranger signs up alone ---")
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SIGNED_OUT': True, '__NO_HABITS': True, '__PERSIST': True}, wait=1200)
    await pg.evaluate("() => { localStorage.clear(); }")
    await pg.reload(); await pg.wait_for_timeout(1500)
    au = await pg.evaluate("() => ({ auth: !!document.getElementById('aEmail'), priv: (document.getElementById('aPriv')||{}).textContent, fs:[...document.querySelectorAll('#aEmail,#aPass')].map(e=>getComputedStyle(e).fontSize) })")
    chk("G21 · signed out, the way in is the sign-in / create screen (16px fields)", au['auth'] and au['fs'] == ['16px', '16px'], au)
    chk("G22 · the privacy statement is on it, verbatim", au['priv'] == PRIV_LINE, au['priv'])
    await pg.fill('#aEmail', 'andrew@example.com'); await pg.fill('#aPass', 'fixture-only')
    await pg.click('#aUp'); await pg.wait_for_timeout(4000)
    s = await pg.evaluate("() => { const c=document.getElementById('h28First'); return { kind: c && c.classList.contains('on') ? c.getAttribute('data-kind') : null, lines:[...document.querySelectorAll('#h28First .h28l li')].map(l=>l.textContent), auth: JSON.parse(localStorage.getItem('mock.auth')||'[]'), rows: document.querySelectorAll('#log .li').length, ex: !!document.querySelector('#log .h28ex'), add: !!document.querySelector('#log .h28add') }; }")
    chk("G21 · Create signs up (the confirmation link returns to the app)",
        s['auth'] and s['auth'][0]['kind'] == 'signUp' and (s['auth'][0]['redirect'] or '').endswith('index.html'), s['auth'])
    # AMENDED BY NAME, HT-31 (paste 143 S6.20), 2026-09-22: five lines -> six. The new one names the four
    # sections and says the person places them - the one thing a new account cannot work out from four
    # bare headers, and the sentence Cory's 9/15 ruling turns on. The card's SHAPE is what this line
    # claims and that is unchanged; G22 below still pins the LAST line, so the statement stays last.
    chk("G23 · a new account opens on the six-line card", s['kind'] == 'first' and len(s['lines']) == 6, s)
    chk("G22 · the card's fifth line is the statement, verbatim", s['lines'][-1:] == [PRIV_LINE], s['lines'][-1:])
    chk("G21 · no standards and no examples are written until a tap (the list offers them, plus + Add standard)",
        s['rows'] == 0 and s['ex'] and s['add'] and await pg.evaluate("() => (window.__INSERTS||[]).length") == 0, s)
    await pg.click('#h28Ex'); await pg.wait_for_timeout(2500)
    e = await pg.evaluate("() => ({ heads:[...document.querySelectorAll('#log .grp')].map(g=>g.textContent.trim()), rows:[...document.querySelectorAll('#log .li')].length, card: document.getElementById('h28First').classList.contains('on'), ins:(window.__INSERTS||[]).filter(i=>i[0]==='habits').map(i=>[].concat(i[1]).map(r=>r.name+'|'+r.cadence+'|'+(r.time_anchor||''))) })")
    # AMENDED by WIRE HT-29 (paste 133 Ruling 3, Cory 2026-09-15). The four examples are unchanged and are
    # still asserted name for name; only the headers they land under moved, because the sections did: a row
    # with no section of its own shows where Ruling 3 places it - a planned time in Morning routine (07:00
    # and 22:30), no time in Standards, weekly in Weekly. Cory moves them from there; the clock never does.
    # AMENDED BY NAME, HT-30 (paste 137 S1.4): the four examples are unchanged and are still asserted
    # name for name, cadence for cadence, planned time for planned time. Only the ORDER of the headers
    # they land under moved, because Cory's 9/20 review moved it.
    # AMENDED BY NAME, HT-31 (paste 143 S1.6), 2026-09-22: two headers, not three. THE FOUR EXAMPLES ARE
    # UNCHANGED and are still asserted name for name, cadence for cadence, planned time for planned time -
    # 07:00 and 22:30 are still carried, still stored, still rendered. What moved is only where a row with
    # no section of its own lands: a clock does not place anything any more (Cory 9/21), so the weekly one
    # is in Weekly routine and the other three are in Standards, which is where he moves them from.
    chk("G21 · one tap starts from four EXAMPLES across Weekly routine and Standards",
        # AMENDED BY HT-194 S2/S3 (R67.2): all four headers render, empty ones included, in Cory's 9/24 order
        e['rows'] == 4 and e['heads'] == ['Morning routine', 'Night routine', 'Standards', 'Weekly routine'] and not e['card']
        and e['ins'] == [['Move for 20 minutes|daily|07:00', 'Read 10 pages|daily|', 'Lights out|daily|22:30', 'Plan the week|weekly|']], e)
    # edit: rename + Days + delete, all in the app
    rid = await pg.evaluate("() => [...document.querySelectorAll('#log .li')].find(r=>/Read 10 pages/.test(r.textContent)).getAttribute('data-h')")
    await pg.click('#log .li[data-h="%s"] .edp' % rid); await pg.wait_for_timeout(700)
    await pg.evaluate("() => { const d=document.getElementById('h30More'); if(d) d.open = true; }")
    await pg.fill('#eName', 'Read 20 pages'); await pg.select_option('#eCad', 'dow')
    await pg.click('#eDowQ .dowqb[data-q="0,6"]'); await pg.wait_for_timeout(100)
    await pg.evaluate("() => { window.__UPDATES=[]; }")
    await pg.click('#eSave'); await pg.wait_for_timeout(1200)
    up = await pg.evaluate("() => (window.__UPDATES||[]).filter(u=>u[0]==='habits').map(u=>[u[1].name,u[1].cadence])")
    chk("G21 · rename + Days (Weekends) saves from the sheet", up[-1:] == [['Read 20 pages', 'dow:0,6']], up)
    did = await pg.evaluate("() => [...document.querySelectorAll('#log .li')].find(r=>/Plan the week/.test(r.textContent)).getAttribute('data-h')")
    await pg.click('#log .li[data-h="%s"] .edp' % did); await pg.wait_for_timeout(700)
    lab = await pg.evaluate("() => (document.getElementById('eArch')||{}).textContent")
    await pg.evaluate("() => { window.__UPDATES=[]; }")
    await pg.click('#eArch'); await pg.wait_for_timeout(1200)
    de = await pg.evaluate("() => (window.__UPDATES||[]).filter(u=>u[0]==='habits').map(u=>[u[1].active, !!u[1].archived_at])")
    chk("G21 · Delete asks, then archives (DEC-037: logged days keep it)", lab == 'Delete' and de[-1:] == [[False, True]], [lab, de])
    await pg.reload(); await pg.wait_for_timeout(4000)
    rl = await pg.evaluate("() => { const c=document.getElementById('h28First'); return { on: !!(c && c.classList.contains('on')), rows: document.querySelectorAll('#log .li').length }; }")
    chk("G23 · the card never comes back once put away", not rl['on'] and rl['rows'] == 3, rl)
    await pg.click('#bSet'); await pg.wait_for_timeout(600)
    pn = await pg.evaluate("() => (document.getElementById('privNote')||{}).textContent")
    chk("G22 · Settings carries the statement, verbatim", (pn or '').startswith(PRIV_LINE), pn)
    chk("G · zero page errors on the whole walk", not errs, errs[:2])
    await b.close()

    # zero rows, existing account: + Add standard opens the sheet; a failed load offers nothing
    b, pg, errs = await open_page(pw, 390, 844, flags={'__NO_HABITS': True})
    await pg.evaluate("() => { const g=document.getElementById('h28Got'); if(g) g.click(); }")
    await pg.click('#log .h28add'); await pg.wait_for_timeout(600)
    sh = await pg.evaluate("() => ({ on: document.getElementById('esheet').classList.contains('on'), name: !!document.getElementById('eName') })")
    chk("G21 · with no standards, + Add standard still opens the sheet", sh['on'] and sh['name'], sh)
    await b.close()
    b, pg, errs = await open_page(pw, 390, 844, flags={'__FAIL_READ': ['habits', 'days']})
    fl = await pg.evaluate("() => ({ card: !!(document.getElementById('h28First') && document.getElementById('h28First').classList.contains('on')), ex: !!document.querySelector('#log .h28ex'), add: !!document.querySelector('#log .h28add'), empty:(document.querySelector('#log .empty')||{}).textContent, ins:(window.__INSERTS||[]).length })")
    chk("G21/D4 · a failed load never looks like a new account: no card, no examples, no add, and it says so",
        not fl['card'] and not fl['ex'] and not fl['add'] and fl['ins'] == 0 and 'Could not load' in (fl['empty'] or ''), fl)
    await b.close()
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True, '__LAG': 900}, wait=4500)
    cr = await pg.evaluate("() => ({ card: !!(document.getElementById('h28First') && document.getElementById('h28First').classList.contains('on')), ex: !!document.querySelector('#log .h28ex'), ins:(window.__INSERTS||[]).length })")
    chk("G21 · Cory's account (standards + history, habits slow to load) never sees the card or the examples",
        not cr['card'] and not cr['ex'] and cr['ins'] == 0, cr)
    await b.close()

    # G22 · the guards, read from the source
    js = src(os.path.join(REPO, 'app.js'))
    cross = re.findall(r"from\('(\w+)'\)\s*\.select\('([^']*)'\)\s*\.in\('user_id'", js)
    chk("G22 · every cross-user read is days.select('user_id,date,pct') - both of them, across lines",
        cross == [('days', 'user_id,date,pct'), ('days', 'user_id,date,pct')], cross)
    unscoped = [m.group(0)[:80] for m in re.finditer(r"from\('day_private'\)\s*\.select\([^;]*", js)
                if ".eq('user_id'" not in m.group(0)]
    chk("G22 · every day_private read (the sync's included) is scoped to the signed-in user", not unscoped, unscoped[:3])
    r = subprocess.run([sys.executable, os.path.join(RECONCILE, 'ht_batch5', 'privacy_check.py'), '--repo', REPO],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    chk("G22 · privacy_check.py passes on this tree", r.returncode == 0 and 'VERDICT: PASS' in r.stdout, (r.stdout + r.stderr)[-300:])
    chk("G22 · the app never claims the database owner cannot read rows",
        not re.search(r'(nobody|no one|not even)[^.]{0,40}(database|server|owner|admin)', js, re.I), 'claim found')


SECTIONS = {'A': sec_a, 'B': sec_b, 'C': sec_c, 'D': sec_d, 'E': sec_e, 'F': sec_f, 'G': sec_g}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    a = ap.parse_args()
    want = [a.only] if a.only else list(SECTIONS)
    async with async_playwright() as pw:
        for s in want:
            if s not in SECTIONS:
                raise SystemExit('unknown section %s' % s)
            await SECTIONS[s](pw)
    bad = [n for ok, n in RES if not ok]
    print('\nGOLDEN HT-28: %d/%d PASS, %d FAIL' % (len(RES) - len(bad), len(RES), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
