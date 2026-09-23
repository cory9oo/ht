#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-29 GOLDEN - WIRE HT-29 (PASTE 133), run literally.

    python tools/golden_ht29.py            (from anywhere; the fixture is found, not assumed)
    python tools/golden_ht29.py --only S3

  S0  the audit applied: every hidden row still in the DOM and off the surface the audit names
  S1  the journal boxes: one renderer, no jump under the keyboard, no DOM written per key, the cap then scroll,
      the text survives a reload, a check-off never blanks the brain dump, IME composition lands
  S2  four sections in one order, the placement rule agreed by three languages, the time as a dot not a number,
      the sheet's Section and "Done when", the add-link that places
  S3  the group both ways: five columns with Ruling 1's arithmetic, logged N/7, a member's day with no journal
      field in it, a stranger sees nothing, the join card and the Group panel, the profile row that now exists
  S5  one Insights: the bottom bar, three cards, HT-26's five under More, the rating explained (own whys only)
  S6  one journal shape in three homes: the zip, the Drive route behind its id, the vault account, the help
  S7  phone <-> desktop within 5 s, both ways, with the 30 s pull an hour away: the Realtime subscription S4
      publishes for, scoped to one user, opened only while the page is visible
  S8  the update banner that can actually be tapped (D16), the service worker's version and its push handlers
  S9  nudges: hidden until the sender answers, then the switch, the times, the subscription, the test

Numbers written as constants were MEASURED on this fixture (ht_stage/133/s1/, smoke/) before the change.
"""
import argparse, asyncio, io, json, os, re, subprocess, sys, zipfile
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
    raise SystemExit('golden_ht29: no estate root above %s' % start)


def fixture_dir(estate):
    for d in (os.path.join(estate, '_machine', 'ht3'), os.path.join(estate, 'ht3')):
        if os.path.isdir(d):
            return d
    return os.path.join(estate, '_machine', 'ht3')


ESTATE = find_estate(REPO)
BASE = 'file://' + os.path.join(fixture_dir(ESTATE), 'index.html').replace(os.sep, '/')
RECONCILE = os.path.join(ESTATE, '_reconcile')
SECRETS = ('SECRET-WHY', 'SECRET-DONE', 'SECRET-PRAYER', 'SECRET-DUMP')   # a member's journal, in the fixture only
SQL = {'__HT29_SQL': True, '__SECTION': True}

RES = []
def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def src(p):
    """A file this golden reads. A few of them live in the estate's staging rather than in this repo (the
    audit, the container's copy of the copier), and this repo is public: cloned on its own, those are simply
    not there. A missing one must FAIL the check that needs it and let the rest of the run finish - raising
    here stops every section after it, which is how one absent file used to read as a suite that never ran."""
    try:
        return io.open(p, encoding='utf-8', errors='replace').read()
    except OSError as e:
        return '⚠ NOT READABLE: %s (%s)' % (p, type(e).__name__)


def init_js(flags):
    return "; ".join("window.%s=%s" % (k, json.dumps(v)) for k, v in (flags or {}).items())


async def settings(pg, ms=1000):
    """Settings is opened the way a person opens it - `openSettings` lives inside the sealed closure."""
    await pg.click('#bSet')
    await pg.wait_for_timeout(ms)


def add_link(items):
    import base64
    raw = json.dumps(items, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return '#add=' + base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


PUSH_STUB = """
  (() => {
    const sub = { endpoint:'https://push.example.com/e1',
      toJSON(){ return { endpoint:this.endpoint, keys:{ p256dh:'PKEY', auth:'AKEY' } }; },
      unsubscribe(){ window.__UNSUB=(window.__UNSUB||0)+1; window.__SUBBED=null; return Promise.resolve(true); } };
    const pm = { getSubscription(){ return Promise.resolve(window.__SUBBED||null); },
      subscribe(o){ window.__SUBOPTS=o && { userVisibleOnly:o.userVisibleOnly, keyLen:(o.applicationServerKey||[]).length };
        window.__SUBBED=sub; return Promise.resolve(sub); } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable:true,
      value:{ ready:Promise.resolve({ pushManager:pm }), register(){ return Promise.resolve({ update(){}, addEventListener(){} }); },
              addEventListener(){} } });
    window.PushManager = function(){};
    window.Notification = { permission:'default', requestPermission(){ window.__PERM=(window.__PERM||0)+1; return Promise.resolve(window.__PERM_ANS||'granted'); } };
  })();
"""

GOOGLE_STUB = """
  (() => {
    window.google = { accounts: { oauth2: {
      initTokenClient(o){ window.__GIS=o; return { requestAccessToken(){ o.callback({ access_token:'mock-token', expires_in:3600 }); } }; },
      revoke(t, cb){ window.__REVOKED=t; cb && cb(); } } } };
  })();
