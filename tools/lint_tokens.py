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
checked a second way - it must EQUAL the DEFAULT THEME's ground, which is the
only thing that could make it wrong.

HT-32 S6 WIDENED "tokens.css and nowhere else" to "tokens.css and `themes/*.css`",
because the four skins MOVED there - and closed the hole that opens by holding
each theme to a contract instead (`theme_offences`).
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

# HT-32 S6 - THE SOURCE FILES ARE `tokens.css` AND `themes/*.css`, AND NOTHING ELSE.
#
# The rule did not change; the number of source files did. `tokens.css` used to declare the four
# instrument skins itself, so it was the only file allowed to hold a literal. S6 MOVED those skins
# into one file each under `themes/` (R70.282 - a colour has one address, and now that address is
# per theme), so a lint that still exempted only `tokens.css` would fail the wire on 174 lines that
# ARE the source.
#
# This is a widening, not a hole: every other stylesheet is linted exactly as before, and a theme
# file is a source file by SHAPE, not by trust - `theme_offences()` below holds it to the contract
# instead, so a `themes/*.css` that starts carrying component rules is still caught.
SOURCE_DIR = 'themes/'
# the sixteen names every theme must declare, plus the state tokens S6.13 requires one colour each
THEME_CONTRACT = ['--ground', '--sheet', '--sunk', '--sel', '--rule', '--rule2',
                  '--ink', '--ink2', '--ink3', '--accent', '--accent-ink', '--accent-wash',
                  '--bad', '--good', '--g0', '--g5']
THEME_STATES = ['--st-todo', '--st-done', '--st-late', '--st-skip', '--st-notdue',
                '--st-secured', '--st-ontrack', '--st-atrisk', '--st-outofreach']
DEFAULT_THEME = 'graphite'          # S6.14; the switch is `user.theme`
GROUND_DECL = re.compile(r'--ground:\s*(#[0-9a-fA-F]{3,8})')
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
        if name == TOKENS or name.startswith(SOURCE_DIR):
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
    #
    # HT-32 S6: it must now equal the DEFAULT THEME's `--ground`, not `--ht-ground`. Those were the
    # same value until the skins moved out; they are not any more, and the one that matters is the
    # one the phone actually paints its status bar with on a cold start - which is whatever theme
    # index.html's pre-paint script picks when nothing is stored. Checking the old token would have
    # passed while the status bar was a different black from the app behind it.
    tok = read(os.path.join(APP, TOKENS))
    dflt = os.path.join(APP, SOURCE_DIR, DEFAULT_THEME + '.css')
    ground = None
    if os.path.exists(dflt):
        ground = (GROUND_DECL.search(read(dflt)) or [None, None])[1]
    else:
        offences.append((SOURCE_DIR + DEFAULT_THEME + '.css', 0, '(missing)',
                         'the default theme file must exist - index.html boots to it'))
    tc = THEME_COLOR.search(index)
    theme_ok = bool(tc and ground and tc.group(1).lower() == ground.lower())
    if not theme_ok:
        offences.append(('index.html', 0, tc.group(0) if tc else '(no theme-color)',
                         'theme-color must equal %s.css --ground (%s)' % (DEFAULT_THEME, ground)))

    offences += theme_offences(sheets)

    # the wire says text is #D6DCE6 and NEVER #FFF, twice. So it is asserted, not trusted.
    text_ok = bool(re.search(r'--ht-text:\s*#D6DCE6', tok, re.I))
    if not text_ok:
        offences.append((TOKENS, 0, '--ht-text', 'text must be #D6DCE6 (the wire says never #FFF)'))

    # the brace check runs on the SOURCE files too: an unbalanced theme file silently discards
    # every rule after the stray brace, which is exactly the half-hour HT-31 lost to one `}`.
    offences += braces(checked + [n for n in sheets if n.startswith(SOURCE_DIR)])
    return offences, checked, ground


def theme_offences(sheets):
    """HT-32 S6 - A SOURCE FILE IS HELD TO A CONTRACT, NOT TAKEN ON TRUST.

    Exempting `themes/*.css` from the hex rule buys a hole unless something else closes it, so each
    theme is checked for the three things that make it a theme rather than a stylesheet that happens
    to live in that folder:

      1. it declares the whole 16-token contract, plus one colour for each of the nine states
         (S6.13: "one colour per state") - a theme missing a token silently inherits another
         theme's, which is how two themes come to share a colour nobody chose;
      2. it declares NO selector other than `:root...` - a component rule in a theme file is how
         the second address grows back;
      3. every theme linked from index.html is one of the five this repo knows about, and all five
         are linked - a theme file on disk that nothing loads is dead, and a link to a file that is
         not there is a 404 on every load.
    """
    known = ['classic', 'graphite', 'midnight', 'paper', 'terminal']
    out = []
    linked = [n for n in sheets if n.startswith(SOURCE_DIR)]
    for want in known:
        if SOURCE_DIR + want + '.css' not in linked:
            out.append(('index.html', 0, want, 'theme is not linked from index.html'))
    for name in linked:
        stem = os.path.basename(name)[:-4]
        if stem not in known:
            out.append((name, 0, stem, 'unknown theme linked - add it to lint_tokens.known first'))
        path = os.path.join(APP, name)
        if not os.path.exists(path):
            continue
        css = read(path)
        for tokname in THEME_CONTRACT + THEME_STATES:
            if not re.search(re.escape(tokname) + r'\s*:', css):
                out.append((name, 0, tokname, 'the theme contract requires this token'))
        body = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
        for sel in re.findall(r'(?m)^([^{}@/][^{}]*)\{', body):
            for one in sel.split(','):
                one = one.strip()
                if one and not one.startswith(':root'):
                    out.append((name, 0, one[:60], 'a theme file declares :root rules only'))
    return out


def braces(checked):
    """HT-31 (paste 143), 2026-09-22: A STYLESHEET THAT DOES NOT BALANCE IS ONE WHERE SOME RULES DO NOT
    APPLY, AND NOTHING SAYS SO.

    This wire removed a block and left its closing brace behind. One stray `}` at the top level, and
    every rule written after it was discarded in silence - including the one putting the journal
    archive back on the desktop, which then read as "the feature does not work" for half an hour.
    The browser recovers from it; a person reading the file does not see it; and the colour lint above
    had nothing to say about it.

    Comments and strings are stripped first, because a brace inside either is not a brace."""
    out = []
    for name in checked:
        path = os.path.join(APP, name)
        try:
            src = io.open(path, encoding='utf-8').read()
        except OSError:
            continue
        clean = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
        clean = re.sub(r'"[^"\n]*"', '', clean)
        clean = re.sub(r"'[^'\n]*'", '', clean)
        d = clean.count('{') - clean.count('}')
        if d:
            out.append((name, 0, '%d { vs %d }' % (clean.count('{'), clean.count('}')),
                        'the braces do not balance (%+d) - every rule after the stray one is silently '
                        'discarded by the browser' % d))
    return out


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
