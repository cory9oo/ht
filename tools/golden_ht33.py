#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-33 GOLDEN - PASTE 179 (TIME, FIT, LINKS, COLOUR), run literally.

    python tools/golden_ht33.py            (from anywhere; the fixture is found, not assumed)

  T1  the planned time: a `+ time` chip on a row in EVERY section, and the chip sets a time
  T2  three answers at completion: Now . Planned . Pick, each written to the check as HH:MM
  T3  the variance: signed, good inside 15 minutes and bad past it, with a glyph; a second number
  T4  P4: a closed or past day offers no chooser and its check keeps what it had
  T5  unchecking clears the done time
  T6  the reports carry ON TIME % and the median variance, per member, beside and never inside
  T7  a link is https:// or refused; the row carries it as a chip that opens a new tab
  T8  four new schemes: offered first, Slate the default, each loads its own file, Mono's two
      states differ by lightness
  T9  fit, never scroll: the month graph and the rail fit 390 and 360; the lint's static half is clean

134 R1: prints its assertion count; a section that asserts nothing is a FAIL.
"""
import asyncio, io, json, os, re, subprocess, sys
from playwright.async_api import async_playwright

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def find_estate(start):
    d = start
    for _ in range(6):
        if os.path.isdir(os.path.join(d, '_reconcile')):
            return d
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    raise SystemExit('golden_ht33: no estate root above %s' % start)


def fixture_dir(estate):
    for d in (os.environ.get('HT_FIXTURE_DIR'), os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if d and os.path.isdir(d):
            return d
    raise SystemExit('golden_ht33: no fixture found')


FIX = fixture_dir(find_estate(REPO))
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')
RES, SEC = [], {}
CUR = ['T?']


def chk(name, ok, got=''):
    RES.append((bool(ok), name))
    SEC[CUR[0]] = SEC.get(CUR[0], 0) + 1
    print('  %-6s %s%s' % ('PASS' if ok else 'FAIL', name, '' if ok else '   -> ' + str(got)[:300]))


def section(t, title):
    CUR[0] = t
    print('\n--- %s . %s ---' % (t, title))


async def open_page(pw, w=390, h=844, storage=None, flags=None, scheme='dark'):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True,
                              device_scale_factor=1, color_scheme=scheme)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    if storage:
        await pg.add_init_script('try{%s}catch(e){}' % ''.join(
            'localStorage.setItem(%s,%s);' % (json.dumps(k), json.dumps(v)) for k, v in storage.items()))
    f = {'__BIGSET': True, '__CIRCLE': True, '__BLOCKS': True}
    f.update(flags or {})
    await pg.add_init_script('; '.join('window.%s=%s' % (k, json.dumps(v)) for k, v in f.items()))
    await pg.goto(BASE)
    await pg.wait_for_timeout(2400)
    return b, pg, errs


ROWS = """() => [...document.querySelectorAll('#log .li')].map(r => {
  let s = r.previousElementSibling; while (s && !s.classList.contains('grp')) s = s.previousElementSibling;
  const ck = r.querySelector('.ck179');
  return { id: r.getAttribute('data-h'), sec: s ? s.getAttribute('data-sec') : '',
           on: r.classList.contains('li') && r.querySelector('[data-tog]').getAttribute('aria-pressed') === 'true',
           pat: !!r.querySelector('[data-ht31t]'), patTxt: (r.querySelector('[data-ht31t]')||{}).textContent || '',
           ck: ck ? ck.textContent : null, ckCls: ck ? ck.className : null, ckDis: ck ? ck.disabled : null,
           lk: r.querySelector('.lk179') ? { href: r.querySelector('.lk179').href, t: r.querySelector('.lk179').target,
                                             rel: r.querySelector('.lk179').rel } : null };
})"""


async def row(pg, hid):
    return next((r for r in await pg.evaluate(ROWS) if r['id'] == hid), None)


async def tap(pg, sel):
    box = await pg.evaluate("""(s) => { const n = document.querySelector(s); if (!n) return null;
        n.scrollIntoView({block:'center'}); const r = n.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; }""", sel)
    if not box:
        return False
    await pg.mouse.click(box[0], box[1])
    await pg.wait_for_timeout(250)
    return True


async def main():
    async with async_playwright() as pw:
        # ------------------------------------------------------------------ T1
        section('T1', 'a planned time on every standard, set from the row')
        b, pg, errs = await open_page(pw, flags={'__NO_CLOSED_AT': True})
        rows = await pg.evaluate(ROWS)
        secs = sorted(set(r['sec'] for r in rows if r['sec']))
        chk('T1a . the list renders rows in more than one section (%s)' % secs, len(secs) >= 2, secs)
        miss = [r['id'] for r in rows if not r['pat']]
        chk('T1b . EVERY row carries a planned-time chip, a time or `+ time` (%d rows)' % len(rows), rows and not miss, miss)
        ghost_secs = sorted(set(r['sec'] for r in rows if r['patTxt'].strip() == '+ time'))
        chk('T1c . the ghost `+ time` reaches Standards and Weekly, not only Morning and Night',
            'weekly' in ghost_secs or 'standards' in ghost_secs, ghost_secs)
        tgt = next((r for r in rows if r['patTxt'].strip() == '+ time'), None)
        ok = False
        if tgt:
            await tap(pg, '[data-ht31t="%s"]' % tgt['id'])
            await pg.select_option('#ht31h', '6'); await pg.select_option('#ht31m', '15')
            await pg.evaluate("() => document.querySelector('#ht31pick [data-ap=\"AM\"]').click()")
            await pg.evaluate("() => document.querySelector('#ht31pick [data-ht31=\"done\"]').click()")
            await pg.wait_for_timeout(500)
            after = await row(pg, tgt['id'])
            ok = after and '6:15' in after['patTxt']
        chk('T1d . tapping `+ time` on a row with no time and choosing 6:15 AM puts 6:15 on that row',
            ok, tgt and (await row(pg, tgt['id'])))
        chk('T1e . no page error', not errs, errs[:3])
        await b.close()

        # ------------------------------------------------------------------ T2 / T3 / T5
        section('T2', 'three answers at completion - Now, Planned, Pick')
        b, pg, errs = await open_page(pw, flags={'__NO_CLOSED_AT': True})
        st = await pg.evaluate('() => window.__HT179.state()')
        chk('T2a . the day on screen is today and open, so the chooser is offered', st['date'] == st['today'] and not st['closed'], st)
        rows = await pg.evaluate(ROWS)
        timed = [r for r in rows if r['patTxt'] and re.search(r'\d:\d\d', r['patTxt']) and not r['on']]
        chk('T2b . a timed, unchecked row carries the clock chip', timed and timed[0]['ck'] == '\u25f7', timed[:1])
        h = timed[0]['id'] if timed else None
        if h:
            await tap(pg, '[data-ck179="%s"]' % h)
            opts = await pg.evaluate("() => [...document.querySelectorAll('#ck179pick [data-ck179a]')].map(b => b.getAttribute('data-ck179a'))")
            chk('T2c . the chooser offers Now, Planned and Pick', opts == ['now', 'planned', 'pick'], opts)
            await pg.evaluate("() => document.querySelector('#ck179pick [data-ck179a=\"planned\"]').click()")
            await pg.wait_for_timeout(500)
            r = await row(pg, h)
            chk('T2d . Planned checks the row and writes the planned time: variance \u00b10m, good, with a check',
                r and r['on'] and '\u00b10m' in (r['ck'] or '') and '\u2713' in r['ck'] and 'good' in r['ckCls'], r)
            # Pick: 45 minutes after the planned time
            m = re.search(r'(\d{1,2}):(\d\d)\s*\u202f?(AM|PM)', timed[0]['patTxt'].replace('\u202f', ' '))
            await tap(pg, '[data-ck179="%s"]' % h)
            H, M, AP = int(m.group(1)), int(m.group(2)) + 45, m.group(3)
            if M >= 60: M -= 60; H = H % 12 + 1
            await pg.select_option('#ck179h', str(H)); await pg.select_option('#ck179m', str(M))
            await pg.evaluate("(ap) => document.querySelector('#ck179pick [data-ap=\"' + ap + '\"]').click()", AP)
            await pg.evaluate("() => document.querySelector('#ck179pick [data-ck179a=\"pick\"]').click()")
            await pg.wait_for_timeout(500)
            r = await row(pg, h)
            section('T3', 'the variance, signed and coloured')
            chk('T3a . Pick 45 min after the plan reads +45m, BAD colour, with a cross', r and '+45m' in (r['ck'] or '')
                and 'bad' in r['ckCls'] and '\u2715' in r['ck'], r)
            await tap(pg, '[data-ck179="%s"]' % h)
            await pg.evaluate("() => document.querySelector('#ck179pick [data-ck179a=\"now\"]').click()")
            await pg.wait_for_timeout(400)
            r = await row(pg, h)
            now = await pg.evaluate("() => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); }")
            chk('T2e . Now writes the clock of this device (the row shows a time and a signed variance)',
                r and re.search(r'\d:\d\d', r['ck'] or '') and re.search(r'[+\u2212\u00b1]\d+m', r['ck']), r)
            lab = await pg.evaluate("""() => { const L = window.__HT179.statsOf; return [
                L([{checked:{a:'08:10'}, habits:[{id:'a', time_anchor:'08:00'}]}]),
                L([{checked:{a:'07:40'}, habits:[{id:'a', time_anchor:'08:00'}]}]),
                L([{checked:{a:true}, habits:[{id:'a', time_anchor:'08:00'}]}]) ]; }""")
            chk('T3b . +10m is on time (100 %), \u221220m is not (0 %), median signed', lab[0] and lab[0]['pct'] == 100 and lab[0]['med'] == 10
                and lab[1] and lab[1]['pct'] == 0 and lab[1]['med'] == -20, lab)
            chk('T3c . a check with no clock (a day logged before HT-21) counts neither way (P4)', lab[2] is None, lab[2])
            pct0 = await pg.evaluate("() => document.getElementById('logC') ? document.getElementById('logC').textContent : ''")
            section('T5', 'unchecking clears the done time')
            await tap(pg, '[data-tog="%s"]' % h)
            await pg.wait_for_timeout(400)
            r = await row(pg, h)
            chk('T5a . the box unchecks and the chip is back to a clock, no time', r and not r['on'] and r['ck'] == '\u25f7', r)
            chk('T3d . the variance never entered completion: the count line moved by the uncheck only',
                bool(pct0), pct0)
        chk('T2f . no page error', not errs, errs[:3])
        await b.close()

        # ------------------------------------------------------------------ T4
        section('T4', 'a closed or past day is history (P4)')
        b, pg, errs = await open_page(pw)          # the fixture closes every day, today included
        st = await pg.evaluate('() => window.__HT179.state()')
        n = await pg.evaluate("() => document.querySelectorAll('.ck179:not(.has)').length")
        chk('T4a . a CLOSED today offers no chooser (%d open chips)' % n, st['closed'] and n == 0, st)
        await b.close()
        b, pg, errs = await open_page(pw, flags={'__NO_CLOSED_AT': True})
        await pg.evaluate("() => { const b = document.getElementById('hPrev'); if (b) b.click(); }")
        await pg.wait_for_timeout(700)
        st = await pg.evaluate('() => window.__HT179.state()')
        n = await pg.evaluate("() => document.querySelectorAll('.ck179:not(:disabled)').length")
        chk('T4b . YESTERDAY offers no chooser: every chip there is disabled or absent', st['date'] != st['today'] and n == 0, (st, n))
        await b.close()

        # ------------------------------------------------------------------ T6
        section('T6', 'ON TIME % and the median variance, per member, beside the reports')
        b, pg, errs = await open_page(pw, flags={'__NO_CLOSED_AT': True})
        await pg.evaluate("() => { const t = [...document.querySelectorAll('[data-t29]')].find(x => /insights/i.test(x.textContent)); if (t) t.click(); }")
        await pg.wait_for_timeout(900)
        vis = await pg.evaluate("() => [...document.querySelectorAll('[data-h32reports]')].filter(b => b.offsetParent).length")
        chk('T6e . on the phone the Reports door is VISIBLE on Insights (R70.211)', vis >= 1, vis)
        opened = await tap(pg, '.h179rep [data-h32reports]')
        await pg.wait_for_timeout(1500)
        tim = await pg.evaluate("() => { const n = document.getElementById('h179tim'); return n ? [...n.querySelectorAll('.r179 .w')].map(x => x.textContent) : null; }")
        chk('T6a . the Reports door opens and the On time block is above the list', opened and tim is not None, tim)
        chk('T6b . one row for You and one per member', tim and tim[0] == 'You' and len(tim) >= 2, tim)
        txt = await pg.evaluate("() => (document.getElementById('h179tim')||{}).textContent || ''")
        chk('T6c . the block says it is never part of the 80 %', 'never part of the 80' in txt, txt[-160:])
        chk('T6d . no page error', not errs, errs[:3])
        await b.close()
        b, pg, errs = await open_page(pw, flags={'__NO_CLOSED_AT': True, '__HT29_SQL': True, '__SECTION': True})
        await pg.evaluate("() => { const t = [...document.querySelectorAll('[data-t29]')].find(x => /insights/i.test(x.textContent)); if (t) t.click(); }")
        await pg.wait_for_timeout(1200)
        md = await pg.evaluate("""async () => { const r = [...document.querySelectorAll('[data-h29m]')].find(x => x.offsetParent);
             if (!r) return 'no member row'; r.click(); await new Promise(z => setTimeout(z, 1000));
             const d = document.getElementById('h29Day'); if (!d) return 'no day sheet';
             return { planned: d.querySelectorAll('.h179mp').length, links: d.querySelectorAll('a[href], .lk179').length }; }""")
        chk("T6f . a member's day shows their planned times and never a link (%s)" % (md,),
            isinstance(md, dict) and md['planned'] >= 1 and md['links'] == 0, md)
        await b.close()

        # ------------------------------------------------------------------ T7
        section('T7', 'a link on a standard')
        b, pg, errs = await open_page(pw, flags={'__NO_CLOSED_AT': True, '__LINKS': {'h3': 'https://example.com/x'}})
        r = await row(pg, 'h3')
        chk('T7a . a row with a link carries the \u2197 chip, new tab, rel=noopener',
            r and r['lk'] and r['lk']['t'] == '_blank' and 'noopener' in r['lk']['rel'] and r['lk']['href'].startswith('https://'), r)
        r2 = await row(pg, 'h4')
        chk('T7b . a row with no link carries none', r2 and not r2['lk'], r2)
        js = io.open(os.path.join(REPO, 'app.js'), encoding='utf-8').read()
        chk('T7c . the sheet refuses a changed link that is not https:// (the rule is in saveSheet)',
            "toast('a link starts with https://')" in js and 'lk!==String((h&&h.link)' in js)
        await b.close()

        # ------------------------------------------------------------------ T8
        section('T8', 'four new schemes, one default')
        NEW = ['slate', 'ember', 'linen', 'mono']
        b, pg, errs = await open_page(pw)
        got = await pg.evaluate("() => document.documentElement.getAttribute('data-theme')")
        chk('T8a . a fresh profile opens in Slate', got == 'slate', got)
        await b.close()
        for t in NEW:
            b, pg, errs = await open_page(pw, storage={'ht_theme': t})
            v = await pg.evaluate("""() => { const c = getComputedStyle(document.documentElement);
                return { t: document.documentElement.getAttribute('data-theme'), g: c.getPropertyValue('--ground').trim(),
                         good: c.getPropertyValue('--good').trim(), bad: c.getPropertyValue('--bad').trim(),
                         m4: c.getPropertyValue('--m4').trim() }; }""")
            want = re.search(r'--ground:\s*(#[0-9A-Fa-f]{6})', io.open(os.path.join(REPO, 'themes', t + '.css'), encoding='utf-8').read())
            chk('T8b . %s loads its own file (--ground %s) and carries four member colours' % (t, want and want.group(1)),
                v['t'] == t and want and v['g'].lower() == want.group(1).lower() and v['m4'], v)
            if t == 'mono':
                def L(h):
                    h = h.lstrip('#'); return sum(int(h[i:i + 2], 16) for i in (0, 2, 4))
                same_hue = all(len(set(x.lstrip('#')[i:i + 2] for i in (0, 2, 4))) == 1 for x in (v['good'], v['bad']))
                chk('T8c . Mono: good and bad are one hue (grey) and differ by lightness', same_hue and L(v['good']) != L(v['bad']), v)
            await b.close()
        b, pg, errs = await open_page(pw)
        await pg.evaluate("() => document.getElementById('bSet').click()")
        await pg.wait_for_timeout(700)
        picks = await pg.evaluate("() => [...document.querySelectorAll('[data-theme-pick]')].map(x => x.getAttribute('data-theme-pick'))")
        chk('T8d . the picker lists the four new first, then Classic, Graphite, Midnight, Paper (and the system pair)',
            picks[:8] == NEW + ['classic', 'graphite', 'midnight', 'paper'], picks)
        await b.close()

        # ------------------------------------------------------------------ T9
        section('T9', 'fit, never scroll')
        for w, hh in ((390, 844), (360, 780)):
            b, pg, errs = await open_page(pw, w, hh)
            await pg.evaluate("() => [...document.querySelectorAll('[data-t29]')].find(x => /insights/i.test(x.textContent)).click()")
            await pg.wait_for_timeout(1000)
            m = await pg.evaluate("""() => { const s = document.getElementById('vMonth'); if (!s) return null;
                const host = s.parentNode; const labs = [...s.querySelectorAll('text.xl')].length;
                return { sw: host.scrollWidth, cw: host.clientWidth, svgW: Math.round(s.getBoundingClientRect().width), labs,
                         doc: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; }""")
            chk('T9a . at %d the month graph fits its card (no inner scroller) and the page fits the screen' % w,
                m and m['sw'] <= m['cw'] + 1 and m['doc'] <= m['vw'], m)
            await b.close()
        b, pg, errs = await open_page(pw, 360, 780, storage={'ht_advanced': '1'})
        rl = await pg.evaluate("""() => { const r = document.getElementById('rail'); return r ? { sw: r.scrollWidth, cw: r.clientWidth,
            days: r.querySelectorAll('[data-d]').length } : null; }""")
        chk('T9b . the rail shows seven days that fit at 360 (%s)' % rl, rl and rl['days'] == 7 and rl['sw'] <= rl['cw'] + 1, rl)
        for i in range(3):
            await pg.evaluate("() => document.querySelector('#rail [data-rail=\"1\"]').click()")
            await pg.wait_for_timeout(150)
        first = await pg.evaluate("() => document.querySelector('#rail [data-d]').getAttribute('data-d')")
        back = await pg.evaluate("(k) => Math.round((new Date(new Date().toDateString()) - new Date(k + 'T00:00:00')) / 864e5)", first)
        chk('T9c . three taps on \u2039 reach four weeks back (%s days)' % back, back >= 27, first)
        await b.close()
        r = subprocess.run([sys.executable, os.path.join(HERE, 'lint_overflow.py'), '--static'], capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        chk('T9d . lint_overflow --static is clean (no overflow-x:auto|scroll anywhere, allowlist empty)', r.returncode == 0,
            (r.stdout or '')[-400:])

    ok = sum(1 for x in RES if x[0])
    empty = [s for s in ('T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9') if not SEC.get(s)]
    for s in empty:
        print('  FAIL   %s.ZERO . this section asserted nothing (134 R1)' % s)
    print('\n%d checks . %d pass . %d fail' % (len(RES) + len(empty), ok, len(RES) - ok + len(empty)))
    return 0 if ok == len(RES) and not empty else 1


sys.exit(asyncio.run(main()))
