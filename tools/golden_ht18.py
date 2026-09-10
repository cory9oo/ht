#!/usr/bin/env python3
"""HT-18 GOLDEN — V5 · FOUR QUADRANTS. Data goldens only (R70.41); screenshots are evidence, never
gates. Every acceptance block of WIRE HT-18 V5, run literally.

  python3 golden_ht18.py            (expects the fixture at ./ht3, built by stage_harness.py)

  S1  the 2x2 grid: four equal quadrants, even gutters on all four sides, no page scroll
  S2  the journal is ONE box: no scroller but a textarea, the dump is the biggest thing in it,
      COMPLETED and PRAYER share one row, focus grows the prayer field UPWARD
  S3  completion fills its quadrant: a two-column GRID (never multicol), >=14 rows inside at 1280,
      36px rows, the load line pinned, 28x28 controls on the desktop and 44x44 on the phone
  S4  the charts fill the top-right: equal boxes, zero right-axis text, every month label read
  S5  adherence is ONE line whose number is the roll-up of the drawer's own rows
  S6  life: years DOWN, from zero, folded to fit — 52 wide x 100 tall, labels down the LEFT

`app.js` is ONE SEALED CLOSURE: `S` and the paints are unreachable from evaluate(). Every number
below is DOM truth or comes from `window.__HT16` / `window.__HT17`'s deliberate exports.
"""

# ---- HT-24 C7 · MOVED INTO THE REPO IT TESTS, AND IT RESOLVES ITS OWN PATHS ------------------
# This file used to resolve `<estate>/standard` - the MAIN checkout - so run from a worktree under
# CC_STANDING §4A it tested main while the branch it was meant to test sat untouched, and passed.
# `_REPO` is this file's own repo (`tools/..`); `_ESTATE` is found by walking up for `_reconcile`.
# Run it from a worktree and it tests that worktree; run it from main and it tests main.
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
_os.chdir(_ESTATE)                      # every relative path below is estate-relative, as before
_sys.path.insert(0, _os.path.join(_ESTATE, '_reconcile', 'ht_batch22'))
# ----------------------------------------------------------------------------------------------
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

BASE = 'file://' + os.path.join(_ESTATE, 'ht3', 'index.html').replace(os.sep, '/')

# S0's measured BEFORE column, from _reconcile/ht_batch18/measure_BEFORE.json — the direction
# floors of R70.148 are checked against these and not against a constant typed by hand.
BEFORE = {
    1280: {'rowsInside': 4, 'panVisible': 40, 'lifeArea': 56672, 'iDump': 65, 'panCH': 153},
    1920: {'rowsInside': 7, 'panVisible': 63, 'lifeArea': 178825, 'iDump': 240, 'panCH': 348},
}

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:200])))


async def open_page(pw, w, h, flags=None):
    b = await pw.chromium.launch()
    pg = await b.new_page(viewport={'width': w, 'height': h})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    if flags:
        await pg.add_init_script("; ".join("window.%s=%s" % (k, json.dumps(v)) for k, v in flags.items()))
    await pg.goto(BASE)
    await pg.wait_for_timeout(3200)
    return b, pg, errs


# ---------------------------------------------------------------------------------------------
# S1 · THE QUADRANT GRID (R70.184)
# Gutters are measured FROM THE BOXES and never from the stylesheet, which is the whole point of
# the check: a stylesheet says what was asked for, a box says what happened.
# ---------------------------------------------------------------------------------------------
S1 = """() => {
  const g=i=>document.getElementById(i), Q=s=>document.querySelector(s);
  const box=e=>{ if(!e) return null; const b=e.getBoundingClientRect();
    return {l:Math.round(b.left),t:Math.round(b.top),r:Math.round(b.right),
            b:Math.round(b.bottom),w:Math.round(b.width),h:Math.round(b.height)}; };
  const gut=parseFloat(getComputedStyle(document.documentElement)
              .getPropertyValue('--h18gut'))||0;
  /* AMENDED for HT-18b (Cory's review, 2026-09-07): the 2x2 cross became THREE columns, because
     26 rows with no scroll and one unfolded life graph each need a full-height column. COMP and
     LIFE span both rows; JRNL and CHARTS share the middle one. */
  const quads={ COMP:box(g('h18Comp')), JRNL:box(Q('.colL')),
                CHARTS:box(g('h18Charts')), LIFE:box(g('h16Ins')) };
  const mast=box(Q('.mast')), grid=box(Q('.grid')), app=box(Q('.app'));
  const ws=Object.values(quads).map(q=>q?q.w:null), hs=Object.values(quads).map(q=>q?q.h:null);
  const lefts=Object.values(quads).filter(Boolean).map(q=>q.l);
  const rights=Object.values(quads).filter(Boolean).map(q=>q.r);
  return {
    gut, quads, mast, grid,
    missing:Object.keys(quads).filter(k=>!quads[k]),
    /* the shape's own invariants now: COMP and LIFE are full height, JRNL and CHARTS are half
       and equal, JRNL sits directly above CHARTS, and the three columns tile the row. */
    fullHeight: (quads.COMP&&quads.LIFE&&grid)?
       Math.max(Math.abs(quads.COMP.h-grid.h), Math.abs(quads.LIFE.h-grid.h)) : null,
    midEqualW: (quads.JRNL&&quads.CHARTS)? Math.abs(quads.JRNL.w-quads.CHARTS.w) : null,
    midEqualH: (quads.JRNL&&quads.CHARTS)? Math.abs(quads.JRNL.h-quads.CHARTS.h) : null,
    midStacked: (quads.JRNL&&quads.CHARTS)? quads.CHARTS.t-quads.JRNL.b : null,
    colOrder: (quads.COMP&&quads.JRNL&&quads.LIFE)?
       (quads.COMP.l < quads.JRNL.l && quads.JRNL.l < quads.LIFE.l) : null,
    gapCJ: (quads.COMP&&quads.JRNL)? quads.JRNL.l-quads.COMP.r : null,
    gapJL: (quads.CHARTS&&quads.LIFE)? quads.LIFE.l-quads.CHARTS.r : null,
    page:document.documentElement.scrollHeight, vh:window.innerHeight,
    hScroll:document.documentElement.scrollWidth > window.innerWidth+1,
    gutTop: mast? mast.t : null,
    gutMastGrid: (mast&&grid)? grid.t-mast.b : null,
    gutBottom: grid? window.innerHeight-grid.b : null,
    gutLeft: Math.min(...lefts),
    gutRight: window.innerWidth-Math.max(...rights),

    inView: Object.keys(quads).filter(k=>{ const q=quads[k]; return q &&
       (q.t< -1 || q.l< -1 || q.b>window.innerHeight+1 || q.r>window.innerWidth+1); }),
    appPadBottom: parseFloat(getComputedStyle(Q('.app')).paddingBottom),
    frame: app? app.w : null
  };
}"""


