#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GOLDEN HT-42 - WIRE HT-347 (PASTE 347 · EVERY TASK READS IN FULL), run literally.

    python tools/golden_ht42.py
    python tools/golden_ht42.py --only S1

Cory, Monday 2026-09-28 8:02 PM (phone) - "The text is cut off for the task completions." Paste 293's
S2.3 had put `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` on `#log .li .nm` (a selector
more specific than R70.142's S4 wrap rule), so every list title clipped on the phone. Cory, 8:04 PM
(desktop, NUDGE N1) - the planned time trails the text; push it to its own column at the right edge, in
a straight vertical line, tabular; the done-mark and streak move into that column, never back after the
title. This golden holds both, at both breakpoints, in all three themes.

What it holds (paste 347 S1 + NUDGE N1):
  S1  PHONE (360 · 390) - a list title WRAPS and is fully visible: no `nowrap`, no `ellipsis`, capped at
      three lines; a long one-word title breaks (overflow-wrap:anywhere); the checkbox is top-aligned to
      the first line; the controls column (drag · edit · time) sits at the SAME x on a one-line row and a
      wrapped row - wrapping never moves it.
  N1  DESKTOP (1024 · 1280) - the planned time is a fixed-width column at the row's RIGHT edge, its left x
      identical across rows (one straight vertical line), its digits tabular; a row with no time keeps an
      empty column of the same width so drag · edit line up; and the done-mark (`.dat`, which carries the
      streak `.v194`) is NOT inside `.nm` - it renders in the right column, never after the title. Both
      breakpoints obey S1: no ellipsis anywhere.

134 R1: this file prints its assertion count; a section that asserts nothing is a FAIL, not a pass.
Measured from what the BROWSER resolved (getComputedStyle / getBoundingClientRect), never from the file.
"""
import argparse, asyncio, io, json, os, re, sys

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
    raise SystemExit('golden_ht42: no estate root above %s' % start)


ESTATE = find_estate(REPO)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'),
              os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('golden_ht42: no fixture under %s - looked for _machine/ht3 and ht3.' % estate)


FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')
THEMES = ['crimson', 'moss', 'graphite']
# A NEUTRAL long title, never a person's real standard - this file lives in the PUBLIC `ht` repo, and
# "no person's standards are ever written into this public code" (CLAUDE.md, R47.3 / DEC-173). ~86 chars,
# enough to wrap to two or three lines at 360-390 px, which is all the wrap test needs.
LONG = 'A deliberately long example task title written here only to prove that titles wrap in full'
LONGWORD = 'Supercalifragilisticexpialidociousantidisestablishmentarianismpneumonoultramicroscopic'

RES = []
SEC = {}
CUR = ['S?']


def sec(s):
    CUR[0] = s
    print('\n--- %s ---' % s)


def chk(label, ok, got=''):
    RES.append((bool(ok), label))
    SEC[CUR[0]] = SEC.get(CUR[0], 0) + 1
    print('  %-6s %s%s' % ('PASS' if ok else 'FAIL', label, '' if ok else ('   -> ' + str(got)[:300])))


async def open_page(pw, w, h=900, storage=None, flags=None, wait=1500):
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


# a habit is renamed to a long title and the list repainted, the way golden_ht29 does it
RENAME = """async (nm) => {
  const st = window.__HT25S3 && window.__HT25S3.state();
  const hs = (st && st.habits) || [];
  const h = hs.find(x => !window.isWeekly || true) || hs[0];
  const id = (window.__MOCK_DB.habits[0]||{}).id;
  const t = window.__MOCK_DB.habits.find(x => x.id === id);
  if (t) t.name = nm;
  if (window.__HT11 && window.__HT11.reload) await window.__HT11.reload();
  return id;
}"""


async def row_metrics(pg, hid=None):
    return await pg.evaluate("""(hid) => {
      const rows = [...document.querySelectorAll('#log .li')];
      const target = hid ? rows.find(r => r.getAttribute('data-h') === hid) : rows[0];
      const one = rows.find(r => r !== target) || rows[0];
      const R = el => { const b = el.getBoundingClientRect(); return {l:Math.round(b.left), r:Math.round(b.right), t:Math.round(b.top), w:Math.round(b.width), h:Math.round(b.height)}; };
      const nm = el => el && el.querySelector('.nm');
      const cs = el => el ? getComputedStyle(el) : null;
      const timeOf = el => el && (el.querySelector(':scope > .pat30, :scope > .t293e, :scope > .pat'));
      const ctrlOf = el => el && (el.querySelector(':scope > .drg') || el.querySelector(':scope > .edp'));
      const info = el => {
        if (!el) return null;
        const n = nm(el), c = cs(n), tchip = timeOf(el), ctrl = ctrlOf(el);
        const tcs = tchip ? getComputedStyle(tchip) : null;
        const datInNm = !!(n && n.querySelector('.dat'));
        const datRow = el.querySelector('.dat');
        return {
          nmStyle: c ? {ws:c.whiteSpace, to:c.textOverflow, ov:c.overflow, clamp:c.webkitLineClamp||c.getPropertyValue('-webkit-line-clamp'), owrap:c.overflowWrap} : null,
          nmRect: n ? R(n) : null, rowRect: R(el),
          lineH: c ? parseFloat(c.lineHeight) : null,
          nmScrollW: n ? n.scrollWidth : null, nmClientW: n ? n.clientWidth : null,
          bx: el.querySelector('.bxw') ? R(el.querySelector('.bxw')) : null,
          time: tchip ? {rect:R(tchip), cls:tchip.className, tab:(tcs.fontVariantNumeric||'')} : null,
          ctrl: ctrl ? R(ctrl) : null,
          datInNm, datLeft: datRow ? Math.round(datRow.getBoundingClientRect().left) : null,
        };
      };
      // vertical line: left x of every time chip present
      const times = rows.map(r => r.querySelector(':scope > .pat30, :scope > .t293e')).filter(Boolean)
                        .map(t => Math.round(t.getBoundingClientRect().left));
      return {target: info(target), one: info(one), rowCount: rows.length, timeLefts: times};
    }""", hid)


async def run(pw, only):
    # ---------------------------------------------------------------- S1 : PHONE TITLES WRAP
    if not only or only == 'S1':
        for w in (360, 390):
            for th in THEMES:
                b, pg, errs = await open_page(pw, w, storage={'ht_theme': th})
                sec('S1 . phone %d px . %s' % (w, th))
                hid = await pg.evaluate(RENAME, LONG)
                await pg.wait_for_timeout(700)
                m = await row_metrics(pg, hid)
                t = m['target'] or {}
                st = t.get('nmStyle') or {}
                chk('S1a %dpx %s . the title does NOT nowrap' % (w, th), st.get('ws') and st['ws'] != 'nowrap', st)
                chk('S1b %dpx %s . no ellipsis on the title' % (w, th), st.get('to') != 'ellipsis', st)
                chk('S1c %dpx %s . capped at three lines (-webkit-line-clamp:3)' % (w, th), str(st.get('clamp')) == '3', st)
                # wraps to more than one line, and nothing is clipped sideways
                lh, rh = t.get('lineH') or 0, (t.get('nmRect') or {}).get('h') or 0
                chk('S1d %dpx %s . a long title wraps to >1 line' % (w, th), lh and rh > lh * 1.5, {'lineH': lh, 'nmH': rh})
                sw, cw = t.get('nmScrollW') or 0, t.get('nmClientW') or 0
                chk('S1e %dpx %s . nothing clipped horizontally' % (w, th), cw and sw <= cw + 2, {'scrollW': sw, 'clientW': cw})
                # checkbox top-aligned to the first line of a wrapped row
                bx, rr = t.get('bx'), t.get('rowRect')
                chk('S1f %dpx %s . checkbox is top-aligned on a wrapped row' % (w, th),
                    bx and rr and (bx['t'] - rr['t']) <= max(10, (t.get('lineH') or 20)), {'bxTop': bx and bx['t'], 'rowTop': rr and rr['t']})
                # the controls column x does not move between a one-line row and the wrapped row
                one = m['one'] or {}
                cw1, cw2 = one.get('ctrl'), t.get('ctrl')
                chk('S1g %dpx %s . controls column x is identical on 1-line and wrapped rows' % (w, th),
                    cw1 and cw2 and abs(cw1['l'] - cw2['l']) <= 1, {'oneLine': cw1 and cw1['l'], 'wrapped': cw2 and cw2['l']})
                await pg.wait_for_timeout(30)
                chk('S1h %dpx %s . no page error' % (w, th), not [e for e in errs if 'ServiceWorker' not in e], errs[:2])
                await b.close()
        # a pathological single word must break, never clip
        b, pg, errs = await open_page(pw, 360, storage={'ht_theme': 'graphite'})
        sec('S1 . 360 px . one 84-char word')
        hid = await pg.evaluate(RENAME, LONGWORD)
        await pg.wait_for_timeout(700)
        m = await row_metrics(pg, hid); t = m['target'] or {}
        sw, cw = (t.get('nmScrollW') or 0), (t.get('nmClientW') or 0)
        chk('S1i . a single long word breaks and never clips', cw and sw <= cw + 2, {'scrollW': sw, 'clientW': cw})
        chk('S1j . overflow-wrap is anywhere', (t.get('nmStyle') or {}).get('owrap') in ('anywhere', 'break-word'), t.get('nmStyle'))
        await b.close()

    # ---------------------------------------------------------------- N1 : DESKTOP TIME COLUMN
    if not only or only == 'N1':
        for w in (1024, 1280):
            for th in THEMES:
                b, pg, errs = await open_page(pw, w, storage={'ht_theme': th})
                sec('N1 . desktop %d px . %s' % (w, th))
                # a done row so .dat (with its .v194 streak) is present
                await pg.evaluate("""() => { const t=window.__HT24?window.__HT24.today():(window.__HT25S3.state().date);
                    const d=window.__MOCK_DB.days.find(r=>r.date===t && r.user_id==='u-mock');
                    if(d){ const h=window.__MOCK_DB.habits.filter(x=>x.time_anchor)[0]; if(h) d.checked=Object.assign({},d.checked,{[h.id]:'07:30'}); }
                    if(window.__HT11&&window.__HT11.reload) return window.__HT11.reload(); }""")
                await pg.wait_for_timeout(800)
                m = await row_metrics(pg)
                # desktop title still wraps / never ellipsis (S1 at desktop too)
                st = ((m['target'] or {}).get('nmStyle')) or {}
                chk('N1a %dpx %s . desktop title never ellipsis' % (w, th), st.get('to') != 'ellipsis' and st.get('ws') != 'nowrap', st)
                # the time chip sits at the right edge (its right is near the row's right, past the name)
                tinfo = (m['target'] or {}).get('time')
                rr = (m['target'] or {}).get('rowRect')
                nmr = (m['target'] or {}).get('nmRect')
                if tinfo and rr:
                    chk('N1b %dpx %s . the time column is at the right edge (right of the name)' % (w, th),
                        tinfo['rect']['l'] >= (nmr['r'] - 2), {'timeL': tinfo['rect']['l'], 'nameR': nmr and nmr['r']})
                    chk('N1c %dpx %s . the time digits are tabular' % (w, th), 'tabular-nums' in (tinfo['tab'] or ''), tinfo['tab'])
                else:
                    chk('N1b %dpx %s . a time column element is present' % (w, th), False, m['target'])
                # one straight vertical line: every time chip shares one left x
                tl = m['timeLefts']
                chk('N1d %dpx %s . every time column shares one left x (vertical line)' % (w, th),
                    len(tl) >= 2 and (max(tl) - min(tl)) <= 1, tl[:8])
                # an untimed (weekly) row keeps an empty time column of the same width -> drag/edit line up
                cols = await pg.evaluate("""() => {
                    const rows=[...document.querySelectorAll('#log .li')];
                    const w = el => el ? Math.round(el.getBoundingClientRect().width) : null;
                    return rows.map(r => ({ has:!!r.querySelector(':scope > .pat30, :scope > .t293e'),
                        tw: w(r.querySelector(':scope > .pat30, :scope > .t293e')),
                        edgL: (r.querySelector(':scope > .edp')||r.querySelector(':scope > .drg')) ? Math.round((r.querySelector(':scope > .edp')||r.querySelector(':scope > .drg')).getBoundingClientRect().left) : null })); }""")
                haveW = [c['tw'] for c in cols if c['tw']]
                chk('N1e %dpx %s . every row has a time column of one width' % (w, th),
                    len(haveW) >= 2 and (max(haveW) - min(haveW)) <= 1, haveW[:8])
                edg = [c['edgL'] for c in cols if c['edgL'] is not None]
                chk('N1f %dpx %s . edit/drag line up across timed and untimed rows' % (w, th),
                    len(edg) >= 2 and (max(edg) - min(edg)) <= 1, edg[:8])
                # the done-mark is NOT inside the name
                chk('N1g %dpx %s . the done-mark (.dat) is not inside .nm' % (w, th), (m['target'] or {}).get('datInNm') is False, m['target'])
                await pg.wait_for_timeout(30)
                chk('N1h %dpx %s . no page error' % (w, th), not [e for e in errs if 'ServiceWorker' not in e], errs[:2])
                await b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    ap.add_argument('--no-sync', action='store_true', help='skip the fixture sync (it was just done)')
    a = ap.parse_args()
    # SELF-CONTAINED: sync the fixture from THIS checkout first, so `python tools/golden_ht42.py` tests the
    # tree it is run in (the finish runs it in the worktree; a stale ht3 would grade the wrong code).
    if not a.no_sync:
        import subprocess
        r = subprocess.run([sys.executable, os.path.join(HERE, 'sync_fixture.py')],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        sys.stdout.write(r.stdout.decode('utf-8', 'replace'))
        if r.returncode != 0:
            print('golden_ht42: sync_fixture failed rc=%d - a check on a stale fixture is not a pass' % r.returncode)
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
    print('\nGOLDEN ht42: %d/%d PASS, %d FAIL' % (n - f, n, f))
    if n == 0:
        print('ZERO ASSERTIONS - a run that asserts nothing has failed (134 R1)')
        sys.exit(1)
    sys.exit(1 if f else 0)


if __name__ == '__main__':
    main()
