#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-22 S2 - THE NO-RAW-HEX LINT (R70.282).

    python3 _reconcile/ht_batch22/lint_tokens.py           (run from BEV/)
    python3 _reconcile/ht_batch22/lint_tokens.py --json

THE RULE.  Every colour in the shipped bundle is declared in `standard/tokens.css`
and nowhere else.  A raw hex anywhere else is an offence, with exactly one
exemption, written into the wire itself:

    the PRINT stylesheet's `#fff` and `#000`, ON THE ALLOW-LIST BY NAME.

`by name` is load-bearing.  The wire says those two matches are correct and that
the lint must not force a wrong change to satisfy a count, so the exemption names
the two values rather than exempting the whole @media print block - a `#ccc` that
wandered into the print sheet would still be caught, and one had (app.css:295, now
`var(--print-line)`).

SCOPE is every file the page loads, taken from `index.html` itself rather than a
list kept here: a stylesheet added tomorrow is linted tomorrow, without anyone
remembering to add it.  `<meta name="theme-color">` cannot use a var(), so it is
checked a second way - it must EQUAL the ground token, which is the only thing
that could make it wrong.
"""
import io, os, re, sys, json

# HT-23 S5c: MOVED INTO THE REPO IT LINTS. It used to resolve `<estate>/standard` - the MAIN
# checkout - so run from a worktree it linted the wrong tree, the same defect `sync_fixture.py`
# carried. `APP` is now this file's own repo: `tools/..`.
APP = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))
ROOT = os.path.dirname(APP)
TOKENS = 'tokens.css'

HEX = re.compile(r'#[0-9a-fA-F]{3,8}\b')
PRINT_ALLOW = {'#fff', '#ffffff', '#000', '#000000'}
LINK = re.compile(r'<link[^>]+rel="stylesheet"[^>]+href="\./([^"]+)"')
THEME_COLOR = re.compile(r'<meta name="theme-color" content="(#[0-9a-fA-F]{3,8})"')
GROUND = re.compile(r'--ht-ground:\s*(#[0-9a-fA-F]{3,8})')


def read(p):
    return io.open(p, encoding='utf-8', errors='replace').read()


def print_ranges(css):
    """Line numbers (1-based, inclusive) that sit inside an @media print block."""
    lines = css.split('\n')
    inside, depth, out = False, 0, set()
    for i, line in enumerate(lines, 1):
        if not inside and '@media print' in line:
            inside, depth = True, 0
        if inside:
            out.add(i)
            depth += line.count('{') - line.count('}')
            if depth <= 0 and '{' in ''.join(lines[:i]):
                if depth <= 0 and i > 1 and line.count('}'):
                    inside = False
    return out


def lint():
    offences = []
    index = read(os.path.join(APP, 'index.html'))
    sheets = LINK.findall(index)
    checked = []

    for name in sheets:
        if name == TOKENS:
            continue
        path = os.path.join(APP, name)
        if not os.path.exists(path):
            offences.append((name, 0, '(missing)', 'stylesheet linked but not on disk'))
            continue
        css = read(path)
        inprint = print_ranges(css)
        checked.append(name)
        for i, line in enumerate(css.split('\n'), 1):
            for m in HEX.findall(line):
                if i in inprint and m.lower() in PRINT_ALLOW:
                    continue
                why = ('print sheet, but %s is not on the allow-list' % m) if i in inprint \
                      else 'raw hex outside tokens.css'
                offences.append((name, i, line.strip()[:88], why))

    # index.html carries no stylesheet of its own, but it does carry one colour.
    tok = read(os.path.join(APP, TOKENS))
    ground = (GROUND.search(tok) or [None, None])[1]
    tc = THEME_COLOR.search(index)
    theme_ok = bool(tc and ground and tc.group(1).lower() == ground.lower())
    if not theme_ok:
        offences.append(('index.html', 0, tc.group(0) if tc else '(no theme-color)',
                         'theme-color must equal --ht-ground (%s)' % ground))

    # the wire says text is #D6DCE6 and NEVER #FFF, twice. So it is asserted, not trusted.
    text_ok = bool(re.search(r'--ht-text:\s*#D6DCE6', tok, re.I))
    if not text_ok:
        offences.append((TOKENS, 0, '--ht-text', 'text must be #D6DCE6 (the wire says never #FFF)'))

    return offences, checked, ground


def main():
    offences, checked, ground = lint()
    if '--json' in sys.argv:
        print(json.dumps({'offences': offences, 'checked': checked, 'ground': ground}, indent=1))
    else:
        for name, i, line, why in offences:
            print('  %-12s %-5s %-90s %s' % (name, i or '-', line, why))
        print('\nLINT: %d offence%s across %s (tokens.css exempt; print #fff/#000 by name)'
              % (len(offences), '' if len(offences) == 1 else 's',
                 ', '.join(checked) or '(no stylesheets found)'))
    return 1 if offences else 0


if __name__ == '__main__':
    sys.exit(main())
