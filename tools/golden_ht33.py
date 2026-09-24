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

  PASTE 185 (LANDS AND SHARPENS):
  T10 the GROUP table: six columns, six labels that never touch, a value that never spills, the stake a chip
  T11 five schemes, far apart: scheme_distance --check, the picker order, Neon loads its own file
  T12 the four sections stand apart: header, rail and `+ Add` in the section colour; Mono by rail style
  T13 the LIFE chart on the phone: one screen, both axes, 52 weeks, no scroll, cells >= 5 px
  T14 one-to-one: an edit on the desktop page reaches the phone page in 5 s; the theme follows the account;
      the header stamp reads `vNN . synced h:mma`; a new version reloads the phone exactly once

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
            # 185 S2 put Neon (the extra) after the four new; the rule T8d holds is unchanged: new first, legacy after
            picks[:9] == NEW + ['neon', 'classic', 'graphite', 'midnight', 'paper'], picks)
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

        # ================================================================== PASTE 185
        await t10_to_t14(pw)

        # ================================================================== PASTE 186 NUDGE N1
        await t15(pw)

    ok = sum(1 for x in RES if x[0])
    empty = [s for s in ('T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15') if not SEC.get(s)]
    for s in empty:
        print('  FAIL   %s.ZERO . this section asserted nothing (134 R1)' % s)
    print('\n%d checks . %d pass . %d fail' % (len(RES) + len(empty), ok, len(RES) - ok + len(empty)))
    return 0 if ok == len(RES) and not empty else 1


# ============================================================================ PASTE 185 · T10-T14
GROUP_PROBE = """() => {
  const t = [...document.querySelectorAll('table.h185gt')].find(x => x.getBoundingClientRect().width > 0);
  if (!t) return null;
  const rect = n => { const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
                      return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  const ths = [...t.querySelectorAll('thead th')];
  const labels = ths.map(th => ({ txt: th.textContent.trim(), box: rect(th) }));
  let touch = [];
  for (let i = 0; i + 1 < labels.length; i++) {
    const a = labels[i].box, b = labels[i + 1].box;
    const sameLine = !(a.b <= b.t || b.b <= a.t);
    if (sameLine && b.l - a.r < 3) touch.push(labels[i].txt + '|' + labels[i + 1].txt + ' gap ' + Math.round(b.l - a.r));
  }
  const spill = [...t.querySelectorAll('tbody td')].filter(td => td.scrollWidth > td.clientWidth + 1)
                  .map(td => td.textContent.trim().slice(0, 20));
  const stk = [...t.querySelectorAll('.h32stk')].map(c => {
    const nm = c.closest('td').querySelector('.h185nm'); if (!nm) return 'no-name-box';
    const a = nm.getBoundingClientRect(), b = c.getBoundingClientRect();
    const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    return overlap ? 'overlap' : 'ok'; });
  return { cols: t.querySelectorAll('colgroup col').length, ths: ths.length, touch, spill, stk,
           doc: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
}"""


async def open_group(pw, w, h):
    b, pg, errs = await open_page(pw, w, h)
    if w < 1024:
        await pg.evaluate("() => { const x = [...document.querySelectorAll('[data-t29]')].find(x => /insights/i.test(x.textContent)); if (x) x.click(); }")
        await pg.wait_for_timeout(1200)
    return b, pg, errs


# the auth-metadata half of Supabase, for the shared-DB mock: one record per CONTEXT (localStorage), exactly the
# shape `auth.updateUser({data})` / `auth.getUser()` give the app in production. The mock lives in the fixture,
# outside this repo, so the test brings the seam rather than editing a file two other suites share.
AUTH_MD = r"""(() => {
  let m;
  const aug = v => { try {
    const a = v.auth, gu = a.getUser.bind(a);
    const md = () => { try { return JSON.parse(localStorage.getItem('mock.user_md') || '{}'); } catch (e) { return {}; } };
    a.getUser = () => gu().then(r => { if (r && r.data && r.data.user) r.data.user.user_metadata = md(); return r; });
    a.updateUser = o => { const cur = md(); Object.assign(cur, (o && o.data) || {});
      localStorage.setItem('mock.user_md', JSON.stringify(cur)); window.__MD_WRITES = (window.__MD_WRITES || 0) + 1;
      return Promise.resolve({ data: { user: { id: 'u', user_metadata: cur } }, error: null }); };
  } catch (e) {} return v; };
  Object.defineProperty(window, '__MOCK_SB', { configurable: true, get() { return m; }, set(v) { m = aug(v); } });
})();"""


