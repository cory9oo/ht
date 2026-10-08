#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-678 GOLDEN — THE LIFE CHART IS CELLS, NOT BARS, AND ITS FOUR STATES READ APART (paste 678).

Run literally at 1280 (desktop, paintLife18 -> rect.lv/.lw/.lf, ring rect.cw) and at 390 (phone,
HT185LIFE -> rect.h185lv/.h185wk/.h185ahead, ring rect.h185today). Colours are read as COMPUTED
styles (getComputedStyle().fill / .stroke), so a `var(--gN)` or `color-mix()` token is resolved to an
rgb() the maths can weigh — this golden never reads a raw attribute string.

  S1  the four states render as FOUR DISTINCT colours: lived (no rating) != a rated grade != future
      != the current-week ring.
  S2  the three states that must READ — lived, a rated grade cell, the now ring — each clear 3:1
      contrast against the chart's own background (WCAG 2.1 non-text contrast, 1.4.11).
  S3  the five grade colours A..F (--g4..--g0) each clear 3:1 against the background and are mutually
      distinct — the re-tuned high-contrast scale, the same five Month/Year/Life read.
  S4  the future state is FAINT: its contrast is BELOW the lived state's. The brief draws "ahead" as a
      fill under eight percent, which by design cannot and must not reach 3:1 — so the four-states-at-
      3:1 rule is read as "every state that must be read", and future's job is to recede. Stated here
      so nothing is silently weakened: future is checked to be faint and distinct, not to clear 3:1.
  S5  CELLS, NOT BARS: a cell's drawn width is strictly less than the column pitch — a real gap, not a
      one-pixel line (the brief: squares only).
  S6  the one-line legend under the grid carries the five grades + lived + ahead + now, and it wraps
      (it never scrolls sideways).
  S7  zero page errors at either width.

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


# ------------------------------------------------------------------ colour maths (sRGB / WCAG)
def _parse(s):
    """Any computed colour -> (r,g,b,a) 0-255/0-1. Handles rgb()/rgba(), #hex, and CSS Color-4
    color(srgb r g b [/ a]) — which is what a resolved color-mix() comes back as. None on miss."""
    s = (s or '').strip()
    m = re.match(r'rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?', s)
    if m:
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return (int(round(float(m.group(1)))), int(round(float(m.group(2)))),
                int(round(float(m.group(3)))), a)
    m = re.match(r'color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*/\s*([\d.]+))?', s)
    if m:
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return (int(round(float(m.group(1))*255)), int(round(float(m.group(2))*255)),
                int(round(float(m.group(3))*255)), a)
    m = re.match(r'#([0-9A-Fa-f]{6})$', s)
    if m:
        h = m.group(1)
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (1.0,)
    m = re.match(r'#([0-9A-Fa-f]{3})$', s)
    if m:
        h = m.group(1)
        return tuple(int(h[i]*2, 16) for i in range(3)) + (1.0,)
    return None

def _rgb(s):
    """The opaque rgb of a colour, dropping alpha (for distinctness comparisons)."""
    p = _parse(s)
    return p[:3] if p else None

def _over(s, bg):
    """The colour s composited over opaque bg (r,g,b) — the rgb a reader actually sees."""
    p = _parse(s)
    if p is None or bg is None:
        return None
    r, g, b, a = p
    return tuple(int(round(a*c + (1-a)*d)) for c, d in zip((r, g, b), bg))

def _lin(c):
    c /= 255.0
    return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4

def rel_lum(rgb):
    r, g, b = (_lin(x) for x in rgb)
    return 0.2126*r + 0.7152*g + 0.0722*b

def contrast(a, b):
    la, lb = rel_lum(a), rel_lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


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


JS_STATES = """
(sel) => {
  function bgOf(el){
    var n = el;
    while(n){
      var c = getComputedStyle(n).backgroundColor;
      if(c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      n = n.parentElement;
    }
    return getComputedStyle(document.documentElement).backgroundColor;
  }
  function fillOf(q){ var e = document.querySelector(q); return e ? getComputedStyle(e).fill : null; }
  function strokeOf(q){ var e = document.querySelector(q); return e ? getComputedStyle(e).stroke : null; }
  var svg = document.querySelector(sel.svg);
  // the five grade hexes off the root (they are literal hexes, usable as-is)
  var cs = getComputedStyle(document.documentElement);
  var grades = ['--g4','--g3','--g2','--g1','--g0'].map(function(v){ return cs.getPropertyValue(v).trim(); });
  // gap: two horizontally-adjacent cells (equal y), pitch = |dx|, cell = width
  var cells = Array.prototype.slice.call(document.querySelectorAll(sel.cells)).map(function(r){
    return { x:parseFloat(r.getAttribute('x')), y:parseFloat(r.getAttribute('y')),
             w:parseFloat(r.getAttribute('width')) };
  }).filter(function(c){ return !isNaN(c.x) && !isNaN(c.y) && !isNaN(c.w); });
  var pitch = null, cellW = null;
  for(var i=0;i<cells.length && pitch===null;i++){
    for(var j=0;j<cells.length;j++){
      if(i===j) continue;
      if(Math.abs(cells[i].y - cells[j].y) < 0.01){
        var dx = Math.abs(cells[i].x - cells[j].x);
        if(dx > 0.01 && (pitch===null || dx < pitch)){ pitch = dx; cellW = cells[i].w; }
      }
    }
  }
  var leg = document.querySelector('.lifeleg');
  return {
    bg: svg ? bgOf(svg) : bgOf(document.body),
    lived: fillOf(sel.lived),
    rated: fillOf(sel.rated),
    future: fillOf(sel.future),
    ring: strokeOf(sel.ring),
    grades: grades,
    pitch: pitch, cellW: cellW,
    nLived: document.querySelectorAll(sel.lived).length,
    nRated: document.querySelectorAll(sel.rated).length,
    nFuture: document.querySelectorAll(sel.future).length,
    leg: leg ? { sw: leg.querySelectorAll('.lifeleg-sw').length,
                 lived: !!leg.querySelector('.lifeleg-lived'),
                 ahead: !!leg.querySelector('.lifeleg-ahead'),
                 now: !!leg.querySelector('.lifeleg-now'),
                 text: (leg.textContent||'').replace(/\\s+/g,' ').trim(),
                 overflow: leg.scrollWidth - leg.clientWidth } : null
  };
}
"""


