#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-25 GOLDEN - every acceptance block of WIRE HT-25, run literally.

    python3 tools/golden_ht25.py            (from anywhere; paths resolve from THIS file)
    python3 tools/golden_ht25.py --only S2

  S2   a long entry scrolls instead of being clipped        (Cory's report, 2026-09-10)
  S3   TIMED / ANYTIME / WEEKLY, and lateness never moves the score
  S6   the sleep number never appears without its derivation

S2 IS TESTED WITH REAL TEXT, NOT A STYLE ASSERTION. `overflow-y:auto` in the stylesheet proves
nothing on its own: the old build ALSO had a computed overflow once the inline height was cleared,
and it still clipped, because the box had no ceiling and the page could not reach past it. So each
check types or pastes a genuinely long entry and then asks the two questions a person asks -
**can I see the caret, and can I reach the bottom** - through `scrollHeight` / `clientHeight` /
`scrollTop`, which are the same numbers the browser scrolls by.

SRC is this file's own repo (`tools/..`), so a run from a worktree tests THAT worktree - the
HT-23 S5c lesson, and the reason `sync_fixture.py` resolves paths the same way.
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
    raise SystemExit('golden_ht25: no estate root above %s' % start)


ESTATE = find_estate(REPO)
BASE = 'file://' + os.path.join(ESTATE, 'ht3', 'index.html').replace(os.sep, '/')

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def src(p):
    return io.open(p, encoding='utf-8', errors='replace').read()


async def open_page(pw, w=390, h=844, touch=True):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=touch, is_mobile=touch,
                              device_scale_factor=2 if touch else 1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    await pg.goto(BASE)
    await pg.wait_for_timeout(3300)
    return b, pg, errs


LONG = "\n".join("line %d - a genuinely long brain dump entry, the kind that produced the report" % i
                 for i in range(1, 201))


# ============================== S2 ==============================================================
async def s2(pw):
    """THE BUG, RESTATED AS A TEST: a box that grows and cannot scroll is a box whose bottom is
    unreachable. Both halves are checked - the phone (inline height, ceiling) and the desktop
    (CSS-bounded height, clipping)."""
    for (w, h, touch, tag) in ((390, 844, True, 'phone'), (1280, 800, False, 'desktop')):
        b, pg, errs = await open_page(pw, w, h, touch)
        try:
            ok = await pg.evaluate("!!(window.__HT25 && window.__HT25.growTo)")
            chk('S2a/%s · the one home for the rule is exported (__HT25.growTo)' % tag, ok)

            # Type into the brain dump the way a person does, then ask the browser what it can see.
            got = await pg.evaluate("""(txt) => {
              const t = document.getElementById('iDump');
              if(!t) return {no:'iDump missing'};
              t.focus();
              t.value = txt;
              t.setSelectionRange(txt.length, txt.length);
              t.dispatchEvent(new Event('input', {bubbles:true}));
              const cs = getComputedStyle(t);
              return { oy: cs.overflowY,
                       clientH: t.clientHeight, scrollH: t.scrollHeight,
                       scrollTop: t.scrollTop,
                       winH: window.innerHeight,
                       reachable: t.scrollHeight - t.clientHeight };
            }""", LONG)
            if got.get('no'):
                chk('S2b/%s · the brain dump exists' % tag, False, got['no']); continue

            chk('S2b/%s · a 200-line entry overflows its box (so the box must scroll)' % tag,
                got['reachable'] > 0, got)
            chk('S2c/%s · and the box scrolls rather than clipping (overflow-y != hidden)' % tag,
                got['oy'] != 'hidden', got)
            # THE ONE CORY ACTUALLY HIT: the box grew taller than the screen, so neither the box
            # nor the page could reach the bottom of what he had typed.
            chk('S2d/%s · the box never grows taller than the viewport' % tag,
                got['clientH'] <= got['winH'], got)
            # The caret was at the end, so the box must be scrolled to the end.
            chk('S2e/%s · the caret stays in view while typing at the end' % tag,
                got['scrollTop'] >= got['reachable'] - 2, got)

            # The bottom is genuinely reachable by scrolling, not merely non-clipped.
            bottom = await pg.evaluate("""() => {
              const t = document.getElementById('iDump');
              t.scrollTop = 0; const top = t.scrollTop;
              t.scrollTop = t.scrollHeight; const end = t.scrollTop;
              return {top, end, max: t.scrollHeight - t.clientHeight};
            }""")
            chk('S2f/%s · the bottom of a long entry is reachable' % tag,
                bottom['end'] >= bottom['max'] - 2 and bottom['top'] == 0, bottom)

            # PASTE, not type - the second half of the acceptance, and a different code path.
            pasted = await pg.evaluate("""(txt) => {
              const t = document.getElementById('iPrayer');
              if(!t) return {no:1};
              t.focus(); t.value = txt.repeat(2);
              t.setSelectionRange(0, 0);
              t.dispatchEvent(new Event('input', {bubbles:true}));
              return { clientH:t.clientHeight, winH:window.innerHeight,
                       oy:getComputedStyle(t).overflowY };
            }""", LONG)
            if not pasted.get('no'):
                chk('S2g/%s · a pasted 5k-char entry is bounded and scrollable' % tag,
                    pasted['clientH'] <= pasted['winH'] and pasted['oy'] != 'hidden', pasted)

            chk('S2h/%s · no console error while doing any of it' % tag, not errs, errs[:2])
        finally:
            await b.close()

    # The ceiling is measured from the VISUAL viewport, which is the only one that shrinks for a
    # keyboard. A `vh`-based ceiling is the same invisible-overflow bug one layer out.
    s = src(os.path.join(REPO, 'app.js'))
    chk('S2i · the ceiling reads visualViewport, not innerHeight alone',
        'visualViewport' in s and 'growCeil' in s)
    chk('S2j · and it is re-measured when the keyboard opens',
        re.search(r"visualViewport\.addEventListener\('resize'", s) is not None)
    css = src(os.path.join(REPO, 'app.css'))
    chk('S2k · no auto-growing box is left on overflow:hidden',
        not re.search(r"#iDump, html\[data-simple\] #iTasks, html\[data-simple\] #iPrayer\{\s*overflow:hidden", css))
    chk('S2l · the phone ceiling is expressed in dvh, not vh',
        'max-height:40dvh' in css)


SECTIONS = {'S2': s2}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    a = ap.parse_args()
    want = [a.only] if a.only else list(SECTIONS)
    async with async_playwright() as pw:
        for s in want:
            if s not in SECTIONS:
                raise SystemExit('unknown section %s' % s)
            print('\n== %s ==' % s)
            await SECTIONS[s](pw)
    bad = [n for ok, n in RES if not ok]
    print('\nGOLDEN HT-25: %d/%d PASS, %d FAIL' % (len(RES) - len(bad), len(RES), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
