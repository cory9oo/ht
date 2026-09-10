#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-25 S4 - THE FIVE COMPLETION STATES ARE MEASURED, NOT EYEBALLED.

    python3 tools/contrast_ht25.py            (table)
    python3 tools/contrast_ht25.py --check    (exit 1 if any state is under the floor)

Cory judges colour by eye and that is the right way round (DEC-062) - but "legible on the dark
skin" is not an aesthetic question, it is arithmetic, and the eye is bad at it. A state that
looks fine on a bright laptop at noon can be unreadable on a phone outdoors. So the floor is
checked here, from `tokens.css` itself rather than from a copy of the values, and the golden
runs it.

WCAG 2.1 relative luminance and contrast ratio, both grounds this text sits on. 4.5:1 is the AA
floor for body text; these ARE body text - they are the words of the task.
"""
import argparse, io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FLOOR = 4.5
STATES = ('todo', 'done', 'late', 'skip', 'notdue')
GROUNDS = (('ground', '--ht-ground'), ('panel', '--ht-panel'))


def lum(hexcol):
    h = hexcol.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    l1, l2 = sorted((lum(a), lum(b)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def tokens():
    """Read the values from tokens.css, so this can never drift from what ships."""
    s = io.open(os.path.join(REPO, 'tokens.css'), encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'(--ht-[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})', s):
        out[m.group(1)] = m.group(2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    t = tokens()
    missing = [s for s in STATES if ('--ht-st-' + s) not in t]
    if missing:
        print('MISSING state token(s): %s' % ', '.join(missing))
        return 1
    bad = []
    print('%-9s %-8s %s' % ('state', 'hex', '  '.join(g[0] for g in GROUNDS)))
    for s in STATES:
        col = t['--ht-st-' + s]
        rs = [ratio(col, t[g[1]]) for g in GROUNDS]
        ok = min(rs) >= FLOOR
        if not ok:
            bad.append((s, col, min(rs)))
        print('%-9s %-8s %s   %s' % (s, col, '  '.join('%5.2f' % r for r in rs),
                                     'PASS' if ok else 'FAIL'))
    print('\nfloor %.1f:1 · %d state(s) under it' % (FLOOR, len(bad)))
    for s, col, r in bad:
        print('  FAIL %s %s -> %.2f:1' % (s, col, r))
    return 1 if (a.check and bad) else 0


if __name__ == '__main__':
    sys.exit(main())
