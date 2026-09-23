#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-179 S0 - WHAT SCROLLS SIDEWAYS ON THE PHONE.

    python tools/overflow_probe.py [--dir <fixture>] [--widths 390,360] [--json out.json]

For every screen the phone reaches BY CLICKING (R70.211) - today, month, report, group - it records
`documentElement.scrollWidth` vs `clientWidth` and every VISIBLE element that is either wider than
the viewport or is itself a sideways scroller (scrollWidth > clientWidth + 1 with overflow-x
auto|scroll). Exit 1 when anything overflows, so `lint_overflow.py` can run it as its second half.
"""
import argparse, asyncio, json, os, sys
from playwright.async_api import async_playwright

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))


def find_fixture():
    d = HERE
    for _ in range(7):
        for c in (os.path.join(d, '_machine', 'ht3'), os.path.join(d, 'ht3')):
            if os.path.isdir(c):
                return c
        n = os.path.dirname(d)
        if n == d: break
        d = n
    raise SystemExit('overflow_probe: no fixture found above %s' % HERE)


MEASURE = r"""() => {
  const W = document.documentElement.clientWidth, out = [];
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
  const path = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id;
    else if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0,2).join('.');
    return s; };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    if (el.closest('dialog:not([open])')) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const scroller = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    const wide = r.right > W + 1 && !el.closest('[data-offscreen]');
    if (scroller || wide) {
      // report the outermost offender only
      let p = el.parentElement, inner = false;
      while (p) { if (out.some(o => o.el === p)) { inner = true; break; } p = p.parentElement; }
      if (!inner) out.push({el, what: path(el), scroller, wide, right: Math.round(r.right), sw: el.scrollWidth, cw: el.clientWidth});
    }
  }
  return {W, docSW: document.documentElement.scrollWidth, docCW: W,
          hits: out.map(o => ({what:o.what, scroller:o.scroller, wide:o.wide, right:o.right, sw:o.sw, cw:o.cw}))};
}"""

# the screens, each reached by clicking its own door. A door that is not on the page is reported,
# never skipped silently.
SCREENS = [
    ('today',  "() => { const b=[...document.querySelectorAll('[data-t29]')].find(x=>/today/i.test(x.textContent)); if(b){b.click(); return true;} return false; }"),
    ('month',  "() => { const b=[...document.querySelectorAll('[data-t29]')].find(x=>/insights/i.test(x.textContent)); if(b){b.click(); return true;} return false; }"),
    ('report', "() => { const t=[...document.querySelectorAll('[data-t29]')].find(x=>/today/i.test(x.textContent)); if(t) t.click(); const b=document.querySelector('[data-h32reports]'); if(b){b.click(); return true;} return false; }"),
    ('group',  "() => { const o=document.querySelector('.ov.on [data-close], .ovX, [data-ovclose]'); if(o) o.click(); const b=document.querySelector('[data-h29group]'); if(b){b.click(); return true;} return false; }"),
]


async def probe(pw, base, w, h, storage):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True,
                              device_scale_factor=1)
    pg = await ctx.new_page()
    await pg.add_init_script("try{%s}catch(e){}" % "".join(
        "localStorage.setItem(%s,%s);" % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    await pg.add_init_script("window.__BIGSET=true; window.__CIRCLE=true;")
    await pg.goto(base)
    await pg.wait_for_timeout(2600)
    res = []
    screens = SCREENS
    if storage.get('ht_advanced') == '1':
        # the full sheet has its own doors: the jump bar, one section per tap
        screens = [(j, "() => { const b=document.querySelector('.jump [data-j=\"%s\"]'); if(b){b.click(); return true;} return false; }" % j)
                   for j in ('jIn', 'jDay', 'jRec', 'jRate', 'jStand', 'jCircle')]
    for name, door in screens:
        ok = await pg.evaluate(door)
        await pg.wait_for_timeout(900)
        m = await pg.evaluate(MEASURE)
        m.update(screen=name, width=w, door=bool(ok))
        res.append(m)
    await b.close()
    return res


async def main(a):
    base = 'file://' + os.path.join(os.path.abspath(a.dir), 'index.html').replace(os.sep, '/')
    widths = [int(x) for x in a.widths.split(',')]
    H = {390: 844, 360: 780}
    allres, bad = [], 0
    async with async_playwright() as pw:
        for w in widths:
            for r in await probe(pw, base, w, H.get(w, 800), dict(([('ht_theme', a.theme)] if a.theme else []) + ([('ht_advanced', '1')] if a.advanced else []))):
                allres.append(r)
                over = r['docSW'] > r['docCW'] or r['hits']
                bad += 1 if over else 0
                print('%-4s %-7s door=%-5s doc %d/%d  %s' % (w, r['screen'], r['door'], r['docSW'], r['docCW'],
                                                          'OVERFLOW' if over else 'fits'))
                for hh in r['hits'][:12]:
                    print('       %-40s %s%s right=%d sw=%d cw=%d' % (hh['what'][:40], 'scroller ' if hh['scroller'] else '',
                                                                   'wide' if hh['wide'] else '', hh['right'], hh['sw'], hh['cw']))
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump(allres, f, indent=1)
    print('%d screen(s) probed, %d overflow' % (len(allres), bad))
    return 1 if bad else 0


ap = argparse.ArgumentParser()
ap.add_argument('--dir', default=None)
ap.add_argument('--widths', default='390,360')
ap.add_argument('--theme', default=None)
ap.add_argument('--json', default=None)
ap.add_argument('--advanced', action='store_true', help='the full sheet (Settings -> Advanced)')
A = ap.parse_args()
A.dir = A.dir or find_fixture()
sys.exit(asyncio.run(main(A)))



