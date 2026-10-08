#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-684 GOLDEN — THE LIFE CHART'S 100 MATCHES ITS TICKS, AND ITS AXES ARE NAMED (paste 684).

Run literally at 1280 (desktop, paintLife18 -> svg.wkg.h18life: foot `.h293foot`, ticks `.wl`) and at
390 (phone, HT185LIFE -> svg.h185life: foot `.h194foot`, ticks `.h185y`/`.h185x`). Colours are read as
COMPUTED styles (getComputedStyle().fill), so a `var(--inkN)`/`--muted` token is resolved to an rgb()
the maths can compare — this golden never reads a raw attribute string.

  S1  the foot age label `100` is present and its COMPUTED fill EQUALS a sibling numeric tick's — the
      `100` reads in the same muted ink as every other axis number (Cory 2026-10-07 #1).
  S2  each axis carries its descriptor: `week of the year` along the top axis and `age` along the left,
      both present with exactly that text (Cory 2026-10-07 #2).
  S3  each descriptor's COMPUTED fill EQUALS that same sibling tick's — named in the tick ink, no new
      colour.
  S4  (STRESS) the match is colour-IDENTITY, not two absences: the sibling tick's fill is a non-empty
      resolved rgb, and the foot's and each descriptor's rgb triples equal it exactly.
  S5  (STRESS) naming did not push a label onto the grid: each descriptor's y is strictly above the
      first cell's y (above the squares), and above the week-number row (one quiet line, no overlap).
  S6  zero page errors at either width.

R134 R1: prints its assertion count; a section that asserts nothing is a FAIL.
"""
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
_os.chdir(_ESTATE)
import asyncio, re, sys
from playwright.async_api import async_playwright
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass


def fixture_dir(estate):
    for d in (_os.environ.get('HT_FIXTURE_DIR'), _os.path.join(estate, '_machine', 'ht3'),
              _os.path.join(estate, 'ht3')):
        if d and _os.path.isdir(d):
            return d
    return _os.path.join(estate, '_machine', 'ht3')

BASE = 'file://' + _os.path.join(fixture_dir(_ESTATE), 'index.html').replace(_os.sep, '/')

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:220])))


# ------------------------------------------------------------------ colour parse (resolved -> rgb)
def _parse(s):
    """Any computed colour -> (r,g,b) 0-255, or None. Handles rgb()/rgba(), CSS Color-4
    color(srgb ...) and #hex — the shapes a resolved token comes back as."""
    s = (s or '').strip()
    if not s or s in ('none', 'transparent'):
        return None
    m = re.match(r'rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)', s)
    if m:
        return tuple(int(round(float(m.group(i)))) for i in (1, 2, 3))
    m = re.match(r'color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', s)
    if m:
        return tuple(int(round(float(m.group(i)) * 255)) for i in (1, 2, 3))
    m = re.match(r'#([0-9A-Fa-f]{6})$', s)
    if m:
        h = m.group(1)
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    m = re.match(r'#([0-9A-Fa-f]{3})$', s)
    if m:
        h = m.group(1)
        return tuple(int(h[i]*2, 16) for i in range(3))
    return None


async def open_page(pw, w, h):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("; ".join("window.%s=true" % k for k in ('__BIGSET', '__BLOCKS', '__INPUTS3')))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2600)
    await pg.evaluate("() => { try{ if(window.__HT13_TAB) window.__HT13_TAB('views'); }catch(e){} }")
    await pg.wait_for_timeout(1400)
    return b, pg, errs


# Reads, for the life SVG: the foot's computed fill, a sibling numeric tick's computed fill, the two
# descriptors' text + computed fill, and the geometry needed to prove they sit above the squares.
JS_READ = """
(sel) => {
  const svg = document.querySelector(sel.svg);
  if(!svg) return { svg:false };
  const fillOf = el => el ? getComputedStyle(el).fill : null;
  const num = /^\\d+$/;
  const foot = svg.querySelector(sel.foot);
  // a sibling numeric tick that is NOT the foot (an age number like 90)
  const ticks = [...svg.querySelectorAll(sel.tick)].filter(t => num.test((t.textContent||'').trim()) && t !== foot);
  const tick = ticks[0] || null;
  const byText = want => [...svg.querySelectorAll('text')].find(t => (t.textContent||'').trim() === want) || null;
  const wk = byText('week of the year'), age = byText('age');
  const y = el => el ? parseFloat(el.getAttribute('y')) : null;
  // the first cell's y (top of the squares)
  const cells = [...svg.querySelectorAll(sel.cell)].map(r => parseFloat(r.getAttribute('y'))).filter(v => !isNaN(v));
  const cellTop = cells.length ? Math.min(...cells) : null;
  // the week-number row's y
  const wnums = [...svg.querySelectorAll(sel.wtick)].map(t => parseFloat(t.getAttribute('y'))).filter(v => !isNaN(v));
  const wnumY = wnums.length ? Math.min(...wnums) : null;
  return {
    svg:true,
    footText: foot ? (foot.textContent||'').trim() : null,
    footFill: fillOf(foot),
    tickText: tick ? (tick.textContent||'').trim() : null,
    tickFill: fillOf(tick),
    wkText: wk ? (wk.textContent||'').trim() : null,  wkFill: fillOf(wk),  wkY: y(wk),
    ageText: age ? (age.textContent||'').trim() : null, ageFill: fillOf(age), ageY: y(age),
    cellTop: cellTop, wnumY: wnumY
  };
}
"""


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)
    if w >= 1024:
        sel = {'svg': 'svg.h18life', 'foot': '.h293foot', 'tick': 'text.wl',
               'cell': 'rect.lv,rect.lw,rect.lf', 'wtick': 'text.wlx'}
    else:
        sel = {'svg': 'svg.h185life', 'foot': '.h194foot', 'tick': 'text.h185y,text.h185x',
               'cell': 'rect.h185lv,rect.h185wk,rect.h185ahead', 'wtick': 'text.h185x'}
    d = await pg.evaluate(JS_READ, sel)

    if not d.get('svg'):
        chk("%s · the life SVG rendered" % label, False, d)
        await b.close()
        return
    chk("%s · the life SVG rendered" % label, True)

    tick = _parse(d['tickFill'])
    foot = _parse(d['footFill'])
    wk = _parse(d['wkFill'])
    age = _parse(d['ageFill'])

    # S1 — the 100 foot equals a sibling tick's computed fill
    chk("%s · the `100` foot is present (an age tick)" % label, d['footText'] == '100', d.get('footText'))
    chk("%s · the `100` fill equals a sibling tick's fill (%s == %s)" % (label, d['footFill'], d['tickFill']),
        foot is not None and tick is not None and foot == tick, {'foot': d['footFill'], 'tick': d['tickFill']})

    # S2 — both descriptors present with the exact text
    chk("%s · the top axis is named `week of the year`" % label, d['wkText'] == 'week of the year', d.get('wkText'))
    chk("%s · the left axis is named `age`" % label, d['ageText'] == 'age', d.get('ageText'))

    # S3 — each descriptor in the tick ink
    chk("%s · `week of the year` fill equals the tick fill (%s == %s)" % (label, d['wkFill'], d['tickFill']),
        wk is not None and tick is not None and wk == tick, {'wk': d['wkFill'], 'tick': d['tickFill']})
    chk("%s · `age` fill equals the tick fill (%s == %s)" % (label, d['ageFill'], d['tickFill']),
        age is not None and tick is not None and age == tick, {'age': d['ageFill'], 'tick': d['tickFill']})

    # S4 (STRESS) — colour IDENTITY, not two absences
    chk("%s · the sibling tick fill is a real resolved rgb (not empty/none)" % label, tick is not None, d['tickFill'])

    # S5 (STRESS) — descriptors sit above the squares and above the week-number row
    ct, wn = d.get('cellTop'), d.get('wnumY')
    chk("%s · the first cell's top and the week-number row were measured" % label,
        ct is not None and wn is not None, {'cellTop': ct, 'wnumY': wn})
    if ct is not None and wn is not None:
        chk("%s · `week of the year` is above the squares and the week numbers (y=%s < cellTop=%s, < wnumY=%s)"
            % (label, d['wkY'], ct, wn),
            d['wkY'] is not None and d['wkY'] < ct and d['wkY'] < wn, d)
        chk("%s · `age` is above the squares and the week numbers (y=%s < cellTop=%s, < wnumY=%s)"
            % (label, d['ageY'], ct, wn),
            d['ageY'] is not None and d['ageY'] < ct and d['ageY'] < wn, d)

    # S6 — no page errors
    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-684-AXIS: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