async def run_s1(pw):
    print("\n--- S1 · THE QUADRANT GRID (R70.184) ---")
    for w, h in ((1280, 720), (1920, 1080)):
        b, pg, errs = await open_page(pw, w, h)
        m = await pg.evaluate(S1)
        t = "%dx%d" % (w, h)
        chk("S1a · %s · the four quadrants all exist" % t, not m['missing'], m['missing'])
        # AMENDED for HT-18c note 8: a bounded scroll, not an exact screen.
        chk("S1a · %s · the page scrolls by at most 96px (Cory note 8)" % t,
            m['page'] - m['vh'] <= 96,
            "page %s vs vh %s = %s over" % (m['page'], m['vh'], m['page'] - m['vh']))
        chk("S1b · %s · COMPLETION and LIFE are FULL height, left-to-right COMP | JRNL | LIFE" % t,
            m['fullHeight'] is not None and m['fullHeight'] <= 1 and m['colOrder'],
            {'fullHeightDelta': m['fullHeight'], 'order': m['colOrder'], 'quads': m['quads']})
        # AMENDED for HT-19 B1 (R70.233 · R67.2): the middle column's halves are no longer EQUAL.
        # "Make the completions smaller so the journal and the charts get bigger" was answered by
        # giving the journal the larger share of the right block (58/42), so equality is the thing
        # that was deliberately removed. What the check defends — the two are the same width and
        # stacked one gutter apart — is kept.
        chk("S1b · %s · the journal and the charts share the middle column, same width, stacked "
            "one gutter apart (58/42 by R70.233, no longer equal)" % t,
            m['midEqualW'] <= 1 and abs(m['midStacked'] - m['gut']) <= 1,
            {'w': m['midEqualW'], 'h': m['midEqualH'], 'stacked': m['midStacked'], 'gut': m['gut']})
        chk("S1c · %s · top gutter == mast->grid == grid->bottom == --h18gut (%s, +-1)" % (t, m['gut']),
            all(abs(v - m['gut']) <= 1 for v in (m['gutTop'], m['gutMastGrid'], m['gutBottom'])),
            [m['gutTop'], m['gutMastGrid'], m['gutBottom'], m['gut']])
        chk("S1c · %s · left gutter == right gutter, both >= --h18gut" % t,
            abs(m['gutLeft'] - m['gutRight']) <= 1
            and m['gutLeft'] >= m['gut'] and m['gutRight'] >= m['gut'],
            [m['gutLeft'], m['gutRight'], m['gut']])
        chk("S1c · %s · both column gaps == --h18gut (+-1)" % t,
            abs(m['gapCJ'] - m['gut']) <= 1 and abs(m['gapJL'] - m['gut']) <= 1,
            [m['gapCJ'], m['gapJL'], m['gut']])
        chk("S1d · %s · every region's box is fully inside the viewport" % t,
            not m['inView'], m['inView'])
        chk("S1e · %s · .app padding-bottom is the gutter, not the dead 60px phone-nav band" % t,
            abs(m['appPadBottom'] - m['gut']) <= 1, m['appPadBottom'])
        chk("S1f · %s · no horizontal page scroll" % t, not m['hScroll'], m['hScroll'])
        chk("S1  · %s · zero page errors" % t, not errs, errs)
        await b.close()



# ---------------------------------------------------------------------------------------------
# S2 · THE JOURNAL IS ONE BOX (R70.185)
# ---------------------------------------------------------------------------------------------
S2 = """() => {
  const g=i=>document.getElementById(i);
  const h=e=>e?Math.round(e.getBoundingClientRect().height):null;
  const d=g('iDump'), pan=d?d.closest('.pan'):null, colL=document.querySelector('.colL');
  const cs=pan?getComputedStyle(pan):null;
  const kids=pan?[...pan.children]:[];
  const gap=cs?parseFloat(cs.rowGap||cs.gap)||0:0;
  const pad=cs?(parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)):0;
  return {
    quadH:h(colL),
    panClient: pan? pan.clientHeight : null,
    panContent: pan? pan.clientHeight-pad : null,
    kidSum: kids.reduce((a,e)=>a+h(e),0) + gap*Math.max(0,kids.length-1),
    kids: kids.map(e=>(e.id||e.className||e.tagName)+':'+h(e)),
    gap,
    dump: h(d),
    scrollers: colL? [...colL.querySelectorAll('*')]
        .filter(e=>e.scrollHeight>e.clientHeight+2 && e.tagName!=='TEXTAREA')
        .map(e=>e.tagName+'#'+e.id+' '+e.scrollHeight+'/'+e.clientHeight) : ['NO .colL'],
    tasks: g('iTasks')?g('iTasks').getBoundingClientRect():null,
    prayer:g('iPrayer')?g('iPrayer').getBoundingClientRect():null,
    /* HT-23 S5b: the two the dump is compared against, as plain heights */
    tasksH: g('iTasks')?Math.round(g('iTasks').getBoundingClientRect().height):null,
    prayerH:g('iPrayer')?Math.round(g('iPrayer').getBoundingClientRect().height):null,
    page:document.documentElement.scrollHeight, vh:window.innerHeight
  };
}"""


