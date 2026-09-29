#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-293 GOLDEN 38 - TODAY · THE GROUP TAB · THE LIFE CHART (paste 293 S2), run literally.

    python tools/golden_ht38.py            python tools/golden_ht38.py --only S2

Cory, Monday 2026-09-28 09:23 CDT, on his phone: the bar "at the top of the Today tab" · "remove the insights
... verbiage" · "red when it's not completed and then green ... apply it to all of the text" · "the rose [rows]
expand horizontally more than vertically" · "drag, edit ... and the time option right next to it ... a clean
line up and down" · "whichever current date ... shown as white on the X value of the graphs" · Settings "shakes
the screen to the left to the right" · "a group tab as a third tab" · "show age 100 at the bottom of the Y axis
... identical" (09:31: "loosen HT18, grow at 10 rows").

  S1  TODAY: the bar first, no "Insights ›"; every row red undone / green done (linked rows included); one line,
      13 px; drag · edit · time one straight column; today's tick on both charts; Settings does not sway.
  S2  THE GROUP TAB: three tabs, Group opens the group panel, Insights no longer carries it; 360 px fits.
  S3  THE LIFE CHART TO 100, the same axes on both screens; the desktop `100` drawn like every other age.
  S4  THE INKS: every row ink clears 4.5:1 on its row in all five schemes (the table goes in the receipt).
