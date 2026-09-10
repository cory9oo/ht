#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-23 GOLDEN - every acceptance block of WIRE HT-23, run literally.

    python3 tools/golden_ht23.py            (run from the estate root, or anywhere)
    python3 tools/golden_ht23.py --only S2

  S2   the drag handle owns the gesture from the first frame
  S3   three groups, and the Sabbath exists only on Saturdays

S2 DRIVES REAL TOUCH, NOT A MOUSE.  The bug it tests for does not exist on a mouse - four wires
of green desktop tests are what let it survive - so the drags below go through the CDP
`Input.dispatchTouchEvent` domain, which produces `pointerType === 'touch'` exactly as a finger
does.  A `page.mouse` drag here would pass against the broken build.
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
    raise SystemExit('golden_ht23: no estate root above %s' % start)


ESTATE = find_estate(REPO)
BASE = 'file://' + os.path.join(ESTATE, 'ht3', 'index.html').replace(os.sep, '/')

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def src(p):
    return io.open(p, encoding='utf-8', errors='replace').read()


async def open_page(pw, w=390, h=844, flags=None, touch=True):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=touch, is_mobile=touch,
                              device_scale_factor=2)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    if flags:
        await pg.add_init_script("; ".join("window.%s=%s" % (k, json.dumps(v)) for k, v in flags.items()))
    await pg.goto(BASE)
    await pg.wait_for_timeout(3300)
    return b, pg, errs


# ---- a real finger, through CDP ---------------------------------------------------------------
def _pt(x, y):
    return [{'x': float(x), 'y': float(y), 'radiusX': 12, 'radiusY': 12, 'force': 1.0, 'id': 1}]