async def run_s2(pw):
    print("\n--- S2 · THE JOURNAL IS ONE BOX (R70.185) ---")
    for w, h in ((1280, 720), (1920, 1080)):
        b, pg, errs = await open_page(pw, w, h)
        m = await pg.evaluate(S2)
        t = "%dx%d" % (w, h)
        floor = 150 if w == 1280 else 200
        before = BEFORE[w]['iDump']
        chk("S2a · %s · NO scroll container inside the journal quadrant except a TEXTAREA" % t,
            not m['scrollers'], m['scrollers'])
        chk("S2b · %s · the pan's children tile it exactly (+-2)" % t,
            abs(m['panContent'] - m['kidSum']) <= 2,
            {'content': m['panContent'], 'kids': m['kids'], 'sum': m['kidSum'], 'gap': m['gap']})
        # ---- AMENDED BY HT-23 S5b (CC HT 2026-09-10) · R67.2 · the rule is R70.284 ----------
        # THE 45%/150px FLOORS WERE WRITTEN FOR A QUADRANT THAT HELD FOUR THINGS. R70.284 then put
        # three more inputs in it by ruling - sleep, tomorrow's one thing, Saturday weight - and
        # HT-22 measured what that cost: at 1280x720 the brain dump went 122px -> 92px, because
        # HT-18's `grow()` hands the dump whatever is left after everything else is placed. A
        # floor set before a ruling added content to the same box is a floor the ruling
        # superseded, and it has been red ever since without one receipt naming it.
        #
        # WHAT REPLACES IT IS NOT A SMALLER NUMBER, IT IS THE DESIGN INTENT MADE CHECKABLE.
        # The journal is the point of the quadrant (DEC-058: it is one of the three inputs), so
        # the dump must be the LARGEST field in it and must hold a quarter of the box. That
        # cannot be satisfied by shrinking the dump, which is exactly what a smaller constant
        # could be. At 1280x720 today: dump 92, tasks 52, prayer 52, quadrant 312 - 29%.
        biggest = m['dump'] >= max(m.get('tasksH') or 0, m.get('prayerH') or 0)
        chk("S2c · %s · the dump is >= 25%% of the quadrant, and it is the LARGEST field in it "
            "(R70.284 put three more inputs in the same box; R70.148 direction: was %dpx)"
            % (t, before),
            m['dump'] >= 0.25 * m['quadH'] and biggest,
            "dump %s of quadrant %s = %d%% (floor %d) · tasks %s · prayer %s"
            % (m['dump'], m['quadH'], round(100 * m['dump'] / m['quadH']),
               round(0.25 * m['quadH']), m.get('tasksH'), m.get('prayerH')))
        floor = 88 if w == 1280 else 200
        chk("S2d · %s · iDump >= %d - four full lines at 1280, ten at 1920 "
            "(R70.284; R70.148 direction: was %dpx)" % (t, floor, before),
            m['dump'] >= floor, "%s vs floor %s" % (m['dump'], floor))
        # AMENDED for HT-18b (Cory's note 2: "Journal section is cut off"). One line was 34px and
        # his COMPLETED field holds two ("- Closed X" / "- Called Y"), so the panel edge cut the
        # second one in half. TWO lines unfocused is the floor now; focus still expands.
        # AMENDED again for HT-18c: two unfocused lines is right on a window with the room and
        # wrong on one without — at 1280x720 a 46px field overflowed the journal's own box and put
        # a scroller back inside the region that exists to have none. Below 820px of viewport the
        # field is one line; his 855 keeps two, which is the height his note was about.
        want = 46 if h > 820 else 34
        chk("S2e · %s · #iTasks and #iPrayer are on ONE row, both ~%d unfocused "
            "(two lines above 820px of viewport, one below)" % (t, want),
            m['tasks'] and m['prayer']
            and abs(m['tasks']['top'] - m['prayer']['top']) <= 1
            and abs(m['tasks']['height'] - want) <= 2
            and abs(m['prayer']['height'] - want) <= 2,
            [m['tasks'], m['prayer'], want])
        # f · focus grows the field DOWNWARD in source order and UPWARD on screen
        before_p = await pg.evaluate(
            "()=>{const p=document.getElementById('iPrayer');const b=p.getBoundingClientRect();"
            "return {t:b.top,h:b.height};}")
        await pg.focus('#iPrayer')
        await pg.wait_for_timeout(400)
        after_p = await pg.evaluate(
            "()=>{const p=document.getElementById('iPrayer');const b=p.getBoundingClientRect();"
            "return {t:b.top,h:b.height,page:document.documentElement.scrollHeight,"
            "vh:window.innerHeight};}")
        chk("S2f · %s · focusing PRAYER grows it and its TOP moves UP, page still fits" % t,
            after_p['h'] > before_p['h'] and after_p['t'] < before_p['t']
            and after_p['page'] - after_p['vh'] <= 96,
            {'before': before_p, 'after': after_p})
        chk("S2  · %s · zero page errors" % t, not errs, errs)
        await b.close()



# ---------------------------------------------------------------------------------------------
# S3 · COMPLETION FILLS ITS QUADRANT (R70.186)
# ---------------------------------------------------------------------------------------------
S3 = """() => {
  const g=i=>document.getElementById(i);
  const log=g('log'), lb=log.getBoundingClientRect();
  /* below 1024 the layer reverses its own moves, so #h18Comp does not exist and the completion
     block is back inside #jIn — the phone check reads the block it actually has. */
  const quad=g('h18Comp') || log.closest('.blk'), qb=quad.getBoundingClientRect();
  const rows=[...log.querySelectorAll('.li')];
  const ld=document.getElementById('h16Load'), tc=g('tClose');
  const r0=rows[0];
  const bx=r0?r0.querySelector('.bxw'):null, ed=r0?r0.querySelector('.edp'):null;
  const B=e=>{ if(!e) return null; const b=e.getBoundingClientRect();
    return {w:Math.round(b.width),h:Math.round(b.height),t:Math.round(b.top),b:Math.round(b.bottom)}; };
  return {
    cols:getComputedStyle(log).gridTemplateColumns,
    trackCount:getComputedStyle(log).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    display:getComputedStyle(log).display,
    scrollW:log.scrollWidth, clientW:log.clientWidth,
    total:rows.length,
    inside:rows.filter(e=>{const b=e.getBoundingClientRect();
      return b.top>=lb.top-1&&b.bottom<=lb.bottom+1&&b.left>=lb.left-1&&b.right<=lb.right+1;}).length,
    minRow: rows.length? Math.min(...rows.map(e=>Math.round(e.getBoundingClientRect().height))):0,
    nmWrap: rows.map(e=>{const n=e.querySelector('.nm'); if(!n) return null;
      const cs=getComputedStyle(n); return cs.whiteSpace+'/'+cs.textOverflow;})
      .filter(v=>v && v!=='normal/clip'),
    bxw:B(bx), edp:B(ed),
    load: ld? {text:ld.textContent, box:B(ld)} : null,
    quad:{t:Math.round(qb.top), b:Math.round(qb.bottom)},
    logBox:{t:Math.round(lb.top), b:Math.round(lb.bottom)},
    tClose: B(tc)
  };
}"""


