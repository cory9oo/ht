#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-652 S1 — THE DAWN/DUSK WASH NEVER COSTS THE ROW ITS LEGIBILITY.

For every offered theme (themes/*.css, the three that are LINKED — graphite/crimson/moss; _retired
is not), in light and dark where a theme carries both, this resolves the row text colour (--ink)
over the tinted row ground (--tint-dawn and --tint-dusk, each composited at its own alpha over
--ground) and asserts the WCAG 2.1 contrast ratio is >= 4.5:1 (AA, success criterion 1.4.3).

Exit 0 when every theme passes both washes; exit 1 naming the first theme/wash that fails.
Read-only: it parses the CSS, launches nothing, writes nothing. The rail runs it from the bus root.
"""
import os, re, sys, glob
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEMES = os.path.join(REPO, 'themes')


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def parse_rgba(s):
    """'rgba(227,164,92,.075)' or 'rgb(..)' -> (r,g,b,a) with a in [0,1]."""
    m = re.match(r'rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$', s.strip())
    if not m:
        return None
    r, g, b = (int(round(float(m.group(i)))) for i in (1, 2, 3))
    a = float(m.group(4)) if m.group(4) is not None else 1.0
    return (r, g, b, a)


def over(fg_rgba, bg_rgb):
    """Composite a straight-alpha colour over an opaque background."""
    r1, g1, b1, a = fg_rgba
    return tuple(int(round(a * c1 + (1 - a) * c0)) for c1, c0 in zip((r1, g1, b1), bg_rgb))


def lum(rgb):
    def ch(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def tokens_of(block):
    """Every --name:value in one declaration block, last write wins."""
    out = {}
    for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;]+);', block):
        out[m.group(1).strip()] = m.group(2).strip()
    return out


def blocks(css):
    """Each selector{...} body in a theme file. Most files carry one; a file with a light and a
    dark variant carries two, and both are checked (that is the 'where a theme has both' clause)."""
    return [m.group(1) for m in re.finditer(r'\{([^{}]*)\}', css, re.S)]


RES = []


def chk(name, ok, got=''):
    RES.append(bool(ok))
    print('  %-4s %s%s' % ('PASS' if ok else 'FAIL', name, '' if ok else ('   -> ' + str(got)[:200])))


def main():
    files = sorted(f for f in glob.glob(os.path.join(THEMES, '*.css'))
                   if os.path.basename(f) != 'README.md')
    for f in files:
        theme = os.path.basename(f)[:-4]
        for i, body in enumerate(blocks(read(f))):
            t = tokens_of(body)
            if '--tint-dawn' not in t and '--tint-dusk' not in t:
                continue  # a block that sets no tint (e.g. a bare variant) is not a row ground
            ground = t.get('--ground')
            ink = t.get('--ink')
            if not ground or not ink:
                chk('%s[%d] has --ground and --ink' % (theme, i), False, t.keys())
                continue
            g = hex_rgb(ground)
            textc = hex_rgb(ink)
            for wash in ('--tint-dawn', '--tint-dusk'):
                raw = t.get(wash)
                rgba = parse_rgba(raw) if raw else None
                if rgba is None:
                    chk('%s %s is a resolvable rgba' % (theme, wash), False, raw)
                    continue
                bg = over(rgba, g)
                ratio = contrast(textc, bg)
                chk('%s %s · text over tinted ground = %.2f:1 (>= 4.5)' % (theme, wash, ratio),
                    ratio >= 4.5, '%s over %s -> %s' % (raw, ground, bg))
    npass = sum(1 for ok in RES if ok)
    print('\nTINT CONTRAST: %d/%d PASS' % (npass, len(RES)))
    if not RES:
        print('no themes carried a --tint-dawn/--tint-dusk — nothing was checked')
        return 1
    return 0 if npass == len(RES) else 1


if __name__ == '__main__':
    sys.exit(main())
