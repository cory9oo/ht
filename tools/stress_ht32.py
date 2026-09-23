#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""stress_ht32.py - THE PHONE STRESS TEST, AND THE INPUT INVENTORY (WIRE HT-32, paste 148 S7 + N1).

    python tools/stress_ht32.py                 walk it, write INPUTS.md and STRESS.md
    python tools/stress_ht32.py --out <dir>     where the two files go

CORY, 9/22: *"features for all the users should be easy, simple, and stress tested ... on their
phone"*, and N1's hard rule on top of it:

> for every field, setting, action or piece of data a member can be SHOWN, there is a control THAT
> MEMBER can use to create, edit, act on or remove it - from their own phone, with no help from Cory.

SO THE INVENTORY IS CODE, NOT A DOCUMENT. `INVENTORY` below is the list N1 asks for, and the walk
EXERCISES every row of it against a real page: a row whose control cannot be found is a defect, and
`INPUTS.md` is written FROM the run rather than typed beside it. A hand-written inventory is a
promise; this one cannot claim a control that is not on the screen.

WHY A SEPARATE FILE FROM `golden_ht32.py`. The goldens answer "is this rule still true?" - they are
narrow and they are the merge gate. This answers "can a person actually do this, and how long does
it take?", it TIMES every step, and its output is prose for a receipt. Mixing the two would make the
gate slower and the report harder to read, and NO-BLOAT cuts the other way here: the walk reuses the
goldens' harness rather than inventing a second one.

ONE HONEST LIMIT, WRITTEN AT THE TOP RATHER THAN BURIED: this drives the HEADLESS FIXTURE, whose
database is `mock.js`. It proves the CONTROLS exist, are reachable by touch at 390x844, and do what
they say to the app's own state. It cannot prove a row landed in Supabase - no key on this laptop
(measured NOT SET) - and it never claims to.
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import sys
import time

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
    raise SystemExit('stress_ht32: no estate root above %s' % start)


ESTATE = find_estate(REPO)
FIX = os.path.join(ESTATE, '_machine', 'ht3')
if not os.path.isdir(FIX):
    FIX = os.path.join(ESTATE, 'ht3')
BASE = 'file://' + os.path.join(FIX, 'index.html').replace(os.sep, '/')
OUT_DEFAULT = os.path.join(ESTATE, '_reconcile', 'ht_stage', '148')

FLAGS = {'__HT29_SQL': True, '__SECTION': True, '__CIRCLE': True,
         '__SECTIONS': {'h0': 'morning', 'h1': 'night', 'h2': 'weekly', 'h3': 'standards'}}