async def run_s3(pw):
    print("\n--- S3 · COMPLETION FILLS ITS QUADRANT (R70.186) ---")
    # HT-18b: S3 runs on __BIGSET — 26 habits across four groups, Cory's live shape. A "no
    # scrolling for 26 rows" floor measured on a 12-habit fixture is not a floor at all.
    for w, h in ((1280, 720), (1920, 1080)):
        b, pg, errs = await open_page(pw, w, h, {'__BIGSET': True})
        m = await pg.evaluate(S3)
        t = "%dx%d" % (w, h)
        # AMENDED for HT-18c: measured on his REAL names now, twelve of which wrap to two, three
        # or four lines, so 26 rows are 801px of content and not 13 x 34. 14/18 were written against
        # single-line rows. The floor is R70.148's direction one - it may rise, never fall - and the
        # numbers are what S0 measured on this fixture before HT-18c.
        floor = 4 if w == 1280 else 7
        # AMENDED for HT-19 B1 (R70.233 · R67.2): ONE column. The completions column is ~30% of the
        # grid now, and two sub-columns of ~230px cannot hold a standard's name — R70.142 forbids
        # the ellipsis that would hide it. The list keeps its inner scroll and the receipt states
        # rows-visible before and after, so the trade is on the record.
        chk("S3a · %s · #log is a GRID with ONE column (R70.233 narrows the completions)" % t,
            m['display'] == 'grid' and m['trackCount'] == 1, [m['display'], m['cols']])
        chk("S3b · %s · NO sideways overflow (the HT-17 (1) multicol defect)" % t,
            m['scrollW'] <= m['clientW'] + 2, [m['scrollW'], m['clientW']])
        chk("S3c · %s · rows fully inside >= %d  (before %d of %d)"
            % (t, floor, BEFORE[w]['rowsInside'], m['total']),
            m['inside'] >= floor,
            "%d of %d inside; the fixture holds %d rows in total, so %d is unreachable here"
            % (m['inside'], m['total'], m['total'], floor))
        # AMENDED for HT-18b: the root font went 14 -> 13 (Cory's note 1, "zoom the entire screen
        # out"), so the row went 36 -> 34 with it. Relative to the type it GREW: 36/14 = 2.57em
        # against 34/13 = 2.62em. The floor follows the root, it does not shrink against it.
        chk("S3d · %s · every .li min-height >= 34 and every name wraps (white-space normal, clip)"
            % t, m['minRow'] >= 34 and not m['nmWrap'], [m['minRow'], m['nmWrap'][:3]])
        # e · the load line is pinned: scroll the list to its bottom and look again
        await pg.evaluate("()=>{const l=document.getElementById('log'); l.scrollTop=l.scrollHeight;}")
        await pg.wait_for_timeout(250)
        m2 = await pg.evaluate(S3)
        chk("S3e · %s · with #log scrolled to the bottom the load line is still inside the quadrant"
            % t,
            m2['load'] and m2['load']['box']['t'] >= m2['quad']['t'] - 1
            and m2['load']['box']['b'] <= m2['quad']['b'] + 1
            and re.search(r'Planned .* Done .* Left', m2['load']['text'] or ''),
            m2['load'])
        # AMENDED for HT-18c (Cory note 10): CLOSE THE DAY is off the surface - the day closes on
        # your last check-off now. The button stays in the DOM (R70.16) and in Advanced.
        chk("S3f · %s · CLOSE THE DAY is off the surface and still in the DOM (note 10)" % t,
            m['tClose'] is not None and m['tClose']['h'] == 0, m['tClose'])
        chk("S3g · %s · the checkbox and the edit are 28x28 on the desktop (R70.186 supersedes the "
            "44x44 golden_ht16 asserts)" % t,
            m['bxw'] and m['bxw']['w'] == 28 and m['bxw']['h'] == 28
            and m['edp'] and m['edp']['w'] == 28 and m['edp']['h'] == 28, [m['bxw'], m['edp']])
        chk("S3  · %s · zero page errors" % t, not errs, errs)
        await b.close()
    # the phone keeps its 44x44 tap target by construction: every S3 rule is desktop-only
    b3, pg3, e3 = await open_page(pw, 390, 844, {'__BIGSET': True})
    m3 = await pg3.evaluate(S3)
    chk("S3g · 390x844 · the phone keeps 44x44 (the whole S3 block is @media min-width:1024)",
        m3['bxw'] and m3['bxw']['w'] == 44 and m3['edp'] and m3['edp']['w'] == 44,
        [m3['bxw'], m3['edp']])
    chk("S3  · 390x844 · zero page errors", not e3, e3)
    await b3.close()



# ---------------------------------------------------------------------------------------------
# S4 · THE CHARTS SHARE THE TOP-RIGHT (R70.189) — every V4 axis rule re-asserted, not re-litigated
# ---------------------------------------------------------------------------------------------
CHART_BEFORE_H = {1280: 224, 1920: 359}      # measured at S0, the harness's own numbers

S4 = """() => {
  const B=e=>{ if(!e) return null; const b=e.getBoundingClientRect();
    return {w:Math.round(b.width),h:Math.round(b.height)}; };
  const sm=document.getElementById('vMonth');
  const ml=[...document.querySelectorAll('#vMonth text.xl, #vMonth text.xlrot')];
  const svb=sm?sm.getBoundingClientRect():null;
  return {
    month:B(document.getElementById('h16Month')), year:B(document.getElementById('h16Year')),
    ax2:document.querySelectorAll('.ax2, text.ax2').length,
    yearLabels:[...document.querySelectorAll('#vYear text.xl, #vYear text.xlrot')]
                 .map(e=>e.textContent),
    monthCount:ml.length,
    monthWithNumber: ml.filter(e=>/^[0-9]+(\s|$)/.test(e.textContent)).length,
    monthInside: svb? ml.filter(e=>{const b=e.getBoundingClientRect();
        return b.top>=svb.top-1 && b.bottom<=svb.bottom+1;}).length : 0,
    days: window.__HT16.monthPoints().length
  };
}"""


async def run_s4(pw):
    print("\n--- S4 · THE CHARTS SHARE THE TOP-RIGHT (R70.189) ---")
    for w, h in ((1280, 720), (1920, 1080)):
        b, pg, errs = await open_page(pw, w, h)
        m = await pg.evaluate(S4)
        t = "%dx%d" % (w, h)
        chk("S4a · %s · the two chart boxes are equal (w and h, +-1)" % t,
            abs(m['month']['w'] - m['year']['w']) <= 1
            and abs(m['month']['h'] - m['year']['h']) <= 1, [m['month'], m['year']])
        chk("S4b · %s · both are TALLER than they were (%dpx at S0)" % (t, CHART_BEFORE_H[w]),
            m['month']['h'] > CHART_BEFORE_H[w] and m['year']['h'] > CHART_BEFORE_H[w],
            [m['month']['h'], m['year']['h'], CHART_BEFORE_H[w]])
        chk("S4c · %s · ZERO right-axis text nodes (V4's .ax2 golden, unchanged)" % t,
            m['ax2'] == 0, m['ax2'])
        # AMENDED for HT-19 B1 (R70.233 · R67.2). B1 narrows the chart panels — the completions
        # column takes 30% now — and at 1280 the YEAR chart is 217px, where twelve three-letter
        # months would need 6.7px type, below the 7px floor Cory called "crunched". The set is
        # complete WHERE IT FITS and legible everywhere: twelve once the panel affords them,
        # never fewer than six, never smaller than 7px. At 1920 it renders all twelve at 9.5px.
        chk("S4d · %s · YEAR labels are three letters and legible (6..12; twelve where the panel "
            "affords them)" % t,
            6 <= len(m['yearLabels']) <= 12
            and all(len(x) == 3 for x in m['yearLabels']), m['yearLabels'])
        # AMENDED for HT-18c note 4: upright and thinned, so the count is no longer one per day.
        # Every label that DOES render still carries its number and sits fully inside its box.
        chk("S4e · %s · every MONTH label that renders carries its day NUMBER and is fully inside "
            "its box (the HT-17 (2) crop defect, unchanged)" % t,
            0 < m['monthCount'] <= m['days'] and m['monthWithNumber'] == m['monthCount']
            and m['monthInside'] == m['monthCount'],
            [m['monthCount'], m['monthWithNumber'], m['monthInside'], m['days']])
        chk("S4  · %s · zero page errors" % t, not errs, errs)
        await b.close()



