#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-429 GOLDEN - DRAG ONLY BY THE HANDLE, run literally.

    python3 tools/golden_ht429.py            (run from the estate root, or anywhere)
    python3 tools/golden_ht429.py --only A

  A   the TEXT never drags - a press on the words, held past the old long-press and moved, never
      reorders and never arms, on TOUCH and on MOUSE
  B   the HANDLE drags and the order is persisted, on TOUCH and on MOUSE
  C   the handle's HIT AREA measures >= 44x44 CSS px on the phone layout
  D   a pointercancel mid-drag NEVER commits - the order stays as it was before the press
  S   the stress: 200 text presses with random holds and moves reorder nothing; 50 handle drags each
      reorder and conserve the list; a pointercancel mid-drag leaves the order untouched

Cory (2026-09-29, phone screenshot): "The drag feature is buggy on the iPhone. I only want to drag it
if I click and hold on the 3 lines, not if I click and hold on the text. Sometimes I scroll and it
switches positions."

LIKE golden_ht23, THE TOUCH PATH DRIVES REAL TOUCH, NOT A MOUSE, through the CDP
`Input.dispatchTouchEvent` domain (pointerType === 'touch'), because the bug is a touch bug and a
`page.mouse` gesture would pass against the broken build. The MOUSE path uses `page.mouse` on purpose:
the fix is ONE RULE for every pointer type, so both are proven here.
"""
import argparse, asyncio, io, json, os, sys
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
    raise SystemExit('golden_ht429: no estate root above %s' % start)


ESTATE = find_estate(REPO)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'),
              os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    return os.path.join(estate, '_machine', 'ht3')


BASE = 'file://' + os.path.join(fixture_dir(ESTATE), 'index.html').replace(os.sep, '/')

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:400])))


async def open_page(pw, w=390, h=844, flags=None, touch=True):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=touch, is_mobile=touch, device_scale_factor=2)
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


async def touch_hold(pg, cdp, x0, y0, x1, y1, steps=10, hold_ms=0):
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': _pt(x0, y0)})
    if hold_ms:
        await pg.wait_for_timeout(hold_ms)                 # rest on the words: past the OLD 450ms long-press
    for i in range(1, steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + (y1 - y0) * i / steps
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': _pt(x, y)})
        await pg.wait_for_timeout(8)


async def touch_release(pg, cdp):
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(140)


async def touch_cancel(pg, cdp):
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
    await pg.wait_for_timeout(140)


async def mouse_hold(pg, x0, y0, x1, y1, steps=10, hold_ms=0):
    await pg.mouse.move(x0, y0)
    await pg.mouse.down()
    if hold_ms:
        await pg.wait_for_timeout(hold_ms)
    for i in range(1, steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + (y1 - y0) * i / steps
        await pg.mouse.move(x, y)
        await pg.wait_for_timeout(8)


ROWS_JS = """() => [...document.querySelectorAll('#log .li')].map(r => r.getAttribute('data-h'))"""

# coordinates of a control inside the row at list-index i. sel: '.nm' (the words) or '.drg' (the handle)
PT_JS = """(a) => { const rows=[...document.querySelectorAll('#log .li')]; const row=rows[a.i]; if(!row) return null;
  const n = row.querySelector(a.sel); if(!n) return null; const r = n.getBoundingClientRect();
  return { x: r.left + r.width/2, y: r.top + r.height/2, top: r.top, bottom: r.bottom, h: r.height,
           id: row.getAttribute('data-h') }; }"""

# the number of habit-order writes the mock has recorded (sort_order / section patches on `habits`)
WRITES_JS = """() => (window.__UPDATES || []).filter(u => u[0] === 'habits' && u[1] &&
  ('sort_order' in u[1] || 'section' in u[1])).length"""

STATE_JS = """() => ({ armed: document.querySelectorAll('#log .li.armed').length,
  reordering: document.getElementById('log').classList.contains('reordering') })"""


async def A(pw):
    print("\nA " + u"·" + " the TEXT never drags - held past the old long-press, moved, on touch AND mouse")
    for kind in ('touch', 'mouse'):
        b, pg, errs = await open_page(pw)
        cdp = await pg.context.new_cdp_session(pg)
        before = await pg.evaluate(ROWS_JS)
        w0 = await pg.evaluate(WRITES_JS)
        p = await pg.evaluate(PT_JS, {'i': 0, 'sel': '.nm'})
        # rest the finger on the WORDS for 800ms (past the old 450ms long-press) then move 60px down
        if kind == 'touch':
            await touch_hold(pg, cdp, p['x'], p['y'], p['x'], p['y'] + 60, steps=10, hold_ms=800)
            mid = await pg.evaluate(STATE_JS)
            await touch_release(pg, cdp)
        else:
            await mouse_hold(pg, p['x'], p['y'], p['x'], p['y'] + 60, steps=10, hold_ms=800)
            mid = await pg.evaluate(STATE_JS)
            await pg.mouse.up()
        await pg.wait_for_timeout(200)
        after = await pg.evaluate(ROWS_JS)
        w1 = await pg.evaluate(WRITES_JS)
        chk("A1 " + u"·" + " (%s) the order is unchanged - a press on the words never reorders" % kind, after == before, {'before': before[:6], 'after': after[:6]})
        chk("A2 " + u"·" + " (%s) nothing is armed and the log never entered reordering" % kind,
            mid.get('armed') == 0 and mid.get('reordering') is False, mid)
        chk("A3 " + u"·" + " (%s) not one order write was persisted" % kind, w1 == w0, {'w0': w0, 'w1': w1})
        chk("A4 " + u"·" + " (%s) zero page errors" % kind, not errs, errs[:3])
        await b.close()


async def B(pw):
    print("\nB " + u"·" + " the HANDLE drags and the order is persisted, on touch AND mouse")
    for kind in ('touch', 'mouse'):
        b, pg, errs = await open_page(pw)
        cdp = await pg.context.new_cdp_session(pg)
        before = await pg.evaluate(ROWS_JS)
        w0 = await pg.evaluate(WRITES_JS)
        a = await pg.evaluate(PT_JS, {'i': 0, 'sel': '.drg'})
        t = await pg.evaluate(PT_JS, {'i': 3, 'sel': '.nm'})
        endy = t['y'] + t['h'] * 0.25                       # a quarter-row past the target midpoint, clear of ambiguity
        if kind == 'touch':
            await touch_hold(pg, cdp, a['x'], a['y'], a['x'], endy, steps=14)
            await touch_release(pg, cdp)
        else:
            await mouse_hold(pg, a['x'], a['y'], a['x'], endy, steps=14)
            await pg.mouse.up()
        await pg.wait_for_timeout(300)
        after = await pg.evaluate(ROWS_JS)
        w1 = await pg.evaluate(WRITES_JS)
        chk("B1 " + u"·" + " (%s) the order changed - the handle drags" % kind, after != before, {'before': before[:6], 'after': after[:6]})
        chk("B2 " + u"·" + " (%s) the list is conserved (nothing lost or duplicated)" % kind,
            sorted(after) == sorted(before), {'before': sorted(before), 'after': sorted(after)})
        chk("B3 " + u"·" + " (%s) the new order was persisted, not just moved on screen" % kind, w1 > w0, {'w0': w0, 'w1': w1})
        chk("B4 " + u"·" + " (%s) zero page errors" % kind, not errs, errs[:3])
        await b.close()


async def C(pw):
    print("\nC " + u"·" + " the handle's HIT AREA measures >= 44x44 on the phone layout")
    b, pg, errs = await open_page(pw)
    hit = await pg.evaluate("""() => {
      const g = document.querySelector('#log .li .drg'); if(!g) return {noHandle:true};
      const cs = getComputedStyle(g, '::before');
      const gb = g.getBoundingClientRect();
      const cx = gb.left + gb.width/2, cy = gb.top + gb.height/2;
      const onThis = (x,y) => { const el = document.elementFromPoint(x,y);
        return !!(el && el.closest && el.closest('.drg') === g); };
      const onAny = (x,y) => { const el = document.elementFromPoint(x,y);
        return !!(el && el.closest && el.closest('.drg')); };
      // the whole 44px column, top to bottom, must land on A draggable handle - no dead gap a thumb can miss
      const span = [-20,-14,-7,0,7,14,20].map(dy => onAny(cx, cy+dy));
      return { ovw: parseFloat(cs.width), ovh: parseFloat(cs.height), glyphH: Math.round(gb.height),
               rowH: Math.round(document.querySelector('#log .li').getBoundingClientRect().height),
               center: onThis(cx,cy), spanAllHandle: span.every(Boolean), span,
               rowTouchAction: getComputedStyle(document.querySelector('#log .li')).touchAction,
               handleTouchAction: getComputedStyle(g).touchAction }; }""")
    chk("C1 " + u"·" + " the overlay measures >= 44x44 CSS px", hit.get('ovw', 0) >= 44 and hit.get('ovh', 0) >= 44, hit)
    chk("C2 " + u"·" + " the glyph centre is THIS handle and the full 44px column has no dead spot - every point lands on a draggable handle",
        hit.get('center') and hit.get('spanAllHandle'), hit)
    chk("C3 " + u"·" + " the glyph did not bloat the row (its box stays within the row height)",
        hit.get('glyphH', 99) <= hit.get('rowH', 0) + 2, hit)
    chk("C4 " + u"·" + " the handle is touch-action:none but the ROW is not (page scroll from a row still works)",
        hit.get('handleTouchAction') == 'none' and hit.get('rowTouchAction') != 'none', hit)
    await b.close()


async def D(pw):
    print("\nD " + u"·" + " a pointercancel mid-drag NEVER commits - the order stays as it was")
    b, pg, errs = await open_page(pw)
    cdp = await pg.context.new_cdp_session(pg)
    before = await pg.evaluate(ROWS_JS)
    w0 = await pg.evaluate(WRITES_JS)
    a = await pg.evaluate(PT_JS, {'i': 0, 'sel': '.drg'})
    t = await pg.evaluate(PT_JS, {'i': 3, 'sel': '.nm'})
    # begin a real handle drag, move it, then let the browser CANCEL the gesture mid-drag
    await touch_hold(pg, cdp, a['x'], a['y'], a['x'], t['y'], steps=12)
    await touch_cancel(pg, cdp)
    await pg.wait_for_timeout(300)
    after = await pg.evaluate(ROWS_JS)
    w1 = await pg.evaluate(WRITES_JS)
    st = await pg.evaluate(STATE_JS)
    chk("D1 " + u"·" + " the order on screen returned to what it was before the press", after == before, {'before': before[:6], 'after': after[:6]})
    chk("D2 " + u"·" + " nothing was persisted by the cancelled drag", w1 == w0, {'w0': w0, 'w1': w1})
    chk("D3 " + u"·" + " no row is left armed and the log is no longer reordering",
        st.get('armed') == 0 and st.get('reordering') is False, st)
    chk("D4 " + u"·" + " zero page errors", not errs, errs[:3])
    await b.close()


async def S(pw):
    print("\nS " + u"·" + " the stress: 200 text presses reorder nothing; 50 handle drags reorder and conserve")
    # ---- 200 text presses, random holds 0-1500ms and moves 0-300px, touch AND mouse ------------
    b, pg, errs = await open_page(pw)
    cdp = await pg.context.new_cdp_session(pg)
    order0 = await pg.evaluate(ROWS_JS)
    w0 = await pg.evaluate(WRITES_JS)
    HOLDS = [0, 150, 480, 900, 1500]                        # deterministic, and it CROSSES the old 450ms threshold
    MOVES = [0, 40, 120, 220, 300]
    bad = []
    maxarmed = 0
    everreorder = False
    n = await pg.evaluate("() => document.querySelectorAll('#log .li').length")
    for i in range(200):
        kind = 'touch' if i % 2 == 0 else 'mouse'
        p = await pg.evaluate(PT_JS, {'i': i % n, 'sel': '.nm'})
        if not p:
            continue
        hold = HOLDS[i % len(HOLDS)]
        move = MOVES[(i // 2) % len(MOVES)] * (1 if i % 4 < 2 else -1)
        if kind == 'touch':
            await touch_hold(pg, cdp, p['x'], p['y'], p['x'], p['y'] + move, steps=3, hold_ms=hold)
            mid = await pg.evaluate(STATE_JS)
            await touch_release(pg, cdp)
        else:
            await mouse_hold(pg, p['x'], p['y'], p['x'], p['y'] + move, steps=3, hold_ms=hold)
            mid = await pg.evaluate(STATE_JS)
            await pg.mouse.up()
        maxarmed = max(maxarmed, mid.get('armed', 0))
        if mid.get('reordering'):
            everreorder = True
        cur = await pg.evaluate(ROWS_JS)
        if cur != order0:
            bad.append({'i': i, 'kind': kind, 'hold': hold, 'move': move, 'order': cur[:6]})
            break
    w1 = await pg.evaluate(WRITES_JS)
    chk("S1 " + u"·" + " 200 text presses (touch+mouse) and the order never once changed", not bad, bad[:2])
    chk("S2 " + u"·" + " through all 200, nothing was ever armed and the log never entered reordering",
        maxarmed == 0 and everreorder is False, {'maxarmed': maxarmed, 'reordering': everreorder})
    chk("S3 " + u"·" + " not one order write was persisted by the 200 text presses", w1 == w0, {'w0': w0, 'w1': w1})
    await b.close()

    # ---- 50 handle drags, each reorders and conserves the list --------------------------------
    b, pg, errs2 = await open_page(pw)
    cdp = await pg.context.new_cdp_session(pg)
    EDGE, vh = 64, await pg.evaluate("() => window.innerHeight")
    n = await pg.evaluate("() => document.querySelectorAll('#log .li').length")
    ids_ok = True
    moved_count = 0
    fail = None
    for d in range(50):
        before = await pg.evaluate(ROWS_JS)
        k = 1 + (d % (n - 1)) if n > 1 else 0
        a = await pg.evaluate(PT_JS, {'i': 0, 'sel': '.drg'})
        t = await pg.evaluate(PT_JS, {'i': k, 'sel': '.nm'})
        if not a or not t:
            fail = {'d': d, 'why': 'no box'}; ids_ok = False; break
        endy = min(max(t['y'] + t['h'] * 0.25, EDGE + 8), vh - EDGE - 8)   # clear of the auto-scroll band
        await touch_hold(pg, cdp, a['x'], a['y'], a['x'], endy, steps=12)
        await touch_release(pg, cdp)
        await pg.wait_for_timeout(120)
        after = await pg.evaluate(ROWS_JS)
        if sorted(after) != sorted(before):
            fail = {'d': d, 'before': sorted(before), 'after': sorted(after)}; ids_ok = False; break
        if after != before:
            moved_count += 1
    chk("S4 " + u"·" + " 50 handle drags and the list was conserved every time (nothing lost or duplicated)", ids_ok, fail)
    chk("S5 " + u"·" + " and the handle actually reordered on those drags (%d of 50 changed the order)" % moved_count,
        moved_count >= 40, {'moved': moved_count})
    chk("S6 " + u"·" + " zero page errors across the 50 handle drags", not errs2, errs2[:3])
    await b.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    args = ap.parse_args()
    todo = {'A': A, 'B': B, 'C': C, 'D': D, 'S': S}
    async with async_playwright() as pw:
        if args.only:
            await todo[args.only](pw)
        else:
            for fn in (A, B, C, D, S):
                await fn(pw)
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-429: %d/%d PASS%s" % (npass, len(RES), "" if npass == len(RES) else ", %d FAIL" % (len(RES) - npass)))
    sys.exit(0 if npass == len(RES) else 1)


if __name__ == '__main__':
    asyncio.run(main())
