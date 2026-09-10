#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-22 S5 - EVERY RULING FROM PASTE 76 AND PASTE 79, WITH ITS COMMIT OR ITS REASON.

    python3 _reconcile/ht_batch22/s5_checklist.py

The wire asks for a checklist table, one row per ruling, each SHIPPED with its commit or OPEN
with the reason, and "no unexplained OPEN".  A table typed by hand is a claim; this one is
DERIVED, so a ruling that quietly stops holding turns the row red on the next run:

  * the COMMIT column is found by grepping `standard`'s real git log, not remembered
  * the EVIDENCE column runs the assertion that ruling is graded by - a golden section, a lint,
    a grep over the shipped bundle - and reports what it actually returned
  * a ruling nothing can check mechanically says so in words, and that is an explained OPEN

PRIVACY (CC_STANDING section 3): this reads source and git, never journal text.
"""

# ---- HT-24 C7 · MOVED INTO THE REPO IT TESTS, AND IT RESOLVES ITS OWN PATHS ------------------
# This file used to resolve `<estate>/standard` - the MAIN checkout - so run from a worktree under
# CC_STANDING §4A it tested main while the branch it was meant to test sat untouched, and passed.
# `_REPO` is this file's own repo (`tools/..`); `_ESTATE` is found by walking up for `_reconcile`.
# Run it from a worktree and it tests that worktree; run it from main and it tests main.
import os as _os, sys as _sys
_REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
def _find_estate(_d):
    for _ in range(6):
        if _os.path.isdir(_os.path.join(_d, '_reconcile')): return _d
        _n = _os.path.dirname(_d)
        if _n == _d: break
        _d = _n
    raise SystemExit('no estate root above %s' % _REPO)
_ESTATE = _find_estate(_REPO)
_os.chdir(_ESTATE)                      # every relative path below is estate-relative, as before
_sys.path.insert(0, _os.path.join(_ESTATE, '_reconcile', 'ht_batch22'))
# ----------------------------------------------------------------------------------------------
import io, os, re, subprocess, sys

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = _ESTATE
APP = _REPO      # HT-24 C7: the repo this file lives in, worktree or main
MID = u'·'


def sh(cmd, cwd=None):
    p = subprocess.run(cmd, cwd=cwd or ROOT, capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    return p.returncode, (p.stdout or '') + (p.stderr or '')


def src(p):
    return io.open(p, encoding='utf-8', errors='replace').read()


def commit_for(pattern):
    """The commit that shipped a section, from the log itself."""
    rc, out = sh(['git', '--no-optional-locks', 'log', '--oneline', '-40'], cwd=APP)
    for line in out.split('\n'):
        if re.search(pattern, line, re.I):
            return line.split(' ')[0]
    return None


def golden(script, only=None):
    # HT-24 C7: the other goldens still live in `_reconcile\ht_batch*` (they name the vault,
    # so they may not enter a PUBLIC repo). Resolve them from the estate, not from `tools/..`.
    cmd = [sys.executable, os.path.join(_ESTATE, '_reconcile', *script.split('/'))]
    if only:
        cmd += ['--only', only]
    rc, out = sh(cmd)
    m = re.search(r'(\d+)/(\d+) PASS', out)
    return (rc == 0), (m.group(0) if m else out.strip()[-70:])


APPJS = src(os.path.join(APP, 'app.js'))
APPCSS = src(os.path.join(APP, 'app.css'))
INDEX = src(os.path.join(APP, 'index.html'))


def r280():
    return 'WITHDRAWN', '-', 'withdrawn by the lane before HT-21; nothing to ship or to explain'


def r281():
    return 'WITHDRAWN', '-', 'withdrawn by the lane before HT-21; nothing to ship or to explain'


def r282():
    ok = os.path.exists(os.path.join(APP, 'tokens.css'))
    rc, out = sh([sys.executable, os.path.join(HERE, 'lint_tokens.py')])
    n = re.search(r'LINT: (\d+) offence', out)
    return ('SHIPPED' if (ok and rc == 0) else 'OPEN'), commit_for(r'HT-22 S2'), \
        'tokens.css exists=%s %s lint %s' % (ok, MID, n.group(0) if n else out.strip()[-60:])


def r283():
    seeded = [n for n in ('Andrew', 'Dale', 'Justin', 'TEST DATA')
              if n in APPJS or n in APPCSS or n in INDEX]
    # HT-24 C7: privacy_check lives in the estate, and the repo it checks is THIS checkout.
    rc, out = sh([sys.executable,
                  os.path.join(_ESTATE, '_reconcile', 'ht_batch5', 'privacy_check.py'),
                  '--repo', APP])
    return ('SHIPPED' if not seeded and 'PASS' in out else 'OPEN'), commit_for(r'HT-21 S7|real circle'), \
        'seeded names in the shipped bundle: %d %s privacy_check %s' % (
            len(seeded), MID, 'PASS' if 'PASS' in out else 'FAIL')


def r284():
    ok, n = golden('ht_batch22/golden_ht22.py', 'S1')
    return ('SHIPPED' if ok else 'OPEN'), commit_for(r'HT-22 S1'), 'golden_ht22 S1 %s' % n


def r285():
    ok, n = golden('ht_batch21/golden_ht21.py', 'S2')
    # and the gate itself: the sheet must never read the name field when it fills a time
    reads_name = bool(re.search(r"eFromName[\s\S]{0,400}?getElementById\('eName'\)", APPJS))
    return ('SHIPPED' if ok and not reads_name else 'OPEN'), commit_for(r'HT-21 S2|time, done right|planned'), \
        'golden_ht21 S2 (fixture name-diff) %s %s suggestion reads eName: %s' % (n, MID, reads_name)


def r286():
    has_plan = 'winStartMin' in APPJS and 'onTimeOn' in APPJS
    ok, n = golden('ht_batch22/golden_ht22.py', 'S1')
    return ('SHIPPED' if has_plan and ok else 'OPEN'), commit_for(r'HT-22 S1'), \
        'plan-vs-actual through one window helper=%s %s golden %s' % (has_plan, MID, n)


def r287():
    # the chain glyph is gone from the row; the anchor is not
    glyph = bool(re.search(r'class="nm lnk"', APPJS))
    icon = bool(re.search(r'⛓|&#128279;|\U0001f517', APPJS))
    ok, n = golden('ht_batch21/golden_ht21.py', 'S3')
    return ('SHIPPED' if glyph and not icon and ok else 'OPEN'), commit_for(r'HT-21 S3|links'), \
        'anchor kept=%s %s icon present=%s %s golden_ht21 S3 %s' % (glyph, MID, icon, MID, n)


def r288():
    ok, n = golden('ht_batch21/golden_ht21.py', 'S4')
    return ('SHIPPED' if ok else 'OPEN'), commit_for(r'HT-21 S4|detail'), \
        'golden_ht21 S4 (surface is EXACT, amended for HT-22 S1) %s' % n


def strip_comments(js):
    """Source with /* */ and // comments removed.

    A phrase the code EXPLAINS is not a phrase the code SAYS. The first version of this checker
    read the comment that says the sheet never says "saves later" and duly reported that the
    sheet says it - an OPEN row invented by its own checker, which is exactly the class of defect
    HT-21's onboarding audit caught in itself on its first run.
    """
    out, i, n = [], 0, len(js)
    while i < n:
        c = js[i]
        if c == '/' and i + 1 < n and js[i + 1] == '*':
            j = js.find('*/', i + 2)
            i = n if j < 0 else j + 2
        elif c == '/' and i + 1 < n and js[i + 1] == '/':
            j = js.find('\n', i)
            i = n if j < 0 else j
        elif c in '"\'':
            out.append(c)
            i += 1
            while i < n and js[i] != c:
                if js[i] == '\\':
                    out.append(js[i])
                    i += 1
                if i < n:
                    out.append(js[i])
                    i += 1
            if i < n:
                out.append(js[i])
                i += 1
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def r289():
    ok, n = golden('ht_batch21/golden_ht21.py', 'S5')
    never_later = 'saves later' not in strip_comments(APPJS)
    return ('SHIPPED' if ok and never_later else 'OPEN'), commit_for(r'HT-21 S5|sheet'), \
        'golden_ht21 S5 %s %s the phrase "saves later" in CODE (comments stripped): %s' % (
            n, MID, 'no' if never_later else 'YES')


def r290():
    p = os.path.join(ROOT, '_reconcile', 'ht_stage', 'ONBOARDING_AUDIT.md')
    if not os.path.exists(p):
        p = os.path.join(ROOT, '_reconcile', 'ht_batch21', 'ONBOARDING_AUDIT.md')
    ok = os.path.exists(p)
    body = src(p) if ok else ''
    m = re.search(r'(\d+)\s+checks', body)
    return ('SHIPPED' if ok else 'OPEN'), commit_for(r'HT-21 S9|audit|onboarding'), \
        ('%s exists %s %s' % (os.path.basename(p), MID, m.group(0) if m else 'audit written')
         if ok else 'ONBOARDING_AUDIT.md not found on disk')


RULINGS = [
    ('R70.280', 'withdrawn', r280),
    ('R70.281', 'withdrawn', r281),
    ('R70.282', 'the palette', r282),
    ('R70.283', 'the real circle', r283),
    ('R70.284', 'the three inputs', r284),
    ('R70.285', 'Cory owns his names and groups', r285),
    ('R70.286', 'time: plan vs actual', r286),
    ('R70.287', 'links without noise', r287),
    ('R70.288', 'DETAIL decluttered', r288),
    ('R70.289', 'the sheet trimmed', r289),
    ('R70.290', 'the onboarding audit', r290),
]


def main():
    rows = []
    print('checking %d rulings from PASTE 76 and PASTE 79 ...\n' % len(RULINGS))
    for rid, name, fn in RULINGS:
        try:
            verdict, commit, why = fn()
        except Exception as e:
            verdict, commit, why = 'OPEN', None, 'checker raised: %s' % e
        rows.append((rid, name, verdict, commit or '-', why))
        print('  %-9s %-32s %-9s %-9s %s' % (rid, name, verdict, commit or '-', why))

    out = ['| ruling | what it says | verdict | commit | evidence |', '|---|---|---|---|---|']
    for rid, name, verdict, commit, why in rows:
        v = '**%s**' % verdict
        out.append('| %s | %s | %s | `%s` | %s |' % (rid, name, v, commit, why))
    io.open(os.path.join(HERE, 'S5_CHECKLIST.md'), 'w', encoding='utf-8', newline='\n').write(
        '# HT-22 S5 - every ruling from PASTE 76 and PASTE 79\n\n'
        '*Generated by `s5_checklist.py`. The commit column is grepped from `standard`\'s git log\n'
        'and the evidence column is the assertion re-run, so this table cannot drift from the code\n'
        'the way a typed one can.*\n\n' + '\n'.join(out) + '\n')

    opens = [r for r in rows if r[2] == 'OPEN']
    print('\nS5: %d SHIPPED %s %d WITHDRAWN %s %d OPEN'
          % (sum(1 for r in rows if r[2] == 'SHIPPED'), MID,
             sum(1 for r in rows if r[2] == 'WITHDRAWN'), MID, len(opens)))
    for r in opens:
        print('  OPEN %s - %s' % (r[0], r[4]))
    return 1 if opens else 0


if __name__ == '__main__':
    sys.exit(main())