"""


async def open_page(pw, w=390, h=844, touch=None, flags=None, qs='', wait=3600, init=None, routes=None):
    if touch is None:
        touch = w < 1024
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch,
                              device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    # HT-31 (paste 143 S4.14), 2026-09-22: this suite is HT-29's, and HT-29's Insights page is hidden
    # on the phone now - Cory asked for four blocks and no More under them. Hidden, NEVER DELETED
    # (R70.138), and the difference between those two words is a test that still runs: every page this
    # file opens asks for the extras, so all 113 of its assertions keep proving the cards work the day
    # anyone turns them back on. `golden_ht31` S4 proves the other half - that they are off by default.
    flags = dict(flags or {}, __HT31_EXTRAS=True)
    if flags:
        await pg.add_init_script(init_js(flags))
    if init:
        await pg.add_init_script(init)
    if routes:
        for pattern, handler in routes:
            await pg.route(pattern, handler)
    await pg.goto(BASE + qs)
    await pg.wait_for_timeout(wait)
    return b, pg, errs


async def no_errors(pg, errs, tag):
    chk('%s · zero page errors' % tag, not errs, errs[:3])


# =============================================================================================
# S1 · THE JOURNAL BOXES
# =============================================================================================
SNAP = """(id) => { const t=document.getElementById(id); return { caret:t.selectionStart, focus:document.activeElement===t,
  h:t.offsetHeight, y:Math.round(window.scrollY), muts:window.__m29, v:t.value.length }; }"""
WATCH = """(() => { window.__m29=0; const skip=new Set(['iDump','iTasks','iPrayer','iWhy','toast']);
  new MutationObserver(l => { for(const m of l){ const t=m.target; if(t && skip.has(t.id)) continue;
    if(t && t.parentElement && skip.has(t.parentElement.id)) continue; window.__m29++; } })
  .observe(document.body, { subtree:true, childList:true, attributes:true, characterData:true }); })()"""


async def sec_s1(pw):
    print("\n--- S1 · the journal boxes ---")
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True, '__BLOCKS': True, '__SHARED_DB': True})
    await pg.evaluate(WATCH)
    for box, label in (('iTasks', 'completed'), ('iPrayer', 'prayer'), ('iDump', 'brain dump')):
        await pg.evaluate("(id)=>{ const t=document.getElementById(id); t.scrollIntoView({block:'center'}); }", box)
        await pg.tap('#' + box)
        await pg.evaluate("(id)=>{ const t=document.getElementById(id); t.setSelectionRange(t.value.length,t.value.length); }", box)
        await pg.set_viewport_size({'width': 390, 'height': 484})                 # the keyboard is up
        await pg.evaluate("(id)=>{ window.scrollTo(0, document.documentElement.scrollHeight);"
                          " document.getElementById(id).scrollIntoView({block:'end'}); }", box)
        # let the resize's own timers fire (HT-18 quad 160 ms, HT-28 boot 180 ms) and only then count:
        # this measures what a KEY writes, not what a keyboard opening writes
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { window.__m29 = 0; }")
        prev = await pg.evaluate(SNAP, box)
        jumps, back, lost, m0 = 0, 0, 0, prev['muts']
        for ch in ("The quick brown fox jumps over the lazy dog. " * 3)[:120]:
            await pg.keyboard.type(ch)
            s = await pg.evaluate(SNAP, box)
            if abs(s['y'] - prev['y']) > 4:
                jumps += 1
            if s['caret'] is not None and prev['caret'] is not None and s['caret'] < prev['caret']:
                back += 1
            if not s['focus']:
                lost += 1
            prev = s
        await pg.set_viewport_size({'width': 390, 'height': 844})
        chk('S1a · %s: no scroll jump while typing (was 4 on the two lower boxes)' % label, jumps == 0, jumps)
        chk('S1b · %s: the caret never goes backwards, focus never lost' % label, back == 0 and lost == 0, (back, lost))
        chk('S1c · %s: no DOM written outside the box per key (was ~1/key)' % label, prev['muts'] - m0 <= 3, prev['muts'] - m0)
    # the cap, then scrolling inside
    await pg.tap('#iPrayer')
    for k in range(40):
        await pg.keyboard.type('line %d' % k)
        await pg.keyboard.press('Enter')
    cap = await pg.evaluate("""() => { const t=document.getElementById('iPrayer'), cs=getComputedStyle(t);
      const vh=(window.visualViewport||window).height||innerHeight;
      return { h:t.offsetHeight, ceil:Math.round(vh*0.40), scrolls:t.scrollHeight>t.clientHeight+1, ov:cs.overflowY }; }""")
    chk('S1d · 40 lines: the box grows to its ceiling then scrolls inside', cap['h'] <= cap['ceil'] + 3 and cap['scrolls'] and cap['ov'] == 'auto', cap)
    # one save path: a write lands ~500ms after the last key, and it is a day_private write
    await pg.tap('#iTasks')
    await pg.wait_for_timeout(900)                       # the box we left saves on blur; that is not this check
    await pg.evaluate("() => { window.__WRITES=[]; }")
    await pg.keyboard.type('MARKER-TASKS')
    await pg.wait_for_timeout(420)
    early = await pg.evaluate("() => (window.__WRITES||[]).filter(w=>w.table==='day_private').length")
    await pg.wait_for_timeout(700)
    late = await pg.evaluate("() => (window.__WRITES||[]).filter(w=>w.table==='day_private').length")
    chk('S1e · one save path: nothing at 420 ms, written by 1.1 s (500 ms debounce)', early == 0 and late >= 1, (early, late))
    toasted = await pg.evaluate("""() => { const t=document.getElementById('toast');
      return { text:t?t.textContent:'', on:t?t.classList.contains('on'):false }; }""")
    chk('S1f · a save that works says nothing', not (toasted['on'] and 'saved' in toasted['text']), toasted)
    # a check-off must not blank the brain dump (the loadDump path)
    await pg.tap('#iDump')
    await pg.keyboard.type('DUMP-KEEPS')
    await pg.wait_for_timeout(700)
    await pg.evaluate("() => { const b=document.querySelector('#log .li .bxw'); b && b.click(); }")
    await pg.wait_for_timeout(600)
    after = await pg.evaluate("() => document.getElementById('iDump').value")
    chk('S1g · a check-off never blanks the brain dump', 'DUMP-KEEPS' in after, after[:40])
    # IME composition (the Android keyboard's path)
    cdp = await pg.context.new_cdp_session(pg)
    await pg.tap('#iPrayer')
    await pg.evaluate("()=>{ const t=document.getElementById('iPrayer'); t.setSelectionRange(t.value.length,t.value.length); }")
    for k in range(1, 8):
        await cdp.send('Input.imeSetComposition', {'text': 'privacy'[:k], 'selectionStart': k, 'selectionEnd': k})
    await cdp.send('Input.insertText', {'text': 'privacy'})
    ime = await pg.evaluate("() => ({ v:document.getElementById('iPrayer').value.slice(-7), f:document.activeElement.id })")
    chk('S1h · IME composition lands and keeps focus', ime['v'] == 'privacy' and ime['f'] == 'iPrayer', ime)
    await pg.evaluate("() => document.activeElement.blur()")
    await pg.wait_for_timeout(900)
    await pg.reload()
    await pg.wait_for_timeout(3600)
    back2 = await pg.evaluate("() => ({ t:document.getElementById('iTasks').value, d:document.getElementById('iDump').value,"
                              " p:document.getElementById('iPrayer').value })")
    chk('S1i · every box survives a reload', 'MARKER-TASKS' in back2['t'] and 'DUMP-KEEPS' in back2['d'] and 'privacy' in back2['p'],
        {k: v[-24:] for k, v in back2.items()})
    await no_errors(pg, errs, 'S1')
    await b.close()


# =============================================================================================
# S2 · FOUR SECTIONS, AND THE TIME ON A TASK
# =============================================================================================
async def sec_s2(pw):
    print("\n--- S2 · four sections + time on tasks ---")
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True, '__BLOCKS': True, '__DOW': True})
    heads = await pg.evaluate("() => [...document.querySelectorAll('#log > .grp')].map(g=>[g.textContent, g.getAttribute('data-sec')])")
    names = [h[0] for h in heads]
    chk('S2a · the four sections, in one order, and no computed header left',
        # AMENDED BY NAME, HT-30 (paste 137 S1.4): his newer word orders them Morning . Night . Weekly
        # routine . Standards, and renames the fourth. The assertion - "they render in the declared
        # order, and only the ones that have rows" - is unchanged.
        names == [n for n in ['Morning routine', 'Night routine', 'Weekly routine', 'Standards'] if n in names]
        and all(h[1] for h in heads) and not [n for n in names if n in ('TIMED', 'ANYTIME', 'WEEKLY')], heads)
    rule = await pg.evaluate("""() => { const S=window.__HT29S2, out={};
      for(const h of (window.__MOCK_DB.habits||[])) out[h.id]=S.sectionOf(h); return out; }""")
    place = await pg.evaluate("""() => { const o={}; let cur=null;
      for(const c of document.getElementById('log').children){
        if(c.classList.contains('grp')) cur=c.getAttribute('data-sec');
        else if(c.classList.contains('li')) o[c.getAttribute('data-h')]=cur; } return o; }""")
    chk('S2b · every row sits under the section the rule gives it',
        all(place[k] == rule[k] for k in place), [(k, place[k], rule[k]) for k in place if place[k] != rule[k]][:4])
    # AMENDED BY NAME, HT-31 (paste 143 S1.6), 2026-09-22: the first clause is GONE. Cory, 9/21: "when
    # I set any nightly time it appears always in the morning routine" - a planned time placing a row in
    # Morning is that defect, and with `habits.section` absent it placed every timed row there at every
    # hour. The other two terms are FIELDS, not clocks, and they stand: weekly by cadence, the Sabbath by
    # what it is. `h0` carries a 05:00 and is now a Standard until Cory moves it, which he can do from
    # the row or the sheet in one tap.
    chk('S2c · the rule: weekly -> weekly, the Sabbath -> night, else standards - and NEVER by the clock',
        rule.get('h0') == 'standards' and rule.get('h11') == 'weekly' and rule.get('h1') == 'night', rule)
    # THE SHEET IS OPENED FIRST. Asked with the sheet shut, `#eSection` is absent because nothing is on
    # screen - the check passed with the column present, and would pass with the field always shown.
    await pg.click('#log .li .edp')
    await pg.wait_for_timeout(700)
    sheet = await pg.evaluate("""() => ({ open: !!document.querySelector('#esheet'),
      section: !!document.getElementById('eSection'),
      fields: document.querySelectorAll('#esheet input, #esheet select, #esheet textarea').length })""")
    # AMENDED BY NAME, HT-31 (paste 143 S1.6), 2026-09-22: REVERSED, deliberately, and this is the
    # other half of the defect above. HT-29 withheld the field when the column was missing, on the sound
    # rule that a field which cannot save is a lie (R70.289) - but the consequence was that Cory could
    # not place a task at all, so the CLOCK placed it for him, which is what he reported. The field is
    # offered now whatever the database has: without the column the choice is kept on the device
    # (`__HT31SEC`, localStorage) and written up the moment the column exists. It saves, so it is not a
    # lie; it just saves somewhere smaller until the migration lands.
    chk('S2d · with no section column the OPEN sheet STILL offers Section - it saves to the device',
        sheet['open'] and sheet['fields'] > 0 and sheet['section'], sheet)
    await no_errors(pg, errs, 'S2 (no column)')
    await b.close()

    # the stored section wins, the sheet writes it, and "Done when" is the definition
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __BLOCKS=True,
                                                           __SECTIONS={'h0': 'night', 'h11': 'standards'}))
    place = await pg.evaluate("""() => { const o={}; let cur=null;
      for(const c of document.getElementById('log').children){
        if(c.classList.contains('grp')) cur=c.getAttribute('data-sec');
        else if(c.classList.contains('li')) o[c.getAttribute('data-h')]=cur; } return o; }""")
    chk('S2e · a stored section wins over the rule', place.get('h0') == 'night' and place.get('h11') == 'standards',
        {k: place.get(k) for k in ('h0', 'h11')})
    await pg.evaluate("() => { window.__UPDATES=[]; const r=document.querySelector('#log .li[data-h=h0] .edp'); r.click(); }")
    await pg.wait_for_timeout(500)
    sheet = await pg.evaluate("""() => { const s=document.getElementById('eSection'), n=document.getElementById('eNotes');
      const body=document.getElementById('ebody'), more=document.getElementById('h30More');
      const lab=x => { const l=x.querySelector('.lab'); return l ? l.textContent.trim() : null; };
      const surface=[...body.children].filter(x => x!==more && !x.classList.contains('eh')
                     && !x.classList.contains('etools') && !x.classList.contains('note')).map(lab).filter(Boolean);
      return { has:!!s, val:s&&s.value, opts:s?[...s.options].map(o=>o.value):[],
               notesInput: !!n, surface: surface }; }""")
    # AMENDED BY NAME, HT-30 (paste 137 S3.8), 2026-09-20. Cory took the free text off this sheet:
    # "the notes/free-text field on the edit page goes (hidden, data kept)". So the same three checks
    # ask the same three questions and get his new answers - Section is still there and still carries
    # the row's own value; "Done when" is NOT on the sheet; and because the input is absent, saving
    # must not write `notes` AT ALL (writing '' or null would have wiped every definition of done -
    # the defect `saveSheet` now guards against by element presence, as it already did for the cue).
    chk('S2f · the sheet has Section (four, the row\'s own selected), and no free text (HT-30 S3.8)',
        sheet['has'] and sheet['val'] == 'night' and sheet['opts'] == ['morning', 'night', 'weekly', 'standards']
        # the FIELD is what "no free text" means: HT-30 hides the textarea and leaves its row inside
        # "More" (hidden, never deleted), so the LABEL is still in the DOM and `#eNotes` is not.
        and not sheet['notesInput']
        # AMENDED BY NAME, HT-31 (paste 143 S2.11): 'Planned time' leaves the SURFACE - the chip on the
        # row is where a time is set now - and folds under More with Group, Days and Link. Not deleted.
        and sheet['surface'] == ['Name', 'Section', 'Planned minutes'], sheet)
    await pg.select_option('#eSection', 'standards')
    await pg.click('#eSave')
    await pg.wait_for_timeout(700)
    wrote = await pg.evaluate("() => (window.__UPDATES||[]).map(u=>u[1]).filter(p=>p && p.section!==undefined)")
    chk('S2g · saving the sheet writes the section, and does NOT touch the definition',
        bool(wrote) and wrote[0]['section'] == 'standards' and wrote[0].get('notes') is None
        and 'notes' not in wrote[0], wrote[:1])
    # the definition still rides the name - set where it lives now (the row), not through a field the
    # sheet no longer offers
    title = await pg.evaluate("""async () => { const h=(window.__HT25S3.state().habits||[]).filter(x=>x.id==='h0')[0];
      if(h) h.notes='shoes on and out of the door';
      await window.__HT11.reload();
      const n=document.querySelector('#log .li[data-h=h0] .nm'); return n && n.getAttribute('title'); }""")
    chk('S2h · the definition of done rides the name', (title or '').startswith('Done when: shoes on'), title)
    # the dots: on time, late, beyond - from the check-off's own clock against the planned time
    await pg.evaluate("""() => { const t=window.__HT24.today(), d=window.__MOCK_DB.days.find(r=>r.date===t&&r.user_id==='u-mock');
      d.checked={ h0:'05:10', h1:'06:20', h2:'09:00' };
      window.__MOCK_DB.habits.find(h=>h.id==='h1').cadence='daily';
      return window.__HT11.reload(); }""")
    await pg.wait_for_timeout(1200)
    dots = await pg.evaluate("""() => [...document.querySelectorAll('#log .li')].map(r=>{
        const d=r.querySelector('.dot29'), dat=r.querySelector('.dat');
        return { id:r.getAttribute('data-h'), cls:d?d.className.replace('dot29 ',''):null, say:d?d.getAttribute('data-say'):null,
                 datShown:dat?getComputedStyle(dat).display!=='none':null }; }).filter(x=>x.cls||x.datShown)""")
    by = {d['id']: d for d in dots}
    chk('S2i · one dot per timed check-off: on time (<=15) · late (<=60) · beyond',
        by.get('h0', {}).get('cls') == 'ontime' and by.get('h1', {}).get('cls') == 'late' and by.get('h2', {}).get('cls') == 'beyond', dots[:4])
    chk('S2j · never a number in the row: the old time label is hidden',
        all(d['datShown'] is False for d in dots if d['cls']), dots[:4])
    await pg.evaluate("() => document.querySelector('#log .li[data-h=h1] .dot29').click()")
    await pg.wait_for_timeout(200)
    said = await pg.evaluate("() => (document.getElementById('toast')||{}).textContent||''")
    chk('S2k · the minutes are one tap away', 'min' in said and '50' in said, said)
    await no_errors(pg, errs, 'S2 (with the column)')
    await b.close()

    # the add-link may PLACE a standard that is already on the list (no name is ever in this repository)
    # the default fixture's list holds "Prayer" (the BIGSET one does not) - the point is a name already there
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL),
                                  qs=add_link([{'n': 'Prayer', 's': 'night'}, {'n': 'A brand new one', 's': 'night', 't': '21:45'}]))
    await pg.wait_for_timeout(900)
    card = await pg.evaluate("() => { const n=document.getElementById('h28First'); return n && n.classList.contains('on') ? n.innerText : null; }")
    chk('S2l · the add-link card offers to place what is already there', card and 'night routine' in card.lower(), (card or '')[:160])
    await pg.evaluate("() => { window.__UPDATES=[]; window.__INSERTS=[]; const b=document.getElementById('h28Seed'); b && b.click(); }")
    await pg.wait_for_timeout(900)
    res = await pg.evaluate("() => ({ up:(window.__UPDATES||[]).map(u=>u[1]), ins:(window.__INSERTS||[]).map(i=>i[1]), add:window.__h28Add })")
    ins = res['ins'][0] if res['ins'] else []
    chk('S2m · it adds the missing one with its section and places the one that exists',
        res['add'] and res['add'].get('placed') == 1 and res['add'].get('added') == 1
        and any(u.get('section') == 'night' for u in res['up'])
        and any(r.get('section') == 'night' for r in (ins if isinstance(ins, list) else [ins])), res)
    await no_errors(pg, errs, 'S2 (add-link)')
    await b.close()


# =============================================================================================
# S3 · THE GROUP
# =============================================================================================
async def sec_s3(pw):
    print("\n--- S3 · the group, both ways ---")
    # before the SQL: the lines still count, but nothing pretends to open
    b, pg, errs = await open_page(pw, 1280, 800, flags={'__BIGSET': True, '__CIRCLE': True, '__GAPS29': True})
    card = await pg.evaluate("""() => { const g=document.getElementById('h18Group');
      return { txt:g?g.innerText:null, cols:[...g.querySelectorAll('thead th')].map(t=>t.textContent),
               open:g.querySelectorAll('[data-h29m]').length,
               detail:(()=>{const d=g.querySelector('.h18more'); return d?getComputedStyle(d).display:null;})() }; }""")
    # ---- AMENDED BY HT-32 S3.7 (CC HT 2026-09-23) - SIX COLUMNS ----
    # member . today . 7 days . 30 days . NEED . logged. Cory, 9/22: "a metric ... what
    # percentage you have to hit each day to get to 80%", and S3.7 puts it "as a column in
    # GROUP". The check's floor is unchanged - the same five facts are still asserted, in the
    # same renderer - and only the expected list grew, because the paste asked for a column.
    chk('S3a · six columns: member · today · 7 days · 30 days · need · logged',
        card['cols'] == ['member', 'today', '7 days', '30 days', 'need', 'logged'], card['cols'])
    chk('S3b · DETAIL is retired from the card', card['detail'] == 'none', card['detail'])
    chk('S3c · before the SQL a member\'s line does not open', card['open'] == 0, card['open'])
    rows = await pg.evaluate("""() => [...document.querySelectorAll('#h18Group tbody tr')].map(r=>[...r.children].map(c=>c.textContent.trim()))""")
    andrew = [r for r in rows if r and r[0].startswith('Andrew')]
    chk('S3d · Ruling 1: three unlogged days drag Andrew\'s 7 days to 41% and his 30 days to 64%',
        andrew and andrew[0][1] == '71%' and andrew[0][2] == '41%' and andrew[0][3] == '64%', andrew)
    # the `logged` cell moved from index 4 to 5 when `need` landed between them. Indexing by
    # POSITION is what made this check move at all; it reads the last cell now, which is what
    # `logged` is and what it will stay.
    chk('S3e · logged N/7 counts the days he actually logged', andrew and andrew[0][-1] == '4/7', andrew)
    await no_errors(pg, errs, 'S3 (before the SQL)')
    await b.close()

    # after the SQL: a member's day opens, and carries no journal field
    b, pg, errs = await open_page(pw, 1280, 800, flags=dict(SQL, __BIGSET=True, __CIRCLE=True))
    opens = await pg.evaluate("() => document.querySelectorAll('#h18Group [data-h29m]').length")
    chk('S3f · after the SQL every member\'s line opens', opens == 3, opens)
    await pg.evaluate("() => document.querySelector('#h18Group [data-h29m]').click()")
    await pg.wait_for_timeout(900)
    day = await pg.evaluate("""() => { const o=document.querySelector('.ov.on');
      return { open:!!o, title:o?(o.querySelector('h2,.ovh,.oh')||{}).textContent:null, text:o?o.innerText:'',
               html:o?o.innerHTML:'', rows:o?o.querySelectorAll('.h29r').length:0,
               ticks:o?[...o.querySelectorAll('.h29r.on')].length:0,
               dots:o?[...o.querySelectorAll('.dot29')].map(d=>d.className):[],
               secs:o?[...o.querySelectorAll('.grp')].map(g=>g.textContent):[] }; }""")
    chk('S3g · a member\'s day shows their sections and check marks, read only',
        # AMENDED BY NAME, HT-31 (paste 143 S1.6): 'Morning routine' -> 'Standards'. This fixture's rows
        # have no stored section, and a clock no longer places one, so the member's day heads the same
        # rows under the section they are actually in. What the line asserts - that a co-member's day
        # comes with ITS SECTIONS and its check marks, and is read-only - is untouched.
        day['open'] and day['rows'] >= 2 and day['ticks'] == 1 and 'Standards' in day['secs'], {k: day[k] for k in ('rows', 'ticks', 'secs')})
    chk('S3h · the late dot is computed from their own clock (06:40 against 06:00)',
        any('late' in c for c in day['dots']), day['dots'])
    chk('S3i · the rating NUMBER shows', re.search(r'rated \d', day['text']) is not None, day['text'][:120])
    leak = [s for s in SECRETS if s in day['html']]
    chk('S3j · no journal field is anywhere in a member\'s day', not leak, leak)
    whole = await pg.evaluate("() => document.documentElement.innerHTML")
    chk('S3k · no journal field of a member is anywhere in the page', not [s for s in SECRETS if s in whole], [s for s in SECRETS if s in whole])
    reads = await pg.evaluate("""() => (window.__READS||[]).filter(r=>['day_private','habits','profile_private'].indexOf(r.table)>=0)
      .filter(r=>{ const f=r.filters||{}; const u=f.user_id||f.id;
                   return u == null || Array.isArray(u) || String(u)!=='u-mock'; })""")
    # `u == null` is the whole point: an UNSCOPED read - `from('day_private').select(...)` with no filter at
    # all, the worst case and the one privacy_check.py exists for - fell out of this filter and was reported
    # as clean, because undefined is neither an array nor a different user.
    chk('S3l · the app never reads another person\'s standards or journal table', not reads, reads[:2])
    await pg.evaluate("() => { const b=document.querySelector('.ov.on .ovx, .ov.on [data-x], .ov.on .tbtn'); b && b.click(); }")
    await pg.wait_for_timeout(300)
    stranger = await pg.evaluate("() => window.__HT29GRP.openDay('u-nobody').then(()=> (document.getElementById('toast')||{}).textContent||'')")
    chk('S3m · a stranger\'s day is nothing at all', 'nothing to show' in (stranger or ''), stranger)
    await no_errors(pg, errs, 'S3 (after the SQL)')
    await b.close()

    # the join card, and the Group panel
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True), wait=2000,
                                  init="try{ localStorage.setItem('ht_join_code','ABC123'); }catch(e){}")
    await pg.evaluate("""() => { window.__MOCK_DB.circles.push({id:'c-x',name:'The Group',join_code:'ABC123',owner_id:'u-z'});
      return window.__HT11.reload(); }""")
    await pg.wait_for_timeout(1400)
    j = await pg.evaluate("() => { const n=document.getElementById('h29Join'); return n && n.classList.contains('on') ? n.innerText : null; }")
    chk('S3n · a join link asks once, after sign-in, in plain words', j and 'ABC123' in j, (j or '')[:120])
    # the tap joins and then reloads the page after 400 ms (a fresh load is how the group's caches clear), so the
    # evidence is read before that: the call that was made, the membership it created, and the code forgotten
    await pg.evaluate("() => { window.__RPCS=[]; document.getElementById('h29JoinYes').click(); }")
    await pg.wait_for_timeout(200)
    joined = await pg.evaluate("""() => ({ rpcs:(window.__RPCS||[]).map(r=>r.name+':'+JSON.stringify(r.args)),
      members:(window.__MOCK_DB.circle_members||[]).filter(m=>m.circle_id==='c-x').length,
      code:(()=>{try{return localStorage.getItem('ht_join_code');}catch(e){return 'x';}})() })""")
    chk('S3o · the tap joins by code, makes the membership and forgets the code',
        any('ht29_join_circle' in r and 'ABC123' in r for r in joined['rpcs'])
        and joined['members'] == 1 and not joined['code'], joined)
    await no_errors(pg, errs, 'S3 (join card)')
    await b.close()

    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __CIRCLE=True))
    await pg.evaluate("() => { window.__UPSERTS=[]; }")
    await settings(pg)
    panel = await pg.evaluate("() => { const g=document.getElementById('g29Set'); return g ? g.innerText : null; }")
    chk('S3p · Settings -> Group shows the code and an invite',
        bool(panel) and 'ABC123' in panel and 'invite' in panel.lower(), (panel or '')[:140])
    # HT-32 N3 (2026-09-23): there is no "Save profile" button any more - Cory, 9/22: "I don't wanna
    # have to click save". The ASSERTION here is unchanged and is the one that matters: typing a name
    # must CREATE the row a new member never had (HT-29 S3's own defect). What changed is how a
    # person gets there - type, then leave the field - so the test types and blurs.
    await pg.evaluate("""() => { const n=document.getElementById('pName');
      if(n){ n.value='Cory O'; n.dispatchEvent(new Event('input',{bubbles:true})); n.blur(); } }""")
    await pg.wait_for_timeout(1400)
    ups = await pg.evaluate("() => (window.__UPSERTS||[]).filter(u=>u[0]==='profiles').map(u=>u[1])")
    chk('S3q · typing a profile name still CREATES the row a new member never had - and now with '
        'no button to press (HT-32 N3)',
        bool(ups) and ups[0].get('id') == 'u-mock' and ups[0].get('display_name') == 'Cory O', ups[:1])
    await no_errors(pg, errs, 'S3 (group panel)')
    await b.close()


# =============================================================================================
# S5 · ONE INSIGHTS
# =============================================================================================
async def sec_s5(pw):
    print("\n--- S5 · one Insights ---")
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __BLOCKS=True, __CIRCLE=True))
    bar = await pg.evaluate("""() => { const b=document.getElementById('h29Bar');
      return { on:!!b && getComputedStyle(b).display!=='none', tabs:[...(b?b.children:[])].map(x=>x.textContent),
               shown:[...(b?b.children:[])].filter(x=>!x.hasAttribute('hidden')).map(x=>x.textContent),
               old:(()=>{const t=document.getElementById('vTabs'); return t?getComputedStyle(t).display:null;})() }; }""")
    # AMENDED BY NAME, HT-30 (paste 137 S6.14), 2026-09-20: Cory asked for ONE tab, so the bar's
    # middle door is hidden (never deleted - it is still the second child, with `hidden` on it). The
    # property this line asserts - the phone has ONE bottom bar and the old tabs are not a second door
    # - is unchanged, and is now stronger: there are two doors on it, not three.
    chk('S5a · the phone has one bottom bar: Today · Insights',
        bar['on'] and bar['shown'] == ['Today', 'Insights'] and bar['old'] == 'none', bar)
    await pg.click('#h29Bar [data-t29=insights]')
    await pg.wait_for_timeout(800)
    # HT-30 moves these three cards onto the one Insights page; they keep their ids, classes and
    # `data-i29`, so they are read by what they are rather than by the box they sit in.
    ins = await pg.evaluate("""() => { const five=document.getElementById('c5Five'),
        more=document.getElementById('c5More');
      return { cards:[...document.querySelectorAll('.h29c')].map(c=>c.getAttribute('data-i29')),
               labels:[...document.querySelectorAll('.h29c > .lab')].map(l=>l.textContent),
               fiveUnderMore:!!(five && more && more.contains(five)), moreOpen:more?more.open:null,
               wide:document.documentElement.scrollWidth, vw:innerWidth,
               vis:getComputedStyle(document.getElementById('h26Ins')).display }; }""")
    # AMENDED BY NAME, HT-30 (paste 137 S6.14): the same three cards, in the order Cory's one page
    # puts them - the trend, then the group side by side, then what makes a good day. "Exactly three,
    # and these three" is what this line asserts, and it still does.
    chk('S5b · exactly three on the surface', ins['cards'] == ['trend', 'group', 'rate'], ins['cards'])
    chk('S5c · HT-26\'s five are under More, not gone', ins['fiveUnderMore'] and ins['moreOpen'] is False, ins)
    chk('S5d · no horizontal scroll at 390', ins['wide'] <= ins['vw'] + 1, (ins['wide'], ins['vw']))
    bars7 = await pg.evaluate("() => document.querySelectorAll('.h29c .ch29 rect').length")
    await pg.click('[data-i29r="30"]')
    await pg.wait_for_timeout(400)
    bars30 = await pg.evaluate("() => document.querySelectorAll('.h29c .ch29 rect').length")
    chk('S5e · 7 days and 30 days are one chart with two ranges', bars7 == 7 and bars30 == 30, (bars7, bars30))
    lines = await pg.evaluate("() => [...document.querySelectorAll('.h29c .ch29 polyline')].map(p=>p.getAttribute('class'))")
    chk('S5f · the rating rides the same chart as a line', any('l29r' in c for c in lines), lines)
    await pg.evaluate("() => { const n=[...document.querySelectorAll('[data-i29n]')].filter(b=>!b.disabled)[0]; n && n.click(); }")
    await pg.wait_for_timeout(400)
    rate = await pg.evaluate("""() => { const c=document.querySelector('[data-i29="rate"]');
      return { text:c.innerText, rows:c.querySelectorAll('.c5r').length, why:c.querySelectorAll('.h29why > div').length,
               leak:['SECRET-WHY'].filter(s=>c.innerHTML.indexOf(s)>=0) }; }""")
    chk('S5g · tapping a rating shows what those days had in common, and your own whys',
        rate['rows'] >= 1 and rate['why'] >= 1 and not rate['leak'], {k: rate[k] for k in ('rows', 'why', 'leak')})
    grp = await pg.evaluate("""() => { const c=document.querySelector('[data-i29="group"]');
      return { cols:[...c.querySelectorAll('thead th')].map(t=>t.textContent), rows:c.querySelectorAll('tbody tr').length }; }""")
    # SAME RENDERER, SAME COLUMNS - which is the point of the check, and is why it had to move
    # with S3a rather than being pinned separately. If these two lists ever disagree again, two
    # renderers have come back.
    chk('S5h · the group side by side is the same renderer',
        grp['cols'] == ['member', 'today', '7 days', '30 days', 'need', 'logged'] and grp['rows'] == 4, grp)
    await no_errors(pg, errs, 'S5 (phone)')
    await b.close()

    b, pg, errs = await open_page(pw, 1280, 800, flags=dict(SQL, __BIGSET=True, __CIRCLE=True))
    await pg.evaluate("() => { const s=document.getElementById('tStrip'); s && s.click(); }")
    await pg.wait_for_timeout(700)
    ov = await pg.evaluate("""() => { const o=document.querySelector('.ov.on');
      return { open:!!o, three:document.querySelectorAll('.h29c').length,
               detailBtn:!!o && !!o.querySelector('#i29Detail') }; }""")
    chk('S5i · the desktop keeps one Insights button and shows the same three', ov['open'] and ov['three'] == 3, ov)
    await pg.evaluate("() => { const d=document.getElementById('c5More'); if(d) d.open=true; }")
    await pg.wait_for_timeout(200)
    await pg.evaluate("() => { const b=document.getElementById('i29Detail'); b && b.click(); }")
    await pg.wait_for_timeout(700)
    drawer = await pg.evaluate("() => { const d=document.getElementById('h18Draw'); return d ? !d.hidden : null; }")
    chk('S5j · DETAIL\'s page is one tap inside More', drawer is True, drawer)
    await no_errors(pg, errs, 'S5 (desktop)')
    await b.close()


# =============================================================================================
# S6 · THE JOURNAL GOES HOME
# =============================================================================================
async def sec_s6(pw):
    print("\n--- S6 · a journal goes home ---")
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True, '__CIRCLE': True})
    await settings(pg)
    panel = await pg.evaluate("() => { const p=document.getElementById('j29Set'); return p ? { t:p.innerText, drive:!!p.querySelector('#j29Conn') } : null; }")
    chk('S6a · Settings -> Journal: download always, Drive only when the app has a Google id',
        panel and 'download my journal' in panel['t'].lower() and panel['drive'] is False, panel and panel['t'][:90])
    chk('S6b · the help is three ways of five lines',
        await pg.evaluate("() => document.querySelectorAll('#j29Set .h29hb').length") == 3
        and await pg.evaluate("() => [...document.querySelectorAll('#j29Set .h29hb ol')].every(o=>o.children.length===5)"))
    async with pg.expect_download() as dl:
        await pg.click('#j29Zip')
    d = await dl.value
    path = os.path.join(HERE, '..', '..', 'ht_stage', '133', 'zip', d.suggested_filename)
    path = os.path.abspath(os.path.join(RECONCILE, 'ht_stage', '133', 'zip', d.suggested_filename))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    await d.save_as(path)
    z = zipfile.ZipFile(path)
    names = z.namelist()
    one = z.read(names[-1]).decode('utf-8')
    chk('S6c · the zip is one Markdown file a day, and it opens', len(names) >= 20 and all(n.endswith('.md') for n in names) and z.testzip() is None,
        (len(names), names[:2]))
    chk('S6d · a day file carries its frontmatter and the tracker block between markers',
        one.startswith('---\nid: JRN-') and '<!-- ht:start -->' in one and '<!-- ht:end -->' in one and '### Check-offs' in one, one[:80])
    chk('S6e · the zip holds this account only', not [s for s in SECRETS if s in ''.join(z.read(n).decode('utf-8') for n in names)])
    # the same bytes as the vault copier's Python
    day = await pg.evaluate("""() => { const k=window.__HT24.today();
      const S=window.ST && null; const st=window.__HT25S3.state();
      return { k:k, habits:st.habits, day:st.byDate[k]||null, priv:st.privAll[k]||null,
               block:window.__HT29MD.dayBlock(k, st.habits, st.byDate[k]||null, st.privAll[k]||null) }; }""")
    # AMENDED BY NAME, HT-30 (paste 137), 2026-09-20 - the precedence is turned round, and here is why.
    # This check proves the app and the vault copier write the SAME BYTES. HT-30 renames a heading Cory
    # named ("Brain dump" -> "Journal") and reorders the four sections, in all three languages that
    # write that block - but the copier lives in the CONTAINER, which paste 137's OWNS block puts
    # outside this wire. So the edited copier is staged at `ht_stage/137/container/` for the BEV lane
    # to file, and this check reads THAT copy while it exists: before the container merge it proves the
    # app matches the copier it is about to have, and after the merge (the staging folder is deleted) it
    # proves the app matches the copier it has. Neither present -> the child fails to import and this
    # FAILs by name, which is the behaviour the old comment describes and this keeps.
    # HT-31 (paste 143 S8.25), 2026-09-22: THE FALLBACK CHAIN HAD BEEN POINTING AT A COPY FROM HT-29.
    # `ESTATE` here is whatever directory holds `_reconcile`, and since R70.345 that is `BEV/_machine` -
    # so `ESTATE/tools/copiers` asked for a path that does not exist, the chain fell through to the
    # HT-29-era staged copy under `ht_stage/133/`, and this check has been comparing the app against a
    # file nobody has edited since. It said PASS the whole time. A parity check aimed at a stale copy is
    # worse than no parity check, because it is believed.
    # The container is the BEV root - `_machine`'s parent when the bus sits under `_machine`, and
    # `ESTATE` itself otherwise - and its copy is the one the app must match. HT-31 owns both sides of
    # this format, so there is no staging folder to prefer any more: 137's is landed and archived.
    container = os.path.dirname(ESTATE) if os.path.basename(ESTATE).lower() == '_machine' else ESTATE
    core = os.path.join(container, 'tools', 'copiers')
    py = core
    if not os.path.isfile(os.path.join(core, '_ht.py')):
        raise SystemExit('golden_ht29 S6f: no copier at %s - the check cannot run, and a check that '
                         'cannot run is not a pass (134 R1)' % core)
    code = ("import sys,json,datetime\n"
            "sys.path.insert(0, r'%s')\nsys.path.insert(0, r'%s')\n"
            "import _ht as H\n"
            "d=json.load(sys.stdin)\n"
            "print(H.day_block(datetime.date.fromisoformat(d['k']), d['habits'], d['day'], d['priv']), end='')\n" % (core, py))
    payload = os.path.join(RECONCILE, 'ht_stage', '133', 's1', 'parity_day.json')
    os.makedirs(os.path.dirname(payload), exist_ok=True)
    io.open(payload, 'w', encoding='utf-8', newline='\n').write(json.dumps(day))
    code = code.replace("json.load(sys.stdin)", "json.load(io.open(r'%s', encoding='utf-8'))" % payload).replace(
        "import sys,json,datetime", "import sys,json,io,datetime")
    # the child prints "·" - without this its stdout is cp1252 on Windows and the bytes cannot match
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    r = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, encoding='utf-8',
                       errors='replace', env=env)
    chk('S6f · the app and the vault copier write the same bytes for the same day',
        r.returncode == 0 and r.stdout == day['block'], (r.returncode, (r.stderr or '')[-160:], (r.stdout or '')[:80], day['block'][:80]))
    await no_errors(pg, errs, 'S6 (download)')
    await b.close()

    # the Drive route, behind its id, with Google stubbed
    calls = []
    async def route(rt):
        calls.append((rt.request.method, rt.request.url, (rt.request.post_data or '')[:4000]))
        url = rt.request.url
        if '/drive/v3/files?' in url and rt.request.method == 'GET':
            await rt.fulfill(status=200, content_type='application/json', body=json.dumps({'files': []}))
        else:
            await rt.fulfill(status=200, content_type='application/json', body=json.dumps({'id': 'fid-' + str(len(calls))}))
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __GOOGLE_ID='1-a.apps.googleusercontent.com'),
                                  init=GOOGLE_STUB, routes=[('https://www.googleapis.com/**', route)])
    await settings(pg)
    chk('S6g · with the id, Connect Google Drive appears', await pg.evaluate("() => !!document.getElementById('j29Conn')"))
    await pg.click('#j29Conn')
    await pg.wait_for_timeout(1500)
    gis = await pg.evaluate("() => window.__GIS")
    chk('S6h · Google is asked for the narrowest Drive scope, with the app\'s own id',
        gis and gis['scope'] == 'https://www.googleapis.com/auth/drive.file' and gis['client_id'] == '1-a.apps.googleusercontent.com', gis)
    made = [c for c in calls if c[0] == 'POST']
    chk('S6i · it makes the folder and writes a Markdown file a day',
        any('drive/v3/files' in c[1] and 'Habit Tracker Journal' in c[2] for c in made)
        and any('uploadType=multipart' in c[1] and '<!-- ht:start -->' in c[2] for c in made), [c[1] for c in made][:4])
    await no_errors(pg, errs, 'S6 (drive)')
    await b.close()

    # the vault account never sees the Drive route (Ruling 2)
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __GOOGLE_ID='1-a.apps.googleusercontent.com'))
    await pg.evaluate("""() => { window.__MOCK_DB.app_config.push({key:'vault_user',value:'u-mock'});
      return window.__HT11.reload(); }""")
    await pg.wait_for_timeout(900)
    await pg.evaluate("() => { const c=window.__HT29S6.cfg(); c.loaded=false; return window.__HT29S6.loadCfg(); }")
    await settings(pg)
    v = await pg.evaluate("() => { const p=document.getElementById('j29Set'); return p ? p.innerText : ''; }")
    chk('S6j · the vault account is told where its journal goes, and offered no Drive',
        'BEV vault' in v and 'Connect Google Drive' not in v, v[:120])
    await no_errors(pg, errs, 'S6 (vault account)')
    await b.close()


# =============================================================================================
# S8 · SHIP: the banner and the worker
# =============================================================================================
async def sec_s8(pw):
    print("\n--- S8 · the update banner and the worker ---")
    sw = src(os.path.join(REPO, 'sw.js'))
    # AMENDED BY NAME, HT-30 (paste 137 S9.20): ht-v36 -> the version this build ships. Pinning one
    # number made the line fail on the next release rather than on a real defect; the shape is what it
    # is for - a cache name of the right form, and the two push handlers.
    chk('S8a · the service worker is a new version and answers a push', re.search(r"const C='ht-v\d+'", sw)
        and "addEventListener('push'" in sw and "addEventListener('notificationclick'" in sw, sw[:40])
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True})
    await pg.evaluate("() => { window.__RELOADED=0; window.__HT29UPD.reload=function(){ window.__RELOADED=1; }; window.__HT29UPD.show(); }")
    await pg.wait_for_timeout(300)
    hit = await pg.evaluate("""() => { const b=document.getElementById('h29Upd'); if(!b) return null;
      const r=b.getBoundingClientRect(), el=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
      return { text:b.textContent, tappable:!!el && (el===b || b.contains(el)), h:Math.round(r.height) }; }""")
    chk('S8b · the banner is on the page and takes a tap (the toast could not)',
        hit and hit['tappable'] and hit['h'] >= 44 and 'tap to refresh' in hit['text'], hit)
    # SAVES, *then* refreshes - and the save is the half that was never proven: app.js arms a 2500 ms backstop
    # reload, so a flush that never resolved (or threw) still ended in a reload and still read green here.
    await pg.evaluate("() => { window.__FLUSHED = 0; const c = window.__HT28c, f = c.flush;"
                      " c.flush = function(){ window.__FLUSHED++; return f.apply(c, arguments); }; }")
    await pg.click('#h29Upd')
    await pg.wait_for_timeout(2600)
    reloaded = await pg.evaluate("() => window.__RELOADED")
    flushed = await pg.evaluate("() => window.__FLUSHED")
    chk('S8c · the tap saves, then refreshes', reloaded == 1 and flushed >= 1,
        {'reloaded': reloaded, 'flushed': flushed})
    await no_errors(pg, errs, 'S8')
    await b.close()


# =============================================================================================
# S9 · THE EVENING NUDGE
# =============================================================================================
async def sec_s9(pw):
    print("\n--- S9 · the evening nudge ---")
    b, pg, errs = await open_page(pw, 390, 844, flags={'__BIGSET': True}, init=PUSH_STUB)
    await settings(pg)
    chk('S9a · before the sender exists there is no switch to find',
        not await pg.evaluate("() => !!document.getElementById('n29Set')"))
    await no_errors(pg, errs, 'S9 (hidden)')
    await b.close()

    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __NUDGE_PUB='BPtestpublickey'), init=PUSH_STUB)
    await pg.evaluate("() => { window.__UPSERTS=[]; }")
    await settings(pg, 1200)
    n = await pg.evaluate("""() => { const p=document.getElementById('n29Set'); if(!p) return null;
      return { text:p.innerText, on:document.getElementById('n29On').checked, noon:document.getElementById('n29Noon').value,
               eve:document.getElementById('n29Eve').value, allow:!!document.getElementById('n29Allow') }; }""")
    chk('S9b · an account with history is set on, at 12:00 and 21:00, one Allow away',
        n and n['on'] and n['noon'] == '12:00' and n['eve'] == '21:00' and n['allow'], n)
    await pg.click('#n29Allow')
    await pg.wait_for_timeout(900)
    got = await pg.evaluate("""() => ({ perm:window.__PERM||0, opts:window.__SUBOPTS,
      subs:(window.__UPSERTS||[]).filter(u=>u[0]==='push_subscriptions').map(u=>u[1]),
      prefs:(window.__UPSERTS||[]).filter(u=>u[0]==='nudge_prefs').map(u=>u[1]) })""")
    chk('S9c · Allow asks once, subscribes with the sender\'s key and stores this phone',
        got['perm'] == 1 and got['opts'] and got['opts']['userVisibleOnly'] and got['subs']
        and got['subs'][0]['endpoint'] == 'https://push.example.com/e1' and got['subs'][0]['p256dh'] == 'PKEY', got)
    chk('S9d · the times and the zone are saved with it',
        got['prefs'] and got['prefs'][0]['enabled'] is True and got['prefs'][0]['noon'] == '12:00' and got['prefs'][0]['tz'], got['prefs'][:1])
    await pg.evaluate("() => { const t=document.getElementById('n29On'); t.checked=false; t.onchange(); }")
    await pg.wait_for_timeout(800)
    off = await pg.evaluate("""() => ({ unsub:window.__UNSUB||0,
      prefs:(window.__UPSERTS||[]).filter(u=>u[0]==='nudge_prefs').map(u=>u[1]).slice(-1),
      del:(window.__WRITES||[]).filter(w=>w.table==='push_subscriptions' && w.op==='delete').length })""")
    chk('S9e · turning it off unsubscribes the phone and forgets it',
        off['unsub'] == 1 and off['del'] >= 1 and off['prefs'] and off['prefs'][0]['enabled'] is False, off)
    await no_errors(pg, errs, 'S9 (settings)')
    await b.close()

    r = subprocess.run(['node', '--test', os.path.join(REPO, 'tools', 'supabase', 'functions', 'nudge', 'core.test.mjs')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    chk('S9f · the sender\'s arithmetic and words (node --test): who is due, the Sabbath, "12 of 21 · Andrew 9 of 18"',
        r.returncode == 0 and 'fail 0' in (r.stdout or ''), (r.returncode, (r.stdout or '')[-200:]))


# =============================================================================================
# S0 · THE AUDIT, APPLIED (S0.3) - and hidden, never removed (R70.138)
# =============================================================================================
VIS29 = ("const vis = e => { if(!e) return false; const r = e.getBoundingClientRect();"
         " return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };")
COUNTS = "() => { " + VIS29 + """
  const out = {};
  for(const s of ['.sh h2 > i.n','#h16Load','.li .wk','#h18Group','#h16Score','#tape','.li .tpfx',
                  '#vYearNav .h16leg','[data-h18more]','.h19closed'])
    out[s] = [document.querySelectorAll(s).length, [...document.querySelectorAll(s)].filter(vis).length];
  return out; }"""
TOASTS = """(() => { window.__T29 = []; const t = document.getElementById('toast');
  if(!t) return; new MutationObserver(() => { if(t.classList.contains('on')) window.__T29.push(t.textContent); })
    .observe(t, { subtree:true, childList:true, attributes:true, characterData:true }); })()"""


async def sec_s0(pw):
    """Every row the audit HID: still in the DOM, and off the surface the audit names. Both halves matter -
    a row that is gone breaks R70.138, and a row still on screen means the CSS lost the cascade in silence
    (measured twice on this build: A17 lost to `.mast #tape`, A28 hid the panel inside its own drawer)."""
    print("\n--- S0 · the audit, applied ---")
    b, pg, errs = await open_page(pw, 390, 844, flags=dict(SQL, __BIGSET=True, __BLOCKS=True, __CIRCLE=True, __DOW=True),
                                  init=TOASTS)
    c = await pg.evaluate(COUNTS)
    # `.h19closed` is made by the day it belongs to, so it is asked for on a PAST day (S0l), not here
    kept = {k: v for k, v in c.items() if v[0] == 0 and k != '.h19closed'}
    chk('S0a · every hidden element is still in the DOM - hidden, never removed (R70.138)',
        not kept, kept)
    chk('S0b · A03 the input numbers: the `i.n` badges are there and none is on screen',
        c['.sh h2 > i.n'][0] >= 2 and c['.sh h2 > i.n'][1] == 0, c['.sh h2 > i.n'])
    # only headings that are RENDERED: innerText falls back to textContent inside a display:none block,
    # which would report the badge of a heading nobody can see (measured: HT-9a's retired rate block)
    heads = await pg.evaluate("() => { " + VIS29 + " return [...document.querySelectorAll('.sh h2')]"
                              ".filter(vis).map(h => h.innerText.trim()).filter(Boolean); }")
    chk('S0c · ...and no heading reads as a number glued to a word ("3JOURNAL")',
        not [h for h in heads if h[:1].isdigit()], [h for h in heads if h[:1].isdigit()])
    chk('S0d · A10 the time ledger and A15 the WEEKLY chip are off the phone',
        c['#h16Load'][1] == 0 and c['.li .wk'][1] == 0, {k: c[k] for k in ('#h16Load', '.li .wk')})
    chk('S0e · A26 the GROUP card is off the phone (Insights carries it)', c['#h18Group'][1] == 0, c['#h18Group'])
    # A09: a save must not announce itself over the boxes. The failure line is untouched and still speaks.
    await pg.evaluate("() => { const d=document.getElementById('iDump'); d.scrollIntoView({block:'center'}); }")
    await pg.tap('#iDump')
    await pg.keyboard.type('audit')
    await pg.wait_for_timeout(1600)
    said = await pg.evaluate("() => (window.__T29 || []).map(t => (t||'').trim().toLowerCase())")
    chk('S0f · A09 no "saved" toast pops over the journal while you type', 'saved' not in said, said[:4])
    # A28 on the phone: off Views, and ONE tap away - the route the audit promises, not a dead drawer
    await pg.evaluate("() => window.__HT13_TAB('views')")
    await pg.wait_for_timeout(900)
    off = await pg.evaluate("() => { " + VIS29 + " return vis(document.getElementById('h16Score')); }")
    await pg.evaluate("() => window.__HT29_DETAIL()")
    await pg.wait_for_timeout(700)
    on = await pg.evaluate("() => { " + VIS29 + """ const s=document.getElementById('h16Score');
      return { vis: vis(s), th: [...document.querySelectorAll('#vGroups thead th')].filter(vis).length }; }""")
    chk('S0g · A28 the scorecard is off the phone\'s Views and one tap inside DETAIL, not a dead drawer',
        off is False and on['vis'] and on['th'] >= 4, {'onViews': off, **on})
    await no_errors(pg, errs, 'S0 (phone)')
    await b.close()

    b, pg, errs = await open_page(pw, 1280, 900, flags=dict(SQL, __BIGSET=True, __BLOCKS=True, __CIRCLE=True, __DOW=True))
    c = await pg.evaluate(COUNTS)
    chk('S0h · A17 the second TODAY tile is off the desktop, and still in the tree',
        c['#tape'] == [1, 0], c['#tape'])
    chk('S0i · A14 the row\'s second copy of the time is off the desktop', c['.li .tpfx'][1] == 0, c['.li .tpfx'])
    chk('S0j · A22 the year chart\'s second legend is off', c['#vYearNav .h16leg'][1] == 0, c['#vYearNav .h16leg'])
    chk('S0k · A24 the GROUP card\'s DETAIL button is off (one door, through Insights -> More)',
        c['[data-h18more]'][1] == 0, c['[data-h18more]'])
    await pg.evaluate("() => window.__HT24.goDay(window.__HT24.today().slice(0, 8) + '01')")
    await pg.wait_for_timeout(900)
    past = await pg.evaluate(COUNTS)
    chk('S0l · A19 a past day still makes its CLOSED chip, and it is not on screen',
        past['.h19closed'] == [1, 0], past['.h19closed'])
    await no_errors(pg, errs, 'S0 (desktop)')
    await b.close()

    # the audit is a FILE, and each hidden row is one CSS line that names it - so the two can be compared
    audit = src(os.path.join(RECONCILE, 'ht_stage', '133', 'AUDIT.md'))
    code = src(os.path.join(REPO, 'app.css')) + src(os.path.join(REPO, 'app.js'))
    hid = re.findall(r"^\| (A\d\d) \|[^|]*\|[^|]*\| hide \|", audit, re.M)
    missing = [a for a in hid if a not in code]
    chk('S0m · every row the audit hid names its own line in the code, so deleting the line undoes it'
        ' (%d rows)' % len(hid), len(hid) >= 9 and not missing, missing)


# =============================================================================================
# S7 · THE OTHER DEVICE, WITHIN SECONDS (S7.27 · D14)
# =============================================================================================
UNCHECKED = "() => { const r=[...document.querySelectorAll('#log .li')].find(x=>!x.classList.contains('on')); return r && r.getAttribute('data-h'); }"
LIVE = "() => !!(window.__HT29RT && window.__HT29RT.live())"
IS_ON = "(h) => [...document.querySelectorAll('#log .li')].some(r => r.getAttribute('data-h')===h && r.classList.contains('on'))"


async def within(pg, h, ms=5000, step=100):
    """How long the OTHER page took to show the tick, in ms - or None if it never did."""
    import time
    t0 = time.monotonic()
    while (time.monotonic() - t0) * 1000 < ms:
        if await pg.evaluate(IS_ON, h):
            return int((time.monotonic() - t0) * 1000)
        await pg.wait_for_timeout(step)
    return None


async def sec_s7(pw):
    print("\n--- S7 · phone <-> desktop, within seconds ---")
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    D = await ctx.new_page(); P = await ctx.new_page(); errs = []
    # __SYNC_MS = 600000 puts HT-28c's pull an HOUR away, and nothing below calls pull() by hand. So the only
    # thing left that can carry a tick from one page to the other is the Realtime event S4's SQL publishes.
    for p in (D, P):
        p.on('pageerror', lambda e: errs.append(str(e)))
        await p.add_init_script(init_js(dict(SQL, __SHARED_DB=True, __REALTIME=True, __SYNC_MS=600000, __BIGSET=True)))
    await D.goto(BASE); await D.wait_for_timeout(400)
    await D.evaluate("() => localStorage.clear()")
    await D.goto(BASE); await D.wait_for_timeout(3600)
    await P.set_viewport_size({'width': 390, 'height': 844})
    await P.goto(BASE); await P.wait_for_timeout(3600)

    uid = await D.evaluate("async () => (await window.__MOCK_SB.auth.getUser()).data.user.id")
    subs = await D.evaluate("() => (window.__RT ? window.__RT.subs : []).map(s => [s.table, s.filter, s.event])")
    chk('S7a · the app subscribes to its three tables, each filtered to the signed-in user and nobody else',
        sorted(s[0] for s in subs) == ['day_private', 'days', 'habits']
        and all(s[1] == 'user_id=eq.' + uid for s in subs) and all(s[2] == '*' for s in subs), subs)
    chk('S7b · the socket is live while the page is visible - the JOIN is read, not assumed',
        await D.evaluate(LIVE) is True
        and await D.evaluate("() => window.__HT29RT.status()") == 'SUBSCRIBED',
        await D.evaluate("() => window.__HT29RT && window.__HT29RT.status()"))

    poll = await D.evaluate("() => window.__HT28c.config().POLL_MS")
    pulls0 = await D.evaluate("() => window.__HT28c.state().pulls")
    h = await P.evaluate(UNCHECKED)
    await P.click('#log .li[data-h="%s"] .bxw' % h)
    ms = await within(D, h)
    chk('S7c · a check on the phone shows on the desktop within 5 s (%s ms, with the pull %s ms away)' % (ms, poll),
        ms is not None and ms <= 5000 and poll == 600000, {'ms': ms, 'pollMs': poll})

    # a DIFFERENT row, and one the phone does not already show as done - otherwise "it arrived" would be
    # true before the desktop touched anything, which is how a green that proves nothing gets written
    h2 = await D.evaluate("(h) => { const r=[...document.querySelectorAll('#log .li')]"
                          ".find(x => !x.classList.contains('on') && x.getAttribute('data-h') !== h);"
                          " return r && r.getAttribute('data-h'); }", h)
    off = await P.evaluate(IS_ON, h2)
    await D.click('#log .li[data-h="%s"] .bxw' % h2)
    ms2 = await within(P, h2)
    chk("S7d · and the reverse: the desktop's check shows on the phone within 5 s (%s ms)" % ms2,
        ms2 is not None and ms2 <= 5000 and h2 != h and off is False, {'ms': ms2, 'h2': h2, 'wasOn': off})

    # counted from BEFORE the phone's tap, so the pull the subscription makes on joining cannot be mistaken
    # for the pull the event caused
    pulls = await D.evaluate("() => window.__HT28c.state().pulls")
    chk('S7e · it was the event that moved it, not a timer: the desktop pulled on being told to',
        pulls > pulls0, {'before': pulls0, 'after': pulls, 'fired': await D.evaluate("() => window.__RT.fired")})

    # PHASE GATE: nothing holds a connection open behind the app. Hidden closes it; coming back remakes it.
    hide = """(v) => { Object.defineProperty(document, 'visibilityState', { configurable:true, get:()=>v });
                       document.dispatchEvent(new Event('visibilitychange')); }"""
    await D.evaluate(hide, 'hidden'); await D.wait_for_timeout(400)
    gone = await D.evaluate(LIVE)
    await D.evaluate(hide, 'visible'); await D.wait_for_timeout(400)
    back = await D.evaluate(LIVE)
    chk('S7f · hidden closes the socket and coming back remakes it (PHASE GATE)', gone is False and back is True,
        {'hidden': gone, 'visible': back})
    chk('S7g · zero page errors on either device', not errs, errs[:2])
    await b.close()

    # the publication the subscription needs is IN the migration - a subscription to a table that is not
    # published is a socket that never speaks, and nothing on screen would say so
    sql = src(os.path.join(REPO, 'tools', 'sql', '2026-09-15_ht29.sql'))
    pub = re.search(r"alter publication supabase_realtime add table", sql) and \
        re.search(r"array\[([^\]]*)\]", sql[sql.find('supabase_realtime'):])
    chk('S7h · S4 publishes the three tables this subscribes to', bool(pub)
        and all(("'%s'" % t) in pub.group(1) for t in ('days', 'day_private', 'habits')),
        pub.group(1) if pub else None)


SECTIONS = {'S0': sec_s0, 'S1': sec_s1, 'S2': sec_s2, 'S3': sec_s3, 'S5': sec_s5, 'S6': sec_s6, 'S7': sec_s7,
            'S8': sec_s8, 'S9': sec_s9}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    a = ap.parse_args()
    async with async_playwright() as pw:
        for s in ([a.only] if a.only else list(SECTIONS)):
            if s not in SECTIONS:
                raise SystemExit('unknown section %s' % s)
            await SECTIONS[s](pw)
    bad = [n for ok, n in RES if not ok]
    print('\nGOLDEN HT-29: %d/%d PASS, %d FAIL' % (len(RES) - len(bad), len(RES), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