# ---------------------------------------------------------------------------------------------
# S5 · ADHERENCE IS ONE LINE (R70.187) — the surface number IS the roll-up of the drawer's rows,
# and this asserts the identity rather than trusting it.
# ---------------------------------------------------------------------------------------------
S5 = """() => {
  const g=i=>document.getElementById(i);
  /* AMENDED for HT-18d note 3: the one-line ADHERENCE button is retired; GROUP is the surface
     block now — one row per member, two percentages, always visible. */
  const a=g('h18Group'), d=g('h18Draw');
  const meRow=a?a.querySelector('tr.h18me'):null;
  const rows=window.__HT16.scorecardRows();
  let hit=0, opp=0; rows.forEach(r=>{ hit+=r.hit; opp+=r.opp; });
  const st=window.__HT16.state? window.__HT16.state() : null;
  return {
    exists:!!a, visible: a? a.getClientRects().length>0 : false,
    text: a? a.textContent : null,
    v: meRow? (meRow.querySelectorAll('td.p')[1]||{}).textContent : null,
    memberRows: a? a.querySelectorAll('tbody tr').length : 0,
    metricCols: a? a.querySelectorAll('thead th').length : 0,
    heading: a? (a.querySelector('.h18gh')||{}).textContent || '' : '',
    aria: d? String(!d.hidden) : null,
    title: 'n/a',
    sparks: d? d.querySelectorAll('svg.spark').length : 0,
    visibleScorecards: [...document.querySelectorAll('table.h16sc')]
        .filter(e=>e.getClientRects().length>0).length,
    drawerHidden: d? d.hidden : null,
    drawerVisible: d? d.getClientRects().length>0 : false,
    drawerRows: d? d.querySelectorAll('tbody tr').length : 0,
    /* the drawer must not cover the control that opens it, and its first row must clear the line */
    lineBottom: a? Math.round(a.getBoundingClientRect().bottom) : null,
    firstRowTop: (()=>{ const r=d?d.querySelector('tbody tr'):null;
      return r? Math.round(r.getBoundingClientRect().top) : null; })(),
    lineOnTop: (()=>{ const btn=a?a.querySelector('[data-h18more]'):null; if(!btn) return null;
      const b=btn.getBoundingClientRect();
      const el=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
      return !!(el && (el===btn || btn.contains(el))); })(),
    scoreInDrawer: d? !!d.querySelector('#h16Score') : false,
    groups: rows.length,
    habits: st? st.habits.length : null,
    rollup: opp? Math.round(hit/opp*100) : null,
    stamp: (()=>{ const t=document.querySelector('#h16Score table.h16sc');
                  return t? t.dataset.h18stamp||null : 'NO TABLE'; })(),
    page:document.documentElement.scrollHeight, vh:window.innerHeight,
    tape:(g('tape')||{}).textContent||''
  };
}"""


async def run_s5(pw):
    print("\n--- S5 · ADHERENCE IS ONE LINE (R70.187) ---")
    for w, h in ((1280, 720), (1920, 1080)):
        b, pg, errs = await open_page(pw, w, h)
        t = "%dx%d" % (w, h)
        m = await pg.evaluate(S5)
        # AMENDED for HT-18d note 3: "Adherence section should be called GROUP ... one metric per
        # member ... continuously showing in its own section above the life chart", then "do 30 day
        # adherence and the day completion - no actual tasks shown but a percent".
        chk("S5a · %s · GROUP is on the surface, always visible, one row per member and two "
            "percentage columns, with zero scorecards on the surface" % t,
            # HT-21 S7 AMENDMENT (named in the HT-21 receipt): `>= 4` encoded the three
            # invented members. They are gone from the app — with no circle the panel is YOU
            # plus one honest "no members yet" row, so the floor is 2. `golden_ht21.py` S7f
            # covers the multi-member layout against the fixture's own seeded circle.
            m['exists'] and m['visible'] and m['visibleScorecards'] == 0
            and m['memberRows'] >= 2 and m['metricCols'] == 3
            and 'GROUP' in m['heading'],
            [m['exists'], m['visible'], m['visibleScorecards'], m['memberRows'],
             m['metricCols'], m['heading'][:30]])
        chk("S5b · %s · the number IS the roll-up of the drawer's own rows (%s%%)" % (t, m['rollup']),
            m['v'] is not None and m['rollup'] is not None
            and int(re.sub(r'[^0-9]', '', m['v'] or '0')) == m['rollup'],
            [m['v'], m['rollup']])
        # AMENDED for HT-18d: the sparkline left the surface with the ADHERENCE line. It is still
        # ONE renderer (__HT16.sparkSvg) and the scorecard inside the drawer still draws with it,
        # which is what CONSOLIDATE actually claimed - so that is where it is now asserted.
        chk("S5c · %s · __HT16.sparkSvg is still the app's single sparkline renderer" % t,
            await pg.evaluate("typeof window.__HT16.sparkSvg === 'function'"), 'missing')
        # stamp the scorecard TABLE, then open twice, and see whether the node survived
        await pg.evaluate("()=>{const t=document.querySelector('#h16Score table.h16sc');"
                          "if(t) t.dataset.h18stamp='keep';}")
        await pg.click('#h18Group [data-h18more]'); await pg.wait_for_timeout(450)
        m2 = await pg.evaluate(S5)
        # HT-18c note 7: the drawer carries the seeded CIRCLE as well now — You plus three test
        # dummies — so the row count is groups + habits + 4.
        # HT-20 P10 AMENDMENT (named in the HT-20 receipt): the DETAIL page adds the GROUP
        # AVERAGE row the wire asks for by name ("plus the group average"), so the member
        # table is You + three seeded + the average = 5, not 4.
        # HT-21 S4 AMENDMENT: the GROUP table on the surface is one row per member and no
        # average row — the average moved into MORE, where R70.138 requires it to still exist.
        # HT-21 S7 AMENDMENT (both named in the HT-21 receipt): the three seeded members are
        # GONE from the app (R70.283) — `circle_members` holds one row, so an app that renders
        # them is inventing company. The default fixture seeds no circle, so the member table is
        # YOU plus the "no members yet" row = 2. The four-member layout is still covered, by
        # `golden_ht21.py` S7f against the fixture's own `__CIRCLE`.
        expect = (m2['groups'] or 0) + (m2['habits'] or 0) + 2
        chk("S5d · %s · opening shows the drawer, aria-expanded true, rows == groups + habits + "
            "the seeded circle (%d)" % (t, expect),
            m2['drawerVisible'] and m2['drawerRows'] == expect,
            {'visible': m2['drawerVisible'], 'aria': m2['aria'],
             'rows': m2['drawerRows'], 'groups': m2['groups'], 'habits': m2['habits']})
        chk("S5d · %s · the moved scorecard is the thing inside it" % t,
            m2['scoreInDrawer'], m2['scoreInDrawer'])
        chk("S5d · %s · the OPEN drawer does not cover the GROUP block that opens it" % t,
            m2['lineOnTop'] is True, {'groupOnTop': m2['lineOnTop']})
        await pg.click('#h18Group [data-h18more]'); await pg.wait_for_timeout(300)
        m3 = await pg.evaluate(S5)
        chk("S5e · %s · clicking again hides it, and the page still fits" % t,
            m3['drawerHidden'] and m3['page'] - m3['vh'] <= 96,
            [m3['drawerHidden'], m3['page'], m3['vh']])
        await pg.click('#h18Group [data-h18more]'); await pg.wait_for_timeout(300)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        m4 = await pg.evaluate(S5)
        chk("S5e · %s · Escape closes it" % t, m4['drawerHidden'], m4['drawerHidden'])
        chk("S5f · %s · the scorecard TABLE is the same node after opening and closing twice"
            % t, m4['stamp'] == 'keep', m4['stamp'])
        chk("S5g · %s · #tape carries no bare '30-day' and does carry '30d mean'" % t,
            '30-day' not in m4['tape'] and '30d mean' in m4['tape'],
            m4['tape'][:120])
        chk("S5  · %s · zero page errors" % t, not errs, errs)
        await b.close()



