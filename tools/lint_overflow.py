#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-179 S4 - FIT, NEVER SCROLL: THE LINT THAT HOLDS IT (paste 179 ruling "fit, never scroll").

    python tools/lint_overflow.py            both halves; exit 1 on any offence
    python tools/lint_overflow.py --static   the stylesheet half only (no browser)

THE STATIC HALF. Every stylesheet index.html links, the <style> blocks inside index.html, and every
string in app.js, are read for a rule that lets content scroll sideways: `overflow-x:auto|scroll`,
or the `overflow:auto|scroll` shorthand (which sets the x axis too). THE ALLOWLIST IS EMPTY, on
purpose: a phone screen that scrolls sideways is the defect Cory reported four times, and an
allowlist is how the fifth one would get in. A comment that NAMES the rule is not a rule and is
not counted.

THE LIVE HALF. `overflow_probe.py` opens the fixture at 390x844 and 360x780, walks today, month,
report and group BY CLICKING (R70.211), and the full sheet's six sections, and fails on any page
wider than its viewport and on any visible element that is itself a sideways scroller.

134 R1: it prints its assertion count, and zero checks is a failed run.
"""
import io, os, re, subprocess, sys

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
ALLOW = []                                    # empty by ruling - see the docstring

RULE = re.compile(r'overflow(-x)?\s*:\s*(auto|scroll)\b', re.I)
RES = []


def chk(name, ok, got=''):
    RES.append((bool(ok), name))
    print('  %-6s %s%s' % ('PASS' if ok else 'FAIL', name, '' if ok else '   -> ' + str(got)[:300]))


def read(p):
    try:
        return io.open(p, encoding='utf-8', errors='replace').read()
    except OSError as e:
        raise SystemExit('lint_overflow: cannot read %s (%s) - a lint that cannot read is not a pass' % (p, e))


def strip_comments(css):
    return re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), css, flags=re.S)


def offences_css(name, css):
    out = []
    body = strip_comments(css)
    for i, line in enumerate(body.split('\n'), 1):
        for m in RULE.finditer(line):
            out.append('%s:%d %s' % (name, i, m.group(0)))
    return out


def static():
    index = read(os.path.join(REPO, 'index.html'))
    sheets = re.findall(r'<link rel="stylesheet" href="\./([^"]+)"', index)
    out = []
    for s in sheets:
        out += offences_css(s, read(os.path.join(REPO, s)))
    for j, blk in enumerate(re.findall(r'<style[^>]*>(.*?)</style>', index, flags=re.S)):
        out += offences_css('index.html<style %d>' % j, blk)
    js = read(os.path.join(REPO, 'app.js'))
    js_nc = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), js, flags=re.S)
    for i, line in enumerate(js_nc.split('\n'), 1):
        code = re.sub(r'(^|\s)//.*$', '', line)
        for q in re.findall(r"'[^']*'|\"[^\"]*\"", code):
            if RULE.search(q):
                out.append('app.js:%d %s' % (i, q[:60]))
        if re.search(r'\.style\.overflow(X)?\s*=\s*[\'"](auto|scroll)', code):
            out.append('app.js:%d %s' % (i, code.strip()[:60]))
    out = [o for o in out if not any(a in o for a in ALLOW)]
    chk('F1 . %d stylesheet(s) linked from index.html were read' % len(sheets), len(sheets) >= 3, sheets)
    chk('F2 . no stylesheet rule and no app.js style string lets a screen scroll sideways (allowlist empty)',
        not out, out[:8])
    return out


def live():
    probe = os.path.join(HERE, 'overflow_probe.py')
    for label, extra in (('simple view', []), ('full sheet', ['--advanced'])):
        r = subprocess.run([sys.executable, probe] + extra, capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        tail = (r.stdout or '').strip().splitlines()
        last = tail[-1] if tail else ''
        m = re.match(r'(\d+) screen\(s\) probed, (\d+) overflow', last)
        chk('F3 . the probe ran on the %s (%s)' % (label, last or 'no output'), bool(m) and int(m.group(1)) > 0,
            (r.stderr or '')[-300:])
        chk('F4 . %s at 390 and 360: every screen fits its width' % label, bool(m) and m.group(2) == '0',
            '\n'.join(l for l in tail if 'OVERFLOW' in l or l.startswith('       '))[:600])


if __name__ == '__main__':
    print('--- HT-179 S4 . fit, never scroll ---')
    static()
    if '--static' not in sys.argv:
        live()
    ok = sum(1 for r in RES if r[0])
    print('\n%d checks . %d pass . %d fail' % (len(RES), ok, len(RES) - ok))
    if not RES:
        print('ZERO CHECKS - a failed run, not a pass (134 R1)')
        sys.exit(1)
    sys.exit(0 if ok == len(RES) else 1)
