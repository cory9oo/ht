#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-293 GOLDEN 37 - THE DAY MODEL (paste 293 S1), run literally.

    python tools/golden_ht37.py            python tools/golden_ht37.py --only S3

Cory, Monday 2026-09-28 09:23 CDT: "one category to be called Scheduled and then another one to be weekly and
then another one to be standards ... only the ones that are categorized as timed [show the time]" · "I only
want to ever see ... on a Saturday ... Sabbath ... one task completion checkbox" · "take away my day closes at
time feature - assume each day starts the next day at 12 AM" · "the completion [percentages] are buggy ... on
the Sabbath I clicked 100% done and it still shows zero".

  S1  THE THREE CATEGORIES, declared once (source) and drawn in order on the phone and the desktop; the chip only
      on Scheduled rows; the stored value Scheduled is written as (the write path); an unknown section.
  S2  THE SABBATH - one row, one box, no headers; a flagged task shows; Settings has one "Sabbath day" control.
  S3  ONE PERCENT ENGINE, on fixtures: nothing-due is skipped; the Sabbath denominator; a flagged task; weekly
      and dow; 7- and 30-day averages; the streak; the stale 0% after a tick; and the percent-change list.
  S4  MIDNIGHT - a check at 23:59 is that day, at 00:01 the next; the page rolls; the close-time control is gone.
