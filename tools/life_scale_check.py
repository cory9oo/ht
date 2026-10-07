#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""life_scale_check.py — HT-651 S3's GATE for the Life chart's five fixed grade colours.

    python tools/life_scale_check.py            (from anywhere; the repo is found, not assumed)

It renders NOTHING. It reads `LIFE_SCALE` (the five grade colours, A..F) out of `app.js` and each
offered theme's chart GROUND and ACCENT out of `themes/<name>.css`, and asserts, for EVERY theme:

  CONTRAST  each of the five colours against the ground >= 3:1  (WCAG 2.1, 1.4.11 non-text contrast),
            so a week's grade is legible on any scheme's background.
  HUE       each colour's hue is >= 60 deg from that theme's accent (CIELAB hue), so the grade colour
            can never be read as the theme's own accent. A near-neutral colour (chroma < 8, e.g. the
            white top grade) has no hue family and so cannot collide with an accent — it passes.
  STEP      adjacent grades are >= 15 L* apart in CIELAB (theme-independent), so the five read as five
            steps and not as a smear — and the order reads in greyscale (lightness carries the grade).
            The five are designed at integer L* (100/85/70/55/40); each hex is the nearest 8-bit sRGB,
            so L* is compared at integer resolution — the span (ground floor ~40 to white 100 is 60,
            exactly four 15-L* gaps) leaves no room for sub-integer hex-quantization noise.