async def run(pw, w, h, label):
    b, pg, errs = await open_page(pw, w, h)
    if w >= 1024:
        sel = {'svg': 'svg.h18life', 'cells': 'rect.lv,rect.lw,rect.lf',
               'lived': 'rect.lv', 'rated': 'rect.lw', 'future': 'rect.lf', 'ring': 'rect.cw'}
    else:
        sel = {'svg': 'svg.h185life', 'cells': 'rect.h185lv,rect.h185wk,rect.h185ahead',
               'lived': 'rect.h185lv', 'rated': 'rect.h185wk', 'future': 'rect.h185ahead',
               'ring': 'rect.h185today'}
    d = await pg.evaluate(JS_STATES, sel)

    bg = _rgb(d['bg'])
    # each state composited over the ground — the colour a reader actually sees (the now ring is
    # a translucent accent, so its seen colour is accent-over-ground, not the raw token)
    lived, rated, future, ring = (_over(d[k], bg) for k in ('lived', 'rated', 'future', 'ring'))
    chk("%s · the life chart drew lived, rated and future cells" % label,
        d['nLived'] > 0 and d['nRated'] > 0 and d['nFuture'] > 0,
        {k: d[k] for k in ('nLived', 'nRated', 'nFuture')})
    chk("%s · a background colour could be read" % label, bg is not None, d['bg'])

    # S1 — four distinct state colours
    quad = [lived, rated, future, ring]
    distinct = all(x is not None for x in quad) and len(set(quad)) == 4
    chk("%s · four states are four DISTINCT colours (lived/rated/future/now)" % label, distinct,
        {'lived': d['lived'], 'rated': d['rated'], 'future': d['future'], 'ring': d['ring']})

    # S2 — lived, rated, now each clear 3:1
    if bg and lived and rated and ring:
        cl, cr, cn = contrast(lived, bg), contrast(rated, bg), contrast(ring, bg)
        chk("%s · lived fill clears 3:1 against the ground (%.2f)" % (label, cl), cl >= 3.0, (d['lived'], d['bg']))
        chk("%s · a rated grade cell clears 3:1 (%.2f)" % (label, cr), cr >= 3.0, (d['rated'], d['bg']))
        chk("%s · the current-week ring clears 3:1 (%.2f)" % (label, cn), cn >= 3.0, (d['ring'], d['bg']))
    else:
        chk("%s · lived/rated/now contrast measurable" % label, False, d)

    # S3 — the five grade colours each >= 3:1 and mutually distinct
    gr = [_rgb(x) for x in d['grades']]
    if bg and all(gr):
        gcs = [contrast(x, bg) for x in gr]
        chk("%s · all five grade colours clear 3:1 (min %.2f)" % (label, min(gcs)), min(gcs) >= 3.0,
            list(zip(d['grades'], ['%.2f' % c for c in gcs])))
        chk("%s · the five grades are mutually distinct" % label, len(set(gr)) == 5, d['grades'])
    else:
        chk("%s · five grade colours readable" % label, False, d['grades'])

    # S4 — future is faint (below lived), by design
    if bg and future and lived:
        cf, cl = contrast(future, bg), contrast(lived, bg)
        chk("%s · the future state is faint — below lived (%.2f < %.2f)" % (label, cf, cl), cf < cl,
            (d['future'], d['lived']))

    # S5 — cells have gaps (cell width < pitch)
    gap = (d['pitch'] - d['cellW']) if (d['pitch'] and d['cellW']) else None
    chk("%s · cells have a gap: width < pitch (gap=%s)" % (label, None if gap is None else round(gap, 2)),
        gap is not None and gap > 0.4, {'pitch': d['pitch'], 'cellW': d['cellW']})

    # S6 — the legend, under the grid, wraps
    leg = d['leg']
    legok = (bool(leg) and leg['sw'] >= 8 and leg['lived'] and leg['ahead'] and leg['now']
             and 'A' in leg['text'] and 'F' in leg['text']
             and 'lived' in leg['text'] and 'ahead' in leg['text'] and 'now' in leg['text'])
    chk("%s · a legend carries A B C D F · lived · ahead · now" % label, legok, leg)
    chk("%s · the legend wraps, never scrolls sideways" % label,
        bool(leg) and leg['overflow'] <= 1, leg and leg.get('overflow'))

    # S7 — no page errors
    chk("%s · zero page errors" % label, not errs, errs)
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 1280, 720, "1280x720")
        await run(pw, 390, 844, "390x844")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-678-LIFE: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
