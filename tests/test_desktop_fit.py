"""PASTE 862 GOLDEN — THE DESKTOP INSIGHTS COLUMN FITS WITHOUT A SCROLLBAR.

#h19Right (the middle column: ring card · journal · month+year charts) must fit its grid cell
at viewport heights 768, 800 and 1080 with width 1280, so no inner vertical scrollbar appears.
Reached by trimming sizes only; nothing is hidden or removed.

  F1  #h19Right.scrollHeight <= #h19Right.clientHeight (no inner scroll) at each height
  F2  the month chart (#h16Month svg.chart) is >= 220px tall (D4 floor from golden_ht822)
  F3  the year chart (#h16Year svg.chart) is >= 220px tall
  F4  zero page errors

R134 R1: prints its assertion count; a section that asserts nothing is a FAIL.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _fixture_base():
    estate = _REPO
    for _ in range(6):
        if os.path.isdir(os.path.join(estate, '_reconcile')):
            break
        p = os.path.dirname(estate)
        if p == estate:
            break
        estate = p
    candidates = [os.environ.get('HT_FIXTURE_DIR')]
    # Walk up to find BEV root (one level above _machine), then check beside _machine
    d = estate
    for _ in range(6):
        candidates.append(os.path.join(d, 'ht3'))
        p = os.path.dirname(d)
        if p == d:
            break
        d = p
    for c in candidates:
        if c and os.path.isdir(c) and os.path.isfile(os.path.join(c, 'mock.js')):
            return 'file://' + c.replace(os.sep, '/') + '/index.html'
    return 'file://' + os.path.join(estate, 'ht3', 'index.html').replace(os.sep, '/')


BASE = _fixture_base()

RES = []


def chk(name, ok, got=''):
    RES.append((bool(ok), name))
    print('  %-6s %s%s' % ('PASS' if ok else 'FAIL', name,
                           '' if ok else ('   -> ' + str(got)[:220])))


FIT_JS = """()=>{
  var r = document.getElementById('h19Right');
  if (!r) return null;
  return { sh: r.scrollHeight, ch: r.clientHeight, fits: r.scrollHeight <= r.clientHeight + 1 };
}"""

CHART_JS = """(id)=>{
  var e = document.getElementById(id);
  if (!(e && e.tagName)) return null;
  var s = e.tagName.toLowerCase() === 'svg' ? e : e.querySelector('svg.chart');
  if (!s) return null;
  return Math.round(s.getBoundingClientRect().height);
}"""


async def run_height(pw, w, h, label):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(
        '; '.join('window.%s=true' % k for k in ('__BIGSET', '__BLOCKS', '__INPUTS3')))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)

    fit = await pg.evaluate(FIT_JS)
    chk('%s · F1 #h19Right fits (scrollH %s <= clientH %s)' % (
        label, fit and fit['sh'], fit and fit['ch']),
        fit and fit['fits'], fit)

    mh = await pg.evaluate(CHART_JS, 'h16Month')
    yh = await pg.evaluate(CHART_JS, 'h16Year')
    chk('%s · F2 month chart >= 220px (got %s)' % (label, mh), mh is not None and mh >= 220, mh)
    chk('%s · F3 year chart >= 220px (got %s)' % (label, yh), yh is not None and yh >= 220, yh)
    chk('%s · F4 zero page errors' % label, not errs, errs[:2])

    await b.close()


async def _async_main():
    async with async_playwright() as pw:
        for h in (768, 800, 1080):
            await run_height(pw, 1280, h, '1280x%d' % h)
    npass = sum(1 for ok, _ in RES if ok)
    print('\nDESKTOP-FIT: %d/%d PASS, %d FAIL' % (npass, len(RES), len(RES) - npass))
    return npass == len(RES) and bool(RES)


def test_desktop_fit():
    """#h19Right fits without scrolling at 768, 800 and 1080 px viewport heights."""
    ok = asyncio.run(_async_main())
    assert ok, 'desktop_fit: one or more checks failed — see output above'
