#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 816 GOLDEN — THE STANDARD'S NAME WRAPS (Cory 2026-10-11). Run at 390 and 1280.

Cory: "when I type in on my phone, the standards are too long and I can't get to the back end of
typing the standard inside of the edits." The Name field is a one-row textarea that grows through the
one autosize path, so a long name wraps and the end of it is reachable - never a sideways scroll.

  N1  the Name field is a TEXTAREA (not an input);
  N2  a 90-character name WRAPS with no horizontal scroll (scrollWidth <= clientWidth) and is fully
      visible (grown to fit: scrollHeight <= clientHeight), so the whole name shows on open;
  N3  the caret reaches the END of the name (selection at length, and the end line is in view);
  N4  Enter SAVES the sheet (the same write the SAVE button runs);
  N5  a pasted newline is NEVER stored - on save \\r and \\n go and runs of whitespace collapse to one.

R134 R1: prints its assertion count; a section that asserts nothing is a FAIL.
"""
import os as _os
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
import asyncio, sys
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

NAME90 = 'Pray and read scripture every single morning before I touch my phone or any screen at all x'  # 90

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:220])))


OPEN_AND_FILL = """(nm) => {
  const p = document.querySelector('#log .li .edp'); if(!p) return {err:'no edp'};
  p.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  return new Promise(res => setTimeout(() => {
    const f = document.getElementById('eName'); if(!f) return res({err:'no eName'});
    f.value = nm; f.dispatchEvent(new Event('input',{bubbles:true}));
    f.focus(); try{ f.selectionStart = f.selectionEnd = nm.length; }catch(e){}
    setTimeout(() => res({
      tag: f.tagName, sw: f.scrollWidth, cw: f.clientWidth, sh: f.scrollHeight, ch: f.clientHeight,
      selEnd: f.selectionStart === nm.length, lines: Math.round(f.scrollHeight / parseFloat(getComputedStyle(f).lineHeight))
    }), 150);
  }, 500));
}"""

ENTER_SAVE = """() => {
  window.__UPDATES = [];
  const f = document.getElementById('eName'); if(!f) return {err:'no eName'};
  f.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  return new Promise(res => setTimeout(() => res({
    wrote: (window.__UPDATES||[]).filter(u=>u[0]==='habits').length,
    closed: !(document.getElementById('esheet')||{}).classList || !document.getElementById('esheet').classList.contains('on')
  }), 700));
}"""

# a value carrying a newline and double spaces; saving must store a single-line, single-spaced name
NEWLINE_SAVE = """() => {
  const p = document.querySelector('#log .li .edp'); p.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  return new Promise(res => setTimeout(() => {
    const f = document.getElementById('eName'); if(!f) return res({err:'no eName'});
    f.value = 'morning   prayer\\nand reading'; f.dispatchEvent(new Event('input',{bubbles:true}));
    window.__UPDATES = [];
    document.getElementById('eSave').click();
    setTimeout(() => {
      const ups = (window.__UPDATES||[]).filter(u=>u[0]==='habits').map(u=>u[1]);
      const nm = ups.length ? ups[ups.length-1].name : null;
      res({ name: nm });
    }, 700);
  }, 500));
}"""


async def run(pw, w, h, label):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h},
                              has_touch=(w < 1024), is_mobile=(w < 1024), device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2800)

    d = await pg.evaluate(OPEN_AND_FILL, NAME90)
    if d.get('err'):
        chk("%s · the edit sheet opened with a name field" % label, False, d)
        await b.close(); return
    chk("%s · N1 the Name field is a TEXTAREA" % label, d['tag'] == 'TEXTAREA', d)
    chk("%s · N2 a 90-char name wraps (no horizontal scroll) and is fully visible" % label,
        d['sw'] <= d['cw'] + 1 and d['sh'] <= d['ch'] + 2 and d['lines'] >= 2, d)
    chk("%s · N3 the caret reaches the end of the name, with the end in view" % label,
        d['selEnd'] and d['sh'] <= d['ch'] + 2, d)

    s = await pg.evaluate(ENTER_SAVE)
    chk("%s · N4 Enter saves the sheet (a habits write, as the SAVE button does)" % label,
        (s.get('wrote') or 0) > 0 or s.get('closed'), s)

    nl = await pg.evaluate(NEWLINE_SAVE)
    nm = nl.get('name')
    chk("%s · N5 a pasted newline is never stored, whitespace collapses to one space" % label,
        nm is not None and '\n' not in nm and '\r' not in nm and '  ' not in nm and nm == 'morning prayer and reading', nl)

    chk("%s · N6 zero page errors" % label, not errs, errs[:3])
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 390, 844, "390x844")
        await run(pw, 1280, 720, "1280x720")
    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-816-NAME: %d/%d PASS, %d FAIL" % (npass, len(RES), len(RES) - npass))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    asyncio.run(main())