Why these three and not a ramp: Lisa Charlotte Muth (Datawrapper, "When to use classed and when to
use unclassed color scales") — classes when a reader must read a value; Cynthia Brewer
(colorbrewer2.org) for a lightness-ordered sequential scheme; a red-to-green scale is refused for
colour-blind readers, which is why LIFE_SCALE is a single violet family.

Exit 0 = every pair passes. Exit 1 = the first failing (theme, grade) pair is named. Exit 2 = a file
could not be read or parsed (never a silent pass).
"""
import math, os, re, sys

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

CHROMA_NEUTRAL = 8.0     # below this CIELAB chroma a colour has no hue family (white/grey)
MIN_CONTRAST   = 3.0
MIN_HUE_DEG    = 60.0
MIN_STEP_L     = 15.0
GRADES         = ['A', 'B', 'C', 'D', 'F']    # brightest -> dimmest; the order is the lightness order


# ------------------------------------------------------------------ colour maths (sRGB / WCAG / CIELAB)
def _hex(h):
    h = h.strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError('not a 6-digit hex: %r' % h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rel_lum(rgb):
    r, g, b = (_lin(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(c1, c2):
    a, b = rel_lum(c1), rel_lum(c2)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


_Xn, _Yn, _Zn = 0.95047, 1.0, 1.08883


def _lab(rgb):
    r, g, b = (_lin(x) for x in rgb)
    X = r * 0.4124 + g * 0.3576 + b * 0.1805
    Y = r * 0.2126 + g * 0.7152 + b * 0.0722
    Z = r * 0.0193 + g * 0.1192 + b * 0.9505

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = f(X / _Xn), f(Y / _Yn), f(Z / _Zn)
    L = 116 * fy - 16
    A = 500 * (fx - fy)
    B = 200 * (fy - fz)
    return L, A, B


def lstar(rgb):
    return _lab(rgb)[0]


def chroma(rgb):
    _, a, b = _lab(rgb)
    return math.hypot(a, b)


def hue_deg(rgb):
    _, a, b = _lab(rgb)
    return math.degrees(math.atan2(b, a)) % 360.0


def hue_dist(c1, c2):
    d = abs(hue_deg(c1) - hue_deg(c2)) % 360.0
    return min(d, 360.0 - d)


# ------------------------------------------------------------------ reading the repo (never guessing)
def read_life_scale(js_path):
    src = open(js_path, encoding='utf-8', errors='replace').read()
    m = re.search(r'LIFE_SCALE\s*=\s*\{(.*?)\}', src, re.S)
    if not m:
        raise SystemExit('life_scale_check: no `LIFE_SCALE = {...}` in %s' % js_path)
    body = m.group(1)
    out = {}
    for g in GRADES:
        gm = re.search(r'\b%s\s*:\s*[\'"]?(#?[0-9A-Fa-f]{3,6})[\'"]?' % g, body)
        if not gm:
            raise SystemExit('life_scale_check: LIFE_SCALE is missing grade %s' % g)
        out[g] = _hex(gm.group(1))
    return out


def read_themes(js_path, themes_dir):
    src = open(js_path, encoding='utf-8', errors='replace').read()
    m = re.search(r'THEMES\s*=\s*\[([^\]]*)\]', src)
    if not m:
        raise SystemExit('life_scale_check: no `THEMES = [...]` in %s' % js_path)
    names = re.findall(r'[\'"]([A-Za-z0-9_-]+)[\'"]', m.group(1))
    out = []
    for name in names:
        path = os.path.join(themes_dir, name + '.css')
        if not os.path.isfile(path):
            raise SystemExit('life_scale_check: THEMES names %r but %s is missing' % (name, path))
        css = open(path, encoding='utf-8', errors='replace').read()
        gm = re.search(r'--ground\s*:\s*(#[0-9A-Fa-f]{3,6})', css)
        am = re.search(r'--accent\s*:\s*(#[0-9A-Fa-f]{3,6})', css)
        if not gm or not am:
            raise SystemExit('life_scale_check: %s lacks --ground or --accent' % path)
        out.append((name, _hex(gm.group(1)), _hex(am.group(1))))
    return out


# ------------------------------------------------------------------ the gate
def main():
    js = os.path.join(REPO, 'app.js')
    themes_dir = os.path.join(REPO, 'themes')
    if not os.path.isfile(js):
        print('life_scale_check: no app.js at %s' % js); return 2
    try:
        scale = read_life_scale(js)
        themes = read_themes(js, themes_dir)
    except SystemExit as e:
        print(str(e)); return 2
    except Exception as e:
        print('life_scale_check: parse error: %s' % e); return 2

    fails = []

    # STEP — theme-independent: adjacent grades >= 15 L* apart, and strictly ordered by lightness.
    # Compared at integer L* (the design resolution); see the module docstring for why.
    ls = [(g, lstar(scale[g])) for g in GRADES]
    for (g1, l1), (g2, l2) in zip(ls, ls[1:]):
        gap = round(l1) - round(l2)
        if gap < MIN_STEP_L:
            fails.append('STEP  %s (L*=%.1f) and %s (L*=%.1f) are %d L* apart (integer), < %.0f'
                         % (g1, l1, g2, l2, abs(gap), MIN_STEP_L))

    # CONTRAST + HUE — per theme.
    for name, ground, accent in themes:
        for g in GRADES:
            c = scale[g]
            cr = contrast(c, ground)
            if cr < MIN_CONTRAST:
                fails.append('CONTRAST  %s · grade %s (#%02X%02X%02X) on ground #%02X%02X%02X = %.2f:1, < %.1f:1'
                             % (name, g, c[0], c[1], c[2], ground[0], ground[1], ground[2], cr, MIN_CONTRAST))
            ch = chroma(c)
            if ch >= CHROMA_NEUTRAL:
                hd = hue_dist(c, accent)
                if hd < MIN_HUE_DEG:
                    fails.append('HUE  %s · grade %s hue %.0f deg is %.0f deg from accent hue %.0f, < %.0f'
                                 % (name, g, hue_deg(c), hd, hue_deg(accent), MIN_HUE_DEG))

    # the report — always printed, so a pass shows its numbers too (134 R1: no silent green).
    print('LIFE_SCALE  ' + '  '.join('%s=#%02X%02X%02X(L*%.0f)' % (g, scale[g][0], scale[g][1], scale[g][2], lstar(scale[g])) for g in GRADES))
    for name, ground, accent in themes:
        row = []
        for g in GRADES:
            c = scale[g]
            row.append('%s %.1f:1' % (g, contrast(c, ground)))
        print('  %-9s ground #%02X%02X%02X accent #%02X%02X%02X(h%.0f) · %s'
              % (name, ground[0], ground[1], ground[2], accent[0], accent[1], accent[2], hue_deg(accent), '  '.join(row)))

    if fails:
        print('\nFAIL (%d):' % len(fails))
        for f in fails:
            print('  ' + f)
        return 1
    print('\nPASS · five fixed grade colours clear 3:1 on every ground, 60 deg off every accent, 15 L* apart.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