"""
import argparse, asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from golden293_lib import Golden, REPO, open_page, src, no_errors, today_key_js   # noqa: E402

G = Golden('HT-37 (paste 293 S1 · the day model)')
chk = G.chk
# AMENDED BY PASTE 357 (Cory 2026-09-28 21:10: "Standards above the Weekly, Weekly at the bottom"): Standards moves above Weekly.
THREE = ['Scheduled', 'Standards', 'Weekly']

# A fixture world, laid over the mock's own data inside the page: five habits, a Sabbath on TODAY's weekday.
WORLD = r"""(opts) => {
  const E = window.__HT293, S = E.S(), k0 = E.dk(new Date());
  const sh = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return E.dk(d); };
  S.habits = [
    { id:'s1', name:'Scheduled one', cadence:'daily', section:'morning', time_anchor:'06:00', active:true, sort_order:1 },
    { id:'s2', name:'Standard two',  cadence:'daily', section:'standards', active:true, sort_order:2 },
    { id:'w3', name:'Weekly three',  cadence:'weekly', section:'weekly', active:true, sort_order:3 },
    { id:'d4', name:'Tuesday four',  cadence:'dow:2', section:'standards', active:true, sort_order:4 },
    { id:'sb', name:'Sabbath', group_name:'SABBATH', cadence:'daily', section:'night', active:true, sort_order:5 },
    { id:'f6', name:'Flagged six',   cadence:'daily', section:'standards', active:true, sort_order:6, show_on_sabbath:opts.flag }
  ];
  S.days = []; S.byDate = {};
  for(let i = 0; i < 10; i++){
    const k = sh(k0, -i), r = { date:k, checked:{}, active_set:null, pct:null };
    S.byDate[k] = r; S.days.push(r);
  }
  return { today:k0, sh:[1,2,3,4,5,6,7,8,9].map(i => sh(k0, -i)) };
}"""


async def s1(pw):
    G.sec('S1', 'Scheduled · Standards · Weekly')
    js = src(os.path.join(REPO, 'app.js'))
    chk('S1a . HT29SEC declares the three, in his order', "var ORDER = ['scheduled','standards','weekly'];" in js)
    chk('S1b . and names them exactly as he did',
        "var NAMES = { scheduled:'Scheduled', weekly:'Weekly', standards:'Standards' };" in js)
    chk('S1c . morning · night · anytime read as Scheduled (read-side only)',
        "var LEGACY = { morning:'scheduled', night:'scheduled', anytime:'scheduled', timed:'scheduled' };" in js)
    chk('S1d . the chip is offered on Scheduled rows only', "var HT31_GHOST_CHIP_SECTIONS = ['scheduled'];" in js)
    for (w, h, tag) in ((390, 844, 'phone'), (1280, 720, 'desktop')):
        b, pg, errs = await open_page(pw, w, h)
        heads = await pg.eval_on_selector_all('#log > .grp', 'ns => ns.map(n => n.textContent.trim())')
        chk('S1e . %s . the three headers, in order' % tag, heads == THREE, heads)
        rows = await pg.evaluate("""() => [...document.querySelectorAll('#log .li')].map(r => {
            const sec = window.__HT29S2.sectionOf(window.__HT293.S().habits.find(h => String(h.id) === r.getAttribute('data-h')));
            const chip = [...r.querySelectorAll('.pat30, .pat')].some(n => n.offsetParent !== null && !n.hidden);
            return [sec, chip]; })""")
        sch = [c for s, c in rows if s == 'scheduled']
        oth = [c for s, c in rows if s != 'scheduled']
        chk('S1f . %s . every Scheduled row carries its time chip (%d rows)' % (tag, len(sch)), sch and all(sch), rows[:6])
        chk('S1g . %s . no Weekly or Standards row shows a time (%d rows)' % (tag, len(oth)), oth and not any(oth), rows[-6:])
        await pg.evaluate("() => { const e = document.querySelector('#log .li .edp'); if(e) e.click(); }")
        await pg.wait_for_timeout(700)
        opts = await pg.eval_on_selector_all('#eSection option', 'ns => ns.map(n => n.textContent.trim())')
        chk('S1h . %s . the section picker offers exactly the three' % tag, opts == THREE, opts)
        await no_errors(G, pg, errs, 'S1 (%s)' % tag)
        await b.close()
    b, pg, errs = await open_page(pw, 390, 844)
    got = await pg.evaluate("""() => { const E = window.__HT293, S = E.S(), f = window.__HT29S2.sectionOf;
        const odd = [{id:'x1', section:'anytime'}, {id:'x2', section:null}, {id:'x3', section:'banana'},
                     {id:'x4', section:'night'}, {id:'x5', section:null, cadence:'weekly'}];
        const noSched = S.habits.every(h => String(h.section||'') !== 'scheduled');
        return { sec: odd.map(f), store: [HT29SEC_store('scheduled'), HT29SEC_store('weekly'), HT29SEC_store('night')], noSched };
        function HT29SEC_store(v){ return window.__HT293.store(v); } }""")
    chk('S1i . stress 1: anytime · null · unknown · night -> Scheduled; a weekly cadence -> Weekly; nothing dropped',
        got['sec'] == ['scheduled', 'scheduled', 'scheduled', 'scheduled', 'weekly'], got)
    chk('S1j . before the migration Scheduled is WRITTEN as morning (legal under the live constraint); others as themselves',
        got['noSched'] and got['store'] == ['morning', 'weekly', 'morning'], got)
    # the one write path: a habits update through the client carries the mapped value
    await pg.evaluate("() => window.__HT293.client().from('habits').update({ section:'scheduled' }).eq('id','h0').eq('user_id','u-mock')")
    await pg.wait_for_timeout(300)
    w = await pg.evaluate("() => (window.__WRITES||[]).filter(x => x.t === 'habits' || x.table === 'habits').map(x => JSON.stringify(x)).slice(-3)")
    chk('S1k . every habits write passes the section through one mapping (the sheet, a drag, a link, a move)',
        any('"section":"morning"' in x for x in w) and not any('"section":"scheduled"' in x for x in w), w)
    await no_errors(G, pg, errs, 'S1 (write path)')
    await b.close()


async def s2(pw):
    G.sec('S2', 'the Sabbath - one row, one box')
    dow = "String(new Date().getDay())"
    init = "try{localStorage.setItem('ht30_sab_u-mock', %s)}catch(e){}" % dow
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SABBATH': True}, init=init)
    vis = await pg.evaluate("""() => [...document.querySelectorAll('#log .li')].filter(r => r.offsetParent && !r.hidden)
                              .map(r => r.textContent.trim().slice(0, 12))""")
    chk('S2a . on the Sabbath Today shows ONE row, the Sabbath', len(vis) == 1 and vis[0].lower().startswith('sabbath'), vis)
    heads = await pg.evaluate("() => [...document.querySelectorAll('#log > .grp, #log .eadd')].filter(n => n.offsetParent).length")
    chk('S2b . and no section header or "+ Add" beside it', heads == 0, heads)
    k = await pg.evaluate(today_key_js())
    before = await pg.evaluate("(k) => window.__HT293.pct(k)", k)
    await pg.evaluate("() => { const r = [...document.querySelectorAll('#log .li')].find(r => r.offsetParent); r.querySelector('[data-tog]').click(); }")
    await pg.wait_for_timeout(120)                    # well inside saveDay's 450 ms debounce
    after = await pg.evaluate("(k) => window.__HT293.pct(k)", k)
    bar = await pg.evaluate("() => (document.getElementById('tStrip')||{}).textContent || ''")
    chk('S2c . one tap moves the day between 0% and 100%, and the bar says so BEFORE the save lands (the reported 0%)',
        {before, after} == {0, 100} and bar.strip().startswith(str(after)), [before, after, bar])
    await no_errors(G, pg, errs, 'S2 (Sabbath)')
    await b.close()
    # a flagged standard shows on the Sabbath beside the Sabbath row
    init2 = init + ";try{localStorage.setItem('ht293_sab_show', JSON.stringify({h2:1}))}catch(e){}"
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SABBATH': True}, init=init2)
    vis = await pg.evaluate("() => [...document.querySelectorAll('#log .li')].filter(r => r.offsetParent && !r.hidden).map(r => r.getAttribute('data-h'))")
    chk('S2d . a standard whose sheet says Show on Sabbath shows too - and only it', sorted(vis) == ['h2', 'h26'], vis)
    await b.close()
    # Settings: one control, None + seven days; the sheet offers Show on Sabbath once a day is chosen
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SABBATH': True}, init=init)
    await pg.evaluate("() => document.getElementById('bSet').click()")
    await pg.wait_for_timeout(700)
    opts = await pg.eval_on_selector_all('#h30SabDay option', 'ns => ns.map(n => n.textContent.trim())')
    chk('S2e . Settings -> Sabbath day: None, Sunday ... Saturday', opts == ['None', 'Sunday', 'Monday', 'Tuesday',
        'Wednesday', 'Thursday', 'Friday', 'Saturday'], opts)
    await pg.keyboard.press('Escape')
    await no_errors(G, pg, errs, 'S2 (settings)')
    await b.close()
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SABBATH': True},
                                  init="try{localStorage.setItem('ht30_sab_u-mock', String((new Date().getDay()+1)%7))}catch(e){}")
    await pg.evaluate("() => { const r = [...document.querySelectorAll('#log .li')].find(r => r.getAttribute('data-h') === 'h2'); r.querySelector('.edp').click(); }")
    await pg.wait_for_timeout(700)
    f = await pg.evaluate("() => { const s = document.getElementById('eSabShowFld'), r = document.getElementById('eRestFld'); return [!!s && !s.hidden, !!r && r.hidden]; }")
    chk('S2f . the sheet offers Show on Sabbath (default off) and hides Rests on Sabbath while a day is kept', f == [True, True], f)
    await b.close()


async def s3(pw):
    G.sec('S3', 'one percent engine, on fixtures')
    b, pg, errs = await open_page(pw, 390, 844)
    await pg.evaluate("() => { try{ localStorage.removeItem('ht293_sab_show'); }catch(e){} }")
    res = await pg.evaluate("""(W) => { const world = eval(W); const E = window.__HT293, S = E.S();
      const out = {};
      let w = world({ flag:false }); const k = w.today;
      // weekly and a Tuesday-only row are never in an ordinary day's denominator unless it is Tuesday
      const due = E.due(k);
      out.weeklyOut = due.indexOf('w3') < 0;
      out.dowOk = (new Date(k + 'T12:00:00').getDay() === 2) === (due.indexOf('d4') >= 0);
      out.stdIn = due.indexOf('s2') >= 0 && due.indexOf('s1') >= 0;
      // nothing due -> null, and the average skips it
      S.habits = S.habits.filter(h => h.id === 'w3');
      out.nothing = E.pct(k);
      // P4: a past day keeps the set it was graded on - its own active_set, even for a habit gone since
      w = world({ flag:false });
      S.byDate[w.sh[2]].active_set = ['gone-habit'];
      S.byDate[w.sh[2]].checked = { 'gone-habit':'08:00' };
      out.p4 = E.pct(w.sh[2]);
      // the 7-day figure: only a Tuesday row is ever due, so six of seven days have nothing due - skipped
      w = world({ flag:false });
      S.habits = S.habits.filter(h => h.id === 'd4' || h.id === 'w3');
      Object.keys(S.byDate).forEach(kk => { S.byDate[kk].checked = { d4:1 }; });
      out.avg7 = E.avg(7);
      out.dueDays = [0,1,2,3,4,5,6].map(i => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() - i); return E.pct(E.dk(d)); }).filter(v => v != null).length;
      // the streak: a nothing-due day neither breaks nor extends it
      w = world({ flag:false });
      S.habits = S.habits.filter(h => h.id !== 'sb' && h.id !== 'd4');
      [w.today, w.sh[0], w.sh[1]].forEach(kk => { S.byDate[kk].checked = { s1:1, s2:1, f6:1 }; });
      out.streak3 = E.streak(100);
      return out; }""", WORLD)
    chk('S3a . a weekly is never in a day\'s denominator; a dow: row only on its day; Scheduled and Standards daily',
        res['weeklyOut'] and res['dowOk'] and res['stdIn'], res)
    chk('S3b . a day with nothing due is null - skipped, never a zero', res['nothing'] is None, res['nothing'])
    chk('S3c . a past day keeps the set it was graded on (P4): its own active_set, even for a habit gone since',
        res['p4'] == 100, res['p4'])
    chk('S3d . the 7-day figure skips days with nothing due: one Tuesday at 100%% is 100%%, not 100/7 (%s due day)' % res['dueDays'],
        res['avg7'] == 100 and res['dueDays'] == 1, res)
    chk('S3e . the streak counts three full days in a row', res['streak3'] == 3, res['streak3'])
    # the Sabbath denominator (stress 2): the box alone 50%, both 100%, with a flagged task
    await pg.evaluate("() => window.__HT30SAB.save(new Date().getDay(), true)")
    sab = await pg.evaluate("""(W) => { const world = eval(W); const E = window.__HT293, S = E.S();
      const w = world({ flag:true }); const k = w.today; const out = {};
      out.sabDow = E.sabDow();
      out.due = E.due(k).slice().sort();
      S.byDate[k].checked = { sb:1 };                  out.box = E.pct(k);
      S.byDate[k].checked = { sb:1, f6:1 };            out.both = E.pct(k);
      S.byDate[k].checked = {};                        out.none = E.pct(k);
      S.habits.find(h => h.id === 'f6').show_on_sabbath = false;
      S.byDate[k].checked = { sb:1 };                  out.boxAlone = E.pct(k);
      return out; }""", WORLD)
    chk('S3f . on the Sabbath the due set is the Sabbath row + the flagged task', sab['due'] == ['f6', 'sb'], sab)
    chk('S3g . stress 2: the box alone 50%, both 100%, neither 0%', [sab['box'], sab['both'], sab['none']] == [50, 100, 0], sab)
    chk('S3h . unflagged, the Sabbath box alone is the whole day: 100%', sab['boxAlone'] == 100, sab)
    # REVIEW OF 293's DIFF · P4: moving the Sabbath never reprices a past day graded without the Sabbath row in it
    p4 = await pg.evaluate("""(W) => { const world = eval(W); const E = window.__HT293, S = E.S();
      const w = world({ flag:false }); const k = w.sh[6];                     /* a past day, a week ago: today's weekday */
      S.byDate[k].active_set = ['s1', 's2']; S.byDate[k].checked = { s1:1, s2:1 };
      return [E.pct(k), E.due(k).slice().sort()]; }""", WORLD)
    chk('S3h2 . P4: a past day on the (new) Sabbath weekday keeps the set it was graded on - 100%, not re-graded to 0',
        p4 == [100, ['s1', 's2']], p4)
    await no_errors(G, pg, errs, 'S3 (engine)')
    await b.close()
    # THE PERCENT-CHANGE LIST (S1.5 acceptance): the mock's 34 days, old arithmetic vs the one engine
    b, pg, errs = await open_page(pw, 390, 844, flags={'__SABBATH': True},
                                  init="try{localStorage.setItem('ht30_sab_u-mock','6')}catch(e){}")
    diff = await pg.evaluate("""() => { const E = window.__HT293, S = E.S(), out = [];
      Object.keys(S.byDate).sort().forEach(k => {
        const r = S.byDate[k], ck = r.checked || {};
        // the OLD arithmetic is saveDay's own: a past day's active_set when it has one, else the day's list
        const snap = (k < E.dk(new Date()) && r.active_set && r.active_set.length) ? r.active_set.map(String) : null;
        const old = snap || S.habits.filter(h => parseCadenceKind(h) !== 'weekly' && E.dueOldFor(h, k)).map(h => String(h.id));
        const o = old.length ? Math.round(old.filter(i => ck[i]).length / old.length * 100) : 0;
        const n = E.pct(k);
        const now = E.due(k), sabIds = S.habits.filter(h => /^\s*sabbath\b/i.test(h.name||'') || /^sabbath$/i.test(h.group_name||'')).map(h => String(h.id));
        const onlySab = old.concat(now).filter(i => (old.indexOf(i) < 0) !== (now.indexOf(i) < 0)).every(i => sabIds.indexOf(i) >= 0);
        if(o !== n) out.push([k, o, n, new Date(k + 'T12:00:00').getDay() === 6 ? 'the Sabbath denominator'
          : (n == null ? 'nothing due: skipped, not 0' : (onlySab ? 'the Sabbath row counted on a weekday' : 'the due set'))]);
      });
      function parseCadenceKind(h){ return h.cadence === 'weekly' ? 'weekly' : 'x'; }
      return out; }""")
    for row in diff:
        G.info('PCT-CHANGE %s old %s%% -> new %s · %s' % (row[0], row[1], 'skipped' if row[2] is None else str(row[2]) + '%', row[3]))
    chk('S3i . every changed fixture day is a Sabbath (its denominator) or a nothing-due day - no other day moved (%d changed)' % len(diff),
        all(r[3] != 'the due set' for r in diff), [r for r in diff if r[3] == 'the due set'][:4])
    await b.close()


async def s4(pw):
    G.sec('S4', 'midnight')
    b, pg, errs = await open_page(pw, 390, 844)
    r = await pg.evaluate("""() => { const E = window.__HT293;
      const a = E.dk(new Date(2026, 8, 26, 23, 59)), c = E.dk(new Date(2026, 8, 27, 0, 1));
      return [a, c]; }""")
    chk('S4a . a check at 23:59 belongs to that day, at 00:01 to the next (the phone\'s local calendar date)',
        r == ['2026-09-26', '2026-09-27'], r)
    rolled = await pg.evaluate("""() => { const E = window.__HT293, S = E.S();
      const y = (d => { d.setDate(d.getDate() - 1); return E.dk(d); })(new Date());
      E.__setLastToday(y); window.__HT293_goDay(y); const was = S.date;
      const moved = E.roll(); return [was, S.date, moved, E.dk(new Date())]; }""")
    chk('S4b . a page left open on today rolls to the new day at midnight (visible only, a local clock)',
        rolled[2] is True and rolled[1] == rolled[3] and rolled[0] != rolled[1], rolled)
    # REVIEW OF 293's DIFF: never mid-sentence - with a journal box focused the roll waits for the next tick
    held = await pg.evaluate("""() => { const E = window.__HT293, S = E.S();
      const y = (d => { d.setDate(d.getDate() - 1); return E.dk(d); })(new Date());
      E.__setLastToday(y); window.__HT293_goDay(y);
      const t = document.getElementById('iPrayer'); t.focus();
      const moved = E.roll(); const stayed = S.date === y; t.blur(); const later = E.roll();
      return [moved, stayed, later, S.date === E.dk(new Date())]; }""")
    chk('S4b2 . with a journal box focused the day does NOT roll under his fingers; it rolls once he leaves the box',
        held == [False, True, True, True], held)
    js = src(os.path.join(REPO, 'app.js'))
    chk('S4c . the "My day closes at" control is gone from Settings', 'My day closes at' not in js.split('PASTE 293 S1.3')[0][-4000:]
        and "'<select id=\"h32mw_hr\">'" not in js, 'still in the markup')
    await pg.evaluate("() => document.getElementById('bSet').click()")
    await pg.wait_for_timeout(700)
    gone = await pg.evaluate("() => !document.getElementById('h32mw_hr') && !/My day closes at/i.test(document.querySelector('.ov').textContent)")
    chk('S4d . and Settings on the phone offers no close time', gone, 'the control rendered')
    await no_errors(G, pg, errs, 'S4')
    await b.close()


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
