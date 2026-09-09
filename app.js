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
function daily(){ return S.habits.filter(function(h){ return h.cadence!=='weekly'; }); }
function weekly(){ return S.habits.filter(function(h){ return h.cadence==='weekly'; }); }
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
function doneOn(h,k){ return h.cadence==='weekly' ? weekDone(h.id,k) : !!ckOf(k)[h.id]; }
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
  var u=(await sb.auth.getUser()).data.user;
  if(!u){ authScreen(); return false; }
  var uid=u.id;
  var p  = await sb.from('profiles').select('id,display_name,handle').eq('id',uid).maybeSingle();
  /* HT-13 B1: `target_age` is optional until its migration lands. Probe widest first, then step
     down — the same contract as habits.cue and day_private.predict / brain_dump. */
  var pp = await sb.from('profile_private').select('birth_date,target_age').eq('id',uid).maybeSingle();
  if(pp.error){ S.hasTargetAge=false;
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
    S.hasCue=false;
    h = await sb.from('habits').select(HCOLS)
      .eq('user_id',uid).eq('active',true).order('sort_order');
  } else { S.hasCue=true; }
  S.habits = (h.data||[]).map(function(x,i){ if(x.sort_order==null) x.sort_order=i; return x; });

  /* HT-13 G2: probe `closed_at` the way `cue` and `predict` are probed, then degrade. The column is
     live as of 2026-09-07, but the same build must run against a database that does not have it. */
  var DCOLS='date,checked,active_set,pct,floor_pct';
  var d = await sb.from('days').select(DCOLS+',closed_at').eq('user_id',uid).order('date');
  if(d.error){ S.hasClosedAt=false;
    d = await sb.from('days').select(DCOLS).eq('user_id',uid).order('date');
  } else { S.hasClosedAt=true; }
  S.days = d.data||[];
  S.byDate = {}; S.days.forEach(function(r){ S.byDate[r.date]=r; });
  if(!S.date) S.date = today();
  if(!S.byDate[S.date]) S.byDate[S.date]={ date:S.date, checked:{}, pct:0 };
  if(!S.calYM){ var t=dnum(today()); S.calYM=[t.getFullYear(),t.getMonth()]; }

  /* the whole private record — rating and journal are inputs, so they get outputs */
  /* `predict` may not exist yet (its migration is Cory's to run) — probe, then degrade. */
  var PVCOLS='date,rating,why,tasks,prayer';
  /* HT-10: two optional columns now. Probe widest first and step down, so the app runs whether or not
     either migration has been applied — the same degrade-cleanly contract `predict` already had. */
  var pv = await sb.from('day_private').select(PVCOLS+',predict,brain_dump').eq('user_id',uid);
  if(!pv.error){ S.hasPredict=true; S.hasDump=true; }
  else {
    pv = await sb.from('day_private').select(PVCOLS+',predict').eq('user_id',uid);
    if(!pv.error){ S.hasPredict=true; S.hasDump=false; }
    else {
      pv = await sb.from('day_private').select(PVCOLS+',brain_dump').eq('user_id',uid);
      if(!pv.error){ S.hasPredict=false; S.hasDump=true; }
      else { S.hasPredict=false; S.hasDump=false;
             pv = await sb.from('day_private').select(PVCOLS).eq('user_id',uid); }
    }
  }
  S.privAll = {}; (pv.data||[]).forEach(function(r){ S.privAll[r.date]=r; });
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
  var res = await sb.from('day_private').upsert({
    user_id:S.me.id, date:S.date,
    rating:(p.rating==null?null:p.rating), why:p.why||'', tasks:p.tasks||'', prayer:p.prayer||''
  , brain_dump:(S.hasDump ? (p.brain_dump||'') : undefined)
  },{ onConflict:'user_id,date' });
  if(res.error) toast('note not saved'); else toast('saved');
  var n=0; ['brain_dump','tasks','prayer'].forEach(function(k){ if(p[k]) n++; });
  el('jrnC').textContent = n? n+' of 3 written · autosaves' : 'saves as you type';
  paintRating(); paintRChart(); paintRScat(); paintRByMo(); paintJournal(); paintCal();
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
  if(S.grp==='daily')  list=list.filter(function(h){ return h.cadence!=='weekly'; });
  if(S.grp==='weekly') list=list.filter(function(h){ return h.cadence==='weekly'; });

  /* HT-21 S2: inside a group, ascending by PLANNED TIME, and the unplanned sit at its foot.
     His groups remain the organising principle (DEC-057) — the clock is a secondary sort within
     one, never the thing the list is built from. Reported to SPEC as needing DEC-057 clarified. */
  if(S.sort==='order')  list.sort(function(a,b){
    var ax=minsOf(a.time_anchor), bx=minsOf(b.time_anchor);
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
    var pAt = hhmm(h.time_anchor);
    var dAt = doneAt(S.date, h.id);
    var nmIn = (pAt ? '<b class="pat">'+esc(pAt)+'</b>' : '') +
      esc(nameOf(h.name)) +
      (dAt ? '<i class="dat">\u2713 '+esc(dAt)+'</i>' : '') +
      ((S.hasCue && h.cue)?'<i class="cue">'+esc(h.cue)+'</i>':'');
    var LK = '<span class="lk"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7L11.5 5"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19"/></svg></span>';
    var nm = h.link
      ? '<a class="nm lnk" href="'+esc(h.link)+'" target="_blank" rel="noopener">'+nmIn+LK+'</a>'
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
      (h.cadence==='weekly'?'<span class="wk">WEEKLY</span>':'')+
      '<span class="sp16"></span>'+
      '<span class="mn">'+(h.minutes?h.minutes+'m':'—')+'</span>'+
      '<span class="ad" style="color:'+gtxt(ad)+'">'+(ad==null?'—':ad+'%')+'</span>'+
      '</div>';
  }).join('') || '<div class="empty">Nothing matches.</div>';

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
}

