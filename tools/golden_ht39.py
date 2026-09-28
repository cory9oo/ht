#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-293 GOLDEN 39 - THE JOURNAL (paste 293 S3), run literally.

    python tools/golden_ht39.py            python tools/golden_ht39.py --only S3

Cory, Monday 2026-09-28 09:23 CDT: "I do not wanna see a ledger of my journal entry [in Settings] ... a little
clickable option on the journal title where it says ledger ... well organized" · "journal brain [dump], then
completed, and then prayer should populate the Obsidian, the journal ledger, and the Google Docs in the same
format ... editable from either ... a bilateral editable system ... one-to-one", and 09:31 "google docs first
for other users - for Andrew and I it will be obsidian".

  S1  THE TRIFECTA: Journal · Completed · Prayer, in that order, on Today, in the ledger, in the Doc body, in the
      Markdown the vault gets (the BEV copier's own headings, read from its source).
  S2  THE LEDGER: a `Ledger` tap on the journal title (phone and desktop) opens it; newest first; a sticky month
      header; one row per day with three marks; a tap opens that day; no journal list in Settings.
  S3  GOOGLE DOCS, against a mocked Drive: Settings offers "Mirror to Google Docs" (off); the app saves first and
      the Doc follows with the whole body; a Doc edited outside the app wins when the day is opened and is saved;
      an untouched Doc changes nothing; a token that lapses mid-save is re-asked at the next tap and nothing is lost.
"""
import argparse, asyncio, json, os, re, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from golden293_lib import Golden, REPO, CONTAINER, open_page, src, no_errors, today_key_js   # noqa: E402

G = Golden('HT-39 (paste 293 S3 · the journal)')
chk = G.chk
ORDER = ['Journal', 'Completed', 'Prayer']

# An in-memory Google: the token client answers at once; Drive keeps files in window.__DRIVE.
MOCK_GOOGLE = r"""
(function(){
  window.__DRIVE = { files:{}, n:0, calls:[], fail401:0 };
  window.google = { accounts:{ oauth2:{
    initTokenClient: function(cfg){ return { requestAccessToken: function(){
      window.__TOKENS = (window.__TOKENS || 0) + 1;
      setTimeout(function(){ cfg.callback({ access_token:'tok' + window.__TOKENS, expires_in:3600 }); }, 5); } }; },
    revoke: function(){} } } };
  var real = window.fetch;
  function resp(status, body, text){ return Promise.resolve({ status:status, ok:status >= 200 && status < 300,
    json:function(){ return Promise.resolve(body); }, text:function(){ return Promise.resolve(text != null ? text : JSON.stringify(body)); } }); }
  function multipart(b){
    var parts = String(b).split(/--[^\r\n]+\r\n/), meta = {}, text = '';
    parts.forEach(function(p){
      var i = p.indexOf('\r\n\r\n'); if(i < 0) return;
      var head = p.slice(0, i), body = p.slice(i + 4).replace(/\r\n--[^\r\n]*--\s*$/, '').replace(/\r\n$/, '');
      if(/application\/json/.test(head)) meta = JSON.parse(body); else if(/text\/plain/.test(head)) text = body;
    });
    return { meta:meta, text:text };
  }
  window.fetch = function(url, o){
    url = String(url); o = o || {};
    if(url.indexOf('googleapis.com') < 0) return real.apply(this, arguments);
    var D = window.__DRIVE, m = (o.method || 'GET').toUpperCase();
    D.calls.push(m + ' ' + url.replace(/\?.*$/, ''));
    if(D.fail401 > 0){ D.fail401--; return resp(401, { error:'expired' }); }
    var now = new Date(Date.now() + (D.n++) * 1000).toISOString();
    var q = decodeURIComponent((/[?&]q=([^&]+)/.exec(url) || [])[1] || '');
    if(m === 'GET' && /\/export\?/.test(url)){
      var id = /files\/([^/]+)\/export/.exec(url)[1]; return resp(200, null, D.files[id].text);
    }
    if(m === 'GET' && q){
      var name = (/name='((?:[^'\\]|\\.)*)'/.exec(q) || [])[1], par = (/'([^']+)' in parents/.exec(q) || [])[1];
      var out = Object.keys(D.files).map(function(k){ return D.files[k]; }).filter(function(f){
        return f.name === name && (!par || (f.parents || []).indexOf(par) >= 0) &&
               (!/folder/.test(q) || f.mimeType === 'application/vnd.google-apps.folder'); });
      return resp(200, { files:out.map(function(f){ return { id:f.id, modifiedTime:f.modifiedTime, appProperties:f.appProperties }; }) });
    }
    if(m === 'POST' && /\/drive\/v3\/files\?/.test(url) && !/upload/.test(url)){
      var meta0 = JSON.parse(o.body), id0 = 'F' + D.n;
      D.files[id0] = { id:id0, name:meta0.name, mimeType:meta0.mimeType, parents:[], modifiedTime:now };
      return resp(200, { id:id0 });
    }
    if(/upload\/drive\/v3\/files/.test(url)){
      var mp = multipart(o.body), idm = (/files\/([^?]+)\?/.exec(url) || [])[1];
      var f = idm ? D.files[idm] : (D.files['F' + D.n] = { id:'F' + D.n });
      if(mp.meta.name) f.name = mp.meta.name; if(mp.meta.parents) f.parents = mp.meta.parents;
      if(mp.meta.mimeType) f.mimeType = mp.meta.mimeType; if(mp.meta.appProperties) f.appProperties = mp.meta.appProperties;
      f.text = mp.text; f.modifiedTime = now;
      return resp(200, { id:f.id, modifiedTime:now });
    }
    return resp(404, { error:'mock has no route for ' + m + ' ' + url });
  };
})();
"""
FLAGS = {'__GOOGLE_ID': 'test-client.apps.googleusercontent.com'}
MIRROR_ON = "try{localStorage.setItem('ht29_drive', JSON.stringify({connected:true, mirror:true}))}catch(e){}"


async def s1(pw):
    G.sec('S1', 'the trifecta, everywhere')
    b, pg, errs = await open_page(pw, 390, 844)
    labs = await pg.evaluate("""() => { const want = ['iDump', 'iTasks', 'iPrayer'];
        const ys = want.map(id => { const n = document.getElementById(id); return n ? Math.round(n.getBoundingClientRect().top) : null; });
        return ys; }""")
    chk('S1a . Today: Journal (the brain dump) above Completed above Prayer',
        None not in labs and labs[0] < labs[1] < labs[2], labs)
    body = await pg.evaluate("() => window.__HT293DOCS.body('2026-09-28', { brain_dump:'dump', tasks:'done', prayer:'pray' })")
    heads = re.findall(r'^## (\w+)$', body, re.M)
    chk('S1b . the Doc body carries the three headings, in order', heads == ORDER, body)
    back = await pg.evaluate("() => window.__HT293DOCS.parse('Journal\\nA line\\n\\nCompleted\\nB\\nPrayer\\nC')")
    chk('S1c . and reads back what a Doc gives as plain text (headings with or without ##)',
        back == {'brain_dump': 'A line', 'tasks': 'B', 'prayer': 'C'}, back)
    md = await pg.evaluate("""() => window.__HT29MD.dayBlock('2026-09-28', [], null,
        { brain_dump:'DUMP', tasks:'DONE', prayer:'PRAY', rating:7, why:'' })""")
    got = [h for h in re.findall(r'^### (\w+)', md or '', re.M) if h in ORDER]
    chk('S1d . the Markdown the vault gets (the same bytes as the BEV copier, golden_ht29 S6) runs Journal · Completed · Prayer',
        got == ORDER, (md or '')[:200])
    copier = os.path.join(CONTAINER, 'tools', 'copiers', '_ht.py')
    cs = src(copier) if os.path.isfile(copier) else ''
    fh = cs[cs.find('FIELD_HEADS'):cs.find('FIELD_HEADS') + 400] if 'FIELD_HEADS' in cs else ''
    heads_py = re.findall(r'\("(brain_dump|tasks|prayer)",\s*"(\w+)"', fh)
    chk('S1e . Obsidian (Cory): the vault copier writes the same three headings in the same order',
        [h for _, h in heads_py][:3] == ORDER, heads_py)
    await no_errors(G, pg, errs, 'S1')
    await b.close()


async def s2(pw):
    G.sec('S2', 'the ledger')
    for (w, h, tag) in ((390, 844, 'phone'), (1280, 720, 'desktop')):
        b, pg, errs = await open_page(pw, w, h)
        tap = await pg.evaluate("() => { const t = window.__HT293.ledger.title(); const b = t && t.parentNode.querySelector('.h293lt'); return b ? b.textContent.trim() : null; }")
        chk('S2a . %s . the journal title carries a `Ledger` tap' % tag, tap == 'Ledger', tap)
        await pg.evaluate("() => window.__HT293.ledger.title().parentNode.querySelector('.h293lt').click()")
        await pg.wait_for_timeout(400)
        led = await pg.evaluate("""() => { const n = document.getElementById('h293Led');
            const rows = [...n.querySelectorAll('[data-h293day]')].map(r => r.getAttribute('data-h293day'));
            const mo = n.querySelector('.h293moh');
            return { open: !n.hidden && n.getBoundingClientRect().height > 0, rows, sorted: rows.slice().sort().reverse(), months: n.querySelectorAll('.h293moh').length,
                     sticky: mo ? getComputedStyle(mo).position : null, marks: [...n.querySelectorAll('.h293ld')].slice(0, 3).map(r => r.querySelectorAll('.h293mk i').length),
                     other: [...n.children].map(c => c.className) }; }""")
        chk('S2b . %s . it opens on its own screen, one row per written day (%d)' % (tag, len(led['rows'])), led['open'] and len(led['rows']) >= 20, led)
        chk('S2c . %s . newest first' % tag, led['rows'] == led['sorted'], led['rows'][:4])
        chk('S2d . %s . grouped by month under a sticky month header' % tag, led['months'] >= 1 and led['sticky'] == 'sticky', led)
        chk('S2e . %s . each row: the date, the first line of the Journal, three marks - and nothing else on the screen' % tag,
            led['marks'] and all(m == 3 for m in led['marks']) and led['other'] == ['h293lh', 'h293lb'], led)
        pick = led['rows'][3]
        await pg.evaluate("(k) => document.querySelector('#h293Led [data-h293day=\"' + k + '\"]').click()", pick)
        await pg.wait_for_timeout(600)
        on = await pg.evaluate("() => [window.__HT293.S().date, document.getElementById('h293Led').hidden]")
        chk('S2f . %s . a tap opens that day\'s entry' % tag, on == [pick, True], [on, pick])
        await pg.evaluate("() => document.getElementById('bSet').click()")
        await pg.wait_for_timeout(900)
        inset = await pg.evaluate("() => { const ov = document.querySelector('.ov'); return !!(ov && (ov.querySelector('#h26Jrn') || ov.querySelector('#vJournal .vje'))); }")
        chk('S2g . %s . Settings no longer carries a journal list' % tag, not inset, 'the list is in Settings')
        await no_errors(G, pg, errs, 'S2 (%s)' % tag)
        await b.close()


async def s3(pw):
    G.sec('S3', 'Google Docs, both ways (mocked Drive)')
    b, pg, errs = await open_page(pw, 390, 844, flags=FLAGS, init=MOCK_GOOGLE)
    await pg.evaluate("() => document.getElementById('bSet').click()")
    await pg.wait_for_timeout(900)
    t = await pg.evaluate("() => { const c = document.getElementById('h293Docs'); return c ? [c.checked, c.closest('label').textContent.trim()] : null; }")
    chk('S3a . Settings -> Journal offers "Mirror to Google Docs", off by default', t and t[0] is False and 'Mirror to Google Docs' in t[1], t)
    await pg.evaluate("() => document.getElementById('h293Docs').click()")                  # the tap: sign in, then mirror
    await pg.wait_for_timeout(1500)
    d = await pg.evaluate("""() => { const D = window.__DRIVE, fs = Object.values(D.files);
        return { folder: fs.filter(f => /folder/.test(f.mimeType||'')).map(f => f.name),
                 docs: fs.filter(f => /document/.test(f.mimeType||'')).map(f => [f.name, f.parents && f.parents.length, f.text, !!(f.appProperties||{}).ht293s]) }; }""")
    k = await pg.evaluate(today_key_js())
    docs = d['docs']
    chk('S3b . the tap signs in and writes today as a Google Doc "HT Journal %s" in the folder "HT Journal"' % k,
        d['folder'] == ['HT Journal'] and docs and docs[0][0] == 'HT Journal ' + k and docs[0][1] == 1, d)
    body = docs[0][2] if docs else ''
    chk('S3c . its body is the three headings, in order, with the entry\'s words', re.findall(r'^## (\w+)$', body, re.M) == ORDER, body[:160])
    await pg.keyboard.press('Escape')
    await b.close()

    # the app saves first, the Doc follows - typed into Today's Prayer box
    b, pg, errs = await open_page(pw, 390, 844, flags=FLAGS, init=MOCK_GOOGLE + MIRROR_ON)
    await pg.evaluate("() => { return new Promise(r => { window.__HT293.drive().signIn().then(() => r(1), () => r(0)); }); }")
    await pg.fill('#iPrayer', 'PRAYED-293')
    await pg.wait_for_timeout(3500)
    s = await pg.evaluate("""() => { const w = (window.__WRITES||[]).filter(x => JSON.stringify(x).indexOf('PRAYED-293') >= 0).length;
        const doc = Object.values(window.__DRIVE.files).find(f => /document/.test(f.mimeType||''));
        return { saved: w, doc: doc ? doc.text : null }; }""")
    chk('S3d . a save reaches the database first and the Doc follows with the whole body', s['saved'] >= 1 and s['doc'] and 'PRAYED-293' in s['doc']
        and re.findall(r'^## (\w+)$', s['doc'], re.M) == ORDER, s)
    # a Doc edited OUTSIDE the app wins when the day is opened; an untouched Doc changes nothing
    before = await pg.evaluate("() => (window.__WRITES||[]).length")
    await pg.evaluate("() => window.__HT293DOCS.pull(window.__HT293.S().date)")
    await pg.wait_for_timeout(800)
    after = await pg.evaluate("() => (window.__WRITES||[]).length")
    chk('S3e . an untouched Doc changes nothing on open', after == before, [before, after])
    # a person opening the day is not typing in it: the box is left first (the pull never lands under his fingers)
    await pg.evaluate("() => document.activeElement && document.activeElement.blur()")
    await pg.wait_for_timeout(2000)
    await pg.evaluate("""() => { const doc = Object.values(window.__DRIVE.files).find(f => /document/.test(f.mimeType||''));
        doc.text = '## Journal\\nWRITTEN-IN-DOCS\\n\\n## Completed\\nDID-IT\\n\\n## Prayer\\nPRAYED-IN-DOCS\\n'; }""")
    await pg.evaluate("() => window.__HT293DOCS.pull(window.__HT293.S().date)")
    await pg.wait_for_timeout(1500)
    w = await pg.evaluate("""() => ({ box: document.getElementById('iPrayer').value,
        saved: (window.__WRITES||[]).filter(x => JSON.stringify(x).indexOf('PRAYED-IN-DOCS') >= 0).length,
        restamped: (() => { const doc = Object.values(window.__DRIVE.files).find(f => /document/.test(f.mimeType||''));
                            return doc.appProperties.ht293s === window.__HT293DOCS.sigText(doc.text); })() })""")
    chk('S3f . a Doc edited in Google Docs wins on open: the words land in the box AND are saved', w['box'] == 'PRAYED-IN-DOCS' and w['saved'] >= 1, w)
    chk('S3g . and the Doc is re-stamped, so the next open is quiet (one entry <-> one Doc)', w['restamped'] is True, w)
    # REVIEW OF 293's DIFF: a line of his own that reads like a heading ("Prayer:") inside the brain dump, in a Doc NOBODY
    # edited, must never be re-split into the wrong parts and saved over his entry
    await pg.fill('#iDump', 'first thought\nPrayer:\nstill the brain dump')
    await pg.wait_for_timeout(3500)
    await pg.evaluate("() => document.activeElement && document.activeElement.blur()")
    await pg.wait_for_timeout(1200)
    before2 = await pg.evaluate("() => (window.__WRITES||[]).length")
    await pg.evaluate("() => window.__HT293DOCS.pull(window.__HT293.S().date)")
    await pg.wait_for_timeout(1200)
    after2 = await pg.evaluate("() => [(window.__WRITES||[]).length, document.getElementById('iDump').value]")
    chk('S3g2 . an untouched Doc whose journal holds a heading-like line ("Prayer:") is never re-split or re-saved',
        after2[0] == before2 and 'Prayer:' in after2[1] and 'still the brain dump' in after2[1], [before2, after2])
    # stress 4: the token lapses mid-save -> the entry is already saved; the next tap re-asks and mirrors again
    await pg.evaluate("() => { window.__DRIVE.fail401 = 1; }")
    await pg.fill('#iPrayer', 'AFTER-EXPIRY')
    await pg.wait_for_timeout(3500)
    mid = await pg.evaluate("""() => ({ saved: (window.__WRITES||[]).filter(x => JSON.stringify(x).indexOf('AFTER-EXPIRY') >= 0).length,
        pending: Object.keys(window.__HT293DOCS.state().pending || {}) })""")
    chk('S3h . stress 4: with the token gone the entry is still saved, and the day is held as pending', mid['saved'] >= 1 and mid['pending'], mid)
    tokens0 = await pg.evaluate("() => window.__TOKENS || 0")
    await pg.evaluate("() => document.querySelector('.colL').click()")
    await pg.wait_for_timeout(2500)
    end = await pg.evaluate("""() => { const doc = Object.values(window.__DRIVE.files).find(f => /document/.test(f.mimeType||''));
        return { tokens: window.__TOKENS || 0, doc: doc.text.indexOf('AFTER-EXPIRY') >= 0, pending: Object.keys(window.__HT293DOCS.state().pending || {}) }; }""")
    chk('S3i . and the next tap re-asks Google and mirrors it - not a word lost', end['tokens'] > tokens0 and end['doc'] and not end['pending'], end)
    await no_errors(G, pg, errs, 'S3')
    await b.close()


async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only')
    a = ap.parse_args()
    secs = [('S1', s1), ('S2', s2), ('S3', s3)]
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
