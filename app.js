/* ==========================================================================
   Habit Tracker — a ledger of the self.
   One sealed closure. Nothing reaches global scope but ST.
   ========================================================================== */
(function () {
'use strict';

var SB_URL = 'https://ykxxiwrjuvdvwrfweceo.supabase.co';
var SB_KEY = 'sb_publishable_ZMRDhEgkKSnbuntc_y_xDA_QirkAxoC';   /* public by design — every table sits behind RLS */

var sb = (window.__MOCK_SB) || window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
window.ST = { sb: sb };

/* ---- HT-26 S1 · THE FIVE INPUTS ONLY — Cory, 2026-09-10 15:15 ----------------------------
   "No new inputs of any kind; delete the sleep display." The day takes exactly five inputs:
   check-offs · the 1–10 rating with its why · the brain dump · completed · prayer. Sleep, bed,
   wake, the Saturday weight and tomorrow's one thing are HIDDEN, NEVER REMOVED (R70.138): their
   columns stay in the database and their code stays in this file, but while this is true nothing
   probes, reads, writes or renders them — so a column that exists in production only because a
   migration once ran (or never ran) cannot matter to this build. The later layers read it as
   `ST.fiveInputsOnly`. */
var FIVE_INPUTS_ONLY = true;
window.ST.fiveInputsOnly = FIVE_INPUTS_ONLY;
/* HT-29 S1 (PASTE 133): HT-9a kept the brain dump in localStorage because its column did not exist yet. It does,
   and the stopgap was overwriting the box with '' after every check-off. Retired here, kept whole below. */
var HT9A_DUMP_STOPGAP = false;

var WD    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var WD2   = ['S','M','T','W','T','F','S'];
var MO    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var GRADE = [[97,'A+',5],[90,'A',4],[80,'B',3],[70,'C',2],[60,'D',1],[0,'F',0]];
var SKINS = ['statement','carbon','terminal','blueprint'];
/* KPI BAND config — lead measures are DERIVED from GOAL MATH (x32), never hand-picked,
   and HELD by R35.7 until GOAL_MATH.md locks. Ships dark; hard-codes no trio. */
var HT_KPI = { enabled:false, source:'GOAL_MATH.md — not yet locked', measures:[] };

var S = {
  me:null, priv0:null, habits:[], days:[], byDate:{},
  date:null, priv:null, privAll:{},
  sort:'order', grp:'all', find:'', removed:[], circle:null, hasCue:true, view:null, yearY:null,
  hasPredict:true,
  calYM:null, calMode:'pct'
};

/* ============================ helpers ============================ */
function el(i){ return document.getElementById(i); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dk(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dnum(k){ return new Date(k+'T12:00:00'); }
function today(){ return dk(new Date()); }
function shift(k,n){ var d=dnum(k); d.setDate(d.getDate()+n); return dk(d); }
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function fmt(m){ m=Math.round(m||0); if(!m) return '—';
  var h=Math.floor(m/60), r=m%60; return h? (h+'h'+(r?' '+r+'m':'')) : (r+'m'); }
function grade(p){ if(p==null) return ['—',null];
  for(var i=0;i<GRADE.length;i++) if(p>=GRADE[i][0]) return [GRADE[i][1],GRADE[i][2]];
  return ['F',0]; }
function gcol(p){ var g=grade(p); return g[1]==null?'var(--rule2)':'var(--g'+g[1]+')'; }
/* fills read as density, linear in the percentage, so 45 and 65 are not the same colour */
function dens(p){
  if(p==null) return 'var(--sunk)';
  var t=Math.round(8+clamp(p,0,100)*0.92);
  return 'color-mix(in srgb, var(--accent) '+t+'%, var(--sunk))';
}
/* HT-16 S6: postgres `time` comes back as HH:MM:SS; the row prefix and the <input type=time>
   both want HH:MM, and a null must stay a null rather than becoming the string "null". */
function hhmm(t){
  if(t==null||t==='') return null;
  var m=String(t).match(/^(\d{1,2}):(\d{2})/);
  return m? (('0'+m[1]).slice(-2)+':'+m[2]) : null;
}
function minsOf(t){ var v=hhmm(t); if(!v) return null;
  return (+v.slice(0,2))*60 + (+v.slice(3,5)); }
function fmtHM(m){ if(m==null) return '\u2014'; m=Math.max(0,Math.round(m));
  var h=Math.floor(m/60), r=m%60; return h? (h+'h'+(r?' '+r+'m':'')) : (r+'m'); }
/* ---- HT-22 S1 . THE PLANNED WINDOW, AND IT HAS ONE ADDRESS (R70.284 - CONSOLIDATE) -------
   The 2026-09-09 migration added `planned_start` / `planned_end`. `time_anchor` and
   `minutes_planned` are what every row has actually carried since HT-16. THEY SAY THE SAME
   THING, and the failure mode of two columns that say the same thing is that they disagree -
   which is why HT-21 S2 collapsed two minutes inputs into one write. So ONE function answers
   "when is this planned", and the row, the sort, on-time, DETAIL and the vault note all ask
   it. Persisted value first, derived value second, null last: all 36 rows are NULL across the
   three new columns today, and a build that needs them filled in order to render is a build
   that breaks for him before he has opened a single sheet.
   NOTHING HERE WRITES. Deriving on read is what stops a stale `planned_start` from outranking
   the anchor he can see and edit; the write happens once, in the sheet, from that same anchor.

   `fmtClock` IS HOISTED HERE FROM THE HT-16 CLOSURE, unchanged. HT-19 B0.1 named the rule this
   obeys: one computation, one name, one definition. It had one caller there and has four now
   across two closures, so it moves up rather than being copied - a second identical body is
   the exact shape that produced `NaN:NaN` in six receipts. */
function fmtClock(min){
  if(min==null) return null;
  var m=Math.max(0, Math.round(min));
  return ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2);
}
/* ---- HT-31 S2.8 . ONE FUNCTION RENDERS EVERY TIME A HUMAN READS ------------------------------
   Cory, 9/21: "regular time, not military time". STORAGE DOES NOT MOVE - every column stays HH:MM
   24-hour and there is no migration - and this is the only place in the app where a stored clock
   becomes words. Form: `9:30 PM`, no leading zero, and a NARROW NO-BREAK SPACE (U+202F) before
   AM/PM so a chip can never wrap between the number and its half of the day. Midnight is 12:00 AM
   and noon is 12:00 PM, which is the one place a 12-hour clock trips and the one case a test must
   name. Anything that is not a clock comes back untouched, so a caller may wrap a value that can
   be null. `golden_ht31` S2 reads this file and fails if a clock is rendered anywhere else. */
function fmtTime(t){
  if(t==null || t==='') return t;
  var m=/^\s*(\d{1,2}):([0-5]\d)/.exec(String(t));
  if(!m) return String(t);
  var h=(+m[1])%24, ap=h<12?'AM':'PM', hh=h%12; if(hh===0) hh=12;
  return hh+':'+m[2]+'\u202f'+ap;
}
function planMins(h){
  if(!h) return null;
  if(h.minutes_planned!=null && h.minutes_planned!=='') return +h.minutes_planned;
  return h.minutes? +h.minutes : null;      /* the price stands in until a slot length is set */
}
function winStart(h){ return h ? (hhmm(h.planned_start) || hhmm(h.time_anchor)) : null; }
function winStartMin(h){ return minsOf(winStart(h)); }
function winEndMin(h){
  var a=winStartMin(h); if(a==null) return null;
  var e=minsOf(h && h.planned_end);
  return (e!=null && e>=a) ? e : a + (planMins(h)||0);
}
function winEnd(h){ return fmtClock(winEndMin(h)); }
/* A RULE is a standard with no planned time, and it renders NO time column - never an empty
   one. An empty column is a question the row cannot answer, and a column of them reads as a
   fault in the app rather than an absence in the data. */
function isRule(h){ return winStartMin(h)==null; }
function toast(t){ var n=el('toast'); n.textContent=t; n.classList.add('on');
  clearTimeout(toast._t); toast._t=setTimeout(function(){ n.classList.remove('on'); },1500); }

/* ---- HT-20 P1 · A NAME RENDERS VERBATIM (R70.265 · R70.79) -----------------------------
   THIS REPLACES A HELPER THAT PARSED A CLOCK PREFIX OUT OF EVERY NAME, AND IT WAS RETIRED
   BECAUSE OF A DATA LOSS THAT HAD ALREADY HAPPENED.

   Its regex made both the `:mm` and the `am/pm` OPTIONAL, so a BARE leading one- or two-digit
   number was read as a clock time too:

       "3 jugs of water a day - 1.5 gal"   ->   "jugs of water a day - 1.5 gal"

   Display-only would have been survivable. It was not display-only: the "Strip clock times"
   button in the bulk standards editor wrote that output BACK INTO THE INPUT, and the next save
   persisted it. One press and the quantity was gone from the database permanently. The
   destructive path was the WRITE path, and it only had to run once.

   So the helper is retired rather than narrowed, the button that fed it is removed with it, and
   the companion that read a start time out of a name goes too — time has had its own column,
   `time_anchor`, since HT-16 S6. Ordering and quantity are their own fields as well:
   `sort_order`, `minutes`, `minutes_planned`. A name is a string and it prints as typed.
   The retired names and the exact regex are in the HT-20 receipt; they are not kept here,
   because a retired identifier left in the source is the thing a later wire grep-restores. */
function nameOf(n){ return String(n==null?'':n); }
function skin(s){
  if(SKINS.indexOf(s)<0) s='statement';
  document.documentElement.setAttribute('data-skin',s);
  try{ localStorage.setItem('st.skin',s); }catch(e){}
  var m=document.querySelector('meta[name=theme-color]');
  if(m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--ground').trim()||'#F4F3EF');
  paintSkins();
}
function paintSkins(){
  var cur=document.documentElement.getAttribute('data-skin')||'statement';
  el('skins').innerHTML = SKINS.map(function(s){
    return '<button class="sw" data-skin="'+s+'" aria-pressed="'+(s===cur)+'" title="'+s+'" '+
      'style="background:'+skinSwatch(s)+'"></button>';
  }).join('');
}
function skinSwatch(s){
  return { statement:'#F4F3EF', carbon:'#0F1012', terminal:'#0A0A08', blueprint:'#0B1220' }[s];
}

/* ============================ selectors ============================ */
/* ---- HT-24 C1 . THE CADENCE GRAMMAR, EXTENDED RATHER THAN A NEW COLUMN --------------------
     cadence ::= 'daily' | 'weekly' | 'dow:' d(,d)*        d = 0(Sun) .. 6(Sat)
   `cadence` already exists and is already free text; `days_of_week` does not exist anywhere in
   this file (grep: 0). Adding a column would cost a live migration in Cory's browser for a
   server-side query pattern this app does not have - it pulls one user's 36 rows and filters
   client-side. A delimited set in a text column is the classic anti-pattern ONLY when it is
   queried server-side, and this one never is.

   EVERY EXISTING CALL SITE COMPARED AGAINST THE STRING 'weekly'. That means `dow:6` fell through
   as "not weekly", i.e. as DAILY - a Sabbath on a Tuesday. So the comparison gets a name, and
   `dueOn()` is the only thing that answers "is this standard due on this date". The receipt
   carries a verdict for every one of the 29 sites. */
/* ---- HT-28 E11 (PASTE 128) · ONE PARSER, ONE SERIALIZER -------------------------------------
   Every reader of `cadence` goes through parseCadence; every writer goes through serializeCadence,
   so a Days control cannot write a string the renderer cannot read (stress 8 - round-trip tested).
     parseCadence('dow: 1 , 3 ') -> {kind:'dow', days:[1,3]}      junk / empty day lists -> daily
     serializeCadence({kind:'dow', days:[3,1,1]}) -> 'dow:1,3'    all seven days -> 'daily' */
function parseCadence(c){
  if(c === 'weekly') return { kind:'weekly', days:null };
  if(typeof c === 'string' && c.slice(0,4) === 'dow:'){
    var d = c.slice(4).split(',').map(function(x){ return parseInt(String(x).trim(), 10); })
             .filter(function(n){ return n >= 0 && n <= 6; });
    if(d.length) return { kind:'dow', days:d };
  }
  return { kind:'daily', days:null };
}
function serializeCadence(p){
  if(!p || p.kind === 'daily') return 'daily';
  if(p.kind === 'weekly') return 'weekly';
  var seen = {}, d = (p.days || []).filter(function(n){
    n = +n; if(!(n >= 0 && n <= 6) || seen[n]) return false; seen[n] = 1; return true;
  }).map(Number).sort(function(a,b){ return a - b; });
  if(!d.length || d.length === 7) return 'daily';
  return 'dow:' + d.join(',');
}
/* THE SABBATH, NAMED ONCE. A standard is the Sabbath when its name starts with "Sabbath" or it sits in
   the SABBATH group - the shape HT-19 created ("Sabbath - rest and worship", group SABBATH, daily).
   HT-18's broader `/sabbath/i` would also have caught "Prepare for Sabbath", a Friday task; this does not. */
function isSabbathStd(h){
  return !!h && (/^\s*sabbath\b/i.test(String(h.name || '')) || /^sabbath$/i.test(String(h.group_name || '')));
}
/* HT-28 E/F16 · SATURDAY IS AN ORDINARY DAY WITH THE SABBATH IN IT. HT-19 B3 narrowed Saturday to the
   Sabbath alone (and on the phone that narrowing never even hid the rows - `html[data-simple] .li`
   out-ranked [hidden]). Cory's 9/10 20:30 model replaces it: the Sabbath is one due item, weight 1, and
   what rests on Saturday is each standard's own "Rests on Sabbath" switch. Hidden, never removed. */
var SABBATH_ONLY_SATURDAY = false;
/* HT-28 G21 · the app no longer creates a Sabbath standard for an account that has none. HT-19 inserted
   one silently on first load, which would have handed a brand-new user (Andrew) Cory's habit; Cory's
   own row already exists. The dedupe repair stays on. Hidden, never removed. */
var SABBATH_AUTO_INSERT = false;
/* true until this account's one-time E13 migration has run on this device (sabMigrate28 sets it false) */
var SAB_LEGACY_READ = true;
function isWeekly(h){ return !!h && parseCadence(h.cadence).kind === 'weekly'; }
function dowOf(h){
  var p = parseCadence(h && h.cadence);
  if(p.kind === 'dow') return p.days;
  /* A LEGACY SABBATH (stored 'daily' by HT-19) is Saturday-only until the app migrates the row to
     'dow:6' under the owner's own session (HT-28 E13). Without this the first paint after the deploy
     would show the Sabbath on a Tuesday and count it missing Monday to Friday. */
  if(p.kind === 'daily' && SAB_LEGACY_READ && isLegacySabbath(h)) return [6];
  return null;
}
/* ONLY THE ROW HT-19 CREATED IS LEGACY: "Sabbath - rest and worship" in group SABBATH. A person's own
   standard named Sabbath, in any other group, is left exactly as they saved it - never read as Saturday-only
   and never migrated (review of 1688104: the name-only test caught every account). */
function isLegacySabbath(h){
  return !!h && /^sabbath$/i.test(String(h.group_name || '')) && /^\s*sabbath\b/i.test(String(h.name || ''));
}
/* the Sabbath whose honour is kept: due on Saturday and on no other day */
function isSatOnly(h){ var d = dowOf(h); return !!d && d.length === 1 && d[0] === 6; }
/* due on this day at all: a weekly answers for its own period, so it is always "due" here */
function dueDay(h, k){ return isWeekly(h) || dueOn(h, k); }
/* IS THIS STANDARD DUE ON THIS DAY? A weekly answers for its own period elsewhere (weekDone);
   a `dow:` item is due only on its days; anything else is daily and always due. */
function dueOn(h, k){
  if(!h) return false;
  if(isWeekly(h)) return true;
  var d = dowOf(h);
  if(!d) return true;
  return d.indexOf(dnum(k || S.date).getDay()) >= 0;
}
/* THE THREE GROUPS (C1). Computed, never stored: TIMED is a daily item that carries a clock,
   STANDARDS is a daily item without one, WEEKLY is a weekly. There is NO SABBATH SECTION - a
   `dow:` item simply is not in the list on a day it is not due. */
function bucketOf(h){
  if(isWeekly(h)) return 'WEEKLY';
  /* HT-25 S3: the middle bucket is ANYTIME, which is Cory's word for it ("some standards have
     no time"). This is a LABEL change, not a data change - `bucketOf` was already computed and
     never stored. `STANDARDS` survives untouched in GRP_LEGACY, where it is a real group_name
     people still carry on their rows (R70.138: hidden, never removed). */
  return (winStartMin(h) != null) ? 'TIMED' : 'ANYTIME';
}
/* THE SEAM (HT-16/17/21's convention: `window.__HT16`, `__HT17`, `__BLOCKS`, `__CIRCLE`).
   `goDay` and the grammar live inside this sealed closure, so a headless test cannot reach them
   and the FIRST version of `golden_ht23` C1 called `window.goDay` - which is undefined, so the
   navigation never happened and two checks passed against a page that had not moved. A vacuous
   green is worse than a red. Exported deliberately, read-only, and used by the golden only. */
window.__HT24 = { isWeekly:isWeekly, dowOf:dowOf, dueOn:dueOn, bucketOf:bucketOf,
                  parseCadence:parseCadence, serializeCadence:serializeCadence, isSabbathStd:isSabbathStd,
                  goDay:function(k){ return goDay(k); }, daily:function(){ return daily(); },
                  today:function(){ return today(); } };

/* ---- HT-25 S3 · ON TIME OR LATE, AND IT CHANGES NOTHING BUT THE LABEL --------------------
   A TIMED standard already showed `08:20 · Read the Bible · ✓ 08:34` (HT-21 S2). What it never
   said is whether 08:34 was on time, which is the only thing the two numbers together are for.

   LATENESS IS A LABEL, NEVER A SCORE. `pctOf`, `doneOn`, `weekDone` and the streak all ask the
   SAME question of `days.checked` — is this id truthy — and a clock string is truthy whatever it
   says. So a late completion cannot move a percentage or break a streak by construction, not by
   a rule somebody has to remember. The golden asserts it rather than trusting the reading.

   THE DELTA IS COMPUTED AGAINST THE DAY THE STANDARD WAS DUE, which is the day whose row is on
   screen — never against "now". Ticking Monday's box on Wednesday already refuses to write a
   Wednesday clock onto a Monday row (HT-21 S2), so there is no path here that compares two
   different days' clocks. A standard finished after midnight is late by however many minutes past
   its own day's target it was, which is what a person means by late. */
var LATE_GRACE = 0;              /* on time means on time; the grace lives in the target itself */
function lateMin(h, k){
  var t = winStartMin(h), d = doneMin(k, h.id);
  return (t == null || d == null) ? null : d - t;
}
function lateCls(h, k){ return clsOfSpan(lateMin(h, k)); }
function lateTxt(h, k){ return txtOfSpan(lateMin(h, k)); }
/* ON-TIME % — a SEPARATE stat, hidden by default (R70.138), because it answers a different
   question from adherence and blending the two would make a 100%-adherent week look worse. */
function onTimePct(days){
  var hit = 0, n = 0;
  (days || []).forEach(function(k){
    (S.habits || []).forEach(function(h){
      if(winStartMin(h) == null || !dueOn(h, k)) return;
      var m = lateMin(h, k); if(m == null) return;
      n++; if(m <= LATE_GRACE) hit++;
    });
  });
  return n ? Math.round(hit / n * 100) : null;
}
/* THE SEAM (HT-16/17/21/24's convention). `S` lives inside this sealed closure, so a headless
   test cannot reach it — HT-24 recorded exactly this trap and its first C1 draft passed against a
   page that had never moved. So the seam exposes the PURE comparison (`spanMin`), which is what
   the delta actually is, plus a read-only handle on the state for the one check that has to score
   a real day. Exported deliberately, and used by the golden only. */
function spanMin(targetHHMM, doneHHMM){
  var t=minsOf(targetHHMM), d=minsOf(doneHHMM);
  return (t==null||d==null) ? null : d-t;
}
function clsOfSpan(m){ return m==null ? '' : (m > LATE_GRACE ? ' late' : ' ontime'); }
function txtOfSpan(m){
  if(m==null) return '';
  if(m > LATE_GRACE) return '  +'+m+'m';
  return m===0 ? '  on time' : '  '+m+'m';
}
window.__HT25S3 = { lateMin:lateMin, lateCls:lateCls, lateTxt:lateTxt, onTimePct:onTimePct,
                    spanMin:spanMin, clsOfSpan:clsOfSpan, txtOfSpan:txtOfSpan,
                    state:function(){ return S; } };

/* ---- HT-25 S2 · EVERY MULTI-LINE BOX GROWS TO A CEILING, THEN SCROLLS -------------------
   THE CLASS, NOT THE INSTANCE. Cory reported this on the brain dump. It was true of every
   textarea in the app, because two separate mechanisms each produced an unreachable overflow:
     the PHONE grew the box past the viewport with no ceiling (`grow()`), and
     the DESKTOP bounded it (flex column, or the `:focus` clamp on #h18Btm) and then CLIPPED,
   both under a stylesheet that said `overflow:hidden`. So the rule lives in ONE function that
   every box goes through, and the stylesheet says `overflow-y:auto`.

   THE CEILING IS MEASURED FROM THE VISUAL VIEWPORT, NOT `innerHeight`. With the iOS keyboard up,
   `window.innerHeight` is still the UNSHRUNK height — sizing to 40% of it puts the bottom of the
   box behind the keyboard, which is the same invisible-overflow bug one layer out. `visualViewport`
   is the only API that reports what is actually on screen. */
function growCeil(){
  var vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 640;
  /* Desktop lets CSS own the height (the panel and the focus clamp bound it); the ceiling there
     would only fight them, so it is effectively off. */
  if(window.innerWidth >= 1024) return 1e6;
  return Math.max(96, Math.round(vh * 0.40));
}
function growTo(t){
  if(!t) return;
  t.style.height = 'auto';
  var want = t.scrollHeight + 2, ceil = growCeil(), h = Math.min(want, ceil);
  t.style.height = h + 'px';
  /* Only claim a scrollbar when there is something to scroll to. An `auto` box that always
     reports overflow shows a permanent inert scrollbar on desktop, which is its own small lie. */
  t.style.overflowY = (want > ceil + 1) ? 'auto' : '';
}
/* THE CARET FOLLOWS THE TYPING. Once a box scrolls internally, typing at the bottom of a long
   entry can leave the caret below the fold — the box scrolls, but not to where you are. There is
   no cross-browser "scroll caret into view" for a textarea, so this uses the one property that
   does report it: after the browser has laid the value out, `scrollTop` is clamped such that
   pushing it to the bottom when the caret is at the end is correct, and otherwise the browser has
   already kept the caret visible for us. Deliberately conservative: it only acts when the caret
   is at the very end, which is where 99% of typing happens and the only case the browser gets
   wrong for a programmatically-resized box. */
function caretIntoView(t){
  if(!t || t.selectionStart == null) return;
  if(t.selectionStart !== t.value.length) return;
  t.scrollTop = t.scrollHeight;
}
/* ONE delegated listener for the whole document, so a textarea added later inherits the behaviour
   instead of needing its own binding — the failure mode that made this a per-instance patch in the
   first place. Capture phase, because HT-10's own `input` handler calls grow() and we want the
   ceiling applied whichever order they run in. */
document.addEventListener('input', function(e){
  var t = e && e.target;
  if(!t || String(t.tagName||'').toLowerCase() !== 'textarea') return;
  growTo(t); caretIntoView(t);
}, true);
/* The keyboard opening changes the ceiling, so every bounded box is re-measured when it does.
   `visualViewport.resize` is what fires on iOS for a keyboard; `window.resize` covers the rest. */
function regrowAll(){
  var ns = document.querySelectorAll('textarea');
  for(var i=0;i<ns.length;i++) if(ns[i].style.height) growTo(ns[i]);
}
if(window.visualViewport) window.visualViewport.addEventListener('resize', regrowAll);
window.addEventListener('resize', regrowAll);

window.__HT25 = { growTo:growTo, growCeil:growCeil, caretIntoView:caretIntoView,
                  regrowAll:regrowAll };
/* DUE TODAY and not weekly. This is what the day's percentage is computed against, and
   `saveDay()` snapshots it into `active_set` on every save - so a day already logged keeps the
   set it was graded on and NO PAST DAY IS EVER REPRICED (P4). That mechanism already shipped;
   this only changes what goes into it today. */
function daily(){ return S.habits.filter(function(h){ return !isWeekly(h) && dueOn(h, S.date); }); }
function weekly(){ return S.habits.filter(isWeekly); }
function ckOf(k){ var r=S.byDate[k]; return (r&&r.checked)||{}; }
/* ---- HT-21 S2 · A DONE TIME, AND IT COSTS NO MIGRATION (R70.286) -------------------------
   `days.checked` is a JSONB map and every reader in this file asks it ONE question: is this id
   truthy (`if(ck[h.id])`, `!!ck[hid]`, `.filter(i => checked[i])`). Grep: not one `=== true`.
   So the value can carry the CLOCK instead of a bare `true` and every existing caller keeps
   working unchanged — `checked[id] = "08:34"` is as truthy as `checked[id] = true`.
   That matters because `planned_start`/`planned_end`/`notes` are still missing and this section
   would otherwise be blocked behind the same permission that blocked S1a. It is not: plan vs
   actual ships today, on the columns that already exist.
   THE CLOCK IS ONLY WRITTEN WHEN THE DAY IS TODAY. Ticking Monday's box on Wednesday records
   THAT it was done, never a Wednesday clock time on a Monday row — a done time you did not do
   is worse than no done time (R70.214). */
function doneAt(k, hid){
  var v=ckOf(k)[hid];
  return (typeof v==='string' && /^\d{2}:\d{2}$/.test(v)) ? v : null;
}
function doneMin(k, hid){ return minsOf(doneAt(k, hid)); }
function nowClock(){
  var d=new Date();
  return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
}
function pctOf(ck,ids){ if(!ids||!ids.length) return 0; var n=0;
  for(var i=0;i<ids.length;i++) if(ck[ids[i]]) n++;
  return Math.round(n/ids.length*100); }
/* HT-20 P2 (R70.263): ONE traversal of the period, and it returns WHICH DAY rather than a
   boolean, because unchecking a weekly has to reach the day the completion was actually logged
   on. The most recent one wins — a period holds at most one completion, and if an older build
   left two, the one a person is looking at is the last. `weekDone` is now a question this
   answers, not a second walk of the same seven days. */
function weekCheckDay(hid,k){
  var d=dnum(k), mon=new Date(d), found=null;
  mon.setDate(d.getDate()-((d.getDay()+6)%7));
  for(var i=0;i<7;i++){ var c=new Date(mon); c.setDate(mon.getDate()+i);
    if(c>d) break; if(ckOf(dk(c))[hid]) found=dk(c); }
  return found;
}
function weekDone(hid,k){ return weekCheckDay(hid,k)!=null; }
function doneOn(h,k){ return isWeekly(h) ? weekDone(h.id,k) : !!ckOf(k)[h.id]; }
function rolling(n,upto){
  var end=upto||today(), a=[];
  for(var i=n-1;i>=0;i--){ var k=shift(end,-i), r=S.byDate[k];
    if(r&&r.pct!=null&&k<=today()) a.push(r.pct); }
  if(!a.length) return null;
  return Math.round(a.reduce(function(x,y){return x+y;},0)/a.length);
}
function committed(){ return daily().reduce(function(t,h){ return t+(h.minutes||0); },0); }
function remaining(k){
  var ck=ckOf(k);
  return daily().reduce(function(t,h){ return t+(ck[h.id]?0:(h.minutes||0)); },0);
}
function currentStreak(){
  var n=0,k=today();
  if(!S.byDate[k]||S.byDate[k].pct==null||S.byDate[k].pct<80) k=shift(k,-1);
  while(S.byDate[k]&&S.byDate[k].pct!=null&&S.byDate[k].pct>=80){ n++; k=shift(k,-1); }
  return n;
}
function dates(){ return S.days.map(function(d){return d.date;}).filter(function(k){return k<=today();}).sort(); }

/* ============================ data ============================ */
async function load(){
  var gu=await sb.auth.getUser(), u=gu && gu.data && gu.data.user;
  /* HT-28 C · OFFLINE IS NOT SIGNED OUT. getUser() asks the server; with no connection it returns no user
     and the app used to show the sign-in screen to someone who never signed out. Only when the failure is
     the network (or the device says it is offline) does it fall back to the session already on the device;
     the reads below then fail, S.loadOk says so, and the sync layer reloads on `online`. */
  if(!u && gu && gu.error && (navigator.onLine===false || /fetch|network|load failed/i.test(String(gu.error.message||'')))
     && sb.auth.getSession){
    try{ var gs=await sb.auth.getSession(); u=gs && gs.data && gs.data.session && gs.data.session.user; }catch(e){}
  }
  if(!u){ authScreen(); return false; }
  var uid=u.id;
  /* HT-28 C · A PROBE THAT DROPS ON THE NETWORK IS NOT A MISSING COLUMN. Each optional column below is probed
     widest-first and the error steps down to a narrower read - so a dropped connection on the FIRST read, and a
     good one on the second, used to leave hasDump/hasCue/hasClosedAt false with loadOk true: the brain dump then
     stopped saving with no word (second review of 9d4ac6b). A network-shaped error on any probe marks the load
     as failed, and the sync layer reloads. A real missing column is `42703 column ... does not exist`. */
  var netDrop=false;
  function netShaped(e){ return !!e && (navigator.onLine===false || /fetch|network|load failed|timed? ?out/i.test(String(e.message||e))); }
  var p  = await sb.from('profiles').select('id,display_name,handle').eq('id',uid).maybeSingle();
  /* HT-13 B1: `target_age` is optional until its migration lands. Probe widest first, then step
     down — the same contract as habits.cue and day_private.predict / brain_dump. */
  if(netShaped(p.error)) netDrop=true;
  var pp = await sb.from('profile_private').select('birth_date,target_age').eq('id',uid).maybeSingle();
  if(pp.error){ S.hasTargetAge=false; if(netShaped(pp.error)) netDrop=true;
    pp = await sb.from('profile_private').select('birth_date').eq('id',uid).maybeSingle();
  } else { S.hasTargetAge=true; }
  S.me = p.data || { id:uid, display_name:(u.email||'').split('@')[0], handle:null };
  S.me.id = uid; S.me.email = u.email;
  S.priv0 = pp.data || {};

  /* `cue` may not exist yet (its migration is Cory's to run). Probe, then degrade —
     the same build must work before and after the column lands. */
  var HCOLS='id,name,group_name,cadence,tier,minutes,link,sort_order';
  var h = await sb.from('habits').select(HCOLS+',cue')
    .eq('user_id',uid).eq('active',true).order('sort_order');
  if(h.error){
    S.hasCue=false; if(netShaped(h.error)) netDrop=true;
    h = await sb.from('habits').select(HCOLS)
      .eq('user_id',uid).eq('active',true).order('sort_order');
  } else { S.hasCue=true; }
  S.habits = (h.data||[]).map(function(x,i){ if(x.sort_order==null) x.sort_order=i; return x; });

  /* HT-13 G2: probe `closed_at` the way `cue` and `predict` are probed, then degrade. The column is
     live as of 2026-09-07, but the same build must run against a database that does not have it. */
  var DCOLS='date,checked,active_set,pct,floor_pct';
  var d = await sb.from('days').select(DCOLS+',closed_at').eq('user_id',uid).order('date');
  if(d.error){ S.hasClosedAt=false; if(netShaped(d.error)) netDrop=true;
    d = await sb.from('days').select(DCOLS).eq('user_id',uid).order('date');
  } else { S.hasClosedAt=true; }
  /* HT-28 C: the day rows are handed to S together with the journal rows, after every read below - a tap
     during the journal reads must not meet a fresh days map beside a stale baseline (third review) */
  var daysRows = d.data||[], byDateNew = {}; daysRows.forEach(function(r){ byDateNew[r.date]=r; });

  /* the whole private record — rating and journal are inputs, so they get outputs */
  /* `predict` may not exist yet (its migration is Cory's to run) — probe, then degrade. */
  var PVCOLS='date,rating,why,tasks,prayer';
  /* HT-10: two optional columns now. Probe widest first and step down, so the app runs whether or not
     either migration has been applied — the same degrade-cleanly contract `predict` already had. */
  var pv = await sb.from('day_private').select(PVCOLS+',predict,brain_dump').eq('user_id',uid);
  if(!pv.error){ S.hasPredict=true; S.hasDump=true; }
  else {
    if(netShaped(pv.error)) netDrop=true;
    pv = await sb.from('day_private').select(PVCOLS+',predict').eq('user_id',uid);
    if(!pv.error){ S.hasPredict=true; S.hasDump=false; }
    else {
      if(netShaped(pv.error)) netDrop=true;
      pv = await sb.from('day_private').select(PVCOLS+',brain_dump').eq('user_id',uid);
      if(!pv.error){ S.hasPredict=false; S.hasDump=true; }
      else { S.hasPredict=false; S.hasDump=false;
             pv = await sb.from('day_private').select(PVCOLS).eq('user_id',uid); }
    }
  }
  S.days = daysRows; S.byDate = byDateNew;
  if(!S.date) S.date = today();
  if(!S.byDate[S.date]) S.byDate[S.date]={ date:S.date, checked:{}, pct:0 };
  if(!S.calYM){ var t=dnum(today()); S.calYM=[t.getFullYear(),t.getMonth()]; }
  S.privAll = {}; (pv.data||[]).forEach(function(r){ S.privAll[r.date]=r; });
  /* HT-28 D4 · A FAILED LOAD IS NOT A NEW ACCOUNT. Every select above degrades to an empty array on
     error, so "no standards, no days" is also what a dropped connection looks like. The first-run card,
     the examples and the add-link read this, and nothing offers to add rows unless it is true. */
  S.loadOk = !h.error && !d.error && !pv.error && !netDrop;

  /* ---- HT-22 S1 . THE THREE INPUTS THE MIGRATION UNBLOCKED (R70.284) --------------------
     `sleep_hours`, `weight_lb` and `tomorrow_one_thing` landed on 2026-09-09. This build still
     has to run against a database that does not have them - the degrade-cleanly contract that
     `cue`, `predict`, `brain_dump`, `closed_at` and `target_age` all already carry.
     ONE PROBE EACH, NOT ONE PROBE FOR THREE, and HT-21 S5 is why: a probe that asks for three
     columns and is refused because ONE of them is absent reports "no columns" and hides two
     fields that exist and would save. Three statements are cheap; a hidden field that works
     is not. */
  async function probePv(col, flag){
    var r3 = await sb.from('day_private').select('date,'+col).eq('user_id',uid);
    S[flag] = !r3.error;
    if(r3.error) return;
    (r3.data||[]).forEach(function(row){
      var t = S.privAll[row.date] || (S.privAll[row.date]={ date:row.date, user_id:uid });
      t[col] = row[col];
    });
  }
  /* HT-26 S1: under the five-inputs ruling none of these columns is even ASKED for. Every save
     and paint path below already keys on these flags, so false here is the whole switch. */
  if(FIVE_INPUTS_ONLY){
    S.hasSleep = S.hasWeight = S.hasTomorrow = S.hasBed = S.hasWake = false;
  } else {
  await probePv('sleep_hours','hasSleep');
  await probePv('weight_lb','hasWeight');
  await probePv('tomorrow_one_thing','hasTomorrow');
  /* HT-25 S5/S6: bed and wake. Probed like every other optional column, so a phone whose
     migration has not run simply does not show the two fields - and the sleep line falls back
     to `self-reported`, which is the honest label for a number Cory typed. */
  await probePv('bed_time','hasBed');
  await probePv('wake_time','hasWake');
  }

  S.priv = S.privAll[S.date] || null;
  return true;
}
function loadPriv(){ S.priv = S.privAll[S.date] || null; return Promise.resolve(); }
var saveT=null;
function queueSave(){ clearTimeout(saveT); saveT=setTimeout(saveDay,450); }

var pvT=null;
function queuePriv(){ clearTimeout(pvT); pvT=setTimeout(savePriv,700); }
async function savePriv(){
  var p = S.priv || (S.priv={});
  p.date=S.date; p.user_id=S.me.id;
  S.privAll[S.date]=p;
  var row = {
    user_id:S.me.id, date:S.date,
    rating:(p.rating==null?null:p.rating), why:p.why||'', tasks:p.tasks||'', prayer:p.prayer||''
  , brain_dump:(S.hasDump ? (p.brain_dump||'') : undefined)
  };
  /* HT-22 S1: sleep and weight are measures OF THIS DAY, so they ride THIS day's upsert and no
     second save path is created for them. The key is left OUT of the payload entirely when the
     column is absent - the shape `brain_dump` already uses, and the reason one missing column
     cannot fail the whole save and silently stop the journal persisting at all. */
  if(S.hasSleep)  row.sleep_hours = (p.sleep_hours==null||p.sleep_hours==='') ? null : +p.sleep_hours;
  if(S.hasWeight) row.weight_lb   = (p.weight_lb==null  ||p.weight_lb==='')   ? null : +p.weight_lb;
  if(S.hasBed)    row.bed_time    = p.bed_time  || null;
  if(S.hasWake)   row.wake_time   = p.wake_time || null;
  var res = await sb.from('day_private').upsert(row,{ onConflict:'user_id,date' });
  if(res.error) toast('note not saved'); else toast('saved');
  var n=0; ['brain_dump','tasks','prayer'].forEach(function(k){ if(p[k]) n++; });
  el('jrnC').textContent = n? n+' of 3 written · autosaves' : 'saves as you type';
  paintRating(); paintRChart(); paintRScat(); paintRSleep(); paintRByMo(); paintJournal(); paintCal();
  return res;                                     /* HT-28 C: the sync layer needs to know it landed */
}
/* ---- HT-22 S1 . TOMORROW'S ONE THING IS WRITTEN ONTO TOMORROW ---------------------------
   Storing it on today's row and reading it back with a +1 offset works exactly until he writes
   it at 00:05, or logs a day back from Wednesday - and then two clocks disagree about which day
   "tomorrow" meant. The row it belongs to is the row it is written to, and that day reads only
   its own. The upsert names ONE column, so PostgREST's ON CONFLICT sets only that column and a
   rating already sitting on tomorrow's row cannot be blanked by it. */
var tmT=null;
function queueTomorrow(v){ S.oneDraft = v; clearTimeout(tmT); tmT=setTimeout(saveTomorrow,700); }
async function saveTomorrow(){
  if(!S.hasTomorrow || !S.me) return null;
  var k=shift(S.date,1), v=String(S.oneDraft==null?'':S.oneDraft).trim();
  var res = await sb.from('day_private').upsert(
    { user_id:S.me.id, date:k, tomorrow_one_thing:(v||null) }, { onConflict:'user_id,date' });
  if(res && res.error){ toast('tomorrow not saved'); return res; }
  var t = S.privAll[k] || (S.privAll[k]={ date:k, user_id:S.me.id });
  t.tomorrow_one_thing = v||null;
  toast('saved');
  return res;
}
/* THE ONE THING IS A COMPLETION, so it is stored where every completion on a day is stored.
   `days.checked` is JSONB and every reader asks it one question - is this truthy (HT-21 S2) -
   so the reserved key `__one` carries its own clock exactly as a standard does. IT CANNOT MOVE
   A GRADE: `pct` is computed only over `active_set` / `daily()` ids and `__one` is in neither.
   That is the acceptance, not the claim - `golden_ht22` checks it and asserts pct is unchanged
   to the point. The `__` prefix cannot collide with a habit id (uuid live, `hN` in the
   fixture), so nothing joining checked keys to standards can ever see a phantom. */
var ONE_KEY='__one';
function oneThingOf(k){ var p=S.privAll[k]; var v=p&&p.tomorrow_one_thing;
  return (v==null||String(v).trim()==='') ? null : String(v).trim(); }
function oneDone(k){ return !!ckOf(k)[ONE_KEY]; }
function toggleOne(){
  var r=S.byDate[S.date] || (S.byDate[S.date]={date:S.date,checked:{},pct:0});
  r.checked=r.checked||{};
  if(r.checked[ONE_KEY]) delete r.checked[ONE_KEY];
  else r.checked[ONE_KEY] = (S.date===today() ? nowClock() : true);
  queueSave(); paintOneThing();
}
function paintOneThing(){
  var host=el('oneThing'); if(!host) return;
  /* HT-26 S1: tomorrow's one thing is one of the hidden inputs, so its banner reads nothing either -
     in production the column is never loaded (PVCOLS omits it, the probe is off); this makes it so on
     any data source, including the harness mock that returns every column. */
  var t=FIVE_INPUTS_ONLY ? null : oneThingOf(S.date);
  if(!t){ host.innerHTML=''; host.hidden=true; return; }
  host.hidden=false;
  var on=oneDone(S.date), at=doneAt(S.date,ONE_KEY);
  host.innerHTML='<div class="one'+(on?' on':'')+'">'+
    '<button class="bxw" type="button" data-one="1" aria-pressed="'+(on?'true':'false')+
      '" title="the one thing"><span class="bx"></span></button>'+
    '<span class="onek">ONE THING</span>'+
    '<span class="onev">'+esc(t)+'</span>'+
    (at?'<i class="dat">\u2713 '+esc(fmtTime(at))+'</i>':'')+
    '</div>';
}
function ratingOf(k){ var p=S.privAll[k]; var v=p&&p.rating; return (v==null||v==='')?null:+v; }
function rollRate(n,upto){
  var end=upto||today(), a=[];
  for(var i=n-1;i>=0;i--){ var v=ratingOf(shift(end,-i)); if(v!=null) a.push(v); }
  if(!a.length) return null;
  return Math.round(a.reduce(function(x,y){return x+y;},0)/a.length*10)/10;
}
/* HT-13 G2 · `closed_at` is written HERE and only on an explicit close.
   HT-10 shipped CLOSE THE DAY and the column landed after it, so the write was never wired: measured
   non-null on 0 of 15 days. `opts.close` is passed by the button and by nothing else — an autosave
   must never stamp a day as closed, or the column stops meaning "you finished". Re-closing UPDATES
   rather than duplicating, because the upsert already conflicts on (user_id,date).
   `S.hasClosedAt` is probed in load(): a missing column would fail the whole upsert and silently
   stop the day from saving at all, which is a far worse bug than a missing timestamp. */
async function saveDay(opts){
  var r=S.byDate[S.date], ids=daily().map(function(h){return h.id;});
  r.pct = pctOf(r.checked||{}, ids);
  var row = { user_id:S.me.id, date:S.date, checked:r.checked||{}, active_set:ids, pct:r.pct };
  if(opts && opts.close && S.hasClosedAt){
    row.closed_at = new Date().toISOString();
    r.closed_at = row.closed_at;
  }
  var res = await sb.from('days').upsert(row,{ onConflict:'user_id,date' });
  if(res.error) toast('not saved');
  return res;
}

/* HT-20 P2: save a day that is NOT the one on screen — the only caller is unchecking a weekly
   whose completion lives on an earlier day of the same period. It re-derives that day's grade
   from THAT DAY'S OWN `active_set`, never from today's `daily()`: repricing a past day from a
   later list is the thing `saveDay`'s active_set write exists to prevent (P4), and reaching back
   into a past row is exactly where that rule would be broken by accident. */
async function saveDayFor(k){
  if(k===S.date) return saveDay();
  var r=S.byDate[k]; if(!r || !S.me) return null;
  var ids=(r.active_set && r.active_set.length) ? r.active_set
                                               : daily().map(function(h){return h.id;});
  r.pct = pctOf(r.checked||{}, ids);
  var res = await sb.from('days').upsert(
    { user_id:S.me.id, date:k, checked:r.checked||{}, active_set:ids, pct:r.pct },
    { onConflict:'user_id,date' });
  if(res.error) toast('not saved');
  return res;
}

/* ============================ paint: masthead ============================ */
function paintMast(){
  var d=dnum(S.date), t=(S.date===today());
  el('mDate').textContent = WD[d.getDay()]+' '+MO[d.getMonth()]+' '+d.getDate()+(t?'':' · logging back');
  var r=S.byDate[S.date]||{}, ids=daily().map(function(h){return h.id;});
  var pct=pctOf(r.checked||{},ids), g=grade(pct);
  var wk=weekly(), wkDone=wk.filter(function(h){return weekDone(h.id,S.date);}).length;
  var r7=rolling(7), r30=rolling(30), r90=rolling(90);
  var com=committed(), rem=remaining(S.date);
  var st=currentStreak();
  var done=ids.filter(function(i){return (r.checked||{})[i];}).length;

  el('tape').innerHTML =
    tp('Today', '<span style="color:'+gtxt(pct)+'">'+pct+'%</span><s>'+g[0]+'</s>') +
    tp('Done',  done+'<s>of '+ids.length+'</s>') +
    tp('Earned today', fmt(com-rem)+'<s>of '+fmt(com)+'</s>') +
    /* HT-18 S5e (R70.187): the mast said `30-day 35%` and the surface now says `ADHERENCE 34%`.
       Two numbers, one word, one screen — and they are DIFFERENT metrics: rolling() is the mean of
       the daily completion percentages, adherence is hits over opportunities. The LABEL is what was
       wrong, so the label is what changes; no data and no arithmetic moves. */
    tp('7d mean',  (r7==null?'—':r7+'%')+'<s>'+(r7==null?'':grade(r7)[0])+'</s>') +
    tp('30d mean', (r30==null?'—':r30+'%')) +
    tp('90d mean', (r90==null?'—':r90+'%')) +
    tp('Consistency', (function(){ var c=consistency(90);
        return c.pct+'%<s>'+c.hit+' of 90 d at 80%+</s>'; })()) +
    tp('Streak', (function(){ var f=streakShowedUp();
        return f.days+'<s>d logged'+(f.frozen?(' · '+f.frozen+' frozen'):'')+'</s>'; })()) +
    tp('Weekly', wkDone+'<s>of '+wk.length+'</s>') +
    tp('Rating', (function(){ var r=rollRate(7); return (r==null?'—':r)+'<s>7d avg</s>'; })()) +
    tp('Logged', dates().length+'<s>days</s>') +
    tp('Gaps', (function(){ var g=gaps(30);
        return g.missed+'<s>of last 30 d</s>'; })());
}
function tp(k,v){ return '<div class="tp"><div class="k">'+k+'</div><div class="v num">'+v+'</div></div>'; }

/* ============================ paint: rail ============================ */
function paintRail(){
  var h='';
  for(var i=13;i>=0;i--){
    var k=shift(today(),-i), d=dnum(k), r=S.byDate[k];
    var p=(r&&r.pct!=null)?r.pct:null;
    h+='<button data-d="'+k+'" class="'+(k===S.date?'sel':'')+'">'+
       '<div class="wd">'+WD[d.getDay()]+'</div><div class="dd num">'+d.getDate()+'</div>'+
       '<div class="pip" style="background:'+(p==null?'var(--rule2)':dens(p))+'"></div></button>';
  }
  el('rail').innerHTML=h;
  var n=el('rail'), s=n.querySelector('.sel');
  if(s && n.scrollWidth>n.clientWidth+4) s.scrollIntoView({block:'nearest',inline:'center'});
}

/* ============================ paint: the log ============================ */
function adherence30(hid){
  var h=S.habits.filter(function(x){return x.id===hid;})[0]; if(!h) return null;
  var n=0,t=0;
  for(var i=0;i<30;i++){
    var k=shift(today(),-i); if(!S.byDate[k]) continue;
    if(!dueDay(h,k)) continue;             /* HT-28 E12: a dow: item's off-days are not misses */
    t++; if(doneOn(h,k)) n++;
  }
  return t? Math.round(n/t*100) : null;
}
function nextId(){
  if(S.date!==today()) return null;
  var now=new Date(), m=now.getHours()*60+now.getMinutes(), ck=ckOf(S.date);
  var best=null,bd=1e9;
  daily().forEach(function(h){
    if(ck[h.id]) return;
    /* HT-20 P1: the clock comes from `time_anchor`, never from the name (R70.265). */
    var s=minsOf(h.time_anchor); if(s==null) return;
    var d=Math.abs(s-m); if(s<=m+15 && d<bd){ bd=d; best=h.id; }
  });
  return best;
}
function paintLog(){
  var ck=ckOf(S.date), nx=nextId(), q=S.find.toLowerCase();
  var list=S.habits.slice();

  if(q) list=list.filter(function(h){ return (h.name+' '+(h.group_name||'')).toLowerCase().indexOf(q)>=0; });
  if(S.grp==='daily')  list=list.filter(function(h){ return !isWeekly(h); });
  if(S.grp==='weekly') list=list.filter(isWeekly);
  /* HT-24 C1: a `dow:` standard is ABSENT on a day it is not due - not greyed, not "already
     done". Absent. A weekly keeps its own period machinery and is never filtered here. */
  list = list.filter(function(h){ return isWeekly(h) || dueOn(h, S.date); });

  /* HT-21 S2: inside a group, ascending by PLANNED TIME, and the unplanned sit at its foot.
     His groups remain the organising principle (DEC-057) — the clock is a secondary sort within
     one, never the thing the list is built from. Reported to SPEC as needing DEC-057 clarified. */
  if(S.sort==='order')  list.sort(function(a,b){
    /* HT-22 S1: ascending by `planned_start` (the window's own start), unplanned at the foot.
       DEC-057 as amended 2026-09-10 - his GROUPS are the organising principle and the clock is
       a secondary sort INSIDE one, on his own request. The 9a layer re-parents these rows under
       their group headers after this sort runs, so ordering here is ordering within a group. */
    var ax=winStartMin(a), bx=winStartMin(b);
    if(ax==null && bx!=null) return 1;
    if(bx==null && ax!=null) return -1;
    if(ax!=null && bx!=null && ax!==bx) return ax-bx;
    return (a.sort_order||0)-(b.sort_order||0); });
  if(S.sort==='undone') list.sort(function(a,b){
    var da=doneOn(a,S.date)?1:0, db=doneOn(b,S.date)?1:0;
    return da-db || (a.sort_order||0)-(b.sort_order||0); });
  if(S.sort==='weak')   list.sort(function(a,b){
    var aa=adherence30(a.id), ba=adherence30(b.id);
    return (aa==null?101:aa)-(ba==null?101:ba); });
  if(S.sort==='heavy')  list.sort(function(a,b){ return (b.minutes||0)-(a.minutes||0); });
  if(S.sort==='az')     list.sort(function(a,b){ return nameOf(a.name).toLowerCase()<nameOf(b.name).toLowerCase()?-1:1; });

  el('log').className = 'log'+(list.length>16?' split':'');
  el('log').innerHTML = list.map(function(h){
    var on = doneOn(h,S.date);
    var ad = adherence30(h.id);
    /* HT-16 R70.98 · ROW ANATOMY, and it is fixed:
         [checkbox 44x44] [name - an <a> when the task has a URL] [flex spacer] [edit 44x44]
       No absolutely-positioned overlays; each control owns its hit target; tapping the name never
       opens the editor and the editor never follows the link. Tab order is DOM order:
       checkbox -> link -> edit. The row is a <div> now, not a <button>: a <button> cannot legally
       contain the <a>, and nesting them is how a link and an edit come to share one hit box. */
    /* HT-21 S2 · PLAN vs ACTUAL on the row itself.
       `08:20 · Read the Bible` and, once checked, a muted `✓ 08:34` beside it. A standard with no
       planned time renders NO time column at all — an empty column is a question the row cannot
       answer, and a list of them reads as a fault. */
    var pAt = winStart(h);
    var dAt = doneAt(S.date, h.id);
    var nmIn = (pAt ? '<b class="pat">'+esc(fmtTime(pAt))+'</b>' : '') +
      esc(nameOf(h.name)) +
      (dAt ? '<i class="dat'+lateCls(h,S.date)+'">\u2713 '+esc(fmtTime(dAt))+esc(lateTxt(h,S.date))+'</i>' : '') +
      ((S.hasCue && h.cue)?'<i class="cue">'+esc(h.cue)+'</i>':'');
    /* ---- HT-21 S3 · LINKS WITHOUT NOISE (R70.287) ------------------------------------
       Cory: "I still need links available but I do not like the icon next to the end of the
       text." The chain glyph is GONE from the row — at rest and at every other time. What
       replaces it is nothing at all until the pointer is on the name, and then a 2px dot.
       THE ANCHOR STAYS, and that is the whole trick: a real <a href> is what gives long-press
       on a phone and right-click on a desktop their native "open link" without this file
       implementing a gesture, and it keeps the link reachable from the drawer and the sheet.
       Only the ICON is removed (the wire is explicit that nothing else about links is). */
    var nm = h.link
      ? '<a class="nm lnk" href="'+esc(h.link)+'" target="_blank" rel="noopener">'+nmIn+'</a>'
      : '<span class="nm">'+nmIn+'</span>';
    return '<div class="li'+(on?' on':'')+(h.id===nx?' nx':'')+'" data-h="'+h.id+'">'+
      '<button class="bxw" type="button" data-tog="'+h.id+'" aria-pressed="'+(on?'true':'false')+
        '" title="'+esc(nameOf(h.name))+'"><span class="bx"></span></button>'+
      nm+
      /* HT-16 S7 · R70.104 — THE RED FLAG RENDERER IS DELETED. It printed a red flag glyph and a
         number to the right of a name whenever missRun(habit) >= 3, meaning "you have missed this
         standard N days running". Display-only: computed live from days.checked, carrying no data
         of its own, so under R70.104 and R70.79 the renderer goes and nothing in the database
         changes -- the misses are still in `days` and every other view still counts them.
         Root cause worth recording: HT-9a's allow-list hid five row spans (.gp .mn .ad .cue .back)
         and missed this one, which is why an unexplained red marker survived into the simple view
         for four wires. After this the only red on a task row is S6's overdue tint. */
      (returnedOn(h,S.date)?'<span class="back" title="back after a miss — the return is the win">↩</span>':'')+
      (isWeekly(h)?'<span class="wk">WEEKLY</span>':'')+
      '<span class="sp16"></span>'+
      '<span class="mn">'+(h.minutes?h.minutes+'m':'—')+'</span>'+
      '<span class="ad" style="color:'+gtxt(ad)+'">'+(ad==null?'—':ad+'%')+'</span>'+
      '</div>';
  }).join('') || (
    /* ---- HT-21 S9 · A FIRST RUN IS NOT A FAILED SEARCH -------------------------------
       MEASURED in the onboarding audit at 375, 1280 and 1920: a brand-new account with zero
       standards was told "Nothing matches." — the message for a search that found nothing —
       and the "Start with these three" offer existed but was hidden by the simplification
       rule. So the first thing HT ever said to a stranger was that their search had failed,
       and there was no visible way forward. Two different empty states, two sentences. */
    S.habits.length
      ? '<div class="empty">Nothing matches.</div>'
      : '<div class="empty">No standards yet — pick three below, or add your own in Settings.</div>');

  paintOneThing();
  var ids=daily().map(function(x){return x.id;});
  var done=ids.filter(function(i){return ck[i];}).length;
  el('logC').textContent = done+' / '+ids.length+' · '+fmt(earned(S.date))+' earned';
}

/* ---- input 2 and 3: the rating strip and the journal ---- */
function paintRating(){
  var cur = S.priv && S.priv.rating!=null ? +S.priv.rating : null, h='';
  for(var i=1;i<=10;i++) h+='<button data-r="'+i+'" class="'+(cur===i?'on':'')+'">'+i+'</button>';
  h+='<button data-r="0" class="clr" title="clear">×</button>';
  el('rate').innerHTML=h;
  var r7=rollRate(7), r30=rollRate(30);
  el('rateC').textContent = (cur==null?'not rated':'rated '+cur)+
    (r7==null?'':' · 7d '+r7)+(r30==null?'':' · 30d '+r30);
}
function paintJournalInputs(){
  el('iWhy').value    = (S.priv&&S.priv.why)||'';
  el('iTasks').value  = (S.priv&&S.priv.tasks)||'';
  el('iPrayer').value = (S.priv&&S.priv.prayer)||'';
  var n=0; ['why','tasks','prayer'].forEach(function(k){ if(S.priv&&S.priv[k]) n++; });
  el('jrnC').textContent = n? n+' of 3 written · autosaves' : 'saves as you type';
  paintInputs3();
}
/* ---- HT-22 S1 · THE THREE INPUTS ARE RENDERED, NOT MARKED UP ---------------------------
   They live in two hosts that the paint fills, for the reason HT-21 S5 gave for the Notes
   field: a sheet that shows a box it cannot save is lying about what typing into it does. A
   column that is absent means the field is NOT RENDERED - not rendered-and-greyed, which is a
   question the day cannot answer sitting on the screen all day.
   They ride inputs 2 and 3 rather than opening a fourth surface. DEC-058 ("three inputs -
   completion, rating, journal") says a fourth write surface must be argued against the rule
   first: this is that argument, and the contradiction is reported to SPEC in the receipt. */
function isSat(k){ return dnum(k).getDay()===6; }
/* Each field is a micro-label and a small box on ONE line, and the line is the rating's own
   header line. THE HEIGHT IS THE POINT: stacked as full `.fld` rows these three cost the journal
   quadrant 60px at 1280x720, and HT-18's grow() takes every one of them off the BRAIN DUMP -
   measured 122px -> 62px. Trading half of one of the three sacred inputs (DEC-058) for a place
   to type a sleep number is not a trade, so they ride a line that was already on the screen. */
function i3f(id, lab, inner){
  return '<span class="i3f"><span class="lab">'+esc(lab)+'</span>'+inner+'</span>';
}
/* ---- HT-25 S6 · THE SLEEP NUMBER NEVER APPEARS WITHOUT ITS DERIVATION -------------------
   Cory, 2026-09-10: "how does HT know I slept 7.5 hours? I'm not sure that's accurate."

   THE ANSWER, FOUND BY READING THE CODE RATHER THAN GUESSING AT IT: it doesn't know. Nothing in
   this file ever derived that number. `sleep_hours` was a plain <input type="number"> and 7.5 was
   its PLACEHOLDER - so an empty field showed a greyed 7.5 that looks exactly like a value. The
   honest formula was "whatever Cory typed, or nothing at all dressed as 7.5".

   That is a VERIFY failure (every number on screen is traceable to its inputs, or it is labeled
   estimated), so the fix is not a better formula - it is a derivation the number has to carry:

     bed + wake present  -> DERIVED     "bed 23:10 -> up 06:40"      the app computed it
     sleep typed only    -> SELF-REPORT "you entered this"           he computed it
     neither, but the night/morning routines were checked off
                         -> ESTIMATED   "estimated from your check-ins"   nobody computed it
     nothing at all      -> no number.  An em dash. Never a placeholder that reads as data. */
function hhmmMin(v){
  if(typeof v!=='string') return null;
  var m=/^(\d{1,2}):(\d{2})/.exec(v); if(!m) return null;
  var h=+m[1], n=+m[2];
  return (h>=0&&h<24&&n>=0&&n<60) ? h*60+n : null;
}
/* Bed is the night BEFORE the wake, so a bed time later in the clock than the wake time crosses
   midnight and the span wraps. 23:10 -> 06:40 is 7h30m, not minus sixteen and a half hours. */
function sleepSpan(bed, wake){
  var b=hhmmMin(bed), w=hhmmMin(wake);
  if(b==null||w==null) return null;
  var mins = w - b; if(mins <= 0) mins += 1440;
  return Math.round(mins/60*100)/100;
}
/* The one place that answers "what do we know about this night, and how do we know it".
   Returns {hours, how, why} - never a bare number, which is the whole point of the section. */
function sleepFact(k){
  var p = (k===S.date ? S.priv : S.privAll[k]) || {};
  var span = sleepSpan(p.bed_time, p.wake_time);
  if(span!=null) return { hours:span, how:'derived',
                          why:'bed '+fmtTime(p.bed_time)+' → up '+fmtTime(p.wake_time) };
  if(p.sleep_hours!=null && p.sleep_hours!=='')
    return { hours:+p.sleep_hours, how:'self', why:'you entered this' };
  var est = sleepFromCheckins(k);
  if(est!=null) return { hours:est.hours, how:'est', why:'estimated from your check-ins' };
  return { hours:null, how:'none', why:'' };
}
/* THE FALLBACK, AND IT IS LABELED EVERY TIME IT IS USED. A night routine and a morning routine
   that both carry a done-time bracket the night; that is an inference from behaviour, not a
   measurement of sleep, so it never renders as a plain number. */
function sleepFromCheckins(k){
  var night=null, morn=null;
  (S.habits||[]).forEach(function(h){
    var n=String(h.name||'').toLowerCase();
    var at=doneAt(k, h.id); if(!at) return;
    if(/night|evening|bed/.test(n) && night==null) night=at;
    if(/morning|wake|rise/.test(n) && morn==null)  morn=at;
  });
  var span = sleepSpan(night, morn);
  return span==null ? null : { hours:span };
}
function paintSleepWhy(){
  var n=el('sleepWhy'); if(!n) return;
  var f=sleepFact(S.date);
  n.className = 'swhy ' + f.how;
  n.textContent = f.how==='none' ? '' : f.why;
  n.hidden = f.how==='none';
  var v=el('sleepVal'); if(v){ v.textContent = f.hours==null ? '—' : f.hours; }
}
window.__HT25S6 = { sleepSpan:sleepSpan, sleepFact:function(k){ return sleepFact(k); },
                    hhmmMin:hhmmMin };

function paintInputs3(){
  var a=el('in3a'); if(!a) return;
  var h='';
  /* S5: bed and wake are ON by default, and they are what give S6 a real derivation. Two time
     inputs on the line that already exists - not a fourth write surface (DEC-058). */
  if(S.hasBed) h+=i3f('iBed','Bed',
    '<input id="iBed" class="num" type="time" '+
    'value="'+esc(S.priv&&S.priv.bed_time?String(S.priv.bed_time).slice(0,5):'')+'">');
  if(S.hasWake) h+=i3f('iWake','Up',
    '<input id="iWake" class="num" type="time" '+
    'value="'+esc(S.priv&&S.priv.wake_time?String(S.priv.wake_time).slice(0,5):'')+'">');
  if(S.hasSleep) h+=i3f('iSleep','Slept',
    /* NO PLACEHOLDER. It read "7.5" in grey on an empty field, which is indistinguishable from a
       value at a glance and is most of why Cory doubted the number. An empty field now looks
       empty. */
    '<input id="iSleep" class="num" type="number" min="0" max="24" step=".25" inputmode="decimal" '+
    'value="'+esc(S.priv&&S.priv.sleep_hours!=null?S.priv.sleep_hours:'')+'">');
  /* WEIGHT IS SATURDAY ONLY. On a Wednesday the field is absent rather than disabled; a Saturday
     he logs back to still shows its own number, because the rule belongs to the DAY on screen and
     not to today. */
  if(S.hasWeight && isSat(S.date)) h+=i3f('iWeight','Weight',
    '<input id="iWeight" class="num" type="number" min="0" step=".1" inputmode="decimal" '+
    'value="'+esc(S.priv&&S.priv.weight_lb!=null?S.priv.weight_lb:'')+'" placeholder="lb">');
  if(S.hasTomorrow){
    var k=shift(S.date,1), d=dnum(k);
    /* THE LABEL IS ONE WORD AND THE PLACEHOLDER IS TWO. "Tomorrow's one thing" plus a sentence
       of placeholder rendered as "meets you at the top of Fr" - a hint clipped mid-word is worse
       than no hint. The sentence lives in `title`, where it costs no width. Caught in the 1920
       shot, not in the suite (R70.211). */
    h+=i3f('iOne','Tomorrow',
      '<input id="iOne" class="i3wide" value="'+esc(oneThingOf(k)||'')+'" autocomplete="off" '+
      'title="tomorrow’s one thing — saved onto '+WD[d.getDay()]+' '+MO[d.getMonth()]+
      ' '+d.getDate()+', where it meets you at the top of that day’s list" '+
      'placeholder="one thing">');
  }
  /* S6: the derivation rides the same line the number does, so there is no way to render one
     without the other. It is the last child on purpose - a caption belongs under its number. */
  if(h) h += '<span class="swhy" id="sleepWhy" hidden></span>';
  a.innerHTML=h; a.hidden=!h;
  paintSleepWhy();
}

function toggle(hid){
  var h=S.habits.filter(function(x){return x.id===hid;})[0]; if(!h) return;
  var r=S.byDate[S.date] || (S.byDate[S.date]={date:S.date,checked:{},pct:0});
  r.checked = r.checked || {};
  if(isWeekly(h)){
    /* ---- HT-20 P2 · A CHECK IS ALWAYS A TOGGLE (R70.263) ------------------------------
       A weekly is still CREDITED on the day it is done. What changed is that it can be UNDONE
       from any day in the same period. The old branch refused with "already done this week",
       which made the box a one-way door: tick it on Monday by mistake and there was no screen
       anywhere in the app that would untick it. A control that only goes one way is not a
       checkbox.
       So an uncheck reaches the day the completion actually lives on, clears it there, and saves
       THAT day against ITS OWN active_set — never against today's list, which would reprice a
       past grade. A re-check then lands on the CURRENT day, because that is when it was done;
       history is not rewritten by hand. */
    if(r.checked[hid]) delete r.checked[hid];
    else {
      var src=weekCheckDay(hid,S.date);
      if(src){
        var rr=S.byDate[src];
        if(rr && rr.checked) delete rr.checked[hid];
        saveDayFor(src);
      } else r.checked[hid]=stamp();
    }
  } else {
    if(r.checked[hid]) delete r.checked[hid]; else r.checked[hid]=stamp();
  }
  /* S2: the check carries its own clock when the day being logged IS today; unchecking deletes
     the entry, which clears the done time with it. */
  function stamp(){ return S.date===today() ? nowClock() : true; }
  queueSave(); paintMast(); paintLog(); paintRail(); paintRight();
}

/* ============================ instruments ============================ */
/* ---- HT-19 B0.2 - A FALLBACK THAT INVENTS A NUMBER IS WORSE THAN AN ERROR (R70.239) ------
   `Math.max(240, n.clientWidth || n.parentNode.clientWidth || 340)` turned "I could not measure"
   into "I measured 340", and a wrong number that looks like a right one draws a whole chart. On a
   fresh load the grid has not sized the panel yet, so both charts were drawn for a 300x620 box and
   squeezed into 251x278 - Cory's "crunched until I switch the month". Nothing re-measured because
   there was no ResizeObserver, no document.fonts.ready and no requestAnimationFrame anywhere in
   this file (grep: 0). fitSvg now returns null when it cannot measure, every caller returns on
   null, and measureAndDraw() below guarantees the measurement eventually happens. */
function fitSvg(id,h){
  var n=el(id); if(!n) return null;
  var w = n.clientWidth || (n.parentNode && n.parentNode.clientWidth) || 0;
  if(w < 120) return null;                 /* unmeasurable: do NOT draw a wrong chart */
  w = Math.round(w);                       /* no 240 floor, no 340 invention */
  n.setAttribute('viewBox','0 0 '+w+' '+h);
  n.setAttribute('preserveAspectRatio','xMinYMin meet');
  n.setAttribute('height',h); n.style.height=h+'px';
  return w;
}

/* ---- HT-19 B0.2 - ONE SHARED measureAndDraw, used by every chart painter -----------------
   Layout has not happened when a painter is first called, so `fn` runs after TWO animation
   frames; label widths depend on the webfont, so it runs again on document.fonts.ready; and the
   panel can change width without any repaint firing, so a ResizeObserver per container re-runs it.
   The observer callback NEVER draws synchronously - it schedules through requestAnimationFrame,
   because drawing inside a ResizeObserver callback is how ResizeObserver loops are born. Installing
   twice on the same node is a no-op: the node is stamped. */
function measureAndDraw(id, fn){
  var host = el(id); if(!host) { fn(); return; }
  var box = host.parentNode || host;
  function run(){ try{ fn(); }catch(e){} }
  requestAnimationFrame(function(){ requestAnimationFrame(run); });
  if(document.fonts && document.fonts.ready && !host.__mdFonts){
    host.__mdFonts = 1;
    document.fonts.ready.then(function(){ requestAnimationFrame(run); });
  }
  if(window.ResizeObserver && !box.__mdRO){
    box.__mdRO = new ResizeObserver(function(entries){
      var w = Math.round(entries[0].contentRect.width);
      if(box.__mdW != null && Math.abs(w - box.__mdW) <= 1) return;
      box.__mdW = w;
      if(box.__mdPending) return;
      box.__mdPending = 1;
      requestAnimationFrame(function(){ box.__mdPending = 0; run(); });
    });
    box.__mdRO.observe(box);
  }
}
/* fills use the density ramp; text uses ink / bad / good only */
function gtxt(p){ return p==null?'var(--ink3)':(p<50?'var(--bad)':(p>=90?'var(--good)':'var(--ink)')); }
function paintRight(){
  paintSankey(); paintHeat(); paintCal(); paintChart(); paintMomo(); paintDow();
  paintByMo(); paintByYear(); paintGdist();
  paintRChart(); paintRScat(); paintRSleep(); paintRByMo(); paintJournal();
  paintPerHabit(); paintScatter(); paintStreaks(); paintGroups(); paintNextMove();
  paintTLedger(); paintLife();
}

/* ---- month calendar, completion or rating ---- */
function paintCal(){
  var y=S.calYM[0], m=S.calYM[1];
  var first=new Date(y,m,1), start=new Date(first);
  start.setDate(1-((first.getDay()+6)%7));                 /* Monday-led */
  var h=['Mo','Tu','We','Th','Fr','Sa','Su'].map(function(d){return '<div class="hd">'+d+'</div>';}).join('');
  for(var i=0;i<42;i++){
    var d=new Date(start); d.setDate(start.getDate()+i);
    var k=dk(d), out=(d.getMonth()!==m), fut=(k>today());
    var v,f,txt;
    if(S.calMode==='rate'){ v=ratingOf(k); f=(v==null?'var(--sunk)':dens(v*10)); txt=(v==null?'':v); }
    else { var r=S.byDate[k]; v=(r&&r.pct!=null&&!fut)?r.pct:null; f=dens(v); txt=(v==null?'':v); }
    h+='<button class="d'+(out?' out':'')+(k===today()?' tdy':'')+'" data-cd="'+k+'" style="background:'+f+'">'+
       '<b>'+d.getDate()+'</b>'+(txt===''?'':'<s>'+txt+'</s>')+'</button>';
  }
  el('cal').innerHTML=h;
  el('calNav').innerHTML='<button class="mv" data-cm="-1">‹</button> '+MO[m]+' '+y+' <button class="mv" data-cm="1">›</button>';
}
function paintHeatLegend(){
  var h='<span>less</span>';
  [0,20,40,60,80,100].forEach(function(p){ h+='<i style="background:'+dens(p)+'"></i>'; });
  h+='<span>more</span><span style="margin-left:auto">grey = no entry</span>';
  el('heatLeg').innerHTML=h;
}

/* ---- rating: the second input finally gets its outputs ---- */
function paintRChart(){
  var N=90, H=118, W=fitSvg('rChart',H), pts=[], any=false;
  if(W==null) return;                      /* B0.2: unmeasurable, do not draw a wrong chart */
  for(var i=N-1;i>=0;i--){ var v=ratingOf(shift(today(),-i)); pts.push(v); if(v!=null) any=true; }
  if(!any){ el('rChart').innerHTML='<text x="6" y="20">No ratings yet — rate a day on the left.</text>';
    el('rTrendC').textContent='90 days'; return; }
  var px=function(i){ return 24+i*(W-32)/(N-1); }, py=function(v){ return H-16-(v/10)*(H-28); };
  var s='';
  [0,5,10].forEach(function(v){
    s+='<line class="ax" x1="22" y1="'+py(v)+'" x2="'+(W-4)+'" y2="'+py(v)+'"/>'+
       '<text x="18" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  pts.forEach(function(v,i){ if(v==null) return;
    s+='<rect x="'+(px(i)-2).toFixed(1)+'" y="'+py(v).toFixed(1)+'" width="4" height="'+(py(0)-py(v)).toFixed(1)+
       '" fill="'+dens(v*10)+'"><title>'+shift(today(),-(N-1-i))+' · '+v+'/10</title></rect>'; });
  var m30=rollRate(30);
  if(m30!=null) s+='<line x1="22" y1="'+py(m30)+'" x2="'+(W-4)+'" y2="'+py(m30)+
    '" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="3 3"/>';
  el('rChart').innerHTML=s;
  el('rTrendC').textContent='90 days · 30d avg '+(m30==null?'—':m30);
}
function pearson(a,b){
  var n=a.length; if(n<3) return null;
  var ma=a.reduce(function(x,y){return x+y;},0)/n, mb=b.reduce(function(x,y){return x+y;},0)/n;
  var sn=0,da=0,db=0;
  for(var i=0;i<n;i++){ var x=a[i]-ma, y=b[i]-mb; sn+=x*y; da+=x*x; db+=y*y; }
  if(!da||!db) return null;
  return sn/Math.sqrt(da*db);
}
function paintRScat(){
  var H=136, W=fitSvg('rScat',H), P=[], R=[];
  if(W==null) return;                      /* B0.2: unmeasurable, do not draw a wrong chart */
  dates().forEach(function(k){
    var r=S.byDate[k], v=ratingOf(k);
    if(r&&r.pct!=null&&v!=null){ P.push(r.pct); R.push(v); }
  });
  if(P.length<3){
    el('rScat').innerHTML='<text x="6" y="20">Rate a few more days and this fills in.</text>';
    el('rScatN').innerHTML='Once there are ratings on at least three logged days, this answers one question: <b>does hitting the standard actually make the day feel better?</b>';
    return;
  }
  var px=function(p){ return 30+(p/100)*(W-44); }, py=function(v){ return H-20-(v/10)*(H-36); };
  var s='';
  [0,5,10].forEach(function(v){ s+='<line class="ax" x1="26" y1="'+py(v)+'" x2="'+(W-6)+'" y2="'+py(v)+'"/>'+
    '<text x="22" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  for(var i=0;i<P.length;i++)
    s+='<circle cx="'+px(P[i]).toFixed(1)+'" cy="'+py(R[i]).toFixed(1)+'" r="4" fill="'+dens(P[i])+
       '" opacity=".8"><title>'+P[i]+'% · rated '+R[i]+'</title></circle>';
  var r=pearson(P,R);
  if(r!=null){
    var ma=P.reduce(function(x,y){return x+y;},0)/P.length, mb=R.reduce(function(x,y){return x+y;},0)/R.length;
    var num=0,den=0; for(var j=0;j<P.length;j++){ num+=(P[j]-ma)*(R[j]-mb); den+=(P[j]-ma)*(P[j]-ma); }
    if(den){ var sl=num/den, ic=mb-sl*ma;
      s+='<line x1="'+px(0)+'" y1="'+py(clamp(ic,0,10))+'" x2="'+px(100)+'" y2="'+py(clamp(sl*100+ic,0,10))+
         '" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3"/>'; }
  }
  s+='<text x="'+(W-6)+'" y="'+(H-4)+'" text-anchor="end">completion % →</text>';
  el('rScat').innerHTML=s;
  var strength = r==null?'':(Math.abs(r)>=0.6?'strong':Math.abs(r)>=0.35?'real but moderate':'weak');
  el('rScatN').innerHTML = r==null ? '' :
    'Across <b>'+P.length+'</b> rated days the correlation is <b>r = '+r.toFixed(2)+'</b> — '+strength+
    (r>=0.35 ? '. Hitting the standard does make the day feel better; the routine is earning its cost.'
     : r<=-0.35 ? '. Higher completion goes with <b>worse</b> days. The list is buying compliance at the price of the day — worth looking at what you are grinding through.'
     : '. Completion and how the day felt are close to independent. Either the list is not touching what actually makes a day good, or something outside it is driving the mood.');
}
/* ---- HT-22 S1 · SLEEP AGAINST RATING (R70.284) -----------------------------------
   Same shape as `paintRScat`, a different question: not "does hitting the standard make the day
   feel better" but "does the night before". It refuses to draw on fewer than three nights and
   says so, and it never invents an axis it could not measure (HT-19 B0.2) - `fitSvg` returning
   null means do not draw, not draw at 340. */
function paintRSleep(){
  var host=el('sSlp'); if(!host) return;
  /* HT-26 S1 (stress 1): the chart that read sleep reads NOTHING under the ruling - no series, no
     empty-state sentence about nights, and its block stays hidden in index.html. */
  if(FIVE_INPUTS_ONLY){ host.innerHTML=''; var sn=el('sSlpN'); if(sn) sn.innerHTML=''; return; }
  var H=136, W=fitSvg('sSlp',H), X=[], Y=[];
  if(W==null) return;
  dates().forEach(function(k){
    var pv=S.privAll[k], sl=pv&&pv.sleep_hours, v=ratingOf(k);
    if(sl!=null && sl!=='' && v!=null){ X.push(+sl); Y.push(v); }
  });
  var note=el('sSlpN');
  if(X.length<3){
    host.innerHTML='<text x="6" y="20">Log a few nights of sleep and this fills in.</text>';
    if(note) note.innerHTML='Once three days carry both hours slept and a rating, this answers '+
      'one question: <b>does the night before show up in the day?</b>';
    return;
  }
  var lo=Math.min.apply(null,X), hi=Math.max.apply(null,X);
  if(hi-lo<0.5){ lo=lo-0.5; hi=hi+0.5; }
  var px=function(v){ return 30+((v-lo)/(hi-lo))*(W-44); }, py=function(v){ return H-20-(v/10)*(H-36); };
  var g='';
  [0,5,10].forEach(function(v){ g+='<line class="ax" x1="26" y1="'+py(v)+'" x2="'+(W-6)+'" y2="'+py(v)+'"/>'+
    '<text x="22" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  for(var i=0;i<X.length;i++)
    g+='<circle cx="'+px(X[i]).toFixed(1)+'" cy="'+py(Y[i]).toFixed(1)+'" r="4" '+
       'fill="var(--accent)" opacity=".7"><title>'+X[i]+'h '+'·'+' rated '+Y[i]+'</title></circle>';
  var r=pearson(X,Y);
  if(r!=null){
    var ma=X.reduce(function(a,b){return a+b;},0)/X.length, mb=Y.reduce(function(a,b){return a+b;},0)/Y.length;
    var nu=0, de=0; for(var j=0;j<X.length;j++){ nu+=(X[j]-ma)*(Y[j]-mb); de+=(X[j]-ma)*(X[j]-ma); }
    if(de){ var sl2=nu/de, ic=mb-sl2*ma;
      g+='<line x1="'+px(lo)+'" y1="'+py(clamp(sl2*lo+ic,0,10))+'" x2="'+px(hi)+'" y2="'+
         py(clamp(sl2*hi+ic,0,10))+'" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3"/>'; }
  }
  g+='<text x="'+(W-6)+'" y="'+(H-4)+'" text-anchor="end">hours slept \u2192</text>';
  host.innerHTML=g;
  if(note) note.innerHTML = (r==null) ? '' :
    'Across <b>'+X.length+'</b> nights the correlation is <b>r = '+r.toFixed(2)+'</b>'+
    (r>=0.35 ? ' \u2014 sleep is showing up in how the day feels.'
     : r<=-0.35 ? ' \u2014 more sleep goes with worse days, which is worth a second look before it is believed.'
     : ' \u2014 close to independent so far. Either the range of nights is too narrow to see it, or something else is driving the day.');
}
function monthly(fn){
  var sum=new Array(12).fill(0), n=new Array(12).fill(0);
  dates().forEach(function(k){ var v=fn(k); if(v==null) return;
    var m=dnum(k).getMonth(); sum[m]+=v; n[m]++; });
  return sum.map(function(x,i){ return n[i]?Math.round(x/n[i]*10)/10:null; });
}
function colChart(id,vals,labels,maxv,fmtv,colf){
  var mx=maxv||Math.max.apply(null,vals.map(function(x){return x||0;}))||1;
  el(id).innerHTML = vals.map(function(v,i){
    var h=v==null?1:Math.max(3,Math.round(v/mx*52));
    return '<div class="c"><b'+(v==null?' style="color:var(--ink3)"':'')+'>'+(v==null?'·':(fmtv?fmtv(v):v))+'</b>'+
      '<i style="height:'+h+'px;background:'+(v==null?'var(--sunk)':colf(v))+(v==null?';opacity:.5':'')+'"></i>'+
      '<u>'+labels[i]+'</u></div>';
  }).join('');
}
function paintByMo(){
  var v=monthly(function(k){ var r=S.byDate[k]; return (r&&r.pct!=null)?r.pct:null; });
  colChart('byMo', v.map(function(x){return x==null?null:Math.round(x);}),
    MO.map(function(m){return m[0];}), 100, null, dens);
  var got=v.filter(function(x){return x!=null;}).length;
  el('byMoC').textContent='completion · '+got+' of 12 months';
}
function paintRByMo(){
  var v=monthly(ratingOf);
  colChart('rByMo', v, MO.map(function(m){return m[0];}), 10,
    function(x){ return x.toFixed(1); }, function(x){ return dens(x*10); });
}
function paintByYear(){
  var y={}, o=[];
  dates().forEach(function(k){ var r=S.byDate[k]; if(!r||r.pct==null) return;
    var yy=k.slice(0,4); if(!y[yy]){ y[yy]={s:0,n:0,rs:0,rn:0}; o.push(yy); }
    y[yy].s+=r.pct; y[yy].n++;
    var v=ratingOf(k); if(v!=null){ y[yy].rs+=v; y[yy].rn++; }
  });
  if(!o.length){ el('byYear').innerHTML='<div class="empty">Nothing logged yet.</div>'; return; }
  el('byYear').innerHTML='<table class="kv">'+o.sort().reverse().map(function(yy){
    var a=y[yy], p=Math.round(a.s/a.n), r=a.rn?Math.round(a.rs/a.rn*10)/10:null;
    return '<tr><td class="k">'+yy+' <span style="color:var(--ink3)">'+a.n+' days</span></td>'+
      '<td class="v w" style="white-space:nowrap"><b style="color:'+gtxt(p)+'">'+p+'%</b>'+
      '<span style="color:var(--ink3)"> · '+(r==null?'—':r+'/10')+'</span></td></tr>';
  }).join('')+'</table>';
}
function paintJournal(){
  var ks=Object.keys(S.privAll).filter(function(k){
    var p=S.privAll[k]; return p && (p.why||p.tasks||p.prayer);
  }).sort().reverse().slice(0,14);
  if(!ks.length){ el('jArc').innerHTML='<div class="empty">Nothing written yet. The journal on the left lands here.</div>';
    el('jArcC').textContent=''; return; }
  el('jArc').innerHTML = ks.map(function(k){
    var p=S.privAll[k], r=S.byDate[k], d=dnum(k);
    var body='';
    if(p.why)    body+='<p class="q">'+esc(p.why)+'</p>';
    if(p.tasks)  body+='<p>'+esc(p.tasks)+'</p>';
    if(p.prayer) body+='<p class="q">'+esc(p.prayer)+'</p>';
    return '<button class="jr" data-jd="'+k+'" style="display:block;width:100%">'+
      '<span class="h"><b>'+WD[d.getDay()]+' '+MO[d.getMonth()]+' '+d.getDate()+'</b>'+
      (p.rating!=null?'<s style="color:'+gtxt(p.rating*10)+'">'+p.rating+'/10</s>':'')+
      '<span>'+(r&&r.pct!=null?r.pct+'%':'')+'</span></span>'+body+'</button>';
  }).join('');
  el('jArcC').textContent = ks.length+' entr'+(ks.length===1?'y':'ies');
}
function paintNextMove(){
  var a=nextMoveRank();
  if(!a.length){ el('nextMove').innerHTML='<div class="empty">Log a few days first.</div>'; return; }
  var b=a[0], n=daily().length;
  var gain=Math.round(100/n);
  var tight = b.pct>=70;
  el('nextMove').innerHTML='<div class="nm"><span class="big">'+esc(nameOf(b.h.name))+'</span>'+
    'Held <b>'+b.pct+'%</b> over the last '+b.of+' logged days at a cost of '+
    (b.mins?('<b>'+b.mins+' minutes</b>'):'<b>no time at all</b>')+
    '. It is the cheapest ground left on the board — about <b>'+gain+
    ' points</b> of score per day, for '+(b.mins?b.mins+' minutes':'nothing')+'.'+
    (tight?' Nothing cheap is badly broken right now, so the next real gain has to come from something that costs time.':'')+
    '<div style="padding-top:8px;color:var(--ink2)">Runners-up: '+
      a.slice(1,4).map(function(s){ return esc(nameOf(s.h.name))+' ('+s.pct+'%)'; }).join(' · ')+
    '</div></div>';
}



/* ---- where the day goes: a true two-stage flow ---- */
function paintSankey(){
  var H=156, W=fitSvg('sank',H), X=2, T1=34, BH=30, T2=110, ck=ckOf(S.date);
  if(W==null) return;                      /* B0.2: unmeasurable, do not draw a wrong chart */
  var day=1440, com=committed();
  if(!com){ el('sank').innerHTML='<text x="2" y="20">No minutes priced yet — set them in Settings.</text>'; return; }

  var gs={}, order=[];
  daily().forEach(function(h){
    var g=h.group_name||'Other'; if(!gs[g]){ gs[g]={m:0,d:0}; order.push(g); }
    gs[g].m+=(h.minutes||0); if(ck[h.id]) gs[g].d+=(h.minutes||0);
  });
  order=order.filter(function(g){ return gs[g].m>0; });

  var px=(W-X*2)/com, s='', x=X, seg=[];
  order.forEach(function(g,i){
    var w=gs[g].m*px;
    seg.push({g:g,x:x,w:w,m:gs[g].m,d:gs[g].d});
    s+='<rect x="'+x.toFixed(1)+'" y="'+T1+'" width="'+Math.max(w-1,.6).toFixed(1)+'" height="'+BH+
       '" fill="var(--accent)" opacity="'+(0.92-0.17*i).toFixed(2)+'"/>';
    if(w>78)      s+='<text x="'+(x+1)+'" y="'+(T1-7)+'" class="b">'+esc(g)+' · '+fmt(gs[g].m)+'</text>';
    else if(w>34) s+='<text x="'+(x+1)+'" y="'+(T1-7)+'" class="b">'+esc(g.slice(0,4))+'</text>';
    x+=w;
  });

  var done=order.reduce(function(t,g){return t+gs[g].d;},0), miss=com-done;
  var dW=done*px, mW=miss*px;
  s+='<rect x="'+X+'" y="'+T2+'" width="'+Math.max(dW-1,.6).toFixed(1)+'" height="'+BH+'" fill="var(--accent)"/>';
  s+='<rect x="'+(X+dW).toFixed(1)+'" y="'+T2+'" width="'+Math.max(mW,.6).toFixed(1)+'" height="'+BH+
     '" fill="var(--sunk)" stroke="var(--rule2)" stroke-dasharray="2 2"/>';

  var dx=X, mx=X+dW;
  seg.forEach(function(p){
    if(p.d>0){ var w=p.d*px; s+=rib(p.x,w,dx,w,T1+BH,T2,'var(--accent)',0.22); dx+=w; }
    var mm=p.m-p.d;
    if(mm>0){ var w2=mm*px; s+=rib(p.x+p.d*px,w2,mx,w2,T1+BH,T2,'var(--ink3)',0.09); mx+=w2; }
  });

  s+='<text x="'+X+'" y="12" class="b">'+fmt(com)+' committed</text>'+
     '<text x="'+(W-X)+'" y="12" text-anchor="end">'+Math.round(com/day*100)+'% of 24h · '+fmt(day-com)+' unclaimed</text>';
  s+='<text x="'+X+'" y="'+(T2+BH+15)+'" class="b" fill="var(--accent)">Done '+fmt(done)+'</text>'+
     '<text x="'+(W-X)+'" y="'+(T2+BH+15)+'" text-anchor="end">Missed '+fmt(miss)+'</text>';
  el('sank').innerHTML=s;
}
function rib(x1,w1,x2,w2,y1,y2,fill,op){
  var m=(y1+y2)/2;
  return '<path d="M'+x1+','+y1+' C'+x1+','+m+' '+x2+','+m+' '+x2+','+y2+
    ' L'+(x2+w2)+','+y2+' C'+(x2+w2)+','+m+' '+(x1+w1)+','+m+' '+(x1+w1)+','+y1+' Z" fill="'+fill+
    '" opacity="'+op+'" stroke="var(--rule)" stroke-width=".5"/>';
}

/* ---- record: 52-week heat ---- */
function paintHeat(){
  var end=dnum(today()), all=dates();
  var start=new Date(end); start.setDate(end.getDate()-363);
  if(all.length){ var f=dnum(all[0]); f.setDate(f.getDate()-7); if(f>start) start=f; }
  start.setDate(start.getDate()-((start.getDay()+6)%7));       /* back to a Monday */

  var cells='', cols=[], d=new Date(start);
  while(d<=end){
    cols.push(new Date(d));                                     /* the Monday of this column */
    for(var wd=0;wd<7;wd++){
      if(d>end){ cells+='<i style="background:transparent"></i>'; d.setDate(d.getDate()+1); continue; }
      var k=dk(d), r=S.byDate[k], p=(r&&r.pct!=null)?r.pct:null;
      cells+='<i class="'+(k===today()?'tdy':'')+'" style="background:'+dens(p)+
             '" title="'+k+(p==null?'':' · '+p+'%')+'"></i>';
      d.setDate(d.getDate()+1);
    }
  }
  el('heat').innerHTML=cells;

  /* month strip: one span per month, exact column pitch, so it stays aligned */
  var PITCH=11, mh='', run=0, cur=cols.length?cols[0].getMonth():0;
  for(var i=0;i<=cols.length;i++){
    var m=(i<cols.length)?cols[i].getMonth():-1;
    if(m!==cur){
      var w=run*PITCH;
      mh+='<span style="width:'+w+'px">'+(w>=28?MO[cur]:'')+'</span>';
      cur=m; run=0;
    }
    run++;
  }
  el('mrow').innerHTML=mh;
  el('heatC').textContent=all.length+' days logged · '+(rolling(365)||0)+'% mean';
  paintHeatLegend();
}

/* ---- trend ---- */
function paintChart(){
  var N=90, H=118, W=fitSvg('chart',H), pts=[], i, any=false;
  if(W==null) return;                      /* B0.2: unmeasurable, do not draw a wrong chart */
  for(i=N-1;i>=0;i--){
    var k=shift(today(),-i), r=S.byDate[k];
    pts.push(r&&r.pct!=null?r.pct:null); if(r&&r.pct!=null) any=true;
  }
  if(!any){ el('chart').innerHTML='<text x="6" y="20">Not enough logged days yet.</text>'; return; }
  var px=function(i){ return 24+i*(W-32)/(N-1); }, py=function(v){ return H-16-(v/100)*(H-28); };
  var s='';
  [0,50,100].forEach(function(v){
    s+='<line class="ax" x1="22" y1="'+py(v)+'" x2="'+(W-4)+'" y2="'+py(v)+'"/>'+
       '<text x="18" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>';
  });
  var d='',a='',open=false, first=null,lastX=null;
  pts.forEach(function(v,i){
    if(v==null){ open=false; return; }
    var X=px(i),Y=py(v);
    d += (open?' L':' M')+X.toFixed(1)+','+Y.toFixed(1);
    if(first==null) first=X; lastX=X; open=true;
  });
  if(first!=null){
    a='M'+first+','+py(0)+' ';
    pts.forEach(function(v,i){ if(v!=null) a+='L'+px(i).toFixed(1)+','+py(v).toFixed(1)+' '; });
    a+='L'+lastX+','+py(0)+' Z';
    s+='<path class="ar" d="'+a+'"/>';
  }
  s+='<path class="ln" d="'+d+'"/>';
  var m30=rolling(30); if(m30!=null)
    s+='<line x1="22" y1="'+py(m30)+'" x2="'+(W-4)+'" y2="'+py(m30)+'" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="3 3"/>';
  el('chart').innerHTML=s;
  el('trendC').textContent='90 days · 30d mean '+(m30==null?'—':m30+'%');
}

/* ---- momentum ---- */
function paintMomo(){
  var a=rolling(7), b=rolling(7, shift(today(),-7));
  var d=(a==null||b==null)?null:a-b;
  var proj=null;
  if(a!=null&&d!=null) proj=clamp(a+d,0,100);
  el('momo').innerHTML='<table class="kv">'+
    kv('This 7 days', a==null?'—':a+'%') +
    kv('Prior 7 days', b==null?'—':b+'%') +
    kv('Change', d==null?'—':'<span style="color:'+(d>=0?'var(--good)':'var(--bad)')+'">'+(d>0?'+':'')+d+' pts</span>') +
    kv('If it holds', proj==null?'—':proj+'% next week') +
    '</table>';
}
function kv(k,v){ return '<tr><td class="k">'+k+'</td><td class="v">'+v+'</td></tr>'; }

/* ---- day of week ---- */
function paintDow(){
  var sum=[0,0,0,0,0,0,0], n=[0,0,0,0,0,0,0];
  S.days.forEach(function(r){ if(r.pct==null||r.date>today()) return;
    var w=dnum(r.date).getDay(); sum[w]+=r.pct; n[w]++; });
  var v=sum.map(function(s,i){ return n[i]?Math.round(s/n[i]):null; });
  var mx=Math.max.apply(null,v.map(function(x){return x||0;}))||100;
  var idx=[1,2,3,4,5,6,0];
  el('dow').innerHTML = idx.map(function(i){
    var p=v[i], h=p==null?0:Math.max(2,Math.round(p/mx*52));
    return '<div class="c"><b style="color:'+gtxt(p)+'">'+(p==null?'—':p)+'</b><i style="height:'+h+'px;background:'+dens(p)+'"></i><u>'+WD2[i]+'</u></div>';
  }).join('');
}

/* ---- grade distribution ---- */
function paintGdist(){
  var b=[0,0,0,0,0,0];
  S.days.forEach(function(r){ if(r.pct==null||r.date>today()) return; b[grade(r.pct)[1]]++; });
  var mx=Math.max.apply(null,b)||1, tot=b.reduce(function(x,y){return x+y;},0);
  var names=['F','D','C','B','A','A+'];
  el('gdist').innerHTML = names.map(function(nm,i){
    var h=Math.max(b[i]?3:1,Math.round(b[i]/mx*52));
    return '<div class="c"><b>'+(b[i]||'')+'</b><i style="height:'+h+'px;background:var(--g'+i+')'+(b[i]?'':';opacity:.25')+'"></i><u>'+nm+'</u></div>';
  }).join('');
  el('gdC').textContent = tot+' days';
}

/* ---- every standard, weakest first ---- */
function stats(){
  return S.habits.map(function(h){
    var n=0,t=0,cur=0,best=0,run=0,seen=false;
    for(var i=89;i>=0;i--){
      var k=shift(today(),-i); if(!S.byDate[k]) continue;
      if(!dueDay(h,k)) continue;           /* HT-28 E12: off-days neither count nor break a streak */
      if(i<30){ t++; if(doneOn(h,k)) n++; }
      seen=true;
      if(doneOn(h,k)){ run++; if(run>best) best=run; } else if(k!==today()) run=0;
    }
    cur=run;
    return { h:h, pct:t?Math.round(n/t*100):null, hits:n, of:t, cur:cur, best:best,
             mins:(h.minutes||0), cost:(h.minutes||0)*(t?n:0) };
  });
}
function paintPerHabit(){
  var a=stats().sort(function(x,y){ return (x.pct==null?101:x.pct)-(y.pct==null?101:y.pct); });
  el('perHabit').innerHTML='<div class="bars">'+a.map(function(s){
    var p=s.pct==null?0:s.pct;
    return '<div class="br"><span class="n">'+esc(nameOf(s.h.name))+'</span>'+
      '<span class="t"><i style="width:'+p+'%;background:'+dens(s.pct)+'"></i></span>'+
      '<span class="p" style="color:'+gtxt(s.pct)+'">'+(s.pct==null?'—':p+'%')+'</span></div>';
  }).join('')+'</div>';
  var weak=a.filter(function(s){return s.pct!=null&&s.pct<50;}).length;
  el('phC').textContent = weak+' under 50% · weakest first';
}

/* ---- cost against adherence ---- */
function paintScatter(){
  var H=136,W=fitSvg('scat',H),a=stats().filter(function(s){ return s.mins>0 && s.pct!=null; });
  if(W==null) return;                      /* B0.2: unmeasurable, do not draw a wrong chart */
  if(a.length<3){ el('scat').innerHTML='<text x="6" y="20">Price the standards to see this.</text>'; el('scatN').textContent=''; return; }
  var mx=Math.max.apply(null,a.map(function(s){return s.mins;}));
  var px=function(m){ return 30+(m/mx)*(W-44); }, py=function(p){ return H-20-(p/100)*(H-36); };
  var s='';
  [0,50,100].forEach(function(v){ s+='<line class="ax" x1="26" y1="'+py(v)+'" x2="'+(W-6)+'" y2="'+py(v)+'"/>'+
    '<text x="22" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  a.forEach(function(p){
    s+='<circle cx="'+px(p.mins).toFixed(1)+'" cy="'+py(p.pct).toFixed(1)+'" r="'+
      (3+Math.min(4,p.mins/30)).toFixed(1)+'" fill="'+gcol(p.pct)+'" opacity=".78"><title>'+
      esc(nameOf(p.h.name))+' · '+p.mins+'m · '+p.pct+'%</title></circle>';
  });
  s+='<text x="'+(W-6)+'" y="'+(H-4)+'" text-anchor="end">minutes per day →</text>';
  el('scat').innerHTML=s;

  var heavy=a.filter(function(x){return x.mins>=30;}), light=a.filter(function(x){return x.mins<30;});
  var m=function(z){ return z.length?Math.round(z.reduce(function(t,x){return t+x.pct;},0)/z.length):null; };
  var hm=m(heavy), lm=m(light);
  el('scatN').innerHTML = (hm!=null&&lm!=null)
    ? 'Under 30 minutes you hold <b>'+lm+'%</b>. At 30 and over you hold <b>'+hm+'%</b>. '+
      (lm-hm>=8 ? 'The gap is <b>'+(lm-hm)+' points</b> — the failures are priced, not moral.' :
       'The gap is small; time is not what is stopping you.')
    : '';
}

/* ---- streaks ---- */
function paintStreaks(){
  var a=stats().sort(function(x,y){ return y.cur-x.cur || y.best-x.best; }).slice(0,12);
  el('streaks').innerHTML='<table class="kv">'+a.map(function(s){
    return '<tr><td class="k trunc">'+esc(nameOf(s.h.name))+'</td><td class="v w" style="white-space:nowrap">'+
      '<b style="color:'+(s.cur>0?'var(--accent)':'var(--ink3)')+'">'+s.cur+'</b>'+
      '<span style="color:var(--ink3)"> · '+s.best+'</span></td></tr>';
  }).join('')+'</table>';
}

/* ---- by group ---- */
function paintGroups(){
  var g={},o=[];
  S.habits.forEach(function(h){ var k=h.group_name||'Other'; if(!g[k]){g[k]={n:0,t:0,m:0};o.push(k);} });
  for(var i=0;i<30;i++){
    var k=shift(today(),-i); if(!S.byDate[k]) continue;
    S.habits.forEach(function(h){ var kk=h.group_name||'Other';
      g[kk].t++; if(doneOn(h,k)) g[kk].n++; });
  }
  S.habits.forEach(function(h){ g[h.group_name||'Other'].m += (h.minutes||0); });
  el('groups').innerHTML='<div class="bars">'+o.map(function(k){
    var p=g[k].t?Math.round(g[k].n/g[k].t*100):0;
    return '<div class="br"><span class="n">'+esc(k)+' <span style="color:var(--ink3)">'+fmt(g[k].m)+'</span></span>'+
      '<span class="t"><i style="width:'+p+'%;background:'+dens(p)+'"></i></span>'+
      '<span class="p" style="color:'+gtxt(p)+'">'+p+'%</span></div>';
  }).join('')+'</div>';
}

/* ---- time ledger ---- */
function paintTLedger(){
  var com=committed(), spent=0, days=0;
  for(var i=0;i<30;i++){
    var k=shift(today(),-i), r=S.byDate[k]; if(!r) continue;
    days++;
    daily().forEach(function(h){ if(doneOn(h,k)) spent+=(h.minutes||0); });
  }
  var owed=com*days, lost=owed-spent;
  el('tledger').innerHTML='<table class="kv">'+
    kv('Committed per day', fmt(com)+' · '+Math.round(com/1440*100)+'% of 24h') +
    kv('Owed over '+days+' days', fmt(owed)) +
    kv('Actually spent', fmt(spent)) +
    kv('Unspent', '<span style="color:var(--bad)">'+fmt(lost)+'</span>') +
    kv('Per day unspent', fmt(days?lost/days:0)) +
    /* HT-25 S6: this 480 is an ASSUMPTION, not a measurement - the only other place a sleep
       figure reaches the screen. VERIFY says label it, so it says "assumed", not "after". */
    /* HT-26 S1: still labeled an assumption (VERIFY), no longer in the words of the removed display */
    kv('Free hours left in a day', fmt(1440-com-480)+' <span style="color:var(--ink3)">of an assumed 16-hour day</span>') +
    '</table>';
}

/* ---- life ---- */
function paintLife(){
  var b=S.priv0&&S.priv0.birth_date;
  if(!b){ el('life').innerHTML=''; el('lifeC').textContent='add a birthday in settings'; return; }
  var born=new Date(b+'T12:00:00'), now=new Date();
  var lived=Math.floor((now-born)/6048e5), total=90*52;
  var h='';
  for(var i=0;i<total;i++) h+='<i class="'+(i<lived?'p':(i===lived?'n':''))+'"></i>';
  el('life').innerHTML=h;
  el('lifeC').textContent = lived.toLocaleString()+' of '+total.toLocaleString()+' weeks · '+
    Math.round(lived/total*100)+'% spent';
}

/* ---- circle ---- */
async function paintCircle(){
  var box=el('circle');
  try{
    var mine=await sb.from('circle_members').select('circle_id').eq('user_id',S.me.id);
    var ids=(mine.data||[]).map(function(r){return r.circle_id;});
    if(!ids.length){ box.innerHTML='<div class="empty">No circle yet. <b>Manage</b> to create or join one.</div>'; return; }
    var cs=await sb.from('circles').select('id,name,join_code').in('id',ids);
    var mem=await sb.from('circle_members').select('circle_id,user_id').in('circle_id',ids);
    var uids=(mem.data||[]).map(function(r){return r.user_id;});
    var pr=await sb.from('profiles').select('id,display_name,handle').in('id',uids);
    var pm={}; (pr.data||[]).forEach(function(p){ pm[p.id]=p; });
    var od=await sb.from('days').select('user_id,date,pct').in('user_id',uids).gte('date',shift(today(),-13));
    var by={}; (od.data||[]).forEach(function(r){ (by[r.user_id]=by[r.user_id]||{})[r.date]=r.pct; });
    S.circle=(cs.data||[])[0]||null;
    S.circleView=null;                    /* HT-26 C5: Insights reads THIS - completion % only, no new query */

    var h='';
    (cs.data||[]).forEach(function(c){
      var ms=(mem.data||[]).filter(function(m){return m.circle_id===c.id;});
      var rank=ms.map(function(m){
        var d=by[m.user_id]||{}, a=[];
        for(var i=6;i>=0;i--){ var v=d[shift(today(),-i)]; if(v!=null) a.push(v); }
        return { u:m.user_id, avg:a.length?Math.round(a.reduce(function(x,y){return x+y;},0)/a.length):null, d:d };
      }).sort(function(x,y){ return (y.avg||-1)-(x.avg||-1); });
      if(!S.circleView){ var gs=rank.filter(function(r){ return r.avg!=null; });
        S.circleView={ name:c.name, group:gs.length?Math.round(gs.reduce(function(t,r){ return t+r.avg; },0)/gs.length):null,
          rows:rank.map(function(r){ var p=pm[r.u]||{};
            return { name:p.display_name||p.handle||'member', avg:r.avg, you:r.u===S.me.id }; }) }; }
      h+='<div class="sh" style="padding-top:0"><h2>'+esc(c.name)+'</h2><span class="ln"></span><span class="c">code '+esc(c.join_code||'')+'</span></div>';
      h+=rank.map(function(r,i){
        var p=pm[r.u]||{}, nm=p.display_name||p.handle||'member';
        return '<div class="mem"><span class="rk num">'+(i+1)+'</span>'+
          '<span class="nm">'+esc(nm)+(r.u===S.me.id?' <span style="color:var(--ink3)">· you</span>':'')+'</span>'+
          '<span class="spk">'+spark(r.d)+'</span>'+
          '<span class="pc" style="color:'+gtxt(r.avg)+'">'+(r.avg==null?'—':r.avg+'%')+'</span></div>';
      }).join('');
    });
    box.innerHTML=h;
  }catch(e){ box.innerHTML='<div class="empty">Circle unavailable.</div>'; }
}
function spark(d){
  var w=64,h=16,s='',n=14;
  for(var i=0;i<n;i++){
    var v=d[shift(today(),-(n-1-i))];
    var bh=v==null?1:Math.max(1,Math.round(v/100*h));
    s+='<rect x="'+(i*(w/n)).toFixed(1)+'" y="'+(h-bh)+'" width="'+(w/n-1).toFixed(1)+'" height="'+bh+
       '" fill="'+dens(v)+'"/>';
  }
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+s+'</svg>';
}

/* ============================ overlay ============================ */
function openOv(title,body,onOpen){
  el('ovBody').innerHTML='<div class="ovh"><h3>'+esc(title)+'</h3><span class="sp" style="flex:1"></span>'+
    '<button class="tbtn" data-x="1">Close</button></div>'+body;
  el('ov').classList.add('on'); el('ov').scrollTop=0;
  if(onOpen) onOpen();
}
function closeOv(){ el('ov').classList.remove('on'); }

/* ---- settings: everything editable lives here ---- */
function openSettings(){
  var GROUPS=['Morning','Afternoon','Night','Standards','Weekly','Other'];
  var rows=S.habits.slice().sort(function(a,b){return (a.sort_order||0)-(b.sort_order||0);});
  S.edSrc=rows;
  /* R46.5: cue coverage extends to EVERY below-median standard, not the worst ten. */
  var WEAK10=belowMedian();
  function edRow(h,i){
    return '<div class="ed" data-i="'+i+'">'+
      '<button class="hnd" data-up="'+i+'" title="move up">↑</button>'+
      '<input class="en" value="'+esc(h.name)+'" placeholder="standard">'+
      '<input class="em num" type="number" min="0" step="5" value="'+(h.minutes||0)+'" title="minutes">'+
      (S.hasCue?('<input class="eq" value="'+esc(h.cue||'')+'" placeholder="'+
        (WEAK10[h.id]?'⚑ after I ___, I will ___':'after I ___, I will ___')+
        '" title="Cue — the event this standard hangs off. Ten weakest are flagged.">'):'')+
      '<select class="eg">'+GROUPS.map(function(g){
        return '<option'+(g===(h.group_name||'Other')?' selected':'')+'>'+g+'</option>'; }).join('')+'</select>'+
      /* HT-28 E12: this list offered only Daily/Weekly, so SAVING it turned every dow: standard
         (the Sabbath included) back into daily. A dow: row now carries its own option, selected. */
      (function(){ var pc=parseCadence(h.cadence), dowv=pc.kind==='dow'?serializeCadence(pc):null;
        return '<select class="ec"><option value="daily"'+(pc.kind==='daily'?' selected':'')+'>Every day</option>'+
          (dowv?'<option value="'+dowv+'" selected>Certain days</option>':'')+
          '<option value="weekly"'+(pc.kind==='weekly'?' selected':'')+'>Once a week</option></select>'; })()+
      '<button class="x" data-rm="'+i+'" title="archive">×</button></div>';
  }
  var body=
    '<div class="sh"><h2>The standards</h2><span class="ln"></span><span class="c">'+rows.length+' · edit anything</span></div>'+
    (S.hasCue?(function(){ var c=cueCoverage(); return '<div class="cuecov">Cues written: <b>'+c.got+
      '</b> of <b>'+c.need+'</b> below-median standards'+(c.got<c.need?' — the flagged rows are where a cue is worth writing.':' — covered.')+
      '</div>'; })():'')+
    '<div class="bud" id="bud"></div>'+
    '<div class="tools" style="padding:0 0 8px">'+
      '<button class="btn" id="edAdd">+ Add</button>'+
      '<span style="flex:1"></span>'+
      '<button class="btn pri" id="edSave">Save standards</button>'+
    '</div>'+
    '<div id="edList">'+rows.map(edRow).join('')+'</div>'+
    '<div class="tools" style="padding-top:10px">'+
      '<button class="btn" id="edAdd2">+ Add</button>'+
      '<span style="flex:1"></span>'+
      '<button class="btn pri" id="edSave2">Save standards</button>'+
    '</div>'+

    '<div class="sh"><h2>Look</h2><span class="ln"></span><span class="c">pick one</span></div>'+
    '<div class="tools">'+SKINS.map(function(s){
      return '<button class="tbtn" data-skin2="'+s+'">'+s+'</button>'; }).join('')+'</div>'+

    '<div class="sh"><h2>You</h2><span class="ln"></span><span class="c">'+esc(S.me.email||'')+'</span></div>'+
    '<label class="fld"><span class="lab">Display name</span><input id="pName" value="'+esc(S.me.display_name||'')+'"></label>'+
    '<label class="fld"><span class="lab">Birthday · powers the life grid</span><input id="pBirth" type="date" value="'+esc((S.priv0&&S.priv0.birth_date)||'')+'"></label>'+
    '<div class="tools"><button class="btn" id="pSave">Save profile</button></div>'+

    '<div class="sh"><h2>Take it with you</h2><span class="ln"></span><span class="c">outputs</span></div>'+
    '<div class="tools">'+
      '<button class="btn" id="xCsv">CSV · days</button>'+
      '<button class="btn" id="xCsvH">CSV · standards</button>'+
      '<button class="btn" id="xJson">JSON · everything</button>'+
      '<button class="btn" id="xPrint">Print report</button>'+
    '</div>'+

    '<div class="sh"><h2>Session</h2><span class="ln"></span><span class="c"></span></div>'+
    '<div class="tools"><button class="btn" id="bOut">Sign out</button></div>'+
    '<div class="note" id="privNote" style="padding:14px 0 0">Your journal is yours. The app never shows it to anyone else — including Cory. Your group sees your standards, your check-offs and the day’s number — never what you write.</div>';

  openOv('Settings',body,function(){
    var list=el('edList');
    paintBudget();
    list.addEventListener('input',paintBudget);
    list.addEventListener('change',paintBudget);
    list.addEventListener('click',function(e){
      var rm=e.target.closest('[data-rm]'), up=e.target.closest('[data-up]');
      if(rm){ var r=rm.closest('.ed'); r.classList.toggle('gone'); }
      if(up){ var r2=up.closest('.ed'), pv=r2.previousElementSibling; if(pv) list.insertBefore(r2,pv); }
    });
    var add=function(){
      var d=document.createElement('div'); d.innerHTML=edRow({name:'',minutes:0,group_name:'Standards',cadence:'daily'},999);
      list.appendChild(d.firstChild);
      list.lastChild.querySelector('.en').focus();
      list.lastChild.scrollIntoView({block:'center'});
    };
    el('edAdd').onclick=add; el('edAdd2').onclick=add;
    el('edSave').onclick=saveStandards; el('edSave2').onclick=saveStandards;
    el('pSave').onclick=saveProfile;
    el('xCsv').onclick=function(){ dl('ht-days.csv', csvDays()); };
    el('xCsvH').onclick=function(){ dl('ht-standards.csv', csvHabits()); };
    el('xJson').onclick=function(){
      /* R35.6 — day_private carries inputs 2 and 3. Exporting completion alone and calling it
         EVERYTHING is how a backup becomes a belief. */
      var priv=[]; for(var k in S.privAll){ if(S.privAll[k]) priv.push(S.privAll[k]); }
      priv.sort(function(a,b){ return a.date<b.date?-1:1; });
      dl('ht.json', JSON.stringify({ profile:S.me, habits:S.habits, days:S.days,
        day_private:priv, exported_at:new Date().toISOString(), schema:'ht-export-2' },null,2));
    };
    el('xPrint').onclick=function(){ closeOv(); setTimeout(function(){ window.print(); },260); };
    el('bOut').onclick=async function(){ await sb.auth.signOut(); location.reload(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-skin2]'),function(b){
      b.onclick=function(){ skin(b.getAttribute('data-skin2')); };
    });
  });
}
/* the list is a time budget; show the bill while it is being written */
function paintBudget(){
  var rows=Array.prototype.slice.call(document.querySelectorAll('#edList .ed'));
  var dMin=0,dN=0,wMin=0,wN=0,free=0;
  rows.forEach(function(r){
    if(r.classList.contains('gone')) return;
    if(!r.querySelector('.en').value.trim()) return;
    var m=+r.querySelector('.em').value||0, wk=r.querySelector('.ec').value==='weekly';
    if(wk){ wN++; wMin+=m; } else { dN++; dMin+=m; }
    if(!m) free++;
  });
  var WAKE=1440-480;                                  /* a day, less eight hours of sleep */
  var pct=Math.min(100,Math.round(dMin/WAKE*100));
  var level = dMin>420 ? 'over' : dMin>240 ? 'watch' : 'ok';
  var col = level==='over'?'var(--bad)':level==='watch'?'var(--g3)':'var(--good)';
  var verdict = level==='over'
    ? 'More routine than a working day has room for. A list this size gets scored by the clock, not by you.'
    : level==='watch' ? 'Getting heavy. Every minute here is a minute the day has to find somewhere else.'
    : 'This fits inside a real day.';
  el('bud').innerHTML =
    '<div class="lab">Daily time budget</div>'+
    '<div class="v" style="color:'+col+'">'+fmt(dMin)+' <span style="font-size:11px;color:var(--ink3)">of a '+fmt(WAKE)+' day</span></div>'+
    '<div class="t"><i style="width:'+pct+'%;background:'+col+'"></i>'+
      '<u style="left:'+Math.round(240/WAKE*100)+'%"></u><u style="left:'+Math.round(420/WAKE*100)+'%"></u></div>'+
    '<div class="k">'+dN+' daily'+(wN?' · '+wN+' weekly ('+fmt(wMin)+'/wk)':'')+
      (free?' · '+free+' cost no time':'')+'. '+verdict+'</div>';
}

async function saveStandards(){
  var rows=Array.prototype.slice.call(document.querySelectorAll('#edList .ed'));
  var order=0, ops=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i], id=(S.edSrc||[])[+r.getAttribute('data-i')] || null;
    var name=r.querySelector('.en').value.trim();
    var rec={ user_id:S.me.id, name:name,
      minutes:+r.querySelector('.em').value||0,
      group_name:r.querySelector('.eg').value,
      cadence:r.querySelector('.ec').value,
      sort_order:order++ };
    if(S.hasCue){ var qn=r.querySelector('.eq'); rec.cue = qn ? qn.value.trim() : ''; }
    if(r.classList.contains('gone')){
      if(id) ops.push(sb.from('habits').update({active:false,archived_at:new Date().toISOString()}).eq('id',id.id));
      continue;
    }
    if(!name) continue;
    if(id) ops.push(sb.from('habits').update(rec).eq('id',id.id));
    else    ops.push(sb.from('habits').insert(rec));
  }
  await Promise.all(ops);
  toast('standards saved'); closeOv(); await load(); paintAll();
}
async function saveProfile(){
  var n=el('pName').value.trim(), b=el('pBirth').value||null;
  S.me.display_name=n;
  /* HT-29 S3 (PASTE 133): the app never created a `profiles` row, so a new member's name saved to nothing and
     the group read "member". An upsert makes the row; where the database has no insert rule for it yet (before
     tools/sql/2026-09-15_ht29.sql), the old update still runs for accounts that already have one. */
  var pu=await sb.from('profiles').upsert({ id:S.me.id, display_name:n }, { onConflict:'id' }).select('id');
  if(pu && pu.error) pu=await sb.from('profiles').update({display_name:n}).eq('id',S.me.id).select('id');
  /* AND THE NAME IS CHECKED, because the failure this replaces was silent: an update that matches no row is
     not an error to PostgREST, so "profile saved" used to appear over a name that reached nothing and the
     group kept reading "member". `.select('id')` makes the row count readable; zero rows is a failure. */
  if(!pu || pu.error || !(pu.data||[]).length){
    toast('name not saved'); warn29('profile name not saved', pu && pu.error); return;
  }
  /* HT-13 B1: birthdate and target age are the life graph's two inputs and they live in the
     owner-only table, never in `profiles`. The field is only read when its column exists. */
  var rec={ id:S.me.id, birth_date:b };
  var tn=el('pTarget'), t=null;
  if(S.hasTargetAge && tn){ t = tn.value===''? null : clamp(+tn.value||0, 1, 120); rec.target_age=t; }
  await sb.from('profile_private').upsert(rec,{onConflict:'id'});
  S.priv0=S.priv0||{}; S.priv0.birth_date=b;
  if(S.hasTargetAge && tn) S.priv0.target_age=t;
  toast('profile saved'); paintLife();
  if(window.__HT13_REPAINT) window.__HT13_REPAINT();
}

/* ---- the guide: what every number on the sheet means ---- */
function openGuide(){
  openOv('What everything means',
  '<div class="band">The three inputs</div>'+
  gd('1 · Completion','Ticking a standard. Your day percentage is simply how many of the daily standards you took, out of how many are active. Weekly standards are credited to the whole Monday–Sunday week, so taking one on Tuesday keeps the week green.')+
  gd('2 · Rating','Your own 1–10 on the day, before you look at the score. It is the only number here you cannot game, because nothing computes it.')+
  gd('3 · Journal','Why it was that number, what you actually got done, and the prayer journal. Three free-text fields, saved per day.')+
  '<div class="band">Everything else is an output</div>'+
  gd('Where the day goes','The committed block is the sum of the minutes you priced your daily standards at. The top bar splits it by group; the bottom bar splits the same minutes into what you did and what you missed. The ribbons show which group the missed time came from.')+
  gd('Cost against adherence','Every priced standard is one dot: minutes on the horizontal, how often you actually take it on the vertical. It is testing one excuse — <b>am I missing things because they are expensive?</b> If the cloud slopes down to the right, price is the problem and the fix is to shorten or cut. If it is flat, price is not the problem, and cutting minutes will not help.')+
  gd('Rating against completion','The same test on the other side. Does hitting the standard make the day feel better? A positive correlation means the routine is earning its cost. A flat one means the list is not touching what actually makes your day good.')+
  gd('Momentum','This 7 days against the 7 before it. The projection just carries the same change forward one more week — it is arithmetic, not a forecast.')+
  gd('Streaks','Current run of consecutive days taken, then the longest run in the last 90. Today does not break a streak until the day closes.')+
  gd('Next move','Room to gain divided by what it costs. The standard with the most missing days at the lowest price — the cheapest points on the board.')+
  gd('Time ledger','Committed minutes per day multiplied by days logged is what the routine billed you. Spent is what you actually took. The difference is the unspent balance — not wasted time, just time the list asked for and did not get.')+
  gd('Grades','A+ 97, A 90, B 80, C 70, D 60, F below. The colour ramp is continuous, not banded, so a 45 and a 62 do not look the same.'),
  null);
}
function gd(t,b){ return '<div style="padding:12px 0;border-bottom:1px solid var(--rule)">'+
  '<div class="lab" style="padding-bottom:5px">'+t+'</div><div class="note">'+b+'</div></div>'; }

/* ---- circle manage ---- */
function openCircle(){
  openOv('Circle',
    '<div class="note" style="padding:8px 0 14px">A circle shows one number per person per day. Nothing else crosses.</div>'+
    '<label class="fld"><span class="lab">Join with a code</span><input id="cCode" placeholder="ABC123" autocapitalize="characters"></label>'+
    '<div class="tools"><button class="btn" id="cJoin">Join</button></div>'+
    '<label class="fld" style="margin-top:14px"><span class="lab">Or start one</span><input id="cName" placeholder="Name it"></label>'+
    '<div class="tools"><button class="btn pri" id="cMake">Create</button></div>'+
    '<div class="note" id="cMsg" style="padding-top:14px"></div>',
    function(){
      el('cJoin').onclick=async function(){
        var code=(el('cCode').value||'').trim().toUpperCase(); if(!code) return;
        try{ var r=await sb.rpc('join_circle',{code:code});
          if(r.error) throw r.error;
          closeOv(); await paintCircle(); toast('joined');
        }catch(e){ el('cMsg').textContent='No circle with that code.'; }
      };
      el('cMake').onclick=async function(){
        var n=(el('cName').value||'').trim(); if(!n) return;
        var code=Math.random().toString(36).slice(2,8).toUpperCase();
        var c=await sb.from('circles').insert({name:n,join_code:code,owner:S.me.id}).select('id').single();
        if(c.error){ el('cMsg').textContent='Could not create it.'; return; }
        await sb.from('circle_members').insert({circle_id:c.data.id,user_id:S.me.id});
        closeOv(); await paintCircle(); toast('code '+code);
      };
    });
}

/* ---- exports ---- */
function csvDays(){
  var ids=S.habits.map(function(h){return h.id;});
  var head=['date','pct','grade','rating'].concat(S.habits.map(function(h){return '"'+nameOf(h.name).replace(/"/g,'""')+'"';}));
  var out=[head.join(',')];
  dates().forEach(function(k){
    var r=S.byDate[k], ck=r.checked||{};
    out.push([k, r.pct==null?'':r.pct, r.pct==null?'':grade(r.pct)[0], (ratingOf(k)==null?'':ratingOf(k))]
      .concat(ids.map(function(i){return ck[i]?1:0;})).join(','));
  });
  return out.join('\n');
}
function csvHabits(){
  var out=['name,group,cadence,minutes,adherence_30d,current_streak,longest_streak'];
  stats().forEach(function(s){
    out.push('"'+nameOf(s.h.name).replace(/"/g,'""')+'",'+(s.h.group_name||'')+','+
      (s.h.cadence||'daily')+','+(s.h.minutes||0)+','+(s.pct==null?'':s.pct)+','+s.cur+','+s.best);
  });
  return out.join('\n');
}
function dl(name,text){
  var b=new Blob([text],{type:'text/plain'}), u=URL.createObjectURL(b);
  var a=document.createElement('a'); a.href=u; a.download=name; a.click();
  setTimeout(function(){URL.revokeObjectURL(u);},1200);
  toast('exported');
}

/* ============================ auth ============================ */
function authScreen(){
  document.querySelector('.app').innerHTML=
    '<div style="max-width:340px;margin:16vh auto 0;padding:0 4px">'+
    '<div class="wm" style="font-size:15px">HT<b>.</b></div>'+
    '<div class="note" style="padding:10px 0 8px">A ledger of the self. One number a day, and nowhere to hide.</div>'+
    '<div class="note" id="aPriv" style="padding:0 0 22px">Your journal is yours. The app never shows it to anyone else — including Cory.</div>'+
    '<label class="fld"><span class="lab">Email</span><input id="aEmail" type="email" autocomplete="email"></label>'+
    '<label class="fld"><span class="lab">Password</span><input id="aPass" type="password" autocomplete="current-password"></label>'+
    '<div class="tools" style="padding-top:14px"><button class="btn pri" id="aIn" style="flex:1">Sign in</button>'+
    '<button class="btn" id="aUp">Create</button></div>'+
    '<div class="note" id="aMsg" style="padding-top:12px"></div></div>';
  var msg=function(t){ el('aMsg').textContent=t; };
  var go=async function(kind){
    var e=el('aEmail').value.trim(), p=el('aPass').value;
    if(!e||!p){ msg('Email and password.'); return; }
    msg('…');
    var r = kind==='up' ? await sb.auth.signUp({email:e,password:p,
                              options:{ emailRedirectTo: location.origin + location.pathname }})
                        : await sb.auth.signInWithPassword({email:e,password:p});
    if(r.error){ msg(r.error.message); return; }
    if(kind==='up' && !r.data.session){ msg('Check your email to confirm, then sign in.'); return; }
    location.reload();
  };
  el('aIn').onclick=function(){go('in');};
  el('aUp').onclick=function(){go('up');};
  el('aPass').onkeydown=function(e){ if(e.key==='Enter') go('in'); };
}

/* ============================ paint all ============================ */
function paintAll(){
  paintMast(); paintRail(); paintLog(); paintRating(); paintJournalInputs();
  paintCapacity(); paintNextSmall(); paintKpi();
  paintStarter(); paintWeekly(); paintMcII(); paintYear(); paintPredict();
  paintRight(); paintCircle();
}

function goDay(k){
  S.date=k;
  if(!S.byDate[k]) S.byDate[k]={date:k,checked:{},pct:0};
  S.priv=S.privAll[k]||null;
  var d=dnum(k); S.calYM=[d.getFullYear(),d.getMonth()];
  paintMast(); paintRail(); paintLog(); paintRating(); paintJournalInputs(); paintSankey(); paintCal();
  paintCapacity(); paintNextSmall(); paintWeekly(); paintYear(); paintPredict();
  var t=el('jIn'); if(t && window.innerWidth<1080) window.scrollTo({top:Math.max(0,t.offsetTop-70),behavior:'smooth'});
}

/* ============================ events ============================ */
function wire(){
  el('skins').addEventListener('click',function(e){
    var b=e.target.closest('[data-skin]'); if(b) skin(b.getAttribute('data-skin'));
  });
  el('bSet').onclick=openSettings;
  var bv=el('bView'); if(bv) bv.onclick=toggleView;
  var yp=el('yPrev'), yn=el('yNext');
  if(yp) yp.onclick=function(){ S.yearY=(S.yearY==null?dnum(today()).getFullYear():S.yearY)-1; paintYear(); };
  if(yn) yn.onclick=function(){ S.yearY=(S.yearY==null?dnum(today()).getFullYear():S.yearY)+1; paintYear(); };
  document.body.classList.toggle('reviewday', [0,1].indexOf(dnum(today()).getDay())>=0);
  applyView(loadView());
  el('bGuide').onclick=openGuide;
  el('bCircle').onclick=openCircle;

  /* input 2 — rating */
  el('rate').addEventListener('click',function(e){
    var b=e.target.closest('[data-r]'); if(!b) return;
    var v=+b.getAttribute('data-r');
    S.priv=S.priv||{};
    S.priv.rating = (v===0 || S.priv.rating===v) ? null : v;
    paintRating(); queuePriv();
  });
  /* input 3 — journal */
  /* HT-22 S1: the three inputs and the one-thing row are REPLACED on every paint, so their
     events are delegated to the hosts that survive one. Binding to the node itself works right
     up to the first repaint - the exact class of defect HT-21 S9's audit invented three of by
     holding a node across a repaint that replaced it. */
  (function(){
    var host=el('in3a'); if(!host) return;
    host.addEventListener('input',function(e){
      var n=e.target; if(!n||!n.id) return;
      if(n.id==='iSleep'){  S.priv=S.priv||{}; S.priv.sleep_hours = n.value===''?null:+n.value; queuePriv(); paintSleepWhy(); }
      if(n.id==='iBed'){    S.priv=S.priv||{}; S.priv.bed_time  = n.value||null; queuePriv(); paintSleepWhy(); }
      if(n.id==='iWake'){   S.priv=S.priv||{}; S.priv.wake_time = n.value||null; queuePriv(); paintSleepWhy(); }
      if(n.id==='iWeight'){ S.priv=S.priv||{}; S.priv.weight_lb   = n.value===''?null:+n.value; queuePriv(); }
      if(n.id==='iOne'){ queueTomorrow(n.value); }
    });
  })();
  var oneH=el('oneThing');
  if(oneH) oneH.addEventListener('click',function(e){
    if(e.target.closest('[data-one]')) toggleOne(); });

  [['iWhy','why'],['iTasks','tasks'],['iPrayer','prayer']].forEach(function(p){
    var n=el(p[0]);
    n.addEventListener('input',function(){
      S.priv=S.priv||{}; S.priv[p[1]]=n.value; queuePriv();
      el('jrnC').textContent='saving…';
    });
  });

  /* month calendar */
  el('calNav').addEventListener('click',function(e){
    var b=e.target.closest('[data-cm]'); if(!b) return;
    var d=+b.getAttribute('data-cm'), m=S.calYM[1]+d, y=S.calYM[0];
    if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
    S.calYM=[y,m]; paintCal();
  });
  el('calMode').addEventListener('click',function(e){
    var b=e.target.closest('[data-m]'); if(!b) return;
    S.calMode=b.getAttribute('data-m');
    Array.prototype.forEach.call(el('calMode').children,function(c){ c.classList.toggle('on',c===b); });
    paintCal();
  });
  el('cal').addEventListener('click',function(e){
    var b=e.target.closest('[data-cd]'); if(!b) return;
    var k=b.getAttribute('data-cd'); if(k>today()) return;
    goDay(k);
  });
  el('jArc').addEventListener('click',function(e){
    var b=e.target.closest('[data-jd]'); if(b) goDay(b.getAttribute('data-jd'));
  });
  el('ov').addEventListener('click',function(e){ if(e.target.closest('[data-x]')) closeOv(); });

  el('rail').addEventListener('click',function(e){
    var b=e.target.closest('[data-d]'); if(b) goDay(b.getAttribute('data-d'));
  });

  el('log').addEventListener('click',function(e){
    var b=e.target.closest('[data-h]'); if(!b) return;
    /* HT-16 R70.98: the name IS the link now. It navigates itself; it must never also toggle. */
    if(e.target.closest('a')) return;
    /* HT-21 S3: the `.lk` branch that used to open the link from the icon is GONE with the icon
       it served — nothing renders that class any more, and the anchor above already returns. */
    toggle(b.getAttribute('data-h'));
  });

  el('grpSeg').addEventListener('click',function(e){
    var b=e.target.closest('[data-g]'); if(!b) return;
    S.grp=b.getAttribute('data-g');
    Array.prototype.forEach.call(el('grpSeg').children,function(c){ c.classList.toggle('on',c===b); });
    paintLog();
  });
  el('sortSeg').addEventListener('click',function(e){
    var b=e.target.closest('[data-s]'); if(!b) return;
    S.sort=b.getAttribute('data-s');
    Array.prototype.forEach.call(el('sortSeg').children,function(c){ c.classList.toggle('on',c===b); });
    paintLog();
  });
  el('find').addEventListener('input',function(){ S.find=this.value; paintLog(); });
  el('bAllOff').onclick=function(){
    if(!confirm('Clear every mark on '+S.date+'?')) return;
    S.byDate[S.date].checked={}; queueSave(); paintMast(); paintLog(); paintRail(); paintRight();
  };
  el('bClose').onclick=async function(){
    await saveDay({close:true}); await load(); paintAll();     /* HT-13 G2: the explicit close */
    var p=S.byDate[S.date].pct;
    toast('closed · '+fmt(earned(S.date))+' earned · '+p+'% · '+grade(p)[0]);
    /* R-B rides this action: one optional tap, about tomorrow. */
    var n=el('predict');
    if(n && S.hasPredict){ n.scrollIntoView({behavior:'smooth',block:'center'}); }
  };

  el('jump').addEventListener('click',function(e){
    var b=e.target.closest('[data-j]'); if(!b) return;
    Array.prototype.forEach.call(el('jump').children,function(c){ c.classList.toggle('on',c===b); });
    var t=el(b.getAttribute('data-j'));
    if(t) window.scrollTo({ top: t.offsetTop-70, behavior:'smooth' });
  });

  /* keyboard — the desk, not the phone */
  document.addEventListener('keydown',function(e){
    if(/input|textarea|select/i.test((e.target.tagName||''))) {
      if(e.key==='Escape') e.target.blur();
      return;
    }
    if(e.key==='Escape'){ closeOv(); return; }
    if(e.key==='/'){ e.preventDefault(); el('find').focus(); return; }
    if(e.key==='['){ el('rail').querySelector('[data-d="'+shift(S.date,-1)+'"]')?.click(); return; }
    if(e.key===']'){ var n=shift(S.date,1); if(n<=today()) el('rail').querySelector('[data-d="'+n+'"]')?.click(); return; }
    if(e.key==='t'){ el('rail').querySelector('[data-d="'+today()+'"]')?.click(); return; }
    if(e.key==='s'){ openSettings(); return; }
    if(e.key==='?'||e.key==='g'){ openGuide(); return; }
    if(e.key==='j'){ el('iTasks').focus(); return; }
    if(e.key>='1'&&e.key<='9'){
      var rows=el('log').querySelectorAll('[data-h]'), i=+e.key-1;
      if(rows[i]) rows[i].click();
    }
  });

  var rT=null;
  window.addEventListener('resize',function(){
    clearTimeout(rT); rT=setTimeout(function(){
      paintSankey(); paintChart(); paintScatter(); paintRChart(); paintRScat(); paintLog(); },160);
  });

  window.addEventListener('scroll',function(){
    if(window.innerWidth>=1080) return;
    var ss=['jIn','jDay','jRec','jRate','jStand','jCircle'], cur=ss[0];
    ss.forEach(function(id){ var n=el(id); if(n && n.offsetTop-100<=window.scrollY) cur=id; });
    Array.prototype.forEach.call(el('jump').children,function(c){
      c.classList.toggle('on', c.getAttribute('data-j')===cur); });
  },{passive:true});
}


/* ==================================================================
   CAPACITY · SMALL VIEW · CUE · KPI BAND
   HT charter §1–§4, ruled by Cory 2026-08-31 (SPEC_QUEUE R35.7).
   Appended by _reconcile/ht_batch3/build_v3.py — one block, one place.
   ================================================================== */

/* ---- CAPACITY SCORE -------------------------------------------------
   Banded against CORY'S OWN trailing distribution, never population norms.
   Bands recompute WEEKLY (anchored to the last Sunday), never per-day: a
   single bad day must not flip a prescription. Until the calibration gate
   passes the band renders WITHOUT a prescription — a prescription from four
   datapoints is a guess wearing a uniform. */
var CAP_GATE = { ratedDays:14, loggedDays:30 };

function capFed(k){                       /* REAL logged days inside the 7-day window */
  /* load() puts a synthetic empty row in byDate for today so the sheet can render, and that row
     is NOT in S.days. Counting byDate would therefore call an unfed week "fed" every time —
     identity against S.days is what separates a persisted day from the placeholder. */
  var end=k||today(), n=0;
  for(var i=0;i<7;i++){
    var r=S.byDate[shift(end,-i)];
    if(r && S.days.indexOf(r)>=0) n++;
  }
  return n;
}
function capRaw(k){
  /* A GAP IS NOT A ZERO. With nothing logged in the window, adherence reads 0% and the score
     would say SHED LOAD — the exact wrong instruction for someone who simply stopped logging.
     Unfed returns null and the card says so. */
  if(capFed(k)===0) return null;
  var adh = rolling(7,k);                 /* 0..100 or null */
  var rat = rollRate(7,k);                /* 1..10  or null */
  if(adh==null && rat==null) return null;
  if(rat==null) return { v: adh/100, half:true };
  if(adh==null) return { v: (rat-1)/9,  half:true };
  return { v: 0.5*(adh/100) + 0.5*((rat-1)/9), half:false };
}
function capWeekAnchor(){
  var d=dnum(today()); d.setDate(d.getDate()-d.getDay());   /* last Sunday */
  return dk(d);
}
function capBands(){
  var anchor=capWeekAnchor(), vals=[];
  for(var i=0;i<60;i++){
    var k=shift(anchor,-i), r=S.byDate[k]?capRaw(k):null;
    if(r) vals.push(r.v);
  }
  if(vals.length<8) return null;
  vals.sort(function(a,b){return a-b;});
  var q=function(p){ return vals[clamp(Math.floor(p*(vals.length-1)),0,vals.length-1)]; };
  return { p33:q(0.33), p66:q(0.66), n:vals.length, anchor:anchor };
}
function capState(){
  var rated=0, logged=dates().length;
  for(var k in S.privAll){ if(ratingOf(k)!=null) rated++; }
  var raw=capRaw(today());
  var b=capBands();
  /* half-fed input can never carry a prescription, however many days are on file:
     a capacity score computed from completion alone is adherence wearing a uniform. */
  var fed = capFed();
  var calibrated = (rated>=CAP_GATE.ratedDays && logged>=CAP_GATE.loggedDays && !!b && !!raw
                    && !raw.half && fed>=4);
  var band=null;
  if(raw && b) band = raw.v < b.p33 ? 'SHED LOAD' : (raw.v > b.p66 ? 'TAKE IT ON' : 'HOLD');
  return { raw:raw, bands:b, band:band, calibrated:calibrated, rated:rated, logged:logged,
           fed: fed,
           score: raw? Math.round(raw.v*100) : null,
           needRated: Math.max(0, CAP_GATE.ratedDays-rated),
           needLogged: Math.max(0, CAP_GATE.loggedDays-logged) };
}
function paintCapacity(){
  var n=el('cap'); if(!n) return;
  var c=capState();
  if(c.score==null){
    var gap=(c.logged>0 && capFed()===0);
    n.innerHTML='<div class="capc"><div class="capn">—</div><div class="capw">'+
      (gap?'UNFED · nothing logged in 7 days':'Capacity needs a logged day')+'</div>'+
      '<div class="caps">'+(gap
        ? 'A gap is not a zero, so this shows nothing rather than telling you to shed load. Tick today and it comes back.'
        : 'Tick something above and this fills in.')+'</div></div>'; return;
  }
  var wordy = c.calibrated
    ? '<b>'+c.band+'</b> · banded against your own last '+c.bands.n+' days'
    : 'UNCALIBRATED · '+(c.needRated?('needs '+c.needRated+' more rated day'+(c.needRated>1?'s':'')):'')+
      (c.needRated&&c.needLogged?' and ':'')+
      (c.needLogged?(c.needLogged+' more logged day'+(c.needLogged>1?'s':'')):'')+
      ' before it may prescribe';
  /* SAY THE SAMPLE SIZE. A bare number off one logged day reads as a verdict on the man
     rather than on the day. */
  var sub = (c.raw.half
    ? 'Half-fed: this is completion only. The rating half of the formula is empty.'
    : 'Completion and self-rating, 7-day, weighted half and half.')
    + ' Built from ' + c.fed + ' of the last 7 days.'
    + (c.fed<=2 ? ' That is a thin week — this number is about the logging, not about you.' : '');
  if(!c.calibrated && c.fed<4 && c.needRated===0 && c.needLogged===0){
    wordy = 'UNCALIBRATED · only '+c.fed+' of the last 7 days logged — it will not prescribe off a thin window';
  }
  n.innerHTML='<div class="capc'+(c.calibrated?' ok':'')+'">'+
    '<div class="capn num">'+c.score+'</div>'+
    '<div class="capw">'+wordy+'</div>'+
    '<div class="caps">'+sub+'</div></div>';
}

/* ---- NEXT MOVE, shared ranking (small view + full sheet) ---- */
function nextMoveRank(){
  var a=stats().filter(function(s){ return s.pct!=null && s.h.cadence!=='weekly'; });
  a.forEach(function(s){ s.lev=(100-s.pct)/((s.mins||0)+10); });
  a.sort(function(x,y){ return y.lev-x.lev; });
  return a;
}
function paintNextSmall(){
  var n=el('capNext'); if(!n) return;
  var a=nextMoveRank();
  if(!a.length){ n.innerHTML='<div class="empty">Log a few days and the next move appears here.</div>'; return; }
  var b=a[0];
  n.innerHTML='<div class="nms"><span class="k">Next move</span>'+
    '<span class="v">'+esc(nameOf(b.h.name))+'</span>'+
    '<span class="s">'+b.pct+'% over '+b.of+' days · '+(b.mins?b.mins+' min':'no time')+'</span></div>';
}

/* ---- SMALL DEFAULT VIEW ---------------------------------------------
   Default is SMALL. 13 logged days cannot feed 18 instruments, and a wall
   of empty charts is work at 4:50am. The wall is one tap away, never gone
   (nothing here re-opens DEC-055). */
function loadView(){
  try { return localStorage.getItem('ht_view')==='full' ? 'full' : 'small'; }
  catch(e){ return 'small'; }
}
function applyView(v){
  S.view = (v==='full')?'full':'small';
  document.body.classList.toggle('small', S.view==='small');
  var b=el('bView'); if(b) b.textContent = (S.view==='small') ? 'Full sheet' : 'Small view';
  try { localStorage.setItem('ht_view', S.view); } catch(e){}
  if(S.view==='full'){ paintRight(); }
}
function toggleView(){ applyView(S.view==='small'?'full':'small'); }

/* ---- KPI BAND — config-driven, ships DARK ---------------------------
   x32: the business measures are DERIVED from GOAL MATH, never hand-picked,
   and R35.7 HOLDS them until GOAL_MATH.md locks. So the band is built and
   wired, hard-codes nothing, and renders nothing until a config arrives.
   To light it: set enabled:true and give measures[] {name,minutes,target}. */
function paintKpi(){
  var n=el('kpi'); if(!n) return;
  if(!HT_KPI.enabled || !(HT_KPI.measures||[]).length){ n.innerHTML=''; n.style.display='none'; return; }
  n.style.display='';
  n.innerHTML='<div class="sh"><h2>Lead measures</h2><span class="ln"></span><span class="c">'+
    esc(HT_KPI.source||'')+'</span></div><div class="pan"><div class="kpil">'+
    HT_KPI.measures.map(function(m){
      return '<div class="kpim"><span class="k">'+esc(m.name)+'</span>'+
             '<span class="v num">'+(m.target==null?'—':esc(String(m.target)))+'</span>'+
             '<span class="s">'+(m.minutes?m.minutes+' min/day':'')+'</span></div>';
    }).join('')+'</div></div>';
}


/* ==================================================================
   HT-5 — streak repair · MCII · weekly review · forfeit (dark) ·
   year view · cue coverage · miss flags · 90-day consistency ·
   60-second onboarding.
   R46.5 pile-in, additive only. NO fourth daily input (R47.1/DEC-058):
   every surface below is derived output or a one-off config write.
   ================================================================== */

/* ---- FORFEIT REFEREE — built, config-driven, DARK until Phase D ----
   The self-refereed commitment device never fired (the $250/11-texts).
   PENDING-SPEC-15 §10: the escalation must be STRUCTURAL, not discretionary.
   So the referee is a config with a trigger the machine evaluates — and it
   ships disabled, like the KPI band, until Phase D lets anything fire. */
var HT_FORFEIT = { enabled:false, referee:null, stake:null,
                   trigger:{ missRun:3, weeklyBelow:null }, note:'dark until Phase D (DEC-068)' };

/* ---- STREAK REPAIR -------------------------------------------------
   Bounded freeze budget + isolated-miss forgiveness. Derived from the
   existing rows — no column, no new input. A streak that a single missed
   day destroys is a loss-aversion device sitting at zero; it punishes the
   record-keeping, not the man. */
var STREAK = { freezePer30:2, formedAt:66 };   /* 66 = the median automaticity figure */

function loggedOn(k){ var r=S.byDate[k]; return !!(r && S.days.indexOf(r)>=0); }
function streakForgiving(){
  /* walks back from today; an unlogged or sub-80 day spends a freeze instead of
     ending the run, up to freezePer30 inside any trailing 30 days. */
  var k=today(), n=0, spent=[], guard=0;
  if(!loggedOn(k)) k=shift(k,-1);
  while(guard++<400){
    var r=S.byDate[k], pct=(r&&r.pct!=null)?r.pct:null;
    if(pct!=null && pct>=80){ n++; }
    else {
      /* the budget must be bounded by the RUN, not by a window that slides away underneath it:
         a per-30-days test evaluated at each step lets old freezes expire and the streak runs
         forever (rehearsal exhibit: 21 freezes spent against a budget of 2). Allowance grows one
         block at a time as the run itself grows. */
      var allowed = STREAK.freezePer30 * (1 + Math.floor(n/30));
      if(spent.length >= allowed) break;
      spent.push(k);
      n++;                                   /* the day is carried, not counted as a win */
    }
    k=shift(k,-1);
  }
  return { days:n, frozen:spent.length, budget:STREAK.freezePer30 };
}
function missRun(hid){                        /* consecutive missed days, ending today */
  var k=today(), n=0, guard=0, h=null;
  for(var i=0;i<S.habits.length;i++) if(S.habits[i].id===hid) h=S.habits[i];
  if(!h || h.cadence==='weekly') return 0;
  while(guard++<120){
    if(!loggedOn(k) || !dueDay(h,k)){ k=shift(k,-1); continue; }   /* HT-28 E12 */
    if(doneOn(h,k)) break;
    n++; k=shift(k,-1);
  }
  return n;
}
function automaticity(hid){                   /* PENDING-SPEC-15: formation is a count, not a feeling */
  var done=0, first=null;
  dates().forEach(function(k){ if(ckOf(k)[hid]){ done++; if(!first) first=k; } });
  return { done:done, first:first, formed:done>=STREAK.formedAt,
           pct:Math.min(100, Math.round(done/STREAK.formedAt*100)) };
}

/* ---- 90-DAY CONSISTENCY --------------------------------------------
   PENDING-SPEC-15 §2: rank and frame on CONSISTENCY over 90 days —
   frequency of completion — never on intensity or on the day-rating.
   Denominator is calendar days, so silence counts. That is the point. */
function consistency(n){
  var end=today(), hit=0, logged=0;
  for(var i=0;i<n;i++){
    var k=shift(end,-i), r=S.byDate[k];
    if(r && r.pct!=null && loggedOn(k)){ logged++; if(r.pct>=80) hit++; }
  }
  return { hit:hit, logged:logged, of:n, pct:Math.round(hit/n*100) };
}

/* ---- WEEKLY REVIEW — the Monday-seven feed ------------------------- */
function weekWindow(off){
  var d=dnum(today()); d.setDate(d.getDate()-d.getDay()-7*(off||0));
  var start=dk(d), a=[];
  for(var i=0;i<7;i++) a.push(shift(start,i));
  return a;
}
function weekStats(off){
  var ks=weekWindow(off), pcts=[], rats=[], jr=0, lg=0;
  ks.forEach(function(k){
    if(k>today()) return;
    var r=S.byDate[k];
    if(r && r.pct!=null && loggedOn(k)){ pcts.push(r.pct); lg++; }
    var v=ratingOf(k); if(v!=null) rats.push(v);
    var p=S.privAll[k]; if(p && (p.why||p.tasks||p.prayer)) jr++;
  });
  var avg=function(a){ return a.length? Math.round(a.reduce(function(x,y){return x+y;},0)/a.length*10)/10 : null; };
  return { logged:lg, adh:pcts.length?Math.round(avg(pcts)):null, rating:avg(rats), journal:jr, days:ks };
}
function paintWeekly(){
  var n=el('weekly'); if(!n) return;
  var a=weekStats(0), b=weekStats(1), c90=consistency(90);
  var flags=S.habits.filter(function(h){ return missRun(h.id)>=3; })
                    .map(function(h){ return { h:h, run:missRun(h.id) }; })
                    .sort(function(x,y){ return y.run-x.run; });
  var st=stats().filter(function(s){ return s.pct!=null && s.h.cadence!=='weekly'; })
                .sort(function(x,y){ return x.pct-y.pct; });
  var d=function(now,prev,suf){
    if(now==null) return '—';
    if(prev==null) return now+(suf||'');
    var v=Math.round((now-prev)*10)/10;
    return now+(suf||'')+' <s>'+(v>0?'+':'')+v+' vs last week</s>';
  };
  n.innerHTML=
    '<div class="wkrow">'+
      tp('Logged', a.logged+'<s>of 7</s>')+
      tp('Adherence', d(a.adh,b.adh,'%'))+
      tp('Rating', d(a.rating,b.rating,''))+
      tp('Journal', a.journal+'<s>of 7 days</s>')+
      tp('90-day consistency', c90.pct+'%<s>'+c90.hit+' days at 80%+</s>')+
      tp('Gaps', (function(){ var g=gaps(7); return g.missed+'<s>of 7 days</s>'; })())+
      tp('Called right', (function(){ var r=predictionRecord(30);
          return (r.made? r.kept+'<s>of '+r.made+' calls</s>' : '—<s>no calls</s>'); })())+
    '</div>'+
    (flags.length
      ? '<div class="flags"><span class="k">Off track — 3+ days running</span>'+
        flags.slice(0,6).map(function(f){
          return '<div class="fl"><span>'+esc(nameOf(f.h.name))+'</span><b>'+f.run+' days</b></div>'; }).join('')+
        '<div class="s">Three consecutive misses is a structural flag, not a judgement — the standard '+
        'is either wrong, mis-cued, or genuinely dropped. Decide which at review.</div></div>'
      : '<div class="flags"><span class="k">Off track — 3+ days running</span>'+
        '<div class="s">Nothing is three days down. </div></div>')+
    (function(){ var rt=returnsIn(weekWindow(0));
      return rt.length
        ? '<div class="flags"><span class="k">Came back this week</span>'+
          rt.slice(0,6).map(function(r){ return '<div class="fl"><span>'+esc(nameOf(r.h.name))+
            '</span><b>'+r.n+'×</b></div>'; }).join('')+
          '<div class="s">Returning after a miss is the most strongly evidenced move in this whole '+
          'ledger — it beats never having missed, because nobody sustains never.</div></div>'
        : ''; })()+
    '<div class="wk2"><div><span class="k">Weakest</span>'+
      st.slice(0,3).map(function(s){ return '<div class="fl"><span>'+esc(nameOf(s.h.name))+'</span><b>'+s.pct+'%</b></div>'; }).join('')+
    '</div><div><span class="k">Strongest</span>'+
      st.slice(-3).reverse().map(function(s){ return '<div class="fl"><span>'+esc(nameOf(s.h.name))+'</span><b>'+s.pct+'%</b></div>'; }).join('')+
    '</div></div>';
}

/* ---- MCII — rides the existing journal `why`, once a week ----------
   Implementation intentions with the obstacle named. It is a PROMPT on an
   existing field on one day a week, never a new field: DEC-058 holds. */
function isMcIIDay(){ return dnum(today()).getDay()===0; }   /* Sunday: set the week */
function paintMcII(){
  var n=el('mcii'); if(!n) return;
  if(!isMcIIDay()){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  n.innerHTML='<div class="mc"><span class="k">Sunday — set the week</span>'+
    '<div class="s">In the box below: <b>what do you want this week</b>, then <b>the obstacle</b> '+
    'that will actually get in the way, then <b>when-then</b> — "when &lt;obstacle&gt; happens, I will &lt;action&gt;". '+
    'Wanting it and naming what blocks it beats wanting it alone.</div></div>';
  var w=el('iWhy'); if(w && !w.value) w.placeholder='I want… · What gets in the way… · When that happens, I will…';
}

/* ---- YEAR VIEW ---------------------------------------------------- */
function paintYear(){
  var n=el('yearGrid'); if(!n) return;
  var y=(S.yearY==null? dnum(today()).getFullYear() : S.yearY);
  var lab=el('yearLab'); if(lab) lab.textContent=y;
  var cells='', start=new Date(y,0,1), end=new Date(y,11,31), first0=dates()[0]||null;
  var pad=start.getDay();
  for(var i=0;i<pad;i++) cells+='<i class="yc pad"></i>';
  for(var d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    var k=dk(d), r=S.byDate[k], p=(r&&r.pct!=null&&loggedOn(k))?r.pct:null;
    var past=(k<today()), gap=(p==null && past && (!first0 || k>=first0));
    cells+='<i class="yc'+(gap?' gap':'')+'" title="'+k+(p==null?(gap?' · GAP — no entry':' · no entry'):' · '+p+'%')+
      '" style="background:'+(p==null?'var(--sunk)':dens(p))+'"></i>';
  }
  n.innerHTML=cells;
  var c=el('yearC');
  if(c){
    var got=dates().filter(function(k){ return k.slice(0,4)===String(y); }).length;
    c.textContent=got+' days logged in '+y;
  }
}

/* ---- CUE COVERAGE — every below-median standard --------------------- */
function belowMedian(){
  var a=stats().filter(function(s){ return s.h.cadence!=='weekly'; });
  var v=a.map(function(s){ return s.pct==null?0:s.pct; }).sort(function(x,y){ return x-y; });
  if(!v.length) return {};
  var med=v[Math.floor(v.length/2)], m={};
  a.forEach(function(s){ if((s.pct==null?0:s.pct)<=med) m[s.h.id]=1; });
  return m;
}
function cueCoverage(){
  var need=belowMedian(), n=0, got=0;
  S.habits.forEach(function(h){ if(need[h.id]){ n++; if(h.cue) got++; } });
  return { need:n, got:got };
}

/* ---- 60-SECOND ONBOARDING — defaults, one action, no tour ----------
   PENDING-SPEC-15 §7/§8: first value inside 60 seconds; an empty state must
   state status, teach in place, and offer one direct path to populate.
   A stranger ticks a real standard within seconds of arriving. */
var STARTER = [
  { name:'Move for 20 minutes', minutes:20, group_name:'Morning', cadence:'daily' },
  { name:'Read 10 pages',        minutes:15, group_name:'Other',   cadence:'daily' },
  { name:'Lights out by 10:30',  minutes:0,  group_name:'Night',   cadence:'daily' }
];
function paintStarter(){
  var n=el('starter'); if(!n) return;
  /* S9: the simplified layout hides every output that sits in the input column, and `#starter`
     was one of them — correct for somebody who HAS standards, wrong for somebody who has none,
     which is the only person who ever sees this block. The root carries the state so the
     stylesheet can make the one exception without loosening the rule. */
  try{ document.documentElement.setAttribute('data-firstrun', S.habits.length ? '0' : '1'); }catch(e){}
  if(S.habits.length){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  n.innerHTML='<div class="st1"><span class="k">Start here</span>'+
    '<div class="s">Three standards to begin with. Tick one tonight and you have used this properly. '+
    'Change them, delete them, add your own — later, in Settings.</div>'+
    STARTER.map(function(s){ return '<div class="fl"><span>'+esc(s.name)+'</span><b>'+
      (s.minutes?s.minutes+'m':'—')+'</b></div>'; }).join('')+
    '<div class="tools" style="padding-top:10px"><button class="btn pri" id="stGo">Start with these three</button></div></div>';
  var b=el('stGo');
  if(b) b.onclick=async function(){
    b.disabled=true; b.textContent='adding…';
    var ops=STARTER.map(function(s,i){
      return sb.from('habits').insert({ user_id:S.me.id, name:s.name, minutes:s.minutes,
        group_name:s.group_name, cadence:s.cadence, sort_order:i });
    });
    await Promise.all(ops);
    await load(); paintAll(); toast('three standards added — tick one');
  };
}


/* ==================================================================
   HT-6 — the five S-cost self-layer rocks (SPEC ruling R67).
   R-C showed-up streak · R-B self-prediction · R-D gain framing ·
   R-A miss-return reward · R-E missing day as a scored event.
   Additive. No new DAILY input surface: R-B is one optional tap on the
   existing close-the-day action, and it degrades to nothing when its
   column is absent.
   ================================================================== */

/* ---- R-C · SHOWED-UP STREAK ----------------------------------------
   Evidence: decoupling the streak from the performance target raised D14
   retention +3.3% and put +10.5% more daily users on a streak (Duolingo,
   A/B). The old streak keyed on >=80% and therefore measured the WRONG
   EVENT: it read 0 for weeks while days were being logged. The streak now
   counts the LOGGED day. The frozen-days budget is kept, unchanged, and
   now covers unlogged days only. */
function streakShowedUp(){
  var k=today(), n=0, spent=[], guard=0, first=dates()[0]||null;
  if(!loggedOn(k)) k=shift(k,-1);            /* today not logged yet is not a break */
  while(guard++<400){
    /* the walk stops where the ledger starts. Before the first logged day there is nothing to
       forgive, and spending freezes into pre-history inflates the streak past the record itself
       (rehearsal exhibit: 34 seeded days reported as 38). */
    if(first && k<first) break;
    if(loggedOn(k)){ n++; }
    else {
      /* budget bounded by the RUN, not by a sliding window (HT-5 exhibit) */
      var allowed = STREAK.freezePer30 * (1 + Math.floor(n/30));
      if(spent.length >= allowed) break;
      spent.push(k);
      n++;                                    /* carried, not counted as a win */
    }
    k=shift(k,-1);
  }
  return { days:n, frozen:spent.length, budget:STREAK.freezePer30, basis:'logged' };
}

/* ---- R-A · MISS-RETURN REWARD --------------------------------------
   Evidence: the winning arm of a 61,293-person / 54-arm megastudy rewarded
   people for RETURNING after a missed session (+0.40 weekly visits, +27%) —
   the best-evidenced mechanic in the whole scan. HT already forgave a miss;
   it never marked the return. Coming back is now the thing the ledger
   visibly credits. */
function prevLogged(k){
  for(var i=1;i<=60;i++){ var p=shift(k,-i); if(loggedOn(p)) return p; }
  return null;
}
function returnedOn(h,k){
  if(!h || h.cadence==='weekly') return false;
  if(!doneOn(h,k)) return false;
  var p=prevLogged(k);
  while(p && !dueDay(h,p)) p=prevLogged(p);   /* HT-28 E12: the last logged day it was DUE */
  return !!p && !doneOn(h,p);                 /* done today, missed the last logged day */
}
function returnsIn(ks){
  var out=[];
  S.habits.forEach(function(h){
    var n=0;
    ks.forEach(function(k){ if(k<=today() && loggedOn(k) && returnedOn(h,k)) n++; });
    if(n) out.push({ h:h, n:n });
  });
  return out.sort(function(a,b){ return b.n-a.n; });
}

/* ---- R-E · A MISSING DAY IS A SCORED EVENT -------------------------
   Every product in eight categories treats a missing day as absence of
   data — the score just does not render. A gap is a result. It is counted,
   it is rendered, and it is named. */
function gaps(n){
  var end=today(), miss=0, first=dates()[0] || null;
  for(var i=1;i<=n;i++){                      /* i=1 — today is not yet a gap */
    var k=shift(end,-i);
    if(first && k<first) break;               /* before the ledger began is not a gap */
    if(!loggedOn(k)) miss++;
  }
  return { missed:miss, of:n, since:first };
}

/* ---- R-B · SELF-PREDICTION -----------------------------------------
   Evidence: self-prediction framing reaches g=0.25 where plain behaviour
   recording reaches g=0.07 — the largest legal upgrade in the scan, for one
   question. Asked ONCE, on the existing close-the-day action, about
   tomorrow. Stored on the day it is made; scored against the next day.
   NOT a new daily input surface: skipping it costs nothing and the whole
   feature hides when its column is absent. */
function predictionOf(k){                     /* the prediction MADE on day k, about k+1 */
  var p=S.privAll[k];
  if(!p) return null;
  var v=p.predict;
  return (v===true||v==='true'||v===1) ? true : (v===false||v==='false'||v===0) ? false : null;
}
function predictionRecord(n){
  var end=today(), made=0, kept=0;
  for(var i=1;i<=(n||30);i++){
    var day=shift(end,-i+1), prior=shift(day,-1);
    if(day>today()) continue;
    var pr=predictionOf(prior);
    if(pr===null) continue;
    if(!loggedOn(day)) { made++; continue; }   /* predicted and did not log = not kept */
    made++;
    var r=S.byDate[day];
    var hit=(r&&r.pct!=null&&r.pct>=80);
    if(pr===hit) kept++;
  }
  return { made:made, kept:kept, pct: made? Math.round(kept/made*100) : null };
}
async function savePredict(v){
  if(!S.hasPredict) return;
  var p=S.priv || (S.priv={});
  p.date=S.date; p.predict=v; S.privAll[S.date]=p;
  /* HT-28 C: only the column this control owns. It used to write rating, why, tasks and prayer from this
     device's copy as well - a whole journal row around the sync layer, which could put stale text back. */
  var res=await sb.from('day_private').upsert({ user_id:S.me.id, date:S.date, predict:v },{ onConflict:'user_id,date' });
  toast(res.error ? 'prediction not saved' : (v?'called it — yes':'called it — no'));
  paintPredict();
}
function paintPredict(){
  var n=el('predict'); if(!n) return;
  if(!S.hasPredict){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  var made=predictionOf(today()), rec=predictionRecord(30);
  n.innerHTML='<div class="pr"><span class="k">Tomorrow</span>'+
    '<div class="s">Will you hit your standards tomorrow? Calling it out loud is worth more than '+
    'recording today was — say it and the ledger checks.</div>'+
    '<div class="tools" style="padding-top:8px">'+
      '<button class="btn'+(made===true?' pri':'')+'" id="prY">Yes</button>'+
      '<button class="btn'+(made===false?' pri':'')+'" id="prN">No</button>'+
      '<span style="flex:1"></span>'+
      '<span class="s">'+(rec.made? ('called right '+rec.kept+' of '+rec.made) : 'no calls yet')+'</span>'+
    '</div></div>';
  var y=el('prY'), no=el('prN');
  if(y)  y.onclick=function(){ savePredict(true); };
  if(no) no.onclick=function(){ savePredict(false); };
}

/* ---- R-D · GAIN FRAMING --------------------------------------------
   Evidence: identical stakes, gain framing vs loss framing — 17.40 vs 11.29
   goal-days out of 20 (p=.007). The sheet used to lead with what was LEFT
   and what was OUTSTANDING. It now leads with what was EARNED. Same
   arithmetic; the subtraction is simply never the headline. */
function earned(k){ return committed() - remaining(k); }

/* ============================ boot ============================ */
(async function boot(){
  var s='carbon'; try{ s=localStorage.getItem('st.skin')||'carbon'; }catch(e){}   /* HT-9a R70.21b: dark is the default; the layer overrides a stored light preference */
  skin(s);
  if(!(await load())) return;
  wire(); paintAll();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(function(r){
      r.update();
      /* HT-25 S7 · "UPDATE AVAILABLE - TAP TO RELOAD".
         The cache version bump is what makes a phone FETCH the new build; it is not what makes
         the phone SHOW it. An installed PWA that is already open keeps the old page until it is
         closed, and Cory's is open all day - which is why "I pushed it" and "he can see it" have
         been two different facts in five wires. The new worker calls skipWaiting(), so the moment
         one is installed the app is one reload away; this is the one line that says so.
         A toast, not an auto-reload: reloading under someone who is mid-brain-dump would throw
         away what they were typing. */
      r.addEventListener('updatefound', function(){
        var w = r.installing; if(!w) return;
        w.addEventListener('statechange', function(){
          if(w.state === 'installed' && navigator.serviceWorker.controller){
            /* HT-29 S8 (PASTE 133) · D16 CLOSED. The toast above could never be tapped (`.toast{pointer-events:none}`)
               and the next toast - "saved", a check-off - erased it. A banner of its own now waits for the tap,
               saves what is being typed, then refreshes. The toast branch stays behind HT29_UPDATE_BANNER. */
            if(window.__HT29UPD && HT29_UPDATE_BANNER){ window.__HT29UPD.show(); return; }
            var n = el('toast'); if(!n) return;
            n.textContent = 'update available — tap to reload';
            n.classList.add('on');
            n.style.cursor = 'pointer';
            n.onclick = function(){ location.reload(); };
            clearTimeout(toast._t);          /* it stays up until it is tapped or the app reopens */
          }
        });
      });
    }).catch(function(){});
  }
})();



/* ======================= HT-9a · THE SIMPLE VIEW LAYER (R70.41) =======================
   One block. It hides, reorders and labels; it computes nothing the app does not already compute, and
   it deletes nothing. `advanced()` true -> every function here returns immediately.

   Why a layer and not 26 guards inside the paints: the paints are what the HT-6 suite verifies. Editing
   them puts the hidden instruments at risk to make them invisible, which is backwards. R70.16 says
   hidden is not deleted; the cheapest way to honour that is to leave the code alone and change what the
   page shows. */
(function(){
  /* HT-24 C1: THREE GROUPS, COMPUTED. `bucketOf()` decides; `group_name` is no longer what the
     list is built from. The old order is kept below it because a person may still carry those
     names on their rows and `groupsFor()` still offers them in the sheet - hidden, never deleted
     (R70.138). DEC-057 still stands: the list is not grouped BY the clock, it is grouped by
     whether a standard HAS one, and the clock only sorts inside TIMED. */
  var GRP_ORDER = ['TIMED','ANYTIME','WEEKLY'];        /* HT-25 S3: Cory's three words, in his order */
  var GRP_LEGACY = ['MORNING','AFTERNOON','NIGHT','STANDARDS','WEEKLY','OTHER'];
  var KEEP_HEADINGS = ['COMPLETION','RATE THE DAY','JOURNAL'];

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  /* ---- 1 · the dark lock, through the app's own skin() so Advanced still shows it selected ---- */
  function lockSkin(){
    if(advanced()) return;
    try{ if(localStorage.getItem('st.skin')!=='carbon') skin('carbon'); }catch(e){ skin('carbon'); }
    if(document.documentElement.getAttribute('data-skin')!=='carbon') skin('carbon');
  }

  /* ---- 2 · structure: outputs out, inputs in order, CLOSE THE DAY last ---- */
  function restructure(){
    if(advanced() || document.documentElement.hasAttribute('data-ht9a')) return;
    var colR = document.querySelector('.colR'); if(colR) colR.classList.add('ht9a-off');

    var jIn = document.getElementById('jIn'); if(!jIn) return;
    /* inside the input column, anything that is not one of the three input blocks is output */
    q('.blk', jIn).forEach(function(b){
      var h = b.querySelector('.sh h2');
      var t = h ? h.textContent.replace(/\s+/g,' ').trim().toUpperCase() : '';
      var keep = KEEP_HEADINGS.some(function(k){ return t.indexOf(k) >= 0; });
      if(!keep) b.classList.add('ht9a-off');
    });

    /* BRAIN DUMP — the fifth field. No column exists yet (the migration is HT-9b), so it persists
       per device and per date and the receipt says so. Nothing silently pretends to be saved. */
    var pray = document.getElementById('iPrayer');
    if(pray && !document.getElementById('iDump')){
      var host = pray.closest('.pan') || pray.closest('.blk') || pray.parentNode.parentNode;
      var lab = document.createElement('label');
      lab.className = 'fld';
      /* HT-30 S4.10 (Cory 9/20): the box is the JOURNAL, and it carries no placeholder - an empty
         box with a quiet border, and the label above it is the only text on it. */
      lab.innerHTML = '<span class="lab">Journal</span>' +
                      '<textarea id="iDump" rows="3"></textarea>';
      host.insertBefore(lab, host.firstChild);
      var ta = lab.querySelector('#iDump'), t = null;
      ta.addEventListener('input', function(){
        if(!HT9A_DUMP_STOPGAP) return;                 /* HT-29 S1: the column exists; the row is the only home */
        clearTimeout(t);
        t = setTimeout(function(){ try{ localStorage.setItem('ht_dump_'+S.date, ta.value); }catch(e){} }, 500);
      });
    }
    /* COMPLETED — the existing `tasks` field, relabelled. The column does not move. */
    var tasks = document.getElementById('iTasks');
    if(tasks){
      var tl = tasks.closest('.fld') && tasks.closest('.fld').querySelector('.lab');
      if(tl) tl.textContent = 'Completed';
    }
    var pl = pray && pray.closest('.fld') && pray.closest('.fld').querySelector('.lab');
    if(pl) pl.textContent = 'Prayer';

    /* CLOSE THE DAY -> last child of the input column, sticky */
    var bClose = document.getElementById('bClose');
    if(bClose){
      var wrap = document.getElementById('tClose');
      if(!wrap){ wrap = document.createElement('div'); wrap.id = 'tClose'; }
      wrap.appendChild(bClose);
      jIn.appendChild(wrap);
    }
    document.documentElement.setAttribute('data-ht9a','1');
  }

  /* ---- 3 · header: HT · weekday date · done of total · < > · SETTINGS ---- */
  function header(){
    if(advanced()) return;
    var r1 = document.querySelector('.mast .r1'); if(!r1) return;
    var set = document.getElementById('bSet');
    if(!document.getElementById('hCount')){
      var c = document.createElement('span'); c.id='hCount'; c.className='sub num';
      r1.insertBefore(c, set);
      var p = document.createElement('button'); p.id='hPrev'; p.className='tbtn';
      p.title='previous day'; p.textContent='\u2039';
      var n = document.createElement('button'); n.id='hNext'; n.className='tbtn';
      n.title='next day'; n.textContent='\u203a';
      r1.insertBefore(p, set); r1.insertBefore(n, set);
      p.onclick = function(){ goDay(shift(S.date,-1)); };
      n.onclick = function(){ goDay(shift(S.date, 1)); };
    }
    try{
      var ck = ckOf(S.date), dl = daily(), wk = weekly();
      var done = dl.filter(function(h){ return ck[h.id]; }).length +
                 wk.filter(function(h){ return weekDone(h.id, S.date); }).length;
      document.getElementById('hCount').textContent = done + ' of ' + (dl.length + wk.length);
    }catch(e){}
  }

  /* ---- 4 · group the rows under headers, in the fixed order ---- */
  function group(){
    if(advanced()) return;
    var log = document.getElementById('log'); if(!log) return;
    var rows = q('.li', log); if(!rows.length) return;
    var buckets = {};
    rows.forEach(function(r){
      /* the group comes from habits.group_name, never from the row's .gp span: paintLog only emits
         .gp in the full sheet, so reading the DOM put every standard in OTHER. MEASURED. */
      var hid = r.getAttribute('data-h');
      var h = S.habits.filter(function(x){ return x.id === hid; })[0];
      /* HT-24 C1: the bucket is COMPUTED from cadence and the planned time, not read from
         `group_name`. A row with no matching habit falls to ANYTIME rather than inventing a
         group of its own. */
      var name = h ? bucketOf(h) : 'ANYTIME';
      (buckets[name] = buckets[name] || []).push(r);
    });
    var order = GRP_ORDER.filter(function(g){ return buckets[g]; })
      .concat(Object.keys(buckets).filter(function(g){ return GRP_ORDER.indexOf(g) < 0; }).sort());
    var frag = document.createDocumentFragment();
    order.forEach(function(g){
      var h = document.createElement('div'); h.className = 'grp'; h.textContent = g;
      frag.appendChild(h);
      buckets[g].forEach(function(r){ frag.appendChild(r); });
    });
    log.innerHTML = '';
    log.appendChild(frag);
  }

  /* ---- 5 · the Advanced toggle, inside Settings ---- */
  function advToggle(){
    var ov = document.querySelector('.ov.on .inner') || document.querySelector('.ov .inner');
    if(!ov || document.getElementById('advWrap')) return;
    var w = document.createElement('div'); w.id='advWrap'; w.className='pan';
    w.style.marginTop='14px';
    var on = advanced();
    w.innerHTML = '<div class="lab">Advanced</div>' +
      /* HT-28 A7 (PASTE 128): one plain line - Cory asked what it does */
      '<div class="note" style="margin:6px 0 9px">Shows the older full layout — every chart, stat, theme and control the simple view hides.</div>' +
      '<button class="btn" id="advBtn">' + (on ? 'Advanced is ON — turn it off' : 'Turn Advanced ON') + '</button>';
    ov.appendChild(w);
    document.getElementById('advBtn').onclick = function(){
      try{ localStorage.setItem('ht_advanced', on ? '0' : '1'); }catch(e){}
      location.reload();
    };
  }

  /* ---- 6 · re-apply after the app repaints. The app calls these by name, so reassigning the
              binding in this shared scope is enough; no observer, no polling. ---- */
  function simplify(){ restructure(); group(); header(); }

  var _log = paintLog;   paintLog  = function(){ _log.apply(null, arguments);  group(); header(); };
  var _mast = paintMast; paintMast = function(){ _mast.apply(null, arguments);
                                                  restructure(); header(); loadDump(); };
  var _go = goDay;       goDay     = function(k){ _go.call(null, k); simplify(); loadDump(); };
  var _os = openSettings; openSettings = function(){ _os.apply(null, arguments); setTimeout(advToggle, 60); };

  /* ---- HT-29 S1 (PASTE 133) · THE DEVICE STOPGAP IS RETIRED, AND THIS IS THE LINE THAT LOST TEXT --------
     9a wrote the brain dump to localStorage because `day_private.brain_dump` did not exist yet. It has existed
     since 2026-09-09, and HT-10's importStopgap moves any leftover keys into it and DELETES them - after which
     this function set the box to '' on every paintMast (so: after every check-off) and on every day change.
     MEASURED on the fixture (ht_stage\133\s1\diag_dump.txt): the row held DUMP-KEEPS, S.priv held DUMP-KEEPS,
     and the box was blank after a reload - one keystroke away from writing that blank back over the row.
     The stopgap is HIDDEN, NEVER REMOVED (R70.138): flip HT9A_DUMP_STOPGAP to true and 9a behaves as it did. */
  function loadDump(){
    if(!HT9A_DUMP_STOPGAP) return;
    var ta = document.getElementById('iDump'); if(!ta) return;
    try{ ta.value = localStorage.getItem('ht_dump_' + S.date) || ''; }catch(e){}
  }

  function boot(){ lockSkin(); simplify(); loadDump(); }
  if(document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', function(){ setTimeout(boot, 0); });
})();



/* ======================= HT-10 · JOURNAL LAYER (PASTE 32 §A) =======================
   One section, four fields, every day editable. Appended to the HT-9a layer's scope, inside the same
   sealed closure, so it can call savePriv/queuePriv/paintJournalInputs directly. */
(function(){
  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  /* HT-25 S2 · grow() GAINS A CEILING, and that is the whole bug.
     Until 2026-09-10 this was `height = scrollHeight + 2` with no bound, against a stylesheet that
     said `overflow:hidden`. A box that only ever gets taller and can never scroll is one Cory
     reported exactly: "if I do a long brain dump I'm not able to scroll down — I'd have to delete
     spaces to see it." Past the ceiling the box stops growing and starts SCROLLING; below it,
     nothing about the old behaviour changes. `growTo` is the one home for the rule (window.__HT25). */
  function grow(t){ if(!t) return; window.__HT25.growTo(t); }

  /* ---- 1 · one section: rating moves in above the three journals, "why" leaves ---- */
  function journalise(){
    if(advanced() || document.documentElement.hasAttribute('data-ht10')) return;
    var dump = document.getElementById('iDump'); if(!dump) return;      /* 9a layer not up yet */
    var host = dump.closest('.pan') || dump.parentNode.parentNode;
    var rate = document.getElementById('rate');
    if(rate && !document.getElementById('rateWrap')){
      var w = document.createElement('div'); w.id = 'rateWrap';
      var lab = document.createElement('span'); lab.className = 'lab';
      lab.textContent = 'Rate the day'; lab.style.display = 'block'; lab.style.marginBottom = '6px';
      w.appendChild(lab); w.appendChild(rate);
      host.insertBefore(w, host.firstChild);
      var rblk = document.querySelector('.blk .rate') ? null : null;
    }
    var why = document.getElementById('iWhy');
    if(why){ var f = why.closest('.fld'); if(f) f.id = 'whyFld'; }
    /* ---- HT-22 S1 · THE THREE INPUTS TRAVEL WITH THE RATING (R70.211) ------------------
       THE SHOT IS WHY THIS EXISTS. `#in3a` was marked up inside the "Rate the day" .blk, and
       this function EMPTIES that block and marks it `ht9a-off` once the rating strip has moved
       out of it. The fields were in the DOM, the golden found them by id and passed - and they
       were invisible at every width in the view Cory actually runs. A field he cannot see is a
       field that does not exist (R70.211), and only the screenshot said so.
       So they follow the strip: rating, then sleep / tomorrow / Saturday weight, then the three
       journals. That IS "in the journal header at RATE THE DAY time", which is where the wire
       put them. */
    /* THE THREE INPUTS JOIN THE RATING'S OWN ROW, as its last flex item.
       `#rateWrap` is `label | strip` on one line in the quadrant layout, and it now wraps: at
       1920 the three fields sit beside the strip and cost the journal NOTHING; at 1280 they take
       a second line and cost it ~30px. That asymmetry is deliberate. Every pixel inside this
       quadrant comes off the BRAIN DUMP - HT-18's grow() hands it whatever is left - and the
       dump is one of the three inputs DEC-058 protects. Measured, 1280x720:
           stacked as three `.fld` rows   dump 122 -> 62
           on a forced second line        dump 122 -> 80
           wrapping only when it must     dump 122 -> 108   <- this
       and at 1920 the dump does not move at all. */
    var in3 = document.getElementById('in3a');
    var rw  = document.getElementById('rateWrap');
    if(in3 && rw && in3.parentNode !== rw) rw.appendChild(in3);
    /* the emptied "Rate the day" block, and the journal head, renamed */
    var blks = Array.prototype.slice.call(document.querySelectorAll('#jIn .blk'));
    blks.forEach(function(b){
      var h = b.querySelector('.sh h2');
      var t = h ? h.textContent.toUpperCase() : '';
      if(t.indexOf('RATE THE DAY') >= 0 && !b.querySelector('#rate')) b.classList.add('ht9a-off');
      if(t.indexOf('JOURNAL') >= 0 && h) h.textContent = 'Journal';
    });
    /* HT-30 S4.10 (Cory 9/20): no placeholder text in any of the three boxes. This line put one back
       on Prayer after index.html gave it up, which is why the box still showed a lone ellipsis. The
       attribute is REMOVED rather than set to '', so nothing renders a blank hint either. */
    var pray = document.getElementById('iPrayer');
    if(pray) pray.removeAttribute('placeholder');
    document.documentElement.setAttribute('data-ht10','1');
  }

  /* ---- 2 · the fifth field is a real column now ---- */
  function bindDump(){
    var t = document.getElementById('iDump'); if(!t || t.dataset.bound) return;
    t.dataset.bound = '1';
    t.addEventListener('input', function(){
      S.priv = S.priv || {}; S.priv.brain_dump = t.value; grow(t); queuePriv();
    });
    ['iDump','iTasks','iPrayer','iWhy'].forEach(function(id){
      var n = document.getElementById(id); if(!n || n.dataset.blurred) return;
      n.dataset.blurred = '1';
      n.addEventListener('blur', function(){ savePriv(); });     /* A2: upsert on blur, not only debounced */
    });
    var c = document.getElementById('bClose');
    if(c && !c.dataset.flush){ c.dataset.flush = '1';
      c.addEventListener('click', function(){ savePriv(); }, true); }   /* A2: and on CLOSE THE DAY */
  }

  /* ---- 3 · every day populates, including the new field ---- */
  var _pji = paintJournalInputs;
  paintJournalInputs = function(){
    _pji.apply(null, arguments);
    var t = document.getElementById('iDump');
    if(t){ t.value = (S.priv && S.priv.brain_dump) || ''; grow(t); }
    grow(document.getElementById('iTasks')); grow(document.getElementById('iPrayer'));
    journalise(); bindDump();
  };

  /* ---- 4 · import the 9a stopgap, once, then clear it ----
     9a persisted the brain dump per device in localStorage because the column did not exist. Those
     entries are Cory's writing and they are NOT dropped: they move into day_private the first time
     this build runs with the column present, and only where the column is empty. */
  async function importStopgap(){
    if(!S.hasDump) return;
    var keys = [];
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i);
           if(k && k.indexOf('ht_dump_')===0) keys.push(k); } }catch(e){ return; }
    var moved = 0;
    for(var j=0;j<keys.length;j++){
      var date = keys[j].slice(8), val = '';
      try{ val = localStorage.getItem(keys[j]) || ''; }catch(e){}
      if(!val.trim()){ try{ localStorage.removeItem(keys[j]); }catch(e){} continue; }
      var row = S.privAll[date];
      if(row && (row.brain_dump||'').trim()){ try{ localStorage.removeItem(keys[j]); }catch(e){} continue; }
      var res = await sb.from('day_private').upsert(
        { user_id:S.me.id, date:date, brain_dump:val }, { onConflict:'user_id,date' });
      if(!res.error){
        S.privAll[date] = S.privAll[date] || { date:date };
        S.privAll[date].brain_dump = val;
        try{ localStorage.removeItem(keys[j]); }catch(e){}
        moved++;
      }
    }
    if(moved) { toast(moved + ' journal entr' + (moved>1?'ies':'y') + ' moved to the database');
                if(S.privAll[S.date]) S.priv = S.privAll[S.date];
                paintJournalInputs(); }
  }

  function boot(){ journalise(); bindDump(); importStopgap(); }
  if(document.readyState === 'complete') setTimeout(boot, 120);
  else window.addEventListener('load', function(){ setTimeout(boot, 120); });
})();

/* ======================= HT-11 · TASKS LAYER (PASTE 35 §2 · PASTE 32 §B 8–13) =======================
   Edit a standard from the front screen, drag it into order, add one at the foot of its group, and
   leave the back-end table editor intact behind Settings -> Advanced.

   A LAYER, for the same reason 9a and 10 are layers: `paintLog` is what the HT-6 golden suite verifies,
   and the 9a layer already re-parents its rows under `.grp` headers. Editing the paint to add an edit
   affordance would put 17 passing assertions at risk to gain a pencil. So this block decorates what 9a
   has already produced, and computes nothing the app does not already compute.

   THE THREE NEW COLUMNS ARE OPTIONAL BY CONSTRUCTION. `planned_start`, `planned_end` and `notes` are
   4-HT's to run in Cory's Supabase editor; until they land the sheet probes, finds them absent, and
   hides those rows — the same degrade-cleanly contract `habits.cue` and `day_private.predict` already
   have. Nothing on this sheet pretends to save.

   R47.3 STRICT: every read and every write below is user_id-scoped. `golden_ht11.py` records every
   query the sheet issues and FAILS if any `habits` statement lacks a user_id filter. */
(function(){
  var GROUPS = ['Morning','Afternoon','Night','Standards','Weekly','Other'];
  var LONG_PRESS = 450;     /* B2: the phone gesture, in ms */
  var DRAG_SLOP  = 6;       /* px of movement that turns a press into a drag, never a tap */

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function hby(id){ return S.habits.filter(function(x){ return x.id===id; })[0] || null; }
  function groupsFor(sel){
    var out=GROUPS.slice();
    S.habits.forEach(function(h){ var g=h.group_name; if(g && out.indexOf(g)<0) out.push(g); });
    if(sel && out.indexOf(sel)<0) out.push(sel);
    return out;
  }
  /* the 9a layer prints group headers UPPERCASE; this maps one back to the STORED value.
     null means "this header matches no group I know" -> the drag leaves that row's group alone. */
  function canonGroup(txt){
    var t=String(txt||'').replace(/\s+/g,' ').trim();
    /* ---- HT-24 C1 . A COMPUTED HEADER IS NOT A GROUP NAME -----------------------------
       TIMED / STANDARDS / WEEKLY are computed from cadence and the planned time (bucketOf).
       Returning one of them here would make a drag across a header write `group_name='TIMED'`
       into the database - a real value overwritten by the name of a view. `null` is already the
       "this header matches no group I know" answer and the drag then leaves the row's group
       alone, which is exactly right: under three computed groups, a drag reorders and nothing
       else. Changing cadence or time is the sheet's job.
       STANDARDS and WEEKLY are also legacy group names, so the check is on the COMPUTED set,
       not on the string alone - and it runs first. */
    /* HT-29 S2: the four sections are computed headers too - a drag across one sets `section`, never a group */
    if(['TIMED','ANYTIME','STANDARDS','WEEKLY','MORNING ROUTINE','NIGHT ROUTINE'].indexOf(t.toUpperCase()) >= 0
       && document.documentElement.hasAttribute('data-ht9a')) return null;
    var hit=GROUPS.filter(function(g){ return g.toUpperCase()===t.toUpperCase(); })[0];
    if(hit) return hit;
    return S.habits.map(function(h){ return h.group_name; })
      .filter(function(g){ return g && g.toUpperCase()===t.toUpperCase(); })[0] || null;
  }

  /* ---- 1 · probe for the three columns, once, scoped to the signed-in user ----
     Two probes, not one: the window pair and `notes` can land separately, and reporting "no columns"
     because one of three is missing would hide a field that exists. */
  var probed=false;
  async function probe(){
    if(probed || !S.me || !S.me.id) return;
    probed=true;
    var w = await sb.from('habits').select('id,planned_start,planned_end')
              .eq('user_id',S.me.id).eq('active',true).order('sort_order');
    S.hasWindow = !w.error;
    var n = await sb.from('habits').select('id,notes')
              .eq('user_id',S.me.id).eq('active',true).order('sort_order');
    S.hasNotes = !n.error;
    /* HT-16 S6 (R70.103): a third probe. `time_anchor` and `minutes_planned` land together but a
       probe that asks for both and gets one is still a probe that reports "no columns", so they get
       their own. Absent -> the two fields are hidden and TODAY keeps its existing order. */
    var t = await sb.from('habits').select('id,time_anchor,minutes_planned')
              .eq('user_id',S.me.id).eq('active',true).order('sort_order');
    S.hasTime = !t.error;
    /* HT-29 S2 (PASTE 133): a fourth probe. `section` lands with tools/sql/2026-09-15_ht29.sql; absent -> every
       standard sits where the rule places it and the sheet shows no Section field. Scoped like the others. */
    var sc = await sb.from('habits').select('id,section')
              .eq('user_id',S.me.id).eq('active',true).order('sort_order');
    S.hasSection = !sc.error;
    if(S.hasSection) (sc.data||[]).forEach(function(r){
      var h=hby(r.id); if(h){ h.section=r.section; } });
    /* merge what exists onto the rows load() already has — HCOLS is fixed and golden-verified */
    if(S.hasWindow) (w.data||[]).forEach(function(r){
      var h=hby(r.id); if(h){ h.planned_start=r.planned_start; h.planned_end=r.planned_end; } });
    if(S.hasNotes) (n.data||[]).forEach(function(r){
      var h=hby(r.id); if(h){ h.notes=r.notes; } });
    if(S.hasTime) (t.data||[]).forEach(function(r){
      var h=hby(r.id); if(h){ h.time_anchor=r.time_anchor; h.minutes_planned=r.minutes_planned; } });
  }

  /* ---- 2 · THE EDIT SHEET (B2) — over TODAY, not a page ----
     Its own element, never `#ov`: `#ov` is Settings/Guide/Circle, and opening the sheet must not tear
     one of those down. */
  function sheetEl(){
    var n=document.getElementById('esheet');
    if(n) return n;
    n=document.createElement('div'); n.id='esheet'; n.className='esheet';
    n.innerHTML='<div class="ebody" id="ebody"></div>';
    document.body.appendChild(n);
    n.addEventListener('click',function(e){
      if(e.target===n) closeSheet();                        /* the scrim */
      if(e.target.closest('[data-ex]')) closeSheet();
    });
    n.addEventListener('keydown',function(e){ if(e.key==='Escape') closeSheet(); });
    return n;
  }
  function closeSheet(){ var n=document.getElementById('esheet'); if(n) n.classList.remove('on'); }
  function fld(lab,inner){ return '<label class="fld"><span class="lab">'+lab+'</span>'+inner+'</label>'; }

  function openSheet(h, presetGroup){
    var isNew = !h;
    h = h || { name:'', group_name:presetGroup||'Standards', cadence:'daily', minutes:0,
               link:'', notes:'', planned_start:'', planned_end:'', cue:'' };
    var grp = h.group_name||'Other';
    var n=sheetEl();
    document.getElementById('ebody').innerHTML =
      '<div class="eh"><h3>'+(isNew?'New standard':'Edit standard')+'</h3>'+
        '<span style="flex:1"></span><button class="tbtn" data-ex="1">Close</button></div>'+
      /* ---- HT-21 S5 · THE SHEET, TRIMMED (R70.289) --------------------------------------
         EIGHT FIELDS, IN THIS ORDER, and the order is the acceptance:
           Name · Group · Cadence · Planned time · Planned minutes · Link · Notes · Archive
         WHAT WENT, AND WHERE IT WENT (R70.138 — hidden, never deleted):
           · PLANNED WINDOW (`planned_start`/`planned_end`) is superseded by S2's planned time
             plus planned minutes, which say the same thing with one input instead of two. Its
             columns do not exist yet and now never need to; the field is not rendered.
           · CUE ("after I __, I will __") is replaced by Notes. IT IS HIDDEN, NOT DELETED: the
             row is gone from the sheet and `cue` IS NEVER WRITTEN while the input is absent, so
             every standard that carries one keeps it. It moves into Notes on a FIRST EDIT the
             person makes, never on a bulk pass and never silently — and it cannot move at all
             until the `notes` column exists, which is why the offer only appears when it does. */
      fld('Name','<input id="eName" value="'+esc(h.name)+'" placeholder="standard" autocomplete="off">')+
      /* HT-29 S2 (PASTE 133 Ruling 3): Cory places each standard in one of four sections himself. Shown only
         when the column exists - a field that cannot save is never offered (R70.289). */
      /* HT-31 S1.6: the field is offered WHETHER OR NOT the column exists. Withholding it was the
         reason the clock got to decide at all - Cory could not place a task, so code placed it for
         him. Without the column the choice is kept on the device (`__HT31SEC`) and written up the
         moment the column arrives, so his placement is never the thing that waits for a migration. */
      (function(){
        var cur = (isNew && window.__HT29_PRESET_SECTION) || HT29SEC.sectionOf(h);
        return fld('Section','<select id="eSection">'+HT29SEC.ORDER.map(function(s){
          return '<option value="'+s+'"'+(s===cur?' selected':'')+'>'+HT29SEC.NAMES[s]+'</option>'; }).join('')+'</select>');
      })()+
      fld('Group','<select id="eGroup">'+groupsFor(grp).map(function(g){
          return '<option'+(g===grp?' selected':'')+'>'+esc(g)+'</option>'; }).join('')+'</select>')+
      /* HT-24 C1: three cadences now, and the third carries a day picker that is only shown
         when it is chosen. `dow:` is stored as the grammar, never as a second column. */
      (function(){
        /* HT-28 E15 · DAYS IN PLAIN WORDS (Every day · Weekdays · Weekends · pick days) and F18 · RESTS
           ON SABBATH. The option VALUES stay daily / dow / weekly (golden_ht23 C1j reads them); only the
           words change. A daily standard that rests on the Sabbath is stored as every day but Saturday
           (`dow:0,1,2,3,4,5`) and reads back as "Every day" with the switch on - one grammar, no column. */
        var dw = dowOf(h), sab = isSabbathStd(h);
        var rests = !sab && !!(dw && dw.length===6 && dw.indexOf(6)<0);
        var cad = isWeekly(h) ? 'weekly' : ((dw && !rests) ? 'dow' : 'daily');
        return fld('Days','<select id="eCad">'+
            '<option value="daily"'+(cad==='daily'?' selected':'')+'>Every day</option>'+
            '<option value="dow"'+(cad==='dow'?' selected':'')+'>Certain days</option>'+
            '<option value="weekly"'+(cad==='weekly'?' selected':'')+'>Once a week</option></select>')+
          '<div class="fld dowf" id="eDowFld"'+(cad==='dow'?'':' hidden')+'>'+
            '<span class="lab">Which days</span>'+
            '<div class="dowq" id="eDowQ"><button type="button" class="dowqb" data-q="1,2,3,4,5">Weekdays</button>'+
              '<button type="button" class="dowqb" data-q="0,6">Weekends</button></div>'+
            '<div class="dow" id="eDow">'+
            ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(nm,i){
              var on = (dw && !rests) ? dw.indexOf(i)>=0 : false;
              return '<button type="button" class="dowb'+(on?' on':'')+'" data-d="'+i+'" '+
                     'aria-pressed="'+(on?'true':'false')+'">'+nm+'</button>';
            }).join('')+'</div></div>'+
          (sab ? '' : '<label class="fld h28rest" id="eRestFld"'+(cad==='weekly'?' hidden':'')+'>'+
            '<span class="lab">Rests on Sabbath</span>'+
            '<span class="h28sw"><input type="checkbox" id="eRest"'+(rests?' checked':'')+'> not due on Saturdays</span></label>');
      })()+
      (S.hasTime ? '<div class="fld" id="eTimeFld"><span class="lab">Planned time</span>'+
          '<div class="win"><input id="eAnchor" type="time" value="'+esc(hhmm(h.time_anchor)||'')+'">'+
          '</div>'+
          (function(){
             if(h.time_anchor || !h.id) return '';
             /* TWO suggestions, and NEITHER EVER TOUCHES THE NAME (R70.265 · R70.285).
                One reads the clock he typed into the name; one reads when he actually does it.
                Both fill `planned_at` on a tap and nothing else. */
             var out='';
             var fromName=(String(h.name||'').match(/(\d{1,2}):(\d{2})/)||null);
             if(fromName){
               var t=('0'+fromName[1]).slice(-2)+':'+fromName[2];
               out+='<button class="btn h16adopt" id="eFromName" data-t="'+t+'">'+
                    'Set planned time '+fmtTime(t)+' from the name?</button>';
             }
             var m = (window.__HT16 && window.__HT16.medianClose) ? window.__HT16.medianClose(h.id) : null;
             if(m) out+='<button class="btn h16adopt" id="eAdopt" data-t="'+m+'">usually done ~'+fmtTime(m)+
                        '</button>';
             return out;
           })()+
          '</div>' : '')+
      fld('Planned minutes','<input id="eMin" class="num" type="number" min="0" step="5" value="'+
          (h.minutes||0)+'">')+
      fld('Link','<input id="eLink" value="'+esc(h.link||'')+'" placeholder="https://…" '+
          'inputmode="url" autocomplete="off">')+
      /* NOTES. When the column is missing the field is DISABLED WITH THE REASON ON IT — it never
         says "saves later", because a sheet that offers a field it cannot save is lying about
         what pressing Save will do (R70.289). */
      /* HT-29 S2.8 (PASTE 133): Notes IS the definition of done - the one line that makes two people's check-offs
         mean the same thing. Same column, a plainer name; it rides the name on a desktop hover. */
      (S.hasNotes
        ? fld('Done when','<textarea id="eNotes" rows="2" placeholder="what done looks like, in one line">'+esc(h.notes||'')+'</textarea>'+
            ((h.cue && String(h.cue).trim())
              ? '<button class="btn h16adopt" id="eCueMove" data-c="'+esc(h.cue)+'">'+
                'Move your cue into Notes?</button>' : ''))
        : /* HT-22 S1: this branch is now unreachable against Cory's database - `notes` landed
             2026-09-09 - and it STAYS, because the contract is that the same build runs before
             and after a migration and `__NO_NOTES` still exercises it in the harness. */
          '<div class="fld"><span class="lab">Notes</span>'+
          '<textarea rows="3" disabled placeholder="one migration away — see below"></textarea>'+
          '</div>')+
      '<div class="etools">'+
        (isNew?'':'<button class="btn" id="eArch">Delete</button>')+
        '<span style="flex:1"></span>'+
        '<button class="btn" id="eCancel">Cancel</button>'+
        '<button class="btn pri" id="eSave">Save</button>'+
      '</div>'+
      /* ONE note, and it names exactly what is missing and what still works. */
      ((S.hasTime && S.hasNotes) ? '' :
        '<div class="note enote">'+
        (!S.hasTime && !S.hasNotes ? 'Planned time and notes are one migration away.'
         : !S.hasTime ? 'Planned time is one migration away.'
         : 'Notes are one migration away.')+
        ' Everything else on this sheet saves in one action.'+
        (h.cue && String(h.cue).trim()
          ? ' Your cue is kept exactly as it is until Notes can hold it.' : '')+
        '</div>');

    n.classList.add('on');
    if(isNew) setTimeout(function(){ var f=document.getElementById('eName'); if(f) f.focus(); },60);
    document.getElementById('eCancel').onclick=closeSheet;
    document.getElementById('eSave').onclick=function(){ saveSheet(h,isNew); };
    var ar=document.getElementById('eArch');
    if(ar) ar.onclick=function(){ archiveOne(h); };
    /* HT-21 S2 · BOTH suggestions fill `planned_at` and NOTHING ELSE. `eName` is never read
       here and never written — R70.285 ("don't rename my tasks") is satisfied by construction,
       not by care, and the wire's acceptance is a diff over `name` that must come back empty. */
    /* S5: moving a cue into Notes is a TAP, never a bulk pass and never silent. It fills the
       textarea and removes itself; the `cue` field is not cleared here — the save below simply
       stops writing it once Notes carries the text. */
    /* HT-24 C1: the day picker shows only for "Certain days", and each day toggles. */
    var cad=document.getElementById('eCad'), dowFld=document.getElementById('eDowFld');
    var restFld=document.getElementById('eRestFld');
    if(cad && dowFld) cad.onchange=function(){
      dowFld.hidden = (cad.value!=='dow');
      if(restFld) restFld.hidden = (cad.value==='weekly');        /* HT-28 F18: a weekly is not graded per day */
    };
    /* HT-28 E15: Weekdays / Weekends set the picker in one tap; the days still toggle one by one */
    var dowQ=document.getElementById('eDowQ');
    if(dowQ) dowQ.onclick=function(e){
      var b=e.target.closest('.dowqb'); if(!b) return;
      e.preventDefault();
      var want=b.getAttribute('data-q').split(',').map(Number);
      q('.dowb', document.getElementById('eDow')||document).forEach(function(x){
        var on=want.indexOf(+x.getAttribute('data-d'))>=0;
        x.classList.toggle('on', on); x.setAttribute('aria-pressed', on?'true':'false');
      });
    };
    var dowBox=document.getElementById('eDow');
    if(dowBox) dowBox.onclick=function(e){
      var b=e.target.closest('.dowb'); if(!b) return;
      e.preventDefault();
      var on=b.classList.toggle('on');
      b.setAttribute('aria-pressed', on?'true':'false');
    };
    var cm=document.getElementById('eCueMove');
    if(cm) cm.onclick=function(e){ e.preventDefault();
      var t=document.getElementById('eNotes');
      if(t){ var c=cm.getAttribute('data-c'); t.value = t.value ? (t.value+'\n'+c) : c; }
      cm.parentNode.removeChild(cm); };
    ['eAdopt','eFromName'].forEach(function(id){
      var b=document.getElementById(id);
      if(!b) return;
      b.onclick=function(e){ e.preventDefault();
        var f=document.getElementById('eAnchor');
        if(f) f.value=b.getAttribute('data-t');
        b.parentNode.removeChild(b); };
    });
  }

  function num(id){ var n=document.getElementById(id); return n?(+n.value||0):0; }
  function str(id){ var n=document.getElementById(id); return n?String(n.value||'').trim():''; }

  async function saveSheet(h,isNew){
    var name=str('eName');
    if(!name){ toast('a standard needs a name'); return; }
    var rec={ user_id:S.me.id, name:name, group_name:str('eGroup'),
              cadence:(function(){
                var v=str('eCad');
                if(v==='weekly') return 'weekly';
                var days=[0,1,2,3,4,5,6];
                if(v==='dow'){
                  var on=q('.dowb.on', document.getElementById('eDow')||document)
                          .map(function(b){ return +b.getAttribute('data-d'); });
                  /* NO DAYS PICKED IS NOT A CADENCE. It would render a standard that is due on no
                     day at all and can never be completed, so it degrades to daily rather than
                     writing `dow:` with nothing after it. */
                  if(on.length) days=on;
                }
                /* HT-28 F18: resting on the Sabbath takes Saturday out of the set - unless Saturday is
                   the only day, where the switch has nothing to rest */
                var rest=document.getElementById('eRest');
                if(rest && rest.checked && !(days.length===1 && days[0]===6))
                  days=days.filter(function(d){ return d!==6; });
                return serializeCadence({ kind:'dow', days:days });   /* all seven -> 'daily' */
              })(),
              minutes:num('eMin'), link:str('eLink')||null };
    /* S5 · THE ONE LINE THAT WOULD HAVE DESTROYED EVERY CUE. `str('eCue')` returns '' when the
       input is not rendered, so writing it unconditionally would blank the field for every
       standard on the next save — the same shape of defect as HT-20's Strip button, which also
       wrote a helper's output back over real data. The cue is written only when the person can
       see and edit it. */
    /* HT-28 E13: a Sabbath deliberately saved as every day leaves the SABBATH group - the migration's whole
       signature - so a device that has not run it yet can never turn it back into Saturday-only */
    if(rec.cadence==='daily' && isLegacySabbath(rec)) rec.group_name='Other';
    var cueIn = document.getElementById('eCue');
    if(S.hasCue && cueIn) rec.cue = str('eCue');
    /* S5: the planned-window inputs are no longer rendered (superseded by planned time +
       planned minutes), so nothing writes those columns. */
    /* HT-30 S3.8: THE SAME LINE THAT WOULD HAVE DESTROYED EVERY DEFINITION OF DONE. The comment
       four lines up is about the cue, and this line had the identical shape: `str('eNotes')` returns
       '' when the textarea is not rendered, so `|| null` would have written NULL over every "Done
       when" on the next save of that standard - the field Cory asked to hide, wiped by hiding it.
       Written only when the person can see and edit it, exactly as `eCue` and `eSection` are. */
    var notesIn = document.getElementById('eNotes');
    if(S.hasNotes && notesIn) rec.notes = str('eNotes')||null;
    /* HT-29 S2: the section Cory chose; written only when the field was shown.
       HT-31 S1.6: the field is always shown now, so when the COLUMN is absent the choice goes to the
       device instead of nowhere - `rec.section` is still never sent to a column that does not exist. */
    if(document.getElementById('eSection')){
      var secPick = str('eSection') || null;
      if(S.hasSection) rec.section = secPick;
      else if(secPick && window.__HT31SEC){
        /* a NEW row has no id until the insert returns, so the pick waits by NAME and is claimed
           by the row that comes back on the next paint - never by a row that already has one */
        if(isNew) window.__HT31SEC.pendingNew(rec.name, secPick);
        else window.__HT31SEC.place(h.id, secPick);
      }
    }
    /* S2: one minutes box now. It writes BOTH `minutes` (what committed()/remaining() read)
       and `minutes_planned` (what planOf() prefers), so the two can never drift apart — which is
       exactly what two separate inputs allowed. */
    if(S.hasTime){ rec.time_anchor = str('eAnchor')||null;
                   rec.minutes_planned = num('eMin') || null; }
    /* ---- HT-22 S1 · THE WINDOW IS WRITTEN FROM THE ANCHOR, IN THE SAME ACTION -------
       Same reasoning as S2's one minutes box writing both `minutes` and `minutes_planned`: two
       columns that mean one thing must never be able to disagree, and the only way to guarantee
       that is to give them ONE source and ONE moment. `planned_start` is the anchor; `planned_end`
       is the anchor plus the planned minutes. CLEARING THE ANCHOR CLEARS THE WINDOW WITH IT - a
       window with no start is a row that sorts by a time nobody set, and that is how a list
       reorders itself under him for no reason he can see. */
    if(S.hasWindow){
      var an = S.hasTime ? (str('eAnchor')||null) : (hhmm(h.time_anchor)||null);
      var mp = num('eMin') || 0;
      rec.planned_start = an;
      rec.planned_end   = an ? fmtClock(minsOf(an)+mp) : null;
    }
    var res;
    if(isNew){
      /* a new row goes to the foot of its OWN group, not the foot of the list */
      var peers=S.habits.filter(function(x){ return (x.group_name||'Other')===rec.group_name; });
      rec.sort_order = peers.length
        ? Math.max.apply(null,peers.map(function(x){ return x.sort_order||0; }))+1
        : S.habits.length;
      res = await sb.from('habits').insert(rec);
    } else {
      res = await sb.from('habits').update(rec).eq('id',h.id).eq('user_id',S.me.id);
    }
    if(res && res.error){ toast('not saved — '+String(res.error.message||'').slice(0,60)); return; }
    closeSheet(); toast(isNew?'standard added':'standard saved');
    await reload();
  }

  /* archive is `active=false` + `archived_at` — DEC-037: it leaves TODAY, it stays in every past day */
  async function archiveOne(h){
    /* HT-28 G21: a new person looks for "delete". The act is still the archive below - the row leaves the
       list and every day already logged keeps it (DEC-037) - and the question says exactly that. */
    if(!confirm('Delete "'+nameOf(h.name)+'" from your list? Days you already logged keep it.')) return;
    var res = await sb.from('habits')
      .update({ active:false, archived_at:new Date().toISOString() })
      .eq('id',h.id).eq('user_id',S.me.id);
    if(res && res.error){ toast('not archived — '+String(res.error.message||'').slice(0,60)); return; }
    closeSheet(); toast('deleted — logged days keep it');
    await reload();
  }
  async function reload(){ probed=false; await load(); await probe(); paintAll(); }
  /* HT-28: load() alone drops the probed columns (planned time, notes, window) until the next probe, so
     a row added elsewhere would render untimed. The later layers reload through this. */
  window.__HT11 = { reload: reload, probe: function(){ probed=false; return probe(); } };

  /* ---- 3 · the affordances: a pencil on hover (desktop), a long press (phone) ---- */
  function decorate(){
    var log=document.getElementById('log'); if(!log) return;
    q('.li',log).forEach(function(r){
      if(!r.querySelector('.edp')){
        var p=document.createElement('span');
        p.className='edp'; p.setAttribute('role','button');
        p.setAttribute('tabindex','0');           /* HT-16 R70.98: checkbox -> link -> edit */
        p.title='edit this standard'; p.textContent='✎';
        r.appendChild(p);
      }
      /* ---- HT-23 S2 . THE DRAG HANDLE, AND IT IS APPENDED LAST ON PURPOSE ----------------
         R70.98 fixed the row's tab order as checkbox -> link -> edit and `golden_ht16` S2
         asserts it exactly. A fourth control cannot be slipped in silently, so it goes at the
         END: the three keep their order and their positions and the handle joins after them.
         The golden is AMENDED BY NAME (R67.2), not loosened.
         It is focusable because the wire requires a keyboard fallback - a reorder that needs a
         pointer is a reorder some people cannot perform at all. */
      if(!r.querySelector('.drg')){
        var g=document.createElement('span');
        g.className='drg'; g.setAttribute('role','button'); g.setAttribute('tabindex','0');
        g.setAttribute('aria-label','reorder this standard');
        g.title='drag to reorder \u2014 or press \u2191 / \u2193 while it has focus';
        g.textContent='\u2261';
        r.appendChild(g);
      }
    });
    addFooters();
  }

  /* ---- 4 · "+ Add standard" at the foot of each group, pre-filled with that group (B4) ---- */
  function addFooters(){
    var log=document.getElementById('log'); if(!log) return;
    q('.eadd',log).forEach(function(n){ n.parentNode.removeChild(n); });
    var kids=Array.prototype.slice.call(log.children);
    var heads=kids.filter(function(k){ return k.classList.contains('grp'); });
    if(!heads.length){
      /* advanced / full sheet: no group headers, so one button at the foot of the list */
      if(kids.filter(function(k){ return k.classList.contains('li'); }).length) log.appendChild(mkAdd(null));
      return;
    }
    var cur=null;
    kids.forEach(function(k){
      if(!k.classList.contains('grp')) return;
      if(cur!==null) log.insertBefore(mkAdd(cur),k);
      cur=canonGroup(k.textContent) || String(k.textContent||'').trim();
    });
    if(cur!==null) log.appendChild(mkAdd(cur));
  }
  function mkAdd(group){
    var b=document.createElement('button');
    b.className='eadd'; b.type='button';
    b.setAttribute('data-add', group==null?'':group);
    b.textContent='+ Add standard'+(group?' to '+String(group).toLowerCase():'');
    return b;
  }

  /* ---- 5 · DRAG TO REORDER (B3) — within and across groups, persisted in sort_order ----
     One pointer handler for both surfaces. Desktop: a drag begins as soon as the pointer passes the
     slop. Touch: nothing happens until the 450 ms press has ARMED the row, so the page still scrolls
     normally — then a move drags, and a lift with no move opens the sheet. Crossing a group header
     is how a row changes group; that is the same gesture, and it is deliberate. */
  var st=null;                                    /* the live gesture, or null */
  var suppressClick=false;

  function midOf(n){ var r=n.getBoundingClientRect(); return r.top + r.height/2; }

  function beginDrag(){
    st.dragging=true;
    st.row.classList.add('dragging');
    var log=document.getElementById('log'); if(log) log.classList.add('reordering');
    try{ st.row.setPointerCapture(st.pid); }catch(e){}
  }

  /* HT-23 S2 · A HYSTERESIS DEAD ZONE WAS TRIED HERE AND REMOVED, and the removal is the honest
     part. It was added to fix the one-in-twenty landing defect `golden_ht23` S2e reports; it did
     not fix it, and code added to fix something that it does not fix is worse in a drag path than
     no code at all - the next reader would take it for a working countermeasure.
     HT-26 S3 · THE ROOT CAUSE, MEASURED (80 instrumented drags): the "defect" was never in this
     function. Every failing drag released inside the 64px auto-scroll band (EDGE, below), where
     autoScrollStep() keeps scrolling the list and calling moveDrag(lastY) while the finger is held
     still - so the order on screen legitimately changes between "the finger stopped" and "the
     finger lifted". The drop always kept the order at release. The test now releases outside the
     band and asserts the band's own contract separately (golden_ht23 S2e1/S2e2). */
  function moveDrag(y){
    var log=document.getElementById('log'); if(!log) return;
    var others=q('.li',log).filter(function(n){ return n!==st.row; });
    var before=null;
    for(var i=0;i<others.length;i++){ if(y < midOf(others[i])){ before=others[i]; break; } }
    if(before){
      /* a row lands ABOVE a group header only when the pointer is genuinely above it */
      var prev=before.previousElementSibling;
      if(prev && prev.classList && prev.classList.contains('grp') && y > midOf(prev)) before=prev.nextSibling;
      if(before!==st.row && before!==st.row.nextSibling) log.insertBefore(st.row,before);
    } else {
      var last=others[others.length-1];
      if(last && last!==st.row){
        var after=last.nextSibling;
        while(after && after.classList && after.classList.contains('eadd')) after=after.nextSibling;
        if(after!==st.row) log.insertBefore(st.row,after);
      }
    }
  }

  /* the row is passed in: `st` is already cleared by the time the drop is committed */
  async function endDrag(row){
    var log=document.getElementById('log');
    if(row) row.classList.remove('dragging');
    if(log) log.classList.remove('reordering');
    if(!log) return;
    var order=0, cur=null, sec=null, ops=[], moved=0;
    Array.prototype.slice.call(log.children).forEach(function(k){
      if(k.classList.contains('grp')){ cur=canonGroup(k.textContent); sec=k.getAttribute('data-sec'); return; }
      if(!k.classList.contains('li')) return;
      var hid=k.getAttribute('data-h'), h=hby(hid); if(!h) return;
      var so=order++;
      var grp=(cur==null)?null:cur;
      var chg={};
      if(h.sort_order!==so) chg.sort_order=so;
      if(grp!==null && (h.group_name||'')!==grp) chg.group_name=grp;
      /* HT-29 S2: a drag across a section's header moves the standard into that section (Ruling 3).
         HT-31 S1.6: without the column the move is kept on the device instead of being dropped. */
      if(sec && HT29SEC.sectionOf(h)!==sec){
        if(S.hasSection) chg.section=sec;
        else if(window.__HT31SEC){ window.__HT31SEC.place(h.id, sec); }
      }
      if(!Object.keys(chg).length) return;
      h.sort_order=so; if(chg.group_name!==undefined) h.group_name=grp;
      if(chg.section!==undefined) h.section=chg.section;
      moved++;
      ops.push(sb.from('habits').update(chg).eq('id',hid).eq('user_id',S.me.id));
    });
    if(!moved){ paintLog(); return; }
    var res = await Promise.all(ops);
    var bad = res.filter(function(r){ return r && r.error; });
    toast(bad.length ? (bad.length+' row'+(bad.length>1?'s':'')+' did not save')
                     : ('order saved · '+moved+' row'+(moved>1?'s':'')));
    paintLog();
  }

  function cancelPress(){ if(st && st.timer){ clearTimeout(st.timer); st.timer=null; } }


  /* ---- HT-23 S2 . AUTO-SCROLL NEAR THE EDGES --------------------------------------------
     A list longer than the screen cannot be reordered end to end without it: the row reaches
     the edge and there is nowhere left to drag to. One rAF loop, started when a drag begins
     and stopped when it ends, so nothing runs while nothing is dragging. */
  var EDGE=64, MAXV=18, autoRaf=null, lastY=0;
  function autoScrollStep(){
    if(!st || !st.dragging){ autoRaf=null; return; }
    var h=window.innerHeight, v=0;
    if(lastY < EDGE)        v = -MAXV * (1 - lastY/EDGE);
    else if(lastY > h-EDGE) v =  MAXV * (1 - (h-lastY)/EDGE);
    if(v){ window.scrollBy(0, v); moveDrag(lastY); }
    autoRaf=requestAnimationFrame(autoScrollStep);
  }

  function onDown(e){
    if(e.button!=null && e.button!==0) return;
    if(e.target.closest('.eadd')) return;
    if(e.target.closest('.edp')) return;                      /* the pencil is a click, not a drag */
    var row=e.target.closest('.li'); if(!row) return;
    var touch=(e.pointerType==='touch'||e.pointerType==='pen');
    var handle=e.target.closest('.drg');
    st={ row:row, hid:row.getAttribute('data-h'), x:e.clientX, y:e.clientY, pid:e.pointerId,
         touch:touch, armed:!touch, dragging:false, timer:null, fromHandle:!!handle };
    /* ---- THE FIX, AND IT IS ABOUT WHEN, NOT WHAT (S2.0) --------------------------------
       The old path armed a touch after 450 ms and only THEN added `.reordering`, whose
       `touch-action:none` the browser had already stopped listening for: iOS reads
       `touch-action` when the gesture BEGINS. By then the touch was committed to page
       scrolling and the moves arrived late or not at all. A mouse never shows you this,
       which is exactly why it passed on the laptop for four wires.
       The handle carries `touch-action:none` IN THE STYLESHEET, permanently, so the browser
       has the answer before the finger lands. A press on it is a drag from frame 0 - no
       long-press wait on any pointer type - and the row itself stays scrollable, which is
       the trade-off app.css line 527 was protecting. */
    if(handle){
      st.armed=true;
      beginDrag();
      lastY=e.clientY;
      if(!autoRaf) autoRaf=requestAnimationFrame(autoScrollStep);
      e.preventDefault();
      return;
    }
    if(touch) st.timer=setTimeout(function(){
      if(!st) return;
      st.armed=true; st.row.classList.add('armed');
      try{ if(navigator.vibrate) navigator.vibrate(12); }catch(err){}
    },LONG_PRESS);
  }
  function onMove(e){
    if(!st) return;
    var d=Math.abs(e.clientY-st.y)+Math.abs(e.clientX-st.x);
    if(!st.armed){ if(d>10) cancelPress(); return; }           /* a scroll, not a press */
    if(!st.dragging){ if(d<=DRAG_SLOP) return; beginDrag(); }
    e.preventDefault();
    lastY=e.clientY;
    moveDrag(e.clientY);
  }
  function onUp(){
    if(!st) return;
    cancelPress();
    if(autoRaf){ cancelAnimationFrame(autoRaf); autoRaf=null; }
    /* ---- HT-23 S2 · ONE SETTLING PASS, AND IT IS LOAD-BEARING ---------------------------
       The last `pointermove` can arrive while the list is still reflowing from the insert it
       caused, so the order committed on release could differ from the order on screen when the
       finger left it. Running the same rule once against the settled layout closes that gap:
       WHAT YOU SEE MID-DRAG IS WHAT THE DROP KEEPS.
       This was nearly deleted as a no-op — and `golden_ht23` S2e went red the moment it was, on
       the twenty-drag stability check. It stays, with the reason it actually earns rather than
       the one it was first given. `moveDrag`'s own guard makes it free when nothing needs to
       move. */
    if(st.dragging) moveDrag(lastY);
    var s=st; st=null;
    s.row.classList.remove('armed');
    if(s.dragging){ suppressClick=true; endDrag(s.row); return; }
    if(s.touch && s.armed){                                    /* long press, no move: the sheet */
      suppressClick=true;
      var h=hby(s.hid); if(h) openSheet(h);
      return;
    }
    /* desktop press with no movement: leave it — the app's own click toggles the row */
  }

  /* ---- HT-23 S2 . THE KEYBOARD FALLBACK -------------------------------------------------
     The same reorder, without a pointer at all. Up/Down move the row one place and persist
     through the SAME `endDrag()` the drag uses, so there is one place that decides what an
     order means and one place that writes it. Focus is restored onto the moved row's handle
     after the repaint, or the second press would land on whatever took its place. */
  function nudge(row, dir){
    var log=document.getElementById('log'); if(!log||!row) return;
    var rows=q('.li',log), i=rows.indexOf(row);
    if(i<0) return;
    var j=i+dir; if(j<0||j>=rows.length) return;
    if(dir<0) log.insertBefore(row, rows[j]);
    else      log.insertBefore(row, rows[j].nextSibling);
    var hid=row.getAttribute('data-h');
    endDrag(row);
    setTimeout(function(){
      var again=document.querySelector('#log .li[data-h="'+hid+'"] .drg');
      if(again) again.focus();
    }, 120);
  }

  function bind(){
    var log=document.getElementById('log'); if(!log || log.dataset.ht11) return;
    log.dataset.ht11='1';
    log.addEventListener('keydown',function(e){
      var g=e.target.closest && e.target.closest('.drg'); if(!g) return;
      var row=g.closest('.li'); if(!row) return;
      if(e.key==='ArrowUp'||e.key==='ArrowDown'){
        e.preventDefault(); e.stopPropagation();
        nudge(row, e.key==='ArrowUp' ? -1 : 1);
      }
    });
    /* CAPTURE, so this runs BEFORE the app's own bubble listener on #log: the pencil, the add button
       and the tail of a drag must never reach toggle(). */
    log.addEventListener('click',function(e){
      var add=e.target.closest('.eadd');
      if(add){ e.stopPropagation(); e.preventDefault();
               var g=add.getAttribute('data-add'); openSheet(null,g||undefined); return; }
      if(e.target.closest('.edp')){ e.stopPropagation(); e.preventDefault();
               var r=e.target.closest('.li'), h=r&&hby(r.getAttribute('data-h'));
               if(h) openSheet(h); return; }
      if(suppressClick){ suppressClick=false; e.stopPropagation(); e.preventDefault(); }
    },true);
    log.addEventListener('pointerdown',onDown);
    window.addEventListener('pointermove',onMove,{passive:false});
    window.addEventListener('pointerup',onUp);
    window.addEventListener('pointercancel',function(){
      cancelPress();
      if(st&&st.row){ st.row.classList.remove('armed'); st.row.classList.remove('dragging'); }
      var log2=document.getElementById('log'); if(log2) log2.classList.remove('reordering');
      st=null;
    });
  }

  /* ---- 6 · the back-end editor moves behind Settings -> Advanced (B5 · R70.16) ----
     Hidden, never deleted: the nodes are collected into one wrapper and that wrapper carries the class
     the 9a stylesheet already hides in simple mode. Turn Advanced on and the whole table is back. */
  function tuckEditor(){
    var list=document.getElementById('edList'); if(!list) return;
    if(document.getElementById('beEditor')) return;
    var back=[], p=list.previousElementSibling;
    while(p){ back.unshift(p); if(p.classList.contains('sh')) break; p=p.previousElementSibling; }
    var nodes=back.concat([list]);
    var fwd=list.nextElementSibling;
    if(fwd && fwd.classList.contains('tools')) nodes.push(fwd);
    var host=nodes[0].parentNode;
    var wrap=document.createElement('div'); wrap.id='beEditor';
    host.insertBefore(wrap,nodes[0]);
    nodes.forEach(function(x){ wrap.appendChild(x); });
    if(!advanced()){
      wrap.classList.add('ht9a-off');
      var note=document.createElement('div');
      note.className='note'; note.id='beNote'; note.style.padding='14px 0 0';
      note.textContent='Standards are edited from the front screen now — press and hold a row on the '+
        'phone, or use the pencil on the desktop. The full table editor is still here, under Advanced.';
      host.insertBefore(note,wrap);
    }
  }

  /* ---- 7 · re-apply after every repaint, the way 9a and 10 do ---- */
  var _log=paintLog;
  paintLog=function(){ _log.apply(null,arguments); decorate(); bind(); };
  var _os=openSettings;
  openSettings=function(){ _os.apply(null,arguments); setTimeout(tuckEditor,80); };

  async function boot(){
    await probe();
    decorate(); bind();
    if(S.hasWindow||S.hasNotes) paintLog();      /* the merged columns are on the rows now */
  }
  if(document.readyState==='complete') setTimeout(boot,160);
  else window.addEventListener('load',function(){ setTimeout(boot,160); });
})();

/* ======================= HT-13 · VIEWS LAYER (PASTE 35 §2 · PASTE 32 §D 15–17) =======================
   The first wire since 9a that renders OUTPUT. Six views: the life graph, two month grids, trends,
   group adherence, three insights.

   WHY A NEW SURFACE AND NOT `.colR`. The old right column is hidden wholesale in simple mode and it
   holds every legacy instrument id — `life`, `cal`, `chart`, `dow`, `byMo`, `heat`, twenty more. Making
   it visible would render all of them and break the one invariant 9a bought: no hidden id in the visible
   tree. So `#vViews` is built OUTSIDE `.colR`, `.colR` stays hidden, and the allow-list gains exactly
   the six `#v…` ids this wire names and nothing else (R70.16 · smoke check 2).

   R70.17 — no output above an input. TODAY keeps the left column and stays the landing screen. Below
   1024px VIEWS is a SECOND TAB, so output never sits above the inputs; at 1024px and up it is the right
   column, beside them, never over them.

   Everything here reads S and recomputes from it. No new query, no new column beyond B1's `target_age`,
   and every number is derived from the same selectors TODAY already uses. */
(function(){
  var GRP_ORDER=['Morning','Afternoon','Night','Standards','Weekly','Other'];
  var DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var DOWFULL=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var LIFE_ESSAY='https://waitbutwhy.com/2014/05/life-weeks.html';
  var DEFAULT_TARGET=90;   /* HT-15 R70.68 raised this from 80; one default in the app, not two */

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function targetAge(){
    var t=S.priv0&&S.priv0.target_age;
    return (t==null||t==='')?DEFAULT_TARGET:+t;
  }
  function birth(){ var b=S.priv0&&S.priv0.birth_date; return b?new Date(b+'T12:00:00'):null; }
  /* completion colour: the app's own grade bands, so a day reads the same here as on the sheet */
  function gfill(p){ var g=grade(p); return g[1]==null?'var(--sunk)':'var(--g'+Math.max(1,g[1])+')'; }
  function pctOn(k){ var r=S.byDate[k]; return (r&&r.pct!=null&&loggedOn(k))?r.pct:null; }
  function loggedDates(){ return dates().filter(function(k){ return pctOn(k)!=null; }); }
  function meanOf(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }

  /* ---- the surface ------------------------------------------------------------------ */
  var VIEW_IDS=['vLife','vMonthC','vMonthR','vTrends','vGroups','vInsights'];
  function head(t,c,id){
    return '<div class="sh"><h2>'+t+'</h2><span class="ln"></span>'+
           '<span class="c"'+(id?' id="'+id+'"':'')+'>'+(c||'')+'</span></div>';
  }
  function build(){
    if(document.getElementById('vViews')) return document.getElementById('vViews');
    var grid=document.querySelector('.grid'); if(!grid) return null;
    var sec=document.createElement('section');
    sec.id='vViews'; sec.className='vViews';
    sec.innerHTML=
      head('The life','','vLifeC')+'<div class="pan flat" id="vLife"></div>'+
      '<div class="note vabout">The whole life, one cell at a time — after '+
        '<a href="'+LIFE_ESSAY+'" target="_blank" rel="noopener">Your Life in Weeks</a>.</div>'+
      head('Month · completion','','vMonthCC')+
      '<div class="vnav" id="vNav"></div><div class="cal" id="vMonthC"></div>'+
      head('Month · rating','same ramp, 1–10 scaled','vMonthRC')+'<div class="cal" id="vMonthR"></div>'+
      head('Trends','7-day rolling','vTrendsC')+
      '<div class="seg mini" id="vRange">'+
        '<button data-r="30" class="on">30</button><button data-r="90">90</button>'+
        '<button data-r="all">All</button></div>'+
      '<div class="pan flat"><svg id="vTrends" class="chart"></svg></div>'+
      head('Group adherence','','vGroupsC')+'<div class="cols" id="vGroups"></div>'+
      head('Insights','three','vInsightsC')+'<div id="vInsights"></div>';
    grid.appendChild(sec);
    return sec;
  }

  /* ---- B2 · THE LIFE GRAPH ----------------------------------------------------------
     Rows are years. Desktop one cell per DAY (365/row), phone one cell per WEEK (52/row), same data.
     Drawn as RUNS, not cells: a lived-but-unlogged stretch is one rect per row, and only logged days
     and today get their own. A per-day grid for 80 years is 29,200 nodes; this is ~80 plus one per
     logged day, and it renders identically. */
  function paintLife13(){
    var host=document.getElementById('vLife'); if(!host) return;
    var cap=document.getElementById('vLifeC');
    var b=birth(), tgt=targetAge();
    var perWeek = window.innerWidth < 1024;             /* phone: a cell is a week */
    var cols = perWeek ? 52 : 365;
    var logged=loggedDates();
    var mean=meanOf(logged.map(pctOn));

    if(!b){
      /* it does not guess. The logged days alone, and one sentence. */
      var n=logged.length;
      var W=Math.max(1,Math.min(n,cols)), Hh=Math.max(4,Math.ceil(n/W)*4);
      host.innerHTML='<svg class="lifeg" viewBox="0 0 '+(W*4)+' '+Hh+'" preserveAspectRatio="xMinYMin meet">'+
        logged.map(function(k,i){
          return '<rect x="'+(i%W*4)+'" y="'+(Math.floor(i/W)*4)+'" width="3" height="3" fill="'+
                 gfill(pctOn(k))+'"/>'; }).join('')+'</svg>'+
        '<div class="vempty">Add your birthdate in Settings to see the whole life.</div>';
      if(cap) cap.textContent=n+' day'+(n===1?'':'s')+' logged';
      return;
    }

    var now=new Date();
    var dayNo=Math.floor((now-b)/864e5)+1;               /* day 1 is the day of birth */
    var totalDays=Math.round(tgt*365.2425);
    var left=Math.max(0,totalDays-dayNo);
    var rows=tgt;
    var CW=perWeek?7:2, CH=perWeek?7:2, GAP=1;
    var W=cols*(CW+GAP), H=rows*(CH+GAP);
    var lg={}; logged.forEach(function(k){ lg[k]=pctOn(k); });

    var s='';
    for(var y=0;y<rows;y++){
      var startDay=Math.floor(y*365.2425)+1;             /* 1-based day-of-life at this row's start */
      var endDay=Math.floor((y+1)*365.2425);
      var rowY=y*(CH+GAP);
      /* the row's ground: future/unlived */
      s+='<rect x="0" y="'+rowY+'" width="'+(cols*(CW+GAP)-GAP)+'" height="'+CH+
         '" fill="var(--sunk)" opacity=".45"/>';
      /* the lived RUN on this row */
      var livedTo=Math.min(endDay,dayNo);
      if(livedTo>=startDay){
        var n0=livedTo-startDay+1;
        var wCells=perWeek?Math.ceil(n0/7):n0;
        var runW=Math.min(cols,wCells)*(CW+GAP)-GAP;
        if(runW>0) s+='<rect x="0" y="'+rowY+'" width="'+runW+'" height="'+CH+
                      '" fill="var(--rule2)"/>';
      }
    }
    /* the logged days, each in its own cell, coloured by completion */
    logged.forEach(function(k){
      var d=Math.floor((dnum(k)-b)/864e5)+1; if(d<1) return;
      var y=Math.floor((d-1)/365.2425);
      if(y>=rows) return;
      var within=d-Math.floor(y*365.2425)-1;
      var cx=perWeek?Math.floor(within/7):within;
      if(cx>=cols) cx=cols-1;
      s+='<rect x="'+(cx*(CW+GAP))+'" y="'+(y*(CH+GAP))+'" width="'+CW+'" height="'+CH+
         '" fill="'+gfill(lg[k])+'"/>';
    });
    /* today, outlined — the wire asks for the outline by name. Drawn LAST, over the grid overlay. */
    var todayRect='';
    var td=Math.floor((dnum(today())-b)/864e5)+1;
    var ty=Math.floor((td-1)/365.2425);
    if(ty<rows){
      var tw=td-Math.floor(ty*365.2425)-1;
      var tx=perWeek?Math.floor(tw/7):tw;
      todayRect='<rect class="tdy" x="'+(tx*(CW+GAP)-0.5)+'" y="'+(ty*(CH+GAP)-0.5)+'" width="'+(CW+1)+
         '" height="'+(CH+1)+'" fill="none" stroke="var(--ink)" stroke-width="1"/>';
    }
    /* THE CELL TEXTURE, and why it is a pattern and not 29,200 rects.
       Drawing each lived year as one run is what keeps this cheap — but a run has no cell edges, and
       measured on the phone the graph came out as 80 solid stripes. The whole claim of this view is
       "one cell at a time", so the texture is not decoration; it IS the view. One <pattern> of gap
       lines laid over the finished drawing restores every cell edge at any density, for two nodes. */
    var CELL=(CW+GAP);
    var pat='<defs><pattern id="lifecell" width="'+CELL+'" height="'+CELL+
      '" patternUnits="userSpaceOnUse">'+
      '<rect x="'+CW+'" y="0" width="'+GAP+'" height="'+CELL+'" fill="var(--ground)"/>'+
      '<rect x="0" y="'+CH+'" width="'+CELL+'" height="'+GAP+'" fill="var(--ground)"/>'+
      '</pattern></defs>';
    host.innerHTML='<svg class="lifeg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMinYMin meet">'+
      pat+s+
      '<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="url(#lifecell)" pointer-events="none"/>'+
      todayRect+'</svg>';
    if(cap) cap.textContent =
      'Day '+dayNo.toLocaleString()+' of ~'+totalDays.toLocaleString()+
      ' · ~'+left.toLocaleString()+' days left at '+tgt+
      ' · '+logged.length+' days logged'+
      (mean==null?'':' · '+Math.round(mean)+'% mean completion');
  }

  /* ---- B3 · THE TWO GRIDS · one ramp for both --------------------------------------- */
  function monthGrid(id,mode){
    var host=document.getElementById(id); if(!host) return;
    var ym=S.vYM||(S.vYM=[dnum(today()).getFullYear(),dnum(today()).getMonth()]);
    var y=ym[0], m=ym[1];
    var first=new Date(y,m,1), start=new Date(first);
    start.setDate(1-((first.getDay()+6)%7));                /* Monday-led, like the app's own grid */
    var h=DOW.map(function(d){ return '<div class="hd">'+d.slice(0,2)+'</div>'; }).join('');
    for(var i=0;i<42;i++){
      var d=new Date(start); d.setDate(start.getDate()+i);
      var k=dk(d), out=(d.getMonth()!==m), fut=(k>today());
      var v,f,txt='';
      if(mode==='rate'){
        /* a day RATED but not logged still colours here — the rating is its own input (R35.6) */
        v=ratingOf(k); f=(v==null?'var(--sunk)':dens(v*10)); if(v!=null) txt=v;
      } else {
        v=fut?null:pctOn(k); f=dens(v); if(v!=null) txt=v;
      }
      h+='<button class="d'+(out?' out':'')+(k===today()?' tdy':'')+'" data-vd="'+k+
         '" style="background:'+f+'"><b>'+d.getDate()+'</b>'+
         (txt===''?'':'<s>'+txt+'</s>')+'</button>';
    }
    host.innerHTML=h;
    var nav=document.getElementById('vNav');
    if(nav && id==='vMonthC')
      nav.innerHTML='<button class="mv" data-vm="-1">‹</button> '+MO[m]+' '+y+
                    ' <button class="mv" data-vm="1">›</button>';
    var cap=document.getElementById(id==='vMonthC'?'vMonthCC':'vMonthRC');
    if(cap){
      var days=[],i2;
      for(i2=1;i2<=31;i2++){ var dd=new Date(y,m,i2); if(dd.getMonth()!==m) break;
        days.push(dk(dd)); }
      if(mode==='rate'){
        var rs=days.map(ratingOf).filter(function(x){return x!=null;});
        cap.textContent = rs.length? rs.length+' rated · mean '+(meanOf(rs)).toFixed(1) : 'nothing rated';
      } else {
        var ps=days.map(pctOn).filter(function(x){return x!=null;});
        cap.textContent = ps.length? ps.length+' logged · mean '+Math.round(meanOf(ps))+'%' : 'nothing logged';
      }
    }
  }

  /* ---- B4 · TRENDS · two lines, one axis, and GAPS BREAK THE LINE -------------------
     A line drawn across a gap asserts a day that never happened. Each unbroken run is its own path. */
  function paintTrends(){
    var svg=document.getElementById('vTrends'); if(!svg) return;
    var range=S.vRange||'30';
    var all=dates();
    var N = range==='all' ? Math.max(14,(all.length?Math.floor((dnum(today())-dnum(all[0]))/864e5)+1:14))
                          : +range;
    /* a hidden surface measures 0 wide (the phone's Today tab), and fitSvg would floor it to its
       240 minimum and draw a chart nobody asked for at the wrong scale. Draw when it is visible. */
    if(!svg.getClientRects().length) return;
    var H=132, W=fitSvg('vTrends',H);
    if(W==null) return;                    /* B0.2 */
    var ks=[]; for(var i=N-1;i>=0;i--) ks.push(shift(today(),-i));
    var px=function(i){ return 26+i*(W-34)/Math.max(1,N-1); };
    var py=function(v){ return H-18-(v/100)*(H-32); };
    var s='';
    [0,50,100].forEach(function(v){
      s+='<line class="ax" x1="24" y1="'+py(v)+'" x2="'+(W-4)+'" y2="'+py(v)+'"/>'+
         '<text x="20" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
    /* series: 7-day rolling completion, and 7-day rolling rating x10 on the same 0-100 axis */
    function runs(valAt){
      var out=[], cur=[];
      ks.forEach(function(k,i){
        var v=valAt(k);
        if(v==null){ if(cur.length){ out.push(cur); cur=[]; } return; }
        cur.push([i,v]);
      });
      if(cur.length) out.push(cur);
      return out;
    }
    function draw(rs,cls){
      return rs.map(function(r){
        if(r.length===1) return '<circle class="'+cls+'-d" cx="'+px(r[0][0])+'" cy="'+py(r[0][1])+'" r="1.6"/>';
        return '<path class="'+cls+'" d="'+r.map(function(p,j){
          return (j?'L':'M')+px(p[0]).toFixed(1)+' '+py(p[1]).toFixed(1); }).join(' ')+'"/>';
      }).join('');
    }
    /* a rolling value exists only where the day itself is logged/rated — otherwise it is a gap */
    var cRuns=runs(function(k){ return pctOn(k)==null?null:rolling(7,k); });
    var rRuns=runs(function(k){ var v=ratingOf(k); if(v==null) return null;
                                var rr=rollRate(7,k); return rr==null?null:rr*10; });
    svg.innerHTML=s+draw(cRuns,'ln-c')+draw(rRuns,'ln-r');
    var cap=document.getElementById('vTrendsC');
    if(cap){
      var gaps=0, prev=null;
      ks.forEach(function(k){ var on=pctOn(k)!=null; if(prev===true&&!on) gaps++; prev=on; });
      cap.textContent='7-day rolling · completion + rating ×10 · '+
        (gaps? gaps+' gap'+(gaps>1?'s':'')+' break the line' : 'no gaps');
    }
  }

  /* ---- B5 · GROUP ADHERENCE -----------------------------------------------------------------
     THE BAR RENDERER IS GONE (HT-16 S5 · R70.97 · R70.79 · DEC-096). It drew one column per group
     into `#vGroups` for the selected calendar month. Its named replacement -- the scorecard, worst
     first, with the delta, the streak, the weakest habit, a 12-week sparkline and an on-time column
     -- lands in the same commit and renders into the same node. Two renderers for one number is how
     a surface starts disagreeing with itself, so there is only ever one. */
  function weekKey(k){ var d=dnum(k); d.setDate(d.getDate()-((d.getDay()+6)%7)); return dk(d); }

  /* ---- B6 · THREE INSIGHTS, each one line and one small chart -----------------------
     GATES ARE THE POINT. Below the gate the line names what is missing IN WORDS, with no number in
     it — an insight computed from nine days is noise with a decimal point, and this lane has already
     watched a capacity score mislead at n=13. ① reports ASSOCIATION: the copy says "goes with". */
  function insights(){
    var host=document.getElementById('vInsights'); if(!host) return;
    var logged=loggedDates();
    var nLogged=logged.length;
    var weeksSpanned=(function(){
      if(!logged.length) return 0;
      var w={}; logged.forEach(function(k){ w[weekKey(k)]=1; });
      return Object.keys(w).length;
    })();
    var out=[], dowMeans=null;

    /* ① RATING LIFT — mean rating on days a standard was done vs days it was not */
    if(nLogged<14){
      out.push(card('Rating lift',
        'Not enough logged days yet — this one needs a couple of weeks of days before it can say anything honest.',
        ''));
    } else {
      var rank=[];
      S.habits.forEach(function(h){
        var on=[], off=[];
        logged.forEach(function(k){
          var v=ratingOf(k); if(v==null) return;
          (doneOn(h,k)?on:off).push(v);
        });
        if(on.length<3||off.length<3) return;
        rank.push({ n:nameOf(h.name), lift:meanOf(on)-meanOf(off), on:on.length, off:off.length });
      });
      rank.sort(function(a,b){ return b.lift-a.lift; });
      if(!rank.length){
        out.push(card('Rating lift',
          'No standard has enough days both done and not done to compare yet.',''));
      } else {
        var top=rank[0];
        var bars=rank.slice(0,5);
        var mx=Math.max.apply(null,bars.map(function(r){ return Math.abs(r.lift); }))||1;
        out.push(card('Rating lift',
          '<b>Your one thing: '+esc(top.n)+' ('+(top.lift>=0?'+':'')+top.lift.toFixed(1)+')</b> — '+
          'rating goes with doing it, on '+top.on+' days done against '+top.off+' not. '+
          /* the wire forbids the word, and it is right to: "goes with" is the whole claim. Which way
             round it runs — or whether a third thing drives both — this cannot tell you. */
          '<i>Association only — it does not say which way round it runs.</i>',
          '<div class="vbars">'+bars.map(function(r){
            var w=Math.round(Math.abs(r.lift)/mx*100);
            return '<div class="vb"><span class="k">'+esc(r.n)+'</span>'+
              '<span class="t"><i style="width:'+w+'%;background:'+
              (r.lift>=0?'var(--accent)':'var(--rule2)')+'"></i></span>'+
              '<span class="v num">'+(r.lift>=0?'+':'')+r.lift.toFixed(1)+'</span></div>';
          }).join('')+'</div>'));
      }
    }

    /* ② WEEKDAY PROFILE — completion % and mean rating by weekday */
    if(weeksSpanned<4){
      out.push(card('Weekday profile',
        'Not enough weeks yet — a weekday needs to come round several times before its number means anything.',
        ''));
    } else {
      var pc=[[],[],[],[],[],[],[]], rt=[[],[],[],[],[],[],[]];
      logged.forEach(function(k){
        var i=(dnum(k).getDay()+6)%7;
        var p=pctOn(k); if(p!=null) pc[i].push(p);
        var v=ratingOf(k); if(v!=null) rt[i].push(v);
      });
      var means=pc.map(function(a){ return a.length?Math.round(meanOf(a)):null; });
      var worst=null;
      means.forEach(function(v,i){ if(v==null) return; if(worst==null||v<means[worst]) worst=i; });
      out.push(card('Weekday profile',
        worst==null?'Nothing to rank yet.':
          '<b>'+DOWFULL[worst]+'s break you ('+means[worst]+'%)</b> — your weakest weekday across '+
          weeksSpanned+' weeks.',
        '<div class="cols" id="vDow"></div>'));
      dowMeans=means;
    }

    /* ③ CONSISTENCY — coverage and momentum. No gate: both are honest at any n. */
    var elapsed=30, cov=0;
    for(var i=0;i<elapsed;i++){ if(pctOn(shift(today(),-i))!=null) cov++; }
    var r7=rolling(7), r30=rolling(30);
    var mom=(r7==null||r30==null)?null:(r7-r30);
    out.push(card('Consistency',
      '<b>Logged '+cov+' of '+elapsed+'</b>'+
      (mom==null?' · not enough to compare your 7-day with your 30-day yet'
               :' · 7-day is '+(mom>=0?'+':'')+mom+' over your 30-day'),
      '<div class="vmeter"><i style="width:'+Math.round(cov/elapsed*100)+'%"></i></div>'+
      '<div class="vsub">'+(r7==null?'—':r7+'% last 7')+' · '+(r30==null?'—':r30+'% last 30')+'</div>'));

    host.innerHTML=out.join('');
    if(dowMeans){
      colChart('vDow', dowMeans, DOW.map(function(d){ return d[0]; }), 100,
        function(x){ return x+'%'; }, dens);
    }
    var cap=document.getElementById('vInsightsC');
    if(cap) cap.textContent=nLogged+' logged day'+(nLogged===1?'':'s')+
      (nLogged<14?' · one gate still closed':'');
  }
  function card(t,line,chart){
    return '<div class="vins"><div class="lab">'+t+'</div>'+
           '<div class="vline">'+line+'</div>'+(chart||'')+'</div>';
  }

  /* ---- B1 · the two Settings fields ------------------------------------------------- */
  function settingsFields(){
    var b=document.getElementById('pBirth'); if(!b) return;
    if(document.getElementById('pTarget')) return;
    var host=b.closest('.fld'); if(!host) return;
    var lab=host.querySelector('.lab');
    if(lab) lab.textContent='Birthday · powers the life graph';
    var f=document.createElement('label');
    f.className='fld';
    f.innerHTML='<span class="lab">Target age · the life graph’s horizon</span>'+
      '<input id="pTarget" class="num" type="number" min="1" max="120" step="1" '+
      'value="'+(S.priv0&&S.priv0.target_age!=null?S.priv0.target_age:'')+'" '+
      'placeholder="'+DEFAULT_TARGET+'">';
    host.parentNode.insertBefore(f,host.nextSibling);
    if(!S.hasTargetAge){
      var n=document.createElement('div');
      n.className='note'; n.style.padding='6px 0 0';
      n.textContent='Target age needs one migration before it can be saved; the graph uses '+
        DEFAULT_TARGET+' until then.';
      f.parentNode.insertBefore(n,f.nextSibling);
      document.getElementById('pTarget').disabled=true;
    }
    var about=document.createElement('div');
    about.className='note'; about.id='vAbout'; about.style.padding='8px 0 0';
    about.innerHTML='<b>About this view</b> — the life graph is one cell per day of your life. '+
      'The idea is <a href="'+LIFE_ESSAY+'" target="_blank" rel="noopener">Your Life in Weeks</a>. '+
      'A link, not a copy.';
    f.parentNode.insertBefore(about, f.nextSibling);
  }

  /* ---- the tab switcher, below 1024px only ------------------------------------------ */
  function tabs(){
    if(document.getElementById('vTabs')) return;
    var mast=document.querySelector('.mast'); if(!mast) return;
    var t=document.createElement('div');
    t.className='seg vtabs'; t.id='vTabs';
    t.innerHTML='<button data-v="today" class="on">Today</button><button data-v="views">Views</button>';
    mast.parentNode.insertBefore(t,mast.nextSibling);
    t.addEventListener('click',function(e){
      var b=e.target.closest('[data-v]'); if(!b) return;
      show(b.getAttribute('data-v'));
    });
  }
  function show(which){
    S.vTab = which==='views'?'views':'today';
    document.documentElement.setAttribute('data-vtab',S.vTab);
    q('#vTabs button').forEach(function(b){
      b.classList.toggle('on', b.getAttribute('data-v')===S.vTab); });
    try{ localStorage.setItem('ht_vtab',S.vTab); }catch(e){}
    if(S.vTab==='views') repaint();
  }

  /* ---- wiring ----------------------------------------------------------------------- */
  function bind(){
    var sec=document.getElementById('vViews'); if(!sec || sec.dataset.bound) return;
    sec.dataset.bound='1';
    sec.addEventListener('click',function(e){
      var mv=e.target.closest('[data-vm]');
      if(mv){
        var d=+mv.getAttribute('data-vm');
        var ym=S.vYM||[dnum(today()).getFullYear(),dnum(today()).getMonth()];
        var m=ym[1]+d, y=ym[0];
        if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
        S.vYM=[y,m];
        monthGrid('vMonthC','pct'); monthGrid('vMonthR','rate'); paintGroups13();
        return;
      }
      var r=e.target.closest('[data-r]');
      if(r){
        S.vRange=r.getAttribute('data-r');
        q('#vRange button').forEach(function(b){ b.classList.toggle('on',b===r); });
        paintTrends(); return;
      }
      var d2=e.target.closest('[data-vd]');
      if(d2){ var k=d2.getAttribute('data-vd'); if(k<=today()){ goDay(k); show('today'); } }
    });
    var rT=null;
    window.addEventListener('resize',function(){
      clearTimeout(rT); rT=setTimeout(function(){
        if(!document.getElementById('vViews')) return;
        paintLife13(); paintTrends(); },200);
    });
  }

  function repaint(){
    if(!document.getElementById('vViews')) return;
    paintLife13();
    monthGrid('vMonthC','pct'); monthGrid('vMonthR','rate');
    paintTrends(); insights();          /* group adherence is HT-16's scorecard now */
  }
  window.__HT13_REPAINT=repaint;
  /* HT-15 needs this: clicking a dot on the month graph navigates TODAY, and on the phone the
     navigation is invisible unless the tab comes back with it. */
  window.__HT13_TAB=show;

  function boot(){
    if(advanced()) return;                 /* the full sheet already renders all of this */
    if(!S.me) return;                      /* signed out: nothing to draw */
    if(!build()) return;
    tabs(); bind();
    var saved='today';
    try{ saved=localStorage.getItem('ht_vtab')||'today'; }catch(e){}
    show(saved==='views'?'views':'today');
    repaint();
  }

  /* re-apply after the app repaints, the way 9a · 10 · 11 do */
  var _pa=paintAll;   paintAll   = function(){ _pa.apply(null,arguments); boot(); };
  var _os=openSettings; openSettings = function(){ _os.apply(null,arguments);
                                                   setTimeout(settingsFields,90); };
  if(document.readyState==='complete') setTimeout(boot,200);
  else window.addEventListener('load',function(){ setTimeout(boot,200); });
})();

/* ======================= HT-15 · VIEWS v2 (PASTE 42 §1–§2 · R70.67–R70.72) =======================
   Cory looked at HT-13's Views and cut most of them. Out of sight: the three insights, the trends line,
   both month grids, and the life view as built. In: a month LINE graph whose dots are clickable, a year
   graph of the same two series, and life-in-weeks across the bottom. And the journal moves to the top
   of TODAY, above the check-offs.

   NOTHING IS DELETED (R70.16). The six removed views keep their code, their data and their tests; they
   are hidden by the same `html[data-simple]` mechanism 9a established, so Settings -> Advanced brings
   all of it straight back and `golden_ht6` still reaches it. That is why the suite stays 17/17 in both
   modes, three wires running.

   THE FIFTH LAYER, inside the same sealed closure (9a · 10 · 11 · 13 · 15). It must run AFTER the
   earlier four: 9a's restructure() and 10's journalise() both assemble the journal, and reordering
   before them flips back on the next repaint. Guarded with data-ht15 and re-asserted from the same
   patched paints the earlier layers use. */
(function(){
  var DEFAULT_TARGET = 90;         /* R70.68 — HT-13 used 80; this wire supersedes it */
  var WEEKS_ESSAY = 'https://www.bryanbraun.com/your-life/weeks.html';
  var MSWEEK = 6048e5;

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function birth(){ var b=S.priv0&&S.priv0.birth_date; return b?new Date(b+'T12:00:00'):null; }
  function targetAge(){
    var t=S.priv0&&S.priv0.target_age;
    return (t==null||t==='')?DEFAULT_TARGET:+t;
  }
  function pctOn(k){ var r=S.byDate[k]; return (r&&r.pct!=null&&loggedOn(k))?r.pct:null; }
  function meanOf(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }
  function gfill(p){ var g=grade(p); return g[1]==null?'var(--sunk)':'var(--g'+Math.max(1,g[1])+')'; }
  function monthKeys(y,m){
    var out=[]; for(var i=1;i<=31;i++){ var d=new Date(y,m,i); if(d.getMonth()!==m) break; out.push(dk(d)); }
    return out;
  }
  function phone(){ return window.innerWidth < 1024; }

  /* ---- B3/B4 · ONE LINE-CHART RENDERER, two series, gaps break the line ----------------
     Month and year are the same chart over a different x domain, so they are one function. A gap is
     never interpolated: each unbroken run is its own <path>, because a line drawn across a missing day
     asserts a day that never happened. */
  function lineChart(svgId, pts, opts){
    var svg=document.getElementById(svgId); if(!svg) return;
    if(!svg.getClientRects().length) return;          /* hidden surface measures 0 wide */
    var H=opts.height||150, W=fitSvg(svgId,H);
    if(W==null) return 0;                  /* B0.2: lineChart returns a count */
    var L=26, R=30, T=12, B=22;                        /* room for BOTH axes and the x labels */
    var n=pts.length;
    var px=function(i){ return n<2 ? L+(W-L-R)/2 : L+i*(W-L-R)/(n-1); };
    var py=function(v){ return H-B-(v/100)*(H-T-B); };
    var s='';
    /* left axis 0-100 (completion) and right axis 0-10 (rating, in its own units) */
    [0,50,100].forEach(function(v){
      s+='<line class="ax" x1="'+L+'" y1="'+py(v)+'" x2="'+(W-R)+'" y2="'+py(v)+'"/>'+
         '<text x="'+(L-4)+'" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'+
         '<text class="ax2" x="'+(W-R+4)+'" y="'+(py(v)+3)+'">'+(v/10)+'</text>';
    });
    function runs(get){
      var out=[], cur=[];
      pts.forEach(function(p,i){ var v=get(p);
        if(v==null){ if(cur.length){ out.push(cur); cur=[]; } return; }
        cur.push([i,v]); });
      if(cur.length) out.push(cur);
      return out;
    }
    function draw(rs,cls){
      return rs.map(function(r){
        if(r.length===1) return '<circle class="'+cls+'-d" cx="'+px(r[0][0]).toFixed(1)+
                                '" cy="'+py(r[0][1]).toFixed(1)+'" r="1.8"/>';
        return '<path class="'+cls+'" d="'+r.map(function(p,j){
          return (j?'L':'M')+px(p[0]).toFixed(1)+' '+py(p[1]).toFixed(1); }).join(' ')+'"/>';
      }).join('');
    }
    s+=draw(runs(function(p){ return p.c; }),'ln-c');
    s+=draw(runs(function(p){ return p.r==null?null:p.r*10; }),'ln-r');
    /* the dots, and behind each a hit area no smaller than 24px: a 4px target on a phone is
       decoration, not a control (R70.69). */
    pts.forEach(function(p,i){
      if(p.c==null && p.r==null) return;
      var tip=(p.c==null?'—':Math.round(p.c)+'%')+' · '+(p.r==null?'—':p.r+'/10');
      var at=opts.attr+'="'+p.key+'"';
      if(p.c!=null) s+='<circle class="dot dot-c" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
                       '" cy="'+py(p.c).toFixed(1)+'" r="2.6"/>';
      if(p.r!=null) s+='<circle class="dot dot-r" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
                       '" cy="'+py(p.r*10).toFixed(1)+'" r="2.2"/>';
      s+='<circle class="hit" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
         '" cy="'+(H/2)+'" r="12"/>';
    });
    /* x labels: every label on the year chart, a readable subset on the month chart */
    pts.forEach(function(p,i){
      if(opts.everyLabel || i===0 || i===n-1 || (i+1)%5===0)
        s+='<text class="xl" x="'+px(i).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle">'+
           esc(p.x)+'</text>';
    });
    svg.innerHTML=s;
  }

  /* ---- B3 · THE MONTH GRAPH ------------------------------------------------------------ */
  function paintMonthGraph(){
    var ym=S.calYM||(S.calYM=[dnum(today()).getFullYear(),dnum(today()).getMonth()]);
    var y=ym[0], m=ym[1];
    var pts=monthKeys(y,m).map(function(k,i){
      return { x:String(i+1), key:k, c:pctOn(k), r:ratingOf(k) };
    });
    lineChart('vMonth', pts, { attr:'data-vgd', height:150 });
    var nav=document.getElementById('vMonthNav');
    if(nav) nav.innerHTML='<button class="mv" data-vgm="-1">‹</button>'+
      '<b>'+MO[m].toUpperCase()+' '+y+'</b>'+
      '<button class="mv" data-vgm="1">›</button>'+
      '<span class="lg"><i class="s-c"></i>completion<i class="s-r"></i>rating ×10</span>';
    var got=pts.filter(function(p){ return p.c!=null; }).length;
    var tip=document.getElementById('vMonthTip');
    if(tip) tip.textContent = got? got+' logged this month · tap a dot to go to that day'
                                 : 'nothing logged this month yet';
  }

  /* ---- B4 · THE YEAR GRAPH · clicking a month drills into the month graph -------------- */
  function paintYearGraph(){
    var yr=S.vYear||(S.vYear=dnum(today()).getFullYear());
    var pts=[];
    for(var m=0;m<12;m++){
      var ks=monthKeys(yr,m);
      var cs=ks.map(pctOn).filter(function(v){ return v!=null; });
      var rs=ks.map(ratingOf).filter(function(v){ return v!=null; });
      /* a month with no logged day is a GAP, not a zero — a zero would read as a month of failure */
      pts.push({ x:MO[m][0], key:String(m),
                 c: cs.length? Math.round(meanOf(cs)) : null,
                 r: rs.length? Math.round(meanOf(rs)*10)/10 : null });
    }
    lineChart('vYear', pts, { attr:'data-vgy', height:150, everyLabel:true });
    var nav=document.getElementById('vYearNav');
    if(nav) nav.innerHTML='<button class="mv" data-vgyn="-1">‹</button><b>'+yr+'</b>'+
      '<button class="mv" data-vgyn="1">›</button>'+
      '<span class="lg">tap a month to open it below</span>';
    var got=pts.filter(function(p){ return p.c!=null; }).length;
    var tip=document.getElementById('vYearTip');
    if(tip) tip.textContent=got+' of 12 months logged';
  }

  /* ---- B5 · LIFE IN WEEKS · full width, the bottom of the whole app -------------------
     Our own markup and our own skin. The concept is the well-known "your life in weeks" chart and it
     is CREDITED AND LINKED in Settings -> About; nothing is copied from it — not a stylesheet, not a
     snippet, not an asset.
     ~4,700 cells, drawn the way HT-13 learned to: one run per year plus one <pattern> for the cell
     edges. A run alone has no edges and renders as solid stripes; the texture IS the chart. */
  function paintWeeks(){
    var host=document.getElementById('vWeeks'); if(!host) return;
    var cap=document.getElementById('vWeeksC');
    var b=birth(), tgt=targetAge();
    var GAP=1, cols=52;
    var logged=dates().filter(function(k){ return pctOn(k)!=null; });

    if(!b){
      /* it does not guess: the logged weeks only, and one sentence with no number in it */
      var wk={};
      logged.forEach(function(k){ var m=weekMon(k); (wk[m]=wk[m]||[]).push(pctOn(k)); });
      var keys=Object.keys(wk).sort();
      var C=9, W0=Math.max(1,keys.length)*(C+GAP);
      host.innerHTML='<div class="wkscroll"><svg class="wkg" width="'+W0+'" height="'+(C+GAP)+
        '" viewBox="0 0 '+W0+' '+(C+GAP)+'">'+
        keys.map(function(m,i){
          return '<rect x="'+(i*(C+GAP))+'" y="0" width="'+C+'" height="'+C+'" fill="'+
                 gfill(meanOf(wk[m]))+'"/>'; }).join('')+'</svg></div>'+
        '<div class="vempty">Add your birthdate in Settings to see the whole life.</div>';
      if(cap) cap.textContent='the weeks you have logged';
      return;
    }

    var rows=tgt;
    var LEFT=24, TOP=14;
    var born=b;
    var bornMon=new Date(born); bornMon.setDate(bornMon.getDate()-((bornMon.getDay()+6)%7));
    var nowWeeks=Math.floor((new Date()-bornMon)/MSWEEK);
    var totalWeeks=rows*cols;
    var left=Math.max(0,totalWeeks-nowWeeks);
    /* mean completion for each week of life that carries a logged day */
    var byWeek={};
    logged.forEach(function(k){
      var wi=Math.floor((dnum(k)-bornMon)/MSWEEK);
      if(wi<0) return; (byWeek[wi]=byWeek[wi]||[]).push(pctOn(k));
    });

    function render(cell){
      var W=LEFT+cols*(cell+GAP), H=TOP+rows*(cell+GAP);
      var s='<text class="wl" x="'+LEFT+'" y="'+(TOP-5)+'">weeks →</text>';
      for(var r=0;r<rows;r++){
        var yy=TOP+r*(cell+GAP);
        s+='<rect x="'+LEFT+'" y="'+yy+'" width="'+(cols*(cell+GAP)-GAP)+'" height="'+cell+
           '" fill="var(--sunk)" opacity=".45"/>';
        var start=r*cols, end=start+cols-1;
        var livedTo=Math.min(end,nowWeeks);
        if(livedTo>=start){
          var w=(livedTo-start+1)*(cell+GAP)-GAP;
          if(w>0) s+='<rect x="'+LEFT+'" y="'+yy+'" width="'+w+'" height="'+cell+
                     '" fill="var(--rule2)"/>';
        }
        if(r>0 && r%10===0)
          s+='<text class="wl" x="'+(LEFT-5)+'" y="'+(yy+cell)+'" text-anchor="end">'+r+'</text>';
      }
      /* the logged weeks, coloured by that week's mean completion */
      Object.keys(byWeek).forEach(function(wi){
        var i=+wi, r=Math.floor(i/cols), c=i%cols;
        if(r>=rows) return;
        s+='<rect class="lw" x="'+(LEFT+c*(cell+GAP))+'" y="'+(TOP+r*(cell+GAP))+'" width="'+cell+
           '" height="'+cell+'" fill="'+gfill(meanOf(byWeek[wi]))+'"/>';
      });
      /* the cell texture, then the current week outlined on top of it */
      var P=cell+GAP;
      var pat='<defs><pattern id="wkcell" width="'+P+'" height="'+P+'" patternUnits="userSpaceOnUse">'+
        '<rect x="'+cell+'" y="0" width="'+GAP+'" height="'+P+'" fill="var(--ground)"/>'+
        '<rect x="0" y="'+cell+'" width="'+P+'" height="'+GAP+'" fill="var(--ground)"/></pattern></defs>';
      var cur='';
      var cr=Math.floor(nowWeeks/cols), cc=nowWeeks%cols;
      if(cr<rows) cur='<rect class="cw" x="'+(LEFT+cc*(cell+GAP)-0.5)+'" y="'+(TOP+cr*(cell+GAP)-0.5)+
        '" width="'+(cell+1)+'" height="'+(cell+1)+'" fill="none" stroke="var(--ink)" stroke-width="1"/>';
      return { svg:pat+s+'<rect x="'+LEFT+'" y="'+TOP+'" width="'+(cols*(cell+GAP))+'" height="'+
                 (rows*(cell+GAP))+'" fill="url(#wkcell)" pointer-events="none"/>'+cur,
               W:W, H:H };
    }

    var cell = phone()? 9 : 12;
    var cc=nowWeeks%cols;                       /* the current week's column, for the scroll below */
    var o=render(cell);
    /* phone: a FIXED cell size in a horizontal scroller — never squeezed to illegibility.
       desktop: the same drawing, scaled to the width it has. */
    host.innerHTML='<div class="wkscroll'+(phone()?'':' fit')+'">'+
      '<svg class="wkg" viewBox="0 0 '+o.W+' '+o.H+'"'+
      (phone()? ' width="'+o.W+'" height="'+o.H+'"' : ' preserveAspectRatio="xMinYMin meet"')+
      '>'+o.svg+'</svg></div>';
    if(cap) cap.textContent='Week '+nowWeeks.toLocaleString()+' of ~'+totalWeeks.toLocaleString()+
      ' · '+left.toLocaleString()+' weeks left at '+tgt+' · '+logged.length+' days logged';
    /* SCROLL THE CURRENT WEEK INTO VIEW, and it is not a nicety.
       MEASURED on the phone: the grid is a fixed-cell horizontal scroller (R70.68 — never squeezed),
       the current week sits at column 41 of 52, and the visible strip is ~34 columns wide. So the one
       cell the chart exists to show, and every logged week beside it, opened OFF SCREEN and the whole
       thing read as empty. Centre it on load instead. */
    var sc=host.querySelector('.wkscroll');
    if(sc && sc.scrollWidth>sc.clientWidth){
      var x=LEFT+cc*(cell+GAP);
      sc.scrollLeft=Math.max(0, x-sc.clientWidth/2);
    }
  }
  function weekMon(k){ var d=dnum(k); d.setDate(d.getDate()-((d.getDay()+6)%7)); return dk(d); }

  /* ---- build the two graphs into #vViews, and the weeks section full width ------------- */
  function build(){
    var views=document.getElementById('vViews');
    if(views && !document.getElementById('vMonth')){
      var wrap=document.createElement('div');
      wrap.id='vGraphs';
      wrap.innerHTML=
        '<div class="sh"><h2>The month</h2><span class="ln"></span>'+
          '<span class="c" id="vMonthTip"></span></div>'+
        '<div class="gnav" id="vMonthNav"></div>'+
        '<div class="pan flat"><svg id="vMonth" class="chart"></svg></div>'+
        '<div class="sh"><h2>The year</h2><span class="ln"></span>'+
          '<span class="c" id="vYearTip"></span></div>'+
        '<div class="gnav" id="vYearNav"></div>'+
        '<div class="pan flat"><svg id="vYear" class="chart"></svg></div>';
      views.insertBefore(wrap, views.firstChild);       /* the graphs lead the Views surface */
    }
    if(!document.getElementById('vWeeks')){
      var grid=document.querySelector('.grid'); if(!grid) return;
      var sec=document.createElement('section');
      sec.id='vWeeksSec'; sec.className='vWeeksSec';
      sec.innerHTML='<div class="sh"><h2>Life in weeks</h2><span class="ln"></span>'+
        '<span class="c" id="vWeeksC"></span></div><div id="vWeeks"></div>'+
        '<div class="note vabout">One square per week of your life — the idea is the well-known '+
        '<a href="'+WEEKS_ESSAY+'" target="_blank" rel="noopener">your life in weeks</a> chart. '+
        'Ours is drawn from scratch in this skin.</div>';
      grid.parentNode.insertBefore(sec, grid.nextSibling);   /* after BOTH columns, full width */
    }
  }

  /* ---- B2 · JOURNAL FIRST (R70.71) ----------------------------------------------------
     Idempotent, and re-asserted from the patched paints: 9a's restructure() and 10's journalise()
     both assemble this block, and moving it before they run would flip back on the next repaint. */
  function journalFirst(){
    if(advanced()) return;
    var jIn=document.getElementById('jIn'); if(!jIn) return;
    var dump=document.getElementById('iDump'); if(!dump) return;   /* layer 10 not up yet */
    var blk=dump.closest('.blk'); if(!blk) return;
    if(jIn.firstElementChild===blk) return;                        /* already first: nothing to do */
    jIn.insertBefore(blk, jIn.firstElementChild);
    /* CLOSE THE DAY stays the last child, and stays sticky — never fixed */
    var t=document.getElementById('tClose');
    if(t && jIn.lastElementChild!==t) jIn.appendChild(t);
    document.documentElement.setAttribute('data-ht15','1');
  }

  /* ---- Settings -> About gains the weeks credit ---------------------------------------- */
  function aboutCredit(){
    var a=document.getElementById('vAbout'); if(!a || a.dataset.ht15) return;
    a.dataset.ht15='1';
    var d=document.createElement('div');
    d.style.paddingTop='6px';
    d.innerHTML='<b>Life in weeks</b> — one square per week, birth year to your target age. '+
      'Inspired by <a href="'+WEEKS_ESSAY+'" target="_blank" rel="noopener">your life in weeks</a>; '+
      'our markup and our skin, nothing copied.';
    a.appendChild(d);
  }

  /* ---- wiring ------------------------------------------------------------------------- */
  function bind(){
    var views=document.getElementById('vViews');
    if(views && !views.dataset.ht15){
      views.dataset.ht15='1';
      views.addEventListener('click',function(e){
        var mn=e.target.closest('[data-vgm]');
        if(mn){ var d=+mn.getAttribute('data-vgm');
          var ym=S.calYM||[dnum(today()).getFullYear(),dnum(today()).getMonth()];
          var m=ym[1]+d, y=ym[0];
          if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
          S.calYM=[y,m]; paintMonthGraph(); return; }
        var yn=e.target.closest('[data-vgyn]');
        if(yn){ S.vYear=(S.vYear||dnum(today()).getFullYear())+(+yn.getAttribute('data-vgyn'));
          paintYearGraph(); return; }
        /* B4 drill-down: a month on the year graph opens that month below */
        var ym2=e.target.closest('[data-vgy]');
        if(ym2){ S.calYM=[S.vYear||dnum(today()).getFullYear(), +ym2.getAttribute('data-vgy')];
          paintMonthGraph();
          var t=document.getElementById('vMonthNav'); if(t) t.scrollIntoView({block:'center'});
          return; }
        /* B3: EVERY DOT IS CLICKABLE, and it navigates through the app's own day navigator */
        var d2=e.target.closest('[data-vgd]');
        if(d2){
          var k=d2.getAttribute('data-vgd');
          if(k>today()) return;
          goDay(k);                                  /* the same call the header's arrows make */
          if(phone() && window.__HT13_TAB) window.__HT13_TAB('today');
          return;
        }
      });
      /* the active-dot label: the raw values, in their own units (R70.72) */
      views.addEventListener('pointerover',function(e){
        var h=e.target.closest('[data-tip]'); if(!h) return;
        var svg=h.closest('svg'); if(!svg) return;
        var tip=document.getElementById(svg.id==='vYear'?'vYearTip':'vMonthTip');
        if(tip) tip.textContent=h.getAttribute('data-tip');
      });
    }
    /* THE TAB SWITCH HAS TO REPAINT THIS LAYER TOO, and it is worth saying why.
       `fitSvg` measures clientWidth, so a chart drawn while the Views tab is hidden measures 0 and
       draws nothing — MEASURED: monthDots 7 on desktop, 0 on the phone. HT-13 owns the tab and calls
       its own repaint, which knows nothing about HT-15. Rather than reach into HT-13, add a second
       listener on the same control: both fire, and this one redraws after layout has settled. */
    var tabs=document.getElementById('vTabs');
    if(tabs && !tabs.dataset.ht15){
      tabs.dataset.ht15='1';
      tabs.addEventListener('click',function(e){
        if(e.target.closest('[data-v]')) setTimeout(repaint,60);
      });
    }
    var rT=null;
    if(!window.__HT15_RESIZE){
      window.__HT15_RESIZE=1;
      window.addEventListener('resize',function(){
        clearTimeout(rT); rT=setTimeout(repaint,220);
      });
    }
  }

  function repaint(){
    if(advanced()) return;
    build();
    paintMonthGraph(); paintYearGraph(); paintWeeks();
  }

  function boot(){
    if(advanced()) return;
    if(!S.me) return;
    build(); journalFirst(); bind(); aboutCredit();
    repaint();
  }

  /* re-apply after the app repaints, exactly as the four layers before this one do */
  var _pa=paintAll;      paintAll      = function(){ _pa.apply(null,arguments); boot(); };
  var _pl=paintLog;      paintLog      = function(){ _pl.apply(null,arguments); journalFirst(); };
  var _pm=paintMast;     paintMast     = function(){ _pm.apply(null,arguments); journalFirst(); };
  var _pji=paintJournalInputs;
  paintJournalInputs = function(){ _pji.apply(null,arguments); journalFirst(); };
  var _os=openSettings;  openSettings  = function(){ _os.apply(null,arguments);
                                                     setTimeout(aboutCredit,140); };
  if(document.readyState==='complete') setTimeout(boot,260);
  else window.addEventListener('load',function(){ setTimeout(boot,260); });
})();

/* ======================= HT-16 · THEME · SQUARE · CHARTS · LIFE · SCORECARD · TIME =======================
   THE SIXTH LAYER, inside the same sealed closure (9a · 10 · 11 · 13 · 15). It runs AFTER all five:
   9a restructures, 11 decorates the rows, 13 owns the tab, 15 draws the three surfaces this layer
   re-draws. Appending after the closer would put every app function out of scope — measured, HT-9a.

   WHY IT RE-DRAWS RATHER THAN PATCHES. HT-15's painters are local to HT-15's own IIFE, so they are
   unreachable from here by name. This layer therefore owns the final drawing of `#vMonth`, `#vYear`
   and `#vWeeks`: the same nodes, the same attributes (`data-vgd` · `data-vgy` · `circle.hit` ·
   `rect.lw` · `rect.cw` · `text.wl`), so HT-15's click wiring and its golden both still hold, with
   HT-16's axes, labels, ramp and lived-from-birth fill on top.

   Every acceptance in this wire is a DATA golden, so every computation below is exposed on
   `window.__HT16` — the same seam `window.__HT13_REPAINT` and `window.__HT13_TAB` already are. */
(function(){
  var MSDAY = 864e5, MSWEEK = 6048e5;
  var TARGET_AGE = 100;          /* R70.95 — a constant, for everyone. The stored value is untouched. */
  var LIFE_ROWS = 100, LIFE_COLS = 52, LIFE_TOTAL = LIFE_ROWS * LIFE_COLS;   /* 5,200 */

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function phone(){ return window.innerWidth < 1024; }
  function pctOn(k){ var r=S.byDate[k]; return (r&&r.pct!=null&&loggedOn(k))?r.pct:null; }
  function meanOf(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }
  function birth(){ var b=S.priv0&&S.priv0.birth_date; return b?new Date(b+'T12:00:00'):null; }

  /* ---- S1 · THE RAMP ------------------------------------------------------------------------
     ONE ramp, and it is a band table, not a gradient: 0-24 · 25-49 · 50-74 · 75-89 · 90-100.
     `rampIx` is the whole rule; everything else reads it. `null` is UNLOGGED and gets `--surface` —
     never a ramp colour, because an unlogged day must not read as a bad day. */
  function rampIx(p){
    if(p==null) return null;
    if(p<25) return 0; if(p<50) return 1; if(p<75) return 2; if(p<90) return 3; return 4;
  }
  function rampClass(p){ var i=rampIx(p); return i==null?'ramp-none':('ramp-'+i); }
  function rampBg(p){ var i=rampIx(p); return i==null?'rampbg-none':('rampbg-'+i); }
  /* `--g1 … --g5` are mapped onto `--ramp-0 … --ramp-4` in theme.css, so an SVG `fill` written as a
     `--gN` token IS a ramp token. HT-15's golden reads that attribute, and it still reads true. */
  function rampFill(p){ var i=rampIx(p); return i==null?'var(--surface)':('var(--g'+(i+1)+')'); }
  function rampVar(p){ var i=rampIx(p); return i==null?'var(--surface)':('var(--ramp-'+i+')'); }
  function legend(){
    return '<span class="h16leg">'+[0,1,2,3,4].map(function(i){
      return '<i class="rampbg-'+i+'"></i>'; }).join('')+'</span>';
  }

  window.__HT16 = window.__HT16 || {};
  window.__HT16.rampIx = rampIx;
  window.__HT16.rampClass = rampClass;
  window.__HT16.rampFill = rampFill;
  window.__HT16.TARGET_AGE = TARGET_AGE;
  window.__HT16.LIFE_TOTAL = LIFE_TOTAL;

  /* ---- S2 · THE SQUARE (R70.100) --------------------------------------------------------
     One grid, twelve columns, one fixed row unit. The panels have to be DIRECT CHILDREN of `.grid`
     for a column-span to mean anything, and HT-13/HT-15 left them nested two deep inside `#vViews`.
     `display:contents` on the wrapper was the cheaper fix and it is the wrong one: `#vViews` also
     holds eleven hidden instruments and `#vNav`, and every one of them would auto-place itself into
     a column. So the five panels are MOVED, once, idempotently, and `#vViews` keeps everything
     R70.16 says must stay in the tree. */
  function panel(id, cls){
    var n=document.getElementById(id);
    if(!n){ n=document.createElement('div'); n.id=id; }
    n.className='h16p'+(cls?' '+cls:'');
    return n;
  }
  function squareLayout(){
    var grid=document.querySelector('.grid'); if(!grid) return false;
    var vMonth=document.getElementById('vMonth'), vYear=document.getElementById('vYear');
    if(!vMonth || !vYear) return false;                       /* HT-15 has not built yet */

    if(!document.getElementById('h16Month')){
      var pm=panel('h16Month');
      var nav=document.getElementById('vMonthNav');
      var head=nav && nav.previousElementSibling;             /* the .sh carrying #vMonthTip */
      if(head) pm.appendChild(head);
      if(nav) pm.appendChild(nav);
      pm.appendChild(vMonth.closest('.pan') || vMonth);
      grid.appendChild(pm);
    }
    if(!document.getElementById('h16Year')){
      var py=panel('h16Year');
      var ynav=document.getElementById('vYearNav');
      var yhead=ynav && ynav.previousElementSibling;
      if(yhead) py.appendChild(yhead);
      if(ynav) py.appendChild(ynav);
      py.appendChild(vYear.closest('.pan') || vYear);
      grid.appendChild(py);
    }
    if(!document.getElementById('h16Score')){
      var g=document.getElementById('vGroups');
      if(g){
        var ps=panel('h16Score');
        var gh=g.previousElementSibling;                      /* the .sh carrying #vGroupsC */
        if(gh) ps.appendChild(gh);
        ps.appendChild(g);
        grid.appendChild(ps);
      }
    }
    if(!document.getElementById('h16Ins')){
      var pi=panel('h16Ins');
      pi.innerHTML='<div class="sh"><h2>Life</h2><span class="ln"></span>'+
                   '<span class="c" id="h16InsC"></span></div><div id="h16InsBody"></div>';
      grid.appendChild(pi);
    }
    var wk=document.querySelector('.vWeeksSec');
    if(wk && wk.parentNode!==grid) grid.appendChild(wk);
    document.documentElement.setAttribute('data-ht16','1');
    return true;
  }

  /* the measured frame, for the receipt and for the golden */
  function metrics(){
    var app=document.querySelector('.app');
    var r=app?app.getBoundingClientRect():null;
    var row=q('#log .li').filter(function(r){ return r.querySelector('a.nm'); })[0]
            || document.querySelector('#log .li');
    var bx=row&&row.querySelector('.bxw'), ed=row&&row.querySelector('.edp');
    function box(n){ if(!n) return null; var b=n.getBoundingClientRect();
      return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}; }
    function hit(a,b){ if(!a||!b) return null;
      return !(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y); }
    var A=box(bx), B=box(ed);
    return { viewport:window.innerWidth,
             frame:r?Math.round(r.width):null,
             frameLeft:r?Math.round(r.left):null,
             frameRight:r?Math.round(window.innerWidth-r.right):null,
             centred:!!(r && Math.abs(r.left-(window.innerWidth-r.right))<=2),
             rootFont:parseFloat(getComputedStyle(document.documentElement).fontSize),
             checkbox:A, edit:B, intersect:hit(A,B),
             nameIsLink:!!(row && row.querySelector('a.nm')) };
  }
  window.__HT16.metrics = metrics;
  window.__HT16.squareLayout = squareLayout;

  /* ---- S2b · THE WIRING FOLLOWS THE PANELS ----------------------------------------------
     HT-15 delegates its chart clicks from `#vViews`. Moving the two graphs out of it into their own
     grid panels takes them out of that subtree, so the dots go dead — MEASURED, golden_ht15 6 and 7.
     The same four behaviours are re-bound here, on the panels themselves, using the app's own
     navigators: `goDay(k)` for a day, `S.calYM` for a month. No second copy of date state. */
  function bindPanels(){
    ['h16Month','h16Year'].forEach(function(id){
      var n=document.getElementById(id); if(!n || n.dataset.ht16) return;
      n.dataset.ht16='1';
      n.addEventListener('click',function(e){
        var mn=e.target.closest('[data-vgm]');
        if(mn){ var d=+mn.getAttribute('data-vgm');
          var ym=S.calYM||[dnum(today()).getFullYear(),dnum(today()).getMonth()];
          var m=ym[1]+d, y=ym[0];
          if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
          S.calYM=[y,m]; repaintCharts(); return; }            /* B0.3: charts, and only charts */
        var yn=e.target.closest('[data-vgyn]');
        if(yn){ S.vYear=(S.vYear||dnum(today()).getFullYear())+(+yn.getAttribute('data-vgyn'));
          repaintCharts(); return; }
        var ym2=e.target.closest('[data-vgy]');
        if(ym2){ S.calYM=[S.vYear||dnum(today()).getFullYear(), +ym2.getAttribute('data-vgy')];
          repaintCharts(); return; }
        var d2=e.target.closest('[data-vgd]');
        if(d2){ var k=d2.getAttribute('data-vgd');
          if(k>today()) return;
          goDay(k);
          if(phone() && window.__HT13_TAB) window.__HT13_TAB('today');
          return; }
      });
      n.addEventListener('pointerover',function(e){
        var h=e.target.closest('[data-tip]'); if(!h) return;
        var svg=h.closest('svg'); if(!svg) return;
        var tip=document.getElementById(svg.id==='vYear'?'vYearTip':'vMonthTip');
        if(tip) tip.textContent=h.getAttribute('data-tip');
      });
    });
    if(!window.__HT16_RESIZE){
      window.__HT16_RESIZE=1;
      var rT=null;
      window.addEventListener('resize',function(){ clearTimeout(rT); rT=setTimeout(repaint,240); });
    }
    var tabs=document.getElementById('vTabs');
    if(tabs && !tabs.dataset.ht16){
      tabs.dataset.ht16='1';
      tabs.addEventListener('click',function(e){
        if(e.target.closest('[data-v]')) setTimeout(repaint,80);
      });
    }
  }

  /* ---- S3 · THE TWO CHARTS (R70.94) -----------------------------------------------------
     Amends R70.69/R70.70. HT-15's painters are local to HT-15's IIFE and unreachable by name from
     here, so this layer owns the final drawing of `#vMonth` and `#vYear` -- the same nodes, the same
     `data-vgd` / `data-vgy` / `circle.hit` / `data-tip` contract, so HT-15's own golden still reads
     true, with HT-16's axes, per-day labels and ramp-coloured dots on top.

     ONE LABEL PER DAY, NEVER THINNED. A thinned axis is why a month chart cannot answer "which
     Tuesday did I drop", which is the only question it is for. The label is one <text> carrying two
     tspans -- the day number over the weekday -- so a per-day count is a count of labels, and at
     28px per day on a phone every one of them survives inside the chart's own scroller. The page
     never scrolls sideways; the chart does. */
  var DOW3=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var PHONE_DAY_PX = 28;

  function monthKeys(y,m){
    var out=[]; for(var i=1;i<=31;i++){ var d=new Date(y,m,i); if(d.getMonth()!==m) break; out.push(dk(d)); }
    return out;
  }
  function tipOf(c,r){
    return (c==null?'\u2014':Math.round(c)+'%')+' \u00b7 '+(r==null?'\u2014':r+'/10');
  }

  /* THE CHART FILLS ITS CELL (R70.100). A 196px chart anchored at the top of a 742px panel is a
     hole in the square with a picture in the corner of it. The panel's height comes from the grid,
     which is driven by the input column, so measuring it here cannot feed back into itself. */
  function availHeight(svg, dflt){
    var panel=svg.closest? svg.closest('.h16p') : null;
    if(!panel || !panel.clientHeight) return dflt;
    var used=0;
    Array.prototype.slice.call(panel.children).forEach(function(c){
      if(c.contains(svg)) return; used+=c.offsetHeight; });
    var h=panel.clientHeight-used-10;
    return Math.max(dflt, Math.min(620, Math.round(h)));
  }
  function h16Chart(svgId, pts, opts){
    var svg=document.getElementById(svgId); if(!svg) return 0;
    var host=svg.parentNode;
    /* HT-17 S2 (R70.140): NO RIGHT AXIS. Rating x10 reads off the LEFT axis and the legend says so,
       so the 34px right gutter that held it is reclaimed for the plot. R=10 is the half-dot bleed. */
    var H=opts.height||190, L=30, R=10, T=12, B=opts.twoLine?34:24;
    if(!(opts.perX && window.innerWidth<=480)) H=availHeight(svg,H);
    var n=pts.length, W;
    var narrow = opts.perX && window.innerWidth<=480;
    if(narrow){
      W = L + R + n*opts.perX;                               /* a full cell either end, so nothing clips */
      svg.setAttribute('viewBox','0 0 '+W+' '+H);
      svg.setAttribute('preserveAspectRatio','xMinYMin meet');
      svg.setAttribute('width',W); svg.setAttribute('height',H);
      svg.style.width=W+'px'; svg.style.height=H+'px';
      if(host) host.classList.add('h16scroll');
    } else {
      if(host) host.classList.remove('h16scroll');
      svg.removeAttribute('width'); svg.style.width='';
      if(!svg.getClientRects().length) return 0;             /* a hidden surface measures 0 wide */
      W = fitSvg(svgId,H);
      if(W==null) return 0;               /* B0.2: unmeasurable — measureAndDraw will call back */
    }
    var pad=opts.pad||0;
    /* rotated day labels need a taller bottom band than two stacked tspans do */
    if(opts.twoLine){
      var st = n>1 ? (W-L-R-2*pad)/(n-1) : (W-L-R);
      /* 52, not 40. MEASURED: at B=40 the rotated string "31 Wed" ran past the bottom of the viewBox
         and the DAY NUMBER was clipped off — the labels rendered as "Tue Wed Thu" with no dates, and
         the golden did not catch it because it counted labels rather than reading them. S2 asks for
         day number AND weekday, so the band is sized to the longest string it has to hold. */
      if(st < 40) B = 52;
    }
    var px=function(i){ return n<2 ? L+(W-L-R)/2 : L+pad+i*(W-L-R-2*pad)/(n-1); };
    var py=function(v){ return H-B-(v/100)*(H-T-B); };
    var s='';
    /* LEFT 0-100 in tens, a gridline every ten. THE RIGHT AXIS IS DELETED (R70.140 · R70.79):
       two axes for two series invited the reading that the dashed line was a percentage. It is not —
       it is a 1-10 rating, and the legend now carries `rating x10` instead.
       LABEL DENSITY IS MEASURED, NOT FIXED: every 10 when the chart has >=180px to give them, every
       20 below that. Eleven labels in an 84px band is a grey smear, not an axis. */
    var labelStep = H >= 180 ? 10 : 20;
    for(var v=0; v<=100; v+=10){
      s+='<line class="ax'+(v===0?' ax0':'')+'" x1="'+L+'" y1="'+py(v).toFixed(1)+'" x2="'+(W-R)+
         '" y2="'+py(v).toFixed(1)+'"/>';
      if(v%labelStep===0)
        s+='<text class="ayl" x="'+(L-5)+'" y="'+(py(v)+3).toFixed(1)+'" text-anchor="end">'+v+'</text>';
    }
    function runs(get){
      var out=[], cur=[];
      pts.forEach(function(p,i){ var val=get(p);
        if(val==null){ if(cur.length){ out.push(cur); cur=[]; } return; }
        cur.push([i,val]); });
      if(cur.length) out.push(cur);
      return out;
    }
    function draw(rs,cls){
      return rs.map(function(r){
        if(r.length===1) return '<circle class="'+cls+'-d" cx="'+px(r[0][0]).toFixed(1)+
                                '" cy="'+py(r[0][1]).toFixed(1)+'" r="2"/>';
        return '<path class="'+cls+'" d="'+r.map(function(pt,j){
          return (j?'L':'M')+px(pt[0]).toFixed(1)+' '+py(pt[1]).toFixed(1); }).join(' ')+'"/>';
      }).join('');
    }
    s+=draw(runs(function(p){ return p.c; }),'ln-c');
    s+=draw(runs(function(p){ return p.r==null?null:p.r*10; }),'ln-r');
    /* the dots, each behind a hit area no smaller than 24px: a 6px target on a phone is decoration.
       A COMPLETION DOT IS FILLED WITH THAT DAY'S RAMP COLOUR, so the line and the grade agree. */
    /* HT-18d (Cory note 6, "the completion dot needs to appear"). THE TARGETS GO FIRST.
       They were painted AFTER the dots — a 12px `circle.hit` and a full-height `rect.hitcol` laid
       straight over a 3.1px `circle.dot-c`. Transparent, so on a busy chart you never noticed; on
       a chart with one or two logged days the dot is the only mark on it and it was underneath
       both, which also swallowed its own hover. SVG has no z-index: paint order IS depth, so the
       hit shapes are emitted first and the dots land on top of them. */
    pts.forEach(function(p,i){
      if(p.c==null && p.r==null) return;
      /* B2 (R70.234): the hover carries the full date. It was "60% · 8/10" with no way to tell
         which day you were over — on a 30-point axis where only half the numbers render, that is
         the difference between a tooltip and a guess. */
      var tip=(p.full? p.full+' · ' : '')+tipOf(p.c,p.r), at=opts.attr+'="'+p.key+'"';
      var hw=Math.max(6, (n>1?(W-L-R-2*pad)/(n-1):24));
      s+='<rect class="hitcol" '+at+' data-tip="'+esc(tip)+'" x="'+(px(i)-hw/2).toFixed(1)+
         '" y="0" width="'+hw.toFixed(1)+'" height="'+H+'" fill="transparent"/>';
      s+='<circle class="hit" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
         '" cy="'+(H/2)+'" r="12"/>';
      if(p.c!=null) s+='<circle class="dot dot-c '+rampClass(p.c)+'" '+at+' data-tip="'+esc(tip)+
                       '" cx="'+px(i).toFixed(1)+'" cy="'+py(p.c).toFixed(1)+'" r="3.4"/>';
      if(p.r!=null) s+='<circle class="dot dot-r" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
                       '" cy="'+py(p.r*10).toFixed(1)+'" r="2.6"/>';
    });
    /* EVERY label, always — NEVER THINNED (R70.140). Two tspans in ONE <text>, so a per-day count
       counts days.
       ROTATED 90 DEGREES when the width per x-step is under 40px: at 31 days in a 400px panel each
       day gets ~12px, and "12 Fri" horizontal in 12px either overlaps its neighbours or gets dropped.
       Thinning is the tempting fix and it is the wrong one — the wire says every day stays labelled,
       so the labels turn instead. */
    var stepPx = n>1 ? (W-L-R-2*pad)/(n-1) : (W-L-R);
    /* HT-18c (Cory 2026-09-07 15:05): "Fix the x axis values to be better, i do not like them
       slanted like that. make them upright, fit them how you must."
       NOTHING IS ROTATED ANY MORE. R70.140 said every day stays labelled and turned them 90 degrees
       rather than thin them; the owner has now looked at that and rejected it, so the trade flips:
       UPRIGHT always, and when upright labels cannot all fit they are THINNED on a stride — with
       the first, the last and TODAY always kept, so the axis is never missing the day you are on.
       The weekday line is the first thing dropped, because "12" locates a day and "Fri" does not.
       AND THE LABELS ARE A CONTROL (his note 9): each carries the same `data-vgd` the dots do, so
       clicking a date goes to that day. */
    /* HT-18d (Cory note 5): the minimum comes from the WIDEST label this chart carries, not from
       one constant for every chart. At ~5.7px a glyph in the mono face, "Jan" wants 24px and "7"
       wants 12 — a single 15 crammed the YEAR into a smear and over-thinned the MONTH. */
    var maxChars = pts.reduce(function(m,p){ return Math.max(m, String(p.x==null?'':p.x).length); }, 1);
    /* SHRINK BEFORE THINNING. A constant 15px thinned the YEAR to 7 of 12 months, which is a worse
       axis than twelve small ones - twelve is the whole set and every one of them is a place you
       can click. So the type is sized to the space first (mono glyphs run ~0.6em wide, capped at
       9.5px and floored at 7), and the stride only comes into play once 7px still will not fit -
       which is the MONTH at 30 days in a narrow panel, and there thinning is the honest answer. */
    /* the 3px of breathing room is part of what a label costs, so it comes off the space
       BEFORE the type is sized — without it the year sized to 9.5px, then failed its own
       fit test by 3px and thinned to seven months anyway. */
    /* B2 (R70.234): "the label width is MEASURED, never assumed". The 0.62em-per-glyph estimate
       below is what kept the numbers strided at 15 of 30 - it makes a two-digit label 11.7px wide
       against an 11px column, when the rendered width at 7px is 8.7px and fits with room. One probe
       node, reused, tells the truth about this font at this size; the estimate stays as the
       fallback for a surface that will not measure. */
    var probeEl=null;
    function labWidth(txt, fontPx){
      try{
        if(!probeEl){
          probeEl=document.createElementNS('http://www.w3.org/2000/svg','text');
          probeEl.setAttribute('class','xl');
          probeEl.setAttribute('x','-999'); probeEl.setAttribute('y','-999');
          svg.appendChild(probeEl);
        }
        probeEl.setAttribute('font-size', fontPx);
        probeEl.textContent = String(txt);
        var w = probeEl.getComputedTextLength();
        if(w > 0) return w;
      }catch(e){}
      return String(txt).length * fontPx * 0.62;
    }
    var widest = pts.reduce(function(a,p){
      var t=String(p.x==null?'':p.x); return t.length>String(a).length ? t : a; }, '');
    var fontPx, stride;
    /* HT-18e (B): the floor was 7px and Cory's word for the result was "incredibly crunched and
       thin". 7px is not a size a number is read at - it is a size a number is counted at. The floor
       is 9 now and the stride carries the difference: fifteen dates you can read beat thirty you
       cannot. */
    /* 9 for a running scale like days-of-the-month, where the numbers interpolate and half of
       them still tell you where you are; 8 for a small FIXED set like the twelve months, where
       every label is a distinct place and dropping six of them loses half the axis. MEASURED:
       at a 251px panel the year affords 8.3px, so 8 shows all twelve and 9 shows six. */
    /* B1 narrows the chart panels at 1280 (243px), where twelve three-letter months want 7.3px.
       The floor for a small FIXED set drops to 7 so the set stays complete; it only ever binds on a
       small panel, because the type is sized by fit first — at 1920 the year renders at 8.5px. */
    /* B2 (R70.234) asks for EVERY day numbered. B1 widened the month chart from 277 to 392, and a
       two-digit number at 7px needs ~11.7px of column against the ~12.6px a 31-day month now gets -
       so all 31 fit, and the stride below stays only as the safety net for a panel that genuinely
       cannot hold them. 9 stays the floor for a chart with no second line to carry the rhythm. */
    var FLOOR = (n <= 12) ? 7 : (opts.twoLine ? 7 : 9);
    /* the largest size at which the WIDEST real label fits its own column, measured. */
    fontPx = FLOOR; stride = 1;
    var sz, wAtFloor = labWidth(widest, FLOOR);
    for(sz = 9.5; sz >= FLOOR; sz -= 0.5){
      if(labWidth(widest, sz) + 2 <= stepPx){ fontPx = sz; break; }
    }
    /* ---- HT-20 P3 · EVERY DAY GETS ITS NUMBER (R70.253) --------------------------------
       THE ARITHMETIC ALREADY REFUSED THE SINGLE ROW, and it is written into `data-axis`:
       at Cory's own 2133px window a 30-day month gives each label 10.97px of column and a
       two-digit number renders 9.51px wide, which needs 11.51px with its 2px of air. It does
       not fit at ANY supported width — 1280 gives 5.83px — so a smaller font was never the
       answer. STAGGERING ODD AND EVEN ONTO TWO ROWS DOUBLES THE EFFECTIVE STEP: 21.94px at
       2133, 20.90 at 1920, 11.66 at 1280, and the label needs 11.53. It fits at all three.

       ORDER OF REMEDY, applied only as far as needed and every step measured:
         1. stagger onto two rows      -> effective step x2
         2. shrink the label to a 9px floor
         3. drop the weekday letter     -> last resort, and first below 400px on the phone
       THINNING IS NOT AN OPTION at any supported width. `stride` survives only as the floor of
       last resort for a panel too narrow to hold the set even staggered — under 250px, where
       there is no honest layout — and the axis records which remedy it took. */
    var remedy = 'single';
    if(sz < FLOOR){
      fontPx = FLOOR;
      if(opts.twoLine && (wAtFloor + 2) <= stepPx * 2){
        remedy = 'stagger';                       /* 1 — every day keeps its number */
      } else {
        stride = Math.ceil((wAtFloor + 2) / Math.max(1, stepPx * (opts.twoLine ? 2 : 1)));
        remedy = opts.twoLine ? 'stagger+stride' : 'stride';
      }
    }
    if(probeEl && probeEl.parentNode) probeEl.parentNode.removeChild(probeEl);
    /* the axis states its own arithmetic. Invisible, three dozen bytes, and it is the difference
       between "the numbers are thinned" and "a 30 is 13.0px rendered against a 11.0px column, so
       thirty of them do not fit and fifteen do" - which is the claim a receipt has to be able to
       make (B2 asked for the width to be MEASURED; this is where the measurement is kept). */
    try{ svg.setAttribute('data-axis', 'n='+n+' step='+stepPx.toFixed(2)+
      ' label="'+widest+'" w@'+FLOOR+'='+wAtFloor.toFixed(2)+
      ' font='+fontPx+' stride='+stride+' remedy='+remedy+
      ' effstep='+(stepPx*(remedy.indexOf('stagger')===0?2:1)).toFixed(2)); }catch(e){}
    /* the two rounding steps used to disagree by a fraction of a pixel and thin the YEAR to seven
       months when twelve fitted; deciding the stride from `fitPx` directly removes the argument. */
    /* HT-18e (C, Cory note 3): "I want to see Monday through Sunday abbreviation somehow. And
       maybe we can add in thirty days as well." Both, on two lines doing different jobs: the NUMBER
       locates a date and is strided so it stays readable; the WEEKDAY is the rhythm of the week and
       is drawn for EVERY day, because one letter costs ~5px and even 8px a day affords that. Three
       letters where they fit, one where they do not - the rhythm survives either way. */
    var twoLine = !!opts.twoLine;
    var dowChars = stepPx >= 22 ? 3 : 1;
    var todayIx = -1;
    pts.forEach(function(p,i){ if(p.key===today()) todayIx=i; });
    /* TODAY is always kept, and the strided label beside it gives way rather than colliding —
       measured as one overlapping pair on the MONTH axis before this. */
    var kept = {};
    pts.forEach(function(p,i){
      if((stride===1) || (i%stride===0) || i===0 || i===n-1) kept[i]=1;
    });
    if(stride>1){
      /* the LAST label is kept unconditionally, so when the stride does not land on it the one
         before it collides — measured as the single remaining overlapping pair on the MONTH axis
         (28 against 29). Whichever label is kept for a reason other than the stride wins its space. */
      if((n-1) % stride !== 0) delete kept[n-2];
      if(todayIx>=0){ delete kept[todayIx-1]; delete kept[todayIx+1]; kept[todayIx]=1; }
      kept[0]=1; kept[n-1]=1;
    }
    /* HT-20 P3: two rows when the remedy is a stagger — EVEN indices on the lower row (which is
       where a single row already sat, so nothing moves for an axis that never needed this) and
       ODD indices 10px above it. The band is already 52px deep for the two-line form, so the
       upper row costs no height; the weekday letters keep their own line at H-6. */
    var yLo = H-(twoLine?18:8), yHi = yLo-10, stag = (remedy.indexOf('stagger')===0);
    pts.forEach(function(p,i){
      if(!kept[i]) return;
      var x=px(i).toFixed(1);
      var at = p.key!=null ? ' '+opts.attr+'="'+p.key+'"' : '';
      var y = (stag && (i%2)) ? yHi : yLo;
      s+='<text class="xl'+(stag?(i%2?' xl-hi':' xl-lo'):'')+(i===todayIx?' xl-today':'')+
         '" x="'+x+'" y="'+y+'" text-anchor="middle" font-size="'+fontPx+'"'+at+'>'+
         '<tspan x="'+x+'">'+esc(p.x)+'</tspan></text>';
    });
    /* ---- HT-19 B2 - THE DAY AXIS (R70.234) ---------------------------------------------
       Every day carries a weekday letter AND its number. The two lines do different jobs: the
       letter is the rhythm of the week, the number is the date you click. Saturdays are tinted
       because Saturday is the day the list becomes one box (B3), today is outlined, and the full
       date rides on the hover the dots already have.
       THE FORM IS CHOSEN BY MEASUREMENT, NOT BY A BREAKPOINT. `Mon` at >=1600 is what the wire
       asks for, but a wide window does not guarantee a wide PANEL - B1 just changed every panel
       width in the app. So the three-letter form is used when it actually fits the per-day column
       and the one-letter form when it does not; getComputedTextLength on a rendered probe is the
       measurement, and it is taken once per paint rather than per label. */
    if(twoLine) (function(){
      var col = n>1 ? (W-L-R-2*pad)/(n-1) : (W-L-R);
      var three = false;
      try{
        var probe=document.createElementNS('http://www.w3.org/2000/svg','text');
        probe.setAttribute('font-size','8'); probe.setAttribute('x','-999'); probe.setAttribute('y','-999');
        probe.setAttribute('class','xl2');
        probe.textContent='Mon';
        svg.appendChild(probe);
        three = probe.getComputedTextLength() + 2 <= col;
        svg.removeChild(probe);
      }catch(e){ three = col >= 22; }
      pts.forEach(function(p,i){
        if(!p.x2) return;
        var xx=px(i).toFixed(1);
        var at2 = p.key!=null ? ' '+opts.attr+'="'+p.key+'"' : '';
        var lab = three ? String(p.x2) : String(p.x2).charAt(0);
        var sat = /^sat/i.test(String(p.x2));
        s+='<text class="xl2'+(sat?' xl-sat':'')+(i===todayIx?' xl2-today':'')+'" x="'+xx+
           '" y="'+(H-6)+'" text-anchor="middle" font-size="8"'+at2+'>'+esc(lab)+'</text>';
      });
    })();
    svg.innerHTML=s;
    return pts.filter(function(p){ return p.c!=null||p.r!=null; }).length;
  }

  function monthPoints(){
    var ym=S.calYM||(S.calYM=[dnum(today()).getFullYear(),dnum(today()).getMonth()]);
    return monthKeys(ym[0],ym[1]).map(function(k,i){
      var d=dnum(k);
      return { x:String(i+1), x2:DOW3[d.getDay()], key:k, c:pctOn(k), r:ratingOf(k),
               /* B2: the full date, for the hover the dots already carry */
               full: DOW3[d.getDay()]+' '+MO[d.getMonth()]+' '+d.getDate() };
    });
  }
  function yearPoints(){
    var yr=S.vYear||(S.vYear=dnum(today()).getFullYear()), out=[];
    for(var m=0;m<12;m++){
      var ks=monthKeys(yr,m);
      var cs=ks.map(pctOn).filter(function(v){ return v!=null; });
      var rs=ks.map(ratingOf).filter(function(v){ return v!=null; });
      /* 0 LOGGED DAYS IS A GAP, NOT A ZERO. A zero reads as a month of total failure. */
      /* HT-17 S2: THREE-LETTER months. `J F M A M J J A S O N D` has three ambiguous pairs and
         reads as noise; `Jan Feb Mar` is the label. */
      out.push({ x:MO[m], x2:'', key:String(m),
                 c: cs.length? Math.round(meanOf(cs)) : null,
                 r: rs.length? Math.round(meanOf(rs)*10)/10 : null });
    }
    return out;
  }

  function paintMonth16(){
    var pts=monthPoints();
    /* B0.2: draw now if the panel is already measurable, and again after layout / fonts / resize */
    measureAndDraw('vMonth', function(){
      h16Chart('vMonth', monthPoints(),
               { attr:'data-vgd', height:196, twoLine:true, pad:4, perX:PHONE_DAY_PX }); });
    h16Chart('vMonth', pts, { attr:'data-vgd', height:196, twoLine:true, pad:4, perX:PHONE_DAY_PX });
    var ym=S.calYM, nav=document.getElementById('vMonthNav');
    if(nav) nav.innerHTML='<button class="mv" data-vgm="-1">\u2039</button>'+
      '<b>'+MO[ym[1]].toUpperCase()+' '+ym[0]+'</b>'+
      '<button class="mv" data-vgm="1">\u203a</button>'+legend();
    var got=pts.filter(function(p){ return p.c!=null; }).length;
    var tip=document.getElementById('vMonthTip');
    if(tip) tip.textContent = got? got+' logged' : 'nothing logged';
    return pts;
  }
  function paintYear16(){
    var pts=yearPoints();
    measureAndDraw('vYear', function(){
      h16Chart('vYear', yearPoints(), { attr:'data-vgy', height:196, twoLine:false, pad:2 }); });
    h16Chart('vYear', pts, { attr:'data-vgy', height:196, twoLine:false, pad:2 });
    var nav=document.getElementById('vYearNav');
    if(nav) nav.innerHTML='<button class="mv" data-vgyn="-1">\u2039</button>'+
      '<b>'+(S.vYear||dnum(today()).getFullYear())+'</b>'+
      '<button class="mv" data-vgyn="1">\u203a</button>'+legend();
    var got=pts.filter(function(p){ return p.c!=null; }).length;
    var tip=document.getElementById('vYearTip');
    if(tip) tip.textContent=got+' of 12 months logged';
    return pts;
  }
  window.__HT16.monthPoints = monthPoints;
  window.__HT16.yearPoints  = yearPoints;
  window.__HT16.tipOf       = tipOf;

  /* ---- S4 · LIFE IN WEEKS (R70.95 · R70.96) ---------------------------------------------
     TARGET AGE IS A CONSTANT: 100, for everyone. The setting leaves the simple view in S8; the
     stored value is untouched (R70.79 -- code retires via git, data never).

     THE ITEM-8 BUG, and what it was. The week index was measured from the MONDAY of the birth week
     and the lived run was drawn row by row against that -- but the ground rect for every row was
     painted first at 45% and the lived run only covered the rows it reached, so a life that has been
     lived for 1,900 weeks read as a handful of coloured squares in an empty field. LIVED is now an
     explicit fill of every week from 0 through today's index, --grey at 60%, and the golden counts
     the filled cells against `todayWeek + 1`.

     Week index is `floor((date - birthdate) / 7 days)`; week 0 IS the birth week -- anchored on the
     birthdate itself, not on a Monday, because "your 1,000th week" is measured from the day you were
     born and off-by-a-Monday is a whole week of someone's life.

     ~5,200 cells. Drawn as HT-13 learned to: one run per lived year plus one <pattern> of gap lines
     laid over the finished drawing, which restores every cell edge for two nodes. A run alone has no
     edges and renders as solid stripes -- that is exactly how the last life graph came out. */
  function weekIndex(k, b){
    if(!b) return null;
    var d = (typeof k==='string') ? dnum(k) : k;
    return Math.floor((d - b) / MSWEEK);
  }
  function loggedWeeks(b){
    var by={};
    dates().forEach(function(k){
      var v=pctOn(k); if(v==null) return;
      var wi=weekIndex(k,b); if(wi==null||wi<0) return;
      (by[wi]=by[wi]||[]).push(v);
    });
    return by;
  }
  function lifeFacts(){
    var b=birth();
    if(!b) return { birth:null };
    var now=weekIndex(new Date(), b);
    var by=loggedWeeks(b);
    var keys=Object.keys(by).map(Number).sort(function(x,y){ return x-y; });
    var means={}; keys.forEach(function(i){ means[i]=meanOf(by[i]); });
    var best=null;
    keys.forEach(function(i){ if(best==null||means[i]>means[best]) best=i; });
    /* the logging streak: consecutive weeks with at least one logged day, ending at the most
       recent logged week. A gap ends it; it is not forgiving, and it does not need to be. */
    var streak=0;
    if(keys.length){
      var w=keys[keys.length-1]; streak=1;
      while(by[w-1]!=null){ streak++; w--; }
    }
    var yr=new Date().getFullYear();
    var yrKeys=keys.filter(function(i){
      var d=new Date(b.getTime()+i*MSWEEK); return d.getFullYear()===yr; });
    return {
      birth: dk(b), week: now, total: LIFE_TOTAL,
      pctLived: Math.round(now/LIFE_TOTAL*1000)/10,
      left: Math.max(0, LIFE_TOTAL-now),
      loggedWeeks: keys.length,
      meanPct: keys.length? Math.round(meanOf(keys.map(function(i){ return means[i]; }))) : null,
      bestWeek: best, bestPct: best==null?null:Math.round(means[best]),
      streak: streak,
      yearLogged: yrKeys.length,
      yearMean: yrKeys.length? Math.round(meanOf(yrKeys.map(function(i){ return means[i]; }))) : null,
      thousandAge: (function(){
        if(keys.length>=1000) return null;
        if(!streak) return null;
        return Math.floor((now + (1000-keys.length))/52.1775);
      })()
    };
  }

  function paintInsights16(){
    var host=document.getElementById('h16InsBody'); if(!host) return;
    var cap=document.getElementById('h16InsC');
    var f=lifeFacts();
    if(!f.birth){
      host.innerHTML='<div class="h16ins">Add your birthdate in Settings to see the whole life.</div>';
      if(cap) cap.textContent='';
      return;
    }
    var n=function(x){ return x==null?'\u2014':x.toLocaleString(); };
    host.innerHTML=
      '<div class="h16ins">Week '+n(f.week)+' of '+n(f.total)+' \u00b7 '+f.pctLived+' % lived \u00b7 '+
        n(f.left)+' weeks left \u00b7 '+n(f.loggedWeeks)+' weeks logged \u00b7 mean '+
        (f.meanPct==null?'\u2014':f.meanPct)+' % \u00b7 best week W'+
        (f.bestWeek==null?'\u2014':f.bestWeek)+' ('+(f.bestPct==null?'\u2014':f.bestPct)+' %)'+
        ' \u00b7 logging streak '+f.streak+' wks</div>'+
      '<div class="h16ins h16ins2">this year: '+f.yearLogged+' of 52 logged \u00b7 mean '+
        (f.yearMean==null?'\u2014':f.yearMean)+' % \u00b7 '+
        (f.thousandAge==null
          ? 'a logging streak is what projects the 1,000th logged week; there is not one yet'
          : 'at your streak you reach 1,000 logged weeks at age '+f.thousandAge)+'</div>';
    if(cap) cap.innerHTML=legend();
  }

  function paintWeeks16(){
    var host=document.getElementById('vWeeks'); if(!host) return;
    var cap=document.getElementById('vWeeksC');
    var b=birth(), GAP=1, cols=LIFE_COLS, rows=LIFE_ROWS;

    if(!b){
      /* IT DOES NOT GUESS: the weeks it has, and one line saying what is missing. No number. */
      var wk={}, C=9;
      dates().forEach(function(k){ var v=pctOn(k); if(v==null) return;
        var d=dnum(k); d.setDate(d.getDate()-((d.getDay()+6)%7));
        (wk[dk(d)]=wk[dk(d)]||[]).push(v); });
      var keys=Object.keys(wk).sort();
      var W0=Math.max(1,keys.length)*(C+GAP);
      host.innerHTML='<div class="wkscroll"><svg class="wkg" width="'+W0+'" height="'+(C+GAP)+
        '" viewBox="0 0 '+W0+' '+(C+GAP)+'">'+
        keys.map(function(m,i){
          return '<rect class="lw" x="'+(i*(C+GAP))+'" y="0" width="'+C+'" height="'+C+'" fill="'+
                 rampFill(meanOf(wk[m]))+'"/>'; }).join('')+'</svg></div>'+
        '<div class="vempty">Add your birthdate in Settings to see the whole life.</div>';
      if(cap) cap.textContent='the weeks you have logged';
      return;
    }

    var nowWeek=weekIndex(new Date(), b);
    var by=loggedWeeks(b);
    var LEFT=26, TOP=16;
    var cell = phone()? 9 : 12;
    var P=cell+GAP;
    var W=LEFT+cols*P, H=TOP+rows*P;
    var s='<text class="wl" x="'+LEFT+'" y="'+(TOP-5)+'">weeks \u2192</text>';
    var lived=0;
    for(var r=0;r<rows;r++){
      var yy=TOP+r*P;
      /* the future: --surface, never a ramp colour */
      s+='<rect x="'+LEFT+'" y="'+yy+'" width="'+(cols*P-GAP)+'" height="'+cell+
         '" fill="var(--surface)"/>';
      var start=r*cols, end=start+cols-1;
      var livedTo=Math.min(end, nowWeek);
      if(livedTo>=start){
        var count=livedTo-start+1;
        lived+=count;
        s+='<rect class="lv" x="'+LEFT+'" y="'+yy+'" width="'+(count*P-GAP)+'" height="'+cell+
           '" fill="var(--grey)" opacity=".6"/>';
      }
      if(r%10===0)
        s+='<text class="wl" x="'+(LEFT-5)+'" y="'+(yy+cell)+'" text-anchor="end">'+r+'</text>';
    }
    /* the logged weeks, each in its own cell, carrying that week's mean completion on the ramp */
    Object.keys(by).forEach(function(wi){
      var i=+wi, rr=Math.floor(i/cols), cc=i%cols;
      if(rr>=rows) return;
      s+='<rect class="lw" x="'+(LEFT+cc*P)+'" y="'+(TOP+rr*P)+'" width="'+cell+'" height="'+cell+
         '" fill="'+rampFill(meanOf(by[i]))+'"/>';
    });
    var pat='<defs><pattern id="wkcell" width="'+P+'" height="'+P+'" patternUnits="userSpaceOnUse">'+
      '<rect x="'+cell+'" y="0" width="'+GAP+'" height="'+P+'" fill="var(--bg)"/>'+
      '<rect x="0" y="'+cell+'" width="'+P+'" height="'+GAP+'" fill="var(--bg)"/></pattern></defs>';
    var cur='';
    var cr=Math.floor(nowWeek/cols), cc2=nowWeek%cols;
    if(cr<rows) cur='<rect class="cw" x="'+(LEFT+cc2*P-0.5)+'" y="'+(TOP+cr*P-0.5)+'" width="'+
      (cell+1)+'" height="'+(cell+1)+'" fill="none" stroke="var(--outline-today)" stroke-width="1.5"/>';

    host.innerHTML='<div class="wkscroll'+(phone()?'':' natural')+'">'+
      '<svg class="wkg" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'">'+
      pat+s+'<rect x="'+LEFT+'" y="'+TOP+'" width="'+(cols*P)+'" height="'+(rows*P)+
      '" fill="url(#wkcell)" pointer-events="none"/>'+cur+'</svg></div>';

    var loggedDays=dates().filter(function(k){ return pctOn(k)!=null; }).length;
    if(cap) cap.textContent='Week '+nowWeek.toLocaleString()+' of '+LIFE_TOTAL.toLocaleString()+
      ' \u00b7 '+Math.max(0,LIFE_TOTAL-nowWeek).toLocaleString()+' weeks left at '+TARGET_AGE+
      ' \u00b7 '+loggedDays+' days logged';

    /* the current week centred in the phone scroller: at column '+cc2+' of 52 it opens off screen */
    var sc=host.querySelector('.wkscroll');
    if(sc && sc.scrollWidth>sc.clientWidth) sc.scrollLeft=Math.max(0,(LEFT+cc2*P)-sc.clientWidth/2);
    return { lived:lived, nowWeek:nowWeek };
  }
  window.__HT16.weekIndex  = weekIndex;
  window.__HT16.lifeFacts  = lifeFacts;
  window.__HT16.paintWeeks = paintWeeks16;

  /* ---- S5 · THE SCORECARD (R70.97) ------------------------------------------------------
     PASTE 42 C1 is answered: keep, rebuilt. The bars said one number per group and nothing about
     whether it was moving, which habit was carrying the loss, or how long the run was -- so the
     bars are replaced, worst first, and the old renderer is deleted in this same commit (R70.79,
     DEC-096: a named replacement, landing together).

     THE DEFINITION, and it ships with the table (Settings -> About): of all the habit check-offs
     that were SCHEDULED in a group over the last 30 days, the share you actually completed.
     100% = every scheduled habit in that group done every scheduled day. A weekly standard is ONE
     opportunity per week, not per day -- counting it daily divides by seven and reads as failure. */
  function groupsOf(){
    var out=[], seen={};
    S.habits.forEach(function(h){
      var g=h.group_name||'Other';
      if(!seen[g]){ seen[g]=1; out.push(g); }
    });
    return out;
  }
  /* hits and opportunities for one group over the window [from, to] in day-offsets back from today */
  function adherenceWindow(group, back0, back1){
    var byId={}; S.habits.forEach(function(h){ byId[h.id]=h; });
    var hit=0, opp=0, seenWeek={};
    for(var i=back0;i<=back1;i++){
      var k=shift(today(),-i);
      var r=S.byDate[k]; if(!r||!loggedOn(k)) continue;
      var set=r.active_set||Object.keys(byId);
      var ck=r.checked||{};
      set.forEach(function(hid){
        var h=byId[hid]; if(!h) return;
        if((h.group_name||'Other')!==group) return;
        if(h.cadence==='weekly'){
          var d=dnum(k); d.setDate(d.getDate()-((d.getDay()+6)%7));
          var wk=dk(d); if(seenWeek[hid+'|'+wk]) return;
          seenWeek[hid+'|'+wk]=1; opp++;
          if(weekDone(hid,k)) hit++;
          return;
        }
        opp++; if(ck[hid]) hit++;
      });
    }
    return { hit:hit, opp:opp, pct: opp? Math.round(hit/opp*100) : null };
  }
  /* consecutive days on which EVERY standard scheduled in the group was done */
  function groupStreak(group){
    var byId={}; S.habits.forEach(function(h){ byId[h.id]=h; });
    var n=0, k=today(), guard=0;
    if(!loggedOn(k)) k=shift(k,-1);
    while(guard++<400){
      var r=S.byDate[k]; if(!r||!loggedOn(k)) break;
      var set=r.active_set||Object.keys(byId), ck=r.checked||{}, any=false, all=true;
      set.forEach(function(hid){
        var h=byId[hid]; if(!h||(h.group_name||'Other')!==group) return;
        any=true;
        var done = h.cadence==='weekly' ? weekDone(hid,k) : !!ck[hid];
        if(!done) all=false;
      });
      if(!any || !all) break;
      n++; k=shift(k,-1);
    }
    return n;
  }
  function weakestIn(group){
    var out=null;
    S.habits.forEach(function(h){
      if((h.group_name||'Other')!==group) return;
      var a=adherence30(h.id); if(a==null) return;
      if(out==null || a<out.pct) out={ name:nameOf(h.name), pct:a };
    });
    return out;
  }
  /* twelve weekly figures, oldest first; a week with no opportunity is a gap, not a zero */
  function weeklyAdherence(group){
    var out=[];
    for(var w=11;w>=0;w--) out.push(adherenceWindow(group, w*7, w*7+6).pct);
    return out;
  }
  function sparkSvg(vals){
    var W=84, H=20, n=vals.length;
    var px=function(i){ return n<2?W/2:1+i*(W-2)/(n-1); };
    var py=function(v){ return H-2-(v/100)*(H-5); };
    var runs=[], cur=[];
    vals.forEach(function(v,i){ if(v==null){ if(cur.length){runs.push(cur);cur=[];} return; } cur.push([i,v]); });
    if(cur.length) runs.push(cur);
    var s='';
    runs.forEach(function(r){
      if(r.length===1) s+='<circle class="sp1" cx="'+px(r[0][0]).toFixed(1)+'" cy="'+py(r[0][1]).toFixed(1)+'" r="1.4"/>';
      else s+='<path class="spl" d="'+r.map(function(pt,j){
        return (j?'L':'M')+px(pt[0]).toFixed(1)+' '+py(pt[1]).toFixed(1); }).join(' ')+'"/>';
    });
    var last=null, li=-1;
    for(var i=vals.length-1;i>=0;i--){ if(vals[i]!=null){ last=vals[i]; li=i; break; } }
    if(last!=null) s+='<circle class="spd '+rampClass(last)+'" cx="'+px(li).toFixed(1)+'" cy="'+
      py(last).toFixed(1)+'" r="2.2"/>';
    return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'">'+s+'</svg>';
  }

  function scorecardRows(){
    return groupsOf().map(function(g){
      var cur=adherenceWindow(g,0,29), prv=adherenceWindow(g,30,59);
      var wk=weakestIn(g);
      return { group:g, pct:cur.pct, hit:cur.hit, opp:cur.opp,
               prev:prv.pct,
               delta:(cur.pct==null||prv.pct==null)?null:(cur.pct-prv.pct),
               streak:groupStreak(g), weakest:wk,
               spark:weeklyAdherence(g),
               onTime:(typeof onTime30==='function'? onTime30(g) : null) };
    }).sort(function(a,b){
      var x=a.pct==null?101:a.pct, y=b.pct==null?101:b.pct;
      return x-y || (a.group<b.group?-1:1);
    });
  }

  function paintScorecard(){
    var host=document.getElementById('vGroups'); if(!host) return;
    var rows=scorecardRows();
    var cap=document.getElementById('vGroupsC');
    if(cap) cap.textContent='last 30 days \u00b7 worst first';
    if(!rows.length){ host.innerHTML='<div class="vempty">No active standards yet.</div>'; return; }
    host.innerHTML=
      '<table class="h16sc"><thead><tr>'+
        '<th>Group</th><th class="r">30d</th><th class="r">\u0394</th><th class="r">Streak</th>'+
        '<th>Weakest</th><th>12 weeks</th><th class="r">On time</th>'+
      '</tr></thead><tbody>'+
      rows.map(function(r){
        var d=r.delta;
        return '<tr>'+
          '<td class="g">'+esc(r.group)+'</td>'+
          '<td class="r num '+rampClass(r.pct)+'">'+(r.pct==null?'\u2014':r.pct+'%')+'</td>'+
          '<td class="r num dl">'+(d==null?'\u2014':(d>0?'\u25b2':(d<0?'\u25bc':'\u00b7'))+
            (d===0?'':Math.abs(d)))+'</td>'+
          '<td class="r num">'+r.streak+'</td>'+
          '<td class="wk">'+(r.weakest? esc(r.weakest.name)+' <s>'+r.weakest.pct+'%</s>' : '\u2014')+'</td>'+
          '<td>'+sparkSvg(r.spark)+'</td>'+
          '<td class="r num">'+(r.onTime==null?'\u2014':r.onTime+'%')+'</td>'+
        '</tr>'; }).join('')+
      '</tbody></table>';
  }

  /* the definition ships with the table (R70.97), in Cory's words */
  var ADHERENCE_DEF =
    'Group adherence \u2014 of all the habit check-offs that were scheduled in a group over the last ' +
    '30 days, the share you actually completed. 100 % = every scheduled habit in that group done ' +
    'every scheduled day.';
  function aboutScorecard(){
    var a=document.getElementById('vAbout'); if(!a || a.dataset.ht16) return;
    a.dataset.ht16='1';
    var d=document.createElement('div');
    d.id='h16About'; d.style.paddingTop='6px';
    d.innerHTML='<b>The scorecard</b> \u2014 '+ADHERENCE_DEF;
    a.appendChild(d);
  }
  /* HT-18 S5b (R70.187): ONE sparkline renderer in the app (CONSOLIDATE). The adherence line
     draws its twelve weeks with the same function the scorecard's twelve-week column uses. */
  window.__HT16.sparkSvg          = sparkSvg;
  window.__HT16.scorecardRows    = scorecardRows;
  window.__HT16.adherenceWindow  = adherenceWindow;
  window.__HT16.groupStreak      = groupStreak;
  window.__HT16.ADHERENCE_DEF    = ADHERENCE_DEF;

  /* ---- S6 · TASK TIME (R70.103) — absorbs HT-12 TIME entirely ---------------------------
     Two optional fields per standard: `time_anchor` (when in the day) and `minutes_planned` (how
     long). Both are additive columns with their own probe, so this build runs before and after the
     migration; before it, TODAY keeps the order it has and nothing on the row changes.

     NO TIMER, AND NO SECOND CALENDAR. ClickUp stays the system of record for committed time; HT
     holds the habit's slot only. ACTUAL is the day's existing `closed_at` (HT-13 G2) — the only
     completion timestamp this app has ever written, and inventing a second one would mean two
     answers to "when did you finish".

     Cory's 9/6 "no time next to tasks" is superseded by his 9/7 R70.103 prefix. Said here so a
     later wire does not read the older ruling and strip it back out. */
  /* HT-22 S1 (CONSOLIDATE): these four were the only definition of "when is this planned"
     until the migration gave the columns a home. They now DELEGATE to the top-level window
     helpers so there is exactly one answer for the row, the sort, on-time and the vault note.
     The exported names are kept - `window.__HT16.planOf` has callers outside this closure. */
  function anchorOf(h){ return winStart(h); }
  function planOf(h){ return planMins(h); }
  function anchorMin(h){ return winStartMin(h); }
  function endMin(h){ return winEndMin(h); }
  function timedHabits(){ return S.habits.filter(function(h){ return !isRule(h); }); }

  /* TODAY SORTS BY ANCHOR; everything unanchored falls to an ANYTIME block at the bottom in the
     order it already had. Only when at least one standard carries an anchor -- otherwise the list
     Cory has today must not move under him. */
  function sortToday(list){
    var timed=[], any=[];
    list.forEach(function(h){ (anchorMin(h)==null?any:timed).push(h); });
    if(!timed.length) return { timed:[], any:list, split:false };
    timed.sort(function(a,b){
      return anchorMin(a)-anchorMin(b) || (a.sort_order||0)-(b.sort_order||0); });
    return { timed:timed, any:any, split:true };
  }

  /* the day load: planned, done (planned minutes of what is checked) and what is left */
  function loadSums(k){
    var day=k||S.date, ck=ckOf(day), planned=0, done=0;
    S.habits.forEach(function(h){
      if(isWeekly(h) || !dueOn(h,day)) return;          /* HT-28 E12: only what is due that day */
      var m=planOf(h); if(m==null) return;
      planned+=m; if(ck[h.id]) done+=m;
    });
    return { planned:planned, done:done, left:Math.max(0,planned-done) };
  }

  /* the day's close time, in minutes past local midnight; null when the day was never closed */
  function closeMin(k){
    var r=S.byDate[k]; var c=r&&r.closed_at; if(!c) return null;
    var d=new Date(c); if(isNaN(d)) return null;
    return d.getHours()*60+d.getMinutes();
  }
  /* ON TIME = a timed standard, checked, on a day whose close is at or before anchor + minutes.
     A day that was never closed carries no answer and is not counted either way. */
  function onTimeOn(k, filter){
    var r=S.byDate[k]; if(!r||!loggedOn(k)) return null;
    var cm=closeMin(k); if(cm==null) return null;
    var ck=r.checked||{}, n=0, ok=0;
    timedHabits().forEach(function(h){
      if(filter && !filter(h)) return;
      if(h.cadence==='weekly'? !weekDone(h.id,k) : !ck[h.id]) return;
      n++;
      /* S2: ON TIME is |done_at - planned_at| <= 15 min when the check carries a clock. Days
         logged before S2 have no done time, so they keep the old day-close test rather than
         being counted as misses — a rule change must not reprice a past day (P4). */
      var da=doneMin(k,h.id), pa=anchorMin(h);
      if(da!=null && pa!=null){ if(Math.abs(da-pa)<=15) ok++; }
      else if(cm<=endMin(h)) ok++;
    });
    return n? { n:n, ok:ok, pct:Math.round(ok/n*100) } : null;
  }
  function onTime30(group){
    var n=0, ok=0;
    for(var i=0;i<30;i++){
      var r=onTimeOn(shift(today(),-i), group? function(h){
        return (h.group_name||'Other')===group; } : null);
      if(!r) continue; n+=r.n; ok+=r.ok;
    }
    return n? Math.round(ok/n*100) : null;
  }
  /* THE LEARNING: the median close time of a standard's last 30 check-offs, as HH:MM. It is a
     SUGGESTION and nothing writes it -- one tap in the editor adopts it (R70.103). */
  /* ---- HT-19 B0.1 - THE NAME AND THE TYPE AGREE NOW (R70.239) ---------------------------
     Six receipts carried `NaN:NaN` in the drawer's USUAL column, and the cause was never the
     drawer. `closeMin`, `nowMin` and `endMin` all return MINUTES; `medianClose` returned a
     FORMATTED STRING from a name that reads like the others, and it had two callers with opposite
     expectations - the edit sheet wanted the string (correct all along) and `usualTime` divided it
     by 60 (NaN all along). Patching usualTime alone would have left the ambiguity that made it.
     So the computation is `medianCloseMin` -> Number|null, the formatting is its own function, and
     `medianClose` stays exactly what it was for the caller that was right.

     THE FORMATTER IS **NOT** CALLED `fmtHM`, AND THE WIRE ASKED FOR THAT NAME. `fmtHM` already
     exists at app.js:63 as minutes -> "1h 45m" and it is used TWELVE LINES FROM HERE for the load
     line ("Planned 5h 7m"). A second `fmtHM` declared in this closure would shadow it and break
     that line - the identical class of defect this section exists to remove. `hhmm()` is not it
     either: its contract is string -> string. Contradiction reported; the name is `fmtClock`. */
  /* `fmtClock` is HOISTED to the top of this file by HT-22 S1 and deleted here: one
     computation, one name, one definition (HT-19 B0.1). The callers below are unchanged. */
  /* ---- HT-21 S2 · THE USUAL TIME IS NOW THE STANDARD'S OWN (R70.286) --------------------
     `medianCloseMin` took the median of the DAY's close time across days this standard was
     checked. That answers "when do you finish a day on which you did this", not "when do you do
     this" — the same number for every standard on the same day. With a per-check `done_at` the
     real question is answerable. Days logged before S2 carry no done time, so the old figure is
     kept as the fallback and the two never disagree about a day they both have. */
  function medianDoneMin(hid){
    var vals=[];
    for(var i=0;i<30;i++){
      var k=shift(today(),-i);
      var v=doneMin(k,hid); if(v!=null) vals.push(v);
    }
    if(!vals.length) return null;
    vals.sort(function(a,b){ return a-b; });
    var m=Math.floor(vals.length/2);
    return vals.length%2 ? vals[m] : Math.round((vals[m-1]+vals[m])/2);
  }
  function driftMin(h){
    var u=medianDoneMin(h.id), p=anchorMin(h);
    return (u==null||p==null) ? null : u-p;
  }
  function medianCloseMin(hid){
    var vals=[], k=today(), guard=0;
    while(guard++<400 && vals.length<30){
      var r=S.byDate[k];
      if(r && loggedOn(k) && (r.checked||{})[hid]){
        var cm=closeMin(k); if(cm!=null) vals.push(cm);
      }
      k=shift(k,-1);
    }
    if(vals.length<3) return null;               /* three points is the floor for a median to mean anything */
    vals.sort(function(a,b){ return a-b; });
    var mid=Math.floor(vals.length/2);
    return vals.length%2? vals[mid] : Math.round((vals[mid-1]+vals[mid])/2);
  }
  /* unchanged for its caller: the edit sheet at ~2287 wants "HH:MM" and always did */
  /* one name, and it prefers the standard's own done time over the day-close proxy */
  function medianClose(hid){
    var d=medianDoneMin(hid);
    return fmtClock(d!=null ? d : medianCloseMin(hid));
  }

  /* ---- the row prefix, the overdue tint, the ANYTIME block and the load line ---- */
  function nowMin(){ var d=new Date(); return d.getHours()*60+d.getMinutes(); }

  function decorateTime(){
    var log=document.getElementById('log'); if(!log) return;
    var rows=q('.li',log);
    if(!rows.length) return;
    var ck=ckOf(S.date), isToday=(S.date===today());
    var anySplit=false;

    rows.forEach(function(row){
      var h=S.habits.filter(function(x){ return x.id===row.getAttribute('data-h'); })[0];
      if(!h) return;
      var a=anchorOf(h), pm=planOf(h);
      var old=row.querySelector('.tpfx');
      if(a){
        anySplit=true;
        var txt=fmtTime(a)+(pm?' \u00b7 '+pm+'m':'');
        if(old) old.textContent=txt;
        else{
          var sp=document.createElement('span');
          sp.className='tpfx'; sp.textContent=txt;
          var bx=row.querySelector('.bxw');
          row.insertBefore(sp, bx? bx.nextSibling : row.firstChild);
        }
      } else if(old){ old.parentNode.removeChild(old); }
      /* OVERDUE: the slot has passed and the box is not ticked. The ONLY red on a task row. */
      var over = isToday && a!=null && !ck[h.id] && h.cadence!=='weekly' && nowMin() > endMin(h);
      row.classList.toggle('h16-over', !!over);
    });

    if(anySplit) reorderToday(log);
    loadLine();
  }

  function reorderToday(log){
    /* HT-31 S1.6 · ONE OWNER PER LIST. This rebuilt #log as "the timed rows, then one header
       reading ANYTIME" - and `repaint()` / `repaintCharts()` reach it WITHOUT going through
       paintLog, so a day change or a month arrow wiped the four section headers and hoisted every
       timed row to the top. That is the ANYTIME header in Cory's 9/21 screenshot, with his night
       tasks above it. Measured both ways in `_reconcile/ht_stage/143/recon143.py`.
       While the sections are on they own the order; this renderer stays whole behind
       HT29_SECTIONS=false (R70.138) and re-asserts the sections instead of fighting them. */
    if(typeof HT29_SECTIONS !== 'undefined' && HT29_SECTIONS){
      /* THE RETURN IS OUTSIDE THE SEAM CHECK ON PURPOSE. Written as `HT29_SECTIONS && window.__HT29S2`,
         a missing seam fell through to the body below - which rebuilds the list as "timed rows, then
         one ANYTIME header", the exact thing in Cory's 9/21 screenshot. A defect this wire removed must
         not be one broken reference away from coming back. With sections on, this renderer does not
         run: it re-asserts them if it can, and does nothing at all if it cannot. */
      if(window.__HT29S2){
        try{ window.__HT29S2.regroup(); }
        catch(e){ if(typeof warn31==='function') warn31('regroup from reorderToday', e); }
      }else if(typeof warn31==='function'){ warn31('sections are on but __HT29S2 is missing', 1); }
      return;
    }
    var order=sortToday(S.habits.slice());
    if(!order.split) return;
    var byId={}; q('.li',log).forEach(function(r){ byId[r.getAttribute('data-h')]=r; });
    var frag=document.createDocumentFragment();
    order.timed.forEach(function(h){ if(byId[h.id]) frag.appendChild(byId[h.id]); });
    var anyRows=order.any.filter(function(h){ return byId[h.id]; });
    if(anyRows.length){
      var hd=document.createElement('div');
      hd.className='grp h16any'; hd.textContent='ANYTIME';
      frag.appendChild(hd);
      anyRows.forEach(function(h){ frag.appendChild(byId[h.id]); });
    }
    /* the group headers go: with anchors the anchor IS the order, and two orderings in one list is
       two answers to "what is next". HT-11's "+ Add standard" is a control, not an ordering, so one
       of them is carried to the foot rather than dropped. */
    var add=log.querySelector('.eadd');
    if(add){ add.setAttribute('data-add',''); add.textContent='+ Add standard'; frag.appendChild(add); }
    log.innerHTML='';
    log.appendChild(frag);
  }

  function loadLine(){
    var log=document.getElementById('log'); if(!log) return;
    var n=document.getElementById('h16Load');
    if(!n){
      n=document.createElement('div'); n.id='h16Load'; n.className='h16load';
      log.parentNode.insertBefore(n, log);
    }
    var L=loadSums(S.date);
    if(!L.planned){ n.textContent=''; n.classList.add('h16off'); return; }
    n.classList.remove('h16off');
    var ot=onTimeOn(S.date);
    n.textContent='Planned '+fmtHM(L.planned)+' \u00b7 Done '+fmtHM(L.done)+
      ' \u00b7 Left '+fmtHM(L.left)+
      (ot? ' \u00b7 On time '+ot.pct+'%' : (timedHabits().length? ' \u00b7 On time \u2014' : ''));
  }

  /* the DATA SEAM (R70.102). Every acceptance in this wire is a data golden, and `S` lives inside
     the sealed closure where no test can reach it. This exposes a READ-ONLY projection of exactly
     what the goldens assert against -- nothing here writes. */
  window.__HT16.state = function(){
    return { hasTime:!!S.hasTime, date:S.date, today:today(),
             habits:S.habits.map(function(h){
               return { id:h.id, name:nameOf(h.name), group:h.group_name||'Other',
                        cadence:h.cadence||'daily', minutes:h.minutes||0,
                        time_anchor:h.time_anchor==null?null:h.time_anchor,
                        minutes_planned:h.minutes_planned==null?null:h.minutes_planned,
                        link:h.link||null, plan:planOf(h), endMin:endMin(h) }; }),
             days:dates().map(function(k){ var r=S.byDate[k];
               return { date:k, pct:r.pct, closed_at:r.closed_at||null,
                        checked:Object.keys(r.checked||{}) }; }) };
  };
  window.__HT16.sortToday   = function(){ return sortToday(S.habits.slice()); };
  window.__HT16.loadSums    = loadSums;
  window.__HT16.onTimeOn    = onTimeOn;
  window.__HT16.onTime30    = onTime30;
  window.__HT16.medianClose    = medianClose;      /* "HH:MM" or null */
  window.__HT16.medianCloseMin = medianCloseMin;   /* minutes or null - the seam a caller
                                                      doing arithmetic should reach for */
  window.__HT16.fmtClock       = fmtClock;
  window.__HT16.planOf      = planOf;
  window.__HT16.endMin      = endMin;

  /* ---- S8 · THE TARGET-AGE SETTING GOES BEHIND ADVANCED (R70.16 — hidden, never deleted) ----
     S4 made the horizon a constant 100 for everyone, so the control is no longer a question the
     simple view asks. The FIELD stays in the DOM and the STORED VALUE is untouched; only the
     control leaves the simple view, and Settings -> Advanced brings it straight back. */
  function tuckTargetAge(){
    var t=document.getElementById('pTarget'); if(!t) return;
    var f=t.closest('.fld'); if(!f || f.dataset.ht16) return;
    f.dataset.ht16='1';
    f.classList.add('h16-adv');
    /* the "needs one migration" note that HT-13 parks next to it goes with it, or the panel keeps
       a sentence about a control nobody can see */
    var n=f.nextElementSibling;
    while(n){
      if(n.classList && n.classList.contains('note') &&
         /target age/i.test(n.textContent||'')){ n.classList.add('h16-adv'); break; }
      n=n.nextElementSibling;
    }
  }
  window.__HT16.tuckTargetAge = tuckTargetAge;

  /* HT16-INSERT */

  function repaint(){
    if(advanced()) return;
    if(!squareLayout()) return;
    bindPanels();
    decorateTime();
    paintMonth16(); paintYear16(); paintWeeks16(); paintInsights16(); paintScorecard();
  }
  /* ---- HT-19 B0.3 - A MONTH CHANGE IS CHART STATE (R70.238) ------------------------------
     The month and year nav called the FULL repaint(), which runs paintWeeks16() and rewrites
     #vWeeks. HT-18e's observer then re-asserted HT-18's renderer on top - so the end state was
     right and the two-step WAS the flash Cory saw: a bright old patch, then the correct grid.
     MEASURED: 12 mutations on #vWeeks across ten month switches.
     Fixing the end state is not fixing the flash. The life grid, the insight strip and the
     scorecard do not depend on which month the chart is showing, so they are not repainted for it.
     goDay's full repaint() is LEFT ALONE: a day change really can change a week's colour, and that
     is the grid's own data moving rather than a caller trampling it.
     HT-18e's observers STAY. They stop being the mechanism and become the guard - if some future
     caller rewrites the host again the grid still ends up right. Do not delete them as redundant. */
  function repaintCharts(){
    if(advanced()) return;
    if(!squareLayout()) return;
    decorateTime();
    paintMonth16(); paintYear16();
  }
  function boot(){
    if(advanced()) return;
    if(!S.me) return;
    repaint();
  }
  window.__HT16.repaint = repaint;
  window.__HT16.repaintCharts = repaintCharts;   /* B0.3 */

  var _pa=paintAll; paintAll=function(){ _pa.apply(null,arguments); boot(); };
  var _pl=paintLog; paintLog=function(){ _pl.apply(null,arguments);
                                         if(!advanced() && S.me) decorateTime(); };
  /* goDay does NOT go through paintLog: HT-9a wraps it and calls its own group() directly, so a day
     change rebuilt the list in group order and the anchor order was lost. MEASURED. */
  var _gd=goDay;    goDay=function(k){ _gd.call(null,k);
                                       if(!advanced() && S.me){ decorateTime(); repaint(); } };
  var _os=openSettings; openSettings=function(){ _os.apply(null,arguments);
                                                 setTimeout(function(){ aboutScorecard();
                                                                        tuckTargetAge(); },180); };
  if(document.readyState==='complete') setTimeout(boot,300);
  else window.addEventListener('load',function(){ setTimeout(boot,300); });
})();

/* ======================= HT-17 · V4 · ONE SCREEN (PASTE 51 · R70.139–R70.146) =======================
   THE DESKTOP APP MUST FIT ON THE SCREEN. Measured before this wire: page 3254px against a 720px
   viewport — 4.5 screens of scroll. Everything here serves one line of arithmetic:

       document.documentElement.scrollHeight <= window.innerHeight   at 1280x720 and 1920x1080

   The seventh layer, inside the same sealed closure (9a·10·11·13·15·16·17). It runs LAST, so it can
   move what the earlier six built without racing them, and every move is idempotent and re-asserted
   from the same patched paints.

   WHAT MOVES, AND WHY IT IS A MOVE AND NOT A REBUILD (R70.16): HT-16 laid the panels out over
   FOURTEEN auto-height rows — that is where the 3254px came from. S1 puts them on EIGHT rows of
   `(100vh - header)/8` and the panels stretch to fill. The life grid stops being a full-width band
   below the square and becomes the bottom-right panel together with the insight strip, which is what
   frees rows 9-14 entirely. Nothing is deleted; two containers stop occupying rows. */
(function(){
  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function desktop(){ return window.innerWidth >= 1024; }

  /* ---- S1 · the LIFE panel: insight strip + transposed grid, one cell -------------------
     `#h16Ins` already holds the insight strip. The weeks grid lived in `.vWeeksSec`, a body-level
     section that HT-16 had made a grid item spanning rows 9-14. Moving `#vWeeks` into `#h16Ins`
     collapses two bands into one panel and is what makes eight rows possible at all. */
  function oneScreen(){
    if(advanced()) return;
    var ins=document.getElementById('h16Ins');
    var wk=document.getElementById('vWeeks');
    if(ins && wk && wk.parentNode!==ins){
      ins.appendChild(wk);
      var sec=document.querySelector('.vWeeksSec');
      /* the emptied shell keeps its credit note (R70.68 asked for the attribution) but stops being
         a grid item — an empty row 9 is 74px of page height for nothing. */
      if(sec){ sec.classList.add('h17-empty'); }
    }
    /* the TODAY task list is one of the only two things allowed to scroll internally */
    var log=document.getElementById('log');
    if(log) log.classList.add('h17-scroll');
    paintLife17();                      /* S3 · the transposed grid, over HT-16's portrait one */
    oneLineStrip();                     /* S3 · the insight strip sits on ONE line */
    tagScorecard(); bindDrawer();       /* S5 · the scorecard row becomes the drawer's control */
    document.documentElement.setAttribute('data-ht17','1');
  }


  /* ---- S3 · LIFE, TRANSPOSED (R70.141 — amends R70.95's shape, not its data) ------------
     HT-16 drew it portrait: 52 columns of weeks across, 100 rows of years down. That shape needs
     ~1,300px of height and it is what kept the life grid on its own full-width band. Turned on its
     side it is a landscape rectangle that fits a three-row panel: YEARS ACROSS (100 columns, decade
     labels along the top), WEEKS DOWN (52 rows).

     THE ARITHMETIC IS HT-16's, deliberately: `__HT16.weekIndex` is reused rather than re-derived, so
     "lived cells == today's week index + 1" is the same number the older golden counts. Only the
     mapping from week index to cell changes — col = floor(wi/52), row = wi%52, the transpose of
     HT-16's row = floor(wi/52), col = wi%52.

     ~5,200 cells and NOT 5,200 nodes: one rect per YEAR column for the lived run plus one <pattern>
     for the cell edges, the technique HT-13 paid for when its first life grid rendered as solid
     stripes. The texture is checked on a crop, not by counting nodes. */
  var LIFE_YEARS = 100, LIFE_WEEKS = 52, WGAP = 1;

  /* S3: the strip is ONE line. HT-16 rendered two (`h16ins` + `h16ins2`), and in a three-row panel
     the second line is 22px taken straight off the grid's height. Nothing is deleted — the second
     line's text is appended to the first, so every fact survives on one line. */
  function oneLineStrip(){
    if(!desktop()) return;
    var a=document.querySelector('#h16InsBody .h16ins:not(.h16ins2)');
    var b2=document.querySelector('#h16InsBody .h16ins2');
    if(!a || !b2) return;
    /* ONE LINE, AND NOTHING TRUNCATED — the two rules fight and this is how they were settled.
       Concatenating HT-16's two lines needs 1220px and the panel has 815 (MEASURED), so a single
       line of both is an ellipsis, and an ellipsis on a strip of facts drops facts silently. S3 asks
       for ONE LINE, so line one is what shows, at its own type size, in full. Line two is not
       deleted and not hidden without trace: it moves to the strip's own tooltip, and the receipt
       says so rather than letting it vanish. */
    if(!b2.dataset.h17){
      b2.dataset.h17='1';
      var extra=b2.textContent.trim();
      if(extra) a.setAttribute('title', extra);
      b2.style.display='none';
    }
  }

  function weeksLogged(b){
    var by={};
    dates().forEach(function(k){
      var r=S.byDate[k]; var v=(r&&r.pct!=null&&loggedOn(k))?r.pct:null;
      if(v==null) return;
      var wi=window.__HT16.weekIndex(k,b); if(wi==null||wi<0) return;
      (by[wi]=by[wi]||[]).push(v);
    });
    return by;
  }
  function meanOf17(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }
  function weekRange(wi,b){
    var start=new Date(b.getTime()+wi*6048e5), end=new Date(start.getTime()+6*864e5);
    return dk(start)+' – '+dk(end);
  }

  function paintLife17(){
    var host=document.getElementById('vWeeks'); if(!host) return false;
    var b=(S.priv0&&S.priv0.birth_date)? new Date(S.priv0.birth_date+'T12:00:00') : null;
    if(!b) return false;                       /* the no-birthdate path stays HT-16's; it is correct */

    var nowWeek=window.__HT16.weekIndex(new Date(), b);
    var by=weeksLogged(b);
    var TOP=12, LEFT=2;

    /* the cell formula the wire names, measured against the height this panel actually has */
    var box=host.getBoundingClientRect();
    var availH=Math.max(0, Math.round(box.height) - TOP - 2);
    var cell = desktop() ? Math.max(3, Math.floor(availH/LIFE_WEEKS) - 1) : 4;
    var P=cell+WGAP;
    var W=LEFT+LIFE_YEARS*P, H=TOP+LIFE_WEEKS*P;

    var s='';
    var lived=0;
    /* ONE RECT PER YEAR COLUMN. A full year is 52 lived weeks, so the run is vertical now. */
    for(var y=0;y<LIFE_YEARS;y++){
      var x=LEFT+y*P;
      s+='<rect x="'+x+'" y="'+TOP+'" width="'+cell+'" height="'+(LIFE_WEEKS*P-WGAP)+
         '" fill="var(--surface)"/>';
      var start=y*LIFE_WEEKS, end=start+LIFE_WEEKS-1;
      var livedTo=Math.min(end, nowWeek);
      if(livedTo>=start){
        var count=livedTo-start+1;
        lived+=count;
        s+='<rect class="lv" x="'+x+'" y="'+TOP+'" width="'+cell+'" height="'+(count*P-WGAP)+
           '" fill="var(--grey)" opacity=".6"/>';
      }
      if(y%10===0)
        s+='<text class="wl" x="'+x+'" y="'+(TOP-3)+'">'+y+'</text>';
    }
    /* the logged weeks, each its own cell on the ramp, each carrying its own tooltip */
    Object.keys(by).forEach(function(k){
      var wi=+k, yy=Math.floor(wi/LIFE_WEEKS), ww=wi%LIFE_WEEKS;
      if(yy>=LIFE_YEARS) return;
      var pct=meanOf17(by[wi]);
      var tip='week '+wi+' · '+weekRange(wi,b)+' · '+
              (pct==null?'—':Math.round(pct)+'%');
      s+='<rect class="lw" x="'+(LEFT+yy*P)+'" y="'+(TOP+ww*P)+'" width="'+cell+'" height="'+cell+
         '" fill="'+window.__HT16.rampFill(pct)+'" data-wk="'+wi+'" data-tip="'+esc(tip)+'">'+
         '<title>'+esc(tip)+'</title></rect>';
    });
    var pat='<defs><pattern id="wkcell17" width="'+P+'" height="'+P+'" patternUnits="userSpaceOnUse">'+
      '<rect x="'+cell+'" y="0" width="'+WGAP+'" height="'+P+'" fill="var(--bg)"/>'+
      '<rect x="0" y="'+cell+'" width="'+P+'" height="'+WGAP+'" fill="var(--bg)"/></pattern></defs>';
    var cur='';
    var cy=Math.floor(nowWeek/LIFE_WEEKS), cw=nowWeek%LIFE_WEEKS;
    if(cy<LIFE_YEARS)
      cur='<rect class="cw" x="'+(LEFT+cy*P-0.5)+'" y="'+(TOP+cw*P-0.5)+'" width="'+(cell+1)+
          '" height="'+(cell+1)+'" fill="none" stroke="var(--outline-today)" stroke-width="1.5"/>';

    /* DESKTOP: the SVG scales to the cell it has (viewBox + meet), so the mandated cell size is the
       INTRINSIC one and a 720px screen still shows all 100x52 without scrolling — at 1280x720 the
       formula wants 208px of height and the panel has ~200, and scaling is what closes that gap
       rather than dropping years. PHONE: a fixed 4px cell in a horizontal scroller (R70.141). */
    host.innerHTML='<div class="wkscroll'+(desktop()?' h17fit':'')+'">'+
      '<svg class="wkg h17life" viewBox="0 0 '+W+' '+H+'"'+
      (desktop()? ' preserveAspectRatio="xMinYMin meet"'
                : ' width="'+W+'" height="'+H+'"')+'>'+
      pat+s+
      '<rect x="'+LEFT+'" y="'+TOP+'" width="'+(LIFE_YEARS*P)+'" height="'+(LIFE_WEEKS*P)+
      '" fill="url(#wkcell17)" pointer-events="none"/>'+cur+'</svg></div>';
    host.setAttribute('data-lived', lived);
    host.setAttribute('data-cols', LIFE_YEARS);
    host.setAttribute('data-rows', LIFE_WEEKS);
    host.setAttribute('data-cell', cell);
    return true;
  }


  /* ---- S5 · GROUP DRAWER (R70.143 · R70.135) --------------------------------------------
     The scorecard row is legible at a glance and exhaustive on tap. THIS IS WHERE THE RED FLAGS
     WENT: HT-16 took the `⚑3` counters off the task row, and the same number lives here now, beside
     the habit's name, where it can be read on purpose instead of noticed by accident. C6 is answered
     by construction — nothing is lost, it is relocated to the surface that asked for it.

     The drawer is the second of the only two things allowed to scroll internally (S1). */
  function groupHabits(g){
    return S.habits.filter(function(h){ return (h.group_name||'Other')===g; });
  }
  function lastDoneOn(h){
    for(var i=0;i<400;i++){
      var k=shift(today(),-i);
      if(!S.byDate[k]) continue;
      if(doneOn(h,k)) return i===0? 'today' : (i===1? 'yesterday' : i+' days ago');
    }
    return 'never';
  }
  function curStreak(h){
    var n=0;
    for(var i=0;i<400;i++){
      var k=shift(today(),-i);
      if(!loggedOn(k)) { if(i===0) continue; break; }
      if(doneOn(h,k)) n++; else break;
    }
    return n;
  }
  function weekPcts(g,n){
    var out=[];
    for(var w=0;w<n;w++){
      var a=window.__HT16.adherenceWindow(g, w*7, w*7+6);
      out.push(a && a.opp ? a.pct : null);
    }
    return out;
  }
  /* HT-19 B0.1: it wanted the formatted string all along. The division was the bug. */
  function usualTime(h){
    var s=window.__HT16.medianClose ? window.__HT16.medianClose(h.id) : null;
    return s ? fmtTime(s) : '—';
  }

  function drawerEl(){
    var n=document.getElementById('h17Drawer');
    if(n) return n;
    n=document.createElement('div');
    n.id='h17Drawer'; n.className='h17dr';
    n.innerHTML='<div class="h17dbody" id="h17DrBody"></div>';
    document.body.appendChild(n);
    n.addEventListener('click',function(e){
      if(e.target===n || e.target.closest('[data-drx]')) closeDrawer();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape') closeDrawer();
    });
    return n;
  }
  function closeDrawer(){
    var n=document.getElementById('h17Drawer');
    if(n) n.classList.remove('on');
  }

  /* HT-18 S5b (R70.187) · ONE habit-row renderer in the app. This is the EXACT <tr> map that was
     inline in openDrawer — same string, same order, same helpers — lifted out so the adherence
     drawer and the group drawer render a habit the same way. A pure extraction: golden_ht17's
     drawer checks stay green with no edit, and if they do not, the extraction was not pure. */
  function habitRows(hs){
    var rf=window.__HT16.rampFill;
    return hs.map(function(h){
      var p=adherence30(h.id);
      var ms=missRun(h.id);
      return '<tr data-h="'+h.id+'">'+
        '<td class="n">'+esc(nameOf(h.name))+'</td>'+
        '<td class="p"><i style="background:'+rf(p)+'"></i>'+(p==null?'—':p+'%')+'</td>'+
        '<td class="num">'+curStreak(h)+'</td>'+
        '<td class="num'+(ms>=3?' bad':'')+'">'+(ms?('⚑'+ms):'0')+'</td>'+
        '<td class="t">'+esc(lastDoneOn(h))+'</td>'+
        '<td class="t">'+esc(usualTime(h))+'</td></tr>';
    }).join('');
  }
  window.__HT17 = { openDrawer:openDrawer, habitRows:habitRows };

  function openDrawer(g){
    var n=drawerEl();
    var hs=groupHabits(g);
    var cur=window.__HT16.adherenceWindow(g,0,29);
    var prv=window.__HT16.adherenceWindow(g,30,59);
    var ot=window.__HT16.onTime30 ? window.__HT16.onTime30(g) : null;
    var wp=weekPcts(g,12).filter(function(v){ return v!=null; });
    var best=wp.length? Math.max.apply(null,wp) : null;
    var worst=wp.length? Math.min.apply(null,wp) : null;

    var rows=habitRows(hs);   /* HT-18 S5b: the local `rf` retired with the map that used it */

    document.getElementById('h17DrBody').innerHTML=
      '<div class="h17dh"><h3>'+esc(g)+'</h3><span style="flex:1"></span>'+
        '<button class="tbtn" data-drx="1">Close</button></div>'+
      '<div class="h17dg">'+
        '<span><b>'+(cur.pct==null?'—':cur.pct+'%')+'</b> last 30 days</span>'+
        '<span><b>'+cur.hit+'</b> of <b>'+cur.opp+'</b> scheduled completed</span>'+
        '<span>on time <b>'+(ot==null?'—':ot+'%')+'</b></span>'+
        '<span>prior 30 <b>'+(prv.pct==null?'—':prv.pct+'%')+'</b></span>'+
        '<span>best week <b>'+(best==null?'—':best+'%')+'</b></span>'+
        '<span>worst week <b>'+(worst==null?'—':worst+'%')+'</b></span>'+
      '</div>'+
      '<table class="h17dt"><thead><tr><th>standard</th><th>30d</th><th>streak</th>'+
        '<th>missed</th><th>last done</th><th>usual</th></tr></thead>'+
        '<tbody>'+rows+'</tbody></table>';
    n.setAttribute('data-grp', g);
    n.setAttribute('data-rows', hs.length);
    n.classList.add('on');
  }

  function bindDrawer(){
    var host=document.getElementById('vGroups');
    if(!host || host.dataset.ht17) return;
    host.dataset.ht17='1';
    /* the scorecard rows become the control. HT-16 renders them as a table, so the row carries the
       group and a tap anywhere on it opens the drawer. */
    host.addEventListener('click',function(e){
      var tr=e.target.closest('[data-grp]');
      if(!tr) return;
      openDrawer(tr.getAttribute('data-grp'));
    });
    host.classList.add('h17tap');
  }
  /* HT-16's scorecard does not tag its rows with the group, so tag them after every paint */
  function tagScorecard(){
    var host=document.getElementById('vGroups'); if(!host) return;
    var rows=q('tbody tr, .h16row', host);
    var names=window.__HT16.scorecardRows ? window.__HT16.scorecardRows().map(function(r){ return r.group; }) : [];
    rows.forEach(function(tr,i){
      if(names[i]!=null) tr.setAttribute('data-grp', names[i]);
    });
  }

  /* ---- re-assert after every repaint, the way the six layers before this one do ---------- */
  var _pa=paintAll;  paintAll  = function(){ _pa.apply(null,arguments); oneScreen(); };
  var _pl=paintLog;  paintLog  = function(){ _pl.apply(null,arguments); oneScreen(); };

  function boot(){ if(advanced()) return; if(!S.me) return; oneScreen(); }
  if(document.readyState==='complete') setTimeout(boot,300);
  else window.addEventListener('load',function(){ setTimeout(boot,300); });
})();


/* ======================= HT-18 · V5 · FOUR QUADRANTS (PASTE 58 · R70.184-R70.189) =======================
   THE CROSS CORY DREW ON THE SCREENSHOT. HT-17 won the page-height fight (3254 -> 720) and did not
   win the SPACE fight: the left column was one strip carrying two things that each need a quadrant,
   and the life grid drew 336x175 inside a 921x275 panel.

       four quadrants, equal to the pixel, one gutter on all four sides

   THE EIGHTH LAYER, inside the same sealed closure (9a-10-11-13-15-16-17-18). It runs LAST, so it
   can move what the seven before it built without racing them, and every move is idempotent.

   EXACTLY THREE DOM MOVES IN THE WHOLE WIRE, and every one of them is a MOVE (R70.16 - nothing is
   deleted, nothing is cloned, nothing is re-rendered from scratch):
     S1  the completion .blk + #tClose  ->  #h18Comp     (bottom left)
     S1  #h16Month + #h16Year           ->  #h18Charts   (top right)
     S2  the COMPLETED + PRAYER fields  ->  #h18Btm      (the journal's bottom row)
   Everything else in this layer is CSS.

   WHY MOVING IS SAFE, AND THE TRAP THAT WOULD BITE. HT-16 creates #h16Month/#h16Year/#h16Score only
   `if(!document.getElementById(id))`, so a moved node is never re-created; every painter reaches its
   target by getElementById, not by path, so a moved node keeps painting. The trap: HT-17's drawer
   rewrites `#h17DrBody.innerHTML` on every open, so a live node moved into ANY element whose
   innerHTML is rewritten would be destroyed on the first open. S5 obeys that by construction.

   DESKTOP ONLY, AND THE MOVES REVERSE. Every move here is gated on `desktop()` and every one has its
   way home, because the phone composition (R70.184 S1d: JOURNAL - COMPLETION - MONTH - YEAR -
   ADHERENCE+LIFE, one column) is the one HT-16 already ships and a moved node would break its order.
   A resize from 1280 to 390 puts the tree back exactly where HT-17 left it. */
(function(){
  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function desktop(){ return window.innerWidth >= 1024; }

  /* ---- where a node lived before this layer moved it ------------------------------------
     Recorded on the node itself the first time it moves, so the phone gets the tree back rather
     than a second, reconstructed one. Parent AND next sibling, so order survives too. */
  function mark(n){ if(n && !n.__h18p){ n.__h18p=n.parentElement; n.__h18n=n.nextElementSibling; } }
  function home(n){
    if(!n || !n.__h18p || n.parentElement===n.__h18p) return;
    if(n.__h18n && n.__h18n.parentElement===n.__h18p) n.__h18p.insertBefore(n, n.__h18n);
    else n.__h18p.appendChild(n);
  }

  /* ---- S1a - THE FOUR CONTAINERS (R70.184) ----------------------------------------------
     TL = .colL      (already a grid child; it keeps #jIn and the eight .ht9a-off blocks)
     BL = #h18Comp   NEW  <- the completion .blk (the one holding #log) and #tClose
     TR = #h18Charts NEW  <- #h16Month and #h16Year
     BR = #h16Ins    (already a grid child; it holds the insight strip and #vWeeks) */
  function quadrants(){
    var grid=document.querySelector('.grid'); if(!grid) return false;
    var log=document.getElementById('log'); if(!log) return false;
    var comp=log.closest('.blk'), tc=document.getElementById('tClose');
    var bl=document.getElementById('h18Comp');
    if(!bl){ bl=document.createElement('div'); bl.id='h18Comp'; bl.className='h18q'; grid.appendChild(bl); }
    if(comp && comp.parentElement!==bl){ mark(comp); bl.appendChild(comp); }
    if(tc   && tc.parentElement!==bl){ mark(tc); bl.appendChild(tc); }
    var tr=document.getElementById('h18Charts');
    if(!tr){ tr=document.createElement('div'); tr.id='h18Charts'; tr.className='h18q'; grid.appendChild(tr); }
    ['h16Month','h16Year'].forEach(function(id){
      var e=document.getElementById(id);
      if(e && e.parentElement!==tr){ mark(e); tr.appendChild(e); } });
    return true;
  }
  function unquadrants(){
    ['h16Month','h16Year'].forEach(function(id){ home(document.getElementById(id)); });
    var log=document.getElementById('log');
    if(log) home(log.closest('.blk'));
    home(document.getElementById('tClose'));
  }


  /* ---- S2a - THE JOURNAL'S BOTTOM ROW (R70.185) ------------------------------------------
     "I don't like the scroll wheels; just click and brain dump." The third and last DOM move in
     this wire: COMPLETED and PRAYER are wrapped so they can sit side by side on the bottom edge,
     which is what lets the dump take everything above them. */
  function journalBottom(){
    var t=document.getElementById('iTasks'), p=document.getElementById('iPrayer');
    if(!t||!p) return false;
    var ft=t.closest('.fld'), fp=p.closest('.fld'); if(!ft||!fp) return false;
    var b=document.getElementById('h18Btm');
    if(!b){ b=document.createElement('div'); b.id='h18Btm'; ft.parentNode.insertBefore(b, ft); }
    if(ft.parentElement!==b){ mark(ft); b.appendChild(ft); }
    if(fp.parentElement!==b){ mark(fp); b.appendChild(fp); }
    return true;
  }
  function unjournalBottom(){
    var t=document.getElementById('iTasks'), p=document.getElementById('iPrayer');
    if(t) home(t.closest('.fld'));
    if(p) home(p.closest('.fld'));
  }

  /* HT-10's `grow()` writes an INLINE height on #iDump / #iTasks / #iPrayer on every paint and
     every keystroke ("t.style.height=(t.scrollHeight+2)+'px'"), and an inline height beats a
     stylesheet. MEASURED: with the quadrant in place it pinned the brain dump to 25px — the
     scrollHeight of an EMPTY textarea — inside a 240px box. In the quadrant the flex column owns
     the height, so the inline one is CLEARED rather than fought with !important. The phone keeps
     `grow()` exactly as it is: this runs on the desktop only. */
  function unGrow(){
    if(!desktop()) return;
    ['iDump','iTasks','iPrayer'].forEach(function(id){
      var n=document.getElementById(id); if(n && n.style.height) n.style.height=''; });
  }
  function bindGrow(){
    ['iDump','iTasks','iPrayer'].forEach(function(id){
      var n=document.getElementById(id); if(!n || n.dataset.h18g) return;
      n.dataset.h18g='1';
      /* HT-10 bound its listener first, so this one runs after grow() has written the height */
      n.addEventListener('input', unGrow);
      n.addEventListener('focus', unGrow);
    });
  }

  /* ---- S4 - THE CHARTS FILL THE TOP-RIGHT (R70.189) --------------------------------------
     The charts are drawn to a viewBox, so height comes free — but a chart sized from a box it no
     longer occupies keeps its OLD aspect, so the painters are re-run AFTER the move. Only when the
     quadrant's box has actually changed: repaint() redraws two SVGs, the scorecard and the insight
     strip, and paintLog fires on every keystroke. */
  var _h18ChartBox='';
  function chartsFit(){
    var tr=document.getElementById('h18Charts'); if(!tr) return;
    var b=tr.getBoundingClientRect(); if(!b.width) return;
    var k=Math.round(b.width)+'x'+Math.round(b.height);
    if(k===_h18ChartBox) return;
    _h18ChartBox=k;
    if(window.__HT16 && window.__HT16.repaint) window.__HT16.repaint();
  }

  /* ---- S5 - ADHERENCE IS ONE LINE (R70.187) ----------------------------------------------
     "Way simpler: a percentage, a color, a graph." DISTILL on the surface, DEEPEN in the drawer.
     Nothing is deleted; one level down is not gone (R70.16).

     THE NUMBER IS DEFINED ONCE. The surface figure is the ROLL-UP of the drawer's own rows, so the
     two can never disagree — and a golden asserts that identity rather than trusting it. NO NEW
     COUNTING LOGIC IS WRITTEN: the groups partition the habits, so summing HT-16's own
     `adherenceWindow` over them is exact, and it is the same function the scorecard prints. */
  function adhAll(b0,b1){
    if(!window.__HT16 || !window.__HT16.scorecardRows) return { hit:0, opp:0, pct:null };
    var gs=window.__HT16.scorecardRows().map(function(r){ return r.group; });
    var hit=0, opp=0;
    gs.forEach(function(g){
      var a=window.__HT16.adherenceWindow(g,b0,b1); hit+=a.hit; opp+=a.opp; });
    return { hit:hit, opp:opp, pct: opp? Math.round(hit/opp*100) : null };
  }
  function adhSpark(){ var o=[]; for(var w=11;w>=0;w--) o.push(adhAll(w*7, w*7+6).pct); return o; }

  /* S5d - THE DRAWER, AND THE TRAP. #h16Score is MOVED into #h18Draw, never cloned and never
     re-rendered, because paintScorecard() keeps painting into #vGroups wherever that node lives —
     one renderer, one node, one source of truth. #h18Draw's OWN innerHTML is never rewritten (that
     is what would destroy the moved node); only its `hidden` attribute is toggled, and the habit
     table is a separate child that IS rewritten. */
  function drawerEl(){
    var ins=document.getElementById('h16Ins'); if(!ins) return null;
    var d=document.getElementById('h18Draw');
    if(!d){
      d=document.createElement('div'); d.id='h18Draw'; d.hidden=true;
      ins.appendChild(d);
      var h=document.createElement('div'); h.id='h18DrawH'; d.appendChild(h);
    }
    var sc=document.getElementById('h16Score');
    if(sc && sc.parentElement!==d){ mark(sc); d.insertBefore(sc, d.firstChild); }
    return d;
  }
  /* ---- HT-20 P10 · DETAIL IS A PAGE OF BOXES (R70.261) --------------------------------
     Cory's own words, and they are the whole specification: "I don't wanna scroll right or left"
     and "I like how you have a box around them". So DETAIL is the same box the JOURNAL, THE MONTH,
     THE YEAR and GROUP already are, laid on a grid that WRAPS - `overflow-x` is never the answer,
     because a sideways scrollbar is a layout admitting it did not fit.

     AND THE METRICS ARE RENAMED INTO WORDS HE USES. He said the old ones were ones he did not
     understand. Every label below is written out in full ("Days in a row at 100%", not "streak"),
     and every number comes from the SAME adherence source as the sparkline (R70.47/R70.49) rather
     than from a second count that could drift from it.

     UNKNOWN IS A VALUE, NOT A BLANK. Under seven days of history a rolling figure is noise, so it
     prints `UNKNOWN` and says why on hover. A blank cell reads as zero, and zero is a claim. */
  var P10_MIN_DAYS = 7;

  function d10(){ return window.__HT16 || {}; }
  function loggedDays10(){ return dates().filter(function(k){ return loggedOn(k); }); }

  /* the same window function the surface line and the sparkline use */
  function adhPct(b0,b1){ var a=adhAll(b0,b1); return a ? a.pct : null; }

  /* consecutive days, most recent first, on which every scheduled standard was done */
  function perfectRun(){
    var n=0, k=today(), guard=0;
    if(!loggedOn(k)) k=shift(k,-1);
    while(guard++<400){
      var r=S.byDate[k];
      if(!r || !loggedOn(k) || r.pct==null) break;
      if(Math.round(r.pct)<100) break;
      n++; k=shift(k,-1);
    }
    return n;
  }

  /* planned vs done in MINUTES - today, and summed across the last 30 logged days */
  function plannedVsDone(){
    var ls=d10().loadSums, t=ls?ls(today()):null, p=0, dn=0;
    for(var i=0;i<30;i++){
      var k=shift(today(),-i); if(!loggedOn(k)) continue;
      var v=ls?ls(k):null; if(!v) continue;
      p+=v.planned; dn+=v.done;
    }
    return { today:t, mp:p, md:dn };
  }

  /* THE ONE NUMBER THAT CHANGES BEHAVIOUR: does finishing the day actually feel better?
     Average rating on days >= 80% complete against days < 50%, both printed, and the gap. */
  function completionVsRating(){
    var hi=[], lo=[];
    loggedDays10().forEach(function(k){
      var r=S.byDate[k], v=ratingOf(k);
      if(!r || r.pct==null || v==null) return;
      if(r.pct>=80) hi.push(v); else if(r.pct<50) lo.push(v);
    });
    function mean(a){ return a.length? Math.round(a.reduce(function(x,y){return x+y;},0)/a.length*10)/10 : null; }
    var h=mean(hi), l=mean(lo);
    return { hi:h, lo:l, nHi:hi.length, nLo:lo.length,
             gap:(h==null||l==null)?null:Math.round((h-l)*10)/10 };
  }

  function unk(title){ return '<span class="h20unk" title="'+esc(title||'')+'">UNKNOWN</span>'; }
  /* ---- HT-22 S1 · the three inputs, computed where they are read --------------------
     THE POINT OF THE SLEEP LINE IS THAT HE SEES THE RELATIONSHIP, not that he is told one. So
     it prints both averages and the gap between them rather than a verdict, and it refuses to
     print anything at all until there are nights on BOTH sides of seven hours - a "gap" against
     an empty half is a number with nothing on the other end of it. */
  function sleepNights(){
    var o=[]; dates().forEach(function(k){
      var pv=S.privAll[k], sl=pv&&pv.sleep_hours, v=ratingOf(k);
      if(sl!=null && sl!=='' && v!=null) o.push([+sl, v]); });
    return o;
  }
  function sleepVsRating(){
    var o=sleepNights();
    if(!o.length) return unk('no night has both hours slept and a rating yet');
    var hi=o.filter(function(x){ return x[0]>=7; }), lo=o.filter(function(x){ return x[0]<7; });
    if(!hi.length || !lo.length)
      return unk('needs nights on both sides of 7 hours - '+hi.length+' long, '+lo.length+' short');
    function avg(a){ return Math.round(a.reduce(function(t,x){ return t+x[1]; },0)/a.length*10)/10; }
    var a=avg(hi), b=avg(lo), g=Math.round((a-b)*10)/10;
    return a+' vs '+b+' <b class="h20gap">'+(g>0?'+':'')+g+'</b>';
  }
  function weightRows(){
    var o=[]; dates().forEach(function(k){
      var pv=S.privAll[k];
      if(pv && pv.weight_lb!=null && pv.weight_lb!=='') o.push([k, +pv.weight_lb]); });
    return o;
  }
  function weightLine(){
    var o=weightRows();
    if(!o.length) return unk('no Saturday weight recorded yet');
    var last=o[o.length-1][1];
    if(o.length===1) return last+' lb';
    var d=Math.round((last-o[o.length-2][1])*10)/10;
    return last+' lb <b class="h20gap">'+(d>0?'+':'')+d+'</b>';
  }
  function oneThingLine(){
    var set=0, kept=0;
    dates().forEach(function(k){ if(oneThingOf(k)==null) return; set++; if(oneDone(k)) kept++; });
    if(!set) return unk('nothing set for a tomorrow yet');
    return kept+' of '+set;
  }
  function pctCell(p){
    if(p==null) return unk('fewer than '+P10_MIN_DAYS+' days of history');
    var rf=d10().rampFill;
    return '<i class="h20dot" style="background:'+(rf?rf(p):'var(--grey)')+'"></i>'+p+'%';
  }
  /* S4: on the surface, only the four tiles carry a box. Everything beside them is a label
     and a number — the chrome was most of the noise. */
  function flat10(label, value, note){
    return '<div class="h20flatm"><div class="h20k">'+esc(label)+'</div>'+
           '<div class="h20v">'+value+'</div>'+
           (note?'<div class="h20n">'+note+'</div>':'')+'</div>';
  }
  /* the member sparkline is SEVEN DAYS of completion, not twelve weeks — a different question
     from the 90-day tile above it, and the wire asks for it by name. */
  function week7(){
    var o=[];
    for(var i=6;i>=0;i--){
      var k=shift(today(),-i), r=S.byDate[k];
      o.push((r && r.pct!=null && loggedOn(k)) ? Math.round(r.pct) : null);
    }
    return o;
  }
  function box10(label, value, note){
    return '<div class="h20box"><div class="h20k">'+esc(label)+'</div>'+
           '<div class="h20v">'+value+'</div>'+
           (note?'<div class="h20n">'+note+'</div>':'')+'</div>';
  }

  function drawerBody(){
    var host=document.getElementById('h18DrawH'); if(!host) return 0;
    if(!window.__HT17 || !window.__HT17.habitRows) return 0;
    var have=loggedDays10().length, thin=(have<P10_MIN_DAYS);
    var why='only '+have+' logged day'+(have===1?'':'s')+' - a rolling figure needs '+P10_MIN_DAYS;
    function P(b0,b1){ return thin? null : adhPct(b0,b1); }

    /* ---- HT-21 S4 · DETAIL, DECLUTTERED (R70.288) ------------------------------------
       Cory looked at HT-20's fifteen boxes and said "a lot of noise — get rid of what's not
       needed, emphasize what is." So the CONTENT is unchanged and its ALTITUDE is not: the four
       measures he actually reads sit in boxes on the surface, the four he asked about sit under
       them without box chrome, and everything else moves one tap down into MORE.
       NOTHING IS DELETED (R70.138) — count the labels on the page and the total is what HT-20
       built plus the one S8 adds. That count is the acceptance, not a promise. */
    /* ---- ME, row 1 ------------------------------------------------------------------ */
    var spark = d10().sparkSvg ? d10().sparkSvg(adhSpark()) : '';
    var pvd = plannedVsDone();
    var r7=rollRate(7), r30=rollRate(30);
    var arrow = (r7==null||r30==null) ? '' :
      (r7>r30 ? '<b class="h20up">↑</b>' : r7<r30 ? '<b class="h20dn">↓</b>' : '<b class="h20fl">→</b>');
    /* HT-21 S4: HT-20's `row1` / `row2` ARRAYS are superseded by `tiles` / `surface` / `more`
       below — the same measures, re-levelled. The two concatenations are gone; every value they
       were built from is still computed here, because S4 moved the measures, it did not drop
       any of them (R70.138). */
    var ranked=S.habits.slice().filter(function(h){ return adherence30(h.id)!=null; })
      .sort(function(a,b){ return adherence30(b.id)-adherence30(a.id); });
    function three(list){
      if(!list.length) return unk(why);
      return '<ul class="h20list">'+list.map(function(h){
        return '<li><span>'+esc(nameOf(h.name))+'</span><b>'+adherence30(h.id)+'%</b></li>';
      }).join('')+'</ul>';
    }
    var groups = d10().scorecardRows ? d10().scorecardRows().map(function(r){ return r.group; }) : [];
    var byGroup = groups.length ? '<ul class="h20list">'+groups.map(function(g){
        var a=d10().adherenceWindow(g,0,29);
        return '<li><span>'+esc(g)+'</span><b>'+(a.pct==null?'—':a.pct+'%')+'</b></li>';
      }).join('')+'</ul>' : unk(why);
    var cr=completionVsRating();
    var crVal = (cr.hi==null||cr.lo==null)
      ? unk('needs logged days both above 80% and below 50%')
      : (cr.hi+' vs '+cr.lo+' <b class="h20gap">'+(cr.gap>0?'+':'')+cr.gap+'</b>');
    /* `usualTime` lives in the HT-17 closure and is not reachable from here; `medianClose` is
       the seam HT-19 B0.1 exported for exactly this reason - one definition, two callers. */
    var mc = d10().medianClose;
    var usual = '<ul class="h20list">'+S.habits.slice(0,8).map(function(h){
        return '<li><span>'+esc(nameOf(h.name))+'</span><b>'+
               esc(fmtTime((mc && mc(h.id))) || '—')+'</b></li>';
      }).join('')+'</ul>';
    /* ---- THE GROUP ROW --------------------------------------------------------------- */
    var mine=adhAll(0,29), myToday=adhPct(0,0);
    var members=[{n:'You', t:myToday, p:mine.pct, d:have, me:true}].concat(
      circleRows().map(function(x){ return {n:x.n, t:x.t, p:x.p, d:null, me:false}; }));
    members.slice().sort(function(a,b){ return (b.p==null?-1:b.p)-(a.p==null?-1:a.p); })
      .forEach(function(m,i){ m.rank=i+1; });
    var avg=(function(){ var v=members.map(function(m){return m.p;}).filter(function(x){return x!=null;});
      return v.length? Math.round(v.reduce(function(a,b){return a+b;},0)/v.length) : null; })();
    /* S4: name · today · 30d · a 7-day sparkline. No streak, no missed, no last-done on the
       surface — those live in MORE, on the per-standard table, where they always did. */
    var sp7 = d10().sparkSvg ? d10().sparkSvg(week7()) : '';
    var grpRows=members.map(function(m){
      return '<tr'+(m.me?' class="h18me"':'')+'><td class="n">'+esc(m.n)+'</td>'+
        '<td class="p">'+(m.t==null?unk(why):pctCell(m.t))+'</td>'+
        '<td class="p">'+(m.p==null?unk(why):pctCell(m.p))+'</td>'+
        '<td class="sp7">'+(m.me?sp7:'')+'</td></tr>'; }).join('');

    /* THE SURFACE: four tiles in boxes, then four measures with no box at all. */
    var tiles =
      box10('Today %',   thin?unk(why):pctCell(adhPct(0,0))) +
      box10('7 days %',  thin?unk(why):pctCell(P(0,6))) +
      box10('30 days %', thin?unk(why):pctCell(P(0,29))) +
      box10('90 days %', thin?unk(why):pctCell(P(0,89)), spark?('<span class="h20sp">'+spark+'</span>'):'');

    var surface =
      flat10('Completion → rating', crVal,
             'average rating on days ≥80% complete vs days &lt;50% · ' +
             cr.nHi + ' and ' + cr.nLo + ' days') +
      flat10('Strongest 3', three(ranked.slice(0,3))) +
      flat10('Weakest 3',   three(ranked.slice(-3).reverse())) +
      flat10('On time %', (function(){
        var v = d10().onTime30 ? d10().onTime30() : null;
        return v==null ? unk('needs a standard with a planned time and a check on the same day')
                       : pctCell(v); })(),
             'done within 15 minutes of its planned time') +
      /* ---- HT-22 S1 · THE THREE INPUTS, AS OUTPUTS (R70.284) --------------------------
         HT-21 left this line reading "sleep hours arrive with S8". They have arrived, so it
         carries the answer it was holding a place for, and the two new measures sit beside it.
         Each says UNKNOWN WITH ITS REASON until it has enough to say anything - never blank,
         and never a zero that reads as a measurement (R70.147 direction is acceptance). */
      /* HT-26 S1: the three inputs these read are hidden by the five-inputs ruling, so their
         outputs are too - hidden, never removed (R70.138): the functions stay, the tiles do not render. */
      ((window.ST && window.ST.fiveInputsOnly) ? '' :
      flat10('Sleep vs rating', sleepVsRating(),
             'average rating after 7h+ nights vs shorter ones') +
      flat10('Weight', weightLine(), 'Saturday only') +
      flat10('The one thing', oneThingLine(), 'kept, of the ones you set the night before'));

    /* MORE: everything else HT-20 built, one tap down and not one measure lost (R70.138). */
    var more =
      box10('Days in a row at 100%', String(perfectRun())) +
      box10('Planned vs done',
            (pvd.today? (fmtHM(pvd.today.done)+' of '+fmtHM(pvd.today.planned)) : unk('nothing planned today')),
            'today · 30 days ' + (pvd.mp? (fmtHM(pvd.md)+' of '+fmtHM(pvd.mp)) : '—')) +
      box10('Average rating 7d / 30d',
            (r7==null&&r30==null) ? unk(why)
              : ((r7==null?'—':r7)+' / '+(r30==null?'—':r30)+' '+arrow)) +
      box10('By group 30-day %', byGroup) +
      /* S4's surface lists the member rows without an average, and R70.138 says nothing may be
         DELETED — so the group average moves down here rather than disappearing with the row it
         used to sit on. Re-levelled, not dropped. */
      box10('Group average 30-day %', (avg==null?unk(why):pctCell(avg))) +
      box10('Usual time per standard', usual);

    host.innerHTML =
      '<div class="h20det">'+
        /* the DETAIL button is underneath this page now, so the page closes itself */
        '<div class="h20h h20top">DETAIL'+
          '<span class="sp"></span>'+
          '<button class="h20x" type="button" data-h18more>close</button></div>'+
        '<div class="h20h">ME</div>'+
        '<div class="h20grid h20tiles">'+tiles+'</div>'+
        '<div class="h20flat">'+surface+'</div>'+
        '<div class="h20h">GROUP</div>'+
        '<table class="h17dt h18dt h20gt">'+
          '<thead><tr><th>member</th><th>today</th><th>30 days</th>'+
          '<th>7 days</th></tr></thead><tbody>'+grpRows+
          (circleRows().length ? '' :
            '<tr class="h18none"><td colspan="4">No members yet — '+
            'share your join code to add one.</td></tr>')+
          '</tbody></table>'+
        '<details class="h20more"><summary>MORE</summary>'+
          '<div class="h20grid">'+more+'</div>'+
          '<div class="h20h">EVERY STANDARD</div>'+
          '<table class="h17dt h18dt h20gt">'+
            '<thead><tr><th>standard</th><th>30d</th><th>streak</th><th>missed</th>'+
            '<th>last done</th><th>usual</th></tr></thead><tbody>'+
            window.__HT17.habitRows(S.habits.slice().sort(function(a,b){
              var x=adherence30(a.id), y=adherence30(b.id);
              x=(x==null?101:x); y=(y==null?101:y);
              return x-y || (nameOf(a.name)<nameOf(b.name)?-1:1);
            }))+'</tbody></table>'+
        '</details>'+
      '</div>';
    return S.habits.length;
  }

  /* ---- HT-21 S7 · REAL CIRCLE ONLY (R70.283) -------------------------------------------
     HT-18c invented three members so Cory could see the shared view before anyone was in it, and
     badged them on the surface so they could not read as a measurement. Honest for a screen only
     he saw.
     He is about to send the link to those three actual people — so the invented rows and the
     badge LEAVE THE SHIPPED BUNDLE (R70.79). `circle_members` holds one row: him.

     THE FIXTURE IS NOT DELETED, IT MOVES (R70.138). The four-member layout still has to be
     testable, so the harness seeds a real circle through the mock (`__CIRCLE`) and the app reads
     it through the same queries `paintCircle` already uses. The app now has no way to render a
     person who does not exist, which is the only version of this that stays true.

     R47.3 IS UNCHANGED AND STILL STRUCTURAL: the one query that crosses users is
     `days.select('user_id,date,pct')` — adherence class only. Names come from `profiles`, which
     is the row a member publishes about themselves. No journal, no rating, no standards list. */
  /* HT-29 S3 (PASTE 133): the same reads, and three changes. RULING 1 - a day with nothing checked is 0%, so the
     7- and 30-day figures divide by calendar days, never by the days someone happened to log. LOGGED N/7 - with
     empty days at 0%, a skipped day and a bad day would look the same; the count of rated days is what makes
     skipping visible. RULING 4 - the group sees check-offs and the rating NUMBER; both arrive through functions
     that return those columns and nothing else (tools/sql/2026-09-15_ht29.sql), never a journal field. A load
     that FAILED says so (HT29GRP.state), instead of looking like a group of one. */
  var _circleOnce=null;
  function circleMembers(){
    if(_circleOnce) return _circleOnce;
    if(!S.me) return null;
    _circleOnce = (async function(){
      try{
        HT29GRP.setState('loading');
        var mine=await sb.from('circle_members').select('circle_id').eq('user_id',S.me.id);
        if(mine.error) throw mine.error;
        var ids=(mine.data||[]).map(function(r){ return r.circle_id; });
        if(!ids.length){ HT29GRP.setCircle(null); HT29GRP.setState('none'); return []; }
        var cs=await sb.from('circles').select('id,name,join_code').in('id',ids);
        if(cs.error) throw cs.error;      /* else a failed read reads as "no group yet" and offers to make a second one */
        HT29GRP.setCircle((cs.data||[])[0]||null);
        var mem=await sb.from('circle_members').select('circle_id,user_id').in('circle_id',ids);
        if(mem.error) throw mem.error;
        var uids=(mem.data||[]).map(function(r){ return r.user_id; })
                   .filter(function(u){ return u!==S.me.id; });
        if(!uids.length){ HT29GRP.setState('alone'); return []; }
        var pr=await sb.from('profiles').select('id,display_name,handle').in('id',uids);
        if(pr.error) throw pr.error;      /* else every row in the table is named "member" - the bug S3 exists to kill */
        var pm={}; (pr.data||[]).forEach(function(p){ pm[p.id]=p; });
        /* the cross-user completion read (adherence class) - one of the two call sites golden_ht28 G22 counts */
        var od=await sb.from('days').select('user_id,date,pct')
                       .in('user_id',uids).gte('date',shift(today(),-29));
        if(od.error) throw od.error;
        var by={}; (od.data||[]).forEach(function(r){ (by[r.user_id]=by[r.user_id]||{})[r.date]=r.pct; });
        var rt=await HT29GRP.ratings(shift(today(),-29), today());
        await HT29GRP.probeDay(uids[0]);                    /* a member's line opens only if their day can */
        HT29GRP.setState('ok');
        return uids.map(function(u){ return HT29GRP.member(u, pm[u]||{}, by[u]||{}, rt ? (rt[u]||{}) : null); });
      }catch(e){ HT29GRP.setState('error'); warn29('group load failed', e); _circleOnce=null; return []; }
    })();                                 /* the memo is dropped on failure: the card says it will try again, so it must */
    return _circleOnce;
  }
  /* the loaded value, or [] until the promise settles — a paint never waits on the network */
  var _circleRows=[];
  function circleRows(){ return _circleRows; }
  window.__HT29GRP_ROWS = circleRows;                     /* HT-29 S3/S5: Insights and a member's day read the same rows */
  function loadCircle(){
    var p=circleMembers();
    if(p && p.then) p.then(function(rows){
      _circleRows=rows||[];
      if(_circleRows.length && typeof paintAll==='function') paintAll();
    });
  }

  /* ---- HT-18d - THE GROUP BLOCK (Cory 2026-09-07 note 3) -------------------------------
     "Adherence section should be called GROUP and it needs to be one metric per member ... and it
     needs to be continuously showing in its own section above the life chart", then: "do 30 day
     adherence and the day completion - no actual tasks shown but a percent".

     So: two percentages per member, no task names, always visible. R47.3 is why that is the whole
     row and not the start of one - a circle sees adherence-class data and nothing else, and there
     is no schema path here to a journal, a rating or a standards list because nothing is fetched
     at all. HT-21 S7 removed HT-18c's seeded stand-ins and their badge: this panel now reads
     `circle_members`, so a person without an account cannot appear on it. YOUR row is real and
     computed from the same functions the drawer uses. */
  function groupBlock(){
    var ins=document.getElementById('h16Ins'); if(!ins) return false;
    if(!window.__HT16 || !window.__HT16.rampFill) return false;
    var g=document.getElementById('h18Group');
    if(!g){
      g=document.createElement('div'); g.id='h18Group';
      /* BEFORE the LIFE heading, not after it. "its own section above the life chart" means the
         heading belongs to the chart, so GROUP sitting under a LIFE title read as part of LIFE. */
      ins.insertBefore(g, ins.firstChild);
      g.addEventListener('click', function(e){
        if(e.target.closest('[data-h18more]')) toggleDrawer();
        HT29GRP.click(e);                                   /* HT-29 S3: a member's day, the invite, join */
      });
    }
    /* HT-29 S3 (PASTE 133): ONE renderer for the member lines - this card, and Insights' group side by side.
       today · 7 days · 30 days · logged, Ruling 1's arithmetic, a tap opens a member's day. DETAIL is retired
       (paste 133 S5.17): its button is hidden, never removed; its page is Insights' "More". The HT-18d rows
       below are the old renderer, kept whole behind HT29_GROUP_OLD (R70.138). */
    if(!HT29_GROUP_OLD){ g.innerHTML=HT29GRP.block(circleRows()); }
    else {
    var rf=window.__HT16.rampFill, rc=window.__HT16.rampClass;
    var mine=adhAll(0,29);
    var todayPct=(function(){ var r=S.byDate[today()]; return (r&&r.pct!=null)? Math.round(r.pct) : null; })();
    function row(name, day, mo, me){
      return '<tr'+(me?' class="h18me"':'')+'><td class="n">'+esc(name)+'</td>'+
        '<td class="p"><i style="background:'+rf(day)+'"></i>'+
          (day==null?'\u2014':day+'%')+'</td>'+
        '<td class="p"><i style="background:'+rf(mo)+'"></i>'+
          (mo==null?'\u2014':mo+'%')+'</td></tr>';
    }
    /* S7: only people with an account. With one member it says so rather than inventing company. */
    var others=circleRows();
    g.innerHTML='<div class="h18gh">GROUP'+
      '<span class="sp"></span><button class="h18more" data-h18more type="button">detail</button></div>'+
      '<table class="h18gt"><thead><tr><th>member</th><th>today</th><th>30 days</th></tr></thead>'+
      '<tbody>'+
      row('You', todayPct, mine.pct, true)+
      others.map(function(d){ return row(d.n, d.t, d.p, false); }).join('')+
      (others.length ? '' :
        '<tr class="h18none"><td colspan="3">No members yet — share your join code to add one.</td></tr>')+
      '</tbody></table>';
    }
    /* THE DRAWER STARTS BELOW THIS BLOCK. `inset:0` on #h18Draw covered the very control that
       opens it — the same defect HT-18b hit with the old one-line button, arriving again now that
       the control is a block of variable height. A constant cannot express "below GROUP", so the
       measurement is written to a custom property on every re-assert and the CSS reads it. */
    var ib=ins.getBoundingClientRect(), gb=g.getBoundingClientRect();
    if(ib.height) document.documentElement.style.setProperty(
      '--h18drawtop', Math.max(0, Math.round(gb.bottom - ib.top)) + 'px');
    return true;
  }
  /* HT-20 P10: DETAIL fits the VIEWPORT at 1280+, not the 334px LIFE column it used to live in.
     The panel is `position:relative`, so an `inset:0` child can never be wider than it — the page
     is `position:fixed` above 1024px instead, over the app frame. Its box is MEASURED from the
     frame and written to custom properties on every open and every resize, the same technique
     `--h18drawtop` already uses, because a constant cannot express "as wide as the app". */
  function drawerFrame(){
    var d=document.getElementById('h18Draw'); if(!d || d.hidden) return;
    var g=document.querySelector('.grid') || document.querySelector('.app');
    if(!g) return;
    var b=g.getBoundingClientRect(), r=document.documentElement.style;
    /* IT STARTS BELOW THE GROUP BLOCK, and that is HT-18's rule, not a preference: `inset:0` once
       covered the very control that opens the drawer, and a page you cannot close is the defect
       that rule exists to prevent. So the page is as WIDE as the frame (what P10 asks for) and
       starts under the door (what HT-18 asks for) — both, measured, neither traded away. */
    var grp=document.getElementById('h18Group');
    var top=b.top;
    if(grp){ var gb=grp.getBoundingClientRect(); if(gb.height) top=Math.max(top, gb.bottom+8); }
    r.setProperty('--h20dt', Math.max(0, Math.round(top)) + 'px');
    r.setProperty('--h20dl', Math.max(0, Math.round(b.left)) + 'px');
    r.setProperty('--h20dw', Math.round(b.width) + 'px');
  }
  function setDrawer(open){
    var d=drawerEl(); if(!d) return;
    if(open) drawerBody();
    d.hidden=!open;
    if(open) drawerFrame();
    var a=document.getElementById('h18Adh');
    if(a) a.setAttribute('aria-expanded', open?'true':'false');
  }
  if(!window.__HT20_DRAWRESIZE){
    window.__HT20_DRAWRESIZE=1;
    window.addEventListener('resize', function(){
      clearTimeout(window.__HT20_DT);
      window.__HT20_DT=setTimeout(drawerFrame, 120);
    });
  }
  function toggleDrawer(){
    var d=document.getElementById('h18Draw');
    setDrawer(!d || d.hidden);
  }
  /* HT-29 S5.17: DETAIL's page stays reachable from Insights' "More" once its own button is retired;
     `.toggle` is what the goldens that used to click the button now call (R67.2, amended by name). */
  window.__HT29_DETAIL = function(){ setDrawer(true); var d=document.getElementById('h18Draw'); if(d && d.scrollIntoView) d.scrollIntoView({ block:'start' }); };
  window.__HT29_DETAIL.toggle = function(){ toggleDrawer(); };

  /* S5c - THE SURFACE LINE: a percentage, a color, a graph, and nothing else. No group rows, no
     streak, no weakest, no columns. The percent carries the ramp colour; the sparkline is HT-16's
     OWN renderer (CONSOLIDATE — one sparkline in the app, exported at S5b). */
  function adhLine(){
    var ins=document.getElementById('h16Ins'); if(!ins) return false;
    var body=document.getElementById('h16InsBody'); if(!body) return false;
    if(!window.__HT16 || !window.__HT16.sparkSvg) return false;
    var a=document.getElementById('h18Adh');
    if(!a){
      a=document.createElement('button');
      a.id='h18Adh'; a.className='h18adh'; a.type='button';
      a.setAttribute('aria-expanded','false');
      a.setAttribute('aria-controls','h18Draw');
      body.parentNode.insertBefore(a, body);
      a.addEventListener('click', toggleDrawer);
    }
    var all=adhAll(0,29);
    a.title=window.__HT16.ADHERENCE_DEF || '';
    a.innerHTML='<span class="k">ADHERENCE</span>'+
      '<b class="v '+window.__HT16.rampClass(all.pct)+'">'+
        (all.pct==null?'\u2014':all.pct+' %')+'</b>'+
      '<span class="sp">'+window.__HT16.sparkSvg(adhSpark())+'</span>'+
      '<span class="w">30 days</span>';
    drawerEl();
    if(!window.__HT18_ESC){
      window.__HT18_ESC=1;
      document.addEventListener('keydown', function(e){
        if(e.key!=='Escape') return;
        var d=document.getElementById('h18Draw');
        if(d && !d.hidden) setDrawer(false);
      });
    }
    return true;
  }
  /* below 1024 the scorecard goes home: the phone's order is MONTH - YEAR - SCORECARD - LIFE and a
     node parked in a hidden drawer would break it. */
  function unAdh(){
    home(document.getElementById('h16Score'));
    var a=document.getElementById('h18Adh'); if(a) a.hidden=true;
  }

  /* ---- S6 - LIFE: YEARS DOWN, FROM ZERO, BIG (R70.188) ------------------------------------
     Un-transposes R70.141: 52 week-columns across, 100 year-rows down, year 0 at the top.

     THE ARITHMETIC, AND THE HONEST CEILING. The grid's box is roughly 767x342 at 1920 and 591x194
     at 1280. One hundred square rows in ~194px is a 1px cell. Squareness, "years down" and "fills
     the quadrant" cannot all hold in a landscape box unless the years are FOLDED, so the renderer
     chooses the fold count by arithmetic and prints its work on the host.

     ONE DEVIATION FROM THE WIRE'S foldPlan, AND IT IS NAMED. The wire breaks ties toward MORE
     folds - "same cell, wider grid". MEASURED at 1280, all three folds clamp to MINCELL and none
     of them FIT, so more folds is strictly worse: f=3 draws 700x138 into a 591-wide box (scaled to
     0.84, an effective cell of 2.5) while f=2 draws 462x202 (scaled to 0.96, effective 2.9). The
     objective that serves the wire's actual intent - the biggest grid on the screen - is the
     EFFECTIVE cell after fitting, so that is what is maximised, ties still breaking toward more
     folds. Every candidate is printed as data-plan so the choice can be read rather than trusted. */
  /* TOP was 2px because nothing was drawn above the grid. HT-18c puts the WEEK axis
     there, so it needs a line's worth of headroom. */
  var YEARS=100, WEEKS=52, GAP=1, MINCELL=3, LEFT=16, TOP=12, FOLDGAP=14;

  function foldPlan(availW, availH){
    var plans=[1,2,3].map(function(f){
      var rows=Math.ceil(YEARS/f), cols=WEEKS*f;
      var cw=Math.floor((availW - LEFT*f - FOLDGAP*(f-1)) / cols);
      var ch=Math.floor(availH / rows);
      var raw=Math.min(cw,ch) - GAP;
      var cell=Math.max(MINCELL, raw);
      var P=cell+GAP;
      var W=f*(LEFT+WEEKS*P) + (f-1)*FOLDGAP, H=TOP+rows*P;
      var scale=Math.min(1, availW/W, availH/H);
      return { f:f, rows:rows, cols:cols, cell:cell, raw:raw, P:P, W:W, H:H,
               fits:(W<=availW && H<=availH), scale:scale,
               eff:Math.round(cell*scale*100)/100 };
    });
    var best=plans[0];
    plans.forEach(function(p){
      if(p.eff>best.eff || (p.eff===best.eff && p.f>best.f)) best=p; });
    best.table=plans.map(function(p){
      return 'f'+p.f+':cell '+p.cell+' '+p.W+'x'+p.H+
             (p.fits?' fits':' scale '+p.scale.toFixed(2))+' eff '+p.eff+
             (p===best?' <-WON':''); }).join(' | ');
    return best;
  }

  function weeksLogged18(b){
    var by={};
    dates().forEach(function(k){
      var r=S.byDate[k]; var v=(r&&r.pct!=null&&loggedOn(k))?r.pct:null;
      if(v==null) return;
      var wi=window.__HT16.weekIndex(k,b); if(wi==null||wi<0) return;
      (by[wi]=by[wi]||[]).push(v);
    });
    return by;
  }
  function mean18(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }
  function weekRange18(wi,b){
    var st=new Date(b.getTime()+wi*6048e5), en=new Date(st.getTime()+6*864e5);
    return dk(st)+' – '+dk(en);
  }

  function paintLife18(){
    var host=document.getElementById('vWeeks'); if(!host) return false;
    if(!window.__HT16 || !window.__HT16.weekIndex) return false;
    var b=(S.priv0&&S.priv0.birth_date)? new Date(S.priv0.birth_date+'T12:00:00') : null;
    if(!b) return false;             /* the no-birthdate path stays HT-16's; it is correct */

    var nowWeek=window.__HT16.weekIndex(new Date(), b);
    var by=weeksLogged18(b);
    /* PHONE: HT-16's OWN renderer already draws exactly what R70.188 asks for — one fold, 52
       across, 100 down, in the existing horizontal scroller — at a 9px cell rather than 4, and
       MEASURED it is the paint that lands LAST on the phone: switching to the VIEWS tab runs
       __HT16.repaint() after this layer, so a phone grid drawn here is overwritten a moment later
       and leaves nothing behind but stale data- attributes from a renderer that did not draw what
       is on screen. So the phone is left to it (R70.79 — a replacement that is not an improvement
       is not a replacement), and the 546x1016 grid keeps golden_ht16's phone scroller green. */
    if(!desktop()) return false;
    host.removeAttribute('data-h18');       /* re-set at the end, so a failed paint leaves
                                               the stamp off and the observer tries again */
    var box=host.getBoundingClientRect();
    /* HT-18b (Cory, 2026-09-07): ONE GRAPH. The fold existed because a half-height quadrant could
       not hold 100 square rows; LIFE has a full-height column of its own now, so the cell comes
       straight off the height and the folds are gone. The COLUMN's width follows from the cell —
       and the height does not depend on the width, so writing --h19life here cannot start a
       feedback loop; the track settles on the first paint. */
    var availH=Math.max(80, Math.round(box.height));
    var availW=Math.max(120, Math.round(box.width));
    /* THE COLUMN'S WIDTH IS STILL DERIVED FROM THE HEIGHT, and it has to stay that way. It is the
       track width Cory approved ("besides that, it looks really good"), and it is also what keeps
       `--h19life` free of a feedback loop: height decides the track, the track decides the width,
       and the width decides nothing. P4 changes what is DRAWN inside the box, never the box. */
    var cellOne=Math.max(MINCELL, Math.min(9, Math.floor(availH/YEARS) - GAP));
    var Pone=cellOne+GAP;
    document.documentElement.style.setProperty('--h19life', (LEFT+WEEKS*Pone+26)+'px');

    /* ---- HT-20 P4 · THE LIFE GRID FILLS ITS BOX (R70.254) ----------------------------------
       MEASURED at 2133: 61px of dead height and 6px of dead width inside the host; 72 and 19
       against the panel. At 1280 it was worse in the other direction — 110px of dead WIDTH.
       BOTH COME FROM THE SAME TWO DECISIONS: the cell was SQUARE and it was an INTEGER. A square
       cell sized off the height cannot also fit the width of a box with a different aspect ratio,
       and `floor(673.91/100)-1 = 5` throws away 0.74px on every one of a hundred rows before the
       aspect ratio is even considered. 100 x 0.74 is the 61px, to the pixel.
       SO THE CELL IS NEITHER SQUARE NOR WHOLE. Width and height are solved independently against
       the box the layout actually gave, gutters reserved FIRST, and the remainder is zero by
       construction rather than by luck:
           cellW = (contentW - labelGutter  - 51*gap) / 52
           cellH = (contentH - headerGutter - 99*gap) / 100
       Sub-pixel rects are exactly what SVG is for; the 1px gap between cells is still a whole
       pixel, so the grid reads as a grid and not as a blur. */
    var cellW=Math.max(0.5, (availW - LEFT - (WEEKS-1)*GAP) / WEEKS);
    var cellH=Math.max(0.5, (availH - TOP  - (YEARS-1)*GAP) / YEARS);
    var PW=cellW+GAP, PH=cellH+GAP;
    var plan={ f:1, rows:YEARS, cols:WEEKS, cell:cellW, cellW:cellW, cellH:cellH,
               P:PW, fits:true, scale:1, eff:Math.min(cellW,cellH),
               W:LEFT+WEEKS*PW-GAP, H:TOP+YEARS*PH-GAP,
               table:'fills the box (HT-20 P4): '+availW+'x'+availH+' -> cellW=('+availW+'-'+LEFT+
                     '-51)/52='+cellW.toFixed(2)+' cellH=('+availH+'-'+TOP+'-99)/100='+
                     cellH.toFixed(2)+' · track --h19life='+(LEFT+WEEKS*Pone+26) };
    var f=plan.f, rows=plan.rows, cell=cellW, P=PW;
    var foldW=LEFT+WEEKS*PW-GAP;
    function foldX(i){ return i*(foldW+FOLDGAP); }

    /* one background rect per FOLD and one <pattern> per fold for the cell edges: ~5,200 cells and
       NOT 5,200 nodes, the technique HT-13 paid for when its first life grid rendered solid */
    var bg='', pat='<defs>', ov='';
    for(var i=0;i<f;i++){
      var rowsIn=Math.min(rows, YEARS-i*rows);
      var bx=foldX(i)+LEFT, bw=WEEKS*PW-GAP, bh=rowsIn*PH-GAP;
      /* --surface-2, not --surface: the panel behind it IS --surface, so the unlived weeks were
         invisible and the grid had no body. This is the one line that makes it read as a grid. */
      bg+='<rect x="'+bx+'" y="'+TOP+'" width="'+bw+'" height="'+bh+'" fill="var(--surface-2)"/>';
      pat+='<pattern id="wkcell18_'+i+'" x="'+bx+'" y="'+TOP+'" width="'+PW+'" height="'+PH+
           '" patternUnits="userSpaceOnUse">'+
           '<rect x="'+cellW+'" y="0" width="'+GAP+'" height="'+PH+'" fill="var(--bg)"/>'+
           '<rect x="0" y="'+cellH+'" width="'+PW+'" height="'+GAP+'" fill="var(--bg)"/></pattern>';
      ov+='<rect x="'+bx+'" y="'+TOP+'" width="'+bw+'" height="'+bh+
          '" fill="url(#wkcell18_'+i+')" pointer-events="none"/>';
    }
    pat+='</defs>';

    var s='', lived=0;
    /* ONE RECT PER YEAR ROW for the lived run - the runs are HORIZONTAL again.
       Age labels every ten years DOWN THE LEFT of their own fold, never along the top. */
    for(var y=0;y<YEARS;y++){
      var fi=Math.floor(y/rows), ry=y%rows;
      var x0=foldX(fi)+LEFT, yy=TOP+ry*PH;
      var st=y*WEEKS, en=st+WEEKS-1, livedTo=Math.min(en, nowWeek);
      if(livedTo>=st){
        var count=livedTo-st+1;
        lived+=count;
        s+='<rect class="lv" x="'+x0+'" y="'+yy+'" width="'+(count*PW-GAP)+'" height="'+cellH+
           '" fill="var(--grey)" opacity=".6"/>';
      }
      if(y%10===0)
        s+='<text class="wl" x="'+(x0-4)+'" y="'+(yy+cellH)+'" text-anchor="end">'+y+'</text>';
    }
    /* HT-18c (his note 5): "Life graph is missing x and y values - add them." The AGE axis (y) was
       already down the left. The WEEK axis (x) had never been drawn at all, so the grid carried one
       axis and read as a texture. Every ten weeks across the top, and the last one is 52 rather
       than 50 so the row's end is labelled and not implied. */
    /* every ten weeks, then 52 — and the decade STOPS at 40 because 50 and 52 are two cells apart
       and rendered on top of each other ("5052" on the crop). The end of the row is labelled by 52,
       which is the number that means something; 50 is a tick with nothing to say. */
    for(var wx=0; wx<=WEEKS-10; wx+=10){
      s+='<text class="wl wlx" x="'+(LEFT+wx*PW)+'" y="'+(TOP-3)+'" text-anchor="middle">'+
         wx+'</text>';
    }
    /* anchored END: centred on the grid's right edge it hung past the svg and rendered as "5" */
    s+='<text class="wl wlx" x="'+(LEFT+WEEKS*PW-GAP)+'" y="'+(TOP-3)+'" text-anchor="end">'+
       WEEKS+'</text>';
    /* the logged weeks, each its own cell on the ramp, each carrying its own tooltip */
    Object.keys(by).forEach(function(k){
      var wi=+k, yr=Math.floor(wi/WEEKS), wk=wi%WEEKS;
      if(yr>=YEARS) return;
      var fi2=Math.floor(yr/rows), ry2=yr%rows;
      var pct=mean18(by[wi]);
      var tip='week '+wi+' · '+weekRange18(wi,b)+' · '+
              (pct==null?'—':Math.round(pct)+'%');
      s+='<rect class="lw" x="'+(foldX(fi2)+LEFT+wk*PW)+'" y="'+(TOP+ry2*PH)+'" width="'+cellW+
         '" height="'+cellH+'" fill="'+window.__HT16.rampFill(pct)+'" data-wk="'+wi+
         '" data-tip="'+esc(tip)+'"><title>'+esc(tip)+'</title></rect>';
    });

    var cur='';
    var cy=Math.floor(nowWeek/WEEKS), cwk=nowWeek%WEEKS;
    if(cy<YEARS){
      var cfi=Math.floor(cy/rows), cry=cy%rows, cx=foldX(cfi)+LEFT, cyy=TOP+cry*PH;
      /* the current-age row gets a SUBTLE RULE across it, not a label: his age is DATA, derived
         from the birthdate, and it is never typed anywhere (R70.95) */
      cur+='<rect class="cage" data-row="'+cy+'" x="'+cx+'" y="'+cyy+'" width="'+(WEEKS*PW-GAP)+
           '" height="'+cellH+'" fill="none" stroke="var(--outline-today)" stroke-width="1"'+
           ' opacity=".35"/>';
      cur+='<rect class="cw" x="'+(cx+cwk*PW-0.5)+'" y="'+(cyy-0.5)+'" width="'+(cellW+1)+
           '" height="'+(cellH+1)+'" fill="none" stroke="var(--outline-today)"'+
           ' stroke-width="1.5"/>';
    }

    var W=f*foldW+(f-1)*FOLDGAP, H=TOP+rows*PH-GAP;
    /* the drawn size IS the viewBox size, so preserveAspectRatio has nothing left to letterbox:
       one user unit is one CSS pixel and the grid ends where the box ends. */
    var dW=Math.round(W), dH=Math.round(H);
    /* the phone keeps the BARE `.wkscroll` HT-17 used: `.natural` carries `svg{width:auto}`, which
       overrides the width/height attributes the plan just computed and stretched a 276x502 grid to
       546x1016 (MEASURED). Bare `.wkscroll` is `overflow-x:auto` and nothing else. */
    host.innerHTML='<div class="wkscroll'+(desktop()?' h18fit':'')+'">'+
      '<svg class="wkg h18life" viewBox="0 0 '+W+' '+H+'" width="'+dW+'" height="'+dH+
      '" preserveAspectRatio="xMinYMin meet">'+pat+bg+s+ov+cur+'</svg></div>';
    host.setAttribute('data-h18','1');      /* the stamp watchLife() looks for */
    host.setAttribute('data-lived', lived);
    host.setAttribute('data-cols', WEEKS);
    host.setAttribute('data-rows', YEARS);
    host.setAttribute('data-folds', f);
    /* P4 asks data-cell to record BOTH, and the axis-style audit trail is the honest place for
       it: `6.74x6.29` says non-square out loud where a single number would hide it. */
    host.setAttribute('data-cell', cellW.toFixed(2)+'x'+cellH.toFixed(2));
    host.setAttribute('data-cellw', cellW.toFixed(2));
    host.setAttribute('data-cellh', cellH.toFixed(2));
    host.setAttribute('data-scale', plan.scale.toFixed(3));
    host.setAttribute('data-drawn', dW+'x'+dH);
    host.setAttribute('data-plan', plan.table);
    return true;
  }

  /* ---- HT-20 P8 · A WEEK OPENS ITS DAYS (closes HT-19 B4) -------------------------------
     Every cell in the life grid already carried `data-wk` — its week index — and nothing listened
     for a click on it. HT-19 B4 shipped the day axis as a control and left this half unbuilt, so
     the one chart that covers a whole life was the one chart you could not navigate from.
     A week is not a day, so it cannot simply `goDay`: it opens a PICKER of its seven days, each
     with its weekday, its date and what that day scored, and the pick is what calls `goDay`.
     Days that have not happened are listed but not clickable — a life grid runs to age 100, so
     most weeks in it are future, and a future day is a fact about the calendar, not a defect. */
  function wkPickClose(){
    var n=document.getElementById('h20wk');
    if(n && n.parentNode) n.parentNode.removeChild(n);
  }
  function openWeek(wi){
    var ins=document.getElementById('h16Ins'); if(!ins) return false;
    var bd=(S.priv0 && S.priv0.birth_date) ? new Date(S.priv0.birth_date+'T12:00:00') : null;
    if(!bd || isNaN(bd)) return false;
    wkPickClose();
    var start=new Date(bd.getTime() + wi*6048e5);
    var rows='', tk=today();
    for(var i=0;i<7;i++){
      var d=new Date(start.getTime() + i*864e5), k=dk(d);
      var future = k>tk;
      var r=S.byDate[k];
      var pct=(r && r.pct!=null && loggedOn(k)) ? Math.round(r.pct) : null;
      var rf=window.__HT16 && window.__HT16.rampFill;
      rows += '<button class="h20wkd'+(future?' off':'')+(k===S.date?' on':'')+'" type="button"'+
        (future?' disabled':' data-h20d="'+k+'"')+'>'+
        /* `mdate` already reads "Mon Sep 7" — a second weekday span printed "MonMon Sep 7". */
        '<span class="k">'+esc(mdate(k)||k)+'</span>'+
        '<span class="p">'+(pct==null?(future?'—':'not logged')
            :('<i style="background:'+(rf?rf(pct):'var(--grey)')+'"></i>'+pct+'%'))+'</span>'+
        '</button>';
    }
    var n=document.createElement('div');
    n.id='h20wk'; n.className='h20wk';
    n.innerHTML='<div class="h20wkh">WEEK '+wi+'<span class="sp"></span>'+
      '<button class="h20x" type="button" data-h20x>close</button></div>'+
      '<div class="h20wkb">'+rows+'</div>';
    ins.appendChild(n);
    n.addEventListener('click', function(e){
      if(e.target.closest('[data-h20x]')){ wkPickClose(); return; }
      var b=e.target.closest('[data-h20d]'); if(!b) return;
      var k=b.getAttribute('data-h20d');
      wkPickClose();
      goDay(k);
      if(typeof phone==='function' && phone() && window.__HT13_TAB) window.__HT13_TAB('today');
    });
    return true;
  }
  function bindWeekPick(){
    var host=document.getElementById('vWeeks');
    if(!host || host.__h20pick) return false;
    host.__h20pick=1;
    /* delegated on the HOST, not on the cells: the grid is re-rendered on every repaint and a
       listener bound to a cell dies with it. This is the same lesson watchLife() records. */
    host.addEventListener('click', function(e){
      var c=e.target.closest('[data-wk]'); if(!c) return;
      openWeek(+c.getAttribute('data-wk'));
    });
    return true;
  }

  /* ---- HT-18e (D) - SATURDAY IS ONE BOX (Cory 2026-09-07 note 4) ------------------------
     "For every Saturday on this chart, I want it to be auto populated to only one checkbox and
     just a check mark for Sabbath. I'll just check it every Sabbath that I did take the Sabbath."
     Asked what that should do to the score, he chose: the Sabbath IS the day.

     SO IT IS THE `daily()` SET THAT CHANGES, not the rendering. `saveDay` writes
     `active_set = daily().map(id)` and `pctOf` grades against that same list, so narrowing daily()
     on a Saturday makes the day grade 100 or 0 on one box and makes adherence count it as ONE
     opportunity - which is what "the Sabbath is the whole day" means in the schema rather than
     just on the screen. P4 still holds: active_set is written per day, so past Saturdays keep the
     grade they already have and nothing is repriced.

     IT KEYS OFF THE DAY BEING VIEWED, not off today, so walking back to a Saturday shows that
     Saturday's Sabbath. DEC-055 is not touched: nothing is cut, the standards are all still there
     on the other six days, and Advanced sees every one of them every day. */
  function mdate(k){
    var d=dnum(k); if(!d || isNaN(d)) return '';
    var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return DOW[d.getDay()]+' '+MON[d.getMonth()]+' '+d.getDate();
  }
  function isSabbath(k){
    var d=dnum(k||S.date); return !!d && !isNaN(d) && d.getDay()===6;
  }
  function sabbathHabit(){
    for(var i=0;i<S.habits.length;i++)
      if(/sabbath/i.test(S.habits[i].name||'')) return S.habits[i];
    return null;
  }
  /* ---- HT-19 B3 - THE RULE BEFORE THE ROW (R70.235 · DEC-096) ---------------------------
     4-HT could have added `Sabbath` to Cory's account and deliberately did not, and the reason is
     the second half of this function. A new DAILY standard lands in TODAY'S active_set the moment
     it exists, and his live completion percentage drops on a Tuesday for a standard that only
     means anything on a Saturday. So the exclusion ships in the same commit as the creation:

       Saturday      -> daily() is the SABBATH group and nothing else
       any other day -> daily() is everything EXCEPT the SABBATH group

     `saveDay` writes active_set from daily() and `pctOf` grades against that same list, so both
     halves are one line each and the denominator follows for free. P4 still holds: active_set is
     written per day, so every past day keeps the grade it already has. */
  function isSabbathGroup(h){
    return /^sabbath$/i.test(String(h && h.group_name || '')) || /sabbath/i.test(String(h && h.name || ''));
  }
  var _daily=daily;
  daily=function(){
    var all=_daily.apply(null, arguments);
    if(advanced() || !SABBATH_ONLY_SATURDAY) return all;    /* HT-28: the base daily() is the due set */
    if(isSabbath(S.date)){
      var only=all.filter(isSabbathGroup);
      return only.length? only : all;      /* no Sabbath standard yet: change nothing (HT-18e) */
    }
    return all.filter(function(h){ return !isSabbathGroup(h); });
  };

  /* ---- HT-20 P1a · THE GUARD THAT WAS NOT A GUARD (R70.239) -----------------------------
     MEASURED LIVE 2026-09-08: FIVE active rows named "Sabbath - rest and worship", four of them
     created inside fifty-eight seconds. Four inserts in a minute is not a person clicking.

     THE CAUSE IS ONE LINE, and it is `S.habits` being initialised to `[]`:

         if(!S.hasClosedAt && !S.habits) return;      // meant "wait for the habits to load"

     An empty ARRAY is truthy, so `!S.habits` is false on the first paint and on every paint after
     it — the early return could never fire. And this ran from `quad()`, which runs on EVERY paint.
     A paint that lands before the habits fetch resolves therefore read an empty list, found no
     Sabbath row, and inserted one. Every load of the app added another, and because the rule
     above narrows `daily()` to the SABBATH group on a Saturday, the day meant to be ONE box was
     on its way to being graded out of five.

     SO THE GUARD IS REBUILT ON THREE RULES, and all three are needed:
       1. IT ASKS THE DATABASE AND AWAITS THE ANSWER. Reading a local array that a previous paint
          populated is not a uniqueness check; it is a race with the network. The query also sees
          INACTIVE rows, which `S.habits` never does — so an archived Sabbath row can no longer
          cause a new one to be created.
       2. IT RUNS ONCE PER SESSION, held by a promise, not by a flag set halfway through.
       3. IT NEVER RUNS FROM A RENDER PATH. It is hung off `load()`, which happens once per
          session by construction; `quad()` no longer calls it at all.
     And it REPAIRS what the defect already did: more than one live Sabbath row means keep the
     OLDEST by `created_at` and archive the rest — `active:false` + `archived_at`, the same shape
     `archiveOne()` uses. Data is never deleted (DEC-037 · R70.79). */
  var SAB_NAME='Sabbath - rest and worship', SAB_GROUP='SABBATH';
  var _sabRun=null;
  function ensureSabbath(){
    if(advanced() || !S.me) return null;
    if(_sabRun) return _sabRun;                    /* once per SESSION, never once per paint */
    _sabRun = sabbathOnce().catch(function(e){
      window.__h18SabDone='failed';
      try{ console.log('HT-20 P1a: Sabbath check failed —', e && e.message); }catch(_){}
      return 'failed';
    });
    return _sabRun;
  }
  async function sabbathOnce(){
    var q = await sb.from('habits').select('id,name,active,created_at,sort_order')
                    .eq('user_id', S.me.id);
    if(q && q.error){
      window.__h18SabDone='probe-failed';
      try{ console.log('HT-20 P1a: Sabbath probe failed —', q.error.message); }catch(e){}
      return 'probe-failed';
    }
    var mine=(q && q.data || []).filter(function(r){ return /sabbath/i.test(r.name||''); });
    var live=mine.filter(function(r){ return r.active!==false; });
    /* oldest first. A row with no `created_at` sorts last rather than winning by accident. */
    live.sort(function(a,b){
      var x=String(a.created_at||'￿'), y=String(b.created_at||'￿');
      return x<y?-1:(x>y?1:0); });

    if(live.length>1){
      var keep=live[0], extra=live.slice(1), stamp=new Date().toISOString(), failed=0;
      for(var i=0;i<extra.length;i++){
        var r = await sb.from('habits').update({ active:false, archived_at:stamp })
                        .eq('id',extra[i].id).eq('user_id',S.me.id);
        if(r && r.error) failed++;
      }
      window.__h18SabDone='deduped';
      window.__h18SabKept=keep.id;
      window.__h18SabArchived=extra.map(function(r){ return r.id; });
      try{ console.log('HT-20 P1a: Sabbath rows deduped — kept', keep.id,
                       '('+keep.created_at+'), archived', extra.length, 'failed', failed); }catch(e){}
      if(!failed && typeof reload==='function') await reload();
      return 'deduped';
    }
    if(live.length===1){
      window.__h18SabDone='found';
      try{ console.log('HT-20 P1a: Sabbath standard FOUND —', live[0].name); }catch(e){}
      return 'found';
    }

    /* HT-28 G21: an account without a Sabbath standard is left without one (SABBATH_AUTO_INSERT) */
    if(!SABBATH_AUTO_INSERT){ window.__h18SabDone='absent-left'; return 'absent-left'; }
    var orders=(q && q.data || []).map(function(x){ return x.sort_order||0; });
    var rec={ user_id:S.me.id, name:SAB_NAME, group_name:SAB_GROUP, cadence:'daily',
              minutes:0, active:true,
              sort_order:(orders.length? Math.max.apply(null, orders)+1 : 0) };
    var res = await sb.from('habits').insert(rec);
    if(res && res.error){
      window.__h18SabDone='failed';
      try{ console.log('HT-20 P1a: Sabbath standard NOT created —', res.error.message); }catch(e){}
      return 'failed';
    }
    window.__h18SabDone='created';
    try{ console.log('HT-20 P1a: Sabbath standard CREATED —', SAB_NAME); }catch(e){}
    if(typeof reload==='function') await reload();
    return 'created';
  }

  /* the list is filtered after the paint rather than inside it, because paintLog belongs to the
     base app and every layer here re-asserts over it instead of rewriting it. Idempotent: it reads
     the DOM it is given and hides, never removes (R70.16). */
  function sabbathList(){
    var log=document.getElementById('log'); if(!log) return false;
    var on = !advanced() && isSabbath(S.date);
    var sh = on ? sabbathHabit() : null;
    /* B3: the journal header names the day for what it is */
    var jh=document.querySelector('.colL #jIn > .blk:has(#iDump) > .sh h2');
    if(jh){
      /* HT-29 S0 (A03): the CACHE IS THE MARKUP, not the text. Restoring `textContent` flattened
         `<i class="n">3</i>Journal` into the string "3Journal" and destroyed the element - invisible while
         the number was meant to show, and a stray "3" glued to the word the moment A03 hid `i.n` by CSS. */
      if(!jh.dataset.h19) jh.dataset.h19 = jh.innerHTML;
      /* B4: and on any other day it names THAT day. Clicking a date on the month chart
         already moved the journal there and already saved edits against that date
         (MEASURED: typing into Sep 1 writes day_private for 2026-09-01). What was
         missing was any way to tell — the header said "Journal" whichever day you were
         on — and any way back. */
      jh.innerHTML = (on && sh) ? esc('SABBATH · ' + mdate(S.date))
                   : (S.date===today() ? jh.dataset.h19 : esc(mdate(S.date)));
    }
    var shRow=document.querySelector('.colL #jIn > .blk:has(#iDump) > .sh');
    if(shRow){
      var back=document.getElementById('h19Today');
      if(S.date!==today()){
        if(!back){
          back=document.createElement('button');
          back.id='h19Today'; back.type='button'; back.className='h19today';
          back.setAttribute('data-h19today','1');
          back.textContent='← today';
          back.addEventListener('click', function(){ goDay(today()); });
          shRow.appendChild(back);
        }
        back.hidden=false;
        /* a closed day stays EDITABLE (Cory: "also be editable"); it only says that it is closed */
        var drow=S.byDate[S.date], pip=document.getElementById('h19Closed');
        if(drow && drow.closed_at){
          if(!pip){ pip=document.createElement('span'); pip.id='h19Closed';
                    pip.className='h19closed'; pip.textContent='CLOSED';
                    shRow.insertBefore(pip, back); }
          pip.hidden=false;
        }else if(pip){ pip.hidden=true; }
      }else{
        if(back) back.hidden=true;
        var pip2=document.getElementById('h19Closed'); if(pip2) pip2.hidden=true;
      }
    }
    /* WITHOUT a Sabbath standard nothing changes but the note. daily() already falls through in
       that case, so the day keeps grading on all twenty-six — narrowing the list while the score
       still counted twenty-six would have written a 0% Saturday, which is the opposite of rest. */
    var active = on && !!sh && SABBATH_ONLY_SATURDAY;      /* HT-28: the narrowing is off */
    log.classList.toggle('h18sab', active);
    if(!SABBATH_ONLY_SATURDAY){
      var n0=document.getElementById('h18SabNote'); if(n0) n0.hidden=true;
      return true;
    }
    /* B3: Saturday shows the SABBATH group and nothing else; every other day shows everything
       EXCEPT it. A standard that cannot count today has no business taking a row today — daily()
       already excludes it from the score, and this keeps the list saying the same thing. */
    var byId={}; S.habits.forEach(function(h){ byId[h.id]=h; });
    q('#log .li').forEach(function(li){
      var b=li.querySelector('[data-tog]');
      var id=b?b.getAttribute('data-tog'):null;
      var h=id?byId[id]:null;
      li.hidden = active ? (id!==sh.id)
                         : !!(h && !advanced() && isSabbathGroup(h));
    });
    q('#log .grp, #log .eadd, #log [data-add]').forEach(function(e){ e.hidden = active; });
    /* no Sabbath standard yet: say so where the list was, rather than showing an empty box */
    var note=document.getElementById('h18SabNote');
    if(on && !sh){
      if(!note){ note=document.createElement('div'); note.id='h18SabNote'; log.appendChild(note); }
      note.hidden=false;
      note.innerHTML='<b>Sabbath</b> - add a standard named "Sabbath" and Saturdays will show '+
                     'only that box.';
    }else if(note){ note.hidden=true; }
    return true;
  }

  /* ---- HT-20 P9 · THE DOC MIRROR RETIRES UNBUILT (R70.260 · R70.79 · DEC-037) ------------
     The Apps Script journal mirror lived here: a Settings field for a Web App URL, a shared
     secret, a no-cors POST of the day's journal, and a `DOC / SENT` pip beside the journal head.
     IT NEVER WENT LIVE. Its live half was always blocked on one authorisation only Cory could
     give (deploy the script, execute-as-me, authorize), and on 2026-09-07 17:45 he cancelled the
     route: "I don't wanna set all that up... can we begin filing our journal to automatically
     populate an Obsidian file?" One vault (R70.256) answers the same need with no endpoint, no
     consent screen, no shared secret and no second home for the text.
     So it is REMOVED rather than hidden — the code is in git history and the setup document is
     archived (DEC-037); what is not here is a dead POST target and a pip that could go green for
     a document nobody reads. D-HT-18e-1 is CLOSED, not owed. The Google Doc itself is untouched;
     if Cory ever wants one it is a read-only export from the vault, never a second home. */

  /* ---- HT-19 B1 - THE RIGHT BLOCK (R70.233) ----------------------------------------------
     "Make the completions smaller so the journal and the charts get bigger." Measured before:
     COMPLETION 781 x 697 - 47% of the grid width - against JOURNAL 579 x 336 and a LIFE grid
     302 wide. One DOM move, the same shape as HT-18's quadrants(): a #h19Right block that holds
     the journal and the two charts side by side, so COMPLETION can take 30% of the width and LIFE
     can have the whole bottom of the right-hand side. */
  function rightBlock(){
    var grid=document.querySelector('.grid'); if(!grid) return false;
    var colL=document.querySelector('.colL'), ch=document.getElementById('h18Charts');
    if(!colL || !ch) return false;
    var r=document.getElementById('h19Right');
    if(!r){ r=document.createElement('div'); r.id='h19Right'; grid.appendChild(r); }
    if(colL.parentElement!==r){ mark(colL); r.appendChild(colL); }
    if(ch.parentElement!==r){ mark(ch); r.appendChild(ch); }
    return true;
  }
  function unRightBlock(){
    home(document.querySelector('.colL'));
    home(document.getElementById('h18Charts'));
  }
  /* ---- the re-assert, the way the seven layers before this one do ------------------------ */
  function quad(){
    if(advanced()) return;
    if(desktop()){ quadrants(); rightBlock(); journalBottom(); bindGrow(); unGrow(); chartsFit();
                   adhLine(); }
    else { unquadrants(); unRightBlock(); unjournalBottom(); unAdh(); }
    /* HT-20 P1a: `ensureSabbath()` USED TO BE CALLED HERE, and that is the whole defect — quad()
       is a render path and runs on every paint. It is hung off load() below instead. */
    /* HT-21 S9: GROUP RUNS ON THE PHONE TOO, and that is a defect the audit found rather than a
       feature. `groupBlock()` was in the desktop branch only, so on a phone there was no GROUP
       panel and therefore no DETAIL door at all — a page reachable at no width is a page that
       does not exist (R70.211). It renders into `#h16Ins`, which the phone shows under the VIEWS
       tab, so the door is where a phone user already looks for their charts. */
    /* groupBlock() FIRST, and the order is load-bearing: it inserts the GROUP table into
       `#h16Ins`, which changes how much room `#vWeeks` gets. Running it after paintLife18 sized
       the grid to a 334px host that then became 380 — MEASURED live as 46px of dead width, the
       exact thing P4 removed. The panel is settled before the grid is measured. */
    groupBlock();
    paintLife18(); watchLife(); sabbathList(); watchLog(); bindWeekPick();          /* S6 - both modes: the phone gets the same shape at a fixed cell */
    document.documentElement.setAttribute('data-ht18','1');
  }
  /* ---- HT-18e (A) - THE LIFE GRID STOPS REVERTING (Cory 2026-09-07 note 1) --------------
     "Every time I change the month, it populated the life chart back to the original issue view."
     REPRODUCED: click the month nav and the week axis goes 6 labels -> 0. HT-16's own repaint()
     runs on that click and calls paintWeeks16(), which rewrites #vWeeks with the HT-16 renderer -
     and HT-18's quad() does not re-run, because the month nav never goes through paintAll or
     paintLog. Wrapping the exported __HT16.repaint would not catch it either: HT-16's click
     handler calls its LOCAL repaint, which no seam reaches.
     So the guard is on the RESULT, not on the caller. paintLife18 stamps the host, and an observer
     repaints whenever that stamp goes missing - which is exactly when something else has
     overwritten the grid, whatever path it took. No loop: our own write leaves the stamp in place. */
  /* the same lesson as watchLife, and it arrived the same way: sabbathList() ran, then paintLog
     rebuilt #log's innerHTML underneath it and every `hidden` went with the old rows (MEASURED:
     the h18sab class survived on the container, 0 rows carried `hidden`, and the note was gone).
     Call order is not something a layer on top of a base app can rely on, so the filter watches
     the result instead. Appending the note fires the observer once more and then settles, because
     the second pass finds nothing left to change. */
  function watchLog(){
    var log=document.getElementById('log');
    if(!log || log.__h18obs || !window.MutationObserver) return;
    log.__h18obs=new MutationObserver(function(){
      if(advanced()) return;
      clearTimeout(log.__h18t);
      log.__h18t=setTimeout(function(){ sabbathList(); }, 30);
    });
    log.__h18obs.observe(log, { childList:true, subtree:false });
  }

  function watchLife(){
    var host=document.getElementById('vWeeks');
    if(!host || host.__h18obs || !window.MutationObserver) return;
    host.__h18obs=new MutationObserver(function(){
      if(!desktop() || advanced()) return;
      /* the test is the SVG, not an attribute. `data-h18` was the first attempt and it does not
         work: paintWeeks16 replaces the host's CHILDREN and leaves its attributes alone, so the
         stamp survived the overwrite and the observer skipped the one case it exists for
         (MEASURED: week axis 6 -> 0 with the stamp still reading '1'). `svg.h18life` is a node our
         renderer owns and theirs destroys, so its absence is the fact we actually need. */
      if(host.querySelector('svg.h18life')) return;       /* our own paint; nothing to do */
      clearTimeout(host.__h18t);
      host.__h18t=setTimeout(function(){ paintLife18(); }, 40);
    });
    host.__h18obs.observe(host, { childList:true, subtree:false });
  }

  var _pa=paintAll;  paintAll  = function(){ _pa.apply(null,arguments); quad(); };
  var _pl=paintLog;  paintLog  = function(){ _pl.apply(null,arguments); quad(); };
  /* HT-20 P1a: THE SABBATH CHECK HANGS OFF `wire`, NOT OFF A PAINT.
     `boot()` is `await load(); wire(); paintAll();` — so wire() runs EXACTLY ONCE per session,
     after the habits have loaded and before anything has been painted, and a failed sign-in never
     reaches it. That is the whole shape the check needs, and none of it is a render path.
     (`load` itself cannot be wrapped here: boot()'s first `await load()` is already in flight
     while this layer is still being parsed, so a wrapper on it would miss the one call that
     matters. Signing in reloads the page, so a later session boots the same way.) */
  var _wr=wire;      wire      = function(){ var r=_wr.apply(null,arguments);
                                               ensureSabbath(); loadCircle(); return r; };
  if(!window.__HT18_RESIZE){
    window.__HT18_RESIZE=1;
    window.addEventListener('resize', function(){
      clearTimeout(window.__HT18_T); window.__HT18_T=setTimeout(quad, 160); });
  }
  window.__HT18 = { quad:quad, quadrants:quadrants };

  /* ---- HT-18c - THE DAY CLOSES ITSELF (Cory 2026-09-07, note 10) -----------------------
     "Remove Close the day - the day closes when the day ends and it auto populates to the next
     day." He then chose, when asked what the timestamp should be: the last habit you checked that
     day - the only option that leaves the USUAL / on-time column meaning anything.

     THIS CONTRADICTS HT-13 G2 IN WRITING AND THE CONTRADICTION IS REPORTED, NOT HIDDEN. saveDay's
     own comment says "an autosave must never stamp a day as closed, or the column stops meaning
     'you finished'". Under R70.16 that reasoning stands; the owner has overridden the ruling with
     his eyes open, and the meaning of the column changes with it: closed_at now reads "when you
     last touched this day", not "when you declared it done". Every check-off moves it forward, so
     at rollover it holds the last one by itself - no scheduler, no synthetic midnight.
     PAST DAYS STAY NULL. There is no per-check-off timestamp in the schema, so the last touch on a
     day already gone is not recoverable; this fills forward only, and the receipt says so. */
  var _saveDay=saveDay;
  saveDay=function(opts){
    opts=opts||{};
    if(!advanced() && S.hasClosedAt) opts.close=true;
    return _saveDay.call(null, opts);
  };

  function boot(){ if(advanced()) return; if(!S.me) return; quad(); }
  if(document.readyState==='complete') setTimeout(boot,320);
  else window.addEventListener('load',function(){ setTimeout(boot,320); });
})();


/* ================= HT-24 C6 · THE WAY IN, AND THE INSTALL HINT =================================
   "MY IPHONE LINK DIDN'T WORK" WAS DIAGNOSED BEFORE ANYTHING WAS BUILT, and the diagnosis is why
   this layer ships a sentence rather than a fix. Measured against the live site 2026-09-10:

     manifest   200 · content-type application/manifest+json; charset=utf-8   <- CORRECT
     manifest   name · short_name · start_url ./ · scope ./ · display standalone · icons 192+512
     head       apple-mobile-web-app-capable · apple-mobile-web-app-title · rel=manifest ·
                apple-touch-icon · 12 apple-touch-startup-image · viewport-fit=cover
     sw         ht-v31

   The install path on the server is complete and the MIME type - the one candidate that would
   have been a real bug - is right. That eliminates it with evidence and leaves the likeliest
   cause: ON iOS, "Add to Home Screen" EXISTS ONLY IN SAFARI. A link tapped in Messages, Slack or
   any other app opens an in-app browser whose Share sheet has no such row. Nothing is broken;
   the person is in the wrong browser and the app never said so.

   R70.211 is the reason this is a banner and not a note in a receipt: the door exists, but if
   nothing on screen names the obstacle, the door may as well not.
   ============================================================================================ */
(function(){
  function isIOS(){
    return /iP(hone|ad|od)/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  /* Chrome/Firefox/Edge on iOS are Safari's engine wearing another name, and NONE of them offer
     Add to Home Screen. So the test is "is this the real Safari", not "is this WebKit". */
  function isRealSafari(){
    var ua = navigator.userAgent;
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Line|Snapchat/.test(ua);
  }
  function installed(){
    try{ return window.matchMedia('(display-mode: standalone)').matches
                || navigator.standalone === true; }catch(e){ return false; }
  }
  var KEY = 'ht_ios_hint_dismissed';
  function dismissed(){ try{ return localStorage.getItem(KEY) === '1'; }catch(e){ return false; } }

  /* THE ONE SENTENCE THAT NAMES THE OBSTACLE. Two taps, and the first of them is the one nobody
     tells you about. */
  function hintHTML(){
    return '<div class="iosh" role="note">' +
      '<div class="ioshb">' +
        '<b>Add HT to your home screen</b>' +
        '<span>Open this page in <b>Safari</b> first — Chrome and in-app browsers on iPhone do not ' +
        'offer it. Then tap <b>Share</b> and <b>Add to Home Screen</b>.</span>' +
      '</div>' +
      '<button class="iosx" type="button" data-iosx aria-label="dismiss">\u00d7</button>' +
    '</div>';
  }

  function showHint(){
    if(!isIOS() || installed() || dismissed()) return false;
    if(document.getElementById('iosHint')) return true;
    var n = document.createElement('div');
    n.id = 'iosHint';
    n.innerHTML = hintHTML();
    /* NOT inside the installed app, and not on a desktop - both are checked above. It goes at the
       top of the page because an install hint below the fold is an install hint nobody reads. */
    document.body.insertBefore(n, document.body.firstChild);
    n.addEventListener('click', function(e){
      if(!e.target.closest('[data-iosx]')) return;
      try{ localStorage.setItem(KEY, '1'); }catch(err){}
      n.parentNode.removeChild(n);
    });
    return true;
  }

  /* ---- THE JOIN LINK -----------------------------------------------------------------------
     The link is the app's own URL with the circle's join code on it. It carries NO backend: the
     code is read on arrival and pre-fills the join field, and everything else the person does is
     the ordinary signup the app already has.
     THE SEND IS CORY'S (R45.2). This renders it and copies it; it never sends anything. */
  function appBase(){
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }
  function joinLink(code){
    return appBase() + '?join=' + encodeURIComponent(code || '');
  }
  function joinMessage(code){
    return 'HT — a daily standard, one number a day.\n' +
           joinLink(code) + '\n' +
           'Open it in Safari on your iPhone, then Share \u2192 Add to Home Screen.';
  }
  /* A QR with no library and no network: the link is drawn as text under a heading and the code
     is large enough to read across a table. A real QR needs a generator, and pulling one in for
     this would add a CDN dependency to a page that has exactly one. Named, not pretended. */
  window.__HT24_JOIN = { link: joinLink, message: joinMessage, base: appBase };

  /* the arriving side: ?join=CODE pre-fills, and the URL is cleaned so a refresh does not re-apply */
  function readJoin(){
    var m = /[?&]join=([^&]+)/.exec(location.search);
    if(!m) return null;
    var code = decodeURIComponent(m[1]);
    try{ localStorage.setItem('ht_join_code', code); }catch(e){}
    /* SAME PATH, NO QUERY. `replaceState` to an absolute origin is rejected on file://
       (SecurityError), so the fixture silently kept `?join=` and the golden caught it.
       `location.pathname` is same-origin by construction and behaves identically on
       https - the URL a person sees after arriving is the app's own, with no code on it. */
    try{ history.replaceState({}, '', location.pathname); }catch(e){}
    return code;
  }

  function boot(){
    readJoin();
    showHint();
  }
  window.__HT24_C6 = { isIOS:isIOS, isRealSafari:isRealSafari, installed:installed,
                       showHint:showHint, hintHTML:hintHTML, readJoin:readJoin,
                       joinLink:joinLink, joinMessage:joinMessage };
  if(document.readyState === 'complete') setTimeout(boot, 200);
  else window.addEventListener('load', function(){ setTimeout(boot, 200); });
})();

/* ======================= HT-26 S2 · HT-24's C3a (THE JOURNAL) AND C5 (INSIGHTS) =======================
   C3a - EVERY USER GETS THEIR OWN JOURNAL: every past day, searchable, and a Markdown export - no
   setup, no Obsidian. It reads only the signed-in user's own S.privAll (their session, their rows),
   so it needs no lane credential. Until now the only past-entries view was the full sheet's #jArc:
   fourteen days, no search, no export, no brain dump - and hidden in simple mode on every screen
   (measured 2026-09-10: checkVisibility() false on phone Today, phone Views and desktop).
   C5 - TODAY carries a three-number strip (today % · 7-day % · streak) and a tap opens INSIGHTS, which
   shows EXACTLY FIVE, all derived - none of them is an input: per-standard 30-day % with its trend,
   AT RISK (missed on 3+ logged days running), best / worst weekday, rating vs completion, and the
   circle compare. HT-13's three cards are not lost: they move into MORE (hidden, never removed -
   R70.138). THE PRIVACY LINE STAYS ON SCREEN, and the circle compare reads only what paintCircle()
   already fetched - `days.select('user_id,date,pct')` stays the ONE query that crosses users. */
(function(){
  var DOWL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function pctOn(k){ var r=S.byDate[k]; return (r && r.pct!=null && loggedOn(k)) ? r.pct : null; }
  function mean(a){ return a.length ? a.reduce(function(x,y){ return x+y; },0)/a.length : null; }
  function lastDays(n, from){ var out=[], e=from||today(); for(var i=0;i<n;i++) out.push(shift(e,-i)); return out; }
  function arrow(d){ return d==null ? '<i class="fl" title="no earlier 30 days to compare">·</i>'
    : d>=5 ? '<i class="up" title="up '+d+' points on the 30 days before">↑</i>'
    : d<=-5 ? '<i class="dn" title="down '+(-d)+' points on the 30 days before">↓</i>'
    : '<i class="fl" title="within 5 points of the 30 days before">→</i>'; }
  function isDaily(h){ return !(typeof isWeekly==='function' && isWeekly(h)); }
  function due(h,k){ return typeof dueOn==='function' ? dueOn(h,k) : true; }

  /* ---- the numbers - every one derived from what TODAY already stores ----------------------- */
  function stdPct(h, days){
    var on=0, n=0;
    days.forEach(function(k){ if(k>today() || !loggedOn(k) || !due(h,k)) return; n++; if(doneOn(h,k)) on++; });
    return n ? Math.round(on/n*100) : null;
  }
  function streak(){                           /* days in a row at 100%; today joins only once complete */
    var k=today(), n=0;
    if(pctOn(k)!==100) k=shift(k,-1);
    for(var i=0;i<1000 && pctOn(k)===100;i++){ n++; k=shift(k,-1); }
    return n;
  }
  function stripNums(){
    /* HT-29 (PASTE 133 Ruling 1): a day with nothing checked is 0%, and an average never skips an unlogged day -
       the strip's 7 days divides by seven, the same arithmetic as the group's lines */
    var t=pctOn(today());
    var w=lastDays(7).map(function(k){ var v=pctOn(k); return v==null ? 0 : v; });
    return { today:(t==null?0:t), week:Math.round(mean(w)), streak:streak() };
  }
  function perStandard(){
    var cur=lastDays(30), prev=lastDays(30, shift(today(),-30));
    return S.habits.filter(isDaily).map(function(h){
      var a=stdPct(h,cur), b=stdPct(h,prev);
      return { n:nameOf(h.name), pct:a, d:(a==null||b==null)?null:a-b };
    }).filter(function(r){ return r.pct!=null; })
      .sort(function(x,y){ return x.pct-y.pct; });
  }
  function atRisk(){                           /* the KEEPCUT signal: missed on each of the last 3+ days it was due */
    var logged=lastDays(60).filter(function(k){ return loggedOn(k); });
    var out=[];
    S.habits.filter(isDaily).forEach(function(h){
      var run=0;
      for(var i=0;i<logged.length;i++){
        if(!due(h,logged[i])) continue;
        if(doneOn(h,logged[i])) break;
        run++;
      }
      if(run>=3) out.push({ n:nameOf(h.name), run:run });
    });
    return out.sort(function(a,b){ return b.run-a.run; });
  }
  function weekdays(){
    var buckets=[[],[],[],[],[],[],[]];
    lastDays(84).forEach(function(k){ var p=pctOn(k); if(p!=null) buckets[dnum(k).getDay()].push(p); });
    var m=buckets.map(function(a){ return a.length>=2 ? Math.round(mean(a)) : null; });
    var best=null, worst=null;
    m.forEach(function(v,i){ if(v==null) return;
      if(best==null || v>m[best]) best=i; if(worst==null || v<m[worst]) worst=i; });
    return { m:m, best:best, worst:worst };
  }
  function ratingVsCompletion(){
    var hi=[], lo=[];
    lastDays(90).forEach(function(k){ var p=pctOn(k), r=ratingOf(k); if(p==null || r==null) return;
      (p>=80?hi:lo).push(r); });
    return { hi:hi.length?Math.round(mean(hi)*10)/10:null, lo:lo.length?Math.round(mean(lo)*10)/10:null,
             nh:hi.length, nl:lo.length };
  }

  /* ---- C5 · the strip on TODAY ---------------------------------------------------------------- */
  /* WHERE THE STRIP SITS, AND WHY IT MOVES. HT-18's desktop is a measured full-height quadrant layout
     (golden_ht18: quadrant heights, gutters, the brain dump's floor) - a row added to its left column
     broke 22 of those checks in the first cut of this layer. So at 1024px and up the strip rides the
     masthead's existing row, beside the date, and adds no height to anything. On the phone it closes
     TODAY's column - after the inputs, never above them (R70.17: no output above an input). */
  function placeStrip(b){
    if(window.innerWidth>=1024){
      var d=el('mDate'); if(!d || !d.parentNode) return false;
      if(d.nextSibling!==b) d.parentNode.insertBefore(b, d.nextSibling);
      return true;
    }
    var col=document.querySelector('.colL'); if(!col) return false;
    if(col.lastChild!==b) col.appendChild(b);
    return true;
  }
  function paintStrip(){
    var b=el('tStrip');
    if(!b){
      b=document.createElement('button'); b.id='tStrip'; b.type='button'; b.className='tstrip';
      b.setAttribute('aria-label','open Insights');
      b.addEventListener('click', openInsights);
    }
    if(!placeStrip(b)) return;
    var s=stripNums();
    b.innerHTML='<span class="k">Today</span><b>'+(s.today==null?'—':s.today+'%')+'</b>'+
      '<span class="k">7 days</span><b>'+(s.week==null?'—':s.week+'%')+'</b>'+
      '<span class="k">Streak</span><b>'+s.streak+'</b>'+
      /* HT-31 S4.15: the desktop's door to a page that is no longer there (Cory 9/21). The phone,
         where Insights still is, keeps it. */
      ((!HT31_DESK_INSIGHTS && !h31Phone()) ? '' : '<span class="go">Insights ›</span>');
  }
  /* PHONE: Insights and the Journal are panels on the Views tab. DESKTOP: the quadrants are full, so they
     open in the app's own overlay - the panel NODES are moved in (HT-13's #vInsights rides inside
     More), and moved back to the grid before anything else rewrites the overlay or when it closes. */
  function openInsights(){
    paintFive(); paintJ();
    if(window.innerWidth<1024){
      if(window.__HT13_TAB) window.__HT13_TAB('views');
      setTimeout(function(){ var n=el('h26Ins'); if(n) n.scrollIntoView({block:'start'}); }, 80);
      return;
    }
    openOv('Insights and journal', '<div id="h26Ov"></div>', function(){
      var h=el('h26Ov'); if(!h) return;
      ['h26Ins','h26Jrn'].forEach(function(id){ var n=el(id); if(n) h.appendChild(n); });
    });
  }
  function restorePanels(){
    var grid=document.querySelector('.grid'); if(!grid) return;
    ['h26Ins','h26Jrn'].forEach(function(id){ var n=el(id); if(n && n.parentNode!==grid) grid.appendChild(n); });
  }
  var _oo=openOv; openOv=function(){ restorePanels(); return _oo.apply(null, arguments); };
  function guardOverlay(){
    var ov=el('ov'); if(!ov || ov.__h26obs || !window.MutationObserver) return;
    ov.__h26obs=new MutationObserver(function(){ if(!ov.classList.contains('on')) restorePanels(); });
    ov.__h26obs.observe(ov, { attributes:true, attributeFilter:['class'] });
  }
  /* TWO PANELS OF THEIR OWN, beside HT-16's. HT-13's #vViews survives only as a holder of hidden
     instruments in simple mode (app.css says so) and #vInsights is display:none on every layout - the
     first cut of this layer drew into them and measured invisible on the desktop. So Insights and the
     Journal are grid children like #h16Ins: shown on the phone's Views tab, placed on the desktop grid. */
  function ensurePanel(id, title, cap, body){
    var n=el(id); if(n) return n;
    var grid=document.querySelector('.grid'); if(!grid) return null;
    n=document.createElement('div'); n.id=id; n.className='h16p h26p';
    n.innerHTML='<div class="sh"><h2>'+title+'</h2><span class="ln"></span><span class="c" id="'+cap+'"></span></div>'+body;
    grid.appendChild(n);
    return n;
  }

  /* ---- C5 · INSIGHTS, EXACTLY FIVE -------------------------------------------------------------- */
  function card(id, t, line, body){
    return '<div class="vins c5" data-c5="'+id+'"><div class="lab">'+t+'</div><div class="vline">'+line+'</div>'+(body||'')+'</div>';
  }
  function five(){
    var out=[];
    var ps=perStandard();
    out.push(card('std', 'Each standard · 30 days',
      ps.length ? 'Weakest first. The arrow compares with the 30 days before.' : 'Log a few days and every standard gets its own number here.',
      ps.length ? '<div class="c5rows">'+ps.map(function(r){
        return '<div class="c5r"><span class="n">'+esc(r.n)+'</span><span class="v num">'+r.pct+'%</span>'+arrow(r.d)+'</div>';
      }).join('')+'</div>' : ''));
    var ar=atRisk();
    out.push(card('risk', 'At risk',
      ar.length ? '<b>'+ar.length+' standard'+(ar.length===1?'':'s')+'</b> missed on 3 or more logged days running.'
                : 'Nothing is at risk: no standard has been missed on 3 logged days in a row.',
      ar.length ? '<div class="c5rows">'+ar.map(function(r){
        return '<div class="c5r"><span class="n">'+esc(r.n)+'</span><span class="v num">'+r.run+' days</span></div>';
      }).join('')+'</div>' : ''));
    var wd=weekdays();
    out.push(card('dow', 'Best and worst weekday',
      wd.best==null ? 'A weekday needs to come round a couple of times before it has a number.'
        : '<b>'+DOWL[wd.best]+'s</b> are strongest ('+wd.m[wd.best]+'%), <b>'+DOWL[wd.worst]+'s</b> weakest ('+wd.m[wd.worst]+'%) - last 12 weeks.'));
    var rc=ratingVsCompletion();
    out.push(card('rate', 'Rating against completion',
      (rc.hi==null || rc.lo==null) ? 'Needs rated days on both sides of 80% complete before it can compare.'
        : 'Days 80%+ complete rate <b>'+rc.hi+'</b>; the rest rate <b>'+rc.lo+'</b> ('+rc.nh+' and '+rc.nl+' days, last 90). '+
          '<i>Association only - it does not say which way round it runs.</i>'));
    var cv=S.circleView;
    out.push(card('circle', 'Your circle',
      (!cv || !cv.rows || !cv.rows.length) ? 'No circle yet. When you have one, this compares completion % only.'
        : 'Last 7 days, completion % only. Group '+(cv.group==null?'—':cv.group+'%')+'.',
      (cv && cv.rows && cv.rows.length) ? '<div class="c5rows">'+cv.rows.map(function(r){
        return '<div class="c5r"><span class="n">'+esc(r.name)+(r.you?' <span class="you">you</span>':'')+'</span><span class="v num">'+(r.avg==null?'—':r.avg+'%')+'</span></div>';
      }).join('')+'</div>' : ''));
    return out;
  }
  function paintFive(){
    var p=ensurePanel('h26Ins', 'Insights', 'h26InsC',
      '<div id="c5Five"></div>'+
      /* Ruling 4 (paste 133) rewrote this line; HT-29's Insights repaints it too, and the source must not keep
         the retired sentence for any paint that does not reach that repaint. */
      '<div class="c5priv">Your journal and your why are yours alone. The group sees standards, check-offs and the day’s number.</div>'+
      '<details id="c5More" class="c5more"><summary>More</summary></details>');
    if(!p) return;
    el('c5Five').innerHTML=five().join('');
    el('h26InsC').textContent='five';
    /* MORE: HT-13's three cards are not copied (a copy would duplicate #vDow) - their own node is MOVED
       in, once, and insights() keeps drawing into it by id. Hidden until opened; never removed. */
    var legacy=el('vInsights'), more=el('c5More');
    if(legacy && more && legacy.parentNode!==more) more.appendChild(legacy);
  }

  /* ---- C3a · THE JOURNAL ---------------------------------------------------------------------- */
  var FIELDS=[['why','Why'],['tasks','Completed'],['brain_dump','Journal'],['prayer','Prayer']];   /* HT-30 S4.10 */
  function entries(q){
    q=(q||'').trim().toLowerCase();
    return Object.keys(S.privAll).filter(function(k){
      var p=S.privAll[k]; if(!p) return false;
      var txt=FIELDS.map(function(f){ return p[f[0]]||''; }).join('\n');
      if(!txt.trim()) return false;
      return !q || txt.toLowerCase().indexOf(q)>=0;
    }).sort().reverse();
  }
  function journalMd(q){
    var ks=entries(q), lines=['# Journal - exported '+today(), ''];
    lines.push(ks.length+' entr'+(ks.length===1?'y':'ies')+((q||'').trim()?' matching "'+q.trim()+'"':'')+'.', '');
    ks.forEach(function(k){
      var p=S.privAll[k], d=dnum(k), r=S.byDate[k];
      lines.push('## '+k+' · '+WD[d.getDay()]+(p.rating!=null?' · rated '+p.rating+'/10':'')+
                 (r&&r.pct!=null?' · '+r.pct+'% complete':''), '');
      FIELDS.forEach(function(f){ var v=(p[f[0]]||'').trim(); if(v) lines.push('**'+f[1]+':**', '', v, ''); });
    });
    return lines.join('\n');
  }
  function ensureJournal(){
    if(el('vJournal')) return true;
    var p=ensurePanel('h26Jrn', 'Journal', 'vJournalC',
      '<div class="vjbar"><input id="vJFind" type="search" placeholder="Search your journal" autocomplete="off" '+
        'aria-label="search your journal"><button id="vJExport" type="button" class="tbtn">Export .md</button></div>'+
      '<div id="vJournal"></div>');
    if(!p) return false;
    el('vJFind').addEventListener('input', paintJ);
    el('vJExport').addEventListener('click', function(){
      var md=journalMd(el('vJFind').value), a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([md], {type:'text/markdown'}));
      a.download='ht-journal-'+today()+'.md'; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    });
    return true;
  }
  var SHOW=30;
  function paintJ(){
    if(!ensureJournal()) return;
    var q=el('vJFind').value, ks=entries(q), host=el('vJournal');
    el('vJournalC').textContent = ks.length+' entr'+(ks.length===1?'y':'ies')+(q.trim()?' found':'');
    if(!ks.length){
      host.innerHTML='<div class="empty">'+(q.trim()?'Nothing matches that.':'Nothing written yet. What you write on TODAY lands here, every day of it.')+'</div>';
      return;
    }
    host.innerHTML=ks.slice(0,SHOW).map(function(k){
      var p=S.privAll[k], d=dnum(k), r=S.byDate[k];
      return '<div class="vje" data-jd="'+k+'"><div class="h"><b>'+WD[d.getDay()]+' '+MO[d.getMonth()]+' '+d.getDate()+
        (d.getFullYear()!==dnum(today()).getFullYear()?' '+d.getFullYear():'')+'</b>'+
        (p.rating!=null?'<s>'+p.rating+'/10</s>':'')+'<span>'+(r&&r.pct!=null?r.pct+'%':'')+'</span></div>'+
        FIELDS.map(function(f){ var v=(p[f[0]]||'').trim();
          return v ? '<p><span class="lab">'+f[1]+'</span>'+esc(v)+'</p>' : ''; }).join('')+'</div>';
    }).join('')+(ks.length>SHOW?'<div class="empty">'+(ks.length-SHOW)+' more - search to narrow, or export them all.</div>':'');
  }

  function boot26(){
    if(!S.me || !document.querySelector('.grid')) return;
    guardOverlay(); paintStrip(); paintFive(); paintJ();
  }
  var rsT=null;
  window.addEventListener('resize', function(){ clearTimeout(rsT);
    rsT=setTimeout(function(){ var b=el('tStrip'); if(b) placeStrip(b); }, 150); });
  window.__HT26 = { md:journalMd, entries:function(q){ return entries(q).length; }, strip:stripNums,
                    five:function(){ return five().length; }, repaint:boot26 };

  var _pa=paintAll;     paintAll=function(){ _pa.apply(null,arguments); boot26(); };
  var _pj=paintJournal; paintJournal=function(){ _pj.apply(null,arguments); if(S.me){ paintJ(); paintStrip(); } };
  if(document.readyState==='complete') setTimeout(boot26, 450);
  else window.addEventListener('load', function(){ setTimeout(boot26, 450); });
})();

/* ======================= HT-28 · THE TRACKER CLOSE-OUT (PASTE 128 · WIRE HT-28) =======================
   123 and 124 in one sweep. Every part re-asserts over the base paint the way the earlier layers do -
   by wrapping the functions the app calls by name - and every part respects Advanced (R70.138: the
   simple view hides, Advanced shows everything as it was). Section letters follow the paste. */
(function(){
  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }

  /* ---- D7 · THE RATING'S "WHY" COMES BACK ------------------------------------------------------
     DEC-171 names five inputs, and one of them is "the 1-10 rating WITH ITS WHY". HT-9a's simple view
     took the why out ("why leaves") before that ruling, and nothing put it back: #iWhy stayed in the
     DOM inside the emptied Rate-the-day block (`ht9a-off`, display:none), so golden_ht26 S1c - which
     asks only that the element EXISTS - passed while no one could type a why at any width. Measured
     2026-09-15 on 2cdf48d: #whyFld invisible at 390 and at 1280. The field moves in right under the
     strip as one short line; its input listener travels with the node, so the save path is untouched. */
  /* WHERE IT SITS IS MEASURED, NOT CHOSEN. Under the strip it is one short line; on the desktop that
     line came straight off the brain dump (golden_ht18 S2c/S2d at 1280x720: dump 92 -> 52 against a
     floor of 88, because HT-18's grow() hands the dump whatever the quadrant has left). So from 1024 up
     it joins COMPLETED and PRAYER in the journal's bottom row (#h18Btm), as its first of three columns,
     which costs the dump nothing; below 1024 #h18Btm is inert and it sits under the strip. */
  var WIDE = window.matchMedia ? window.matchMedia('(min-width:1024px)') : { matches:false };
  function whyBack(){
    if(advanced()) return;
    var f = document.getElementById('whyFld'), rw = document.getElementById('rateWrap');
    if(!f || !rw || !rw.parentNode) return;
    var btm = document.getElementById('h18Btm');
    if(WIDE.matches && btm){
      if(btm.firstElementChild !== f) btm.insertBefore(f, btm.firstElementChild);
    }else if(f.previousElementSibling !== rw){
      rw.parentNode.insertBefore(f, rw.nextSibling);
    }
    f.classList.add('h28why');
    var lab = f.querySelector('.lab'); if(lab && lab.textContent !== 'Why') lab.textContent = 'Why';
    var t = document.getElementById('iWhy');
    if(t){ t.rows = 1; if(!t.value) t.placeholder = 'Why that number?'; }
  }

  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function byIdMap(){ var m={}; S.habits.forEach(function(h){ m[h.id]=h; }); return m; }
  /* the Sabbath standard due on day k (null on every other day, and when there is none) */
  function sabOn(k){
    var s=S.habits.filter(function(h){ return isSabbathStd(h) && isSatOnly(h) && dueOn(h, k); });
    return s[0] || null;
  }

  /* ---- E14 + DEC-171 · TIMED, THEN ANYTIME, THEN WEEKLY - AND THE SABBATH FIRST IN ANYTIME ---------
     HT-16's reorderToday() rebuilt the list as "timed rows, one ANYTIME header, everything else" the
     moment any standard carried a planned time - so on Cory's real list (which has times) the TIMED and
     WEEKLY headers never showed, and a weekly sat under ANYTIME. goDay() then re-grouped through 9a's
     group(), so the headers depended on HOW you reached the day. Measured on 2cdf48d. This runs last,
     after both, and says the same thing every time: TIMED (by planned time) · ANYTIME · WEEKLY.
     On a day the Sabbath is due, its row leads ANYTIME and wears one check mark and nothing else.
     Rows are MOVED, never recreated, so every listener the earlier layers bound stays bound; when the
     list is already right nothing is touched. */
  function regroup28(){
    if(advanced()) return;
    var log=document.getElementById('log'); if(!log) return;
    var kids=q('#log > *'), rows=kids.filter(function(c){ return c.classList.contains('li'); });
    if(!rows.length) return;
    var hm=byIdMap(), sab=sabOn(S.date), B={ TIMED:[], ANYTIME:[], WEEKLY:[] }, other=[];
    /* HT-29 S2 (PASTE 133): the four sections have the final say now, from every path that reaches here (paintAll,
       paintLog, goDay, resize). TIMED/ANYTIME/WEEKLY below stay whole behind HT29_SECTIONS (R70.138). */
    if(HT29_SECTIONS && window.__HT29S2){
      window.__HT29S2.regroup();
      q('#log .li.h28sab').forEach(function(r){ if(!sab || r.getAttribute('data-h')!==sab.id) r.classList.remove('h28sab'); });
      if(sab){ var sr29=log.querySelector('.li[data-h="'+sab.id+'"]'); if(sr29) sr29.classList.add('h28sab'); }
      return;
    }
    kids.forEach(function(c, i){
      if(c.classList.contains('li')){
        var h=hm[c.getAttribute('data-h')], g=h ? bucketOf(h) : 'ANYTIME';
        if(sab && h && h.id===sab.id) g='ANYTIME';
        (B[g]||B.ANYTIME).push({ r:c, h:h, i:i });
      }else if(!c.classList.contains('grp')) other.push(c);
    });
    B.TIMED.sort(function(a,b){
      var x=a.h?winStartMin(a.h):null, y=b.h?winStartMin(b.h):null;
      return (x==null?1e9:x)-(y==null?1e9:y) || a.i-b.i; });
    if(sab){
      B.ANYTIME.sort(function(a,b){
        return ((b.h&&b.h.id===sab.id)?1:0)-((a.h&&a.h.id===sab.id)?1:0) || a.i-b.i; });
    }
    var want=[];
    ['TIMED','ANYTIME','WEEKLY'].forEach(function(g){
      if(!B[g].length) return;
      want.push(g); B[g].forEach(function(x){ want.push(x.r); });
    });
    var cur=kids.filter(function(c){ return c.classList.contains('li') || c.classList.contains('grp'); });
    var same=cur.length===want.length && cur.every(function(c,i){
      var w=want[i];
      return typeof w==='string' ? (c.classList.contains('grp') && c.textContent.trim()===w) : c===w; });
    if(!same){
      var frag=document.createDocumentFragment();
      want.forEach(function(w){
        if(typeof w==='string'){ var hd=document.createElement('div'); hd.className='grp'; hd.textContent=w; frag.appendChild(hd); }
        else frag.appendChild(w);
      });
      other.forEach(function(o){ frag.appendChild(o); });
      log.innerHTML=''; log.appendChild(frag);
    }
    q('#log .li.h28sab').forEach(function(r){ if(!sab || r.getAttribute('data-h')!==sab.id) r.classList.remove('h28sab'); });
    if(sab){ var sr=log.querySelector('.li[data-h="'+sab.id+'"]'); if(sr) sr.classList.add('h28sab'); }
  }

  /* ---- E13 · CORY'S SABBATH ROW BECOMES dow:6, UNDER HIS OWN SESSION ----------------------------------
     The paste's route A had this executor sign in as Cory with his password and keep a refresh token in a
     .env; the executor handles no password and keeps no .env (CC_STANDING section 3 · R70.333). So the APP
     does it: the first load after this build, in Cory's own browser, signed in as him, RLS enforcing it,
     turns a Sabbath standard still stored as 'daily' into 'dow:6'. Once per session, awaited, idempotent (a
     migrated row is not selected again), logged, never from a render path, never in Advanced. Until it
     lands, dowOf() already reads a legacy Sabbath as Saturday-only, so nothing flashes on a Tuesday. */
  var _mig=null;
  function sabMigrate28(){
    if(_mig || advanced() || !S.me || S.loadOk!==true || !S.habits.length) return _mig;
    var key='ht28_sabmig_'+S.me.id, before=false;
    try{ before = localStorage.getItem(key)==='1'; }catch(e){}
    function mark(){ SAB_LEGACY_READ=false; try{ localStorage.setItem(key,'1'); }catch(e){} }
    if(before){ SAB_LEGACY_READ=false; window.__h28SabMig='done-before'; return null; }
    var legacy=S.habits.filter(function(h){ return isLegacySabbath(h) && parseCadence(h.cadence).kind==='daily'; });
    if(!legacy.length){ window.__h28SabMig='none'; mark(); return null; }
    _mig=(async function(){
      var done=0, failed=0;
      for(var i=0;i<legacy.length;i++){
        var res=await sb.from('habits').update({ cadence:'dow:6' }).eq('id', legacy[i].id).eq('user_id', S.me.id);
        if(res && res.error) failed++; else { legacy[i].cadence='dow:6'; done++; }
      }
      if(!failed) mark();
      window.__h28SabMig = failed ? 'failed' : 'migrated';
      try{ console.log('HT-28 E13: Sabbath cadence daily -> dow:6 · migrated '+done+' · failed '+failed); }catch(e){}
      return window.__h28SabMig;
    })().catch(function(e){ window.__h28SabMig='failed';
      try{ console.log('HT-28 E13: Sabbath migration failed - '+(e && e.message)); }catch(_){}
      return 'failed'; });
    return _mig;
  }

  /* ---- F17 · THE SABBATH'S OWN HONOUR: "Sabbaths kept · N in a row · M of the last 12" + month rings --
     A Saturday counts once the Sabbath has been part of a day (it sits in that day's active_set or its
     check): no ring and no count before that (stress 7). Today's Saturday, not yet ticked, is not a miss -
     the day is not over. The daily % is untouched: the Sabbath is one due item on Saturday, weight 1. */
  function sabHistory(){
    var sab=S.habits.filter(function(h){ return isSabbathStd(h) && isSatOnly(h); })[0]; if(!sab) return null;
    var first=null;
    Object.keys(S.byDate).sort().some(function(k){
      var r=S.byDate[k];
      if(r && dnum(k).getDay()===6 && (((r.active_set||[]).indexOf(sab.id)>=0) || (r.checked||{})[sab.id])){ first=k; return true; }
      return false;
    });
    var t=today(), k=shift(t, -((dnum(t).getDay()+1)%7)), sats=[];
    for(var i=0;i<120 && first && k>=first;i++){ sats.push(k); k=shift(k,-7); }
    var kept=function(d){ return !!ckOf(d)[sab.id]; };
    var done=sats.filter(function(d){ return !(d===t && !kept(d)); });   /* an unticked today is not over */
    var run=0; for(var j=0;j<done.length;j++){ if(kept(done[j])) run++; else break; }
    var last=done.slice(0,12), m=last.filter(kept).length;
    return { sab:sab, first:first, kept:kept, run:run, m:m, of:last.length };
  }
  function sabLine28(){
    var host=document.getElementById('c5Five'); if(!host) return;
    var sh=sabHistory(), line=document.getElementById('h28Sab');
    if(!sh){ if(line) line.hidden=true; return; }
    if(!line){ line=document.createElement('div'); line.id='h28Sab'; line.className='h28sabline';
               host.parentNode.insertBefore(line, host.nextSibling); }
    line.hidden=false;
    line.innerHTML = sh.first
      ? 'Sabbaths kept · <b>'+sh.run+'</b> in a row · <b>'+sh.m+'</b> of the last '+(sh.of===12?'12':sh.of)
      : 'Sabbaths kept · counting starts on the first Saturday';
  }
  function rings28(){
    var svg=document.getElementById('vMonth'); if(!svg) return;
    q('.h28ring', svg).forEach(function(n){ n.parentNode.removeChild(n); });
    var sh=sabHistory(); if(!sh || !sh.first) return;
    var ax=svg.querySelector('line.ax0'); if(!ax) return;
    var y=(+ax.getAttribute('y1'))-7, t=today(), ns='http://www.w3.org/2000/svg';
    q('circle.hit[data-vgd]', svg).forEach(function(c){
      var k=c.getAttribute('data-vgd');
      if(!k || k<sh.first || k>t || dnum(k).getDay()!==6) return;
      var kept=sh.kept(k);
      if(k===t && !kept) return;
      var r=document.createElementNS(ns,'circle');
      r.setAttribute('class','h28ring'+(kept?' kept':' miss'));
      r.setAttribute('cx', c.getAttribute('cx')); r.setAttribute('cy', y.toFixed(1)); r.setAttribute('r','3.6');
      var tt=document.createElementNS(ns,'title'); tt.textContent='Sabbath '+(kept?'kept':'missed'); r.appendChild(tt);
      svg.appendChild(r);
    });
  }
  var ringT=null;
  function ringsLater(){ clearTimeout(ringT); setTimeout(rings28, 60); ringT=setTimeout(rings28, 450); }

  function boot28(){
    if(!S.me) return;
    whyBack();
    regroup28();
    sabMigrate28();
    sabLine28();
    ringsLater();
  }
  window.__HT28 = { repaint: boot28, regroup: regroup28, sabHistory: sabHistory, rings: rings28,
                    migrate: function(){ return sabMigrate28(); } };
  var _pa=paintAll; paintAll=function(){ _pa.apply(null,arguments); boot28(); };
  var _pl=paintLog; paintLog=function(){ _pl.apply(null,arguments); if(S.me){ regroup28(); } };
  var _go=goDay;    goDay=function(k){ _go.call(null,k); if(S.me){ whyBack(); regroup28(); ringsLater(); } };
  document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('#h16Month')) ringsLater(); }, true);
  var rs28=null;
  window.addEventListener('resize', function(){ clearTimeout(rs28); rs28=setTimeout(boot28, 180); });
  if(document.readyState==='complete') setTimeout(boot28, 500);
  else window.addEventListener('load', function(){ setTimeout(boot28, 500); });
})();

/* ======================= HT-28b · THE SECOND USER: FIRST RUN, EXAMPLES, PRIVACY, ADD-LINK =======================
   Paste 128 G21-G23 and F19. Andrew opens the link with no one beside him: he signs up, is told how the
   app works in five lines, starts from EXAMPLES (never Cory's list, never blank) with one tap, and edits
   them in the same sheet everyone uses. Nothing here writes a row without a tap (D4), and nothing here
   offers to write one unless load() SUCCEEDED - a dropped connection looks exactly like an empty account.
   F19 · AN ADD-LINK, NOT A LIST IN THE CODE. This repository is public, and a standards list is private
   (R47.3), so Cory's three rest standards are not in this file: `#add=<base64url JSON>` proposes standards
   carried by the link itself - a card, one tap, idempotent by name, the fragment removed after. A FRAGMENT,
   not a query: a browser never sends it to the server, so the list is in no request log either. The link
   with his three lives in his receipt, not here. Any link can only PROPOSE; the account owner taps. */
(function(){
  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  var FIRST_KEY = 'ht28_firstrun_', ADD_MAX = 10;
  /* G21 · the examples show all three sections: two TIMED, one ANYTIME, one WEEKLY */
  var EXAMPLES = [
    { name:'Move for 20 minutes', minutes:20, time:'07:00', cadence:'daily',  group_name:'Morning' },
    { name:'Read 10 pages',       minutes:15, time:null,    cadence:'daily',  group_name:'Other' },
    { name:'Lights out',          minutes:0,  time:'22:30', cadence:'daily',  group_name:'Night' },
    { name:'Plan the week',       minutes:30, time:null,    cadence:'weekly', group_name:'Weekly' }
  ];
  /* G23 · the five lines. The fifth is G22's statement, verbatim. */
  var LINES = [
    'Check off a standard when you keep it. The day\u2019s % is what you kept.',
    'Rate the day 1\u201310 and write why in a line.',
    'Journal, completed, prayer \u2014 write as much or as little as you want.',
    'Tap \u270e beside a standard to change its name, time or days, or add your own.',
    /* HT-31 S6.20 (paste 143): the four sections, in one sentence, to the person meeting them for the
       first time. Before this the headers were the only explanation of themselves, and a new account
       met four of them with nothing said - which is the moment someone decides an app is fussy. It
       also says the thing Cory's 9/15 ruling turns on: HE places them, and nothing else does. */
    'Your day has four parts \u2014 Morning routine, Night routine, Weekly routine and Standards \u2014 ' +
      'and you put each standard where you want it; nothing moves it on its own.',
    'Your journal is yours. The app never shows it to anyone else \u2014 including Cory.'
  ];

  /* one row, shaped the way HT-11's saveSheet shapes it, so an added row is indistinguishable from a typed one */
  function recOf(x, order){
    var rec = { user_id:S.me.id, name:x.name, group_name:x.group_name||'Other', cadence:x.cadence||'daily',
                minutes:x.minutes||0, sort_order:order };
    if(S.hasTime){ rec.time_anchor = x.time||null; rec.minutes_planned = x.minutes||null; }
    if(S.hasWindow){ rec.planned_start = x.time||null;
                     rec.planned_end = x.time ? fmtClock(minsOf(x.time)+(x.minutes||0)) : null; }
    if(S.hasNotes && x.notes) rec.notes = x.notes;
    if(S.hasSection && x.section) rec.section = x.section;            /* HT-29 S2.10: a link may place what it adds */
    return rec;
  }
  /* a tap can come before HT-11's column probe has run; an unknown column is asked, never assumed absent -
     otherwise a quick tap inserts the timed examples with no time (review NIT) */
  /* A PROBE THAT DROPS ON THE NETWORK IS NOT A MISSING COLUMN - the same rule `load()` learned the hard way
     (see its netDrop note). Latched false by a blip, `hasSection` makes every new standard insert without its
     section and every one already there jump to a fallback heading, and the toast still says "added". So only
     `42703 column ... does not exist` answers the question; anything else leaves it unasked for the next tap. */
  function absentCol(e){ return !!e && /42703|column .* does not exist/i.test(String((e.code||'') + ' ' + (e.message||''))); }
  function flagFrom(r){ return !r.error ? true : (absentCol(r.error) ? false : undefined); }
  async function ensureFlags(){
    var uid=S.me.id;
    if(S.hasTime===undefined){ var a=await sb.from('habits').select('id,time_anchor,minutes_planned').eq('user_id',uid).limit(1); S.hasTime=flagFrom(a); }
    if(S.hasWindow===undefined){ var w=await sb.from('habits').select('id,planned_start,planned_end').eq('user_id',uid).limit(1); S.hasWindow=flagFrom(w); }
    if(S.hasNotes===undefined){ var n=await sb.from('habits').select('id,notes').eq('user_id',uid).limit(1); S.hasNotes=flagFrom(n); }
    if(S.hasSection===undefined){ var sc=await sb.from('habits').select('id,section').eq('user_id',uid).limit(1); S.hasSection=flagFrom(sc); }
  }
  async function fullReload(){
    if(window.__HT11 && window.__HT11.reload) return window.__HT11.reload();
    await load(); paintAll();
  }
  function noHistory(){
    return S.loadOk===true && !(S.days||[]).length && !Object.keys(S.privAll||{}).length;
  }
  function offerExamples(){ return noHistory() && !S.habits.length; }
  function dismissed(){ try{ return localStorage.getItem(FIRST_KEY+S.me.id)==='1'; }catch(e){ return false; } }
  function dismiss(){ try{ localStorage.setItem(FIRST_KEY+S.me.id,'1'); }catch(e){} }
  function errText(r){ return String((r && r.error && r.error.message) || '').slice(0,60); }

  /* ---- F19 · the add-link: validated whole or refused whole ---- */
  function linkRaw(){ try{ return new URLSearchParams(String(location.hash||'').replace(/^#/,'')).get('add'); }catch(e){ return null; } }
  function linkItems(){
    var raw=linkRaw(); if(!raw) return null;
    try{
      var b64=raw.replace(/-/g,'+').replace(/_/g,'/'); while(b64.length%4) b64+='=';
      var bin=atob(b64), bytes=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      var list=JSON.parse(new TextDecoder('utf-8').decode(bytes));
      if(!Array.isArray(list) || !list.length || list.length>ADD_MAX) return [];
      var out=[];
      for(var j=0;j<list.length;j++){
        var x=list[j]||{}, n=String(x.n==null?'':x.n).trim(), tm=(x.t==null||x.t==='')?null:String(x.t);
        var d=(x.d==null||x.d==='')?null:String(x.d).trim();
        if(!n || n.length>120) return [];
        if(tm!==null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(tm)) return [];
        if(d!==null && d.length>300) return [];
        /* HT-29 S2.10: `s` names a section; anything else is refused whole, like a bad time */
        var sec=(x.s==null||x.s==='')?null:String(x.s);
        if(sec!==null && HT29SEC.ORDER.indexOf(sec)<0) return [];
        out.push({ name:n, time:tm, notes:d, cadence:(x.c==='weekly'?'weekly':'daily'), section:sec });
      }
      return out;
    }catch(e){ return []; }
  }
  function dropLinkParam(){
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }

  /* ---- the card: HT-11's sheet classes, so it looks like the one sheet the app already has ---- */
  function card(){
    var n=document.getElementById('h28First');
    if(n) return n;
    n=document.createElement('div'); n.id='h28First'; n.className='esheet h28first';
    n.setAttribute('role','dialog'); n.setAttribute('aria-modal','true');
    n.innerHTML='<div class="ebody" id="h28FirstBody"></div>';
    document.body.appendChild(n);
    /* the scrim closes it for now; only the card's own buttons put it away for good */
    n.addEventListener('click', function(e){ if(e.target===n) closeCard(); });
    n.addEventListener('keydown', function(e){ if(e.key==='Escape') closeCard(); });
    return n;
  }
  function closeCard(){ var n=document.getElementById('h28First'); if(n){ n.classList.remove('on'); n.removeAttribute('data-kind'); } }

  var firstShown=false, linkShown=false, linkDone=false, busy=false;
  function showFirst(){
    var n=card(), b=document.getElementById('h28FirstBody');
    var ex=offerExamples();
    b.innerHTML='<div class="eh"><h3>How to start</h3></div>'+
      '<ol class="h28l">'+LINES.map(function(s,i){
        return '<li'+(i===4?' class="h28priv"':'')+'>'+esc(s)+'</li>'; }).join('')+'</ol>'+
      (ex?'<div class="h28ex1">Examples: '+EXAMPLES.map(function(x){ return esc(x.name); }).join(' \u00b7 ')+'</div>':'')+
      '<div class="etools">'+
        (ex?'<button class="btn pri" id="h28Ex" type="button">Start with 4 examples</button>':'')+
        '<span style="flex:1"></span>'+
        '<button class="btn'+(ex?'':' pri')+'" id="h28Got" type="button">Got it</button>'+
      '</div>';
    n.setAttribute('data-kind','first'); n.classList.add('on');
    document.getElementById('h28Got').onclick=function(){ dismiss(); closeCard(); };
    var eb=document.getElementById('h28Ex');
    if(eb) eb.onclick=function(){ dismiss(); addExamples(eb); };
  }
  function haveNames(){ var m={}; S.habits.forEach(function(h){ m[String(h.name||'').trim().toUpperCase()]=h; }); return m; }
  /* HT-29 S2.10: a standard already on the list is never added twice - but a link that names a section PLACES it */
  function toPlace(items, have){
    return S.hasSection ? items.filter(function(x){
      var h=have[x.name.toUpperCase()]; return h && x.section && HT29SEC.sectionOf(h)!==x.section; }) : [];
  }
  function showLink(items){
    var n=card(), b=document.getElementById('h28FirstBody'), have=haveNames();
    var todo=items.filter(function(x){ return !have[x.name.toUpperCase()]; });
    var place=toPlace(items, have);
    b.innerHTML='<div class="eh"><h3>Add standards</h3></div>'+
      '<div class="h28seed">'+items.map(function(x){
        var on=have[x.name.toUpperCase()], moves=on && place.indexOf(x)>=0;
        var where=x.section ? HT29SEC.NAMES[x.section].toLowerCase() : (x.cadence==='weekly'?'weekly':(x.time?'timed':'anytime'));
        return '<div class="fl'+(on?' on':'')+'"><i>'+(x.time?esc(fmtTime(x.time)):'')+'</i>'+
          '<span><b>'+esc(x.name)+'</b>'+(x.notes?'<em>'+esc(x.notes)+'</em>':'')+'</span>'+
          '<u>'+(moves?'\u2192 '+esc(where):(on?'on your list':esc(where)))+'</u></div>'; }).join('')+
      '</div>'+
      '<div class="h28ex1">From a link \u00b7 each counts once, like any standard.</div>'+
      '<div class="etools">'+
        ((todo.length||place.length)?'<button class="btn pri" id="h28Seed" type="button">'+
          (todo.length ? (todo.length===items.length?'Add '+(items.length===1?'it':'all '+items.length):'Add the missing '+todo.length)
                       : 'Place '+(place.length===1?'it':place.length))+'</button>':'')+
        '<span style="flex:1"></span>'+
        '<button class="btn'+((todo.length||place.length)?'':' pri')+'" id="h28SeedNo" type="button">'+((todo.length||place.length)?'Not now':'Close')+'</button>'+
      '</div>';
    n.setAttribute('data-kind','add'); n.classList.add('on');
    document.getElementById('h28SeedNo').onclick=function(){ linkDone=true; dropLinkParam(); closeCard(); };
    var bt=document.getElementById('h28Seed');
    if(bt) bt.onclick=function(){ addFromLink(items, bt); };
  }

  async function addExamples(btn){
    if(busy || !S.me || S.loadOk!==true) return;
    busy=true; if(btn){ btn.disabled=true; btn.textContent='adding\u2026'; }
    var outcome='none';
    try{
      /* ask the server, not S: a second device may have added rows since this one loaded */
      var chk = await sb.from('habits').select('id').eq('user_id',S.me.id).eq('active',true);
      if(chk.error){ outcome='failed'; toast('not added \u2014 '+errText(chk)); return; }
      if((chk.data||[]).length){ outcome='had-rows'; closeCard(); toast('your list already has standards'); await fullReload(); return; }
      await ensureFlags();
      var res = await sb.from('habits').insert(EXAMPLES.map(function(x,i){ return recOf(x,i); }));
      if(res && res.error){ outcome='failed'; toast('not added \u2014 '+errText(res)); return; }
      outcome='added'; closeCard();
      toast('4 examples added \u2014 change or delete any');
      await fullReload();
    }finally{
      busy=false; window.__h28Examples=outcome;
      if(btn && btn.isConnected){ btn.disabled=false; btn.textContent=btn.id==='h28Ex'?'Start with 4 examples':'Add these 4'; }
    }
  }
  async function addFromLink(items, btn){
    if(busy || !S.me || S.loadOk!==true) return;
    busy=true; if(btn){ btn.disabled=true; btn.textContent='adding\u2026'; }
    try{
      await ensureFlags();
      var cur = await sb.from('habits').select('id,name,sort_order'+(S.hasSection?',section,cadence,group_name,planned_start,time_anchor':'')).eq('user_id',S.me.id).eq('active',true);
      if(cur.error){ toast('not added \u2014 '+errText(cur)); window.__h28Add={ failed:true }; return; }
      var have={}, top=0;
      (cur.data||[]).forEach(function(r){ have[String(r.name||'').trim().toUpperCase()]=r; top=Math.max(top, +r.sort_order||0); });
      var todo=items.filter(function(x){ return !have[x.name.toUpperCase()]; });
      if(todo.length){
        var res=await sb.from('habits').insert(todo.map(function(x,i){
          return recOf({ name:x.name, time:x.time, notes:x.notes, minutes:0, cadence:x.cadence, group_name:'Other', section:x.section }, top+1+i); }));
        if(res && res.error){ toast('not added \u2014 '+errText(res)); window.__h28Add={ failed:true }; return; }
      }
      /* HT-29 S2.10: the ones already there move into the section the link names - one write each, own rows only */
      var place=toPlace(items, have), placed=0;
      for(var pi=0; pi<place.length; pi++){
        var row=have[place[pi].name.toUpperCase()];
        var up=await sb.from('habits').update({ section:place[pi].section }).eq('id',row.id).eq('user_id',S.me.id);
        if(up && up.error){ toast('not placed \u2014 '+errText(up)); window.__h28Add={ failed:true }; return; }
        placed++;
      }
      window.__h28Add={ added:todo.length, skipped:items.length-todo.length, placed:placed };
      try{ console.log('HT-28 F19: add-link \u00b7 added '+todo.length+' \u00b7 already there '+(items.length-todo.length)+' \u00b7 placed '+placed); }catch(e){}
      linkDone=true; dropLinkParam(); closeCard();
      toast(todo.length ? todo.length+' standard'+(todo.length>1?'s':'')+' added' : (placed ? placed+' placed' : 'already on your list'));
      await fullReload();
    }finally{
      busy=false;
      if(btn && btn.isConnected){ btn.disabled=false; }
    }
  }

  /* ---- G21 · THE EMPTY LIST: what went wrong or what to do, and always a way to add one ------------- */
  function exHtml(){
    return '<div class="k">Examples \u00b7 keep, change or delete any</div>'+
      EXAMPLES.map(function(x){
        return '<div class="fl"><i>'+(x.time?esc(fmtTime(x.time)):'')+'</i><span>'+esc(x.name)+'</span>'+
          '<b>'+(x.cadence==='weekly'?'WEEKLY':(x.time?'TIMED':'ANYTIME'))+'</b></div>'; }).join('')+
      '<div class="h28t"><button class="btn pri" type="button" data-h28ex="1">Add these 4</button></div>';
  }
  function emptyLog28(){
    if(advanced() || !S.me) return;
    var log=document.getElementById('log'); if(!log) return;
    var ex=log.querySelector('.h28ex'), add=log.querySelector('.h28add'), em=log.querySelector('.empty');
    if(log.querySelector('.li') || (S.habits.length && S.loadOk!==false)){
      if(ex) ex.parentNode.removeChild(ex);
      if(add) add.parentNode.removeChild(add);
      return;                                     /* rows, or a filter that matched none: not ours */
    }
    if(S.loadOk===false){
      if(em) em.textContent='Could not load your standards \u2014 check the connection, then reload.';
      if(ex) ex.parentNode.removeChild(ex);
      if(add) add.parentNode.removeChild(add);
      return;
    }
    if(em && em.textContent!=='No standards yet.') em.textContent='No standards yet.';
    if(offerExamples()){
      if(!ex){ ex=document.createElement('div'); ex.className='h28ex'; ex.innerHTML=exHtml(); log.appendChild(ex); }
      var eb=ex.querySelector('[data-h28ex]');
      if(eb && !eb.dataset.bound){ eb.dataset.bound='1'; eb.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation(); dismiss(); addExamples(eb); }); }
    }else if(ex) ex.parentNode.removeChild(ex);
    /* HT-11's footers add "+ Add standard" only under existing rows; with none there was no way to add one
       from TODAY. Its own capture listener on #log opens the sheet for any `.eadd`. */
    if(!add){ add=document.createElement('button'); add.type='button'; add.className='eadd h28add';
              add.setAttribute('data-add',''); add.textContent='+ Add standard'; }
    if(add.parentNode!==log || log.lastElementChild!==add) log.appendChild(add);
  }

  function boot28b(){
    if(!S.me) return;
    emptyLog28();
    if(advanced() || S.loadOk!==true) return;
    if(linkRaw() && !linkDone){
      if(!linkShown){
        linkShown=true;
        var items=linkItems();
        if(items && items.length) showLink(items);
        else { linkDone=true; dropLinkParam(); toast('that add-link could not be read'); }
      }
      return;
    }
    if(!firstShown && noHistory() && !dismissed()){ firstShown=true; showFirst(); }
  }

  /* the legacy "Start with these three" is the Advanced view's; the simple view uses the card above */
  var _ps=paintStarter;
  paintStarter=function(){
    if(!advanced()){
      try{ document.documentElement.setAttribute('data-firstrun','0'); }catch(e){}
      var n=el('starter'); if(n){ n.style.display='none'; n.innerHTML=''; }
      return;
    }
    if(S.loadOk===false){ var m=el('starter'); if(m){ m.style.display='none'; m.innerHTML=''; } return; }
    return _ps.apply(null, arguments);
  };
  window.__HT28b = { repaint:boot28b, lines:LINES.slice(), examples:EXAMPLES.slice(),
                     noHistory:noHistory, offerExamples:offerExamples, linkItems:linkItems };
  var _pa=paintAll; paintAll=function(){ _pa.apply(null,arguments); boot28b(); };
  var _pl=paintLog; paintLog=function(){ _pl.apply(null,arguments); emptyLog28(); };
  if(document.readyState==='complete') setTimeout(boot28b, 650);
  else window.addEventListener('load', function(){ setTimeout(boot28b, 650); });
})();

/* ======================= HT-28c · SYNC - PHONE AND DESKTOP STAY ONE (PASTE 128 C) =======================
   Cory 19:25: a check-off on the phone was not on the desktop until he reloaded, and the desktop could
   then write its stale day back over it. Measured on 2cdf48d: no visibilitychange, focus, online, poll or
   subscription anywhere in the app - every device kept the day it loaded.

   THE SERVER IS THE TRUTH, AND A DEVICE ONLY EVER WRITES WHAT IT CHANGED.
   1 · every edit is recorded as an OP (this key / this field -> this value) against the server's own copy of
       that day, and survives a reload in localStorage (per account) until the server has it;
   2 · a save reads the server's row first. Check-offs are one JSONB column, so the ops are laid over the
       server's map and the map is written; journal fields are written ONE COLUMN AT A TIME - PostgREST's
       upsert sets only the columns it names - so another device's field is never in the payload at all.
       Where both devices changed the same key the later write wins (last-write-wins) and the value it
       replaced goes to this account's on-device ring `ht28_sync_lost_<id>`; the console gets the key only;
   3 · A DEVICE WHOSE LOAD FAILED WRITES NOTHING AND REPLAYS NOTHING. It reloads first. A failed load leaves
       S with no standards and no days, and a save from there would reprice a real day to 0 % (review BLOCK);
   4 · a pull - every 30 s while the page is visible, at once on return / focus / reconnect, none while
       hidden, backing off on failure - fetches the last 14 days and applies what differs. A field that is
       focused keeps what is on screen AND keeps its old baseline, so leaving it later cannot write the stale
       text over the other device's newer text (review BLOCK);
   5 · offline, edits are saved on the device and replayed on `online`; signing out replays what it can and
       then clears this account's queue and ring from the device.
   No Realtime subscription: it needs the tables in Supabase's realtime publication, a migration this wire
   does not run; the in-page pull is the whole mechanism and the named upgrade path. Nothing here runs while
   the page is hidden and nothing is scheduled outside the page - the repo's PHASE GATE reads "no automated
   pulls", and that reading is SPEC's to rule (receipt 128, FOR SPEC).
   HT-29 S7.27 TOOK THAT UPGRADE PATH and nothing else here changed: `tools/sql/2026-09-15_ht29.sql` runs the
   migration, and the layer at the foot of this file subscribes and calls this pull. The pull below is still
   the only thing that reads a row. */
(function(){
  var POLL_MS = +(window.__SYNC_MS || 30000), MAX_BACKOFF = 300000, WINDOW_DAYS = 14;
  var TYPING_HOLD_MS = +(window.__SYNC_TYPING_MS || 60000);
  var PF = ['rating','why','tasks','prayer','brain_dump'];
  var LOST_KEY = 'ht28_sync_lost_', Q_KEY = 'ht28_sync_q_';
  var OPS = { days:{}, dbase:{}, priv:{}, pbase:{} };
  var SHADOW = {}, shadowSrc = null, DSHADOW = {}, dshadowSrc = null;
  var SY = { last:null, state:'idle', busy:false, timer:null, nextMs:null, fails:0, edits:0,
             pendDay:false, pendPriv:false, deferred:false, lastTry:0, lastType:0, started:false,
             stopped:false, pulls:0, applied:0, lostN:0, restored:false, reason:null, held:null };
  var SKIPPED = { data:null, error:null, skipped:true };
  function queued(why){ return { data:null, error:{ message:why }, queued:true }; }

  function has(o,k){ return Object.prototype.hasOwnProperty.call(o,k); }
  function norm(v){ return v==null ? '' : String(v); }
  function copy(o){ var r={}; for(var k in o) if(has(o,k)) r[k]=o[k]; return r; }
  function count(m){ var n=0; for(var d in m) if(has(m,d)) n+=Object.keys(m[d]).length; return n; }
  function hasOps(){ return count(OPS.days)+count(OPS.priv) > 0; }
  function offline(){ return navigator.onLine === false; }
  function isNetErr(e){ return !!e && /fetch|network|load failed|offline|timed? ?out/i.test(String(e.message||e)); }
  function mine(r){ return !r.user_id || (S.me && r.user_id === S.me.id); }
  /* HT-31 S2.8: the sync stamp is a clock a human reads, so it goes through the one function. */
  function clock2(d){ return fmtTime(('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)); }
  function ready(){ return !!S.me && S.loadOk === true; }
  function warn(what, e){ try{ console.warn('HT-28 sync: '+what+(e && e.message ? ' - '+String(e.message).slice(0,120) : '')); }catch(_){} }

  /* ---- the op log and the ring, both per account ---- */
  function persist(){
    if(!S.me) return;
    try{ if(hasOps()) localStorage.setItem(Q_KEY+S.me.id, JSON.stringify(OPS));
         else localStorage.removeItem(Q_KEY+S.me.id); }catch(e){}
  }
  function restore(){
    if(SY.restored || !S.me) return; SY.restored=true;
    var got=null; try{ got=JSON.parse(localStorage.getItem(Q_KEY+S.me.id)||'null'); }catch(e){}
    if(!got) return;
    ['days','dbase','priv','pbase'].forEach(function(p){
      var src=got[p]||{};
      for(var d in src) if(has(src,d)){
        var dst=OPS[p][d]||(OPS[p][d]={});
        for(var k in src[d]) if(has(src[d],k) && !has(dst,k)) dst[k]=src[d][k];
      }
    });
  }
  function lost(entry){
    entry.at = new Date().toISOString(); SY.lostN++;
    try{ console.warn('HT-28 sync: a later edit replaced an earlier one - '+entry.table+' '+entry.date+' '+entry.key); }catch(e){}
    try{ var key=LOST_KEY+S.me.id, a=JSON.parse(localStorage.getItem(key)||'[]'); a.push(entry);
         while(a.length>50) a.shift(); localStorage.setItem(key, JSON.stringify(a)); }catch(e){}
  }

  /* ---- 1 · RECORD, against the server's copy of the day - for every loaded day, not a window ---- */
  function shadowNow(){
    if(S.privAll === shadowSrc) return;
    shadowSrc = S.privAll; SHADOW = {};
    for(var d in S.privAll) if(has(S.privAll,d)){
      var r=S.privAll[d]||{}, s={}; PF.forEach(function(f){ if(has(r,f)) s[f]=r[f]; }); SHADOW[d]=s;
    }
  }
  function dshadowNow(){
    if(S.days === dshadowSrc) return;
    dshadowSrc = S.days; DSHADOW = {};
    S.days.forEach(function(r){ DSHADOW[r.date]=copy(r.checked||{}); });
  }
  function recordPriv(){
    var k=S.date, p=S.priv; if(!p || !S.me || !k) return;
    var sh=SHADOW[k]||{};
    PF.forEach(function(f){
      if(!has(p,f)) return;
      if(f==='brain_dump' && S.loadOk===true && !S.hasDump) return;   /* the column truly is not there */
      var o=OPS.priv[k];
      if(norm(p[f]) === norm(has(sh,f)?sh[f]:null)){
        if(o && has(o,f)) o[f]=p[f];                                   /* typed back to what the server has */
        return;
      }
      o = o || (OPS.priv[k]={}); var b=OPS.pbase[k]||(OPS.pbase[k]={});
      if(!has(o,f)) b[f] = has(sh,f) ? sh[f] : null;
      if(!has(o,f) || norm(o[f]) !== norm(p[f])){ o[f]=p[f]; SY.edits++; }   /* a cleared field is an op too */
    });
    persist();
  }
  function recordDayShadow(d){
    var r=S.byDate[d]; if(!r || !S.me) return;
    var now=r.checked||{}, sh=DSHADOW[d]||{}, keys={};
    Object.keys(now).forEach(function(x){ keys[x]=1; }); Object.keys(sh).forEach(function(x){ keys[x]=1; });
    Object.keys(keys).forEach(function(x){
      var o=OPS.days[d];
      if(!!now[x] === !!sh[x]){ if(o && has(o,x)) o[x] = now[x] ? now[x] : null; return; }
      o = o || (OPS.days[d]={}); var b=OPS.dbase[d]||(OPS.dbase[d]={});
      if(!has(o,x)) b[x] = sh[x] ? sh[x] : null;
      if(!has(o,x) || norm(o[x]) !== norm(now[x]||null)){ o[x] = now[x] ? now[x] : null; SY.edits++; }   /* an uncheck is an op too */
    });
    persist();
  }
  /* local ops are the truth until the server has them: laid over whatever load() or a pull just put in S */
  function overlay(){
    var d, k;
    for(d in OPS.days) if(has(OPS.days,d)){
      var r=S.byDate[d] || (S.byDate[d]={ date:d, checked:{}, pct:0 });
      r.checked = r.checked || {};
      for(k in OPS.days[d]) if(has(OPS.days[d],k)){ var v=OPS.days[d][k]; if(v) r.checked[k]=v; else delete r.checked[k]; }
    }
    for(d in OPS.priv) if(has(OPS.priv,d)){
      var p=S.privAll[d] || (S.privAll[d]={ date:d, user_id:S.me.id });
      for(k in OPS.priv[d]) if(has(OPS.priv[d],k)) p[k]=OPS.priv[d][k];
      if(d===S.date) S.priv=p;
    }
  }

  /* ---- 2 · MERGE ON SAVE ---- */
  async function fetchDay(k){
    try{
      var uid=S.me.id, cols='date,checked,active_set,pct'+(S.hasClosedAt?',closed_at':'');
      var r = await sb.from('days').select(cols).eq('user_id',uid).eq('date',k);
      if(r.error){ if(!isNetErr(r.error)) warn('day read refused', r.error); return { ok:false, network:offline()||isNetErr(r.error) }; }
      return { ok:true, row:(r.data||[]).filter(function(x){ return x.date===k && mine(x); })[0] || null };
    }catch(e){ warn('day read failed', e); return { ok:false, network:offline()||isNetErr(e) }; }
  }
  async function fetchPriv(k){
    try{
      var uid=S.me.id, cols='date,'+PF.filter(function(f){ return f!=='brain_dump' || S.hasDump; }).join(',');
      var r = await sb.from('day_private').select(cols).eq('user_id',uid).eq('date',k);
      if(r.error){ if(!isNetErr(r.error)) warn('journal read refused', r.error); return { ok:false, network:offline()||isNetErr(r.error) }; }
      return { ok:true, row:(r.data||[]).filter(function(x){ return x.date===k && mine(x); })[0] || null };
    }catch(e){ warn('journal read failed', e); return { ok:false, network:offline()||isNetErr(e) }; }
  }
  function savedHere(){ SY.state='offline'; SY.held=null; persist(); stamp(); toast('saved on this device \u00b7 syncs when online'); }
  function hold(why, say){ SY.state=offline()?'offline':'error'; SY.held=why; persist(); stamp();
    if(say) toast('saved on this device \u00b7 will retry'); }

  async function mergeDay(k, write, explicit, bound){
    await Promise.resolve();                       /* the caller's own bookkeeping runs first */
    SY.pendDay=false;
    if(!S.me) return write();
    recordDayShadow(k);
    var ops=OPS.days[k], carried=(ops && Object.keys(ops).length) ? copy(ops) : null;
    if(!carried && !explicit) return SKIPPED;      /* nothing changed here: nothing to write */
    if(!ready()){ hold('not loaded', !!carried); return queued('not loaded'); }
    if(offline()){ if(carried) savedHere(); return queued('offline'); }
    var srv=await fetchDay(k);
    if(!srv.ok){ if(srv.network){ if(carried) savedHere(); } else hold('read failed', !!carried); return queued('read failed'); }
    if(bound && k!==S.date) return null;           /* saveDay writes the day ON SCREEN: moved away - the replay has it */
    if(!ready()){ hold('not loaded'); return queued('not loaded'); }
    var r=S.byDate[k] || (S.byDate[k]={ date:k, checked:{}, pct:0 });
    /* a past day is repriced from ITS OWN snapshot - taken from the server when this device holds none */
    if(srv.row && srv.row.active_set && srv.row.active_set.length && !(r.active_set && r.active_set.length))
      r.active_set = srv.row.active_set.slice();
    var sc=(srv.row && srv.row.checked) || {}, merged=copy(sc), base=OPS.dbase[k]||{}, cur=OPS.days[k]||carried||{};
    Object.keys(cur).forEach(function(h){
      var v=cur[h], sv=sc[h];
      if(has(base,h) && !!sv !== !!base[h] && !!sv !== !!v)
        lost({ table:'days', date:k, key:h, lost:(sv||null), kept:(v||null) });
      if(v) merged[h]=v; else delete merged[h];
    });
    var foreign = JSON.stringify(Object.keys(merged).sort()) !== JSON.stringify(Object.keys(r.checked||{}).sort());
    r.checked = merged;
    var written = copy(merged);
    var res = await write();
    if(res && !res.error){
      var left=OPS.days[k];
      if(carried && left){
        Object.keys(carried).forEach(function(h){
          if(!has(left,h)) return;
          if(left[h]===carried[h]){ delete left[h]; if(OPS.dbase[k]) delete OPS.dbase[k][h]; }
          else (OPS.dbase[k]||(OPS.dbase[k]={}))[h] = written[h] || null;   /* ticked again mid-write: its base is what was written */
        });
        if(!Object.keys(left).length){ delete OPS.days[k]; delete OPS.dbase[k]; }
      }
      DSHADOW[k] = written;
      SY.held=null; persist(); ok();
      if(foreign) soft();
    }else if(res && res.error && isNetErr(res.error)) savedHere();
    return res;
  }
  async function mergePriv(write){
    await Promise.resolve();
    SY.pendPriv=false;
    if(!S.me) return write();
    var k=S.date;
    if(S.priv){ S.priv.date=k; S.priv.user_id=S.me.id; S.privAll[k]=S.priv; }
    recordPriv();
    var ops=OPS.priv[k];
    if(!ops || !Object.keys(ops).length) return SKIPPED;   /* nothing changed here: nothing to write */
    if(!ready()){ hold('not loaded', true); return queued('not loaded'); }
    if(offline()){ savedHere(); return queued('offline'); }
    var res = await writePrivFields(k);
    if(res && !res.error && !res.skipped && k===S.date) privTail();
    else if(res && res.error && !res.queued) toast('note not saved');
    return res;
  }
  /* THE FIELDS THIS DEVICE CHANGED, AND ONLY THOSE. The full-row write is gone from this path: with it, a
     stale field on this screen could ride along over another device's newer text (review BLOCK). */
  async function writePrivFields(k){
    var ops=OPS.priv[k]; if(!ops || !Object.keys(ops).length) return SKIPPED;
    var srv=await fetchPriv(k);
    if(!srv.ok){ if(srv.network) savedHere(); else hold('read failed', true); return queued('read failed'); }
    if(!ready()){ hold('not loaded'); return queued('not loaded'); }
    var cur=OPS.priv[k]||{}, base=OPS.pbase[k]||{}, row={ user_id:S.me.id, date:k }, sent={}, n=0;
    Object.keys(cur).forEach(function(f){
      if(PF.indexOf(f)<0) return;
      if(f==='brain_dump' && !S.hasDump){ delete cur[f]; delete base[f]; return; }   /* no column can hold it */
      var sv = srv.row ? srv.row[f] : null;
      if(has(base,f) && norm(sv)!==norm(base[f]) && norm(sv)!==norm(cur[f]))
        lost({ table:'day_private', date:k, key:f, lost:(sv==null?null:sv), kept:cur[f] });
      row[f] = (f==='rating') ? ((cur[f]==null||cur[f]==='') ? null : +cur[f]) : (cur[f]==null ? '' : String(cur[f]));
      sent[f] = cur[f]; n++;
    });
    if(!n){ if(OPS.priv[k] && !Object.keys(OPS.priv[k]).length){ delete OPS.priv[k]; delete OPS.pbase[k]; } persist(); return SKIPPED; }
    var res = await sb.from('day_private').upsert(row, { onConflict:'user_id,date' });
    if(res && !res.error){
      var s=SHADOW[k]||(SHADOW[k]={}), p=S.privAll[k]||(S.privAll[k]={ date:k, user_id:S.me.id }), left=OPS.priv[k]||{};
      /* ONLY WHAT WAS SENT MOVES THE BASELINE. The other device's fields are NOT taken in here: this path
         does not redraw the boxes, so memory would hold the phone's text while the desk's box still showed the
         old one, and typing into that box later would baseline on the phone's text and overwrite it with no
         conflict logged (second review of 9d4ac6b). The next pull sees the difference, takes it in, and
         redraws - through the focus-keeping repaint. */
      Object.keys(sent).forEach(function(f){ s[f]=sent[f]; });
      Object.keys(sent).forEach(function(f){
        if(!has(left,f)) return;
        if(norm(left[f])===norm(sent[f])){ delete left[f]; if(OPS.pbase[k]) delete OPS.pbase[k][f]; }
        else (OPS.pbase[k]||(OPS.pbase[k]={}))[f]=sent[f];                        /* typed on during the write */
      });
      if(OPS.priv[k] && !Object.keys(OPS.priv[k]).length){ delete OPS.priv[k]; delete OPS.pbase[k]; }
      if(k===S.date) S.priv=p;
      SY.held=null; persist(); ok();
    }else if(res && res.error && isNetErr(res.error)) savedHere();
    return res;
  }
  /* what the original savePriv did after its write, for the row this layer wrote */
  function privTail(){
    toast('saved');
    var p=S.priv||{}, n=0; ['brain_dump','tasks','prayer'].forEach(function(f){ if(p[f]) n++; });
    var c=el('jrnC'); if(c) c.textContent = n ? n+' of 3 written \u00b7 autosaves' : 'saves as you type';
    try{ paintRating(); paintRChart(); paintRScat(); paintRSleep(); paintRByMo(); paintJournal(); paintCal(); }
    catch(e){ warn('repaint after save failed', e); }
  }
  var replaying=null;
  function replay(){
    if(replaying) return replaying;
    replaying=(async function(){
      if(offline() || !ready()) return false;
      var d, dates=Object.keys(OPS.days);
      for(var i=0;i<dates.length;i++){
        d=dates[i];
        var res = (d===S.date) ? await saveDay() : await saveDayFor(d);
        if(res && res.error) return false;
      }
      dates=Object.keys(OPS.priv);
      for(var j=0;j<dates.length;j++){
        d=dates[j];
        var r2 = (d===S.date) ? await savePriv() : await writePrivFields(d);
        if(r2 && r2.error) return false;
      }
      return true;
    })().finally(function(){ replaying=null; });
    return replaying;
  }

  /* ---- 3 · PULL ---- */
  function typingIn(f){
    var ids={ why:'iWhy', brain_dump:'iDump', tasks:'iTasks', prayer:'iPrayer' };
    var a=document.activeElement; return !!a && a.id===ids[f];
  }
  function textFocus(){
    var a=document.activeElement;
    if(!a || a===document.body) return null;
    var tag=(a.tagName||'').toLowerCase();
    if(tag==='textarea' || a.isContentEditable || (tag==='input' && !/^(checkbox|radio|button|submit|range|color)$/i.test(a.type||''))) return a;
    return null;
  }
  async function fetchWindow(){
    var uid=S.me.id, from=shift(today(), -(WINDOW_DAYS-1));
    if(S.date && S.date<from) from=S.date;
    var hc='id,name,group_name,cadence,tier,minutes,link,sort_order'+(S.hasCue?',cue':'')+
           (S.hasWindow?',planned_start,planned_end':'')+(S.hasNotes?',notes':'')+(S.hasTime?',time_anchor,minutes_planned':'')+
           (S.hasSection?',section':'');                     /* HT-29 S2: a section set on the phone reaches the desk */
    var dc='date,checked,active_set,pct,floor_pct'+(S.hasClosedAt?',closed_at':'');
    var pc='date,rating,why,tasks,prayer'+(S.hasPredict?',predict':'')+(S.hasDump?',brain_dump':'');
    try{
      var r = await Promise.all([
        sb.from('habits').select(hc).eq('user_id',uid).eq('active',true).order('sort_order'),
        sb.from('days').select(dc).eq('user_id',uid).gte('date',from).order('date'),
        sb.from('day_private').select(pc).eq('user_id',uid).gte('date',from)
      ]);
      var bad=r.filter(function(x){ return x && x.error; })[0];
      if(bad){ if(!isNetErr(bad.error)) warn('pull refused', bad.error); return { ok:false, network:offline()||isNetErr(bad.error) }; }
      return { ok:true, from:from, habits:(r[0].data||[]),
               days:(r[1].data||[]).filter(mine), priv:(r[2].data||[]).filter(mine) };
    }catch(e){ warn('pull read failed', e); return { ok:false, network:offline()||isNetErr(e) }; }
  }
  var HF=['id','name','group_name','cadence','minutes','link','sort_order','cue','time_anchor','minutes_planned','planned_start','planned_end','notes','section'];
  function fpH(list){ return JSON.stringify((list||[]).map(function(h){ return HF.map(function(f){ return h[f]==null?null:h[f]; }); })); }
  function fpCk(c){ c=c||{}; return JSON.stringify(Object.keys(c).sort().map(function(k){ return [k, c[k]]; })); }
  function fpP(p){ p=p||{}; return JSON.stringify(PF.map(function(f){ return norm(p[f]); })); }
  function apply(snap){
    var changed=false;
    var hs=snap.habits.map(function(x,i){ if(x.sort_order==null) x.sort_order=i; return x; });
    if(fpH(hs)!==fpH(S.habits)){ S.habits=hs; changed=true; }
    var idx={}; S.days.forEach(function(r,i){ idx[r.date]=i; });
    snap.days.forEach(function(row){
      DSHADOW[row.date]=copy(row.checked||{});            /* the server's copy, before this device's ops */
      var o=OPS.days[row.date];
      if(o){ row.checked=copy(row.checked||{}); for(var h in o) if(has(o,h)){ if(o[h]) row.checked[h]=o[h]; else delete row.checked[h]; } }
      var loc=S.byDate[row.date];
      if(loc && fpCk(loc.checked)===fpCk(row.checked) && JSON.stringify(loc.active_set||[])===JSON.stringify(row.active_set||[])) return;
      if(has(idx,row.date)) S.days[idx[row.date]]=row; else S.days.push(row);
      S.byDate[row.date]=row; changed=true;
    });
    S.days.sort(function(a,b){ return a.date<b.date?-1:(a.date>b.date?1:0); });
    snap.priv.forEach(function(row){
      var o=OPS.priv[row.date]||{}, loc=S.privAll[row.date], next=copy(row), s=copy(SHADOW[row.date]||{});
      PF.forEach(function(f){
        if(!has(row,f)) return;
        if(has(o,f)){ next[f]=o[f]; s[f]=row[f]; return; }
        /* FOCUSED, AND THE SERVER MOVED: the screen keeps its text and the baseline stays where it was, so
           leaving the field without typing writes nothing, and typing into it is a real, logged conflict */
        if(row.date===S.date && typingIn(f) && loc && norm(loc[f])!==norm(row[f])){ next[f]=loc[f]; return; }
        s[f]=row[f];
      });
      SHADOW[row.date]=s;
      if(loc && fpP(loc)===fpP(next)) return;
      if(loc){ PF.forEach(function(f){ if(has(next,f)) loc[f]=next[f]; }); }   /* in place: S.priv may point at it */
      else S.privAll[row.date]=next;
      changed=true;
    });
    if(S.date){ S.priv=S.privAll[S.date]||null; if(!S.byDate[S.date]) S.byDate[S.date]={ date:S.date, checked:{}, pct:0 }; }
    return changed;
  }

  function ok(){ SY.fails=0; SY.last=new Date(); SY.state='ok'; stamp(); }
  function soft(){
    if(textFocus() && Date.now()-SY.lastType < TYPING_HOLD_MS){ SY.deferPaint=true; return; }   /* memory is current; the screen waits */
    repaintKeepingFocus();
  }
  function repaintKeepingFocus(){
    var a=textFocus(), keep=a ? { id:a.id, s:a.selectionStart, e:a.selectionEnd, top:a.scrollTop } : null;
    paintAll();
    if(keep && keep.id){
      var n=document.getElementById(keep.id);
      if(n && document.activeElement!==n){ try{ n.focus({ preventScroll:true }); }catch(e){} }
      if(n && keep.s!=null){ try{ n.setSelectionRange(keep.s, keep.e); n.scrollTop=keep.top; }catch(e){} }
    }
  }
  function stop(){ SY.stopped=true; clearTimeout(SY.timer); SY.timer=null; SY.nextMs=null; }
  /* the reload a failed load needs: load, then HT-11's column probe, then paint - and if load() put the
     sign-in screen up, nothing is painted over it and the sync stops */
  async function reloadAll(){
    S.loadOk=null;
    var got = await load();
    if(got===false){ stop(); return false; }
    if(window.__HT11 && window.__HT11.probe){ try{ await window.__HT11.probe(); }catch(e){ warn('column probe failed', e); } }
    repaintKeepingFocus();
    return true;
  }
  async function pull(reason){
    if(!S.me || SY.busy || SY.stopped) return;
    if(document.visibilityState==='hidden'){ schedule(); return; }
    SY.lastTry=Date.now(); SY.pulls++; SY.reason=reason;
    if(offline()){ SY.state='offline'; stamp(); schedule(); return; }
    SY.busy=true;
    try{
      if(S.loadOk!==true){                         /* reload BEFORE any replay (review BLOCK) */
        if(!(await reloadAll())) return;
        if(S.loadOk!==true){ SY.fails++; SY.state=offline()?'offline':'error'; return; }
        ok();
      }
      if(SY.pendDay || SY.pendPriv) await flush();
      if(hasOps()){ await replay(); if(hasOps()){ SY.fails++; SY.state=offline()?'offline':'error'; return; } }
      var e0=SY.edits;
      var snap=await fetchWindow();
      if(!snap.ok){ SY.fails++; SY.state=snap.network?'offline':'error'; return; }
      if(SY.edits!==e0 || SY.pendDay || SY.pendPriv || hasOps()){ SY.fails=0; return; }   /* edited mid-fetch: next pull */
      if(textFocus() && Date.now()-SY.lastType < TYPING_HOLD_MS){ SY.deferred=true; return; }   /* never under a field being typed in */
      var changed=apply(snap);
      ok();
      if(changed){ SY.applied++; repaintKeepingFocus(); }
    }catch(e){
      SY.fails++; SY.state='error'; warn('pull failed', e);
    }finally{
      SY.busy=false; stamp(); schedule();
    }
  }
  function schedule(){
    clearTimeout(SY.timer); SY.timer=null;
    if(!S.me || SY.stopped || document.visibilityState==='hidden'){ SY.nextMs=null; return; }   /* paused while hidden */
    var ms = SY.fails ? Math.min(MAX_BACKOFF, POLL_MS*Math.pow(2, Math.min(SY.fails,4))) : POLL_MS;
    SY.nextMs=ms;
    SY.timer=setTimeout(function(){ pull('poll'); }, ms);
  }
  async function flush(){
    var ps=[];
    if(SY.pendDay){ clearTimeout(saveT); ps.push(saveDay()); }
    if(SY.pendPriv){ clearTimeout(pvT); ps.push(savePriv()); }
    try{ await Promise.all(ps); }catch(e){ warn('flush failed', e); }
  }

  /* ---- "Synced · 14:32" on the Session line in Settings - text on an existing element, no new geometry ---- */
  function stampText(){
    if(SY.state==='offline') return hasOps() ? 'Offline \u00b7 saved on this device' : 'Offline';
    if(SY.state==='error') return hasOps() ? 'Not synced \u00b7 saved on this device, retrying' : 'Not synced \u00b7 retrying';
    if(SY.last) return 'Synced \u00b7 '+clock2(SY.last);
    return 'Not synced yet';
  }
  function stamp(){
    var n=document.getElementById('h28Synced');
    if(n){ var t2=stampText(); if(n.textContent!==t2) n.textContent=t2; }
  }
  function stampSettings(){
    var ov=document.getElementById('ov'); if(!ov) return;
    var heads=ov.querySelectorAll('.sh');
    for(var i=0;i<heads.length;i++){
      var h2=heads[i].querySelector('h2'), c=heads[i].querySelector('.c');
      if(h2 && c && /session/i.test(h2.textContent||'')){ c.id='h28Synced'; stamp(); return; }
    }
  }

  /* ---- wiring: every save path, every load, every trigger ---- */
  /* the shadows AND the unsynced edits are retaken the moment load() returns: laid on only at the next paint,
     a keystroke or a debounced save during HT-11's probe saw the fresh server text, took it for "typed back",
     and wrote it over the edit (second review of 9d4ac6b) */
  var _ld=load;        load=async function(){ var r=await _ld.apply(null, arguments); if(r!==false && S.me){ shadowNow(); dshadowNow(); overlay(); } return r; };
  var _qs=queueSave;   queueSave=function(){ SY.pendDay=true; SY.edits++; var r=_qs.apply(null,arguments); recordDayShadow(S.date); return r; };
  var _qp=queuePriv;   queuePriv=function(){ SY.pendPriv=true; SY.lastType=Date.now(); recordPriv(); return _qp.apply(null,arguments); };
  var _sd=saveDay;     saveDay=function(opts){ var k=S.date;
    return mergeDay(k, function(){ return _sd.call(null, opts); }, !!(opts && opts.close), true); };
  var _sdf=saveDayFor; saveDayFor=function(k){
    if(k===S.date) return saveDay();
    return mergeDay(k, function(){ return _sdf.call(null, k); }); };
  var _spv=savePriv;   savePriv=function(){ return mergePriv(function(){ return _spv.call(null); }); };
  var _pa=paintAll;    paintAll=function(){
    if(S.me){ if(!SY.started) restore(); shadowNow(); dshadowNow(); overlay(); }
    _pa.apply(null, arguments);
    if(S.me && !SY.started){
      SY.started=true; SY.loadedAt=Date.now();
      if(S.loadOk===true){ SY.last=new Date(); SY.state='ok'; if(hasOps()) setTimeout(function(){ pull('restore'); }, 1200); }
      else { SY.last=null; SY.state=offline()?'offline':'error'; setTimeout(function(){ pull('reload'); }, 1500); }
      schedule();
    }
  };
  var _os=openSettings; openSettings=function(){ _os.apply(null, arguments); setTimeout(stampSettings, 30); };
  /* SIGNING OUT: replay what can be replayed, ask before discarding what cannot, then clear this account's
     queue and ring from the device - a shared device must not keep someone's journal text (review FIX) */
  if(sb && sb.auth && sb.auth.signOut && !sb.auth.__h28){
    var _so=sb.auth.signOut;
    sb.auth.signOut=async function(){
      var id=S.me && S.me.id;
      try{ if(id && (SY.pendDay || SY.pendPriv)) await flush(); if(id && hasOps() && ready() && !offline()) await replay(); }
      catch(e){ warn('replay before sign-out failed', e); }
      if(id && hasOps() && !confirm('Changes on this device have not synced yet. Sign out and discard them?'))
        return { data:null, error:{ message:'sign-out cancelled' } };
      var out=await _so.apply(sb.auth, arguments);
      if(out && out.error){ warn('sign-out failed - this device keeps its queue', out.error); return out; }   /* offline: still signed in */
      stop();
      if(id){ try{ localStorage.removeItem(Q_KEY+id); localStorage.removeItem(LOST_KEY+id); }catch(e){} }
      return out;
    };
    sb.auth.__h28=true;
  }

  document.addEventListener('visibilitychange', function(){
    if(!S.me || SY.stopped) return;
    if(document.visibilityState==='hidden'){ clearTimeout(SY.timer); SY.timer=null; SY.nextMs=null; flush(); }
    else pull('visible');
  });
  window.addEventListener('focus', function(){ if(S.me && Date.now()-SY.lastTry > 5000) pull('focus'); });
  window.addEventListener('online', function(){ if(S.me) pull('online'); });
  window.addEventListener('offline', function(){ if(S.me){ SY.state='offline'; stamp(); } });
  window.addEventListener('pagehide', function(){ if(S.me && !SY.stopped) flush(); });
  document.addEventListener('focusout', function(){
    /* a repaint held back while someone typed happens when they leave the field: memory already matches the
       server, so a pull alone would find nothing to redraw and the list would keep its old ticks (third review) */
    if(SY.deferPaint){ SY.deferPaint=false; setTimeout(function(){ if(textFocus()) SY.deferPaint=true; else repaintKeepingFocus(); }, 350); }
    if(SY.deferred){ SY.deferred=false; setTimeout(function(){ pull('focusout'); }, 400); } }, true);

  window.__HT28c = {
    pull: function(){ return pull('test'); },
    flush: flush,
    config: function(){ return { POLL_MS:POLL_MS, MAX_BACKOFF:MAX_BACKOFF, WINDOW_DAYS:WINDOW_DAYS, TYPING_HOLD_MS:TYPING_HOLD_MS }; },
    state: function(){ return { state:SY.state, last:SY.last && SY.last.toISOString(), nextMs:SY.nextMs, fails:SY.fails,
      pulls:SY.pulls, applied:SY.applied, ops:count(OPS.days)+count(OPS.priv), lost:SY.lostN, stamp:stampText(),
      deferred:SY.deferred, stopped:SY.stopped, held:SY.held, reason:SY.reason }; },
    ops: function(){ return JSON.parse(JSON.stringify(OPS)); },
    lost: function(){ try{ return S.me ? JSON.parse(localStorage.getItem(LOST_KEY+S.me.id)||'[]') : []; }catch(e){ return []; } }
  };
})();

/* ======================= HT-28d · THE PHONE'S VIEWS: GROUP DETAILS, ONE HEADER, ONE ORDER (PASTE 128 A3 · A6) =======================
   PHONE ONLY (<=640px). Cory's phone review, 9/11 19:00-19:15: "Group details - the whole section better".
   Group details is HT-17's drawer - tap a row of GROUP ADHERENCE and it opens that group's standards. On the
   phone it rendered six desktop columns into 366px: names in 117px, a percentage wrapping under its own dot,
   "LAST DONE" breaking in two. Rebuilt here as one clean table per group - Standard · Completion · Rating ·
   Streak - under the group definition line Cory's words already ship with (HT-16's ADHERENCE_DEF). Every
   label a person reads is humanized (words, Title Case, acronyms kept). The desktop drawer is untouched:
   nothing below runs above 640px, and the columns it drops here (missed, last done, usual) stay on the
   desktop and in DETAIL -> MORE (R70.138). Order, equal cards and the header style are CSS (app.css HT-28 A6). */
(function(){
  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  var PHONE = window.matchMedia ? window.matchMedia('(max-width:640px)') : { matches:false };
  function on(){ return PHONE.matches && !advanced(); }

  /* stress 2: a humanizer that lowercases HT into "Ht" is worse than none - known acronyms are kept */
  var ACRONYMS = ['HT','BEV','AM','PM','ID','SPEC','KPI','CC'];
  function humanize(s){
    var w = String(s==null?'':s).replace(/[_]+/g,' ').replace(/([a-z0-9])([A-Z])/g,'$1 $2')
              .replace(/\s+/g,' ').trim();
    if(!w) return w;
    return w.split(' ').map(function(x){
      var up=x.toUpperCase();
      if(ACRONYMS.indexOf(up)>=0) return up;
      if(/^[0-9]/.test(x)) return x;
      return x.charAt(0).toUpperCase()+x.slice(1).toLowerCase();
    }).join(' ');
  }

  /* ---- A6 · the scorecard's labels, in words ---- */
  var SC = { 'group':'Group', '30d':'30 Days', '\u0394':'Change', 'streak':'Streak', 'weakest':'Weakest',
             '12 weeks':'12 Weeks', 'on time':'On Time' };
  function humanizeScorecard(){
    var host=document.getElementById('vGroups'); if(!host) return;
    /* THE ROWS ARE THE DOOR TO GROUP DETAILS, AND A DAY CHANGE UNTAGGED THEM. HT-17 tags each row with its
       group from its paintAll/paintLog wrappers only; goDay() repaints the scorecard without either, so after
       moving one day back and forth no row carried data-grp and tapping a group did nothing (measured: 4/4
       tagged at load, 0/4 after goDay). Re-tagged here on every re-render, at every width - an attribute,
       not a pixel. */
    var names=(window.__HT16 && window.__HT16.scorecardRows) ? window.__HT16.scorecardRows().map(function(r){ return r.group; }) : [];
    q('tbody tr', host).forEach(function(tr, i){
      if(names[i]!=null && tr.getAttribute('data-grp')!==names[i]) tr.setAttribute('data-grp', names[i]); });
    var ph=on();
    q('thead th', host).forEach(function(th){
      if(!th.hasAttribute('data-h28o')) th.setAttribute('data-h28o', th.textContent);
      var o=th.getAttribute('data-h28o'), v=ph ? (SC[o.trim()] || SC[o.trim().toLowerCase()] || humanize(o)) : o;
      if(th.textContent!==v) th.textContent=v;
    });
    q('tbody td.g', host).forEach(function(td){
      if(!td.hasAttribute('data-h28o')) td.setAttribute('data-h28o', td.textContent);
      var o=td.getAttribute('data-h28o'), v=ph ? humanize(o) : o;
      if(td.textContent!==v) td.textContent=v;
    });
  }

  /* ---- A3 · one group's details, one clean table ---- */
  function ratingAvg(h){
    var a=[];
    for(var i=0;i<30;i++){ var k=shift(today(),-i);
      if(!loggedOn(k) || !doneOn(h,k)) continue;
      var r=ratingOf(k); if(r!=null) a.push(r); }
    return a.length ? Math.round(a.reduce(function(x,y){ return x+y; },0)/a.length*10)/10 : null;
  }
  function streakOf(h){
    var n=0;
    for(var i=0;i<400;i++){ var k=shift(today(),-i);
      if(!loggedOn(k)){ if(i===0) continue; break; }
      if(!dueDay(h,k)) continue;                 /* HT-28 E12: an off-day neither extends nor breaks it */
      if(doneOn(h,k)) n++; else break; }
    return n;
  }
  function pc(v){ return v==null ? '\u2014' : v+'%'; }
  function groupDetails(g){
    var body=document.getElementById('h17DrBody'); if(!body || !g) return false;
    var H=window.__HT16||{}, win=H.adherenceWindow;
    var hs=S.habits.filter(function(h){ return (h.group_name||'Other')===g; });
    var cur=win ? win(g,0,29) : { pct:null, hit:0, opp:0 }, prv=win ? win(g,30,59) : { pct:null };
    var ot=H.onTime30 ? H.onTime30(g) : null, wk=[];
    for(var w=0;w<12;w++){ var a=win ? win(g,w*7,w*7+6) : null; if(a && a.opp) wk.push(a.pct); }
    var best=wk.length ? Math.max.apply(null,wk) : null, worst=wk.length ? Math.min.apply(null,wk) : null;
    var rf=H.rampFill || function(){ return 'var(--surface)'; };
    function stat(l,v){ return '<div><span>'+esc(l)+'</span><b>'+v+'</b></div>'; }
    var rows=hs.map(function(h){
      var p=adherence30(h.id), r=ratingAvg(h);
      return '<tr data-h="'+esc(h.id)+'"><td class="n">'+esc(nameOf(h.name))+'</td>'+
        '<td class="v"><i style="background:'+rf(p)+'"></i>'+pc(p)+'</td>'+
        '<td class="v">'+(r==null?'\u2014':r.toFixed(1))+'</td>'+
        '<td class="v">'+streakOf(h)+'</td></tr>';
    }).join('');
    body.innerHTML=
      '<div class="h17dh"><h3>'+esc(humanize(g))+'</h3><span style="flex:1"></span>'+
        '<button class="tbtn" data-drx="1" type="button">Close</button></div>'+
      '<div class="h28gdef">'+esc(H.ADHERENCE_DEF || '')+'</div>'+
      '<div class="h28gst">'+
        stat('Last 30 Days', pc(cur.pct)) + stat('Completed', cur.hit+' of '+cur.opp) + stat('On Time', pc(ot)) +
        stat('Prior 30 Days', pc(prv.pct)) + stat('Best Week', pc(best)) + stat('Worst Week', pc(worst)) +
      '</div>'+
      '<div class="h28tbl">'+
        (hs.length ?
          '<table class="h28gt"><colgroup><col class="n"><col class="v"><col class="v"><col class="v"></colgroup>'+
          '<thead><tr><th>Standard</th><th>Completion</th><th>Rating</th><th>Streak</th></tr></thead>'+
          '<tbody>'+rows+'</tbody></table>' : '')+
        '<div class="h28gnote">'+
          (hs.length===0 ? 'No standards in this group.' :
           hs.length===1 ? 'One standard in this group so far \u2014 add another from Today and they line up here.' : '')+
          (hs.length ? (hs.length===1?' ':'')+'Rating is your own 1\u201310, averaged over the days you kept it.' : '')+
        '</div>'+
      '</div>';
    body.setAttribute('data-h28', g);
    return true;
  }
  function drawerOpenGroup(){
    var d=document.getElementById('h17Drawer');
    return (d && d.classList.contains('on')) ? d.getAttribute('data-grp') : null;
  }
  function reassertDrawer(){
    if(!on()) return;
    var g=drawerOpenGroup(), body=document.getElementById('h17DrBody');
    if(g && body && !body.querySelector('.h28gt, .h28gnote')) groupDetails(g);
  }
  /* HT-17 opens the drawer from its own listener on #vGroups; this one is on the document, so it runs after */
  document.addEventListener('click', function(e){
    if(!on() || !e.target.closest) return;
    var tr=e.target.closest('#vGroups [data-grp]'); if(!tr) return;
    groupDetails(tr.getAttribute('data-grp')); watch();
  });
  var mo=null;
  function watch(){
    var body=document.getElementById('h17DrBody');
    if(!body || mo || !window.MutationObserver) return;
    mo=new MutationObserver(function(){ reassertDrawer(); });
    mo.observe(body, { childList:true });
  }

  function boot28d(){
    if(!S.me) return;
    humanizeScorecard(); watch(); reassertDrawer();
  }
  window.__HT28d = { humanize:humanize, groupDetails:groupDetails, repaint:boot28d };
  var _pa=paintAll; paintAll=function(){ _pa.apply(null,arguments); boot28d(); };
  function watchScore(){
    var host=document.getElementById('vGroups');
    if(!host || host.__h28mo || !window.MutationObserver) return;
    host.__h28mo=new MutationObserver(function(){ humanizeScorecard(); });
    host.__h28mo.observe(host, { childList:true });
  }
  if(PHONE.addEventListener) PHONE.addEventListener('change', function(){ humanizeScorecard(); });
  if(document.readyState==='complete') setTimeout(function(){ boot28d(); watchScore(); }, 700);
  else window.addEventListener('load', function(){ setTimeout(function(){ boot28d(); watchScore(); }, 700); });
})();

/* ======================= HT-29 · CLOSE THE BACKLOG, THEN THE TWELVE (PASTE 133) =======================
   One wire, Cory's twelve items of 9/15. Every layer below is appended inside the same sealed closure and
   wraps what came before it by name, the way every layer since HT-9a has. Seams for the goldens are
   `window.__HT29*`, read-only. The database half is tools/sql/2026-09-15_ht29.sql; until it runs, each
   feature that needs it stays hidden (R70.138) and says nothing - never a half-working button. */

/* ---- HT-29 S1 · ONE RENDERER FOR THE JOURNAL BOXES ----------------------------------------------------------
   MEASURED BEFORE A LINE CHANGED (ht_stage\133\s1\): with the phone keyboard up, Completed and Prayer jumped a
   line's height each time a line wrapped (4 jumps of up to 21 px in 300 keys, each box) while the brain dump
   never moved; and every key in those two boxes wrote a hidden DOM node ("saving…") the dump never wrote.
   ONE CLASS, TWO CAUSES. growTo() set `height:auto` on EVERY key, so the page collapsed for an instant and a
   box near the page's end had its scroll clamped; and the boxes were bound by different handlers (the base
   wire() for Completed/Prayer/why, HT-10's bindDump for the dump, HT-9a's device stopgap on top of it).
   SO ONE RENDERER OWNS THEM: a focused box only grows - nothing collapses under a caret - and settles its
   height when it loses focus; a key writes no DOM outside the box; every box saves through one path (500 ms
   after the last key, and on blur) through HT-28c's wrappers, so sync still records each op.
   FOUND BY THE SAME READING, RETIRED HERE: HT-9a's loadDump() re-set the brain dump from its device stopgap
   after every check-off and day change - '' once the stopgap was gone - so the next key could write an empty
   dump over the server's. The box's text now only ever comes from the day's own row.
   The desktop (>= 1024) keeps HT-18's CSS-owned boxes exactly as 128 left them. */
(function(){
  var BOXES = { iDump:'brain_dump', iTasks:'tasks', iPrayer:'prayer', iWhy:'why' };
  var SAVE_MS = 500, saveT = null;

  function phone(){ return window.innerWidth < 1024; }
  function isBox(t){ return !!(t && BOXES[t.id] && String(t.tagName).toLowerCase() === 'textarea'); }
  function fit(t){
    if(!phone()) return;
    var ceil = growCeil(), cur = t.offsetHeight;
    if(document.activeElement === t){
      if(t.scrollHeight > t.clientHeight + 1){
        var want = Math.min(t.scrollHeight + 2, ceil);
        if(want > cur) t.style.height = want + 'px';
      }
    }else{
      t.style.height = 'auto';                                  /* nobody is typing here: safe to measure */
      t.style.height = Math.min(t.scrollHeight + 2, ceil) + 'px';
    }
    t.style.overflowY = (t.scrollHeight > t.clientHeight + 1) ? 'auto' : '';
  }
  /* growTo stays the one home for the rule (HT-25 S2); the journal boxes take the branch that never collapses */
  var _growTo = growTo;
  growTo = function(t){ return isBox(t) ? fit(t) : _growTo(t); };
  if(window.__HT25) window.__HT25.growTo = growTo;

  /* ONE INPUT PATH. Registered after HT-25's capture listener, so the height is settled first; it stops the event
     here, so the older per-box handlers (and their per-key DOM write) never run. */
  document.addEventListener('input', function(e){
    var t = e.target, field = t && BOXES[t.id];
    if(!field) return;
    e.stopImmediatePropagation();
    S.priv = S.priv || {};
    S.priv[field] = t.value;
    queuePriv();                                                /* HT-28c records the op and arms a 700 ms save… */
    clearTimeout(pvT);                                          /* …which this path replaces with one at 500 ms */
    clearTimeout(saveT);
    saveT = setTimeout(function(){ savePriv(); }, SAVE_MS);
  }, true);
  document.addEventListener('focusout', function(e){ if(isBox(e.target)) fit(e.target); }, true);

  /* THE BRAIN DUMP'S TEXT COMES FROM THE DAY'S ROW, NEVER FROM THE STOPGAP. loadDump() runs inside HT-9a's own
     paintMast and goDay wrappers; this wraps outside them and puts back what the row says, caret where it was.
     Nothing paints between the two writes, so nothing flashes. */
  function keepDump(fn){
    return function(){
      var t = el('iDump'), focused = !!t && document.activeElement === t;
      var s = focused ? t.selectionStart : null, en = focused ? t.selectionEnd : null;
      var out = fn.apply(null, arguments);
      t = el('iDump');
      if(t){
        var own = (S.priv && S.priv.brain_dump) || '';
        if(t.value !== own){
          t.value = own;
          if(focused && s != null){ try{ t.setSelectionRange(Math.min(s, own.length), Math.min(en, own.length)); }catch(err){} }
        }
      }
      return out;
    };
  }
  paintMast = keepDump(paintMast);
  goDay = keepDump(goDay);

  /* A09 · A SAVE SAYS NOTHING WHEN IT WORKS. "saved" popped over the lower boxes after every pause; a failure
     still says so ("note not saved"), and Settings' Synced line carries the time (HT-28c). Deleting this one
     wrapper brings the toast back exactly as it was (AUDIT.md A09). It matches the WORD, not the call site, so
     it also silences `saveTomorrow()` — which is dead behind FIVE_INPUTS_ONLY (DEC-171). If that flag ever
     flips, give that one its own word rather than loosening this. */
  var _toast = toast;
  toast = function(t){ if(t === 'saved') return; return _toast.apply(null, arguments); };

  window.__HT29S1 = { boxes:BOXES, saveMs:SAVE_MS };
})();

/* ---- HT-29 S2 · FOUR SECTIONS, AND THE TIME ON EACH TASK ---------------------------------------------------
   Morning routine · Night routine · Standards · Weekly, in that order, drawn by ONE function on the phone and the
   desktop alike. A standard sits in exactly one.
   WHERE A STANDARD SITS (Ruling 3, Cory 9/15): where HE puts it - `habits.section`, set in the sheet or by a drag
   across a section's header. A row with no section yet sits where it shows today: weekly -> Weekly, a planned
   time -> Morning, no time -> Standards, the Sabbath -> Night. The SAME rule places the stored rows once in the
   SQL, and is the rule in the vault copier and the nudge sender; golden_ht29 S2 holds them together. No rule by
   clock ever MOVES a standard: inside Morning and Night the planned time orders the rows (as TIMED did), inside
   Standards and Weekly the drag order does.
   THE TIME ON A TASK (S2.9) is one dot, never a number: a check-off already carries its clock (checked[id] =
   "HH:MM", HT-21 S2); the dot compares it with the planned time - on time within 15 minutes, late within 60,
   beyond that - and a tap says the minutes. HT-25's "✓ 08:34 +12m" label is hidden, never removed. */
var HT29_SECTIONS = true;                         /* false brings back HT-28's TIMED · ANYTIME · WEEKLY, untouched */
var HT29SEC = (function(){
  /* HT-30 S1.4 (PASTE 137, Cory 9/20): Morning routine . Night routine . Weekly routine . Standards.
     133 shipped `standards` before `weekly` and called the fourth one "Weekly"; his newer word governs
     both. THE ORDER IS DECLARED ONCE HERE and read by every renderer, by the markdown shape (HT29MD's
     SECTIONS) and by the nudge sender - `golden_ht30` S1 reads all three and fails the moment they drift. */
  var ORDER = ['morning','night','weekly','standards'];
  var NAMES = { morning:'Morning routine', night:'Night routine', weekly:'Weekly routine', standards:'Standards' };
  function sectionOf(h){
    var s = String((h && h.section) || '').toLowerCase();
    if(NAMES[s]) return s;
    if(!h) return 'standards';
    /* HT-31 S1.6 · THE LAW: nothing but the section field decides the section.
       The line that used to sit at the foot of this function - `if(winStartMin(h) != null) return
       'morning';` - is the defect Cory reported on 9/21: with `habits.section` absent (the HT-29 SQL
       is not run yet) a 21:30 task was a MORNING task, because the only thing left deciding was the
       clock, which his 9/15 ruling forbids outright. A placement the PERSON made is kept on the
       device until the column exists to hold it, and it is read here first. Cadence and the Sabbath
       stay: they are fields, not clocks. Everything else is Standards, where he can move it. */
    var own = (window.__HT31SEC && window.__HT31SEC.local(h.id)) || '';
    if(NAMES[own]) return own;
    if(isSabbathStd(h)) return 'night';
    if(isWeekly(h)) return 'weekly';
    return 'standards';
  }
  function dotOf(m){ return m == null ? null : (m <= 15 ? 'ontime' : (m <= 60 ? 'late' : 'beyond')); }
  return { ORDER:ORDER, NAMES:NAMES, sectionOf:sectionOf, dotOf:dotOf };
})();

(function(){
  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    return window.__ADVANCED===true || /[?&]advanced=1/.test(location.search);
  }
  function byId(){ var m = {}; (S.habits||[]).forEach(function(h){ m[h.id] = h; }); return m; }
  function mkAdd(sec){
    var b = document.createElement('button');
    b.className = 'eadd'; b.type = 'button';
    b.setAttribute('data-add', ''); b.setAttribute('data-sec', sec);
    b.textContent = '+ Add to ' + HT29SEC.NAMES[sec].toLowerCase();
    return b;
  }

  function regroup29(){
    if(advanced()) return;
    var log = document.getElementById('log'); if(!log) return;
    var kids = Array.prototype.slice.call(log.children);
    var rows = kids.filter(function(c){ return c.classList.contains('li'); });
    if(!rows.length) return;
    var hm = byId(), B = {}, other = [];
    HT29SEC.ORDER.forEach(function(k){ B[k] = []; });   /* HT-30: the order is declared once */
    kids.forEach(function(c, i){
      if(c.classList.contains('li')){
        var h = hm[c.getAttribute('data-h')];
        B[HT29SEC.sectionOf(h)].push({ r:c, h:h, i:i });
      }else if(!c.classList.contains('grp') && !c.classList.contains('eadd')) other.push(c);
    });
    function so(x){ return (x.h && x.h.sort_order != null) ? x.h.sort_order : 1e9; }
    function byTime(a, b){
      var x = a.h ? winStartMin(a.h) : null, y = b.h ? winStartMin(b.h) : null;
      return (x==null?1e9:x) - (y==null?1e9:y) || so(a) - so(b) || a.i - b.i;
    }
    function byOrder(a, b){ return so(a) - so(b) || a.i - b.i; }
    B.morning.sort(byTime); B.night.sort(byTime); B.standards.sort(byOrder); B.weekly.sort(byOrder);
    var frag = document.createDocumentFragment();
    HT29SEC.ORDER.forEach(function(s){
      if(!B[s].length) return;
      var hd = document.createElement('div'); hd.className = 'grp'; hd.setAttribute('data-sec', s);
      hd.textContent = HT29SEC.NAMES[s];
      frag.appendChild(hd);
      B[s].forEach(function(x){ frag.appendChild(x.r); });
      frag.appendChild(mkAdd(s));
    });
    other.forEach(function(o){ frag.appendChild(o); });
    log.innerHTML = ''; log.appendChild(frag);
    dots(hm);
    doneTitles(hm);
  }

  /* one dot per checked task that has a planned time; the old label is hidden and its words move into the tap */
  function dots(hm){
    Array.prototype.slice.call(document.querySelectorAll('#log .li')).forEach(function(r){
      var h = hm[r.getAttribute('data-h')], dat = r.querySelector('.dat');
      var old = r.querySelector('.dot29'); if(old) old.parentNode.removeChild(old);
      if(dat) dat.classList.remove('dat29off');
      if(!h || !dat) return;
      var m = lateMin(h, S.date), cls = HT29SEC.dotOf(m);
      /* THE LABEL IS ONLY HIDDEN WHERE A DOT REPLACES IT. Hidden for every row first, a standard with no
         planned time lost its done-at clock ("done 08:34") and got nothing back: dotOf(null) is null, so the
         function returned after the class was already on. Ruling 3 replaces the LATENESS label, not the clock. */
      if(!cls) return;
      dat.classList.add('dat29off');
      var done = doneAt(S.date, h.id);
      var d = document.createElement('i');
      d.className = 'dot29 ' + cls; d.setAttribute('role', 'button'); d.setAttribute('tabindex', '0');
      d.setAttribute('aria-label', (cls === 'ontime' ? 'on time' : m + ' minutes late') + ', done ' + fmtTime(done));
      d.setAttribute('data-say', 'done ' + fmtTime(done) + ' · ' + (m === 0 ? 'on time' : (m < 0 ? (-m) + ' min early' : '+' + m + ' min')));
      dat.parentNode.insertBefore(d, dat);
    });
  }
  function say(d){ toast(d.getAttribute('data-say')); }
  document.addEventListener('click', function(e){
    var d = e.target.closest && e.target.closest('.dot29');
    if(d){ e.preventDefault(); e.stopPropagation(); say(d); return; }
    /* "+ Add to night routine" presets the section on the sheet HT-11 is about to open */
    var a = e.target.closest && e.target.closest('#log .eadd[data-sec]');
    window.__HT29_PRESET_SECTION = a ? a.getAttribute('data-sec') : null;
  }, true);
  document.addEventListener('keydown', function(e){
    var d = e.target.closest && e.target.closest('.dot29');
    if(d && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); e.stopPropagation(); say(d); }
  }, true);

  /* the definition of done rides the name on a desktop hover; on the phone a long-press opens the sheet with it */
  function doneTitles(hm){
    Array.prototype.slice.call(document.querySelectorAll('#log .li')).forEach(function(r){
      var nm = r.querySelector('.nm'), h = hm[r.getAttribute('data-h')];
      if(!nm) return;
      var def = h && String(h.notes || '').trim();
      if(def) nm.setAttribute('title', 'Done when: ' + def); else nm.removeAttribute('title');
    });
  }

  /* called by HT-28's regroup28 from every path that repaints the list, so it runs last */
  window.__HT29S2 = { regroup:regroup29, sectionOf:HT29SEC.sectionOf, dotOf:HT29SEC.dotOf,
                      names:HT29SEC.NAMES, hasSection:function(){ return !!S.hasSection; } };
})();

/* ---- HT-29 S3 · THE GROUP, REAL AND BOTH WAYS ----------------------------------------------------------------
   Cory 9/15: "document our inputs and hold each other accountable between group members." Andrew signed up and
   the two of them could not see each other. The reading (WIRE HT-29, recon) found two causes and fixes both:
     1 · NOBODY COULD REACH THE GROUP ON A PHONE. Create and join lived in a panel the simple view hides, and a
         `?join=CODE` link was saved to the device and never read back. Now: a join card on the first open after
         sign-in, and Settings -> Group (create · join · invite) at every width.
     2 · IF ANDREW DID JOIN, the believed policy on circle_members showed each person only their own row - so each
         saw a group of one. Reproduced on Postgres (tools/sql/test_privacy_pg.py B1) and fixed in the SQL.
   What a member sees of another (Ruling 4): the standards, the check-offs and their times, the rating NUMBER -
   through ht29_member_day and ht29_circle_ratings, which return exactly that. Never a journal field, never the
   why. Until the SQL runs those functions do not exist: the lines still show today / 7 days / 30 days, and a
   member's line simply does not open (hidden, never a broken door). */
var HT29_GROUP_OLD = false;                       /* true brings back HT-18d's three-column card, untouched */
function warn29(what, e){ try{ console.warn('HT-29: ' + what, e && (e.code || e.message || e)); }catch(x){} }
var HT29GRP = (function(){
  var circle = null, state = 'loading', canDay = null, canRate = null, rateErr = false;
  /* "the function is not there yet" is one specific answer - PostgREST says PGRST202, Postgres says 42883.
     Every other error is a real failure and must not be read as "the SQL has not run". */
  function absentFn(e){ var c = String((e && (e.code || e.message)) || ''); return /PGRST202|42883|does not exist/i.test(c); }
  function setCircle(c){ circle = c; }
  function setState(s){ state = s; }
  function calMean(map, n){
    var sum = 0; for(var i = 0; i < n; i++){ var v = map[shift(today(), -i)]; sum += (v == null ? 0 : +v); }
    return Math.round(sum / n);
  }
  /* LOGGED counts RATED days - that is what makes a skipped day visible (Ruling 1). Before the SQL runs there
     is no ratings function, and days-with-a-row is the honest stand-in. A FAILED ratings call is NOT that case:
     falling back there would quietly swap one measure for a larger one and print it as the same column. So a
     failure returns null from here and the column shows a dash. */
  function loggedN(ratingMap, dayMap, n){
    if(!ratingMap && rateErr) return null;
    var c = 0;
    for(var i = 0; i < n; i++){
      var k = shift(today(), -i);
      if(ratingMap ? ratingMap[k] != null : dayMap[k] != null) c++;
    }
    return c;
  }
  /* the rating NUMBER of the people who share a group with me, by user and date - null when the function is absent */
  async function ratings(d0, d1){
    try{
      var r = await sb.rpc('ht29_circle_ratings', { d0:d0, d1:d1 });
      if(r.error){ canRate = false; rateErr = !absentFn(r.error); return null; }
      canRate = true; rateErr = false;
      var out = {};
      (r.data || []).forEach(function(x){ (out[x.user_id] = out[x.user_id] || {})[x.date] = x.rating; });
      return out;
    }catch(e){ canRate = false; rateErr = true; return null; }
  }
  async function probeDay(uid){
    try{ var r = await sb.rpc('ht29_member_day', { member:uid, d:today() }); canDay = !r.error; }
    catch(e){ canDay = false; }
    return canDay;
  }
  function member(uid, profile, dayMap, ratingMap){
    return { id:uid, n:(profile.display_name || profile.handle || 'member'),
             t:(dayMap[today()] == null ? 0 : Math.round(+dayMap[today()])),
             w:calMean(dayMap, 7), m:calMean(dayMap, 30), logged:loggedN(ratingMap, dayMap, 7),
             ratedBy:!!ratingMap, days:dayMap, p:calMean(dayMap, 30) };
  }
  function you(){
    var dm = {}, rm = {};
    Object.keys(S.byDate || {}).forEach(function(k){ var r = S.byDate[k]; if(r && r.pct != null) dm[k] = r.pct; });
    Object.keys(S.privAll || {}).forEach(function(k){ var p = S.privAll[k]; if(p && p.rating != null) rm[k] = p.rating; });
    return { id:S.me && S.me.id, n:'You', t:(dm[today()] == null ? 0 : Math.round(+dm[today()])),
             w:calMean(dm, 7), m:calMean(dm, 30), logged:loggedN(rm, dm, 7), you:true, days:dm };
  }
  function pc(v){ return v + '%'; }
  function cell(v){
    var rf = (window.__HT16 && window.__HT16.rampFill) || function(){ return 'var(--surface)'; };
    return '<td class="p"><i style="background:' + rf(v) + '"></i>' + pc(v) + '</td>';
  }
  function rows(list, opts){
    return list.map(function(r){
      var open = !r.you && canDay === true;
      return '<tr' + (r.you ? ' class="h18me"' : '') + (open ? ' data-h29m="' + esc(r.id) + '" tabindex="0"' : '') + '>' +
        '<td class="n">' + esc(r.n) + (open ? ' <span class="h29go">›</span>' : '') + '</td>' +
        cell(r.t) + cell(r.w) + cell(r.m) + '<td class="l">' + (r.logged == null ? '—' : r.logged + '/7') + '</td></tr>';
    }).join('');
  }
  function empty(){
    if(state === 'error') return 'The group did not load — it will try again on the next open.';
    if(state === 'none' || !circle) return 'No group yet. <button class="h29lnk" type="button" data-h29group>Start one or join one</button>';
    return 'No one else yet. <button class="h29lnk" type="button" data-h29invite>Invite someone</button>';
  }
  function table(others){
    return '<table class="h18gt h29gt"><colgroup><col class="n"><col><col><col><col></colgroup>' +
      '<thead><tr><th>member</th><th>today</th><th>7 days</th><th>30 days</th><th>logged</th></tr></thead>' +
      '<tbody>' + rows([you()].concat(others)) +
      (others.length ? '' : '<tr class="h18none"><td colspan="5">' + empty() + '</td></tr>') +
      '</tbody></table>';
  }
  function block(others){
    return '<div class="h18gh">GROUP' + (circle ? ' <span class="h29gn">' + esc(circle.name || '') + '</span>' : '') +
      '<span class="sp"></span><button class="h18more h29off" data-h18more type="button">detail</button>' +
      '<button class="h29inv" type="button" data-h29' + (circle ? 'invite' : 'group') + '>' + (circle ? 'invite' : 'join') + '</button></div>' +
      table(others);
  }

  /* ---- a member's day: sections, names, check marks, the time dots, the rating number - read only ---- */
  function dayLabel(k){ var d = dnum(k); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MO[d.getMonth()]; }
  async function openDay(uid, k){
    var who = (circleRows29().filter(function(r){ return r.id === uid; })[0] || {}).n || 'member';
    k = k || today();
    var res;
    try{ res = await sb.rpc('ht29_member_day', { member:uid, d:k }); }
    catch(e){ res = { error:e }; }
    if(res.error || !res.data){
      if(res.error){ canDay = false; warn29('member day unavailable', res.error); }
      toast(res.error ? 'not available yet' : 'nothing to show');
      if(typeof paintAll === 'function') paintAll();
      return;
    }
    canDay = true;
    var day = res.data, rt = null;
    if(canRate !== false){ var rr = await ratings(k, k); rt = rr && rr[uid] ? rr[uid][k] : null; }
    openOv(who, dayHtml(uid, k, day, rt), function(){
      var box = el('h29Day'); if(!box) return;
      box.addEventListener('click', function(e){
        var nav = e.target.closest('[data-h29d]'); if(!nav) return;
        var to = shift(k, +nav.getAttribute('data-h29d'));
        if(to > today()) return;
        closeOv(); setTimeout(function(){ openDay(uid, to); }, 60);
      });
    });
  }
  function dayHtml(uid, k, day, rating){
    var hs = (day.habits || []).map(function(h){ return h; });
    var set = Array.isArray(day.active_set) && day.active_set.length ? day.active_set.map(String) : null;
    var due = hs.filter(function(h){ return set ? set.indexOf(String(h.id)) >= 0 : (h.active !== false && (isWeekly(h) || dueOn(h, k))); });
    var ck = day.checked || {}, done = due.filter(function(h){ return ck[h.id]; }).length;
    var out = '<div id="h29Day" class="h29day">' +
      '<div class="h29nav"><button class="tbtn" type="button" data-h29d="-1" aria-label="previous day">‹</button>' +
      '<b>' + esc(dayLabel(k)) + '</b>' +
      '<button class="tbtn" type="button" data-h29d="1" aria-label="next day"' + (k >= today() ? ' disabled' : '') + '>›</button></div>' +
      '<div class="h29sum">' + done + ' of ' + due.length + ' · ' + (day.pct == null ? 0 : Math.round(day.pct)) + '%' +
        (rating != null ? ' · rated ' + rating : '') + '</div>';
    HT29SEC.ORDER.forEach(function(s){
      var list = due.filter(function(h){ return HT29SEC.sectionOf(h) === s; });
      if(!list.length) return;
      list.sort(function(a, b){
        var x = (s === 'morning' || s === 'night') ? winStartMin(a) : null, y = (s === 'morning' || s === 'night') ? winStartMin(b) : null;
        return (x == null ? 1e9 : x) - (y == null ? 1e9 : y) || (a.sort_order || 0) - (b.sort_order || 0);
      });
      out += '<div class="grp" data-sec="' + s + '">' + HT29SEC.NAMES[s] + '</div>';
      list.forEach(function(h){
        var mark = ck[h.id], at = typeof mark === 'string' ? minsOf(mark) : null, pl = winStartMin(h);
        var m = (at != null && pl != null) ? at - pl : null, cls = HT29SEC.dotOf(m);
        out += '<div class="h29r' + (mark ? ' on' : '') + '"><span class="h29ck" aria-label="' + (mark ? 'done' : 'not done') + '">' +
          (mark ? '✓' : '') + '</span><span class="nm"' + (h.done_def ? ' title="Done when: ' + esc(h.done_def) + '"' : '') + '>' +
          esc(nameOf(h.name)) + '</span>' +
          (cls ? '<i class="dot29 ' + cls + '" data-say="' + esc('done ' + fmtTime(mark) + (m === 0 ? ' · on time' : (m < 0 ? ' · ' + (-m) + ' min early' : ' · +' + m + ' min'))) + '" role="button" tabindex="0"></i>' : '') +
          '</div>';
      });
    });
    return out + '<div class="note h29priv">Their check-offs and the day’s number. Nobody’s journal is ever shown here.</div></div>';
  }

  /* ---- joining, starting and inviting ---- */
  async function join(code){
    try{ return await join0(code); }
    catch(e){ warn29('join failed', e); return { ok:false, why:'Could not join — try again.' }; }
  }
  async function join0(code){
    code = String(code || '').trim().toUpperCase();
    if(!code) return { ok:false, why:'enter a code' };
    var r = await sb.rpc('ht29_join_circle', { code:code });
    if(r.error && /PGRST202|42883|not find the function|does not exist/i.test(String(r.error.code || '') + ' ' + String(r.error.message || ''))){
      r = await sb.rpc('join_circle', { code:code });                       /* before the SQL: the original */
      if(r.error && /23505|duplicate/i.test(String(r.error.code || '') + ' ' + String(r.error.message || ''))) r = { data:true };
    }
    if(r.error) return { ok:false, why:/NO_SUCH_CIRCLE|P0002/i.test(String(r.error.message || '') + String(r.error.code || '')) ? 'No group with that code.' : 'Could not join — try again.' };
    return { ok:true };
  }
  async function create(name){
    try{ return await create0(name); }
    catch(e){ warn29('create failed', e); return { ok:false, why:'Could not create it.' }; }
  }
  async function create0(name){
    name = String(name || '').trim();
    if(!name) return { ok:false, why:'give it a name' };
    /* CRYPTO, AND A FIXED LENGTH. `Math.random().toString(36).slice(2,8)` is not only guessable - it returns
       fewer than six characters whenever the float is short, and under Ruling 4 a guessed code now buys
       someone's standards, their definitions of done, their check-off times and their rating numbers. */
    /* HT-31 S7.23: ONE generator, and it makes a 128-bit code. Ten characters of this alphabet is
       49 bits and `byte % 31` favoured the first ten letters - both fixed in `__HT31GRP.newCode`,
       which is also what Reset link uses, so a reset code and a first code are the same strength. */
    var code = (window.__HT31GRP && window.__HT31GRP.newCode) ? window.__HT31GRP.newCode() : (function(){
      var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', out = '';      /* no I/L/O/0/1: a code gets read aloud */
      var n = new Uint8Array(10);
      if(window.crypto && crypto.getRandomValues) crypto.getRandomValues(n);
      else for(var i = 0; i < n.length; i++) n[i] = Math.floor(Math.random() * 256);
      for(var j = 0; j < n.length; j++) out += A[n[j] % A.length];
      return out;
    })();
    var c = await sb.from('circles').insert({ name:name, join_code:code, owner:S.me.id }).select('id').single();
    if(c.error) return { ok:false, why:'Could not create it.' };
    var m = await sb.from('circle_members').insert({ circle_id:c.data.id, user_id:S.me.id });
    if(m && m.error) return { ok:false, why:'Created, but not joined — enter its code: ' + code };
    return { ok:true, code:code };
  }
  function inviteText(code){
    var j = window.__HT24_JOIN;
    return j ? j.message(code) : ('Join my group in the Habit Tracker with the code ' + code);
  }
  async function invite(e){
    /* HT-31 S7.24: a person with no group who taps Invite gets "Start a group" in the SAME sheet -
       one flow, never a dead control. */
    if(!circle || !circle.join_code){ openGroup(); return; }
    /* HT-31 S7.22: the three routes live in one place now (`__HT31GRP.share`), so the phone's own
       share sheet, the clipboard and the selected field behave identically wherever Invite is shown. */
    if(window.__HT31GRP && window.__HT31GRP.share){
      await window.__HT31GRP.share(circle.join_code, (e && e.target) || null);
      return;
    }
    var text = inviteText(circle.join_code), url = window.__HT24_JOIN ? window.__HT24_JOIN.link(circle.join_code) : '';
    try{
      if(navigator.share){ await navigator.share({ title:'Habit Tracker', text:text, url:url }); return; }
      await navigator.clipboard.writeText(text);
      toast('invite copied — paste it to them');
    }catch(e){ if(!e || e.name !== 'AbortError') toast('code ' + circle.join_code); }
  }
  function groupHtml(){
    if(circle){
      return '<div class="note" style="padding:4px 0 12px">You are in <b>' + esc(circle.name || 'a group') + '</b>. ' +
        'The group sees your standards, check-offs and the day’s number — never your journal.</div>' +
        '<div class="h29code">code <b>' + esc(circle.join_code || '') + '</b></div>' +
        '<div class="tools"><button class="btn pri" id="g29Invite" type="button">Invite someone</button></div>';
    }
    return '<div class="note" style="padding:4px 0 12px">A group sees each other’s standards, check-offs and the day’s number — never a journal.</div>' +
      '<label class="fld"><span class="lab">Join with a code</span><input id="g29Code" placeholder="ABC123" autocapitalize="characters" autocomplete="off"></label>' +
      '<div class="tools"><button class="btn pri" id="g29Join" type="button">Join</button></div>' +
      '<label class="fld" style="margin-top:14px"><span class="lab">Or start one</span><input id="g29Name" placeholder="Name it" autocomplete="off"></label>' +
      '<div class="tools"><button class="btn" id="g29Make" type="button">Start</button></div>' +
      '<div class="note" id="g29Msg" style="padding-top:12px"></div>';
  }
  function openGroup(){
    /* HT-30 S7.16: the same two actions, named as Cory names them, with the share LINK beside the code
       and a way out beside Invite. `groupHtml` stays exactly as HT-29 wrote it and is the fallback, so a
       build where the HT-30 layer failed to parse still opens a working Group screen. */
    var html = groupHtml();
    try{ if(window.__HT30GRP) html = window.__HT30GRP.html({ circle:circle }); }catch(e){ warn29('HT-30 group html', e); }
    openOv('Group', '<div id="g29">' + html + '</div>', bindGroup);
  }
  function bindGroup(){
    var inv = el('g29Invite'); if(inv) inv.onclick = invite;
    var jb = el('g29Join'), mk = el('g29Make'), msg = el('g29Msg');
    if(jb) jb.onclick = async function(){
      jb.disabled = true;
      /* HT-30 S7.16: a pasted invite LINK is a code. Nobody reads a query string off a message and
         types the six characters out of it by hand. */
      var typed = el('g29Code').value;
      try{ if(window.__HT30GRP) typed = window.__HT30GRP.codeOf(typed); }catch(e){ warn29('HT-30 code parse', e); }
      var r = await join(typed);
      jb.disabled = false;
      if(!r.ok){ if(msg) msg.textContent = r.why; return; }
      try{ localStorage.removeItem('ht_join_code'); }catch(e){}
      toast('joined'); setTimeout(function(){ location.reload(); }, 400);
    };
    if(mk) mk.onclick = async function(){
      mk.disabled = true;
      var r = await create(el('g29Name').value);
      mk.disabled = false;
      if(!r.ok){ if(msg) msg.textContent = r.why; return; }
      toast('group started · code ' + r.code); setTimeout(function(){ location.reload(); }, 600);
    };
    /* HT-30 S7.16 LEAVE. It asks first: leaving drops this account's row in `circle_members`, and the
       group's other members simply stop seeing the day. Nothing of this account's own is touched. */
    var rs = el('h31Reset');
    if(rs) rs.onclick = async function(){
      if(!window.confirm('Reset the link? The one you sent before stops working straight away.')) return;
      rs.disabled = true;
      var r = (window.__HT31GRP && window.__HT31GRP.reset) ? await window.__HT31GRP.reset() : { ok:false, why:'not available' };
      rs.disabled = false;
      if(!r.ok){ if(msg) msg.textContent = r.why; return; }
      toast('new link'); openGroup();
    };
    var lv = el('h30Leave');
    if(lv) lv.onclick = async function(){
      if(!window.confirm('Leave this group? Your own standards, check-offs and journal are untouched.')) return;
      lv.disabled = true;
      var r = window.__HT30GRP ? await window.__HT30GRP.leave() : { ok:false, why:'not available' };
      lv.disabled = false;
      if(!r.ok){ if(msg) msg.textContent = r.why; return; }
      toast('left the group'); setTimeout(function(){ location.reload(); }, 400);
    };
  }
  /* Settings -> Group, beside HT-28's Advanced */
  var _os = openSettings;
  openSettings = function(){
    var out = _os.apply(null, arguments);
    setTimeout(function(){
      var ov = document.querySelector('.ov.on .inner') || document.querySelector('.ov .inner');
      if(!ov || el('g29Set')) return;
      var w = document.createElement('div'); w.id = 'g29Set'; w.className = 'pan'; w.style.marginTop = '14px';
      w.innerHTML = '<div class="lab">Group</div><div id="g29">' + groupHtml() + '</div>';
      var priv = el('privNote');
      if(priv && priv.parentNode === ov) ov.insertBefore(w, priv); else ov.appendChild(w);
      bindGroup();
    }, 70);
    return out;
  };

  /* ---- a join link, consumed after sign-in: one card, one tap ---- */
  var joinShown = false;
  function joinCard(){
    if(joinShown || !S.me || S.loadOk !== true) return;
    var code = null; try{ code = localStorage.getItem('ht_join_code'); }catch(e){}
    if(!code) return;
    joinShown = true;
    var n = el('h29Join');
    if(!n){
      n = document.createElement('div'); n.id = 'h29Join'; n.className = 'esheet h28first';
      n.setAttribute('role', 'dialog'); n.setAttribute('aria-modal', 'true');
      n.innerHTML = '<div class="ebody" id="h29JoinBody"></div>';
      document.body.appendChild(n);
      n.addEventListener('click', function(e){ if(e.target === n) n.classList.remove('on'); });
    }
    el('h29JoinBody').innerHTML = '<div class="eh"><h3>Join a group</h3></div>' +
      /* HT-31 S7.23: WHOSE group, and how many people are already in it - before you agree, not after.
         It comes from one function that returns those two facts and nothing else. */
      '<div class="note" id="h29JoinWho" style="padding:4px 0 0">…</div>' +
      '<div class="note" style="padding:4px 0 12px">You opened an invite with the code <b>' + esc(code) + '</b>. ' +
      'Your group will see your standards, check-offs and the day’s number — never your journal.</div>' +
      '<div class="note" id="h29JoinMsg"></div>' +
      '<div class="etools"><span style="flex:1"></span>' +
      '<button class="btn" id="h29JoinNo" type="button">Not now</button>' +
      '<button class="btn pri" id="h29JoinYes" type="button">Join</button></div>';
    n.classList.add('on');
    (async function(){
      var who = el('h29JoinWho'); if(!who) return;
      var got = (window.__HT31GRP && window.__HT31GRP.peek) ? await window.__HT31GRP.peek(code) : null;
      /* A CONTROL THAT CANNOT ANSWER SAYS SO (S6.18). Until `ht31_circle_peek` is in the database this
         card cannot name the group - so it says that in one quiet line, and the Join button still works.
         What it never does is show an empty space where a group's name should be. */
      who.textContent = got ? (got.name + ' · ' + got.members + ' member' + (got.members === 1 ? '' : 's'))
                            : 'The group’s name will show here once the database update is run.';
    })();
    el('h29JoinNo').onclick = function(){ try{ localStorage.removeItem('ht_join_code'); }catch(e){} n.classList.remove('on'); };
    el('h29JoinYes').onclick = async function(){
      var b = el('h29JoinYes'); b.disabled = true; b.textContent = 'joining…';
      var r = await join(code);
      if(!r.ok){ b.disabled = false; b.textContent = 'Join'; el('h29JoinMsg').textContent = r.why; return; }
      try{ localStorage.removeItem('ht_join_code'); }catch(e){}
      toast('joined'); setTimeout(function(){ location.reload(); }, 400);
    };
  }

  function click(e){
    var m = e.target.closest('[data-h29m]');
    if(m){ openDay(m.getAttribute('data-h29m')); return; }
    if(e.target.closest('[data-h29invite]')){ invite(e); return; }
    if(e.target.closest('[data-h29group]')){ openGroup(); }
  }
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    var m = e.target.closest && e.target.closest('[data-h29m]');
    if(m){ e.preventDefault(); openDay(m.getAttribute('data-h29m')); }
  });
  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments); joinCard(); return out; };

  return { setCircle:setCircle, setState:setState, ratings:ratings, probeDay:probeDay, member:member, you:you, block:block, table:table,
           click:click, openDay:openDay, openGroup:openGroup, invite:invite, join:join, calMean:calMean,
           state:function(){ return { state:state, circle:circle, canDay:canDay, canRate:canRate }; } };
})();
function circleRows29(){ return (window.__HT29GRP_ROWS && window.__HT29GRP_ROWS()) || []; }
window.__HT29GRP = HT29GRP;

/* ---- HT-29 S5 · ONE INSIGHTS, THREE THINGS ON ITS SURFACE ---------------------------------------------------
   Cory's item 8: DETAIL and Insights were two doors to overlapping rooms. One room now, three things on its surface,
   and everything HT-26 and DETAIL showed moves under its one "More" (hidden, never deleted):
     1 · COMPLETION OVER TIME - the last 7 or 30 days, the rating line and on-time %; a member's line on a tap.
         A day with nothing checked is 0% (Ruling 1): a line that skipped empty days would flatter.
     2 · WHAT MAKES A GOOD DAY - ten numbers; tap one and see which check-offs travel with it, and the why you wrote
         on those days (Cory 9/10: "what makes an 8"). Your own only - nobody's why is ever read for anyone else.
     3 · THE GROUP SIDE BY SIDE - S3's renderer: today · 7 days · 30 days · logged, a member's day on a tap.
   On-time % is a line inside 1, not a fourth thing (paste 133 S5.18). THE PHONE gets a bottom bar - Today ·
   Views · Insights - where HT-13's two tabs sat under the header (paste 133 S5.17); the desktop keeps its one
   Insights button, which opens the same three. */
var HT29INS = (function(){
  var range = 7, pick = null, shown = {};
  function days(n){ var out = []; for(var i = n - 1; i >= 0; i--) out.push(shift(today(), -i)); return out; }
  function pctOn(k){ var r = S.byDate[k]; return (r && r.pct != null) ? Math.round(+r.pct) : 0; }
  function ratingOn(k){ var p = S.privAll && S.privAll[k]; return (p && p.rating != null && p.rating !== '') ? +p.rating : null; }
  function onTimeOn(k){
    var hit = 0, n = 0;
    (S.habits || []).forEach(function(h){
      if(winStartMin(h) == null || !dueOn(h, k)) return;
      var m = lateMin(h, k); if(m == null) return;
      n++; if(m <= 15) hit++;
    });
    return n ? Math.round(hit / n * 100) : null;
  }
  function mean(a){ var v = a.filter(function(x){ return x != null; }); return v.length ? Math.round(v.reduce(function(s, x){ return s + x; }, 0) / v.length * 10) / 10 : null; }
  function trend(n){
    var ks = days(n), p = ks.map(pctOn);
    return { days:ks, pct:p, rating:ks.map(ratingOn), onTime:ks.map(onTimeOn),
             avg:Math.round(p.reduce(function(s, x){ return s + x; }, 0) / n), rateAvg:mean(ks.map(ratingOn)),
             onTimeAvg:(function(){ var m = mean(ks.map(onTimeOn)); return m == null ? null : Math.round(m); })() };
  }
  function explained(r){
    var ks = days(90).filter(function(k){ return ratingOn(k) != null; });
    var counts = {}; for(var i = 1; i <= 10; i++) counts[i] = 0;
    ks.forEach(function(k){ var v = Math.round(ratingOn(k)); if(counts[v] != null) counts[v]++; });
    if(r == null) return { r:null, n:0, counts:counts, rows:[], whys:[] };
    var on = ks.filter(function(k){ return Math.round(ratingOn(k)) === r; });
    function rate(h, set){
      var due = set.filter(function(k){ return dueOn(h, k); });
      if(!due.length) return null;
      var hit = due.filter(function(k){ var c = S.byDate[k] && S.byDate[k].checked; return c && c[h.id]; }).length;
      return Math.round(hit / due.length * 100);
    }
    var rows = !on.length ? [] : (S.habits || []).map(function(h){
      var a = rate(h, on), b = rate(h, ks);
      return (a == null || b == null) ? null : { name:nameOf(h.name), pct:a, base:b, lift:a - b };
    }).filter(Boolean).sort(function(x, y){ return y.lift - x.lift || y.pct - x.pct; }).slice(0, 5);
    var whys = on.slice().reverse().map(function(k){
      var p = S.privAll[k], w = p && String(p.why || '').trim();
      return w ? { date:k, why:w } : null;
    }).filter(Boolean).slice(0, 5);
    return { r:r, n:on.length, counts:counts, rows:rows, whys:whys };
  }
  function chart(t, members){
    var W = 340, H = 120, P = 6, n = t.days.length, bw = (W - 2 * P) / n;
    function y(v){ return (H - P - (H - 2 * P) * (v / 100)).toFixed(1); }
    var rf = (window.__HT16 && window.__HT16.rampFill) || function(){ return 'var(--ink3)'; };
    var bars = t.pct.map(function(v, i){
      var h = Math.max(1, (H - 2 * P) * v / 100);
      return '<rect x="' + (P + i * bw + 1).toFixed(1) + '" y="' + (H - P - h).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) +
             '" height="' + h.toFixed(1) + '" fill="' + rf(v) + '"><title>' + t.days[i] + ' · ' + v + '%</title></rect>';
    }).join('');
    function line(vals, scale, cls){
      var pts = []; vals.forEach(function(v, i){ if(v != null) pts.push((P + i * bw + bw / 2).toFixed(1) + ',' + y(v * scale)); });
      return pts.length > 1 ? '<polyline class="' + cls + '" points="' + pts.join(' ') + '" fill="none"/>' : '';
    }
    var mem = (members || []).map(function(m, j){ return line(m.pct, 1, 'l29m l29m' + (j % 3)); }).join('');
    return '<svg class="ch29" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="completion, last ' + n + ' days">' +
           bars + line(t.onTime, 1, 'l29t') + line(t.rating, 10, 'l29r') + mem + '</svg>';
  }
  function memberLines(n){
    return circleRows29().filter(function(r){ return shown[r.id]; }).map(function(r){
      return { name:r.n, pct:days(n).map(function(k){ var v = r.days && r.days[k]; return v == null ? 0 : Math.round(+v); }) };
    });
  }
  function card(id, title, body){ return '<div class="vins c5 h29c" data-i29="' + id + '"><div class="lab">' + title + '</div>' + body + '</div>'; }
  function trendCard(){
    var t = trend(range), others = circleRows29();
    return card('trend', 'Completion over time',
      '<div class="seg h29seg"><button type="button" data-i29r="7" class="' + (range === 7 ? 'on' : '') + '">7 days</button>' +
      '<button type="button" data-i29r="30" class="' + (range === 30 ? 'on' : '') + '">30 days</button></div>' +
      '<div class="vline">Average <b>' + t.avg + '%</b>' + (t.rateAvg != null ? ' · rating <b>' + t.rateAvg + '</b>' : '') +
        (t.onTimeAvg != null ? ' · on time <b>' + t.onTimeAvg + '%</b>' : '') + '</div>' +
      chart(t, memberLines(range)) +
      '<div class="h29leg"><span><i class="r"></i>rating</span><span><i class="t"></i>on time</span>' +
        (others.length ? others.map(function(r, j){
          return '<button type="button" class="h29mb' + (shown[r.id] ? ' on' : '') + '" data-i29m="' + esc(r.id) + '" aria-pressed="' + (shown[r.id] ? 'true' : 'false') + '">' +
                 '<i class="m' + (j % 3) + '"></i>' + esc(r.n) + '</button>'; }).join('') : '') + '</div>');
  }
  function rateCard(){
    var e = explained(pick), nums = '';
    for(var i = 1; i <= 10; i++){
      nums += '<button type="button" data-i29n="' + i + '" class="' + (pick === i ? 'on' : '') + '"' + (e.counts[i] ? '' : ' disabled') + '>' +
              '<b>' + i + '</b><span>' + e.counts[i] + '</span></button>';
    }
    var body = '<div class="h29nums">' + nums + '</div>';
    if(pick == null){
      body += '<div class="vline">' + (Object.keys(e.counts).some(function(k){ return e.counts[k]; })
        ? 'Tap a number to see what those days had in common.' : 'Rate a few days and this shows what your good days share.') + '</div>';
    }else if(!e.n){
      body += '<div class="vline">No day rated ' + pick + ' in the last 90.</div>';
    }else{
      body += '<div class="vline">' + e.n + ' day' + (e.n === 1 ? '' : 's') + ' rated <b>' + pick + '</b> · checked on those days (usual)</div>' +
        '<div class="c5rows">' + e.rows.map(function(r){
          return '<div class="c5r"><span class="n">' + esc(r.name) + '</span><span class="v num">' + r.pct + '% <i>(' + r.base + '%)</i></span></div>';
        }).join('') + '</div>' +
        (e.whys.length ? '<div class="h29why">' + e.whys.map(function(w){
          return '<div><span class="d num">' + esc(w.date.slice(5)) + '</span> ' + esc(w.why) + '</div>'; }).join('') + '</div>' : '');
    }
    return card('rate', 'What makes a good day', body);
  }
  function groupCard(){
    /* HT-31 S7.21: the group block on the phone's Insights is the SECOND of the two places Invite
       appears - the GROUP panel is the other, and there is no third. Same control, same three routes
       (`__HT31GRP.share`), reached by the same `data-h29invite`. */
    var body = HT29GRP.table(circleRows29());
    if(HT31_INVITE && h31CanInvite(circle)) body += '<div class="tools h31inv"><button class="btn pri" ' +
                            'data-h29invite="1" type="button">Invite</button></div>';
    return card('group', 'The group side by side', body);
  }
  function render(){
    var ins = el('h26Ins'); if(!ins) return;
    var box = el('ins29');
    if(!box){
      box = document.createElement('div'); box.id = 'ins29'; box.className = 'h29ins';
      var head = ins.querySelector('.sh');
      if(head && head.nextSibling) ins.insertBefore(box, head.nextSibling); else ins.appendChild(box);
      box.addEventListener('click', onClick);
    }
    box.innerHTML = trendCard() + rateCard() + groupCard();
    var cap = el('h26InsC'); if(cap) cap.textContent = '';
    var more = el('c5More'), five = el('c5Five');
    if(more && five && five.parentNode !== more) more.appendChild(five);            /* HT-26's five, under More */
    if(more && !el('i29Detail')){
      var d = document.createElement('div'); d.className = 'tools h29detail';
      d.innerHTML = '<button class="btn" id="i29Detail" type="button">Every standard, in detail</button>';
      more.appendChild(d);
    }
    var priv = ins.querySelector('.c5priv');
    if(priv) priv.textContent = 'Your journal and your why are yours alone. The group sees standards, check-offs and the day’s number.';
  }
  function onClick(e){
    var r = e.target.closest('[data-i29r]'), n = e.target.closest('[data-i29n]'), m = e.target.closest('[data-i29m]');
    if(r){ range = +r.getAttribute('data-i29r'); render(); return; }
    if(n && !n.disabled){ var v = +n.getAttribute('data-i29n'); pick = (pick === v) ? null : v; render(); return; }
    if(m){ var id = m.getAttribute('data-i29m'); shown[id] = !shown[id]; render(); return; }
    var mr = e.target.closest('[data-h29m]'); if(mr){ HT29GRP.openDay(mr.getAttribute('data-h29m')); return; }
    if(e.target.closest('[data-h29invite]')){ HT29GRP.invite(); return; }
    if(e.target.closest('[data-h29group]')){ HT29GRP.openGroup(); }
  }
  document.addEventListener('click', function(e){
    if(!e.target.closest || !e.target.closest('#i29Detail')) return;
    if(typeof closeOv === 'function') closeOv();
    if(window.innerWidth < 1024 && window.__HT13_TAB) window.__HT13_TAB('views');
    setTimeout(function(){ if(window.__HT29_DETAIL) window.__HT29_DETAIL(); }, 120);
  });

  /* ---- the phone's bottom bar ---- */
  function simple(){ return document.documentElement.hasAttribute('data-simple'); }
  function bar(){
    if(!simple() || el('h29Bar')) return;
    var b = document.createElement('nav'); b.id = 'h29Bar'; b.className = 'h29bar'; b.setAttribute('aria-label', 'sections');
    b.innerHTML = '<button type="button" data-t29="today">Today</button><button type="button" data-t29="views">Views</button>' +
                  '<button type="button" data-t29="insights">Insights</button>';
    document.body.appendChild(b);
    b.addEventListener('click', function(e){ var t = e.target.closest('[data-t29]'); if(t) go(t.getAttribute('data-t29')); });
    mark();
  }
  function go(which){
    if(which === 'insights'){
      if(window.__HT13_TAB) window.__HT13_TAB('views');
      document.documentElement.setAttribute('data-vtab', 'insights');
      render();
      window.scrollTo(0, 0);
    }else if(window.__HT13_TAB){ window.__HT13_TAB(which); window.scrollTo(0, 0); }
    mark();
  }
  function mark(){
    var cur = document.documentElement.getAttribute('data-vtab') || 'today';
    Array.prototype.slice.call(document.querySelectorAll('#h29Bar [data-t29]')).forEach(function(b){
      var on = b.getAttribute('data-t29') === cur; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  }
  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments); bar(); render(); mark(); return out; };
  /* `onClick` is exported because the three cards do not have to stay in `#ins29` to be tapped:
     HT-30 lays them out on one page and binds this same handler where it puts them. A control that
     moved house and stopped working is worse than one that was never there. */
  window.__HT29INS = { trend:trend, explained:explained, render:render, go:go, onClick:onClick,
                       state:function(){ return { range:range, pick:pick }; } };
  return window.__HT29INS;
})();


/* ---- HT-29 S6 (PASTE 133) · ONE JOURNAL SHAPE, THREE HOMES ---------------------------------------------
   The day as Markdown - byte for byte the block `tools/copiers/_ht.py` writes into the BEV vault - so a
   day reads the same in Cory's Obsidian, in another member's Google Drive, and in the Download zip.
   `tools/golden_ht29.py` S6 renders one fixture day here and in Python and compares the bytes.
   Pure: no DOM, no network. `zipStore()` is a STORE-only zip (no compression, CRC-32 per file) so the
   download needs no library and no CDN. */
var HT29MD = (function(){
  var START = '<!-- ht:start -->', END = '<!-- ht:end -->';
  /* HT-30 S1.4: the SAME order HT29SEC declares, and `golden_ht30` S1 compares the two lists. */
  var SECTIONS = [['morning','Morning routine'],['night','Night routine'],['weekly','Weekly routine'],['standards','Standards']];
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function hhmm(v){
    var m = /^\s*(\d{1,2}):(\d{2})/.exec(String(v == null ? '' : v));
    return m ? ('0' + (+m[1])).slice(-2) + ':' + m[2] : null;
  }
  function minutes(v){ var t = hhmm(v); return t ? (+t.slice(0,2)) * 60 + (+t.slice(3)) : null; }
  function isSabbath(h){
    return /^\s*sabbath\b/i.test(String(h.name || '')) || /^sabbath$/i.test(String(h.group_name || ''));
  }
  function sectionOf(h){
    /* HT-31 S1.6: the clock does not place a task, here or anywhere (Cory 9/21). This is the second
       of the three languages that must agree - HT29SEC.sectionOf, this, the copier's section_of and
       the sender's core.js - and all four moved in the same wire. */
    var s = String(h.section || '').toLowerCase();
    if (s === 'morning' || s === 'night' || s === 'standards' || s === 'weekly') return s;
    if (isSabbath(h)) return 'night';
    if (String(h.cadence || '') === 'weekly') return 'weekly';
    return 'standards';
  }
  function planned(h){ return hhmm(h.planned_start) || hhmm(h.time_anchor); }
  /* "2026-09-15" -> its weekday, computed from the date alone (never the device clock or UTC) */
  function weekdayOf(iso){
    var p = String(iso).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
  }
  function dueIds(habits, dayRow, iso){
    var snap = dayRow && dayRow.active_set;
    if (Array.isArray(snap) && snap.length) return snap.map(String);
    var wd = weekdayOf(iso);
    return habits.filter(function(h){
      if (h.active === false) return false;
      var cad = String(h.cadence || 'daily');
      if (cad.slice(0,4) === 'dow:'){
        var d = (cad.slice(4).match(/\d/g) || []).map(Number).filter(function(n){ return n >= 0 && n <= 6; });
        if (d.length && d.indexOf(wd) < 0) return false;
      }
      return true;
    }).map(function(h){ return String(h.id); });
  }
  function variance(h, mark){
    var p = minutes(planned(h)), a = minutes(typeof mark === 'string' ? mark : null);
    return (p == null || a == null) ? null : a - p;
  }
  /* 75 / 75.0 / "75" -> "75"; 75.5 -> "75.5" - the Python twin's num() */
  function num(v){ var f = +v; return isNaN(f) ? String(v) : String(f); }
  function rstrip(s){ return String(s == null ? '' : s).replace(/\s+$/, ''); }
  function strip(s){ return String(s == null ? '' : s).trim(); }

  function dayBlock(iso, habits, dayRow, priv){
    if (!dayRow && !priv) return null;
    priv = priv || {};
    var byId = {}; habits.forEach(function(h){ byId[String(h.id)] = h; });
    var checked = (dayRow && dayRow.checked) || {};
    if (typeof checked === 'string') checked = JSON.parse(checked || '{}');
    var due = dueIds(habits, dayRow, iso).filter(function(i){ return byId[i]; });
    var done = due.filter(function(i){ return !!checked[i]; });
    var timed = done.filter(function(i){ return variance(byId[i], checked[i]) != null; });
    var onTime = timed.filter(function(i){ return variance(byId[i], checked[i]) <= 15; });
    var rating = (priv.rating == null) ? null : priv.rating;
    var written = [['brain_dump','journal'],['tasks','completed'],['prayer','prayer']]
      .filter(function(f){ return strip(priv[f[0]]); }).map(function(f){ return f[1]; });

    var idx = done.length + ' of ' + due.length + ' done';
    if (dayRow && dayRow.pct != null) idx += ' (' + num(dayRow.pct) + '%)';
    idx += ' · rating ' + (rating != null ? num(rating) : '-');
    if (timed.length) idx += ' · on time ' + onTime.length + ' of ' + timed.length;
    idx += ' · written: ' + (written.length ? written.join(', ') : 'nothing');

    var out = ['## Habit tracker · ' + DAYS[weekdayOf(iso)] + ' ' + iso, '- **Index** · ' + idx, ''];
    var why = strip(priv.why);
    out.push('### Rating', (rating != null ? '**' + num(rating) + '**' : '-') + (why ? ' — ' + why : ''), '');
    [['brain_dump','Journal'],['tasks','Completed'],['prayer','Prayer']].forEach(function(f){
      var text = rstrip(priv[f[0]]);
      out.push('### ' + f[1], strip(text) ? text : '-', '');
    });
    /* HT-31 S8.27: the SAME line the copier writes - `golden_ht29` S6f compares these two programs
       byte for byte, so a sentence that only one of them says is a broken parity check. It is here
       because a person editing this file in Obsidian needs to know which half is theirs. */
    out.push('### Check-offs');
    out.push('<!-- these are written from the app and are rewritten every run; the three headings ' +
             'above are yours to edit -->');
    SECTIONS.forEach(function(sec){
      var rows = due.map(function(i){ return byId[i]; }).filter(function(h){ return sectionOf(h) === sec[0]; });
      if (!rows.length) return;
      rows.sort(function(a, b){
        var sa = a.sort_order != null ? a.sort_order : 1e9, sb = b.sort_order != null ? b.sort_order : 1e9;
        if (sa !== sb) return sa - sb;
        var na = String(a.name || ''), nb = String(b.name || '');
        return na < nb ? -1 : (na > nb ? 1 : 0);
      });
      out.push('**' + sec[1] + '**');
      rows.forEach(function(h){
        var mark = checked[String(h.id)], bits = [];
        /* HT-31 S2.8: the vault day file reads in Cory's words too. `_ht.py` renders the same. */
        if (planned(h)) bits.push('planned ' + fmtTime(planned(h)));
        if (typeof mark === 'string' && hhmm(mark)) bits.push('done ' + fmtTime(hhmm(mark)));
        var v = mark ? variance(h, mark) : null;
        if (v != null) bits.push((v >= 0 ? '+' : '') + v + ' min');
        out.push('- [' + (mark ? 'x' : ' ') + '] ' + strip(h.name) + (bits.length ? ' · ' + bits.join(' · ') : ''));
      });
    });
    return rstrip(out.join('\n')) + '\n';
  }

  /* THE AUTHOR IS WHOEVER IS SIGNED IN. Hard-coded, every member's download and every member's Drive file
     claimed to be Cory's, written by a copier that never touched it — the one line of a journal note that is
     about the person rather than the day, and it named the wrong one. `written_by` names what actually wrote
     the file: this app, in their browser. (The container's copier stamps its own name on its own files.) */
  function frontmatter(iso, today){
    var wd = DAYS[weekdayOf(iso)];
    /* HT29MD stays a STANDALONE module - `test_md_parity` lifts it out of this file and runs it in a bare VM
       where `S` does not exist, and the app and the container copier must write the same bytes. So the author
       is read defensively rather than assumed: outside the app it is simply "the account". */
    var me = (typeof S !== 'undefined' && S && S.me) || null;
    var who = (me && (me.display_name || me.email || me.id)) || 'the account';
    return ['---', 'id: JRN-' + iso, 'title: "Journal ' + wd + ' ' + iso + '"', 'type: journal', 'domain: "01"',
            'sensitivity: PRIVATE', 'created: ' + today, 'updated: ' + today,
            'author: ' + String(who).replace(/[\r\n]+/g, ' ').slice(0, 80),
            'written_by: the habit tracker (the block between the ht markers; every other line is your own)',
            'sources: [ht:days/' + iso + ', ht:day_private/' + iso + ']', '---', ''].join('\n');
  }
  /* a whole new file, exactly as merge_block(None, …) writes it */
  function dayFile(iso, today, block){
    return frontmatter(iso, today) + '\n' + START + '\n' + block + END + '\n';
  }

  /* ---- the zip: STORE method, one local header per file, a central directory, an end record -------- */
  var CRC = (function(){ var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++){ var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t; })();
  function crc32(bytes){ var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s){ return new TextEncoder().encode(s); }
  function zipStore(files, when){
    var d = when || new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], offset = 0;
    files.forEach(function(f){
      var name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
      c.setUint32(38, 0, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function(n, p){ return n + p.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(e.buffer)]);
    var out = new Uint8Array(all.reduce(function(n, p){ return n + p.length; }, 0)), at = 0;
    all.forEach(function(p){ out.set(p, at); at += p.length; });
    return out;
  }

  return { START:START, END:END, SECTIONS:SECTIONS, sectionOf:sectionOf, dueIds:dueIds, variance:variance,
           planned:planned, hhmm:hhmm, dayBlock:dayBlock, frontmatter:frontmatter, dayFile:dayFile,
           crc32:crc32, zipStore:zipStore, weekdayOf:weekdayOf };
})();
window.__HT29MD = HT29MD;

/* ---- HT-29 S6.23 (PASTE 133) · A MEMBER'S JOURNAL, INTO THEIR OWN GOOGLE DRIVE -------------------------
   Google Identity Services' token model: a browser app, no client secret, the narrowest Drive scope
   (`drive.file` - the app sees only the files it made). The id is PUBLIC by design and lives in the database
   (`app_config.google_client_id`, read after sign-in; set once by ht29_unlock.py --google-id), so turning the
   route on needs no deploy. While it is empty the whole route stays hidden (R70.138) and nothing from Google
   is loaded. Cory's own journal never takes this route - it goes to the BEV vault (paste 133 Ruling 2).
   HONEST ABOUT "NIGHTLY": a browser-only app holds a Google token for an hour and may not open a sign-in
   window without a tap, so it writes when the person taps, and on its own only while that hour lasts. */
var HT29DRIVE = (function(){
  var SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var FOLDER = 'Habit Tracker Journal';
  var API = 'https://www.googleapis.com/drive/v3/files', UP = 'https://www.googleapis.com/upload/drive/v3/files';
  var token = null, tokenUntil = 0, configured = '';

  /* the app calls setClientId() once app_config has loaded; '' keeps the route hidden */
  function setClientId(id){ configured = String(id || ''); }
  function clientId(){ return configured; }
  function available(){ return !!clientId(); }
  function state(){ try { return JSON.parse(localStorage.getItem('ht29_drive') || '{}'); } catch (e) { return {}; } }
  function save(s){ try { localStorage.setItem('ht29_drive', JSON.stringify(s)); } catch (e) {} }
  function hasToken(){ return !!token && Date.now() < tokenUntil - 60000; }

  function loadGis(){
    return new Promise(function(res, rej){
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('Google sign-in did not load')); };
      document.head.appendChild(s);
    });
  }
  /* must run inside a tap: Google opens its own window */
  function signIn(){
    if (!available()) return Promise.reject(new Error('not set up'));
    return loadGis().then(function(){
      return new Promise(function(res, rej){
        var c = google.accounts.oauth2.initTokenClient({
          client_id: clientId(), scope: SCOPE,
          callback: function(r){
            if (!r || r.error) return rej(new Error((r && r.error) || 'no token'));
            token = r.access_token; tokenUntil = Date.now() + (+r.expires_in || 3600) * 1000;
            var s = state(); s.connected = true; save(s); res(token);
          },
          error_callback: function(e){ rej(new Error((e && e.type) || 'cancelled')); }
        });
        c.requestAccessToken();
      });
    });
  }
  function call(method, url, body, headers){
    /* A REQUEST THAT NEVER ANSWERS MUST STILL END. Without a deadline a hung Drive call leaves the promise
       pending for the life of the page: no toast, no error, and the button sitting there as if nothing were
       asked. 30 s, and the failure arrives as a failure (the write chain's catch already says so). */
    var opts = { method: method, body: body,
                 headers: Object.assign({ Authorization: 'Bearer ' + token }, headers || {}) };
    try{ if (AbortSignal && AbortSignal.timeout) opts.signal = AbortSignal.timeout(30000); }catch(e){}
    return fetch(url, opts)
      .then(function(r){
        if (r.status === 401){ token = null; throw new Error('Google sign-in expired'); }
        if (!r.ok) throw new Error('Drive answered ' + r.status);
        return r.status === 204 ? null : r.json();
      });
  }
  function q(s){ return encodeURIComponent(s); }
  /* q-escaping for a Drive query string, NOT the HTML escaper of the same name at the top of this file.
     Renamed: a 90-line scope in which esc() means the opposite of what it means everywhere else is a
     trap for the next reader. */
  function qesc(s){ return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function folder(){
    var s = state();
    var find = call('GET', API + '?spaces=drive&fields=files(id)&q=' +
                    q("name='" + qesc(FOLDER) + "' and mimeType='application/vnd.google-apps.folder' and trashed=false"));
    return find.then(function(j){
      if (j && j.files && j.files[0]) return j.files[0].id;
      return call('POST', API + '?fields=id', JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
                  { 'Content-Type': 'application/json' }).then(function(x){ return x.id; });
    }).then(function(id){ s.folder = id; save(s); return id; });
  }
  function put(folderId, name, text, asDoc){
    var mime = asDoc ? 'application/vnd.google-apps.document' : 'text/markdown';
    return call('GET', API + '?spaces=drive&fields=files(id)&q=' +
                q("name='" + qesc(name) + "' and '" + qesc(folderId) + "' in parents and trashed=false"))
      .then(function(j){
        var id = j && j.files && j.files[0] && j.files[0].id;
        if (id) return call('PATCH', UP + '/' + id + '?uploadType=media', text, { 'Content-Type': 'text/plain; charset=UTF-8' });
        var b = 'ht29' + Math.random().toString(36).slice(2);
        var body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
                   JSON.stringify({ name: name, parents: [folderId], mimeType: mime }) + '\r\n--' + b +
                   '\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n' + text + '\r\n--' + b + '--';
        return call('POST', UP + '?uploadType=multipart&fields=id', body, { 'Content-Type': 'multipart/related; boundary=' + b });
      });
  }
  /* files: [{name:'2026-09-15.md', text}] · months: [{name:'Habit Tracker Journal 2026-09', text}] */
  function write(files, months){
    if (!hasToken()) return Promise.reject(new Error('tap Connect first'));
    var s = state();
    return folder().then(function(fid){
      var chain = Promise.resolve(), n = 0;
      files.forEach(function(f){ chain = chain.then(function(){ return put(fid, f.name, f.text, false); }).then(function(){ n++; }); });
      if (s.doc) (months || []).forEach(function(m){ chain = chain.then(function(){ return put(fid, m.name, m.text, true); }).then(function(){ n++; }); });
      /* the stamp records a WRITE, so a run that wrote nothing does not get one - "Last written 21:04" over
         zero files is the panel telling you your journal is on Drive when none of it is */
      return chain.then(function(){ if(!n) return n; s = state(); s.last = new Date().toISOString(); save(s); return n; });
    });
  }
  function disconnect(){
    var t = token; token = null; tokenUntil = 0; save({});
    try { if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, function(){}); } catch (e) {}
  }
  function setDoc(on){ var s = state(); s.doc = !!on; save(s); }
  return { available: available, setClientId: setClientId, signIn: signIn, hasToken: hasToken, write: write,
           disconnect: disconnect, state: state, setDoc: setDoc, FOLDER: FOLDER };
})();

/* ---- HT-29 S6 · A JOURNAL GOES HOME ---------------------------------------------------------------------------
   Cory's items 3, 4 and 9, and Ruling 2. Every person's journal belongs somewhere outside this app:
     CORY'S goes to his BEV vault each night (tools/copiers/ht_journal.py - it never takes the Drive route; the app
       hides that route for the account `app_config.vault_user` names, and the id lives in the database, not here);
     EVERYONE ELSE'S can go to their own Google Drive (drive.file - the app sees only what it made), once the
       tracker's Google sign-in id exists (`app_config.google_client_id`; until then the button does not exist);
     ANYONE can take it with them now: Settings -> Download my journal -> one .zip, a Markdown file per day - the
       same bytes the vault gets (golden_ht29 S6 compares them with the Python copier).
   Only this account's rows are read (S.days, S.privAll, S.habits - the owner's own load), never a member's. */
(function(){
  var cfg = { loaded:false, googleId:'', vaultUser:'' };
  function mine(){
    var byDate = {}, dates = {};
    (S.days || []).forEach(function(r){ if(r && r.date && (!r.user_id || !S.me || r.user_id === S.me.id)){ byDate[r.date] = r; dates[r.date] = 1; } });
    Object.keys(S.privAll || {}).forEach(function(k){ var p = S.privAll[k]; if(p && (!p.user_id || !S.me || p.user_id === S.me.id)) dates[k] = 1; });
    return { byDate:byDate, dates:Object.keys(dates).filter(function(k){ return k <= today(); }).sort() };
  }
  function files(onlyFrom){
    var m = mine(), out = [];
    m.dates.forEach(function(k){
      if(onlyFrom && k < onlyFrom) return;
      var block = HT29MD.dayBlock(k, S.habits || [], m.byDate[k] || null, (S.privAll || {})[k] || null);
      if(block) out.push({ name:k + '.md', text:HT29MD.dayFile(k, today(), block) });
    });
    return out;
  }
  function months(list){
    var by = {};
    list.forEach(function(f){ var mo = f.name.slice(0, 7); (by[mo] = by[mo] || []).push(f.text); });
    return Object.keys(by).sort().map(function(mo){ return { name:'Habit Tracker Journal ' + mo, text:by[mo].join('\n\n') }; });
  }
  function dlBytes(name, bytes, type){
    var b = new Blob([bytes], { type:type }), u = URL.createObjectURL(b);
    var a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(u); if(a.parentNode) a.parentNode.removeChild(a); }, 1500);
  }
  function download(){
    var list = files();
    if(!list.length){ toast('nothing written yet'); return 0; }
    var zip = HT29MD.zipStore(list.map(function(f){ return { name:'journal/' + f.name, data:f.text }; }));
    dlBytes('habit-tracker-journal-' + today() + '.zip', zip, 'application/zip');
    toast(list.length + ' day' + (list.length === 1 ? '' : 's') + ' in the zip');
    return list.length;
  }
  /* THE LATCH IS SET BY SUCCESS, NOT BY TRYING. Latched first, one failed read hid the whole Drive route for
     the life of the page and looked exactly like "Google is not configured yet" - a journal that never left the
     app, and nothing on screen to say why. Now a failure leaves the question open and the next open re-asks. */
  var cfgBusy = null;
  async function loadCfg(){
    if(cfg.loaded || !S.me) return cfg;
    if(cfgBusy) return cfgBusy;                               /* one read in flight, not one per caller */
    cfgBusy = (async function(){
      try{
        var r = await sb.from('app_config').select('key,value');
        if(r.error){ warn29('app_config read failed', r.error); return cfg; }
        (r.data || []).forEach(function(x){ if(x.key === 'google_client_id') cfg.googleId = x.value || ''; if(x.key === 'vault_user') cfg.vaultUser = x.value || ''; });
        HT29DRIVE.setClientId(driveAllowed() ? cfg.googleId : '');
        cfg.loaded = true;
      }catch(e){ warn29('app_config read failed', e); }
      finally{ cfgBusy = null; }
      return cfg;
    })();
    return cfgBusy;
  }
  function driveAllowed(){ return !!cfg.googleId && !(S.me && cfg.vaultUser && cfg.vaultUser === S.me.id); }
  function isVaultUser(){ return !!(S.me && cfg.vaultUser && cfg.vaultUser === S.me.id); }

  var HELP = [
    ['Obsidian on your phone', ['Connect Google Drive below, once.', 'Install Obsidian and a Drive sync app (Autosync, or Obsidian Sync).',
      'Point it at the Drive folder "Habit Tracker Journal".', 'Open that folder as a vault in Obsidian.', 'Each day is its own note, dated.']],
    ['Google Docs', ['Connect Google Drive below, once.', 'Turn on "also as Google Doc".', 'One Doc a month appears in the same folder.',
      'Open it in the Google Docs app on your phone.', 'The daily files stay beside it.']],
    ['Download', ['Tap "Download my journal".', 'You get one .zip, a file per day.', 'Unzip it anywhere, or drop it into Obsidian.',
      'Nothing is uploaded by this button.', 'Do it again any time; it holds every day.']]
  ];
  function panelHtml(){
    var s = HT29DRIVE.state();
    var drive = isVaultUser()
      ? '<div class="note" style="padding:8px 0 0">Your journal goes to your BEV vault each night.</div>'
      : (HT29DRIVE.available()
        ? (s.connected
          ? '<div class="tools"><button class="btn pri" id="j29Write" type="button">Write to Drive</button>' +
              '<button class="btn" id="j29Disc" type="button">Disconnect</button></div>' +
            '<label class="fld h28rest"><span class="lab">Also as Google Doc</span><span class="h28sw"><input type="checkbox" id="j29Doc"' + (s.doc ? ' checked' : '') + '> one Doc a month</span></label>' +
            (s.last ? '<div class="note">Last written ' + esc(String(s.last).slice(0, 16).replace('T', ' ')) + '</div>' : '')
          : '<div class="tools"><button class="btn pri" id="j29Conn" type="button">Connect Google Drive</button></div>' +
            '<div class="note">Your journal, into a folder in YOUR Drive. The app sees only the files it makes.</div>')
        : '');
    return '<div class="lab">Journal</div>' +
      '<div class="tools"><button class="btn" id="j29Zip" type="button">Download my journal</button></div>' +
      drive +
      '<details class="h29help"><summary>Journal on your phone</summary>' +
        HELP.map(function(h){ return '<div class="h29hb"><b>' + esc(h[0]) + '</b><ol>' + h[1].map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ol></div>'; }).join('') +
      '</details>';
  }
  function bindPanel(){
    var z = el('j29Zip'); if(z) z.onclick = download;
    var c = el('j29Conn'); if(c) c.onclick = async function(){
      try{ await HT29DRIVE.signIn(); var n = await HT29DRIVE.write(files(), months(files())); toast(n + ' written to Drive'); refresh(); }
      catch(e){ toast('Drive: ' + String(e && e.message || e).slice(0, 60)); }
    };
    var w = el('j29Write'); if(w) w.onclick = async function(){
      try{ if(!HT29DRIVE.hasToken()) await HT29DRIVE.signIn();
           var n = await HT29DRIVE.write(files(), months(files())); toast(n + ' written to Drive'); refresh(); }
      catch(e){ toast('Drive: ' + String(e && e.message || e).slice(0, 60)); }
    };
    var d = el('j29Disc'); if(d) d.onclick = function(){ HT29DRIVE.disconnect(); refresh(); };
    var doc = el('j29Doc'); if(doc) doc.onchange = function(){ HT29DRIVE.setDoc(doc.checked); };
  }
  function refresh(){ var p = el('j29Set'); if(p){ p.innerHTML = panelHtml(); bindPanel(); } }
  var _os = openSettings;
  openSettings = function(){
    var out = _os.apply(null, arguments);
    loadCfg().then(function(){
      setTimeout(function(){
        var ov = document.querySelector('.ov.on .inner') || document.querySelector('.ov .inner');
        if(!ov || el('j29Set')) return;
        var w = document.createElement('div'); w.id = 'j29Set'; w.className = 'pan'; w.style.marginTop = '14px';
        w.innerHTML = panelHtml();
        var priv = el('privNote');
        if(priv && priv.parentNode === ov) ov.insertBefore(w, priv); else ov.appendChild(w);
        bindPanel();
      }, 90);
    });
    return out;
  };
  /* a connected member's first open of a day: one line, one tap writes every day since the last write */
  function driveCard(){
    if(!S.me || S.loadOk !== true || isVaultUser() || !HT29DRIVE.available()) return;
    var s = HT29DRIVE.state(); if(!s.connected) return;
    var key = 'ht29_drive_asked_' + today();
    try{ if(localStorage.getItem(key)) return; localStorage.setItem(key, '1'); }catch(e){ return; }
    toast('tap Settings → Journal → Write to Drive to save yesterday');
  }
  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments); loadCfg().then(driveCard); return out; };
  window.__HT29S6 = { files:files, months:months, download:download, cfg:function(){ return cfg; }, loadCfg:loadCfg };
})();

/* ---- HT-29 S8 · "UPDATE AVAILABLE — TAP TO REFRESH", AND IT CAN BE TAPPED ------------------------------------
   D16 closed for good: HT-25's toast could never take a tap (`.toast{pointer-events:none}`) and the next toast erased
   it, so every release still needed Cory to pull to refresh. A banner of its own waits at the top until it is tapped;
   the tap saves whatever is being typed (HT-28c's flush), then refreshes. */
var HT29_UPDATE_BANNER = true;
(function(){
  function show(){
    if(el('h29Upd')) return;
    var b = document.createElement('button');
    b.id = 'h29Upd'; b.type = 'button'; b.className = 'h29upd';
    b.textContent = 'Update available — tap to refresh';
    b.onclick = function(){
      b.disabled = true; b.textContent = 'saving, then refreshing…';
      var done = false;
      function go(){ if(done) return; done = true; var r = window.__HT29UPD.reload; if(typeof r === 'function') r(); else location.reload(); }
      try{ var p = window.__HT28c && window.__HT28c.flush && window.__HT28c.flush(); if(p && p.then) p.then(go, go); else go(); }
      catch(e){ warn29('flush before refresh failed', e); go(); }
      setTimeout(go, 2500);
    };
    document.body.appendChild(b);
  }
  window.__HT29UPD = { show:show, reload:null };
})();

/* ---- HT-29 S9 · THE EVENING NUDGE ---------------------------------------------------------------------------------
   Cory 9/15 15:28: fold the notifications in. Settings -> Nudges: two times (12:00 "Morning done? N of M" · 21:00
   "N of M · Andrew X of Y · rate the day"), per person, off for a new account, set on for an account with history
   (Cory) - and nothing is sent until that person taps Allow AND the sender is armed (R70.344: Cory's word). The
   whole block stays hidden until the database has the tables and the sender answers with its public key, so a
   phone never shows a switch that cannot work. The words are composed by the sender and carry numbers only. */
(function(){
  var FUNC = SB_URL + '/functions/v1/nudge';
  var st = { checked:false, ready:false, pub:null, prefs:null, history:false };
  function b64u(s){
    var p = String(s).replace(/-/g, '+').replace(/_/g, '/'); while(p.length % 4) p += '=';
    var bin = atob(p), out = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function tz(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'; }catch(e){ return 'America/Chicago'; } }
  async function check(){
    if(st.checked || !S.me) return st;
    st.checked = true;                       /* set here on purpose: every `return st` below is a settled answer */
    try{
      var p = await sb.from('nudge_prefs').select('user_id,enabled,noon,evening,on_sabbath,tz').eq('user_id', S.me.id).maybeSingle();
      /* "the table is not there yet" is 42P01 and nothing else. A 500, an expired token or a dropped connection
         read as that used to hide the Nudges block for the page's life and call it "the SQL has not run". */
      if(p.error && /42P01|PGRST20[0-9]|does not exist/i.test(String(p.error.code || p.error.message || ''))) return st;
      if(p.error){ st.checked = false; warn29('nudge prefs read failed', p.error); return st; }
      st.prefs = p.data || null;
      st.history = (S.days || []).some(function(r){ return r.date && r.date < '2026-09-14'; });
      var pub = window.__NUDGE_PUB || null;                              /* the harness's seam; the app asks the sender */
      if(!pub){
        /* the headless fixture runs from file:// and the sender lives beside the database - asking from there
           would be a request to the live project from a test, and it can only ever 404 */
        if(location.protocol === 'file:') return st;
        var r = await fetch(FUNC + '?vapid=1');
        if(!r.ok) return st;
        var j = await r.json(); pub = j && j.publicKey;
      }
      if(!pub) return st;
      st.pub = pub;
      st.ready = !!(navigator.serviceWorker && window.PushManager && window.Notification);
    }catch(e){ warn29('nudges unavailable', e); }
    return st;
  }
  function prefs(){
    var p = st.prefs || {};
    return { enabled:(p.enabled != null ? !!p.enabled : st.history), noon:String(p.noon || '12:00').slice(0, 5),
             evening:String(p.evening || '21:00').slice(0, 5), on_sabbath:!!p.on_sabbath, saved:!!st.prefs };
  }
  async function savePrefs(patch){
    var cur = prefs();
    var row = { user_id:S.me.id, enabled:(patch.enabled != null ? patch.enabled : cur.enabled),
                noon:(patch.noon || cur.noon), evening:(patch.evening || cur.evening),
                on_sabbath:(patch.on_sabbath != null ? patch.on_sabbath : cur.on_sabbath), tz:tz() };
    var r = await sb.from('nudge_prefs').upsert(row, { onConflict:'user_id' });
    if(r && r.error){ toast('nudges not saved'); return false; }
    st.prefs = row; return true;
  }
  async function subscribe(){
    /* EVERY WAY OUT OF HERE SAYS SOMETHING. Without the try, a throw from `pushManager.subscribe` (a bad key,
       no push service, a service worker that never became ready) escaped as an unhandled rejection: the switch
       stayed sitting in the ON position, nothing was subscribed, no prefs row was written, and no word said so. */
    try{
      var perm = await window.Notification.requestPermission();
      if(perm !== 'granted'){ toast('notifications are blocked for this app in your settings'); return false; }
      var reg = await navigator.serviceWorker.ready;
      var sub = (await reg.pushManager.getSubscription()) ||
                (await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64u(st.pub) }));
      var j = sub.toJSON ? sub.toJSON() : sub;
      var up = await sb.from('push_subscriptions').upsert({ endpoint:j.endpoint, user_id:S.me.id, p256dh:j.keys.p256dh, auth_key:j.keys.auth },
                                                          { onConflict:'endpoint' });
      if(up && up.error){ toast('this phone was not saved for nudges'); return false; }
      return true;
    }catch(e){ warn29('nudge subscribe failed', e); toast('nudges could not be turned on'); return false; }
  }
  async function unsubscribe(){
    try{
      var reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if(sub){ var ep = sub.endpoint; await sub.unsubscribe(); await sb.from('push_subscriptions').delete().eq('endpoint', ep).eq('user_id', S.me.id); }
    }catch(e){ warn29('unsubscribe failed', e); }
  }
  async function test(){
    try{
      var s = await sb.auth.getSession(), tok = s && s.data && s.data.session && s.data.session.access_token;
      var r = await fetch(FUNC, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + tok },
                                  body:JSON.stringify({ test:true }), signal:AbortSignal.timeout(20000) });
      /* 200 IS NOT DELIVERY. The sender answers with what it actually pushed, so a run where every endpoint
         refused used to read "test nudge sent" over a phone that buzzed for nobody. */
      var body = null; try{ body = await r.json(); }catch(x){}
      toast(r.ok && body && body.sent > 0 ? 'test nudge sent'
            : r.ok ? 'nothing to send to this phone yet' : 'the test did not send');
    }catch(e){ toast('the test did not send'); }
  }
  function html(){
    var p = prefs();
    return '<div class="lab">Nudges</div>' +
      '<div class="note" style="padding:4px 0 10px">A notification at noon and at 9 pm with your numbers and your group’s — never your journal.' +
        (p.enabled && !p.saved ? ' Tap Allow once to finish.' : '') + '</div>' +
      '<label class="fld h28rest"><span class="lab">Nudges</span><span class="h28sw"><input type="checkbox" id="n29On"' + (p.enabled ? ' checked' : '') + '> on this phone</span></label>' +
      '<div class="h29times"><label class="fld"><span class="lab">Midday</span><input type="time" id="n29Noon" value="' + esc(p.noon) + '"></label>' +
      '<label class="fld"><span class="lab">Evening</span><input type="time" id="n29Eve" value="' + esc(p.evening) + '"></label></div>' +
      '<label class="fld h28rest"><span class="lab">On the Sabbath</span><span class="h28sw"><input type="checkbox" id="n29Sab"' + (p.on_sabbath ? ' checked' : '') + '> send on Saturdays too</span></label>' +
      '<div class="tools">' + (p.enabled && !p.saved ? '<button class="btn pri" id="n29Allow" type="button">Allow</button>' : '') +
        '<button class="btn" id="n29Test" type="button">Send a test</button></div>';
  }
  function bind(){
    var on = el('n29On'), allow = el('n29Allow');
    async function enable(){ if(await subscribe()){ await savePrefs({ enabled:true }); toast('nudges on'); } else if(on) on.checked = false; refresh(); }
    if(on) on.onchange = async function(){ if(on.checked) await enable(); else { await unsubscribe(); await savePrefs({ enabled:false }); toast('nudges off'); refresh(); } };
    if(allow) allow.onclick = enable;
    var noon = el('n29Noon'), eve = el('n29Eve'), sab = el('n29Sab'), t = el('n29Test');
    if(noon) noon.onchange = function(){ savePrefs({ noon:noon.value }); };
    if(eve) eve.onchange = function(){ savePrefs({ evening:eve.value }); };
    if(sab) sab.onchange = function(){ savePrefs({ on_sabbath:sab.checked }); };
    if(t) t.onclick = test;
  }
  function refresh(){ var p = el('n29Set'); if(p){ p.innerHTML = html(); bind(); } }
  var _os = openSettings;
  openSettings = function(){
    var out = _os.apply(null, arguments);
    check().then(function(){
      if(!st.ready) return;
      setTimeout(function(){
        var ov = document.querySelector('.ov.on .inner') || document.querySelector('.ov .inner');
        if(!ov || el('n29Set')) return;
        var w = document.createElement('div'); w.id = 'n29Set'; w.className = 'pan'; w.style.marginTop = '14px';
        w.innerHTML = html();
        var priv = el('privNote');
        if(priv && priv.parentNode === ov) ov.insertBefore(w, priv); else ov.appendChild(w);
        bind();
      }, 110);
    });
    return out;
  };
  window.__HT29S9 = { check:check, state:function(){ return st; }, prefs:prefs, subscribe:subscribe, unsubscribe:unsubscribe };
})();

/* ======================= HT-29 S7.27 · THE OTHER DEVICE, WITHIN SECONDS (PASTE 133 S7.27 · D14) =======================
   HT-28c pulls every 30 s while the page is visible, and at once on focus, return and reconnect. That covers the
   phone you pick up; it leaves a page sitting open as much as 30 s behind the device in your hand. HT-28 named the
   missing half itself — "No Realtime subscription: it needs the tables in Supabase's realtime publication, a
   migration this wire does not run" — and S4's SQL runs that migration (`days`, `day_private`, `habits` into
   `supabase_realtime`). So this subscribes to the publication and asks HT-28c for a pull the moment the server says
   one of MY rows changed. Cory's fixture, S7.27: a check on the phone shows on the desktop within 5 s, and back.
   NOTHING IS READ OUT OF THE EVENT. No payload reaches the app — the pull re-reads through the same user-scoped
   queries the app always uses, so nothing arrives that this account's own policies would not hand it (R47.3 as
   Ruling 4 amends it). Each subscription is filtered `user_id=eq.<me>` as well: defence in depth, not the fence.
   PHASE GATE: the socket lives only while the page is visible. Hidden, it is closed; on return it is remade, and
   HT-28c's own 'visible' pull covers the gap. Nothing holds a connection open behind the app. */
(function(){
  if(!sb || typeof sb.channel !== 'function') return;   /* no Realtime in this build: the 30 s pull is the whole of it */
  var TABLES = ['days','day_private','habits'], ch = null, chFor = null, last = 0, status = null;
  function poke(){
    var now = Date.now();
    if(now - last < 400) return;                        /* one pull for a burst of rows, not one per row */
    last = now;
    /* a throwing pull would otherwise disable this path in silence for the rest of the page */
    try{ if(window.__HT28c && window.__HT28c.pull) window.__HT28c.pull(); }
    catch(e){ warn29('realtime pull failed', e); }
  }
  function close(){
    if(!ch) return;
    var c = ch; ch = null; chFor = null; status = null;
    try{ if(sb.removeChannel) sb.removeChannel(c); else if(c.unsubscribe) c.unsubscribe(); }catch(e){}
  }
  function open(){
    if(!S.me || document.visibilityState === 'hidden') return;
    /* A CHANNEL THAT ERRORED IS NOT A CHANNEL. `ch` stays non-null through CHANNEL_ERROR and TIMED_OUT (the
       access token refreshes about once an hour and the socket's does not), so without this the subscription
       would never be rebuilt and "within 5 s" would quietly become HT-28c's 30 s for the rest of the page -
       a symptom that looks exactly like the fallback working. Every paint re-asks, so a rebuild costs nothing. */
    if(ch && chFor === S.me.id && status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
    close();                                            /* a second account on one device gets its own channel */
    var id = S.me.id, c = sb.channel('ht29-' + id);
    TABLES.forEach(function(t){
      c.on('postgres_changes', { event:'*', schema:'public', table:t, filter:'user_id=eq.' + id }, poke);
    });
    /* THE STATUS IS READ, not assumed. `subscribe()` hands back a channel whether or not it ever joins, so
       `live()` asking `!!ch` would answer "fine" through CHANNEL_ERROR and TIMED_OUT forever - and the only
       symptom would be the other device taking 30 s, which is the pull doing its job unnoticed. */
    status = 'joining';
    /* the status is RECORDED and nothing else: joining is not an event, and a catch-up pull here is both
       redundant (HT-28c already pulls on load, on return and on reconnect) and a real disturbance - it
       repaired a deliberately failed load in `golden_ht28` C R9 before that test could read it. */
    ch = c.subscribe(function(s){ status = String(s || ''); }) || c;
    chFor = id;
  }
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'hidden') close(); else open();
  });
  window.addEventListener('pagehide', close);
  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments); open(); return out; };
  window.__HT29RT = { open:open, close:close, status:function(){ return status; },
                     live:function(){ return !!ch && status === 'SUBSCRIBED'; } };
})();

/* ======================= HT-30 · QUIET AND SIMPLE, DEEP ON TAP (PASTE 137 · WIRE HT-30) =======================
   Cory, Sunday 2026-09-20: "as quiet and simple as possible, but high in depth as well" · "one send · merge it
   right away". Every judgement call below is decided by that sentence: the SURFACE carries only what he named
   and everything else moves ONE TAP DOWN. Nothing is deleted anywhere (R70.138).

   A LAYER, not a rewrite - the same contract HT-9a through HT-29 have kept. The paints belong to the base app
   and to the wires that already proved them; this file re-asserts over what they draw. `advanced()` true, or
   the full sheet, and most of it returns immediately.

   WHAT IS HERE, section by section:
     S0.3  the version on the screen, and a banner that names the one that is waiting
     S2.6  the planned time as a muted chip at the right of the row - never inside the name
     S2.7  the one-time pass that takes a clock time OUT of a name and into its own field, listing every one
     S3.8  the edit sheet: five fields on the surface, the rest under one quiet "More", the free text hidden
     S3.9  thinner rows, and edit/drag affordances at rest instead of shouting
     S4.11 the "why" leaves the PHONE (the rating stays; the desktop is untouched; the column is untouched)
     S5.13 a Sabbath ANY person can switch on, for the day they choose
     S6.14 Views and Insights become one page behind one tab, on both widths
     S7.16 start a group or join one, and a member's row carries a way out
*/

/* The one place this build says what it is. `sw.js`'s cache name must equal it, and `golden_ht30` S0 reads
   both files and fails when they drift - a version on the screen that is not the version in the cache is
   worse than no version at all, because it is the thing you check when you are already unsure. */
var HT30_VERSION = 'ht-v38';

function warn30(what, e){ try{ console.warn('HT-30: ' + what, e); }catch(_){} }
function h30El(id){ return document.getElementById(id); }
function h30Phone(){ return window.innerWidth < 1024; }
function h30Simple(){ return document.documentElement.hasAttribute('data-simple'); }
function h30Advanced(){
  try{ if(localStorage.getItem('ht_advanced') === '1') return true; }catch(e){}
  return window.__ADVANCED === true || /[?&]advanced=1/.test(location.search);
}


/* ---- S0.3 · THE VERSION IS ON THE SCREEN, AND THE BANNER NAMES THE ONE THAT IS WAITING ----------------------
   The complaint behind this one is not "I want a version number". It is that he could not tell whether what he
   was looking at was what had been shipped - so the answer has to be readable without asking anyone, and the
   banner has to say which build it is offering. The waiting worker is asked for its own cache name over a
   MessageChannel; if it does not answer (an older worker, a browser with no controller) the banner still
   appears and simply does not name a version. It never guesses one. */
(function(){
  function askWaiting(reg, cb){
    var w = (reg && (reg.waiting || reg.installing)) || null;
    if(!w || !window.MessageChannel){ cb(null); return; }
    var done = false, ch = new MessageChannel();
    ch.port1.onmessage = function(e){
      if(done) return; done = true;
      cb((e && e.data && e.data.version) || null);
    };
    try{ w.postMessage({ type: 'version' }, [ch.port2]); }
    catch(e){ warn30('could not ask the waiting worker for its version', e); cb(null); return; }
    setTimeout(function(){ if(!done){ done = true; cb(null); } }, 1200);
  }

  /* HT-29 S8 built the banner; HT-30 gives it the version and the reason to trust it. */
  var _show = (window.__HT29UPD && window.__HT29UPD.show) || null;
  function show(reg){
    if(!_show) return;
    _show();
    var b = h30El('h29Upd'); if(!b) return;
    b.classList.add('h30upd');
    askWaiting(reg, function(v){
      var n = h30El('h29Upd'); if(!n || n.disabled) return;
      n.textContent = v ? ('Update available — tap to refresh (' + v + ')')
                        : 'Update available — tap to refresh';
    });
  }
  if(window.__HT29UPD) window.__HT29UPD.show = function(reg){ show(reg); };

  /* THE UPDATE HAS TO ARRIVE WHILE THE APP IS OPEN, or the banner is a promise the app cannot keep: an
     installed PWA that is never closed asks for a new worker exactly once, at boot. So it asks again when the
     page becomes visible and every five minutes it is open. `reg.update()` is a conditional request - it costs
     one 304 when nothing has changed, which is why this is allowed to run on a timer where the PHASE GATE
     forbids a keep-alive: it runs only while the page is VISIBLE and stops the moment it is hidden. */
  function watch(){
    if(!('serviceWorker' in navigator)) return;
    var t = null;
    function poll(){
      /* `getRegistration` is not universal - the harness's own push stub replaces
         `navigator.serviceWorker` with `ready`/`register` and nothing else, and calling it threw a
         page error across two whole sections. A missing method is a browser that cannot tell us
         about an update, which is exactly the case this poll exists to cover gracefully. */
      if(!navigator.serviceWorker || typeof navigator.serviceWorker.getRegistration !== 'function') return;
      navigator.serviceWorker.getRegistration().then(function(r){
        if(!r) return;
        if(r.waiting) show(r);
        try{ r.update(); }catch(e){ warn30('update check failed', e); }
      }).catch(function(e){ warn30('no registration', e); });
    }
    /* SIXTY SECONDS, because the acceptance is "the banner appears within a minute of a deploy on an
       app that is already open", and five minutes is not that. The cost is one CONDITIONAL request a
       minute - a 304 while nothing has changed - and only while the page is VISIBLE; it stops on the
       first visibilitychange to hidden, so this app still holds nothing open behind itself. */
    function start(){ if(t) return; poll(); t = setInterval(poll, 60000); }
    function stop(){ if(t){ clearInterval(t); t = null; } }
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible') start(); else stop();
    });
    if(document.visibilityState === 'visible') start();
  }
  if(document.readyState === 'complete') setTimeout(watch, 1200);
  else window.addEventListener('load', function(){ setTimeout(watch, 1200); });

  /* Settings says which build this is, beside the sync line it already carries. */
  function stamp(){
    var ov = document.querySelector('.ov.on .inner'); if(!ov || h30El('h30Ver')) return;
    var n = document.createElement('div');
    n.className = 'note h30ver'; n.id = 'h30Ver';
    n.textContent = 'This build: ' + HT30_VERSION;
    ov.appendChild(n);
  }
  var _osv = openSettings;
  openSettings = function(){ var out = _osv.apply(null, arguments); setTimeout(stamp, 80); return out; };
  window.__HT30UPD = { version:function(){ return HT30_VERSION; }, show:show, askWaiting:askWaiting, stamp:stamp };
})();


/* ---- S2.6 · THE PLANNED TIME IS A CHIP AT THE RIGHT, AND NOTHING IS IN THE NAME ----------------------------
   HT-21 put the planned time in front of the name as `<b class="pat">05:00</b>Read the Bible`, inside the
   `.nm` element. It reads as part of the name, which is exactly the thing Cory asked to stop; and because it
   is inside `.nm` it also travels into anything that copies the name's text.
   So the node is MOVED - not re-rendered - to the end of the row, after the name and before the minutes. One
   move per row, idempotent, and `.pat` keeps its class so every existing selector still finds it. */
(function(){
  function chips(){
    var log = h30El('log'); if(!log) return;
    Array.prototype.slice.call(log.querySelectorAll('.li')).forEach(function(r){
      var pat = r.querySelector('.nm .pat'); if(!pat) return;
      pat.classList.add('pat30');
      var sp = r.querySelector('.sp16');
      if(sp) r.insertBefore(pat, sp); else r.appendChild(pat);
    });
  }
  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments); try{ chips(); }catch(e){ warn30('time chips', e); } return out; };
  document.addEventListener('click', function(){ setTimeout(chips, 30); }, true);
  window.__HT30CHIP = { chips:chips };
})();


/* ---- S2.7 · A CLOCK TIME COMES OUT OF A NAME AND INTO ITS OWN FIELD, ONCE, AND EVERY ONE IS LISTED ----------
   R70.265 says code never rewrites a name, and it says so because a pass like this one once destroyed data.
   Cory's 9/20 ruling asks for exactly this pass, so it ships - under four conditions that answer the reason
   the rule exists:
     1 · it runs ONCE per account, and only when `time_anchor` exists to receive the time;
     2 · it never touches a standard that already has a planned time - his field always wins over his name;
     3 · the ORIGINAL name of every row it changes is kept, on the device and in Settings, with an Undo per
         row, so a wrong guess costs one tap;
     4 · every change is listed for him to read (Settings -> "Names I cleaned of times", and `RENAMED.md`).
   TWO TIMES IN ONE NAME: the FIRST is taken as the planned time and the row is flagged in the list; the
   second is left in the name, because a name is the only place it still means anything. */
var HT30_NAME_TIMES = true;
var HT30TIME = (function(){
  /* `5 AM` · `5:00` · `at 5am` · `9pm` · `05:00` · `7.30am`. A bare `5` is NOT a time: "Read 5 chapters". */
  var RE = /(?:^|[\s\(\[–—-])(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?m\.?(?=$|[\s\)\]–—-])|(?:^|[\s\(\[–—-])(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=$|[\s\)\]–—-])/i;

  var LEAD = /^[\s\(\[–—-]/, EDGE_L = /^[\s–—,\-:]+/, EDGE_R = /[\s–—,\-:]+$/;   /* lifted verbatim: these hold real en/em dashes */
  function find(name){
    var s = String(name || ''), m = RE.exec(s);
    if(!m) return null;
    var hh, mm;
    if(m[1] != null){
      hh = +m[1]; mm = m[2] == null ? 0 : +m[2];
      if(hh < 1 || hh > 12 || mm > 59) return null;
      var pm = String(m[3]).toLowerCase() === 'p';
      if(hh === 12) hh = pm ? 12 : 0; else if(pm) hh += 12;
    }else{
      /* groups 4 and 5: the alternation above owns 1, 2 and 3, and a regex numbers groups across the
         whole pattern, not per branch. Reading m[3] here took the a/p group and gave "aN:05". */
      hh = +m[4]; mm = +m[5];
    }
    /* EVERY clock leaves the name, not only the first. "8:20 - 8:40 Water" is a range, and taking
       one end of it left "8:40 Water" - the same complaint with one clock fewer. The FIRST time is
       still what becomes the planned time (stress 2); the others are listed and undoable. Bounded by
       four passes so a pathological name cannot spin here. */
    function strip(str, hit){
      var cut = str.slice(hit.index, hit.index + hit[0].length);
      /* keep the separator the match borrowed on its left, drop the time itself */
      var lead = LEAD.test(cut) ? cut.charAt(0) : '';
      var r = (str.slice(0, hit.index) + lead + str.slice(hit.index + hit[0].length));
      return r.replace(/\s{2,}/g, ' ').replace(EDGE_L, '').replace(EDGE_R, '').trim();
    }
    var rest = strip(s, m), extra = 0, again;
    while(extra < 4 && (again = RE.exec(rest))){
      var next = strip(rest, again);
      if(next === rest) break;
      rest = next; extra++;
    }
    return { hhmm: ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2), name: rest, twice: extra > 0 };
  }

  function plan(habits){
    var out = [];
    (habits || []).forEach(function(h){
      if(!h) return;
      var f = find(h.name);
      if(!f || !f.name) return;                       /* a name that is ONLY a time keeps its name */
      /* THE NAME ALWAYS LOSES THE CLOCK; THE FIELD IS ONLY FILLED WHEN IT IS EMPTY. A row whose
         field already says 08:40 and whose name still reads "8:40 Water" shows the same time twice -
         the complaint itself - and overwriting the field he set would be the other kind of wrong. */
      out.push({ id:h.id, was:String(h.name), name:f.name, twice:f.twice,
                 time:h.time_anchor ? null : f.hhmm, had:!!h.time_anchor });
    });
    return out;
  }

  function key(){ return 'ht30_renamed_' + ((S.me && S.me.id) || 'anon'); }
  function readLog(){ try{ return JSON.parse(localStorage.getItem(key()) || '[]'); }catch(e){ return []; } }
  function writeLog(rows){ try{ localStorage.setItem(key(), JSON.stringify(rows)); }catch(e){ warn30('rename log', e); } }
  function done(){ try{ return localStorage.getItem(key() + '_ran') === '1'; }catch(e){ return true; } }
  function markDone(){ try{ localStorage.setItem(key() + '_ran', '1'); }catch(e){} }

  async function run(){
    if(!HT30_NAME_TIMES || done()) return { ran:false, rows:[] };
    if(!S.me || !S.loadOk || !S.hasTime) return { ran:false, rows:[] };
    var rows = plan(S.habits);
    markDone();                                        /* once per account per device, pass or empty */
    if(!rows.length) return { ran:true, rows:[] };
    var okd = [];
    for(var i = 0; i < rows.length; i++){
      var r = rows[i];
      var patch = r.time ? { name:r.name, time_anchor:r.time } : { name:r.name };
      try{
        var res = await sb.from('habits').update(patch).eq('id', r.id).eq('user_id', S.me.id);
        if(res && res.error){ warn30('rename refused for one standard', res.error); continue; }
      }catch(e){ warn30('rename failed for one standard', e); continue; }
      var h = (S.habits || []).filter(function(x){ return x.id === r.id; })[0];
      if(h){ h.name = r.name; if(r.time) h.time_anchor = r.time; }
      okd.push(r);
    }
    if(okd.length){ writeLog(readLog().concat(okd)); try{ paintAll(); }catch(e){} }
    return { ran:true, rows:okd };
  }

  async function undo(id){
    var rows = readLog(), hit = null;
    rows = rows.filter(function(r){ if(r.id === id && !hit){ hit = r; return false; } return true; });
    if(!hit) return false;
    try{
      /* only what this pass wrote is undone: a row that already had a planned time keeps it. */
      var back = hit.time ? { name:hit.was, time_anchor:null } : { name:hit.was };
      var res = await sb.from('habits').update(back).eq('id', id).eq('user_id', S.me.id);
      if(res && res.error){ warn30('undo refused', res.error); return false; }
    }catch(e){ warn30('undo failed', e); return false; }
    var h = (S.habits || []).filter(function(x){ return x.id === id; })[0];
    if(h){ h.name = hit.was; if(hit.time) h.time_anchor = null; }
    writeLog(rows);
    try{ paintAll(); }catch(e){}
    return true;
  }

  function markdown(rows){
    rows = rows || readLog();
    var out = ['# RENAMED — every name HT-30 took a clock time out of', ''];
    if(!rows.length){ out.push('Nothing was changed: no standard carried a clock time in its name.'); }
    else{
      out.push('| was | is now | planned time | note |', '|---|---|---|---|');
      rows.forEach(function(r){
        var note = [];
        if(r.twice) note.push('a second time is still in the name \u2014 the first was taken');
        if(r.had) note.push('the planned time it already had was kept');
        out.push('| ' + r.was + ' | ' + r.name + ' | ' + (r.time || 'kept') + ' | ' + note.join(' \u00b7 ') + ' |');
      });
    }
    return out.join('\n') + '\n';
  }

  /* Settings -> the list, with an Undo per row. Only rendered when the pass changed something. */
  function settings(){
    var ov = document.querySelector('.ov.on .inner'); if(!ov || h30El('h30Ren')) return;
    var rows = readLog(); if(!rows.length) return;
    var n = document.createElement('div');
    n.id = 'h30Ren'; n.className = 'h16p h30p';
    n.innerHTML = '<div class="sh"><h2>Names I cleaned of times</h2><span class="ln"></span>' +
      '<span class="c">' + rows.length + '</span></div>' +
      '<div class="note" style="padding:4px 0 10px">The time moved into the standard’s own Planned time field. ' +
      'If one is wrong, Undo puts the name back exactly as it was.</div>' +
      rows.map(function(r){
        return '<div class="h30ren"><span class="n">' + esc(r.was) + '</span>' +
               '<span class="t num">' + esc(fmtTime(r.time)) + '</span>' +
               '<button class="btn" type="button" data-h30undo="' + esc(String(r.id)) + '">Undo</button></div>';
      }).join('');
    ov.appendChild(n);
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-h30undo]');
    if(!b) return;
    b.disabled = true;
    undo(b.getAttribute('data-h30undo')).then(function(ok){
      if(!ok){ b.disabled = false; toast('could not undo that one'); return; }
      var row = b.closest('.h30ren'); if(row && row.parentNode) row.parentNode.removeChild(row);
      toast('name put back');
    });
  });
  var _os = openSettings;
  openSettings = function(){ var out = _os.apply(null, arguments); setTimeout(settings, 90); return out; };

  var _pa = paintAll, tried = false;
  paintAll = function(){
    var out = _pa.apply(null, arguments);
    if(!tried && S.me && S.loadOk){ tried = true; setTimeout(function(){ run(); }, 900); }
    return out;
  };

  return { find:find, plan:plan, run:run, undo:undo, log:readLog, markdown:markdown, settings:settings };
})();
window.__HT30TIME = HT30TIME;


/* ---- S3.8 · THE EDIT SHEET: FIVE FIELDS ON THE SURFACE, THE REST ONE TAP DOWN -------------------------------
   Cory's words for this page are "name · section · planned time · duration · delete".
   TAKEN LITERALLY AND ALONE THAT BREAKS THE WIRE'S OWN S1: `Days` is what makes a standard weekly or
   Sabbath-resting (DEC-172, Ruling 3's Weekly section), so hiding it outright would make every new standard a
   daily one and quietly empty the Weekly routine this same wire is building. So the five he named are the
   SURFACE and `Group · Days · Which days · Rests on Sabbath · Link` sit under one quiet "More" - the pattern
   his own S6 orders for Insights, and the literal reading of "quiet and simple, deep on tap".
   THE FREE TEXT IS HIDDEN OUTRIGHT, because that part of the ruling is unambiguous: the "Done when" textarea
   is not rendered and `notes` is NOT WRITTEN while it is absent, so every definition of done survives exactly
   as it is (R70.138). It comes back by setting HT30_SHEET_NOTES to true. */
var HT30_SHEET_NOTES = false;
var HT30_SHEET_MORE = true;
(function(){
  /* HT-31 S2.11 · ONE ADDRESS FOR A TIME. 'Planned time' leaves this list: the chip on the row is
     where a time is set now, so keeping a second door on the sheet's surface is two answers to one
     question. The field is not deleted - it folds under More with everything else, which is where a
     keyboard or a screen reader still reaches it (R70.138). */
  var SURFACE = ['Name', 'Section', 'Planned minutes'];
  function labOf(f){ var s = f.querySelector('.lab'); return s ? s.textContent.trim() : ''; }

  function fold(){
    if(!HT30_SHEET_MORE) return;
    var body = h30El('ebody'); if(!body || body.querySelector('#h30More')) return;
    var tools = body.querySelector('.etools'); if(!tools) return;

    var kids = Array.prototype.slice.call(body.children);
    var deep = [];
    kids.forEach(function(f){
      if(f === tools || f.classList.contains('eh') || f.classList.contains('note')) return;
      var lab = labOf(f);
      if(!lab) return;
      if(lab === 'Done when' || lab === 'Notes'){
        /* hidden, never deleted - and `saveSheet` reads `#eNotes`, so removing the element is what
           stops `notes` being written at all. The textarea is detached, not emptied. */
        if(!HT30_SHEET_NOTES){ f.setAttribute('hidden', ''); f.classList.add('h30gone');
                               var ta = f.querySelector('textarea'); if(ta) ta.id = 'eNotesHidden';
                               deep.push(f); }          /* hidden AND off the surface, never removed */
        return;
      }
      if(SURFACE.indexOf(lab) < 0) deep.push(f);
    });
    if(!deep.length) return;

    var d = document.createElement('details');
    d.id = 'h30More'; d.className = 'h30more';
    d.innerHTML = '<summary>More</summary>';
    body.insertBefore(d, tools);
    deep.forEach(function(f){ d.appendChild(f); });
  }

  /* THE SHEET ANNOUNCES ITSELF; nothing here wraps `openSheet`, which lives two scopes down inside
     HT-11's own IIFE and is not reachable from here. `#esheet` gains `.on` when it opens and `#ebody`
     is rewritten on every open, so watching both catches every path that can put a sheet on screen -
     the pencil, "+ Add to ...", the keyboard - without any of them having to know this exists. */
  function watch(){
    var n = h30El('esheet'); if(!n || n.__h30obs || !window.MutationObserver) return;
    n.__h30obs = new MutationObserver(function(){
      if(n.classList.contains('on')) try{ fold(); }catch(e){ warn30('sheet fold', e); }
    });
    n.__h30obs.observe(n, { attributes:true, attributeFilter:['class'], childList:true, subtree:true });
    if(n.classList.contains('on')) try{ fold(); }catch(e){ warn30('sheet fold', e); }
  }
  document.addEventListener('click', function(){ setTimeout(watch, 0); setTimeout(watch, 120); }, true);
  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments); watch(); return out; };
  window.__HT30SHEET = { fold:fold, watch:watch, surface:SURFACE };
})();


/* ---- S5.13 · A SABBATH ANYONE CAN KEEP, ON THE DAY THEY CHOOSE ---------------------------------------------
   HT-19 narrowed Saturday to the Sabbath alone; 128 F took the narrowing out again because it was Cory's day
   imposed on everybody, including a brand-new account that had never asked for one. Cory's 9/20 ruling brings
   it back the only way it can be right: OFF by default, ON per person, for the day THAT person picks.
     · the day's list shows the Sabbath check-off and nothing else, so the day is what it says it is;
     · DEC-172's arithmetic is untouched - one ordinary due item, weight 1, no boost, no cap. `active_set` is
       still written per day (P4), so no past grade moves;
     · an account with a Sabbath standard and no stored preference starts ON for the day that standard is due,
       which is how Cory's own account keeps the day it already keeps without his name appearing in this file.
   WHERE IT IS STORED: `profile_private.sabbath_dow`, probed the way `cue`, `target_age`, `notes` and `section`
   are probed. Until that column exists the choice lives on the device and Settings says so in one line - the
   same build has to work before and after the migration (`tools/sql/2026-09-20_ht30.sql`). */
var HT30_SABBATH = true;
var HT30SAB = (function(){
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var LINE = 'No other standards take place on your Sabbath — only the Sabbath check-off shows that day.';
  var dow = null, loaded = false, hasCol = false;

  function lkey(){ return 'ht30_sab_' + ((S.me && S.me.id) || 'anon'); }
  function fromDevice(){
    try{ var v = localStorage.getItem(lkey()); return v == null || v === '' ? null : +v; }catch(e){ return null; }
  }
  function toDevice(v){ try{ if(v == null) localStorage.removeItem(lkey()); else localStorage.setItem(lkey(), String(v)); }catch(e){} }

  /* the account's own answer when it has never been asked: the day its Sabbath standard is due */
  function inferred(){
    var h = (S.habits || []).filter(isSabbathStd)[0];
    if(!h) return null;
    var d = dowOf(h);
    if(d && d.length === 1) return d[0];
    return 6;                                  /* a Sabbath standard with no day grammar is the seventh day */
  }

  async function load(){
    if(loaded) return dow;
    loaded = true;
    var stored = null;
    try{
      var r = await sb.from('profile_private').select('sabbath_dow').eq('id',S.me.id).maybeSingle();
      if(r && !r.error){ hasCol = true; stored = (r.data && r.data.sabbath_dow != null) ? +r.data.sabbath_dow : null; }
    }catch(e){ warn30('sabbath column probe', e); }
    if(!hasCol) stored = fromDevice();
    else if(stored == null && fromDevice() != null){
      stored = fromDevice();                    /* the device answered first; the column takes it over */
      await save(stored, true);
    }
    dow = (stored == null) ? inferred() : stored;
    if(stored == null && dow != null) await save(dow, true);
    return dow;
  }

  async function save(v, quiet){
    dow = (v == null || v === '') ? null : +v;
    toDevice(dow);
    if(hasCol){
      try{
        var r = await sb.from('profile_private').upsert({ id:S.me.id, sabbath_dow:dow }, { onConflict:'id' });   /* own row only */
        if(r && r.error) warn30('sabbath save refused', r.error);
      }catch(e){ warn30('sabbath save failed', e); }
    }
    if(!quiet){ try{ paintAll(); paint(); }catch(e){} }
    return dow;
  }

  function on(){ return HT30_SABBATH && dow != null; }
  function isDay(k){
    if(!on()) return false;
    var d = dnum(k || S.date);
    return !!d && !isNaN(d) && d.getDay() === dow;
  }
  function theStd(){ return (S.habits || []).filter(isSabbathStd)[0] || null; }

  /* THE DUE SET, on that day, is the Sabbath standard alone - which is both what is drawn and what the
     denominator counts, so the day cannot read 0% for standards the person was told not to keep. */
  var _daily = daily;
  daily = function(){
    var all = _daily.apply(null, arguments);
    if(h30Advanced() || !on() || !isDay(S.date)) return all;
    var only = all.filter(isSabbathStd);
    return only.length ? only : all;            /* no Sabbath standard yet: change nothing (HT-18e) */
  };

  /* THE LIST SAYS THE SAME THING THE SCORE SAYS. `daily()` above is the denominator; `paintLog`
     builds the rows from `S.habits` and never calls it, so narrowing one without the other would
     write a Saturday that reads 4% for standards the person was told to rest from. Rows, headers
     and the add-buttons are HIDDEN, never removed (R70.138), and the pass is idempotent.
     HT-19's own `sabbathList()` is left exactly as 128 F set it (`SABBATH_ONLY_SATURDAY` false):
     that one is global and Saturday-only, which is the thing this replaces. */
  function paint(){
    var log = h30El('log'); if(!log) return;
    var narrow = on() && isDay(S.date) && !h30Advanced() && !!theStd();
    var keep = narrow ? theStd().id : null;
    Array.prototype.slice.call(log.querySelectorAll('.li')).forEach(function(li){
      var b = li.querySelector('[data-tog]'), id = b ? b.getAttribute('data-tog') : null;
      li.hidden = narrow ? (id !== keep) : false;
    });
    Array.prototype.slice.call(log.querySelectorAll('.grp, .eadd, [data-add]')).forEach(function(e){
      e.hidden = narrow; });
    log.classList.toggle('h30sab', narrow);
  }

  function settings(){
    var ov = document.querySelector('.ov.on .inner'); if(!ov || h30El('h30Sab')) return;
    var n = document.createElement('div');
    n.id = 'h30Sab'; n.className = 'h16p h30p';
    n.innerHTML = '<div class="sh"><h2>Sabbath</h2><span class="ln"></span>' +
      '<span class="c">' + (on() ? DOW[dow] : 'off') + '</span></div>' +
      '<label class="fld"><span class="lab">Keep a Sabbath</span>' +
      '<span class="h28sw"><input type="checkbox" id="h30SabOn"' + (on() ? ' checked' : '') + '> ' +
      'one day a week, set apart</span></label>' +
      '<label class="fld" id="h30SabDayF"' + (on() ? '' : ' hidden') + '><span class="lab">Which day</span>' +
      '<select id="h30SabDay">' + DOW.map(function(d, i){
        return '<option value="' + i + '"' + (i === dow ? ' selected' : '') + '>' + d + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="note" style="padding:6px 0 0">' + esc(LINE) + '</div>' +
      (hasCol ? '' : '<div class="note" style="padding:6px 0 0">Kept on this device until one migration lands; ' +
                     'everything else about the day already syncs.</div>');
    ov.appendChild(n);
    var sw = h30El('h30SabOn'), sel = h30El('h30SabDay'), fld = h30El('h30SabDayF');
    sw.onchange = function(){
      if(sw.checked){ if(fld) fld.hidden = false; save(sel ? +sel.value : 6); }
      else{ if(fld) fld.hidden = true; save(null); }
    };
    if(sel) sel.onchange = function(){ save(+sel.value); };
  }
  var _os = openSettings;
  openSettings = function(){ var out = _os.apply(null, arguments); setTimeout(settings, 95); return out; };

  var _pa = paintAll, booted = false;
  paintAll = function(){
    var out = _pa.apply(null, arguments);
    try{ paint(); }catch(e){ warn30('sabbath list', e); }
    if(!booted && S.me && S.loadOk){
      booted = true;
      /* the OUTERMOST paintAll, not the one this wrapper captured: `_pa()` would repaint the chain
         below this layer and skip every layer added after it - Insights among them. `booted` is
         already true here, so this cannot recurse. */
      load().then(function(){ try{ paintAll(); }catch(e){} }).catch(function(e){ warn30('sabbath load', e); });
    }
    return out;
  };

  return { DOW:DOW, LINE:LINE, load:load, save:save, on:on, isDay:isDay, theStd:theStd, paint:paint,
           inferred:inferred, state:function(){ return { dow:dow, hasCol:hasCol, loaded:loaded }; } };
})();
window.__HT30SAB = HT30SAB;


/* ---- S6.14 · VIEWS AND INSIGHTS ARE ONE PAGE, BEHIND ONE TAB ------------------------------------------------
   DETAIL, Views and Insights were three doors into overlapping rooms; 133 closed one of them and left two.
   This closes the last one. ONE page, in the View page's own format, holding exactly Cory's five outputs plus
   the card that explains a rating - and the panels are MOVED, never re-rendered: every chart on it is still
   drawn by the renderer that already owns it (R70.306), so nothing here can drift from what Views showed.
     order: month completion · month rating · completion + rating trend · the life grid · the group side by side
            · what makes a good day
   NO ENTRY LIST OF ANY KIND is on this page - the journal ledger moves under "more" with everything else that
   used to live on Views. Hidden, never deleted (R70.138). */
var HT30_ONE_INSIGHTS = true;
var HT30INS = (function(){
  /* [ the node to move, where it comes from ] - a missing one is skipped, never an error: a panel that a
     migration has not created yet must not stop the page that holds the other five. */
  var ORDER = ['h30MonthC', 'h30MonthR', 'h30Trend', 'h30Life', 'h30Group', 'h30Rate'];

  function host(){
    var n = h30El('h30Ins'); if(n) return n;
    var grid = document.querySelector('.grid'); if(!grid) return null;
    n = document.createElement('section');
    n.id = 'h30Ins'; n.className = 'h30ins';
    n.innerHTML = '<div class="sh"><h2>Insights</h2><span class="ln"></span><span class="c" id="h30InsC"></span></div>' +
                  '<div id="h30InsBody" class="h29ins"></div>' +
                  '<details id="h30InsMore" class="h30more"><summary>More</summary><div id="h30InsMoreBody"></div></details>';
    grid.appendChild(n);
    return n;
  }
  /* A CARD HOLDS EXACTLY WHAT IT IS GIVEN. HT-29's `render()` rebuilds `#ins29`'s innerHTML on every
     paint, so the card this page borrowed last time is a DEAD node the moment a new one is made -
     and leaving it behind put two charts on the page at once (`golden_ht29` S5e read 7 + 30 = 37
     bars). Anything in the box that is not in this call's list goes. */
  function card(id, title, nodes){
    var list = [].concat(nodes || []).filter(Boolean);
    var c = h30El(id);
    if(!c){
      c = document.createElement('div');
      c.id = id; c.className = 'h30c';
      c.innerHTML = '<div class="lab">' + title + '</div><div class="h30cb"></div>';
    }
    var box = c.querySelector('.h30cb');
    Array.prototype.slice.call(box.children).forEach(function(k){
      if(list.indexOf(k) < 0) box.removeChild(k);
    });
    list.forEach(function(n){ if(n.parentNode !== box) box.appendChild(n); });
    return c;
  }
  /* WHERE EACH BORROWED NODE CAME FROM, recorded once, the first time it moves. `next` is a live
     reference: if the sibling it was in front of is itself borrowed, `restore()` puts them back in the
     order they were recorded, so the pair lands the right way round. */
  var HOME = [];
  function remember(node){
    if(!node || node.__h30home) return;
    node.__h30home = true;
    HOME.push({ n:node, p:node.parentNode, next:node.nextSibling });
  }
  function moveTo(host, node){
    if(!node || node.parentNode === host) return;
    remember(node);
    host.appendChild(node);
  }
  function restore(){
    for(var i = HOME.length - 1; i >= 0; i--){
      var h = HOME[i];
      if(!h.p || h.n.parentNode === h.p) continue;
      try{ h.p.insertBefore(h.n, (h.next && h.next.parentNode === h.p) ? h.next : null); }
      catch(e){ warn30('putting a panel back', e); }
    }
  }

  function build(){
    if(!HT30_ONE_INSIGHTS || h30Advanced()) return null;
    /* HT-31 S4.15 (Cory, 9/21): "the insights on the desktop - remove that completely". The page is
       not built there at all, and every panel it had borrowed goes straight home - which is what puts
       THE MONTH, THE YEAR, LIFE and GROUP back on the main view where they were before HT-30 moved
       them one tap down. Gated here, at the one place that makes the page, rather than undone
       afterwards by a second renderer: two renderers fighting over one list is S1's defect. */
    if(!HT31_DESK_INSIGHTS && !h31Phone()){
      try{ restore(); }catch(e){ warn31('putting the desktop panels back', e); }
      var gone = h30El('h30Ins');
      if(gone && gone.parentNode) gone.parentNode.removeChild(gone);
      return null;
    }
    var h = host(); if(!h) return null;
    var body = h30El('h30InsBody'), more = h30El('h30InsMoreBody');
    if(!body || !more) return null;
    /* the cards are HT-29's and so is their behaviour - carried, not re-implemented (R70.306) */
    if(!body.__h30click && window.__HT29INS && window.__HT29INS.onClick){
      body.__h30click = true;
      body.addEventListener('click', function(e){
        try{ window.__HT29INS.onClick(e); }catch(err){ warn30('insights click', err); }
        /* HT-29's handler answers by RE-RENDERING `#ins29`, which makes three new cards and leaves
           the three on this page dead. Adopt the new ones straight away, or the page shows the old
           chart beside the new one - which is exactly what `golden_ht29` S5e measured (7 + 30 bars). */
        setTimeout(function(){ try{ build(); }catch(err){ warn30('insights rebuild', err); } }, 0);
      });
    }

    /* the five outputs, each still drawn by its own renderer */
    var vNav = h30El('vNav'), vMonthC = h30El('vMonthC'), vMonthR = h30El('vMonthR');
    if(vMonthC){ remember(vMonthC); if(vNav) remember(vNav);
                 var cc = card('h30MonthC', 'Month · completion', [vNav, vMonthC]);
                 if(cc.parentNode !== body) body.appendChild(cc); }
    if(vMonthR){ remember(vMonthR); var cr = card('h30MonthR', 'Month · rating', vMonthR); if(cr.parentNode !== body) body.appendChild(cr); }

    /* HT-29's own trend card and rating card are already the 7d/30d shape Cory asked for */
    var i29 = h30El('ins29');
    if(i29){
      var t = i29.querySelector('[data-i29="trend"]'), r = i29.querySelector('[data-i29="rate"]'),
          g = i29.querySelector('[data-i29="group"]');
      if(t){ remember(t); var ct = card('h30Trend', 'Completion and rating over time', t); if(ct.parentNode !== body) body.appendChild(ct); }
      var vLife = h30El('vLife');
      if(vLife){ remember(vLife); var cl = card('h30Life', 'The life', vLife); if(cl.parentNode !== body) body.appendChild(cl); }
      if(g){ remember(g); var cg = card('h30Group', 'The group, side by side', g); if(cg.parentNode !== body) body.appendChild(cg); }
      if(r){ remember(r); var cq = card('h30Rate', 'What makes a good day', r); if(cq.parentNode !== body) body.appendChild(cq); }
    }else{
      var vLife2 = h30El('vLife');
      if(vLife2){ remember(vLife2); var cl2 = card('h30Life', 'The life', vLife2); if(cl2.parentNode !== body) body.appendChild(cl2); }
    }

    /* everything else that lived on Views or Insights - one tap down, never deleted. THE JOURNAL LEDGER IS
       THE NAMED ONE: no entry list of any kind appears on this page (Cory 9/20). */
    /* ONLY WHAT IS A GRID CHILD IN ITS OWN RIGHT. `c5Five` and `vInsights` live inside `#c5More`,
       and `vTrends`/`vGroups` inside `#vViews` - borrowing them by name pulled each one OUT of the
       box that is meant to hold it, and `golden_ht26` S2d read `#c5More #vInsights .vins` as zero.
       Their hosts are on this list, so they travel with them. */
    /* IN THE ORDER VIEWS HAD. `golden_ht28` A6 asserts the sequence month, year, insights, weeks,
       HT-26's panel, the journal - so "everything else, one tap down" keeps it rather than reshuffling
       the room on the way out. `#h16Score` leads because HT-29 already put it behind a tap. */
    /* NOT `h16Score`: HT-29's audit (A28) already hid the group scorecard from this tab and put it
       one tap inside DETAIL. Borrowing it here put it BACK on the page - inside the More, but visible
       - and `golden_ht28` A6 read it as a seventh panel in an order that names six. */
    /* HT-31 S4.13: when the phone's page is Cory's four blocks, THE MONTH and THE YEAR are two of
       them - so they are not absorbed into More on the way past. Decided here, where the absorbing
       happens, because the alternative is this renderer putting them away on every paint while
       HT-31's puts them back: two renderers fighting over one list, which is S1's whole lesson. */
    var absorb = (!h31Extras() && h31Phone()) ? ['h16Ins'] : ['h16Month', 'h16Year', 'h16Ins'];
    absorb.forEach(function(id){ moveTo(more, h30El(id)); });
    var wk = document.querySelector('.vWeeksSec'); if(wk) moveTo(more, wk);
    ['h26Ins', 'h26Jrn', 'vViews'].forEach(function(id){ moveTo(more, h30El(id)); });
    var det = h30El('i29Detail'); if(det && det.parentNode) moveTo(more, det.parentNode);
    var vRange = h30El('vRange'); if(vRange) moveTo(more, vRange);

    var cap = h30El('h30InsC'); if(cap) cap.textContent = '';
    return h;
  }

  /* ---- the one tab, on both widths -------------------------------------------------------------------
     PHONE: the bottom bar loses "Views" and keeps Today · Insights.
     DESKTOP: a real tab beside Today in the top bar - not a link, and not a button that opens an overlay,
     because R70.211 says a page reached only by a URL does not exist and Cory said the same thing in plainer
     words: he could not find it. */
  function bar(){
    var b = h30El('h29Bar'); if(!b) return;
    var v = b.querySelector('[data-t29="views"]');
    if(v && !v.hasAttribute('hidden')) v.setAttribute('hidden', '');       /* hidden, never deleted */
  }
  function deskTab(){
    var t = h30El('vTabs'); if(!t) return;
    var v = t.querySelector('[data-v="views"]');
    /* HT-31 S4.15: the tab goes, and a bar with one tab left in it is noise, so the bar goes with it.
       Hidden, never deleted (R70.138) - `HT31_DESK_INSIGHTS = true` brings both back unchanged. */
    if(!HT31_DESK_INSIGHTS && !h31Phone()){
      if(v && !v.hasAttribute('hidden')) v.setAttribute('hidden', '');
      var live = Array.prototype.slice.call(t.querySelectorAll('[data-v]'))
                   .filter(function(b){ return !b.hasAttribute('hidden'); });
      if(live.length <= 1 && !t.hasAttribute('hidden')) t.setAttribute('hidden', '');
      return;
    }
    if(t.hasAttribute('hidden')) t.removeAttribute('hidden');
    if(v && v.hasAttribute('hidden')) v.removeAttribute('hidden');
    if(v) v.textContent = 'Insights';
    t.classList.add('h30tabs');
    /* INSIDE the masthead, which is what "a real tab beside Today in the top bar" means and also what
       HT-18's gutter contract requires: sitting BETWEEN the mast and the grid, it added 25 px to the
       mast->grid gap and `golden_ht18` S1c read 49 where 24 was the rule. Inside the mast it costs the
       layout nothing, and the phone hides it because the bottom bar is that width's door. */
    var mast = document.querySelector('.mast');
    if(mast && t.parentNode !== mast) mast.appendChild(t);
  }
  function go(which){
    /* S4.15: with no Insights page on this width, every door into it - the tab, the strip, HT-26's
       openInsights(), a `#insights` link, a tab a person left on - lands on Today rather than on a
       page that is not there. R70.211 in reverse: a door that opens on nothing is worse than no door. */
    if(!HT31_DESK_INSIGHTS && !h31Phone() && (which === 'insights' || which === 'views')) which = 'today';
    if(which === 'insights' || which === 'views'){
      /* "views" IS the Insights state now - every rule in app.css that makes this page a page hangs
         off it. HT-29 set "insights" here, which nothing in the stylesheet matches. */
      if(window.__HT13_TAB) window.__HT13_TAB('views');
      document.documentElement.setAttribute('data-vtab', 'views');
      if(window.__HT29INS && window.__HT29INS.render) try{ window.__HT29INS.render(); }catch(e){ warn30('ins render', e); }
      if(window.__HT13_REPAINT) try{ window.__HT13_REPAINT(); }catch(e){ warn30('views repaint', e); }
      build();
      window.scrollTo(0, 0);
    }else if(window.__HT13_TAB){
      document.documentElement.setAttribute('data-vtab', 'today');
      try{ restore(); }catch(e){ warn30('restore', e); }
      window.__HT13_TAB(which); window.scrollTo(0, 0);
    }
    mark();
  }
  /* the bar and the tab say where you are, whichever of the two words the state is carrying */
  function mark(){
    var on = (document.documentElement.getAttribute('data-vtab') || 'today') !== 'today';
    Array.prototype.slice.call(document.querySelectorAll('#h29Bar [data-t29]')).forEach(function(btn){
      var mine = btn.getAttribute('data-t29') === (on ? 'insights' : 'today');
      btn.classList.toggle('on', mine); btn.setAttribute('aria-current', mine ? 'page' : 'false'); });
    Array.prototype.slice.call(document.querySelectorAll('#vTabs [data-v]')).forEach(function(btn){
      btn.classList.toggle('on', btn.getAttribute('data-v') === (on ? 'views' : 'today')); });
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('#vTabs [data-v], #h29Bar [data-t29]');
    if(!b) return;
    var w = b.getAttribute('data-v') || b.getAttribute('data-t29');
    setTimeout(function(){ go(w === 'today' ? 'today' : 'insights'); }, 0);
  });

  function onInsights(){ return (document.documentElement.getAttribute('data-vtab') || 'today') !== 'today'; }
  /* THE BORROWED PANELS ARE EMPTY UNTIL THEIR OWN PAINTER RUNS. `#vMonthC`, `#vMonthR` and `#vLife`
     are drawn by HT-13, which draws them when ITS tab repaints - and a node that has been moved has
     not been repainted. Without this the month-rating card and the life grid were headed boxes with
     nothing in them, which the first phone shot showed at a glance. */
  function repaintBorrowed(){
    if(window.__HT13_REPAINT) try{ window.__HT13_REPAINT(); }catch(e){ warn30('views repaint', e); }
  }
  /* EVERY DOOR, NOT JUST THE TAB. `data-vtab` is what makes this a page, and three other things set
     it - the strip under Today ("Insights >"), HT-26's `openInsights()`, and HT-13 restoring the tab
     a person left on. Building only from the tab's own click meant those doors opened an EMPTY page:
     the stylesheet had stood everything else down and nothing had been put in its place.
     `golden_ht26` S2b found it by tapping the strip. */
  (function(){
    if(!window.MutationObserver) return;
    new MutationObserver(function(){
      try{ if(onInsights()){ build(); repaintBorrowed(); } else restore(); mark(); }
      catch(e){ warn30('vtab watch', e); }
    }).observe(document.documentElement, { attributes:true, attributeFilter:['data-vtab'] });
  })();
  var _pa = paintAll;
  paintAll = function(){
    /* GIVE THEM BACK FIRST. Today's quadrants are drawn from these very nodes, so the paint has to
       find them where they live, not inside a page that is not on screen. */
    if(!onInsights()) try{ restore(); }catch(e){ warn30('restore', e); }
    var out = _pa.apply(null, arguments);
    try{
      bar(); deskTab();
      if(onInsights()){ build(); repaintBorrowed(); } else restore();
      mark();
    }catch(e){ warn30('one insights', e); }
    return out;
  };
  /* HT-31 S4.13 borrows `card` rather than writing a second card builder (R70.306, one renderer per
     kind) - and borrowing it is also what keeps every Insights golden's `#h30InsBody > .h30c > .lab`
     reading the same shape whoever made the card. */
  return { build:build, restore:restore, go:go, bar:bar, deskTab:deskTab, mark:mark, card:card,
           onInsights:onInsights, borrowed:function(){ return HOME.length; }, ORDER:ORDER };
})();
window.__HT30INS = HT30INS;


/* ---- S7.16 · START A GROUP, OR JOIN ONE ---------------------------------------------------------------------
   HT-29 built create, join, the deep link and the five columns. What it did not build is the one screen where
   a person meets all of it, and the two things Cory named: starting a group hands back a LINK he can send (a
   code read aloud is not an invitation), and a member's row carries a way OUT.
   The deep link already joins a signed-in person directly - HT-29's join card reads `ht_join_code` and calls
   `join()` with no sign-up step - so stress 5 is a test here, not a build. */
var HT30GRP = (function(){
  function link(code){
    return (window.__HT24_JOIN && window.__HT24_JOIN.link) ? window.__HT24_JOIN.link(code) : '';
  }
  async function leave(){
    if(!S.me) return { ok:false, why:'not signed in' };
    /* SCOPED TO THE GROUP HE IS LOOKING AT, never to every row this account has. An unscoped delete
       reads the same on an account with one group and empties the account of a person who has two -
       the shape of defect that only shows up on somebody else's data. */
    var cid = null;
    try{ var st = window.__HT29GRP && window.__HT29GRP.state(); cid = st && st.circle && st.circle.id; }
    catch(e){ warn30('which group', e); }
    if(!cid) return { ok:false, why:'Not in a group to leave.' };
    try{
      var r = await sb.from('circle_members').delete().eq('user_id', S.me.id).eq('circle_id', cid);
      if(r && r.error) return { ok:false, why:'Could not leave — try again.' };
      return { ok:true };
    }catch(e){ warn30('leave failed', e); return { ok:false, why:'Could not leave — try again.' }; }
  }
  /* the Group screen, rewritten as two named actions and a way out */
  function html(st){
    var c = st && st.circle;
    if(c){
      var url = link(c.join_code || '');
      return '<div class="note" style="padding:4px 0 12px">You are in <b>' + esc(c.name || 'a group') + '</b>. ' +
        'The group sees your standards, check-offs and the day’s number — never your journal.</div>' +
        '<div class="h29code">code <b>' + esc(c.join_code || '') + '</b></div>' +
        (url ? '<label class="fld"><span class="lab">Share link</span>' +
               '<input id="h30Link" readonly value="' + esc(url) + '"></label>' : '') +
        /* HT-31 S7.21: ONE control, named Invite - "Invite someone" reads as a description of a
           place rather than a button. S7.23: Reset link kills the old one the moment the new one is
           written, which is the only honest answer to "I sent that link to the wrong person". */
        '<div class="tools">' +
        (h31CanInvite(c)
          ? '<button class="btn pri" id="g29Invite" data-h29invite="1" type="button">Invite</button>' +
            '<button class="btn" id="h31Reset" type="button">Reset link</button>'
          : '<span class="note">Only the person who started this group can send the link.</span>') +
        '<span style="flex:1"></span><button class="btn" id="h30Leave" type="button">Leave</button></div>' +
        '<div class="note" id="g29Msg" style="padding-top:12px"></div>';
    }
    return '<div class="note" style="padding:4px 0 12px">A group sees each other’s standards, check-offs and ' +
      'the day’s number — never a journal.</div>' +
      '<div class="h30gh">Start a group</div>' +
      '<label class="fld"><span class="lab">Name it</span><input id="g29Name" autocomplete="off"></label>' +
      '<div class="tools"><button class="btn pri" id="g29Make" type="button">Start a group</button></div>' +
      '<div class="h30gh" style="margin-top:18px">Join a group</div>' +
      '<label class="fld"><span class="lab">Code, or the link they sent you</span>' +
      '<input id="g29Code" autocapitalize="characters" autocomplete="off"></label>' +
      '<div class="tools"><button class="btn" id="g29Join" type="button">Join a group</button></div>' +
      '<div class="note" id="g29Msg" style="padding-top:12px"></div>';
  }
  /* a pasted LINK is a code: nobody reads a query string off a message and types the six characters out */
  function codeOf(v){
    var s = String(v || '').trim();
    var m = /[?&]join=([^&#\s]+)/.exec(s);
    return (m ? decodeURIComponent(m[1]) : s).trim().toUpperCase();
  }
  /* ---- THE LINK LANDS ------------------------------------------------------------------------
     One paint, once, as soon as there is a code AND an account that finished loading. It gives up
     after twelve seconds rather than polling forever: a code with no session is a person who has not
     signed in yet, and HT-29's own paint path picks it up the moment they do. */
  (function(){
    var tries = 0, t = null;
    function stored(){ try{ return localStorage.getItem('ht_join_code'); }catch(e){ return null; } }
    function tick(){
      tries++;
      if(tries > 40){ clearInterval(t); return; }
      if(h30El('h29Join')){ clearInterval(t); return; }
      if(!stored() || !S.me || S.loadOk !== true) return;
      clearInterval(t);
      try{ paintAll(); }catch(e){ warn30('join repaint', e); }
    }
    function start(){ if(t) return; t = setInterval(tick, 300); tick(); }
    if(document.readyState === 'complete') setTimeout(start, 300);
    else window.addEventListener('load', function(){ setTimeout(start, 300); });
  })();

  window.__HT30GRP = { link:link, leave:leave, html:html, codeOf:codeOf };
  return window.__HT30GRP;
})();


/* ==============================================================================================
   HT-31 (PASTE 143, Cory Monday 2026-09-21) - WRITE IN THE VAULT, EVERYONE GETS EVERYTHING,
   TIME FROM THE ROW.  One block, the file's convention: flags first, then one IIFE per subject,
   each exporting a seam the goldens read.
   ============================================================================================== */
function warn31(what, e){ try{ console.warn('HT-31: ' + what, e); }catch(_){} }
function h31El(id){ return document.getElementById(id); }

/* ---- S0.3 · THE BUILD KEEPS ITSELF CURRENT ------------------------------------------------------
   Three of the twelve complaints in receipt 137 were CACHED: the deploy was current and the device
   was not, and the only thing standing between Cory and a two-day-old build was a banner he had to
   notice. `version.json` is served no-store, so it is the one file a cache cannot lie about; the
   running build compares itself to it and, when it is behind, brings itself forward ONCE.
   IT NEVER RELOADS UNDER HIS HANDS. A focused text box, or text typed and not yet written, means the
   banner and nothing else - the reload waits for the blur. Whatever was typed is stashed for the
   length of the reload and put back if the field comes up empty, so an auto-refresh cannot eat a
   sentence. One reload per version, remembered in localStorage, so a wrong answer cannot loop. */
var HT31_VERSION_WATCH = true;
var HT31_VERSION_EVERY_MS = 60000;
(function(){
  var KEY = 'ht31_reloaded', STASH = 'ht31_unsent', FIELDS = ['iDump', 'iTasks', 'iPrayer', 'iWhy'];
  var pending = null;

  function running(){ return (typeof HT30_VERSION === 'string' && HT30_VERSION) || ''; }
  function did(v){ try{ return localStorage.getItem(KEY) === v; }catch(e){ return false; } }
  function mark(v){ try{ localStorage.setItem(KEY, v); }catch(e){} }

  /* TYPING BEATS FRESHNESS, ALWAYS. */
  function typing(){
    var a = document.activeElement;
    if(!a) return false;
    var t = (a.tagName || '').toLowerCase();
    return t === 'textarea' || t === 'input' || a.isContentEditable === true;
  }
  function unsent(){
    for(var i = 0; i < FIELDS.length; i++){
      var n = h31El(FIELDS[i]);
      if(n && n.dataset && n.dataset.ht31Dirty === '1' && String(n.value || '').length) return true;
    }
    return false;
  }
  function watchDirty(){
    FIELDS.forEach(function(id){
      var n = h31El(id); if(!n || n.dataset.ht31Watch === '1') return;
      n.dataset.ht31Watch = '1';
      n.addEventListener('input', function(){ n.dataset.ht31Dirty = '1'; });
      n.addEventListener('blur', function(){ n.dataset.ht31Dirty = ''; ready(); });
    });
  }
  function stash(){
    var out = {};
    FIELDS.forEach(function(id){ var n = h31El(id); if(n && String(n.value || '').length) out[id] = n.value; });
    try{ sessionStorage.setItem(STASH, JSON.stringify(out)); }catch(e){}
  }
  function unstash(){
    var raw = null;
    try{ raw = sessionStorage.getItem(STASH); sessionStorage.removeItem(STASH); }catch(e){}
    if(!raw) return;
    var o = {};
    try{ o = JSON.parse(raw) || {}; }catch(e){ return; }
    Object.keys(o).forEach(function(id){
      var n = h31El(id);
      if(n && !String(n.value || '').length){ n.value = o[id]; n.dataset.ht31Dirty = '1';
        try{ n.dispatchEvent(new Event('input', {bubbles: true})); }catch(e){} }
    });
  }

  function flush(){
    try{ if(window.__HT28c && window.__HT28c.flush) window.__HT28c.flush(); }catch(e){ warn31('flush', e); }
  }
  function go(v){
    mark(v); stash(); flush();
    setTimeout(function(){ try{ location.reload(); }catch(e){ warn31('reload', e); } }, 60);
  }
  /* A pending update takes the first safe moment: a blur, a visibility change, or the next poll. */
  function ready(){
    if(!pending || typing() || unsent()) return;
    var v = pending; pending = null; go(v);
  }
  function banner(v){
    try{
      if(window.__HT29UPD && window.__HT29UPD.show){ window.__HT29UPD.show(); return; }
    }catch(e){ warn31('banner', e); }
  }

  function found(v){
    if(!v || v === running() || did(v)) return;
    if(typing() || unsent()){ pending = v; banner(v); return; }
    go(v);
  }
  function check(){
    if(!HT31_VERSION_WATCH) return;
    if(document.visibilityState === 'hidden') return;
    /* A PAGE OPENED FROM DISK HAS NO DEPLOY BEHIND IT. `fetch` on a `file://` URL does not merely
       fail, it logs a console error the caller cannot catch - which is a page error in the headless
       harness and a red line in a real console. The harness runs the app from `file://`, so this is
       not a test convenience: there is nothing to ask and nothing to ask it of. */
    if(!/^https?:$/.test(location.protocol)) return;
    var url = 'version.json?t=' + Date.now();
    try{
      fetch(url, {cache: 'no-store'}).then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){ if(j && j.version) found(String(j.version)); })
        .catch(function(){});
    }catch(e){ warn31('version fetch', e); }
  }

  function start(){
    watchDirty(); unstash();
    setTimeout(check, 1500);
    setInterval(check, HT31_VERSION_EVERY_MS);
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible'){ ready(); check(); } });
    document.addEventListener('focusout', function(){ setTimeout(ready, 120); }, true);
  }
  if(document.readyState === 'complete') setTimeout(start, 300);
  else window.addEventListener('load', function(){ setTimeout(start, 300); });

  window.__HT31UPD = { check: check, running: running, typing: typing, unsent: unsent,
                       pendingVersion: function(){ return pending; }, watchDirty: watchDirty };
})();


/* ---- S1 · NOTHING BUT THE SECTION FIELD DECIDES THE SECTION -------------------------------------
   THE DEFECT, in Cory's words: "when I set any nightly time it appears always in the morning
   routine". Reproduced on the fixture (`_reconcile/ht_stage/143/recon143.py`), and it is TWO
   renderers disagreeing about who owns the list:

     a · `HT29SEC.sectionOf()` derived the section from the CLOCK whenever `habits.section` held
         nothing - "has a planned time -> morning" - so with the HT-29 SQL not yet run (his live
         shape: `S.hasSection` false) EVERY timed task is a morning task, at 05:00 and at 21:30
         alike. Measured: h0 at 21:30 renders under "Morning routine", at every hour tested.
     b · HT-16's `reorderToday()` re-grouped `#log` into "the timed rows, then one header reading
         ANYTIME" on every `repaint()` / `repaintCharts()` - a day change, a month arrow, boot -
         because those paths never call `paintLog`, and so never reach HT-29's section grouper.
         Measured: after `repaintCharts()` the four section headers are replaced by one ANYTIME.
         That is the header in Cory's 9/21 screenshot, with his night tasks hoisted above it.

   THE LAW (S1.6): setting or changing a time never changes a task's section; nothing but the
   section field decides the section; "Add to <section>" creates the task in that section.
   (a) is fixed in `sectionOf` itself, (b) inside `reorderToday`, and this block adds the third
   piece: while the COLUMN is absent the person still has to be able to place a task, so his
   placement is kept on the device and pushed to the column the moment it exists. A placement the
   person made always beats anything code would derive. */
var HT31_SECTIONS_LOCAL = true;
(function(){
  var KEY = 'ht31_sections';
  var map = null;

  function load(){
    if(map) return map;
    map = {};
    try{ map = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){ map = {}; }
    return map;
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(load())); }catch(e){ warn31('sections save', e); } }
  function local(id){ return id ? (load()[String(id)] || '') : ''; }
  function place(id, sec){
    if(!id || !sec) return;
    load()[String(id)] = String(sec);
    save();
  }
  function forget(id){ if(!id) return; delete load()[String(id)]; save(); }

  /* A new standard is inserted without `.select()`, so its id arrives with the next load. The pick
     waits under its NAME and is claimed once, by a row that has no placement of its own. */
  var waiting = null;
  function pendingNew(name, sec){ waiting = (name && sec) ? {name: String(name), sec: String(sec)} : null; }
  function claim(){
    if(!waiting) return;
    var m = (S.habits || []).filter(function(h){
      return String(h.name || '') === waiting.name && !h.section && !local(h.id); });
    if(!m.length) return;
    place(m[m.length - 1].id, waiting.sec);
    waiting = null;
  }

  /* Once the column exists, the device's copy is written up and then dropped - one direction, and
     only for rows the column has nothing for, so a placement made on another device is never
     overwritten by an older one kept here. */
  function push(){
    if(!S || !S.hasSection || !S.me || !window.sb) return;
    var m = load(), ids = Object.keys(m);
    if(!ids.length) return;
    ids.forEach(function(id){
      var h = (S.habits || []).filter(function(x){ return String(x.id) === id; })[0];
      if(!h){ forget(id); return; }
      if(String(h.section || '') === String(m[id])){ forget(id); return; }
      if(h.section){ forget(id); return; }
      /* AN UPDATE THAT MATCHES NO ROW IS NOT AN ERROR TO PostgREST - this file learned that at
         app.js:1833 and HT-31 nearly paid for it again. This `forget()` deletes the ONLY copy of a
         placement Cory made, so it may not run on anything weaker than a row coming back: `.select('id')`
         makes the count readable, and an RLS refusal, a check constraint or a zero-row match all land
         here as "not written" instead of as success. The device keeps its copy and tries again. */
      try{
        window.sb.from('habits').update({section: m[id]}).eq('id', id).eq('user_id', S.me.id).select('id')
          .then(function(res){
            if(res && res.error){ warn31('section push refused', res.error); return; }
            if(!res || !res.data || !res.data.length){ warn31('section push matched no row', id); return; }
            h.section = m[id]; forget(id);
          }, function(e){ warn31('section push', e); });
      }catch(e){ warn31('section push', e); }
    });
  }

  window.__HT31SEC = { local: local, place: place, forget: forget, push: push, claim: claim,
                       pendingNew: pendingNew,
                       all: function(){ return JSON.parse(JSON.stringify(load())); } };

  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments);
                         try{ claim(); push(); }catch(e){ warn31('section push', e); } return out; };
})();


/* ---- S1.7 · THE TASKS THE DEFECT MAY HAVE MOVED, WITH AN UNDO PER ROW ---------------------------
   The render-time half moved nothing in the database - it only drew rows in the wrong place. The
   DURABLE half is the sheet: with the section select defaulting to `sectionOf(h)`, opening a 21:30
   task and saving ANY other change wrote `section:'morning'` for good. So the list is computed from
   his own rows, in his own browser, with no key and no server pass: a task stored `morning` whose
   planned time is outside the morning (before 04:00 or at/after 12:00). It is SHOWN, never applied -
   "never silently move a user's task, in either direction" - and each row has one tap that puts it
   where the clock says he meant, or dismisses the row for good. */
(function(){
  var SEEN = 'ht31_moved_seen';
  function seen(){ try{ return JSON.parse(localStorage.getItem(SEEN) || '[]') || []; }catch(e){ return []; } }
  function hide(id){ var s = seen(); if(s.indexOf(id) < 0){ s.push(id); try{ localStorage.setItem(SEEN, JSON.stringify(s)); }catch(e){} } }

  /* the planned time in minutes, read the way every renderer reads it */
  function pm(h){
    var t = h && (h.time_anchor || h.planned_start);
    if(!t) return null;
    var s = String(t).slice(0, 5);
    if(!/^\d{2}:\d{2}$/.test(s)) return null;
    return (+s.slice(0, 2)) * 60 + (+s.slice(3, 5));
  }
  function suspect(h){
    if(!h || String(h.section || '').toLowerCase() !== 'morning') return false;
    var m = pm(h);
    if(m == null) return false;
    return m >= 12 * 60 || m < 4 * 60;          /* a "morning" task planned for the afternoon or the small hours */
  }
  function suggestion(h){ var m = pm(h); return (m != null && m >= 18 * 60) ? 'night' : 'standards'; }
  function rows(){
    var s = seen();
    return (S.habits || []).filter(function(h){ return suspect(h) && s.indexOf(String(h.id)) < 0; });
  }
  function list(){
    return rows().map(function(h){
      return { id: String(h.id), name: String(h.name || ''), time: String(h.time_anchor || h.planned_start || '').slice(0, 5),
               section: 'morning', suggest: suggestion(h) };
    });
  }
  function move(id, sec){
    var h = (S.habits || []).filter(function(x){ return String(x.id) === String(id); })[0];
    if(!h) return Promise.resolve(false);
    /* THE ROW IS DISMISSED ONLY ONCE THE MOVE IS REAL. Hiding it first meant a failed write left the
       task where the bug put it AND took away the one tap that would have fixed it - permanently,
       because `hide()` is remembered. Same reason as the two above: no error is not the same as a row. */
    h.section = sec;
    if(!S.hasSection || !window.sb || !S.me){
      if(window.__HT31SEC) window.__HT31SEC.place(id, sec);
      hide(String(id));
      return Promise.resolve(true);
    }
    return window.sb.from('habits').update({section: sec}).eq('id', id).eq('user_id', S.me.id).select('id')
      .then(function(res){
        if(res && res.error){ warn31('moved undo refused', res.error); return false; }
        if(!res || !res.data || !res.data.length){ warn31('moved undo matched no row', id); return false; }
        hide(String(id));
        return true;
      }, function(e){ warn31('moved undo', e); return false; });
  }
  window.__HT31MOVED = { list: list, move: move, hide: hide, suspect: suspect };
})();


/* ---- S2.9 / S2.10 · THE CHIP ON THE ROW IS THE EDITOR -------------------------------------------
   Cory, 9/21: "I don't want to click inside of it to click the time ... editable outside, next to the
   completed task". So the planned-time chip is not a label any more - tapping it opens a small picker
   anchored to that row, and the edit page is not involved at all.
   WHY NOT `<input type="time">`: it follows the DEVICE locale, and on a 24-hour device it shows 24-hour
   whatever this app renders - which is the complaint. One picker, ours, in his form: hour 1-12, minutes
   in five-minute steps with a box for an exact minute, AM/PM, Clear. It saves when it closes, closes on
   an outside tap or Esc, and every control is >= 16px so iOS does not zoom the page (128 A1).
   THE HIT AREAS DO NOT OVERLAP: the check-off owns the left 44px of the row and the chip owns its own
   44px at the right. Tapping the chip never toggles the day, and tapping the box never opens a picker -
   `golden_ht31` S2 proves it with synthetic taps at the centre of each.
   A ROW WITH NO TIME shows a ghost `+ time` in Morning and Night only (HT31_GHOST_CHIP_SECTIONS): those
   are the two sections a time means something in. Weekly and Standards show a chip only when a time
   exists, and the desktop reveals the ghost on hover so a resting list stays quiet. */
var HT31_TIME_PICKER = true;
var HT31_GHOST_CHIP_SECTIONS = ['morning', 'night'];
(function(){
  var open = null;                    /* {id, chip, node} while a picker is on screen */

  function habit(id){ return (S.habits || []).filter(function(h){ return String(h.id) === String(id); })[0]; }
  function parts(t){
    var m = /^\s*(\d{1,2}):([0-5]\d)/.exec(String(t || ''));
    if(!m) return { h: 7, m: 0, ap: 'AM', had: false };
    var H = (+m[1]) % 24, ap = H < 12 ? 'AM' : 'PM', hh = H % 12;
    return { h: hh === 0 ? 12 : hh, m: +m[2], ap: ap, had: true };
  }
  function to24(h, mi, ap){
    var H = (+h) % 12;
    if(ap === 'PM') H += 12;
    return ('0' + H).slice(-2) + ':' + ('0' + (+mi)).slice(-2);
  }

  function html(p){
    var hrs = '', mins = '', i;
    for(i = 1; i <= 12; i++) hrs += '<option value="' + i + '"' + (i === p.h ? ' selected' : '') + '>' + i + '</option>';
    for(i = 0; i < 60; i += 5) mins += '<option value="' + i + '"' + (i === p.m ? ' selected' : '') + '>' + ('0' + i).slice(-2) + '</option>';
    return '<div class="ht31pr">' +
        '<select id="ht31h" aria-label="hour">' + hrs + '</select>' +
        '<span class="ht31c">:</span>' +
        '<select id="ht31m" aria-label="minute">' + mins + '</select>' +
        '<input id="ht31x" type="text" inputmode="numeric" maxlength="2" aria-label="exact minute" ' +
          'placeholder="min" value="' + (p.m % 5 ? ('0' + p.m).slice(-2) : '') + '">' +
        '<span class="ht31ap">' +
          '<button type="button" data-ap="AM" class="' + (p.ap === 'AM' ? 'on' : '') + '">AM</button>' +
          '<button type="button" data-ap="PM" class="' + (p.ap === 'PM' ? 'on' : '') + '">PM</button>' +
        '</span>' +
      '</div>' +
      '<div class="ht31pa">' +
        '<button type="button" class="btn" data-ht31="clear">Clear</button>' +
        '<button type="button" class="btn" data-ht31="done">Done</button>' +
      '</div>';
  }

  function value(){
    if(!open) return null;
    var n = open.node;
    var h = +n.querySelector('#ht31h').value;
    var x = String(n.querySelector('#ht31x').value || '').trim();
    var mi = /^\d{1,2}$/.test(x) ? Math.min(59, +x) : +n.querySelector('#ht31m').value;
    var ap = n.querySelector('.ht31ap .on');
    return to24(h, mi, ap ? ap.getAttribute('data-ap') : 'AM');
  }

  async function write(id, t){
    var h = habit(id); if(!h) return;
    var rec = {};
    if(S.hasTime){ rec.time_anchor = t; }
    if(S.hasWindow){
      rec.planned_start = t;
      rec.planned_end = t ? fmtClock(minsOf(t) + (planMins(h) || 0)) : null;
    }
    if(!Object.keys(rec).length){ toast('planned time needs one more column — paste the SQL'); return; }
    /* S1.6 again, in the one place a reader would look for a breach: THIS NEVER TOUCHES `section`. */
    var before = HT29SEC.sectionOf(h);
    if(S.hasTime) h.time_anchor = t;
    if(S.hasWindow){ h.planned_start = rec.planned_start; h.planned_end = rec.planned_end; }
    try{ paintAll(); }catch(e){ warn31('repaint after time', e); }
    if(HT29SEC.sectionOf(h) !== before) warn31('section moved by a time - that is a defect', before);
    try{
      var res = await sb.from('habits').update(rec).eq('id', h.id).eq('user_id', S.me.id).select('id');
      if(res && res.error){ toast('not saved — ' + String(res.error.message || '').slice(0, 60)); return; }
      if(!res || !res.data || !res.data.length){ toast('not saved — the standard was not found'); return; }
      toast(t ? 'time set ' + fmtTime(t) : 'time cleared');
    }catch(e){
      /* THE CHIP HAS ALREADY BEEN REPAINTED with the new time, so silence here is a lie on screen: it
         would read 9:45 PM until the next load and then not. A dropped network is the ordinary case. */
      warn31('time save', e);
      toast('not saved — no connection. The time will be gone when this page reloads.');
    }
  }

  function close(save){
    if(!open) return;
    /* THE VALUE IS READ BEFORE THE STATE IS CLEARED. `value()` reads `open`, so clearing it first
       made every Done silently save nothing - caught by the S2 probe, which is why the probe reads
       the row back instead of trusting that the picker closed. */
    var t = save === false ? null : value();
    var o = open; open = null;
    if(o.node && o.node.parentNode) o.node.parentNode.removeChild(o.node);
    if(o.chip) o.chip.classList.remove('ht31on');
    if(save === 'clear'){ write(o.id, null); return; }
    if(save !== false && t && t !== o.was) write(o.id, t);
  }

  function place(node, chip){
    var r = chip.getBoundingClientRect();
    node.style.position = 'fixed';
    node.style.top = Math.max(4, Math.min(window.innerHeight - 90, r.bottom + 6)) + 'px';
    var w = Math.min(300, window.innerWidth - 16);
    node.style.width = w + 'px';
    node.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  }

  function show(chip){
    var id = chip.getAttribute('data-ht31t'); if(!id) return;
    if(open && open.id === id){ close(true); return; }
    close(true);
    var h = habit(id); if(!h) return;
    var was = winStart(h);
    var n = document.createElement('div');
    n.id = 'ht31pick'; n.className = 'ht31pick'; n.setAttribute('role', 'dialog');
    n.setAttribute('aria-label', 'planned time for ' + nameOf(h.name));
    n.innerHTML = html(parts(was));
    document.body.appendChild(n);
    open = { id: id, chip: chip, node: n, was: was };
    chip.classList.add('ht31on');
    place(n, chip);
    var f = n.querySelector('#ht31h'); if(f) try{ f.focus(); }catch(e){}
  }

  document.addEventListener('click', function(e){
    var chip = e.target && e.target.closest ? e.target.closest('[data-ht31t]') : null;
    if(chip){ e.preventDefault(); e.stopPropagation(); show(chip); return; }
    var inside = e.target && e.target.closest ? e.target.closest('#ht31pick') : null;
    if(!inside){ if(open) close(true); return; }
    var ap = e.target.closest('[data-ap]');
    if(ap){
      Array.prototype.slice.call(inside.querySelectorAll('.ht31ap button')).forEach(function(b){ b.classList.remove('on'); });
      ap.classList.add('on');
      return;
    }
    var act = e.target.closest('[data-ht31]');
    if(act){
      e.preventDefault();
      close(act.getAttribute('data-ht31') === 'clear' ? 'clear' : true);
    }
  }, true);

  document.addEventListener('keydown', function(e){
    if(!open) return;
    if(e.key === 'Escape'){ e.preventDefault(); close(false); }
    else if(e.key === 'Enter' && e.target && e.target.closest && e.target.closest('#ht31pick')){
      e.preventDefault(); close(true);
    }
  }, true);
  window.addEventListener('resize', function(){ if(open) place(open.node, open.chip); });

  /* ---- the chips themselves: the real one is made tappable, the ghost is added where it belongs ---- */
  function sectionOfRow(r){
    var h = habit(r.getAttribute('data-h'));
    return h ? HT29SEC.sectionOf(h) : '';
  }
  function chips(){
    if(!HT31_TIME_PICKER) return;
    var log = h31El('log'); if(!log) return;
    /* NEVER WHILE A DRAG IS IN FLIGHT. Inserting a ghost chip mid-drag changes the row the drag is
       measuring, and the drop then lands somewhere the preview never showed - `golden_ht23` S2e
       caught exactly that, 1 misplacement in 20 touch reorders, and it is the kind of defect a
       person would report as "it put it back in the wrong place" without ever knowing why. */
    if(log.classList.contains('reordering') || log.querySelector('.li.dragging')) return;
    Array.prototype.slice.call(log.querySelectorAll('.li')).forEach(function(r){
      var id = r.getAttribute('data-h'); if(!id) return;
      var pat = r.querySelector('.pat30') || r.querySelector('.pat');
      if(pat){
        pat.setAttribute('data-ht31t', id);
        pat.setAttribute('role', 'button');
        pat.setAttribute('tabindex', '0');
        pat.setAttribute('title', 'set the planned time');
        var g = r.querySelector('.pat30.ht31ghost');
        if(g && g !== pat) g.parentNode.removeChild(g);
        return;
      }
      if(HT31_GHOST_CHIP_SECTIONS.indexOf(sectionOfRow(r)) < 0){
        var old = r.querySelector('.ht31ghost'); if(old) old.parentNode.removeChild(old);
        return;
      }
      if(r.querySelector('.ht31ghost')) return;
      var b = document.createElement('b');
      b.className = 'pat pat30 ht31ghost';
      b.setAttribute('data-ht31t', id);
      b.setAttribute('role', 'button');
      b.setAttribute('tabindex', '0');
      b.setAttribute('title', 'set a planned time');
      b.textContent = '+ time';
      var sp = r.querySelector('.sp16');
      if(sp) r.insertBefore(b, sp); else r.appendChild(b);
    });
  }
  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments); try{ chips(); }catch(e){ warn31('time chips', e); } return out; };
  document.addEventListener('click', function(){ setTimeout(function(){ try{ chips(); }catch(e){} }, 40); }, true);
  if(document.readyState === 'complete') setTimeout(chips, 400);
  else window.addEventListener('load', function(){ setTimeout(chips, 400); });

  window.__HT31TIME = { chips: chips, show: show, close: close, value: value, to24: to24, parts: parts,
                        isOpen: function(){ return !!open; } };
})();


/* ---- S4.13 / S4.14 · FOUR THINGS ON THE PHONE'S INSIGHTS, AND NOTHING ELSE ----------------------
   Cory, 9/21: "phone insights: only the month line chart, the year line chart, the full life graph
   and the group circle details". So: four cards, in that order, and no More drawer under them.
   THE TWO LINE CHARTS ARE THE DESKTOP'S OWN PANELS, moved, not re-implemented - `#h16Month` and
   `#h16Year`, drawn by `paintMonth16()` / `paintYear16()` wherever they happen to live. One renderer
   per kind (R70.306): the phone and the desktop show the same chart because it IS the same chart.
   Everything HT-29 and HT-30 put on this page - the two colour grids, the trend card, "what makes a
   good day", the More drawer - goes off behind one flag, hidden and never deleted (R70.138). The
   data is untouched; `HT31_INSIGHTS_EXTRAS = true` brings the page straight back. */
var HT31_INSIGHTS_EXTRAS = false;
var HT31_DESK_INSIGHTS = false;
var HT31_INS_ORDER = ['h31Month', 'h31Year', 'h30Life', 'h30Group'];
var HT31_INS_HIDE = ['h30MonthC', 'h30MonthR', 'h30Trend', 'h30Rate'];
function h31Phone(){ return window.innerWidth < 1024; }
/* THE FLAG, AND A SEAM TO FLIP IT AT RUNTIME. `HT31_INSIGHTS_EXTRAS = true` brings HT-29's and
   HT-30's whole Insights page back, unchanged, with its data - and `window.__HT31_EXTRAS = true`
   does the same for one page load without a deploy. That is not a test convenience: `golden_ht29`
   S0 and S5 exist to prove those cards still work, and a card that is hidden is still a card that
   has to work the day anyone turns it back on. The same seam every other layer here uses
   (`__ADVANCED`, `__MOCK_SB`): one switch, read in one function. */
function h31Extras(){ return HT31_INSIGHTS_EXTRAS || window.__HT31_EXTRAS === true; }
(function(){
  /* HT-30's own card builder, borrowed rather than copied: one renderer per kind (R70.306), and it is
     also what keeps the `#h30InsBody > .h30c > .lab` shape every Insights golden reads. */
  function cardFor(id, title, node){
    if(!node || !window.__HT30INS || !window.__HT30INS.card) return null;
    return window.__HT30INS.card(id, title, node);
  }

  function four(){
    if(h31Extras() || !h31Phone()) return;
    var body = h31El('h30InsBody'); if(!body) return;
    /* the desktop's two line charts, brought over whole */
    var m = cardFor('h31Month', 'The month', h31El('h16Month'));
    var y = cardFor('h31Year', 'The year', h31El('h16Year'));
    if(m && m.parentNode !== body) body.appendChild(m);
    if(y && y.parentNode !== body) body.appendChild(y);
    /* the four, in his order; everything else off */
    HT31_INS_ORDER.forEach(function(id){ var n = h31El(id); if(n && n.parentNode === body) body.appendChild(n); });
    HT31_INS_HIDE.forEach(function(id){
      var n = h31El(id); if(n && !n.hasAttribute('hidden')) n.setAttribute('hidden', '');
    });
    var more = h31El('h30InsMore');
    if(more && !more.hasAttribute('hidden')) more.setAttribute('hidden', '');
    /* NO REPAINT FROM HERE. The first draft called `__HT16.repaintCharts()` to be sure the two charts
       had been drawn - and that call put `.vWeeksSec` back in the grid every time, out of the drawer
       HT-30's build had just put it in (`golden_ht28` A6 caught it). The panels carry their own drawn
       SVG with them when they move, and HT-30's build already runs `repaintBorrowed()` for the nodes
       that do need re-drawing. Two renderers, one list, again - and the answer is the same one S1
       reached: only one of them may own it. */
  }

  /* S4.15 SAYS TO CHECK THAT THE FOUR ARE STILL ON THE DESKTOP'S MAIN VIEW, and they are - measured at
     1280 and 1920 with the tab gone: THE MONTH and THE YEAR in the charts quadrant, GROUP and the LIFE
     grid (`#h16Ins`, HT-16's own panel) in the right-hand column. So nothing had to move.
     THE FIRST DRAFT MOVED ONE ANYWAY. `#vLife` - HT-13's life grid, a DIFFERENT element from the one
     the desktop shows - is hidden there by HT-15's allow-list, and reading that as "LIFE is missing"
     put a second, near-empty life panel under the two charts. The DOM probe was happy; the screenshot
     was not, which is why S9.31 takes shots and R70.211 says a page is what a person sees. Removed. */

  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments);
                         try{ four(); }catch(e){ warn31('four insights', e); } return out; };
  if(window.MutationObserver){
    new MutationObserver(function(){ try{ four(); }catch(e){ warn31('four insights', e); } })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-vtab'] });
  }
  document.addEventListener('click', function(){ setTimeout(function(){ try{ four(); }catch(e){} }, 60); }, true);

  window.__HT31INS = { four: four, order: HT31_INS_ORDER, hidden: HT31_INS_HIDE };
})();


/* ---- S5.16 · THE WHY LEAVES THE DESKTOP TOO -----------------------------------------------------
   Cory, 9/21: "on the desktop remove the why journal box as well". HT-30 took it off the phone; this
   takes it off the last width it was on. THE COLUMN AND EVERY WORD IN IT ARE UNTOUCHED (R70.138): the
   textarea is detached from the layout, `why` is still exported, still read by Insights' "what makes
   a good day", and still in the vault day file. Nothing new is collected, and nothing is collected
   less honestly - the 1-10 rating stays exactly where it was.
   S5.16b: with the why gone, COMPLETED and PRAYER take the freed width as two EQUAL boxes whose outer
   edges line up with the journal above them (R70.306 - clean quarters, no uneven edges). That is CSS;
   what this does is make sure the why is not in that row to be laid out. */
var HT31_DESK_WHY = false;
(function(){
  function off(){
    if(HT31_DESK_WHY) return;
    var f = h31El('whyFld') || (h31El('iWhy') && h31El('iWhy').closest ? h31El('iWhy').closest('.fld') : null);
    if(f && !f.hasAttribute('hidden')){ f.setAttribute('hidden', ''); f.classList.add('h31gone'); }
    rateRow();
  }
  /* S5.16b · AN EMPTY BOX TAKES NO WIDTH. `#in3a` hosts the three inputs DEC-171 retired, so it is
     empty and has been holding the right-hand third of the rate row ever since. Measured, not assumed:
     it is stood down only when it has no VISIBLE child, so the day anything is put back in it the row
     makes room again by itself. */
  function rateRow(){
    var host = h31El('in3a'); if(!host) return;
    var live = Array.prototype.slice.call(host.children).filter(function(n){ return n.offsetParent; });
    host.classList.toggle('h31empty', live.length === 0 && !String(host.textContent || '').trim());
  }
  var _pa = paintAll;
  paintAll = function(){ var out = _pa.apply(null, arguments); try{ off(); }catch(e){ warn31('why off', e); } return out; };
  document.addEventListener('click', function(){ setTimeout(function(){ try{ off(); }catch(e){} }, 60); }, true);
  if(document.readyState === 'complete') setTimeout(off, 400);
  else window.addEventListener('load', function(){ setTimeout(off, 400); });
  window.__HT31WHY = { off: off, rateRow: rateRow };
})();


/* ---- S7 · INVITE IS ONE TAP, AND ANY MEMBER CAN DO IT --------------------------------------------
   Cory, 9/21: "a quick link I or any other user can send to other people to allow them to join".
   ONE control named Invite, in TWO places and no others - the GROUP panel on the desktop and the
   group block on the phone's Insights. Tap it and the phone's own share sheet opens; where there is
   no share sheet the link goes to the clipboard and says so for two seconds; where the clipboard is
   blocked the link appears SELECTED in a text field, which is the last route that always works.
   ANY MEMBER MAY INVITE (`members_can_invite`, default true - SPEC's default, reverses in one line):
   a circle of four where only one person can add the fifth is a circle that grows at one person's
   pace. The group's starter can switch it off in Group settings once the column exists.
   THE CODE IS A SECRET, so it is sized like one: 26 characters of a 31-letter alphabet is 128.8 bits,
   drawn from `crypto.getRandomValues` WITHOUT modulo bias (the old ten characters were 49 bits, and
   `byte % 31` quietly favoured the first ten letters). A code buys a person's standards, their
   definitions of done, their check-off times and their rating numbers - never a journal - so it is
   guessed at 2^128 or not at all. Reset kills the old link the moment the new one is written. */
var HT31_INVITE = true;
var HT31_CODE_CHARS = 26;                       /* 26 x log2(31) = 128.8 bits */
var HT31_MEMBERS_CAN_INVITE = true;             /* SPEC default; the column overrides it when it exists */
/* THE COLUMN IS READ, OR THE MIGRATION DOCUMENTS A SWITCH THAT DOES NOT EXIST. `circles.members_can_invite`
   defaults to true, so this changes nothing for anybody until a group's starter turns it off - and then it
   has to actually turn it off. A group with no column, or a circle we cannot see, reads as true: the
   default is the permissive one and a missing answer must not lock a member out of inviting. */
function h31CanInvite(circle){
  if(!circle) return HT31_MEMBERS_CAN_INVITE;
  if(circle.members_can_invite === false){
    return !!(S && S.me && String(circle.owner || '') === String(S.me.id));
  }
  return true;
}
(function(){
  var ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   /* no I/L/O/0/1 - a code gets read aloud */

  function newCode(n){
    n = n || HT31_CODE_CHARS;
    var out = '', lim = 256 - (256 % ALPHA.length);   /* reject the tail, or the first ten letters win */
    while(out.length < n){
      var b = new Uint8Array(n);
      if(window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
      else for(var i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
      for(var j = 0; j < b.length && out.length < n; j++) if(b[j] < lim) out += ALPHA[b[j] % ALPHA.length];
    }
    return out;
  }

  function link(code){
    var j = window.__HT24_JOIN;
    if(j && j.link) return j.link(code);
    if(window.__HT30GRP && window.__HT30GRP.link) return window.__HT30GRP.link(code);
    return 'https://cory9oo.github.io/ht/?join=' + encodeURIComponent(code);
  }
  function text(code){
    var j = window.__HT24_JOIN;
    return (j && j.message) ? j.message(code) : ('Join my group in the Habit Tracker: ' + link(code));
  }

  /* THE THREE ROUTES, IN ORDER, AND THE LAST ONE CANNOT FAIL. */
  function field(url, near){
    var host = (near && near.parentNode) || h31El('g29') || document.body;
    var old = h31El('ht31link'); if(old && old.parentNode) old.parentNode.removeChild(old);
    var i = document.createElement('input');
    i.id = 'ht31link'; i.className = 'ht31link'; i.readOnly = true; i.value = url;
    i.setAttribute('aria-label', 'the invite link - copy it');
    host.appendChild(i);
    try{ i.focus(); i.select(); i.setSelectionRange(0, url.length); }catch(e){ warn31('select link', e); }
    return i;
  }
  async function share(code, near){
    var url = link(code), msg = text(code);
    try{
      if(navigator.share){ await navigator.share({ title: 'Habit Tracker', text: msg, url: url }); return 'shared'; }
    }catch(e){ /* a cancelled share is not a failure, and it is not a reason to copy behind his back */
      if(String(e && e.name) === 'AbortError') return 'cancelled';
      warn31('share', e);
    }
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(url);
        toast('Link copied');
        return 'copied';
      }
    }catch(e){ warn31('clipboard', e); }
    field(url, near);
    return 'field';
  }

  async function reset(){
    var st = (window.__HT29GRP && window.__HT29GRP.state) ? window.__HT29GRP.state() : null;
    var c = (st && st.circle) || (window.__HT31GRP && window.__HT31GRP.circle);
    if(!c || !c.id) return { ok: false, why: 'no group' };
    var code = newCode();
    /* THIS ONE MATTERS MORE THAN THE OTHERS. The person is told "the one you sent before stops working
       straight away", and until this write lands the old 128-bit code still buys a stranger the whole
       group's standards, times and rating numbers. A PostgREST update that matches no row - which is
       what an RLS refusal looks like - returns no error, so a bare `if(r.error)` would report a
       revocation that did not happen. Nothing is reported as done that cannot be read back. */
    var r = await sb.from('circles').update({ join_code: code }).eq('id', c.id).select('join_code');
    if(r && r.error) return { ok: false, why: 'Could not reset the link.' };
    if(!r || !r.data || !r.data.length || r.data[0].join_code !== code){
      return { ok: false, why: 'The link was NOT reset - the old one still works. Try again.' };
    }
    c.join_code = code;
    return { ok: true, code: code };
  }

  /* WHAT THE JOINER SEES BEFORE THEY AGREE: the group's name and how many people are in it. It comes
     from one function that returns those two things and nothing else (`ht31_circle_peek`, in
     tools/sql/ht_pending.sql). Until that SQL is run the card says so in ONE quiet line and the join
     still works - a control that cannot answer says so; it never shows an empty panel (S6.18). */
  async function peek(code){
    try{
      var r = await sb.rpc('ht31_circle_peek', { code: String(code || '').trim().toUpperCase() });
      if(r.error) return null;
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      return row ? { name: row.name, members: row.members } : null;
    }catch(e){ return null; }
  }

  window.__HT31GRP = { newCode: newCode, link: link, text: text, share: share, reset: reset,
                       peek: peek, field: field, alphabet: ALPHA };
})();

})();


