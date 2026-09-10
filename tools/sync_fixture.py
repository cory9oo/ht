#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REGENERATE THE HEADLESS FIXTURE FROM THIS CHECKOUT.  HT-23 S5c.

    python3 tools/sync_fixture.py            (from anywhere; paths are resolved from THIS file)
    python3 tools/sync_fixture.py --check    (verify only, exit 1 on drift)

MOVED INTO THE REPO BY HT-23 S5c, AND IT RESOLVES ITS OWN PATHS RATHER THAN THE ESTATE'S.
The HT-22 copy lived in `_reconcile\\ht_batch22\\` and computed `SRC` as "the estate's
`standard/`" — the MAIN checkout, always.  Under CC_STANDING §4A the wire runs in a WORKTREE, so
that copy would have synced the fixture from main and then tested main while the branch it was
supposed to be testing sat untouched: a suite that is green about the wrong tree.

So: **SRC is this file's own repo** (`tools/..`), and DST is `<estate>/ht3`, where the estate is
found by walking up for the directory that holds `_reconcile`.  Run it from a worktree and it syncs
that worktree; run it from main and it syncs main.  The same file, correct in both.

Three transformations separate the fixture from the app, all mechanical:
    1. the Google Fonts preconnects and stylesheet go        (the harness is offline)
    2. the Supabase CDN <script> becomes ./mock.js           (the supported seam, app.js:11)
    3. every other byte is copied verbatim
Anything that is NOT one of those three is drift, and --check names it.
"""
import hashlib, io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)                       # the repo this file is in - worktree or main


def find_estate(start):
    """Walk up for the directory that holds `_reconcile`. That is the estate root, and `ht3`
    (the fixture) is beside it. Walking beats hard-coding: the worktree sits two levels down
    (`_wt\\<repo>--<wire>`) and main sits one, and this file must work from both."""
    d = start
    for _ in range(6):
        if os.path.isdir(os.path.join(d, '_reconcile')):
            return d
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    raise SystemExit('sync_fixture: no estate root above %s (looked for _reconcile/)' % start)


DST = os.path.join(find_estate(SRC), 'ht3')
COPY = ['app.js', 'app.css', 'tokens.css', 'manifest.webmanifest']

FONT_LINE = re.compile(
    r'^<link rel="(?:preconnect|stylesheet)" href="https://fonts\.(?:googleapis|gstatic)\.com.*$',
    re.M)
CDN_LINE = re.compile(
    r'^<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@2/[^"]*"></script>$', re.M)
FONT_SUB = '<!-- webfont removed: the harness is offline -->'
CDN_SUB = ('<!-- cdn supabase removed: the harness is offline -->\n'
           '<script src="./mock.js"></script>')


def read(p):
    return io.open(p, encoding='utf-8').read()


def write(p, s):
    io.open(p, 'w', encoding='utf-8', newline='').write(s)


def render_index():
    s = read(os.path.join(SRC, 'index.html'))
    s, nf = FONT_LINE.subn(FONT_SUB, s)
    s, nc = CDN_LINE.subn(CDN_SUB, s)
    if nf != 3:
        raise SystemExit('sync_fixture: expected 3 webfont links, found %d' % nf)
    if nc != 1:
        raise SystemExit('sync_fixture: expected 1 supabase CDN script, found %d' % nc)
    return s


def sha(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()[:12]


def main():
    check = '--check' in sys.argv
    drift = []
    for name in COPY:
        a, b = os.path.join(SRC, name), os.path.join(DST, name)
        want = read(a)
        have = read(b) if os.path.exists(b) else None
        if want != have:
            drift.append(name)
            if not check:
                write(b, want)
    want = render_index()
    b = os.path.join(DST, 'index.html')
    have = read(b) if os.path.exists(b) else None
    if want != have:
        drift.append('index.html')
        if not check:
            write(b, want)

    if not os.path.exists(os.path.join(DST, 'mock.js')):
        raise SystemExit('sync_fixture: %s/mock.js is missing - the fixture has no seam' % DST)

    print('  src %s' % SRC)
    print('  dst %s' % DST)
    if check:
        if drift:
            print('DRIFT: ' + ' '.join(drift))
            return 1
        print('fixture in sync (%d files + index.html)' % len(COPY))
        return 0
    print('synced: %s' % (' '.join(drift) if drift else '(already in sync)'))
    print('  app.js %s   app.css %s   index.html %s'
          % (sha(read(os.path.join(DST, 'app.js'))),
             sha(read(os.path.join(DST, 'app.css'))),
             sha(read(os.path.join(DST, 'index.html')))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
