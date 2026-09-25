#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-35 GOLDEN - PASTE 209 (THE FOUR LIVE DEFECTS THE SCREEN EXPOSED), run literally.

    python tools/golden_ht35.py            (from anywhere; the fixture is found, not assumed)

  A  the section probe does not depend on the login being ready at +160ms: with the session delayed 3 s,
     __HT29S2.hasSection() is true within 10 s and every placed row follows the SERVER'S section (rows
     chosen so the server and the heuristic disagree - the heuristic never yields 'morning'); a
     normal-speed login gives the same.
  B  once the server carries the column the device's placements step aside: a stale ht31_sections that
     disagrees with the server loses, the old map is archived to ht186_sections_superseded, and a
     SECOND load reads ht31_sections zero times (instrumented getItem).
  D  nothing writes a habit on render (186 N1): with a legacy daily Sabbath present and no user event,
     two loads make ZERO update/insert/upsert calls to `habits`.

134 R1: prints its assertion count; a section that asserts nothing is a FAIL.

The session delay and the getItem counter are installed by THIS file, through the supported
window.__MOCK_SB seam (app.js:11) - the fixture's mock.js is not touched.
"""
import asyncio, json, os, sys
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
    raise SystemExit('golden_ht35: no estate root above %s' % start)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('golden_ht35: no fixture found')


ESTATE = find_estate(REPO)
FIX = fixture_dir(ESTATE)
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')
RES, SEC = [], {}
CUR = ['?']


def chk(name, ok, got=''):
    RES.append((bool(ok), name))
    SEC[CUR[0]] = SEC.get(CUR[0], 0) + 1
    print('  %-6s %s%s' % ('PASS' if ok else 'FAIL', name, '' if ok else '   -> ' + str(got)[:300]))


def section(t, title):
    CUR[0] = t
    print('\n--- %s . %s ---' % (t, title))


# THE SEAM. app.js reads window.__MOCK_SB (app.js:11); mock.js assigns it at page load. This init
# script (which runs BEFORE any page script) traps that assignment so a golden can delay the auth
# calls without editing the fixture, and counts every read of the ht31_sections key.
TRAP = r"""(function(){
  window.__ht31reads = 0;
  try{
    var _gi = Storage.prototype.getItem;
    Storage.prototype.getItem = function(k){
      if(k === 'ht31_sections'){ try{ window.__ht31reads = (window.__ht31reads||0)+1; }catch(e){} }
      return _gi.apply(this, arguments);
    };
  }catch(e){}
  var _sb;
  try{
    Object.defineProperty(window, '__MOCK_SB', {
      configurable:true,
      get:function(){ return _sb; },
      set:function(v){
        _sb = v;
        try{
          var ms = window.__SESSION_DELAY_MS||0;
          if(ms && v && v.auth){
            ['getUser','getSession'].forEach(function(k){
              var orig = v.auth[k];
              if(typeof orig !== 'function') return;
              v.auth[k] = function(){
                var self=this, args=arguments;
                return new Promise(function(res){ setTimeout(function(){
                  Promise.resolve(orig.apply(self,args)).then(res); }, ms); });
              };
            });
          }
        }catch(e){}
      }
    });
  }catch(e){}
})();"""

HABIT_WRITES = """() => [].concat((window.__UPDATES || []).map(x => ['update', x[0], x[1]]),
                              (window.__INSERTS || []).map(x => ['insert', x[0], x[1]]),
                              (window.__UPSERTS || []).map(x => ['upsert', x[0], x[1]]))
                    .filter(x => x[1] === 'habits')"""

SECS = """() => { const out = {};
  document.querySelectorAll('#log .li').forEach(r => {
    let s = r.previousElementSibling; while(s && !s.classList.contains('grp')) s = s.previousElementSibling;
    out[r.getAttribute('data-h')] = s ? s.getAttribute('data-sec') : null; });
  return out; }"""


async def open_page(pw, w=390, h=844, storage=None, flags=None):
    b = await pw.chromium.launch()
    mob = w < 1024
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=mob, is_mobile=mob,
                             device_scale_factor=1, color_scheme='dark')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.add_init_script(TRAP)
    if storage:
        await pg.add_init_script('try{%s}catch(e){}' % ''.join(
            'localStorage.setItem(%s,%s);' % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    f = {}
    f.update(flags or {})
    await pg.add_init_script('; '.join('window.%s=%s' % (k, json.dumps(v)) for k, v in f.items()))
    await pg.goto(BASE)
    return b, pg, errs


async def wait_has_section(pg, timeout=10000):
    try:
        await pg.wait_for_function("() => window.__HT29S2 && window.__HT29S2.hasSection()", timeout=timeout)
        return True
    except Exception:
        return False


# ---- A · the boot-race probe -------------------------------------------------------------------
async def a(pw):
    section('A', 'the section probe survives a slow login (S2a)')
    # server places h0/h1 in 'morning' - a section the heuristic NEVER produces (HT-31 took the clock
    # out of placement), so a row rendered 'morning' can only have come from the server via the probe.
    flags = {'__SECTION': True, '__SECTIONS': {'h0': 'morning', 'h1': 'morning'}, '__SESSION_DELAY_MS': 3000}
    b, pg, errs = await open_page(pw, 390, 844, flags=flags)
    early = await pg.evaluate("() => !!(window.__HT29S2 && window.__HT29S2.hasSection())")
    ok = await wait_has_section(pg, 10000)
    await pg.wait_for_timeout(500)
    secs = await pg.evaluate(SECS)
    chk('A1 . with a 3 s session delay hasSection() is FALSE before the session resolves', early is False, early)
    chk('A2 . hasSection() becomes true within 10 s', ok, ok)
    chk('A3 . h0 follows the server into Morning (heuristic never yields morning)', secs.get('h0') == 'morning', secs.get('h0'))
    chk('A4 . h1 follows the server into Morning', secs.get('h1') == 'morning', secs.get('h1'))
    chk('A5 . no page errors', not errs, errs[:2])
    await b.close()

    # a normal-speed login gives the same
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SECTION': True, '__SECTIONS': {'h0': 'morning', 'h1': 'morning'}})
    ok = await wait_has_section(pg, 10000)
    await pg.wait_for_timeout(400)
    secs = await pg.evaluate(SECS)
    chk('A6 . a normal-speed login gives the same: hasSection true, h0/h1 Morning',
        ok and secs.get('h0') == 'morning' and secs.get('h1') == 'morning', [ok, secs.get('h0'), secs.get('h1')])
    await b.close()


# ---- B · the device placements step aside --------------------------------------------------------
async def bsec(pw):
    section('B', 'a stale device placement steps aside for the server (S2b)')
    flags = {'__SECTION': True, '__SECTIONS': {'h0': 'morning'}}
    storage = {'ht31_sections': json.dumps({'h0': 'weekly'})}   # device says weekly, server says morning
    b, pg, errs = await open_page(pw, 390, 844, storage=storage, flags=flags)
    ok = await wait_has_section(pg, 10000)
    await pg.wait_for_timeout(500)
    secs = await pg.evaluate(SECS)
    st = await pg.evaluate("""() => { let sup=[]; try{ sup = JSON.parse(localStorage.getItem('ht186_sections_superseded')||'[]'); }catch(e){}
        return { retired: localStorage.getItem('ht209_sections_retired'),
                 sup: sup, still: localStorage.getItem('ht31_sections') }; }""")
    chk('B1 . hasSection true', ok, ok)
    chk('B2 . the screen follows the SERVER, not the stale device placement: h0 is Morning (not weekly)',
        secs.get('h0') == 'morning', secs.get('h0'))
    chk('B3 . the device map is archived to ht186_sections_superseded (id h0, device weekly)',
        any(e.get('id') == 'h0' and e.get('device') == 'weekly' for e in (st['sup'] or [])), st['sup'])
    chk('B4 . ht31_sections is left in place (not deleted), only stepped aside', st['still'] is not None, st['still'])
    chk('B5 . the store is marked retired', st['retired'] == '1', st['retired'])

    # a SECOND load must read ht31_sections zero times
    await pg.reload()
    ok2 = await wait_has_section(pg, 10000)
    await pg.wait_for_timeout(500)
    secs2 = await pg.evaluate(SECS)
    reads = await pg.evaluate("() => window.__ht31reads")
    chk('B6 . a second load reads ht31_sections ZERO times (instrumented getItem)', reads == 0, reads)
    chk('B7 . the second load still follows the server: h0 Morning', ok2 and secs2.get('h0') == 'morning', [ok2, secs2.get('h0')])
    chk('B8 . no page errors', not errs, errs[:2])
    await b.close()


# ---- D · nothing writes a habit on render --------------------------------------------------------
async def d(pw):
    section('D', 'no habit write on render, across two loads (S2d)')
    # __SABBATH seeds a legacy daily Sabbath - the exact row whose daily->dow:6 migration v42 tried to
    # write on every paint (the live screen showed 13 attempts). With the write off the render path,
    # two loads write nothing.
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SABBATH': True})
    await wait_has_section(pg, 4000)
    await pg.wait_for_timeout(1500)
    w1 = len(await pg.evaluate(HABIT_WRITES))
    chk('D1 . the first load writes nothing to habits (186 N1 / 209 S2d)', w1 == 0, w1)
    await pg.reload()
    await wait_has_section(pg, 4000)
    await pg.wait_for_timeout(1500)
    w2 = len(await pg.evaluate(HABIT_WRITES))
    chk('D2 . the second load writes nothing to habits', w2 == 0, w2)
    chk('D3 . no page errors', not errs, errs[:2])
    await b.close()


async def main():
    async with async_playwright() as pw:
        for f in (a, bsec, d):
            await f(pw)
    ok = sum(1 for x in RES if x[0])
    empty = [s for s in ('A', 'B', 'D') if not SEC.get(s)]
    for s in empty:
        print('  FAIL   %s.ZERO . this section asserted nothing (134 R1)' % s)
    print('\n%d checks . %d pass . %d fail' % (len(RES) + len(empty), ok, len(RES) - ok + len(empty)))
    return 0 if ok == len(RES) and not empty else 1


sys.exit(asyncio.run(main()))