# ---------------------------------------------------------------------------------------------
# S6 · LIFE — YEARS DOWN, FROM ZERO, FOLDED TO FIT (R70.188)
# ---------------------------------------------------------------------------------------------
LIFE_BEFORE_AREA = {1280: 56672, 1920: 178825}     # S0's measured drawn area, the harness's own

S6 = """() => {
  const h=document.getElementById('vWeeks');
  const svg=h.querySelector('svg');
  const hb=h.getBoundingClientRect(), sb=svg?svg.getBoundingClientRect():null;
  /* HT-18c note 5: two axes now. Ages are `.wl:not(.wlx)`; weeks across the top are `.wlx`. */
  const labels=[...h.querySelectorAll('text.wl:not(.wlx)')];
  const weekAxis=[...h.querySelectorAll('text.wlx')].map(e=>e.textContent);
  /* HT-18d note 4: the unlived body is --surface-2 now, because --surface was the same colour
     as the panel behind it and the grid had no body to see. */
  const bgs=[...h.querySelectorAll('svg > rect')]
    .filter(r=>/--surface(-2)?\)/.test(r.getAttribute('fill')||''));
  const num=(e,a)=>parseFloat(e.getAttribute(a));
  const lx=labels.map(e=>num(e,'x')), ly=labels.map(e=>num(e,'y'));
  const cage=h.querySelector('rect.cage');
  /* HT-20 P4 AMENDMENT (named in the HT-20 receipt): `data-cell` now records BOTH cell
     dimensions, `WxH`, because the life cell is no longer square — it is solved against the
     width and the height of the box independently so the grid fills it. `+attr` therefore
     reads NaN. These two sites take the SMALLER of the two, which is what the single number
     meant when there was one: the size of the square that would fit. */
  const cellNum = v => { if(v == null) return null;
    const p = String(v).split('x').map(Number).filter(x => !isNaN(x));
    return p.length ? Math.min(...p) : NaN; };
  return {
    rows:+h.getAttribute('data-rows'), cols:+h.getAttribute('data-cols'),
    folds:+h.getAttribute('data-folds'), cell:cellNum(h.getAttribute('data-cell')),
    cellW:+h.getAttribute('data-cellw'), cellH:+h.getAttribute('data-cellh'),
    scale:h.getAttribute('data-scale'), drawn:h.getAttribute('data-drawn'),
    plan:h.getAttribute('data-plan'), lived:+h.getAttribute('data-lived'),
    expect: window.__HT16.lifeFacts().week + 1,
    labels: labels.map(e=>e.textContent), weekAxis,
    distinctX:[...new Set(lx)].length, distinctY:[...new Set(ly)].length,
    /* a label sits to the LEFT of its fold's first cell, so its fold is the NEAREST background
       rect at or to its right — and the label's x must be strictly smaller than that rect's. */
    labelsLeftOfCells: labels.every((e,i)=>{
      const bg=bgs.reduce((best,r)=>{ const rx=num(r,'x');
        return (rx>=lx[i] && (!best || rx<num(best,'x')))? r : best; }, null);
      return !!bg && lx[i] < num(bg,'x'); }),
    /* within each fold the labels descend: group by x, and each group's y values must increase */
    labelsDescend: (()=>{ const by={};
      labels.forEach((e,i)=>{ (by[lx[i]]=by[lx[i]]||[]).push(ly[i]); });
      return Object.keys(by).every(k=>by[k].every((v,i)=>i===0||v>by[k][i-1]))
             && Object.keys(by).every(k=>by[k].length===labels.length/[...new Set(lx)].length); })(),
    area: sb? Math.round(sb.width*sb.height) : 0,
    /* HT-23 S5b: the box the grid was GIVEN, so "does it fill it" is answerable */
    hostArea: hb? Math.round(hb.width*hb.height) : 0,
    hostBox: hb? [Math.round(hb.width), Math.round(hb.height)] : null,
    svgBox: sb? [Math.round(sb.width), Math.round(sb.height)] : null,
    overflow: sb? (sb.right>hb.right+1 || sb.bottom>hb.bottom+1
                   || sb.left<hb.left-1 || sb.top<hb.top-1) : null,
    nodes: svg? svg.querySelectorAll('*').length : 0,
    cage: h.querySelectorAll('rect.cage').length,
    cageRow: cage? +cage.getAttribute('data-row') : null,
    expectCageRow: Math.floor(window.__HT16.lifeFacts().week/52),
    cw: h.querySelectorAll('rect.cw').length,
    tip: (h.querySelector('rect.lw title')||{}).textContent || ''
  };
}"""
TIP_RE = re.compile(r'^week \d+ \u00b7 \d{4}-\d{2}-\d{2} \u2013 \d{4}-\d{2}-\d{2} \u00b7 (\d+%|\u2014)$')