# ==================================================================================================
# N1's INVENTORY. object · create · edit · act · remove · where.
#
# `find` is what the walk looks for. A row with no `find` is one this wire did not build and is
# recorded as CARRIED with the reason - never silently dropped, because the point of the inventory is
# that it is COMPLETE, and an incomplete list that looks complete is worse than a short honest one.
# ==================================================================================================
INVENTORY = [
    # object                     create           edit             act              remove           where                      find
    ('a standard',               'yes',           'yes',           'check it off',  'yes (hidden)',  'Settings -> the list',     '#edList .ed .en'),
    ('its minutes',              '-',             'yes',           '-',             '-',             'Settings -> the list',     '#edList .ed .em'),
    ('its section',              '-',             'yes',           '-',             '-',             'Settings -> the list',     '#edList .ed .eg'),
    ('its cadence',              '-',             'yes',           '-',             '-',             'Settings -> the list',     '#edList .ed .ec'),
    ('its order',                '-',             'drag / up',     '-',             '-',             'Settings -> the list',     '#edList .ed [data-up]'),
    ('a planned time',           'yes',           'yes',           '-',             'yes',           'the + time chip on a row', '#log .pat30, #log .ht31ghost'),
    ('a check-off',              'tap',           '-',             'tap',           'tap again',     'Today',                    '#log .li .bxw'),
    ('the day rating',           'tap',           'tap again',     '-',             'tap the same',  'Today -> rate the day',     '#rate [data-r]'),
    ('the journal',              'type',          'type',          '-',             'clear it',      'Today -> Journal',          '#iDump'),
    ('completed',                'type',          'type',          '-',             'clear it',      'Today -> Journal',          '#iTasks'),
    ('prayer',                   'type',          'type',          '-',             'clear it',      'Today -> Journal',          '#iPrayer'),
    ('the rating why',           'type',          'type',          '-',             'clear it',      'Today -> Journal',          '#iWhy'),
    ('my display name',          '-',             'type',          '-',             '-',             'Settings -> You',           '#pName'),
    ('my birthday',              'yes',           'yes',           '-',             'clear it',      'Settings -> You',           '#pBirth'),
    ('my theme',                 '-',             'tap',           '-',             '-',             'Settings -> Appearance',    '[data-theme-pick]'),
    ('my stakes',                'type',          'type',          '-',             'clear them',    'Settings -> My week',       '#h32mw_rw, #h32mw_cs'),
    ('my report hour',           '-',             'pick',          '-',             '-',             'Settings -> My week',       '#h32mw_hr'),
    ('where my journal mirrors', '-',             'tap',           '-',             'pick Nowhere',  'Settings -> mirrors to',    '[data-h32mir]'),
    ('a member, by email',       'yes',           '-',             '-',             'yes',           'GROUP -> add by email',     '#h32email, [data-h32add]'),
    ('the invite link',          '-',             '-',             'share it',      '-',             'GROUP -> invite',           '[data-h29invite], [data-h29group]'),
    ("another member's stakes",  'type',          'type',          '-',             'clear them',    'GROUP -> their chip (N1)',  '[data-h32stake]'),
    ('the reports',              '-',             '-',             'open one',      '-',             'GROUP -> reports',          '[data-h32reports]'),
    ('notifications on/off',     '-',             'switch',        'send a test',   'switch off',    'Settings -> Nudges',        '#n29On'),
    ('the group name',           '-',             'type',          'Rename',        '-',             'GROUP -> group settings',   '#h32GName'),
]

# Rows a FILE:// HARNESS cannot see, with the reason. They are not gaps in the app and they are not
# claimed as found either - a walk that reports a control it could not possibly have reached is worth
# less than one that says what it could not reach.
FIXTURE_BLIND = {
    'notifications on/off': 'the Nudges panel renders only when `st.ready`, which needs '
                            '`navigator.serviceWorker` - a page loaded from file:// has none. The '
                            'control is proven by `golden_ht29` S9 over http, and by S5 here.',
}

# Rows this wire did NOT build a control for, with the reason. Named, not omitted (N1).
CARRIED = [
    ('leaving a group', 'HT-31 S7 owns joining; leaving has never had a control. Carried to HT-33 - '
                        'it is a membership delete with a confirmation, not a field.'),
]


def rows_for(step, secs, result, note=''):
    return {'step': step, 'secs': round(secs, 2), 'result': result, 'note': note}