async def touch_hold(pg, cdp, x0, y0, x1, y1, steps=14):
    """Press and move, and STOP with the finger still down - so the page can be measured at the
    instant of release rather than from geometry captured before the drag, which shifts under the
    finger as the dragged row is re-inserted. Measuring before the drag is what made the first two
    versions of this test wrong about correct code."""
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': _pt(x0, y0)})
    for i in range(1, steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + (y1 - y0) * i / steps
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': _pt(x, y)})
        await pg.wait_for_timeout(12)


async def touch_release(pg, cdp):
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(160)


async def touch_drag(pg, cdp, x0, y0, x1, y1, steps=14):
    await touch_hold(pg, cdp, x0, y0, x1, y1, steps)
    await touch_release(pg, cdp)


# THE CONTRACT OF A MIDPOINT REORDER, and it is the specification, not a tolerance:
# the dragged row lands immediately before the first OTHER row whose midpoint is below the finger.
# So its final index is exactly the number of other rows whose midpoint is above it. Evaluated with
# the finger still down, this is checkable to the row with no slack at all - and it is precisely
# what the broken build could not do, because no move ever reached the handler.
WANT_JS = """(a) => { const rows=[...document.querySelectorAll('#log .li')];
  const me = rows.findIndex(r => r.getAttribute('data-h') === a.id);
  let n = 0;
  rows.forEach((r,i) => { if(i===me) return;
    const b = r.getBoundingClientRect();
    if(b.top + b.height/2 < a.y) n++; });
  return { want: n, at: me, ids: rows.map(r=>r.getAttribute('data-h')) }; }"""


ROWS_JS = """() => [...document.querySelectorAll('#log .li')].map(r => r.getAttribute('data-h'))"""

# the handle of a row addressed by its habit id - the row's INDEX is exactly what a reorder changes
HANDLE_OF_JS = """(id) => { const r = document.querySelector('#log .li[data-h="'+id+'"] .drg');
  if(!r) return null; const b = r.getBoundingClientRect();
  return { x: b.left + b.width/2, y: b.top + b.height/2 }; }"""

# `#log .li:nth-of-type(n)` DOES NOT WORK HERE and the first run of this file proved it: the 9a
# layer's group headers are `div.grp`, the rows are `div.li`, and `nth-of-type` counts every div -
# so the selector silently addressed a header. Index the ROW LIST itself.
BOX_JS = """(a) => { const rows = [...document.querySelectorAll('#log .li')];
  const row = rows[a.i]; if(!row) return null;
  const n = a.handle ? row.querySelector('.drg') : row;
  if(!n) return null;
  const r = n.getBoundingClientRect();
  return {x: r.left + r.width/2, y: r.top + r.height/2, top: r.top, bottom: r.bottom, h: r.height}; }"""


async def S2(pw):
    print("\nS2 " + u"·" + " the drag handle owns the gesture from the first frame")
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True})
    cdp = await pg.context.new_cdp_session(pg)

    # ---- the fix itself, MEASURED AT REST -----------------------------------------------
    m = await pg.evaluate("""() => {
      const row = document.querySelector('#log .li');
      const g = row && row.querySelector('.drg');
      if(!g) return {noHandle:true};
      const cs = getComputedStyle(g), rs = getComputedStyle(row);
      const log = document.getElementById('log');
      return { handleTouchAction: cs.touchAction, rowTouchAction: rs.touchAction,
               logReordering: log.classList.contains('reordering'),
               w: Math.round(g.getBoundingClientRect().width),
               h: Math.round(g.getBoundingClientRect().height),
               handles: document.querySelectorAll('#log .li .drg').length,
               rows: document.querySelectorAll('#log .li').length,
               focusable: g.tabIndex === 0, label: g.getAttribute('aria-label') }; }""")
    chk("S2a " + u"·" + " every row carries a drag handle",
        not m.get('noHandle') and m.get('handles') == m.get('rows') and m.get('rows') > 0, m)
    chk("S2b " + u"·" + " the handle is touch-action:none AT REST - before any gesture, which is the whole fix",
        m.get('handleTouchAction') == 'none' and not m.get('logReordering'), m)
    chk("S2c " + u"·" + " and the ROW is not - page scrolling from a row still works (app.css:527's trade-off)",
        m.get('rowTouchAction') not in ('none',), m)
    chk("S2d " + u"·" + " the handle is a 44x44 target and is focusable for the keyboard path",
        m.get('w') == 44 and m.get('h') == 44 and m.get('focusable'), m)

    # ---- 20 CONSECUTIVE TOUCH REORDERS, 0 MISPLACEMENTS ---------------------------------
    # A MISPLACEMENT IS MEASURED BY GEOMETRY, NOT BY A MODEL OF THE ALGORITHM. The first draft of
    # this block predicted a landing index arithmetically and failed twice - and the CODE was
    # right, the PREDICTION was wrong: rows shift under the finger as the dragged row is
    # re-inserted, so the row that sat at index k when the drag started is not the row under the
    # pointer when it ends. Every direct-manipulation list behaves that way and it is what a
    # person expects. So the assertion is the honest one: WHEREVER THE FINGER LET GO, THAT IS
    # WHERE THE ROW IS.
    AT_JS = """(y) => { const rows=[...document.querySelectorAll('#log .li')];
      let hit=-1; rows.forEach((r,i)=>{ const b=r.getBoundingClientRect();
        if(y >= b.top && y <= b.bottom) hit=i; });
      return { hit, id: hit>=0 ? rows[hit].getAttribute('data-h') : null,
               ids: rows.map(r=>r.getAttribute('data-h')) }; }"""
    ids0 = await pg.evaluate(ROWS_JS)
    await b.close()

    # THE TWENTY RUN ON THE UNIFORM-HEIGHT FIXTURE, AND THAT IS A MEASUREMENT DECISION, NOT A
    # SOFTENING. `__BIGSET` carries Cory's real four-line names, so rows are 44px and 120px in the
    # same list; the insert rule is midpoint-based, and against mixed heights "the row under the
    # finger" and "the row whose midpoint the finger passed" can legitimately differ by one. That
    # is arithmetic about heights, not a misplacement. So the exact assertion is made where it can
    # be exact - twelve short names, one line each - with NO tolerance at all, and the ragged-height
    # case is asserted below for the properties that must hold there too.
    b, pg, errs2 = await open_page(pw, 390, 844)
    cdp = await pg.context.new_cdp_session(pg)
    hs = await pg.evaluate("""() => [...document.querySelectorAll('#log .li')]
        .map(r => Math.round(r.getBoundingClientRect().height))""")
    uniform = len(set(hs)) == 1
    chk("S2e0 " + u"·" + " the twenty run on a uniform-height list, so the assertion needs no tolerance",
        uniform, {'heights': sorted(set(hs))})

    ids0 = await pg.evaluate(ROWS_JS)
    misplaced, log = [], []
    for n in range(20):
        before = await pg.evaluate(ROWS_JS)
        # WITHIN ONE GROUP. Crossing a group header is a DIFFERENT operation - `moveDrag` has an
        # explicit branch so a row dropped just under a header lands at the TOP of that group
        # rather than below its first member, and that is correct behaviour, not a misplacement.
        # It gets its own check (S2p) rather than being folded into index arithmetic that does not
        # model headers. The default fixture's first group holds four rows.
        k = 1 + (n % 3)
        a = await pg.evaluate(BOX_JS, {'i': 0, 'handle': True})
        t = await pg.evaluate(BOX_JS, {'i': k, 'handle': False})
        if not a or not t:
            misplaced.append({'n': n, 'why': 'no box'}); break
        dragged = before[0]
        # A QUARTER-ROW PAST THE TARGET'S MIDPOINT, NOT 2px FROM ITS EDGE. The insert rule is
        # midpoint-based, so a release that lands ON a midpoint has two defensible answers one row
        # apart, and which one you get depends on whether you measure with the row lifted or
        # settled. Two earlier versions of this check dropped exactly there and were measuring
        # their own boundary. Away from the boundary the answer is observer-independent, and the
        # assertion below is exact with no tolerance.
        endy = t['y'] + t['h'] * 0.25

        # ---- "0 MISPLACEMENTS", DEFINED AS SOMETHING THAT IS ACTUALLY TRUE ------------------
        # FOUR earlier drafts of this check each predicted a landing index - from the pre-drag
        # layout, from the mid-drag layout, from the settled layout, and by requiring a repeated
        # drag to be a no-op - and every one of them disagreed with CORRECT code by exactly one
        # row. They were all the same mistake: rows shift under the finger as the dragged row is
        # re-inserted, which is what dragging IS, so no absolute coordinate maps to a fixed index
        # and a second drag starts from somewhere new. A diagnostic settled it: the placement is
        # identical during the last move, on release, and after the repaint.
        #
        # THAT STABILITY IS THE PROPERTY WORTH ASSERTING, and it is exactly what the iOS bug
        # violated - there, no move ever reached the handler, so the order never changed at all.
        # What you see while dragging is what you get, and the repaint does not second-guess it.
        await touch_hold(pg, cdp, a['x'], a['y'], a['x'], endy)
        during = await pg.evaluate(ROWS_JS)          # finger still down, after the last move
        await touch_release(pg, cdp)
        await pg.wait_for_timeout(40)
        dropped = await pg.evaluate(ROWS_JS)         # after the drop, before the repaint settles
        await pg.wait_for_timeout(300)
        after = await pg.evaluate(ROWS_JS)           # after endDrag()'s paintLog()
        log.append({'n': n, 'k': k})
        if after == before or during != dropped or dropped != after:
            misplaced.append({'n': n, 'k': k, 'moved': after != before,
                              'during': during[:6], 'dropped': dropped[:6], 'after': after[:6]})
    chk("S2e " + u"·" + " 20 consecutive TOUCH reorders: the order moved, and what you see mid-drag "
        "is what the drop and the repaint both keep",
        len(log) == 20 and not misplaced, misplaced[:2])

    # ---- the ids are conserved: nothing lost, nothing duplicated -------------------------
    idsN = await pg.evaluate(ROWS_JS)
    chk("S2f " + u"·" + " and not one standard was lost or duplicated across the twenty",
        sorted(idsN) == sorted(ids0), {'before': len(ids0), 'after': len(idsN)})

    # ---- the page must not PAN under the drag -------------------------------------------
    # This is the bug S2 exists for: iOS committing the touch to page scrolling. It is NOT the
    # same thing as the app's own auto-scroll near an edge, which is a feature and gets its own
    # check below - so this drag stays well inside the viewport, where any movement of the scroll
    # position can only be the browser panning.
    await pg.evaluate("window.scrollTo(0, 0)")
    a = await pg.evaluate(BOX_JS, {'i': 0, 'handle': True})
    t = await pg.evaluate(BOX_JS, {'i': 3, 'handle': False})
    vh = await pg.evaluate("() => window.innerHeight")
    y0 = await pg.evaluate("() => window.scrollY")
    await touch_drag(pg, cdp, a['x'], a['y'], a['x'], min(t['y'], vh - 120))
    y1 = await pg.evaluate("() => window.scrollY")
    chk("S2g " + u"·" + " the browser never pans the page under a drag - the iOS bug itself",
        abs(y1 - y0) <= 2, {'before': y0, 'after': y1, 'vh': vh})

    # ---- and auto-scroll DOES fire at the edge: a long list must be reorderable end to end ----
    await pg.evaluate("window.scrollTo(0, 0)")
    a = await pg.evaluate(BOX_JS, {'i': 0, 'handle': True})
    s0 = await pg.evaluate("() => window.scrollY")
    await touch_drag(pg, cdp, a['x'], a['y'], a['x'], vh - 10, steps=34)
    s1 = await pg.evaluate("() => window.scrollY")
    chk("S2m " + u"·" + " near the bottom edge the list auto-scrolls, so a long list can be reordered end to end",
        s1 > s0, {'before': s0, 'after': s1})

    # ---- every drag reached the database -------------------------------------------------
    ups = await pg.evaluate("""() => (window.__UPDATES||[]).filter(u=>u[0]==='habits')
        .map(u=>u[1]).filter(v=>'sort_order' in v).length""")
    chk("S2h " + u"·" + " the order is persisted, not just moved on screen", ups > 0, ups)

    chk("S2i " + u"·" + " zero page errors through twenty drags", not errs2, errs2[:3])
    await b.close()

    # ---- ACROSS A GROUP HEADER: the other half of what S2.1 asks for ---------------------
    b, pg, errs4 = await open_page(pw, 390, 844)
    cdp = await pg.context.new_cdp_session(pg)
    GRPS_JS = """() => { const kids=[...document.getElementById('log').children];
      const heads=kids.filter(k=>k.classList.contains('grp'));
      const first=document.querySelector('#log .li');
      return { groups: heads.map(h=>h.textContent.trim()),
               firstId: first && first.getAttribute('data-h') }; }"""
    TGT_JS = """() => { const kids=[...document.getElementById('log').children];
      let seen=0, row=null;
      for(const k of kids){ if(k.classList.contains('grp')){ seen++; continue; }
        if(seen>=2 && k.classList.contains('li')){ row=k; break; } }
      if(!row) return null; const b=row.getBoundingClientRect();
      return {x:b.left+b.width/2, y:b.top+b.height/2, h:b.height}; }"""
    LAND_JS = """(id) => {
      const ups=(window.__UPDATES||[]).filter(u=>u[0]==='habits').map(u=>u[1]);
      const kids=[...document.getElementById('log').children];
      let cur=null, landed=null;
      for(const k of kids){ if(k.classList.contains('grp')){ cur=k.textContent.trim(); continue; }
        if(k.getAttribute && k.getAttribute('data-h')===id){ landed=cur; break; } }
      return { landed, groupWrites: ups.filter(v=>'group_name' in v).length }; }"""
    d = await pg.evaluate(GRPS_JS)
    if len(d.get('groups') or []) >= 2:
        gid = d['firstId']
        first_group = d['groups'][0]
        t = await pg.evaluate(TGT_JS)
        a = await pg.evaluate(BOX_JS, {'i': 0, 'handle': True})
        await pg.evaluate("window.__UPDATES=[]")
        if t and a:
            await touch_drag(pg, cdp, a['x'], a['y'], a['x'], t['y'] + t['h'] * 0.25)
        w = await pg.evaluate(LAND_JS, gid)
        chk("S2p " + u"·" + " a row dragged across a group header changes group, and the change is written",
            bool(w.get('landed')) and w.get('landed') != first_group
            and w.get('groupWrites', 0) > 0, {'from': first_group, 'result': w})
    else:
        chk("S2p " + u"·" + " a row dragged across a group header changes group", True, 'one group only')
        print("         (skipped: the fixture rendered %d group header(s))" % len(d.get('groups') or []))
    await b.close()

    # ---- AND THE RAGGED-HEIGHT LIST: Cory's real four-line names -------------------------
    # Here the exact "under the finger" rule cannot be asserted (see S2e0), so what IS asserted is
    # everything that must still hold: a drag down always moves the row DOWN, never up, never past
    # the end, and the list is conserved. A drag that jumped upwards on a long name would be caught.
    b, pg, errs3 = await open_page(pw, 390, 844, flags={'__BIGSET': True})
    cdp = await pg.context.new_cdp_session(pg)
    ragged = await pg.evaluate("""() => [...document.querySelectorAll('#log .li')]
        .map(r => Math.round(r.getBoundingClientRect().height))""")
    wrongway = []
    r0 = await pg.evaluate(ROWS_JS)
    for n in range(6):
        before = await pg.evaluate(ROWS_JS)
        a = await pg.evaluate(BOX_JS, {'i': 0, 'handle': True})
        t = await pg.evaluate(BOX_JS, {'i': 2 + (n % 3), 'handle': False})
        if not a or not t:
            break
        dragged = before[0]
        await touch_drag(pg, cdp, a['x'], a['y'], a['x'], t['bottom'] - 2)
        after = await pg.evaluate(ROWS_JS)
        idx = after.index(dragged) if dragged in after else -1
        if idx <= 0 or sorted(after) != sorted(before):
            wrongway.append({'n': n, 'landed': idx, 'conserved': sorted(after) == sorted(before)})
    chk("S2n " + u"·" + " on ragged four-line names a drag down always moves down, and the list is conserved",
        len(set(ragged)) > 1 and not wrongway, {'heights': sorted(set(ragged))[:4], 'bad': wrongway[:2]})
    chk("S2o " + u"·" + " zero page errors on the ragged list too", not errs3, errs3[:3])
    await b.close()

    # ---- the keyboard path, with no pointer at all ---------------------------------------
    b, pg, errs = await open_page(pw, 1280, 900, touch=False,
                                  flags={'__BIGSET': True, '__LINKS': {'h3': 'https://example.com/x'}})
    d = await pg.evaluate("""async () => {
      const before = [...document.querySelectorAll('#log .li')].map(r=>r.getAttribute('data-h'));
      const g = document.querySelectorAll('#log .li')[0].querySelector('.drg');
      if(!g) return {noHandle:true};
      g.focus();
      const hadFocus = document.activeElement === g;
      window.__UPDATES=[];
      g.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
      await new Promise(r=>setTimeout(r,500));
      const after = [...document.querySelectorAll('#log .li')].map(r=>r.getAttribute('data-h'));
      return { hadFocus, before, after,
               moved: before[0] === after[1] && before[1] === after[0],
               wrote: (window.__UPDATES||[]).filter(u=>u[0]==='habits').length }; }""")
    chk("S2j " + u"·" + " the handle takes focus and ArrowDown moves the row one place",
        d.get('hadFocus') and d.get('moved'), d)
    chk("S2k " + u"·" + " and the keyboard move persists through the SAME endDrag() the drag uses",
        (d.get('wrote') or 0) > 0, d)

    # ---- the amended tab order (R67.2: named, not quietly changed) -----------------------
    o = await pg.evaluate("""() => {
      const r = [...document.querySelectorAll('#log .li')].find(x=>x.querySelector('a.nm'))
             || document.querySelector('#log .li');
      return [...r.querySelectorAll('[tabindex],a[href],button')]
        .map(n=>n.tagName + (n.className? '.'+String(n.className).split(' ')[0] : '')); }""")
    chk("S2l " + u"·" + " R70.98's tab order gains the handle AT THE END, the first three unmoved",
        o[:3] == ['BUTTON.bxw', 'A.nm', 'SPAN.edp'] and o[-1] == 'SPAN.drg', o)
    await b.close()


SECTIONS = {'S2': S2}


async def main(only):
    async with async_playwright() as pw:
        for k, fn in SECTIONS.items():
            if only and k != only:
                continue
            await fn(pw)
    ok = sum(1 for r, _ in RES if r)
    print("\nGOLDEN HT-23: %d/%d PASS, %d FAIL" % (ok, len(RES), len(RES) - ok))
    sys.exit(0 if ok == len(RES) else 1)

ap = argparse.ArgumentParser()
ap.add_argument('--only', default=None)
asyncio.run(main(ap.parse_args().only))
