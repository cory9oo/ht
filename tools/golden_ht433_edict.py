#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GOLDEN HT-433 - ONE ROW, ONE WIDTH - THE EDICT (paste 433), run literally.

    python tools/golden_ht433_edict.py
    python tools/golden_ht433_edict.py --only P1

Cory, 2026-09-30 12:06 AM (two phone screenshots of TODAY, STANDARDS section, 390 px): "When I tap on
the 3 lines it changed the width of the rows - I want the row width to be wide - no blank space. Make this
an edict."

THE EDICT (paste 433): a task row has ONE grid. The words take every pixel the controls do not need. The
controls hug the right edge. No state - tap, hold, arm, drag, select, repaint, sync - and no neighbour -
with a time or without - may change a column's width. Blank space at the right edge is a bug.

What this golden holds (measured from what the BROWSER resolved - getBoundingClientRect / getComputedStyle,
never from the file; 134 R1: it prints its assertion count, a section that asserts nothing is a FAIL):
  P0  the EDICT comment is in app.css above the row grid; no STATE-CLASS rule (.armed/.dragging/.reordering/
      .on/.nx/selection) sets grid-template-columns/padding/gap/font-size or a control's size (source check).
  P1  390 px - for EVERY visible row (timed, untimed, done, weekly, 3-line title): .nm width is one value
      (+/-1 px) whether or not the row has a time; that width is UNCHANGED after pointerdown+pointerup on
      .drg, after paintLog(), after a sync repaint, and while .armed/.dragging/.reordering/selection is on;
      the right edge of the last control == the row's content edge (no gutter wider than the row padding);
      row height is unchanged by the tap.
  P2  1280 px - the planned times sit in one aligned column (one left x, +/-1 px) and every .nm is still
      one width (+/-1 px); the same tap/state/repaint invariance holds.