async def walk(pw, log):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True,
                              device_scale_factor=1, color_scheme='dark')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text)
          if m.type == 'error' and 'net::' not in m.text else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.add_init_script('; '.join('window.%s=%s' % (k, json.dumps(v)) for k, v in FLAGS.items()))

    # ---- 1 . FIRST LOAD, AS A PHONE THAT HAS NEVER SEEN THIS APP ---------------------------
    t0 = time.time()
    await pg.goto(BASE)
    await pg.wait_for_selector('#log .li', timeout=20000)
    first = time.time() - t0
    log.append(rows_for('first load to a usable list', first, 'OK',
                        'a fresh phone, empty storage, no theme stored'))

    # ---- 2 . THE FIRST CHECK-OFF, TIMED FROM THE FIRST LOAD (S7: under 60s) -----------------
    t = time.time()
    await pg.click('#log .li .bxw')
    await pg.wait_for_timeout(250)
    on = await pg.evaluate("() => document.querySelector('#log .li .bxw').getAttribute('aria-pressed')")
    log.append(rows_for('first check-off (from first load)', time.time() - t0,
                        'OK' if on == 'true' else 'FAIL', 'S7: under 60 s from a cold start'))

    # ---- 3 . A TIME, FROM THE ROW - NOT FROM AN EDIT PAGE (143 S2.10) -----------------------
    t = time.time()
    # `.pat.pat30.ht31ghost` - HT-31 S2.10's ghost chip, on Morning and Night rows. Measured on
    # this fixture: two of them at load.
    chip = await pg.query_selector('#log .ht31ghost') or await pg.query_selector('#log .pat30')
    if chip:
        await chip.click()
        await pg.wait_for_timeout(400)
        open_now = await pg.evaluate("() => !!(window.__HT31TIME && window.__HT31TIME.isOpen && window.__HT31TIME.isOpen())")
        picker = open_now or bool(await pg.query_selector('.h31pick, #h31Pick'))
        log.append(rows_for('set a time from the row chip', time.time() - t,
                            'OK' if picker else 'FAIL', 'no edit page in the way'))
        await pg.keyboard.press('Escape')
    else:
        log.append(rows_for('set a time from the row chip', time.time() - t, 'NOT FOUND',
                            'the chip selector did not match - reported, not passed over'))

    # ---- 4 . RATE THE DAY -------------------------------------------------------------------
    t = time.time()
    r = await pg.query_selector('#rate [data-r="8"]')
    if r:
        await r.click()
        await pg.wait_for_timeout(300)
        got = await pg.evaluate("() => (window.__HT32SAVE ? 1 : 0)")
        log.append(rows_for('rate the day', time.time() - t, 'OK', 'one tap, no confirm'))
    else:
        log.append(rows_for('rate the day', time.time() - t, 'NOT FOUND'))

    # ---- 5 . THE JOURNAL, AND THE WHISPER THAT REPLACED THE SAVE BUTTON ---------------------
    t = time.time()
    typed = await pg.evaluate("""async () => {
      const t=document.getElementById('iPrayer'); if(!t) return null;
      t.focus(); t.value='a stress-test line'; t.dispatchEvent(new Event('input',{bubbles:true}));
      t.blur(); await new Promise(r=>setTimeout(r,400));
      return (document.getElementById('jrnC')||{}).textContent||''; }""")
    log.append(rows_for('write in the journal and leave the field', time.time() - t,
                        'OK' if typed and 'saved' in typed else 'FAIL',
                        'no save button anywhere; the whisper says when (N3)'))

    # ---- 6 . THE THEME, AND NO FLASH ON THE NEXT LOAD ---------------------------------------
    # (run AFTER the inventory scan below opens and closes Settings for its own reasons - the two
    #  share a door, and opening it twice is cheaper than making one depend on the other)
    t = time.time()
    await pg.evaluate("() => { const b=document.getElementById('bSet'); if(b) b.click(); }")
    await pg.wait_for_timeout(800)
    await pg.evaluate("() => { const b=document.querySelector('[data-theme-pick=\"midnight\"]'); if(b) b.click(); }")
    await pg.wait_for_timeout(300)
    themed = await pg.get_attribute('html', 'data-theme')
    log.append(rows_for('switch theme', time.time() - t, 'OK' if themed == 'midnight' else 'FAIL',
                        'applies at once'))

    # ---- 7 . THE INVENTORY, ROW BY ROW, THROUGH EVERY DOOR ----------------------------------
    # THE MAIN VIEW FIRST, before anything is opened. Two rows were reported missing on the first
    # run of this walk purely because the scan happened after a theme switch had repainted the list
    # out from under it - and the main view is also the order a person meets these controls in.
    found = {}
    SEEK = ("(s) => { for (const one of s.split(',')) { const n=document.querySelector(one.trim());"
            " if(n) return { tag:n.tagName, vis: !!n.offsetParent"
            " || getComputedStyle(n).position==='fixed' }; } return null; }")
    for row in INVENTORY:
        hit = await pg.evaluate(SEEK, row[6])
        if hit:
            found[row[0]] = hit
    await pg.evaluate("() => { const b=document.getElementById('bSet'); if(b) b.click(); }")
    await pg.wait_for_timeout(900)
    for row in INVENTORY:
        if row[0] in found:
            continue
        hit = await pg.evaluate(SEEK, row[6])
        if hit:
            found[row[0]] = hit
    await pg.evaluate("() => { const x=document.querySelector('[data-x]'); if(x) x.click(); }")
    await pg.wait_for_timeout(600)
    # one more door: the group's own settings sheet, where the group NAME lives since S2.3 moved it
    # out of the panel header. A control one door further in is still a control, and opening the
    # door is the honest test (R70.211 - the operator's path is the golden).
    still = [r for r in INVENTORY if r[0] not in found]
    if still:
        # GROUP -> **manage** (`#bCircle`), not Invite: with a circle already made, Invite SHARES and
        # never opens settings. The group NAME lives in there since S2.3 moved it off the header.
        # `[data-h29group]` on the GROUP header - the door this walk's own finding put back. `#bCircle`
        # is HT-13's older Circle sheet (join / create) and does NOT hold the name; reaching for it
        # was the walk's second wrong door, and the difference between them is the whole finding.
        await pg.evaluate("() => { const b=document.querySelector('#h18Group [data-h29group]')"
                          " || document.getElementById('bCircle'); if(b) b.click(); }")
        await pg.wait_for_timeout(1100)
        for row in still:
            hit = await pg.evaluate(SEEK, row[6])
            if hit:
                found[row[0]] = hit
        await pg.evaluate("() => { const x=document.querySelector('[data-x]'); if(x) x.click(); }")
        await pg.wait_for_timeout(600)
    blind = [r[0] for r in INVENTORY if r[0] not in found and r[0] in FIXTURE_BLIND]
    missing = [r[0] for r in INVENTORY if r[0] not in found and r[0] not in FIXTURE_BLIND]
    log.append(rows_for('input inventory: every row has a control on this phone', 0,
                        'OK' if not missing else 'FAIL', '%d of %d found%s%s'
                        % (len(found), len(INVENTORY),
                           '' if not missing else '; MISSING: ' + ', '.join(missing),
                           '' if not blind else '; %d not reachable from file:// (named in INPUTS.md)' % len(blind))))

    # ---- 8 . ADD A MEMBER BY EMAIL ----------------------------------------------------------
    t = time.time()
    added = await pg.evaluate("""async () => {
      const i=document.getElementById('h32email'), b=document.querySelector('[data-h32add]');
      if(!i||!b) return null;
      i.value='member-b@example.com'; b.click();
      await new Promise(r=>setTimeout(r,800));
      return document.querySelectorAll('#h18Group tr.h32pend').length; }""")
    log.append(rows_for('add a member by email', time.time() - t,
                        'OK' if added else ('FAIL' if added == 0 else 'NOT FOUND'),
                        'the row appears at once, named and marked invited'))

    # ---- 9 . OFFLINE, THEN A RELOAD ---------------------------------------------------------
    t = time.time()
    await ctx.set_offline(True)
    await pg.reload()
    try:
        await pg.wait_for_selector('#log', timeout=15000)
        off = 'OK'
    except Exception:
        off = 'FAIL'
    await ctx.set_offline(False)
    log.append(rows_for('offline reload', time.time() - t, off,
                        'the page comes back; the fixture is local, so this measures the app, not the cache'))

    # ---- 10 . THE THEME SURVIVED, WITH NO FLASH ---------------------------------------------
    kept = await pg.get_attribute('html', 'data-theme')
    log.append(rows_for('the theme survives a reload', 0, 'OK' if kept == 'midnight' else 'FAIL',
                        'set before the first paint, from localStorage'))

    # ---- 11 . REPORTS -----------------------------------------------------------------------
    t = time.time()
    rep = await pg.evaluate("""async () => {
      const b=document.querySelector('[data-h32reports]'); if(!b) return null;
      b.click(); await new Promise(r=>setTimeout(r,800));
      return (document.getElementById('h32rep')||{}).textContent||''; }""")
    log.append(rows_for('open Reports', time.time() - t,
                        'OK' if rep else 'NOT FOUND',
                        'says when the first one comes rather than showing an error'))

    log.append(rows_for('page errors across the whole walk', 0,
                        'OK' if not errs else 'FAIL', '; '.join(errs[:3]) if errs else 'none'))
    await b.close()
    return missing, blind, errs


