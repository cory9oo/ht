#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 194 S5.3 + N2.6 - THE OVERLAP PROBE. Text boxes must not intersect.

    python tools/overlap_probe.py                 (the fixture, every width x scale; exit 1 on any overlap)
    python tools/overlap_probe.py --url <live>    (the same probe against a served page - needs a signed-in session
                                                   for the group card; a page with nothing to measure is a FAIL)

WHY A NEW PROBE. `lint_overflow` asks whether a box is wider than its parent. Cory's Thursday screenshot showed
`You stakes ■ 0% ■ 15% ■ 12%best 50%4/7` - every box inside its parent, and two words drawn on top of each other.
185 S1 "fixed" the group table and its lints passed; the screen still overlapped. So this measures the thing he
sees: every TEXT NODE's rendered rectangles (Range.getClientRects), pairwise, and any two from different nodes that
intersect by more than half a pixel in both directions is an overlap - and so are two words on one line with under
2px between them, because that is how `best 50%4/7` reads as one word (the old table was never OVER itself; it ran
together).

WHERE: the group card (desktop GROUP panel at 1695 and 1280; the phone's Insights card at 390 and 360), and the
Settings page's appearance tiles and journal-mirror tiles (N2.6) at 1695 and 390. Each at Windows scale 1.0 AND 1.25
(stress 1): 125 % scaling is a CSS viewport 1/1.25 as wide at a device-pixel ratio of 1.25, which is exactly what
his laptop hands the page. 134 R1: prints its assertion count; a surface that measured zero text nodes FAILS.
"""
import argparse, asyncio, json, os, sys
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
    raise SystemExit('overlap_probe: no estate root above %s' % start)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('overlap_probe: no fixture found')


PROBE = r"""(sel) => {
  let roots = [...document.querySelectorAll(sel)].filter(n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  roots = roots.filter(n => !roots.some(o => o !== n && o.contains(n)));     /* a node inside another root is counted once */
  const boxes = [];
  roots.forEach(root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? 1 : 3 });
    let n, i = 0;
    while ((n = w.nextNode())) {
      const el = n.parentElement; const cs = el && getComputedStyle(el);
      if (!cs || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      [...r.getClientRects()].forEach(b => { if (b.width > 0.5 && b.height > 0.5)
        boxes.push({ id: i, t: n.textContent.trim().slice(0, 24), l: b.left, r: b.right, tp: b.top, b: b.bottom }); });
      i++;
    }
  });
  const hits = [];
  for (let a = 0; a < boxes.length; a++) for (let c = a + 1; c < boxes.length; c++) {
    const x = boxes[a], y = boxes[c]; if (x.id === y.id) continue;
    const ox = Math.min(x.r, y.r) - Math.max(x.l, y.l), oy = Math.min(x.b, y.b) - Math.max(x.tp, y.tp);
    if (ox > 0.5 && oy > 0.5) { hits.push(x.t + ' | ' + y.t + ' (' + ox.toFixed(1) + 'x' + oy.toFixed(1) + ')'); continue; }
    /* RUN TOGETHER: two different words on one line with under 2px between them read as one word
       (`best 50%4/7`, `You stakes`) - the defect 185's lints could not see, counted as an overlap */
    const hmin = Math.min(x.b - x.tp, y.b - y.tp);
    if (oy > 0.5 * hmin && ox > -2) hits.push(x.t + ' | ' + y.t + ' (touching, gap ' + (-ox).toFixed(1) + 'px)');
  }
  return { roots: roots.length, nodes: new Set(boxes.map(b => b.id)).size, hits,
           doc: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
}"""

# surface -> (selector, how to reach it)
GROUP = '.g194, #h18Group, [data-i29="group"]'
SETTINGS = '#thPick, #h32mir'
PLAN = [('group', 1695), ('group', 1280), ('group', 390), ('group', 360), ('settings', 1695), ('settings', 390)]


async def open_page(pw, url, w, scale):
    b = await pw.chromium.launch()
    vw = int(round(w / scale)); vh = int(round((900 if w >= 1024 else 844) / scale))
    mob = vw < 1024
    ctx = await b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=scale, has_touch=mob,
                              is_mobile=mob, color_scheme='dark')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script('window.__BIGSET=true; window.__CIRCLE=true; window.__BLOCKS=true; window.__NO_CLOSED_AT=true;')
    await pg.goto(url)
    await pg.wait_for_timeout(2400)
    return b, pg, errs, vw


async def reach(pg, surface, vw):
    if surface == 'group' and vw < 1024:
        await pg.evaluate("() => { const x = [...document.querySelectorAll('[data-t29]')].find(x => /insights/i.test(x.textContent)); if (x) x.click(); }")
        await pg.wait_for_timeout(1200)
    if surface == 'settings':
        await pg.evaluate("() => { const b = document.getElementById('bSet'); if (b) b.click(); }")
        await pg.wait_for_timeout(900)
    sel = GROUP if surface == 'group' else SETTINGS
    await pg.evaluate("(s) => { const n = document.querySelector(s); if (n) n.scrollIntoView({block:'center'}); }", sel)
    await pg.wait_for_timeout(200)
    return sel


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default=None)
    ap.add_argument('--json', default=None, help='write the measured numbers here')
    a = ap.parse_args()
    url = a.url or ('file://' + os.path.join(fixture_dir(find_estate(REPO)), 'index.html').replace(os.sep, '/'))
    res, out = [], []
    async with async_playwright() as pw:
        for surface, w in PLAN:
            for scale in (1.0, 1.25):
                b, pg, errs, vw = await open_page(pw, url, w, scale)
                sel = await reach(pg, surface, vw)
                m = await pg.evaluate(PROBE, sel)
                ok = m['nodes'] > 0 and not m['hits'] and m['doc'] <= m['vw'] + 1
                res.append(ok)
                out.append({'surface': surface, 'width': w, 'scale': scale, 'css_width': vw, 'nodes': m['nodes'],
                            'overlaps': len(m['hits']), 'hscroll': m['doc'] > m['vw'] + 1})
                print('  %-6s O%s . %-8s at %4d x %.2f (css %4d): %d text nodes, %d overlap(s)%s%s' % (
                    'PASS' if ok else 'FAIL', len(res), surface, w, scale, vw, m['nodes'], len(m['hits']),
                    '' if m['doc'] <= m['vw'] + 1 else ', PAGE SCROLLS SIDEWAYS',
                    ('   -> ' + '; '.join(m['hits'][:4])) if m['hits'] else ('   -> nothing measured' if not m['nodes'] else '')))
                if errs:
                    print('         page errors: %s' % errs[:2])
                await b.close()
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump(out, f, indent=1)
    n = len(res); bad = n - sum(res)
    print('\n%d checks . %d pass . %d fail' % (n, n - bad, bad))
    if n == 0:
        print('ZERO CHECKS - a failed run, not a pass (134 R1).')
        return 1
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