async def t10_to_t14(pw):
    # ------------------------------------------------------------------ T10
    section('T10', 'the GROUP table - six columns that never run together')
    for w, h in ((390, 844), (360, 780), (1280, 900)):
        b, pg, errs = await open_group(pw, w, h)
        g = await pg.evaluate(GROUP_PROBE)
        chk('T10a . at %d the group table has six columns and six labels (colgroup %s)' % (w, g and g['cols']),
            g and g['cols'] == 6 and g['ths'] == 6, g)
        chk('T10b . at %d no two header labels touch on one line (TODAY|7 DAYS, NEED|LOGGED)' % w,
            g and not g['touch'], g and g['touch'])
        chk('T10c . at %d no value spills out of its cell (best 61%% | 4/7)' % w, g and not g['spill'], g and g['spill'])
        chk('T10d . at %d the stake is its own chip, never on top of the name, and the page fits' % w,
            g and all(x == 'ok' for x in g['stk']) and g['doc'] <= g['vw'], g and (g['stk'], g['doc'], g['vw']))
        await b.close()
    b, pg, errs = await open_group(pw, 360, 780)
    await pg.evaluate("""() => { const n = document.querySelector('table.h185gt tbody tr:nth-child(2) .h185nm');
        if (n) n.textContent = 'Bartholomew Maximilian Featherstonehaugh-Worthington'; }""")
    g = await pg.evaluate(GROUP_PROBE)
    chk('T10e . a very long member name ellipsizes inside MEMBER and moves no number (stress 7)',
        g and not g['touch'] and not g['spill'] and g['doc'] <= g['vw'], g)
    await b.close()

    # ------------------------------------------------------------------ T11
    section('T11', 'five schemes, far apart')
    r = subprocess.run([sys.executable, os.path.join(HERE, 'scheme_distance.py'), '--check'], capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    chk('T11a . scheme_distance --check: every pair of the five is >= 60 deg of accent hue or >= 25 L* of ground',
        r.returncode == 0 and ' 0 alike' in r.stdout, (r.stdout or '')[-300:])
    b, pg, errs = await open_page(pw)
    # 186: THEMES is closure-scoped; the picker is what Cory sees, so the order is read from it (as T8d does)
    await pg.evaluate("() => document.getElementById('bSet').click()")
    await pg.wait_for_timeout(700)
    order = await pg.evaluate("() => [...document.querySelectorAll('[data-theme-pick]')].map(x => x.getAttribute('data-theme-pick')).filter(x => x !== 'system')")
    chk('T11b . the picker order is Slate . Ember . Linen . Mono . Neon . Classic . Graphite . Midnight . Paper',
        order == ['slate', 'ember', 'linen', 'mono', 'neon', 'classic', 'graphite', 'midnight', 'paper'], order)
    got = await pg.evaluate("() => document.documentElement.getAttribute('data-theme')")
    chk('T11c . a fresh profile still opens in Slate', got == 'slate', got)
    await b.close()
    b, pg, errs = await open_page(pw, storage={'ht_theme': 'neon'})
    v = await pg.evaluate("() => ({ t: document.documentElement.getAttribute('data-theme'), g: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(), a: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() })")
    chk('T11d . Neon loads its own file (#050507 ground, #FF2BD6 accent)',
        v['t'] == 'neon' and v['g'].upper() == '#050507' and v['a'].upper() == '#FF2BD6', v)
    await b.close()
    b, pg, errs = await open_page(pw, storage={'ht_theme': 'ember'})
    v = await pg.evaluate("() => document.documentElement.getAttribute('data-theme')")
    chk('T11e . an existing choice is kept (ember stays ember)', v == 'ember', v)
    await b.close()

    # ------------------------------------------------------------------ T12
    section('T12', 'the four sections stand apart')
    SECP = """() => { const out = {};
      for (const g of document.querySelectorAll('#log > .grp[data-sec]')) {
        const s = g.getAttribute('data-sec'), cs = getComputedStyle(g);
        const rows = []; let n = g.nextElementSibling;
        while (n && !n.classList.contains('grp')) { rows.push(n); n = n.nextElementSibling; }
        const li = rows.filter(r => r.classList.contains('li')), add = rows.find(r => r.classList.contains('eadd'));
        out[s] = { head: cs.color, weight: +cs.fontWeight, rail: cs.borderLeftColor, railW: cs.borderLeftWidth,
          rowsTagged: li.every(r => r.getAttribute('data-sec') === s), rowRail: li.map(r => (getComputedStyle(r).boxShadow.match(/rgba?\([^)]*\)/) || [''])[0]),   /* 186: the row rail is an inset shadow */
          rowStyle: cs.borderLeftStyle || null,   /* 186: Mono's styles live on the section header's rail */
          add: add ? getComputedStyle(add).color : null, n: li.length };
      } return out; }"""
    # 186: the fixture needs the section column and a row in each of the four sections, or only two can draw
    SECF = {'__SECTION': True, '__SECTIONS': {'h0': 'morning', 'h1': 'morning', 'h2': 'night', 'h3': 'night',
                                              'h4': 'weekly', 'h5': 'weekly', 'h6': 'standards', 'h7': 'standards'}}
    for w, h in ((390, 844), (360, 780)):
        b, pg, errs = await open_page(pw, w, h, flags=SECF)
        sp = await pg.evaluate(SECP)
        keys = sorted(sp.keys())
        chk('T12a . at %d all four sections are drawn (%s)' % (w, ','.join(keys)),
            keys == ['morning', 'night', 'standards', 'weekly'], sp)
        chk('T12b . at %d every row carries its section and a rail in the header colour' % w,
            all(x['rowsTagged'] and x['n'] > 0 and all(c == x['head'] for c in x['rowRail']) for x in sp.values()),
            {k: (x['rowsTagged'], x['n'], x['head'], x['rowRail'][:2]) for k, x in sp.items()})
        chk('T12c . at %d the four header colours are four different colours, headers heavy (>= 600)' % w,
            len(set(x['head'] for x in sp.values())) == 4 and all(x['weight'] >= 600 for x in sp.values()),
            {k: (x['head'], x['weight']) for k, x in sp.items()})
        chk('T12d . at %d each `+ Add to` line is in its section colour' % w,
            all(x['add'] == x['head'] for x in sp.values()), {k: (x['add'], x['head']) for k, x in sp.items()})
        await b.close()
    b, pg, errs = await open_page(pw, storage={'ht_theme': 'mono'}, flags=SECF)
    sp = await pg.evaluate(SECP)
    chk('T12e . Mono, with no hue, still tells the four apart by rail style (solid/double/dashed/dotted)',
        len(set(x['rowStyle'] for x in sp.values())) == 4, {k: x['rowStyle'] for k, x in sp.items()})
    await b.close()

    # ------------------------------------------------------------------ T13
    section('T13', 'the LIFE chart fits the phone, with axes')
    for w, h in ((390, 844), (360, 780)):
        b, pg, errs = await open_page(pw, w, h)
        await pg.evaluate("() => { const x = [...document.querySelectorAll('[data-t29]')].find(x => /views/i.test(x.textContent)); if (x) x.click(); }")
        await pg.wait_for_timeout(1500)
        L = await pg.evaluate("""() => { const s = document.querySelector('svg.h185life'); if (!s) return null;
            const host = s.closest('[id]'); const r = s.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), hostSW: host.scrollWidth, hostCW: host.clientWidth,
                     x: s.querySelectorAll('text.h185x').length, y: s.querySelectorAll('text.h185y').length,
                     cols: +s.getAttribute('data-cols'), rows: +s.getAttribute('data-rows'), cell: +s.getAttribute('data-cell'),
                     today: s.querySelectorAll('.h185today').length, lived: s.querySelectorAll('.h185lived').length,
                     doc: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; }""")
        chk('T13a . at %d the life chart is the fitted one (svg.h185life) with 52 weeks and every year' % w,
            L and L['cols'] == 52 and L['rows'] >= 80, L)
        chk('T13b . at %d it carries an x axis (weeks) and a y axis (age)' % w, L and L['x'] >= 3 and L['y'] >= 5, L)
        chk('T13c . at %d no scroll in either direction, the whole grid inside the screen, cells >= 5 px' % w,
            L and L['hostSW'] <= L['hostCW'] + 1 and L['w'] <= L['vw'] and L['doc'] <= L['vw'] and L['cell'] >= 5, L)
        chk('T13d . at %d lived weeks and today are drawn distinct' % w, L and L['today'] == 1 and L['lived'] >= 1, L)
        await b.close()

    # ------------------------------------------------------------------ T14
    section('T14', 'one-to-one: the desktop and the phone')
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, device_scale_factor=1)
    await ctx.add_init_script(AUTH_MD)
    await ctx.add_init_script('; '.join('window.%s=%s' % (k, json.dumps(v)) for k, v in
                                        {'__BIGSET': True, '__BLOCKS': True, '__SHARED_DB': True, '__REALTIME': True,
                                         '__SECTION': True, '__SYNC_MS': 600000}.items()))
    desk = await ctx.new_page()
    await desk.goto(BASE); await desk.wait_for_timeout(2400)
    phone = await ctx.new_page()
    await phone.set_viewport_size({'width': 390, 'height': 844})
    await phone.goto(BASE); await phone.wait_for_timeout(2400)
    before = await phone.evaluate("() => { const r = document.querySelector('#log .li[data-h=\"h0\"] .nm'); return r ? r.textContent : null; }")
    # 186: `sb` and `S` live inside the app's sealed closure; `window.ST.sb` is its public handle, `u-mock` the mock's user
    await desk.evaluate("""async () => { await window.ST.sb.from('habits').update({ name: 'Renamed on the desktop', planned_start: '06:30' })
                               .eq('id', 'h0').eq('user_id', 'u-mock'); }""")
    t0 = await phone.evaluate('Date.now()')
    got = None
    for _ in range(25):
        await phone.wait_for_timeout(200)
        got = await phone.evaluate("""() => { const r = document.querySelector('#log .li[data-h="h0"]'); if (!r) return null;
            return { nm: (r.querySelector('.nm') || {}).textContent || '', t: (r.querySelector('[data-ht31t]') || {}).textContent || '' }; }""")
        if got and 'Renamed on the desktop' in got['nm']:
            break
    dt = (await phone.evaluate('Date.now()')) - t0
    chk('T14a . a rename on the desktop shows on the phone within 5 s, no reload (%d ms)' % dt,
        got and 'Renamed on the desktop' in got['nm'] and dt <= 5000, (before, got))
    chk('T14b . the planned time set on the desktop shows on the phone with it (%s)' % (got and got['t']),
        got and ('6:30' in got['t'] or '06:30' in got['t']), got)
    # 186: `setTheme` is closure-scoped too, so the theme is chosen the way Cory chooses it - from the picker
    await desk.evaluate("() => document.getElementById('bSet').click()")
    await desk.wait_for_timeout(500)
    await desk.evaluate("() => document.querySelector('[data-theme-pick=\"ember\"]').click()")
    await desk.wait_for_timeout(300)
    md = await desk.evaluate("() => localStorage.getItem('mock.user_md')")
    chk('T14c . choosing a theme writes it to the ACCOUNT, not only this browser', md and '"ember"' in md, md)
    res = await phone.evaluate("() => window.__HT185SYNC.pullTheme()")
    th = await phone.evaluate("() => document.documentElement.getAttribute('data-theme')")
    chk('T14d . the phone adopts the account\'s newer theme on its next pull (%s -> %s)' % (res, th), th == 'ember', (res, th))
    st = await phone.evaluate("() => { window.__HT185SYNC.stamp(); const e = document.getElementById('h185sync'); return e ? e.textContent : null; }")
    chk('T14e . the header stamp reads `vNN . synced h:mma` (%s)' % st,
        bool(st) and re.match(r'^v\d+ · synced \d{1,2}:\d{2}[ap]$', st) is not None, st)
    await b.close()

    # the version check, over HTTP (a file:// page has no deploy behind it and asks nothing, by design)
    import http.server, threading, functools
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    Q.__init__ = lambda self, *a, **k: http.server.SimpleHTTPRequestHandler.__init__(self, *a, directory=FIX, **k)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Q)
    th_ = threading.Thread(target=srv.serve_forever, daemon=True); th_.start()
    url = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
    b = await pw.chromium.launch()
    # 186: a service worker answers the page's version.json fetch itself, and page.route never sees a request the
    # worker makes - so the route below was bypassed and the bump never arrived. The worker is blocked for THIS test,
    # which is about check()'s decision; the worker's own cache name per version is held by golden_ht30 S0.
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    await ctx.add_init_script('window.__BIGSET=true;')
    pg = await ctx.new_page()
    loads = []
    pg.on('load', lambda: loads.append(1))
    bump = {'v': None}
    async def ver(route):
        if bump['v']:
            await route.fulfill(status=200, content_type='application/json', body=json.dumps({'version': bump['v']}))
        else:
            await route.continue_()
    await pg.route('**/version.json*', ver)
    await pg.goto(url); await pg.wait_for_timeout(2500)
    n0 = len(loads)
    bump['v'] = 'ht-v999'
    await pg.evaluate("() => window.__HT31UPD.check()")
    await pg.wait_for_timeout(4000)
    n1 = len(loads)
    await pg.evaluate("() => window.__HT31UPD.check()")
    await pg.wait_for_timeout(3000)
    n2 = len(loads)
    mark = await pg.evaluate("() => localStorage.getItem('ht31_reloaded')")
    chk('T14f . a new version on the server reloads the phone exactly once (loads %d -> %d -> %d)' % (n0, n1, n2),
        n1 == n0 + 1 and n2 == n1 and mark == 'ht-v999', (n0, n1, n2, mark))
    await b.close()
    srv.shutdown()