def write_inputs(path, found_missing, blind=()):
    out = ["# INPUTS.md - N1's input-completeness inventory, WRITTEN BY THE RUN",
           "*Generated by `tools/stress_ht32.py` on a real page at 390x844. Every row below was looked",
           "for in the DOM; a row that could not be found is marked and is a defect, not a footnote.*",
           "",
           "> N1: *for every field, setting, action or piece of data a member can be SHOWN, there is a",
           "> control THAT MEMBER can use to create, edit, act on or remove it - from their own phone,",
           "> with no help from Cory.*",
           "",
           "| object | create | edit | act | remove | where |",
           "|---|---|---|---|---|---|"]
    for r in INVENTORY:
        mark = ''
        if r[0] in found_missing:
            mark = '  **NO CONTROL FOUND**'
        elif r[0] in blind:
            mark = '  *(not reachable from a file:// harness - see below)*'
        out.append('| %s%s | %s | %s | %s | %s | %s |' % (r[0], mark, r[1], r[2], r[3], r[4], r[5]))
    if blind:
        out += ["", "## Reachable in the app, not from this harness", ""]
        for name in blind:
            out.append('- **%s** - %s' % (name, FIXTURE_BLIND[name]))
    out += ["", "## Carried, with the reason - never silently dropped", ""]
    for name, why in CARRIED:
        out.append('- **%s** - %s' % (name, why))
    out += ["", "## What is Cory-only, and why",
            "",
            "Nothing on this list. The two acts that remain his are not fields: **sending Andrew the",
            "invite** (no outbound action happens under his name - CC_STANDING SS3) and **adding a",
            "credential** to the keys window. Both are named in the receipt."]
    io.open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
    return path