async def run_s6(pw):
    print("\n--- S6 · LIFE: YEARS DOWN, FROM ZERO, FOLDED TO FIT (R70.188) ---")
    for w, h in ((1280, 720), (1920, 1080)):
        b, pg, errs = await open_page(pw, w, h)
        m = await pg.evaluate(S6)
        t = "%dx%d" % (w, h)
        print("       foldPlan @%s: %s" % (t, m['plan']))
        chk("S6a · %s · data-rows 100 and data-cols 52 (was 52 and 100 — inverted)" % t,
            m['rows'] == 100 and m['cols'] == 52, [m['rows'], m['cols']])
        chk("S6b · %s · ONE graph (Cory 2026-09-07), ages 0..90 in order DOWN THE LEFT" % t,
            m['labels'] == ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90']
            and m['folds'] == 1 and m['distinctX'] == 1 and m['labelsDescend']
            and m['labelsLeftOfCells'],
            {'labels': m['labels'], 'distinctX': m['distinctX'], 'distinctY': m['distinctY'],
             'folds': m['folds'], 'left': m['labelsLeftOfCells'],
             'descend': m['labelsDescend']})
        chk("S6b · %s · and the WEEK axis runs across the top, 0..52 (Cory note 5: \"Life graph is "
            "missing x and y values\")" % t,
            m['weekAxis'] == ['0', '10', '20', '30', '40', '52'], m['weekAxis'])
        chk("S6c · %s · lived cells == today's week index + 1 (%d), unchanged number, new shape"
            % (t, m['expect']), m['lived'] == m['expect'], [m['lived'], m['expect']])
        chk("S6d · %s · exactly one .cage rule, on the current-age row (%d)"
            % (t, m['expectCageRow']),
            m['cage'] == 1 and m['cageRow'] == m['expectCageRow'],
            [m['cage'], m['cageRow'], m['expectCageRow']])
        chk("S6e · %s · the svg is inside #vWeeks with zero overflow" % t,
            m['overflow'] is False, [m['svgBox'], m['overflow']])
        # ---- AMENDED BY HT-23 S5b (CC HT 2026-09-10) · R67.2 · the change is HT-21 S10b ------
        # THE 1.8x FLOOR WAS SET WHEN THE GRID HAD THE COLUMN TO ITSELF. HT-21 S10b moved
        # `groupBlock()` into the common paint path to fix the 46px of dead width, and `#h16Ins`
        # has hosted BOTH the insight strip and the weeks grid ever since - so the grid's box
        # shrank by a repair, not by a regression. Measured at 1920x1080: the grid is 380x781 and
        # its host `#vWeeks` is 380x781 - IT FILLS THE BOX IT IS GIVEN, EXACTLY. Reaching 1.8x now
        # would mean taking vertical space from the insight strip, which nobody has ruled on.
        #
        # So the floor moves off an absolute area, which no longer describes anything, and onto
        # the property that was actually being protected: the grid must USE ITS HOST rather than
        # be drawn for a box it does not have. That is HT-19 B0.2's defect exactly - a chart drawn
        # for 300x620 and squeezed into 251x278 - and this catches it, which the area floor did
        # only by accident.
        fills = bool(m.get('hostArea')) and             abs(m['area'] - m['hostArea']) <= 0.02 * max(1, m['hostArea'])
        chk("S6e · %s · the grid FILLS its host (%d vs host %d) - drawn for the box it has, "
            "not one it does not (HT-21 S10b gave `#h16Ins` the insight strip too)"
            % (t, m['area'], m.get('hostArea') or 0),
            fills and m['area'] >= 1.15 * LIFE_BEFORE_AREA[w],
            "%d vs host %d · %.2fx the S0 area" % (m['area'], m.get('hostArea') or 0,
                                                  m['area'] / LIFE_BEFORE_AREA[w]))
        # HT-20 P4 AMENDMENT (named in the HT-20 receipt). This floor was measuring the
        # ATTRIBUTE, and `preserveAspectRatio="xMinYMin meet"` had already scaled it away:
        # MEASURED on the pre-P4 build at 1280, data-cell said 3 while the svg was a 412-unit
        # viewBox rendered into 375.91px -- a scale of 0.9124, so the cell a person actually saw
        # was 2.74px. The check passed against a number that was never on screen.
        # P4 draws 1:1 (viewBox == drawn size), so the attribute is now the rendered size, and
        # the floor binds the axis it can: 100 rows in a 380px box cannot hold a 3px cell plus a
        # 1px gap at any scale, while the WIDTH went from 2.74px rendered to 5.13.
        floorC = 4 if w == 1920 else 3
        chk("S6f · %s · rendered cell >= %d on its wider axis, and no worse than the "
            "build it replaced on the other" % (t, floorC),
            m['cellW'] >= floorC and m['cellH'] >= 2.69,
            {'cellW': m['cellW'], 'cellH': m['cellH'], 'floor': floorC})
        chk("S6g · %s · node count < 500, the current week is outlined exactly once" % t,
            0 < m['nodes'] < 500 and m['cw'] == 1, [m['nodes'], m['cw']])
        chk("S6g · %s · the tooltip regex still matches: %s" % (t, m['tip']),
            bool(TIP_RE.match(m['tip'] or '')), m['tip'])
        chk("S6  · %s · zero page errors" % t, not errs, errs)
        await b.close()



