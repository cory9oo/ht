#!/usr/bin/env python3
"""PASTE 185 S2 - DISTINCT MEANS MEASURABLE.

    python tools/scheme_distance.py            # the table, every offered pair
    python tools/scheme_distance.py --check    # exit 1 if two of the NEW schemes measure alike

SPEC 12's ruling: between any two offered schemes, the accent hues are >= 60 deg apart OR the grounds are
>= 25 L* apart (and every text pair still clears 4.5:1 - that half is `contrast_ht32.py`'s).
Cory 9/23: "get a little drastic, some of them are very similar" - so this is the number that says whether
they still are. It reads `themes/*.css` itself, never a copy of the values (contrast_ht25's rule: "so this
can never drift from what ships").

An ACHROMATIC accent (Mono's white) has no hue; for a pair that includes one, only the L* half can pass.

ENFORCED on the five 185 schemes (NEW). The four legacy ones (Classic - Graphite - Midnight - Paper) are
MEASURED and printed, never failed: Classic "stays as today's look" by ruling, and restyling Cory's older
choices was not asked. Stress 5: two schemes that measure alike -> move the ACCENT HUE, not the contrast.
"""
import argparse, colorsys, io, itertools, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
# PASTE 194 N2.1: the four that replaced the nine (those are in themes/_retired/ and are not offered). Classic stays
# LEGACY - measured and printed, never failed - for the reason above: it is today's look, unchanged by ruling. And one
# pair CANNOT pass by hue once Classic's green (150 deg) and a sage accent share a picker with gold and crimson: five
# accents on 220 deg of warm-and-green hue cannot all sit 60 deg apart. Moss is therefore held apart from the other
# three NEW schemes (enforced) and from Classic by its ground and its role only; the receipt names that pair.
NEW = ('crimson', 'moss', 'gilt', 'orchid')
LEGACY = ('classic',)
HUE_MIN, L_MIN, ACHROMATIC_S = 60.0, 25.0, 0.12


def tokens(name):
    s = io.open(os.path.join(REPO, 'themes', name + '.css'), encoding='utf-8').read()
    return {m.group(1): m.group(2)[:7] for m in re.finditer(r'(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})', s)}


def rgb(h):
    return [int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]


def lstar(h):
    def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = [lin(c) for c in rgb(h)]
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return 116 * (y ** (1 / 3.0)) - 16 if y > 216 / 24389.0 else y * 24389 / 27.0


def hue(h):
    hh, l, s = colorsys.rgb_to_hls(*rgb(h))
    return None if s < ACHROMATIC_S or l > 0.97 or l < 0.03 else hh * 360


def measure():
    out = []
    names = [n for n in NEW + LEGACY if os.path.exists(os.path.join(REPO, 'themes', n + '.css'))]
    T = {n: tokens(n) for n in names}
    for a, b in itertools.combinations(names, 2):
        ha, hb = hue(T[a]['--accent']), hue(T[b]['--accent'])
        dh = None if ha is None or hb is None else min(abs(ha - hb), 360 - abs(ha - hb))
        dl = abs(lstar(T[a]['--ground']) - lstar(T[b]['--ground']))
        ok = (dh is not None and dh >= HUE_MIN) or dl >= L_MIN
        out.append((a, b, dh, dl, ok, a in NEW and b in NEW))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    rows = measure()
    bad = 0
    print('%-9s %-9s %9s %9s  %s' % ('scheme', 'scheme', 'hue deg', 'ground L*', 'verdict'))
    for x, y, dh, dl, ok, enforced in rows:
        tag = ('PASS' if ok else 'ALIKE') + ('' if enforced else '  (legacy - measured, not enforced)')
        if enforced and not ok:
            bad += 1
        print('%-9s %-9s %9s %9.1f  %s' % (x, y, '-' if dh is None else '%.0f' % dh, dl, tag))
    n = sum(1 for r in rows if r[5])
    print('\n%d enforced pair(s) among %s - %d alike - rule: hue >= %.0f deg OR ground >= %.0f L*'
          % (n, '/'.join(NEW), bad, HUE_MIN, L_MIN))
    if n == 0:
        print('ZERO PAIRS MEASURED - a failed run, not a pass (134 R1).')
        return 1
    return 1 if (a.check and bad) else 0


if __name__ == '__main__':
    sys.exit(main())