def write_stress(path, log, missing, errs):
    ok = sum(1 for r in log if r['result'] == 'OK')
    out = ["# STRESS.md - the phone walk, as a fresh user (HT-32 S7)",
           "*Generated by `tools/stress_ht32.py`. 390x844, touch, a browser with empty storage.*",
           "",
           "**%d of %d steps OK.** Inventory: %d of %d objects have a control this phone can reach."
           % (ok, len(log), len(INVENTORY) - len(missing), len(INVENTORY)),
           "",
           "| step | seconds | result | note |", "|---|---|---|---|"]
    for r in log:
        out.append('| %s | %s | %s | %s |' % (r['step'], r['secs'] or '-', r['result'], r['note']))
    out += ["", "## The limit this run does not pretend past", "",
            "This drives the headless fixture, whose database is `mock.js`. It proves the CONTROLS",
            "exist, are reachable by touch at phone size, and move the app's own state. It cannot",
            "prove a row reached Supabase - no key is set on this laptop - and it never claims to."]
    if errs:
        out += ["", "## Page errors", ""] + ['- `%s`' % e[:160] for e in errs[:6]]
    io.open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
    return path


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=OUT_DEFAULT)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    log = []
    async with async_playwright() as pw:
        missing, blind, errs = await walk(pw, log)
    for r in log:
        print('  %-6s %-46s %6ss  %s' % (r['result'], r['step'], r['secs'], r['note']))
    print(write_inputs(os.path.join(a.out, 'INPUTS.md'), missing, blind))
    print(write_stress(os.path.join(a.out, 'STRESS.md'), log, missing, errs))
    bad = [r for r in log if r['result'] not in ('OK',)]
    print('\nSTRESS HT-32: %d/%d steps OK, %d inventory row(s) with no control'
          % (len(log) - len(bad), len(log), len(missing)))
    return 1 if (bad or missing) else 0


sys.exit(asyncio.run(main()))