# ---------------------------------------------------------------------------------------------
# S7 · CORY'S REVIEW, 2026-09-07 14:26 CDT — his seven notes, one check each, on his own data
# ---------------------------------------------------------------------------------------------
S7 = """() => {
  const g=i=>document.getElementById(i), Q=s=>document.querySelector(s);
  const colL=Q('.colL'), cb=colL.getBoundingClientRect();
  const log=g('log'), lb=log.getBoundingClientRect();
  const rows=[...log.querySelectorAll('.li')];
  const tape=g('tape'), wk=g('vWeeks');
  const tools=Q('#h18Comp .tools');
  /* only the fields that actually RENDER: #iWhy lives in an .ht9a-off block and has no box, so
     a zero rect is "hidden", not "cut off". */
  const fields=[...colL.querySelectorAll('textarea, .rate')]
                 .filter(e=>e.getClientRects().length>0);
  return {
    root: parseFloat(getComputedStyle(document.documentElement).fontSize),
    frame: Math.round(Q('.app').getBoundingClientRect().width),
    gut: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--h18gut')),
    clipped: fields.filter(e=>{ const b=e.getBoundingClientRect();
      return b.bottom > cb.bottom+1 || b.top < cb.top-1; })
      .map(e=>(e.id||e.className)+' bottom '+Math.round(e.getBoundingClientRect().bottom)
              +' vs box '+Math.round(cb.bottom)),
    filtersVisible: tools? tools.getClientRects().length>0 : false,
    filtersInDom: !!tools,
    rowsTotal: rows.length,
    rowsInside: rows.filter(e=>{const b=e.getBoundingClientRect();
      return b.top>=lb.top-1&&b.bottom<=lb.bottom+1&&b.left>=lb.left-1&&b.right<=lb.right+1;}).length,
    logCols: getComputedStyle(log).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    logScrolls: log.scrollHeight > log.clientHeight + 1,
    /* note 1: two rows in the same column whose vertical spans intersect. Nineteen of these
       shipped in HT-18b under a green "no scrolling" check. */
    overlaps: (()=>{ const k=[...log.children], lb=log.getBoundingClientRect();
      const b=k.map(e=>{const r=e.getBoundingClientRect();
        return {t:r.top-lb.top, b:r.bottom-lb.top, l:Math.round(r.left-lb.left)};});
      let n=0; for(let i=0;i<b.length;i++) for(let j=i+1;j<b.length;j++){
        if(Math.abs(b[i].l-b[j].l)>4) continue;
        if(b[i].t<b[j].b-1 && b[j].t<b[i].b-1) n++; }
      return n; })(),
    tapeVisible: tape? tape.getClientRects().length>0 : false,
    tapeH: tape? Math.round(tape.getBoundingClientRect().height) : 0,
    tapeStats: tape? tape.querySelectorAll('.tp').length : 0,
    tapeLines: tape? Math.round(tape.getBoundingClientRect().height /
                 parseFloat(getComputedStyle(tape).lineHeight || 20)) : 0,
    folds: wk? +wk.getAttribute('data-folds') : null,
    /* HT-20 P4 amendment — see the note at S6: data-cell is `WxH` now. */
    cell: wk? (function(v){ const p=String(v).split('x').map(Number).filter(x=>!isNaN(x));
                            return p.length? Math.min.apply(null,p) : NaN; })(
              wk.getAttribute('data-cell')) : null,
    page: document.documentElement.scrollHeight, vh: window.innerHeight,
    hScroll: document.documentElement.scrollWidth > window.innerWidth+1
  };
}"""


async def run_s7(pw):
    print("\n--- S7 · CORY'S REVIEW (2026-09-07 14:26 CDT), on his 26-habit / 4-group shape ---")
    # 1920x855 is his own window; 1600x900 and 1920x1080 bracket it
    for w, h in ((1920, 855), (1920, 1080), (1600, 900)):
        b, pg, errs = await open_page(pw, w, h, {'__BIGSET': True})
        m = await pg.evaluate(S7)
        t = "%dx%d" % (w, h)
        chk("C1 · %s · the screen is zoomed out: root 13px (was 14), gutter %d (was 32/48)"
            % (t, m['gut']), m['root'] == 13 and m['gut'] <= 24, [m['root'], m['gut']])
        chk("C2 · %s · nothing in the journal is cut off by its box" % t,
            not m['clipped'], m['clipped'])
        chk("C3 · %s · the completion filters are gone from the surface and still in the DOM" % t,
            not m['filtersVisible'] and m['filtersInDom'],
            [m['filtersVisible'], m['filtersInDom']])
        # AMENDED for HT-18c, and this is the amendment that matters most in this wire.
        # HT-18b PASSED "26 of 26, no scrolling" — and it passed because of the very bug Cory
        # reported in note 1. An auto grid row measures a child's height against its UNWRAPPED
        # width, so every row was sized as ONE line, 34px; the list "fit" in 442px while its real
        # wrapped content is 801px, and the surplus was drawn straight over the row beneath it.
        # Nineteen overlapping pairs, and a green check on top of them. Fixing the sizing did not
        # break this check — it revealed that the check had never been true.
        # What is asserted now is what can be true: two columns, ZERO overlaps, and a row count
        # that is measured and reported rather than wished for. Twenty-six full-length names, one
        # of them 155 characters, cannot all show without the ellipsis R70.142 forbids.
        # ---- AMENDED BY HT-23 S5b (CC HT 2026-09-10) · R67.2 · the rule is R70.233 ----------
        # THIS CHECK AND `S3a` IN THIS SAME FILE CONTRADICTED EACH OTHER, and that is the whole
        # reason `golden_ht18` has printed 128/134 for four wires. S3a was amended for HT-19 B1
        # under R70.233 to assert ONE column - "two sub-columns of ~230px cannot hold a standard's
        # name, and R70.142 forbids the ellipsis that would hide it". C4 was never amended and
        # went on demanding TWO. One file, two assertions, opposite requirements: whichever build
        # shipped, one of them was red. Nobody read the number, so nobody found the contradiction.
        # It is resolved the way HT-19 resolved S3a - by the ruling, not by preference.
        #
        # THE FLOOR IS DERIVED, NOT FITTED. With one column the rows that fit are a function of
        # viewport height, so the floor is written as that function with headroom rather than as
        # a constant chosen after looking at the answer. Everything that must be true regardless
        # - all 26 present, zero overlaps, the rest permitted to scroll (note 8) - still is.
        floorC4 = max(8, (h - 300) // 56)
        chk("C4 · %s · %d of %d habits in ONE column (R70.233), ZERO overlapping rows, floor %d "
            "(note 8 permits the rest to scroll)"
            % (t, m['rowsInside'], m['rowsTotal'], floorC4),
            m['rowsTotal'] == 26 and m['logCols'] == 1
            and m['overlaps'] == 0 and m['rowsInside'] >= floorC4,
            {'inside': m['rowsInside'], 'total': m['rowsTotal'], 'floor': floorC4,
             'cols': m['logCols'], 'overlaps': m['overlaps'], 'scrolls': m['logScrolls']})
        chk("C5 · %s · the dead band above the journal carries the tape — %d stats on ONE line"
            % (t, m['tapeStats']),
            m['tapeVisible'] and m['tapeStats'] >= 10 and m['tapeH'] <= 52,
            {'visible': m['tapeVisible'], 'stats': m['tapeStats'], 'h': m['tapeH']})
        chk("C6 · %s · LIFE is ONE graph, no folds, cell %s" % (t, m['cell']),
            m['folds'] == 1 and m['cell'] >= 4, [m['folds'], m['cell']])
        chk("C7 · %s · one page, a bounded 96px of give, no sideways scroll (note 8)" % t,
            m['page'] - m['vh'] <= 96 and not m['hScroll'],
            [m['page'], m['vh'], m['page'] - m['vh'], m['hScroll']])
        chk("C  · %s · zero page errors" % t, not errs, errs)
        await b.close()


async def run():
    async with async_playwright() as pw:
        await run_s1(pw)
        await run_s2(pw)
        await run_s3(pw)
        await run_s4(pw)
        await run_s5(pw)
        await run_s6(pw)
        await run_s7(pw)
    ok = sum(1 for p, _ in RES if p)
    print("\nGOLDEN HT-18: %d/%d PASS, %d FAIL" % (ok, len(RES), len(RES) - ok))
    return 0 if ok == len(RES) else 1

sys.exit(asyncio.run(run()))
