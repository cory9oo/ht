#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""golden293_lib.py - the harness the four PASTE 293 goldens share (golden_ht37 · 38 · 39 · 40).

Every earlier golden repeats its own find_estate / fixture_dir / chk / open_page; four more copies of the same
sixty lines is how two of them drift. This is the same code once, and it is NOT a golden itself (run_suite.sh
runs only files named golden_ht*.py). Behaviour is ht36's: Playwright on the file:// fixture, mock.js for the
database, the private fixture when HT_FIXTURE_DIR is set, and 134 R1 - a run with zero assertions is a FAIL.
"""
import asyncio, io, json, os, re, sys

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
    raise SystemExit('golden293: no estate root above %s' % start)


ESTATE = find_estate(REPO)
CONTAINER = os.path.dirname(ESTATE) if os.path.basename(ESTATE).lower() == '_machine' else ESTATE


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3'),
              os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('golden293: no fixture under %s' % estate)


FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')
THEMES = ['classic', 'crimson', 'moss', 'gilt', 'orchid']
SQL = {'__HT29_SQL': True, '__SECTION': True}


class Golden:
    def __init__(self, name):
        self.name, self.res, self.cur, self.count = name, [], 'S?', {}

    def sec(self, s, title):
        self.cur = s
        print('\n--- %s . %s ---' % (s, title))

    def chk(self, label, ok, got=''):
        self.res.append((bool(ok), label))
        self.count[self.cur] = self.count.get(self.cur, 0) + 1
        print('  %-6s %s%s' % ('PASS' if ok else 'FAIL', label, '' if ok else ('   -> ' + str(got)[:300])))

    def info(self, line):
        print('  INFO   %s' % line)

    def done(self, sections):
        for s in sections:
            if not self.count.get(s):
                self.chk('%s . the section asserted something (134 R1)' % s, False, 0)
        n, f = len(self.res), sum(1 for ok, _ in self.res if not ok)
        print('\nGOLDEN %s: %d/%d PASS, %d FAIL' % (self.name, n - f, n, f))
        if n == 0:
            print('ZERO ASSERTIONS - a run that asserts nothing has failed (134 R1)')
            return 1
        return 1 if f else 0


def src(p):
    try:
        return io.open(p, encoding='utf-8', errors='replace').read()
    except OSError as e:
        raise SystemExit('golden293: cannot read %s (%s). A check that cannot run is not a pass.' % (p, type(e).__name__))


def rgb(v):
    v = (v or '').strip()
    m = re.match(r'^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)', v)
    if m:
        return tuple(int(m.group(i)) for i in (1, 2, 3))
    m = re.match(r'^#([0-9a-fA-F]{6})', v)
    if m:
        h = m.group(1)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    return None


def ratio(a, b):
    def lum(c):
        s = []
        for x in c:
            x /= 255.0
            s.append(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4)
        return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


BG = ("const bgOf=(n)=>{let e=n;while(e){const c=getComputedStyle(e).backgroundColor;"
      "if(c&&c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;e=e.parentElement;}"
      "return getComputedStyle(document.body).backgroundColor;};")


async def open_page(pw, w=390, h=844, storage=None, wait=1700, flags=None, init=''):
    touch = w < 1024
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch,
                              device_scale_factor=1, color_scheme='dark')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text and 'ServiceWorker' not in m.text else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    if storage:
        await pg.add_init_script('try{%s}catch(e){}' % ''.join(
            'localStorage.setItem(%s,%s);' % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    await pg.add_init_script('; '.join('window.%s=%s' % (k, json.dumps(v))
                                       for k, v in dict(SQL, __BIGSET=True, __CIRCLE=True, **(flags or {})).items()))
    if init:
        await pg.add_init_script(init)
    await pg.goto(BASE)
    await pg.wait_for_timeout(wait)
    return b, pg, errs


def today_key_js():
    return ("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'"
            "+String(d.getDate()).padStart(2,'0');})()")


async def no_errors(g, pg, errs, tag):
    await pg.wait_for_timeout(100)
    bad = [e for e in errs if 'ServiceWorker' not in e and 'registration' not in e.lower()]
    g.chk('%s . no page error' % tag, not bad, bad[:3])