"""
import argparse, asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from golden293_lib import Golden, REPO, THEMES, open_page, src, rgb, ratio, BG, no_errors   # noqa: E402

G = Golden('HT-38 (paste 293 S2 · today, group, life)')
chk = G.chk
LINKS = {'__LINKS': {'h3': 'https://example.com/x', 'h4': 'https://example.com/y'}}


async def s1(pw):
    G.sec('S1', "the phone's Today")
    b, pg, errs = await open_page(pw, 390, 844, flags=LINKS)
    first = await pg.evaluate("() => { const c = document.querySelector('.colL'); return c && c.firstElementChild && c.firstElementChild.id; }")
    chk('S1a . the day-percent bar is the first thing in Today', first == 'tStrip', first)
    txt = await pg.evaluate("() => (document.querySelector('.colL')||{}).innerText || ''")
    chk('S1b . no "Insights ›" anywhere in Today (the tab is the way in)', 'Insights ›' not in txt and 'INSIGHTS ›' not in txt, txt[:120])
    js = src(os.path.join(REPO, 'app.js'))
    chk("S1c . the bar's markup no longer writes it", "'<span class=\"go\">Insights ›</span>'" not in js)
    ink = await pg.evaluate("""() => { const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
        const probe = document.createElement('i'); document.body.appendChild(probe);
        const as = (t) => { probe.style.color = 'var(' + t + ')'; return getComputedStyle(probe).color; };
        const bad = as('--bad'), good = as('--good'); probe.remove();
        return { bad, good, rows: [...document.querySelectorAll('#log .li')].filter(r => r.offsetParent).map(r => {
          const nm = r.querySelector('.nm'); return [r.classList.contains('on'), getComputedStyle(nm).color, nm.tagName]; }) }; }""")
    wrong = [r for r in ink['rows'] if r[1] != (ink['good'] if r[0] else ink['bad'])]
    links = [r for r in ink['rows'] if r[2] == 'A']
    chk('S1d . every row is --bad undone and --good done, no exceptions (%d rows, %d linked)' % (len(ink['rows']), len(links)),
        ink['rows'] and not wrong and links, wrong[:4])
    dens = await pg.evaluate("""() => [...document.querySelectorAll('#log .li')].filter(r => r.offsetParent).map(r => {
        const nm = r.querySelector('.nm'), cs = getComputedStyle(nm), rg = document.createRange(); rg.selectNodeContents(nm);
        const lines = new Set([...rg.getClientRects()].filter(q => q.width > 0).map(q => Math.round(q.top))).size;
        return [parseFloat(cs.fontSize), cs.whiteSpace, lines]; })""")
    # AMENDED BY PASTE 347 S1 (R67.2 - a golden is amended by name, not loosened): Cory, Monday
    # 2026-09-28 8:02 PM, reversed 293's "one line, an ellipsis" - a clipped title is a task he cannot
    # read. The 13px scale STAYS; the title now WRAPS (white-space:normal, never nowrap) and lays out on
    # >=1 line. The three-line visual cap is `-webkit-line-clamp:3`, verified from computed style in
    # golden_ht42 S1c - it is NOT measurable here, because getClientRects returns every LAYOUT line box
    # (a long name lays out 6 boxes while the clamp paints only 3), so this holds the wrap, not the cap.
    chk('S1e . row titles 13 px (never below) and WRAP - never one clipped line (paste 347 S1)',
        dens and all(d[0] == 13 and d[1] != 'nowrap' and d[2] >= 1 for d in dens), dens[:4])
    col = await pg.evaluate("""() => [...document.querySelectorAll('#log .li')].filter(r => r.offsetParent).map(r => {
        const x = s => { const n = r.querySelector(s); return n ? Math.round(n.getBoundingClientRect().x) : null; };
        const t = r.querySelector('.pat30:not([hidden]), .t293e');
        return [x('.drg'), x('.edp'), t ? Math.round(t.getBoundingClientRect().x) : null, Math.round(r.getBoundingClientRect().right)]; })""")
    xs = set(tuple(c[:3]) for c in col)
    ok_order = all(c[0] is not None and c[1] is not None and c[2] is not None and c[0] < c[1] < c[2] for c in col)
    chk('S1f . drag · edit · time, in that order, at the same x on every row (%d rows)' % len(col),
        len(xs) == 1 and ok_order, sorted(xs)[:4])
    chk('S1g . and the column sits at the right edge of the row',
        col and all(c[3] - c[2] <= 60 for c in col), col[:3])
    await no_errors(G, pg, errs, 'S1 (today)')
    # today's tick, both charts, on the phone - reached by the tab as a person does
    await pg.evaluate("() => document.querySelector('#h29Bar [data-t29=\"insights\"]').click()")
    await pg.wait_for_timeout(900)
    tick = await pg.evaluate("""() => { const t = s => [...document.querySelectorAll(s)].filter(n => n.getBoundingClientRect().width > 0);
        const fill = n => getComputedStyle(n.querySelector('tspan') || n).fill;
        const txt = (() => { const p = document.createElement('i'); p.style.color = 'var(--text)'; document.body.appendChild(p);
                             const c = getComputedStyle(p).color; p.remove(); return c; })();
        const m = t('#h31Month text.xl-today'), y = t('#h31Year text.xl-today');
        return { txt, m: m.map(fill), y: y.map(fill), yl: y.map(n => n.textContent) }; }""")
    chk("S1h . the month chart marks today in the body ink on the phone", tick['m'] and all(f == tick['txt'] for f in tick['m']), tick)
    chk("S1i . the year chart marks this month (it never did, on either screen)", tick['y'] and all(f == tick['txt'] for f in tick['y']), tick)
    await b.close()
    # Settings does not sway
    b, pg, errs = await open_page(pw, 390, 844)
    await pg.evaluate("() => document.getElementById('bSet').click()")
    await pg.wait_for_timeout(700)
    sw = await pg.evaluate("""() => { const ov = document.querySelector('.ov.on') || document.querySelector('.ov'); const cs = getComputedStyle(ov);
        const before = ov.scrollLeft; ov.scrollLeft = 200; const moved = ov.scrollLeft; ov.scrollLeft = before;
        return { ox: cs.overflowX, ta: cs.touchAction, osb: cs.overscrollBehaviorX, moved, page: document.scrollingElement.scrollWidth <= innerWidth }; }""")
    chk('S1j . Settings pans vertically only: touch-action pan-y, no sideways overscroll, nothing scrolls sideways (nothing clipped)',
        'pan-y' in sw['ta'] and sw['osb'] == 'none' and sw['moved'] == 0 and sw['page'], sw)
    await no_errors(G, pg, errs, 'S1 (settings)')
    await b.close()


async def s2(pw):
    G.sec('S2', 'the Group tab')
    for w in (390, 360):
        b, pg, errs = await open_page(pw, w, 844 if w == 390 else 780)
        tabs = await pg.evaluate("() => [...document.querySelectorAll('#h29Bar button')].filter(b => b.offsetParent).map(b => b.textContent.trim())")
        chk('S2a . %d . three bottom tabs: Today · Insights · Group' % w, tabs == ['Today', 'Insights', 'Group'], tabs)
        fit = await pg.evaluate("() => [...document.querySelectorAll('#h29Bar button')].filter(b => b.offsetParent).every(b => b.scrollWidth <= b.clientWidth + 1)")
        chk('S2b . %d . every tab label fits its button' % w, fit, 'a label overflows')
        await pg.evaluate("() => document.querySelector('#h29Bar [data-t293=\"group\"]').click()")
        await pg.wait_for_timeout(900)
        st = await pg.evaluate("""() => { const vis = n => !!(n && n.offsetParent);
            const g = document.getElementById('h293Grp');
            return { grp: vis(g), panel: !!(g && g.querySelector('#h30Group [data-i29="group"], #h30Group .g194, #h30Group')),
                     members: g ? g.querySelectorAll('.g194 .gr, .g194 [data-h29m], .g194 > *').length : 0,
                     invite: !!(g && g.querySelector('[data-h29invite]')),
                     ins: vis(document.getElementById('h30Ins')),
                     cur: [...document.querySelectorAll('#h29Bar button')].filter(b => b.getAttribute('aria-current') === 'page').map(b => b.textContent.trim()) }; }""")
        chk('S2c . %d . Group opens the group panel (members, the week, Invite) and nothing else' % w,
            st['grp'] and st['panel'] and st['invite'] and not st['ins'], st)
        chk('S2d . %d . and the bar says Group is where you are' % w, st['cur'] == ['Group'], st['cur'])
        await pg.evaluate("() => document.querySelector('#h29Bar [data-t29=\"insights\"]').click()")
        await pg.wait_for_timeout(900)
        ins = await pg.evaluate("""() => ({ cards: [...document.querySelectorAll('#h30InsBody > .h30c')].filter(n => !n.hidden).map(n => n.id),
                                            grp: !!(document.getElementById('h293Grp')||{}).offsetParent })""")
        chk('S2e . %d . Insights keeps the hero, the month, the year and the life - and not the group (moved, not copied)' % w,
            ins['cards'] == ['h228Hero', 'h31Month', 'h31Year', 'h30Life'] and not ins['grp'], ins)
        await no_errors(G, pg, errs, 'S2 (%d)' % w)
        await b.close()


async def s3(pw):
    G.sec('S3', 'the life chart to 100, identical on both screens')
    axes = {}
    b, pg, errs = await open_page(pw, 390, 844)
    await pg.evaluate("() => document.querySelector('#h29Bar [data-t29=\"insights\"]').click()")
    await pg.wait_for_timeout(1200)
    axes['phone'] = await pg.evaluate("""() => { const s = document.querySelector('#h30Life svg, #vWeeks svg, #vLife svg'); if(!s) return null;
        return { rows: s.getAttribute('data-rows'), ages: [...s.querySelectorAll('.h185y')].map(t => t.textContent),
                 weeks: [...s.querySelectorAll('.h185x')].map(t => t.textContent) }; }""")
    await b.close()
    for (w, h) in ((1695, 900), (1920, 855)):
        b, pg, errs = await open_page(pw, w, h)
        axes['desk%d' % w] = await pg.evaluate("""() => { const host = document.getElementById('vWeeks'), s = host && host.querySelector('svg');
            if(!s) return null; const labs = [...s.querySelectorAll('text.wl')];
            const ages = labs.filter(t => /^\\d+$/.test(t.textContent) && t.getAttribute('text-anchor') === 'end' && +t.getAttribute('x') < 19).map(t => t.textContent);
            const weeks = labs.filter(t => +t.getAttribute('x') >= 40 || t.getAttribute('text-anchor') !== 'end').map(t => t.textContent);
            const foot = s.querySelector('.h293foot'), ten = labs.find(t => t.textContent === '90');
            const hb = host.getBoundingClientRect(), fb = foot ? foot.getBoundingClientRect() : null;
            return { ages, weeks: [...new Set(weeks)].filter(x => /^\\d+$/.test(x) && ages.indexOf(x) < 0 || x === '0').slice(0, 8),
                     footSize: foot ? getComputedStyle(foot).fontSize : null, nineSize: ten ? getComputedStyle(ten).fontSize : null,
                     footInside: fb ? (fb.top >= hb.top && fb.top + 7 <= hb.bottom + 1) : false,
                     rows: (() => { const lv = [...s.querySelectorAll('rect.lv')]; return lv.length; })() }; }""")
        await no_errors(G, pg, errs, 'S3 (%d)' % w)
        await b.close()
    p, d = axes.get('phone') or {}, axes.get('desk1695') or {}
    chk('S3a . the phone runs to 100 rows (not the target age)', p.get('rows') == '100', p)
    chk('S3b . the phone labels ages 0 ... 100 by tens', p.get('ages') == [str(x) for x in range(0, 101, 10)], p.get('ages'))
    chk('S3c . the phone ticks weeks 0 10 20 30 40 52 - the desktop\'s own ticks', p.get('weeks') == ['0', '10', '20', '30', '40', '52'], p.get('weeks'))
    chk('S3d . the desktop labels ages 0 ... 100 by tens - the same list as the phone', d.get('ages') == p.get('ages'), [d.get('ages'), p.get('ages')])
    chk('S3e . the desktop `100` is drawn at the size of every other age (it was a 6.5 px label, read as "90")',
        d.get('footSize') and d.get('footSize') == d.get('nineSize'), d)
    chk('S3f . and it sits inside the quadrant, never clipped', d.get('footInside') is True, d)
    e = axes.get('desk1920') or {}
    chk('S3g . 1920x855 as well: the ages run to 100, inside the box', e.get('ages') == p.get('ages') and e.get('footInside') is True, e)


async def s4(pw):
    G.sec('S4', 'the row inks, five schemes')
    table = []
    for th in THEMES:
        b, pg, errs = await open_page(pw, 390, 844, storage={'ht_theme': th}, flags=LINKS)
        r = await pg.evaluate("() => { " + BG + """ const rows = [...document.querySelectorAll('#log .li')].filter(r => r.offsetParent);
            const on = rows.find(r => r.classList.contains('on')), off = rows.find(r => !r.classList.contains('on'));
            const c = r => { const nm = r.querySelector('.nm'); return [getComputedStyle(nm).color, bgOf(nm)]; };
            return { on: on ? c(on) : null, off: off ? c(off) : null }; }""")
        for state, key in (('done', 'on'), ('undone', 'off')):
            v = r.get(key)
            q = ratio(rgb(v[0]), rgb(v[1])) if v and rgb(v[0]) and rgb(v[1]) else 0
            table.append((th, state, round(q, 2)))
        await b.close()
    for th, state, q in table:
        G.info('CONTRAST %-8s %-6s %.2f:1' % (th, state, q))
    low = [t for t in table if t[2] < 4.5]
    chk('S4a . every row ink clears 4.5:1 on its row, done and undone, in all five schemes (min %.2f)' % min(t[2] for t in table),
        len(table) == 10 and not low, low)


async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only')
    a = ap.parse_args()
    secs = [('S1', s1), ('S2', s2), ('S3', s3), ('S4', s4)]
    async with async_playwright() as pw:
        for n, f in secs:
            if a.only and a.only != n:
                continue
            try:
                await f(pw)
            except Exception as e:
                G.chk('%s . the section ran to its end' % n, False, '%s: %s' % (type(e).__name__, e))
    return G.done([n for n, _ in secs if not a.only or a.only == n])


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