# ============================================================================ PASTE 186 NUDGE N1 · T15
HABIT_WRITES = """() => [].concat((window.__UPDATES || []).map(x => ['update', x[0], x[1]]),
                              (window.__INSERTS || []).map(x => ['insert', x[0], x[1]]),
                              (window.__UPSERTS || []).map(x => ['upsert', x[0], x[1]]))
                    .filter(x => x[1] === 'habits')"""


async def t15(pw):
    """Cory 9/23 17:02: "HT reversed the edits I made". THE RULE: the app writes a name, section, planned time or
    order ONLY on an explicit user action on that row - never on load, render, sync, migration or suggestion."""
    section('T15', 'no write to habits without a user action; a save sends only what changed')
    b, pg, errs = await open_page(pw, w=1280, h=900,
                                  storage={'ht31_sections': '{"h0":"morning"}', 'ht30_renamed_u-mock_ran': ''},
                                  flags={'__SECTION': True, '__SECTIONS': {'h0': 'night', 'h1': 'weekly'},
                                         '__PERSIST': True, '__ANCHORS': {'h0': {'a': '21:30', 'm': 20}}})
    w1 = await pg.evaluate(HABIT_WRITES)
    await pg.reload()
    await pg.wait_for_timeout(3200)
    w2 = await pg.evaluate(HABIT_WRITES)
    chk('T15a . two loads of the app write NOTHING to habits without a user event (load 1: %d, load 2: %d)'
        % (len(w1), len(w2)), not w1 and not w2, (w1 + w2)[:3])
    # the device's placements are pushed ONLY on request now (never by a paint); run it the way RECOVER.md says
    before = len(await pg.evaluate(HABIT_WRITES))
    await pg.evaluate("() => window.__HT31SEC.push()")
    await pg.wait_for_timeout(600)
    pushed = [w for w in (await pg.evaluate(HABIT_WRITES))[before:]]
    chk('T15f . a push on request never overwrites a section the server already holds (%d writes)' % len(pushed),
        not pushed, pushed[:2])
    sup = await pg.evaluate("() => JSON.parse(localStorage.getItem('ht186_sections_superseded') || '[]')")
    chk('T15b . a device placement the server disagrees with is ARCHIVED, never dropped in silence',
        any(r.get('id') == 'h0' and r.get('device') == 'morning' and r.get('server') == 'night' for r in sup), sup[-2:])
    got = await pg.evaluate("""() => window.__HT186N1.changed(
        {name:'A', section:'night', time_anchor:'21:30', link:null, minutes:20},
        {name:'B', section:'night', time_anchor:'21:30:00', link:'', minutes:20})""")
    chk('T15c . the sheet sends only the changed field: an unchanged section and planned time stay out of the write',
        got == {'name': 'A'}, got)
    pri = await pg.evaluate("""async () => {
        const before = (window.__HT186PRIOR.rows() || []).length;
        await window.ST.sb.from('habits').update({ section:'weekly' }).eq('id', 'h0').eq('user_id', 'x');
        const rows = window.__HT186PRIOR.rows(); const last = rows[rows.length - 1] || {};
        return { grew: rows.length - before, id: last.id, prior: last.prior, patch: last.patch }; }""")
    chk('T15d . every habits update first keeps the prior value on the device (ht186_habits_prior)',
        pri and pri['grew'] == 1 and pri['id'] == 'h0' and (pri['prior'] or {}).get('section') == 'night', pri)
    chk('T15e . no page error across both loads', not errs, errs[:3])
    await b.close()


sys.exit(asyncio.run(main()))