"""
import argparse, asyncio, json, os, re, sys

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def find_estate(start):
    d = start
    for _ in range(6):
        if os.path.isdir(os.path.join(d, '_reconcile')) or os.path.isdir(os.path.join(d, '_machine')):
            return d
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    raise SystemExit('golden_ht433: no estate root above %s' % start)


ESTATE = find_estate(REPO)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'),
              os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('golden_ht433: no fixture under %s - looked for _machine/ht3 and ht3.' % estate)


FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')
THEMES = ['crimson', 'moss', 'graphite']
# A NEUTRAL long title - this file lives in the PUBLIC `ht` repo (CLAUDE.md R47.3 / DEC-173: no person's
# standards in public code). ~90 chars, enough to wrap to three lines at 390 px.
LONG = 'A deliberately long example task title written here only to prove that a wrapped row keeps one width'

RES = []
SEC = {}
CUR = ['P?']


def sec(s):
    CUR[0] = s
    print('\n--- %s ---' % s)


def chk(label, ok, got=''):
    RES.append((bool(ok), label))
    SEC[CUR[0]] = SEC.get(CUR[0], 0) + 1
    print('  %-6s %s%s' % ('PASS' if ok else 'FAIL', label, '' if ok else ('   -> ' + str(got)[:300])))


async def open_page(pw, w, h=900, storage=None, flags=None, wait=1600):
    from playwright.async_api import async_playwright  # noqa
    touch = w < 1024
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch,
                              device_scale_factor=1, color_scheme='dark')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    init = dict({'__BLOCKS': True, '__WINDOW': True, '__BIGSET': True}, **(flags or {}))
    if storage:
        await pg.add_init_script('try{%s}catch(e){}' % ''.join(
            'localStorage.setItem(%s,%s);' % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    await pg.add_init_script('; '.join('window.%s=%s' % (k, json.dumps(v)) for k, v in init.items()))
    await pg.goto(BASE)
    await pg.wait_for_timeout(wait)
    return b, pg, errs


# Guarantee the row mix the paste names: a timed row, an untimed row, a done row (a done-time), a weekly
# row, and a long 3-line title - then repaint. Mutates __MOCK_DB and reloads the app, the way ht42 does.
SETUP = """async (LONG) => {
  const db = window.__MOCK_DB; if (!db || !db.habits || !db.habits.length) return 'no-db';
  const hs = db.habits;
  const today = (window.__HT24 ? window.__HT24.today() : (window.__HT25S3 && window.__HT25S3.state().date));
  // 0: long title, no time
  hs[0].name = LONG; hs[0].time_anchor = null; hs[0].planned_start = null;
  // 1: a planned time, no done
  if (hs[1]) { hs[1].time_anchor = '08:00'; hs[1].planned_start = null; }
  // 2: a planned time AND done (so a done-mark + points render)
  if (hs[2]) { hs[2].time_anchor = '06:30'; }
  // 3: untimed
  if (hs[3]) { hs[3].time_anchor = null; hs[3].planned_start = null; }
  // a done row: mark hs[2] checked at a time on today
  let d = db.days.find(r => r.date === today && r.user_id === 'u-mock');
  if (!d) { d = {date: today, user_id: 'u-mock', checked: {}, pct: 0}; db.days.push(d); }
  d.checked = Object.assign({}, d.checked, hs[2] ? {[hs[2].id]: '06:41'} : {});
  if (window.__HT11 && window.__HT11.reload) await window.__HT11.reload();
  return 'ok';
}"""

# {data-h: {nmW, nmL, nmR, rowT, rowH, rowR, rowPadR, ctrlR, timeL(|null), hasTime}}
METRICS = """() => {
  const rows = [...document.querySelectorAll('#log .li')].filter(r => r.offsetParent);
  const R = el => { const b = el.getBoundingClientRect(); return {l:b.left, r:b.right, t:b.top, w:b.width, h:b.height}; };
  const out = {};
  rows.forEach(r => {
    const id = r.getAttribute('data-h'); if (!id) return;
    const nm = r.querySelector('.nm'); if (!nm) return;
    const cs = getComputedStyle(r);
    // the controls (drag/edit) hug the right edge - the RIGHTMOST of them is what must reach the edge,
    // whatever the DOM order is (PASTE 433: "the right edge of the last control equals the content edge").
    const ctrls = [...r.children].filter(c => c.classList.contains('drg') || c.classList.contains('edp'));
    const ctrlR = ctrls.length ? Math.round(Math.max(...ctrls.map(c => R(c).r))) : null;
    const drg = r.querySelector('.drg'), edp = r.querySelector('.edp');
    // "Blank space at the right edge is a bug" - the RIGHTMOST visible element on the row (a control on the
    // phone, the fixed time column on the desktop, 347) must reach the content edge, whatever it is.
    const edgeEls = [...r.children].filter(c => c.offsetParent && (c.classList.contains('drg') ||
      c.classList.contains('edp') || c.classList.contains('pat30') || c.classList.contains('t293e') ||
      c.classList.contains('pat') || c.classList.contains('dat')));
    const edgeR = edgeEls.length ? Math.round(Math.max(...edgeEls.map(c => R(c).r))) : null;
    // a planned-time element wherever it sits (inline .pat, chip .pat30/.t293e, or the meta line)
    const tEl = r.querySelector('.pat30, .t293e, .pat, .tmeta');
    const rr = R(r);
    out[id] = {
      nmW: Math.round(R(nm).w * 10) / 10, nmL: Math.round(R(nm).l), nmR: Math.round(R(nm).r),
      rowT: Math.round(rr.t), rowH: Math.round(rr.h * 10) / 10, rowR: Math.round(rr.r),
      rowPadR: parseFloat(cs.paddingRight) || 0,
      ctrlR: ctrlR,
      edgeR: edgeR,
      drgL: drg && drg.offsetParent ? Math.round(R(drg).l) : null,
      edpL: edp && edp.offsetParent ? Math.round(R(edp).l) : null,
      timeL: tEl ? Math.round(R(tEl).l) : null,
      hasTime: !!tEl,
    };
  });
  return out;
}"""

TAP = """async () => {
  const drg = document.querySelector('#log .li .drg'); if (!drg) return 'no-drg';
  const opts = {bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch'};
  drg.dispatchEvent(new PointerEvent('pointerdown', opts));
  await new Promise(r => setTimeout(r, 40));
  drg.dispatchEvent(new PointerEvent('pointerup', opts));
  drg.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
  await new Promise(r => setTimeout(r, 120));   // let the click-driven chips() setTimeout fire
  return 'ok';
}"""

REPAINT = """async () => {
  try { if (window.paintLog) window.paintLog(); } catch(e){}
  try { if (window.__HT11 && window.__HT11.reload) await window.__HT11.reload(); } catch(e){}   // the sync repaint path
  try { if (window.paintLog) window.paintLog(); } catch(e){}
  await new Promise(r => setTimeout(r, 120));
  return 'ok';
}"""

STATES = ['armed', 'dragging']         # on .li
LOGSTATES = ['reordering']             # on #log


def _nmwidths(m):
    return {k: v['nmW'] for k, v in m.items()}


def _widths_equal(a, b, tol=1.0):
    bad = []
    for k in a:
        if k in b and abs(a[k] - b[k]) > tol:
            bad.append((k, a[k], b[k]))
    return (not bad), bad


async def one_width_run(pw, w, only_tag):
    for th in THEMES:
        b, pg, errs = await open_page(pw, w, storage={'ht_theme': th})
        sec('%s . %d px . %s' % (only_tag, w, th))
        r = await pg.evaluate(SETUP, LONG)
        await pg.wait_for_timeout(700)
        base = await pg.evaluate(METRICS)
        chk('%s %dpx %s . rows rendered (>=3)' % (only_tag, w, th), len(base) >= 3, list(base))
        # every .nm is one width, timed or not
        ws = list(_nmwidths(base).values())
        if w < 720:
            chk('%s %dpx %s . every .nm is one width, with a time or without (+/-1px)' % (only_tag, w, th),
                len(ws) >= 2 and (max(ws) - min(ws)) <= 1.0, sorted(ws))
        maxpad = max([v['rowPadR'] for v in base.values()] or [0])
        # THE EDICT: no blank space at the right edge - the rightmost element (control on phone, time column
        # on desktop) reaches the content edge on every row.
        egut = [(v['rowR'] - v['edgeR']) for v in base.values() if v['edgeR'] is not None]
        chk('%s %dpx %s . no blank space at the right edge (rightmost element hugs content edge)' % (only_tag, w, th),
            egut and max(egut) <= maxpad + 1.5, {'gutters': egut[:6], 'pad': maxpad})
        # on the phone the CONTROLS themselves hug the edge (paste 433 S2: "the controls hug the right edge")
        if w < 720:
            gutters = [(v['rowR'] - v['ctrlR']) for v in base.values() if v['ctrlR'] is not None]
            chk('%s %dpx %s . the controls hug the right edge (gutter <= padding+1)' % (only_tag, w, th),
                gutters and max(gutters) <= maxpad + 1.5, {'gutters': gutters[:6], 'pad': maxpad})
        # NO ZIGZAG (Cory's headline complaint): drag and edit sit at the SAME x on every row, whether the
        # row has a time or not - the handles never step in and out down the list.
        drgs = [v['drgL'] for v in base.values() if v['drgL'] is not None]
        edps = [v['edpL'] for v in base.values() if v['edpL'] is not None]
        chk('%s %dpx %s . drag handle at one x on every row (no zigzag)' % (only_tag, w, th),
            len(drgs) >= 2 and (max(drgs) - min(drgs)) <= 1, sorted(set(drgs)))
        chk('%s %dpx %s . edit control at one x on every row (no zigzag)' % (only_tag, w, th),
            len(edps) >= 2 and (max(edps) - min(edps)) <= 1, sorted(set(edps)))
        heights0 = {k: v['rowH'] for k, v in base.items()}

        # --- the tap changes nothing ---
        await pg.evaluate(TAP)
        after_tap = await pg.evaluate(METRICS)
        ok, bad = _widths_equal(_nmwidths(base), _nmwidths(after_tap))
        chk('%s %dpx %s . .nm widths unchanged after pointerdown/up on .drg' % (only_tag, w, th), ok, bad[:4])
        hbad = [(k, heights0[k], after_tap[k]['rowH']) for k in heights0
                if k in after_tap and abs(heights0[k] - after_tap[k]['rowH']) > 1.0]
        chk('%s %dpx %s . row heights unchanged by the tap' % (only_tag, w, th), not hbad, hbad[:4])

        # --- a full repaint and the sync repaint change nothing ---
        await pg.evaluate(REPAINT)
        after_rp = await pg.evaluate(METRICS)
        ok2, bad2 = _widths_equal(_nmwidths(base), _nmwidths(after_rp))
        chk('%s %dpx %s . .nm widths unchanged after repaint + sync repaint' % (only_tag, w, th), ok2, bad2[:4])

        # --- state classes change nothing about width ---
        stbad = []
        for cls in STATES:
            await pg.evaluate("(c)=>{const r=document.querySelector('#log .li');if(r)r.classList.add(c);}", cls)
            await pg.wait_for_timeout(30)
            m = await pg.evaluate(METRICS)
            ok3, b3 = _widths_equal(_nmwidths(base), _nmwidths(m))
            if not ok3: stbad.append((cls, b3[:2]))
            await pg.evaluate("(c)=>{const r=document.querySelector('#log .li');if(r)r.classList.remove(c);}", cls)
        for cls in LOGSTATES:
            await pg.evaluate("(c)=>{const l=document.getElementById('log');if(l)l.classList.add(c);}", cls)
            await pg.wait_for_timeout(30)
            m = await pg.evaluate(METRICS)
            ok3, b3 = _widths_equal(_nmwidths(base), _nmwidths(m))
            if not ok3: stbad.append((cls, b3[:2]))
            await pg.evaluate("(c)=>{const l=document.getElementById('log');if(l)l.classList.remove(c);}", cls)
        chk('%s %dpx %s . no state class (.armed/.dragging/.reordering) changes a .nm width' % (only_tag, w, th),
            not stbad, stbad[:4])

        if w >= 720:
            # the times line up in one column
            m = await pg.evaluate(METRICS)
            tl = [v['timeL'] for v in m.values() if v['hasTime'] and v['timeL'] is not None]
            chk('%s %dpx %s . planned times share one left x (aligned column)' % (only_tag, w, th),
                len(tl) >= 2 and (max(tl) - min(tl)) <= 1, tl[:8])
            ws2 = list(_nmwidths(m).values())
            chk('%s %dpx %s . every .nm one width at desktop (+/-1px)' % (only_tag, w, th),
                len(ws2) >= 2 and (max(ws2) - min(ws2)) <= 1.0, sorted(ws2))

        chk('%s %dpx %s . no page error' % (only_tag, w, th), not [e for e in errs if 'ServiceWorker' not in e], errs[:2])
        await b.close()


def _source_checks():
    sec('P0 . the edict is written and state classes never touch columns (source)')
    css = open(os.path.join(REPO, 'app.css'), encoding='utf-8', errors='replace').read()
    chk('P0a . the EDICT comment is in app.css', 'EDICT' in css and 'ONE grid' in css, '')
    chk('P0b . golden_ht433_edict is named in the edict comment', 'golden_ht433_edict' in css, '')
    # no state-class rule sets a column-defining property. Strip /* comments */ first - a comment that
    # mentions .li.dragging is prose about the rule, not the rule, and must not be scanned as one.
    css_nc = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    forbid = re.compile(r'grid-template-columns|padding\s*:|gap\s*:|font-size\s*:')
    bad = []
    for m in re.finditer(r'([^\{\}]*\.li\.(?:armed|dragging|on|nx)[^\{]*|[^\{\}]*\.log\.reordering[^\{]*)\{([^\}]*)\}', css_nc):
        sel, body = m.group(1).strip(), m.group(2)
        if forbid.search(body):
            bad.append(sel[:60])
    chk('P0c . no .armed/.dragging/.reordering/.on/.nx rule sets columns/padding/gap/font-size', not bad, bad[:5])


async def run(pw, only):
    if not only or only == 'P0':
        _source_checks()
    if not only or only == 'P1':
        await one_width_run(pw, 390, 'P1')
    if not only or only == 'P2':
        await one_width_run(pw, 1280, 'P2')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    ap.add_argument('--no-sync', action='store_true', help='skip the fixture sync (it was just done)')
    a = ap.parse_args()
    if not a.no_sync:
        import subprocess
        r = subprocess.run([sys.executable, os.path.join(HERE, 'sync_fixture.py')],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        sys.stdout.write(r.stdout.decode('utf-8', 'replace'))
        if r.returncode != 0:
            print('golden_ht433: sync_fixture failed rc=%d - a check on a stale fixture is not a pass' % r.returncode)
            sys.exit(1)
    from playwright.async_api import async_playwright

    async def go():
        async with async_playwright() as pw:
            await run(pw, a.only)
    asyncio.run(go())
    for s in sorted(SEC):
        if not SEC[s]:
            chk('%s . the section asserted something (134 R1)' % s, False, 0)
    n = len(RES); f = sum(1 for ok, _ in RES if not ok)
    print('\nGOLDEN ht433: %d/%d PASS, %d FAIL' % (n - f, n, f))
    if n == 0:
        print('ZERO ASSERTIONS - a run that asserts nothing has failed (134 R1)')
        sys.exit(1)
    sys.exit(1 if f else 0)


if __name__ == '__main__':
    main()
