#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-32 S6 - EVERY TEXT/BACKGROUND PAIR IN EVERY THEME IS MEASURED, NOT EYEBALLED.

    python tools/contrast_ht32.py            table + pair count, exit 1 on any failure
    python tools/contrast_ht32.py --quiet    just the summary line

It EXTENDS `contrast_ht25.py` rather than repeating it (CONSOLIDATE): `lum()` and `ratio()` are
imported from that file, so there is exactly one implementation of WCAG 2.1 relative luminance in
this repo and a fix to it reaches both checkers. ht25 measures the five completion states against
the two dark grounds; this measures every theme's whole text-on-background surface.

TWO THINGS THIS FILE DOES DIFFERENTLY FROM ht25, both deliberate:

  1. IT FAILS WITHOUT BEING ASKED TO. `contrast_ht25.py` only returns 1 when it is passed `--check`,
     and `run_suite.sh` calls it WITHOUT that flag - so its rc has always been 0 no matter what the
     ratios were. That is the "check that could not fail" class receipt 143 reported twice in this
     very repo. A gate with an off switch that is always off is not a gate, so this one has none.
  2. IT READS THE THEME FILES, NOT A COPY OF THEIR VALUES - the same reason ht25 reads `tokens.css`:
     "so this can never drift from what ships".

THE FLOOR IS 4.5:1, the WCAG AA floor for body text, because these ARE body text. `--ink3` and the
rule colours are exempted BY NAME below: they are hairlines and dividers, where contrast law does
not apply. `tokens.css` already records the precedent - `--ht-dim` (#4F5866) measures 2.72:1 and is
kept for rules, never used as text.
"""
import argparse, glob, io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from contrast_ht25 import lum, ratio  # noqa: E402  - ONE implementation of the WCAG math

FLOOR = 4.5

# Text tokens (the words a person reads) x background tokens (what they sit on).
TEXT = ('--ink', '--ink2', '--good', '--bad',
        '--st-todo', '--st-done', '--st-late', '--st-skip', '--st-notdue',
        '--st-secured', '--st-ontrack', '--st-atrisk', '--st-outofreach',
        # paste 179 S6: one colour per group member, and a member's NAME is text
        '--m1', '--m2', '--m3', '--m4',
        # paste 185 S3: a section header, its rail and its `+ Add` line are text in the section colour
        '--sec-morning', '--sec-night', '--sec-weekly', '--sec-standards')
BG = ('--ground', '--sheet', '--sunk', '--sel')

# Measured, but NOT held to the text floor - these are rules, hairlines and dividers.
NON_TEXT = ('--ink3', '--rule', '--rule2', '--g0', '--g1', '--g2', '--g3', '--g4', '--g5')

# Pairs that are a foreground/background COUPLE by construction and are checked against each other.
COUPLES = (('--accent-ink', '--accent'), ('--ink', '--accent-wash'))


def read_theme(path):
    """Every `--name:#hex` in the file. A theme that points at another token (var(...)) is resolved
    from the same file; an unresolved var is reported rather than skipped, because a token that does
    not resolve is a colour nobody measured."""
    s = io.open(path, encoding='utf-8').read()
    out, refs = {}, {}
    for m in re.finditer(r'(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*[;}]', s):
        h = m.group(2)
        if len(h) == 4:  # #abc -> #aabbcc
            h = '#' + ''.join(c * 2 for c in h[1:])
        out[m.group(1)] = h[:7]
    for m in re.finditer(r'(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)', s):
        refs[m.group(1)] = m.group(2)
    for _ in range(4):  # resolve chains
        for k, v in list(refs.items()):
            if k not in out and v in out:
                out[k] = out[v]
    return out, refs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quiet', action='store_true')
    ap.add_argument('--check', action='store_true',
                    help='accepted for the paste-179 spelling; this tool already fails without being asked')
    a = ap.parse_args()

    tdir = os.path.join(REPO, 'themes')
    files = sorted(glob.glob(os.path.join(tdir, '*.css')))
    if not files:
        print('NO THEME FILES under %s - a scan that could not run is not a pass '
              '(131 Ruling 3).' % tdir)
        return 1

    # the source palette, so a theme may point at --ht-* names
    base, _ = read_theme(os.path.join(REPO, 'tokens.css'))

    pairs = bad = unresolved = 0
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        t, refs = read_theme(f)
        merged = dict(base); merged.update(t)
        for k, v in refs.items():
            if k not in merged and v in merged:
                merged[k] = merged[v]

        rows, miss = [], []
        for tk in TEXT:
            if tk not in merged:
                miss.append(tk); continue
            for bk in BG:
                if bk not in merged:
                    continue
                r = ratio(merged[tk], merged[bk])
                pairs += 1
                ok = r >= FLOOR
                if not ok:
                    bad += 1
                rows.append((tk, bk, merged[tk], merged[bk], r, ok))
        for fk, bk in COUPLES:
            if fk in merged and bk in merged:
                r = ratio(merged[fk], merged[bk])
                pairs += 1
                ok = r >= FLOOR
                if not ok:
                    bad += 1
                rows.append((fk, bk, merged[fk], merged[bk], r, ok))

        fails = [r for r in rows if not r[5]]
        if not a.quiet:
            print('\n== %s ==  %d pair(s), %d under the floor' % (name, len(rows), len(fails)))
            for tk, bk, tv, bv, r, ok in fails:
                print('   FAIL %-16s on %-14s %s on %s  %5.2f:1' % (tk, bk, tv, bv, r))
        if miss:
            unresolved += len(miss)
            print('   MISSING in %s: %s' % (name, ', '.join(miss)))

        # non-text tokens are printed for the record, never failed on
        if not a.quiet:
            shown = [k for k in NON_TEXT if k in merged]
            if shown:
                print('   (not held to the text floor: %s)' % ', '.join(shown))

    print('\n%d themes Â· %d pairs checked Â· floor %.1f:1 Â· %d FAIL Â· %d missing token(s)'
          % (len(files), pairs, FLOOR, bad, unresolved))
    if pairs == 0:
        print('ZERO PAIRS CHECKED - that is a failed run, not a pass (134 R1).')
        return 1
    return 1 if (bad or unresolved) else 0


if __name__ == '__main__':
    sys.exit(main())