function toggle(hid){
  var h=S.habits.filter(function(x){return x.id===hid;})[0]; if(!h) return;
  var r=S.byDate[S.date] || (S.byDate[S.date]={date:S.date,checked:{},pct:0});
  r.checked = r.checked || {};
  if(h.cadence==='weekly'){
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
  paintRChart(); paintRScat(); paintRByMo(); paintJournal();
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
    kv('Free hours left in a day', fmt(1440-com-480)+' <span style="color:var(--ink3)">after 8h sleep</span>') +
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

    var h='';
    (cs.data||[]).forEach(function(c){
      var ms=(mem.data||[]).filter(function(m){return m.circle_id===c.id;});
      var rank=ms.map(function(m){
        var d=by[m.user_id]||{}, a=[];
        for(var i=6;i>=0;i--){ var v=d[shift(today(),-i)]; if(v!=null) a.push(v); }
        return { u:m.user_id, avg:a.length?Math.round(a.reduce(function(x,y){return x+y;},0)/a.length):null, d:d };
      }).sort(function(x,y){ return (y.avg||-1)-(x.avg||-1); });
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
      '<select class="ec"><option value="daily"'+(h.cadence!=='weekly'?' selected':'')+'>Daily</option>'+
        '<option value="weekly"'+(h.cadence==='weekly'?' selected':'')+'>Weekly</option></select>'+
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
    '<div class="note" style="padding:14px 0 0">Your data is yours. Every table is row-level locked to your account; nobody in a circle can see anything but a daily percentage.</div>';

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
    '<div class="v" style="color:'+col+'">'+fmt(dMin)+' <span style="font-size:11px;color:var(--ink3)">of '+fmt(WAKE)+' waking</span></div>'+
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
  await sb.from('profiles').update({display_name:n}).eq('id',S.me.id);
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
    '<div class="note" style="padding:10px 0 22px">A ledger of the self. One number a day, and nowhere to hide.</div>'+
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
    var r = kind==='up' ? await sb.auth.signUp({email:e,password:p})
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
    if(e.target.closest('.lk')){
      var h=S.habits.filter(function(x){return x.id===b.getAttribute('data-h');})[0];
      if(h&&h.link){ window.open(h.link,'_blank','noopener'); return; }
    }
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
    if(!loggedOn(k)){ k=shift(k,-1); continue; }
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
  var res=await sb.from('day_private').upsert({
    user_id:S.me.id, date:S.date,
    rating:(p.rating==null?null:p.rating), why:p.why||'', tasks:p.tasks||'', prayer:p.prayer||'',
    predict:v
  },{ onConflict:'user_id,date' });
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
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(function(r){ r.update(); }).catch(function(){});
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
  var GRP_ORDER = ['MORNING','AFTERNOON','NIGHT','STANDARDS','WEEKLY','OTHER'];
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
      lab.innerHTML = '<span class="lab">Brain dump</span>' +
                      '<textarea id="iDump" rows="3" placeholder="Everything in your head, out."></textarea>';
      host.insertBefore(lab, host.firstChild);
      var ta = lab.querySelector('#iDump'), t = null;
      ta.addEventListener('input', function(){
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
      var name = ((h && h.group_name) || 'Other').replace(/\s+/g,' ').trim().toUpperCase();
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
      '<div class="note" style="margin:6px 0 9px">Everything the simple view hides — the instruments, ' +
      'the statistics, the other themes and the sheet controls. Nothing was deleted; this shows it again.</div>' +
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

  function loadDump(){
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
  function grow(t){ if(!t) return; t.style.height='auto'; t.style.height=(t.scrollHeight+2)+'px'; }

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
    /* the emptied "Rate the day" block, and the journal head, renamed */
    var blks = Array.prototype.slice.call(document.querySelectorAll('#jIn .blk'));
    blks.forEach(function(b){
      var h = b.querySelector('.sh h2');
      var t = h ? h.textContent.toUpperCase() : '';
      if(t.indexOf('RATE THE DAY') >= 0 && !b.querySelector('#rate')) b.classList.add('ht9a-off');
      if(t.indexOf('JOURNAL') >= 0 && h) h.textContent = 'Journal';
    });
    var pray = document.getElementById('iPrayer');
    if(pray) pray.setAttribute('placeholder', '\u2026');
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
    if(moved) { toast(moved + ' brain dump' + (moved>1?'s':'') + ' moved to the database');
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
      fld('Name','<input id="eName" value="'+esc(h.name)+'" placeholder="standard" autocomplete="off">')+
      fld('Group','<select id="eGroup">'+groupsFor(grp).map(function(g){
          return '<option'+(g===grp?' selected':'')+'>'+esc(g)+'</option>'; }).join('')+'</select>')+
      fld('Cadence','<select id="eCad">'+
          '<option value="daily"'+(h.cadence!=='weekly'?' selected':'')+'>Daily</option>'+
          '<option value="weekly"'+(h.cadence==='weekly'?' selected':'')+'>Weekly</option></select>')+
      (S.hasWindow ? '<div class="fld" id="eWinFld"><span class="lab">Planned window</span>'+
          '<div class="win"><input id="eStart" type="time" value="'+esc(h.planned_start||'')+'">'+
          '<span class="dash">–</span>'+
          '<input id="eEnd" type="time" value="'+esc(h.planned_end||'')+'"></div></div>' : '')+
      fld('Planned minutes','<input id="eMin" class="num" type="number" min="0" step="5" value="'+
          (h.minutes||0)+'">')+
      /* HT-16 S6 · R70.103 — when in the day, and how long. Both optional, both degrade with the
         column. The suggestion under the anchor is the MEDIAN close time of this standard's last 30
         check-offs; one tap adopts it, and it is never written without the tap. */
      /* HT-21 S2: ONE minutes box, above. The second one lived here and Cory asked for it to go —
         two minutes rows is one too many, and `planOf` reads the same number either way now.
         `Time anchor` is called `Planned time`, which is what it has always meant. */
      (S.hasTime ? '<div class="fld" id="eTimeFld"><span class="lab">Planned time</span>'+
          '<div class="win"><input id="eAnchor" type="time" value="'+esc(hhmm(h.time_anchor)||'')+'">'+
          '</div>'+
          (function(){
             if(h.time_anchor || !h.id) return '';
             /* TWO suggestions, and NEITHER EVER TOUCHES THE NAME (R70.265 · R70.285).
                One reads the clock he typed into the name; one reads when he actually does it.
                Both fill `planned_at` on a tap and nothing else — the name is not edited, not
                trimmed, and not re-saved. If he ignores them forever, nothing happens. */
             var out='';
             var fromName=(String(h.name||'').match(/(\d{1,2}):(\d{2})/)||null);
             if(fromName){
               var t=('0'+fromName[1]).slice(-2)+':'+fromName[2];
               out+='<button class="btn h16adopt" id="eFromName" data-t="'+t+'">'+
                    'Set planned time '+t+' from the name?</button>';
             }
             var m = (window.__HT16 && window.__HT16.medianClose) ? window.__HT16.medianClose(h.id) : null;
             if(m) out+='<button class="btn h16adopt" id="eAdopt" data-t="'+m+'">usually done ~'+m+
                        '</button>';
             return out;
           })()+
          '</div>' : '')+
      fld('Link','<input id="eLink" value="'+esc(h.link||'')+'" placeholder="https://…" '+
          'inputmode="url" autocomplete="off">')+
      (S.hasNotes ? fld('Notes','<textarea id="eNotes" rows="3" placeholder="…">'+
          esc(h.notes||'')+'</textarea>') : '')+
      (S.hasCue ? fld('Cue','<input id="eCue" value="'+esc(h.cue||'')+'" '+
          'placeholder="after I ___, I will ___">') : '')+
      '<div class="etools">'+
        (isNew?'':'<button class="btn" id="eArch">Archive</button>')+
        '<span style="flex:1"></span>'+
        '<button class="btn" id="eCancel">Cancel</button>'+
        '<button class="btn pri" id="eSave">Save</button>'+
      '</div>'+
      (S.hasTime ? '' :
        '<div class="note enote">A time anchor and its planned minutes need one migration before '+
        'they can be saved. Everything else on this sheet saves now.</div>')+
      (S.hasWindow&&S.hasNotes ? '' :
        '<div class="note enote">'+
        (!S.hasWindow&&!S.hasNotes ? 'Planned window and notes need one migration before they can be saved.'
         : !S.hasWindow ? 'The planned window needs one migration before it can be saved.'
         : 'Notes need one migration before they can be saved.')+
        ' Everything else on this sheet saves now.</div>');

    n.classList.add('on');
    if(isNew) setTimeout(function(){ var f=document.getElementById('eName'); if(f) f.focus(); },60);
    document.getElementById('eCancel').onclick=closeSheet;
    document.getElementById('eSave').onclick=function(){ saveSheet(h,isNew); };
    var ar=document.getElementById('eArch');
    if(ar) ar.onclick=function(){ archiveOne(h); };
    /* HT-21 S2 · BOTH suggestions fill `planned_at` and NOTHING ELSE. `eName` is never read
       here and never written — R70.285 ("don't rename my tasks") is satisfied by construction,
       not by care, and the wire's acceptance is a diff over `name` that must come back empty. */
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
              cadence:str('eCad')==='weekly'?'weekly':'daily',
              minutes:num('eMin'), link:str('eLink')||null };
    if(S.hasCue)    rec.cue = str('eCue');
    if(S.hasWindow){ rec.planned_start = str('eStart')||null; rec.planned_end = str('eEnd')||null; }
    if(S.hasNotes)   rec.notes = str('eNotes')||null;
    /* S2: one minutes box now. It writes BOTH `minutes` (what committed()/remaining() read)
       and `minutes_planned` (what planOf() prefers), so the two can never drift apart — which is
       exactly what two separate inputs allowed. */
    if(S.hasTime){ rec.time_anchor = str('eAnchor')||null;
                   rec.minutes_planned = num('eMin') || null; }
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
    if(!confirm('Archive "'+nameOf(h.name)+'"? It leaves TODAY and stays in every past day and export.')) return;
    var res = await sb.from('habits')
      .update({ active:false, archived_at:new Date().toISOString() })
      .eq('id',h.id).eq('user_id',S.me.id);
    if(res && res.error){ toast('not archived — '+String(res.error.message||'').slice(0,60)); return; }
    closeSheet(); toast('archived');
    await reload();
  }
  async function reload(){ probed=false; await load(); await probe(); paintAll(); }

  /* ---- 3 · the affordances: a pencil on hover (desktop), a long press (phone) ---- */
  function decorate(){
    var log=document.getElementById('log'); if(!log) return;
    q('.li',log).forEach(function(r){
      if(r.querySelector('.edp')) return;
      var p=document.createElement('span');
      p.className='edp'; p.setAttribute('role','button');
      p.setAttribute('tabindex','0');           /* HT-16 R70.98: checkbox -> link -> edit */
      p.title='edit this standard'; p.textContent='✎';
      r.appendChild(p);
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
    var order=0, cur=null, ops=[], moved=0;
    Array.prototype.slice.call(log.children).forEach(function(k){
      if(k.classList.contains('grp')){ cur=canonGroup(k.textContent); return; }
      if(!k.classList.contains('li')) return;
      var hid=k.getAttribute('data-h'), h=hby(hid); if(!h) return;
      var so=order++;
      var grp=(cur==null)?null:cur;
      var chg={};
      if(h.sort_order!==so) chg.sort_order=so;
      if(grp!==null && (h.group_name||'')!==grp) chg.group_name=grp;
      if(!Object.keys(chg).length) return;
      h.sort_order=so; if(chg.group_name!==undefined) h.group_name=grp;
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

  function onDown(e){
    if(e.button!=null && e.button!==0) return;
    if(e.target.closest('.eadd')) return;
    if(e.target.closest('.edp')) return;                      /* the pencil is a click, not a drag */
    var row=e.target.closest('.li'); if(!row) return;
    var touch=(e.pointerType==='touch'||e.pointerType==='pen');
    st={ row:row, hid:row.getAttribute('data-h'), x:e.clientX, y:e.clientY, pid:e.pointerId,
         touch:touch, armed:!touch, dragging:false, timer:null };
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
    moveDrag(e.clientY);
  }
  function onUp(){
    if(!st) return;
    cancelPress();
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

  function bind(){
    var log=document.getElementById('log'); if(!log || log.dataset.ht11) return;
    log.dataset.ht11='1';
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
  function anchorOf(h){ return hhmm(h && h.time_anchor); }
  function planOf(h){
    if(!h) return null;
    if(h.minutes_planned!=null && h.minutes_planned!=='') return +h.minutes_planned;
    return h.minutes? +h.minutes : null;      /* the price stands in until a slot length is set */
  }
  function anchorMin(h){ return minsOf(h && h.time_anchor); }
  function endMin(h){
    var a=anchorMin(h); if(a==null) return null;
    return a + (planOf(h)||0);
  }
  function timedHabits(){ return S.habits.filter(function(h){ return anchorMin(h)!=null; }); }

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
      if(h.cadence==='weekly') return;
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
  function fmtClock(min){
    if(min==null) return null;
    var m=Math.max(0, Math.round(min));
    return ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2);
  }
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
        var txt=a+(pm?' \u00b7 '+pm+'m':'');
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
    return s || '—';
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
  function pctCell(p){
    if(p==null) return unk('fewer than '+P10_MIN_DAYS+' days of history');
    var rf=d10().rampFill;
    return '<i class="h20dot" style="background:'+(rf?rf(p):'var(--grey)')+'"></i>'+p+'%';
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

    /* ---- ME, row 1 ------------------------------------------------------------------ */
    var spark = d10().sparkSvg ? d10().sparkSvg(adhSpark()) : '';
    var pvd = plannedVsDone();
    var r7=rollRate(7), r30=rollRate(30);
    var arrow = (r7==null||r30==null) ? '' :
      (r7>r30 ? '<b class="h20up">↑</b>' : r7<r30 ? '<b class="h20dn">↓</b>' : '<b class="h20fl">→</b>');
    var row1 =
      box10('Today %',   thin?unk(why):pctCell(adhPct(0,0))) +
      box10('7 days %',  thin?unk(why):pctCell(P(0,6))) +
      box10('30 days %', thin?unk(why):pctCell(P(0,29))) +
      box10('90 days %', thin?unk(why):pctCell(P(0,89)), spark?('<span class="h20sp">'+spark+'</span>'):'') +
      box10('Days in a row at 100%', String(perfectRun())) +
      box10('Planned vs done',
            (pvd.today? (fmtHM(pvd.today.done)+' of '+fmtHM(pvd.today.planned)) : unk('nothing planned today')),
            'today · 30 days ' + (pvd.mp? (fmtHM(pvd.md)+' of '+fmtHM(pvd.mp)) : '—')) +
      box10('Average rating 7d / 30d',
            (r7==null&&r30==null) ? unk(why)
              : ((r7==null?'—':r7)+' / '+(r30==null?'—':r30)+' '+arrow));

    /* ---- ME, row 2 ------------------------------------------------------------------ */
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
               esc((mc && mc(h.id)) || '—')+'</b></li>';
      }).join('')+'</ul>';
    var row2 =
      box10('Strongest 3', three(ranked.slice(0,3))) +
      box10('Weakest 3',   three(ranked.slice(-3).reverse())) +
      box10('By group 30-day %', byGroup) +
      box10('Completion → rating', crVal,
            'average rating on days ≥80% complete vs days &lt;50% · ' +
            cr.nHi + ' and ' + cr.nLo + ' days') +
      box10('Usual time per standard', usual) +
      box10('On time %', unk('time blocks are not built yet - P12'));

    /* ---- THE GROUP ROW --------------------------------------------------------------- */
    var mine=adhAll(0,29), myToday=adhPct(0,0);
    var members=[{n:'You', t:myToday, p:mine.pct, d:have, me:true}].concat(
      H18_DUMMIES.map(function(x){ return {n:x.n, t:x.t, p:x.p, d:null, me:false}; }));
    members.slice().sort(function(a,b){ return (b.p==null?-1:b.p)-(a.p==null?-1:a.p); })
      .forEach(function(m,i){ m.rank=i+1; });
    var avg=(function(){ var v=members.map(function(m){return m.p;}).filter(function(x){return x!=null;});
      return v.length? Math.round(v.reduce(function(a,b){return a+b;},0)/v.length) : null; })();
    var grpRows=members.map(function(m){
      return '<tr'+(m.me?' class="h18me"':'')+'><td class="n">'+esc(m.n)+'</td>'+
        '<td class="p">'+(m.t==null?unk(why):pctCell(m.t))+'</td>'+
        '<td class="p">'+(m.p==null?unk(why):pctCell(m.p))+'</td>'+
        '<td class="num">'+(m.d==null?'—':m.d)+'</td>'+
        '<td class="num">'+m.rank+'</td></tr>'; }).join('');

    host.innerHTML =
      '<div class="h20det">'+
        /* the DETAIL button is underneath this page now, so the page closes itself */
        '<div class="h20h h20top">DETAIL'+
          '<span class="sp"></span>'+
          '<button class="h20x" type="button" data-h18more>close</button></div>'+
        '<div class="h20h">ME</div>'+
        '<div class="h20grid">'+row1+'</div>'+
        '<div class="h20grid">'+row2+'</div>'+
        '<div class="h20h">GROUP<span class="h18test">TEST DATA</span></div>'+
        '<div class="h20box h20wide"><table class="h17dt h18dt">'+
          '<thead><tr><th>member</th><th>today</th><th>30 days</th>'+
          '<th>days logged</th><th>rank</th></tr></thead><tbody>'+grpRows+
          '<tr class="h20avg"><td class="n">Group average</td><td class="p">—</td>'+
          '<td class="p">'+(avg==null?unk(why):pctCell(avg))+'</td>'+
          '<td class="num">—</td><td class="num">—</td></tr>'+
        '</tbody></table></div>'+
        '<div class="h20h">EVERY STANDARD</div>'+
        '<div class="h20box h20wide"><table class="h17dt h18dt">'+
          '<thead><tr><th>standard</th><th>30d</th><th>streak</th><th>missed</th>'+
          '<th>last done</th><th>usual</th></tr></thead><tbody>'+
          window.__HT17.habitRows(S.habits.slice().sort(function(a,b){
            var x=adherence30(a.id), y=adherence30(b.id);
            x=(x==null?101:x); y=(y==null?101:y);
            return x-y || (nameOf(a.name)<nameOf(b.name)?-1:1);
          }))+'</tbody></table></div>'+
      '</div>';
    return S.habits.length;
  }

  /* ---- HT-18c - THE CIRCLE AS TEST DUMMIES (Cory 2026-09-07, note 7) --------------------
     CIRCLE-1 (Andrew, Dale, Justin) is chartered and NOT built (HTR-17, NOT_STARTED). He asked to
     see the shared view before anyone real is in it, so these three are INVENTED, drawn from a
     constant, and labelled TEST DATA on the surface so they can never be mistaken for a reading.

     R47.3 HOLDS BY CONSTRUCTION, NOT BY CARE: the only column here is adherence. There is no
     schema path from this table to a journal, a rating or a standards list, because there is no
     schema at all - nothing is fetched, nothing is written, no invite is sent, and the strings
     below never leave the page. `privacy_check.py` sees no new cross-user read because there is
     none. When HTR-17 builds the real circle this function is what it replaces. */
  /* p = 30-day adherence, t = today's completion, s = streak. Invented, constant, and labelled
     TEST DATA wherever they are drawn (HT-18c note 7 · HT-18d note 3). */
  var H18_DUMMIES=[{n:'Andrew',p:71,t:80,s:12},{n:'Dale',p:54,t:40,s:3},
                   {n:'Justin',p:88,t:100,s:41}];
  function circleDummy(){
    var rf=window.__HT16.rampFill, rc=window.__HT16.rampClass;
    var mine=adhAll(0,29);
    var rows=H18_DUMMIES.map(function(d){
      return '<tr><td class="n">'+esc(d.n)+'</td>'+
        '<td class="p"><i style="background:'+rf(d.p)+'"></i>'+d.p+'%</td>'+
        '<td class="num">'+d.s+'</td></tr>'; }).join('');
    return '<div class="h18circ"><div class="h18circh">CIRCLE'+
      '<span class="h18test">TEST DATA</span></div>'+
      '<table class="h17dt h18dt"><thead><tr><th>who</th><th>30d</th><th>streak</th></tr></thead>'+
      '<tbody><tr class="h18me"><td class="n">You</td>'+
      '<td class="p"><i style="background:'+rf(mine.pct)+'"></i>'+
      (mine.pct==null?'\u2014':mine.pct+'%')+'</td><td class="num">\u2014</td></tr>'+
      rows+'</tbody></table></div>';
  }

  /* ---- HT-18d - THE GROUP BLOCK (Cory 2026-09-07 note 3) -------------------------------
     "Adherence section should be called GROUP and it needs to be one metric per member ... and it
     needs to be continuously showing in its own section above the life chart", then: "do 30 day
     adherence and the day completion - no actual tasks shown but a percent".

     So: two percentages per member, no task names, always visible. R47.3 is why that is the whole
     row and not the start of one - a circle sees adherence-class data and nothing else, and there
     is no schema path here to a journal, a rating or a standards list because nothing is fetched
     at all. Andrew, Dale and Justin are still the seeded TEST DATA of HT-18c until HTR-17 builds
     the real invite; YOUR row is real, computed from the same functions the drawer uses. */
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
      });
    }
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
    g.innerHTML='<div class="h18gh">GROUP<span class="h18test">TEST DATA</span>'+
      '<span class="sp"></span><button class="h18more" data-h18more type="button">detail</button></div>'+
      '<table class="h18gt"><thead><tr><th>member</th><th>today</th><th>30 days</th></tr></thead>'+
      '<tbody>'+
      row('You', todayPct, mine.pct, true)+
      H18_DUMMIES.map(function(d){ return row(d.n, d.t, d.p, false); }).join('')+
      '</tbody></table>';
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
    if(advanced()) return all;
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
      if(!jh.dataset.h19) jh.dataset.h19 = jh.textContent;
      /* B4: and on any other day it names THAT day. Clicking a date on the month chart
         already moved the journal there and already saved edits against that date
         (MEASURED: typing into Sep 1 writes day_private for 2026-09-01). What was
         missing was any way to tell — the header said "Journal" whichever day you were
         on — and any way back. */
      jh.textContent = (on && sh) ? ('SABBATH · ' + mdate(S.date))
                     : (S.date===today() ? jh.dataset.h19 : mdate(S.date));
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
    var active = on && !!sh;
    log.classList.toggle('h18sab', active);
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
                   adhLine(); groupBlock(); }
    else { unquadrants(); unRightBlock(); unjournalBottom(); unAdh(); }
    /* HT-20 P1a: `ensureSabbath()` USED TO BE CALLED HERE, and that is the whole defect — quad()
       is a render path and runs on every paint. It is hung off load() below instead. */
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
  var _wr=wire;      wire      = function(){ var r=_wr.apply(null,arguments); ensureSabbath(); return r; };
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
})();
